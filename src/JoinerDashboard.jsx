import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Home, Calendar as CalendarIcon, ShoppingBag, Clock, Star, LogOut, User, Compass, MapIcon, ChevronLeft, ChevronRight, Menu, X, Rss, MapPin, ImageIcon, Users, Eye, Bell, Sparkles, MessagesSquare, Globe, Inbox } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import SidebarPinButton from './ui/SidebarPinButton';
import { useSidebarPin } from './ui/useSidebarPin';
import { withAvailableSlots, archivePastTours, notEndedFilter, groupTripDates, formatDateRange as formatTourDates } from './tourUtils';
import PriceTag from './ui/PriceTag';
import { verifyCheckout, cancelCheckout, verifyExclusivePayment } from './payments';
// Booking (details, companions, payment, waitlist) is one shared flow in JoinerTours.
import JoinerTours, { DetailedTourModal } from './JoinerTours';
import TourCalendar from './TourCalendar';
import MyBookings from './MyBookings';
import ExclusiveTour from './ExclusiveTour';
import Feed from './Feed';
import Reviews from './Reviews';
import ProfileSettings from './Profilesettings.jsx';
import logoIcon from './assets/logo.png';
import { JoinerTracking } from './JoinerTracking';
import NotificationBell from './NotificationBell';
import FavoritesButton from './ui/FavoritesButton';
import Notification from './Notification';
import GroupChat from './GroupChat';
import AdminInbox from './AdminInbox';
import { useAdminInboxUnread } from './adminMessages';
import HelpWidget from './ui/HelpWidget';
import { useChatUnread, OPEN_CHAT } from './chatStore';
import { confirmDialog } from './ui/ConfirmDialog';
import PageHeader from './ui/PageHeader';
import { profileIsComplete } from './googleAuth';
import MenuEdgeTab from './ui/MenuEdgeTab';
import InstallAppCard from './ui/InstallAppCard';
import { readTab, saveTab, forgetTab } from './rememberTab';
import { useTabHistory } from './useTabHistory';
import { Skel } from './ui/Skeleton';
import { PulseStat, NextTripCard, TripReadinessCard, CalendarWidget, TrackingSnippet, MyRequestsCard, HomeReviews } from './HomeWidgets';
import { reportError } from './ui/toast';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg / card bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (inset panels / secondary bg)
// #FDF6EE  cream (page bg, same as the public Tours page)
// #3F5D62  slate teal (secondary contrast accent)
// ---------------------------------------------------------

const NAV_ITEMS = [
  { icon: <Home size={18} strokeWidth={2} />,        label: 'HomePage' },
  { icon: <Rss size={18} strokeWidth={2} />,         label: 'Feed' },
  { icon: <Compass size={18} strokeWidth={2} />,     label: 'Explore Tours' },
  { icon: <ShoppingBag size={18} strokeWidth={2} />, label: 'My Bookings' },
  { icon: <MessagesSquare size={18} strokeWidth={2} />, label: 'Messages' },
  { icon: <CalendarIcon size={18} strokeWidth={2} />,label: 'Calendar' },
  { icon: <Clock size={18} strokeWidth={2} />,       label: 'Tracking' },
  { icon: <MapIcon size={18} strokeWidth={2} />,     label: 'Exclusive Tours' },
  { icon: <Globe size={18} strokeWidth={2} />,       label: 'Request a Tour' },
  { icon: <Star size={18} strokeWidth={2} />,        label: 'Reviews' },
  { icon: <User size={18} strokeWidth={2} />,        label: 'Profile Settings' },
  { icon: <Bell size={18} strokeWidth={2} />,        label: 'Notification' },
];

// Title and one-line description shown at the top of each page.
const TAB_KEY = 'ibayo-joiner-tab';

const PAGE_INFO = {
  'HomePage':         { icon: Home,         title: 'Homepage',         subtitle: 'Your trips, new tours and reviews at a glance' },
  'Feed':             { icon: Rss,          title: 'Community Feed',   subtitle: 'Updates, announcements & newly posted tours' },
  'Explore Tours':    { icon: Compass,      title: 'Explore Tours',    subtitle: 'Find your next adventure and pick a date' },
  'My Bookings':      { icon: ShoppingBag,  title: 'My Bookings',      subtitle: 'Track your adventures and manage your reservations' },
  'Messages':         { icon: MessagesSquare, title: 'Messages',         subtitle: 'Chat with your tour group, and read messages from Bandang IBAYO' },
  'Calendar':         { icon: CalendarIcon, title: 'Calendar',         subtitle: 'See every open tour by date' },
  'Tracking':         { icon: Clock,        title: 'Tracking',         subtitle: "Follow your tour's live location on the day" },
  'Exclusive Tours':  { icon: MapIcon,      title: 'Exclusive Tours',  subtitle: 'Book a private group trip, just for your group' },
  'Request a Tour':   { icon: Globe,        title: 'Request a Tour',   subtitle: "Suggest a destination we don't offer yet" },
  'Reviews':          { icon: Star,         title: 'Tour Reviews',     subtitle: 'Share your experience & read what others say' },
  'Profile Settings': { icon: User,         title: 'Profile Settings', subtitle: 'Manage your account information and preferences' },
  'Notification':     { icon: Bell,         title: 'Notifications',    subtitle: 'Updates on your bookings, requests & account' },
};

