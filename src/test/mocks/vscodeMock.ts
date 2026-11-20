import Module from 'node:module';
import * as path from 'node:path';
import type * as vscode from 'vscode';

export class MockEventEmitter<T> {
  private readonly listeners = new Set<(e: T) => unknown>();

  public readonly event = (listener: (e: T) => unknown): { dispose: () => void } => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  public fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  public dispose(): void {
    this.listeners.clear();
  }
}

export class MockTreeItem {
  public description?: string;
  public tooltip?: string;
  public contextValue?: string;
  public iconPath?: unknown;

  public constructor(
    public label: string,
    public collapsibleState: number = 0
  ) {}
}

export class MockThemeIcon {
  public constructor(public readonly id: string) {}
}

export class MockUri {
  public readonly scheme = 'file';

  private constructor(public readonly fsPath: string) {}

  public static file(fsPath: string): MockUri {
    return new MockUri(fsPath);
  }

  public static joinPath(base: MockUri, ...segments: string[]): MockUri {
    return new MockUri(path.join(base.fsPath, ...segments));
  }

  public toString(): string {
    return `file://${this.fsPath.replace(/\\/g, '/')}`;
  }
}

export interface MockVscodeState {
  commands: Map<string, (...args: unknown[]) => unknown>;
  treeProviders: Map<string, unknown>;
  infoMessages: string[];
  errorMessages: string[];
  warningMessages: string[];
  outputLines: string[];
  configValues: Map<string, unknown>;
  workspaceFolders: Array<{ uri: MockUri; name: string; index: number }>;
  inputBoxQueue: Array<string | undefined>;
  quickPickQueue: Array<unknown>;
  lastStatusBarItem?: { text: string; tooltip?: string; command?: string; shown: boolean };
}

const mockState: MockVscodeState = {
  commands: new Map(),
  treeProviders: new Map(),
  infoMessages: [],
  errorMessages: [],
  warningMessages: [],
  outputLines: [],
  configValues: new Map<string, unknown>([
    ['uvPkgManager.preferUv', true],
    ['uvPkgManager.uvPath', 'uv'],
    ['uvPkgManager.pythonPath', ''],
    ['uvPkgManager.checkOutdated', true],
    ['uvPkgManager.commandTimeoutMs', 120_000],
  ]),
  workspaceFolders: [],
  inputBoxQueue: [],
  quickPickQueue: [],
};

const configEmitter = new MockEventEmitter<{ affectsConfiguration: (section: string) => boolean }>();

