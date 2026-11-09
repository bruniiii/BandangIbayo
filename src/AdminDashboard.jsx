import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import AdminSearch from './AdminSearch';
import AdminToday from './AdminToday';
import Walkthrough from './ui/Walkthrough';
import { ADMIN_STEPS, walkthroughKey } from './walkthroughSteps';
import { downloadOverviewPDF } from './overviewPdf';
import {
  LayoutDashboard, Map, Calendar, Users, FileText, Bell, CreditCard,
  LogOut, TrendingUp, AlertCircle, Clock, Menu, X, Rss, Star, Globe, Shield,
  ArrowUpRight, MapPin, Wallet, ImageIcon, MessagesSquare, ShieldCheck, Wrench,
} from 'lucide-react';
import GroupChat from './GroupChat';
import { useChatUnread } from './chatStore';
import { useNavigate } from 'react-router-dom';
import { supabase, currentUser } from './supabaseClient';
import { bookingForNotification, tourForNotification, postForNotification } from './notificationTarget';
import SidebarPinButton from './ui/SidebarPinButton';
import { useSidebarPin } from './ui/useSidebarPin';
import { useAdminMe } from './adminMe';
import AdminSettings from './AdminSettings';
import { toast } from './ui/toast';
import TourManagement from './TourManagement';
import BookingManagement from './BookingManagement';
import Feed from './Feed';
import Reviews from './Reviews';
import JoinerAccounts from './Joineraccounts';
import AdminExclusiveTours from './AdminExclusiveTours';
import { AdminTrackingControls } from "./AdminTrackingControls";
import logoIcon from './assets/logo.png';
import AdminAccountMenu from './AdminAccountMenu';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ui/ThemeToggle';
import Notification from './Notification';
import { formatPeso, archivePastTours, todayManila } from './tourUtils';
import { confirmDialog } from './ui/ConfirmDialog';
import PageHeader from './ui/PageHeader';
import { SkeletonRows, Skel } from './ui/Skeleton';
import { readTab, saveTab, forgetTab } from './rememberTab';
import { useTabHistory, tabFromUrl } from './useTabHistory';

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
 

// Loaded only when opened (keeps the dashboard quick to start).
const Reports = lazy(() => import('./Reports'));
const SystemMaintenance = lazy(() => import('./SystemMaintenance'));
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
  { icon: <Shield size={18} strokeWidth={2} />,          label: 'Private Tours' },
  { icon: <Globe size={18} strokeWidth={2} />,           label: 'Requested Tours' },
  { icon: <Clock size={18} strokeWidth={2} />,           label: 'Tracking Management' },
  { icon: <MessagesSquare size={18} strokeWidth={2} />,  label: 'Messages' },
  { icon: <FileText size={18} strokeWidth={2} />,        label: 'Reports' },
  { icon: <Star size={18} strokeWidth={2} />,            label: 'Reviews' },
  { icon: <Bell size={18} strokeWidth={2} />,            label: 'Notification' },
  { icon: <Wrench size={18} strokeWidth={2} />,          label: 'System Maintenance' },
];
// Only the main admin sees this one.
const SETTINGS_ITEM = { icon: <ShieldCheck size={18} strokeWidth={2} />, label: 'Admin Settings' };
 
// ─── Main Component ──────────────────────────────────────────────────────────
 
