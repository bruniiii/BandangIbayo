import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { GreetingBar, RevenueChart, SlotsPanel } from './OverviewParts';
import CountUp from './ui/CountUp';
import { pageEnter } from './motion';
import AdminSearch from './AdminSearch';
import AdminToday from './AdminToday';
import Walkthrough from './ui/Walkthrough';
import { ADMIN_STEPS, walkthroughKey } from './walkthroughSteps';
import {
  LayoutDashboard, Map, Calendar, Users, FileText, Bell, CreditCard,
  LogOut, TrendingUp, AlertCircle, Clock, Menu, X, Rss, Star, Globe, Shield,
  ArrowUpRight, MapPin, Wallet, ImageIcon, MessagesSquare, ShieldCheck, Wrench,
} from 'lucide-react';
import { useChatUnread } from './chatStore';
import { useNavigate } from 'react-router-dom';
import { supabase, currentUser } from './supabaseClient';
import { bookingForNotification, tourForNotification, postForNotification } from './notificationTarget';
import SidebarPinButton from './ui/SidebarPinButton';
import { useSidebarPin } from './ui/useSidebarPin';
import { useAdminMe } from './adminMe';
import { toast } from './ui/toast';
import logoIcon from './assets/logo.png';
import AdminAccountMenu from './AdminAccountMenu';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ui/ThemeToggle';
import { formatPeso, archivePastTours, todayManila } from './tourUtils';
import { confirmDialog } from './ui/ConfirmDialog';
import PageHeader from './ui/PageHeader';
import { SkeletonRows, Skel } from './ui/Skeleton';
import { readTab, saveTab, forgetTab } from './rememberTab';
import { useTabHistory, tabFromUrl } from './useTabHistory';

// Pages load only when opened (a smaller first download, faster on phones).
// Once the dashboard is showing, preloadPages() fetches the rest quietly in
// the background, so switching pages is still instant.
const PAGE_LOADERS = {
  GroupChat: () => import('./GroupChat'),
  AdminSettings: () => import('./AdminSettings'),
  TourManagement: () => import('./TourManagement'),
  BookingManagement: () => import('./BookingManagement'),
  Feed: () => import('./Feed'),
  Reviews: () => import('./Reviews'),
  JoinerAccounts: () => import('./Joineraccounts'),
  AdminExclusiveTours: () => import('./AdminExclusiveTours'),
  AdminTrackingControls: () => import('./AdminTrackingControls'),
  Notification: () => import('./Notification'),
};
const GroupChat = lazy(PAGE_LOADERS.GroupChat);
const AdminSettings = lazy(PAGE_LOADERS.AdminSettings);
const TourManagement = lazy(PAGE_LOADERS.TourManagement);
const BookingManagement = lazy(PAGE_LOADERS.BookingManagement);
const Feed = lazy(PAGE_LOADERS.Feed);
const Reviews = lazy(PAGE_LOADERS.Reviews);
const JoinerAccounts = lazy(PAGE_LOADERS.JoinerAccounts);
const AdminExclusiveTours = lazy(PAGE_LOADERS.AdminExclusiveTours);
const AdminTrackingControls = lazy(() => PAGE_LOADERS.AdminTrackingControls().then((m) => ({ default: m.AdminTrackingControls })));
const Notification = lazy(PAGE_LOADERS.Notification);
const preloadPages = () => Object.values(PAGE_LOADERS).forEach((load) => { load().catch(() => {}); });


// ── PALETTE ──────────────────────────────────────────────
// var(--ib-dark, #1A0A00)  espresso dark
// var(--ib-sienna, #A8481A)  burnt sienna (accent)
// var(--ib-amber, #E8A265)  warm amber (highlight)
// var(--ib-cream, #FDF6EE)  cream (light bg)
// var(--ib-deep, #2D1B0E)  deep brown (dark card)
// var(--ib-rust, #7A3A18)  rust mid-tone
// var(--ib-parch, #F2E4D0)  parchment (legacy section bg, still used for some inset panels)
// var(--ib-cream, #FDF6EE)  cream (page bg, same as the public Tours page)
// var(--ib-slate, #3F5D62)  slate teal (secondary contrast accent, used sparingly)
// ---------------------------------------------------------
 
// ─── Helpers ────────────────────────────────────────────────────────────────
 

// Loaded only when opened (keeps the dashboard quick to start).
const Reports = lazy(() => import('./Reports'));
const SystemMaintenance = lazy(() => import('./SystemMaintenance'));
 
 
const peso = formatPeso;

const truncate = (text, max = 74) => {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
};


