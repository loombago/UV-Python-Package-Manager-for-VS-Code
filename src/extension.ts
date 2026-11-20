import * as vscode from 'vscode';
import { IServiceContainer, ServiceContainer } from './di/container';
import { TOKENS } from './di/tokens';
import { ILoggerService, VsCodeLoggerService } from './services/loggerService';
import { IPackageManagerService, UvPackageManagerService } from './services/packageManagerService';
import { IProcessRunner, NodeProcessRunner } from './services/processRunner';
import { IPyPiSearchService, PyPiSearchService } from './services/pypiSearchService';
import {
  IConfigProvider,
  IPythonEnvironmentService,
  PythonEnvironmentService,
  VsCodeConfigProvider,
} from './services/pythonEnvironmentService';
import {
  InstalledPackage,
  PackageInstallRequest,
  PackageOperationResult,
} from './types/package';
import { EnvironmentTreeProvider } from './views/environmentTreeProvider';
import {
  InstalledPackagesTreeProvider,
  PackageTreeItem,
} from './views/installedPackagesTreeProvider';
import { PackageManagerPanel } from './webview/packageManagerPanel';

export interface ExtensionApi {
  container: IServiceContainer;
  listPackages: (cwd?: string) => Promise<InstalledPackage[]>;
  installPackage: (
    request: PackageInstallRequest | string,
    cwd?: string
  ) => Promise<PackageOperationResult>;
  removePackage: (packageName: string, cwd?: string) => Promise<PackageOperationResult>;
  updatePackage: (
    packageName: string,
    targetVersion?: string,
    cwd?: string
  ) => Promise<PackageOperationResult>;
  createVirtualEnvironment: (
    pythonSpec?: string,
    cwd?: string
  ) => Promise<PackageOperationResult>;
}

let activeContainer: IServiceContainer | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

/**
 * Registers default production services in the IoC container.
 * Existing registrations on a provided container (e.g. test mocks) are preserved.
 */
export function bootstrapContainer(targetContainer?: IServiceContainer): IServiceContainer {
  const container = targetContainer ?? new ServiceContainer();

  if (!container.has(TOKENS.Logger)) {
    container.registerSingleton<ILoggerService>(TOKENS.Logger, () => new VsCodeLoggerService());
  }

  if (!container.has(TOKENS.ConfigProvider)) {
    container.registerSingleton<IConfigProvider>(
      TOKENS.ConfigProvider,
      () => new VsCodeConfigProvider()
    );
  }

  if (!container.has(TOKENS.ProcessRunner)) {
    container.registerSingleton<IProcessRunner>(
      TOKENS.ProcessRunner,
      (c) => new NodeProcessRunner(c.resolve(TOKENS.Logger))
    );
  }

  if (!container.has(TOKENS.PythonEnvService)) {
    container.registerSingleton<IPythonEnvironmentService>(
      TOKENS.PythonEnvService,
      (c) =>
        new PythonEnvironmentService(
          c.resolve(TOKENS.ProcessRunner),
          c.resolve(TOKENS.Logger),
          c.resolve(TOKENS.ConfigProvider)
        )
    );
  }

  if (!container.has(TOKENS.PackageManagerService)) {
    container.registerSingleton<IPackageManagerService>(
      TOKENS.PackageManagerService,
      (c) =>
        new UvPackageManagerService(
          c.resolve(TOKENS.PythonEnvService),
          c.resolve(TOKENS.ProcessRunner),
          c.resolve(TOKENS.Logger)
        )
    );
  }

  if (!container.has(TOKENS.PyPiSearchService)) {
    container.registerSingleton<IPyPiSearchService>(
      TOKENS.PyPiSearchService,
      (c) => new PyPiSearchService(c.resolve(TOKENS.Logger))
    );
  }

  if (!container.has(TOKENS.InstalledTreeProvider)) {
    container.registerSingleton<InstalledPackagesTreeProvider>(
      TOKENS.InstalledTreeProvider,
      (c) =>
        new InstalledPackagesTreeProvider(
          c.resolve(TOKENS.PackageManagerService),
          c.resolve(TOKENS.Logger)
        )
    );
  }

  if (!container.has(TOKENS.EnvTreeProvider)) {
    container.registerSingleton<EnvironmentTreeProvider>(
      TOKENS.EnvTreeProvider,
      (c) =>
        new EnvironmentTreeProvider(
          c.resolve(TOKENS.PythonEnvService),
          c.resolve(TOKENS.Logger)
        )
    );
  }

  return container;
}

