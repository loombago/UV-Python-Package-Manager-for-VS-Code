# Dokumentacja Techniczna — Loombago UV Python Package Manager (`v1.6.0`)

- **Identyfikator rozszerzenia:** `loombago.vsc-uv-package-manager`
- **Wersja:** `1.6.0`
- **Silnik VS Code:** `^1.95.0`
- **Wymagany Python:** `3.10+`
- **Preferowany menedżer pakietów:** `uv` (z automatycznym fallbackiem do `pip`)
- **Repozytorium:** https://github.com/loombago/UV-Python-Package-Manager-for-VS-Code
- **Kontakt z autorem:** wesmarand@gmail.com
- **Licencja:** MIT

---

## 1. Architektura Systemu i Struktura Modułów

Rozszerzenie zostało zaprojektowane w architekturze warstwowej opartej na **Wstrzykiwaniu Zależności (Dependency Injection / IoC)**, co zapewnia pełną separację logiki domenowej od interfejsu API VS Code oraz deterministyczne testowanie jednostkowe i integracyjne bez konieczności uruchamiania pełnej instancji Electron/GUI.

```text
vsc-uv-package-manager/
├── package.json                          # Manifest rozszerzenia VS Code (komendy, widoki, menu, konfiguracja)
├── tsconfig.json                         # Konfiguracja kompilatora TypeScript (ES2022, CommonJS, strict)
├── esbuild.js                            # Główny bundler produkcyjny (dist/extension.js)
├── webpack.config.js                     # Alternatywna konfiguracja Webpack 5
├── .vscodeignore                         # Reguły wykluczeń podczas budowania paczki .vsix
├── media/
│   ├── icon.png                          # Monochromatyczna ikona rozszerzenia (256x256 PNG)
│   ├── icon.svg                          # Wektorowa ikona Activity Bar (Codicon style)
│   ├── webview.css                       # Arkusz stylów WebView oparty o tokeny motywów VS Code
│   └── webview.js                        # Logika frontendu WebView (CSP-compliant)
└── src/
    ├── extension.ts                      # Punkt wejścia: activate(), deactivate(), bootstrapContainer() oraz publiczne API
    ├── types/
    │   └── package.ts                    # Kontrakty domenowe oraz protokół komunikatów WebView
    ├── di/
    │   ├── container.ts                  # Kontener IoC (ServiceContainer: singleton, transient, child scopes)
    │   └── tokens.ts                     # Silnie typowane identyfikatory usług (ServiceToken<T>)
    ├── services/
    │   ├── loggerService.ts              # Logowanie strukturalne do OutputChannel VS Code
    │   ├── processRunner.ts              # Bezpieczne wykonywanie procesów potomnych (execFile bez powłoki)
    │   ├── pythonEnvironmentService.ts   # Detekcja Pythona 3.10+, .venv, uv, interpreterów lokalnych i multi-root
    │   ├── packageManagerService.ts      # Operacje pakietowe (uv-project, uv-pip, pip), uv tree oraz diff uv.lock
    │   ├── pypiSearchService.ts          # Wyszukiwanie na PyPI po fragmencie nazwy i opisie + PyPI JSON API
    │   └── vulnerabilityService.ts       # Audyt bezpieczeństwa pakietów (pip-audit CLI oraz API OSV.dev)
    ├── views/
    │   ├── installedPackagesTreeProvider.ts # TreeDataProvider dla widoku zainstalowanych pakietów
    │   ├── environmentTreeProvider.ts       # TreeDataProvider dla diagnostyki środowiska i szybkich akcji
    │   └── pyprojectCodeLensProvider.ts     # CodeLensProvider dla inline Upgrade/Update/Remove w pyproject.toml
    ├── webview/
    │   └── packageManagerPanel.ts        # Kontroler WebviewPanel z polityką CSP opartą o kryptograficzny nonce
    └── test/
        ├── runTests.ts                   # Punkt startowy testów (node:test)
        ├── mocks/
        │   ├── vscodeMock.ts             # Kompletny shim modułu 'vscode' dla środowiska headless Node.js
        │   └── mockServices.ts           # Mocki serwisów domenowych in-memory
        ├── unit/
        │   ├── container.test.ts
        │   ├── pythonEnvironmentService.test.ts
        │   └── packageManagerService.test.ts
        └── integration/
            └── extensionWorkflow.test.ts
```

