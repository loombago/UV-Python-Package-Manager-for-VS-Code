# UV Python Package Manager for VS Code

[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.95.0-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![uv](https://img.shields.io/badge/Preferred%20Backend-uv-DE5FE9?logo=astral)](https://docs.astral.sh/uv/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

**UV Python Package Manager (`vsc-uv-package-manager`)** is a Visual Studio Code extension for managing Python 3.10+ dependencies directly from the editor. It prioritizes Astral's [`uv`](https://docs.astral.sh/uv/) whenever available and automatically falls back to `pip` when `uv` is not installed.

---

## Features

- **`uv`-First Architecture with Smart Fallback**
  - **`uv-project` mode**: Uses `uv add`, `uv remove`, and `uv lock --upgrade-package` + `uv sync` when `pyproject.toml` is present.
  - **`uv-pip` mode**: Uses `uv pip install`, `uv pip uninstall`, and `uv pip list --format json` for virtual environments without `pyproject.toml`.
  - **`pip` fallback mode**: Uses `python -m pip` automatically when `uv` is unavailable or disabled.
- **Activity Bar TreeViews**
  - **Installed Packages**: Browse installed packages, see outdated version indicators (`current → latest`), expand package metadata (`Summary`, `License`, `Author`, `Requires`, `Location`), and update/remove packages inline.
  - **Python Environment**: Inspect the active backend (`uv` vs `pip`), `uv` CLI version, Python 3.10+ interpreter path, `.venv` location, and detected manifest files (`pyproject.toml`, `uv.lock`, `requirements.txt`).
- **Interactive WebView Dashboard**
  - Search and filter installed packages or toggle **Outdated only**.
  - Look up live package metadata and release constraints directly from the **PyPI JSON API**.
  - Install packages with version constraints (e.g., `>=0.27.0`), extras, and `--dev` dependency support.
  - Inspect full package metadata and monitor CLI execution in the built-in **Activity Log**.
- **Automatic File & Config Watchers**
  - Automatically refreshes views whenever `pyproject.toml`, `uv.lock`, or `requirements.txt` changes.
- **Security & Reliability**
  - Strict PEP 508 / PEP 440 validation and shell-free process execution via `execFile`.
  - Nonce-based Content Security Policy (CSP) for WebView assets.
  - Built with a lightweight, type-safe Dependency Injection (IoC) container.

---

## Requirements

- **VS Code**: `1.95.0` or newer
- **Python**: `3.10` or newer
- **`uv`** *(recommended)*: Install via `pipx install uv`, `winget install --id=astral-sh.uv -e`, or from [docs.astral.sh/uv](https://docs.astral.sh/uv/)

---

## Installation

### Install from `.vsix`

1. Download `vsc-uv-package-manager-1.0.0.vsix` from the [Releases](../../releases) page (or build it locally with `npm run vsix`).
2. Install via CLI:
   ```bash
   code --install-extension vsc-uv-package-manager-1.0.0.vsix
   ```
   Or in VS Code: open **Extensions** (`Ctrl+Shift+X`) → **`...`** → **Install from VSIX...**.

---

## Commands

| Command ID | Title | Description |
| :--- | :--- | :--- |
| `uvPkgManager.openPanel` | **UV Package Manager: Open Package Manager UI** | Opens the interactive WebView dashboard |
| `uvPkgManager.listPackages` | **UV Package Manager: Refresh / List Packages** | Refreshes installed and outdated package lists |
| `uvPkgManager.installPackage` | **UV Package Manager: Install Package** | Installs a package (`name`, extras, version constraint) |
| `uvPkgManager.removePackage` | **UV Package Manager: Remove Package** | Uninstalls a selected package from the environment |
| `uvPkgManager.updatePackage` | **UV Package Manager: Update Package** | Upgrades a package to its latest or specified version |
| `uvPkgManager.selectPythonPath` | **UV Package Manager: Select Python Interpreter** | Selects a custom Python 3.10+ interpreter binary |

---

## Extension Settings

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `uvPkgManager.preferUv` | `boolean` | `true` | Prefer `uv` over `pip` whenever `uv` is available on `PATH` or configured |
| `uvPkgManager.uvPath` | `string` | `"uv"` | Path or executable name for the `uv` binary |
| `uvPkgManager.pythonPath` | `string` | `""` | Optional explicit path to a Python 3.10+ interpreter |
| `uvPkgManager.checkOutdated` | `boolean` | `true` | Check for outdated packages when listing installed packages |
| `uvPkgManager.commandTimeoutMs` | `number` | `120000` | Maximum execution time (ms) for package manager CLI commands |

---

## Architecture & Dependency Injection

```text
src/
├── extension.ts                     # Entrypoint: activate(), deactivate(), listPackages(), installPackage(), removePackage(), updatePackage()
├── types/package.ts                 # Domain interfaces & WebView message contracts
├── di/
│   ├── container.ts                 # IoC ServiceContainer (singleton, transient, child scopes, cycle detection)
│   └── tokens.ts                    # Strongly-typed ServiceToken<T> symbols
├── services/
│   ├── loggerService.ts             # VS Code OutputChannel logger
│   ├── processRunner.ts             # Safe execFile process runner with timeout & AbortSignal
│   ├── pythonEnvironmentService.ts  # Python 3.10+, .venv, pyproject.toml, uv.lock & uv discovery
│   ├── packageManagerService.ts     # uv-project, uv-pip, and pip package operations
│   └── pypiSearchService.ts         # PyPI JSON API client
├── views/
│   ├── installedPackagesTreeProvider.ts
│   └── environmentTreeProvider.ts
├── webview/
│   └── packageManagerPanel.ts       # Nonce-CSP WebView controller
└── test/                            # Unit & integration tests + VS Code and service mocks
```

---

## Development & Testing

```bash
# Install dependencies
npm install

# Type-check and bundle with esbuild
npm run compile

# Watch mode for active development
npm run watch

# Run all unit and integration tests
npm test

# Build production VSIX package
npm run vsix
```

---

## License

Released under the [MIT License](./LICENSE).
