import { createToken } from '../di/container';
import type { ILoggerService } from '../services/loggerService';
import type { IPackageManagerService } from '../services/packageManagerService';
import type { IProcessRunner } from '../services/processRunner';
import type { IPyPiSearchService } from '../services/pypiSearchService';
import type { IConfigProvider, IPythonEnvironmentService } from '../services/pythonEnvironmentService';
import type { EnvironmentTreeProvider } from '../views/environmentTreeProvider';
import type { InstalledPackagesTreeProvider } from '../views/installedPackagesTreeProvider';

/**
 * Typed service tokens used throughout the extension's IoC container.
 */
export const TOKENS = {
  Logger: createToken<ILoggerService>('ILoggerService'),
  ConfigProvider: createToken<IConfigProvider>('IConfigProvider'),
  ProcessRunner: createToken<IProcessRunner>('IProcessRunner'),
  PythonEnvService: createToken<IPythonEnvironmentService>('IPythonEnvironmentService'),
  PackageManagerService: createToken<IPackageManagerService>('IPackageManagerService'),
  PyPiSearchService: createToken<IPyPiSearchService>('IPyPiSearchService'),
  InstalledTreeProvider: createToken<InstalledPackagesTreeProvider>('InstalledPackagesTreeProvider'),
  EnvTreeProvider: createToken<EnvironmentTreeProvider>('EnvironmentTreeProvider'),
} as const;
