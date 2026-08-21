import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  Loader2, Calendar, Users, CheckCircle2, Clock, XCircle, AlertCircle,
  MapPin, ChevronDown, Wallet, TrendingUp, TrendingDown, ClipboardList,
  Star, Printer, Download, Filter, Bell, Sparkles, PieChart, Repeat,
  Percent, ArrowRight, Trophy, ThumbsDown, X,
} from 'lucide-react';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// #8C2F1C  oxblood (reject / danger)
// ---------------------------------------------------------

const CHART_COLORS = {
  complete: '#C45C26',
  pending: '#E8A265',
  rejected: '#8C2F1C',
  cancelled: 'rgba(26,10,0,0.35)',
  full: '#1A0A00',
  down: '#C45C26',
  none: 'rgba(122,58,24,0.25)',
  new: '#C45C26',
  returning: '#1A0A00',
};

const peso = (n) => `₱${Math.round(n || 0).toLocaleString()}`;
const pct = (n) => `${Number.isFinite(n) ? Math.round(n) : 0}%`;

/* ─────────────────────────────────────────────
   DATE RANGE HELPERS
───────────────────────────────────────────── */
const RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const getRangeDates = (preset, customStart, customEnd) => {
  const now = new Date();
  let start;
  let end = endOfDay(now);

  switch (preset) {
    case 'today':
      start = startOfDay(now);
      break;
    case '7d':
      start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
      break;
    case '30d':
      start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
      start = new Date(2000, 0, 1);
      break;
    case 'custom':
      start = customStart ? startOfDay(new Date(customStart)) : new Date(now.getFullYear(), now.getMonth(), 1);
      end = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { start, end };
};

const formatRangeLabel = (start, end) => {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
};

/* Buckets bookings into day/week/month periods depending on range span,
   filling gaps so the trend chart reads as a continuous timeline. */
const bucketBookingsOverTime = (bookings, start, end) => {
  const dayMs = 86400000;
  const totalDays = Math.max(1, Math.round((end - start) / dayMs) + 1);
  const granularity = totalDays > 180 ? 'month' : totalDays > 31 ? 'week' : 'day';

  const keyFor = (date) => {
    if (granularity === 'month') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (granularity === 'week') {
      const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
      return weekStart.toISOString().slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
  };
  const labelFor = (key) => {
    if (granularity === 'month') {
      const [y, m] = key.split('-');
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    return new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // seed every period in range so the chart has no gaps
  const buckets = new Map();
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 400) {
    buckets.set(keyFor(cursor), 0);
    if (granularity === 'month') cursor.setMonth(cursor.getMonth() + 1);
    else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setDate(cursor.getDate() + 1);
    guard++;
  }

  bookings.forEach((b) => {
    const key = keyFor(new Date(b.created_at));
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  });

  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] > b[0] ? 1 : -1))
    .map(([key, value]) => ({ key, label: labelFor(key), value }));
};

const getDerivedStatus = (b) => (
  (b.payment_status === 'Pending' || b.payment_status === 'Verification Pending') ? 'Pending' :
  b.payment_status === 'Rejected' ? 'Rejected' :
  b.booking_status === 'Cancelled' ? 'Cancelled' :
  b.payment_status === 'Complete' ? 'Complete' : 'Pending'
);

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const displayJoiner = (profile, fallback) => {
  if (!profile) return fallback || 'Unknown';
  const combo = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  return combo || profile.username || fallback || 'Unknown';
};

