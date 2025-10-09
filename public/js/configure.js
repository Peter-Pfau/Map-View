(function () {
  'use strict';

  const form = document.getElementById('config-form');
  const addAssetButton = document.getElementById('add-asset');
  const assetsContainer = document.getElementById('assets-container');
  const toastEl = document.getElementById('toast');
  const titleField = document.getElementById('map-title');
  const importButton = document.getElementById('import-assets');
  const importInput = document.getElementById('import-file');
  const exportJsonButton = document.getElementById('export-json');
  const exportCsvButton = document.getElementById('export-csv');

  let assetCounter = 0;

  if (!form || !addAssetButton || !assetsContainer) {
    return;
  }

  addAssetButton.addEventListener('click', () => addAssetRow());
  form.addEventListener('submit', handleSubmit);

  if (importButton && importInput) {
    importButton.addEventListener('click', () => {
      importInput.value = '';
      importInput.click();
    });
    importInput.addEventListener('change', handleImportFile);
  }

  if (exportJsonButton) {
    exportJsonButton.addEventListener('click', handleExportJson);
  }

  if (exportCsvButton) {
    exportCsvButton.addEventListener('click', handleExportCsv);
  }

  initializeForm();

  async function initializeForm() {
    resetAssetRows();

    try {
      const response = await fetch('/api/assets', { cache: 'no-store' });
      if (response.status === 404) {
        addAssetRow();
        return;
      }
      if (!response.ok) {
        throw new Error(`Unexpected status: ${response.status}`);
      }

      const data = await response.json();
      if (titleField && typeof data.title === 'string') {
        titleField.value = data.title;
      }

      const prepared = prepareAssets(Array.isArray(data.assets) ? data.assets : []);
      if (prepared.valid.length > 0) {
        prepared.valid.forEach(asset => addAssetRow(asset));
      } else {
        addAssetRow();
      }
    } catch (err) {
      console.error('Failed to load existing assets:', err);
      if (assetsContainer.childElementCount === 0) {
        addAssetRow();
      }
      showToast('Could not load existing assets. Add new entries below.', true);
    }
  }

  function addAssetRow(initialValues = {}) {
    assetCounter += 1;
    const row = document.createElement('div');
    row.className = 'asset-row';
    row.dataset.assetId = String(assetCounter);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-asset';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeAssetRow(row));

    const fields = document.createElement('div');
    fields.className = 'asset-row-fields';

    fields.appendChild(buildInput('Asset Name', 'asset-name', true, initialValues.name || ''));
    fields.appendChild(buildInput('City', 'asset-city', true, initialValues.city || ''));
    fields.appendChild(buildInput('State / Province', 'asset-state', true, initialValues.state || ''));
    fields.appendChild(buildInput('Notes (optional)', 'asset-notes', false, initialValues.notes || '', true));

    row.appendChild(removeButton);
    row.appendChild(fields);
    assetsContainer.appendChild(row);
  }

  function buildInput(labelText, inputName, required, value, isTextarea) {
    const wrapper = document.createElement('label');
    wrapper.className = 'input-label';
    wrapper.textContent = labelText;

    let field;
    if (isTextarea) {
      field = document.createElement('textarea');
    } else {
      field = document.createElement('input');
      field.type = 'text';
    }

    field.name = inputName;
    field.value = value;
    if (required) {
      field.required = true;
    }
    wrapper.appendChild(field);
    return wrapper;
  }

  function removeAssetRow(row) {
    const rows = assetsContainer.querySelectorAll('.asset-row');
    if (rows.length <= 1) {
      showToast('Keep at least one asset. Add another before removing this one.', true);
      return;
    }
    assetsContainer.removeChild(row);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = collectPayload();
    if (!payload) {
      return;
    }

    try {
      const response = await fetch('/api/assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorPayload.error || 'Failed to save assets');
      }

      showToast('Assets saved. Redirecting to map...');
      setTimeout(() => {
        window.location.href = '/';
      }, 800);
    } catch (err) {
      console.error('Save error:', err);
      showToast(err.message || 'Unable to save assets.', true);
    }
  }

  function handleImportFile(event) {
    const input = event.target;
    if (!input || !input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      importInput.value = '';
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        processImportedText(file.name || 'import', text);
      } catch (err) {
        console.error('Import processing error:', err);
        showToast(err.message || 'Unable to import file.', true);
      }
    };
    reader.onerror = () => {
      importInput.value = '';
      console.error('Failed to read file:', reader.error);
      showToast('Unable to read the selected file.', true);
    };
    reader.readAsText(file);
  }

  function processImportedText(filename, rawText) {
    if (typeof rawText !== 'string') {
      throw new Error('Unsupported file contents.');
    }

    const extension = getExtension(filename);
    let parsed;

    if (extension === 'json') {
      parsed = parseJsonPayload(rawText);
    } else if (extension === 'csv') {
      parsed = parseCsvPayload(rawText);
    } else {
      parsed = tryParseFallback(rawText);
    }

    applyImportedData(parsed, filename);
  }

  function applyImportedData(result, filename) {
    if (!result || !Array.isArray(result.assets)) {
      throw new Error('Import did not produce any assets.');
    }

    const appliedCount = setAssets(result.assets);
    if (titleField && typeof result.title === 'string' && result.title.trim()) {
      titleField.value = result.title.trim();
    }

    if (appliedCount === 0) {
      showToast('No valid assets found in the imported file.', true);
      return;
    }

    const skippedSuffix = result.skipped ? ` (${result.skipped} skipped)` : '';
    const suffix = appliedCount === 1 ? '' : 's';
    showToast(`Imported ${appliedCount} asset${suffix} from ${filename}${skippedSuffix}.`);
  }

  function handleExportJson() {
    const payload = collectPayload({ silent: true });
    if (!payload) {
      showToast('Add a title and at least one complete asset before exporting.', true);
      return;
    }

    const fileName = buildFileName(payload.title, 'json');
    const content = JSON.stringify(payload, null, 2);
    downloadFile(fileName, content, 'application/json');
    showToast(`Exported ${payload.assets.length} asset${payload.assets.length === 1 ? '' : 's'} to ${fileName}.`);
  }

  function handleExportCsv() {
    const payload = collectPayload({ silent: true });
    if (!payload) {
      showToast('Add a title and at least one complete asset before exporting.', true);
      return;
    }

    const fileName = buildFileName(payload.title, 'csv');
    const csv = convertToCsv(payload);
    downloadFile(fileName, csv, 'text/csv');
    showToast(`Exported ${payload.assets.length} asset${payload.assets.length === 1 ? '' : 's'} to ${fileName}.`);
  }

  function collectPayload(options = {}) {
    const { silent = false } = options;
    const title = titleField ? titleField.value.trim() : '';

    if (!title) {
      if (!silent) {
        showToast('Map title is required.', true);
      }
      return null;
    }

    const assets = [];
    const rows = assetsContainer.querySelectorAll('.asset-row');

    rows.forEach(row => {
      const nameField = row.querySelector('input[name="asset-name"]');
      const cityField = row.querySelector('input[name="asset-city"]');
      const stateField = row.querySelector('input[name="asset-state"]');
      const notesField = row.querySelector('textarea[name="asset-notes"]');

      const name = nameField ? nameField.value.trim() : '';
      const city = cityField ? cityField.value.trim() : '';
      const state = stateField ? stateField.value.trim() : '';
      const notes = notesField ? notesField.value.trim() : '';

      if (name && city && state) {
        assets.push({ name, city, state, notes });
      }
    });

    if (assets.length === 0) {
      if (!silent) {
        showToast('Add at least one complete asset (name, city, state).', true);
      }
      return null;
    }

    return { title, assets };
  }

  function setAssets(assets) {
    resetAssetRows();
    if (!Array.isArray(assets) || assets.length === 0) {
      addAssetRow();
      return 0;
    }
    assets.forEach(asset => addAssetRow(asset));
    return assets.length;
  }

  function resetAssetRows() {
    assetCounter = 0;
    assetsContainer.innerHTML = '';
  }

  function prepareAssets(rawAssets) {
    const result = { valid: [], skipped: 0 };
    if (!Array.isArray(rawAssets)) {
      return result;
    }
    rawAssets.forEach(item => {
      const normalized = normalizeAsset(item);
      if (normalized) {
        result.valid.push(normalized);
      } else {
        result.skipped += 1;
      }
    });
    return result;
  }

  function normalizeAsset(item) {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const name = toCleanString(item.name);
    const city = toCleanString(item.city);
    const state = toCleanString(item.state);
    const notes = toCleanString(item.notes, true);

    if (name && city && state) {
      return { name, city, state, notes };
    }
    return null;
  }

  function toCleanString(value, allowEmpty) {
    if (value == null) {
      return allowEmpty ? '' : '';
    }
    const text = String(value).trim();
    if (!text && !allowEmpty) {
      return '';
    }
    return text;
  }

  function parseJsonPayload(rawText) {
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (err) {
      throw new Error('File is not valid JSON.');
    }

    const collection = extractAssetCollection(data);
    if (collection.assets.length === 0) {
      throw new Error('JSON file does not contain any complete assets.');
    }
    return collection;
  }

  function tryParseFallback(rawText) {
    try {
      return parseJsonPayload(rawText);
    } catch (jsonErr) {
      try {
        return parseCsvPayload(rawText);
      } catch (csvErr) {
        throw jsonErr;
      }
    }
  }

  function extractAssetCollection(input) {
    let title = '';
    let rawAssets = [];

    if (Array.isArray(input)) {
      rawAssets = input;
    } else if (input && typeof input === 'object') {
      if (typeof input.title === 'string') {
        title = input.title.trim();
      }
      if (Array.isArray(input.assets)) {
        rawAssets = input.assets;
      } else {
        const candidates = Object.keys(input).filter(key => Array.isArray(input[key]));
        if (candidates.length > 0) {
          rawAssets = input[candidates[0]];
        }
      }
    }

    const prepared = prepareAssets(rawAssets);
    return { title, assets: prepared.valid, skipped: prepared.skipped };
  }

  function parseCsvPayload(rawText) {
    const rows = parseCsvRows(rawText);
    if (rows.length === 0) {
      throw new Error('CSV file is empty.');
    }

    const headers = rows[0].map(cell => cell.trim().toLowerCase());
    const required = ['name', 'city', 'state'];
    const missing = required.filter(header => !headers.includes(header));
    if (missing.length > 0) {
      throw new Error(`CSV is missing required columns: ${missing.join(', ')}.`);
    }

    const nameIndex = headers.indexOf('name');
    const cityIndex = headers.indexOf('city');
    const stateIndex = headers.indexOf('state');
    const notesIndex = headers.indexOf('notes');
    const titleIndex = headers.indexOf('title');

    const rawAssets = [];
    let detectedTitle = '';

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i].map(cell => cell.trim());
      const isEmptyRow = row.every(cell => cell === '');
      if (isEmptyRow) {
        continue;
      }

      rawAssets.push({
        name: row[nameIndex] || '',
        city: row[cityIndex] || '',
        state: row[stateIndex] || '',
        notes: notesIndex !== -1 ? row[notesIndex] || '' : ''
      });

      if (!detectedTitle && titleIndex !== -1) {
        const candidate = row[titleIndex];
        if (candidate) {
          detectedTitle = candidate;
        }
      }
    }

    const prepared = prepareAssets(rawAssets);
    if (prepared.valid.length === 0) {
      throw new Error('CSV file does not contain any complete assets.');
    }

    return { title: detectedTitle, assets: prepared.valid, skipped: prepared.skipped };
  }

  function parseCsvRows(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    const fields = [];

    const pushField = () => {
      fields.push(current);
      current = '';
    };

    const pushRow = () => {
      rows.push(fields.splice(0));
    };

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        pushField();
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && text[i + 1] === '\n') {
          i += 1;
        }
        pushField();
        pushRow();
        continue;
      }

      current += char;
    }

    pushField();
    if (fields.length) {
      pushRow();
    }

    return rows.filter(row => row.length > 0);
  }

  function convertToCsv(data) {
    const headers = ['title', 'name', 'city', 'state', 'notes'];
    const lines = [headers.join(',')];
    const title = data.title || '';

    data.assets.forEach(asset => {
      const line = [
        escapeCsvField(title),
        escapeCsvField(asset.name),
        escapeCsvField(asset.city),
        escapeCsvField(asset.state),
        escapeCsvField(asset.notes)
      ].join(',');
      lines.push(line);
    });

    return lines.join('\r\n');
  }

  function escapeCsvField(value) {
    const text = value == null ? '' : String(value);
    const needsQuotes = /[",\n\r]/.test(text);
    const sanitized = text.replace(/"/g, '""');
    if (needsQuotes) {
      return `"${sanitized}"`;
    }
    return sanitized;
  }

  function buildFileName(title, extension) {
    const baseTitle = title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
    const safeTitle = baseTitle ? baseTitle.slice(0, 60) : 'map-assets';
    return `${safeTitle}.${extension}`;
  }

  function downloadFile(filename, content, mimeType) {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (err) {
      console.error('Download failed:', err);
      showToast('Export failed. Check console for details.', true);
    }
  }

  function getExtension(filename) {
    if (!filename || typeof filename !== 'string') {
      return '';
    }
    const parts = filename.split('.');
    if (parts.length < 2) {
      return '';
    }
    return parts.pop().toLowerCase();
  }

  function showToast(message, isError) {
    if (!toastEl) {
      return;
    }
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    toastEl.classList.toggle('error', Boolean(isError));
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, 3500);
  }
})();
