import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient';

const ProtectedRoute = ({ children, redirectTo = '/login' }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    // 1. Check if a user session exists on load
    supabase.auth.getSession().then(({ data: { session } }) => {
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