---

## 2. Kontener Dependency Injection (`src/di/`)

### 2.1. `ServiceContainer` (`src/di/container.ts`)
Kontener IoC implementuje interfejs `IServiceContainer` bez użycia refleksji dekoratorów czasu wykonania (`reflect-metadata`), dzięki czemu zachowuje pełną kontrolę typów w TypeScript i zerowy narzut po bundlowaniu:

- **Cykle życia (`ServiceLifetime`)**:
  - `registerSingleton<T>(token, factory)` — leniwa inicjalizacja przy pierwszym `resolve()`, współdzielona instancja oraz automatyczne wywołanie `.dispose()` przy zamknięciu kontenera.
  - `registerTransient<T>(token, factory)` — nowa instancja przy każdym wywołaniu `resolve()`.
  - `registerInstance<T>(token, instance)` — rejestracja gotowej instancji zarządzanej z zewnątrz.
- **Wykrywanie zależności cyklicznych**:
  - Stos `resolutionStack: symbol[]` śledzi aktualną ścieżkę rozwiązywania zależności i rzuca wyjątek `Circular dependency detected while resolving services: A -> B -> A` w przypadku cyklu.
- **Kontenery potomne (`createChildContainer()`)**:
  - Pozwalają nadpisać wybrane serwisy (np. `IProcessRunner` lub `IPackageManagerService` w testach) przy zachowaniu pozostałych rejestracji z kontenera nadrzędnego.

### 2.2. Tokeny usług (`src/di/tokens.ts`)

| Token (`TOKENS.*`) | Interfejs / Typ | Cykl życia |
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

## 3. Warstwa Usług (`src/services/`)

### 3.1. `NodeProcessRunner` (`src/services/processRunner.ts`)
Odpowiada za bezpieczne wywoływanie binariów `uv`, `python`, `pip-audit`, `py`, `where.exe` oraz `which`:
- Wykorzystuje `child_process.execFile` (brak interpolacji powłoki `sh`/`cmd.exe`, co całkowicie eliminuje klasę podatności *Shell Command Injection*).
- Automatycznie wstrzykuje zmienne środowiskowe:
  - `UV_NO_PROGRESS=1` (czyste wyjście bez kodów sterujących pasków postępu),
  - `PYTHONUTF8=1` (spójne kodowanie UTF-8 na Windows i POSIX),
  - `PIP_DISABLE_PIP_VERSION_CHECK=1`.
- Obsługuje przekroczenie czasu (`timeoutMs`, domyślnie `120000 ms`), sygnały anulowania (`AbortSignal`) oraz bufor wyjścia do `10 MB`.
- Nigdy nie przerywa działania nieobsłużonym wyjątkiem przy niezerowym kodzie wyjścia — zwraca ustrukturyzowany obiekt `ProcessResult` (`exitCode`, `stdout`, `stderr`, `durationMs`, `timedOut`, `cancelled`).

### 3.2. `PythonEnvironmentService` (`src/services/pythonEnvironmentService.ts`)
Zarządza detekcją środowiska Pythona 3.10+, narzędzia `uv` oraz obsługą wielu folderów roboczych (*Multi-root Workspaces*):
- **Walidacja wersji Pythona (`validatePythonVersion`)**:
  - Wymusza minimalną wersję **Python 3.10** (`major > 3 || (major === 3 && minor >= 10)`).
- **Wykrywanie aktywnego interpretera (`detectEnvironment`)**:
  - Kolejność priorytetów:
    1. Jawna ścieżka w ustawieniu `uvPkgManager.pythonPath`,
    2. Wirtualne środowisko w katalogu projektu (`.venv`, `venv`, `.env`) lub zmienna `VIRTUAL_ENV` (`Scripts\python.exe` na Windows, `bin/python` na POSIX),
    3. Wynik polecenia `uv python find`,
    4. Systemowy interpreter `python` / `python3`.
