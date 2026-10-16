import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Map, Calendar, Users, FileText, Bell, CreditCard,
  LogOut, TrendingUp, AlertCircle, Clock, Menu, X, Rss, Star, Globe,
  ArrowUpRight, MapPin, Wallet, ImageIcon, ScanLine, User
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import TourManagement from './TourManagement';
import BookingManagement from './BookingManagement';
import Feed from './Feed';
import ProfileSettings from './Profilesettings.jsx';
import Reviews from './Reviews';
import JoinerAccounts from './Joineraccounts';
import Reports from './Reports';
import AdminCheckIn from './AdminCheckIn';
import AdminExclusiveTours from './AdminExclusiveTours';
import { AdminTrackingControls } from "./AdminTrackingControls";
import logoIcon from './assets/newIcon.png';
import NotificationBell from './NotificationBell';
import Notification from './Notification';
import { formatPeso, archivePastTours } from './tourUtils';
import { confirmDialog } from './ui/ConfirmDialog';
import PageHeader from './ui/PageHeader';
import { SkeletonRows, Skel } from './ui/Skeleton';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (legacy section bg, still used for some inset panels)
// #FDF6EE  cream (page bg, same as the public Tours page)
// #3F5D62  slate teal (secondary contrast accent, used sparingly)
// ---------------------------------------------------------
 
// ─── Helpers ────────────────────────────────────────────────────────────────
 
const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) !== 1 ? 's' : ''} ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) !== 1 ? 's' : ''} ago`;
  return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''} ago`;
};
 
 
const peso = formatPeso;

const truncate = (text, max = 74) => {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
};

const shortDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const personName = (p, fallback = 'Unknown') => {
  if (!p) return fallback;
  const combo = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return combo || p.username || fallback;
};

