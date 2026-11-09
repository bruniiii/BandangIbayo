import React, { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase, openedFromResetLink } from './supabaseClient';
import logoIcon from './assets/logo.png';
 
// Pages other than the landing page load only when they're opened, so the
// landing page doesn't download the whole app first.
const JoinerLogin = lazy(() => import('./JoinerLogin'));
const JoinerRegister = lazy(() => import('./JoinerRegister'));
const AuthCallback = lazy(() => import('./AuthCallback'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import MaintenanceGate from './MaintenanceGate';
import LandingPage from './LandingPage';
const JoinerDashboard = lazy(() => import('./JoinerDashboard'));
const ForgotPassword = lazy(() => import('./ForgotPassword'));
const ResetPassword = lazy(() => import('./ResetPassword'));
const PublicTourList = lazy(() => import('./PublicTours').then((m) => ({ default: m.PublicTourList })));
// The driver's trip page (live van location), opened from a private link; no login.
const DriverTrip = lazy(() => import('./DriverTrip'));
const PublicTourDetail = lazy(() => import('./PublicTours').then((m) => ({ default: m.PublicTourDetail })));
 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------
 

// Shown for a moment while a page's code loads.
const PageLoading = () => (
  <div role="status" aria-label="Loading" style={{ minHeight: '100dvh', background: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <img src={logoIcon} alt="" width={56} height={56} style={{ opacity: 0.85, animation: 'ibayo-pulse 1.2s ease-in-out infinite' }} />
    <style>{'@keyframes ibayo-pulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.06);opacity:1}}'}</style>
  </div>
);

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // A password reset link always opens the "set a new password" page, even if
  // Supabase sent it to the homepage.
  useEffect(() => {
    // Waits for Supabase to read the sign-in details from the link first.
    if (openedFromResetLink && pathname !== '/reset-password') {
      supabase.auth.getSession().then(() => navigate('/reset-password', { replace: true }));
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') navigate('/reset-password', { replace: true });
    });
    return () => subscription.unsubscribe();
    // Only when the site first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/" element={<MaintenanceGate><LandingPage /></MaintenanceGate>} />
      <Route path="/login" element={<MaintenanceGate adminLogin><JoinerLogin /></MaintenanceGate>} />
      <Route path="/register" element={<MaintenanceGate><JoinerRegister /></MaintenanceGate>} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/complete-profile" element={<MaintenanceGate><JoinerRegister mode="complete" /></MaintenanceGate>} />
      <Route path="/tours" element={<MaintenanceGate><PublicTourList /></MaintenanceGate>} />
      <Route path="/tours/:id" element={<MaintenanceGate><PublicTourDetail /></MaintenanceGate>} />
      <Route path="/driver/:token" element={<DriverTrip />} />
      <Route path="/dashboard/*" element={<MaintenanceGate><ProtectedRoute><JoinerDashboard /></ProtectedRoute></MaintenanceGate>} />
      <Route path="/admin/*" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<MaintenanceGate><LandingPage /></MaintenanceGate>} />
    </Routes>
    </Suspense>
  );
}