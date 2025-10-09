(function () {
  'use strict';

  const STORAGE_KEY = 'map-view:theme';
  const toggle = document.getElementById('theme-toggle');
  const label = toggle ? toggle.querySelector('.theme-toggle__label') : null;
  const body = document.body;
  if (!body) {
    return;
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const storedPreference = readPreference();
  let hasExplicitPreference = storedPreference === 'light' || storedPreference === 'dark';
  let activeTheme = hasExplicitPreference ? storedPreference : (mediaQuery.matches ? 'dark' : 'light');

  applyTheme(activeTheme, false);
  updateToggleState(activeTheme);

  if (toggle) {
    toggle.addEventListener('click', () => {
      activeTheme = body.classList.contains('theme-dark') ? 'light' : 'dark';
      hasExplicitPreference = true;
      applyTheme(activeTheme, true);
      updateToggleState(activeTheme);
    });
  }

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleSystemPreferenceChange);
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(handleSystemPreferenceChange);
  }

  function handleSystemPreferenceChange(event) {
    if (hasExplicitPreference) {
      return;
    }
    activeTheme = event.matches ? 'dark' : 'light';
    applyTheme(activeTheme, false);
    updateToggleState(activeTheme);
  }

  function applyTheme(theme, persist) {
    const isDark = theme === 'dark';
    body.classList.toggle('theme-dark', isDark);
    if (persist) {
      writePreference(theme);
    }
  }

  function updateToggleState(theme) {
    if (!toggle) {
      return;
    }
    const isDark = theme === 'dark';
    const nextLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', nextLabel);
    toggle.setAttribute('title', nextLabel);
    if (label) {
      label.textContent = isDark ? 'Light mode' : 'Dark mode';
    }
  }

  function readPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      console.warn('Unable to read theme preference:', err);
      return null;
    }
  }

  function writePreference(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      console.warn('Unable to persist theme preference:', err);
    }
  }
})();
