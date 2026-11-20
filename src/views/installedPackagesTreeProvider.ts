import * as vscode from 'vscode';
import { ILoggerService } from '../services/loggerService';
import { IPackageManagerService } from '../services/packageManagerService';
import { InstalledPackage } from '../types/package';

export type PackageNodeKind = 'package' | 'detail' | 'message';

export class PackageTreeItem extends vscode.TreeItem {
  public constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly kind: PackageNodeKind,
    public readonly pkg?: InstalledPackage
  ) {
    super(label, collapsibleState);
  }
}

/**
 * TreeDataProvider displaying installed Python packages with outdated indicators
 * and lazy-loaded package metadata children.
 */
export class InstalledPackagesTreeProvider
  implements vscode.TreeDataProvider<PackageTreeItem>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    PackageTreeItem | undefined | null | void
  >();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private cachedPackages: InstalledPackage[] = [];
  private loadedOnce = false;
  private lastError: string | undefined;

  public constructor(
    private readonly packageManagerService: IPackageManagerService,
    private readonly logger: ILoggerService
  ) {}

  public getTreeItem(element: PackageTreeItem): vscode.TreeItem {
    return element;
  }

  public getCachedPackages(): InstalledPackage[] {
    return [...this.cachedPackages];
  }

  public async refresh(): Promise<InstalledPackage[]> {
    try {
      this.lastError = undefined;
      this.cachedPackages = await this.packageManagerService.listPackages();
      this.loadedOnce = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.lastError = msg;
      this.cachedPackages = [];
      this.loadedOnce = true;
      this.logger.error('Failed to refresh installed packages tree view', error);
    }
    this.onDidChangeTreeDataEmitter.fire();
    return this.getCachedPackages();
  }

  public async getChildren(element?: PackageTreeItem): Promise<PackageTreeItem[]> {
    if (!element) {
      if (!this.loadedOnce) {
        await this.refresh();
      }

      if (this.lastError) {
        const errorItem = new PackageTreeItem(
          'Environment Error',
          vscode.TreeItemCollapsibleState.None,
          'message'
        );
        errorItem.description = this.lastError;
        errorItem.iconPath = new vscode.ThemeIcon('warning');
        return [errorItem];
      }

      if (this.cachedPackages.length === 0) {
        const emptyItem = new PackageTreeItem(
          'No packages installed',
          vscode.TreeItemCollapsibleState.None,
          'message'
        );
        emptyItem.description = 'Click + to install a package';
        emptyItem.iconPath = new vscode.ThemeIcon('info');
        return [emptyItem];
      }

      return this.cachedPackages.map((pkg) => this.createPackageItem(pkg));
    }

    if (element.kind === 'package' && element.pkg) {
      return this.loadPackageDetails(element.pkg);
    }

    return [];
  }

  public dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  private createPackageItem(pkg: InstalledPackage): PackageTreeItem {
    const item = new PackageTreeItem(
      pkg.name,
      vscode.TreeItemCollapsibleState.Collapsed,
      'package',
      pkg
    );

    if (pkg.isOutdated && pkg.latestVersion) {
      item.description = `${pkg.version} → ${pkg.latestVersion}`;
      item.tooltip = `${pkg.name} ${pkg.version} (Update available: ${pkg.latestVersion})`;
      item.contextValue = 'outdatedPackage';
      item.iconPath = new vscode.ThemeIcon('arrow-up');
    } else {
      item.description = pkg.version;
      item.tooltip = `${pkg.name} ${pkg.version}`;
      item.contextValue = 'installedPackage';
      item.iconPath = new vscode.ThemeIcon('package');
    }

    return item;
  }

  private async loadPackageDetails(pkg: InstalledPackage): Promise<PackageTreeItem[]> {
    const items: PackageTreeItem[] = [];
    try {
      const details = await this.packageManagerService.getPackageDetails(pkg.name);
      items.push(this.createDetailItem('Version', details?.version || pkg.version, 'tag'));
      if (pkg.isOutdated && pkg.latestVersion) {
        items.push(this.createDetailItem('Latest', pkg.latestVersion, 'cloud-download'));
      }
      if (details?.summary) {
        items.push(this.createDetailItem('Summary', details.summary, 'note'));
      }
      if (details?.license) {
        items.push(this.createDetailItem('License', details.license, 'law'));
      }
      if (details?.author) {
        items.push(this.createDetailItem('Author', details.author, 'person'));
      }
      items.push(
        this.createDetailItem(
          'Requires',
          details && details.requires.length > 0 ? details.requires.join(', ') : 'None',
          'references'
        )
      );
      if (details?.location) {
        items.push(this.createDetailItem('Location', details.location, 'folder'));
      }
    } catch (error) {
      this.logger.warn(`Unable to load metadata for ${pkg.name}`, error);
      items.push(this.createDetailItem('Version', pkg.version, 'tag'));
    }
    return items;
  }

  private createDetailItem(key: string, value: string, iconName: string): PackageTreeItem {
    const item = new PackageTreeItem(
      `${key}:`,
      vscode.TreeItemCollapsibleState.None,
      'detail'
    );
    item.description = value;
    item.tooltip = `${key}: ${value}`;
    item.iconPath = new vscode.ThemeIcon(iconName);
    return item;
  }
}
