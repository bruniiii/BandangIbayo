import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Home, Calendar as CalendarIcon, ShoppingBag,
  Clock, Star, LogOut, User, Compass, MapIcon, ChevronLeft, ChevronRight, Menu, X, Rss,
  ArrowRight, MapPin, ImageIcon, CheckCircle2, Users, Eye, Bell, Wallet, Sparkles, Loader2
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
import logoIcon from './assets/newIcon.png';
import { JoinerTracking } from './JoinerTracking';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------

const NAV_ITEMS = [
  { icon: <Home size={18} strokeWidth={2} />,        label: 'HomePage' },
  { icon: <Rss size={18} strokeWidth={2} />,         label: 'Feed' },
  { icon: <Compass size={18} strokeWidth={2} />,     label: 'Explore Tours' },
  { icon: <ShoppingBag size={18} strokeWidth={2} />, label: 'My Bookings' },
  { icon: <CalendarIcon size={18} strokeWidth={2} />,label: 'Calendar' },
  { icon: <Clock size={18} strokeWidth={2} />,       label: 'Tracking' },
  { icon: <MapIcon size={18} strokeWidth={2} />,     label: 'Exclusive Tours' },
  { icon: <Star size={18} strokeWidth={2} />,        label: 'Reviews' },
  { icon: <User size={18} strokeWidth={2} />,        label: 'Profile Settings' },
];

