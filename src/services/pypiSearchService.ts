import { PyPiPackageInfo } from '../types/package';
import { ILoggerService } from './loggerService';

export interface IPyPiSearchService {
  fetchPackageInfo(packageName: string, signal?: AbortSignal): Promise<PyPiPackageInfo | undefined>;
}

interface RawPyPiResponse {
  info?: {
    name?: string;
    version?: string;
    summary?: string;
    home_page?: string;
    project_urls?: Record<string, string>;
    author?: string;
    author_email?: string;
    license?: string;
    requires_python?: string;
  };
  releases?: Record<string, unknown[]>;
}

const PYPI_JSON_BASE_URL = 'https://pypi.org/pypi';

/**
 * Fetches package metadata and available release versions from PyPI JSON API.
 */
export class PyPiSearchService implements IPyPiSearchService {
  public constructor(private readonly logger: ILoggerService) {}

  public async fetchPackageInfo(
    packageName: string,
    signal?: AbortSignal
  ): Promise<PyPiPackageInfo | undefined> {
    const sanitized = packageName.trim();
    if (!sanitized || !/^[A-Za-z0-9._-]+$/.test(sanitized)) {
      throw new Error(`Invalid PyPI package name: "${packageName}"`);
    }

    const url = `${PYPI_JSON_BASE_URL}/${encodeURIComponent(sanitized)}/json`;
    this.logger.debug(`Fetching PyPI metadata from ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'vsc-uv-package-manager/1.0.0',
      },
      signal,
    });

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      throw new Error(`PyPI request failed with HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as RawPyPiResponse;
    const info = data.info;
    if (!info || !info.name || !info.version) {
      return undefined;
    }

    const availableVersions = Object.entries(data.releases ?? {})
      .filter(([, files]) => Array.isArray(files) && files.length > 0)
      .map(([ver]) => ver)
      .reverse()
      .slice(0, 25);

    const projectUrls = info.project_urls ?? {};
    const homePage =
      info.home_page ||
      projectUrls.Homepage ||
      projectUrls.homepage ||
      projectUrls.Repository ||
      '';

    return {
      name: info.name,
      version: info.version,
      summary: info.summary ?? '',
      homePage,
      author: info.author || info.author_email || '',
      license: info.license ?? '',
      requiresPython: info.requires_python ?? '',
      availableVersions,
    };
  }
}