export const vscodeMock = {
  EventEmitter: MockEventEmitter,
  TreeItem: MockTreeItem,
  ThemeIcon: MockThemeIcon,
  Uri: MockUri,
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  ProgressLocation: {
    SourceControl: 1,
    Window: 10,
    Notification: 15,
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  ViewColumn: {
    One: 1,
    Two: 2,
  },
  window: {
    activeTextEditor: undefined,
    createOutputChannel: (_name: string) => ({
      appendLine: (line: string) => {
        mockState.outputLines.push(line);
      },
      show: () => undefined,
      dispose: () => undefined,
    }),
    createStatusBarItem: (_alignment: number, _priority?: number) => {
      const item = {
        text: '',
        tooltip: '',
        command: '',
        shown: false,
        show() {
          item.shown = true;
        },
        hide() {
          item.shown = false;
        },
        dispose() {
          item.shown = false;
        },
      };
      mockState.lastStatusBarItem = item;
      return item;
    },
    registerTreeDataProvider: (viewId: string, provider: unknown) => {
      mockState.treeProviders.set(viewId, provider);
      return {
        dispose: () => {
          mockState.treeProviders.delete(viewId);
        },
      };
    },
    showInformationMessage: async (message: string) => {
      mockState.infoMessages.push(message);
      return undefined;
    },
    showWarningMessage: async (message: string) => {
      mockState.warningMessages.push(message);
      return undefined;
    },
    showErrorMessage: async (message: string) => {
      mockState.errorMessages.push(message);
      return undefined;
    },
    showInputBox: async () => mockState.inputBoxQueue.shift(),
    showQuickPick: async () => mockState.quickPickQueue.shift(),
    showOpenDialog: async () => undefined,
    withProgress: async <T>(
      _options: unknown,
      task: (progress: unknown, token: unknown) => Promise<T>
    ): Promise<T> => task({ report: () => undefined }, { isCancellationRequested: false }),
    createWebviewPanel: (
      _viewType: string,
      _title: string,
      _showOptions: unknown,
      _options?: unknown
    ) => {
      const disposeEmitter = new MockEventEmitter<void>();
      const messageEmitter = new MockEventEmitter<unknown>();
      return {
        webview: {
          html: '',
          cspSource: 'vscode-webview://mock',
          asWebviewUri: (uri: MockUri) => uri,
          postMessage: async () => true,
          onDidReceiveMessage: messageEmitter.event,
        },
        onDidDispose: disposeEmitter.event,
        reveal: () => undefined,
        dispose: () => {
          disposeEmitter.fire();
          disposeEmitter.dispose();
          messageEmitter.dispose();
        },
      };
    },
  },
  workspace: {
    get workspaceFolders() {
      return mockState.workspaceFolders;
    },
    getConfiguration: (section = '') => ({
      get: <T>(key: string, defaultValue?: T): T => {
        const fullKey = section ? `${section}.${key}` : key;
        return mockState.configValues.has(fullKey)
          ? (mockState.configValues.get(fullKey) as T)
          : (defaultValue as T);
      },
      update: async (key: string, value: unknown) => {
        const fullKey = section ? `${section}.${key}` : key;
        mockState.configValues.set(fullKey, value);
        configEmitter.fire({
          affectsConfiguration: (s: string) => fullKey.startsWith(s),
        });
      },
    }),
    createFileSystemWatcher: () => {
      const changeEmitter = new MockEventEmitter<MockUri>();
      const createEmitter = new MockEventEmitter<MockUri>();
      const deleteEmitter = new MockEventEmitter<MockUri>();
      return {
        onDidChange: changeEmitter.event,
        onDidCreate: createEmitter.event,
        onDidDelete: deleteEmitter.event,
        dispose: () => {
          changeEmitter.dispose();
          createEmitter.dispose();
          deleteEmitter.dispose();
        },
      };
    },
    onDidChangeConfiguration: configEmitter.event,
  },
  commands: {
    registerCommand: (command: string, callback: (...args: unknown[]) => unknown) => {
      mockState.commands.set(command, callback);
      return {
        dispose: () => {
          mockState.commands.delete(command);
        },
      };
    },
    executeCommand: async <T>(command: string, ...args: unknown[]): Promise<T> => {
      const handler = mockState.commands.get(command);
      if (!handler) {
        throw new Error(`Command not registered in mock: ${command}`);
      }
      return (await handler(...args)) as T;
    },
  },
};

let hookInstalled = false;

/**
 * Hooks Node's module loader so `import * as vscode from 'vscode'` resolves
 * to `vscodeMock` during headless unit and integration tests.
 */
export function installVscodeMock(): void {
  if (hookInstalled) {
    return;
  }
  hookInstalled = true;

  const moduleAny = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleAny._load;
  moduleAny._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === 'vscode') {
      return vscodeMock;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}

export function getVscodeMockState(): MockVscodeState {
  return mockState;
}

export function resetVscodeMock(workspaceRoot?: string): void {
  mockState.commands.clear();
  mockState.treeProviders.clear();
  mockState.infoMessages.length = 0;
  mockState.errorMessages.length = 0;
  mockState.warningMessages.length = 0;
  mockState.outputLines.length = 0;
  mockState.inputBoxQueue.length = 0;
  mockState.quickPickQueue.length = 0;
  mockState.lastStatusBarItem = undefined;
  mockState.configValues.set('uvPkgManager.preferUv', true);
  mockState.configValues.set('uvPkgManager.uvPath', 'uv');
  mockState.configValues.set('uvPkgManager.pythonPath', '');
  mockState.configValues.set('uvPkgManager.checkOutdated', true);
  mockState.configValues.set('uvPkgManager.commandTimeoutMs', 120_000);
  mockState.workspaceFolders = workspaceRoot
    ? [{ uri: MockUri.file(workspaceRoot), name: path.basename(workspaceRoot), index: 0 }]
    : [];
}

export function createMockExtensionContext(extensionPath = process.cwd()): vscode.ExtensionContext {
  const subscriptions: Array<{ dispose: () => unknown }> = [];
  return {
    subscriptions,
    extensionUri: MockUri.file(extensionPath) as unknown as vscode.Uri,
    extensionPath,
  } as unknown as vscode.ExtensionContext;
}
