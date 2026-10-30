import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';

const ProtectedRoute = ({ children, redirectTo = '/login' }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    // 1. Check if a user session exists on load
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // An archived admin (still signed in from before) is signed out.
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
        if (profile?.role === 'archived_admin') {
          await supabase.auth.signOut();
          toast.error('This admin account was archived', 'Ask the main admin to restore it.');
          session = null;
        }
      }
      setSession(session);
      setLoading(false);
    });

    // 2. Listen for any login/logout changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null; // Or a loading spinner

  if (!session) {
    // Redirect if not logged in, coming back here after login
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${redirectTo}?next=${next}`} replace />;
  }

  return children;
};

export default ProtectedRoute;