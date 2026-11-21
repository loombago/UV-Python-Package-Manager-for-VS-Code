# Technical Documentation — Loombago UV Python Package Manager (`v1.6.0`)

- **Extension ID:** `loombago.vsc-uv-package-manager`
- **Version:** `1.6.0`
- **VS Code Engine:** `^1.95.0`
- **Required Python:** `3.10+`
- **Preferred Package Manager:** `uv` (with automatic `pip` fallback)
- **Repository:** https://github.com/loombago/UV-Python-Package-Manager-for-VS-Code
- **Author Contact:** wesmarand@gmail.com
- **License:** MIT

---

## 1. System Architecture & Module Map

The extension is built around a layered architecture powered by **Dependency Injection (IoC)**, decoupling domain logic from the VS Code API and enabling deterministic headless unit and integration testing without launching an Electron GUI instance.

```text
vsc-uv-package-manager/
├── package.json                          # VS Code extension manifest (commands, views, menus, settings)
├── tsconfig.json                         # TypeScript compiler configuration (ES2022, CommonJS, strict)
├── esbuild.js                            # Primary production bundler (dist/extension.js)
├── webpack.config.js                     # Alternative Webpack 5 production configuration
├── .vscodeignore                         # VSIX packaging exclusion rules
├── media/
│   ├── icon.png                          # Monochrome extension icon (256x256 PNG)
│   ├── icon.svg                          # Activity Bar vector icon (Codicon style)
│   ├── webview.css                       # Theme-aware WebView stylesheet using VS Code CSS variables
│   └── webview.js                        # CSP-compliant WebView frontend logic
└── src/
    ├── extension.ts                      # Entrypoint: activate(), deactivate(), bootstrapContainer(), and public API
    ├── types/
    │   └── package.ts                    # Domain contracts and typed WebView message protocol
    ├── di/
    │   ├── container.ts                  # IoC container (ServiceContainer: singleton, transient, child scopes)
    │   └── tokens.ts                     # Strongly-typed service identifiers (ServiceToken<T>)
    ├── services/
    │   ├── loggerService.ts              # Structured logging to a VS Code OutputChannel
    │   ├── processRunner.ts              # Safe subprocess execution (shell-free execFile)
    │   ├── pythonEnvironmentService.ts   # Python 3.10+, .venv, uv, local interpreter discovery, and multi-root support
    │   ├── packageManagerService.ts      # Package operations (uv-project, uv-pip, pip), uv tree, and uv.lock diff
    │   ├── pypiSearchService.ts          # PyPI search by name fragment & description + PyPI JSON API client
    │   └── vulnerabilityService.ts       # Security auditing via pip-audit CLI and OSV.dev REST API
    ├── views/
    │   ├── installedPackagesTreeProvider.ts # TreeDataProvider for installed packages
    │   ├── environmentTreeProvider.ts       # TreeDataProvider for environment diagnostics and quick actions
    │   └── pyprojectCodeLensProvider.ts     # CodeLensProvider for inline Upgrade/Update/Remove in pyproject.toml
    ├── webview/
    │   └── packageManagerPanel.ts        # WebviewPanel controller with cryptographic nonce-based CSP
    └── test/
        ├── runTests.ts                   # Test runner entry point (node:test)
        ├── mocks/
        │   ├── vscodeMock.ts             # Headless 'vscode' module shim for Node.js
        │   └── mockServices.ts           # Stateful in-memory domain service mocks
        ├── unit/
        │   ├── container.test.ts
        │   ├── pythonEnvironmentService.test.ts
        │   └── packageManagerService.test.ts
        └── integration/
            └── extensionWorkflow.test.ts
```

---

## 2. Dependency Injection Container (`src/di/`)

### 2.1. `ServiceContainer` (`src/di/container.ts`)
The IoC container implements `IServiceContainer` without runtime decorator reflection (`reflect-metadata`), preserving full compile-time type safety and zero bundler overhead:

