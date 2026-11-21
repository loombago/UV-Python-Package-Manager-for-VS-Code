# Podręcznik Użytkownika (User Manual) — Loombago UV Python Package Manager (`v1.6.0`)

- **Nazwa rozszerzenia:** Loombago UV Python Package Manager
- **Identyfikator:** `loombago.vsc-uv-package-manager`
- **Wersja:** `1.6.0`
- **Repozytorium:** https://github.com/loombago/UV-Python-Package-Manager-for-VS-Code
- **Kontakt z autorem:** wesmarand@gmail.com
- **Licencja:** MIT

---

## 1. Wprowadzenie i Wymagania Wstępne

**Loombago UV Python Package Manager** to rozszerzenie dla Visual Studio Code przeznaczone do wygodnego zarządzania pakietami i wirtualnymi środowiskami Pythona bezpośrednio z poziomu edytora. Rozszerzenie integruje nowoczesny, ultraszybki menedżer **`uv`**, zachowując przy tym pełną kompatybilność z klasycznym **`pip`**.

### Wymagania systemowe
- **Visual Studio Code:** wersja `1.95.0` lub nowsza.
- **Python:** wersja **`3.10` lub wyższa** (rozszerzenie automatycznie waliduje wersję aktywnego interpretera).
- **Menedżer pakietów `uv` (zalecany):** jeśli `uv` jest zainstalowany i dostępny w `PATH` (lub skonfigurowany w `uvPkgManager.uvPath`), rozszerzenie automatycznie używa trybów `uv-project` (dla projektów z `pyproject.toml`) lub `uv-pip`. W przypadku braku `uv` rozszerzenie automatycznie przełącza się na fallback `python -m pip`.

### Instalacja rozszerzenia
1. **Z pliku instalacyjnego `.vsix`:**
   - Otwórz VS Code, przejdź do widoku **Extensions** (`Ctrl+Shift+X` / `Cmd+Shift+X`).
   - Kliknij ikonę `...` w prawym górnym rogu panelu rozszerzeń i wybierz **Install from VSIX...**.
   - Wskaż plik `vsc-uv-package-manager-1.6.0.vsix`.
2. **Z poziomu terminala:**
   ```bash
   code --install-extension vsc-uv-package-manager-1.6.0.vsix
   ```

---

## 2. Szybki Start (Quick Start)

1. **Otwórz swój folder z projektem Pythona** w VS Code (`File → Open Folder...`).
2. **Otwórz pasek boczny rozszerzenia**, klikając ikonę **UV Python** na pasku aktywności (*Activity Bar* po lewej stronie).
3. **Utwórz środowisko wirtualne `.venv` (jeśli projekt jeszcze go nie ma):**
   - Kliknij akcję **`Create .venv Wizard`** w widoku `Python & uv Environment` lub uruchom z Palety Poleceń (`Ctrl+Shift+P` / `Cmd+Shift+P`) komendę **`UV Python: Create Virtual Environment Wizard (.venv)`**.
4. **Otwórz główny dashboard WebView:**
   - Wciśnij `Ctrl+Shift+P` (`Cmd+Shift+P` na macOS) i wpisz **`UV Python: Open Package Manager Panel`**, lub kliknij ikonę otwierania panelu w nagłówku widoku *Installed Packages*.
5. **Zainstaluj pierwszą bibliotekę:**
   - Wyszukaj pakiet na PyPI po fragmencie nazwy lub opisie albo wpisz nazwę bezpośrednio w formularzu instalacji i kliknij **`Install`**.

---

## 3. Pasek Boczny (Activity Bar)

Po kliknięciu ikony rozszerzenia w *Activity Bar* zobaczysz dwa główne widoki drzewa:

### 3.1. Widok `Python & uv Environment`
Prezentuje bieżącą diagnostykę środowiska oraz szybkie akcje projektowe:
- **Informacje o środowisku:**
  - **Workspace:** nazwa i ścieżka aktywnego folderu roboczego (w trybie Multi-root pozwala przełączać projekt).
  - **Backend:** aktualnie używany silnik poleceń:
    - `uv-project` — gdy projekt posiada `pyproject.toml` i dostępny jest `uv` (używa `uv add`, `uv remove`, `uv sync`, `uv lock`),
    - `uv-pip` — gdy `uv` jest dostępny, ale folder nie ma `pyproject.toml` (używa `uv pip install/uninstall`),
    - `pip` — tryb awaryjny z użyciem `python -m pip`.
  - **uv:** wykryta wersja narzędzia `uv`.
  - **Python:** numer wersji oraz pełna ścieżka do aktywnego interpretera Pythona `3.10+`.
  - **Virtual Env:** ścieżka do wykrytego środowiska `.venv` / `venv` / `.env`.
