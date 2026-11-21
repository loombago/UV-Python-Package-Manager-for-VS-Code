# User Manual — Loombago UV Python Package Manager (`v1.6.0`)

- **Extension Name:** Loombago UV Python Package Manager
- **Extension ID:** `loombago.vsc-uv-package-manager`
- **Version:** `1.6.0`
- **Repository:** https://github.com/loombago/UV-Python-Package-Manager-for-VS-Code
- **Author Contact:** wesmarand@gmail.com
- **License:** MIT

---

## 1. Introduction & Prerequisites

**Loombago UV Python Package Manager** is a Visual Studio Code extension designed for effortless management of Python packages and virtual environments directly inside the editor. It provides deep integration with the ultra-fast **`uv`** package manager while retaining automatic fallback support for standard **`pip`**.

### System Requirements
- **Visual Studio Code:** version `1.95.0` or newer.
- **Python:** version **`3.10` or newer** (the extension automatically enforces and validates Python 3.10+).
- **`uv` Package Manager (Recommended):** when `uv` is installed and accessible via `PATH` (or configured via `uvPkgManager.uvPath`), the extension operates in `uv-project` mode (for workspaces containing `pyproject.toml`) or `uv-pip` mode. If `uv` is not available, it automatically falls back to `python -m pip`.

### Installation
1. **From a `.vsix` package:**
   - Open VS Code and navigate to the **Extensions** view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
   - Click the `...` menu in the top-right corner of the Extensions sidebar and choose **Install from VSIX...**.
   - Select `vsc-uv-package-manager-1.6.0.vsix`.
2. **Via CLI:**
   ```bash
   code --install-extension vsc-uv-package-manager-1.6.0.vsix
   ```

---

## 2. Quick Start

1. **Open your Python project folder** in VS Code (`File → Open Folder...`).
2. **Open the sidebar view** by clicking the **UV Python** icon on the left *Activity Bar*.
3. **Create a `.venv` virtual environment (if your project does not have one yet):**
   - Click **`Create .venv Wizard`** inside the `Python & uv Environment` view, or run **`UV Python: Create Virtual Environment Wizard (.venv)`** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
4. **Open the WebView Dashboard:**
   - Press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) and run **`UV Python: Open Package Manager Panel`**, or click the dashboard icon in the *Installed Packages* view title bar.
5. **Install your first package:**
   - Search PyPI by name fragment or description, or enter a package specification directly in the install form and click **`Install`**.

---

## 3. Activity Bar Sidebar

Clicking the extension's Activity Bar icon reveals two tree views:

### 3.1. `Python & uv Environment` View
Provides live environment diagnostics and one-click project shortcuts:
- **Environment Diagnostics:**
  - **Workspace:** active project folder name and path (supports switching roots in Multi-root Workspaces).
  - **Backend:** currently active package execution engine:
    - `uv-project` — enabled when `uv` is available and `pyproject.toml` exists (uses `uv add`, `uv remove`, `uv sync`, `uv lock`),
    - `uv-pip` — enabled when `uv` is available without `pyproject.toml` (uses `uv pip install/uninstall`),
    - `pip` — fallback backend using `python -m pip`.
  - **uv:** detected `uv` CLI version.
  - **Python:** detected Python version and executable path (`3.10+`).
  - **Virtual Env:** path to the active `.venv` / `venv` / `.env` environment.
- **`Project Manifests & Actions` Section:**
  - One-click launchers for **`.venv Wizard`**, **Dependency Tree (`uv tree`)**, **Preview Lockfile Diff**, **Vulnerability Scan**, **Search PyPI**, as well as **`uv sync`**, **`uv lock`**, **`uv init --bare`**, and **`requirements.txt`** workflows.
- **`Available Local Pythons` Section:**
  - Automatically lists all local Python interpreters discovered on your machine (via `uv python list`, Windows `py -0p`, `where.exe`/`which`, and workspace `.venv`).
  - Each discovered interpreter displays an inline **`+`** button to immediately create a `.venv` backed by that specific Python version.

