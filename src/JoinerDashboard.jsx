import React, { useState } from 'react';
import {
  Home, Calendar, ShoppingBag,
  Clock, Star, LogOut, User, Compass, MapIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import JoinerTours from './JoinerTours';
import TourCalendar from './TourCalendar';
import MyBookings from './MyBookings';
import ExclusiveTour from './ExclusiveTour';
 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------
 
const NAV_ITEMS = [
  { icon: <Home size={18} strokeWidth={2} />,       label: 'Dashboard' },
  { icon: <Compass size={18} strokeWidth={2} />,    label: 'Explore Tours' },
  { icon: <ShoppingBag size={18} strokeWidth={2} />,label: 'My Bookings' },
  { icon: <Calendar size={18} strokeWidth={2} />,   label: 'Calendar' },
  { icon: <Clock size={18} strokeWidth={2} />,      label: 'Tracking' },
  { icon: <MapIcon size={18} strokeWidth={2} />,    label: 'Exclusive Tours' },
  { icon: <Star size={18} strokeWidth={2} />,       label: 'Reviews' },
];
 
const JoinerDashboard = () => {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const navigate = useNavigate();
 
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };
 
  return (
    <div style={{
      display: 'flex', height: '100vh',
      fontFamily: "'Inter', system-ui, sans-serif",
      background: '#F2E4D0',
      color: '#1A0A00',
      overflow: 'hidden',
    }}>
 
      {/* ── SIDEBAR ── */}
      <aside style={{
        width: 268,
        flexShrink: 0,
        background: '#1A0A00',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        boxShadow: '4px 0 32px rgba(26,10,0,0.28)',
      }}>
        {/* brand */}
        <div style={{
          padding: '2rem 1.75rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <polygon points="16,4 30,28 2,28" fill="#C45C26" opacity="0.9"/>
              <polygon points="16,10 26,28 6,28" fill="#FDF6EE" opacity="0.25"/>
            </svg>
            <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.03em', color: '#FDF6EE' }}>
              Bandang <span style={{ color: '#C45C26' }}>IBAYO</span>
            </span>
          </div>
          <p style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'rgba(232,210,190,0.4)', margin: 0,
          }}>
            Joiners Portal
          </p>
        </div>
 
        {/* nav */}
        <nav style={{ flex: 1, padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ icon, label }) => (
            <NavItem
              key={label}
              icon={icon}
              label={label}
              active={activeTab === label}
              onClick={() => setActiveTab(label)}
            />
          ))}
        </nav>
 
        {/* sign out */}
        <div style={{ padding: '1.5rem 1.75rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(232,210,190,0.4)',
              fontFamily: 'inherit',
              padding: 0,
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#E8A265'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(232,210,190,0.4)'}
          >
            <LogOut size={16} />
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              Sign Out
            </span>
          </button>
        </div>
      </aside>
 
      {/* ── MAIN ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
 
        {/* header */}
        <header style={{
          background: '#FDF6EE',
          borderBottom: '1px solid rgba(196,92,38,0.12)',
          height: 72,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 2.5rem',
          position: 'sticky', top: 0, zIndex: 10,
          boxShadow: '0 2px 16px rgba(26,10,0,0.06)',
        }}>
          <h2 style={{
            fontWeight: 900, fontSize: 15, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#1A0A00', margin: 0,
          }}>
            {activeTab}
          </h2>
 
          {/* user chip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#F2E4D0',
            border: '1px solid rgba(196,92,38,0.18)',
            borderRadius: 14, padding: '8px 14px',
          }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1A0A00', margin: 0, lineHeight: 1 }}>Joiner</p>
              <p style={{ fontSize: 9, fontWeight: 700, color: '#7A3A18', opacity: 0.65, margin: '3px 0 0', lineHeight: 1 }}>Ready for Adventure</p>
            </div>
            <div style={{
              width: 38, height: 38, borderRadius: 11,
              background: '#1A0A00',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#E8A265', fontWeight: 900, fontSize: 15,
              boxShadow: '0 4px 12px rgba(26,10,0,0.22)',
              flexShrink: 0,
            }}>
              B
            </div>
          </div>
        </header>
 
        {/* content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2.5rem', background: '#F2E4D0' }}>
 
          {activeTab === 'Dashboard' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
 
              {/* hero banner */}
              <div style={{
                position: 'relative',
                background: '#1A0A00',
                borderRadius: 28,
                padding: '3.5rem',
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(26,10,0,0.28)',
                borderBottom: '6px solid #C45C26',
              }}>
                {/* warm glow */}
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  width: '40%', height: '100%',
                  background: 'radial-gradient(ellipse at top right, rgba(196,92,38,0.18) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }} />
                {/* compass watermark */}
                <Compass
                  size={280}
                  style={{
                    position: 'absolute', right: -40, bottom: -40,
                    color: 'rgba(255,255,255,0.04)',
                    transform: 'rotate(12deg)',
                  }}
                />
 
                <div style={{ position: 'relative', zIndex: 1, maxWidth: 620 }}>
                  {/* badge */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: '#C45C26',
                    borderRadius: 999, padding: '5px 16px',
                    marginBottom: 20,
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#FDF6EE' }}>
                      Your Budget Travel Partner
                    </span>
                  </div>
 
                  <h2 style={{
                    fontWeight: 900, fontSize: 'clamp(2rem, 3.5vw, 3rem)',
                    letterSpacing: '-0.03em', lineHeight: 1.05,
                    color: '#FDF6EE', margin: '0 0 20px',
                  }}>
                    Adventure Awaits with<br />
                    <span style={{ color: '#E8A265' }}>Bandang IBAYO</span>
                  </h2>
 
                  <p style={{
                    fontSize: 15, lineHeight: 1.75, fontWeight: 500,
                    color: 'rgba(232,210,190,0.7)', margin: '0 0 32px',
                  }}>
                    Our mission is to make everyone witness the beauty of the Philippines without
                    needing to spend lots of money. From Batanes to Jolo — and hidden regional gems,
                    we provide budget-friendly tours tailored for joiners.
                  </p>
 
                  <button
                    onClick={() => setActiveTab('Explore Tours')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: '#E8A265', color: '#1A0A00',
                      fontWeight: 900, fontSize: 12, letterSpacing: '0.1em',
                      textTransform: 'uppercase', border: 'none', cursor: 'pointer',
                      borderRadius: 12, padding: '14px 28px',
                      boxShadow: '0 8px 24px rgba(232,162,101,0.38)',
                      fontFamily: 'inherit', transition: 'all 0.2s',
                    }}
                  >
                    Explore All Tours →
                  </button>
                </div>
              </div>
 
              {/* stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                <StatCard label="Upcoming Trips" value="0" valueColor="#1A0A00" />
                <StatCard label="Completed Tours" value="0" valueColor="#C45C26" />
              </div>
            </div>
 
          ) : activeTab === 'Explore Tours' ? (
            <JoinerTours />
          ) : activeTab === 'My Bookings' ? (
            <MyBookings />
          ) : activeTab === 'Calendar' ? (
            <TourCalendar />
          ) : activeTab === 'Exclusive Tours' ? (
            <ExclusiveTour />
          ) : (
            /* empty state */
            <div style={{
              height: '100%', minHeight: 400,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: '#FDF6EE',
              borderRadius: 24,
              border: '1px solid rgba(196,92,38,0.12)',
              boxShadow: '0 4px 24px rgba(26,10,0,0.06)',
              padding: '3rem',
              textAlign: 'center',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: '#F2E4D0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(196,92,38,0.25)', marginBottom: 20,
              }}>
                <Compass size={36} />
              </div>
              <h3 style={{
                fontWeight: 900, fontSize: 14, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 8px',
              }}>
                {activeTab} Section
              </h3>
              <p style={{ fontSize: 13, color: '#7A3A18', opacity: 0.6, margin: 0 }}>
                Coming soon — check back later.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
 
/* ── NAV ITEM ── */
const NavItem = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      width: '100%',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px',
      borderRadius: 12,
      border: 'none', cursor: 'pointer',
      fontFamily: 'inherit',
      background: active ? '#C45C26' : 'transparent',
      color: active ? '#FDF6EE' : 'rgba(232,210,190,0.45)',
      fontWeight: active ? 900 : 600,
      transform: active ? 'translateX(4px)' : 'translateX(0)',
      boxShadow: active ? '0 6px 20px rgba(196,92,38,0.35)' : 'none',
      transition: 'all 0.2s',
      textAlign: 'left',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    <span style={{ color: active ? '#FDF6EE' : 'rgba(232,162,101,0.5)', flexShrink: 0 }}>
      {icon}
    </span>
    <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
      {label}
    </span>
  </button>
);
 
/* ── STAT CARD ── */
const StatCard = ({ label, value, valueColor }) => (
  <div style={{
    background: '#FDF6EE',
    borderRadius: 20,
    padding: '2rem',
    border: '1px solid rgba(196,92,38,0.12)',
    boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
  }}>
    <p style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
      textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7,
      margin: '0 0 10px',
    }}>
      {label}
    </p>
    <p style={{
      fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em',
      color: valueColor, margin: 0, lineHeight: 1,
    }}>
      {value}
    </p>
  </div>
);
 
export default JoinerDashboard;