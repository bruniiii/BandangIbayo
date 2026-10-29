import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import EmptyState from './ui/EmptyState';
import { SearchX } from 'lucide-react';
import { toast } from './ui/toast';
import { formatPeso } from './tourUtils';
import { downloadReportPDF } from './reportExport';
import SalesSummary from './SalesSummary';
import TourIncome from './TourIncome';
import {
  Loader2, Calendar, Users, Clock, XCircle, AlertCircle,
  TrendingUp, TrendingDown, ClipboardList,
  Star, Printer, Bell, Sparkles, PieChart,
  ArrowRight, Trophy, ThumbsDown, FileText,
} from 'lucide-react';
import { Skel, SkeletonRegion } from './ui/Skeleton';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// #8C2F1C  oxblood (reject / danger)
// ---------------------------------------------------------

const CHART_COLORS = {
  complete: '#A8481A',
  pending: '#E8A265',
  rejected: '#8C2F1C',
  cancelled: 'rgba(26,10,0,0.35)',
  full: '#1A0A00',
  down: '#A8481A',
  none: 'rgba(122,58,24,0.25)',
  new: '#A8481A',
  returning: '#1A0A00',
};

const peso = formatPeso;
const pct = (n) => `${Number.isFinite(n) ? Math.round(n) : 0}%`;

