import React, { useState, useEffect } from 'react';
import {
  Home, Calendar, ShoppingBag,
  Clock, Star, LogOut, User, Compass, MapIcon, ChevronLeft, ChevronRight, Menu, X, Rss
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import JoinerTours from './JoinerTours';
import TourCalendar from './TourCalendar';
import MyBookings from './MyBookings';
import ExclusiveTour from './ExclusiveTour';
import Feed from './Feed';
import Reviews from './Reviews';
import ProfileSettings from './Profilesettings.jsx';
 
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
  { icon: <Rss size={18} strokeWidth={2} />,        label: 'Feed' },
  { icon: <Compass size={18} strokeWidth={2} />,    label: 'Explore Tours' },
  { icon: <ShoppingBag size={18} strokeWidth={2} />,label: 'My Bookings' },
  { icon: <Calendar size={18} strokeWidth={2} />,   label: 'Calendar' },
  { icon: <Clock size={18} strokeWidth={2} />,      label: 'Tracking' },
  { icon: <MapIcon size={18} strokeWidth={2} />,    label: 'Exclusive Tours' },
  { icon: <Star size={18} strokeWidth={2} />,       label: 'Reviews' },
  { icon: <User size={18} strokeWidth={2} />,       label: 'Profile Settings' },
];
 