- **Sekcja `Project Manifests & Actions`:**
  - Jednym kliknięciem uruchomisz tutaj: **Kreator `.venv` Wizard**, **Drzewo Zależności (`uv tree`)**, **Podgląd diffu `uv.lock`**, **Skaner Podatności**, **Wyszukiwarkę PyPI**, a także **`uv sync`**, **`uv lock`**, **`uv init --bare`** oraz operacje na **`requirements.txt`**.
- **Sekcja `Available Local Pythons`:**
  - Automatycznie wykrywa wszystkie interpretery Pythona zainstalowane lokalnie w systemie (z `uv python list`, rejestru `py -0p`, `where.exe`/`which` oraz lokalnego `.venv`).
  - Przy każdej wersji znajduje się przycisk inline **`+`** pozwalający jednym kliknięciem utworzyć `.venv` dokładnie na bazie wybranej wersji Pythona.

### 3.2. Widok `Installed Packages`
Wyświetla wszystkie pakiety zainstalowane w aktywnym środowisku:
- **Oznaczenia aktualizacji:** przestarzałe biblioteki są wyraźnie oznaczone wersją docelową (np. `0.26.0 → 0.27.2`).
- **Alerty bezpieczeństwa:** pakiety zawierające wykryte luki bezpieczeństwa wyświetlają ostrzeżenie `⚠ N vuln(s)`.
- **Rozwijane szczegóły pakietu:** po kliknięciu strzałki przy nazwie pakietu wczytywane są metadane (`Version`, `Latest`, `Summary`, `License`, `Author`, `Requires`, `Location` oraz szczegóły podatności CVE/OSV).
- **Akcje inline na elemencie listy:** kliknięcie przycisku przy nazwie pakietu umożliwia bezpośrednią aktualizację lub odinstalowanie pakietu bez otwierania pełnego dashboardu.

---

## 4. Interaktywny Dashboard WebView (`UV & Python Package Manager`)

Główny panel WebView zapewnia scentralizowane miejsce do pełnej obsługi środowiska i bibliotek.

### 4.1. Pasek Środowiska i Przełącznik Multi-root Workspace
Na górze panelu znajduje się pasek kontekstu środowiska:
- **Przełącznik Workspace:** w projektach wielokatalogowych (*Multi-root Workspaces*) pozwala wybrać z listy rozwijanej folder, w którym mają być wykonywane operacje.
- **Wybór lokalnego interpretera Pythona:** lista rozwijana ze wszystkimi wykrytymi lokalnie wersjami Pythona `3.10+` oraz przyciski szybkich akcji:
  - **`.venv Wizard`** — uruchamia 4-krokowy kreator środowiska wirtualnego,
  - **`Select Python`** — otwiera selektor interpretera lub okno wyboru pliku na dysku,
  - **`Quick .venv`** — natychmiast tworzy standardowe środowisko `.venv`.

### 4.2. Zarządzanie Manifestami (`pyproject.toml`, `uv.lock`, `requirements.txt`)
Sekcja zarządzania projektem udostępnia przyciski odpowiadające kluczowym poleceniom `uv`:
- **`Init pyproject.toml`** — inicjuje nowy plik `pyproject.toml` w bieżącym katalogu (`uv init --bare`).
- **`uv sync`** — synchronizuje zainstalowane pakiety z zawartością `pyproject.toml` i `uv.lock`.
- **`Preview Sync Diff`** — wykonuje bezpieczną symulację (`uv sync --dry-run` + porównanie bloków `[[package]]` z `uv.lock`) i pokazuje tabelę zmian przed właściwą instalacją (`install`, `upgrade`, `downgrade`, `remove`).
- **`uv lock`** — generuje lub odświeża plik blokady `uv.lock`.
- **`uv lock --upgrade`** — przelicza i aktualizuje wersje w `uv.lock` do najnowszych zgodnych wydań.
- **`Install requirements.txt`** — instaluje pakiety z pliku `requirements.txt`.
- **`Export requirements.txt`** — zapisuje aktualną listę zainstalowanych pakietów do `requirements.txt` (`uv pip freeze`).
- **`Import reqs → pyproject`** — migruje zależności z `requirements.txt` do sekcji projektu w `pyproject.toml` (`uv add -r requirements.txt`).

