// ─────────────────────────────────────────────
// After the website is updated, a tab that was already open still has the old
// version. Its files are replaced on the server, so opening a part it hasn't
// loaded yet (the PDF maker, a page) fails with "Failed to fetch dynamically
// imported module". Then the page reloads once to get the new version, instead
// of showing an error. (At most once a minute, so it can never loop.)
// ─────────────────────────────────────────────

const STALE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;
const KEY = 'ibayo:stale-reload-at';

export const isStaleVersionError = (err) => STALE.test(String(err?.message || err || ''));

// Reloads once; returns true when it did (so the caller skips its error message).
export const reloadForNewVersion = () => {
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0;
    if (Date.now() - last < 60000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* private mode: still reload once */ }
  window.location.reload();
  return true;
};

export const installStaleVersionReload = () => {
  // Vite's own signal for a part that couldn't be loaded.
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForNewVersion()) e.preventDefault();
  });
  // A failed import nobody caught.
  window.addEventListener('unhandledrejection', (e) => {
    if (isStaleVersionError(e.reason) && reloadForNewVersion()) e.preventDefault();
  });
};
