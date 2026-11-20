(function () {
  // @ts-ignore acquireVsCodeApi is injected by VS Code WebView runtime
  const vscode = acquireVsCodeApi();

  const state = {
    environment: null,
    packages: [],
    busy: false,
    filter: '',
    outdatedOnly: false,
  };

  const envSummaryEl = document.getElementById('envSummary');
  const packageCountEl = document.getElementById('packageCount');
  const tableBodyEl = document.getElementById('packagesTableBody');
  const filterInputEl = document.getElementById('filterInput');
  const outdatedOnlyCheckboxEl = document.getElementById('outdatedOnlyCheckbox');
  const installFormEl = document.getElementById('installForm');
  const pkgNameInputEl = document.getElementById('pkgNameInput');
  const pkgVersionInputEl = document.getElementById('pkgVersionInput');
  const pkgDevCheckboxEl = document.getElementById('pkgDevCheckbox');
  const refreshBtnEl = document.getElementById('refreshBtn');
  const createVenvBtnEl = document.getElementById('createVenvBtn');
  const selectPythonBtnEl = document.getElementById('selectPythonBtn');
  const lookupBtnEl = document.getElementById('lookupBtn');
  const installBtnEl = document.getElementById('installBtn');
  const pypiPreviewEl = document.getElementById('pypiPreview');
  const detailsCardEl = document.getElementById('detailsCard');
  const detailsTitleEl = document.getElementById('detailsTitle');
  const detailsGridEl = document.getElementById('detailsGrid');
  const closeDetailsBtnEl = document.getElementById('closeDetailsBtn');
  const activityLogEl = document.getElementById('activityLog');

  function appendLog(line) {
    const timestamp = new Date().toLocaleTimeString();
    activityLogEl.textContent = `[${timestamp}] ${line}\n` + activityLogEl.textContent;
  }

  function setBusy(busy) {
    state.busy = busy;
    refreshBtnEl.disabled = busy;
    installBtnEl.disabled = busy;
    lookupBtnEl.disabled = busy;
    createVenvBtnEl.disabled = busy;
    selectPythonBtnEl.disabled = busy;
  }

  function renderEnvironment() {
    const env = state.environment;
    if (!env) {
      envSummaryEl.textContent = 'Detecting Python 3.10+ environment...';
      return;
    }

    const pyVer = env.pythonVersion ? `Python ${env.pythonVersion.raw}` : 'Python not found';
    const uvText = env.uvAvailable ? `uv ${env.uvVersion || 'ready'}` : 'pip fallback';
    const venvText = env.virtualEnvPath ? `venv: ${env.virtualEnvPath}` : 'no .venv';
    envSummaryEl.textContent = `${pyVer} | Backend: ${env.backend} (${uvText}) | ${venvText}`;
  }

  function renderPackages() {
    const query = state.filter.trim().toLowerCase();
    const filtered = state.packages.filter((pkg) => {
      if (state.outdatedOnly && !pkg.isOutdated) {
        return false;
      }
      if (query && !pkg.name.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });

    packageCountEl.textContent = String(filtered.length);
    tableBodyEl.replaceChildren();

    if (filtered.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = state.packages.length === 0
        ? 'No packages found in the current Python environment.'
        : 'No packages match your filter.';
      row.appendChild(cell);
      tableBodyEl.appendChild(row);
      return;
    }

    for (const pkg of filtered) {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.textContent = pkg.name;
      row.appendChild(nameCell);

      const versionCell = document.createElement('td');
      versionCell.textContent = pkg.version;
      row.appendChild(versionCell);

      const latestCell = document.createElement('td');
      const badge = document.createElement('span');
      if (pkg.isOutdated && pkg.latestVersion) {
        badge.className = 'badge badge-outdated';
        badge.textContent = pkg.latestVersion;
      } else {
        badge.className = 'badge badge-current';
        badge.textContent = 'Up to date';
      }
      latestCell.appendChild(badge);
      row.appendChild(latestCell);

      const actionsCell = document.createElement('td');
      const actionsGroup = document.createElement('div');
      actionsGroup.className = 'action-group';

      const inspectBtn = document.createElement('button');
      inspectBtn.type = 'button';
      inspectBtn.className = 'btn btn-secondary';
      inspectBtn.textContent = 'Inspect';
      inspectBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'inspectPackage', payload: { name: pkg.name } });
      });
      actionsGroup.appendChild(inspectBtn);

      if (pkg.isOutdated) {
        const updateBtn = document.createElement('button');
        updateBtn.type = 'button';
        updateBtn.className = 'btn btn-primary';
        updateBtn.textContent = 'Update';
        updateBtn.disabled = state.busy;
        updateBtn.addEventListener('click', () => {
          appendLog(`Updating ${pkg.name}...`);
          vscode.postMessage({ type: 'updatePackage', payload: { name: pkg.name } });
        });
        actionsGroup.appendChild(updateBtn);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-danger';
      removeBtn.textContent = 'Remove';
      removeBtn.disabled = state.busy;
      removeBtn.addEventListener('click', () => {
        appendLog(`Removing ${pkg.name}...`);
        vscode.postMessage({ type: 'removePackage', payload: { name: pkg.name } });
      });
      actionsGroup.appendChild(removeBtn);

      actionsCell.appendChild(actionsGroup);
      row.appendChild(actionsCell);
      tableBodyEl.appendChild(row);
    }
  }

  function renderDetails(name, details) {
    detailsTitleEl.textContent = `Package Details: ${name}`;
    detailsGridEl.replaceChildren();

    if (!details) {
      const dt = document.createElement('dt');
      dt.textContent = 'Status';
      const dd = document.createElement('dd');
      dd.textContent = 'Metadata unavailable.';
      detailsGridEl.append(dt, dd);
      detailsCardEl.classList.remove('hidden');
      return;
    }

    const entries = [
      ['Version', details.version],
      ['Summary', details.summary || '—'],
      ['Author', details.author || '—'],
      ['License', details.license || '—'],
      ['Homepage', details.homePage || '—'],
      ['Requires', details.requires.length ? details.requires.join(', ') : 'None'],
      ['Required By', details.requiredBy.length ? details.requiredBy.join(', ') : 'None'],
      ['Location', details.location || '—'],
    ];

    for (const [label, value] of entries) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      detailsGridEl.append(dt, dd);
    }

    detailsCardEl.classList.remove('hidden');
  }

  function renderPyPiPreview(query, info, error) {
    pypiPreviewEl.replaceChildren();
    pypiPreviewEl.classList.remove('hidden');

    if (error) {
      pypiPreviewEl.textContent = `PyPI lookup error for "${query}": ${error}`;
      return;
    }
    if (!info) {
      pypiPreviewEl.textContent = `Package "${query}" was not found on PyPI.`;
      return;
    }

    const title = document.createElement('strong');
    title.textContent = `${info.name} ${info.version}`;
    const summary = document.createElement('div');
    summary.textContent = info.summary || 'No summary provided.';
    const meta = document.createElement('div');
    meta.style.color = 'var(--muted)';
    meta.textContent = `License: ${info.license || 'Unknown'} | Python: ${info.requiresPython || 'Any'}`;

    pypiPreviewEl.append(title, summary, meta);
  }

  refreshBtnEl.addEventListener('click', () => {
    appendLog('Refreshing package list...');
    vscode.postMessage({ type: 'listPackages', checkOutdated: true });
  });

  createVenvBtnEl.addEventListener('click', () => {
    appendLog('Creating .venv virtual environment...');
    vscode.postMessage({ type: 'createVirtualEnv' });
  });

  selectPythonBtnEl.addEventListener('click', () => {
    vscode.postMessage({ type: 'selectPythonPath' });
  });

  filterInputEl.addEventListener('input', (event) => {
    state.filter = event.target.value;
    renderPackages();
  });

  outdatedOnlyCheckboxEl.addEventListener('change', (event) => {
    state.outdatedOnly = event.target.checked;
    renderPackages();
  });

  lookupBtnEl.addEventListener('click', () => {
    const name = pkgNameInputEl.value.trim();
    if (!name) {
      return;
    }
    appendLog(`Looking up "${name}" on PyPI...`);
    vscode.postMessage({ type: 'lookupPyPi', payload: { name } });
  });

  installFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = pkgNameInputEl.value.trim();
    if (!name) {
      return;
    }
    const versionConstraint = pkgVersionInputEl.value.trim() || undefined;
    const dev = pkgDevCheckboxEl.checked;
    appendLog(`Installing ${name}${versionConstraint ? ` ${versionConstraint}` : ''}...`);
    vscode.postMessage({
      type: 'installPackage',
      payload: { name, versionConstraint, dev },
    });
  });

  closeDetailsBtnEl.addEventListener('click', () => {
    detailsCardEl.classList.add('hidden');
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || !msg.type) {
      return;
    }

    switch (msg.type) {
      case 'state': {
        state.environment = msg.payload.environment;
        state.packages = msg.payload.packages;
        setBusy(msg.payload.busy);
        renderEnvironment();
        renderPackages();
        break;
      }
      case 'operationResult': {
        const res = msg.payload;
        appendLog(`${res.success ? 'OK' : 'FAILED'} [${res.command}] -> ${res.message} (${res.durationMs}ms)`);
        if (res.success && res.operation === 'install') {
          pkgNameInputEl.value = '';
          pkgVersionInputEl.value = '';
        }
        break;
      }
      case 'packageDetails': {
        renderDetails(msg.payload.name, msg.payload.details);
        break;
      }
      case 'pypiResult': {
        renderPyPiPreview(msg.payload.query, msg.payload.info, msg.payload.error);
        break;
      }
      case 'error': {
        appendLog(`ERROR: ${msg.payload.message}`);
        break;
      }
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
