import React, { useState, useEffect, useCallback } from 'react';
import {
  Home, Calendar, ShoppingBag,
  Clock, Star, LogOut, User, Compass, MapIcon,
  MapPin, ChevronRight, Loader2, Wallet, Bell, ChevronsLeft, ChevronsRight,
  CheckCircle2, Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import JoinerTours from './JoinerTours';
import TourCalendar from './TourCalendar';
import MyBookings from './MyBookings';
import ExclusiveTour from './ExclusiveTour';
import logoIcon from './assets/newIcon.png';
import { JoinerTracking } from './JoinerTracking';
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
  const navigate = useNavigate();

  // ── Dashboard summary data (drives stat cards + calendar/tracking snippets) ──
  const [loadingHome, setLoadingHome] = useState(true);
  const [nextTrip, setNextTrip] = useState(null);       // nearest upcoming confirmed booking
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [monthDots, setMonthDots] = useState([]);        // days-of-month with a booked tour
  const [trackingStop, setTrackingStop] = useState(null); // current/next meetup stop for nextTrip

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const fetchHomeSummary = useCallback(async () => {
    // NOTE: no setLoadingHome(true) here on purpose — loadingHome already starts
    // true from useState, and calling setState before the first `await` runs
    // synchronously inside the effect, which triggers the
    // react-hooks/set-state-in-effect lint error (cascading renders).
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingHome(false); return; }

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, tour_id, booking_status, payment_status,
        tours ( title, destination, start_date, end_date, duration, image_urls )
      `)
      .eq('user_id', user.id)
      .eq('booking_status', 'Completed'); // "Completed" here means payment verified/confirmed booking

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

    // Dots for the mini calendar: any upcoming trip's start date, this month
    const dots = upcoming
      .map(b => new Date(b.tours.start_date))
      .filter(d => d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear())
      .map(d => d.getDate());
    setMonthDots(dots);

    // Tracking preview for the soonest trip
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

    setLoadingHome(false);
  }, []);

  useEffect(() => {
    fetchHomeSummary();
  }, [fetchHomeSummary]);

  return (
    <div style={{
      display: 'flex', height: '100vh',
      fontFamily: "'Inter', system-ui, sans-serif",
      background: '#F2E4D0',
      color: '#1A0A00',
      overflow: 'hidden',
    }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: sidebarCollapsed ? 84 : 268,
        flexShrink: 0,
        background: '#1A0A00',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        boxShadow: '4px 0 32px rgba(26,10,0,0.28)',
        transition: 'width 0.22s ease',
        overflow: 'hidden',
      }}>
        {/* brand */}
        <div style={{
          padding: sidebarCollapsed ? '1.75rem 0' : '2rem 1.75rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column',
          alignItems: sidebarCollapsed ? 'center' : 'stretch',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
          }}>
            <img
            src={logoIcon}
            alt="BANDANG IBAYO"
            style={{ width: sidebarCollapsed ? 44 : 78, height: sidebarCollapsed ? 44 : 78, objectFit: 'contain', transition: 'width 0.22s, height 0.22s', flexShrink: 0 }}
        />
            {!sidebarCollapsed && (
              <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.03em', color: '#FDF6EE', whiteSpace: 'nowrap' }}>
                Bandang <span style={{ color: '#C45C26' }}>IBAYO</span>
              </span>
            )}
          </div>
          {!sidebarCollapsed && (
            <p style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(232,210,190,0.4)', margin: 0,
              whiteSpace: 'nowrap',
            }}>
              Joiners Portal
            </p>
          )}
        </div>

        {/* collapse/expand toggle */}
        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(232,210,190,0.4)',
            fontFamily: 'inherit',
            padding: sidebarCollapsed ? '12px 0' : '12px 1.75rem',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#E8A265'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(232,210,190,0.4)'}
        >
          {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!sidebarCollapsed && (
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Collapse
            </span>
          )}
        </button>

        {/* nav */}
        <nav style={{
          flex: 1, padding: sidebarCollapsed ? '1.25rem 0.75rem' : '1.25rem 1rem',
          display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto',
        }}>
          {NAV_ITEMS.map(({ icon, label }) => (
            <NavItem
              key={label}
              icon={icon}
              label={label}
              active={activeTab === label}
              collapsed={sidebarCollapsed}
              onClick={() => setActiveTab(label)}
            />
          ))}
        </nav>

        {/* sign out */}
        <div style={{
          padding: sidebarCollapsed ? '1.5rem 0' : '1.5rem 1.75rem',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
        }}>
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
            <LogOut size={16} />
            {!sidebarCollapsed && (
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

          {activeTab === 'HomePage' ? (
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

              {/* trip pulse — dark band echoing the hero, replaces flat stat cards */}
              <div style={{
                position: 'relative',
                background: '#1A0A00',
                borderRadius: 24,
                padding: '2rem 2.5rem',
                overflow: 'hidden',
                borderBottom: '4px solid #C45C26',
                boxShadow: '0 12px 32px rgba(26,10,0,0.18)',
              }}>
                <Sparkles size={160} style={{
                  position: 'absolute', right: -20, top: -30,
                  color: 'rgba(255,255,255,0.03)', transform: 'rotate(-8deg)',
                }} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex' }}>
                  <PulseStat
                    icon={<Compass size={20} />}
                    label="Upcoming Trips"
                    value={loadingHome ? '—' : upcomingCount}
                    subcopy={upcomingCount > 0
                      ? "You've got something to look forward to"
                      : 'Your next stamp is one tap away'}
                  />
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 2.5rem' }} />
                  <PulseStat
                    icon={<Star size={20} />}
                    label="Completed Tours"
                    value={loadingHome ? '—' : completedCount}
                    subcopy={completedCount > 0
                      ? 'Adventures logged and loved'
                      : 'First stories start with first trips'}
                  />
                </div>
              </div>

              {/* ── Main content: left = trip focus, right = calendar / tracking / reviews rail ── */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
                gap: 20,
                alignItems: 'start',
              }}>

                {/* LEFT — the trip itself */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
                  <NextTripCard
                    loading={loadingHome}
                    trip={nextTrip}
                    onExploreExclusive={() => setActiveTab('Exclusive Tours')}
                    onViewBookings={() => setActiveTab('My Bookings')}
                  />
                  {!loadingHome && nextTrip && (
                    <TripReadinessCard trip={nextTrip} onClick={() => setActiveTab('My Bookings')} />
                  )}
                </div>

                {/* RIGHT RAIL — calendar, tracking, reviews */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
                  <CalendarSnippet
                    loading={loadingHome}
                    monthDots={monthDots}
                    onClick={() => setActiveTab('Calendar')}
                  />
                  <TrackingSnippet
                    loading={loadingHome}
                    hasTrip={!!nextTrip}
                    stop={trackingStop}
                    onClick={() => setActiveTab('Tracking')}
                  />
                  <ReviewPromptCard
                    loading={loadingHome}
                    completedCount={completedCount}
                    onClick={() => setActiveTab('Reviews')}
                  />
                </div>
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
          ) : activeTab === 'Tracking' ? (
            <JoinerTracking />
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
const NavItem = ({ icon, label, active, collapsed, onClick }) => (
  <button
    onClick={onClick}
    title={collapsed ? label : undefined}
    style={{
      width: '100%',
      display: 'flex', alignItems: 'center', gap: 12,
      justifyContent: collapsed ? 'center' : 'flex-start',
      padding: collapsed ? '13px 0' : '11px 14px',
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

/* ── TRIP PULSE STAT ── */
const PulseStat = ({ icon, label, value, subcopy }) => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
    <div style={{
      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
      background: 'rgba(232,162,101,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#E8A265',
    }}>
      {icon}
    </div>
    <div>
      <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(232,210,190,0.5)', margin: '0 0 4px' }}>
        {label}
      </p>
      <p style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', color: '#FDF6EE', margin: '0 0 4px', lineHeight: 1 }}>
        {value}
      </p>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(232,210,190,0.55)', margin: 0 }}>
        {subcopy}
      </p>
    </div>
  </div>
);

const NextTripCard = ({ loading, trip, onExploreExclusive, onViewBookings }) => {
  const cardStyle = {
    background: '#FDF6EE',
    borderRadius: 22,
    border: '1px solid rgba(196,92,38,0.12)',
    boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  };

  if (loading) {
    return (
      <div style={{ ...cardStyle, alignItems: 'center', justifyContent: 'center', padding: '2rem', color: 'rgba(122,58,24,0.4)', minHeight: 240 }}>
        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!trip) {
    return (
      <div style={{ ...cardStyle, padding: '2rem', justifyContent: 'space-between', minHeight: 240 }}>
        <div>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.6, margin: '0 0 8px' }}>
            No upcoming trip
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#1A0A00', margin: 0, lineHeight: 1.5, maxWidth: 420 }}>
            You don't have a confirmed trip yet. While you decide, take a look at this month's exclusive picks.
          </p>
        </div>
        <button
          onClick={onExploreExclusive}
          style={{
            marginTop: 16, alignSelf: 'flex-start',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#1A0A00', color: '#E8A265',
            border: 'none', borderRadius: 999, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 900, fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            padding: '10px 18px',
          }}
        >
          See Exclusive Picks <ChevronRight size={13} />
        </button>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(trip.tours.start_date);
  const daysToGo = Math.max(0, Math.ceil((startDate - today) / 86400000));
  const cover = trip.tours.image_urls?.[0];

  return (
    <div
      onClick={onViewBookings}
      style={{ ...cardStyle, cursor: 'pointer', position: 'relative', minHeight: 240 }}
    >
      {cover && (
        <img src={cover} alt={trip.tours.title} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover',
        }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(26,10,0,0.92) 0%, rgba(26,10,0,0.35) 60%, rgba(26,10,0,0.15) 100%)',
      }} />
      <div style={{ position: 'relative', zIndex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
        <span style={{
          alignSelf: 'flex-start',
          background: '#C45C26', color: '#FDF6EE',
          fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
          borderRadius: 999, padding: '5px 12px',
        }}>
          Next Trip
        </span>
        <div>
          <p style={{ fontSize: 34, fontWeight: 900, color: '#FDF6EE', margin: '0 0 4px', letterSpacing: '-0.03em' }}>
            {daysToGo === 0 ? 'Today!' : `${daysToGo} day${daysToGo === 1 ? '' : 's'} to go`}
          </p>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#E8A265', margin: '0 0 4px' }}>
            {trip.tours.title}
          </p>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(253,246,238,0.7)', display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}>
            <MapPin size={13} /> {trip.tours.destination}
          </p>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   TRIP READINESS CARD — booking + payment status for the next trip,
   surfaced from fields already fetched (booking_status, payment_status)
───────────────────────────────────────────── */
const TripReadinessCard = ({ trip, onClick }) => {
  const paymentVerified = trip.payment_status === 'Paid' || trip.payment_status === 'Verified';

  const chip = (label, ok) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: ok ? 'rgba(196,92,38,0.08)' : 'rgba(122,58,24,0.06)',
      border: `1px solid ${ok ? 'rgba(196,92,38,0.22)' : 'rgba(122,58,24,0.14)'}`,
      borderRadius: 12, padding: '10px 14px', flex: 1,
    }}>
      <CheckCircle2 size={16} style={{ color: ok ? '#C45C26' : 'rgba(122,58,24,0.3)', flexShrink: 0 }} />
      <div>
        <p style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.6, margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{ok ? 'Confirmed' : 'Pending'}</p>
      </div>
    </div>
  );

  return (
    <div
      onClick={onClick}
      style={{
        background: '#FDF6EE', borderRadius: 22, padding: '1.5rem',
        border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wallet size={15} style={{ color: '#C45C26' }} />
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00' }}>
            Trip Readiness
          </span>
        </div>
        <ChevronRight size={15} style={{ color: 'rgba(122,58,24,0.4)' }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {chip('Booking', trip.booking_status === 'Completed')}
        {chip('Payment', paymentVerified)}
      </div>
      {!paymentVerified && (
        <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.65, margin: '12px 0 0' }}>
          Settle your remaining balance before departure to lock in your seat.
        </p>
      )}
    </div>
  );
};


const CalendarSnippet = ({ loading, monthDots, onClick }) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = today.toLocaleString('default', { month: 'long' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const todayDate = today.getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div
      onClick={onClick}
      style={{
        background: '#FDF6EE', borderRadius: 22, padding: '1.5rem',
        border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={15} style={{ color: '#C45C26' }} />
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00' }}>
            {monthName}
          </span>
        </div>
        <ChevronRight size={15} style={{ color: 'rgba(122,58,24,0.4)' }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0', color: 'rgba(122,58,24,0.4)' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} style={{ fontSize: 8, fontWeight: 800, textAlign: 'center', color: 'rgba(122,58,24,0.4)' }}>{d}</span>
          ))}
          {cells.map((d, i) => {
            const isToday = d === todayDate;
            const hasDot = d && monthDots.includes(d);
            return (
              <div key={i} style={{
                position: 'relative',
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8,
                background: isToday ? '#1A0A00' : 'transparent',
                color: isToday ? '#E8A265' : d ? '#1A0A00' : 'transparent',
                fontSize: 10, fontWeight: isToday ? 900 : 600,
              }}>
                {d || ''}
                {hasDot && !isToday && (
                  <span style={{
                    position: 'absolute', bottom: 1, width: 4, height: 4, borderRadius: '50%', background: '#C45C26',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.6, margin: '14px 0 0' }}>
        {monthDots.length > 0 ? `${monthDots.length} trip date(s) this month` : 'View full calendar →'}
      </p>
    </div>
  );
};


const TrackingSnippet = ({ loading, hasTrip, stop, onClick }) => {
  const isActive = stop?.status === 'CURRENTLY HERE';

  return (
    <div
      onClick={onClick}
      style={{
        background: isActive ? '#1A0A00' : '#FDF6EE', borderRadius: 22, padding: '1.5rem',
        border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={15} style={{ color: isActive ? '#E8A265' : '#C45C26' }} />
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: isActive ? '#FDF6EE' : '#1A0A00' }}>
            Live Tracking
          </span>
        </div>
        <ChevronRight size={15} style={{ color: isActive ? 'rgba(253,246,238,0.5)' : 'rgba(122,58,24,0.4)' }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0', color: 'rgba(122,58,24,0.4)' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : !hasTrip ? (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.6, margin: 0 }}>
          Tracking activates once you have a confirmed trip.
        </p>
      ) : !stop ? (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.6, margin: 0 }}>
          No pickup route posted for your trip yet.
        </p>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <MapPin size={14} style={{ color: isActive ? '#E8A265' : '#C45C26' }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: isActive ? '#FDF6EE' : '#1A0A00' }}>
              {stop.location_name}
            </span>
          </div>
          <span style={{
            display: 'inline-block', fontSize: 9, fontWeight: 800,
            padding: '3px 10px', borderRadius: 999,
            background: isActive ? '#C45C26' : 'rgba(196,92,38,0.12)',
            color: isActive ? '#FDF6EE' : '#7A3A18',
          }}>
            {stop.status}
          </span>
        </div>
      )}
    </div>
  );
};


const ReviewPromptCard = ({ loading, completedCount, onClick }) => {
  const hasCompleted = completedCount > 0;

  return (
    <div
      onClick={onClick}
      style={{
        background: hasCompleted ? '#1A0A00' : '#FDF6EE', borderRadius: 22, padding: '1.5rem',
        border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={15} style={{ color: hasCompleted ? '#E8A265' : '#C45C26' }} />
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: hasCompleted ? '#FDF6EE' : '#1A0A00' }}>
            Reviews
          </span>
        </div>
        <ChevronRight size={15} style={{ color: hasCompleted ? 'rgba(253,246,238,0.5)' : 'rgba(122,58,24,0.4)' }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0', color: 'rgba(122,58,24,0.4)' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : !hasCompleted ? (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.6, margin: 0 }}>
          Finish a tour to unlock your first review.
        </p>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Star size={14} style={{ color: '#E8A265' }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: '#FDF6EE' }}>
              {completedCount} tour{completedCount === 1 ? '' : 's'} to review
            </span>
          </div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(253,246,238,0.65)', margin: 0 }}>
            Tell other joiners how it went — it takes a minute.
          </p>
        </div>
      )}
    </div>
  );
};

export default JoinerDashboard;