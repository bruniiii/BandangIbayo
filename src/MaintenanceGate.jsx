import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wrench, Mail, Phone, MessageCircle, RefreshCw, Clock } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useMaintenance, maintenanceChanged } from './maintenanceMode';
import logoIcon from './assets/logo.png';

// ─────────────────────────────────────────────
// While Maintenance Mode is on (System Maintenance → System Settings), the
// whole joiner side (homepage, tours, register, login, joiner dashboard)
// shows a "We'll be back soon" page instead. Admins who are logged in see
// the site as normal, and the login page still works for them through the
// "Admin login" link (/login?admin=1). Drivers' tracking links aren't
// wrapped, so a trip in progress keeps working.
//   <MaintenanceGate><LandingPage /></MaintenanceGate>
// ─────────────────────────────────────────────

const useIsAdmin = (needed) => {
  const [isAdmin, setIsAdmin] = useState(null);
  useEffect(() => {
    if (!needed) return undefined;
    let live = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { if (live) setIsAdmin(false); return; }
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (live) setIsAdmin(data?.role === 'admin');
    });
    return () => { live = false; };
  }, [needed]);
  return isAdmin;
};

export const MaintenancePage = ({ maintenance }) => {
  const a = maintenance.agency || {};
  const contacts = [
    a.email && [Mail, a.email, `mailto:${a.email}`],
    a.phone && [Phone, a.phone, `tel:${String(a.phone).replace(/\s/g, '')}`],
    a.facebook && [MessageCircle, 'Message us on Facebook', /^https?:\/\//.test(a.facebook) ? a.facebook : `https://${a.facebook}`],
  ].filter(Boolean);
  return (
    <main className="nature-bg" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}>
      <div style={{
        width: '100%', maxWidth: 560, background: '#FDF6EE', borderRadius: 28, borderTop: '8px solid #B4511E',
        boxShadow: '0 32px 80px rgba(26,10,0,0.25)', padding: 'clamp(1.5rem, 5vw, 2.5rem)', textAlign: 'center', boxSizing: 'border-box',
      }}>
        <img src={logoIcon} alt="Bandang IBAYO" style={{ width: 76, height: 76, objectFit: 'contain' }} />
        <p style={{ margin: '14px 0 0', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A' }}>
          <Wrench size={14} /> Under maintenance
        </p>
        <h1 style={{ margin: '6px 0 0', fontSize: 'clamp(26px, 6vw, 34px)', fontWeight: 900, color: '#1A0A00', letterSpacing: '-0.02em' }}>We'll be back soon</h1>
        <p style={{ margin: '12px 0 0', fontSize: 15, fontWeight: 600, color: '#5C2A10', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {maintenance.message || `${a.name || 'Bandang IBAYO'} is being updated to serve you better. Your bookings and payments are safe.`}
        </p>
        {maintenance.until && (
          <p style={{ margin: '14px auto 0', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: '#F2E4D0', fontSize: 13, fontWeight: 800, color: '#1A0A00' }}>
            <Clock size={15} color="#B4511E" /> Back by {maintenance.until}
          </p>
        )}
        {contacts.length > 0 && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(180,81,30,0.15)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7A3A18' }}>Need help in the meantime?</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, justifyItems: 'center' }}>
              {contacts.map((c) => {
                const [, text, href] = c;
                const Icon = c[0];
                return (
                <li key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#1A0A00', overflowWrap: 'anywhere' }}>
                  <Icon size={16} color="#B4511E" style={{ flexShrink: 0 }} />
                  {href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="text-link">{text}</a> : text}
                </li>
                );
              })}
            </ul>
          </div>
        )}
        <button type="button" onClick={maintenanceChanged} style={{
          marginTop: 22, display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 20px', borderRadius: 999, border: 'none',
          background: '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
        }}>
          <RefreshCw size={15} /> Check Again
        </button>
        <p style={{ margin: '18px 0 0', fontSize: 12, fontWeight: 600, color: '#7A3A18' }}>
          Admin? <Link to="/login?admin=1" className="text-link">Admin login</Link>
        </p>
      </div>
    </main>
  );
};

const MaintenanceGate = ({ children, adminLogin = false }) => {
  const maintenance = useMaintenance();
  const location = useLocation();
  const isAdmin = useIsAdmin(maintenance.on);
  if (!maintenance.loaded) return null;
  if (!maintenance.on) return children;
  // The login page stays open for admins (link on the maintenance page).
  if (adminLogin && new URLSearchParams(location.search).get('admin') === '1') return children;
  if (isAdmin === null) return null;
  if (isAdmin) return children;
  return <MaintenancePage maintenance={maintenance} />;
};

export default MaintenanceGate;
