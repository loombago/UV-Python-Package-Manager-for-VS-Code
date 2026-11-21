# UV Python Package Manager (`vsc-uv-package-manager`)

Visual Studio Code extension for managing Python 3.10+ packages using Dependency Injection, preferring [`uv`](https://docs.astral.sh/uv/) whenever available with seamless fallback to `pip`.

---

## 1. Architecture Overview

```text
src/
├── extension.ts                  # Extension entrypoint: activate(), deactivate(), listPackages(), installPackage(), removePackage(), updatePackage()
├── types/package.ts              # Shared domain models and WebView message contracts
├── di/
│   ├── container.ts              # ServiceContainer (singleton, transient, child scopes, cycle detection, dispose)
│   └── tokens.ts                 # Typed ServiceToken<T> identifiers
├── services/
│   ├── loggerService.ts          # OutputChannel-backed structured logger
│   ├── processRunner.ts          # Safe execFile wrapper with timeout, cancellation, and UTF-8 / no-progress env
│   ├── pythonEnvironmentService.ts # Detects Python 3.10+, .venv, pyproject.toml, uv.lock, and uv CLI
│   ├── packageManagerService.ts  # Implements list, install, remove, update, and metadata inspection
│   └── pypiSearchService.ts      # PyPI JSON API metadata & version lookup
├── views/
│   ├── installedPackagesTreeProvider.ts # Sidebar TreeView for installed & outdated packages
│   └── environmentTreeProvider.ts       # Sidebar TreeView for active backend, Python, and manifests
├── webview/
│   └── packageManagerPanel.ts    # CSP-hardened WebView controller
└── test/
    ├── mocks/                    # VS Code API shim and in-memory service mocks
    ├── unit/                     # Unit tests for DI, environment detection, and package operations
    ├── integration/              # End-to-end activation & real host Python/uv detection tests
    └── runTests.ts               # Node test runner entry point
media/
├── icon.svg                      # Activity Bar vector icon
├── webview.css                   # Theme-aware stylesheet
└── webview.js                    # Interactive WebView UI script
sample-workspace/                 # Python 3.10+ sample project configured for uv
```

### Backend Selection Strategy

1. **`uv-project`**: Active when `uvPkgManager.preferUv` is enabled, `uv` is available, and `pyproject.toml` exists in the workspace (`uv add`, `uv remove`, `uv lock --upgrade-package` + `uv sync`, `uv pip list --format json`).
2. **`uv-pip`**: Active when `uv` is available without a `pyproject.toml` (`uv pip install`, `uv pip uninstall`, `uv pip list --format json`).
3. **`pip`**: Automatic fallback when `uv` is unavailable or disabled (`python -m pip install`, `python -m pip uninstall -y`, `python -m pip list --format json`).

---

## 2. Development Setup

### Prerequisites

- **Node.js**: 20.x or newer
- **VS Code**: 1.95.0 or newer
- **Python**: 3.10 or newer
- **`uv`** (recommended): `0.4+`

### Install Dependencies & Build

```bash
npm install
npm run compile
```

For continuous development with esbuild watch mode:

```bash
npm run watch
```

Press `F5` in VS Code to launch an Extension Development Host with `sample-workspace/` open.

### Alternative Webpack Production Bundle

```bash
npm run bundle:webpack
```

---

## 3. Testing Setup & Instructions

Tests execute directly in Node.js 20+ via `node:test` and `node:assert/strict`, using `src/test/mocks/vscodeMock.ts` for headless VS Code API simulation alongside `src/test/mocks/mockServices.ts` and real host environment checks.

```bash
# Run all unit and integration tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

---

## 4. VSIX Build Instructions

1. Ensure dependencies are installed and compilation succeeds:
   ```bash
   npm install
   npm run package
   ```
2. Build the `.vsix` archive using `@vscode/vsce`:
   ```bash
   npx vsce package
   ```
   This produces `vsc-uv-package-manager-1.0.0.vsix` (excluding `src/`, `out/`, and `sample-workspace/` as configured in `.vscodeignore`).

---

## 5. Marketplace Publishing Instructions

1. Create a publisher on the [Visual Studio Marketplace Management Portal](https://marketplace.visualstudio.com/manage) matching `"publisher"` in `package.json` (`antigravity-dev` or your publisher ID).
2. Generate a Personal Access Token (PAT) in Azure DevOps with **Marketplace (Publish)** scope.
3. Log in and publish:
   ```bash
   npx vsce login <your-publisher-id>
   npx vsce publish
   ```
   Or upload the generated `.vsix` manually through the Marketplace portal.

---

## 6. Installation Guide

- **From VSIX**:
  ```bash
  code --install-extension vsc-uv-package-manager-1.0.0.vsix
  ```
- **From VS Code UI**: Open Extensions (`Ctrl+Shift+X`), click `...` -> **Install from VSIX...**, and select the `.vsix` file.

---

## 7. Future Roadmap

- Dependency tree visualization (`uv tree` interactive graph in WebView) -- DONE
- Multi-root workspace selector and `uv venv` creation wizard from the Environment TreeView -- DONE
- Vulnerability scanning integration (`pip-audit` / OSV database alerts) -- DONE
- `pyproject.toml` CodeLens actions for inline upgrade/remove buttons -- DONE
- Lockfile diff preview prior to running `uv sync` -- DONE
- what else? ;-)
