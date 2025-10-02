(function () {
  'use strict';

  const DEFAULT_CENTER = [39.5, -98.35];
  const DEFAULT_ZOOM = 4;
  const tileLayerConfig = {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  };

  const toastEl = document.getElementById('toast');
  const titleEl = document.getElementById('map-title');
  const listEl = document.getElementById('assets-list');
  const editButton = document.getElementById('edit-config');

  if (editButton) {
    editButton.addEventListener('click', () => {
      window.location.href = '/configure';
    });
  }

  fetchAssets();

  async function fetchAssets() {
    try {
      const response = await fetch('/api/assets', { cache: 'no-store' });
      if (response.status === 404) {
        window.location.href = '/configure';
        return;
      }
      if (!response.ok) {
        throw new Error(`Unexpected response: ${response.status}`);
      }

      const data = await response.json();
      renderTitle(data.title);
      renderAssetsList(data.assets);
      initializeMap(data);
    } catch (err) {
      console.error('Failed to load assets:', err);
      showToast('Unable to load assets. Try refreshing or reconfiguring.', true);
      if (listEl) {
        listEl.innerHTML = '<li class="asset-card">No assets available. Please configure your map.</li>';
      }
    }
  }

  function renderTitle(title) {
    if (!titleEl) {
      return;
    }
    titleEl.textContent = title || 'IT Assets Map';
  }

  function renderAssetsList(assets) {
    if (!Array.isArray(assets) || !listEl) {
      return;
    }
    listEl.innerHTML = '';

    if (assets.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'asset-card';
      emptyItem.textContent = 'No assets defined yet. Add some in the configuration page.';
      listEl.appendChild(emptyItem);
      return;
    }

    assets.forEach(asset => {
      const item = document.createElement('li');
      item.className = 'asset-card';

      const name = document.createElement('h3');
      name.textContent = asset.name;
      item.appendChild(name);

      const meta = document.createElement('p');
      meta.className = 'asset-meta';
      meta.textContent = [asset.city, asset.state].filter(Boolean).join(', ');
      item.appendChild(meta);

      if (asset.notes) {
        const notes = document.createElement('p');
        notes.className = 'asset-notes';
        notes.textContent = asset.notes;
        item.appendChild(notes);
      }

      listEl.appendChild(item);
    });
  }

  async function initializeMap(data) {
    if (typeof L === 'undefined') {
      console.warn('Leaflet library is not available.');
      showToast('Map library failed to load. Asset list is still available.', true);
      return;
    }

    const map = L.map('map', {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', tileLayerConfig).addTo(map);

    const bounds = L.latLngBounds();
    let markerCount = 0;

    for (const asset of data.assets) {
      try {
        const coords = await geocodeAsset(asset.city, asset.state);
        if (coords) {
          const marker = L.marker(coords).addTo(map);
          const popupHtml = `<strong>${escapeHtml(asset.name)}</strong><br/>${escapeHtml(asset.city)}, ${escapeHtml(asset.state)}` + (asset.notes ? `<br/><em>${escapeHtml(asset.notes)}</em>` : '');
          marker.bindPopup(popupHtml);
          bounds.extend(coords);
          markerCount += 1;
        } else {
          console.warn(`No coordinates found for ${asset.name}`);
        }
      } catch (err) {
        console.error('Geocoding error:', err);
      }
      await sleep(250);
    }

    if (markerCount > 0) {
      map.fitBounds(bounds.pad(0.2));
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      showToast('Unable to plot any assets. Check that city/state values are valid.', true);
    }
  }

  async function geocodeAsset(city, state) {
    if (!city || !state) {
      return null;
    }
    const term = `${city}, ${state}`;
    const cacheKey = `geocode:${term.toLowerCase()}`;

    const cached = readCache(cacheKey);
    if (cached) {
      return cached;
    }

    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(term)}&limit=1`;
    const response = await fetch(endpoint, {
      headers: {
        'Accept-Language': 'en'
      }
    });

    if (!response.ok) {
      throw new Error(`Geocoding request failed with status ${response.status}`);
    }

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    const { lat, lon } = results[0];
    const coords = [parseFloat(lat), parseFloat(lon)];
    writeCache(cacheKey, coords);
    return coords;
  }

  function readCache(key) {
    try {
      const value = window.localStorage.getItem(key);
      if (!value) {
        return null;
      }
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length === 2) {
        return parsed;
      }
    } catch (err) {
      console.warn('Unable to read cache:', err);
    }
    return null;
  }

  function writeCache(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('Unable to persist cache:', err);
    }
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

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