### 4.3. Wyszukiwanie i Instalacja Pakietów z PyPI (`v1.6.0`)
Panel zawiera rozbudowaną wyszukiwarkę repozytorium PyPI oraz formularz instalacji:
- **Tryby wyszukiwania (`PyPiSearchMode`):**
  - **Name or Description** — szuka dopasowań zarówno w nazwie biblioteki, jak i w jej opisie,
  - **Name Fragment Only** — zawęża wyszukiwanie wyłącznie do fragmentów nazw pakietów (korzysta m.in. z indeksu PyPI Simple),
  - **Description Only** — wyszukuje pakiety na podstawie słów kluczowych zawartych w opisie biblioteki.
- **Przyciski wyszukiwania:**
  - **`Search PyPI`** — wyświetla tabelę wyników z kolumnami *Package*, *Latest*, *Match*, *Description* oraz *Action*. Kolumna *Action* pozwala jednym kliknięciem wypełnić formularz przyciskiem **`Use`** lub od razu uruchomić instalację przyciskiem **`Install`**.
  - **`Exact Info`** — pobiera szczegółowe informacje dla wpisanej dokładnej nazwy pakietu z PyPI JSON API (wersja, licencja, wymagany Python, opis).
- **Formularz instalacji:**
  - **Nazwa pakietu:** np. `httpx` lub `requests`.
  - **Ograniczenie wersji:** opcjonalny zapis zgodny z PEP 440, np. `>=0.27.0`, `==2.32.3`, `~=1.4`.
  - **Extras:** opcjonalna lista dodatkowych funkcji oddzielona przecinkami, np. `http2,socks`.
  - **Checkbox `--dev`:** dodaje pakiet jako zależność deweloperską (`uv add --dev`) w projektach opartych o `pyproject.toml`.

### 4.4. Interaktywne Drzewo Zależności (`uv tree`)
Sekcja wizualizacji grafu zależności pozwala zbadać relacje między bibliotekami:
- **`Show Tree`** — generuje interaktywne, rozwijane drzewo zależności (`uv tree` / `uv pip tree`).
- **Checkbox `Invert (--invert)`** — odwraca drzewo, pokazując które pakiety nadrzędne wymagają wskazanej zależności.
- **Pole filtrowania drzewa** — pozwala szybko podświetlić i odnaleźć szukany węzeł w złożonych drzewach zależności.
- **Oznaczenie `(*)`** — sygnalizuje poddrzewo współdzielone, które zostało już rozwinięte w innej gałęzi grafu.

### 4.5. Skaner Podatności Bezpieczeństwa (`Vulnerability Audit`)
Sekcja audytu bezpieczeństwa weryfikuje zainstalowane biblioteki pod kątem znanych luk:
- **`Run Audit`** — uruchamia skanowanie:
  1. W pierwszej kolejności próbuje użyć lokalnego narzędzia **`pip-audit`** (`--format json`), jeśli jest dostępne.
  2. Jeśli `pip-audit` nie jest zainstalowany, automatycznie odpytuje bazę **`OSV.dev API`** (agregującą dane z PyPA Advisory Database, GitHub Security Advisories oraz NVD/CVE).
- **Wyniki audytu:** wyświetla listę wykrytych luk (identyfikator CVE/GHSA/PYSEC, zainfekowany pakiet i wersję, opis problemu oraz sugerowane wersje naprawcze).
- **Szybka naprawa (`Fix → <version>`):** dla luk posiadających znaną bezpieczną wersję docelową widoczny jest przycisk natychmiastowej aktualizacji pakietu.

### 4.6. Tabela Zainstalowanych Pakietów
Główna tabela prezentuje wszystkie biblioteki w aktywnym środowisku:
- **Filtrowanie w czasie rzeczywistym:** wpisanie tekstu natychmiast zawęża listę po nazwie pakietu.
- **Przyciski **`Refresh`** i **`Check Outdated`**:** odświeżają stan oraz sprawdzają dostępne nowsze wydania na PyPI.
- **Akcje w wierszu pakietu:**
  - **`Details`** — otwiera podgląd metadanych (`uv pip show`),
  - **`Update`** — aktualizuje pakiet do najnowszej wersji,
  - **`Remove`** — odinstalowuje pakiet ze środowiska (i z `pyproject.toml` w trybie `uv-project`).

---

## 5. Kreator Środowiska Wirtualnego (`.venv Creation Wizard`)