const JoinerDashboard = () => {
  // A public tour page's "Book" button lands here as /dashboard?book=<tourId>.
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookTourId, setBookTourId] = useState(() => searchParams.get('book'));
  // Coming back from PayMongo: /dashboard?payment=success|cancelled&booking=<id>
  // (or ?balance=… after paying a downpayment's remaining balance).
  const [paymentReturn] = useState(() => {
    const kind = searchParams.has('payment') ? 'payment' : searchParams.has('balance') ? 'balance' : null;
    return kind ? { kind, result: searchParams.get(kind), bookingId: searchParams.get('booking') } : null;
  });
  // ...or /dashboard?exclusive=success|cancelled&request=<id> after an exclusive tour downpayment.
  const [exclusiveReturn] = useState(() => (searchParams.has('exclusive')
    ? { result: searchParams.get('exclusive'), requestId: searchParams.get('request') } : null));
  const [paymentNotice, setPaymentNotice] = useState(paymentReturn || exclusiveReturn ? { type: 'info', text: 'Checking your payment…' } : null);
  const [exclusiveKey, setExclusiveKey] = useState(0);
  const [exclusiveStart, setExclusiveStart] = useState(null); // { form, date } from the calendar
  const [myBookingsKey, setMyBookingsKey] = useState(0);
  const [activeTab, setActiveTab] = useState(() => (paymentReturn ? 'My Bookings' : exclusiveReturn ? 'Exclusive Tours' : bookTourId ? 'Explore Tours'
    : readTab(TAB_KEY, NAV_ITEMS.map((n) => n.label), 'HomePage')));
  // A refresh reopens the page you were on (see rememberTab.js).
  useEffect(() => { saveTab(TAB_KEY, activeTab); }, [activeTab]);
  // Browser Back goes to the previous dashboard page.
  useTabHistory(activeTab, setActiveTab, 'HomePage');
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Group chat: unread badge, and "open this tour's chat" from elsewhere (My Bookings).
  const chatUnread = useChatUnread();
  // Group Chat has two tabs: the tour group chats, and messages from the admin.
  const [chatView, setChatView] = useState('chats'); // 'chats' | 'messages'
  // Unread messages from the admin; re-checked on every page change.
  const [inboxUnread, setInboxUnread] = useAdminInboxUnread(`${activeTab}-${chatView}`);
  const readingMessages = activeTab === 'Messages' && chatView === 'messages';
  const clearInboxUnread = useCallback(() => setInboxUnread(0), [setInboxUnread]);
  const [chatTourId, setChatTourId] = useState(null);
  const tourScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [bookingsFilter, setBookingsFilter] = useState(null);
  // Booking to open straight away in My Bookings (from the Trip Readiness card).
  const [openBookingId, setOpenBookingId] = useState(null);
  const [calendarTarget, setCalendarTarget] = useState(null);
  const navigate = useNavigate();

  // ── USER PROFILE STATE ──
  const [userProfile, setUserProfile] = useState({
    name: 'Joiner',
    initial: 'J',
    avatarUrl: null,
  });

  // ── DYNAMIC DASHBOARD DATA ──
  const [loadingHome, setLoadingHome] = useState(true);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  // Finished tours the joiner hasn't reviewed yet (drives "Write a review").
  const [toReviewCount, setToReviewCount] = useState(0);
  const [nextTrip, setNextTrip] = useState(null);
  const [monthDots, setMonthDots] = useState([]);
  const [trackingStop, setTrackingStop] = useState(null);
  const [featuredTours, setFeaturedTours] = useState([]);
  const [selectedTour, setSelectedTour] = useState(null);

  // Drop ?book= / ?payment= from the URL so a refresh doesn't repeat them.
  useEffect(() => {
    if (['book', 'payment', 'balance', 'exclusive'].some((k) => searchParams.has(k))) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // Confirm (or release) the booking with PayMongo's answer, then show the result.
  useEffect(() => {
    if (!paymentReturn?.bookingId) return;
    let active = true;
    (async () => {
      const { bookingId, kind, result } = paymentReturn;
      let notice;
      if (result === 'cancelled') {
        if (kind === 'payment') {
          const { ok, data } = await cancelCheckout({ bookingId });
          // If they had actually paid before backing out, the booking is confirmed instead.
          notice = ok && ['confirmed', 'already', 'Complete'].includes(data?.status)
            ? { type: 'success', text: 'Payment received! Your booking is confirmed.' }
            : { type: 'info', text: 'Payment cancelled. Your held slots were released.' };
        } else {
          notice = { type: 'info', text: 'Balance payment cancelled. You can pay online anytime from My Bookings, or in person on the tour day.' };
        }
      } else {
        const { ok, data, error } = await verifyCheckout({ bookingId });
        const status = kind === 'balance' ? data?.balance?.status : data?.booking?.status;
        if (!ok) notice = { type: 'error', text: `We couldn't check your payment yet (${error}). It will update automatically once PayMongo confirms it.` };
        else if (status === 'unpaid') notice = { type: 'info', text: 'We haven\'t received your payment yet. If you paid, it will show here once PayMongo confirms it.' };
        else if (kind === 'balance') notice = { type: 'success', text: 'Balance paid! Your booking is now fully paid.' };
        else notice = { type: 'success', text: 'Payment received! Your booking is confirmed. 🎉' };
      }
      if (!active) return;
      setPaymentNotice(notice);
      setMyBookingsKey((k) => k + 1);
    })();
    return () => { active = false; };
  }, [paymentReturn]);

  // Exclusive tour downpayment or balance: check it with PayMongo, then show the result.
  useEffect(() => {
    if (!exclusiveReturn?.requestId) return;
    let active = true;
    (async () => {
      let notice;
      if (exclusiveReturn.result === 'cancelled') {
        notice = { type: 'info', text: 'Payment cancelled. You can pay anytime from your request under Exclusive Tours.' };
      } else {
        const { ok, data, error } = await verifyExclusivePayment({ requestId: exclusiveReturn.requestId });
        if (!ok) notice = { type: 'error', text: `We couldn't check your payment yet (${error}). It will update automatically once PayMongo confirms it.` };
        else if (data?.status === 'unpaid') notice = { type: 'info', text: 'We haven\'t received your payment yet. If you paid, it will show here once PayMongo confirms it.' };
        else if (data?.kind === 'exclusive_balance') notice = { type: 'success', text: 'Balance received! Your exclusive tour is fully paid. ✅' };
        else notice = { type: 'success', text: 'Downpayment received! Your exclusive tour is confirmed. 🎉' };
      }
      if (!active) return;
      setPaymentNotice(notice);
      setExclusiveKey((k) => k + 1);
    })();
    return () => { active = false; };
  }, [exclusiveReturn]);

  // Payment banners close by themselves after 1 minute (not while still checking).
  useEffect(() => {
    if (!paymentNotice || paymentNotice.text === 'Checking your payment…') return undefined;
    const timer = setTimeout(() => setPaymentNotice(null), 60 * 1000);
    return () => clearTimeout(timer);
  }, [paymentNotice]);

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

  const [sidebarPinned, toggleSidebarPin] = useSidebarPin();
  const sidebarExpanded = isMobile ? true : (sidebarPinned || sidebarHovered);

  // Mouse wheel over the tour row scrolls it sideways (until it reaches an
  // end, then the page scrolls as usual). Trackpads and touch already swipe.
  useEffect(() => {
    const row = tourScrollRef.current;
    if (!row) return undefined;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 0) return;
      const atStart = row.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = row.scrollLeft >= max - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    };
    // Show the side arrows only when there is more to see in that direction.
    const updateArrows = () => {
      const max = row.scrollWidth - row.clientWidth;
      setCanScrollLeft(row.scrollLeft > 4);
      setCanScrollRight(row.scrollLeft < max - 4);
    };
    updateArrows();
    row.addEventListener('wheel', onWheel, { passive: false });
    row.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      row.removeEventListener('wheel', onWheel);
      row.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [activeTab, featuredTours.length]);

  const scrollTours = (direction) => {
    const row = tourScrollRef.current;
    if (row) row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: 'smooth' });
  };

  // A tour picked from Favorites: open Explore Tours on that tour's booking window.
  const openFavoriteTour = (id) => {
    setMobileNavOpen(false);
    setActiveTab('Explore Tours');
    setBookTourId(String(id));
  };

  const handleNavClick = (label) => {
    setBookTourId(null);
    setBookingsFilter(null);
    setOpenBookingId(null);
    setCalendarTarget(null);
    setExclusiveStart(null);
    setActiveTab(label);
    if (isMobile) setMobileNavOpen(false);
  };

  useEffect(() => {
    const open = (e) => { setChatTourId(e.detail?.tourId ?? null); setChatView('chats'); handleNavClick('Messages'); };
    window.addEventListener(OPEN_CHAT, open);
    return () => window.removeEventListener(OPEN_CHAT, open);
  });

  // A notification about a request opens Exclusive Tours or Request a Tour, whichever it's on.
  const openRequestPage = async (requestId) => {
    let page = 'Exclusive Tours';
    if (requestId) {
      const { data } = await supabase.from('exclusive_requests').select('request_type').eq('id', requestId).maybeSingle();
      if (data?.request_type === 'request') page = 'Request a Tour';
    }
    handleNavClick(page);
  };

  const handleNotificationNavigate = (notification) => {
    switch (notification.type) {
      case 'exclusive_request':
      case 'exclusive_package':
        openRequestPage(notification.related_id);
        break;
      case 'booking':
      case 'payment':
      case 'cancellation':
        setBookingsFilter(null);
        handleNavClick('My Bookings');
        break;
      case 'tour':
        handleNavClick('Explore Tours');
        break;
      case 'tracking':
        handleNavClick('Tracking');
        break;
      case 'review':
        handleNavClick('Reviews');
        break;
      case 'feed':
        handleNavClick('Feed');
        break;
      case 'chat':
        setChatView('chats');
        handleNavClick('Messages');
        break;
      case 'account':
        handleNavClick('Profile Settings');
        break;
      default:
        handleNavClick('HomePage');
    }
  };

  const handleLogout = async () => {
    const ok = await confirmDialog({
      title: 'Sign out?',
      message: "You'll need to log in again to see your bookings and account.",
      confirmLabel: 'Sign Out',
      cancelLabel: 'Stay Signed In',
    });
    if (!ok) return;
    // Leave the dashboard first, so signing out lands on the landing page, not the login page.
    forgetTab(TAB_KEY);
    navigate('/', { replace: true });
    await supabase.auth.signOut();
  };

  const formatDateRange = formatTourDates;

  // ── FETCH CURRENT USER PROFILE FOR CHIP ──
  const fetchUserProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, username, avatar_url, phone_number, province, address')
        .eq('id', user.id)
        .maybeSingle();

      // Signed up with Google but never finished the profile: finish it first.
      const viaGoogle = (user.identities || []).some((i) => i.provider === 'google') || user.app_metadata?.provider === 'google';
      if (viaGoogle && !profileIsComplete(profile)) {
        navigate('/complete-profile', { replace: true });
        return;
      }

      if (profile) {
        const full = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
        const display = full || profile.username || 'Joiner';
        const init = (profile.first_name?.[0] || profile.username?.[0] || 'J').toUpperCase();

        setUserProfile({
          name: display,
          initial: init,
          avatarUrl: profile.avatar_url || null,
        });
      }
    } catch (err) {
      reportError("Couldn't load user profile", err);
    }
  }, [navigate]);

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
          const finishedTourIds = new Set();
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
            // A tour is completed only once it has ended (its last day is past),
            // like the Completed tab in My Bookings. ("Completed" on a booking
            // just means it's paid.)
            const endStr = tour?.end_date || tourDateStr;
            const paid = booking.payment_status === 'Complete' || booking.booking_status === 'Completed';

            if (endStr && new Date(`${endStr}T00:00:00`) < today) {
              if (paid) { completed++; finishedTourIds.add(String(booking.tour_id)); }
            } else if (tourDateStr) {
              const tourDate = new Date(`${tourDateStr}T00:00:00`);
              if (tourDate >= today || new Date(`${endStr}T00:00:00`) >= today) {
                upcoming++;
                if (tour && tourDate.getMonth() === today.getMonth() && tourDate.getFullYear() === today.getFullYear()) {
                  dots.push(tourDate.getDate());
                }
                if (!soonest || tourDate < new Date(soonest.tours.start_date)) {
                  soonest = booking;
                }
              }
            } else {
              upcoming++;
            }
          });

          setUpcomingCount(upcoming);
          setCompletedCount(completed);
          if (finishedTourIds.size) {
            const { data: myReviews } = await supabase.from('reviews').select('tour_id').eq('user_id', user.id);
            const reviewed = new Set((myReviews || []).map((r) => String(r.tour_id)));
            setToReviewCount([...finishedTourIds].filter((id) => !reviewed.has(id)).length);
          } else {
            setToReviewCount(0);
          }
          setMonthDots(dots);
          setNextTrip(soonest);

          if (soonest?.tour_id) {
            const { data: stops } = await supabase
              .from('tour_meetups')
              .select('*')
              .eq('tour_id', soonest.tour_id)
              .order('created_at', { ascending: true });

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

      await archivePastTours();
      const { data: toursData } = await supabase
        .from('tours')
        .select('*')
        .eq('is_archived', false)
        .or(notEndedFilter())
        .order('start_date', { ascending: true })
        .limit(12);

      // One card per trip; its other dates are picked in the booking window.
      const updatedTours = groupTripDates(await withAvailableSlots(toursData));

      setFeaturedTours(updatedTours);
    } catch (err) {
      reportError("Couldn't load your dashboard", err);
    } finally {
      setLoadingHome(false);
    }
  }, []);

  useEffect(() => {
    fetchUserProfile();

    const handleProfileUpdate = (event) => {
      const detail = event?.detail;

      // Update the header immediately from Profile Settings.
      // Then refetch from Supabase so refresh/navigation stays persistent.
      if (detail) {
        const full = `${detail.first_name || ''} ${detail.last_name || ''}`.trim();
        setUserProfile(prev => ({
          ...prev,
          name: full || prev.name,
          initial: (detail.first_name?.[0] || prev.initial || 'J').toUpperCase(),
          avatarUrl: detail.avatar_url || null,
        }));
      }

      fetchUserProfile();
    };
    window.addEventListener('user_profile_updated', handleProfileUpdate);
    return () => window.removeEventListener('user_profile_updated', handleProfileUpdate);
  }, [fetchUserProfile]);

  useEffect(() => {
    if (activeTab === 'HomePage') fetchDashboardData();
  }, [activeTab, fetchDashboardData]);

  const nextTripDay = nextTrip && new Date(nextTrip.tours?.start_date).getMonth() === new Date().getMonth()
    ? new Date(nextTrip.tours?.start_date).getDate()
    : null;

  return (
    <div className="joiner-dashboard-container" style={{
      display: 'flex', height: '100dvh',
      fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
      background: '#FDF6EE',
      color: '#1A0A00',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .tour-packages-scroll{scrollbar-width:none;-ms-overflow-style:none;}
        .tour-packages-scroll::-webkit-scrollbar{display:none;}
      `}</style>

      {/* MOBILE OVERLAY */}
      <div
        className={`sidebar-overlay ${mobileNavOpen ? 'is-open' : ''}`}
        onClick={() => setMobileNavOpen(false)}
      />

      {/* ── SIDEBAR ── */}
      {/* edge tab: opens the menu from anywhere on the page */}
      {isMobile && !mobileNavOpen && <MenuEdgeTab onOpen={() => setMobileNavOpen(true)} />}

      {/* Help: FAQ and user guide (not on Group Chat, where it would cover the send button) */}
      {activeTab !== 'Messages' && !mobileNavOpen && <HelpWidget zIndex={95} />}

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
        {!isMobile && sidebarExpanded && <SidebarPinButton pinned={sidebarPinned} onToggle={toggleSidebarPin} />}
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
            onClick={() => handleNavClick('HomePage')}
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
              badge={label === 'Messages' ? chatUnread + (readingMessages ? 0 : inboxUnread) : 0}
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
                Sign Out
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* ── MAIN WORKSPACE ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* header */}

        {/* content */}
        <div className="dashboard-content" style={{ flex: 1, overflowY: 'auto', padding: '2.5rem', background: '#FDF6EE' }}>
          {/* Top row: page title on the left, bell and account on the right (scrolls with the page) */}
          <div className="dashboard-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, position: 'relative', zIndex: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <button
                className="mobile-menu-btn"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>
              {PAGE_INFO[activeTab] && <PageHeader {...PAGE_INFO[activeTab]} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <FavoritesButton onOpenTour={openFavoriteTour} />
              <NotificationBell onNotificationClick={handleNotificationNavigate} clearPaymentNotices />

              {/* dynamic user chip matching the Reviews identity */}
              <div
                onClick={() => handleNavClick('Profile Settings')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: '#F2E4D0',
                  border: '1px solid rgba(180,81,30,0.18)',
                  borderRadius: 14, padding: '8px 14px',
                  cursor: 'pointer'
                }}>
                <div className="dashboard-user-chip-text" style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1A0A00', margin: 0, lineHeight: 1 }}>
                    {userProfile.name}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '3px 0 0', lineHeight: 1 }}>
                    Ready for Adventure
                  </p>
                </div>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: '#1A0A00',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#E8A265', fontWeight: 900, fontSize: 15,
                  boxShadow: '0 4px 12px rgba(26,10,0,0.22)',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  {userProfile.avatarUrl ? (
                    <img src={userProfile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    userProfile.initial
                  )}
                </div>
              </div>
            </div>
          </div>


          {paymentNotice && (
            <div role="status" style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
              marginBottom: 20, padding: '14px 18px', borderRadius: 16, fontSize: 13, fontWeight: 700,
              background: paymentNotice.type === 'success' ? 'rgba(180,81,30,0.12)' : paymentNotice.type === 'error' ? 'rgba(140,47,28,0.12)' : '#FDF6EE',
              border: `1px solid ${paymentNotice.type === 'error' ? 'rgba(140,47,28,0.3)' : 'rgba(180,81,30,0.25)'}`,
              color: paymentNotice.type === 'error' ? '#8C2F1C' : '#1A0A00',
            }}>
              <span>{paymentNotice.text}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setPaymentNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', flexShrink: 0 }}>
                <X size={16} />
              </button>
            </div>
          )}

          {activeTab === 'HomePage' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              <InstallAppCard />

              {/* hero banner */}
              <div style={{
                position: 'relative',
                background: '#1A0A00',
                borderRadius: 24,
                padding: '3.5rem',
                overflow: 'hidden',
                boxShadow: '0 16px 40px rgba(26,10,0,0.22)',
                borderBottom: '6px solid #B4511E',
              }} className="dashboard-hero-padding">
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  width: '40%', height: '100%',
                  background: 'radial-gradient(ellipse at top right, rgba(180,81,30,0.18) 0%, transparent 70%)',
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
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: '#B4511E', borderRadius: 999, padding: '4px 12px', marginBottom: 10, width: 'fit-content' }}>
                    <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#FDF6EE' }}>Your Budget Travel Partner</span>
                  </div>
                  <h2 style={{ fontWeight: 900, fontSize: '1.8rem', letterSpacing: '-0.02em', lineHeight: 1.1, color: '#FDF6EE', margin: '0 0 10px' }}>
                    Adventure Awaits with <span className="font-accent" style={{ color: '#E8A265' }}>Bandang IBAYO</span>
                  </h2>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, fontWeight: 500, color: 'rgba(232,210,190,0.85)', margin: '0 0 16px', maxWidth: 620 }}>
                    Our mission is to make everyone witness the beauty of the Philippines. Focusing exclusively on budget-friendly land tours and overland road trips, accommodating hassle-free road trip adventures completely by land tailored for every joiner.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setActiveTab('Exclusive Tours')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: '#E8A265', color: '#1A0A00', fontWeight: 900,
                        fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase',
                        border: 'none', cursor: 'pointer', borderRadius: 8, padding: '10px 18px',
                        fontFamily: 'inherit', transition: 'all 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FDF6EE'}
                      onMouseLeave={e => e.currentTarget.style.background = '#E8A265'}
                    >
                      Plan a Trip
                    </button>
                  </div>
                </div>
              </div>

              {/* TRIP PULSE */}
              <div style={{
                position: 'relative',
                background: '#1A0A00',
                borderRadius: 24,
                padding: isMobile ? '1.5rem 1.5rem' : '2rem 2.5rem',
                overflow: 'hidden',
                borderBottom: '4px solid #B4511E',
                boxShadow: '0 12px 32px rgba(26,10,0,0.18)',
              }}>
                <Sparkles size={160} style={{
                  position: 'absolute', right: -20, top: -30,
                  color: 'rgba(255,255,255,0.03)', transform: 'rotate(-8deg)',
                }} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
                  <PulseStat
                    icon={<Compass size={20} />}
                    label="Upcoming Trips"
                    value={loadingHome ? <Skel dark w={44} h={30} style={{ display: 'inline-block' }} /> : upcomingCount}
                    subcopy={upcomingCount > 0
                      ? "You've got something to look forward to"
                      : 'Your next stamp is one tap away'}
                    onClick={() => { setBookingsFilter('upcoming'); setActiveTab('My Bookings'); }}
                  />
                  <div style={isMobile ? { height: 1, background: 'rgba(255,255,255,0.08)', margin: '1rem 0' } : { width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 2.5rem' }} />
                  <PulseStat
                    icon={<Star size={20} />}
                    label="Completed Tours"
                    value={loadingHome ? <Skel dark w={44} h={30} style={{ display: 'inline-block' }} /> : completedCount}
                    subcopy={completedCount > 0
                      ? 'Adventures logged and loved'
                      : 'First stories start with first trips'}
                    onClick={() => { setBookingsFilter('completed'); setActiveTab('My Bookings'); }}
                  />
                </div>
              </div>

              {/* SPLIT GRID: tours on the left, a narrow rail (calendar, tracking, reviews) on the right.
                  Stacks into one column on tablets and phones. */}
              <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, alignItems: 'start' }}>

                {/* LEFT COL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                  {!loadingHome && nextTrip && (
                    <NextTripCard
                      trip={nextTrip}
                      onViewBookings={() => { setBookingsFilter('upcoming'); setActiveTab('My Bookings'); }}
                    />
                  )}
                  {!loadingHome && nextTrip && (
                    <TripReadinessCard trip={nextTrip} onClick={() => { setOpenBookingId(nextTrip.id); setMyBookingsKey((k) => k + 1); setActiveTab('My Bookings'); }} />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontWeight: 900, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1A0A00', margin: 0 }}>Latest Tour Packages</h3>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => setActiveTab('Explore Tours')}
                        style={{ background: 'none', border: 'none', padding: '4px 2px', fontFamily: 'inherit', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        See more
                      </button>
                    </div>
                  </div>

                  <div style={{ position: 'relative' }}>
                  <div
                    ref={tourScrollRef}
                    className="tour-packages-scroll"
                    style={{ display: 'flex', gap: 16, overflowX: 'auto', scrollSnapType: 'x proximity', padding: '10px 8px 14px', margin: '-10px -8px 0' }}
                  >
                    {loadingHome && featuredTours.length === 0 && [0, 1, 2, 3].map((i) => (
                      <div key={`skel-${i}`} aria-hidden="true" style={{ flex: '0 0 220px', background: '#FDF6EE', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(180,81,30,0.12)' }}>
                        <Skel h={115} r={0} />
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <Skel w="75%" h={13} /><Skel w="50%" h={10} /><Skel w="60%" h={10} /><Skel h={30} r={8} style={{ marginTop: 4 }} />
                        </div>
                      </div>
                    ))}
                    {featuredTours.map((tour) => {
                      const dates = tour.dates || [tour];
                      const isFull = dates.every((d) => d.available_slots <= 0);
                      return (
                        <div key={tour.id} className="grow-card" style={{ flex: '0 0 220px', scrollSnapAlign: 'start', background: '#FDF6EE', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 14px rgba(26,10,0,0.04)', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ height: 115, background: '#F2E4D0', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                            {tour.image_urls?.[0] ? <img src={tour.image_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)' }}><ImageIcon size={32} /></div>}
                            <div style={{ position: 'absolute', top: 10, left: 10 }}><span style={{ background: 'rgba(253,246,238,0.95)', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: '#1A0A00' }}>{tour.difficulty}</span></div>
                            <div style={{ position: 'absolute', top: 10, right: 10 }}><span style={{ background: isFull ? '#7A3A18' : '#B4511E', color: '#FDF6EE', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>{isFull ? 'Full' : `${tour.available_slots} Slots`}</span></div>
                          </div>
                          <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                                <h4 style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1 }}>{tour.title}</h4>
                                <PriceTag tour={tour} size={12} style={{ flexShrink: 0 }} showBadge={false} />
                              </div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, display: 'flex', alignItems: 'center', gap: 4, margin: '6px 0' }}><MapPin size={10} style={{ color: '#A8481A' }} /> {tour.destination}</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '11px', fontWeight: 700, color: '#7A3A18', textTransform: 'uppercase' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><CalendarIcon size={11} style={{ color: '#A8481A' }} /> {formatDateRange(tour.start_date, tour.duration)}</div>
                                {dates.length > 1 && <div style={{ color: '#A8481A', fontWeight: 800, paddingLeft: 16 }}>+{dates.length - 1} more date{dates.length > 2 ? 's' : ''}</div>}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Users size={11} style={{ color: '#A8481A' }} /> {tour.current_booked} / {tour.group_size} Booked</div>
                              </div>
                            </div>
                            <button
                              onClick={() => setSelectedTour(tour)}
                              disabled={isFull}
                              style={{
                                width: '100%', padding: '8px 0', border: 'none', borderRadius: 8,
                                cursor: isFull ? 'not-allowed' : 'pointer', fontWeight: 900, fontSize: 11,
                                letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', gap: 4,
                                background: isFull ? '#F2E4D0' : '#1A0A00',
                                color: isFull ? '#7A3A18' : '#FDF6EE',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={e => { if (!isFull) e.currentTarget.style.background = '#B4511E'; }}
                              onMouseLeave={e => { if (!isFull) e.currentTarget.style.background = '#1A0A00'; }}
                            >
                              <Eye size={11} /> {isFull ? 'Closed' : 'View Details'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {canScrollLeft && (
                    <button type="button" aria-label="Scroll tours left" className="tour-row-arrow no-touch-size" style={{ left: -14 }} onClick={() => scrollTours(-1)}>
                      <ChevronLeft size={20} />
                    </button>
                  )}
                  {canScrollRight && (
                    <button type="button" aria-label="Scroll tours right" className="tour-row-arrow no-touch-size" style={{ right: -14 }} onClick={() => scrollTours(1)}>
                      <ChevronRight size={20} />
                    </button>
                  )}
                  </div>

                  {/* Reviews: other joiners' recent reviews, plus a nudge to write one */}
                  <HomeReviews
                    loading={loadingHome}
                    toReviewCount={toReviewCount}
                    onOpen={() => setActiveTab('Reviews')}
                  />
                </div>

                {/* RIGHT RAIL */}
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
                  <MyRequestsCard onOpen={(type) => setActiveTab(type === 'request' ? 'Request a Tour' : 'Exclusive Tours')} />
                </div>
              </div>

            </div>

          ) : activeTab === 'Feed' ? (
            <Feed isAdmin={false} />
          ) : activeTab === 'Explore Tours' ? (
            <JoinerTours key={bookTourId || 'tours'} initialTourId={bookTourId} />
          ) : activeTab === 'My Bookings' ? (
            <MyBookings key={myBookingsKey} initialFilter={bookingsFilter} openBookingId={openBookingId} onExplore={() => handleNavClick('Explore Tours')} />
          ) : activeTab === 'Messages' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div role="tablist" aria-label="Group chat or messages" style={{ display: 'flex', gap: 6, background: '#F2E4D0', borderRadius: 14, padding: 4, width: 'fit-content', maxWidth: '100%' }}>
                {[['chats', 'Group Chats', chatUnread], ['messages', 'Messages from Bandang IBAYO', inboxUnread]].map(([view, label, count]) => (
                  <button key={view} type="button" role="tab" aria-selected={chatView === view} onClick={() => setChatView(view)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 10, padding: '8px 14px', cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase',
                    background: chatView === view ? '#1A0A00' : 'transparent', color: chatView === view ? '#FDF6EE' : '#7A3A18',
                  }}>
                    {view === 'chats' ? <MessagesSquare size={14} /> : <Inbox size={14} />} {label}
                    {count > 0 && !(view === 'messages' && chatView === 'messages') && (
                      <span aria-label={`${count} unread`} style={{ background: '#E8A265', color: '#1A0A00', borderRadius: 999, minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count > 99 ? '99+' : count}</span>
                    )}
                  </button>
                ))}
              </div>
              {chatView === 'messages'
                ? <AdminInbox onRead={clearInboxUnread} />
                : <GroupChat key={chatTourId || 'chats'} initialTourId={chatTourId} onExplore={() => handleNavClick('Explore Tours')} />}
            </div>
          ) : activeTab === 'Calendar' ? (
            <TourCalendar
              initialDate={calendarTarget}
              onPlanTrip={(form, date) => { setExclusiveStart({ form, date }); setExclusiveKey((k) => k + 1); setActiveTab(form === 'request' ? 'Request a Tour' : 'Exclusive Tours'); }}
            />
          ) : activeTab === 'Exclusive Tours' || activeTab === 'Request a Tour' ? (
            <ExclusiveTour
              key={`${activeTab}-${exclusiveKey}`}
              type={activeTab === 'Request a Tour' ? 'request' : 'exclusive'}
              start={exclusiveStart}
              onOpenBooking={(id) => { setBookingsFilter(null); setOpenBookingId(id); setMyBookingsKey((k) => k + 1); setActiveTab('My Bookings'); }}
            />
          ) : activeTab === 'Reviews' ? (
            <Reviews isAdmin={false} onExplore={() => handleNavClick('Explore Tours')} />
          ) : activeTab === 'Profile Settings' ? (
            <ProfileSettings />
          ) : activeTab === 'Tracking' ? (
            <JoinerTracking onExplore={() => handleNavClick('Explore Tours')} />
          ) : activeTab === 'Notification' ? (
            <Notification isAdmin={false} onNavigate={handleNotificationNavigate} clearPaymentNotices />
          ) : (
            <div style={{
              height: '100%', minHeight: 400, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: '#FDF6EE', borderRadius: 24, border: '1px solid rgba(180,81,30,0.12)',
              boxShadow: '0 4px 24px rgba(26,10,0,0.06)', padding: '3rem', textAlign: 'center'
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: '#F2E4D0', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#A8481A', marginBottom: 20
              }}>
                <Compass size={36} />
              </div>
              <h3 style={{ fontWeight: 900, fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 8px' }}>
                {activeTab} Section
              </h3>
              <p style={{ fontSize: 13, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
                Coming soon — check back later.
              </p>
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
const NavItem = ({ icon, label, active, onClick, collapsed, badge = 0 }) => (
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
    <span style={{ color: active ? '#FDF6EE' : 'rgba(232,162,101,0.8)', flexShrink: 0, position: 'relative', display: 'flex' }}>
      {icon}
      {badge > 0 && collapsed && (
        <span aria-label={`${badge} unread`} style={{ position: 'absolute', top: -6, right: -8, background: '#E8A265', color: '#1A0A00', borderRadius: 999, minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', fontSize: 9.5, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </span>
    {!collapsed && (
      <span style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
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

export default JoinerDashboard;