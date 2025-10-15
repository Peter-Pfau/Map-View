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
  const remoteExportJsonButton = document.getElementById('remote-export-json');
  const remoteExportCsvButton = document.getElementById('remote-export-csv');
  const remoteUrlField = document.getElementById('api-url');
  const testConnectionButton = document.getElementById('test-connection');
  const apiFormatInfoButton = document.getElementById('api-format-info');
  const apiFormatModal = document.getElementById('api-format-modal');
  const modalCloseButton = document.getElementById('modal-close');
  const assetsSection = document.querySelector('.assets-section');
  const sourceTabs = Array.from(document.querySelectorAll('[data-source-tab]'));
  const sourceTablist = document.querySelector('.source-tabs');
  const sourcePanes = {
    local: document.getElementById('local-source-pane'),
    remote: document.getElementById('remote-source-pane')
  };

  let assetCounter = 0;
  let activeSource = 'local';

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

  remoteExportJsonButton?.addEventListener('click', handleExportJson);
  remoteExportCsvButton?.addEventListener('click', handleExportCsv);

  sourceTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.sourceTab;
      if (target === 'local' || target === 'remote') {
        setActiveSource(target);
      }
    });
  });
  sourceTablist?.addEventListener('keydown', handleSourceTabKeydown);
  remoteUrlField?.addEventListener('input', handleRemoteUrlInput);
  testConnectionButton?.addEventListener('click', handleTestConnection);
  
  // Modal event listeners
  apiFormatInfoButton?.addEventListener('click', openModal);
  modalCloseButton?.addEventListener('click', closeModal);
  apiFormatModal?.addEventListener('click', handleModalBackdropClick);
  document.addEventListener('keydown', handleModalKeydown);

  syncSourceUI();
  initializeForm();

  function setActiveSource(source) {
    if (source !== 'local' && source !== 'remote') {
      return;
    }
    activeSource = source;
    syncSourceUI();
  }

  function syncSourceUI() {
    sourceTabs.forEach(tab => {
      const tabSource = tab.dataset.sourceTab;
      const isActive = tabSource === activeSource;
      tab.classList.toggle('source-tab--active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    Object.entries(sourcePanes).forEach(([key, pane]) => {
      if (!pane) {
        return;
      }
      const isActive = key === activeSource;
      if (isActive) {
        pane.removeAttribute('hidden');
        pane.setAttribute('aria-hidden', 'false');
      } else {
        pane.setAttribute('hidden', 'hidden');
        pane.setAttribute('aria-hidden', 'true');
      }
    });

    if (remoteUrlField) {
      remoteUrlField.required = activeSource === 'remote';
      if (activeSource !== 'remote') {
        remoteUrlField.setCustomValidity('');
      }
    }

    setAssetsSectionDisabled(activeSource === 'remote');
    handleRemoteUrlInput();
  }

  function handleSourceTabKeydown(event) {
    if (!sourceTabs.length) {
      return;
    }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    event.preventDefault();
    const currentIndex = sourceTabs.findIndex(tab => tab.dataset.sourceTab === activeSource);
    if (currentIndex === -1) {
      return;
    }
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + offset + sourceTabs.length) % sourceTabs.length;
    const nextTab = sourceTabs[nextIndex];
    const target = nextTab?.dataset.sourceTab;
    if (target === 'local' || target === 'remote') {
      setActiveSource(target);
      nextTab.focus();
    }
  }

  function handleRemoteUrlInput() {
    if (!remoteUrlField) {
      return;
    }
    const value = remoteUrlField.value.trim();
    if (!value) {
      remoteUrlField.setCustomValidity('');
      return;
    }
    if (!isRemoteEnabled()) {
      remoteUrlField.setCustomValidity('');
      return;
    }
    if (isValidHttpUrl(value)) {
      remoteUrlField.setCustomValidity('');
    } else {
      remoteUrlField.setCustomValidity('Enter a valid http(s) URL.');
    }
  }

  async function handleTestConnection() {
    if (!remoteUrlField || !testConnectionButton) {
      return;
    }

    const url = remoteUrlField.value.trim();
    if (!url) {
      alert('Please enter an API URL first.');
      return;
    }

    if (!isValidHttpUrl(url)) {
      alert('Please enter a valid http(s) URL.');
      return;
    }

    // Update button state to show testing
    const originalText = testConnectionButton.textContent;
    testConnectionButton.textContent = 'Testing...';
    testConnectionButton.disabled = true;
    testConnectionButton.className = testConnectionButton.className.replace(/\b(success|error)\b/g, '') + ' testing';

    try {
      // Use server-side proxy to avoid CORS issues
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: url })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const proxyResult = await response.json();
      const data = proxyResult.data;
      
      // Analyze the response structure and detect assets
      let assetCount = 0;
      let detectedFormat = 'unknown';
      let sampleFields = {};
      let compatibleAssets = 0;

      if (Array.isArray(data)) {
        assetCount = data.length;
        detectedFormat = 'array';
        
        // Analyze field compatibility
        if (data.length > 0) {
          const firstItem = data[0];
          sampleFields = Object.keys(firstItem);
          
          // Check how many items have required location fields (flexible field names)
          compatibleAssets = data.filter(item => {
            const hasName = item.name || item.Name || item.hostname || item.Hostname;
            const hasCity = item.city || item.City || item.location || item.Location;
            const hasState = item.state || item.State || item.region || item.Region;
            return hasName && hasCity && hasState;
          }).length;
        }
      } else if (data && Array.isArray(data.assets)) {
        assetCount = data.assets.length;
        detectedFormat = 'object with assets array';
        if (data.assets.length > 0) {
          sampleFields = Object.keys(data.assets[0]);
        }
      } else if (data && typeof data === 'object') {
        // Look for any array property that might contain assets
        const arrayProps = Object.keys(data).filter(key => Array.isArray(data[key]));
        if (arrayProps.length > 0) {
          assetCount = data[arrayProps[0]].length;
          detectedFormat = `object with ${arrayProps[0]} array`;
          if (data[arrayProps[0]].length > 0) {
            sampleFields = Object.keys(data[arrayProps[0]][0]);
          }
        }
      }

      // Success
      testConnectionButton.className = testConnectionButton.className.replace(/\btesting\b/g, '') + ' success';
      testConnectionButton.textContent = '✓ Connected';
      
      let message = `✅ Connection successful!\n\n`;
      message += `• Status: ${proxyResult.status} OK\n`;
      message += `• Content-Type: ${proxyResult.headers['content-type'] || 'unknown'}\n`;
      message += `• Format: ${detectedFormat}\n`;
      message += `• Total items: ${assetCount}\n`;
      
      if (compatibleAssets > 0) {
        message += `• Compatible assets: ${compatibleAssets}/${assetCount}\n`;
      }
      
      if (data.title) {
        message += `• Title: "${data.title}"\n`;
      }
      
      if (sampleFields.length > 0) {
        message += `• Fields: ${sampleFields.join(', ')}\n`;
      }
      
      // Check for common field mappings
      if (Array.isArray(data) && data.length > 0) {
        const sample = data[0];
        message += `\n📋 Field Mapping:\n`;
        
        // Name field
        if (sample.Name) message += `• Name: "${sample.Name}"\n`;
        else if (sample.name) message += `• name: "${sample.name}"\n`;
        
        // Location fields
        if (sample.City && sample.State) {
          message += `• Location: ${sample.City}, ${sample.State}\n`;
        } else if (sample.city && sample.state) {
          message += `• Location: ${sample.city}, ${sample.state}\n`;
        }
        
        // IP field
        if (sample.IP) message += `• IP: ${sample.IP}\n`;
        else if (sample.ip) message += `• IP: ${sample.ip}\n`;
      }
      
      alert(message);

    } catch (error) {
      // Error
      testConnectionButton.className = testConnectionButton.className.replace(/\btesting\b/g, '') + ' error';
      testConnectionButton.textContent = '✗ Failed';
      
      let errorMessage = `❌ Connection failed!\n\n`;
      errorMessage += `Error: ${error.message}\n\n`;
      errorMessage += `Please check:\n`;
      errorMessage += `• URL is correct and accessible\n`;
      errorMessage += `• Server is running\n`;
      errorMessage += `• CORS is configured (if cross-origin)\n`;
      errorMessage += `• Endpoint returns valid JSON`;
      
      alert(errorMessage);
    } finally {
      // Reset button after 3 seconds
      setTimeout(() => {
        if (testConnectionButton) {
          testConnectionButton.textContent = originalText;
          testConnectionButton.disabled = false;
          testConnectionButton.className = testConnectionButton.className.replace(/\b(testing|success|error)\b/g, '').trim();
        }
      }, 3000);
    }
  }

  function openModal() {
    if (!apiFormatModal) {
      return;
    }
    apiFormatModal.classList.add('show');
    apiFormatModal.setAttribute('aria-hidden', 'false');
    
    // Focus the modal for accessibility
    modalCloseButton?.focus();
  }

  function closeModal() {
    if (!apiFormatModal) {
      return;
    }
    apiFormatModal.classList.remove('show');
    apiFormatModal.setAttribute('aria-hidden', 'true');
    
    // Return focus to the info button
    apiFormatInfoButton?.focus();
  }

  function handleModalBackdropClick(event) {
    if (event.target.matches('[data-modal-dismiss]')) {
      closeModal();
    }
  }

  function handleModalKeydown(event) {
    if (event.key === 'Escape' && apiFormatModal?.classList.contains('show')) {
      closeModal();
    }
  }

  function isRemoteEnabled() {
    return activeSource === 'remote';
  }

  function applyRemoteConfiguration(remoteSource) {
    const enabled = Boolean(remoteSource && remoteSource.enabled);
    if (remoteUrlField) {
      remoteUrlField.value = remoteSource && typeof remoteSource.url === 'string' ? remoteSource.url : '';
    }
    setActiveSource(enabled ? 'remote' : 'local');
  }

  function setAssetsSectionDisabled(disabled) {
    if (!assetsSection) {
      return;
    }
    assetsSection.classList.toggle('assets-section--disabled', disabled);
    if (disabled) {
      assetsSection.setAttribute('aria-disabled', 'true');
    } else {
      assetsSection.removeAttribute('aria-disabled');
    }
    const inputs = assetsSection.querySelectorAll('input, textarea, button');
    inputs.forEach(control => {
      control.disabled = disabled;
      
      // Handle required attribute for form validation
      if (control.matches('input[type="text"], textarea')) {
        if (disabled) {
          // Store original required state and remove required when disabled
          if (control.required) {
            control.dataset.wasRequired = 'true';
          }
          control.required = false;
        } else {
          // Restore required state when enabled
          if (control.dataset.wasRequired === 'true') {
            control.required = true;
            delete control.dataset.wasRequired;
          }
        }
      }
    });
  }

  async function initializeForm() {
    resetAssetRows();

    try {
      const response = await fetch('/api/assets', { cache: 'no-store' });
      if (response.status === 404) {
        applyRemoteConfiguration(null);
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
      applyRemoteConfiguration(data.remoteSource);

      const prepared = prepareAssets(Array.isArray(data.assets) ? data.assets : []);
      if (prepared.valid.length > 0) {
        prepared.valid.forEach(asset => addAssetRow(asset));
      } else {
        addAssetRow();
      }
    } catch (err) {
      console.error('Failed to load existing assets:', err);
      applyRemoteConfiguration(null);
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

    const header = document.createElement('div');
    header.className = 'asset-row-header';

    const title = document.createElement('span');
    title.className = 'asset-row-title';
    header.appendChild(title);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-asset';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeAssetRow(row));
    header.appendChild(removeButton);

    const fields = document.createElement('div');
    fields.className = 'asset-row-fields';

    fields.appendChild(buildInput('Asset Name', 'asset-name', true, initialValues.name || ''));
    fields.appendChild(buildInput('City', 'asset-city', true, initialValues.city || ''));
    fields.appendChild(buildInput('State / Province', 'asset-state', true, initialValues.state || ''));
    fields.appendChild(buildInput('IP Address (optional)', 'asset-ip', false, initialValues.ip || ''));
    fields.appendChild(buildInput('Notes (optional)', 'asset-notes', false, initialValues.notes || '', true));

    row.appendChild(header);
    row.appendChild(fields);
    assetsContainer.appendChild(row);
    updateAssetRowTitles();
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
    if (rows.length <= 1 && !isRemoteEnabled()) {
      const fields = row.querySelectorAll('input[type="text"], textarea');
      fields.forEach(field => {
        field.value = '';
      });
      updateAssetRowTitles();
      showToast('Cleared the last asset entry. Add another or switch to External Source.', false);
      return;
    }
    assetsContainer.removeChild(row);
    updateAssetRowTitles();
  }

  function updateAssetRowTitles() {
    const rows = assetsContainer.querySelectorAll('.asset-row');
    rows.forEach((row, index) => {
      const title = row.querySelector('.asset-row-title');
      if (title) {
        title.textContent = `Asset ${index + 1}`;
      }
    });
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

    applyRemoteConfiguration(result.remoteSource);

    const appliedCount = setAssets(result.assets);
    if (titleField && typeof result.title === 'string' && result.title.trim()) {
      titleField.value = result.title.trim();
    }

    if (appliedCount === 0 && !isRemoteEnabled()) {
      showToast('No valid assets found in the imported file.', true);
      return;
    }

    const skippedSuffix = result.skipped ? ` (${result.skipped} skipped)` : '';
    const suffix = appliedCount === 1 ? '' : 's';
    if (appliedCount > 0) {
      showToast(`Imported ${appliedCount} asset${suffix} from ${filename}${skippedSuffix}.`);
    } else if (isRemoteEnabled()) {
      showToast('Imported API configuration.', false);
    }
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
    const apiSuffix = payload.remoteSource && payload.remoteSource.enabled ? ' (API settings included)' : '';
    showToast(`Exported ${payload.assets.length} asset${payload.assets.length === 1 ? '' : 's'} to ${fileName}${apiSuffix}.`);
  }

  function handleExportCsv() {
    const payload = collectPayload({ silent: true });
    if (!payload) {
      showToast('Add a title and at least one complete asset before exporting.', true);
      return;
    }

    if (payload.assets.length === 0) {
      showToast('No local assets to export. Add manual assets or disable the API option.', true);
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
    const remoteEnabled = isRemoteEnabled();
    const remoteUrl = remoteUrlField ? remoteUrlField.value.trim() : '';

    if (!title) {
      if (!silent) {
        showToast('Map title is required.', true);
      }
      return null;
    }

    if (remoteEnabled) {
      if (!remoteUrl) {
        if (!silent) {
          showToast('Enter the JSON API URL to fetch assets.', true);
        }
        return null;
      }
      if (!isValidHttpUrl(remoteUrl)) {
        if (!silent) {
          showToast('Enter a valid http(s) JSON API URL.', true);
        }
        return null;
      }
    }

    const assets = [];
    const rows = assetsContainer.querySelectorAll('.asset-row');

    rows.forEach(row => {
      const nameField = row.querySelector('input[name="asset-name"]');
      const cityField = row.querySelector('input[name="asset-city"]');
      const stateField = row.querySelector('input[name="asset-state"]');
      const ipField = row.querySelector('input[name="asset-ip"]');
      const notesField = row.querySelector('textarea[name="asset-notes"]');

      const name = nameField ? nameField.value.trim() : '';
      const city = cityField ? cityField.value.trim() : '';
      const state = stateField ? stateField.value.trim() : '';
      const ip = ipField ? ipField.value.trim() : '';
      const notes = notesField ? notesField.value.trim() : '';

      if (name && city && state) {
        assets.push({ name, city, state, ip, notes });
      }
    });

    if (assets.length === 0 && !remoteEnabled) {
      if (!silent) {
        showToast('Add at least one complete asset (name, city, state).', true);
      }
      return null;
    }

    return {
      title,
      assets,
      remoteSource: {
        enabled: remoteEnabled,
        url: remoteUrl
      }
    };
  }

  function setAssets(assets) {
    resetAssetRows();
    if (!Array.isArray(assets) || assets.length === 0) {
      if (!isRemoteEnabled()) {
        addAssetRow();
      }
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
    
    // Handle flexible field names (both lowercase and capitalized)
    const name = toCleanString(item.name || item.Name || item.hostname || item.Hostname);
    const city = toCleanString(item.city || item.City || item.location || item.Location);
    const state = toCleanString(item.state || item.State || item.region || item.Region);
    const ip = toCleanString(item.ip || item.IP || item.ipAddress || item.IPAddress, true);
    const notes = toCleanString(item.notes || item.Notes || item.description || item.Description, true);

    if (name && city && state) {
      return { name, city, state, ip, notes };
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
    const hasRemote = Boolean(collection.remoteSource && collection.remoteSource.enabled);
    if (collection.assets.length === 0 && !hasRemote) {
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

  function normalizeRemoteSource(source) {
    if (!source || typeof source !== 'object') {
      return null;
    }
    const enabled = Boolean(source.enabled);
    const url = typeof source.url === 'string' ? source.url.trim() : '';
    if (enabled && !isValidHttpUrl(url)) {
      return { enabled: false, url };
    }
    return { enabled, url };
  }

  function extractAssetCollection(input) {
    let title = '';
    let rawAssets = [];
    let remoteSource = null;

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
      remoteSource = normalizeRemoteSource(input.remoteSource);
    }

    const prepared = prepareAssets(rawAssets);
    return { title, assets: prepared.valid, skipped: prepared.skipped, remoteSource };
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
    const ipIndex = headers.indexOf('ip');
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
        ip: ipIndex !== -1 ? row[ipIndex] || '' : '',
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
    const headers = ['title', 'name', 'city', 'state', 'ip', 'notes'];
    const lines = [headers.join(',')];
    const title = data.title || '';

    data.assets.forEach(asset => {
      const line = [
        escapeCsvField(title),
        escapeCsvField(asset.name),
        escapeCsvField(asset.city),
        escapeCsvField(asset.state),
        escapeCsvField(asset.ip),
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

  function isValidHttpUrl(candidate) {
    if (!candidate) {
      return false;
    }
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (err) {
      return false;
    }
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