- **Service Lifetimes (`ServiceLifetime`)**:
  - `registerSingleton<T>(token, factory)` — lazily instantiated on first `resolve()`, cached across the container's lifetime, and automatically disposed via `.dispose()` on shutdown.
  - `registerTransient<T>(token, factory)` — creates a new instance on every `resolve()` call.
  - `registerInstance<T>(token, instance)` — registers an externally managed instance.
- **Circular Dependency Detection**:
  - Maintains a `resolutionStack: symbol[]` during resolution and throws `Circular dependency detected while resolving services: A -> B -> A` if a cycle is encountered.
- **Child Containers (`createChildContainer()`)**:
  - Enables scoped overrides (e.g., substituting `IProcessRunner` or `IPackageManagerService` in tests) without mutating parent registrations.

### 2.2. Service Tokens (`src/di/tokens.ts`)

| Token (`TOKENS.*`) | Interface / Type | Lifetime |
| :--- | :--- | :--- |
| `TOKENS.Logger` | `ILoggerService` | Singleton |
| `TOKENS.ConfigProvider` | `IConfigProvider` | Singleton |
| `TOKENS.ProcessRunner` | `IProcessRunner` | Singleton |
| `TOKENS.PythonEnvService` | `IPythonEnvironmentService` | Singleton |
| `TOKENS.PackageManagerService` | `IPackageManagerService` | Singleton |
| `TOKENS.PyPiSearchService` | `IPyPiSearchService` | Singleton |
| `TOKENS.VulnerabilityService` | `IVulnerabilityService` | Singleton |
| `TOKENS.InstalledTreeProvider` | `InstalledPackagesTreeProvider` | Singleton |
| `TOKENS.EnvTreeProvider` | `EnvironmentTreeProvider` | Singleton |
| `TOKENS.PyprojectCodeLensProvider` | `PyprojectCodeLensProvider` | Singleton |

---

## 3. Service Layer (`src/services/`)

### 3.1. `NodeProcessRunner` (`src/services/processRunner.ts`)
Executes external CLI binaries (`uv`, `python`, `pip-audit`, `py`, `where.exe`, `which`):
- Uses `child_process.execFile` (no shell interpolation via `sh` or `cmd.exe`, eliminating *Shell Command Injection* vectors).
- Injects deterministic environment variables:
  - `UV_NO_PROGRESS=1` (suppresses terminal progress spinners for clean output parsing),
  - `PYTHONUTF8=1` (enforces UTF-8 I/O on Windows and POSIX),
  - `PIP_DISABLE_PIP_VERSION_CHECK=1`.
- Supports configurable execution timeouts (`timeoutMs`, default `120000 ms`), cancellation via `AbortSignal`, and a `10 MB` output buffer.
- Never rejects on non-zero process exit codes — returns a structured `ProcessResult` (`exitCode`, `stdout`, `stderr`, `durationMs`, `timedOut`, `cancelled`).

### 3.2. `PythonEnvironmentService` (`src/services/pythonEnvironmentService.ts`)
Handles Python 3.10+ interpreter detection, `uv` availability checks, local interpreter scanning, and multi-root workspace switching:
- **Python Version Enforcement (`validatePythonVersion`)**:
  - Enforces **Python 3.10+** (`major > 3 || (major === 3 && minor >= 10)`).
- **Active Interpreter Resolution (`detectEnvironment`)**:
  - Precedence order:
    1. Explicit `uvPkgManager.pythonPath` setting,
    2. Workspace virtual environment (`.venv`, `venv`, `.env`) or `VIRTUAL_ENV` (`Scripts\python.exe` on Windows, `bin/python` on POSIX),
    3. `uv python find` resolution,
    4. System `python` / `python3` on `PATH`.