### 3.2. `Installed Packages` View
Lists every package installed in the active environment:
- **Outdated Indicators:** outdated libraries clearly show the target update (e.g., `0.26.0 → 0.27.2`).
- **Security Alerts:** packages affected by known advisories display a `⚠ N vuln(s)` badge.
- **Expandable Package Details:** expanding any package node lazily loads metadata (`Version`, `Latest`, `Summary`, `License`, `Author`, `Requires`, `Location`, plus CVE/OSV advisory details).
- **Inline Actions:** update or uninstall any package directly from its sidebar row without opening the WebView dashboard.

---

## 4. Interactive WebView Dashboard (`UV & Python Package Manager`)

The main WebView panel gives you full visual control over your Python environment and packages.

### 4.1. Environment Header & Multi-Root Workspace Switcher
At the top of the panel, the environment bar allows you to:
- **Switch Workspace Folders:** in Multi-root Workspaces, select which project root all commands target from the workspace dropdown.
- **Select Active Local Python:** pick from all automatically discovered Python `3.10+` interpreters and trigger quick environment actions:
  - **`.venv Wizard`** — launches the guided 4-step `.venv` creation wizard,
  - **`Select Python`** — opens the interpreter picker or file browser,
  - **`Quick .venv`** — immediately creates a standard `.venv` in the active workspace.

### 4.2. Project Manifest Management (`pyproject.toml`, `uv.lock`, `requirements.txt`)
Dedicated workflow buttons map directly to `uv` project commands:
- **`Init pyproject.toml`** — creates a clean `pyproject.toml` manifest (`uv init --bare`).
- **`uv sync`** — synchronizes the virtual environment with `pyproject.toml` and `uv.lock`.
- **`Preview Sync Diff`** — runs a non-destructive preview (`uv sync --dry-run` + `uv.lock` `[[package]]` comparison) showing planned `install`, `upgrade`, `downgrade`, and `remove` actions before modifying anything.
- **`uv lock`** — creates or updates `uv.lock`.
- **`uv lock --upgrade`** — re-resolves and upgrades locked dependency versions in `uv.lock`.
- **`Install requirements.txt`** — installs dependencies from `requirements.txt`.
- **`Export requirements.txt`** — freezes current environment packages into `requirements.txt` (`uv pip freeze`).
- **`Import reqs → pyproject`** — migrates `requirements.txt` entries into `pyproject.toml` (`uv add -r requirements.txt`).

### 4.3. PyPI Search & Package Installation (`v1.6.0`)
The panel includes a multi-mode PyPI search bar and an installation form:
- **Search Modes (`PyPiSearchMode`):**
  - **Name or Description** — matches both package names and project descriptions,
  - **Name Fragment Only** — matches substrings across PyPI package names only (using PyPI search and PEP 691 Simple Index lookup),
  - **Description Only** — matches keywords inside library descriptions.
- **Search Actions:**
  - **`Search PyPI`** — populates a results table with *Package*, *Latest*, *Match*, *Description*, and *Action* columns. Click **`Use`** to pre-fill the install form or **`Install`** to install immediately.
  - **`Exact Info`** — queries the PyPI JSON API directly for the exact package name entered (showing latest version, license, `requires_python`, and summary).
- **Install Form:**
  - **Package Name:** e.g., `httpx` or `requests`.
  - **Version Constraint:** optional PEP 440 specifier, e.g., `>=0.27.0`, `==2.32.3`, `~=1.4`.
  - **Extras:** optional comma-separated extras list, e.g., `http2,socks`.
  - **`--dev` Checkbox:** marks the package as a development dependency (`uv add --dev`) in `pyproject.toml` projects.

### 4.4. Interactive Dependency Tree (`uv tree`)
Inspect direct and transitive dependencies visually:
- **`Show Tree`** — renders an expandable hierarchical dependency tree (`uv tree` / `uv pip tree`).
- **`Invert (--invert)` Checkbox** — reverses the graph so you can see which top-level packages pull in a given transitive dependency.
- **Tree Filter Input** — highlights and filters matching nodes inside large trees.
- **Shared Subtree Marker `(*)`** — indicates subtrees already expanded elsewhere in the graph.

