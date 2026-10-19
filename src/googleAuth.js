import { supabase } from './supabaseClient';

// Sign in with Google (Supabase Auth). Google sends the browser back to
// /auth/callback (AuthCallback.jsx), which finishes signing in and sends new
// Google users to /complete-profile to fill in the rest of the registration form.

export const signInWithGoogle = async (nextPath = null) => {
  const back = `${window.location.origin}/auth/callback${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: back, queryParams: { prompt: 'select_account' } },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
};

// Has this joiner filled in what registration asks for?
export const profileIsComplete = (p) =>
  Boolean(p && p.username && p.first_name && p.last_name && p.phone_number && (p.province || p.address));

// Name parts from a Google account, to prefill the form.
export const googleNameParts = (user) => {
  const m = user?.user_metadata || {};
  const full = String(m.full_name || m.name || '').trim();
  const first = String(m.given_name || '').trim() || full.split(/\s+/).slice(0, -1).join(' ') || full;
  const last = String(m.family_name || '').trim() || (full.includes(' ') ? full.split(/\s+/).slice(-1)[0] : '');
  return { first, last, avatar: m.avatar_url || m.picture || '' };
};
