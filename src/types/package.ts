export type PackageManagerBackend = 'uv-project' | 'uv-pip' | 'pip';

export interface InstalledPackage {
  name: string;
  version: string;
  latestVersion?: string;
  isOutdated?: boolean;
  isEditable?: boolean;
  location?: string;
}

export interface OutdatedPackage {
  name: string;
  version: string;
  latestVersion: string;
  latestFileType?: string;
}

export interface PackageMetadata {
  name: string;
  version: string;
  summary: string;
  homePage: string;
  author: string;
  license: string;
  location: string;
  requires: string[];
  requiredBy: string[];
}

export interface PackageInstallRequest {
  name: string;
  versionConstraint?: string;
  extras?: string[];
  dev?: boolean;
  upgrade?: boolean;
}

export interface PackageOperationResult {
  success: boolean;
  operation: 'list' | 'install' | 'remove' | 'update' | 'create-venv';
  packageName: string;
  backend: PackageManagerBackend;
  command: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  message: string;
}

export interface PythonVersionInfo {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

export interface PythonEnvironmentInfo {
  workspaceRoot: string | undefined;
  pythonPath: string | undefined;
  pythonVersion: PythonVersionInfo | undefined;
  isPythonVersionSupported: boolean;
  uvAvailable: boolean;
  uvPath: string | undefined;
  uvVersion: string | undefined;
  backend: PackageManagerBackend;
  virtualEnvPath: string | undefined;
  hasPyprojectToml: boolean;
  hasUvLock: boolean;
  hasRequirementsTxt: boolean;
}

export interface PyPiPackageInfo {
  name: string;
  version: string;
  summary: string;
  homePage: string;
  author: string;
  license: string;
  requiresPython: string;
  availableVersions: string[];
}

export type WebViewInboundMessage =
  | { type: 'ready' }
  | { type: 'listPackages'; checkOutdated?: boolean }
  | { type: 'installPackage'; payload: PackageInstallRequest }
  | { type: 'removePackage'; payload: { name: string } }
  | { type: 'updatePackage'; payload: { name: string; targetVersion?: string } }
  | { type: 'inspectPackage'; payload: { name: string } }
  | { type: 'lookupPyPi'; payload: { name: string } }
  | { type: 'selectPythonPath' }
  | { type: 'createVirtualEnv' };

export type WebViewOutboundMessage =
  | { type: 'state'; payload: { environment: PythonEnvironmentInfo; packages: InstalledPackage[]; busy: boolean } }
  | { type: 'operationResult'; payload: PackageOperationResult }
  | { type: 'packageDetails'; payload: { name: string; details: PackageMetadata | undefined } }
  | { type: 'pypiResult'; payload: { query: string; info: PyPiPackageInfo | undefined; error?: string } }
  | { type: 'error'; payload: { message: string } };