### 4.5. Security Vulnerability Scanner (`Vulnerability Audit`)
Audits installed packages for known security advisories:
- **`Run Audit`** — runs a two-tier security scan:
  1. Uses local **`pip-audit`** (`--format json`) first when installed.
  2. Automatically falls back to the public **`OSV.dev API`** (covering PyPA, GitHub Security Advisories, and NVD/CVE) when `pip-audit` is not present.
- **Audit Results Table:** displays each vulnerability ID (CVE / GHSA / PYSEC), affected package and installed version, advisory summary, and suggested fixed version(s).
- **One-Click Fix (`Fix → <version>`):** when an advisory specifies a patched release, click the button to upgrade directly to the safe version.

### 4.6. Installed Packages Table
The main table displays every package in the active environment:
- **Live Text Filter:** filter installed packages instantly by name.
- **`Refresh` & `Check Outdated`:** reload installed packages and check PyPI for newer releases.
- **Per-Row Actions:**
  - **`Details`** — inspects full package metadata (`uv pip show`),
  - **`Update`** — upgrades the package to its latest version,
  - **`Remove`** — uninstalls the package (and removes it from `pyproject.toml` in `uv-project` mode).

---

## 5. `.venv` Creation Wizard

Running **`UV Python: Create Virtual Environment Wizard (.venv)`** guides you through 4 steps:
1. **Step 1 — Select Workspace Folder:** pick the target directory (useful for Multi-root Workspaces).
2. **Step 2 — Select Base Python 3.10+ Interpreter:** choose any automatically discovered local Python installation or browse for a custom binary.
3. **Step 3 — Virtual Environment Directory Name:** defaults to `.venv` (customizable to `venv`, `.env`, etc.). Prompts for overwrite confirmation (`--clear`) if the folder already exists.
4. **Step 4 — Additional Options:** optionally enable `--seed` (install `pip`/`setuptools`/`wheel` inside `.venv`) and `--system-site-packages`.

---

## 6. Inline CodeLens Actions in `pyproject.toml`

Whenever you open a `pyproject.toml` file in the VS Code editor, the extension parses dependency arrays inside `[project]`, `[project.optional-dependencies]`, and `[dependency-groups]`.

Above each dependency line, clickable **CodeLens** buttons appear automatically:
- **`↑ Upgrade <package> (<current> → <latest>)`** — shown when an outdated package has a newer version available; clicking upgrades it immediately.
- **`↻ Update <package>`** — runs an update check/upgrade when the package is not currently flagged as outdated.
- **`✕ Remove <package>`** — removes the dependency from your project with one click.

---

## 7. Complete Command Palette Reference (`Ctrl+Shift+P` / `Cmd+Shift+P`)

| Command ID | Command Palette Title | Description |
| :--- | :--- | :--- |
| `uvPkgManager.openPanel` | `UV Python: Open Package Manager Panel` | Opens the interactive WebView dashboard |
| `uvPkgManager.listPackages` | `UV Python: List Installed Packages` | Refreshes installed and outdated packages |
| `uvPkgManager.installPackage` | `UV Python: Install Package` | Prompts to install a package from PyPI |
| `uvPkgManager.removePackage` | `UV Python: Remove Package` | Uninstalls a selected package |
| `uvPkgManager.updatePackage` | `UV Python: Update Package` | Upgrades a selected package |
| `uvPkgManager.selectPythonPath` | `UV Python: Select Python Interpreter` | Picks an active Python `3.10+` interpreter |
| `uvPkgManager.createVirtualEnv` | `UV Python: Create Virtual Environment (.venv)` | Creates a `.venv` virtual environment |
| `uvPkgManager.createVirtualEnvWizard` | `UV Python: Create Virtual Environment Wizard (.venv)` | Launches the 4-step `.venv` creation wizard |
| `uvPkgManager.selectWorkspaceFolder` | `UV Python: Select Workspace Folder` | Switches active root in Multi-root Workspaces |
| `uvPkgManager.syncProject` | `UV Python: Sync Project (uv sync)` | Synchronizes environment with `pyproject.toml` and `uv.lock` |
| `uvPkgManager.lockProject` | `UV Python: Lock Dependencies (uv lock)` | Generates or updates `uv.lock` |
| `uvPkgManager.initProject` | `UV Python: Initialize pyproject.toml (uv init)` | Creates a starter `pyproject.toml` (`uv init --bare`) |
| `uvPkgManager.installRequirements` | `UV Python: Install from requirements.txt` | Installs packages from `requirements.txt` |
| `uvPkgManager.exportRequirements` | `UV Python: Export requirements.txt (freeze)` | Exports installed packages to `requirements.txt` |
| `uvPkgManager.importRequirementsToPyproject` | `UV Python: Import requirements.txt to pyproject.toml` | Migrates `requirements.txt` into `pyproject.toml` |
| `uvPkgManager.showDependencyTree` | `UV Python: Show Dependency Tree (uv tree)` | Displays the dependency tree in the WebView |
| `uvPkgManager.scanVulnerabilities` | `UV Python: Scan Packages for Vulnerabilities` | Scans installed packages for CVE/OSV advisories |
| `uvPkgManager.previewSyncDiff` | `UV Python: Preview Lockfile Sync Diff` | Previews differences prior to running `uv sync` |
| `uvPkgManager.searchPyPi` | `UV Python: Search PyPI Packages` | Searches PyPI libraries by name fragment or description |

