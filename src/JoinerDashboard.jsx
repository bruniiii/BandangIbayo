import React, { useState, useEffect } from 'react';
import {
  Home, Calendar, ShoppingBag, Menu,
  Clock, Star, LogOut, Compass, MapIcon,
  MapPin, ChevronRight, ChevronLeft, Loader2, Wallet, Bell, ChevronsLeft, ChevronsRight,
  CheckCircle2, Sparkles, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import JoinerTours from './JoinerTours';
import TourCalendar from './TourCalendar';
import MyBookings from './MyBookings';
import ExclusiveTour from './ExclusiveTour';
import logoIcon from './assets/newIcon.png';
import { JoinerTracking } from './JoinerTracking';

const NAV_ITEMS = [
  { icon: <Home size={18} strokeWidth={2} />,       label: 'HomePage' },
  { icon: <Compass size={18} strokeWidth={2} />,    label: 'Explore Tours' },
  { icon: <ShoppingBag size={18} strokeWidth={2} />,label: 'My Bookings' },
  { icon: <Calendar size={18} strokeWidth={2} />,   label: 'Calendar' },
  { icon: <Clock size={18} strokeWidth={2} />,      label: 'Tracking' },
  { icon: <MapIcon size={18} strokeWidth={2} />,    label: 'Exclusive Tours' },
  { icon: <Star size={18} strokeWidth={2} />,       label: 'Reviews' },
];

const JoinerDashboard = () => {
  const [activeTab, setActiveTab] = useState('HomePage');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [bookingsFilter, setBookingsFilter] = useState(null); 
  const [calendarTarget, setCalendarTarget] = useState(null); 
  const navigate = useNavigate();

  const [loadingHome, setLoadingHome] = useState(true);
  const [nextTrip, setNextTrip] = useState(null);       
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [monthDots, setMonthDots] = useState([]);        
  const [trackingStop, setTrackingStop] = useState(null); 

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const fetchHomeSummary = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingHome(false); return; }

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, tour_id, booking_status, payment_status,
          tours ( title, destination, start_date, end_date, duration, image_urls )
        `)
        .eq('user_id', user.id)
        .eq('booking_status', 'Completed'); 

      if (error || !data) { setLoadingHome(false); return; }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcoming = data
        .filter(b => b.tours?.end_date && new Date(b.tours.end_date) >= today)
        .sort((a, b) => new Date(a.tours.start_date) - new Date(b.tours.start_date));

      const past = data.filter(b => b.tours?.end_date && new Date(b.tours.end_date) < today);

      setUpcomingCount(upcoming.length);
      setCompletedCount(past.length);

      const soonest = upcoming[0] || null;
      setNextTrip(soonest);

      const dots = upcoming
        .map(b => new Date(b.tours.start_date))
        .filter(d => d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear())
        .map(d => d.getDate());
      setMonthDots(dots);

      if (soonest?.tour_id) {
        const { data: stops } = await supabase
          .from('tour_meetups')
          .select('*')
          .eq('tour_id', soonest.tour_id)
          .order('stop_order', { ascending: true });

        if (stops && stops.length > 0) {
          const active = stops.find(s => s.status === 'CURRENTLY HERE');
          const nextUpcoming = stops.find(s => s.status === 'UPCOMING');
          setTrackingStop(active || nextUpcoming || stops[0]);
        }
      }
    } catch (err) {
      console.error("Error loading homepage stats:", err);
    } finally {
      setLoadingHome(false);
    }
  };

  useEffect(() => {
    fetchHomeSummary();
  }, []);

  const notifications = [];
  if (nextTrip) {
    const paid = nextTrip.payment_status === 'Paid' || nextTrip.payment_status === 'Verified';
    if (!paid) notifications.push({ id: 'payment', text: `Payment pending for ${nextTrip.tours.title}` });
    const daysOut = Math.max(0, Math.ceil((new Date(nextTrip.tours.start_date) - new Date()) / 86400000));
    if (daysOut <= 7) notifications.push({ id: 'soon', text: `${nextTrip.tours.title} departs in ${daysOut} day${daysOut === 1 ? '' : 's'}` });
  }
  if (completedCount > 0) notifications.push({ id: 'review', text: `${completedCount} tour${completedCount === 1 ? '' : 's'} awaiting your review` });

  const nextTripDay = nextTrip && new Date(nextTrip.tours.start_date).getMonth() === new Date().getMonth()
    ? new Date(nextTrip.tours.start_date).getDate()
    : null;

  return (
    <div style={{
      display: 'flex', height: '100vh',
      fontFamily: "'Inter', system-ui, sans-serif",
      background: '#F2E4D0', color: '#1A0A00', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        
        /* RESPONSIVE LAYOUT FRAME BREAKPOINTS */
        @media (max-width: 991px) {
          .desktop-sidebar { display: none !important; }
          .menu-toggle-btn { display: flex !important; }
          .responsive-main-grid { grid-template-columns: 1fr !important; }
          .pulse-stat-row { flex-direction: column !important; gap: 16px !important; }
          .pulse-divider { display: none !important; }
          .responsive-padding { padding: 1.25rem !important; }
          .responsive-hero { padding: 2rem !important; }
        }
      `}</style>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="desktop-sidebar" style={{
        width: sidebarCollapsed ? 84 : 268,
        flexShrink: 0, background: '#1A0A00', display: 'flex', flexDirection: 'column', zIndex: 20,
        boxShadow: '4px 0 32px rgba(26,10,0,0.28)', transition: 'width 0.22s ease', overflow: 'hidden',
      }}>
        <div style={{
          padding: sidebarCollapsed ? '1.75rem 0' : '2rem 1.75rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column',
          alignItems: sidebarCollapsed ? 'center' : 'stretch',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
            <img src={logoIcon} alt="BANDANG IBAYO" style={{ width: sidebarCollapsed ? 44 : 78, height: sidebarCollapsed ? 44 : 78, objectFit: 'contain', transition: 'width 0.22s, height 0.22s', flexShrink: 0 }} />
            {!sidebarCollapsed && (
              <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.03em', color: '#FDF6EE', whiteSpace: 'nowrap' }}>
                Bandang <span style={{ color: '#C45C26' }}>IBAYO</span>
              </span>
            )}
          </div>
          {!sidebarCollapsed && <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(232,210,190,0.4)', margin: 0, whiteSpace: 'nowrap' }}>Joiners Portal</p>}
        </div>

        <div style={{ padding: sidebarCollapsed ? '10px 0' : '10px 1.75rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: sidebarCollapsed ? 'center' : 'flex-end' }}>
          <button onClick={() => setSidebarCollapsed(v => !v)} style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', color: 'rgba(232,210,190,0.5)' }}>
            {sidebarCollapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          </button>
        </div>

        <nav style={{ flex: 1, padding: sidebarCollapsed ? '1.25rem 0.75rem' : '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ icon, label }) => (
            <NavItem key={label} icon={icon} label={label} active={activeTab === label} collapsed={sidebarCollapsed} onClick={() => { setBookingsFilter(null); setCalendarTarget(null); setActiveTab(label); }} />
          ))}
        </nav>

        <div style={{ padding: sidebarCollapsed ? '1.5rem 0' : '1.5rem 1.75rem', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(232,210,190,0.4)', fontFamily: 'inherit', padding: 0 }}>
            <LogOut size={16} />
            {!sidebarCollapsed && <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── MOBILE OVERLAY DRAWER SIDEBAR (MATCHES 4TH PHOTO TYPE ARCHITECTURE) ── */}
      {isMobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.75)', backdropFilter: 'blur(4px)' }} onClick={() => setIsMobileOpen(false)} />
          <aside style={{ position: 'relative', width: 268, height: '100%', background: '#1A0A00', display: 'flex', flexDirection: 'column', boxShadow: '4px 0 32px rgba(26,10,0,0.4)' }}>
            
            {/* Round matching custom close layout trigger bubble button */}
            <button onClick={() => setIsMobileOpen(false)} style={{ position: 'absolute', top: 16, right: -48, width: 34, height: 34, borderRadius: '50%', background: '#C45C26', color: '#FDF6EE', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
              <X size={18} />
            </button>

            <div style={{ padding: '2rem 1.75rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <img src={logoIcon} alt="Logo" style={{ width: 64, height: 64, objectFit: 'contain' }} />
                <span style={{ fontWeight: 900, fontSize: 16, color: '#FDF6EE' }}>Bandang <span style={{ color: '#C45C26' }}>IBAYO</span></span>
              </div>
              <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(232,210,190,0.4)', margin: 0 }}>Joiners Portal</p>
            </div>

            <nav style={{ flex: 1, padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
              {NAV_ITEMS.map(({ icon, label }) => (
                <NavItem key={label} icon={icon} label={label} active={activeTab === label} collapsed={false} onClick={() => { setBookingsFilter(null); setCalendarTarget(null); setActiveTab(label); setIsMobileOpen(false); }} />
              ))}
            </nav>

            <div style={{ padding: '1.5rem 1.75rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(232,210,190,0.4)', fontFamily: 'inherit', padding: 0 }}>
                <LogOut size={16} />
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── MAIN VIEW WORKSPACE AREA ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Navigation Top Header Row bar */}
        <header style={{
          background: '#FDF6EE', borderBottom: '1px solid rgba(196,92,38,0.12)', minHeight: 72,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 1.5rem', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 2px 16px rgba(26,10,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="menu-toggle-btn" onClick={() => setIsMobileOpen(true)} style={{ display: 'none', background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)', padding: 8, borderRadius: 10, color: '#1A0A00', cursor: 'pointer' }}>
              <Menu size={18} />
            </button>
            <h2 style={{ fontWeight: 900, fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1A0A00', margin: 0 }}>
              {activeTab}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowNotifications(v => !v)} style={{ width: 38, height: 38, borderRadius: 12, background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#1A0A00' }}>
                <Bell size={16} />
                {notifications.length > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#C45C26', color: '#FDF6EE', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{notifications.length}</span>}
              </button>

              {showNotifications && (
                <div style={{ position: 'absolute', top: 46, right: 0, width: 260, background: '#FDF6EE', borderRadius: 16, border: '1px solid rgba(196,92,38,0.14)', boxShadow: '0 12px 32px rgba(26,10,0,0.16)', padding: '0.75rem', zIndex: 30 }}>
                  <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.6, margin: '0 0 8px', padding: '0 4px' }}>Notifications</p>
                  {notifications.length === 0 ? <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.6, padding: '8px 4px', margin: 0 }}>You're all caught up.</p> : notifications.map(n => <div key={n.id} style={{ padding: '10px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#1A0A00' }}>{n.text}</div>)}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)', borderRadius: 14, padding: '6px 12px' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8A265', fontWeight: 900, fontSize: 14, boxShadow: '0 4px 12px rgba(26,10,0,0.2)', flexShrink: 0 }}>B</div>
            </div>
          </div>
        </header>

        {/* Content Portal View Frame Container Viewport Layout */}
        <div className="responsive-padding" style={{ flex: 1, overflowY: 'auto', padding: '2.5rem', background: '#F2E4D0' }}>

          {activeTab === 'HomePage' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Hero Banner Area Component Block */}
              <div className="responsive-hero" style={{ position: 'relative', background: '#1A0A00', borderRadius: 28, padding: '3.5rem', overflow: 'hidden', boxShadow: '0 20px 60px rgba(26,10,0,0.28)', borderBottom: '6px solid #C45C26' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: '40%', height: '100%', background: 'radial-gradient(ellipse at top right, rgba(196,92,38,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <Compass size={280} style={{ position: 'absolute', right: -40, bottom: -40, color: 'rgba(255,255,255,0.04)', transform: 'rotate(12deg)' }} />

                <div style={{ position: 'relative', zIndex: 1, maxWidth: 620 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: '#C45C26', borderRadius: 999, padding: '5px 16px', marginBottom: 16 }}>
                    <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#FDF6EE' }}>Your Budget Travel Partner</span>
                  </div>

                  <h2 style={{ fontWeight: 900, fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', letterSpacing: '-0.03em', lineHeight: 1.15, color: '#FDF6EE', margin: '0 0 16px' }}>
                    Adventure Awaits with<br />
                    <span style={{ color: '#E8A265' }}>Bandang IBAYO</span>
                  </h2>

                  <p style={{ fontSize: 14, lineHeight: 1.7, fontWeight: 500, color: 'rgba(232,210,190,0.7)', margin: '0 0 24px' }}>
                    Our mission is to make everyone witness the beauty of the Philippines without needing to spend lots of money. From Batanes to Jolo — and hidden regional gems, we provide budget-friendly tours tailored for joiners.
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    <button onClick={() => setActiveTab('Explore Tours')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#E8A265', color: '#1A0A00', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', borderRadius: 999, padding: '12px 24px', boxShadow: '0 8px 24px rgba(232,162,101,0.3)', fontFamily: 'inherit' }}>Explore Tours →</button>
                    <button onClick={() => setActiveTab('Exclusive Tours')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', color: '#FDF6EE', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', border: '1.5px solid rgba(253,246,238,0.55)', borderRadius: 999, padding: '12px 24px', fontFamily: 'inherit' }}>Request an Exclusive Tour</button>
                  </div>
                </div>
              </div>

              {/* Trip Pulse Stats Row bar board view wrapper */}
              <div style={{ position: 'relative', background: '#1A0A00', borderRadius: 24, padding: '1.75rem 2rem', overflow: 'hidden', borderBottom: '4px solid #C45C26', boxShadow: '0 12px 32px rgba(26,10,0,0.18)' }}>
                <Sparkles size={160} style={{ position: 'absolute', right: -20, top: -30, color: 'rgba(255,255,255,0.03)', transform: 'rotate(-8deg)' }} />
                <div className="pulse-stat-row" style={{ position: 'relative', zIndex: 1, display: 'flex', width: '100%' }}>
                  <PulseStat icon={<Compass size={20} />} label="Upcoming Trips" value={loadingHome ? '—' : upcomingCount} subcopy={upcomingCount > 0 ? "You've got something to look forward to" : 'Your next stamp is one tap away'} onClick={() => { setBookingsFilter('upcoming'); setActiveTab('My Bookings'); }} />
                  <div className="pulse-divider" style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 2rem' }} />
                  <PulseStat icon={<Star size={20} />} label="Completed Tours" value={loadingHome ? '—' : completedCount} subcopy={completedCount > 0 ? 'Adventures logged and loved' : 'First stories start with first trips'} onClick={() => { setBookingsFilter('completed'); setActiveTab('My Bookings'); }} />
                </div>
              </div>

              {/* FIXED GRID CONTEXT WRAPPER: Changed structure layout configuration mapping to guarantee a clean column reflow */}
              <div className="responsive-main-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>
                
                {/* Primary dynamic left column frame */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
                  <NextTripCard loading={loadingHome} trip={nextTrip} onViewBookings={() => setActiveTab('My Bookings')} />
                  {!loadingHome && nextTrip && <TripReadinessCard trip={nextTrip} onClick={() => setActiveTab('My Bookings')} />}
                </div>

                {/* Secondary side helper column block context rail list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
                  <CalendarWidget loading={loadingHome} monthDots={monthDots} nextTripDay={nextTripDay} onClick={() => { setCalendarTarget(null); setActiveTab('Calendar'); }} onDayClick={(target) => { setCalendarTarget(target); setActiveTab('Calendar'); }} />
                  <TrackingSnippet loading={loadingHome} hasTrip={!!nextTrip} stop={trackingStop} onClick={() => setActiveTab('Tracking')} />
                  <ReviewPromptCard loading={loadingHome} completedCount={completedCount} onClick={() => setActiveTab('Reviews')} />
                </div>

              </div>

            </div>
          ) : activeTab === 'Explore Tours' ? (
            <JoinerTours />
          ) : activeTab === 'My Bookings' ? (
            <MyBookings initialFilter={bookingsFilter} />
          ) : activeTab === 'Calendar' ? (
            <TourCalendar initialDate={calendarTarget} />
          ) : activeTab === 'Exclusive Tours' ? (
            <ExclusiveTour />
          ) : activeTab === 'Tracking' ? (
            <JoinerTracking />
          ) : (
            <div style={{ height: '100%', minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FDF6EE', borderRadius: 24, border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 24px rgba(26,10,0,0.06)', padding: '3rem', textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, background: '#F2E4D0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(196,92,38,0.25)', marginBottom: 20 }}><Compass size={36} /></div>
              <h3 style={{ fontWeight: 900, fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 8px' }}>{activeTab} Section</h3>
              <p style={{ fontSize: 13, color: '#7A3A18', opacity: 0.6, margin: 0 }}>Coming soon — check back later.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

/* ── NAV ITEM ── */
const NavItem = ({ icon, label, active, collapsed, onClick }) => (
  <button
    onClick={onClick}
    title={collapsed ? label : undefined}
    style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
      justifyContent: collapsed ? 'center' : 'flex-start',
      padding: collapsed ? '13px 0' : '11px 14px', borderRadius: 12,
      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      background: active ? '#C45C26' : 'transparent',
      color: active ? '#FDF6EE' : 'rgba(232,210,190,0.45)',
      fontWeight: active ? 900 : 600,
      transform: active && !collapsed ? 'translateX(4px)' : 'translateX(0)',
      boxShadow: active ? '0 6px 20px rgba(196,92,38,0.35)' : 'none',
      transition: 'all 0.2s', textAlign: 'left',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    <span style={{ color: active ? '#FDF6EE' : 'rgba(232,162,101,0.5)', flexShrink: 0 }}>{icon}</span>
    {!collapsed && <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
  </button>
);

/* ── PULSE STAT ── */
const PulseStat = ({ icon, label, value, subcopy, onClick }) => (
  <div
    onClick={onClick}
    role="button"
    style={{
      flex: 1, display: 'flex', alignItems: 'center', gap: 16,
      cursor: onClick ? 'pointer' : 'default',
      borderRadius: 14, padding: '8px 12px',
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
  >
    <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'rgba(232,162,101,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8A265' }}>{icon}</div>
    <div style={{ flex: 1 }}>
      <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(232,210,190,0.5)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', color: '#FDF6EE', margin: '0 0 4px', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(232,210,190,0.55)', margin: 0 }}>{subcopy}</p>
    </div>
    {onClick && <ChevronRight size={16} style={{ color: 'rgba(232,210,190,0.3)', flexShrink: 0 }} />}
  </div>
);

const NextTripCard = ({ loading, trip, onViewBookings }) => {
  const cardStyle = { background: '#FDF6EE', borderRadius: 22, border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column' };
  if (loading) return <div style={{ ...cardStyle, alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'rgba(122,58,24,0.4)', minHeight: 260 }}><Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /></div>;
  if (!trip) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(trip.tours.start_date);
  const daysToGo = Math.max(0, Math.ceil((startDate - today) / 86400000));
  const cover = trip.tours.image_urls?.[0];

  return (
    <div onClick={onViewBookings} style={{ ...cardStyle, cursor: 'pointer', position: 'relative', minHeight: 260 }}>
      {cover && <img src={cover} alt={trip.tours.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(26,10,0,0.92) 0%, rgba(26,10,0,0.35) 60%, rgba(26,10,0,0.15) 100%)' }} />
      <div style={{ position: 'relative', zIndex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
        <span style={{ alignSelf: 'flex-start', background: '#C45C26', color: '#FDF6EE', fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', borderRadius: 999, padding: '5px 12px' }}>Next Trip</span>
        <div>
          <p style={{ fontSize: 34, fontWeight: 900, color: '#FDF6EE', margin: '0 0 4px', letterSpacing: '-0.03em' }}>{daysToGo === 0 ? 'Today!' : `${daysToGo} day${daysToGo === 1 ? '' : 's'} to go`}</p>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#E8A265', margin: '0 0 4px' }}>{trip.tours.title}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(253,246,238,0.7)', display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}><MapPin size={13} /> {trip.tours.destination}</p>
        </div>
      </div>
    </div>
  );
};

const TripReadinessCard = ({ trip, onClick }) => {
  const paymentVerified = trip.payment_status === 'Paid' || trip.payment_status === 'Verified';
  const chip = (label, ok) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: ok ? 'rgba(196,92,38,0.08)' : 'rgba(122,58,24,0.06)', border: `1px solid ${ok ? 'rgba(196,92,38,0.22)' : 'rgba(122,58,24,0.14)'}`, borderRadius: 12, padding: '10px 14px', flex: 1 }}>
      <CheckCircle2 size={16} style={{ color: ok ? '#C45C26' : 'rgba(122,58,24,0.3)', flexShrink: 0 }} />
      <div>
        <p style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.6, margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{ok ? 'Confirmed' : 'Pending'}</p>
      </div>
    </div>
  );

  return (
    <div onClick={onClick} style={{ background: '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wallet size={15} style={{ color: '#C45C26' }} /><span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00' }}>Trip Readiness</span></div>
        <ChevronRight size={15} style={{ color: 'rgba(122,58,24,0.4)' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{chip('Booking', trip.booking_status === 'Completed')}{chip('Payment', paymentVerified)}</div>
      {!paymentVerified && <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.65, margin: '12px 0 0' }}>Settle your remaining balance before departure to lock in your seat.</p>}
    </div>
  );
};

const CalendarWidget = ({ loading, monthDots, nextTripDay, onClick, onDayClick }) => {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  const viewDate = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString('default', { month: 'long' });
  const isCurrentMonth = monthOffset === 0;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const prevMonthLastDate = new Date(year, month, 0).getDate();
  const todayDate = base.getDate();
  const trailingCount = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) { cells.push({ day: prevMonthLastDate - i, muted: true }); }
  for (let d = 1; d <= daysInMonth; d++) { cells.push({ day: d, muted: false }); }
  for (let d = 1; d <= trailingCount; d++) { cells.push({ day: d, muted: true }); }

  return (
    <div style={{ background: '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)', display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div onClick={() => onDayClick ? onDayClick({ year, month, day: null }) : onClick?.()} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><Calendar size={15} style={{ color: '#C45C26' }} /><span style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00' }}>{monthName} {year}</span></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setMonthOffset(o => o - 1)} style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(196,92,38,0.18)', background: 'transparent', cursor: 'pointer', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={13} /></button>
          <button onClick={() => setMonthOffset(o => o + 1)} style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(196,92,38,0.18)', background: 'transparent', cursor: 'pointer', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={13} /></button>
        </div>
      </div>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0', color: 'rgba(122,58,24,0.4)' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, width: '100%' }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} style={{ fontSize: 9, fontWeight: 800, textAlign: 'center', color: 'rgba(122,58,24,0.4)', paddingBottom: 4 }}>{d}</span>)}
          {cells.map(({ day, muted }, i) => {
            const isToday = isCurrentMonth && !muted && day === todayDate;
            const isConfirmedTrip = isCurrentMonth && !muted && day === nextTripDay;
            const hasDot = isCurrentMonth && !muted && monthDots.includes(day) && !isConfirmedTrip;
            return (
              <div key={i} onClick={() => muted ? onClick?.() : onDayClick ? onDayClick({ year, month, day }) : onClick?.()} style={{ position: 'relative', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer', background: isConfirmedTrip ? '#E8A265' : isToday ? '#1A0A00' : 'transparent', color: muted ? 'rgba(122,58,24,0.25)' : isConfirmedTrip ? '#1A0A00' : isToday ? '#E8A265' : '#1A0A00', fontSize: 11, fontWeight: (isToday || isConfirmedTrip) ? 900 : 600 }}>
                {day}
                {hasDot && <span style={{ position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: '50%', background: '#C45C26' }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const TrackingSnippet = ({ loading, hasTrip, stop, onClick }) => {
  const isActive = stop?.status === 'CURRENTLY HERE';
  return (
    <div onClick={onClick} style={{ background: isActive ? '#1A0A00' : '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={15} style={{ color: isActive ? '#E8A265' : '#C45C26' }} /><span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: isActive ? '#FDF6EE' : '#1A0A00' }}>Tracking</span></div>
        <ChevronRight size={15} style={{ color: isActive ? 'rgba(253,246,238,0.5)' : 'rgba(122,58,24,0.4)' }} />
      </div>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0', color: 'rgba(122,58,24,0.4)' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /></div> : !hasTrip ? <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.6, margin: 0 }}>Tracking activates once you have a confirmed trip.</p> : !stop ? <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.6, margin: 0 }}>No pickup route posted yet.</p> : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><MapPin size={14} style={{ color: isActive ? '#E8A265' : '#C45C26' }} /><span style={{ fontSize: 13, fontWeight: 900, color: isActive ? '#FDF6EE' : '#1A0A00' }}>{stop.location_name}</span></div>
          <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: isActive ? '#C45C26' : 'rgba(196,92,38,0.12)', color: isActive ? '#FDF6EE' : '#7A3A18' }}>{stop.status}</span>
        </div>
      )}
    </div>
  );
};

const ReviewPromptCard = ({ loading, completedCount, onClick }) => {
  const hasCompleted = completedCount > 0;
  return (
    <div onClick={onClick} style={{ background: hasCompleted ? '#1A0A00' : '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bell size={15} style={{ color: hasCompleted ? '#E8A265' : '#C45C26' }} /><span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: hasCompleted ? '#FDF6EE' : '#1A0A00' }}>Reviews</span></div>
        <ChevronRight size={15} style={{ color: hasCompleted ? 'rgba(253,246,238,0.5)' : 'rgba(122,58,24,0.4)' }} />
      </div>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0', color: 'rgba(122,58,24,0.4)' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /></div> : !hasCompleted ? <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.6, margin: 0 }}>Finish a tour to unlock your first review.</p> : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Star size={14} style={{ color: '#E8A265' }} /><span style={{ fontSize: 13, fontWeight: 900, color: '#FDF6EE' }}>{completedCount} tour{completedCount === 1 ? '' : 's'} to review</span></div>
          <p style={{ fontSize: 11, color: 'rgba(253,246,238,0.65)', margin: 0 }}>Tell other joiners how it went — it takes a minute.</p>
        </div>
      )}
    </div>
  );
};

export default JoinerDashboard;