function requireActiveContainer(): IServiceContainer {
  if (!activeContainer) {
    throw new Error('UV Package Manager extension is not activated. Call activate() first.');
  }
  return activeContainer;
}

async function refreshAllViews(container: IServiceContainer): Promise<InstalledPackage[]> {
  const envTree = container.resolve(TOKENS.EnvTreeProvider);
  const installedTree = container.resolve(TOKENS.InstalledTreeProvider);

  const [envInfo, packages] = await Promise.all([envTree.refresh(), installedTree.refresh()]);

  if (statusBarItem) {
    const outdatedCount = packages.filter((p) => p.isOutdated).length;
    const badge = envInfo.uvAvailable ? 'uv' : 'pip';
    const outdatedSuffix = outdatedCount > 0 ? ` (${outdatedCount} outdated)` : '';
    statusBarItem.text = `$(package) ${badge}: ${packages.length} pkgs${outdatedSuffix}`;
    statusBarItem.tooltip = `Backend: ${envInfo.backend} | Python: ${envInfo.pythonVersion?.raw ?? 'N/A'}`;
    statusBarItem.show();
  }

  return packages;
}

/**
 * Lists all installed packages in the active Python environment and refreshes TreeViews.
 */
export async function listPackages(cwd?: string): Promise<InstalledPackage[]> {
  const container = requireActiveContainer();
  const packageManager = container.resolve(TOKENS.PackageManagerService);
  const packages = await packageManager.listPackages(cwd);
  if (!cwd) {
    await refreshAllViews(container);
  }
  return packages;
}

/**
 * Installs a Python package using uv (preferred) or pip fallback, then refreshes views.
 */
export async function installPackage(
  requestOrName: PackageInstallRequest | string,
  cwd?: string
): Promise<PackageOperationResult> {
  const container = requireActiveContainer();
  const packageManager = container.resolve(TOKENS.PackageManagerService);
  const request: PackageInstallRequest =
    typeof requestOrName === 'string'
      ? parsePackageInput(requestOrName)
      : requestOrName;

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Installing ${request.name}...`,
      cancellable: false,
    },
    () => packageManager.installPackage(request, cwd)
  );

  await refreshAllViews(container);
  return result;
}

/**
 * Removes an installed Python package using uv (preferred) or pip fallback, then refreshes views.
 */
export async function removePackage(
  packageName: string,
  cwd?: string
): Promise<PackageOperationResult> {
  const container = requireActiveContainer();
  const packageManager = container.resolve(TOKENS.PackageManagerService);

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Removing ${packageName}...`,
      cancellable: false,
    },
    () => packageManager.removePackage(packageName, cwd)
  );

  await refreshAllViews(container);
  return result;
}

/**
 * Updates an installed Python package to its latest or specified version, then refreshes views.
 */
