// Keeps the dashboard page you're on across a refresh. Saved for this browser
// tab only (sessionStorage), and cleared on sign out so the next login starts
// on the first page.

export const readTab = (key, allowed, fallback) => {
  try {
    const saved = sessionStorage.getItem(key);
    return saved && allowed.includes(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
};

export const saveTab = (key, tab) => {
  try { sessionStorage.setItem(key, tab); } catch { /* private mode */ }
};

export const forgetTab = (key) => {
  try { sessionStorage.removeItem(key); } catch { /* private mode */ }
};
