import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UvPackageManagerService } from '../../services/packageManagerService';
import {
  MockLoggerService,
  MockProcessRunner,
  MockPythonEnvironmentService,
} from '../mocks/mockServices';

describe('UvPackageManagerService', () => {
  it('lists installed packages and merges outdated versions in uv-project mode', async () => {
    const envService = new MockPythonEnvironmentService({
      backend: 'uv-project',
      pythonPath: '/proj/.venv/bin/python',
    });
    const runner = new MockProcessRunner((cmd, args) => {
      assert.equal(cmd, 'uv');
      if (args.includes('--outdated')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify([{ name: 'httpx', version: '0.26.0', latest_version: '0.27.2' }]),
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify([
          { name: 'ruff', version: '0.7.0' },
          { name: 'httpx', version: '0.26.0' },
        ]),
      };
    });

    const service = new UvPackageManagerService(envService, runner, new MockLoggerService());
    const packages = await service.listPackages();

    assert.equal(packages.length, 2);
    assert.deepEqual(packages[0], {
      name: 'httpx',
      version: '0.26.0',
      latestVersion: '0.27.2',
      isOutdated: true,
      isEditable: false,
      location: undefined,
    });
    assert.equal(packages[1].name, 'ruff');
    assert.equal(packages[1].isOutdated, false);
  });

  it('installs packages using `uv add` in uv-project mode with dev and extras', async () => {
    const envService = new MockPythonEnvironmentService({ backend: 'uv-project' });
    const runner = new MockProcessRunner(() => ({ exitCode: 0, stdout: 'Resolved 3 packages' }));
    const service = new UvPackageManagerService(envService, runner, new MockLoggerService());

    const result = await service.installPackage({
      name: 'httpx',
      extras: ['http2'],
      versionConstraint: '>=0.27.0',
      dev: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.backend, 'uv-project');
    assert.equal(runner.calls[0].command, 'uv');
    assert.deepEqual(runner.calls[0].args, ['add', '--dev', 'httpx[http2]>=0.27.0']);
  });

  it('removes packages with `uv pip uninstall` in uv-pip mode and `pip uninstall -y` in pip fallback', async () => {
    const runner = new MockProcessRunner(() => ({ exitCode: 0, stdout: 'Uninstalled' }));
    const uvPipEnv = new MockPythonEnvironmentService({
      backend: 'uv-pip',
      pythonPath: '/env/bin/python',
    });
    const uvPipService = new UvPackageManagerService(uvPipEnv, runner, new MockLoggerService());

    const uvRes = await uvPipService.removePackage('pydantic');
    assert.equal(uvRes.success, true);
    assert.deepEqual(runner.calls[0].args, ['pip', 'uninstall', '--python', '/env/bin/python', 'pydantic']);

    const pipEnv = new MockPythonEnvironmentService({
      backend: 'pip',
      uvAvailable: false,
      pythonPath: '/usr/bin/python3',
    });
    const pipService = new UvPackageManagerService(pipEnv, runner, new MockLoggerService());

    const pipRes = await pipService.removePackage('pydantic');
    assert.equal(pipRes.success, true);
    assert.equal(runner.calls[1].command, '/usr/bin/python3');
    assert.deepEqual(runner.calls[1].args, ['-m', 'pip', 'uninstall', '-y', 'pydantic']);
  });

  it('updates packages via `uv lock --upgrade-package` and `uv sync` in uv-project mode', async () => {
    const envService = new MockPythonEnvironmentService({ backend: 'uv-project' });
    const runner = new MockProcessRunner(() => ({ exitCode: 0, stdout: 'Synced' }));
    const service = new UvPackageManagerService(envService, runner, new MockLoggerService());

    const res = await service.updatePackage('httpx');
    assert.equal(res.success, true);
    assert.equal(runner.calls.length, 2);
    assert.deepEqual(runner.calls[0].args, ['lock', '--upgrade-package', 'httpx']);
    assert.deepEqual(runner.calls[1].args, ['sync']);
  });

  it('parses package metadata from `uv pip show` output', async () => {
    const envService = new MockPythonEnvironmentService({
      backend: 'uv-pip',
      pythonPath: '/env/bin/python',
    });
    const runner = new MockProcessRunner(() => ({
      exitCode: 0,
      stdout: [
        'Name: httpx',
        'Version: 0.27.2',
        'Summary: The next generation HTTP client.',
        'Home-page: https://github.com/encode/httpx',
        'Author: Tom Christie',
        'License: BSD-3-Clause',
        'Location: /env/lib/python3.12/site-packages',
        'Requires: anyio, certifi, httpcore, idna',
        'Required-by: ',
      ].join('\n'),
    }));

    const service = new UvPackageManagerService(envService, runner, new MockLoggerService());
    const details = await service.getPackageDetails('httpx');

    assert.ok(details);
    assert.equal(details.name, 'httpx');
    assert.equal(details.version, '0.27.2');
    assert.deepEqual(details.requires, ['anyio', 'certifi', 'httpcore', 'idna']);
    assert.deepEqual(details.requiredBy, []);
  });

  it('rejects malformed package names and Python <3.10 interpreters', async () => {
    const envService = new MockPythonEnvironmentService();
    const runner = new MockProcessRunner();
    const service = new UvPackageManagerService(envService, runner, new MockLoggerService());

    await assert.rejects(
      () => service.installPackage({ name: 'bad; rm -rf /' }),
      /Invalid Python package name/
    );

    const oldPythonEnv = new MockPythonEnvironmentService({
      pythonVersion: { major: 3, minor: 9, patch: 13, raw: '3.9.13' },
      isPythonVersionSupported: false,
    });
    const oldService = new UvPackageManagerService(oldPythonEnv, runner, new MockLoggerService());

    await assert.rejects(() => oldService.listPackages(), /below the minimum supported version/);
  });

  it('creates .venv using uv venv when available and falls back to python -m venv', async () => {
    const runner = new MockProcessRunner(() => ({ exitCode: 0, stdout: 'Created .venv' }));

    const uvEnv = new MockPythonEnvironmentService({
      workspaceRoot: '/sample/project',
      uvAvailable: true,
      uvPath: 'uv',
      pythonPath: '/usr/bin/python3.12',
    });
    const uvService = new UvPackageManagerService(uvEnv, runner, new MockLoggerService());
    const uvRes = await uvService.createVirtualEnvironment();

    assert.equal(uvRes.success, true);
    assert.equal(uvRes.operation, 'create-venv');
    assert.equal(runner.calls[0].command, 'uv');
    assert.deepEqual(runner.calls[0].args, ['venv', '.venv', '--python', '/usr/bin/python3.12']);
    assert.equal(runner.calls[0].options?.cwd, '/sample/project');

    const pipEnv = new MockPythonEnvironmentService({
      workspaceRoot: '/sample/project',
      uvAvailable: false,
      backend: 'pip',
      pythonPath: '/usr/bin/python3.12',
    });
    const pipService = new UvPackageManagerService(pipEnv, runner, new MockLoggerService());
    const pipRes = await pipService.createVirtualEnvironment();

    assert.equal(pipRes.success, true);
    assert.equal(runner.calls[1].command, '/usr/bin/python3.12');
    assert.deepEqual(runner.calls[1].args, ['-m', 'venv', '.venv']);
  });
});