- **Automatyczne wykrywanie lokalnych interpreterów (`discoverLocalInterpreters`)**:
  - Agreguje i deduplikuje interpretery z:
    1. Ustawienia `uvPkgManager.pythonPath` (`source: 'configured'`),
    2. Środowiska `.venv` w projekcie (`source: 'workspace-venv'`),
    3. `uv python list --only-installed --output-format json` (z fallbackiem do parsowania tekstowego `uv python list --only-installed`, `source: 'uv'`),
    4. Narzędzi systemowych: `py -0p` i `where.exe python` (Windows) lub `which -a python3 python` (Linux/macOS) (`source: 'system'`).
  - Sortuje wyniki: wspierane wersje (`>= 3.10`) przed niewspieranymi, interpretery bazowe przed `.venv`, a następnie malejąco po numerze wersji (`major.minor.patch`).
- **Multi-root Workspaces**:
  - Metody `getWorkspaceFolders()`, `getActiveWorkspaceRoot()`, `setActiveWorkspaceRoot()` pozwalają dynamicznie przełączać aktywny katalog główny bez restartu rozszerzenia.

### 3.3. `UvPackageManagerService` (`src/services/packageManagerService.ts`)
Główny serwis operacyjny wybierający automatycznie jeden z trzech backendów (`PackageManagerBackend`):

| Backend | Warunek aktywacji | Instalacja | Usuwanie | Aktualizacja | Lista pakietów |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`uv-project`** | `preferUv && uvAvailable && hasPyprojectToml` | `uv add [--dev] <spec>` | `uv remove <pkg>` | `uv lock --upgrade-package <pkg> && uv sync` (lub `uv add --upgrade-package`) | `uv pip list --format json` |
| **`uv-pip`** | `preferUv && uvAvailable && !hasPyprojectToml` | `uv pip install <spec>` | `uv pip uninstall <pkg>` | `uv pip install --upgrade <spec>` | `uv pip list --format json` |
| **`pip`** | `!preferUv \|\| !uvAvailable` | `python -m pip install <spec>` | `python -m pip uninstall -y <pkg>` | `python -m pip install --upgrade <spec>` | `python -m pip list --format json` |

Dodatkowe możliwości `UvPackageManagerService`:
- **Walidacja bezpieczeństwa wejścia**:
  - Nazwy pakietów są weryfikowane wyrażeniem zgodnym z PEP 508: `/^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/`.
  - Ograniczenia wersji są weryfikowane pod kątem operatorów PEP 440 (`==`, `!=`, `<=`, `>=`, `<`, `>`, `~=`, `===`).
- **Tworzenie środowiska wirtualnego (`createVirtualEnvironment`)**:
  - Wykonuje `uv venv <venvName> [--clear] [--seed] [--system-site-packages] [--python <basePython>]` lub `python -m venv [--clear] [--system-site-packages] <venvName>`.
- **Drzewo zależności (`getDependencyTree` i `parseUvTreeOutput`)**:
  - Uruchamia `uv tree [--invert]` (w projektach `uv-project`) lub `uv pip tree [--invert] [--python <py>]`.
  - Parser przekształca znaki ramki (`├── `, `└── `, `│   `) w drzewo obiektów `DependencyTreeNode` z rozpoznawaniem współdzielonych poddrzew `(*)`.
- **Zarządzanie manifestami i podgląd różnic (`previewLockfileSyncDiff`)**:
  - `initPyproject()` → `uv init --bare`
  - `syncProject()` → `uv sync`
  - `lockProject(upgrade)` → `uv lock [--upgrade]`
  - `installRequirementsTxt()` → `uv pip install -r requirements.txt` (lub `pip install -r`)
  - `exportRequirementsTxt()` → `uv pip freeze > requirements.txt`
  - `importRequirementsToPyproject()` → `uv add -r requirements.txt`
  - `previewLockfileSyncDiff()` → parsuje bloki `[[package]]` w `uv.lock`, porównuje z zainstalowanymi pakietami oraz uruchamia `uv sync --dry-run`, klasyfikując zmiany jako `install`, `upgrade`, `downgrade` lub `remove`.

