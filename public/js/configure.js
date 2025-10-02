(function () {
  'use strict';

  const form = document.getElementById('config-form');
  const addAssetButton = document.getElementById('add-asset');
  const assetsContainer = document.getElementById('assets-container');
  const toastEl = document.getElementById('toast');
  const titleField = document.getElementById('map-title');

  let assetCounter = 0;

  if (!form || !addAssetButton || !assetsContainer) {
    return;
  }

  addAssetButton.addEventListener('click', () => addAssetRow());
  form.addEventListener('submit', handleSubmit);

  initializeForm();

  async function initializeForm() {
    assetCounter = 0;
    assetsContainer.innerHTML = '';

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

      if (Array.isArray(data.assets) && data.assets.length > 0) {
        data.assets.forEach(asset => addAssetRow(asset));
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

  function collectPayload() {
    const title = titleField ? titleField.value.trim() : '';

    if (!title) {
      showToast('Map title is required.', true);
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
      showToast('Add at least one complete asset (name, city, state).', true);
      return null;
    }

    return { title, assets };
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
