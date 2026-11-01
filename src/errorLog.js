import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// Website errors: when something breaks on someone's screen, it's saved
// (client_errors, from the 20261203 update) so admins can see it in Admin
// Settings → Website Errors. At most 5 per visit, and the same error once.
// ─────────────────────────────────────────────

const sent = new Set();
let count = 0;

export const logClientError = (error, where = '') => {
  try {
    const message = String(error?.message || error || 'Unknown error').slice(0, 1000);
    if (count >= 5 || sent.has(message)) return;
    const detail = String(error?.stack || '').slice(0, 4000);
    // Errors from browser add-ons aren't the website's.
    if (/chrome-extension:|moz-extension:|safari-extension:/i.test(detail)) return;
    sent.add(message);
    count += 1;
    supabase.from('client_errors').insert([{
      page: `${window.location.pathname}${where ? ` · ${where}` : ''}`.slice(0, 300),
      message,
      detail: detail || null,
      user_agent: String(navigator.userAgent || '').slice(0, 300),
    }]).then(() => {}, () => {});
  } catch { /* never let error logging break the page */ }
};
