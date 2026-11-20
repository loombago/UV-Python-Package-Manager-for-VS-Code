import {
  InstalledPackage,
  OutdatedPackage,
  PackageInstallRequest,
  PackageManagerBackend,
  PackageMetadata,
  PackageOperationResult,
  PythonEnvironmentInfo,
} from '../types/package';
import { ILoggerService } from './loggerService';
import { IProcessRunner, ProcessResult } from './processRunner';
import { IPythonEnvironmentService } from './pythonEnvironmentService';

export interface IPackageManagerService {
  listPackages(cwd?: string): Promise<InstalledPackage[]>;
  installPackage(request: PackageInstallRequest, cwd?: string): Promise<PackageOperationResult>;
  removePackage(packageName: string, cwd?: string): Promise<PackageOperationResult>;
  updatePackage(packageName: string, targetVersion?: string, cwd?: string): Promise<PackageOperationResult>;
  getPackageDetails(packageName: string, cwd?: string): Promise<PackageMetadata | undefined>;
  createVirtualEnvironment(pythonSpec?: string, cwd?: string): Promise<PackageOperationResult>;
}

const VALID_PACKAGE_NAME_REGEX = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const VALID_EXTRAS_REGEX = /^[A-Za-z0-9._-]+$/;
const VALID_VERSION_SPEC_REGEX =
  /^(==|!=|<=|>=|<|>|~=|===)[A-Za-z0-9.*+_!-]+(\s*,\s*(==|!=|<=|>=|<|>|~=|===)[A-Za-z0-9.*+_!-]+)*$/;

interface RawPipListEntry {
  name?: string;
  version?: string;
  latest_version?: string;
  latest_filetype?: string;
  editable_project_location?: string;
}

/**
 * Package manager service preferring `uv` (`uv-project` for pyproject.toml workspaces
 * or `uv-pip` for standalone/venv environments) and falling back to `pip` when `uv`
 * is unavailable or disabled.
 */
export class UvPackageManagerService implements IPackageManagerService {
  public constructor(
    private readonly envService: IPythonEnvironmentService,
    private readonly processRunner: IProcessRunner,
    private readonly logger: ILoggerService
  ) {}