/* Builds a CSV string from the filtered bookings and triggers a download. */
const exportBookingsToCSV = (bookings) => {
  const headers = ['Booking No.', 'Joiner', 'Tour', 'Destination', 'Pax', 'Total Price', 'Payment Method', 'Status', 'Date'];
  const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const rows = bookings.map((b) => [
    b.booking_number || '',
    b.full_name || '',
    b.tours?.title || '',
    b.tours?.destination || '',
    b.slots_booked || 0,
    b.total_price || 0,
    b.payment_method || '',
    getDerivedStatus(b),
    new Date(b.created_at).toLocaleDateString('en-US'),
  ].map(escape).join(','));
  const csv = [headers.map(escape).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bandang-ibayo-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/* ─────────────────────────────────────────────
   REPORTS  (Business Reporting Dashboard)
───────────────────────────────────────────── */
const Reports = () => {
  const [allBookings, setAllBookings] = useState([]);
  const [tours, setTours] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [fetchErrors, setFetchErrors] = useState([]);
  const [liveNotice, setLiveNotice] = useState('');
  const noticeTimer = useRef(null);
  const firstLoad = useRef(true);

  const [preset, setPreset] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // ── advanced filters ──
  const [filterTour, setFilterTour] = useState('All Tours');
  const [filterMethod, setFilterMethod] = useState('All Methods');
  const [filterStatus, setFilterStatus] = useState('All Status');
  const [filterDestination, setFilterDestination] = useState('All Destinations');

  // ── profit assumption (no itemized cost data exists yet, so this is an editable estimate) ──
  const [costPct, setCostPct] = useState(60);

  const tableRef = useRef(null);

  const fetchAll = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    // NOTE: bookings uses `select('*, tours(...))')` rather than an explicit column
    // list — if a specific column doesn't exist yet on the live table, PostgREST
    // rejects the whole request and we'd otherwise silently show "0 bookings".
    const [bookingsRes, toursRes, profilesRes, reviewsRes] = await Promise.all([
      supabase.from('bookings')
        .select('*, tours ( id, title, destination, price, group_size, is_archived )')
        .order('created_at', { ascending: true }),
      supabase.from('tours').select('id, title, destination, price, group_size, is_archived, start_date'),
      supabase.from('profiles').select('id, first_name, last_name, username, address, created_at').neq('role', 'admin'),
      supabase.from('reviews').select('tour_id, rating'),
    ]);

    const errors = [];
    if (bookingsRes.error) { console.error('Error fetching bookings for reports:', bookingsRes.error.message); errors.push(`Bookings: ${bookingsRes.error.message}`); }
    if (toursRes.error) { console.error('Error fetching tours for reports:', toursRes.error.message); errors.push(`Tours: ${toursRes.error.message}`); }
    if (profilesRes.error) { console.error('Error fetching profiles for reports:', profilesRes.error.message); errors.push(`Profiles: ${profilesRes.error.message}`); }
    if (reviewsRes.error) { console.error('Error fetching reviews for reports:', reviewsRes.error.message); errors.push(`Reviews: ${reviewsRes.error.message}`); }
    setFetchErrors(errors);

    setAllBookings(bookingsRes.data || []);
    setTours(toursRes.data || []);
    setProfiles(profilesRes.data || []);
    setReviews(reviewsRes.data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(false); }, [fetchAll]);

  // ── real-time: refresh silently + surface a small "what changed" toast ──
  useEffect(() => {
    const flash = (msg) => {
      setLiveNotice(msg);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setLiveNotice(''), 5000);
    };
    const channel = supabase
      .channel('admin-reports-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, () => {
        if (!firstLoad.current) flash('New booking received');
        fetchAll(true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, (payload) => {
        if (!firstLoad.current && payload.new?.payment_status === 'Complete') flash('Payment verified');
        fetchAll(true);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'bookings' }, () => fetchAll(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tours' }, () => fetchAll(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => fetchAll(true))
      .subscribe();
    firstLoad.current = false;
    return () => { supabase.removeChannel(channel); clearTimeout(noticeTimer.current); };
  }, [fetchAll]);

  const { start, end } = useMemo(
    () => getRangeDates(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  // ── bookings within the selected date range ──
  const inRangeBookings = useMemo(() => {
    return allBookings.filter((b) => {
      const created = new Date(b.created_at);
      return created >= start && created <= end;
    });
  }, [allBookings, start, end]);

  // ── advanced-filter option lists ──
  const tourOptions = useMemo(() => (
    Array.from(new Set(inRangeBookings.map((b) => b.tours?.title).filter(Boolean))).sort()
  ), [inRangeBookings]);
  const destinationOptions = useMemo(() => (
    Array.from(new Set(inRangeBookings.map((b) => b.tours?.destination).filter(Boolean))).sort()
  ), [inRangeBookings]);

  // ── final scoped bookings used across every metric below ──
  const bookings = useMemo(() => inRangeBookings.filter((b) => {
    if (filterTour !== 'All Tours' && b.tours?.title !== filterTour) return false;
    if (filterMethod !== 'All Methods' && b.payment_method !== filterMethod) return false;
    if (filterStatus !== 'All Status' && getDerivedStatus(b) !== filterStatus) return false;
    if (filterDestination !== 'All Destinations' && b.tours?.destination !== filterDestination) return false;
    return true;
  }), [inRangeBookings, filterTour, filterMethod, filterStatus, filterDestination]);

  const filtersActive = filterTour !== 'All Tours' || filterMethod !== 'All Methods' || filterStatus !== 'All Status' || filterDestination !== 'All Destinations';

  const resetAdvancedFilters = () => {
    setFilterTour('All Tours'); setFilterMethod('All Methods');
    setFilterStatus('All Status'); setFilterDestination('All Destinations');
  };

  const scrollToTable = () => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ── core stats ──
  const stats = useMemo(() => {
    const total = bookings.length;
    const totalPax = bookings.reduce((sum, b) => sum + (b.slots_booked || 0), 0);
    const complete = bookings.filter((b) => getDerivedStatus(b) === 'Complete').length;
    const pending = bookings.filter((b) => getDerivedStatus(b) === 'Pending').length;
    const rejected = bookings.filter((b) => getDerivedStatus(b) === 'Rejected').length;
    const cancelled = bookings.filter((b) => getDerivedStatus(b) === 'Cancelled').length;
    const avgPartySize = total ? (totalPax / total).toFixed(1) : '0';
    const conversionRate = total ? Math.round((complete / total) * 100) : 0;
    const cancellationRate = total ? Math.round(((cancelled + rejected) / total) * 100) : 0;
    const revenue = bookings.filter((b) => getDerivedStatus(b) === 'Complete').reduce((s, b) => s + (b.total_price || 0), 0);
    const avgBookingValue = complete ? revenue / complete : 0;
    return { total, totalPax, complete, pending, rejected, cancelled, avgPartySize, conversionRate, cancellationRate, revenue, avgBookingValue };
  }, [bookings]);

  const estimatedProfit = stats.revenue * (1 - costPct / 100);

  // ── outstanding balance (downpayment bookings not yet fully settled) ──
  const outstandingBalance = useMemo(() => (
    bookings
      .filter((b) => getDerivedStatus(b) === 'Complete' && b.payment_method === 'Downpayment' && !b.balance_settled)
      .reduce((sum, b) => sum + Math.max(0, (b.total_price || 0) - (b.amount_paid || 0)), 0)
  ), [bookings]);

  // ── revenue this month vs last month (fixed calendar comparison, independent of the range picker) ──
  const monthlyComparison = useMemo(() => {
    const now = new Date();
    const thisKey = monthKey(now);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastKey = monthKey(lastMonthDate);

    const inMonth = (b, key) => monthKey(new Date(b.created_at)) === key;
    const thisMonthBookings = allBookings.filter((b) => inMonth(b, thisKey));
    const lastMonthBookings = allBookings.filter((b) => inMonth(b, lastKey));

    const revOf = (arr) => arr.filter((b) => getDerivedStatus(b) === 'Complete').reduce((s, b) => s + (b.total_price || 0), 0);
    const paxOf = (arr) => arr.reduce((s, b) => s + (b.slots_booked || 0), 0);
    const cancelOf = (arr) => arr.filter((b) => ['Cancelled', 'Rejected'].includes(getDerivedStatus(b))).length;

    const change = (curr, prev) => (prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100));

    return {
      thisMonthRevenue: revOf(thisMonthBookings),
      revenueChangePct: change(revOf(thisMonthBookings), revOf(lastMonthBookings)),
      bookingsChangePct: change(thisMonthBookings.length, lastMonthBookings.length),
      paxChangePct: change(paxOf(thisMonthBookings), paxOf(lastMonthBookings)),
      cancellationChangePct: change(cancelOf(thisMonthBookings), cancelOf(lastMonthBookings)),
      thisMonthBookingsCount: thisMonthBookings.length,
    };
  }, [allBookings]);

  // ── revenue drop check for notifications (range revenue vs the equal-length prior period) ──
  const revenueTrendVsPriorPeriod = useMemo(() => {
    const spanMs = end - start;
    const priorStart = new Date(start.getTime() - spanMs - 1);
    const priorEnd = new Date(start.getTime() - 1);
    const priorBookings = allBookings.filter((b) => {
      const c = new Date(b.created_at);
      return c >= priorStart && c <= priorEnd;
    });
    const priorRevenue = priorBookings.filter((b) => getDerivedStatus(b) === 'Complete').reduce((s, b) => s + (b.total_price || 0), 0);
    if (priorRevenue === 0) return null;
    return Math.round(((stats.revenue - priorRevenue) / priorRevenue) * 100);
  }, [allBookings, start, end, stats.revenue]);

  // ── trend chart data ──
  const trendData = useMemo(() => bucketBookingsOverTime(bookings, start, end), [bookings, start, end]);

  // ── status breakdown (donut) ──
  const statusSegments = useMemo(() => ([
    { key: 'Complete', label: 'Complete', value: stats.complete, color: CHART_COLORS.complete },
    { key: 'Pending', label: 'Pending', value: stats.pending, color: CHART_COLORS.pending },
    { key: 'Rejected', label: 'Rejected', value: stats.rejected, color: CHART_COLORS.rejected },
    { key: 'Cancelled', label: 'Cancelled', value: stats.cancelled, color: CHART_COLORS.cancelled },
  ].filter((s) => s.value > 0)), [stats]);

  // ── payment method breakdown (donut + %) ──
  const methodSegments = useMemo(() => {
    const full = bookings.filter((b) => b.payment_method === 'Full Payment').length;
    const down = bookings.filter((b) => b.payment_method === 'Downpayment').length;
    const none = bookings.length - full - down;
    return [
      { key: 'Full Payment', label: 'Full Payment', value: full, color: CHART_COLORS.full },
      { key: 'Downpayment', label: 'Downpayment', value: down, color: CHART_COLORS.down },
      { key: 'Not Yet Paid', label: 'Not Yet Paid', value: none, color: CHART_COLORS.none },
    ].filter((s) => s.value > 0);
  }, [bookings]);

  // ── payment analytics: revenue split by method + verification time + failed payments ──
  const paymentAnalytics = useMemo(() => {
    const completeBookings = bookings.filter((b) => getDerivedStatus(b) === 'Complete');
    const fullRevenue = completeBookings.filter((b) => b.payment_method === 'Full Payment').reduce((s, b) => s + (b.total_price || 0), 0);
    const downRevenue = completeBookings.filter((b) => b.payment_method === 'Downpayment').reduce((s, b) => s + (b.amount_paid || 0), 0);

    const verificationTimes = completeBookings
      .map((b) => new Date(b.updated_at) - new Date(b.created_at))
      .filter((ms) => ms > 0);
    const avgVerificationMs = verificationTimes.length
      ? verificationTimes.reduce((a, b) => a + b, 0) / verificationTimes.length
      : null;

    return {
      fullRevenue, downRevenue,
      avgVerificationMs,
      failedRejected: bookings.filter((b) => getDerivedStatus(b) === 'Rejected').length,
      failedPending: bookings.filter((b) => getDerivedStatus(b) === 'Pending').length,
    };
  }, [bookings]);

  const formatDuration = (ms) => {
    if (ms == null) return 'No data yet';
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.round((ms % 3600000) / 60000);
    if (hrs === 0) return `${mins} min${mins !== 1 ? 's' : ''}`;
    return `${hrs} hr${hrs !== 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''}`;
  };

  // ── bookings by tour (bar, clickable to drill down) ──
  const tourBreakdown = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      const title = b.tours?.title || 'Unknown Tour';
      map.set(title, (map.get(title) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [bookings]);

  // ── tour performance table (bookings, revenue, pax, completion %, rating) ──
  const avgRatingByTour = useMemo(() => {
    const map = new Map();
    reviews.forEach((r) => {
      if (!r.tour_id) return;
      const arr = map.get(r.tour_id) || [];
      arr.push(r.rating);
      map.set(r.tour_id, arr);
    });
    const out = new Map();
    map.forEach((arr, tourId) => out.set(tourId, arr.reduce((a, b) => a + b, 0) / arr.length));
    return out;
  }, [reviews]);

  const tourPerformance = useMemo(() => {
    const map = new Map();
    bookings.forEach((b) => {
      const tourId = b.tour_id;
      const title = b.tours?.title || 'Unknown Tour';
      if (!map.has(tourId)) {
        map.set(tourId, { tourId, title, bookingsCount: 0, revenue: 0, pax: 0, completeCount: 0 });
      }
      const entry = map.get(tourId);
      entry.bookingsCount += 1;
      entry.pax += b.slots_booked || 0;
      if (getDerivedStatus(b) === 'Complete') {
        entry.completeCount += 1;
        entry.revenue += b.total_price || 0;
      }
    });
    return Array.from(map.values())
      .map((t) => ({
        ...t,
        completionPct: t.bookingsCount ? Math.round((t.completeCount / t.bookingsCount) * 100) : 0,
        rating: avgRatingByTour.get(t.tourId) || null,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [bookings, avgRatingByTour]);

  const bestTour = tourPerformance[0] || null;
  const worstTour = tourPerformance.length ? tourPerformance[tourPerformance.length - 1] : null;

  // ── tour occupancy (current-state metric: active tours vs all-time confirmed pax, independent of date filter) ──
  const occupancy = useMemo(() => {
    const activeTours = tours.filter((t) => !t.is_archived);
    return activeTours.map((t) => {
      const booked = allBookings
        .filter((b) => b.tour_id === t.id && !['Cancelled', 'Rejected'].includes(getDerivedStatus(b)))
        .reduce((s, b) => s + (b.slots_booked || 0), 0);
      const capacity = t.group_size || 1;
      return { title: t.title, capacity, booked, pctFull: Math.min(100, Math.round((booked / capacity) * 100)) };
    }).sort((a, b) => b.pctFull - a.pctFull);
  }, [tours, allBookings]);

  const nearlyFullTours = useMemo(() => occupancy.filter((o) => o.pctFull >= 85 && o.pctFull < 100), [occupancy]);
  const soldOutTours = useMemo(() => occupancy.filter((o) => o.pctFull >= 100), [occupancy]);

  // ── seasonal trends: all-time bookings grouped by calendar month, regardless of the range filter above ──
  const seasonalTrends = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const totals = new Array(12).fill(0);
    allBookings.forEach((b) => { totals[new Date(b.created_at).getMonth()] += 1; });
    const data = monthNames.map((label, i) => ({ label, value: totals[i], key: String(i) }));
    const max = Math.max(...totals);
    const min = Math.min(...totals);
    const peak = data.filter((d) => d.value === max && max > 0).map((d) => d.label);
    const low = data.filter((d) => d.value === min).map((d) => d.label);
    return { data, peak, low };
  }, [allBookings]);

  // ── booking funnel (based on data actually tracked — no visitor/page-view analytics exist yet) ──
  const funnel = useMemo(() => {
    const created = bookings.length;
    const paymentSubmitted = bookings.filter((b) => b.payment_method).length;
    const verified = bookings.filter((b) => getDerivedStatus(b) === 'Complete').length;
    const completed = bookings.filter((b) => b.booking_status === 'Completed').length;
    return [
      { label: 'Bookings Created', value: created },
      { label: 'Payment Submitted', value: paymentSubmitted },
      { label: 'Payment Verified', value: verified },
      { label: 'Tour Completed', value: completed },
    ];
  }, [bookings]);

  // ── cancellation analytics (grouped by joiner-supplied reason text) ──
  const cancellationReasons = useMemo(() => {
    const cancelled = bookings.filter((b) => b.booking_status === 'Cancelled' && b.cancellation_reason);
    const map = new Map();
    cancelled.forEach((b) => {
      const reason = b.cancellation_reason.trim();
      map.set(reason, (map.get(reason) || 0) + 1);
    });
    const sorted = Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 6);
    const otherCount = sorted.slice(6).reduce((s, r) => s + r.value, 0);
    if (otherCount > 0) top.push({ label: 'Other', value: otherCount });
    return { total: cancelled.length, breakdown: top };
  }, [bookings]);

  // ── customer analytics: new vs returning, top customers, locations ──
  const customerAnalytics = useMemo(() => {
    const bookingsByUser = new Map();
    allBookings.forEach((b) => {
      if (!b.user_id) return;
      const arr = bookingsByUser.get(b.user_id) || [];
      arr.push(b);
      bookingsByUser.set(b.user_id, arr);
    });

    const activeUserIds = new Set(bookings.map((b) => b.user_id).filter(Boolean));
    let newCount = 0, returningCount = 0;
    activeUserIds.forEach((uid) => {
      const total = (bookingsByUser.get(uid) || []).length;
      if (total > 1) returningCount += 1; else newCount += 1;
    });

    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const spendByUser = new Map();
    bookings.forEach((b) => {
      if (!b.user_id || getDerivedStatus(b) !== 'Complete') return;
      const entry = spendByUser.get(b.user_id) || { spend: 0, tours: 0 };
      entry.spend += b.total_price || 0;
      entry.tours += 1;
      spendByUser.set(b.user_id, entry);
    });
    const topCustomers = Array.from(spendByUser.entries())
      .map(([uid, v]) => ({ name: displayJoiner(profileMap.get(uid), 'Unknown Joiner'), ...v }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    const locationMap = new Map();
    activeUserIds.forEach((uid) => {
      const addr = profileMap.get(uid)?.address?.trim();
      if (!addr) return;
      locationMap.set(addr, (locationMap.get(addr) || 0) + 1);
    });
    const totalWithAddress = Array.from(locationMap.values()).reduce((a, b) => a + b, 0);
    const topLocations = Array.from(locationMap.entries())
      .map(([label, value]) => ({ label, value, pct: totalWithAddress ? Math.round((value / totalWithAddress) * 100) : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return { newCount, returningCount, topCustomers, topLocations };
  }, [allBookings, bookings, profiles]);

  // ── simple forecast: weighted average of the last 3 calendar months, projected forward ──
  const forecast = useMemo(() => {
    const now = new Date();
    const months = [0, 1, 2].map((i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    const counts = months.map((k) => allBookings.filter((b) => monthKey(new Date(b.created_at)) === k).length);
    const revs = months.map((k) => allBookings
      .filter((b) => monthKey(new Date(b.created_at)) === k && getDerivedStatus(b) === 'Complete')
      .reduce((s, b) => s + (b.total_price || 0), 0));
    const avgBookings = counts.reduce((a, b) => a + b, 0) / counts.length;
    const avgRevenue = revs.reduce((a, b) => a + b, 0) / revs.length;
    const weighted = counts[0] * 0.5 + counts[1] * 0.3 + counts[2] * 0.2;
    return {
      expectedBookings: Math.round((weighted + avgBookings) / 2),
      expectedRevenue: Math.round(avgRevenue),
    };
  }, [allBookings]);

  // ── auto-generated insights ──
  const insights = useMemo(() => {
    const list = [];
    if (monthlyComparison.bookingsChangePct !== 0) {
      list.push(`Bookings ${monthlyComparison.bookingsChangePct >= 0 ? 'increased' : 'decreased'} ${Math.abs(monthlyComparison.bookingsChangePct)}% compared to last month.`);
    }
    if (bestTour) list.push(`${bestTour.title} generated the highest revenue this period (${peso(bestTour.revenue)}).`);
    if (stats.total > 0) list.push(`${pct((stats.pending / stats.total) * 100)} of bookings in range are still pending verification.`);
    const methodTop = methodSegments.length ? [...methodSegments].sort((a, b) => b.value - a.value)[0] : null;
    if (methodTop) list.push(`${methodTop.label} is currently the most used payment method.`);
    if (nearlyFullTours.length > 0) list.push(`${nearlyFullTours.map((t) => t.title).join(', ')} ${nearlyFullTours.length === 1 ? 'is' : 'are'} approaching full capacity.`);
    if (soldOutTours.length > 0) list.push(`${soldOutTours.map((t) => t.title).join(', ')} ${soldOutTours.length === 1 ? 'is' : 'are'} fully booked.`);
    return list.slice(0, 5);
  }, [monthlyComparison, bestTour, stats, methodSegments, nearlyFullTours, soldOutTours]);

  // ── notifications ──
  const notifications = useMemo(() => {
    const list = [];
    if (revenueTrendVsPriorPeriod !== null && revenueTrendVsPriorPeriod < 0) {
      list.push({ icon: <TrendingDown size={15} />, text: `Revenue dropped ${Math.abs(revenueTrendVsPriorPeriod)}% vs. the previous equivalent period.`, tone: 'warn' });
    }
    nearlyFullTours.forEach((t) => list.push({ icon: <AlertCircle size={15} />, text: `${t.title} is nearly full — ${t.booked}/${t.capacity} booked.`, tone: 'info' }));
    if (stats.pending > 0) list.push({ icon: <Clock size={15} />, text: `${stats.pending} payment${stats.pending !== 1 ? 's' : ''} awaiting verification.`, tone: 'action' });
    return list.slice(0, 6);
  }, [revenueTrendVsPriorPeriod, nearlyFullTours, stats]);

  // ── recent / filtered bookings table (most recent first, capped) ──
  const recentBookings = useMemo(() => (
    [...bookings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12)
  ), [bookings]);

  const handleDonutClick = (key) => {
    setFilterStatus((prev) => (prev === key ? 'All Status' : key));
    scrollToTable();
  };
  const handleTourBarClick = (title) => {
    setFilterTour((prev) => (prev === title ? 'All Tours' : title));
    scrollToTable();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── live toast ── */}
      {liveNotice && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 500,
          background: '#1A0A00', color: '#E8A265', padding: '10px 18px', borderRadius: 12,
          fontSize: 12, fontWeight: 800, boxShadow: '0 10px 28px rgba(26,10,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Sparkles size={14} /> {liveNotice}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', color: '#1A0A00', margin: '0 0 6px' }}>
            Business Reports
          </h2>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.7, margin: 0 }}>
            {formatRangeLabel(start, end)} · {loading ? 'Loading…' : `${stats.total} booking${stats.total !== 1 ? 's' : ''} in range`}
            {lastUpdated && !loading && (
              <span style={{ opacity: 0.85 }}> · Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </p>
        </div>

        {/* export controls */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <ExportButton icon={<Download size={13} />} label="Export CSV" onClick={() => exportBookingsToCSV(bookings)} />
          <ExportButton icon={<Printer size={13} />} label="Print / Save PDF" onClick={() => window.print()} />
        </div>
      </div>

      {/* ── Fetch Error Banner (surfaces silent Supabase query failures instead of just showing 0 data) ── */}
      {fetchErrors.length > 0 && (
        <div style={{
          background: 'rgba(140,47,28,0.08)', border: '1px solid rgba(140,47,28,0.25)',
          borderRadius: 16, padding: '1rem 1.25rem', display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <AlertCircle size={18} style={{ color: '#8C2F1C', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8C2F1C', margin: '0 0 6px' }}>
              Some data couldn't load
            </p>
            {fetchErrors.map((e, i) => (
              <p key={i} style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '2px 0', fontFamily: 'monospace' }}>{e}</p>
            ))}
            <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.7, margin: '6px 0 0' }}>
              The numbers below may be incomplete or zero until this is fixed.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '5rem 0', color: 'rgba(122,58,24,0.4)',
        }}>
          <Loader2 size={30} style={{ marginBottom: 10, animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
            Crunching Numbers…
          </p>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <>
          {/* ── Insights Panel ── */}
          {insights.length > 0 && (
            <div style={{
              background: '#1A0A00', borderRadius: 20, padding: '1.5rem 1.75rem',
              boxShadow: '0 4px 20px rgba(26,10,0,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Sparkles size={15} color="#E8A265" />
                <h4 style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#E8A265', margin: 0 }}>
                  Business Insights
                </h4>
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {insights.map((line, i) => (
                  <li key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(232,210,190,0.85)', lineHeight: 1.6 }}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Notifications Panel ── */}
          {notifications.length > 0 && (
            <div style={{
              background: '#FDF6EE', borderRadius: 20, padding: '1.25rem 1.5rem',
              border: '1px solid rgba(196,92,38,0.14)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
            }}>
              <SectionTitle icon={<Bell size={14} />}>Notifications</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notifications.map((n, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: n.tone === 'warn' ? 'rgba(140,47,28,0.07)' : n.tone === 'action' ? 'rgba(232,162,101,0.18)' : '#F2E4D0',
                    borderRadius: 12,
                  }}>
                    <span style={{ color: n.tone === 'warn' ? '#8C2F1C' : '#C45C26', flexShrink: 0 }}>{n.icon}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1A0A00' }}>{n.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Date Range Filter ── */}
          <div style={{
            background: '#FDF6EE', borderRadius: 20, padding: '14px 18px',
            border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 16px rgba(26,10,0,0.05)',
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          }}>
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                style={{
                  padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
                  border: 'none', fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                  background: preset === p.key ? '#1A0A00' : '#F2E4D0',
                  color: preset === p.key ? '#FDF6EE' : '#7A3A18',
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}

            {preset === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4 }}>
                <input
                  type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  style={{
                    background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)', borderRadius: 12,
                    padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#1A0A00',
                    fontFamily: 'inherit', outline: 'none',
                  }}
                />
                <span style={{ color: '#7A3A18', opacity: 0.65, fontSize: 11, fontWeight: 700 }}>to</span>
                <input
                  type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  style={{
                    background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)', borderRadius: 12,
                    padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#1A0A00',
                    fontFamily: 'inherit', outline: 'none',
                  }}
                />
              </div>
            )}
          </div>

          {/* ── Advanced Filters ── */}
          <div style={{
            background: '#FDF6EE', borderRadius: 20, padding: '14px 18px',
            border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 16px rgba(26,10,0,0.05)',
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, marginRight: 4 }}>
              <Filter size={13} /> Filters
            </span>
            <FilterSelect value={filterTour} onChange={setFilterTour} options={['All Tours', ...tourOptions]} />
            <FilterSelect value={filterDestination} onChange={setFilterDestination} options={['All Destinations', ...destinationOptions]} />
            <FilterSelect value={filterMethod} onChange={setFilterMethod} options={['All Methods', 'Full Payment', 'Downpayment']} />
            <FilterSelect value={filterStatus} onChange={setFilterStatus} options={['All Status', 'Complete', 'Pending', 'Rejected', 'Cancelled']} />
            {filtersActive && (
              <button
                onClick={resetAdvancedFilters}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer',
                  color: '#8C2F1C', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
                }}
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>

          {stats.total === 0 ? (
            <div style={{
              padding: '5rem 0', textAlign: 'center', background: '#FDF6EE',
              borderRadius: 20, border: '2px dashed rgba(196,92,38,0.2)',
            }}>
              <ClipboardList size={32} style={{ color: 'rgba(196,92,38,0.25)', marginBottom: 10 }} />
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.4)', margin: 0 }}>
                No bookings match the current filters.
              </p>
            </div>
          ) : (
            <>
              {/* ── KPI Cards ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                <StatCard title="Total Revenue" value={peso(stats.revenue)} icon={<Wallet size={17} />} iconColor="#C45C26" />
                <StatCard title="Estimated Profit" value={peso(estimatedProfit)} icon={<TrendingUp size={17} />} iconColor="#C45C26" />
                <StatCard title="Avg. Booking Value" value={peso(stats.avgBookingValue)} icon={<Percent size={17} />} iconColor="#7A3A18" />
                <StatCard title="Total Bookings" value={stats.total} icon={<ClipboardList size={17} />} iconColor="#C45C26" />
                <StatCard title="Confirmed" value={stats.complete} icon={<CheckCircle2 size={17} />} iconColor="#C45C26" />
                <StatCard title="Pending" value={stats.pending} icon={<Clock size={17} />} iconColor="#9A5B1E" />
                <StatCard title="Rejected / Cancelled" value={stats.rejected + stats.cancelled} icon={<XCircle size={17} />} iconColor="#8C2F1C" />
                <StatCard title="Cancellation Rate" value={pct(stats.cancellationRate)} icon={<TrendingDown size={17} />} iconColor="#8C2F1C" />
                <StatCard title="Total Pax" value={stats.totalPax} icon={<Users size={17} />} iconColor="#7A3A18" />
                <StatCard title="Conversion Rate" value={pct(stats.conversionRate)} icon={<TrendingUp size={17} />} iconColor="#C45C26" />
                <StatCard title="Outstanding Balance" value={peso(outstandingBalance)} icon={<Wallet size={17} />} iconColor="#9A5B1E" />
                <StatCard
                  title="Repeat Customers"
                  value={pct((customerAnalytics.newCount + customerAnalytics.returningCount) ? (customerAnalytics.returningCount / (customerAnalytics.newCount + customerAnalytics.returningCount)) * 100 : 0)}
                  icon={<Repeat size={17} />} iconColor="#7A3A18"
                />
              </div>

              {/* ── Revenue & Profit ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Wallet size={14} />}>Revenue &amp; Profit Analytics</SectionTitle>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
                  <MiniMetric
                    label="Revenue This Month"
                    value={peso(monthlyComparison.thisMonthRevenue)}
                    trend={monthlyComparison.revenueChangePct}
                    trendLabel="vs last month"
                  />
                  <MiniMetric label="Revenue in Selected Range" value={peso(stats.revenue)} />
                  <MiniMetric label="Average Booking Value" value={peso(stats.avgBookingValue)} />
                  <MiniMetric label="Outstanding Balance" value={peso(outstandingBalance)} tone="warn" />
                </div>

                <div style={{ borderTop: '1px solid rgba(196,92,38,0.12)', paddingTop: 16, marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.75, margin: '0 0 10px' }}>Revenue by Payment Method</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <MiniMetric label="Full Payment" value={peso(paymentAnalytics.fullRevenue)} compact />
                    <MiniMetric label="Downpayment Collected" value={peso(paymentAnalytics.downRevenue)} compact />
                    <MiniMetric label="Remaining Balance" value={peso(outstandingBalance)} compact tone="warn" />
                  </div>
                </div>

                <div style={{ background: '#F2E4D0', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
                        Estimated Profit
                      </p>
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#7A3A18', opacity: 0.75, margin: 0, maxWidth: 420 }}>
                        Itemized tour costs aren't tracked yet, so this uses an adjustable cost assumption applied to revenue.
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label style={{ fontSize: 10, fontWeight: 800, color: '#7A3A18' }}>Est. Cost %</label>
                      <input
                        type="number" min={0} max={95} value={costPct}
                        onChange={(e) => setCostPct(Math.min(95, Math.max(0, Number(e.target.value) || 0)))}
                        style={{ width: 60, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(196,92,38,0.25)', fontSize: 12, fontWeight: 700, textAlign: 'center' }}
                      />
                      <span style={{ fontSize: 22, fontWeight: 900, color: '#C45C26' }}>{peso(estimatedProfit)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Monthly Comparison ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<TrendingUp size={14} />}>Monthly Comparison (This Month vs. Last Month)</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  <MiniMetric label="Bookings" value={monthlyComparison.thisMonthBookingsCount} trend={monthlyComparison.bookingsChangePct} />
                  <MiniMetric label="Revenue" value={peso(monthlyComparison.thisMonthRevenue)} trend={monthlyComparison.revenueChangePct} />
                  <MiniMetric label="Pax" value="Change" trend={monthlyComparison.paxChangePct} showValueless />
                  <MiniMetric label="Cancellations" value="Change" trend={monthlyComparison.cancellationChangePct} showValueless invertTrendColor />
                </div>
              </div>

              {/* ── Forecast ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Sparkles size={14} />}>Forecast — Next Month</SectionTitle>
                <p style={{ fontSize: 10, fontWeight: 600, color: '#7A3A18', opacity: 0.78, margin: '-8px 0 16px' }}>
                  Based on a weighted average of the last three months.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <MiniMetric label="Expected Bookings" value={forecast.expectedBookings} />
                  <MiniMetric label="Expected Revenue" value={peso(forecast.expectedRevenue)} />
                </div>
              </div>

              {/* ── Trend Chart ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<TrendingUp size={14} />}>Bookings Over Time</SectionTitle>
                <BarChart data={trendData} color="#C45C26" height={190} />
              </div>

              {/* ── Donut charts row (clickable segments drill down into the table) ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
                <div style={{
                  background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                  border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
                }}>
                  <SectionTitle icon={<AlertCircle size={14} />}>Booking Status Breakdown</SectionTitle>
                  <DonutChart segments={statusSegments} onSegmentClick={handleDonutClick} activeKey={filterStatus !== 'All Status' ? filterStatus : null} />
                </div>
                <div style={{
                  background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                  border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
                }}>
                  <SectionTitle icon={<PieChart size={14} />}>Payment Method Split</SectionTitle>
                  <DonutChart segments={methodSegments} />
                </div>
              </div>

              {/* ── Booking Funnel ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<ArrowRight size={14} />}>Booking Funnel</SectionTitle>
                <p style={{ fontSize: 10, fontWeight: 600, color: '#7A3A18', opacity: 0.78, margin: '-8px 0 16px' }}>
                  Based on stages currently tracked in the system (visitor/page-view analytics aren't collected yet).
                </p>
                <FunnelChart steps={funnel} />
              </div>

              {/* ── Tour Performance ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Trophy size={14} />}>Tour Performance</SectionTitle>
                <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(196,92,38,0.14)' }}>
                        {['Tour', 'Bookings', 'Revenue', 'Pax', 'Completion', 'Rating'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.78 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tourPerformance.map((t) => (
                        <tr
                          key={t.tourId || t.title}
                          onClick={() => handleTourBarClick(t.title)}
                          style={{ borderBottom: '1px solid rgba(196,92,38,0.08)', cursor: 'pointer' }}
                        >
                          <td style={{ padding: '10px 16px', fontWeight: 800, color: '#1A0A00', fontSize: 12.5 }}>{t.title}</td>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: '#7A3A18', fontSize: 12.5 }}>{t.bookingsCount}</td>
                          <td style={{ padding: '10px 16px', fontWeight: 900, color: '#C45C26', fontSize: 12.5 }}>{peso(t.revenue)}</td>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: '#7A3A18', fontSize: 12.5 }}>{t.pax}</td>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: '#7A3A18', fontSize: 12.5 }}>{t.completionPct}%</td>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: '#7A3A18', fontSize: 12.5 }}>
                            {t.rating ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Star size={12} fill="#E8A265" color="#E8A265" /> {t.rating.toFixed(1)}</span> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  {bestTour && (
                    <HighlightCard icon={<Trophy size={16} />} label="Best Selling Tour" title={bestTour.title} sub={`${bestTour.bookingsCount} bookings · ${peso(bestTour.revenue)}`} tone="good" />
                  )}
                  {worstTour && worstTour.tourId !== bestTour?.tourId && (
                    <HighlightCard icon={<ThumbsDown size={16} />} label="Lowest Performing Tour" title={worstTour.title} sub={`${worstTour.bookingsCount} bookings · ${peso(worstTour.revenue)}`} tone="warn" />
                  )}
                </div>
              </div>

              {/* ── Tour Occupancy ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Users size={14} />}>Tour Occupancy (Active Tours)</SectionTitle>
                {occupancy.length === 0 ? <EmptyChartNotice /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {occupancy.map((o, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00' }}>{o.title}</span>
                          <span style={{ fontSize: 12, fontWeight: 900, color: o.pctFull >= 100 ? '#8C2F1C' : '#C45C26' }}>{o.booked}/{o.capacity} ({o.pctFull}%)</span>
                        </div>
                        <div style={{ background: '#F2E4D0', borderRadius: 999, height: 10, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 999, width: `${o.pctFull}%`, background: o.pctFull >= 100 ? '#8C2F1C' : o.pctFull >= 85 ? '#E8A265' : '#C45C26', transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Cancellation Analytics ── */}
              {cancellationReasons.total > 0 && (
                <div style={{
                  background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                  border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
                }}>
                  <SectionTitle icon={<XCircle size={14} />}>Cancellation Analytics</SectionTitle>
                  <HorizontalBarChart data={cancellationReasons.breakdown} color="#8C2F1C" />
                </div>
              )}

              {/* ── Customer Analytics ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Users size={14} />}>Customer Analytics</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.75, margin: '0 0 10px' }}>New vs. Returning Joiners</p>
                    <DonutChart segments={[
                      { label: 'New', value: customerAnalytics.newCount, color: CHART_COLORS.new },
                      { label: 'Returning', value: customerAnalytics.returningCount, color: CHART_COLORS.returning },
                    ].filter((s) => s.value > 0)} size={120} />
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.75, margin: '0 0 10px' }}>Top Customers</p>
                    {customerAnalytics.topCustomers.length === 0 ? <EmptyChartNotice /> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {customerAnalytics.topCustomers.map((c, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F2E4D0', borderRadius: 12, padding: '8px 14px' }}>
                            <div>
                              <p style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{c.name}</p>
                              <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.78, margin: '2px 0 0' }}>{c.tours} tour{c.tours !== 1 ? 's' : ''}</p>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 900, color: '#C45C26' }}>{peso(c.spend)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.75, margin: '0 0 10px' }}>Top Locations (from profile address)</p>
                    {customerAnalytics.topLocations.length === 0 ? <EmptyChartNotice /> : (
                      <HorizontalBarChart data={customerAnalytics.topLocations.map((l) => ({ label: l.label, value: l.value }))} color="#7A3A18" />
                    )}
                    <p style={{ fontSize: 9.5, fontWeight: 600, color: '#7A3A18', opacity: 0.72, margin: '10px 0 0' }}>
                      Age and gender aren't collected during registration, so those breakdowns aren't available yet.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Payment Analytics ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Wallet size={14} />}>Payment Analytics</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <MiniMetric label="Average Verification Time" value={formatDuration(paymentAnalytics.avgVerificationMs)} />
                  <MiniMetric label="Rejected Payments" value={paymentAnalytics.failedRejected} tone={paymentAnalytics.failedRejected ? 'warn' : undefined} />
                  <MiniMetric label="Pending Verification" value={paymentAnalytics.failedPending} />
                  <MiniMetric label="Outstanding Balance" value={peso(outstandingBalance)} tone="warn" />
                </div>
              </div>

              {/* ── Seasonal Trends ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Calendar size={14} />}>Seasonal Trends (All-Time, by Calendar Month)</SectionTitle>
                <BarChart data={seasonalTrends.data} color="#7A3A18" height={170} />
                <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
                  <MiniMetric label="Peak Season" value={seasonalTrends.peak.join(', ') || '—'} compact />
                  <MiniMetric label="Low Season" value={seasonalTrends.low.join(', ') || '—'} compact />
                </div>
              </div>

              {/* ── Bookings by Tour ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<MapPin size={14} />}>Bookings by Tour</SectionTitle>
                <HorizontalBarChart data={tourBreakdown} color="#C45C26" onBarClick={handleTourBarClick} activeLabel={filterTour !== 'All Tours' ? filterTour : null} />
              </div>

              {/* ── Recent / Filtered Bookings Table ── */}
              <div ref={tableRef} style={{
                background: '#FDF6EE', borderRadius: 20, overflow: 'hidden',
                border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <div style={{ padding: '1.5rem 1.75rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <SectionTitle icon={<ClipboardList size={14} />}>
                    {filtersActive ? 'Filtered Bookings' : 'Recent Bookings In Range'}
                  </SectionTitle>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(196,92,38,0.14)' }}>
                        {['Booking No.', 'Joiner', 'Tour', 'Pax', 'Status', 'Date'].map((h) => (
                          <th key={h} style={{
                            textAlign: 'left', padding: '12px 20px', fontSize: 9, fontWeight: 800,
                            letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.78,
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentBookings.map((b) => (
                        <tr key={b.id} style={{ borderBottom: '1px solid rgba(196,92,38,0.08)' }}>
                          <td style={{ padding: '12px 20px', fontFamily: 'monospace', fontWeight: 700, color: '#C45C26', fontSize: 12 }}>
                            {b.booking_number || '—'}
                          </td>
                          <td style={{ padding: '12px 20px', fontWeight: 800, color: '#1A0A00', fontSize: 12.5 }}>
                            {b.full_name || '—'}
                          </td>
                          <td style={{ padding: '12px 20px', fontWeight: 600, color: '#7A3A18', fontSize: 12.5 }}>
                            {b.tours?.title || '—'}
                          </td>
                          <td style={{ padding: '12px 20px', fontWeight: 800, color: '#1A0A00', fontSize: 12.5 }}>
                            {b.slots_booked}
                          </td>
                          <td style={{ padding: '12px 20px' }}>
                            <MiniStatusBadge status={getDerivedStatus(b)} />
                          </td>
                          <td style={{ padding: '12px 20px', fontWeight: 600, color: '#7A3A18', opacity: 0.7, fontSize: 11.5, whiteSpace: 'nowrap' }}>
                            {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {bookings.length > recentBookings.length && (
                  <p style={{ padding: '14px 20px', fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.78, margin: 0 }}>
                    Showing {recentBookings.length} most recent of {bookings.length} bookings matching current filters.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   CHART PRIMITIVES  (hand-rolled, no external chart library)
───────────────────────────────────────────── */
const BarChart = ({ data, color = '#C45C26', height = 180 }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  const showEveryLabel = data.length <= 14;
  const labelStep = showEveryLabel ? 1 : Math.ceil(data.length / 10);

  if (data.length === 0) {
    return <EmptyChartNotice />;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.length > 40 ? 3 : 8, height, overflowX: 'auto', paddingBottom: 6 }}>
      {data.map((d, i) => (
        <div
          key={d.key || i}
          title={`${d.label}: ${d.value}`}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-end', minWidth: data.length > 40 ? 8 : 24,
            flex: 1, height: '100%',
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 800, color: '#1A0A00', opacity: d.value ? 0.7 : 0, marginBottom: 4 }}>
            {d.value || ''}
          </span>
          <div style={{
            width: '100%', maxWidth: 28,
            height: `${Math.max(2, (d.value / max) * (height - 46))}px`,
            background: d.value === 0 ? 'rgba(196,92,38,0.12)' : color,
            borderRadius: '6px 6px 2px 2px',
            transition: 'height 0.3s',
          }} />
          <span style={{
            fontSize: 8, fontWeight: 800, color: '#7A3A18', opacity: 0.68,
            marginTop: 8, whiteSpace: 'nowrap',
          }}>
            {i % labelStep === 0 ? d.label : ''}
          </span>
        </div>
      ))}
    </div>
  );
};

const HorizontalBarChart = ({ data, color = '#C45C26', onBarClick, activeLabel }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <EmptyChartNotice />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.map((d, i) => (
        <div
          key={i}
          onClick={onBarClick ? () => onBarClick(d.label) : undefined}
          style={{ cursor: onBarClick ? 'pointer' : 'default', opacity: activeLabel && activeLabel !== d.label ? 0.45 : 1 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00' }}>{d.label}</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#C45C26' }}>{d.value}</span>
          </div>
          <div style={{ background: '#F2E4D0', borderRadius: 999, height: 10, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999,
              width: `${(d.value / max) * 100}%`,
              background: color, transition: 'width 0.4s',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const DonutChart = ({ segments, size = 140, thickness = 20, onSegmentClick, activeKey }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <EmptyChartNotice />;

  let cumulative = 0;
  const stops = segments.map((seg) => {
    const startPct = (cumulative / total) * 100;
    cumulative += seg.value;
    const endPct = (cumulative / total) * 100;
    return `${seg.color} ${startPct}% ${endPct}%`;
  }).join(', ');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `conic-gradient(${stops})`,
        position: 'relative', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', inset: thickness,
          background: '#FDF6EE', borderRadius: '50%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: '#1A0A00', lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 8, fontWeight: 800, color: '#7A3A18', opacity: 0.78, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>
            Total
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {segments.map((seg, i) => (
          <div
            key={i}
            onClick={onSegmentClick ? () => onSegmentClick(seg.key || seg.label) : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, fontWeight: 700, color: '#1A0A00',
              cursor: onSegmentClick ? 'pointer' : 'default',
              opacity: activeKey && activeKey !== (seg.key || seg.label) ? 0.45 : 1,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            {seg.label}
            <span style={{ opacity: 0.68, fontWeight: 700 }}>
              ({seg.value} · {Math.round((seg.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const FunnelChart = ({ steps }) => {
  const max = Math.max(1, steps[0]?.value || 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((s, i) => {
        const widthPct = Math.max(8, (s.value / max) * 100);
        const dropOff = i > 0 && steps[i - 1].value > 0 ? Math.round(((steps[i - 1].value - s.value) / steps[i - 1].value) * 100) : null;
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#C45C26' }}>
                {s.value}{dropOff !== null && dropOff > 0 && <span style={{ color: '#8C2F1C', fontWeight: 700, marginLeft: 6, fontSize: 10 }}>-{dropOff}%</span>}
              </span>
            </div>
            <div style={{ width: `${widthPct}%`, minWidth: 60, height: 32, background: '#1A0A00', borderRadius: 10, opacity: 0.85 - i * 0.12, transition: 'width 0.4s' }} />
          </div>
        );
      })}
    </div>
  );
};

const EmptyChartNotice = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '2.5rem 0', color: 'rgba(122,58,24,0.35)',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  }}>
    No data for this range
  </div>
);

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const SectionTitle = ({ icon, children }) => (
  <h4 style={{
    fontSize: 9, fontWeight: 900, letterSpacing: '0.22em',
    textTransform: 'uppercase', color: '#7A3A18', opacity: 0.75,
    margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: 7,
  }}>
    <span style={{ color: '#C45C26' }}>{icon}</span> {children}
  </h4>
);

const StatCard = ({ title, value, icon, iconColor }) => (
  <div style={{
    background: '#FDF6EE', borderRadius: 18, padding: '1.4rem 1.5rem',
    border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 16px rgba(26,10,0,0.05)',
    display: 'flex', flexDirection: 'column', gap: 8,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, margin: 0 }}>
        {title}
      </p>
      <div style={{
        width: 32, height: 32, borderRadius: 9, background: '#F2E4D0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: iconColor || '#C45C26', flexShrink: 0,
      }}>
        {icon}
      </div>
    </div>
    <p style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: '#1A0A00', margin: 0, lineHeight: 1.1, wordBreak: 'break-word' }}>
      {value}
    </p>
  </div>
);

const MiniMetric = ({ label, value, trend, trendLabel, tone, compact, showValueless, invertTrendColor }) => {
  const trendGood = invertTrendColor ? (trend ?? 0) <= 0 : (trend ?? 0) >= 0;
  return (
    <div style={{
      background: tone === 'warn' ? 'rgba(140,47,28,0.06)' : '#F2E4D0',
      borderRadius: 14, padding: compact ? '10px 14px' : '14px 18px',
    }}>
      <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, margin: '0 0 6px' }}>
        {label}
      </p>
      {!showValueless && (
        <p style={{ fontSize: compact ? 16 : 20, fontWeight: 900, color: tone === 'warn' ? '#8C2F1C' : '#1A0A00', margin: 0, letterSpacing: '-0.02em' }}>
          {value}
        </p>
      )}
      {trend !== undefined && trend !== null && (
        <p style={{
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800,
          color: trendGood ? '#C45C26' : '#8C2F1C', margin: showValueless ? 0 : '4px 0 0',
        }}>
          {trendGood ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trend >= 0 ? '+' : ''}{trend}% {trendLabel || ''}
        </p>
      )}
    </div>
  );
};

const HighlightCard = ({ icon, label, title, sub, tone }) => (
  <div style={{
    background: tone === 'good' ? 'rgba(196,92,38,0.08)' : 'rgba(140,47,28,0.06)',
    border: `1px solid ${tone === 'good' ? 'rgba(196,92,38,0.2)' : 'rgba(140,47,28,0.18)'}`,
    borderRadius: 16, padding: '1.1rem 1.3rem', display: 'flex', gap: 12, alignItems: 'flex-start',
  }}>
    <span style={{ color: tone === 'good' ? '#C45C26' : '#8C2F1C', flexShrink: 0, marginTop: 2 }}>{icon}</span>
    <div>
      <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: tone === 'good' ? '#C45C26' : '#8C2F1C', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 900, color: '#1A0A00', margin: '0 0 2px' }}>{title}</p>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.7, margin: 0 }}>{sub}</p>
    </div>
  </div>
);

const ExportButton = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 7,
      background: '#1A0A00', color: '#E8A265', border: 'none', borderRadius: 999,
      padding: '10px 18px', fontFamily: 'inherit', fontWeight: 900,
      fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(26,10,0,0.2)',
    }}
  >
    {icon} {label}
  </button>
);

const FilterSelect = ({ value, onChange, options }) => (
  <div style={{ position: 'relative' }}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        appearance: 'none', background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)',
        borderRadius: 12, padding: '9px 30px 9px 14px', fontSize: 11.5, fontWeight: 700,
        color: '#1A0A00', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', maxWidth: 190,
      }}
    >
      {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
    <ChevronDown size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.4)' }} />
  </div>
);

const STATUS_BADGE_STYLES = {
  Complete: { bg: 'rgba(196,92,38,0.14)', color: '#C45C26' },
  Pending: { bg: 'rgba(232,162,101,0.25)', color: '#9A5B1E' },
  Rejected: { bg: 'rgba(140,47,28,0.14)', color: '#8C2F1C' },
  Cancelled: { bg: 'rgba(26,10,0,0.08)', color: 'rgba(26,10,0,0.55)' },
};

const MiniStatusBadge = ({ status }) => {
  const { bg, color } = STATUS_BADGE_STYLES[status] || STATUS_BADGE_STYLES.Pending;
  return (
    <span style={{
      display: 'inline-block', background: bg, color, borderRadius: 999,
      padding: '4px 12px', fontSize: 9, fontWeight: 900,
      letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
};

export default Reports;