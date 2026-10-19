// "Add to home screen": keeps Chrome's install prompt (it can fire before
// any page shows the install card) and registers the service worker.

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export const setupInstallApp = () => {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered:', err));
    });
  }
};

export const onInstallChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const canPromptInstall = () => Boolean(deferredPrompt);

// Opens Chrome's "Install app" dialog. Resolves to true if the joiner accepted.
export const promptInstall = async () => {
  if (!deferredPrompt) return false;
  const e = deferredPrompt;
  deferredPrompt = null;
  notify();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
};

export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iPhone/iPad Safari has no install prompt: joiners use Share → Add to Home Screen.
export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