- **Automatic Local Interpreter Discovery (`discoverLocalInterpreters`)**:
  - Aggregates and deduplicates local Python binaries from:
    1. Configured `uvPkgManager.pythonPath` (`source: 'configured'`),
    2. Workspace `.venv` (`source: 'workspace-venv'`),
    3. `uv python list --only-installed --output-format json` (with plain-text fallback to `uv python list --only-installed`, `source: 'uv'`),
    4. System discovery tools: `py -0p` and `where.exe python` on Windows, or `which -a python3 python` on Linux/macOS (`source: 'system'`).
  - Sorts discovered interpreters: supported versions (`>= 3.10`) first, base interpreters ahead of workspace `.venv`, then descending by semantic version (`major.minor.patch`).
- **Multi-Root Workspaces**:
  - `getWorkspaceFolders()`, `getActiveWorkspaceRoot()`, and `setActiveWorkspaceRoot()` allow switching the active workspace folder at runtime.

### 3.3. `UvPackageManagerService` (`src/services/packageManagerService.ts`)
Selects and executes commands across three package manager backends (`PackageManagerBackend`):

| Backend | Activation Condition | Install | Remove | Update | List Packages |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`uv-project`** | `preferUv && uvAvailable && hasPyprojectToml` | `uv add [--dev] <spec>` | `uv remove <pkg>` | `uv lock --upgrade-package <pkg> && uv sync` (or `uv add --upgrade-package`) | `uv pip list --format json` |
| **`uv-pip`** | `preferUv && uvAvailable && !hasPyprojectToml` | `uv pip install <spec>` | `uv pip uninstall <pkg>` | `uv pip install --upgrade <spec>` | `uv pip list --format json` |
| **`pip`** | `!preferUv \|\| !uvAvailable` | `python -m pip install <spec>` | `python -m pip uninstall -y <pkg>` | `python -m pip install --upgrade <spec>` | `python -m pip list --format json` |

Additional capabilities:
- **Input Sanitization**:
  - Package names are validated against PEP 508: `/^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/`.
  - Version constraints are validated against PEP 440 operators (`==`, `!=`, `<=`, `>=`, `<`, `>`, `~=`, `===`).
- **Virtual Environment Creation (`createVirtualEnvironment`)**:
  - Executes `uv venv <venvName> [--clear] [--seed] [--system-site-packages] [--python <basePython>]` or `python -m venv [--clear] [--system-site-packages] <venvName>`.
- **Dependency Tree Graph (`getDependencyTree` & `parseUvTreeOutput`)**:
  - Runs `uv tree [--invert]` (in `uv-project` mode) or `uv pip tree [--invert] [--python <py>]`.
  - Parses box-drawing characters (`├── `, `└── `, `│   `) into hierarchical `DependencyTreeNode` trees with shared-subtree `(*)` markers.
- **Manifest Workflows & Lockfile Diff Preview (`previewLockfileSyncDiff`)**:
  - `initPyproject()` → `uv init --bare`
  - `syncProject()` → `uv sync`
  - `lockProject(upgrade)` → `uv lock [--upgrade]`
  - `installRequirementsTxt()` → `uv pip install -r requirements.txt` (or `pip install -r`)
  - `exportRequirementsTxt()` → `uv pip freeze > requirements.txt`
  - `importRequirementsToPyproject()` → `uv add -r requirements.txt`
  - `previewLockfileSyncDiff()` → parses `[[package]]` entries from `uv.lock`, compares them against installed packages, and executes `uv sync --dry-run` to classify changes as `install`, `upgrade`, `downgrade`, or `remove`.

### 3.4. `PyPiSearchService` (`src/services/pypiSearchService.ts`)
Provides exact package lookup (`fetchPackageInfo`) and multi-source library search (`searchPackages(query, mode, limit)`):
- **Search Modes (`PyPiSearchMode`)**:
  - `'all'` — matches package names or descriptions (`summary`),
  - `'name'` — matches substrings within package names only,
  - `'description'` — matches keywords within package descriptions only.
