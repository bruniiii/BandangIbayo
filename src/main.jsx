import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import App from './App';
import Toaster from './ui/Toaster';
import { installInputFilter } from './ui/inputFilter';
import { setupInstallApp } from './installApp';
import { reportError } from './ui/toast';
import './index.css';
import './App.css';

// Name fields refuse numbers, number fields refuse letters (see ui/inputFilter).
installInputFilter();

// Add to home screen (see installApp.js).
setupInstallApp();

// Any error nothing else caught pops up too, instead of failing silently.
// (Browser noise like ResizeObserver warnings and cancelled requests is skipped.)
const isNoise = (msg) => /ResizeObserver loop|AbortError|Lock broken|Load failed|Script error/i.test(String(msg || ''));
window.addEventListener('error', (e) => {
  if (!isNoise(e.message)) reportError('Something went wrong', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason;
  if (!isNoise(err?.name) && !isNoise(err?.message || err)) reportError('Something went wrong', err);
});
 
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <App />
      <Toaster />
    </Router>
  </React.StrictMode>
);