const AdminDashboard = () => {
  // The page named in the address (/admin/dashboard/<page>) opens first, else the last one this tab was on.
  const [activeTab, setActiveTab] = useState(() => tabFromUrl(ADMIN_BASE, TAB_LABELS) || readTab(TAB_KEY, TAB_LABELS, 'Overview'));
  const me = useAdminMe();
  const navItems = me.isMain ? [...NAV_ITEMS, SETTINGS_ITEM] : NAV_ITEMS;
  // A refresh reopens the page you were on (see rememberTab.js).
  useEffect(() => { saveTab(TAB_KEY, activeTab); }, [activeTab]);
  // Browser Back goes to the previous dashboard page.
  useTabHistory(activeTab, setActiveTab, 'Overview', { base: ADMIN_BASE, labels: TAB_LABELS });
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
  const chatUnread = useChatUnread();
 
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
  const [sidebarPinned, toggleSidebarPin] = useSidebarPin();
  const sidebarExpanded = isMobile ? true : (sidebarPinned || sidebarHovered);
 
  // The exact item a clicked notification is about ({ id, n }); n remounts the page so it opens it.
  const [focus, setFocus] = useState(null);
  const focusKey = focus ? `focus-${focus.n}` : undefined;
  const focusId = focus?.id ?? null;

  const handleNavClick = (label) => {
    setFocus(null);
    setActiveTab(label);
    if (isMobile) setMobileNavOpen(false);
  };

  // A request notification opens Private Tours or Requested Tours, whichever it's on.
  const openRequestPage = async (requestId) => {
    let page = 'Private Tours';
    let found = false;
    if (requestId) {
      const { data } = await supabase.from('exclusive_requests').select('request_type').eq('id', requestId).maybeSingle();
      if (data?.request_type === 'request') page = 'Requested Tours';
      found = !!data;
    }
    openFocused(page, found ? requestId : null);
  };

  // Opens a page on one item (a booking, a request, a joiner, a tour...).
  const openFocused = (page, id, section = null) => {
    handleNavClick(page);
    if (id != null) setFocus({ id, section, n: Date.now() });
  };

  // Routes a clicked notification to the exact item it's about: a booking
  // opens its details in Booking Management, a request opens that request,
  // a new joiner opens their account, and so on.
  const handleNotificationNavigate = async (notification) => {
    switch (notification.type) {
      case 'booking':
      case 'payment':
      case 'cancellation':
      case 'waitlist': {
        const booking = await bookingForNotification(notification);
        const text = `${notification.title || ''} ${notification.message || ''}`;
        const section = notification.type === 'cancellation' || /cancel/i.test(text) ? 'booking-cancellation'
          : notification.type === 'payment' || /paid|payment|balance/i.test(text) ? 'booking-payment' : null;
        openFocused('Booking Management', booking?.id, section);
        break;
      }
      case 'exclusive_request':
      case 'exclusive_package':
        openRequestPage(notification.related_id);
        break;
      case 'feed': {
        // The exact post (still waiting, or already approved); else the waiting list.
        const post = await postForNotification(notification);
        openFocused('Feed', post ? `post:${post.id}` : 'pending');
        break;
      }
      case 'review': {
        const tour = await tourForNotification(notification);
        openFocused('Reviews', tour?.id);
        break;
      }
      case 'account':
        openFocused('Joiner Accounts', notification.related_id);
        break;
      case 'tracking': {
        const tour = await tourForNotification(notification);
        openFocused('Tracking Management', tour?.id);
        break;
      }
      case 'tour': {
        const tour = await tourForNotification(notification);
        openFocused('Tour Management', tour?.id);
        break;
      }
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
    ratingBreakdown: [],
    latestPost: null,
    pendingExclusiveRequests: [], // Private Tour / Request-a-Tour submissions awaiting review
    pendingExclusiveCount: 0,
  });
 
  // First-time walkthrough of the menu (once per account on this device).
  const [tourOpen, setTourOpen] = useState(false);
  const tourUser = useRef(null);
  useEffect(() => {
    currentUser().then((u) => {
      tourUser.current = u?.id || null;
      try { if (u && !localStorage.getItem(walkthroughKey(u.id, 'admin'))) setTourOpen(true); } catch { /* private mode */ }
    });
  }, []);
  const closeTour = () => {
    setTourOpen(false);
    try { localStorage.setItem(walkthroughKey(tourUser.current, 'admin'), '1'); } catch { /* private mode */ }
  };
  const adminSteps = me.isMain ? ADMIN_STEPS : ADMIN_STEPS.filter((st) => st.target !== 'Admin Settings');

  const handleLogout = async () => {
    const ok = await confirmDialog({
      title: 'Sign out?',
      message: "You'll need to log in again to manage tours and bookings.",
      confirmLabel: 'Sign Out',
      cancelLabel: 'Stay Signed In',
    });
    if (!ok) return;
    // Leave the dashboard first, so signing out lands on the landing page, not the login page.
    forgetTab(TAB_KEY);
    navigate('/', { replace: true });
    const { error } = await supabase.auth.signOut();
    if (error) toast.error('Logout failed', error.message);
  };
 
  const fetchOverviewData = async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const nextMonthStart = monthEnd;
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Tour dates (Philippine calendar) for "bookings this month": a booking's
    // month is its tour's start date (bookings have no date column of their own).
    const [y, m] = todayManila().split('-').map(Number);
    const ymd = (yy, mm) => { const d = new Date(Date.UTC(yy, mm - 1, 1)); return d.toISOString().slice(0, 10); };
    const dayThisMonth = ymd(y, m);
    const dayNextMonth = ymd(y, m + 1);
    const dayLastMonth = ymd(y, m - 1);

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
      supabase.from('bookings').select('*', { count: 'exact', head: true }).not('payment_status', 'in', '("Awaiting Payment","Expired")'),
      supabase.from('bookings').select('id, tours!inner(start_date)', { count: 'exact', head: true }).not('payment_status', 'in', '("Awaiting Payment","Expired")').gte('tours.start_date', dayThisMonth).lt('tours.start_date', dayNextMonth),
      supabase.from('bookings').select('id, tours!inner(start_date)', { count: 'exact', head: true }).not('payment_status', 'in', '("Awaiting Payment","Expired")').gte('tours.start_date', dayLastMonth).lt('tours.start_date', dayThisMonth),
      supabase.from('tours').select('*', { count: 'exact', head: true }).gte('start_date', nextMonthStart).lt('start_date', nextMonthEnd).eq('is_archived', false),
      supabase.from('tours').select('*', { count: 'exact', head: true }).eq('is_archived', false),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).in('payment_status', ['Pending', 'Verification Pending']),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('bookings').select('total_price').eq('payment_status', 'Complete').gte('created_at', monthStart).lt('created_at', monthEnd),
      supabase.from('bookings').select('total_price').eq('payment_status', 'Complete').gte('created_at', lastMonthStart).lt('created_at', monthStart),
      supabase.from('tours').select('id, title, destination, start_date, group_size, image_urls').eq('is_archived', false).order('start_date', { ascending: true }).limit(3),
      supabase.from('bookings').select('id, booking_number, full_name, user_id, total_price, payment_method, created_at, tour_id, tours(title)').in('payment_status', ['Pending', 'Verification Pending']).order('created_at', { ascending: false }).limit(4),
      supabase.from('profiles').select('id, first_name, last_name, username, avatar_url, created_at').not('role', 'in', '(admin,archived_admin)').order('created_at', { ascending: false }).limit(4),
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
      // Stars 5 → 1 with how many reviews gave each.
      ratingBreakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: ratings.filter((r) => Math.round(r) === stars).length })),
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
    <div className="admin-dashboard-container glass-page" style={{
      display: 'flex', height: '100dvh',
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
      {/* edge tab: opens the menu from anywhere on the page */}
      {/* (The menu button stays at the top now, so the edge tab isn't needed.) */}
      <Walkthrough steps={adminSteps} open={tourOpen} onClose={closeTour} onMenu={setMobileNavOpen} />

      <aside
        className={`dashboard-sidebar ${mobileNavOpen ? 'is-open' : ''}`}
        onMouseEnter={() => { if (!isMobile) setSidebarHovered(true); }}
        onMouseLeave={() => { if (!isMobile) setSidebarHovered(false); }}
        style={{
          // Wide enough for the longest menu label ("Tracking Management") in full.
          width: sidebarExpanded ? 296 : 84,
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
        {!isMobile && sidebarExpanded && <SidebarPinButton pinned={sidebarPinned} onToggle={toggleSidebarPin} />}
        {isMobile && mobileNavOpen && (
          <button className="x-close"
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
                width: sidebarExpanded ? 40 : 34,
                height: sidebarExpanded ? 40 : 34,
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
          {navItems.map(({ icon, label }) => (
            <NavItem
              key={label}
              icon={icon}
              label={label}
              active={activeTab === label}
              collapsed={!sidebarExpanded}
              onClick={() => handleNavClick(label)}
              badge={label === 'Messages' ? chatUnread : 0}
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
          {/* Top row: page title on the left, bell and account on the right (stays at the top: index.css) */}
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
              <AdminSearch onOpen={openFocused} />
              <ThemeToggle />
              <NotificationBell onNotificationClick={handleNotificationNavigate} />

              {/* admin chip: who's signed in + Change Password */}
              <AdminAccountMenu onOpenSettings={() => handleNavClick('Admin Settings')} onStartTour={() => setTourOpen(true)} />
            </div>
          </div>

          {/* The page content under the title row */}
          <div style={{ flex: 1, minHeight: 0 }}>
 
          {/* OVERVIEW TAB CONTENT */}
          {activeTab === 'Overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingBottom: 40 }}>
 
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
                <button type="button" disabled={loadingStats} onClick={() => downloadOverviewPDF({ stats, snippets }).catch((e) => toast.error("Couldn't create the PDF", e.message))} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', borderRadius: 12, cursor: 'pointer',
                  background: '#E8A265', color: '#1A0A00', border: 'none', fontFamily: 'inherit',
                  fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase',
                }}><FileText size={15} /> Download PDF</button>
              </div>

              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 20 }}>
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
                  title="Total Joiners"
                  value={loadingStats ? <Skel w={60} h={34} style={{ display: 'inline-block' }} /> : stats.totalJoiners}
                  icon={<Users size={18} />}
                  iconColor="#3F5D62"
                  trend={loadingStats ? '' : `${stats.joinersThisWeek} new this week`}
                />
              </div>

              {/* Phones: the search box (it's in the top bar on wider screens) */}
              <AdminSearch onOpen={openFocused} wide />

              {/* Everything waiting on an admin today, and the tours leaving soon */}
              <AdminToday onOpen={openFocused} />

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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 20 }}>

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

                  {/* Private / Requested Tours */}
                  <ModuleCard
                    icon={<Globe size={16} />}
                    title="Private & Requested Tours"
                    metaLabel={`${snippets.pendingExclusiveCount} for approval`}
                    onViewAll={() => handleNavClick(snippets.pendingExclusiveRequests[0]?.request_type === 'request' ? 'Requested Tours' : 'Private Tours')}
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
                          {r.request_type === 'exclusive' ? 'Private' : 'Request'}
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

                  {/* This month at a glance */}
                  <ModuleCard
                    icon={<TrendingUp size={16} />}
                    title="This Month at a Glance"
                    metaLabel={new Date().toLocaleDateString('en-US', { month: 'long' })}
                    onViewAll={() => handleNavClick('Reports')}
                    loading={loadingStats}
                    empty={false}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {[
                        ['Bookings', stats.bookingsThisMonth],
                        ['Waiting for verification', stats.pendingVerification],
                        ['Tours next month', stats.toursNextMonth],
                        ['New joiners (7 days)', stats.joinersThisWeek],
                      ].map(([label, value]) => (
                        <div key={label} style={{ background: '#F2E4D0', borderRadius: 12, padding: '10px 12px' }}>
                          <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#1A0A00' }}>{value}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, fontWeight: 700, color: '#7A3A18', lineHeight: 1.3 }}>{label}</p>
                        </div>
                      ))}
                    </div>
                  </ModuleCard>

                  {/* Ratings breakdown */}
                  <ModuleCard
                    icon={<Star size={16} />}
                    title="Ratings Breakdown"
                    metaLabel={`${snippets.reviewCount} review${snippets.reviewCount === 1 ? '' : 's'}`}
                    onViewAll={() => handleNavClick('Reviews')}
                    loading={loadingStats}
                    empty={!snippets.reviewCount}
                    emptyText="No reviews yet."
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {snippets.ratingBreakdown.map(({ stars, count }) => (
                        <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 28, fontSize: 12, fontWeight: 800, color: '#5C2A10', whiteSpace: 'nowrap' }}>{stars} ★</span>
                          <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#F2E4D0', overflow: 'hidden' }}>
                            <div style={{ width: `${snippets.reviewCount ? (count / snippets.reviewCount) * 100 : 0}%`, height: '100%', background: '#E8A265' }} />
                          </div>
                          <span style={{ width: 24, textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>{count}</span>
                        </div>
                      ))}
                    </div>
                  </ModuleCard>

                </div>
              </div>
            </div>
          )}
 
          {/* ROUTED CONTENT VIEWS */}
          {activeTab === 'Feed' && <Feed key={focusKey} isAdmin={true} focus={focusId} />}
          {activeTab === 'Tour Management' && <TourManagement key={focusKey} openTourId={focusId} />}
          {activeTab === 'Booking Management' && <BookingManagement key={focusKey} openBookingId={focusId} openSection={focus?.section} />}
          {activeTab === 'Joiner Accounts' && <JoinerAccounts key={focusKey} openJoinerId={focusId} />}
          {activeTab === 'Private Tours' && <AdminExclusiveTours key={`exclusive${focusKey || ''}`} type="exclusive" openRequestId={focusId} />}
          {activeTab === 'Requested Tours' && <AdminExclusiveTours key={`request${focusKey || ''}`} type="request" openRequestId={focusId} />}
          {activeTab === 'Reviews' && <Reviews key={focusKey} isAdmin={true} focusTourId={focusId} />}
          {activeTab === 'Messages' && <GroupChat isAdmin />}
          {activeTab === 'Reports' && <Suspense fallback={<SkeletonRows count={4} label="Loading reports" />}><Reports /></Suspense>}
          {activeTab === 'Tracking Management' && (
             <AdminTrackingControls key={focusKey} openTourId={focusId} />
          )}
          {activeTab === 'Notification' && <Notification isAdmin={true} onNavigate={handleNotificationNavigate} />}
          {activeTab === 'Admin Settings' && <AdminSettings />}
          {activeTab === 'System Maintenance' && <Suspense fallback={<SkeletonRows count={4} label="Loading" />}><SystemMaintenance onNavigate={(page, id) => (id != null ? openFocused(page, id) : handleNavClick(page))} /></Suspense>}
          

          {/* FALLBACK COMING SOON SECTION */}
          {activeTab !== 'Overview' &&
           activeTab !== 'Feed' &&
           activeTab !== 'Tour Management' &&
           activeTab !== 'Booking Management' &&
           activeTab !== 'Reviews' &&
           activeTab !== 'Joiner Accounts' &&
           activeTab !== 'Private Tours' &&
           activeTab !== 'Requested Tours' &&
           activeTab !== 'Tracking Management' &&
           activeTab !== 'Reports' &&
           activeTab !== 'Messages' &&
           activeTab !== 'Notification' &&
           activeTab !== 'Admin Settings' && (
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
const TAB_KEY = 'ibayo-admin-tab';
// Each page has its own address: /admin/dashboard/tracking-management…
const ADMIN_BASE = '/admin/dashboard';
const TAB_LABELS = [...NAV_ITEMS, SETTINGS_ITEM].map((n) => n.label);

const PAGE_INFO = {
  'Overview':            { icon: LayoutDashboard, title: 'Overview',            subtitle: "Today's bookings, payments and tours at a glance" },
  'Feed':                { icon: Rss,             title: 'Community Feed',      subtitle: 'Updates, announcements & newly posted tours' },
  'Tour Management':     { icon: Map,             title: 'Tour Management',     subtitle: 'Create tours, add dates and manage your postings' },
  'Booking Management':  { icon: Calendar,        title: 'Booking Management',  subtitle: 'Verify payments, track downpayments and update booking status' },
  'Joiner Accounts':     { icon: Users,           title: 'Joiner Accounts',     subtitle: 'Everyone registered as a joiner' },
  'Private Tours':     { icon: Shield,          title: 'Private Tours',     subtitle: 'Private-group tour requests from joiners' },
  'Requested Tours':     { icon: Globe,           title: 'Requested Tours',     subtitle: 'New destinations joiners asked for, posted on Explore Tours once ready' },
  'Tracking Management': { icon: Clock,           title: 'Tracking Management', subtitle: "Share each tour's live location with its joiners, and check them in on the day" },
  'Messages':            { icon: MessagesSquare,  title: 'Messages',            subtitle: 'Chat with the joiners of each tour date, and with private tour joiners' },
  'Reports':             { icon: FileText,        title: 'Reports',             subtitle: 'Bookings, sales and payments over time' },
  'Reviews':             { icon: Star,            title: 'Tour Reviews',        subtitle: 'What joiners are saying about your tours' },
  'Notification':        { icon: Bell,            title: 'Notifications',       subtitle: 'Every activity across bookings, requests, reviews & more' },
  'System Maintenance':  { icon: Wrench,          title: 'System Maintenance',  subtitle: 'Monitor the system, keep the data correct, back it up, and control Maintenance Mode' },
  'Admin Settings':      { icon: ShieldCheck,     title: 'Admin Settings',      subtitle: 'Add, archive or restore the people who can use the admin dashboard' },
};

// ─── Nav Item ────────────────────────────────────────────────────────────────
 
const NavItem = ({ icon, label, active, onClick, collapsed, badge = 0 }) => (
  <button
    data-tour={label}
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
      transform: active && !collapsed ? 'translateX(2px)' : 'translateX(0)',
      boxShadow: active ? '0 6px 20px rgba(180,81,30,0.35)' : 'none',
      transition: 'all 0.2s',
      textAlign: 'left',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    <span style={{ color: active ? '#FDF6EE' : 'rgba(232,162,101,0.8)', flexShrink: 0, position: 'relative', display: 'flex' }}>
      {icon}
      {badge > 0 && collapsed && (
        <span aria-label={`${badge} unread`} style={{ position: 'absolute', top: -6, right: -8, background: '#E8A265', color: '#1A0A00', borderRadius: 999, minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', fontSize: 9.5, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </span>
    {!collapsed && (
      // (Bold text is wider: a little less letter spacing keeps the longest
      // label, "Tracking Management", inside the highlight.)
      <span style={{ fontSize: 12, letterSpacing: active ? '0.08em' : '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
    )}
    {!collapsed && badge > 0 && (
      <span aria-label={`${badge} unread`} style={{ marginLeft: 'auto', background: '#E8A265', color: '#1A0A00', borderRadius: 999, minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {badge > 99 ? '99+' : badge}
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
      // Shrinks on small screens so big peso amounts stay inside the card.
      fontSize: 'clamp(22px, 8vw, 38px)', fontWeight: 900, letterSpacing: '-0.04em',
      color: '#1A0A00', margin: 0, lineHeight: 1.1, overflowWrap: 'anywhere',
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