const JoinerDashboard = () => {
  const [activeTab, setActiveTab] = useState('HomePage');
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const tourScrollRef = useRef(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [bookingsFilter, setBookingsFilter] = useState(null); // 'upcoming' | 'completed' | null
  const [calendarTarget, setCalendarTarget] = useState(null); // { year, month, day }
  const navigate = useNavigate();

  // ── DYNAMIC DASHBOARD DATA ──
  const [loadingHome, setLoadingHome] = useState(true);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [nextTrip, setNextTrip] = useState(null);
  const [monthDots, setMonthDots] = useState([]);
  const [trackingStop, setTrackingStop] = useState(null);
  const [featuredTours, setFeaturedTours] = useState([]);
  const [selectedTour, setSelectedTour] = useState(null);

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

  const sidebarExpanded = isMobile ? true : sidebarHovered;

  const scrollTours = (direction) => {
    if (tourScrollRef.current) {
      tourScrollRef.current.scrollBy({ left: direction * 250, behavior: 'smooth' });
    }
  };

  const handleNavClick = (label) => {
    setBookingsFilter(null);
    setCalendarTarget(null);
    setActiveTab(label);
    if (isMobile) setMobileNavOpen(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // Date Range Formatter
  const formatDateRange = (dateString, duration) => {
    if (!dateString) return "";
    try {
      const [year, month, day] = dateString.split('-').map(Number);
      const daysMatch = duration ? duration.match(/(\d+)\s*day/i) : null;
      const numDays = daysMatch ? parseInt(daysMatch[1]) : 1;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const startDate = new Date(year, month - 1, day);
      const endDate = new Date(year, month - 1, day + numDays - 1);
      const startMonth = monthNames[startDate.getMonth()];
      const endMonth = monthNames[endDate.getMonth()];
      if (numDays <= 1) return `${startMonth} ${startDate.getDate()}, ${year}`;
      return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}, ${startDate.getFullYear()}`;
    } catch {
      return dateString;
    }
  };

  // ── combined dashboard fetcher: metrics, next trip, calendar dots,
  //    tracking preview, and the featured tour packages grid ──
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoadingHome(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: userBookings } = await supabase
          .from('bookings')
          .select('*, tours(*)')
          .eq('user_id', user.id);

        if (userBookings) {
          let upcoming = 0;
          let completed = 0;
          let soonest = null;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const dots = [];

          const activeBookings = userBookings.filter(
            b => b.booking_status !== 'Cancelled' && b.booking_status !== 'Rejected'
          );

          activeBookings.forEach(booking => {
            const tour = booking.tours;
            const tourDateStr = tour?.start_date || booking.start_date;

            if (booking.booking_status === 'Completed') {
              completed++;
            } else if (tourDateStr) {
              const tourDate = new Date(tourDateStr);
              if (tourDate >= today) {
                upcoming++;
                if (tour && tourDate.getMonth() === today.getMonth() && tourDate.getFullYear() === today.getFullYear()) {
                  dots.push(tourDate.getDate());
                }
                if (!soonest || tourDate < new Date(soonest.tours.start_date)) {
                  soonest = booking;
                }
              } else {
                completed++;
              }
            } else {
              upcoming++;
            }
          });

          setUpcomingCount(upcoming);
          setCompletedCount(completed);
          setMonthDots(dots);
          setNextTrip(soonest);

          if (soonest?.tour_id) {
            const { data: stops } = await supabase
              .from('tour_meetups')
              .select('*')
              .eq('tour_id', soonest.tour_id)
              .order('stop_order', { ascending: true });

            if (stops && stops.length > 0) {
              const active = stops.find(s => s.status === 'CURRENTLY HERE');
              const upcomingStop = stops.find(s => s.status === 'UPCOMING');
              setTrackingStop(active || upcomingStop || stops[0]);
            } else {
              setTrackingStop(null);
            }
          } else {
            setTrackingStop(null);
          }
        }
      }

      const { data: toursData } = await supabase
        .from('tours')
        .select('*')
        .eq('is_archived', false)
        .order('start_date', { ascending: true })
        .limit(4);

      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('tour_id, slots_booked')
        .not('booking_status', 'in', '("Cancelled","Rejected")');

      const updatedTours = (toursData || []).map(tour => {
        const totalBooked = (bookingsData || [])
          .filter(b => b.tour_id === tour.id)
          .reduce((sum, b) => sum + (b.slots_booked || 0), 0);
        const maxCapacity = tour.group_size || 18;
        return {
          ...tour,
          current_booked: totalBooked,
          available_slots: Math.max(0, maxCapacity - totalBooked)
        };
      });

      setFeaturedTours(updatedTours);
    } catch (err) {
      console.error("Dashboard engine critical fetch error:", err);
    } finally {
      setLoadingHome(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'HomePage') fetchDashboardData();
  }, [activeTab, fetchDashboardData]);

  // ── Notifications, built from real fetched data ──
  const notifications = [];
  if (nextTrip) {
    const paid = nextTrip.payment_status === 'Paid' || nextTrip.payment_status === 'Verified';
    if (!paid) notifications.push({ id: 'payment', text: `Payment pending for ${nextTrip.tours?.title}` });
    const daysOut = Math.max(0, Math.ceil((new Date(nextTrip.tours?.start_date) - new Date()) / 86400000));
    if (daysOut <= 7) notifications.push({ id: 'soon', text: `${nextTrip.tours?.title} departs in ${daysOut} day${daysOut === 1 ? '' : 's'}` });
  }
  if (completedCount > 0) notifications.push({ id: 'review', text: `${completedCount} tour${completedCount === 1 ? '' : 's'} awaiting your review` });

  const nextTripDay = nextTrip && new Date(nextTrip.tours?.start_date).getMonth() === new Date().getMonth()
    ? new Date(nextTrip.tours?.start_date).getDate()
    : null;

  return (
    <div className="joiner-dashboard-container" style={{
      display: 'flex', height: '100vh',
      fontFamily: "'Inter', system-ui, sans-serif",
      background: '#F2E4D0',
      color: '#1A0A00',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .tour-packages-scroll{scrollbar-width:none;-ms-overflow-style:none;}
        .tour-packages-scroll::-webkit-scrollbar{display:none;}
      `}</style>

      {/* MOBILE OVERLAY (dims content behind the drawer) */}
      <div
        className={`sidebar-overlay ${mobileNavOpen ? 'is-open' : ''}`}
        onClick={() => setMobileNavOpen(false)}
      />

      {/* ── SIDEBAR — expands on hover (desktop), tap-to-open drawer (mobile) ── */}
      <aside
        className={`dashboard-sidebar ${mobileNavOpen ? 'is-open' : ''}`}
        onMouseEnter={() => { if (!isMobile) setSidebarHovered(true); }}
        onMouseLeave={() => { if (!isMobile) setSidebarHovered(false); }}
        style={{
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
        {isMobile && mobileNavOpen && (
          <button
            onClick={() => setMobileNavOpen(false)}
            title="Close menu"
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
            <X size={16} strokeWidth={3} />
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
            <img src={logoIcon} alt="BANDANG IBAYO" style={{ width: 78, height: 78, objectFit: 'contain', flexShrink: 0 }} />
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

      {/* ── MAIN WORKSPACE ── */}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* notification bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowNotifications(v => !v)}
                aria-label="Notifications"
                style={{
                  width: 38, height: 38, borderRadius: 12,
                  background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#1A0A00', position: 'relative',
                }}
              >
                <Bell size={16} />
                {notifications.length > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#C45C26', color: '#FDF6EE',
                    fontSize: 9, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {notifications.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div style={{
                  position: 'absolute', top: 46, right: 0, width: 280,
                  background: '#FDF6EE', borderRadius: 16,
                  border: '1px solid rgba(196,92,38,0.14)',
                  boxShadow: '0 12px 32px rgba(26,10,0,0.16)',
                  padding: '0.75rem', zIndex: 30,
                }}>
                  <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.6, margin: '0 0 8px', padding: '0 4px' }}>
                    Notifications
                  </p>
                  {notifications.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.6, padding: '8px 4px', margin: 0 }}>
                      You're all caught up.
                    </p>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} style={{
                        padding: '10px 8px', borderRadius: 10,
                        fontSize: 12, fontWeight: 600, color: '#1A0A00',
                      }}>
                        {n.text}
                      </div>
                    ))
                  )}
                </div>
              )}
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
              <div style={{ width: 38, height: 38, borderRadius: 11, background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8A265', fontWeight: 900, fontSize: 15, boxShadow: '0 4px 12px rgba(26,10,0,0.22)' }}>B</div>
            </div>
          </div>
        </header>

        {/* content */}
        <div className="dashboard-content" style={{ flex: 1, overflowY: 'auto', padding: '2.5rem', background: '#F2E4D0' }}>

          {activeTab === 'HomePage' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

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
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  width: '40%', height: '100%',
                  background: 'radial-gradient(ellipse at top right, rgba(196,92,38,0.18) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }} />
                <Compass
                  size={280}
                  style={{
                    position: 'absolute', right: -40, bottom: -40,
                    color: 'rgba(255,255,255,0.04)',
                    transform: 'rotate(12deg)',
                  }}
                />

                <div style={{ position: 'relative', zIndex: 1, maxWidth: 650, display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: '#C45C26', borderRadius: 999, padding: '4px 12px', marginBottom: 10, width: 'fit-content' }}>
                    <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#FDF6EE' }}>Your Budget Travel Partner</span>
                  </div>
                  <h2 style={{ fontWeight: 900, fontSize: '1.8rem', letterSpacing: '-0.02em', lineHeight: 1.1, color: '#FDF6EE', margin: '0 0 10px' }}>
                    Adventure Awaits with <span style={{ color: '#E8A265' }}>Bandang IBAYO</span>
                  </h2>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, fontWeight: 500, color: 'rgba(232,210,190,0.85)', margin: '0 0 16px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    Our mission is to make everyone witness the beauty of the Philippines without needing to spend lots of money. Focusing exclusively on budget-friendly land tours and overland road trips, accommodating hassle-free road trip adventures completely by land tailored for every joiner.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => setActiveTab('Exclusive Tours')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#E8A265', color: '#1A0A00', fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', borderRadius: 8, padding: '10px 18px', fontFamily: 'inherit', transition: 'all 0.2s' }}>Plan a Trip</button>
                  </div>
                </div>
              </div>

              {/* TRIP PULSE — dark clickable stat band, routes into My Bookings pre-filtered */}
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
                    onClick={() => { setBookingsFilter('upcoming'); setActiveTab('My Bookings'); }}
                  />
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 2.5rem' }} />
                  <PulseStat
                    icon={<Star size={20} />}
                    label="Completed Tours"
                    value={loadingHome ? '—' : completedCount}
                    subcopy={completedCount > 0
                      ? 'Adventures logged and loved'
                      : 'First stories start with first trips'}
                    onClick={() => { setBookingsFilter('completed'); setActiveTab('My Bookings'); }}
                  />
                </div>
              </div>

              {/* SPLIT GRID: left = trip focus + tour packages, right = calendar/tracking/reviews rail */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, alignItems: 'start' }}>

                {/* LEFT COL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                  {!loadingHome && nextTrip && (
                    <NextTripCard
                      trip={nextTrip}
                      onViewBookings={() => { setBookingsFilter('upcoming'); setActiveTab('My Bookings'); }}
                    />
                  )}
                  {!loadingHome && nextTrip && (
                    <TripReadinessCard trip={nextTrip} onClick={() => { setBookingsFilter('upcoming'); setActiveTab('My Bookings'); }} />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontWeight: 900, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1A0A00', margin: 0 }}>Latest Tour Packages</h3>
                    {featuredTours.length > 1 && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => scrollTours(-1)}
                          aria-label="Previous tours"
                          style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(196,92,38,0.2)', background: '#FDF6EE', cursor: 'pointer', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          onClick={() => scrollTours(1)}
                          aria-label="Next tours"
                          style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(196,92,38,0.2)', background: '#FDF6EE', cursor: 'pointer', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div
                    ref={tourScrollRef}
                    className="tour-packages-scroll"
                    style={{ display: 'flex', gap: 16, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 4 }}
                  >
                    {featuredTours.map((tour) => {
                      const isFull = tour.available_slots <= 0;
                      return (
                        <div key={tour.id} style={{ flex: '0 0 220px', scrollSnapAlign: 'start', background: '#FDF6EE', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 14px rgba(26,10,0,0.04)', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ height: 115, background: '#E8D5BC', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                            {tour.image_urls?.[0] ? <img src={tour.image_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.2)' }}><ImageIcon size={32} /></div>}
                            <div style={{ position: 'absolute', top: 10, left: 10 }}><span style={{ background: 'rgba(253,246,238,0.95)', borderRadius: 999, padding: '3px 10px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', color: '#1A0A00' }}>{tour.difficulty}</span></div>
                            <div style={{ position: 'absolute', top: 10, right: 10 }}><span style={{ background: isFull ? '#ef4444' : '#C45C26', color: '#FDF6EE', borderRadius: 999, padding: '3px 8px', fontSize: 7, fontWeight: 900, textTransform: 'uppercase' }}>{isFull ? 'Full' : `${tour.available_slots} Slots`}</span></div>
                          </div>
                          <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                                <h4 style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1 }}>{tour.title}</h4>
                                <span style={{ fontSize: 12, fontWeight: 900, color: '#C45C26', flexShrink: 0 }}>₱{tour.price?.toLocaleString()}</span>
                              </div>
                              <p style={{ fontSize: 9.5, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 4, margin: '6px 0' }}><MapPin size={10} style={{ color: '#C45C26' }} /> {tour.destination}</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '9px', fontWeight: 700, color: '#7A3A18', textTransform: 'uppercase' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><CalendarIcon size={11} style={{ color: '#C45C26' }} /> {formatDateRange(tour.start_date, tour.duration)}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Users size={11} style={{ color: '#C45C26' }} /> {tour.current_booked} / {tour.group_size} Booked</div>
                              </div>
                            </div>
                            <button onClick={() => setSelectedTour(tour)} disabled={isFull} style={{ width: '100%', padding: '8px 0', border: 'none', borderRadius: 8, cursor: isFull ? 'not-allowed' : 'pointer', fontWeight: 900, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: isFull ? '#F2E4D0' : '#1A0A00', color: isFull ? 'rgba(122,58,24,0.5)' : '#FDF6EE' }}>
                              <Eye size={11} /> {isFull ? 'Closed' : 'View Details'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setActiveTab('Explore Tours')}
                    style={{
                      width: '100%',
                      padding: '12px 0',
                      borderRadius: '12px',
                      background: '#1A0A00',
                      border: '1.5px solid #C45C26',
                      color: '#fff',
                      fontWeight: 900,
                      fontSize: '11px',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      fontFamily: 'inherit',
                      boxShadow: '0 4px 12px rgba(196,92,38,0.03)',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#fff';
                      e.currentTarget.style.color = '#1A0A00';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#1A0A00';
                      e.currentTarget.style.color = '#fff';
                    }}
                  >
                    <span>See More</span>
                    <ArrowRight size={13} strokeWidth={2.5} />
                  </button>
                </div>

                {/* RIGHT RAIL: calendar widget, tracking snippet, review prompt */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <CalendarWidget
                    loading={loadingHome}
                    monthDots={monthDots}
                    nextTripDay={nextTripDay}
                    onClick={() => { setCalendarTarget(null); setActiveTab('Calendar'); }}
                    onDayClick={(target) => { setCalendarTarget(target); setActiveTab('Calendar'); }}
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

          ) : activeTab === 'Feed' ? (
            <Feed isAdmin={false} />
          ) : activeTab === 'Explore Tours' ? (
            <JoinerTours />
          ) : activeTab === 'My Bookings' ? (
            <MyBookings initialFilter={bookingsFilter} />
          ) : activeTab === 'Calendar' ? (
            <TourCalendar initialDate={calendarTarget} />
          ) : activeTab === 'Exclusive Tours' ? (
            <ExclusiveTour />
          ) : activeTab === 'Reviews' ? (
            <Reviews isAdmin={false} />
          ) : activeTab === 'Profile Settings' ? (
            <ProfileSettings />
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

      {/* ── INLINE DETAILED TOUR BOOKING OVERLAY MODAL ── */}
      {selectedTour && (
        <DetailedTourModal
          tour={selectedTour}
          onClose={() => setSelectedTour(null)}
          formatDateRange={formatDateRange}
          onBookingSuccess={fetchDashboardData}
        />
      )}
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

/* ── TRIP PULSE STAT — clickable, routes into My Bookings pre-filtered ── */
const PulseStat = ({ icon, label, value, subcopy, onClick }) => (
  <div
    onClick={onClick}
    role="button"
    style={{
      flex: 1, display: 'flex', alignItems: 'center', gap: 16,
      cursor: onClick ? 'pointer' : 'default',
      borderRadius: 14, padding: '4px 8px', margin: '-4px -8px',
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
  >
    <div style={{
      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
      background: 'rgba(232,162,101,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#E8A265',
    }}>
      {icon}
    </div>
    <div style={{ flex: 1 }}>
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
    {onClick && (
      <ChevronRight size={16} style={{ color: 'rgba(232,210,190,0.3)', flexShrink: 0 }} />
    )}
  </div>
);

/* ── NEXT TRIP CARD ── */
const NextTripCard = ({ trip, onViewBookings }) => {
  const cardStyle = {
    background: '#FDF6EE',
    borderRadius: 22,
    border: '1px solid rgba(196,92,38,0.12)',
    boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
    overflow: 'hidden',
  };

  if (!trip?.tours) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(trip.tours.start_date);
  const daysToGo = Math.max(0, Math.ceil((startDate - today) / 86400000));
  const cover = trip.tours.image_urls?.[0];

  return (
    <div
      onClick={onViewBookings}
      style={{ ...cardStyle, cursor: 'pointer', position: 'relative', minHeight: 220 }}
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
      <div style={{ position: 'relative', zIndex: 1, padding: '1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', minHeight: 220 }}>
        <span style={{
          alignSelf: 'flex-start',
          background: '#C45C26', color: '#FDF6EE',
          fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
          borderRadius: 999, padding: '5px 12px',
        }}>
          Next Trip
        </span>
        <div>
          <p style={{ fontSize: 30, fontWeight: 900, color: '#FDF6EE', margin: '0 0 4px', letterSpacing: '-0.03em' }}>
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

/* ── TRIP READINESS CARD ── */
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

/* ── CALENDAR WIDGET — full month grid with prev/next navigation ── */
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
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ day: prevMonthLastDate - i, muted: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, muted: false });
  }
  for (let d = 1; d <= trailingCount; d++) {
    cells.push({ day: d, muted: true });
  }

  const handleCellClick = (day, muted) => {
    if (muted) {
      onClick?.();
      return;
    }
    if (onDayClick) {
      onDayClick({ year, month, day });
    } else {
      onClick?.();
    }
  };

  const handleHeaderClick = () => {
    if (onDayClick) {
      onDayClick({ year, month, day: null });
    } else {
      onClick?.();
    }
  };

  return (
    <div
      style={{
        background: '#FDF6EE', borderRadius: 22, padding: '1.75rem',
        border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div onClick={handleHeaderClick} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <CalendarIcon size={16} style={{ color: '#C45C26' }} />
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.01em', color: '#1A0A00' }}>
            {monthName} {year}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setMonthOffset(o => o - 1)}
            aria-label="Previous month"
            style={{
              width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(196,92,38,0.18)',
              background: 'transparent', cursor: 'pointer', color: '#7A3A18',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={() => setMonthOffset(o => o + 1)}
            aria-label="Next month"
            style={{
              width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(196,92,38,0.18)',
              background: 'transparent', cursor: 'pointer', color: '#7A3A18',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0', color: 'rgba(122,58,24,0.4)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} style={{ fontSize: 9, fontWeight: 800, textAlign: 'center', color: 'rgba(122,58,24,0.4)', paddingBottom: 4 }}>{d}</span>
          ))}
          {cells.map(({ day, muted }, i) => {
            const isToday = isCurrentMonth && !muted && day === todayDate;
            const isConfirmedTrip = isCurrentMonth && !muted && day === nextTripDay;
            const hasDot = isCurrentMonth && !muted && monthDots.includes(day) && !isConfirmedTrip;
            return (
              <div
                key={i}
                onClick={() => handleCellClick(day, muted)}
                style={{
                  position: 'relative',
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 9,
                  cursor: 'pointer',
                  background: isConfirmedTrip ? '#E8A265' : isToday ? '#1A0A00' : 'transparent',
                  color: muted ? 'rgba(122,58,24,0.25)' : isConfirmedTrip ? '#1A0A00' : isToday ? '#E8A265' : '#1A0A00',
                  fontSize: 11, fontWeight: (isToday || isConfirmedTrip) ? 900 : 600,
                  boxShadow: isConfirmedTrip ? '0 3px 10px rgba(232,162,101,0.5)' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isConfirmedTrip && !isToday) e.currentTarget.style.background = 'rgba(196,92,38,0.08)'; }}
                onMouseLeave={e => { if (!isConfirmedTrip && !isToday) e.currentTarget.style.background = 'transparent'; }}
              >
                {day}
                {hasDot && (
                  <span style={{
                    position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: '50%', background: '#C45C26',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(196,92,38,0.1)' }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: '#E8A265', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.7 }}>Confirmed trip</span>
      </div>
    </div>
  );
};

/* ── TRACKING SNIPPET — live pickup status for the next trip ── */
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
            Tracking
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

/* ── REVIEW PROMPT CARD ── */
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
          <Star size={15} style={{ color: hasCompleted ? '#E8A265' : '#C45C26' }} />
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

// ── DETAILED TOUR MODAL WITH BOOKING + GCASH PAYMENT FLOW ──
const DetailedTourModal = ({ tour, onClose, formatDateRange, onBookingSuccess }) => {
  const [primaryImage, setPrimaryImage] = useState(tour.image_urls?.[0] || null);
  const [numPersons, setNumPersons] = useState(1);
  const [isBooking, setIsBooking] = useState(false);
  const [paymentStep, setPaymentStep] = useState(null);
  const [paymentType, setPaymentType] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [createdBooking, setCreatedBooking] = useState(null);

  const isFullyBooked = tour.available_slots <= 0;
  const maxBookingLimit = Math.min(tour.available_slots || 0, 10);
  const subtotal = tour.price * numPersons;
  const downpaymentAmount = Math.round(subtotal * 0.4);

  const handleBookThisTour = async () => {
    setIsBooking(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("Please log in to book a tour."); setIsBooking(false); return; }

    const { data: profile } = await supabase.from('profiles').select('full_name, contact_number, email').eq('id', user.id).single();
    const bookingNumber = `BK-${Date.now().toString().slice(-8)}`;

    const { data: booking, error } = await supabase.from('bookings').insert([{
      tour_id: tour.id,
      user_id: user.id,
      booking_number: bookingNumber,
      full_name: profile?.full_name || "N/A",
      email: user.email || profile?.email || "N/A",
      contact_number: profile?.contact_number || "N/A",
      slots_booked: numPersons,
      total_price: subtotal,
      payment_status: 'Pending',
      booking_status: 'Active',
      payment_method: null,
    }]).select();

    if (error) {
      alert("Error: " + error.message);
    } else {
      setBookingId(booking[0].id);
      setCreatedBooking({ ...booking[0], full_name: profile?.full_name || "N/A", email: user.email || profile?.email || "N/A", contact_number: profile?.contact_number || "N/A", booking_number: bookingNumber });
      setPaymentStep('proceed');
      if (onBookingSuccess) onBookingSuccess();
    }
    setIsBooking(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.45)', backdropFilter: 'blur(12px)' }} onClick={paymentStep ? undefined : onClose}></div>
      <div style={{ position: 'relative', background: '#FDF6EE', width: '100%', maxWidth: '1100px', height: '90vh', borderRadius: '28px', overflow: 'hidden', display: 'flex', flexDirection: 'row', borderTop: '8px solid #C45C26', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', zIndex: 10000 }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: '#7A3A18', cursor: 'pointer', zIndex: 50 }}><X size={28} /></button>

        <div style={{ flex: 1, padding: '40px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <div style={{ height: '260px', borderRadius: '20px', overflow: 'hidden', background: '#F2E4D0', marginBottom: '16px' }}>
              {primaryImage ? <img src={primaryImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C45C26' }}><ImageIcon size={48} /></div>}
            </div>
            {tour.image_urls?.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {tour.image_urls.map((url, idx) => (
                  <div key={idx} onClick={() => setPrimaryImage(url)} style={{ width: '60px', height: '60px', borderRadius: '12px', overflow: 'hidden', border: primaryImage === url ? '2px solid #C45C26' : '2px solid #e2e8f0', cursor: 'pointer' }}><img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /></div>
                ))}
              </div>
            )}
            <h4 style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#7A3A18', letterSpacing: '1.5px', margin: '0 0 6px 0' }}>Description</h4>
            <p style={{ color: '#7A3A18', fontSize: '14px', fontWeight: 500, lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>{tour.description}</p>
          </div>
          <div style={{ borderTop: '1px solid rgba(196,92,38,0.15)', paddingTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div><h4 style={{ fontSize: '11px', fontWeight: 900, color: '#C45C26', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 8px 0' }}><CheckCircle2 size={14} /> Inclusions</h4><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'sans-serif', fontSize: '12px', color: '#7A3A18', margin: 0 }}>{tour.inclusions || "N/A"}</pre></div>
            <div><h4 style={{ fontSize: '11px', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 8px 0' }}><X size={14} /> Exclusions</h4><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'sans-serif', fontSize: '12px', color: '#7A3A18', margin: 0 }}>{tour.exclusions || "N/A"}</pre></div>
          </div>
        </div>

        <div style={{ width: '340px', background: '#f8fafc', padding: '40px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(196,92,38,0.15)' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#1A0A00', margin: '0 0 16px 0', lineHeight: '1.2' }}>{tour.title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#7A3A18' }}><CalendarIcon size={16} style={{ color: '#C45C26' }} /> {formatDateRange(tour.start_date, tour.duration)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#7A3A18' }}><Clock size={16} style={{ color: '#C45C26' }} /> {tour.duration}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#7A3A18' }}><Users size={16} style={{ color: '#C45C26' }} /> {tour.current_booked} / {tour.group_size} Slots Booked</div>
          </div>

          {!isFullyBooked && (
            <div style={{ borderTop: '1px solid rgba(196,92,38,0.15)', paddingTop: '16px', marginBottom: '20px' }}>
              <label style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#7A3A18', display: 'block', marginBottom: '8px' }}>Number of Persons</label>
              <select value={numPersons} onChange={(e) => setNumPersons(parseInt(e.target.value))} style={{ width: '100%', background: '#FDF6EE', borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: 700, color: '#1A0A00', border: '1px solid rgba(196,92,38,0.2)', outline: 'none', cursor: 'pointer' }}>
                {[...Array(maxBookingLimit)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? 'Person' : 'Persons'}</option>)}
              </select>
            </div>
          )}

          <div style={{ marginTop: 'auto', borderTop: '2px solid rgba(196,92,38,0.2)', paddingTop: '16px' }}>
            {!isFullyBooked && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#1A0A00' }}>Total</span><span style={{ fontSize: '28px', fontWeight: 900, color: '#C45C26' }}>₱{subtotal.toLocaleString()}</span></div>}
            <button onClick={handleBookThisTour} disabled={isBooking || isFullyBooked} style={{ width: '100%', padding: '16px', borderRadius: '14px', border: 'none', fontWeight: 900, fontSize: '11px', textTransform: 'uppercase', cursor: isFullyBooked ? 'not-allowed' : 'pointer', background: isFullyBooked ? '#F2E4D0' : '#C45C26', color: isFullyBooked ? '#7A3A18' : '#FFF', boxShadow: '0 8px 20px rgba(196,92,38,0.2)' }}>{isBooking ? 'Processing...' : isFullyBooked ? 'Fully Booked' : 'Book This Tour'}</button>
          </div>
        </div>
      </div>

      {paymentStep === 'proceed' && <ProceedToPaymentModal tour={tour} numPersons={numPersons} subtotal={subtotal} onProceed={() => setPaymentStep('choose')} onCancel={() => setPaymentStep(null)} formatDateRange={formatDateRange} />}
      {paymentStep === 'choose' && <ChoosePaymentTypeModal subtotal={subtotal} downpaymentAmount={downpaymentAmount} onChoose={(type) => { setPaymentType(type); setPaymentStep('gcash'); }} onBack={() => setPaymentStep('proceed')} />}
      {paymentStep === 'gcash' && <GCashPaymentModal bookingId={bookingId} subtotal={subtotal} downpaymentAmount={downpaymentAmount} paymentType={paymentType} onSuccess={() => setPaymentStep('success')} onBack={() => setPaymentStep('choose')} />}
      {paymentStep === 'success' && <BookingSuccessModal booking={createdBooking} onClose={() => { setPaymentStep(null); onClose(); }} />}
    </div>
  );
};

const ProceedToPaymentModal = ({ tour, numPersons, subtotal, onProceed, onCancel, formatDateRange }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,10,0,0.7)', padding: '24px' }}>
    <div style={{ background: '#FDF6EE', width: '100%', maxWidth: '440px', borderRadius: '24px', padding: '32px', boxSizing: 'border-box', borderTop: '6px solid #C45C26' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}><button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button></div>
      <h3 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 16px 0' }}>Review Payment</h3>
      <div style={{ background: '#F2E4D0', padding: '16px', borderRadius: '16px', fontSize: '13px', fontWeight: 700, display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <div>⛰️ {tour.title}</div>
        <div>📅 {formatDateRange(tour.start_date, tour.duration)}</div>
        <div>👤 {numPersons} {numPersons === 1 ? 'Person' : 'Persons'}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}><span style={{ fontWeight: 800, fontSize: '13px' }}>Amount Due</span><span style={{ fontSize: '24px', fontWeight: 900, color: '#C45C26' }}>₱{subtotal.toLocaleString()}</span></div>
      <button onClick={onProceed} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#1A0A00', color: '#FFF', fontWeight: 900, textTransform: 'uppercase', fontSize: '11px', cursor: 'pointer' }}>Proceed to Pay</button>
    </div>
  </div>
);

const ChoosePaymentTypeModal = ({ subtotal, downpaymentAmount, onChoose, onBack }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,10,0,0.7)', padding: '24px' }}>
    <div style={{ background: '#FDF6EE', width: '100%', maxWidth: '400px', borderRadius: '24px', padding: '32px', borderTop: '6px solid #C45C26' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 800, cursor: 'pointer', marginBottom: '16px' }}>← BACK</button>
      <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 20px 0' }}>Select Option</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button onClick={() => onChoose('full')} style={{ width: '100%', padding: '20px', background: '#1A0A00', color: '#FFF', borderRadius: '16px', border: 'none', cursor: 'pointer', textAlign: 'left' }}><div style={{ fontSize: '10px', fontWeight: 900, color: '#C45C26' }}>FULL AMOUNT</div><p style={{ fontSize: '22px', fontWeight: 900, margin: '4px 0 0' }}>₱{subtotal.toLocaleString()}</p></button>
        <button onClick={() => onChoose('down')} style={{ width: '100%', padding: '20px', background: '#FFF', border: '2px solid rgba(196,92,38,0.2)', borderRadius: '16px', cursor: 'pointer', textAlign: 'left' }}><div style={{ fontSize: '10px', fontWeight: 900, color: '#C45C26' }}>DOWNPAYMENT (40%)</div><p style={{ fontSize: '22px', fontWeight: 900, margin: '4px 0 0', color: '#1A0A00' }}>₱{downpaymentAmount.toLocaleString()}</p></button>
      </div>
    </div>
  </div>
);

const GCashPaymentModal = ({ bookingId, subtotal, downpaymentAmount, paymentType, onSuccess, onBack }) => {
  const [gcashNumber, setGcashNumber] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const amountDue = paymentType === 'full' ? subtotal : downpaymentAmount;

  const handleConfirmBooking = async () => {
    if (!gcashNumber.trim() || !refNumber.trim() || !screenshot) return alert("Please fill all payment fields.");
    setSubmitting(true);
    try {
      const fileExt = screenshot.name.split('.').pop();
      const fileName = `receipts/${bookingId}_${Date.now()}.${fileExt}`;
      await supabase.storage.from('booking-receipts').upload(fileName, screenshot);
      const { data: urlData } = supabase.storage.from('booking-receipts').getPublicUrl(fileName);

      await supabase.from('bookings').update({
        gcash_number: gcashNumber,
        gcash_reference_no: refNumber,
        receipt_url: urlData?.publicUrl || null,
        payment_method: paymentType === 'full' ? 'Full Payment' : 'Downpayment',
        amount_paid: amountDue,
        payment_status: 'Pending',
      }).eq('id', bookingId);
      onSuccess();
    } catch {
      alert("Upload error.");
    }
    setSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,10,0,0.7)', padding: '24px' }}>
      <div style={{ background: '#FDF6EE', width: '100%', maxWidth: '460px', borderRadius: '24px', overflow: 'hidden' }}>
        <div style={{ background: '#1A0A00', padding: '16px 24px', color: '#FFF', display: 'flex', alignItems: 'center', gap: '12px' }}><button onClick={onBack} style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer' }}>←</button><h4 style={{ margin: 0, fontWeight: 900 }}>GCash Portal</h4></div>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ background: '#eff6ff', padding: '12px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>📱 Send GCash To: <strong style={{ color: '#2563eb' }}>09XX XXX XXXX</strong> (Bandang IBAYO)</div>
          <input type="tel" placeholder="Your GCash Account Number" value={gcashNumber} onChange={e => setGcashNumber(e.target.value)} style={{ width: '100%', background: '#F2E4D0', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: 600, outline: 'none' }} />
          <input type="text" placeholder="13-Digit Receipt Reference Number" value={refNumber} onChange={e => setRefNumber(e.target.value)} style={{ width: '100%', background: '#F2E4D0', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '13px', fontWeight: 600, outline: 'none' }} />
          <input type="file" accept="image/*" onChange={e => setScreenshot(e.target.files[0])} style={{ fontSize: '11px' }} />
          <button onClick={handleConfirmBooking} disabled={submitting} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#C45C26', color: '#FFF', fontWeight: 900, textTransform: 'uppercase', fontSize: '11px', cursor: 'pointer', marginTop: '6px' }}>{submitting ? 'Verifying Reference...' : 'Submit Booking'}</button>
        </div>
      </div>
    </div>
  );
};

const BookingSuccessModal = ({ booking, onClose }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,10,0,0.7)', padding: '24px' }}>
    <div style={{ background: '#FDF6EE', width: '100%', maxWidth: '380px', borderRadius: '24px', padding: '32px', borderTop: '6px solid #C45C26' }}>
      <div style={{ width: '60px', height: '60px', background: 'rgba(196,92,38,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><CheckCircle2 size={32} style={{ color: '#C45C26', margin: 'auto' }} /></div>
      <h3 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 8px 0', textAlign: 'center' }}>Booking Submitted!</h3>
      <div style={{ background: '#F2E4D0', padding: '12px', borderRadius: '12px', fontSize: '12px', fontWeight: 800, margin: '16px 0', textAlign: 'center' }}>Reference: {booking?.booking_number}</div>
      <button onClick={onClose} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#1A0A00', color: '#FFF', fontWeight: 900, textTransform: 'uppercase', fontSize: '11px', cursor: 'pointer' }}>Done</button>
    </div>
  </div>
);

export default JoinerDashboard;
