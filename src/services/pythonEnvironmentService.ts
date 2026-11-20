import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  PackageManagerBackend,
  PythonEnvironmentInfo,
  PythonVersionInfo,
} from '../types/package';
import { ILoggerService } from './loggerService';
import { IProcessRunner } from './processRunner';

export interface ExtensionConfiguration {
  preferUv: boolean;
  uvPath: string;
  pythonPath: string;
  checkOutdated: boolean;
  commandTimeoutMs: number;
}

export interface IConfigProvider {
  getConfig(): ExtensionConfiguration;
}

export class VsCodeConfigProvider implements IConfigProvider {
  public getConfig(): ExtensionConfiguration {
    const cfg = vscode.workspace.getConfiguration('uvPkgManager');
    return {
      preferUv: cfg.get<boolean>('preferUv', true),
      uvPath: cfg.get<string>('uvPath', 'uv').trim() || 'uv',
      pythonPath: cfg.get<string>('pythonPath', '').trim(),
      checkOutdated: cfg.get<boolean>('checkOutdated', true),
      commandTimeoutMs: cfg.get<number>('commandTimeoutMs', 120_000),
    };
  }
}

export interface IPythonEnvironmentService {
  detectEnvironment(explicitCwd?: string): Promise<PythonEnvironmentInfo>;
  validatePythonVersion(versionText: string): { supported: boolean; parsed?: PythonVersionInfo };
  getEffectiveWorkspaceRoot(explicitCwd?: string): string | undefined;
  getConfig(): ExtensionConfiguration;
}

const MINIMUM_PYTHON_MAJOR = 3;
const MINIMUM_PYTHON_MINOR = 10;

/**
 * Discovers the active workspace Python 3.10+ interpreter, virtual environment,
 * project files (pyproject.toml / uv.lock / requirements.txt), and uv CLI availability.
 */
export class PythonEnvironmentService implements IPythonEnvironmentService {
  public constructor(
    private readonly processRunner: IProcessRunner,
    private readonly logger: ILoggerService,
    private readonly configProvider: IConfigProvider = new VsCodeConfigProvider()
  ) {}

  public getConfig(): ExtensionConfiguration {
    return this.configProvider.getConfig();
  }

