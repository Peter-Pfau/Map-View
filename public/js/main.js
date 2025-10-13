(function () {
  'use strict';

  const DEFAULT_CENTER = [39.5, -98.35];
  const DEFAULT_ZOOM = 4;
  const tileLayerConfig = {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  };

  let activeDetailLayer = null;
  let activeGroupKey = null;

  const toastEl = document.getElementById('toast');
  const titleEl = document.getElementById('map-title');
  const listEl = document.getElementById('assets-list');
  const actionsToggle = document.getElementById('actions-toggle');
  const actionsMenu = document.getElementById('actions-menu');
  const assetListOverlay = document.getElementById('asset-list-overlay');
  const assetListCloseButton = document.getElementById('asset-list-close');

  if (actionsToggle && actionsMenu) {
    actionsToggle.addEventListener('click', toggleMenu);
    document.addEventListener('click', handleMenuBlur);
    document.addEventListener('keydown', handleMenuKeydown);
    actionsMenu.addEventListener('click', handleMenuSelection);
  }

  assetListCloseButton?.addEventListener('click', closeAssetListOverlay);
  assetListOverlay?.addEventListener('click', handleAssetListOverlayClick);
  if (assetListOverlay) {
    document.addEventListener('keydown', handleAssetListKeydown);
  }

  fetchAssets();

  function toggleMenu(event) {
    if (!actionsToggle || !actionsMenu) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (isMenuOpen()) {
      closeMenu();
    } else {
      const shouldFocusFirstItem = event.detail === 0;
      openMenu(shouldFocusFirstItem);
    }
  }

  function openMenu(shouldFocusFirstItem) {
    if (!actionsToggle || !actionsMenu || isMenuOpen()) {
      return;
    }
    actionsMenu.classList.add('menu-dropdown--open');
    actionsMenu.setAttribute('aria-hidden', 'false');
    actionsToggle.setAttribute('aria-expanded', 'true');
    if (shouldFocusFirstItem) {
      const firstItem = actionsMenu.querySelector('.menu-item');
      if (firstItem) {
        firstItem.focus();
      }
    }
  }

  function closeMenu() {
    if (!actionsToggle || !actionsMenu || !isMenuOpen()) {
      return;
    }
    actionsMenu.classList.remove('menu-dropdown--open');
    actionsMenu.setAttribute('aria-hidden', 'true');
    actionsToggle.setAttribute('aria-expanded', 'false');
  }

  function isMenuOpen() {
    return Boolean(actionsMenu && actionsMenu.classList.contains('menu-dropdown--open'));
  }

  function handleMenuBlur(event) {
    if (!actionsToggle || !actionsMenu || !isMenuOpen()) {
      return;
    }
    if (actionsMenu.contains(event.target) || event.target === actionsToggle) {
      return;
    }
    closeMenu();
  }

  function handleMenuKeydown(event) {
    if (!actionsToggle || !actionsMenu) {
      return;
    }
    if (event.key === 'Escape' && isMenuOpen()) {
      closeMenu();
      actionsToggle.focus();
    }
    if (document.activeElement === actionsToggle && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault();
      openMenu(true);
    }
  }

  function handleMenuSelection(event) {
    const item = event.target.closest('.menu-item');
    if (!item) {
      return;
    }
    event.preventDefault();
    const action = item.dataset.action;
    closeMenu();
    actionsToggle?.focus();
    if (action === 'configure') {
      window.location.href = '/configure';
    }
    if (action === 'list') {
      openAssetListOverlay();
    }
  }
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

      const rawData = await response.json();
      const resolvedData = await resolveAssetSource(rawData);
      renderTitle(resolvedData.title);
      renderAssetsList(resolvedData.assets, resolvedData.remoteSource);
      initializeMap(resolvedData);
    } catch (err) {
      console.error('Failed to load assets:', err);
      showToast('Unable to load assets. Try refreshing or reconfiguring.', true);
      if (listEl) {
        listEl.innerHTML = '<li class="asset-card">No assets available. Please configure your map.</li>';
      }
    }
  }

  function openAssetListOverlay() {
    if (!assetListOverlay) {
      return;
    }
    assetListOverlay.setAttribute('aria-hidden', 'false');
    assetListCloseButton?.focus();
  }

  function closeAssetListOverlay() {
    if (!assetListOverlay || assetListOverlay.getAttribute('aria-hidden') === 'true') {
      return;
    }
    assetListOverlay.setAttribute('aria-hidden', 'true');
    actionsToggle?.focus();
  }

  function isAssetListOpen() {
    return assetListOverlay ? assetListOverlay.getAttribute('aria-hidden') === 'false' : false;
  }

  function handleAssetListOverlayClick(event) {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }
    if (event.target.dataset.overlayDismiss != null) {
      closeAssetListOverlay();
    }
  }

  function handleAssetListKeydown(event) {
    if (!isAssetListOpen()) {
      return;
    }
    if (event.key === 'Escape') {
      closeAssetListOverlay();
    }
  }

  function renderTitle(title) {
    if (!titleEl) {
      return;
    }
    titleEl.textContent = title || 'IT Assets Map';
  }

  function renderAssetsList(assets, remoteSource) {
    if (!listEl) {
      return;
    }
    const safeAssets = Array.isArray(assets) ? assets : [];
    listEl.innerHTML = '';

    if (safeAssets.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'asset-card';
      if (remoteSource && remoteSource.enabled) {
        emptyItem.textContent = 'The configured API did not return any assets. Update the endpoint in Configure Assets.';
      } else {
        emptyItem.textContent = 'No assets defined yet. Add some in the configuration page.';
      }
      listEl.appendChild(emptyItem);
      return;
    }

    safeAssets.forEach(asset => {
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

  async function resolveAssetSource(data) {
    const remoteSource = normalizeRemoteSource(data.remoteSource);
    const localAssets = sanitizeAssets(Array.isArray(data.assets) ? data.assets : []);

    if (remoteSource.enabled) {
      try {
        const remoteAssets = await fetchRemoteAssets(remoteSource.url);
        if (remoteAssets.length > 0) {
          return {
            ...data,
            assets: remoteAssets,
            remoteSource: { ...remoteSource, usedRemote: true }
          };
        }

        if (localAssets.length > 0) {
          showToast('The API returned no assets. Showing previously saved assets instead.', true);
        } else {
          showToast('The API returned no assets.', true);
        }
      } catch (err) {
        console.error('Remote asset fetch failed:', err);
        if (localAssets.length > 0) {
          showToast('Unable to load assets from the configured API. Showing previously saved assets.', true);
        } else {
          showToast('Unable to load assets from the configured API.', true);
        }
      }
    }

    return {
      ...data,
      assets: localAssets,
      remoteSource: { ...remoteSource, usedRemote: false }
    };
  }

  async function fetchRemoteAssets(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Remote API responded with ${response.status}`);
    }
    const payload = await response.json();
    const rawAssets = extractAssetArray(payload);
    return sanitizeAssets(rawAssets);
  }

  function extractAssetArray(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.assets)) {
        return payload.assets;
      }
      const candidateKey = Object.keys(payload).find(key => Array.isArray(payload[key]));
      if (candidateKey) {
        return payload[candidateKey];
      }
    }
    return [];
  }

  function sanitizeAssets(rawAssets) {
    if (!Array.isArray(rawAssets)) {
      return [];
    }
    const result = [];
    rawAssets.forEach(item => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const name = toCleanString(item.name);
      const city = toCleanString(item.city);
      const state = toCleanString(item.state);
      const notes = toCleanString(item.notes, true);
      if (name && city && state) {
        result.push({ name, city, state, notes });
      }
    });
    return result;
  }

  function normalizeRemoteSource(source) {
    const normalized = {
      enabled: false,
      url: '',
      usedRemote: false
    };
    if (!source || typeof source !== 'object') {
      return normalized;
    }
    const url = typeof source.url === 'string' ? source.url.trim() : '';
    normalized.url = url;
    if (source.enabled && isValidHttpUrl(url)) {
      normalized.enabled = true;
    }
    return normalized;
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
    const groupedAssets = new Map();

    for (const asset of data.assets) {
      try {
        const coords = await geocodeAsset(asset.city, asset.state);
        if (coords) {
          const key = formatCoordinateKey(coords);
          const group = groupedAssets.get(key) || { coords, assets: [] };
          group.assets.push(asset);
          groupedAssets.set(key, group);
        } else {
          console.warn(`No coordinates found for ${asset.name}`);
        }
      } catch (err) {
        console.error('Geocoding error:', err);
      }
      await sleep(250);
    }

    for (const [key, group] of groupedAssets.entries()) {
      const markerOptions = {};
      const groupIcon = buildGroupIcon(group.assets.length);
      if (groupIcon) {
        markerOptions.icon = groupIcon;
      }
      const marker = L.marker(group.coords, markerOptions).addTo(map);
      group.marker = marker;
      if (group.assets.length === 1) {
        marker.bindPopup(buildPopupHtml(group.assets));
      } else {
        marker.bindTooltip(`${group.assets.length} assets`, { direction: 'top', offset: [0, -12] });
      }
      bounds.extend(group.coords);
    }

    const overviewBounds = L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast());

    for (const [key, group] of groupedAssets.entries()) {
      group.marker.on('click', event => {
        if (event.originalEvent) {
          event.originalEvent.preventDefault();
          event.originalEvent.stopPropagation();
          event.originalEvent.stopImmediatePropagation();
        }
        L.DomEvent.stopPropagation(event);
        handleGroupClick(map, groupedAssets, key, overviewBounds);
      });

      group.marker.on('dblclick', event => {
        if (event.originalEvent) {
          event.originalEvent.preventDefault();
          event.originalEvent.stopPropagation();
          event.originalEvent.stopImmediatePropagation();
        }
        L.DomEvent.stopPropagation(event);
        const suppressCollapse = activeGroupKey === key;
        handleGroupClick(map, groupedAssets, key, overviewBounds, {
          shouldZoom: true,
          suppressCollapse
        });
      });
    }

    map.on('click', () => collapseDetailLayer(map, groupedAssets, overviewBounds));

    const markerCount = groupedAssets.size;
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

  function formatCoordinateKey(coords) {
    return coords.map(value => Number(value).toFixed(6)).join(',');
  }

  function buildGroupIcon(count) {
    if (count <= 1) {
      return null;
    }
    return L.divIcon({
      html: `<span class="asset-cluster__inner">${count}</span>`,
      className: 'asset-cluster',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -16]
    });
  }

  function buildPopupHtml(assets) {
    if (!Array.isArray(assets) || assets.length === 0) {
      return 'No asset details available.';
    }
    if (assets.length === 1) {
      const asset = assets[0];
      const base = `<strong>${escapeHtml(asset.name)}</strong><br/>${escapeHtml(asset.city)}, ${escapeHtml(asset.state)}`;
      return asset.notes ? `${base}<br/><em>${escapeHtml(asset.notes)}</em>` : base;
    }
    const location = [assets[0].city, assets[0].state].filter(Boolean).map(escapeHtml).join(', ');
    const list = assets
      .map(asset => {
        const notes = asset.notes ? ` - ${escapeHtml(asset.notes)}` : '';
        return `<li><strong>${escapeHtml(asset.name)}</strong>${notes}</li>`;
      })
      .join('');
    const locationLine = location ? `${location}<br/>` : '';
    return `<strong>${assets.length} assets</strong><br/>${locationLine}<ul class='popup-asset-list'>${list}</ul>`;
  }

  function handleGroupClick(map, groupedAssets, key, overviewBounds, options = {}) {
    const { shouldZoom = false, suppressCollapse = false } = options;
    const group = groupedAssets.get(key);
    if (!group) {
      return;
    }

    const spreadMultiplier = group.assets.length > 1 ? computeSpreadMultiplier(map, shouldZoom) : 1;

    if (group.assets.length <= 1) {
      group.lastSpreadMultiplier = 1;
      collapseDetailLayer(map, groupedAssets, overviewBounds);
      group.marker?.openPopup();
      if (shouldZoom) {
        map.setView(group.coords, Math.max(map.getZoom(), 14), { animate: true });
      }
      return;
    }

    if (activeGroupKey === key) {
      if (suppressCollapse) {
        if (shouldZoom) {
          const layoutMultiplier = group.lastSpreadMultiplier || spreadMultiplier;
          const detailBounds = computeDetailBounds(map, group, layoutMultiplier);
          if (detailBounds) {
            map.flyToBounds(detailBounds, {
              padding: [60, 60],
              maxZoom: Math.max(map.getZoom(), 15),
              animate: true
            });
          }
        }
        return;
      }
      collapseDetailLayer(map, groupedAssets, overviewBounds);
      return;
    }

    collapseDetailLayer(map, groupedAssets, overviewBounds);

    const fanCoords = fanOutCoordinates(map, group.coords, group.assets.length, { spreadMultiplier });
    group.lastSpreadMultiplier = spreadMultiplier;
    const { polylines: connectors, branchLatLng } = buildConnectorPolylines(map, group.coords, fanCoords, spreadMultiplier);
    const detailMarkers = fanCoords.map((coords, index) => {
      const asset = group.assets[index];
      const marker = L.marker(coords, { riseOnHover: true });
      marker.bindPopup(buildPopupHtml([asset]));
      marker.on('click', event => {
        event.originalEvent?.stopPropagation();
      });
      marker.setZIndexOffset(400);
      return marker;
    });

    activeDetailLayer = L.layerGroup(connectors.concat(detailMarkers)).addTo(map);
    activeGroupKey = key;
    if (group.marker) {
      setClusterMarkerExpanded(group.marker, true);
      group.marker.closeTooltip?.();
      group.marker.closePopup();
    }

    const boundsPoints = fanCoords.concat([group.coords]);
    if (branchLatLng) {
      boundsPoints.push(branchLatLng);
    }
    const detailBounds = L.latLngBounds(boundsPoints);
    if (shouldZoom) {
      map.flyToBounds(detailBounds, {
        padding: [60, 60],
        maxZoom: Math.max(map.getZoom(), 15),
        animate: true
      });
    }
  }

  function collapseDetailLayer(map, groupedAssets, overviewBounds) {
    const hadDetailLayer = Boolean(activeDetailLayer);

    if (activeDetailLayer) {
      map.removeLayer(activeDetailLayer);
      activeDetailLayer = null;
    }
    if (activeGroupKey) {
      const activeGroup = groupedAssets.get(activeGroupKey);
      if (activeGroup && activeGroup.marker) {
        setClusterMarkerExpanded(activeGroup.marker, false);
        delete activeGroup.lastSpreadMultiplier;
      }
    }
    activeGroupKey = null;

    if (hadDetailLayer && overviewBounds && groupedAssets.size > 0) {
      map.flyToBounds(overviewBounds, {
        padding: [60, 60],
        maxZoom: Math.max(map.getZoom(), 12),
        animate: true
      });
    }
  }

  function setClusterMarkerExpanded(marker, shouldExpand) {
    if (!marker) {
      return;
    }
    const element = marker.getElement();
    if (!element) {
      return;
    }
    element.classList.toggle('asset-cluster--expanded', shouldExpand);
    element.setAttribute('aria-hidden', shouldExpand ? 'true' : 'false');
  }

  function fanOutCoordinates(map, center, count, options = {}) {
    if (count <= 1) {
      return [center];
    }
    const { spreadMultiplier = 1 } = options;
    const detailZoom = Math.max(map.getZoom(), 14);
    const centerLatLng = L.latLng(center[0], center[1]);
    const centerPoint = map.project(centerLatLng, detailZoom);
    const minRadius = 8;
    const maxRadius = spreadMultiplier > 1 ? Math.min(64, 18 + spreadMultiplier * 14) : 24;
    const baseRadius = (9 + count * 3.6) * spreadMultiplier;
    const zoomModifier = detailZoom > 15 ? Math.max(0.55, 1 - (detailZoom - 15) * 0.12) : 1;
    const radius = Math.max(minRadius, Math.min(maxRadius, Math.round(baseRadius * zoomModifier)));
    const angleStep = (2 * Math.PI) / count;
    const positions = [];

    for (let i = 0; i < count; i += 1) {
      const angle = angleStep * i;
      const offsetX = radius * Math.cos(angle);
      const offsetY = radius * Math.sin(angle);
      const point = centerPoint.add([offsetX, offsetY]);
      const unprojected = map.unproject(point, detailZoom);
      positions.push([unprojected.lat, unprojected.lng]);
    }

    return positions;
  }

  function buildConnectorPolylines(map, center, spokeCoords, spreadMultiplier) {
    if (!Array.isArray(spokeCoords) || spokeCoords.length <= 1) {
      return { polylines: [], branchLatLng: null };
    }
    const branchLatLng = computeBranchLatLng(map, center, spokeCoords.length, spreadMultiplier);
    if (!branchLatLng) {
      return { polylines: [], branchLatLng: null };
    }
    const sharedStyle = {
      color: '#0063b1',
      weight: 2,
      opacity: 0.28,
      dashArray: '6 6',
      interactive: false
    };
    const spineStyle = {
      ...sharedStyle,
      weight: 3,
      opacity: 0.32,
      dashArray: null
    };
    const polylines = [
      L.polyline([center, branchLatLng], spineStyle)
    ];
    spokeCoords.forEach(coords => {
      polylines.push(L.polyline([branchLatLng, coords], sharedStyle));
    });
    return { polylines, branchLatLng };
  }

  function computeBranchLatLng(map, center, count, spreadMultiplier = 1) {
    if (count <= 1) {
      return null;
    }
    const zoom = Math.max(map.getZoom(), 14);
    const centerLatLng = L.latLng(center[0], center[1]);
    const centerPoint = map.project(centerLatLng, zoom);
    const branchScale = Math.min(3.6, 1 + (spreadMultiplier - 1) * 0.6);
    const offsetY = (18 + Math.min(count, 5) * 4) * branchScale;
    const branchPoint = centerPoint.add([0, offsetY]);
    const branchLatLng = map.unproject(branchPoint, zoom);
    return [branchLatLng.lat, branchLatLng.lng];
  }

  function computeDetailBounds(map, group, spreadMultiplier = 1) {
    if (!group || !group.coords || !Array.isArray(group.assets) || group.assets.length <= 1) {
      return null;
    }
    const coords = fanOutCoordinates(map, group.coords, group.assets.length, { spreadMultiplier });
    const branchLatLng = computeBranchLatLng(map, group.coords, group.assets.length, spreadMultiplier);
    const points = coords.concat([group.coords]);
    if (branchLatLng) {
      points.push(branchLatLng);
    }
  return L.latLngBounds(points);
  }

  function computeSpreadMultiplier(map, shouldZoom) {
    const zoom = map.getZoom();
    const base = 2.3;
    if (shouldZoom) {
      return base;
    }
    const extra = Math.max(0, 13 - zoom) * 0.28 + Math.max(0, 9 - zoom) * 0.08;
    return Math.min(4.6, base + extra);
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