Komenda **`UV Python: Create Virtual Environment Wizard (.venv)`** przeprowadza użytkownika przez 4 przejrzyste kroki:
1. **Krok 1 — Wybór folderu projektu:** wskazanie folderu docelowego (szczególnie przydatne w konfiguracji Multi-root Workspace).
2. **Krok 2 — Wybór bazowego interpretera Python 3.10+:** wybór spośród automatycznie wykrytych wersji Pythona w systemie lub podanie własnej ścieżki.
3. **Krok 3 — Nazwa katalogu środowiska:** domyślnie `.venv` (można wpisać np. `venv` lub `.env`). Jeśli katalog już istnieje, kreator pyta o potwierdzenie nadpisania (`--clear`).
4. **Krok 4 — Flagi tworzenia środowiska:** możliwość włączenia opcji `--seed` (instalacja `pip`/`setuptools`/`wheel` wewnątrz środowiska) oraz `--system-site-packages` (dziedziczenie globalnych pakietów systemowych).

---

## 6. Akcje Inline CodeLens w pliku `pyproject.toml`

Po otwarciu dowolnego pliku `pyproject.toml` w edytorze VS Code rozszerzenie automatycznie analizuje tablice zależności w sekcjach `[project]`, `[project.optional-dependencies]` oraz `[dependency-groups]`.

Bezpośrednio nad każdą linią zależności pojawiają się interaktywne przyciski **CodeLens**:
- **`↑ Upgrade <pakiet> (<aktualna> → <najnowsza>)`** — pojawia się, gdy w środowisku wykryto nowszą dostępną wersję na PyPI; kliknięcie uruchamia aktualizację pakietu.
- **`↻ Update <pakiet>`** — umożliwia sprawdzenie i wymuszenie aktualizacji zależności, gdy pakiet nie jest oznaczony jako przestarzały.
- **`✕ Remove <pakiet>`** — usuwa zależność z projektu jednym kliknięciem.

---

## 7. Pełna Lista Komend Palety Poleceń (`Ctrl+Shift+P` / `Cmd+Shift+P`)

| ID Komendy | Nazwa w Palecie Poleceń | Opis |
| :--- | :--- | :--- |
| `uvPkgManager.openPanel` | `UV Python: Open Package Manager Panel` | Otwiera główny panel dashboard WebView |
| `uvPkgManager.listPackages` | `UV Python: List Installed Packages` | Odświeża listę zainstalowanych i przestarzałych pakietów |
| `uvPkgManager.installPackage` | `UV Python: Install Package` | Uruchamia kreator instalacji pakietu z PyPI |
| `uvPkgManager.removePackage` | `UV Python: Remove Package` | Odinstalowuje wybrany pakiet |
| `uvPkgManager.updatePackage` | `UV Python: Update Package` | Aktualizuje wybrany pakiet |
| `uvPkgManager.selectPythonPath` | `UV Python: Select Python Interpreter` | Pozwala wybrać aktywny interpreter Pythona `3.10+` |
| `uvPkgManager.createVirtualEnv` | `UV Python: Create Virtual Environment (.venv)` | Tworzy wirtualne środowisko `.venv` |
| `uvPkgManager.createVirtualEnvWizard` | `UV Python: Create Virtual Environment Wizard (.venv)` | Uruchamia 4-krokowy kreator środowiska wirtualnego |
| `uvPkgManager.selectWorkspaceFolder` | `UV Python: Select Workspace Folder` | Przełącza aktywny folder w trybie Multi-root |
| `uvPkgManager.syncProject` | `UV Python: Sync Project (uv sync)` | Synchronizuje środowisko z `pyproject.toml` i `uv.lock` |
| `uvPkgManager.lockProject` | `UV Python: Lock Dependencies (uv lock)` | Generuje lub odświeża plik `uv.lock` |
| `uvPkgManager.initProject` | `UV Python: Initialize pyproject.toml (uv init)` | Tworzy szkielet `pyproject.toml` (`uv init --bare`) |
| `uvPkgManager.installRequirements` | `UV Python: Install from requirements.txt` | Instaluje pakiety z pliku `requirements.txt` |
| `uvPkgManager.exportRequirements` | `UV Python: Export requirements.txt (freeze)` | Eksportuje listę pakietów do `requirements.txt` |
| `uvPkgManager.importRequirementsToPyproject` | `UV Python: Import requirements.txt to pyproject.toml` | Migruje zależności z `requirements.txt` do `pyproject.toml` |
| `uvPkgManager.showDependencyTree` | `UV Python: Show Dependency Tree (uv tree)` | Otwiera drzewo zależności projektu w panelu WebView |
| `uvPkgManager.scanVulnerabilities` | `UV Python: Scan Packages for Vulnerabilities` | Skanuje zainstalowane pakiety pod kątem podatności CVE/OSV |
| `uvPkgManager.previewSyncDiff` | `UV Python: Preview Lockfile Sync Diff` | Pokazuje podgląd różnic przed uruchomieniem `uv sync` |
| `uvPkgManager.searchPyPi` | `UV Python: Search PyPI Packages` | Otwiera szybkie wyszukiwanie bibliotek na PyPI po nazwie lub opisie |

