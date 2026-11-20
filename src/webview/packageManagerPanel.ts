import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { ILoggerService } from '../services/loggerService';
import { IPackageManagerService } from '../services/packageManagerService';
import { IPyPiSearchService } from '../services/pypiSearchService';
import { IPythonEnvironmentService } from '../services/pythonEnvironmentService';
import {
  PackageInstallRequest,
  WebViewInboundMessage,
  WebViewOutboundMessage,
} from '../types/package';

export interface PackageManagerPanelDependencies {
  extensionUri: vscode.Uri;
  envService: IPythonEnvironmentService;
  packageManagerService: IPackageManagerService;
  pypiSearchService: IPyPiSearchService;
  logger: ILoggerService;
  onPackagesChanged: () => Promise<void>;
  onSelectPythonPath: () => Promise<void>;
}

/**
 * Manages the interactive WebView panel for inspecting, installing,
 * updating, and removing Python packages via uv/pip.
 */
export class PackageManagerPanel implements vscode.Disposable {
  public static readonly viewType = 'uvPkgManager.panel';
  private static currentPanel: PackageManagerPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private busy = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly deps: PackageManagerPanelDependencies
  ) {
    this.panel = panel;
    this.panel.webview.html = this.buildHtml(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebViewInboundMessage) => {
        void this.handleMessage(message);
      },
      null,
      this.disposables
    );
  }

  public static createOrShow(deps: PackageManagerPanelDependencies): PackageManagerPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (PackageManagerPanel.currentPanel) {
      PackageManagerPanel.currentPanel.panel.reveal(column);
      void PackageManagerPanel.currentPanel.syncState();
      return PackageManagerPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      PackageManagerPanel.viewType,
      'UV Python Package Manager',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(deps.extensionUri, 'media')],
      }
    );

    PackageManagerPanel.currentPanel = new PackageManagerPanel(panel, deps);
    return PackageManagerPanel.currentPanel;
  }

  public async syncState(): Promise<void> {
    try {
      const [environment, packages] = await Promise.all([
        this.deps.envService.detectEnvironment(),
        this.deps.packageManagerService.listPackages().catch((err) => {
          this.deps.logger.warn('Package listing failed during WebView sync', err);
          return [];
        }),
      ]);

      await this.postMessage({
        type: 'state',
        payload: {
          environment,
          packages,
          busy: this.busy,
        },
      });
    } catch (error) {
      await this.postError(error);
    }
  }

  public dispose(): void {
    PackageManagerPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private async handleMessage(message: WebViewInboundMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
      case 'listPackages': {
        await this.withBusy(() => this.syncState());
        break;
      }
      case 'installPackage': {
        await this.executeInstall(message.payload);
        break;
      }
      case 'removePackage': {
        await this.executeRemove(message.payload.name);
        break;
      }
      case 'updatePackage': {
        await this.executeUpdate(message.payload.name, message.payload.targetVersion);
        break;
      }
      case 'inspectPackage': {
        try {
          const details = await this.deps.packageManagerService.getPackageDetails(
            message.payload.name
          );
          await this.postMessage({
            type: 'packageDetails',
            payload: { name: message.payload.name, details },
          });
        } catch (error) {
          await this.postError(error);
        }
        break;
      }
      case 'lookupPyPi': {
        try {
          const info = await this.deps.pypiSearchService.fetchPackageInfo(message.payload.name);
          await this.postMessage({
            type: 'pypiResult',
            payload: { query: message.payload.name, info },
          });
        } catch (error) {
          await this.postMessage({
            type: 'pypiResult',
            payload: {
              query: message.payload.name,
              info: undefined,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
        break;
      }
      case 'selectPythonPath': {
        await this.deps.onSelectPythonPath();
        await this.syncState();
        break;
      }
      case 'createVirtualEnv': {
        await this.executeCreateVirtualEnv();
        break;
      }
    }
  }

  private async executeInstall(request: PackageInstallRequest): Promise<void> {
    await this.withBusy(async () => {
      const result = await this.deps.packageManagerService.installPackage(request);
      await this.postMessage({ type: 'operationResult', payload: result });
      await this.deps.onPackagesChanged();
      await this.syncState();
    });
  }

  private async executeRemove(packageName: string): Promise<void> {
    await this.withBusy(async () => {
      const result = await this.deps.packageManagerService.removePackage(packageName);
      await this.postMessage({ type: 'operationResult', payload: result });
      await this.deps.onPackagesChanged();
      await this.syncState();
    });
  }

  private async executeUpdate(packageName: string, targetVersion?: string): Promise<void> {
    await this.withBusy(async () => {
      const result = await this.deps.packageManagerService.updatePackage(packageName, targetVersion);
      await this.postMessage({ type: 'operationResult', payload: result });
      await this.deps.onPackagesChanged();
      await this.syncState();
    });
  }

  private async executeCreateVirtualEnv(): Promise<void> {
    await this.withBusy(async () => {
      const result = await this.deps.packageManagerService.createVirtualEnvironment();
      await this.postMessage({ type: 'operationResult', payload: result });
      await this.deps.onPackagesChanged();
      await this.syncState();
    });
  }

  private async withBusy(work: () => Promise<void>): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      await work();
    } catch (error) {
      await this.postError(error);
    } finally {
      this.busy = false;
      await this.syncState();
    }
  }

  private async postError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.deps.logger.error('WebView error', error);
    await this.postMessage({ type: 'error', payload: { message } });
  }

  private async postMessage(message: WebViewOutboundMessage): Promise<void> {
    await this.panel.webview.postMessage(message);
  }

  private buildHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'media', 'webview.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.deps.extensionUri, 'media', 'webview.js')
    );
    const nonce = crypto.randomBytes(16).toString('base64');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
  />
  <title>UV Python Package Manager</title>
  <link href="${styleUri.toString()}" rel="stylesheet" />
