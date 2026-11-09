import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';

// The joiner pages (/dashboard). An admin account signed in here (e.g. after
// signing in as the admin in another tab of the same browser: a browser holds
// one sign-in at a time) goes to the admin dashboard instead of being treated
// as a joiner with an unfinished profile.
const ProtectedRoute = ({ children, redirectTo = '/login' }) => {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    // 1. Check if a user session exists on load
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // An archived admin (still signed in from before) is signed out.
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
        if (profile?.role === 'archived_admin') {
          await supabase.auth.signOut();
          toast.error('This admin account was archived', 'Ask the main admin to restore it.');
          session = null;
        } else if (profile?.role === 'admin') {
          toast.info('Signed in as the admin', 'This browser is signed in with the admin account (maybe from another tab), so the admin dashboard opened. To test as a joiner, use another browser or a private window.');
          setIsAdmin(true);
        } else if (profile?.archived_at) {
          // An archived joiner still logged in (e.g. on another device) is logged out.
          await supabase.auth.signOut();
          if (profile.archive_reason === 'removed') toast.error('This account was removed', 'Bandang IBAYO removed this account. Please message us if you think this is a mistake.');
          else toast.error('This account is archived', 'Log in again to restore it.');
          session = null;
        }
      }
      setSession(session);
      setLoading(false);
    });

    // 2. Listen for any login/logout changes
    // Another tab signed in with a different account: this page reloads, so it
    // never shows one account's pages with another account's sign-in.
    let firstUser;
    supabase.auth.getSession().then(({ data }) => { firstUser = data.session?.user?.id ?? null; });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const now = session?.user?.id ?? null;
      if (firstUser !== undefined && firstUser && now && now !== firstUser) { window.location.reload(); return; }
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null; // Or a loading spinner
  if (isAdmin) return <Navigate to="/admin/dashboard" replace />;

  if (!session) {
    // Redirect if not logged in, coming back here after login
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${redirectTo}?next=${next}`} replace />;
  }

  return children;
};

export default ProtectedRoute;