const personInitials = (p, fallback = '?') => {
  const first = (p?.first_name || '').trim();
  const last = (p?.last_name || '').trim();
  if (first || last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || first.charAt(0).toUpperCase();
  if (p?.username) return p.username.charAt(0).toUpperCase();
  return fallback;
};

const NAV_ITEMS = [
  { icon: <LayoutDashboard size={18} strokeWidth={2} />, label: 'Overview' },
  { icon: <Rss size={18} strokeWidth={2} />,             label: 'Feed' },
  { icon: <Map size={18} strokeWidth={2} />,             label: 'Tour Management' },
  { icon: <Calendar size={18} strokeWidth={2} />,        label: 'Booking Management' },
  { icon: <Users size={18} strokeWidth={2} />,           label: 'Joiner Accounts' },
  { icon: <Globe size={18} strokeWidth={2} />,           label: 'Exclusive Requests' },
  { icon: <Clock size={18} strokeWidth={2} />,           label: 'Tracking Management' },
  { icon: <ScanLine size={18} strokeWidth={2} />,        label: 'Check-in' },
  { icon: <FileText size={18} strokeWidth={2} />,        label: 'Reports' },
  { icon: <Star size={18} strokeWidth={2} />,            label: 'Reviews' },
  { icon: <Bell size={18} strokeWidth={2} />,            label: 'Notification' },
];
 
// ─── Main Component ──────────────────────────────────────────────────────────
 
const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('Overview');
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
 
  // Track viewport so the sidebar can switch between the desktop
  // hover-to-expand behavior and the mobile off-canvas drawer.
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      if (!mobile) setMobileNavOpen(false); // never leave the drawer "open" once we're back on desktop
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
 
  // On mobile the sidebar is always shown at full width (as a drawer),
  // on desktop it expands only while the cursor is hovering over it.
  const sidebarExpanded = isMobile ? true : sidebarHovered;
 
  const handleNavClick = (label) => {
    setActiveTab(label);
    if (isMobile) setMobileNavOpen(false);
  };

  // Routes a clicked notification to the module it's about — a new
  // booking opens Booking Management, a new review opens Reviews, etc.
  const handleNotificationNavigate = (notification) => {
    switch (notification.type) {
      case 'booking':
      case 'payment':
      case 'cancellation':
        handleNavClick('Booking Management');
        break;
      case 'exclusive_request':
        handleNavClick('Exclusive Requests');
        break;
      case 'review':
        handleNavClick('Reviews');
        break;
      case 'account':
        handleNavClick('Joiner Accounts');
        break;
      case 'tour':
        handleNavClick('Tour Management');
        break;
      default:
        handleNavClick('Overview');
    }
  };
 
  const [stats, setStats] = useState({
    totalBookings: '—',
    bookingsThisMonth: '—',
    pendingVerification: '—',
    totalJoiners: '—',
    bookingsLastMonth: 0,
    toursNextMonth: 0,
    joinersThisWeek: 0,
    revenueThisMonth: 0,
    revenueLastMonth: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  // Per-module snapshot data surfaced on the Overview tab so admins don't
  // have to open every tab just to see what needs attention.
  const [snippets, setSnippets] = useState({
    tours: [],              // upcoming active tours w/ live booking counts
    activeTourCount: 0,
    pendingBookings: [],    // bookings awaiting GCash verification
    recentJoiners: [],      // newest registered profiles
    latestReview: null,
    avgRating: null,
    reviewCount: 0,
    latestPost: null,
    pendingExclusiveRequests: [], // Exclusive Tour / Request-a-Tour submissions awaiting review
    pendingExclusiveCount: 0,
  });
 
  const handleLogout = async () => {
    const ok = await confirmDialog({
      title: 'Sign out?',
      message: "You'll need to log in again to manage tours and bookings.",
      confirmLabel: 'Sign Out',
      cancelLabel: 'Stay Signed In',
    });
    if (!ok) return;
    const { error } = await supabase.auth.signOut();
    if (error) toast.error('Logout failed', error.message);
    else navigate('/login');
  };
 
  const fetchOverviewData = async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const nextMonthStart = monthEnd;
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    await archivePastTours();
    const [
      { count: totalBookings },
      { count: bookingsThisMonth },
      { count: bookingsLastMonth },
      { count: toursNextMonth },
      { count: activeTourCount },
      { count: pendingVerification },
      { count: totalJoiners },
      { count: joinersThisWeek },
      { data: revenueThisMonthRaw },
      { data: revenueLastMonthRaw },
      { data: upcomingToursRaw },
      { data: pendingBookingsRaw },
      { data: recentJoinersRaw },
      { data: reviewRatingsRaw },
      { data: latestReviewRaw },
      { data: latestPostRaw },
      { count: pendingExclusiveCount },
      { data: pendingExclusiveRaw },
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).gte('tour_date', monthStart).lt('tour_date', monthEnd),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).gte('tour_date', lastMonthStart).lt('tour_date', monthStart),
      supabase.from('tours').select('*', { count: 'exact', head: true }).gte('start_date', nextMonthStart).lt('start_date', nextMonthEnd).eq('is_archived', false),
      supabase.from('tours').select('*', { count: 'exact', head: true }).eq('is_archived', false),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).in('payment_status', ['Pending', 'Verification Pending']),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('bookings').select('total_price').eq('payment_status', 'Complete').gte('created_at', monthStart).lt('created_at', monthEnd),
      supabase.from('bookings').select('total_price').eq('payment_status', 'Complete').gte('created_at', lastMonthStart).lt('created_at', monthStart),
      supabase.from('tours').select('id, title, destination, start_date, group_size, image_urls').eq('is_archived', false).order('start_date', { ascending: true }).limit(3),
      supabase.from('bookings').select('id, booking_number, full_name, user_id, total_price, payment_method, created_at, tour_id, tours(title)').in('payment_status', ['Pending', 'Verification Pending']).order('created_at', { ascending: false }).limit(4),
      supabase.from('profiles').select('id, first_name, last_name, username, avatar_url, created_at').neq('role', 'admin').order('created_at', { ascending: false }).limit(4),
      supabase.from('reviews').select('rating'),
      supabase.from('reviews').select('id, rating, comment, created_at, user_id, tour_id, tours(title)').order('created_at', { ascending: false }).limit(1),
      supabase.from('feed_posts').select('id, content, created_at, author_id, post_type, media, image_url').order('created_at', { ascending: false }).limit(1),
      supabase.from('exclusive_requests').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
      supabase.from('exclusive_requests').select('id, request_type, full_name, destination, created_at').eq('status', 'Pending').order('created_at', { ascending: false }).limit(4),
    ]);

    const revenueThisMonth = (revenueThisMonthRaw || []).reduce((sum, b) => sum + (b.total_price || 0), 0);
    const revenueLastMonth = (revenueLastMonthRaw || []).reduce((sum, b) => sum + (b.total_price || 0), 0);

    setStats({
      totalBookings: totalBookings?.toLocaleString() ?? '—',
      bookingsThisMonth: bookingsThisMonth?.toLocaleString() ?? '—',
      pendingVerification: pendingVerification?.toLocaleString() ?? '—',
      totalJoiners: totalJoiners?.toLocaleString() ?? '—',
      bookingsLastMonth: bookingsLastMonth ?? 0,
      toursNextMonth: toursNextMonth ?? 0,
      joinersThisWeek: joinersThisWeek ?? 0,
      revenueThisMonth,
      revenueLastMonth,
    });

    // ── Tour Management snippet: live booked/capacity for the next 3 tours ──
    let toursWithCounts = [];
    if (upcomingToursRaw && upcomingToursRaw.length > 0) {
      const tourIds = upcomingToursRaw.map(t => t.id);
      const { data: tourBookings } = await supabase
        .from('bookings')
        .select('tour_id, slots_booked')
        .in('tour_id', tourIds)
        .not('booking_status', 'eq', 'Cancelled');
      toursWithCounts = upcomingToursRaw.map(t => {
        const booked = (tourBookings || []).filter(b => b.tour_id === t.id).reduce((sum, b) => sum + (b.slots_booked || 0), 0);
        const capacity = t.group_size || 18;
        return { ...t, booked, capacity, pct: Math.min(100, Math.round((booked / capacity) * 100)) };
      });
    }

    // ── Booking Management snippet: fill in joiner display names ──
    let pendingBookings = [];
    if (pendingBookingsRaw && pendingBookingsRaw.length > 0) {
      const userIds = [...new Set(pendingBookingsRaw.map(b => b.user_id).filter(Boolean))];
      const { data: profilesData } = userIds.length
        ? await supabase.from('profiles').select('id, first_name, last_name').in('id', userIds)
        : { data: [] };
      const profileMap = Object.fromEntries((profilesData || []).map(p => [p.id, p]));
      pendingBookings = pendingBookingsRaw.map(b => ({ ...b, profiles: profileMap[b.user_id] || null }));
    }

    // ── Reviews snippet: average rating + most recent review's author ──
    const ratings = (reviewRatingsRaw || []).map(r => r.rating).filter(Boolean);
    const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
    let latestReview = null;
    if (latestReviewRaw && latestReviewRaw.length > 0) {
      const r = latestReviewRaw[0];
      const { data: authorData } = r.user_id
        ? await supabase.from('profiles').select('first_name, last_name, username').eq('id', r.user_id).single()
        : { data: null };
      latestReview = { ...r, author: authorData };
    }

    // ── Feed snippet: most recent post's author ──
    let latestPost = null;
    if (latestPostRaw && latestPostRaw.length > 0) {
      const p = latestPostRaw[0];
      const { data: authorData } = p.author_id
        ? await supabase.from('profiles').select('first_name, last_name, username, role').eq('id', p.author_id).single()
        : { data: null };
      latestPost = { ...p, author: authorData };
    }

    setSnippets({
      tours: toursWithCounts,
      activeTourCount: activeTourCount ?? 0,
      pendingBookings,
      recentJoiners: recentJoinersRaw || [],
      latestReview,
      avgRating,
      reviewCount: ratings.length,
      latestPost,
      pendingExclusiveRequests: pendingExclusiveRaw || [],
      pendingExclusiveCount: pendingExclusiveCount ?? 0,
    });
  };
 
  useEffect(() => {
    if (activeTab !== 'Overview') return;
    (async () => {
      setLoadingStats(true);
      await fetchOverviewData();
      setLoadingStats(false);
    })();
  }, [activeTab]);
 
  return (
    <div className="admin-dashboard-container" style={{
      display: 'flex', height: '100vh',
      fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
      background: '#FDF6EE',
      color: '#1A0A00',
      overflow: 'hidden',
    }}>
 
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
              background: '#B4511E',
              border: '3px solid #EDEAE3',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: '#FDF6EE',
              zIndex: 30,
              boxShadow: '0 4px 12px rgba(26,10,0,0.35)',
              transition: 'background 0.2s, transform 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#E8A265'}
            onMouseLeave={e => e.currentTarget.style.background = '#B4511E'}
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
          {/* Logo: back to the dashboard home */}
          <button
            type="button"
            onClick={() => handleNavClick('Overview')}
            aria-label="Go to dashboard home"
            title="Dashboard home"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: sidebarExpanded ? 6 : 0,
              justifyContent: sidebarExpanded ? 'flex-start' : 'center',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            <img
              src={logoIcon}
              alt="BANDANG IBAYO"
              style={{
                width: sidebarExpanded ? 44 : 36,
                height: sidebarExpanded ? 44 : 36,
                objectFit: 'contain',
                transition: 'width 0.22s, height 0.22s',
                flexShrink: 0,
              }}
            />
            {sidebarExpanded && (
              <span className="font-display" style={{ fontSize: 19, color: '#FDF6EE', whiteSpace: 'nowrap' }}>
                Bandang <span className="font-accent" style={{ color: '#E8A265' }}>IBAYO</span>
              </span>
            )}
          </button>
          {sidebarExpanded && (
            <p style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(232,210,190,0.85)', margin: 0,
              whiteSpace: 'nowrap',
            }}>
              Admin Management
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
            title="Logout System"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(232,210,190,0.85)',
              fontFamily: 'inherit',
              padding: 0,
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#E8A265'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(232,210,190,0.85)'}
          >
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {sidebarExpanded && (
              <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                Logout System
              </span>
            )}
          </button>
        </div>
      </aside>
 
      {/* ── MAIN ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
 
        {/* header */}
        {/* content */}
        <div className="dashboard-content" style={{ flex: 1, overflowY: 'auto', padding: '2.5rem', background: '#FDF6EE', display: 'flex', flexDirection: 'column' }}>
          {/* Top row: page title on the left, bell and account on the right (scrolls with the page) */}
          <div className="dashboard-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, position: 'relative', zIndex: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              {/* hamburger - hidden on desktop via CSS, shown <=900px */}
              <button
                className="mobile-menu-btn"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>
              {PAGE_INFO[activeTab] && <PageHeader {...PAGE_INFO[activeTab]} />}
            </div>
 
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* notification bell — live from the `notifications` table,
                  surfaces joiner-side activity: new bookings, payment
                  submissions, cancellations, reviews, requests, registrations */}
              <NotificationBell onNotificationClick={handleNotificationNavigate} />

              {/* admin chip */}
              <div
                onClick={() => handleNavClick('Profile Settings')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: '#F2E4D0',
                  border: '1px solid rgba(180,81,30,0.18)',
                  borderRadius: 14, padding: '8px 14px',
                  cursor: 'pointer',
                }}>
                <div className="dashboard-user-chip-text" style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1A0A00', margin: 0, lineHeight: 1 }}>Administrator</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '3px 0 0', lineHeight: 1 }}>Bandang IBAYO</p>
                </div>
                <div style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: '#1A0A00',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#E8A265', fontWeight: 900, fontSize: 15,
                  boxShadow: '0 4px 12px rgba(26,10,0,0.22)',
                  flexShrink: 0,
                }}>
                  A
                </div>
              </div>
            </div>
          </div>

          {/* The page content under the title row */}
          <div style={{ flex: 1, minHeight: 0 }}>
 
          {/* OVERVIEW TAB CONTENT */}
          {activeTab === 'Overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
 
              {/* dashboard header bar — status line + date, not a marketing hero */}
              <div className="dashboard-hero-padding" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 16,
                background: '#1A0A00',
                borderRadius: 20,
                padding: '1.5rem 2rem',
                boxShadow: '0 8px 28px rgba(26,10,0,0.2)',
              }}>
                <div>
                  <p style={{
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase',
                    color: '#E8A265', margin: '0 0 6px',
                  }}>
                    Operations Overview
                  </p>
                  <h2 style={{
                    fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em',
                    color: '#FDF6EE', margin: 0,
                  }}>
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: 'rgba(232,162,101,0.12)', borderRadius: 999,
                    padding: '8px 16px', fontSize: 11, fontWeight: 800,
                    color: '#E8A265', letterSpacing: '0.04em',
                  }}>
                    <AlertCircle size={13} />
                    {loadingStats ? <Skel dark w={22} h={11} style={{ display: 'inline-block' }} /> : stats.pendingVerification} awaiting verification
                  </span>
                </div>
              </div>

              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 20 }}>
                <StatCard
                  title="Revenue This Month"
                  value={loadingStats ? <Skel w={140} h={34} style={{ display: 'inline-block' }} /> : peso(stats.revenueThisMonth)}
                  icon={<Wallet size={18} />}
                  iconColor="#A8481A"
                  trend={loadingStats ? '' : (() => {
                    const last = stats.revenueLastMonth || 0;
                    if (last === 0) return 'No data for last month';
                    const change = Math.round(((stats.revenueThisMonth - last) / last) * 100);
                    return `${change >= 0 ? '+' : ''}${change}% vs last month`;
                  })()}
                />
                <StatCard
                  title="Total Bookings"
                  value={loadingStats ? <Skel w={60} h={34} style={{ display: 'inline-block' }} /> : stats.totalBookings}
                  icon={<TrendingUp size={18} />}
                  iconColor="#3F5D62"
                  trend={loadingStats ? '' : (() => {
                    const curr = parseInt(stats.bookingsThisMonth.replace(/,/g, '')) || 0;
                    const last = stats.bookingsLastMonth || 0;
                    const change = last === 0 ? 0 : Math.round(((curr - last) / last) * 100);
                    return `${change >= 0 ? '+' : ''}${change}% vs last month`;
                  })()}
                />
                <StatCard
                  title="Pending Verification"
                  value={loadingStats ? <Skel w={60} h={34} style={{ display: 'inline-block' }} /> : stats.pendingVerification}
                  icon={<AlertCircle size={18} />}
                  iconColor="#A8481A"
                  trend={loadingStats ? '' : 'Awaiting payment review'}
                />
                <StatCard
                  title="Total Joiners"
                  value={loadingStats ? <Skel w={60} h={34} style={{ display: 'inline-block' }} /> : stats.totalJoiners}
                  icon={<Users size={18} />}
                  iconColor="#3F5D62"
                  trend={loadingStats ? '' : `${stats.joinersThisWeek} new this week`}
                />
              </div>

              {/* module snapshots */}
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{
                    fontWeight: 900, fontSize: 13, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: '#1A0A00', margin: 0,
                  }}>
                    Module Snapshots
                  </h3>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
                    Live from Tours, Bookings, Joiners, Reviews &amp; Feed
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>

                  {/* Tour Management */}
                  <ModuleCard
                    icon={<Map size={16} />}
                    title="Tour Management"
                    metaLabel={`${snippets.activeTourCount} active`}
                    onViewAll={() => handleNavClick('Tour Management')}
                    loading={loadingStats}
                    empty={snippets.tours.length === 0}
                    emptyText="No active tours yet."
                  >
                    {snippets.tours.map(t => (
                      <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(180,81,30,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#1A0A00', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.title}
                          </p>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, flexShrink: 0 }}>{shortDate(t.start_date)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'rgba(180,81,30,0.14)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 999, width: `${t.pct}%`,
                              background: t.pct >= 100 ? '#B4511E' : t.pct >= 80 ? '#E8A265' : '#7A3A18',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#7A3A18', opacity: 0.9, flexShrink: 0 }}>
                            {t.booked}/{t.capacity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </ModuleCard>

                  {/* Booking Management */}
                  <ModuleCard
                    icon={<CreditCard size={16} />}
                    title="Booking Management"
                    metaLabel={`${stats.pendingVerification} pending`}
                    onViewAll={() => handleNavClick('Booking Management')}
                    loading={loadingStats}
                    empty={snippets.pendingBookings.length === 0}
                    emptyText="Nothing awaiting verification."
                  >
                    {snippets.pendingBookings.map(b => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(180,81,30,0.08)' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#1A0A00', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {personName(b.profiles, b.full_name)}
                          </p>
                          <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.tours?.title || 'Tour'}
                          </p>
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 900, color: '#A8481A', flexShrink: 0 }}>{peso(b.total_price)}</span>
                      </div>
                    ))}
                  </ModuleCard>

                  {/* Joiner Accounts */}
                  <ModuleCard
                    icon={<Users size={16} />}
                    title="Joiner Accounts"
                    metaLabel={`${stats.totalJoiners} total`}
                    onViewAll={() => handleNavClick('Joiner Accounts')}
                    loading={loadingStats}
                    empty={snippets.recentJoiners.length === 0}
                    emptyText="No joiners registered yet."
                  >
                    {snippets.recentJoiners.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(180,81,30,0.08)' }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                          background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#E8A265', fontWeight: 900, fontSize: 11,
                        }}>
                          {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : personInitials(p)}
                        </div>
                        <p style={{ fontSize: 12.5, fontWeight: 800, color: '#1A0A00', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {personName(p, 'Unnamed Joiner')}
                        </p>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, flexShrink: 0 }}>{shortDate(p.created_at)}</span>
                      </div>
                    ))}
                  </ModuleCard>

                  {/* Exclusive / Requested Tours */}
                  <ModuleCard
                    icon={<Globe size={16} />}
                    title="Exclusive Requests"
                    metaLabel={`${snippets.pendingExclusiveCount} pending`}
                    onViewAll={() => handleNavClick('Exclusive Requests')}
                    loading={loadingStats}
                    empty={snippets.pendingExclusiveRequests.length === 0}
                    emptyText="Nothing awaiting review."
                  >
                    {snippets.pendingExclusiveRequests.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(180,81,30,0.08)' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#1A0A00', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.full_name || 'Joiner'}
                          </p>
                          <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.destination || 'Destination TBD'}
                          </p>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: r.request_type === 'exclusive' ? '#1A0A00' : '#A8481A',
                          background: r.request_type === 'exclusive' ? 'rgba(26,10,0,0.06)' : 'rgba(180,81,30,0.12)',
                          borderRadius: 999, padding: '3px 9px', flexShrink: 0,
                        }}>
                          {r.request_type === 'exclusive' ? 'Exclusive' : 'Request'}
                        </span>
                      </div>
                    ))}
                  </ModuleCard>

                  {/* Reviews */}
                  <ModuleCard
                    icon={<Star size={16} />}
                    title="Reviews"
                    metaLabel={snippets.avgRating ? `${snippets.avgRating.toFixed(1)} ★ avg` : `${snippets.reviewCount} total`}
                    onViewAll={() => handleNavClick('Reviews')}
                    loading={loadingStats}
                    empty={!snippets.latestReview}
                    emptyText="No reviews submitted yet."
                  >
                    {snippets.latestReview && (
                      <div style={{ padding: '4px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#1A0A00', margin: 0 }}>
                            {personName(snippets.latestReview.author, 'A Traveler')}
                          </p>
                          <div style={{ display: 'flex', gap: 1 }}>
                            {[1, 2, 3, 4, 5].map(n => (
                              <Star key={n} size={11} fill={n <= snippets.latestReview.rating ? '#E8A265' : 'none'} color={n <= snippets.latestReview.rating ? '#E8A265' : 'rgba(122,58,24,0.85)'} />
                            ))}
                          </div>
                        </div>
                        {snippets.latestReview.tours?.title && (
                          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#A8481A', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={10} /> {snippets.latestReview.tours.title}
                          </p>
                        )}
                        {snippets.latestReview.comment && (
                          <p style={{ fontSize: 12, fontWeight: 500, color: '#7A3A18', opacity: 0.9, lineHeight: 1.5, margin: 0 }}>
                            "{truncate(snippets.latestReview.comment, 96)}"
                          </p>
                        )}
                      </div>
                    )}
                  </ModuleCard>

                  {/* Feed */}
                  <ModuleCard
                    icon={<Rss size={16} />}
                    title="Community Feed"
                    metaLabel={snippets.latestPost ? timeAgo(snippets.latestPost.created_at) : ''}
                    onViewAll={() => handleNavClick('Feed')}
                    loading={loadingStats}
                    empty={!snippets.latestPost}
                    emptyText="No posts yet — share an update."
                  >
                    {snippets.latestPost && (
                      <div style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
                        {(() => {
                          const cover = snippets.latestPost.image_url
                            || (Array.isArray(snippets.latestPost.media) && snippets.latestPost.media[0]?.url);
                          return cover ? (
                            <img src={cover} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{
                              width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                              background: '#F2E4D0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#A8481A',
                            }}>
                              <ImageIcon size={20} />
                            </div>
                          );
                        })()}
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 11.5, fontWeight: 800, color: '#1A0A00', margin: '0 0 3px' }}>
                            {personName(snippets.latestPost.author, 'Bandang IBAYO')}
                          </p>
                          <p style={{
                            fontSize: 12, fontWeight: 500, color: '#7A3A18', opacity: 0.9, lineHeight: 1.5, margin: 0,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>
                            {snippets.latestPost.content || (snippets.latestPost.post_type === 'tour' ? 'New tour posted.' : 'Shared an update.')}
                          </p>
                        </div>
                      </div>
                    )}
                  </ModuleCard>

                </div>
              </div>
            </div>
          )}
 
          {/* ROUTED CONTENT VIEWS */}
          {activeTab === 'Feed' && <Feed isAdmin={true} />}
          {activeTab === 'Tour Management' && <TourManagement />}
          {activeTab === 'Booking Management' && <BookingManagement />}
          {activeTab === 'Joiner Accounts' && <JoinerAccounts />}
          {activeTab === 'Exclusive Requests' && <AdminExclusiveTours />}
          {activeTab === 'Reviews' && <Reviews isAdmin={true} />}
          {activeTab === 'Reports' && <Reports />}
          {activeTab === 'Check-in' && <AdminCheckIn />}
          {activeTab === 'Tracking Management' && (
             <AdminTrackingControls selectedTourId="renugdlntgybazpikmbu" />
          )}
          {activeTab === 'Profile Settings' && <ProfileSettings />}
          {activeTab === 'Notification' && <Notification isAdmin={true} onNavigate={handleNotificationNavigate} />}
          

          {/* FALLBACK COMING SOON SECTION */}
          {activeTab !== 'Overview' &&
           activeTab !== 'Feed' &&
           activeTab !== 'Tour Management' &&
           activeTab !== 'Booking Management' &&
           activeTab !== 'Reviews' &&
           activeTab !== 'Joiner Accounts' &&
           activeTab !== 'Exclusive Requests' &&
           activeTab !== 'Tracking Management' &&
           activeTab !== 'Reports' &&
           activeTab !== 'Check-in' &&
           activeTab !== 'Profile Settings' &&
           activeTab !== 'Notification' && (
            <div style={{
              height: '100%', minHeight: 400,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: '#FDF6EE',
              borderRadius: 24,
              border: '1px solid rgba(180,81,30,0.12)',
              boxShadow: '0 4px 24px rgba(26,10,0,0.06)',
              padding: '3rem',
              textAlign: 'center',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: '#F2E4D0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#A8481A', marginBottom: 20,
              }}>
                <FileText size={36} />
              </div>
              <h3 style={{
                fontWeight: 900, fontSize: 14, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 8px',
              }}>
                {activeTab} Module
              </h3>
              <p style={{ fontSize: 13, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
                Coming soon — check back later.
              </p>
            </div>
          )}
          </div>
        </div>
      </main>
    </div>
  );
};
 
