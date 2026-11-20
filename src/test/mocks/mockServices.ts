import { ILoggerService } from '../../services/loggerService';
import { IPackageManagerService } from '../../services/packageManagerService';
import { IProcessRunner, ProcessResult, ProcessRunOptions } from '../../services/processRunner';
import { IPyPiSearchService } from '../../services/pypiSearchService';
import {
  ExtensionConfiguration,
  IConfigProvider,
  IPythonEnvironmentService,
} from '../../services/pythonEnvironmentService';
import {
  InstalledPackage,
  PackageInstallRequest,
  PackageMetadata,
  PackageOperationResult,
  PyPiPackageInfo,
  PythonEnvironmentInfo,
  PythonVersionInfo,
} from '../../types/package';

export class MockLoggerService implements ILoggerService {
  public readonly entries: Array<{ level: string; message: string; meta: unknown[] }> = [];
  public disposed = false;

  public debug(message: string, ...meta: unknown[]): void {
    this.entries.push({ level: 'DEBUG', message, meta });
  }

  public info(message: string, ...meta: unknown[]): void {
    this.entries.push({ level: 'INFO', message, meta });
  }

  public warn(message: string, ...meta: unknown[]): void {
    this.entries.push({ level: 'WARN', message, meta });
  }

  public error(message: string, ...meta: unknown[]): void {
    this.entries.push({ level: 'ERROR', message, meta });
  }

  public show(): void {
    // No-op in mock
  }

  public dispose(): void {
    this.disposed = true;
  }
}

export class MockConfigProvider implements IConfigProvider {
  public config: ExtensionConfiguration;

  public constructor(overrides: Partial<ExtensionConfiguration> = {}) {
    this.config = {
      preferUv: true,
      uvPath: 'uv',
      pythonPath: '',
      checkOutdated: true,
      commandTimeoutMs: 120_000,
      ...overrides,
    };
  }

  public getConfig(): ExtensionConfiguration {
    return { ...this.config };
  }
}

export interface RecordedCommandCall {
  command: string;
  args: string[];
  options?: ProcessRunOptions;
}

export type MockProcessResponder = (
  command: string,
  args: string[],
  options?: ProcessRunOptions
) => Partial<ProcessResult> | Promise<Partial<ProcessResult>>;

export class MockProcessRunner implements IProcessRunner {
  public readonly calls: RecordedCommandCall[] = [];
  private responder: MockProcessResponder;

  public constructor(responder?: MockProcessResponder) {
    this.responder =
      responder ??
      (() => ({
        exitCode: 0,
        stdout: '',
        stderr: '',
      }));
  }

  public setResponder(responder: MockProcessResponder): void {
    this.responder = responder;
  }

  public async run(
    command: string,
    args: string[],
    options?: ProcessRunOptions
  ): Promise<ProcessResult> {
    this.calls.push({ command, args: [...args], options });
    const response = await this.responder(command, args, options);
    return {
      command,
      args,
      exitCode: response.exitCode ?? 0,
      stdout: response.stdout ?? '',
      stderr: response.stderr ?? '',
      durationMs: response.durationMs ?? 5,
      timedOut: response.timedOut ?? false,
      cancelled: response.cancelled ?? false,
    };
  }
}

export class MockPythonEnvironmentService implements IPythonEnvironmentService {
  public environment: PythonEnvironmentInfo;
  public config: ExtensionConfiguration;

  public constructor(
    envOverrides: Partial<PythonEnvironmentInfo> = {},
    configOverrides: Partial<ExtensionConfiguration> = {}
  ) {
    this.environment = {
      workspaceRoot: '/mock/workspace',
      pythonPath: '/mock/workspace/.venv/bin/python',
      pythonVersion: { major: 3, minor: 12, patch: 4, raw: '3.12.4' },
      isPythonVersionSupported: true,
      uvAvailable: true,
      uvPath: 'uv',
      uvVersion: '0.13.5',
      backend: 'uv-project',
      virtualEnvPath: '/mock/workspace/.venv',
      hasPyprojectToml: true,
      hasUvLock: true,
      hasRequirementsTxt: false,
      ...envOverrides,
    };
    this.config = {
      preferUv: true,
      uvPath: 'uv',
      pythonPath: '',
      checkOutdated: true,
      commandTimeoutMs: 120_000,
      ...configOverrides,
    };
  }

  public async detectEnvironment(): Promise<PythonEnvironmentInfo> {
    return { ...this.environment };
  }

  public validatePythonVersion(
    versionText: string
  ): { supported: boolean; parsed?: PythonVersionInfo } {
    const match = versionText.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
      return { supported: false };
    }
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    return {
      supported: major > 3 || (major === 3 && minor >= 10),
      parsed: { major, minor, patch, raw: `${major}.${minor}.${patch}` },
    };
  }

  public getEffectiveWorkspaceRoot(explicitCwd?: string): string | undefined {
    return explicitCwd ?? this.environment.workspaceRoot;
  }

  public getConfig(): ExtensionConfiguration {
    return { ...this.config };
  }
}

