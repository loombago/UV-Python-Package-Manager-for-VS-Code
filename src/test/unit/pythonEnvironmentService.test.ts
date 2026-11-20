import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { PythonEnvironmentService } from '../../services/pythonEnvironmentService';
import { MockConfigProvider, MockLoggerService, MockProcessRunner } from '../mocks/mockServices';

describe('PythonEnvironmentService', () => {
  it('validates Python 3.10+ versions accurately', () => {
    const runner = new MockProcessRunner();
    const logger = new MockLoggerService();
    const envService = new PythonEnvironmentService(runner, logger, new MockConfigProvider());

    assert.deepEqual(envService.validatePythonVersion('Python 3.10.0'), {
      supported: true,
      parsed: { major: 3, minor: 10, patch: 0, raw: '3.10.0' },
    });
    assert.deepEqual(envService.validatePythonVersion('Python 3.14.7'), {
      supported: true,
      parsed: { major: 3, minor: 14, patch: 7, raw: '3.14.7' },
    });
    assert.deepEqual(envService.validatePythonVersion('Python 3.9.18'), {
      supported: false,
      parsed: { major: 3, minor: 9, patch: 18, raw: '3.9.18' },
    });
    assert.equal(envService.validatePythonVersion('invalid').supported, false);
  });

  it('prefers uv-project backend when pyproject.toml and uv are present', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uv-env-proj-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), '[project]\nname = "demo"\n');
      fs.writeFileSync(path.join(tempDir, 'uv.lock'), 'version = 1\n');

      const runner = new MockProcessRunner((cmd, args) => {
        if (cmd === 'uv' && args[0] === '--version') {
          return { exitCode: 0, stdout: 'uv 0.13.5 (46776a95d 2026-10-21)\n' };
        }
        if (cmd === 'uv' && args[0] === 'python' && args[1] === 'find') {
          return { exitCode: 0, stdout: '/usr/bin/python3.12\n' };
        }
        if (cmd === '/usr/bin/python3.12' && args[0] === '--version') {
          return { exitCode: 0, stdout: 'Python 3.12.7\n' };
        }
        return { exitCode: 1, stderr: 'not found' };
      });

      const envService = new PythonEnvironmentService(
        runner,
        new MockLoggerService(),
        new MockConfigProvider({ preferUv: true })
      );

      const env = await envService.detectEnvironment(tempDir);
      assert.equal(env.uvAvailable, true);
      assert.equal(env.uvVersion, '0.13.5');
      assert.equal(env.backend, 'uv-project');
      assert.equal(env.hasPyprojectToml, true);
      assert.equal(env.hasUvLock, true);
      assert.equal(env.isPythonVersionSupported, true);
      assert.equal(env.pythonVersion?.raw, '3.12.7');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('uses uv-pip backend when uv is present without pyproject.toml', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uv-env-pip-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'httpx>=0.27\n');

      const runner = new MockProcessRunner((cmd, args) => {
        if (cmd === 'uv' && args[0] === '--version') {
          return { exitCode: 0, stdout: 'uv 0.13.5\n' };
        }
        if (cmd === 'uv' && args[0] === 'python' && args[1] === 'find') {
          return { exitCode: 0, stdout: 'python3\n' };
        }
        if ((cmd === 'python3' || cmd === 'python') && args[0] === '--version') {
          return { exitCode: 0, stdout: 'Python 3.11.9\n' };
        }
        return { exitCode: 1 };
      });

      const envService = new PythonEnvironmentService(
        runner,
        new MockLoggerService(),
        new MockConfigProvider({ preferUv: true })
      );

      const env = await envService.detectEnvironment(tempDir);
      assert.equal(env.backend, 'uv-pip');
      assert.equal(env.hasRequirementsTxt, true);
      assert.equal(env.hasPyprojectToml, false);
      assert.equal(env.isPythonVersionSupported, true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('falls back to pip when uv is unavailable', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uv-env-fallback-'));
    try {
      const runner = new MockProcessRunner((cmd, args) => {
        if (cmd === 'uv') {
          return { exitCode: -1, stderr: 'ENOENT: uv not found' };
        }
        if ((cmd === 'python' || cmd === 'python3') && args[0] === '--version') {
          return { exitCode: 0, stdout: 'Python 3.10.14\n' };
        }
        return { exitCode: 1 };
      });

      const envService = new PythonEnvironmentService(
        runner,
        new MockLoggerService(),
        new MockConfigProvider({ preferUv: true })
      );

      const env = await envService.detectEnvironment(tempDir);
      assert.equal(env.uvAvailable, false);
      assert.equal(env.backend, 'pip');
      assert.equal(env.isPythonVersionSupported, true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