const personName = (p, fallback = 'Unknown') => {
  if (!p) return fallback;
  const combo = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return combo || p.username || fallback;
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
  // The other pages download in the background a moment after the dashboard shows.
  useEffect(() => { const t = setTimeout(preloadPages, 2500); return () => clearTimeout(t); }, []);
  // A new page fades and slides in (motion.js).
  const contentRef = useRef(null);
  useEffect(() => { pageEnter(contentRef.current); }, [activeTab]);
  const me = useAdminMe();
  // Reports (money) is hidden from admins without that permission; on the other
  // pages, what an admin may not change is refused by the database with a note.
  const navItems = [...NAV_ITEMS.filter((n) => n.label !== 'Reports' || me.can('reports')), ...(me.isMain ? [SETTINGS_ITEM] : [])];
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
    madeThisMonth: 0,       // bookings made this month / last month (not by tour date)
    madeLastMonth: 0,
    joinersThisMonth: 0,    // new joiner accounts this month / last month
    joinersLastMonth: 0,
    toursToday: 0,          // tours leaving today
    revenueByMonth: [],     // the last 6 months: [{ key: '2026-06', label: 'Jun', total }]
    slots: [],              // tours leaving in the next 30 days: booked / slots / van seats
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

    // ── More for the Overview: the greeting line, this month vs last month,
    // the revenue chart and the slots-filled panel ──
    const today = todayManila();
    const sixStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const in30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
    const notJoiner = '(admin,archived_admin)';
    const [toursTodayRes, madeThis, madeLast, joinThis, joinLast, revenueSix, soonTours] = await Promise.all([
      supabase.from('tours').select('*', { count: 'exact', head: true }).eq('is_archived', false).eq('start_date', today),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).not('payment_status', 'in', '("Awaiting Payment","Expired")').gte('created_at', monthStart).lt('created_at', monthEnd),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).not('payment_status', 'in', '("Awaiting Payment","Expired")').gte('created_at', lastMonthStart).lt('created_at', monthStart),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).not('role', 'in', notJoiner).gte('created_at', monthStart).lt('created_at', monthEnd),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).not('role', 'in', notJoiner).gte('created_at', lastMonthStart).lt('created_at', monthStart),
      supabase.from('bookings').select('total_price, created_at').eq('payment_status', 'Complete').gte('created_at', sixStart.toISOString()).lt('created_at', monthEnd),
      supabase.from('tours').select('id, title, start_date, end_date, group_size').eq('is_archived', false).gte('start_date', today).lte('start_date', in30).order('start_date', { ascending: true }).limit(8),
    ]);
    const revenueByMonth = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(sixStart.getFullYear(), sixStart.getMonth() + i, 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-US', { month: 'short' }), year: d.getFullYear(), total: 0 };
    });
    (revenueSix.data || []).forEach((b) => {
      const d = new Date(b.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const row = revenueByMonth.find((r) => r.key === k);
      if (row) row.total += Number(b.total_price) || 0;
    });
    // Slots filled for the tours leaving soon, and the seats of the van picked for each.
    let slots = [];
    const soon = soonTours.data || [];
    if (soon.length) {
      const ids = soon.map((t) => t.id);
      const [bk, veh] = await Promise.all([
        supabase.from('bookings').select('tour_id, slots_booked').in('tour_id', ids).not('booking_status', 'in', '("Cancelled","Rejected")').not('payment_status', 'in', '("Awaiting Payment","Expired")'),
        supabase.from('tour_vehicles').select('tour_id, van_id').in('tour_id', ids),
      ]);
      const vanIds = [...new Set((veh.data || []).map((v) => v.van_id).filter(Boolean))];
      const { data: vans } = vanIds.length ? await supabase.from('fleet_vans').select('id, seats, plate_number').in('id', vanIds) : { data: [] };
      slots = soon.map((t) => {
        const booked = (bk.data || []).filter((b) => String(b.tour_id) === String(t.id)).reduce((n, b) => n + (Number(b.slots_booked) || 0), 0);
        const vanId = (veh.data || []).find((v) => String(v.tour_id) === String(t.id))?.van_id;
        const van = (vans || []).find((v) => v.id === vanId) || null;
        return { ...t, booked, capacity: Number(t.group_size) || 0, seats: van ? Number(van.seats ?? 14) : null, plate: van?.plate_number || '' };
      });
    }

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
      madeThisMonth: madeThis.count ?? 0,
      madeLastMonth: madeLast.count ?? 0,
      joinersThisMonth: joinThis.count ?? 0,
      joinersLastMonth: joinLast.count ?? 0,
      toursToday: toursTodayRes.count ?? 0,
      revenueByMonth,
      slots,
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
    <div className="admin-dashboard-container" style={{
      display: 'flex', height: '100dvh',
      fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
      background: 'var(--ib-cream, #FDF6EE)',
      color: 'var(--ib-dark, #1A0A00)',
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
          background: 'var(--ib-ink, #1A0A00)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 20,
          boxShadow: '4px 0 32px rgba(var(--ib-shadow-rgb, 26,10,0), 0.28)',
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
              background: 'var(--ib-accent, #B4511E)',
              border: '3px solid #EDEAE3',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--ib-on-accent, #FDF6EE)',
              zIndex: 30,
              boxShadow: '0 4px 12px rgba(var(--ib-shadow-rgb, 26,10,0), 0.35)',
              transition: 'background 0.2s, transform 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--ib-amber, #E8A265)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--ib-accent, #B4511E)'}
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
              <span className="font-display" style={{ fontSize: 19, color: 'var(--ib-on-ink, #FDF6EE)', whiteSpace: 'nowrap' }}>
                Bandang <span className="font-accent" style={{ color: 'var(--ib-amber, #E8A265)' }}>IBAYO</span>
              </span>
            )}
          </button>
          {sidebarExpanded && (
            <p style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(var(--ib-soft-rgb, 232,210,190), 0.85)', margin: 0,
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
              color: 'rgba(var(--ib-soft-rgb, 232,210,190), 0.85)',
              fontFamily: 'inherit',
              padding: 0,
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--ib-amber, #E8A265)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(var(--ib-soft-rgb, 232,210,190), 0.85)'}
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
        <div className="dashboard-content admin-area" ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: '2.5rem', background: 'var(--ib-cream, #FDF6EE)', display: 'flex', flexDirection: 'column' }}>
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
 
              {/* Greeting, today's date and what today holds (each a shortcut) */}
              <GreetingBar
                name={me.name}
                toursToday={stats.toursToday}
                payments={Number(String(stats.pendingVerification).replace(/,/g, '')) || 0}
                requests={snippets.pendingExclusiveCount}
                loading={loadingStats}
                onOpen={(page) => handleNavClick(page)}
              />

              {/* Phones: the search box (it's in the top bar on wider screens) */}
              <AdminSearch onOpen={openFocused} wide />

              {/* Everything waiting on an admin today, and the tours leaving soon: first, since it's what admins act on */}
              <AdminToday onOpen={openFocused} />

              {/* This month vs last month: all three counted the same way (made this month) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 20 }}>
                <StatCard
                  title="Revenue This Month"
                  value={loadingStats ? <Skel w={140} h={34} style={{ display: 'inline-block' }} /> : peso(stats.revenueThisMonth)}
                  icon={<Wallet size={18} />}
                  iconColor="var(--ib-sienna, #A8481A)"
                  trend={loadingStats ? '' : vsLastMonth(stats.revenueThisMonth, stats.revenueLastMonth, peso(stats.revenueLastMonth))}
                />
                <StatCard
                  title="Bookings This Month"
                  value={loadingStats ? <Skel w={60} h={34} style={{ display: 'inline-block' }} /> : stats.madeThisMonth.toLocaleString()}
                  icon={<TrendingUp size={18} />}
                  iconColor="var(--ib-sienna, #3F5D62)"
                  trend={loadingStats ? '' : vsLastMonth(stats.madeThisMonth, stats.madeLastMonth, stats.madeLastMonth.toLocaleString())}
                />
                <StatCard
                  title="New Joiners This Month"
                  value={loadingStats ? <Skel w={60} h={34} style={{ display: 'inline-block' }} /> : stats.joinersThisMonth.toLocaleString()}
                  icon={<Users size={18} />}
                  iconColor="var(--ib-sienna, #3F5D62)"
                  trend={loadingStats ? '' : vsLastMonth(stats.joinersThisMonth, stats.joinersLastMonth, stats.joinersLastMonth.toLocaleString())}
                />
              </div>

              {/* Revenue over 6 months, and how full the next tours are */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 20 }}>
                <RevenueChart months={stats.revenueByMonth} loading={loadingStats} onViewAll={() => handleNavClick('Reports')} />
                <SlotsPanel tours={stats.slots} loading={loadingStats} onOpenTour={(id) => openFocused('Tour Management', id)} onViewAll={() => handleNavClick('Tour Management')} />
              </div>

              {/* Quick looks: the pages that most often need an admin */}
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{
                    fontWeight: 900, fontSize: 13, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: 'var(--ib-dark, #1A0A00)', margin: 0,
                  }}>
                    Quick Looks
                  </h3>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--ib-rust, #7A3A18)', opacity: 0.9, margin: 0 }}>
                    Live from Bookings, Requests &amp; Reviews
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 20 }}>

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
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.08)' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ib-dark, #1A0A00)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {personName(b.profiles, b.full_name)}
                          </p>
                          <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ib-rust, #7A3A18)', opacity: 0.9, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.tours?.title || 'Tour'}
                          </p>
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--ib-sienna, #A8481A)', flexShrink: 0 }}>{peso(b.total_price)}</span>
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
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.08)' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ib-dark, #1A0A00)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.full_name || 'Joiner'}
                          </p>
                          <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ib-rust, #7A3A18)', opacity: 0.9, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.destination || 'Destination TBD'}
                          </p>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: r.request_type === 'exclusive' ? 'var(--ib-dark, #1A0A00)' : 'var(--ib-sienna, #A8481A)',
                          background: r.request_type === 'exclusive' ? 'rgba(var(--ib-dark-rgb, 26,10,0), 0.06)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.12)',
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
                          <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ib-dark, #1A0A00)', margin: 0 }}>
                            {personName(snippets.latestReview.author, 'A Traveler')}
                          </p>
                          <div style={{ display: 'flex', gap: 1 }}>
                            {[1, 2, 3, 4, 5].map(n => (
                              <Star key={n} size={11} fill={n <= snippets.latestReview.rating ? 'var(--ib-amber, #E8A265)' : 'none'} color={n <= snippets.latestReview.rating ? 'var(--ib-amber, #E8A265)' : 'rgba(var(--ib-rust-rgb, 122,58,24), 0.85)'} />
                            ))}
                          </div>
                        </div>
                        {snippets.latestReview.tours?.title && (
                          <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ib-sienna, #A8481A)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={10} /> {snippets.latestReview.tours.title}
                          </p>
                        )}
                        {snippets.latestReview.comment && (
                          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--ib-rust, #7A3A18)', opacity: 0.9, lineHeight: 1.5, margin: 0 }}>
                            "{truncate(snippets.latestReview.comment, 96)}"
                          </p>
                        )}
                      </div>
                    )}
                  </ModuleCard>


                </div>
              </div>
            </div>
          )}
 
          {/* ROUTED CONTENT VIEWS (each loads when first opened) */}
          <Suspense fallback={<SkeletonRows count={4} label="Loading" />}>
          {activeTab === 'Feed' && <Feed key={focusKey} isAdmin={true} focus={focusId} />}
          {activeTab === 'Tour Management' && <TourManagement key={focusKey} openTourId={focusId} />}
          {activeTab === 'Booking Management' && <BookingManagement key={focusKey} openBookingId={focusId} openSection={focus?.section} />}
          {activeTab === 'Joiner Accounts' && <JoinerAccounts key={focusKey} openJoinerId={focusId} />}
          {activeTab === 'Private Tours' && <AdminExclusiveTours key={`exclusive${focusKey || ''}`} type="exclusive" openRequestId={focusId} />}
          {activeTab === 'Requested Tours' && <AdminExclusiveTours key={`request${focusKey || ''}`} type="request" openRequestId={focusId} />}
          {activeTab === 'Reviews' && <Reviews key={focusKey} isAdmin={true} focusTourId={focusId} />}
          {activeTab === 'Messages' && <GroupChat isAdmin />}
          {activeTab === 'Reports' && me.can('reports') && <Suspense fallback={<SkeletonRows count={4} label="Loading reports" />}><Reports /></Suspense>}
          {activeTab === 'Tracking Management' && (
             <AdminTrackingControls key={focusKey} openTourId={focusId} />
          )}
          {activeTab === 'Notification' && <Notification isAdmin={true} onNavigate={handleNotificationNavigate} />}
          {activeTab === 'Admin Settings' && <AdminSettings />}
          </Suspense>
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
           activeTab !== 'System Maintenance' &&
           activeTab !== 'Admin Settings' && (
            <div style={{
              height: '100%', minHeight: 400,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'var(--ib-cream, #FDF6EE)',
              borderRadius: 24,
              border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.12)',
              boxShadow: '0 4px 24px rgba(var(--ib-shadow-rgb, 26,10,0), 0.06)',
              padding: '3rem',
              textAlign: 'center',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: 'var(--ib-parch, #F2E4D0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ib-sienna, #A8481A)', marginBottom: 20,
              }}>
                <FileText size={36} />
              </div>
              <h3 style={{
                fontWeight: 900, fontSize: 14, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: 'var(--ib-dark, #1A0A00)', margin: '0 0 8px',
              }}>
                {activeTab} Module
              </h3>
              <p style={{ fontSize: 13, color: 'var(--ib-rust, #7A3A18)', opacity: 0.9, margin: 0 }}>
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
      background: active ? 'var(--ib-accent, #B4511E)' : 'transparent',
      color: active ? 'var(--ib-on-accent, #FDF6EE)' : 'rgba(var(--ib-soft-rgb, 232,210,190), 0.85)',
      fontWeight: active ? 900 : 600,
      transform: active && !collapsed ? 'translateX(2px)' : 'translateX(0)',
      boxShadow: active ? '0 6px 20px rgba(var(--ib-accent-rgb, 180,81,30), 0.35)' : 'none',
      transition: 'all 0.2s',
      textAlign: 'left',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    <span style={{ color: active ? 'var(--ib-on-ink, #FDF6EE)' : 'rgba(var(--ib-amber-rgb, 232,162,101), 0.8)', flexShrink: 0, position: 'relative', display: 'flex' }}>
      {icon}
      {badge > 0 && collapsed && (
        <span aria-label={`${badge} unread`} style={{ position: 'absolute', top: -6, right: -8, background: 'var(--ib-amber, #E8A265)', color: 'var(--ib-ink, #1A0A00)', borderRadius: 999, minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', fontSize: 9.5, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      <span aria-label={`${badge} unread`} style={{ marginLeft: 'auto', background: 'var(--ib-amber, #E8A265)', color: 'var(--ib-ink, #1A0A00)', borderRadius: 999, minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);
 
// ─── Stat Card ───────────────────────────────────────────────────────────────
 
// "+12% vs last month (₱40,000)" — or a plain note when last month had none.
const vsLastMonth = (now, last, lastText) => {
  if (!last) return now ? 'Nothing last month to compare' : 'None last month either';
  const change = Math.round(((now - last) / last) * 100);
  return `${change >= 0 ? '+' : ''}${change}% vs last month (${lastText})`;
};

const StatCard = ({ title, value, icon, iconColor, trend }) => (
  <div style={{
    background: 'var(--ib-cream, #FDF6EE)',
    borderRadius: 20,
    padding: '1.75rem 2rem',
    border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.12)',
    boxShadow: '0 4px 20px rgba(var(--ib-shadow-rgb, 26,10,0), 0.06)',
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
        textTransform: 'uppercase', color: 'var(--ib-rust, #7A3A18)', margin: 0,
      }}>
        {title}
      </p>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'var(--ib-surface-2, #F1EEE8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: iconColor || 'var(--ib-sienna, #A8481A)',
        flexShrink: 0,
      }}>
        {icon}
      </div>
    </div>
    <p style={{
      // Shrinks on small screens so big peso amounts stay inside the card.
      fontSize: 'clamp(22px, 8vw, 38px)', fontWeight: 900, letterSpacing: '-0.04em',
      color: 'var(--ib-dark, #1A0A00)', margin: 0, lineHeight: 1.1, overflowWrap: 'anywhere',
    }}>
      {typeof value === 'string' || typeof value === 'number' ? <CountUp value={value} /> : value}
    </p>
    {trend && (
      <p style={{
        fontSize: 11.5, fontWeight: 700, fontStyle: 'italic',
        color: 'var(--ib-rust, #7A3A18)', opacity: 0.9, margin: 0,
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
    background: 'var(--ib-cream, #FDF6EE)',
    borderRadius: 20,
    border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.12)',
    boxShadow: '0 4px 20px rgba(var(--ib-shadow-rgb, 26,10,0), 0.05)',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '1.1rem 1.35rem', borderBottom: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          background: 'var(--ib-ink, #1A0A00)', color: 'var(--ib-amber, #E8A265)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </p>
          {metaLabel && (
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ib-rust, #7A3A18)', opacity: 0.9, margin: '2px 0 0' }}>
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
          color: 'var(--ib-sienna, #A8481A)', fontFamily: 'inherit', fontWeight: 800,
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
            background: 'linear-gradient(145deg, var(--ib-peach-1, #F7E3CC), var(--ib-peach-2, #F2D3B3))', color: 'var(--ib-sienna, #A8481A)',
          }}>
            {icon}
          </span>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--ib-rust, #7A3A18)', margin: 0 }}>{emptyText}</p>
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