### 3.4. `PyPiSearchService` (`src/services/pypiSearchService.ts`)
Obsługuje pobieranie szczegółów pakietu (`fetchPackageInfo`) oraz wieloźródłowe wyszukiwanie bibliotek (`searchPackages(query, mode, limit)`):
- **Tryby wyszukiwania (`PyPiSearchMode`)**:
  - `'all'` — dopasowanie w nazwie pakietu lub w opisie (`summary`),
  - `'name'` — dopasowanie wyłącznie po fragmencie nazwy pakietu,
  - `'description'` — dopasowanie wyłącznie po słowach kluczowych w opisie.
- **4-stopniowy potok wyszukiwania**:
  1. Wyszukiwarka HTML PyPI (`https://pypi.org/search/?q=...` — parser bloków `.package-snippet`),
  2. Wbudowany katalog popularnych bibliotek ekosystemu Python (`POPULAR_PYPI_SEED`) zawierający nazwy i opisy,
  3. Bezpośrednie sprawdzenie dopasowania nazwy w `https://pypi.org/pypi/<query>/json`,
  4. Indeks PEP 691 PyPI Simple (`https://pypi.org/simple/` z `Accept: application/vnd.pypi.simple.v1+json`) dla wyszukiwania podciągów nazw.
- Najlepsze dopasowania są wzbogacane równolegle z `https://pypi.org/pypi/<pkg>/json` o aktualny numer wydania, pełny opis, licencję i wymagania `requires_python`.

### 3.5. `VulnerabilityScannerService` (`src/services/vulnerabilityService.ts`)
Realizuje audyt bezpieczeństwa zainstalowanych bibliotek pod kątem znanych podatności CVE / GHSA / PYSEC:
1. **Tryb CLI (`pip-audit`)**: Próbuje uruchomić `<python> -m pip_audit --format json --progress-spinner off` lub `pip-audit --format json`. Obsługuje zarówno kod wyjścia `0` (brak podatności), jak i `1` (wykryto podatności w JSON).
2. **Tryb API (`OSV.dev`)**: Gdy `pip-audit` nie jest zainstalowany, wysyła zapytanie batchowe `POST https://api.osv.dev/v1/querybatch` dla ekosystemu `PyPI`, a dla wykrytych identyfikatorów luk pobiera pełne dane doradcze i wersje naprawcze (`fixed`) z `GET https://api.osv.dev/v1/vulns/<id>`.

---

## 4. Warstwa Prezentacji (`src/views/` i `src/webview/`)

### 4.1. `InstalledPackagesTreeProvider` (`uvPkgInstalledView`)
- Wyświetla listę zainstalowanych pakietów w pasku bocznym.
- Oznacza pakiety przestarzałe (`0.26.0 → 0.27.2`, `contextValue = 'outdatedPackage'`) oraz pakiety z wykrytymi podatnościami (`⚠ N vuln(s)`).
- Leniwie dociąga metadane pakietu (`uv pip show <pkg>`) przy rozwinięciu węzła (`Version`, `Latest`, `Summary`, `License`, `Author`, `Requires`, `Location` oraz szczegóły luk CVE/OSV).

### 4.2. `EnvironmentTreeProvider` (`uvPkgEnvView`)
- Prezentuje aktywny folder roboczy (`Workspace`), aktywny backend (`uv-project`, `uv-pip`, `pip`), wersję `uv`, wersję i ścieżkę Pythona, ścieżkę `.venv` oraz wykryte pliki manifestu.
- Zawiera rozwinięte grupy:
  - **Project Manifests & Actions** (szybkie wywołania kreatora `.venv Wizard`, `uv tree`, `Preview Lockfile Diff`, `Vulnerability Scan`, `Search PyPI`, `uv sync`, `uv lock`, `uv init`, `requirements.txt`),
  - **Available Local Pythons (N)** (lista wszystkich wykrytych lokalnie interpreterów Pythona z przyciskiem inline `+` do utworzenia `.venv` na wybranej wersji).

### 4.3. `PyprojectCodeLensProvider` (`src/views/pyprojectCodeLensProvider.ts`)
- Parsuje sekcje `[project]`, `[project.optional-dependencies]` oraz `[dependency-groups]` w otwartym pliku `pyproject.toml`.
- Nad każdą linią zależności renderuje przyciski CodeLens:
  - `↑ Upgrade <pkg> (<current> → <latest>)` (gdy dostępna jest nowsza wersja) lub `↻ Update <pkg>`,
  - `✕ Remove <pkg>`.