// Title and one-line description shown at the top of each page.
const PAGE_INFO = {
  'Overview':            { icon: LayoutDashboard, title: 'Overview',            subtitle: "Today's bookings, payments and tours at a glance" },
  'Feed':                { icon: Rss,             title: 'Community Feed',      subtitle: 'Updates, announcements & newly posted tours' },
  'Tour Management':     { icon: Map,             title: 'Tour Management',     subtitle: 'Create tours, add dates and manage your postings' },
  'Booking Management':  { icon: Calendar,        title: 'Booking Management',  subtitle: 'Verify payments, track downpayments and update booking status' },
  'Joiner Accounts':     { icon: Users,           title: 'Joiner Accounts',     subtitle: 'Everyone registered as a joiner' },
  'Exclusive Requests':  { icon: Globe,           title: 'Exclusive Requests',  subtitle: 'Private-group requests and new destination suggestions from joiners' },
  'Tracking Management': { icon: Clock,           title: 'Tracking Management', subtitle: "Share each tour's live location with its joiners" },
  'Check-in':            { icon: ScanLine,        title: 'Check-in',            subtitle: "Scan each joiner's QR on the day of the tour. One QR covers their whole group." },
  'Reports':             { icon: FileText,        title: 'Reports',             subtitle: 'Bookings, sales and payments over time' },
  'Reviews':             { icon: Star,            title: 'Tour Reviews',        subtitle: 'What joiners are saying about your tours' },
  'Notification':        { icon: Bell,            title: 'Notifications',       subtitle: 'Every activity across bookings, requests, reviews & more' },
  'Profile Settings':    { icon: User,            title: 'Profile Settings',    subtitle: 'Manage your account information and preferences' },
};