  public getEffectiveWorkspaceRoot(explicitCwd?: string): string | undefined {
    if (explicitCwd && explicitCwd.trim().length > 0) {
      return explicitCwd;
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].uri.fsPath;
    }
    return undefined;
  }

  public validatePythonVersion(versionText: string): { supported: boolean; parsed?: PythonVersionInfo } {
    const match = versionText.match(/Python\s+(\d+)\.(\d+)\.(\d+)/i) ?? versionText.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
      return { supported: false };
    }

    const major = Number.parseInt(match[1], 10);
    const minor = Number.parseInt(match[2], 10);
    const patch = Number.parseInt(match[3], 10);

    const supported =
      major > MINIMUM_PYTHON_MAJOR ||
      (major === MINIMUM_PYTHON_MAJOR && minor >= MINIMUM_PYTHON_MINOR);

    return {
      supported,
      parsed: {
        major,
        minor,
        patch,
        raw: `${major}.${minor}.${patch}`,
      },
    };
  }

  public async detectEnvironment(explicitCwd?: string): Promise<PythonEnvironmentInfo> {
    const config = this.getConfig();
    const workspaceRoot = this.getEffectiveWorkspaceRoot(explicitCwd);

    const hasPyprojectToml = workspaceRoot ? this.fileExists(path.join(workspaceRoot, 'pyproject.toml')) : false;
    const hasUvLock = workspaceRoot ? this.fileExists(path.join(workspaceRoot, 'uv.lock')) : false;
    const hasRequirementsTxt = workspaceRoot ? this.fileExists(path.join(workspaceRoot, 'requirements.txt')) : false;

    const virtualEnvPath = this.detectVirtualEnvPath(workspaceRoot);
    const uvCheck = config.preferUv ? await this.detectUv(config.uvPath, workspaceRoot) : { available: false };

    const pythonResolution = await this.detectPythonInterpreter(
      config.pythonPath,
      virtualEnvPath,
      uvCheck.available ? config.uvPath : undefined,
      workspaceRoot
    );

    let backend: PackageManagerBackend = 'pip';
    if (config.preferUv && uvCheck.available) {
      backend = hasPyprojectToml ? 'uv-project' : 'uv-pip';
    }

    const envInfo: PythonEnvironmentInfo = {
      workspaceRoot,
      pythonPath: pythonResolution.pythonPath,
      pythonVersion: pythonResolution.versionInfo,
      isPythonVersionSupported: pythonResolution.supported,
      uvAvailable: uvCheck.available,
      uvPath: uvCheck.available ? config.uvPath : undefined,
      uvVersion: uvCheck.version,
      backend,
      virtualEnvPath,
      hasPyprojectToml,
      hasUvLock,
      hasRequirementsTxt,
    };

    this.logger.info(
      `Environment detected: backend=${envInfo.backend}, python=${envInfo.pythonVersion?.raw ?? 'none'}, uv=${envInfo.uvVersion ?? 'unavailable'}`
    );

    return envInfo;
  }

  private async detectUv(
    uvExecutable: string,
    workspaceRoot?: string
  ): Promise<{ available: boolean; version?: string }> {
    const result = await this.processRunner.run(uvExecutable, ['--version'], {
      cwd: workspaceRoot,
      timeoutMs: 10_000,
    });

    if (result.exitCode !== 0) {
      this.logger.debug(`uv binary check failed (${uvExecutable}): ${result.stderr}`);
      return { available: false };
    }

    const match = result.stdout.trim().match(/^uv\s+([^\s]+)/i);
    return {
      available: true,
      version: match ? match[1] : result.stdout.trim(),
    };
  }

  private async detectPythonInterpreter(
    configuredPythonPath: string,
    virtualEnvPath: string | undefined,
    uvExecutable: string | undefined,
    workspaceRoot: string | undefined
  ): Promise<{ pythonPath?: string; versionInfo?: PythonVersionInfo; supported: boolean }> {
    const candidates: string[] = [];

    if (configuredPythonPath) {
      candidates.push(configuredPythonPath);
    }

    if (virtualEnvPath) {
      const venvPython = this.getVenvPythonBinary(virtualEnvPath);
      if (this.fileExists(venvPython)) {
        candidates.push(venvPython);
      }
    }

    if (uvExecutable) {
      const uvFindResult = await this.processRunner.run(uvExecutable, ['python', 'find'], {
        cwd: workspaceRoot,
        timeoutMs: 10_000,
      });
      if (uvFindResult.exitCode === 0) {
        const foundPath = uvFindResult.stdout.trim().split(/\r?\n/)[0]?.trim();
        if (foundPath) {
          candidates.push(foundPath);
        }
      }
    }

    if (process.platform === 'win32') {
      candidates.push('python', 'python3');
    } else {
      candidates.push('python3', 'python');
    }

    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);

      const versionResult = await this.processRunner.run(candidate, ['--version'], {
        cwd: workspaceRoot,
        timeoutMs: 10_000,
      });

      if (versionResult.exitCode !== 0) {
        continue;
      }

      const combined = `${versionResult.stdout} ${versionResult.stderr}`.trim();
      const parsed = this.validatePythonVersion(combined);
      if (parsed.parsed) {
        return {
          pythonPath: candidate,
          versionInfo: parsed.parsed,
          supported: parsed.supported,
        };
      }
    }

    return { supported: false };
  }

  private detectVirtualEnvPath(workspaceRoot: string | undefined): string | undefined {
    if (workspaceRoot) {
      for (const folderName of ['.venv', 'venv', '.env']) {
        const candidateDir = path.join(workspaceRoot, folderName);
        if (this.fileExists(this.getVenvPythonBinary(candidateDir))) {
          return candidateDir;
        }
      }
    }

    const envVenv = process.env.VIRTUAL_ENV;
    if (envVenv && this.fileExists(this.getVenvPythonBinary(envVenv))) {
      return envVenv;
    }

    return undefined;
  }

  private getVenvPythonBinary(venvPath: string): string {
    if (process.platform === 'win32') {
      return path.join(venvPath, 'Scripts', 'python.exe');
    }
    return path.join(venvPath, 'bin', 'python');
  }

  private fileExists(targetPath: string): boolean {
    try {
      return fs.existsSync(targetPath);
    } catch {
      return false;
    }
  }
}
