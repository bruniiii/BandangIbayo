import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import App from './App';
import Toaster from './ui/Toaster';
import ErrorBoundary from './ui/ErrorBoundary';
import { installInputFilter } from './ui/inputFilter';
import { setupInstallApp } from './installApp';
import { reportError } from './ui/toast';
import { logClientError } from './errorLog';
import { installStaleVersionReload } from './staleVersion';
import './index.css';
import './App.css';

// An old tab after a website update reloads itself (see staleVersion.js).
installStaleVersionReload();

// Name fields refuse numbers, number fields refuse letters (see ui/inputFilter).
installInputFilter();

// Add to home screen (see installApp.js).
setupInstallApp();

// No pinch zoom on iPhones/iPads (Safari ignores user-scalable=no).
['gesturestart', 'gesturechange'].forEach((type) => document.addEventListener(type, (e) => e.preventDefault(), { passive: false }));

// Tables marked "stack-table" turn into cards on phones (see index.css):
// each cell gets its column name as a label.
const labelTables = () => document.querySelectorAll('table.stack-table').forEach((t) => {
  const heads = [...t.querySelectorAll(':scope > thead th')].map((th) => th.textContent.trim());
  t.querySelectorAll(':scope > tbody > tr').forEach((tr) => [...tr.children].forEach((td, i) => {
    if (td.colSpan > 1) return; // an opened details row, not one column
    const label = heads[i] ?? '';
    if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
  }));
});
// Batched: at most once per frame, however many changes happen.
let labelQueued = false;
new MutationObserver(() => {
  if (labelQueued) return;
  labelQueued = true;
  requestAnimationFrame(() => { labelQueued = false; labelTables(); });
}).observe(document.documentElement, { childList: true, subtree: true });

// Any error nothing else caught pops up too, instead of failing silently.
// (Browser noise like ResizeObserver warnings and cancelled requests is skipped.)
const isNoise = (msg) => /ResizeObserver loop|AbortError|Lock broken|Acquiring process lock|Load failed|Script error/i.test(String(msg || ''));
// They're also saved for the admins (Admin Settings → Website Errors).
window.addEventListener('error', (e) => {
  if (isNoise(e.message)) return;
  reportError('Something went wrong', e.error || e.message);
  logClientError(e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason;
  if (isNoise(err?.name) || isNoise(err?.message || err)) return;
  reportError('Something went wrong', err);
  logClientError(err);
});
 
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster />
    </Router>
  </React.StrictMode>
);