const JoinerDashboard = () => {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
 
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      if (!mobile) setMobileNavOpen(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
 
  const sidebarExpanded = isMobile ? true : sidebarOpen;
 
  const handleNavClick = (label) => {
    setActiveTab(label);
    if (isMobile) setMobileNavOpen(false);
  };
 
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };
 
  return (
    <div className="joiner-dashboard-container" style={{
      display: 'flex', height: '100vh',
      fontFamily: "'Inter', system-ui, sans-serif",
      background: '#F2E4D0',
      color: '#1A0A00',
      overflow: 'hidden',
    }}>
 
      {/* MOBILE OVERLAY (dims content behind the drawer) */}
      <div
        className={`sidebar-overlay ${mobileNavOpen ? 'is-open' : ''}`}
        onClick={() => setMobileNavOpen(false)}
      />
 
      {/* ── SIDEBAR ── */}
      <aside className={`dashboard-sidebar ${mobileNavOpen ? 'is-open' : ''}`} style={{
        width: sidebarExpanded ? 268 : 84,
        flexShrink: 0,
        background: '#1A0A00',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        boxShadow: '4px 0 32px rgba(26,10,0,0.28)',
        position: 'relative',
        transition: 'width 0.25s ease',
        overflow: 'visible',
      }}>
        {(!isMobile || mobileNavOpen) && (
        <button
          onClick={() => isMobile ? setMobileNavOpen(false) : setSidebarOpen(v => !v)}
          title={isMobile ? 'Close menu' : (sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar')}
          style={{
            position: 'absolute',
            top: 26, right: -14,
            width: 28, height: 28,
            borderRadius: '50%',
            background: '#C45C26',
            border: '3px solid #F2E4D0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: '#FDF6EE',
            zIndex: 30,
            boxShadow: '0 4px 12px rgba(26,10,0,0.35)',
            transition: 'background 0.2s, transform 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#E8A265'}
          onMouseLeave={e => e.currentTarget.style.background = '#C45C26'}
        >
          {isMobile ? <X size={16} strokeWidth={3} /> : (sidebarOpen ? <ChevronLeft size={16} strokeWidth={3} /> : <ChevronRight size={16} strokeWidth={3} />)}
        </button>
        )}
 
        {/* brand */}
        <div style={{
          padding: sidebarExpanded ? '2rem 1.75rem' : '2rem 0',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column',
          alignItems: sidebarExpanded ? 'stretch' : 'center',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: sidebarExpanded ? 6 : 0,
            justifyContent: sidebarExpanded ? 'flex-start' : 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
              <polygon points="16,4 30,28 2,28" fill="#C45C26" opacity="0.9"/>
              <polygon points="16,10 26,28 6,28" fill="#FDF6EE" opacity="0.25"/>
            </svg>
            {sidebarExpanded && (
              <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.03em', color: '#FDF6EE', whiteSpace: 'nowrap' }}>
                Bandang <span style={{ color: '#C45C26' }}>IBAYO</span>
              </span>
            )}
          </div>
          {sidebarExpanded && (
            <p style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(232,210,190,0.4)', margin: 0,
              whiteSpace: 'nowrap',
            }}>
              Joiners Portal
            </p>
          )}
        </div>
 
        {/* nav */}
        <nav style={{ flex: 1, padding: sidebarExpanded ? '1.25rem 1rem' : '1.25rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV_ITEMS.map(({ icon, label }) => (
            <NavItem
              key={label}
              icon={icon}
              label={label}
              active={activeTab === label}
              collapsed={!sidebarExpanded}
              onClick={() => handleNavClick(label)}
            />
          ))}
        </nav>
 
        {/* sign out */}
        <div style={{ padding: sidebarExpanded ? '1.5rem 1.75rem' : '1.5rem 0', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: sidebarExpanded ? 'flex-start' : 'center' }}>
          <button
            onClick={handleLogout}
            title="Sign Out"
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
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {sidebarExpanded && (
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Sign Out
              </span>
            )}
          </button>
        </div>
      </aside>
 
      {/* ── MAIN ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
 
        {/* header */}
        <header className="dashboard-header" style={{
          background: '#FDF6EE',
          borderBottom: '1px solid rgba(196,92,38,0.12)',
          height: 72,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 2.5rem',
          position: 'sticky', top: 0, zIndex: 10,
          boxShadow: '0 2px 16px rgba(26,10,0,0.06)',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            {/* hamburger - hidden on desktop via CSS, shown <=900px */}
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
 
            <h2 className="dashboard-header-title" style={{
              fontWeight: 900, fontSize: 15, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#1A0A00', margin: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {activeTab}
            </h2>
          </div>
 
          {/* user chip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#F2E4D0',
            border: '1px solid rgba(196,92,38,0.18)',
            borderRadius: 14, padding: '8px 14px',
          }}>
            <div className="dashboard-user-chip-text" style={{ textAlign: 'right' }}>
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
        <div className="dashboard-content" style={{ flex: 1, overflowY: 'auto', padding: '2.5rem', background: '#F2E4D0' }}>
 
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
              }} className="dashboard-hero-padding">
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 20 }}>
                <StatCard label="Upcoming Trips" value="0" valueColor="#1A0A00" />
                <StatCard label="Completed Tours" value="0" valueColor="#C45C26" />
              </div>
            </div>
 
          ) : activeTab === 'Feed' ? (
            <Feed isAdmin={false} />
          ) : activeTab === 'Explore Tours' ? (
            <JoinerTours />
          ) : activeTab === 'My Bookings' ? (
            <MyBookings />
          ) : activeTab === 'Calendar' ? (
            <TourCalendar />
          ) : activeTab === 'Exclusive Tours' ? (
            <ExclusiveTour />
          ) : activeTab === 'Reviews' ? (
            <Reviews isAdmin={false} />
          ) : activeTab === 'Profile Settings' ? (
            <ProfileSettings />
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
const NavItem = ({ icon, label, active, onClick, collapsed }) => (
  <button
    onClick={onClick}
    title={collapsed ? label : undefined}
    style={{
      width: '100%',
      display: 'flex', alignItems: 'center',
      justifyContent: collapsed ? 'center' : 'flex-start',
      gap: collapsed ? 0 : 12,
      padding: collapsed ? '11px 0' : '11px 14px',
      borderRadius: 12,
      border: 'none', cursor: 'pointer',
      fontFamily: 'inherit',
      background: active ? '#C45C26' : 'transparent',
      color: active ? '#FDF6EE' : 'rgba(232,210,190,0.45)',
      fontWeight: active ? 900 : 600,
      transform: active && !collapsed ? 'translateX(4px)' : 'translateX(0)',
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
    {!collapsed && (
      <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    )}
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