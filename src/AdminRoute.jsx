import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Like ProtectedRoute, but also requires profiles.role === 'admin'.
// Logged-in joiners are sent to their own dashboard instead.
const AdminRoute = ({ children }) => {
  const [status, setStatus] = useState('loading'); // 'loading' | 'admin' | 'joiner' | 'guest'

  useEffect(() => {
    let active = true;

    const checkRole = async (session) => {
      if (!session) {
        if (active) setStatus('guest');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (active) setStatus(profile?.role === 'admin' ? 'admin' : 'joiner');
    };

    supabase.auth.getSession().then(({ data: { session } }) => checkRole(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkRole(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (status === 'loading') return null;
  if (status === 'guest') return <Navigate to="/login" replace />;
  if (status === 'joiner') return <Navigate to="/dashboard" replace />;

  return children;
};

export default AdminRoute;