/**
 * Stateful in-memory mock of IPackageManagerService for unit/integration testing.
 */
export class MockPackageManagerService implements IPackageManagerService {
  public readonly packages = new Map<string, InstalledPackage>();
  public readonly details = new Map<string, PackageMetadata>();
  public readonly history: Array<{ op: string; target: string }> = [];

  public constructor(initialPackages: InstalledPackage[] = []) {
    for (const pkg of initialPackages) {
      this.packages.set(pkg.name.toLowerCase(), { ...pkg });
    }
  }

  public async listPackages(): Promise<InstalledPackage[]> {
    this.history.push({ op: 'list', target: '*' });
    return Array.from(this.packages.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  public async installPackage(request: PackageInstallRequest): Promise<PackageOperationResult> {
    this.history.push({ op: 'install', target: request.name });
    const cleanVersion = request.versionConstraint?.replace(/^[=<>!~]+/, '') || '1.0.0';
    this.packages.set(request.name.toLowerCase(), {
      name: request.name,
      version: cleanVersion,
      isOutdated: false,
    });
    return {
      success: true,
      operation: 'install',
      packageName: request.name,
      backend: 'uv-project',
      command: `uv add ${request.name}`,
      stdout: `Installed ${request.name}==${cleanVersion}`,
      stderr: '',
      durationMs: 12,
      message: `Successfully installed ${request.name}`,
    };
  }

  public async removePackage(packageName: string): Promise<PackageOperationResult> {
    this.history.push({ op: 'remove', target: packageName });
    const existed = this.packages.delete(packageName.toLowerCase());
    return {
      success: existed,
      operation: 'remove',
      packageName,
      backend: 'uv-project',
      command: `uv remove ${packageName}`,
      stdout: existed ? `Removed ${packageName}` : '',
      stderr: existed ? '' : `Package ${packageName} is not installed`,
      durationMs: 8,
      message: existed
        ? `Successfully removed ${packageName}`
        : `Package ${packageName} not found`,
    };
  }

  public async updatePackage(
    packageName: string,
    targetVersion?: string
  ): Promise<PackageOperationResult> {
    this.history.push({ op: 'update', target: packageName });
    const existing = this.packages.get(packageName.toLowerCase());
    if (!existing) {
      return {
        success: false,
        operation: 'update',
        packageName,
        backend: 'uv-project',
        command: `uv lock --upgrade-package ${packageName}`,
        stdout: '',
        stderr: `Package ${packageName} is not installed`,
        durationMs: 6,
        message: `Package ${packageName} not found`,
      };
    }

    const nextVersion = targetVersion ?? existing.latestVersion ?? existing.version;
    this.packages.set(packageName.toLowerCase(), {
      name: existing.name,
      version: nextVersion,
      isOutdated: false,
    });

    return {
      success: true,
      operation: 'update',
      packageName,
      backend: 'uv-project',
      command: `uv lock --upgrade-package ${packageName} && uv sync`,
      stdout: `Updated ${packageName} -> ${nextVersion}`,
      stderr: '',
      durationMs: 15,
      message: `Successfully updated ${packageName} to ${nextVersion}`,
    };
  }

  public async getPackageDetails(packageName: string): Promise<PackageMetadata | undefined> {
    const existing = this.packages.get(packageName.toLowerCase());
    if (!existing) {
      return undefined;
    }
    return (
      this.details.get(packageName.toLowerCase()) ?? {
        name: existing.name,
        version: existing.version,
        summary: `Mock package ${existing.name}`,
        homePage: `https://pypi.org/project/${existing.name}/`,
        author: 'Test Author',
        license: 'MIT',
        location: '/mock/.venv/lib/site-packages',
        requires: [],
        requiredBy: [],
      }
    );
  }

  public async createVirtualEnvironment(
    pythonSpec?: string,
    cwd?: string
  ): Promise<PackageOperationResult> {
    this.history.push({ op: 'create-venv', target: cwd ?? '.venv' });
    return {
      success: true,
      operation: 'create-venv',
      packageName: '.venv',
      backend: 'uv-project',
      command: pythonSpec ? `uv venv .venv --python ${pythonSpec}` : 'uv venv .venv',
      stdout: 'Created virtual environment at .venv',
      stderr: '',
      durationMs: 20,
      message: 'Successfully created .venv in workspace.',
    };
  }
}

export class MockPyPiSearchService implements IPyPiSearchService {
  public readonly catalog = new Map<string, PyPiPackageInfo>();

  public async fetchPackageInfo(packageName: string): Promise<PyPiPackageInfo | undefined> {
    return this.catalog.get(packageName.toLowerCase());
  }
}