export async function updatePackage(
  packageName: string,
  targetVersion?: string,
  cwd?: string
): Promise<PackageOperationResult> {
  const container = requireActiveContainer();
  const packageManager = container.resolve(TOKENS.PackageManagerService);

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Updating ${packageName}...`,
      cancellable: false,
    },
    () => packageManager.updatePackage(packageName, targetVersion, cwd)
  );

  await refreshAllViews(container);
  return result;
}

/**
 * Creates a .venv virtual environment in the workspace using uv (preferred) or python -m venv.
 */
export async function createVirtualEnvironment(
  pythonSpec?: string,
  cwd?: string
): Promise<PackageOperationResult> {
  const container = requireActiveContainer();
  const packageManager = container.resolve(TOKENS.PackageManagerService);

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Creating .venv virtual environment...',
      cancellable: false,
    },
    () => packageManager.createVirtualEnvironment(pythonSpec, cwd)
  );

  await refreshAllViews(container);
  return result;
}

function parsePackageInput(rawInput: string): PackageInstallRequest {
  const trimmed = rawInput.trim();
  const match = trimmed.match(/^([A-Za-z0-9._-]+)(?:\[([^\]]+)\])?(.*)$/);
  if (!match) {
    return { name: trimmed };
  }
  const [, name, rawExtras, rawConstraint] = match;
  const extras = rawExtras
    ? rawExtras
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
    : undefined;
  const versionConstraint = rawConstraint?.trim() || undefined;
  return { name, extras, versionConstraint };
}

async function selectPythonInterpreter(container: IServiceContainer): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: 'Select Python Interpreter',
  });

  if (!selected || selected.length === 0) {
    return;
  }

  const chosenPath = selected[0].fsPath;
  await vscode.workspace
    .getConfiguration('uvPkgManager')
    .update('pythonPath', chosenPath, vscode.ConfigurationTarget.Workspace);

  await refreshAllViews(container);
  void vscode.window.showInformationMessage(`Python interpreter updated to: ${chosenPath}`);
}

export async function activate(
  context: vscode.ExtensionContext,
  customContainer?: IServiceContainer
): Promise<ExtensionApi> {
  const container = bootstrapContainer(customContainer);
  activeContainer = container;

  const logger = container.resolve(TOKENS.Logger);
  const envService = container.resolve(TOKENS.PythonEnvService);
  const packageManager = container.resolve(TOKENS.PackageManagerService);
  const pypiSearch = container.resolve(TOKENS.PyPiSearchService);
  const installedTreeProvider = container.resolve(TOKENS.InstalledTreeProvider);
  const envTreeProvider = container.resolve(TOKENS.EnvTreeProvider);

  logger.info('Activating UV Python Package Manager extension...');

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'uvPkgManager.openPanel';
  statusBarItem.text = '$(package) uv: initializing...';
  statusBarItem.show();

  const openPanelCmd = vscode.commands.registerCommand('uvPkgManager.openPanel', () => {
    PackageManagerPanel.createOrShow({
      extensionUri: context.extensionUri,
      envService,
      packageManagerService: packageManager,
      pypiSearchService: pypiSearch,
      logger,
      onPackagesChanged: async () => {
        await refreshAllViews(container);
      },
      onSelectPythonPath: async () => {
        await selectPythonInterpreter(container);
      },
    });
  });

  const listCmd = vscode.commands.registerCommand('uvPkgManager.listPackages', async () => {
    try {
      return await listPackages();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Failed to list packages: ${msg}`);
      return [];
    }
  });

  const installCmd = vscode.commands.registerCommand(
    'uvPkgManager.installPackage',
    async (arg?: PackageInstallRequest | string) => {
      try {
        let request: PackageInstallRequest | string | undefined = arg;
        if (!request) {
          const input = await vscode.window.showInputBox({
            prompt: 'Enter Python package specification (e.g. httpx, pydantic>=2.0, ruff[lint])',
            placeHolder: 'package-name>=1.0.0',
          });
          if (!input) {
            return undefined;
          }
          request = input;
        }
        const res = await installPackage(request);
        if (res.success) {
          void vscode.window.showInformationMessage(res.message);
        } else {
          void vscode.window.showErrorMessage(res.message);
        }
        return res;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Install failed: ${msg}`);
        return undefined;
      }
    }
  );

  const removeCmd = vscode.commands.registerCommand(
    'uvPkgManager.removePackage',
    async (arg?: string | PackageTreeItem) => {
      try {
        let packageName =
          typeof arg === 'string' ? arg : arg instanceof PackageTreeItem ? arg.pkg?.name : undefined;

        if (!packageName) {
          const currentPackages = installedTreeProvider.getCachedPackages();
          const picks = currentPackages.map((p) => ({ label: p.name, description: p.version }));
          const picked = await vscode.window.showQuickPick(picks, {
            placeHolder: 'Select a package to remove',
          });
          packageName = picked?.label;
        }

        if (!packageName) {
          return undefined;
        }

        const res = await removePackage(packageName);
        if (res.success) {
          void vscode.window.showInformationMessage(res.message);
        } else {
          void vscode.window.showErrorMessage(res.message);
        }
        return res;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Remove failed: ${msg}`);
        return undefined;
      }
    }
  );

  const updateCmd = vscode.commands.registerCommand(
    'uvPkgManager.updatePackage',
    async (arg?: string | PackageTreeItem, targetVersion?: string) => {
      try {
        let packageName =
          typeof arg === 'string' ? arg : arg instanceof PackageTreeItem ? arg.pkg?.name : undefined;

        if (!packageName) {
          const currentPackages = installedTreeProvider.getCachedPackages();
          const outdatedFirst = [...currentPackages].sort(
            (a, b) => Number(Boolean(b.isOutdated)) - Number(Boolean(a.isOutdated))
          );
          const picked = await vscode.window.showQuickPick(
            outdatedFirst.map((p) => ({
              label: p.name,
              description: p.isOutdated && p.latestVersion ? `${p.version} -> ${p.latestVersion}` : p.version,
            })),
            { placeHolder: 'Select a package to update' }
          );
          packageName = picked?.label;
        }

        if (!packageName) {
          return undefined;
        }

        const res = await updatePackage(packageName, targetVersion);
        if (res.success) {
          void vscode.window.showInformationMessage(res.message);
        } else {
          void vscode.window.showErrorMessage(res.message);
        }
        return res;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Update failed: ${msg}`);
        return undefined;
      }
    }
  );

  const selectPythonCmd = vscode.commands.registerCommand('uvPkgManager.selectPythonPath', () =>
    selectPythonInterpreter(container)
  );

  const createVenvCmd = vscode.commands.registerCommand(
    'uvPkgManager.createVirtualEnv',
    async (pythonSpec?: string) => {
      try {
        const res = await createVirtualEnvironment(pythonSpec);
        if (res.success) {
          void vscode.window.showInformationMessage(res.message);
        } else {
          void vscode.window.showErrorMessage(res.message);
        }
        return res;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Failed to create .venv: ${msg}`);
        return undefined;
      }
    }
  );

  const installedView = vscode.window.registerTreeDataProvider(
    'uvPkgInstalledView',
    installedTreeProvider
  );
  const envView = vscode.window.registerTreeDataProvider('uvPkgEnvView', envTreeProvider);

  const fileWatcher = vscode.workspace.createFileSystemWatcher(
    '**/{pyproject.toml,uv.lock,requirements.txt}'
  );
  const triggerRefresh = (): void => {
    void refreshAllViews(container);
  };
  fileWatcher.onDidChange(triggerRefresh);
  fileWatcher.onDidCreate(triggerRefresh);
  fileWatcher.onDidDelete(triggerRefresh);

  const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('uvPkgManager')) {
      void refreshAllViews(container);
    }
  });

  context.subscriptions.push(
    statusBarItem,
    openPanelCmd,
    listCmd,
    installCmd,
    removeCmd,
    updateCmd,
    selectPythonCmd,
    createVenvCmd,
    installedView,
    envView,
    fileWatcher,
    configWatcher,
    { dispose: () => container.dispose() }
  );

  // Perform non-blocking initial environment and package discovery.
  void refreshAllViews(container).catch((err) => {
    logger.warn('Initial package discovery encountered an issue', err);
  });

  logger.info('UV Python Package Manager extension activated.');

  return {
    container,
    listPackages,
    installPackage,
    removePackage,
    updatePackage,
    createVirtualEnvironment,
  };
}

export function deactivate(): void {
  activeContainer?.dispose();
  activeContainer = undefined;
  statusBarItem = undefined;
}