- **4-Stage Search Pipeline**:
  1. PyPI Warehouse HTML search (`https://pypi.org/search/?q=...` — `.package-snippet` parser),
  2. Curated popular PyPI seed index (`POPULAR_PYPI_SEED`) with descriptions for instant keyword matching,
  3. Direct exact package lookup via `https://pypi.org/pypi/<query>/json`,
  4. PEP 691 PyPI Simple Index (`https://pypi.org/simple/` with `Accept: application/vnd.pypi.simple.v1+json`) for prefix and substring name matching.
- Candidate matches are enriched in parallel via `https://pypi.org/pypi/<pkg>/json` for live release versions, summaries, licenses, and `requires_python` metadata.

### 3.5. `VulnerabilityScannerService` (`src/services/vulnerabilityService.ts`)
Audits installed packages against known CVE / GHSA / PYSEC advisories:
1. **CLI Tier (`pip-audit`)**: Attempts `<python> -m pip_audit --format json --progress-spinner off` or `pip-audit --format json`, handling both exit code `0` (no vulnerabilities) and `1` (vulnerabilities reported in JSON output).
2. **REST API Tier (`OSV.dev`)**: When `pip-audit` is not installed, queries `POST https://api.osv.dev/v1/querybatch` for the `PyPI` ecosystem and fetches full advisory summaries and fixed versions from `GET https://api.osv.dev/v1/vulns/<id>`.

---

## 4. Presentation Layer (`src/views/` & `src/webview/`)

### 4.1. `InstalledPackagesTreeProvider` (`uvPkgInstalledView`)
- Displays installed packages in the Activity Bar sidebar.
- Flags outdated packages (`0.26.0 → 0.27.2`, `contextValue = 'outdatedPackage'`) and vulnerable packages (`⚠ N vuln(s)`).
- Lazily loads package metadata (`uv pip show <pkg>`) when a package node is expanded (`Version`, `Latest`, `Summary`, `License`, `Author`, `Requires`, `Location`, and CVE/OSV details).

### 4.2. `EnvironmentTreeProvider` (`uvPkgEnvView`)
- Displays the active workspace root (`Workspace`), active backend (`uv-project`, `uv-pip`, `pip`), `uv` CLI version, Python version and path, `.venv` path, and detected manifest files.
- Includes two expandable sections:
  - **Project Manifests & Actions** (one-click launchers for `.venv Wizard`, `uv tree`, `Preview Lockfile Diff`, `Vulnerability Scan`, `Search PyPI`, `uv sync`, `uv lock`, `uv init`, and `requirements.txt` actions),
  - **Available Local Pythons (N)** (all discovered local Python interpreters with an inline `+` button to create `.venv` using that specific interpreter).

### 4.3. `PyprojectCodeLensProvider` (`src/views/pyprojectCodeLensProvider.ts`)
- Parses `[project]`, `[project.optional-dependencies]`, and `[dependency-groups]` arrays in `pyproject.toml`.
- Renders inline CodeLens buttons above each dependency line:
  - `↑ Upgrade <pkg> (<current> → <latest>)` (when outdated) or `↻ Update <pkg>`,
  - `✕ Remove <pkg>`.

