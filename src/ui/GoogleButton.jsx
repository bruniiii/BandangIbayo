import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { signInWithGoogle } from '../googleAuth';
import { toast } from './toast';

// Google's "G" mark, in its own colors.
const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

// "Continue with Google", for the login and register pages.
const GoogleButton = ({ nextPath = null, label = 'Continue with Google' }) => {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const { ok, error } = await signInWithGoogle(nextPath);
    // On success the browser is already on its way to Google.
    if (!ok) { setBusy(false); toast.error("Couldn't open Google sign-in", error); }
  };
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      style={{
        width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        background: '#FFFFFF', color: '#1F1F1F', border: '1.5px solid rgba(26,10,0,0.18)', borderRadius: 14,
        fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
        boxShadow: '0 2px 8px rgba(26,10,0,0.06)',
      }}
    >
      {busy ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <GoogleMark />}
      {busy ? 'Opening Google…' : label}
    </button>
  );
};

// A thin "or" line between the Google button and the email form.
export const OrDivider = () => (
  <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#7A3A18', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
    <span style={{ flex: 1, height: 1, background: 'rgba(180,81,30,0.2)' }} /> or <span style={{ flex: 1, height: 1, background: 'rgba(180,81,30,0.2)' }} />
  </div>
);

export default GoogleButton;