  public async listPackages(cwd?: string): Promise<InstalledPackage[]> {
    const env = await this.envService.detectEnvironment(cwd);
    this.ensurePythonSupported(env);

    const config = this.envService.getConfig();
    const effectiveCwd = env.workspaceRoot;

    const listCmd = this.buildListCommand(env, false);
    const listRes = await this.processRunner.run(listCmd.executable, listCmd.args, {
      cwd: effectiveCwd,
      timeoutMs: config.commandTimeoutMs,
    });

    if (listRes.exitCode !== 0) {
      // If a uv-project workspace has no .venv yet, return an empty list instead of throwing.
      if (env.backend === 'uv-project' && /no virtual environment/i.test(listRes.stderr)) {
        this.logger.warn('No .venv initialized yet for pyproject.toml workspace; returning empty package list.');
        return [];
      }
      throw new Error(`Failed to list packages (${listCmd.executable}): ${listRes.stderr || listRes.stdout}`);
    }

    const installedRaw = this.parseJsonArray<RawPipListEntry>(listRes.stdout, 'listPackages');
    const outdatedMap = new Map<string, OutdatedPackage>();

    if (config.checkOutdated) {
      const outdatedCmd = this.buildListCommand(env, true);
      const outdatedRes = await this.processRunner.run(outdatedCmd.executable, outdatedCmd.args, {
        cwd: effectiveCwd,
        timeoutMs: config.commandTimeoutMs,
      });

      if (outdatedRes.exitCode === 0 && outdatedRes.stdout.trim()) {
        try {
          const outdatedRaw = this.parseJsonArray<RawPipListEntry>(outdatedRes.stdout, 'listOutdated');
          for (const entry of outdatedRaw) {
            if (entry.name && entry.version && entry.latest_version) {
              outdatedMap.set(this.normalizePackageName(entry.name), {
                name: entry.name,
                version: entry.version,
                latestVersion: entry.latest_version,
                latestFileType: entry.latest_filetype,
              });
            }
          }
        } catch (err) {
          this.logger.warn('Could not parse outdated package output; continuing with installed list.', err);
        }
      }
    }

    const packages: InstalledPackage[] = installedRaw
      .filter((entry): entry is Required<Pick<RawPipListEntry, 'name' | 'version'>> & RawPipListEntry =>
        Boolean(entry.name && entry.version)
      )
      .map((entry) => {
        const normalized = this.normalizePackageName(entry.name);
        const outdated = outdatedMap.get(normalized);
        return {
          name: entry.name,
          version: entry.version,
          latestVersion: outdated?.latestVersion,
          isOutdated: Boolean(outdated),
          isEditable: Boolean(entry.editable_project_location),
          location: entry.editable_project_location,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    this.logger.info(`Listed ${packages.length} packages via ${env.backend}`);
    return packages;
  }

  public async installPackage(request: PackageInstallRequest, cwd?: string): Promise<PackageOperationResult> {
    const packageName = this.validatePackageName(request.name);
    const spec = this.buildPackageSpec(packageName, request.extras, request.versionConstraint);
    const env = await this.envService.detectEnvironment(cwd);
    this.ensurePythonSupported(env);

    const config = this.envService.getConfig();
    const { executable, args } = this.buildInstallCommand(env, spec, request);

    const result = await this.processRunner.run(executable, args, {
      cwd: env.workspaceRoot,
      timeoutMs: config.commandTimeoutMs,
    });

    return this.toOperationResult(
      'install',
      packageName,
      env.backend,
      executable,
      args,
      result,
      result.exitCode === 0
        ? `Successfully installed ${spec} using ${env.backend}.`
        : `Failed to install ${spec}: ${this.extractErrorMessage(result)}`
    );
  }

  public async removePackage(packageName: string, cwd?: string): Promise<PackageOperationResult> {
    const validatedName = this.validatePackageName(packageName);
    const env = await this.envService.detectEnvironment(cwd);
    this.ensurePythonSupported(env);

    const config = this.envService.getConfig();
    const { executable, args } = this.buildRemoveCommand(env, validatedName);

    const result = await this.processRunner.run(executable, args, {
      cwd: env.workspaceRoot,
      timeoutMs: config.commandTimeoutMs,
    });

    return this.toOperationResult(
      'remove',
      validatedName,
      env.backend,
      executable,
      args,
      result,
      result.exitCode === 0
        ? `Successfully removed ${validatedName} using ${env.backend}.`
        : `Failed to remove ${validatedName}: ${this.extractErrorMessage(result)}`
    );
  }

  public async updatePackage(
    packageName: string,
    targetVersion?: string,
    cwd?: string
  ): Promise<PackageOperationResult> {
    const validatedName = this.validatePackageName(packageName);
    const versionSpec = targetVersion ? this.normalizeTargetVersion(targetVersion) : undefined;
    const env = await this.envService.detectEnvironment(cwd);
    this.ensurePythonSupported(env);

    const config = this.envService.getConfig();

    if (env.backend === 'uv-project' && !versionSpec) {
      const uvExe = env.uvPath ?? 'uv';
      const lockArgs = ['lock', '--upgrade-package', validatedName];
      const lockResult = await this.processRunner.run(uvExe, lockArgs, {
        cwd: env.workspaceRoot,
        timeoutMs: config.commandTimeoutMs,
      });

      if (lockResult.exitCode !== 0) {
        return this.toOperationResult(
          'update',
          validatedName,
          env.backend,
          uvExe,
          lockArgs,
          lockResult,
          `Failed to upgrade lockfile for ${validatedName}: ${this.extractErrorMessage(lockResult)}`
        );
      }

      const syncArgs = ['sync'];
      const syncResult = await this.processRunner.run(uvExe, syncArgs, {
        cwd: env.workspaceRoot,
        timeoutMs: config.commandTimeoutMs,
      });

      const combinedResult: ProcessResult = {
        ...syncResult,
        stdout: [lockResult.stdout, syncResult.stdout].filter(Boolean).join('\n'),
        stderr: [lockResult.stderr, syncResult.stderr].filter(Boolean).join('\n'),
        durationMs: lockResult.durationMs + syncResult.durationMs,
      };

      const combinedCommand = `${uvExe} ${lockArgs.join(' ')} && ${uvExe} ${syncArgs.join(' ')}`;
      return {
        success: syncResult.exitCode === 0,
        operation: 'update',
        packageName: validatedName,
        backend: env.backend,
        command: combinedCommand,
        stdout: combinedResult.stdout,
        stderr: combinedResult.stderr,
        durationMs: combinedResult.durationMs,
        message:
          syncResult.exitCode === 0
            ? `Successfully updated ${validatedName} using uv lock & sync.`
            : `Failed to sync updated ${validatedName}: ${this.extractErrorMessage(syncResult)}`,
      };
    }

    const { executable, args } = this.buildUpdateCommand(env, validatedName, versionSpec);
    const result = await this.processRunner.run(executable, args, {
      cwd: env.workspaceRoot,
      timeoutMs: config.commandTimeoutMs,
    });

    return this.toOperationResult(
      'update',
      validatedName,
      env.backend,
      executable,
      args,
      result,
      result.exitCode === 0
        ? `Successfully updated ${validatedName}${versionSpec ?? ''} using ${env.backend}.`
        : `Failed to update ${validatedName}: ${this.extractErrorMessage(result)}`
    );
  }

  public async getPackageDetails(packageName: string, cwd?: string): Promise<PackageMetadata | undefined> {
    const validatedName = this.validatePackageName(packageName);
    const env = await this.envService.detectEnvironment(cwd);
    this.ensurePythonSupported(env);

    const config = this.envService.getConfig();
    const { executable, args } = this.buildShowCommand(env, validatedName);

    const result = await this.processRunner.run(executable, args, {
      cwd: env.workspaceRoot,
      timeoutMs: config.commandTimeoutMs,
    });

    if (result.exitCode !== 0 || !result.stdout.trim()) {
      return undefined;
    }

    return this.parseShowOutput(result.stdout);
  }

  public async createVirtualEnvironment(
    pythonSpec?: string,
    cwd?: string
  ): Promise<PackageOperationResult> {
    const env = await this.envService.detectEnvironment(cwd);
    if (!env.workspaceRoot) {
      throw new Error('Open a workspace folder in VS Code before creating a .venv virtual environment.');
    }

    const config = this.envService.getConfig();
    let executable: string;
    let args: string[];

    if (env.uvAvailable) {
      executable = env.uvPath ?? 'uv';
      args = ['venv', '.venv'];
      const chosenPython = pythonSpec?.trim() || env.pythonPath;
      if (chosenPython) {
        args.push('--python', chosenPython);
      }
    } else {
      this.ensurePythonSupported(env);
      executable = env.pythonPath ?? 'python';
      args = ['-m', 'venv', '.venv'];
    }

    const result = await this.processRunner.run(executable, args, {
      cwd: env.workspaceRoot,
      timeoutMs: config.commandTimeoutMs,
    });

    return this.toOperationResult(
      'create-venv',
      '.venv',
      env.backend,
      executable,
      args,
      result,
      result.exitCode === 0
        ? `Successfully created .venv in ${env.workspaceRoot}.`
        : `Failed to create .venv: ${this.extractErrorMessage(result)}`
    );
  }

  private buildListCommand(
    env: PythonEnvironmentInfo,
    outdated: boolean
  ): { executable: string; args: string[] } {
    if (env.backend === 'uv-project' || env.backend === 'uv-pip') {
      const args = ['pip', 'list', '--format', 'json'];
      if (outdated) {
        args.push('--outdated');
      }
      if (env.pythonPath) {
        args.push('--python', env.pythonPath);
      }
      return { executable: env.uvPath ?? 'uv', args };
    }

    const pythonExe = env.pythonPath ?? 'python';
    const args = ['-m', 'pip', 'list', '--format', 'json'];
    if (outdated) {
      args.push('--outdated');
    }
    return { executable: pythonExe, args };
  }

  private buildInstallCommand(
    env: PythonEnvironmentInfo,
    spec: string,
    request: PackageInstallRequest
  ): { executable: string; args: string[] } {
    if (env.backend === 'uv-project') {
      const args = ['add'];
      if (request.dev) {
        args.push('--dev');
      }
      if (request.upgrade) {
        args.push('--upgrade-package', this.validatePackageName(request.name));
      }
      args.push(spec);
      return { executable: env.uvPath ?? 'uv', args };
    }

    if (env.backend === 'uv-pip') {
      const args = ['pip', 'install'];
      if (request.upgrade) {
        args.push('--upgrade');
      }
      if (env.pythonPath) {
        args.push('--python', env.pythonPath);
      }
      args.push(spec);
      return { executable: env.uvPath ?? 'uv', args };
    }

    const pythonExe = env.pythonPath ?? 'python';
    const args = ['-m', 'pip', 'install'];
    if (request.upgrade) {
      args.push('--upgrade');
    }
    args.push(spec);
    return { executable: pythonExe, args };
  }

  private buildRemoveCommand(
    env: PythonEnvironmentInfo,
    packageName: string
  ): { executable: string; args: string[] } {
    if (env.backend === 'uv-project') {
      return { executable: env.uvPath ?? 'uv', args: ['remove', packageName] };
    }

    if (env.backend === 'uv-pip') {
      const args = ['pip', 'uninstall'];
      if (env.pythonPath) {
        args.push('--python', env.pythonPath);
      }
      args.push(packageName);
      return { executable: env.uvPath ?? 'uv', args };
    }

    const pythonExe = env.pythonPath ?? 'python';
    return { executable: pythonExe, args: ['-m', 'pip', 'uninstall', '-y', packageName] };
  }

  private buildUpdateCommand(
    env: PythonEnvironmentInfo,
    packageName: string,
    versionSpec?: string
  ): { executable: string; args: string[] } {
    const spec = versionSpec ? `${packageName}${versionSpec}` : packageName;

    if (env.backend === 'uv-project') {
      return {
        executable: env.uvPath ?? 'uv',
        args: ['add', '--upgrade-package', packageName, spec],
      };
    }

    if (env.backend === 'uv-pip') {
      const args = ['pip', 'install', '--upgrade'];
      if (env.pythonPath) {
        args.push('--python', env.pythonPath);
      }
      args.push(spec);
      return { executable: env.uvPath ?? 'uv', args };
    }

    const pythonExe = env.pythonPath ?? 'python';
    return { executable: pythonExe, args: ['-m', 'pip', 'install', '--upgrade', spec] };
  }

  private buildShowCommand(
    env: PythonEnvironmentInfo,
    packageName: string
  ): { executable: string; args: string[] } {
    if (env.backend === 'uv-project' || env.backend === 'uv-pip') {
      const args = ['pip', 'show', packageName];
      if (env.pythonPath) {
        args.push('--python', env.pythonPath);
      }
      return { executable: env.uvPath ?? 'uv', args };
    }

    return { executable: env.pythonPath ?? 'python', args: ['-m', 'pip', 'show', packageName] };
  }

  private validatePackageName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed || !VALID_PACKAGE_NAME_REGEX.test(trimmed)) {
      throw new Error(
        `Invalid Python package name "${name}". Expected PEP 508 identifier (letters, digits, '.', '_', '-').`
      );
    }
    return trimmed;
  }

  private normalizeTargetVersion(targetVersion: string): string {
    const trimmed = targetVersion.trim();
    if (!trimmed) {
      return '';
    }
    const spec = /^[=<>!~]/.test(trimmed) ? trimmed : `==${trimmed}`;
    if (!VALID_VERSION_SPEC_REGEX.test(spec)) {
      throw new Error(`Invalid PEP 440 version constraint: "${targetVersion}"`);
    }
    return spec;
  }

  private buildPackageSpec(name: string, extras?: string[], versionConstraint?: string): string {
    let spec = name;

    if (extras && extras.length > 0) {
      const cleanExtras = extras
        .map((ext) => ext.trim())
        .filter((ext) => ext.length > 0);
      for (const ext of cleanExtras) {
        if (!VALID_EXTRAS_REGEX.test(ext)) {
          throw new Error(`Invalid package extra "${ext}".`);
        }
      }
      if (cleanExtras.length > 0) {
        spec += `[${cleanExtras.join(',')}]`;
      }
    }

    if (versionConstraint && versionConstraint.trim().length > 0) {
      const normalized = this.normalizeTargetVersion(versionConstraint);
      spec += normalized;
    }

    return spec;
  }

  private ensurePythonSupported(env: PythonEnvironmentInfo): void {
    if (!env.pythonPath || !env.pythonVersion) {
      throw new Error(
        'No Python 3.10+ interpreter found. Configure "uvPkgManager.pythonPath" or create a .venv in the workspace.'
      );
    }
    if (!env.isPythonVersionSupported) {
      throw new Error(
        `Python ${env.pythonVersion.raw} is below the minimum supported version (3.10+).`
      );
    }
  }

  private normalizePackageName(name: string): string {
    return name.toLowerCase().replace(/[-_.]+/g, '-');
  }

  private parseJsonArray<T>(rawText: string, context: string): T[] {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array from ${context}.`);
      }
      return parsed as T[];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON returned by ${context}: ${msg}`);
    }
  }

  private parseShowOutput(stdout: string): PackageMetadata {
    const fields = new Map<string, string>();
    for (const line of stdout.split(/\r?\n/)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) {
        continue;
      }
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      fields.set(key, value);
    }

    const splitList = (raw?: string): string[] =>
      raw
        ? raw
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && item.toLowerCase() !== 'none')
        : [];

    return {
      name: fields.get('name') ?? '',
      version: fields.get('version') ?? '',
      summary: fields.get('summary') ?? '',
      homePage: fields.get('home-page') ?? '',
      author: fields.get('author') ?? '',
      license: fields.get('license') ?? '',
      location: fields.get('location') ?? '',
      requires: splitList(fields.get('requires')),
      requiredBy: splitList(fields.get('required-by')),
    };
  }

  private toOperationResult(
    operation: PackageOperationResult['operation'],
    packageName: string,
    backend: PackageManagerBackend,
    executable: string,
    args: string[],
    result: ProcessResult,
    message: string
  ): PackageOperationResult {
    return {
      success: result.exitCode === 0,
      operation,
      packageName,
      backend,
      command: `${executable} ${args.join(' ')}`,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      message,
    };
  }

  private extractErrorMessage(result: ProcessResult): string {
    if (result.timedOut) {
      return `Command timed out after ${result.durationMs}ms`;
    }
    if (result.cancelled) {
      return 'Operation cancelled';
    }
    return result.stderr.trim() || result.stdout.trim() || `Exit code ${result.exitCode}`;
  }
}