// ─── Nav Item ────────────────────────────────────────────────────────────────
 
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
      background: active ? '#B4511E' : 'transparent',
      color: active ? '#FDF6EE' : 'rgba(232,210,190,0.85)',
      fontWeight: active ? 900 : 600,
      transform: active && !collapsed ? 'translateX(4px)' : 'translateX(0)',
      boxShadow: active ? '0 6px 20px rgba(180,81,30,0.35)' : 'none',
      transition: 'all 0.2s',
      textAlign: 'left',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    <span style={{ color: active ? '#FDF6EE' : 'rgba(232,162,101,0.8)', flexShrink: 0 }}>
      {icon}
    </span>
    {!collapsed && (
      <span style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    )}
  </button>
);
 
// ─── Stat Card ───────────────────────────────────────────────────────────────
 
const StatCard = ({ title, value, icon, iconColor, trend }) => (
  <div style={{
    background: '#FDF6EE',
    borderRadius: 20,
    padding: '1.75rem 2rem',
    border: '1px solid rgba(180,81,30,0.12)',
    boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: 10,
    transition: 'transform 0.2s',
    cursor: 'default',
  }}
    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <p style={{
        fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: '#7A3A18', margin: 0,
      }}>
        {title}
      </p>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: '#F1EEE8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: iconColor || '#A8481A',
        flexShrink: 0,
      }}>
        {icon}
      </div>
    </div>
    <p style={{
      fontSize: 38, fontWeight: 900, letterSpacing: '-0.04em',
      color: '#1A0A00', margin: 0, lineHeight: 1,
    }}>
      {value}
    </p>
    {trend && (
      <p style={{
        fontSize: 11.5, fontWeight: 700, fontStyle: 'italic',
        color: '#7A3A18', opacity: 0.9, margin: 0,
      }}>
        {trend}
      </p>
    )}
  </div>
);
 