---

## 8. Extension Settings (`settings.json`)

Configure the extension through VS Code Settings (`Ctrl+,`) or directly in `settings.json`:

| Setting Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `uvPkgManager.preferUv` | `boolean` | `true` | Prefer `uv` over `pip` whenever `uv` is available |
| `uvPkgManager.uvPath` | `string` | `"uv"` | Executable name or full path to the `uv` binary |
| `uvPkgManager.pythonPath` | `string` | `""` | Optional explicit path to a Python `3.10+` interpreter |
| `uvPkgManager.checkOutdated` | `boolean` | `true` | Check for outdated packages when refreshing the package list |
| `uvPkgManager.commandTimeoutMs` | `number` | `120000` | Maximum timeout in milliseconds per CLI invocation (minimum `5000`) |

### Example `.vscode/settings.json`
```json
{
  "uvPkgManager.preferUv": true,
  "uvPkgManager.uvPath": "uv",
  "uvPkgManager.pythonPath": "",
  "uvPkgManager.checkOutdated": true,
  "uvPkgManager.commandTimeoutMs": 120000
}
```

---

## 9. Troubleshooting & FAQ

- **The extension cannot find `uv` even though it is installed:**
  - Verify that `uv` is on your system `PATH`, or specify the full path to the executable in `uvPkgManager.uvPath` (for example, `C:\\Users\\Name\\.local\\bin\\uv.exe` or `~/.local/bin/uv`).
- **Python version rejected (`< 3.10`):**
  - The extension requires **Python 3.10+**. Use **`Select Python`** or **`Available Local Pythons`** to pick Python `3.10` or newer, or create a fresh `.venv` via the wizard.
- **Does the vulnerability scanner work without `pip-audit` installed?**
  - Yes. If local `pip-audit` is unavailable, the extension automatically queries the public **OSV.dev API** for the PyPI ecosystem (internet access required).
- **PyPI search returns no results or times out:**
  - Check your internet connection and verify that outbound HTTPS traffic to `https://pypi.org` is not blocked by a firewall or corporate proxy.
- **Where can I view detailed CLI command logs?**
  - Open the VS Code **Output** panel (`Ctrl+Shift+U` / `Cmd+Shift+U`) and select **`UV Python Package Manager`** from the channel dropdown on the right to inspect every `uv`/`pip` invocation, execution time, and stderr trace.

---

## 10. Contact, Repository & Legal Notice

- **Author & Contact:** `wesmarand@gmail.com`
- **Source Code & Issue Tracker:** https://github.com/loombago/UV-Python-Package-Manager-for-VS-Code
- **License:** MIT License

### Legal Notice / Disclaimer of Liability
This software is provided **"AS IS"**, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and noninfringement.

In no event shall the author or copyright holders be liable for any claim, damages, or other liability — whether in an action of contract, tort, or otherwise — arising from, out of, or in connection with the software or the use or other dealings in the software, including any loss of data, corrupted Python environments, project configuration changes, or workflow interruptions. In accordance with the **MIT License**, you use this extension entirely at your own risk.