</head>
<body>
  <header class="header">
    <div>
      <h1>UV Python Package Manager</h1>
      <p id="envSummary" class="subtitle">Detecting Python 3.10+ environment...</p>
    </div>
    <div class="header-actions">
      <button id="createVenvBtn" class="btn btn-secondary" type="button">Create .venv</button>
      <button id="selectPythonBtn" class="btn btn-secondary" type="button">Select Python</button>
      <button id="refreshBtn" class="btn btn-primary" type="button">Refresh Packages</button>
    </div>
  </header>

  <section class="card install-card">
    <h2>Install or Lookup Package</h2>
    <form id="installForm" class="install-form">
      <input id="pkgNameInput" type="text" placeholder="Package name (e.g. httpx, pydantic, ruff)" required />
      <input id="pkgVersionInput" type="text" placeholder="Constraint (e.g. >=0.27.0)" />
      <label class="checkbox-label">
        <input id="pkgDevCheckbox" type="checkbox" />
        <span>Dev dependency</span>
      </label>
      <button id="lookupBtn" class="btn btn-secondary" type="button">Lookup PyPI</button>
      <button id="installBtn" class="btn btn-primary" type="submit">Install</button>
    </form>
    <div id="pypiPreview" class="pypi-preview hidden"></div>
  </section>

  <section class="card">
    <div class="toolbar">
      <h2>Installed Packages (<span id="packageCount">0</span>)</h2>
      <div class="toolbar-controls">
        <input id="filterInput" type="search" placeholder="Filter installed packages..." />
        <label class="checkbox-label">
          <input id="outdatedOnlyCheckbox" type="checkbox" />
          <span>Outdated only</span>
        </label>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Package</th>
            <th>Version</th>
            <th>Latest</th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody id="packagesTableBody"></tbody>
      </table>
    </div>
  </section>

  <section id="detailsCard" class="card hidden">
    <div class="toolbar">
      <h2 id="detailsTitle">Package Details</h2>
      <button id="closeDetailsBtn" class="btn btn-secondary" type="button">Close</button>
    </div>
    <dl id="detailsGrid" class="details-grid"></dl>
  </section>

  <section class="card">
    <h2>Activity Log</h2>
    <pre id="activityLog" class="activity-log"></pre>
  </section>

  <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
  }
}
