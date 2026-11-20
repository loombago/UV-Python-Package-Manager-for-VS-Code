import * as vscode from 'vscode';
import { ILoggerService } from '../services/loggerService';
import { IPythonEnvironmentService } from '../services/pythonEnvironmentService';
import { PythonEnvironmentInfo } from '../types/package';

export class EnvTreeItem extends vscode.TreeItem {
  public constructor(
    label: string,
    description: string,
    iconName: string,
    tooltip?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = tooltip ?? `${label}: ${description}`;
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.contextValue = 'envInfoItem';
  }
}

/**
 * TreeDataProvider presenting the detected Python 3.10+ interpreter,
 * uv/pip backend status, virtual environment, and workspace manifest files.
 */
export class EnvironmentTreeProvider
  implements vscode.TreeDataProvider<EnvTreeItem>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    EnvTreeItem | undefined | null | void
  >();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private cachedEnv: PythonEnvironmentInfo | undefined;

  public constructor(
    private readonly envService: IPythonEnvironmentService,
    private readonly logger: ILoggerService
  ) {}

  public getTreeItem(element: EnvTreeItem): vscode.TreeItem {
    return element;
  }

  public getCachedEnvironment(): PythonEnvironmentInfo | undefined {
    return this.cachedEnv;
  }

  public async refresh(): Promise<PythonEnvironmentInfo> {
    this.cachedEnv = await this.envService.detectEnvironment();
    this.onDidChangeTreeDataEmitter.fire();
    return this.cachedEnv;
  }

  public async getChildren(element?: EnvTreeItem): Promise<EnvTreeItem[]> {
    if (element) {
      return [];
    }

    try {
      const env = this.cachedEnv ?? (await this.refresh());
      const backendLabel =
        env.backend === 'uv-project'
          ? 'uv (Project / pyproject.toml)'
          : env.backend === 'uv-pip'
            ? 'uv (pip compatibility)'
            : 'pip (fallback)';

      const pythonLabel = env.pythonVersion
        ? `${env.pythonVersion.raw}${env.isPythonVersionSupported ? ' (3.10+ OK)' : ' (Unsupported <3.10)'}`
        : 'Not found';

      const projectFiles: string[] = [];
      if (env.hasPyprojectToml) {
        projectFiles.push('pyproject.toml');
      }
      if (env.hasUvLock) {
        projectFiles.push('uv.lock');
      }
      if (env.hasRequirementsTxt) {
        projectFiles.push('requirements.txt');
      }

      return [
        new EnvTreeItem('Backend', backendLabel, env.uvAvailable ? 'zap' : 'tools'),
        new EnvTreeItem(
          'uv CLI',
          env.uvAvailable ? `v${env.uvVersion ?? 'detected'}` : 'Not installed / Disabled',
          env.uvAvailable ? 'check' : 'circle-slash'
        ),
        new EnvTreeItem(
          'Python',
          pythonLabel,
          env.isPythonVersionSupported ? 'symbol-method' : 'warning'
        ),
        new EnvTreeItem(
          'Interpreter',
          env.pythonPath ?? 'None',
          'file-code',
          env.pythonPath ?? 'No Python interpreter resolved'
        ),
        new EnvTreeItem(
          'Virtual Env',
          env.virtualEnvPath ?? 'None (.venv not detected)',
          'folder-library'
        ),
        new EnvTreeItem(
          'Manifests',
          projectFiles.length > 0 ? projectFiles.join(', ') : 'None in workspace',
          'file-text'
        ),
      ];
    } catch (error) {
      this.logger.error('Failed to render environment tree view', error);
      return [
        new EnvTreeItem(
          'Error',
          error instanceof Error ? error.message : String(error),
          'error'
        ),
      ];
    }
  }

  public dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }
}
