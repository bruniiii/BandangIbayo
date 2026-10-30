import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from './supabaseClient';
import { safeNextPath } from './tourUtils';
import { profileIsComplete } from './googleAuth';
import { usePopupError } from './ui/usePopupError';

// ─────────────────────────────────────────────
// /auth/callback: where Google sends the browser back after "Continue with
// Google". Waits for the session, then: admins → admin dashboard; joiners
// with a finished profile → dashboard (or where they were going); new
// Google joiners → /complete-profile.
// ─────────────────────────────────────────────

const waitForSession = () => new Promise((resolve) => {
  let done = false;
  const finish = (session) => { if (!done) { done = true; sub.subscription.unsubscribe(); clearTimeout(timer); resolve(session); } };
  const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session) finish(session); });
  supabase.auth.getSession().then(({ data }) => { if (data.session) finish(data.session); });
  const timer = setTimeout(() => finish(null), 10000);
});

const AuthCallback = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState(() => {
    // Google or Supabase can send an error back (e.g. the user pressed Cancel).
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return params.get('error_description') || hash.get('error_description') || '';
  });
  usePopupError(error);

  useEffect(() => {
    if (error) return undefined;
    let cancelled = false;
    (async () => {
      const session = await waitForSession();
      if (cancelled) return;
      if (!session) { setError('Google sign-in didn\'t finish. Please try again.'); return; }
      const next = safeNextPath(params.get('next'));
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (cancelled) return;
      if (profile?.role === 'archived_admin') { await supabase.auth.signOut(); setError("This admin account was archived, so it can't log in. Ask the main admin to restore it."); return; }
      if (profile?.role === 'admin') navigate('/admin/dashboard', { replace: true });
      else if (!profileIsComplete(profile)) navigate(`/complete-profile${next ? `?next=${encodeURIComponent(next)}` : ''}`, { replace: true });
      else navigate(next || '/dashboard', { replace: true });
    })();
    return () => { cancelled = true; };
  }, [error, navigate, params]);

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FDF6EE', padding: 24, fontFamily: "'Outfit', 'Inter', system-ui, sans-serif", textAlign: 'center' }}>
      {error ? (
        <div style={{ maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <AlertTriangle size={36} style={{ color: '#8C2F1C' }} />
          <h1 style={{ fontSize: 22, color: '#1A0A00', margin: 0 }}>Couldn't sign in with Google</h1>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#7A3A18', margin: 0 }}>{error}</p>
          <Link to="/login" className="text-link" style={{ fontSize: 14 }}>Back to login</Link>
        </div>
      ) : (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: '#7A3A18' }}>
          <Loader2 size={30} style={{ color: '#A8481A', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Signing you in…</p>
        </div>
      )}
    </div>
  );
};

export default AuthCallback;
