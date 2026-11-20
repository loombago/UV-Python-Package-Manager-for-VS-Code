import assert from 'node:assert/strict';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import * as vscode from 'vscode';
import { ServiceContainer } from '../../di/container';
import { TOKENS } from '../../di/tokens';
import {
  activate,
  deactivate,
  installPackage,
  listPackages,
  removePackage,
  updatePackage,
} from '../../extension';
import { VsCodeLoggerService } from '../../services/loggerService';
import { NodeProcessRunner } from '../../services/processRunner';
import { PythonEnvironmentService } from '../../services/pythonEnvironmentService';
import {
  MockConfigProvider,
  MockLoggerService,
  MockPackageManagerService,
  MockPyPiSearchService,
  MockPythonEnvironmentService,
} from '../mocks/mockServices';
import {
  createMockExtensionContext,
  getVscodeMockState,
  resetVscodeMock,
} from '../mocks/vscodeMock';

describe('Extension Integration Workflow', () => {
  afterEach(() => {
    deactivate();
    resetVscodeMock();
  });

  it('activates with DI mocks, executes CRUD package lifecycle, and updates TreeViews', async () => {
    resetVscodeMock(path.resolve(process.cwd(), 'sample-workspace'));
    const context = createMockExtensionContext(process.cwd());

    const mockLogger = new MockLoggerService();
    const mockEnv = new MockPythonEnvironmentService({
      backend: 'uv-project',
      uvAvailable: true,
      uvVersion: '0.13.5',
      pythonVersion: { major: 3, minor: 12, patch: 4, raw: '3.12.4' },
    });
    const mockPkgService = new MockPackageManagerService([
      { name: 'ruff', version: '0.6.9', latestVersion: '0.7.0', isOutdated: true },
    ]);
    const mockPyPi = new MockPyPiSearchService();

    const container = new ServiceContainer();
    container.registerSingleton(TOKENS.Logger, () => mockLogger);
    container.registerInstance(TOKENS.PythonEnvService, mockEnv);
    container.registerInstance(TOKENS.PackageManagerService, mockPkgService);
    container.registerInstance(TOKENS.PyPiSearchService, mockPyPi);

    const api = await activate(context, container);
    const mockState = getVscodeMockState();

    assert.ok(mockState.commands.has('uvPkgManager.openPanel'));
    assert.ok(mockState.commands.has('uvPkgManager.listPackages'));
    assert.ok(mockState.commands.has('uvPkgManager.installPackage'));
    assert.ok(mockState.commands.has('uvPkgManager.removePackage'));
    assert.ok(mockState.commands.has('uvPkgManager.updatePackage'));
    assert.ok(mockState.commands.has('uvPkgManager.createVirtualEnv'));
    assert.ok(mockState.treeProviders.has('uvPkgInstalledView'));
    assert.ok(mockState.treeProviders.has('uvPkgEnvView'));

    const venvCmdRes = await vscode.commands.executeCommand<{ success: boolean; operation: string }>(
      'uvPkgManager.createVirtualEnv'
    );
    assert.equal(venvCmdRes.success, true);
    assert.equal(venvCmdRes.operation, 'create-venv');

    const initialList = await listPackages();
    assert.equal(initialList.length, 1);
    assert.equal(initialList[0].name, 'ruff');

    const installRes = await installPackage({ name: 'httpx', versionConstraint: '0.27.0' });
    assert.equal(installRes.success, true);

    const afterInstall = await api.listPackages();
    assert.deepEqual(
      afterInstall.map((p) => p.name),
      ['httpx', 'ruff']
    );

    const updateRes = await updatePackage('ruff');
    assert.equal(updateRes.success, true);

    const updatedList = await listPackages();
    const updatedRuff = updatedList.find((p) => p.name === 'ruff');
    assert.equal(updatedRuff?.version, '0.7.0');
    assert.equal(updatedRuff?.isOutdated, false);

    const installedTree = api.container.resolve(TOKENS.InstalledTreeProvider);
    const treeRoots = await installedTree.getChildren();
    assert.equal(treeRoots.length, 2);
    const httpxNode = treeRoots.find((node) => node.label === 'httpx');
    assert.ok(httpxNode);
    const httpxDetails = await installedTree.getChildren(httpxNode);
    assert.ok(httpxDetails.some((d) => d.label === 'Version:' && d.description === '0.27.0'));

    const envTree = api.container.resolve(TOKENS.EnvTreeProvider);
    const envNodes = await envTree.getChildren();
    assert.ok(
      envNodes.some(
        (n) =>
          n.label === 'Backend' &&
          typeof n.description === 'string' &&
          n.description.includes('uv')
      )
    );

    const removeCmdRes = await vscode.commands.executeCommand<{ success: boolean }>(
      'uvPkgManager.removePackage',
      'httpx'
    );
    assert.equal(removeCmdRes.success, true);

    await installPackage({ name: 'pytest', versionConstraint: '8.3.0', dev: true });
    const directRemoveRes = await removePackage('pytest');
    assert.equal(directRemoveRes.success, true);

    const finalList = await listPackages();
    assert.deepEqual(
      finalList.map((p) => p.name),
      ['ruff']
    );

    deactivate();
    assert.equal(mockLogger.disposed, true);
  });

  it('detects real host Python 3.10+ and uv tooling in sample-workspace', async () => {
    const sampleWorkspace = path.resolve(process.cwd(), 'sample-workspace');
    const logger = new VsCodeLoggerService();
    const runner = new NodeProcessRunner(logger);
    const envService = new PythonEnvironmentService(runner, logger, new MockConfigProvider());

    const env = await envService.detectEnvironment(sampleWorkspace);
    assert.equal(env.workspaceRoot, sampleWorkspace);
    assert.equal(env.hasPyprojectToml, true);
    assert.equal(env.hasRequirementsTxt, true);
    assert.ok(env.pythonVersion, 'Expected host Python to be detected');
    assert.equal(env.isPythonVersionSupported, true, 'Expected Python >= 3.10 on host');
    if (env.uvAvailable) {
      assert.equal(env.backend, 'uv-project');
    } else {
      assert.equal(env.backend, 'pip');
    }

    logger.dispose();
  });
});