// ─── Module Snapshot Card ──────────────────────────────────────────────────
// Compact "what's happening in this module" card used on the Overview tab.
// Keeps its own loading/empty states so each snippet fails gracefully on
// its own rather than blocking the whole grid.

const ModuleCard = ({ icon, title, metaLabel, onViewAll, loading, empty, emptyText, children }) => (
  <div style={{
    background: '#FDF6EE',
    borderRadius: 20,
    border: '1px solid rgba(180,81,30,0.12)',
    boxShadow: '0 4px 20px rgba(26,10,0,0.05)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '1.1rem 1.35rem', borderBottom: '1px solid rgba(180,81,30,0.1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          background: '#1A0A00', color: '#E8A265',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 12.5, fontWeight: 900, color: '#1A0A00', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </p>
          {metaLabel && (
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9, margin: '2px 0 0' }}>
              {metaLabel}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onViewAll}
        title={`Open ${title}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#A8481A', fontFamily: 'inherit', fontWeight: 800,
          fontSize: 11.5, letterSpacing: '0.06em', padding: 4,
        }}
      >
        View <ArrowUpRight size={13} />
      </button>
    </div>

    <div style={{ padding: '0.4rem 1.35rem 0.9rem', flex: 1 }}>
      {loading ? (
        <SkeletonRows count={3} avatar={false} boxed={false} />
      ) : empty ? (
        // Small empty state: what's missing, plus a way to the full module.
        <div style={{ padding: '1.25rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
          <span aria-hidden="true" style={{
            width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(145deg, #F7E3CC, #F2D3B3)', color: '#A8481A',
          }}>
            {icon}
          </span>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: 0 }}>{emptyText}</p>
          {onViewAll && (
            <button type="button" className="text-link" onClick={onViewAll} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 11.5 }}>
              Open {title}
            </button>
          )}
        </div>
      ) : children}
    </div>
  </div>
);

export default AdminDashboard;