### 4.4. `PackageManagerPanel` & WebView Message Protocol
The WebView enforces a strict **Content Security Policy (CSP)** using a per-render 128-bit cryptographic `nonce`:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
```

Bidirectional communication between the WebView (`media/webview.js`) and the Extension Host (`PackageManagerPanel`) uses discriminated union types defined in `src/types/package.ts`:

- **Inbound Messages (`WebViewInboundMessage`)**:
  `ready`, `listPackages`, `installPackage`, `removePackage`, `updatePackage`, `inspectPackage`, `lookupPyPi`, `searchPyPi`, `selectPythonPath`, `createVirtualEnv`, `setPythonInterpreter`, `getDependencyTree`, `syncProject`, `lockProject`, `initPyproject`, `installRequirements`, `exportRequirements`, `importRequirementsToPyproject`, `openManifestFile`, `selectWorkspaceFolder`, `runVenvWizard`, `scanVulnerabilities`, `previewSyncDiff`.
- **Outbound Messages (`WebViewOutboundMessage`)**:
  `state`, `dependencyTree`, `vulnerabilityScanResult`, `lockfileSyncPreview`, `operationResult`, `packageDetails`, `pypiResult`, `pypiSearchResults`, `error`.

---

## 5. Public Extension API, Commands & Configuration

### 5.1. Public API Returned by `activate()` (`ExtensionApi`)
```ts
export interface ExtensionApi {
  container: IServiceContainer;
  listPackages: (cwd?: string) => Promise<InstalledPackage[]>;
  installPackage: (request: PackageInstallRequest | string, cwd?: string) => Promise<PackageOperationResult>;
  removePackage: (packageName: string, cwd?: string) => Promise<PackageOperationResult>;
  updatePackage: (packageName: string, targetVersion?: string, cwd?: string) => Promise<PackageOperationResult>;
  createVirtualEnvironment: (pythonSpec?: string, cwd?: string, options?: VenvCreateOptions) => Promise<PackageOperationResult>;
  getDependencyTree: (options?: { invert?: boolean }, cwd?: string) => Promise<DependencyTreeResult>;
  syncProject: (cwd?: string) => Promise<PackageOperationResult>;
  lockProject: (upgrade?: boolean, cwd?: string) => Promise<PackageOperationResult>;
  initPyproject: (cwd?: string) => Promise<PackageOperationResult>;
  installRequirementsTxt: (fileName?: string, cwd?: string) => Promise<PackageOperationResult>;
  exportRequirementsTxt: (fileName?: string, cwd?: string) => Promise<PackageOperationResult>;
  importRequirementsToPyproject: (fileName?: string, cwd?: string) => Promise<PackageOperationResult>;
  scanVulnerabilities: (cwd?: string) => Promise<VulnerabilityScanResult>;
  previewLockfileSyncDiff: (cwd?: string) => Promise<LockfileSyncPreview>;
  searchPyPiPackages: (query: string, mode?: PyPiSearchMode, limit?: number) => Promise<PyPiSearchResultItem[]>;
}
```

### 5.2. Registered VS Code Commands

| Command ID | Description |
| :--- | :--- |
| `uvPkgManager.openPanel` | Opens the interactive WebView dashboard |
| `uvPkgManager.listPackages` | Refreshes installed and outdated package lists |
| `uvPkgManager.installPackage` | Installs a package (`uv add` / `uv pip install` / `pip install`) |
| `uvPkgManager.removePackage` | Removes a package (`uv remove` / `uv pip uninstall` / `pip uninstall -y`) |
| `uvPkgManager.updatePackage` | Upgrades a package (`uv lock --upgrade-package` + `uv sync` / `--upgrade`) |
| `uvPkgManager.selectPythonPath` | Selects an active Python 3.10+ interpreter from discovered binaries or disk |
| `uvPkgManager.createVirtualEnv` | Creates `.venv` using a selected base Python interpreter |
| `uvPkgManager.createVirtualEnvWizard` | Guided 4-step `.venv` creation wizard (root, base Python, folder name, `--seed` / `--system-site-packages`) |
| `uvPkgManager.selectWorkspaceFolder` | Switches active workspace root in multi-root workspaces |
| `uvPkgManager.syncProject` | Synchronizes environment with `pyproject.toml` and `uv.lock` (`uv sync`) |
| `uvPkgManager.lockProject` | Generates or upgrades `uv.lock` (`uv lock`) |
| `uvPkgManager.initProject` | Initializes `pyproject.toml` (`uv init --bare`) |
| `uvPkgManager.installRequirements` | Installs dependencies from `requirements.txt` (`uv pip install -r`) |
| `uvPkgManager.exportRequirements` | Freezes installed packages to `requirements.txt` (`uv pip freeze`) |
| `uvPkgManager.importRequirementsToPyproject` | Migrates `requirements.txt` into `pyproject.toml` (`uv add -r`) |
| `uvPkgManager.showDependencyTree` | Opens the interactive dependency tree visualization (`uv tree`) |
| `uvPkgManager.scanVulnerabilities` | Runs package security audit (`pip-audit` / OSV.dev) |
| `uvPkgManager.previewSyncDiff` | Previews differences between `uv.lock` and installed packages (`uv sync --dry-run`) |
| `uvPkgManager.searchPyPi` | Searches PyPI libraries by name fragment or description |

### 5.3. Configuration Settings (`settings.json`)

| Setting Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `uvPkgManager.preferUv` | `boolean` | `true` | Prefer `uv` over `pip` whenever `uv` is available |
| `uvPkgManager.uvPath` | `string` | `"uv"` | Path or command name for the `uv` executable |
| `uvPkgManager.pythonPath` | `string` | `""` | Optional explicit path to a Python 3.10+ interpreter |
| `uvPkgManager.checkOutdated` | `boolean` | `true` | Check for outdated packages when listing installed packages |
| `uvPkgManager.commandTimeoutMs` | `number` | `120000` | Maximum CLI execution timeout in milliseconds (minimum `5000`) |

---

## 6. Testing Architecture (`src/test/`)

The test suite runs on Node.js 20+ built-in `node:test` and `node:assert/strict`, comprising **26 tests across 4 suites**:

1. **Headless `vscode` Module Hook (`src/test/mocks/vscodeMock.ts`)**:
   - `installVscodeMock()` intercepts Node's `Module._load` so all `import * as vscode from 'vscode'` statements resolve to `vscodeMock` (`window`, `workspace`, `commands`, `languages`, `TreeItem`, `EventEmitter`, `CodeLens`, `Range`, `Uri`, `inputBoxQueue`, and `quickPickQueue`).
2. **Unit Tests (`src/test/unit/`)**:
   - `container.test.ts` (5 tests) — singleton caching, transient creation, child container overrides, circular dependency detection, and `dispose()` cleanup.
   - `pythonEnvironmentService.test.ts` (6 tests) — Python 3.10+ version parsing, backend selection (`uv-project`, `uv-pip`, `pip`), local interpreter discovery/deduplication/sorting, and multi-root workspace switching.
   - `packageManagerService.test.ts` (13 tests) — package listing with `--outdated`, `uv add --dev` with extras, `uv pip uninstall` vs `pip uninstall -y`, `uv lock --upgrade-package` + `uv sync`, `uv pip show` metadata parsing, PEP 508 validation, `.venv` creation, `uv tree` graph parsing, `pyproject.toml`/`requirements.txt` workflows, `uv.lock` diff computation, `pip-audit`/OSV.dev auditing, `pyproject.toml` CodeLens generation, and PyPI search by name fragment and description.
3. **Integration Tests (`src/test/integration/extensionWorkflow.test.ts`)**:
   - Full lifecycle test: `activate()` → command, TreeView, and CodeLens registration → `.venv` wizard → package install/update/remove → vulnerability scan → lockfile diff preview → PyPI search → `deactivate()`.
   - Real host integration test verifying detection of the host's installed `uv` binary and local Python 3.10+ interpreters against `sample-workspace/`.

---

## 7. Build & VSIX Packaging Pipeline

```bash
# 1. Install development dependencies
npm install

# 2. Type-check TypeScript and build development bundle (out/ + dist/extension.js)
npm run compile

# 3. Run all 26 unit and integration tests
npm test

# 4. Build minified production bundle via esbuild
npm run package

# 5. Alternative production bundle via Webpack 5
npm run bundle:webpack

# 6. Package VSIX installer (vsc-uv-package-manager-1.6.0.vsix)
npm run vsix
```