/* ─────────────────────────────────────────────
   DATE RANGE HELPERS
───────────────────────────────────────────── */
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

  // The date buttons and filters were removed: the report covers all bookings.
  const [preset, setPreset] = useState('all');
  const [customStart] = useState('');
  const [customEnd] = useState('');

  // ── advanced filters ──
  const [filterTour, setFilterTour] = useState('All Tours');
  const [filterMethod, setFilterMethod] = useState('All Methods');
  const [filterStatus, setFilterStatus] = useState('All Status');
  const [filterDestination, setFilterDestination] = useState('All Destinations');

  // ── profit assumption (no itemized cost data exists yet, so this is an editable estimate) ──
  const [costPct] = useState(60);


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
      supabase.from('reviews').select('id, tour_id, user_id, rating, comment, created_at, tours ( title )').order('created_at', { ascending: false }),
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

    // Running totals by day of the month, for the This Month vs. Last Month line chart.
    // This month's line stops at today.
    const daysIn = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const valueOf = {
      bookings: () => 1,
      revenue: (b) => (getDerivedStatus(b) === 'Complete' ? (b.total_price || 0) : 0),
      pax: (b) => b.slots_booked || 0,
      cancellations: (b) => (['Cancelled', 'Rejected'].includes(getDerivedStatus(b)) ? 1 : 0),
    };
    const runningTotals = (arr, days, upTo, metric) => {
      const perDay = new Array(days).fill(0);
      arr.forEach((b) => { perDay[new Date(b.created_at).getDate() - 1] += valueOf[metric](b); });
      let sum = 0;
      return perDay.slice(0, upTo).map((v) => (sum += v));
    };
    const series = Object.fromEntries(Object.keys(valueOf).map((metric) => [metric, {
      thisMonth: runningTotals(thisMonthBookings, daysIn(now), now.getDate(), metric),
      lastMonth: runningTotals(lastMonthBookings, daysIn(lastMonthDate), daysIn(lastMonthDate), metric),
    }]));

    return {
      series,
      thisMonthLabel: now.toLocaleDateString('en-US', { month: 'long' }),
      lastMonthLabel: lastMonthDate.toLocaleDateString('en-US', { month: 'long' }),
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
    // The last 6 months (oldest first, this month last) for the forecast line chart.
    const history = [5, 4, 3, 2, 1, 0].map((i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const inMonth = allBookings.filter((b) => monthKey(new Date(b.created_at)) === monthKey(d));
      return {
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        bookings: inMonth.length,
        revenue: inMonth.filter((b) => getDerivedStatus(b) === 'Complete').reduce((s, b) => s + (b.total_price || 0), 0),
      };
    });
    return {
      expectedBookings: Math.round((weighted + avgBookings) / 2),
      expectedRevenue: Math.round(avgRevenue),
      history,
      nextLabel: new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'short' }),
    };
  }, [allBookings]);

  // ── auto-generated insights ──
  const insights = useMemo(() => {
    const list = [];
    if (monthlyComparison.bookingsChangePct !== 0) {
      list.push(`Bookings ${monthlyComparison.bookingsChangePct >= 0 ? 'increased' : 'decreased'} ${Math.abs(monthlyComparison.bookingsChangePct)}% compared to last month.`);
    }
    if (bestTour) list.push(`${bestTour.title} generated the highest revenue this period (${peso(bestTour.revenue)}).`);
    if (stats.total > 0) list.push(`${pct((stats.pending / stats.total) * 100)} of bookings are still pending verification.`);
    const methodTop = methodSegments.length ? [...methodSegments].sort((a, b) => b.value - a.value)[0] : null;
    if (methodTop) list.push(`${methodTop.label} is currently the most used payment method.`);
    if (nearlyFullTours.length > 0) list.push(`${nearlyFullTours.map((t) => t.title).join(', ')} ${nearlyFullTours.length === 1 ? 'is' : 'are'} approaching full capacity.`);
    if (soldOutTours.length > 0) list.push(`${soldOutTours.map((t) => t.title).join(', ')} ${soldOutTours.length === 1 ? 'is' : 'are'} fully booked.`);
    return list.slice(0, 5);
  }, [monthlyComparison, bestTour, stats, methodSegments, nearlyFullTours, soldOutTours]);

  // ── joiner reviews: average, star breakdown and the latest ones ──
  const reviewSummary = useMemo(() => {
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const count = reviews.length;
    const average = count ? reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / count : 0;
    const stars = [5, 4, 3, 2, 1].map((n) => ({ label: `${n} star${n === 1 ? '' : 's'}`, value: reviews.filter((r) => Number(r.rating) === n).length }));
    const latest = reviews.slice(0, 8).map((r) => ({
      name: displayJoiner(profileMap.get(r.user_id), 'Joiner'),
      tour: r.tours?.title || 'Tour',
      rating: Number(r.rating) || 0,
      comment: r.comment || '',
      date: r.created_at ? new Date(r.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
    }));
    return { count, average, stars, latest };
  }, [reviews, profiles]);

  // Sales Summary and Income per Tour pass up what they show, for the PDF.
  const [salesData, setSalesData] = useState(null);
  const [incomeData, setIncomeData] = useState(null);
  const onSalesData = useCallback((d) => setSalesData(d), []);
  const onIncomeData = useCallback((d) => setIncomeData(d), []);

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

  // ── the downloadable PDF: everything on this page ──
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const buildReport = () => {
    const filters = [
      filterTour !== 'All Tours' && `Tour: ${filterTour}`,
      filterDestination !== 'All Destinations' && `Destination: ${filterDestination}`,
      filterMethod !== 'All Methods' && `Payment: ${filterMethod}`,
      filterStatus !== 'All Status' && `Status: ${filterStatus}`,
    ].filter(Boolean);
    return {
      rangeLabel: 'All bookings',
      filtersLabel: filters.length ? filters.join(' · ') : 'None (all bookings)',
      generatedAt: new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }),
      summary: [
        ['Total bookings', stats.total],
        ['Total joiners (pax)', stats.totalPax],
        ['Confirmed', stats.complete],
        ['Pending', stats.pending],
        ['Cancelled', stats.cancelled],
        ['Rejected', stats.rejected],
        ['Confirmation rate', `${stats.conversionRate}%`],
        ['Cancellation rate', `${stats.cancellationRate}%`],
        ['Average group size', stats.avgPartySize],
        ['Total revenue', stats.revenue, true],
        ['Average booking value', stats.avgBookingValue, true],
        [`Estimated profit (costs ${costPct}% of revenue)`, estimatedProfit, true],
      ],
      payments: [
        ['Full payments received', paymentAnalytics.fullRevenue],
        ['Downpayments received', paymentAnalytics.downRevenue],
        ['Outstanding balances', outstandingBalance],
      ],
      tours: tourPerformance,
      insights,
      alerts: notifications.map((n) => n.text),
      sales: salesData,
      income: incomeData,
      comparison: {
        thisLabel: monthlyComparison.thisMonthLabel,
        lastLabel: monthlyComparison.lastMonthLabel,
        rows: [
          ['Bookings', 'bookings', 'bookingsChangePct', false],
          ['Revenue', 'revenue', 'revenueChangePct', true],
          ['Joiners (pax)', 'pax', 'paxChangePct', false],
          ['Cancellations', 'cancellations', 'cancellationChangePct', false],
        ].map(([label, key, change, isMoney]) => {
          const last = monthlyComparison.series[key].lastMonth.at(-1) || 0;
          const now = monthlyComparison.series[key].thisMonth.at(-1) || 0;
          return { label, last, now, change: monthlyComparison[change], isMoney };
        }),
      },
      forecast,
      statusBreakdown: statusSegments.map((x) => [x.label, x.value]),
      methodSplit: methodSegments.map((x) => [x.label, x.value]),
      cancellations: cancellationReasons,
      customers: customerAnalytics,
      seasonal: seasonalTrends,
      reviews: reviewSummary,
      bookings: bookings.map((b) => {
        const status = getDerivedStatus(b);
        return {
          number: b.booking_number || '',
          date: b.created_at ? new Date(b.created_at).toLocaleDateString('en-PH') : '',
          joiner: b.full_name || '',
          tour: b.tours?.title || '',
          destination: b.tours?.destination || '',
          pax: b.slots_booked || 0,
          total: b.total_price || 0,
          paid: status === 'Complete' ? (b.balance_settled ? b.total_price : (b.amount_paid ?? b.total_price)) || 0 : 0,
          method: b.payment_method || '',
          status,
        };
      }),
    };
  };
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await downloadReportPDF(buildReport());
    } catch (err) {
      toast.error("Couldn't create the PDF", String(err?.message || err));
    }
    setDownloadingPdf(false);
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>

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
          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#7A3A18', margin: 0 }}>
            All bookings · {loading ? <Skel w={110} h={10} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> : `${stats.total} booking${stats.total !== 1 ? 's' : ''}`}
            {lastUpdated && !loading && (
              <span style={{ opacity: 0.95 }}> · Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </p>
        </div>

        {/* export controls */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <ExportButton icon={<FileText size={13} />} label={downloadingPdf ? 'Preparing PDF…' : 'Download PDF'} onClick={handleDownloadPdf} disabled={loading || downloadingPdf} />
          <ExportButton icon={<Printer size={13} />} label="Print" onClick={() => window.print()} />
        </div>
      </div>

      <SalesSummary onData={onSalesData} />

      <TourIncome onData={onIncomeData} />

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
            <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '6px 0 0' }}>
              The numbers below may be incomplete or zero until this is fixed.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonRegion label="Loading reports" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ background: '#FDF6EE', borderRadius: 20, padding: '1.25rem', border: '1px solid rgba(180,81,30,0.12)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skel w="50%" h={10} /><Skel w="70%" h={26} /><Skel w="40%" h={10} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ background: '#FDF6EE', borderRadius: 20, padding: '1.25rem', border: '1px solid rgba(180,81,30,0.12)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Skel w="35%" h={12} /><Skel h={200} r={14} />
              </div>
            ))}
          </div>
        </SkeletonRegion>
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
              border: '1px solid rgba(180,81,30,0.14)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
            }}>
              <SectionTitle icon={<Bell size={14} />}>Notifications</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notifications.map((n, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: n.tone === 'warn' ? 'rgba(140,47,28,0.07)' : n.tone === 'action' ? 'rgba(232,162,101,0.18)' : '#F2E4D0',
                    borderRadius: 12,
                  }}>
                    <span style={{ color: n.tone === 'warn' ? '#8C2F1C' : '#A8481A', flexShrink: 0 }}>{n.icon}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1A0A00' }}>{n.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.total === 0 ? (
            filtersActive ? (
              <EmptyState
                icon={SearchX}
                title="No bookings match these filters"
                message="Remove some filters to see the report for this period."
                action={{ label: 'Reset Filters', onClick: resetAdvancedFilters }}
              />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="No bookings in this period"
                message="Try a longer date range to see how the business is doing."
                action={preset !== 'all' ? { label: 'Show All Time', onClick: () => setPreset('all') } : null}
              />
            )
          ) : (
            <>
              {/* ── Monthly Comparison and Forecast, side by side ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 20, alignItems: 'stretch' }}>
                <div style={{
                  background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem', minWidth: 0,
                  border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
                }}>
                  <SectionTitle icon={<TrendingUp size={14} />}>Monthly Comparison (This Month vs. Last Month)</SectionTitle>
                  <MonthComparisonChart comparison={monthlyComparison} />
                </div>

                <div style={{
                  background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem', minWidth: 0,
                  border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
                }}>
                  <SectionTitle icon={<Sparkles size={14} />}>Forecast — Next Month</SectionTitle>
                  <ForecastChart forecast={forecast} />
                </div>
              </div>

              {/* ── Donut charts row ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
                <div style={{
                  background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                  border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
                }}>
                  <SectionTitle icon={<AlertCircle size={14} />}>Booking Status Breakdown</SectionTitle>
                  <DonutChart segments={statusSegments} />
                </div>
                <div style={{
                  background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                  border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
                }}>
                  <SectionTitle icon={<PieChart size={14} />}>Payment Method Split</SectionTitle>
                  <DonutChart segments={methodSegments} />
                </div>
              </div>

             

              {/* ── Tour Performance ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Trophy size={14} />}>Tour Performance</SectionTitle>
                <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(180,81,30,0.14)' }}>
                        {['Tour', 'Bookings', 'Revenue', 'Pax', 'Completion', 'Rating'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tourPerformance.map((t) => (
                        <tr key={t.tourId || t.title} style={{ borderBottom: '1px solid rgba(180,81,30,0.08)' }}>
                          <td style={{ padding: '10px 16px', fontWeight: 800, color: '#1A0A00', fontSize: 12.5 }}>{t.title}</td>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: '#7A3A18', fontSize: 12.5 }}>{t.bookingsCount}</td>
                          <td style={{ padding: '10px 16px', fontWeight: 900, color: '#A8481A', fontSize: 12.5 }}>{peso(t.revenue)}</td>
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

              {/* ── Joiner Reviews ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Star size={14} />}>Joiner Reviews</SectionTitle>
                {reviewSummary.count === 0 ? <EmptyChartNotice /> : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                    <div>
                      <p style={{ fontSize: 34, fontWeight: 900, color: '#1A0A00', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {reviewSummary.average.toFixed(1)} <Star size={24} fill="#E8A265" color="#E8A265" />
                      </p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: '2px 0 14px' }}>
                        Average of {reviewSummary.count} review{reviewSummary.count === 1 ? '' : 's'}
                      </p>
                      <HorizontalBarChart data={reviewSummary.stars} color="#E8A265" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: 0 }}>Latest reviews</p>
                      {reviewSummary.latest.map((r, i) => (
                        <div key={i} style={{ background: '#F2E4D0', borderRadius: 12, padding: '10px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                            <p style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00', margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name} · {r.tour}</p>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 900, color: '#A8481A', flexShrink: 0 }}>
                              <Star size={12} fill="#E8A265" color="#E8A265" /> {r.rating}
                            </span>
                          </div>
                          {r.comment && <p style={{ fontSize: 12, fontWeight: 500, color: '#1A0A00', margin: '4px 0 0', lineHeight: 1.5 }}>“{r.comment}”</p>}
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', margin: '4px 0 0' }}>{r.date}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Cancellation Analytics ── */}
              {cancellationReasons.total > 0 && (
                <div style={{
                  background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                  border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
                }}>
                  <SectionTitle icon={<XCircle size={14} />}>Cancellation Analytics</SectionTitle>
                  <HorizontalBarChart data={cancellationReasons.breakdown} color="#8C2F1C" />
                </div>
              )}

              {/* ── Customer Analytics ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Users size={14} />}>Customer Analytics</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '0 0 10px' }}>New vs. Returning Joiners</p>
                    <DonutChart segments={[
                      { label: 'New', value: customerAnalytics.newCount, color: CHART_COLORS.new },
                      { label: 'Returning', value: customerAnalytics.returningCount, color: CHART_COLORS.returning },
                    ].filter((s) => s.value > 0)} size={120} />
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '0 0 10px' }}>Top Customers</p>
                    {customerAnalytics.topCustomers.length === 0 ? <EmptyChartNotice /> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {customerAnalytics.topCustomers.map((c, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F2E4D0', borderRadius: 12, padding: '8px 14px' }}>
                            <div>
                              <p style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{c.name}</p>
                              <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0' }}>{c.tours} tour{c.tours !== 1 ? 's' : ''}</p>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 900, color: '#A8481A' }}>{peso(c.spend)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '0 0 10px' }}>Top Locations (from profile address)</p>
                    {customerAnalytics.topLocations.length === 0 ? <EmptyChartNotice /> : (
                      <HorizontalBarChart data={customerAnalytics.topLocations.map((l) => ({ label: l.label, value: l.value }))} color="#7A3A18" />
                    )}
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '10px 0 0' }}>
                      Age and gender aren't collected during registration, so those breakdowns aren't available yet.
                    </p>
                  </div>
                </div>
              </div>

              

              {/* ── Seasonal Trends ── */}
              <div style={{
                background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
                border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
              }}>
                <SectionTitle icon={<Calendar size={14} />}>Seasonal Trends (All-Time, by Calendar Month)</SectionTitle>
                <BarChart data={seasonalTrends.data} color="#7A3A18" height={170} />
                <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
                  <MiniMetric label="Peak Season" value={seasonalTrends.peak.join(', ') || '—'} compact />
                  <MiniMetric label="Low Season" value={seasonalTrends.low.join(', ') || '—'} compact />
                </div>
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
// This month vs. last month as two lines: running totals by day of the month.
const COMPARISON_METRICS = [
  { key: 'bookings', label: 'Bookings', change: 'bookingsChangePct', format: (v) => String(v) },
  { key: 'revenue', label: 'Revenue', change: 'revenueChangePct', format: (v) => peso(v) },
  { key: 'pax', label: 'Pax', change: 'paxChangePct', format: (v) => String(v) },
  { key: 'cancellations', label: 'Cancellations', change: 'cancellationChangePct', format: (v) => String(v), lowerIsBetter: true },
];

const MonthComparisonChart = ({ comparison }) => {
  const [metricKey, setMetricKey] = useState('bookings');
  const [hoverDay, setHoverDay] = useState(null);
  const metric = COMPARISON_METRICS.find((m) => m.key === metricKey);
  const { thisMonth, lastMonth } = comparison.series[metricKey];
  const days = Math.max(thisMonth.length, lastMonth.length, 1);
  const lastDay = Math.max(lastMonth.length, 28);
  const max = Math.max(1, ...thisMonth, ...lastMonth);
  const W = 640, H = 200, padL = 46, padR = 14, padT = 14, padB = 28;
  const x = (i) => padL + (i / Math.max(1, lastDay - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const change = comparison[metric.change];
  const good = metric.lowerIsBetter ? change <= 0 : change >= 0;
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  const thisTotal = thisMonth[thisMonth.length - 1] || 0;
  const lastTotal = lastMonth[lastMonth.length - 1] || 0;
  const hover = hoverDay != null ? { day: hoverDay + 1, now: thisMonth[hoverDay], before: lastMonth[hoverDay] } : null;

  return (
    <div>
      <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {COMPARISON_METRICS.map((m) => (
          <button key={m.key} type="button" aria-pressed={metricKey === m.key} onClick={() => setMetricKey(m.key)} style={{
            padding: '7px 14px', borderRadius: 999, cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontWeight: 900,
            fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: metricKey === m.key ? '#1A0A00' : '#F2E4D0', color: metricKey === m.key ? '#FDF6EE' : '#7A3A18',
          }}>{m.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>
          <span style={{ width: 18, height: 3, borderRadius: 2, background: '#B4511E' }} />
          {comparison.thisMonthLabel} (so far): {metric.format(thisTotal)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#7A3A18' }}>
          <span style={{ width: 18, height: 0, borderTop: '3px dashed rgba(122,58,24,0.6)' }} />
          {comparison.lastMonthLabel}: {metric.format(lastTotal)}
        </span>
        <span style={{ fontSize: 12, fontWeight: 900, color: good ? '#2E6B4A' : '#8C2F1C' }}>
          {change >= 0 ? '+' : ''}{change}% vs last month
        </span>
      </div>

      <div style={{ position: 'relative', maxWidth: 720 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 720, height: 'auto', display: 'block' }} role="img"
          aria-label={`${metric.label}: ${comparison.thisMonthLabel} ${metric.format(thisTotal)} so far, ${comparison.lastMonthLabel} ${metric.format(lastTotal)}`}
          onMouseLeave={() => setHoverDay(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - padL) / (W - padL - padR)) * (lastDay - 1));
            setHoverDay(i >= 0 && i < days ? i : null);
          }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="rgba(180,81,30,0.12)" />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#7A3A18">
                {metricKey === 'revenue' && t >= 1000 ? `₱${Math.round(t / 1000)}k` : t}
              </text>
            </g>
          ))}
          {[1, 8, 15, 22, lastDay].map((d) => (
            <text key={d} x={x(d - 1)} y={H - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill="#7A3A18">{d}</text>
          ))}
          <path d={path(lastMonth)} fill="none" stroke="rgba(122,58,24,0.55)" strokeWidth="2.5" strokeDasharray="6 5" strokeLinejoin="round" />
          <path d={path(thisMonth)} fill="none" stroke="#B4511E" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {thisMonth.length > 0 && <circle cx={x(thisMonth.length - 1)} cy={y(thisTotal)} r="4.5" fill="#B4511E" />}
          {hover && (
            <line x1={x(hover.day - 1)} x2={x(hover.day - 1)} y1={padT} y2={H - padB} stroke="rgba(26,10,0,0.25)" strokeDasharray="3 3" />
          )}
        </svg>
        {hover && (
          <div style={{
            position: 'absolute', top: 6, left: `${(x(hover.day - 1) / W) * 100}%`, transform: 'translateX(-50%)', pointerEvents: 'none',
            background: '#1A0A00', color: '#FDF6EE', borderRadius: 10, padding: '6px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            Day {hover.day}: {hover.now != null ? metric.format(hover.now) : '—'} vs {hover.before != null ? metric.format(hover.before) : '—'}
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0' }}>Running totals by day of the month.</p>
    </div>
  );
};

// Last 6 months as a solid line, then a dashed line to next month's forecast
// (a weighted average of the last three months).
const ForecastChart = ({ forecast }) => {
  const [metric, setMetric] = useState('bookings');
  const [hover, setHover] = useState(null);
  const isRevenue = metric === 'revenue';
  const fmt = (v) => (isRevenue ? peso(v) : String(v));
  const actual = forecast.history.map((h) => h[metric]);
  const predicted = isRevenue ? forecast.expectedRevenue : forecast.expectedBookings;
  const labels = [...forecast.history.map((h) => h.label), forecast.nextLabel];
  const values = [...actual, predicted];
  const max = Math.max(1, ...values);
  const W = 640, H = 200, padL = 46, padR = 18, padT = 14, padB = 28;
  const x = (i) => padL + (i / (labels.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const line = (pts) => pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = actual.length - 1;
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <div>
      <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['bookings', 'Bookings'], ['revenue', 'Revenue']].map(([key, label]) => (
          <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)} style={{
            padding: '7px 14px', borderRadius: 999, cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontWeight: 900,
            fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: metric === key ? '#1A0A00' : '#F2E4D0', color: metric === key ? '#FDF6EE' : '#7A3A18',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>
          <span style={{ width: 18, height: 3, borderRadius: 2, background: '#B4511E' }} /> Actual
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#7A3A18' }}>
          <span style={{ width: 18, height: 0, borderTop: '3px dashed #E8A265' }} /> Expected in {forecast.nextLabel}: {fmt(predicted)}
        </span>
      </div>

      <div style={{ position: 'relative', maxWidth: 720 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 720, height: 'auto', display: 'block' }} role="img"
          aria-label={`${isRevenue ? 'Revenue' : 'Bookings'} for the last 6 months, and ${fmt(predicted)} expected in ${forecast.nextLabel}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - padL) / (W - padL - padR)) * (labels.length - 1));
            setHover(i >= 0 && i < labels.length ? i : null);
          }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="rgba(180,81,30,0.12)" />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#7A3A18">
                {isRevenue && t >= 1000 ? `₱${Math.round(t / 1000)}k` : t}
              </text>
            </g>
          ))}
          {labels.map((l, i) => (
            <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fontWeight={i === labels.length - 1 ? 900 : 700} fill={i === labels.length - 1 ? '#A8481A' : '#7A3A18'}>{l}</text>
          ))}
          <path d={line(actual.map((v, i) => [i, v]))} fill="none" stroke="#B4511E" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <path d={line([[last, actual[last]], [labels.length - 1, predicted]])} fill="none" stroke="#E8A265" strokeWidth="3" strokeDasharray="6 5" />
          {actual.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#B4511E" />)}
          <circle cx={x(labels.length - 1)} cy={y(predicted)} r="5" fill="#FDF6EE" stroke="#E8A265" strokeWidth="3" />
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="rgba(26,10,0,0.25)" strokeDasharray="3 3" />}
        </svg>
        {hover != null && (
          <div style={{
            position: 'absolute', top: 6, left: `${(x(hover) / W) * 100}%`, transform: 'translateX(-50%)', pointerEvents: 'none',
            background: '#1A0A00', color: '#FDF6EE', borderRadius: 10, padding: '6px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            {labels[hover]}: {fmt(values[hover])}{hover === labels.length - 1 ? ' (expected)' : hover === last ? ' (so far)' : ''}
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0' }}>
        The forecast is a weighted average of the last three months. This month counts what's booked so far.
      </p>
    </div>
  );
};

const BarChart = ({ data, color = '#A8481A', height = 180 }) => {
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
          <span style={{ fontSize: 11, fontWeight: 800, color: '#1A0A00', opacity: d.value ? 0.7 : 0, marginBottom: 4 }}>
            {d.value || ''}
          </span>
          <div style={{
            width: '100%', maxWidth: 28,
            height: `${Math.max(2, (d.value / max) * (height - 46))}px`,
            background: d.value === 0 ? 'rgba(180,81,30,0.12)' : color,
            borderRadius: '6px 6px 2px 2px',
            transition: 'height 0.3s',
          }} />
          <span style={{
            fontSize: 11, fontWeight: 800, color: '#7A3A18', opacity: 0.9,
            marginTop: 8, whiteSpace: 'nowrap',
          }}>
            {i % labelStep === 0 ? d.label : ''}
          </span>
        </div>
      ))}
    </div>
  );
};

const HorizontalBarChart = ({ data, color = '#A8481A', onBarClick, activeLabel }) => {
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
            <span style={{ fontSize: 12, fontWeight: 900, color: '#A8481A' }}>{d.value}</span>
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
          <span style={{ fontSize: 11, fontWeight: 800, color: '#7A3A18', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>
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
              <span style={{ fontSize: 12, fontWeight: 900, color: '#A8481A' }}>
                {s.value}{dropOff !== null && dropOff > 0 && <span style={{ color: '#8C2F1C', fontWeight: 700, marginLeft: 6, fontSize: 11.5 }}>-{dropOff}%</span>}
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
    padding: '2.5rem 0', color: '#7A3A18',
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
    fontSize: 11, fontWeight: 900, letterSpacing: '0.22em',
    textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9,
    margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: 7,
  }}>
    <span style={{ color: '#A8481A' }}>{icon}</span> {children}
  </h4>
);

const MiniMetric = ({ label, value, trend, trendLabel, tone, compact, showValueless, invertTrendColor }) => {
  const trendGood = invertTrendColor ? (trend ?? 0) <= 0 : (trend ?? 0) >= 0;
  return (
    <div style={{
      background: tone === 'warn' ? 'rgba(140,47,28,0.06)' : '#F2E4D0',
      borderRadius: 14, padding: compact ? '10px 14px' : '14px 18px',
    }}>
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9, margin: '0 0 6px' }}>
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
          color: trendGood ? '#A8481A' : '#8C2F1C', margin: showValueless ? 0 : '4px 0 0',
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
    background: tone === 'good' ? 'rgba(180,81,30,0.08)' : 'rgba(140,47,28,0.06)',
    border: `1px solid ${tone === 'good' ? 'rgba(180,81,30,0.2)' : 'rgba(140,47,28,0.18)'}`,
    borderRadius: 16, padding: '1.1rem 1.3rem', display: 'flex', gap: 12, alignItems: 'flex-start',
  }}>
    <span style={{ color: tone === 'good' ? '#A8481A' : '#8C2F1C', flexShrink: 0, marginTop: 2 }}>{icon}</span>
    <div>
      <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: tone === 'good' ? '#A8481A' : '#8C2F1C', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 900, color: '#1A0A00', margin: '0 0 2px' }}>{title}</p>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: 0 }}>{sub}</p>
    </div>
  </div>
);

const ExportButton = ({ icon, label, onClick, disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      opacity: disabled ? 0.55 : 1,
      display: 'flex', alignItems: 'center', gap: 7,
      background: '#1A0A00', color: '#E8A265', border: 'none', borderRadius: 999,
      padding: '10px 18px', fontFamily: 'inherit', fontWeight: 900,
      fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: '0 4px 14px rgba(26,10,0,0.2)',
    }}
  >
    {icon} {label}
  </button>
);


export default Reports;