---

## 8. Konfiguracja Rozszerzenia (`settings.json`)

Wszystkie opcje rozszerzenia można dostosować w Ustawieniach VS Code (`Ctrl+,`) lub bezpośrednio w pliku `settings.json`:

| Klucz ustawienia | Typ | Domyślnie | Opis |
| :--- | :--- | :--- | :--- |
| `uvPkgManager.preferUv` | `boolean` | `true` | Preferuj `uv` zamiast `pip`, jeśli `uv` jest dostępny w systemie |
| `uvPkgManager.uvPath` | `string` | `"uv"` | Nazwa polecenia lub bezwzględna ścieżka do pliku wykonywalnego `uv` |
| `uvPkgManager.pythonPath` | `string` | `""` | Opcjonalna jawna ścieżka do konkretnego interpretera Python `3.10+` |
| `uvPkgManager.checkOutdated` | `boolean` | `true` | Automatycznie sprawdzaj dostępne aktualizacje pakietów podczas listowania |
| `uvPkgManager.commandTimeoutMs` | `number` | `120000` | Limit czasu wykonania pojedynczej komendy CLI w milisekundach (min. `5000`) |

### Przykładowa konfiguracja w `.vscode/settings.json`
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

## 9. Rozwiązywanie Problemów (Troubleshooting & FAQ)

- **Rozszerzenie nie wykrywa `uv` mimo instalacji w systemie:**
  - Upewnij się, że katalog z plikiem binarnym `uv` znajduje się w systemowej zmiennej `PATH`, albo wpisz pełną ścieżkę w ustawieniu `uvPkgManager.uvPath` (np. `C:\\Users\\Nazwa\\.local\\bin\\uv.exe` lub `~/.local/bin/uv`).
- **Komunikat o zbyt starej wersji Pythona (`< 3.10`):**
  - Rozszerzenie obsługuje wyłącznie **Pythona 3.10+**. Użyj akcji `Select Python` lub sekcji `Available Local Pythons`, aby przełączyć środowisko na Pythona `3.10` lub nowszego, albo utwórz nowe `.venv` za pomocą kreatora.
- **Czy skaner podatności działa, jeśli nie mam zainstalowanego `pip-audit`?**
  - Tak. Jeśli lokalny `pip-audit` nie jest dostępny, skaner automatycznie wysyła zapytanie zbiorcze do publicznego **OSV.dev API** dla ekosystemu PyPI. Wymaga to jedynie połączenia z internetem.
- **Wyszukiwanie na PyPI nie zwraca wyników lub działa wolno:**
  - Sprawdź dostęp do sieci i upewnij się, że ruch wychodzący do `https://pypi.org` nie jest blokowany przez zaporę lub proxy korporacyjne.
- **Gdzie sprawdzić szczegółowe logi wykonywanych poleceń `uv` / `pip`?**
  - Otwórz panel **Output** w VS Code (`Ctrl+Shift+U` / `Cmd+Shift+U`) i wybierz z listy rozwijanej po prawej stronie kanał **`UV Python Package Manager`**. Znajdziesz tam wszystkie dokładne wywołania CLI, czasy wykonania oraz pełne komunikaty błędów.

---

## 10. Kontakt, Repozytorium i Nota Prawna

- **Autor i kontakt:** `wesmarand@gmail.com`
- **Kod źródłowy i zgłoszenia błędów (Issues):** https://github.com/loombago/UV-Python-Package-Manager-for-VS-Code
- **Licencja:** MIT License

### Nota Prawna / Wyłączenie Odpowiedzialności
Oprogramowanie jest udostępniane **„TAK JAK JEST” (*AS IS*)**, bez jakiejkolwiek gwarancji — wyraźnej ani dorozumianej — w tym między innymi gwarancji przydatności handlowej, przydatności do określonego celu oraz nienaruszania praw osób trzecich.

W żadnym wypadku autor ani właściciele praw autorskich nie ponoszą odpowiedzialności za jakiekolwiek roszczenia, szkody lub inne zobowiązania (czy to wynikające z umowy, deliktu, czy z innej podstawy prawnej), w tym za utratę danych, uszkodzenie projektów, konfiguracji środowisk Pythona ani przestoje w pracy powstałe w związku z instalacją, używaniem lub niemożnością używania tego oprogramowania. Zgodnie z warunkami licencji **MIT** użytkownik korzysta z rozszerzenia wyłącznie na własne ryzyko.
