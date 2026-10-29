import { supabase } from './supabaseClient';
import { errorDetail } from './Email';

// ─────────────────────────────────────────────
// LOGIN & PASSWORD HELPERS
// Talk to the `auth` Edge Function (supabase/functions/auth/index.ts), which
// counts wrong passwords (3 → 15-minute lock) before handing out a session.
// Each helper returns { ok, data } or { ok: false, error, ...details }.
// ─────────────────────────────────────────────

const call = async (body) => {
  try {
    const { data, error } = await supabase.functions.invoke('auth', { body });
    if (error) {
      let details = {};
      try {
        if (error.context && typeof error.context.json === 'function') details = await error.context.clone().json();
      } catch { /* not JSON */ }
      const { error: message, ...rest } = details || {};
      return { ok: false, error: typeof message === 'string' ? message : await errorDetail(error), ...rest };
    }
    if (data?.error) return { ok: false, ...data };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not reach the server. Please try again.' };
  }
};

// Username/email + password → signs the browser in: { ok, data: { user, session } }.
// An auth function deployed before the code step was removed answers with
// { challengeId, sentTo, expiresInMinutes } instead: data.challenge holds it.
export const loginStart = async (identifier, password) => {
  const result = await call({ action: 'login', identifier, password });
  if (!result.ok) return result;
  if (result.data?.challengeId) return { ok: true, data: { challenge: result.data } };
  const { data, error } = await supabase.auth.setSession(result.data);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
};

// Step 2: the emailed code → signs the browser in. A registration sends the
// password again: the account is created only now.
export const verifyLoginCode = async (challengeId, code, password) => {
  const result = await call({ action: 'verify', challengeId, code, ...(password ? { password } : {}) });
  if (!result.ok) return result;
  const { data, error } = await supabase.auth.setSession(result.data);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
};

// Registration: checks the details and emails a 6-digit code:
// { ok, data: { challengeId, sentTo, expiresInMinutes } }. verifyLoginCode()
// with that code (and the password) creates the account and signs the new joiner in.
export const signupStart = (email, password, profile) =>
  call({ action: 'signup', email, password, profile });

export const resendLoginCode = (challengeId) => call({ action: 'resend', challengeId });

export const changePassword = (currentPassword, newPassword) =>
  call({ action: 'change-password', currentPassword, newPassword });

// After a password reset link: unlock the account. Never blocks the reset.
export const clearLoginLock = () => call({ action: 'password-changed' });

// Admin Settings (main admin only): a new admin account, email already confirmed.
export const createAdminAccount = ({ first_name, last_name, email, password }) =>
  call({ action: 'create-admin', first_name, last_name, email, password });