### 4.4. `PackageManagerPanel` i Protokół Komunikatów WebView
WebView stosuje restrykcyjną politykę **Content Security Policy (CSP)** z kryptograficznym 128-bitowym tokenem `nonce`:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
```

Komunikacja dwukierunkowa pomiędzy WebView (`media/webview.js`) a hostem rozszerzenia (`PackageManagerPanel`) jest w pełni typowana w `src/types/package.ts`:

- **Komunikaty przychodzące z WebView (`WebViewInboundMessage`)**:
  `ready`, `listPackages`, `installPackage`, `removePackage`, `updatePackage`, `inspectPackage`, `lookupPyPi`, `searchPyPi`, `selectPythonPath`, `createVirtualEnv`, `setPythonInterpreter`, `getDependencyTree`, `syncProject`, `lockProject`, `initPyproject`, `installRequirements`, `exportRequirements`, `importRequirementsToPyproject`, `openManifestFile`, `selectWorkspaceFolder`, `runVenvWizard`, `scanVulnerabilities`, `previewSyncDiff`.
- **Komunikaty wychodzące do WebView (`WebViewOutboundMessage`)**:
  `state`, `dependencyTree`, `vulnerabilityScanResult`, `lockfileSyncPreview`, `operationResult`, `packageDetails`, `pypiResult`, `pypiSearchResults`, `error`.

---

## 5. Publiczne API Rozszerzenia, Komendy i Konfiguracja

### 5.1. Publiczne API zwracane przez `activate()` (`ExtensionApi`)
Inne rozszerzenia VS Code oraz testy integracyjne mogą pobierać API z `activate()`:
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

### 5.2. Zarejestrowane Komendy VS Code

| ID Komendy | Opis działania |
| :--- | :--- |
| `uvPkgManager.openPanel` | Otwiera główny dashboard WebView |
| `uvPkgManager.listPackages` | Odświeża listę zainstalowanych i przestarzałych pakietów |
| `uvPkgManager.installPackage` | Instaluje pakiet (`uv add` / `uv pip install` / `pip install`) |
| `uvPkgManager.removePackage` | Usuwa pakiet (`uv remove` / `uv pip uninstall` / `pip uninstall -y`) |
| `uvPkgManager.updatePackage` | Aktualizuje pakiet (`uv lock --upgrade-package` + `uv sync` / `--upgrade`) |
| `uvPkgManager.selectPythonPath` | Wybór aktywnego interpretera Pythona 3.10+ z listy wykrytych lub z dysku |
| `uvPkgManager.createVirtualEnv` | Szybkie tworzenie środowiska `.venv` na wybranym interpreterze |
| `uvPkgManager.createVirtualEnvWizard` | 4-krokowy kreator `.venv` (folder, bazowy Python, nazwa katalogu, flagi `--seed` / `--system-site-packages`) |
| `uvPkgManager.selectWorkspaceFolder` | Przełączanie aktywnego folderu w środowisku Multi-root Workspace |
| `uvPkgManager.syncProject` | Synchronizacja środowiska z `pyproject.toml` i `uv.lock` (`uv sync`) |
| `uvPkgManager.lockProject` | Generowanie lub aktualizacja `uv.lock` (`uv lock`) |
| `uvPkgManager.initProject` | Inicjalizacja `pyproject.toml` (`uv init --bare`) |
| `uvPkgManager.installRequirements` | Instalacja zależności z `requirements.txt` (`uv pip install -r`) |
| `uvPkgManager.exportRequirements` | Eksport pakietów do `requirements.txt` (`uv pip freeze`) |
| `uvPkgManager.importRequirementsToPyproject` | Migracja `requirements.txt` do `pyproject.toml` (`uv add -r`) |
| `uvPkgManager.showDependencyTree` | Otwiera interaktywny graf drzewa zależności (`uv tree`) |
| `uvPkgManager.scanVulnerabilities` | Uruchamia audyt bezpieczeństwa pakietów (`pip-audit` / OSV.dev) |
| `uvPkgManager.previewSyncDiff` | Podgląd różnic między `uv.lock` a środowiskiem (`uv sync --dry-run`) |
| `uvPkgManager.searchPyPi` | Wyszukiwanie bibliotek na PyPI po fragmencie nazwy lub opisie |

### 5.3. Parametry Konfiguracji (`settings.json`)

| Klucz ustawienia | Typ | Domyślnie | Opis |
| :--- | :--- | :--- | :--- |
| `uvPkgManager.preferUv` | `boolean` | `true` | Preferuj `uv` zamiast `pip`, gdy `uv` jest dostępny |
| `uvPkgManager.uvPath` | `string` | `"uv"` | Ścieżka lub nazwa pliku wykonywalnego `uv` |
| `uvPkgManager.pythonPath` | `string` | `""` | Opcjonalna jawna ścieżka do interpretera Python 3.10+ |
| `uvPkgManager.checkOutdated` | `boolean` | `true` | Sprawdzaj dostępne aktualizacje podczas listowania pakietów |
| `uvPkgManager.commandTimeoutMs` | `number` | `120000` | Maksymalny czas wykonania komendy CLI w milisekundach (min. `5000`) |

---

## 6. Architektura Testów (`src/test/`)

Zestaw testowy wykorzystuje wbudowany runner `node:test` oraz `node:assert/strict` (Node.js 20+) i składa się z **26 testów w 4 zestawach**:

1. **Przechwytywanie modułu `vscode` (`src/test/mocks/vscodeMock.ts`)**:
   - Funkcja `installVscodeMock()` podpina się pod `Module._load` w Node.js, dzięki czemu wszystkie instrukcje `import * as vscode from 'vscode'` w kodzie produkcyjnym otrzymują obiekt `vscodeMock` (obsługujący `window`, `workspace`, `commands`, `languages`, `TreeItem`, `EventEmitter`, `CodeLens`, `Range`, `Uri` oraz kolejki `inputBoxQueue` i `quickPickQueue`).
2. **Testy jednostkowe (`src/test/unit/`)**:
   - `container.test.ts` (5 testów) — singletony, obiekty transient, dziedziczenie w kontenerach potomnych, detekcja cykli, zwalnianie zasobów `dispose()`.
   - `pythonEnvironmentService.test.ts` (6 testów) — walidacja wersji Python 3.10+, wybór backendu (`uv-project`, `uv-pip`, `pip`), wykrywanie i sortowanie lokalnych interpreterów Pythona, obsługa Multi-root Workspaces.
   - `packageManagerService.test.ts` (13 testów) — listowanie z `--outdated`, instalacja (`uv add --dev` z `extras`), usuwanie (`uv pip uninstall` vs `pip uninstall -y`), aktualizacja (`uv lock --upgrade-package` + `uv sync`), parsowanie `uv pip show`, walidacja PEP 508, tworzenie `.venv`, parsowanie grafu `uv tree`, operacje na `pyproject.toml`/`requirements.txt`, wyliczanie diffu `uv.lock`, audyt `pip-audit`/OSV.dev, generowanie CodeLens w `pyproject.toml` oraz wyszukiwanie na PyPI po nazwie i opisie.
3. **Testy integracyjne (`src/test/integration/extensionWorkflow.test.ts`)**:
   - Pełny cykl życia `activate()` → rejestracja komend, widoków TreeView i CodeLens → kreator `.venv` → instalacja/aktualizacja/usuwanie pakietów → skanowanie podatności → podgląd diffu `uv.lock` → wyszukiwanie PyPI → `deactivate()`.
   - Test integracyjny na rzeczywistym środowisku hosta weryfikujący komunikację z lokalnym `uv` oraz interpreterami Pythona 3.10+ w katalogu `sample-workspace/`.

---

## 7. Proces Budowania i Pakowania VSIX

```bash
# 1. Instalacja zależności deweloperskich
npm install

# 2. Sprawdzenie typów TypeScript i budowanie bundla deweloperskiego (out/ + dist/extension.js)
npm run compile

# 3. Uruchomienie pełnego zestawu 26 testów (unit + integration)
npm test

# 4. Zbudowanie zminifikowanego bundla produkcyjnego (esbuild --production)
npm run package

# 5. Alternatywne zbudowanie bundla przez Webpack 5
npm run bundle:webpack

# 6. Wygenerowanie instalatora VSIX (vsc-uv-package-manager-1.6.0.vsix)
npm run vsix
```
