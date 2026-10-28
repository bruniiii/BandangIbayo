import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import EmptyState from './ui/EmptyState';
import { SearchX, ClipboardList } from 'lucide-react';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { sendBookingStatusEmail, sendWaitlistOpeningsEmail, sendCancellationApprovedEmail } from "./Email";
import { notifyUser } from './notifications';
import { useReceiptUrl } from './receipts';
import { printReceipt } from './paymentReceipt';
import { formatPeso, downpaymentFor, formatDateRange as formatTourDates, CANCELLATION_APPROVAL_HOURS } from './tourUtils';
import {
  Search, MapPin, Loader2, Eye, X, CheckCircle2, XCircle, Calendar,
  Hash, User, CreditCard, AlertCircle, Image as ImageIcon, ChevronDown,
  Wallet, Printer, Users, History, Clock,
} from 'lucide-react';
import { SkeletonTable, SkeletonLines } from './ui/Skeleton';
import ModalHeader from './ui/ModalHeader';
 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent / confirm)
// #E8A265  warm amber (highlight / pending)
// #FDF6EE  cream (light bg)
// #F2E4D0  parchment (section bg)
// #7A3A18  rust mid-tone (secondary text)
// #8C2F1C  oxblood (reject / danger — extends palette for booking actions)
// ---------------------------------------------------------
 
const getDerivedStatus = (b) => (
  (b.payment_status === 'Pending' || b.payment_status === 'Verification Pending') ? b.payment_status :
  b.payment_status === 'Rejected' ? 'Rejected' :
  b.booking_status === 'Cancelled' ? 'Cancelled' :
  b.cancellation_requested_at ? 'Cancellation Requested' : // the joiner asked to cancel; waiting on an admin
  b.payment_status
);
 
// For Downpayment bookings, tracks whether the remaining balance has been
// settled on the day of the tour (separate from the initial GCash
// downpayment verification tracked by payment_status/booking_status above).
const getBalanceStatus = (b) => {
  if (b.payment_method !== 'Downpayment') return null;
  if (getDerivedStatus(b) !== 'Complete') return null; // only relevant once the downpayment itself is verified
  return b.balance_settled ? 'Fully Paid' : 'Balance Due';
};
 
// Remaining balance on a confirmed downpayment booking that isn't settled yet.
const balanceOwed = (b) => Math.max(0, (b.total_price || 0) - (b.amount_paid || 0));
const owesBalance = (b) =>
  getBalanceStatus(b) === 'Balance Due' && b.booking_status !== 'Cancelled' && balanceOwed(b) > 0;

// The status the admin sees: a downpayment booking that still owes a balance
// isn't "Complete" yet, it's "Downpayment Paid" (with a Balance Due badge).
const getShownStatus = (b) => {
  const derived = getDerivedStatus(b);
  return derived === 'Complete' && owesBalance(b) ? 'Downpayment Paid' : derived;
};

/* ─────────────────────────────────────────────
   BOOKING MANAGEMENT  (Admin)
───────────────────────────────────────────── */
const BookingManagement = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [methodFilter, setMethodFilter] = useState('All Methods');
  const [tourFilter, setTourFilter] = useState('All Tours');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
 
  const fetchBookings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        tours (
          title,
          destination,
          start_date,
          duration,
          price
        )
      `)
      .order('created_at', { ascending: false });
 
    if (error) {
      console.error('Error fetching bookings:', error.message);
      setLoading(false);
      return;
    }
 
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(b => b.user_id).filter(Boolean))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, phone_number')
        .in('id', userIds);
 
      if (profilesData) {
        const profileMap = Object.fromEntries(profilesData.map(p => [p.id, p]));
        setBookings(data.map(b => ({
          ...b,
          profiles: profileMap[b.user_id] || null,
        })));
      } else {
        setBookings(data);
      }
    } else {
      setBookings(data || []);
    }
    setLoading(false);
  };
 
  // Requests left unanswered for 12 hours are approved automatically: check
  // now and every 5 minutes (the server also checks every 15 minutes).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      supabase.rpc('run_overdue_cancellations').then(({ data }) => { if (data > 0) fetchBookings(); }, () => {});
    };
    tick();
    const timer = setInterval(tick, 5 * 60 * 1000);
    const clock = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => { clearInterval(timer); clearInterval(clock); };
  }, []);

  useEffect(() => {
    fetchBookings();
 
    const channel = supabase
      .channel('admin-booking-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchBookings();
      })
      .subscribe();
 
    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
 
  // ── unique tours available for the Tour filter, narrowed by the selected date ──
  const tourOptions = useMemo(() => {
    const map = new Map();
    bookings.forEach(b => {
      if (!b.tour_id || !b.tours?.title) return;
      if (dateFilter && b.tours?.start_date !== dateFilter) return;
      if (!map.has(b.tour_id)) {
        map.set(b.tour_id, { id: b.tour_id, title: b.tours.title, start_date: b.tours.start_date });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [bookings, dateFilter]);
 
  // If the selected date no longer includes the currently selected tour, reset the tour filter.
  useEffect(() => {
    if (tourFilter !== 'All Tours' && !tourOptions.some(t => String(t.id) === String(tourFilter))) {
      setTourFilter('All Tours');
    }
  }, [dateFilter, tourOptions, tourFilter]);
 
  const filteredBookings = bookings.filter(b => {
    const joinerName = b.profiles
      ? `${b.profiles.first_name || ''} ${b.profiles.last_name || ''}`.trim()
      : (b.full_name || '');
    const matchesSearch =
      joinerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.tours?.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.booking_number || '').toLowerCase().includes(searchTerm.toLowerCase());
    const shown = getShownStatus(b);
    const matchesStatus = statusFilter === 'All Status' || shown === statusFilter
      || (statusFilter === 'Balance Due' && owesBalance(b));
    const matchesMethod = methodFilter === 'All Methods' || b.payment_method === methodFilter;
    const matchesTour = tourFilter === 'All Tours' || String(b.tour_id) === String(tourFilter);
    const matchesDate = !dateFilter || b.tours?.start_date === dateFilter;
    return matchesSearch && matchesStatus && matchesMethod && matchesTour && matchesDate;
  });
  // Who still owes: soonest tour first.
  if (statusFilter === 'Balance Due') {
    filteredBookings.sort((a, b) => (a.tours?.start_date || '').localeCompare(b.tours?.start_date || ''));
  }
  // Cancellation requests waiting for an answer, the oldest (closest to auto-approval) first.
  const pendingCancels = bookings
    .filter((b) => b.cancellation_requested_at && !['Cancelled', 'Rejected'].includes(b.booking_status))
    .sort((a, b) => new Date(a.cancellation_requested_at) - new Date(b.cancellation_requested_at));
  const timeLeft = (b) => {
    const ms = new Date(b.cancellation_requested_at).getTime() + CANCELLATION_APPROVAL_HOURS * 3600e3 - now;
    if (ms <= 0) return 'Approving automatically…';
    const h = Math.floor(ms / 3600e3); const m = Math.floor((ms % 3600e3) / 60000);
    return `Auto-approves in ${h ? `${h}h ` : ''}${m}m`;
  };

  const balancesDue = bookings.filter(owesBalance);
  const totalBalanceDue = balancesDue.reduce((sum, b) => sum + balanceOwed(b), 0);
 
  // ── shared input style ──
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#F2E4D0',
    border: '1px solid rgba(180,81,30,0.18)',
    borderRadius: 14,
    padding: '10px 14px',
    fontSize: 13, fontWeight: 600,
    color: '#1A0A00',
    fontFamily: 'inherit',
    outline: 'none',
  };
 
  const thStyle = {
    padding: '14px 20px',
    fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: 'rgba(122,58,24,0.85)',
    textAlign: 'left', whiteSpace: 'nowrap',
    background: '#F2E4D0',
    display: 'flex', alignItems: 'center',
  };
 
  // ── grid column template shared by header + rows ──
  const bookingGridCols = '130px 180px minmax(220px, 1fr) 70px 140px 150px 170px 140px';
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
 
      {/* ── Scrollable Content (header + filters + table scroll together) ── */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
 
      {/* ── Cancellation requests waiting for an answer ── */}
      {pendingCancels.length > 0 && (
        <div role="region" aria-label="Cancellation requests" style={{
          background: 'rgba(140,47,28,0.07)', border: '1px solid rgba(140,47,28,0.3)',
          borderRadius: 18, padding: '14px 16px', marginBottom: 16,
        }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#8C2F1C', margin: '0 0 10px' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            {pendingCancels.length} cancellation request{pendingCancels.length === 1 ? '' : 's'} waiting for you.
            <span style={{ fontWeight: 600, color: '#7A3A18' }}>Approve or decline within {CANCELLATION_APPROVAL_HOURS} hours, or it's approved automatically.</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingCancels.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#FDF6EE', borderRadius: 14, padding: '10px 12px', border: '1px solid rgba(140,47,28,0.15)' }}>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0 }}>
                    {b.profiles ? `${b.profiles.first_name || ''} ${b.profiles.last_name || ''}`.trim() || b.full_name : b.full_name} · <span style={{ fontFamily: 'monospace' }}>{b.booking_number}</span>
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.tours?.title || 'Tour'} · “{b.cancellation_reason || '—'}”
                  </p>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: '#8C5216', whiteSpace: 'nowrap' }}>
                  <Clock size={13} /> {timeLeft(b)}
                </span>
                <button type="button" onClick={() => setSelectedBooking(b)} style={{
                  background: '#8C2F1C', color: '#FDF6EE', border: 'none', borderRadius: 12, padding: '9px 16px',
                  fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                }}>
                  Review
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Balances still owed (downpayment bookings) ── */}
      {balancesDue.length > 0 && (
        <div style={{
          background: 'rgba(232,162,101,0.16)', border: '1px solid rgba(232,162,101,0.45)',
          borderRadius: 18, padding: '12px 16px', marginBottom: 16,
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#7A3A18', margin: 0 }}>
            <Wallet size={16} style={{ color: '#A8481A', flexShrink: 0 }} />
            <span><strong style={{ color: '#1A0A00' }}>{balancesDue.length} booking{balancesDue.length === 1 ? '' : 's'}</strong> still {balancesDue.length === 1 ? 'owes' : 'owe'} a total of <strong style={{ color: '#1A0A00' }}>{formatPeso(totalBalanceDue)}</strong>. Joiners get an automatic reminder 2–3 days before their tour.</span>
          </p>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'Balance Due' ? 'All Status' : 'Balance Due')}
            style={{
              background: '#1A0A00', color: '#FDF6EE', border: 'none', borderRadius: 12,
              padding: '9px 16px', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5,
              letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            {statusFilter === 'Balance Due' ? 'Show all bookings' : 'Show who owes'}
          </button>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{
        background: '#FDF6EE',
        borderRadius: 20, padding: '14px 18px',
        border: '1px solid rgba(180,81,30,0.12)',
        boxShadow: '0 4px 16px rgba(26,10,0,0.05)',
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        marginBottom: 24,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{
            position: 'absolute', left: 13, top: '50%',
            transform: 'translateY(-50%)',
            color: 'rgba(122,58,24,0.85)', pointerEvents: 'none',
          }} />
          <input
            type="text" placeholder="Search joiner, tour, or booking no…"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 36 }}
          />
        </div>
        {/* Status */}
        <div style={{ position: 'relative', minWidth: 175 }}>
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}
          >
            <option value="All Status">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Verification Pending">Verification Pending</option>
            <option value="Complete">Complete</option>
            <option value="Downpayment Paid">Downpayment Paid</option>
            <option value="Rejected">Rejected</option>
            <option value="Cancellation Requested">Cancellation Requested</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Awaiting Payment">Awaiting Payment</option>
            <option value="Balance Due">Balance Due</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.85)' }} />
        </div>
        {/* Payment method */}
        <div style={{ position: 'relative', minWidth: 175 }}>
          <select
            value={methodFilter} onChange={e => setMethodFilter(e.target.value)}
            style={{ ...inputStyle, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}
          >
            <option value="All Methods">All Methods</option>
            <option value="Full Payment">Full Payment</option>
            <option value="Downpayment">Downpayment</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.85)' }} />
        </div>
        {/* Tour */}
        <div style={{ position: 'relative', minWidth: 200 }}>
          <select
            value={tourFilter} onChange={e => setTourFilter(e.target.value)}
            style={{ ...inputStyle, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}
          >
            <option value="All Tours">All Tours</option>
            {tourOptions.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.85)' }} />
        </div>
        {/* Date */}
        <div style={{ position: 'relative', minWidth: 175 }}>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          />
        </div>
      </div>
 
      {/* ── Table Card ── */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        flexShrink: 0,
        background: '#FDF6EE',
        borderRadius: 22,
        border: '1px solid rgba(180,81,30,0.12)',
        boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: '0 0.25rem' }}><SkeletonTable rows={7} cols={6} label="Loading bookings" /></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: bookingGridCols, minWidth: 980 }}>
              {/* Header row */}
              <div style={thStyle}>Booking No.</div>
              <div style={thStyle}>Joiner Details</div>
              <div style={thStyle}>Tour / Destination</div>
              <div style={{ ...thStyle, justifyContent: 'center', textAlign: 'center' }}>Slots</div>
              <div style={thStyle}>Total Amount</div>
              <div style={thStyle}>Payment Method</div>
              <div style={thStyle}>Booking Status</div>
              <div style={{ ...thStyle, justifyContent: 'flex-end', textAlign: 'right' }}>Actions</div>
 
              {/* Body rows */}
              {filteredBookings.length > 0 ? (
                filteredBookings.map(booking => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    onView={() => setSelectedBooking(booking)}
                  />
                ))
              ) : (
                <div style={{ gridColumn: '1 / -1' }}>
                  {(searchTerm || statusFilter !== 'All Status' || methodFilter !== 'All Methods' || tourFilter !== 'All Tours' || dateFilter) ? (
                    <EmptyState
                      icon={SearchX}
                      title="No bookings match your filters"
                      message="Try another search, status, payment type, tour or date."
                      action={{ label: 'Clear Filters', onClick: () => { setSearchTerm(''); setStatusFilter('All Status'); setMethodFilter('All Methods'); setTourFilter('All Tours'); setDateFilter(''); } }}
                    />
                  ) : (
                    <EmptyState icon={ClipboardList} title="No bookings yet" message="When joiners book a tour, their bookings will show up here for you to manage." />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
 
      </div>
 
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onChanged={async () => { setSelectedBooking(null); await fetchBookings(); }}
          onStatusUpdate={async (id, status) => {
            const newBookingStatus = status === 'Confirmed' ? 'Completed' : 'Cancelled';
            const newPaymentStatus = status === 'Confirmed' ? 'Complete' : 'Rejected';
            const { error } = await supabase.from('bookings').update({
              booking_status: newBookingStatus,
              payment_status: newPaymentStatus,
            }).eq('id', id);
 
            if (!error) {
              sendBookingStatusEmail({ bookingId: id });
              // A rejected booking frees its slots: email anyone on the waitlist.
              if (status !== 'Confirmed') sendWaitlistOpeningsEmail({ tourId: selectedBooking.tour_id });

              notifyUser(selectedBooking.user_id, {
                title: status === 'Confirmed' ? 'Booking Confirmed 🎉' : 'Booking Update',
                message: status === 'Confirmed'
                  ? `Your payment for ${selectedBooking.tours?.title} has been verified. Your booking is confirmed!`
                  : `We weren't able to verify your payment for ${selectedBooking.tours?.title} (${selectedBooking.booking_number}). Please reach out to us.`,
                type: 'payment',
                related_id: selectedBooking.id,
              });

              toast.success(status === 'Confirmed' ? 'Payment confirmed' : 'Payment rejected', `${selectedBooking.booking_number}: the joiner has been notified.`);
              setSelectedBooking(null);
              fetchBookings();
            } else {
              toast.error("Couldn't update status", error.message);
            }
          }}
          onSettleBalance={async (id, fullAmount) => {
            const { data, error } = await supabase.from('bookings').update({
              balance_settled: true,
              balance_settled_at: new Date().toISOString(),
              amount_paid: fullAmount,
            }).eq('id', id).select(`
              *,
              tours ( title, destination, start_date, duration, price )
            `).single();
 
            if (!error) {
              toast.success('Balance marked as paid', `${selectedBooking.booking_number} is now paid in full.`);
              await fetchBookings();
              notifyUser(selectedBooking.user_id, {
                title: 'Balance Payment Confirmed',
                message: `Your remaining balance for ${selectedBooking.tours?.title} (${selectedBooking.booking_number}) has been marked as paid in full.`,
                type: 'payment',
                related_id: selectedBooking.id,
              });
              return data;
            } else {
              toast.error("Couldn't settle balance", error.message);
              return null;
            }
          }}
        />
      )}
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   BOOKING ROW
───────────────────────────────────────────── */
const BookingRow = ({ booking, onView }) => {
  const [hovered, setHovered] = useState(false);
  const cellStyle = {
    padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
    background: hovered ? 'rgba(180,81,30,0.04)' : 'transparent',
    borderBottom: '1px solid rgba(180,81,30,0.08)',
    transition: 'background 0.15s',
  };
  const rowHandlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };
 
  return (
    <>
      <div style={cellStyle} {...rowHandlers}>
        <p style={{ fontFamily: 'monospace', fontWeight: 700, color: '#A8481A', fontSize: 12, margin: 0 }}>
          {booking.booking_number || '—'}
        </p>
      </div>
      <div style={cellStyle} {...rowHandlers}>
        <p style={{ fontWeight: 900, color: '#1A0A00', fontSize: 13, margin: 0 }}>
          {booking.profiles ? `${booking.profiles.first_name || ''} ${booking.profiles.last_name || ''}`.trim() : booking.full_name || '—'}
        </p>
        <p style={{ color: '#7A3A18', opacity: 0.9, fontSize: 11, fontWeight: 600, margin: '3px 0 0' }}>
          {booking.profiles?.phone_number || booking.contact_number || '—'}
        </p>
      </div>
      <div style={cellStyle} {...rowHandlers}>
        <p style={{ fontWeight: 800, color: '#1A0A00', fontSize: 13, margin: 0 }}>{booking.tours?.title || '—'}</p>
        <p style={{ color: '#7A3A18', opacity: 0.9, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, margin: '3px 0 0' }}>
          <MapPin size={11} style={{ color: '#A8481A' }} /> {booking.tours?.destination}
        </p>
      </div>
      <div style={{ ...cellStyle, alignItems: 'center', textAlign: 'center', fontWeight: 900, color: '#1A0A00', fontSize: 13 }} {...rowHandlers}>
        {booking.slots_booked}
      </div>
      <div style={cellStyle} {...rowHandlers}>
        <p style={{ fontWeight: 900, color: '#A8481A', fontSize: 13, margin: 0 }}>
          {formatPeso(booking.total_price)}
        </p>
        {booking.payment_method === 'Downpayment' && (
          <p style={{ fontSize: 11, fontWeight: 800, color: booking.balance_settled ? '#A8481A' : '#8C5216', margin: '3px 0 0', letterSpacing: '0.04em' }}>
            Paid: {formatPeso(booking.amount_paid)}{booking.balance_settled ? ' (Full)' : ''}
          </p>
        )}
      </div>
      <div style={cellStyle} {...rowHandlers}>
        <PaymentMethodBadge method={booking.payment_method} />
      </div>
      <div style={cellStyle} {...rowHandlers}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
          <StatusBadge status={getShownStatus(booking)} wrap />
          {getBalanceStatus(booking) && <BalanceStatusBadge status={getBalanceStatus(booking)} />}
        </div>
      </div>
      <div style={{ ...cellStyle, alignItems: 'flex-end' }} {...rowHandlers}>
        <button
          onClick={onView}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#F2E4D0', color: '#1A0A00',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 900,
            fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
            padding: '9px 16px',
          }}
        >
          <Eye size={12} /> View Info
        </button>
      </div>
    </>
  );
};
 
/* ─────────────────────────────────────────────
   BOOKING DETAIL MODAL
───────────────────────────────────────────── */
const BookingDetailModal = ({ booking, onClose, onChanged, onStatusUpdate, onSettleBalance }) => {
  // Receipts are private: view them through a short-lived signed link.
  const receiptSrc = useReceiptUrl(booking.receipt_url);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [profile, setProfile] = useState(null);
  const [balanceSettled, setBalanceSettled] = useState(!!booking.balance_settled);
  const [balanceSettledAt, setBalanceSettledAt] = useState(booking.balance_settled_at || null);
  const [settlingBalance, setSettlingBalance] = useState(false);
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);
  const [balanceReceived, setBalanceReceived] = useState(false); // ticked in the confirm window
 
  useEffect(() => {
    const fetchProfile = async () => {
      if (!booking.user_id) return;
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone_number')
        .eq('id', booking.user_id)
        .single();
      if (data) setProfile(data);
    };
    fetchProfile();
  }, [booking.user_id]);
 
  const formatDateRange = (d, dur) => formatTourDates(d, dur) || '—';
 
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
 
  const handleConfirm = async () => {
    setConfirming(true);
    await onStatusUpdate(booking.id, 'Confirmed');
    setConfirming(false);
  };
 
  const handleReject = async () => {
    // Rejecting by mistake would tell the joiner their payment failed, so confirm first.
    if (!(await confirmDialog({ title: `Reject the payment for ${booking.booking_number}?`, message: 'The joiner will be notified and emailed that their payment was rejected.', confirmLabel: 'Reject Payment', cancelLabel: 'Go Back', tone: 'danger' }))) return;
    setRejecting(true);
    await onStatusUpdate(booking.id, 'Rejected');
    setRejecting(false);
  };
 
  const isPending = booking.payment_status === 'Pending' || booking.payment_status === 'Verification Pending';
  const isComplete = booking.payment_status === 'Complete';
  const isRejected = booking.payment_status === 'Rejected';
  const isCancelled = !isPending && booking.booking_status === 'Cancelled' && booking.payment_status !== 'Rejected';
  const cancelRequested = !!booking.cancellation_requested_at && !isCancelled && !isRejected && booking.booking_status !== 'Rejected';
  const derivedStatus = isPending ? booking.payment_status : (isRejected ? 'Rejected' : isCancelled ? 'Cancelled' : cancelRequested ? 'Cancellation Requested' : booking.payment_status);
  const shownStatus = derivedStatus === 'Complete' && owesBalance(booking) ? 'Downpayment Paid' : derivedStatus;
  const [deciding, setDeciding] = useState(null); // 'approve' | 'decline'

  // The joiner asked to cancel: approve (frees their slots) or decline (keeps the booking).
  const decideCancellation = async (approve) => {
    if (!(await confirmDialog(approve
      ? { title: 'Approve this cancellation?', message: `${booking.booking_number} will be cancelled and its ${booking.slots_booked} slot${booking.slots_booked === 1 ? '' : 's'} released. Payments are non-refundable.`, confirmLabel: 'Approve Cancellation', cancelLabel: 'Go Back', tone: 'danger' }
      : { title: 'Decline this cancellation?', message: 'The booking stays as it is, and the joiner is told their request was declined.', confirmLabel: 'Decline Request', cancelLabel: 'Go Back' }))) return;
    setDeciding(approve ? 'approve' : 'decline');
    const { error } = await supabase.from('bookings')
      .update(approve ? { booking_status: 'Cancelled' } : { cancellation_requested_at: null })
      .eq('id', booking.id);
    setDeciding(null);
    if (error) { toast.error("Couldn't update the booking", error.message); return; }
    notifyUser(booking.user_id, approve
      ? { title: 'Cancellation Approved', message: `Your cancellation for ${booking.tours?.title || 'your tour'} (${booking.booking_number}) has been approved, and your slot has been released.`, type: 'cancellation', related_id: booking.id }
      : { title: 'Cancellation Declined', message: `Your request to cancel ${booking.tours?.title || 'your tour'} (${booking.booking_number}) was declined, so your booking stays active. Please message us if you have questions.`, type: 'cancellation', related_id: booking.id });
    if (approve) {
      sendWaitlistOpeningsEmail({ tourId: booking.tour_id });
      sendCancellationApprovedEmail({ bookingId: booking.id });
    }
    toast.success(approve ? 'Cancellation approved' : 'Request declined', approve ? 'The slots were released and the joiner was notified and emailed.' : 'The booking stays active and the joiner was notified.');
    onChanged?.();
  };
 
  const subtotal = booking.total_price || 0;
  const amountPaid = balanceSettled ? subtotal : (booking.amount_paid || subtotal);
  const downpaymentAmount = downpaymentFor(subtotal);
  const balance = booking.payment_method === 'Downpayment' ? subtotal - downpaymentAmount : 0;
  const isDownpayment = booking.payment_method === 'Downpayment';
 
  const joinerName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || '—' : (booking.full_name || '—');
 
  const handleSettleBalance = async () => {
    setShowSettleConfirm(false);
    setSettlingBalance(true);
    const updated = await onSettleBalance(booking.id, subtotal);
    if (updated) {
      setBalanceSettled(true);
      setBalanceSettledAt(updated.balance_settled_at);
    }
    setSettlingBalance(false);
  };
 
  // The same till-style receipt joiners download, opened to print.
  const handlePrintReceipt = () => {
    printReceipt({
      ...booking,
      full_name: joinerName,
      balance_settled: balanceSettled || booking.balance_settled,
      balance_settled_at: balanceSettledAt || booking.balance_settled_at,
      amount_paid: balanceSettled ? subtotal : booking.amount_paid,
    }, booking.tours).catch((e) => toast.error("Couldn't create the receipt", e.message));
  };
 
 
  const labelStyle = {
    display: 'block',
    fontSize: 11, fontWeight: 800,
    letterSpacing: '0.2em', textTransform: 'uppercase',
    color: '#7A3A18', opacity: 0.9,
    marginBottom: 5,
  };
 
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 760,
        borderRadius: 24, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        overflow: 'hidden',
        borderTop: '6px solid #B4511E',
        maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column',
      }}>
 
        <ModalHeader
          name={joinerName}
          photo={profile?.avatar_url}
          label="Booking Details"
          title={booking.booking_number || 'N/A'}
          onClose={onClose}
        >
          <StatusBadge status={shownStatus} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7A3A18' }}>{joinerName}</span>
        </ModalHeader>

        {/* Scrollable Body */}
        <div className="responsive-modal-padding" style={{ overflowY: 'auto', flex: 1, padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 28 }}>
 
          <ViewSection title="Booking Information" icon={<Hash size={14} />}>
            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InfoItem label="Booking Number" value={booking.booking_number} mono />
              <InfoItem label="Booking Date" value={formatDateTime(booking.created_at)} />
            </div>
          </ViewSection>
 
          <ViewSection title="Joiner Information" icon={<User size={14} />}>
            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InfoItem
                label="Full Name"
                value={profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || '—' : booking.full_name || '—'}
              />
              <InfoItem label="Phone Number" value={profile?.phone_number || booking.contact_number || '—'} />
              <InfoItem label="Email Address" value={booking.email || '—'} />
            </div>
          </ViewSection>
 
          <ViewSection title="Tour Information" icon={<MapPin size={14} />}>
            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InfoItem label="Tour Name" value={booking.tours?.title || '—'} />
              <InfoItem label="Destination" value={booking.tours?.destination || '—'} />
              <InfoItem label="Tour Date" value={formatDateRange(booking.tours?.start_date, booking.tours?.duration)} />
              <InfoItem label="Quantity (pax)" value={`${booking.slots_booked} ${booking.slots_booked === 1 ? 'person' : 'persons'}`} />
            </div>
          </ViewSection>

          {booking.companions?.length > 0 && (
            <ViewSection title="Group Members" icon={<Users size={14} />}>
              <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {booking.companions.map((c, i) => (
                  <InfoItem key={i} label={`Person ${i + 2}`} value={`${c.full_name} · ${c.contact_number}`} />
                ))}
              </div>
            </ViewSection>
          )}
 
          <ViewSection title="Payment Information" icon={<CreditCard size={14} />}>
            <div style={{ background: '#F2E4D0', borderRadius: 18, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
 
              <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={labelStyle}>Payment Method</p>
                  <PaymentMethodBadge method={booking.payment_method} />
                </div>
                <div>
                  <p style={labelStyle}>Booking Status</p>
                  <StatusBadge status={shownStatus} wrap />
                </div>
                {isDownpayment && isComplete && (
                  <div>
                    <p style={labelStyle}>Balance Status</p>
                    <BalanceStatusBadge status={balanceSettled ? 'Fully Paid' : 'Balance Due'} />
                    {balanceSettled && balanceSettledAt && (
                      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '6px 0 0' }}>
                        Settled {formatDateTime(balanceSettledAt)}
                      </p>
                    )}
                  </div>
                )}
              </div>
 
              {/* Payment Breakdown */}
              <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#7A3A18', opacity: 0.9 }}>Quantity</span>
                  <span style={{ fontWeight: 700, color: '#1A0A00' }}>{booking.slots_booked} pax × {formatPeso((Number(booking.total_price) || 0) / (booking.slots_booked || 1))}{Number(booking.sale_discount) > 0 ? ' (sale)' : ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#7A3A18', opacity: 0.9 }}>Subtotal</span>
                  <span style={{ fontWeight: 700, color: '#1A0A00' }}>{formatPeso(subtotal)}</span>
                </div>
 
                {booking.payment_method === 'Downpayment' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.9 }}>Downpayment (40%)</span>
                      <span style={{ fontWeight: 700, color: '#8C5216' }}>{formatPeso(downpaymentAmount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.9 }}>Remaining Balance</span>
                      <span style={{ fontWeight: 700, color: 'rgba(122,58,24,0.85)' }}>{formatPeso(balance)}</span>
                    </div>
                  </>
                )}
 
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid rgba(180,81,30,0.18)', paddingTop: 12, marginTop: 4 }}>
                  <span style={{ fontWeight: 900, color: '#1A0A00', fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                    {booking.payment_method === 'Downpayment' ? 'Amount Paid (Due Now)' : 'Total Payment'}
                  </span>
                  <span style={{ fontWeight: 900, color: '#A8481A', fontSize: 22, letterSpacing: '-0.02em' }}>{formatPeso(amountPaid)}</span>
                </div>
              </div>
 
              {/* GCash Details */}
              {(booking.gcash_number || booking.gcash_reference_no) && (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={labelStyle}>GCash Details</p>
                  {booking.gcash_number && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.9 }}>GCash Number</span>
                      <span style={{ fontWeight: 700, color: '#1A0A00', fontFamily: 'monospace' }}>{booking.gcash_number}</span>
                    </div>
                  )}
                  {booking.gcash_reference_no && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.9 }}>Reference No.</span>
                      <span style={{ fontWeight: 700, color: '#1A0A00', fontFamily: 'monospace' }}>{booking.gcash_reference_no}</span>
                    </div>
                  )}
                </div>
              )}
 
              {/* Paid online through PayMongo: no receipt to check */}
              {booking.paymongo_payment_id ? (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14 }}>
                  <p style={labelStyle}>Online Payment (PayMongo)</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00', margin: 0, lineHeight: 1.7 }}>
                    Confirmed automatically{booking.paid_online_at ? ` on ${formatDateTime(booking.paid_online_at)}` : ''}.<br />
                    Payment ID: <span style={{ fontFamily: 'monospace' }}>{booking.paymongo_payment_id}</span>
                    {booking.paymongo_balance_payment_id && (
                      <><br />Balance payment ID: <span style={{ fontFamily: 'monospace' }}>{booking.paymongo_balance_payment_id}</span></>
                    )}
                  </p>
                </div>
              ) : booking.payment_status === 'Awaiting Payment' ? (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14 }}>
                  <p style={labelStyle}>Online Payment (PayMongo)</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: 0 }}>
                    The joiner hasn't finished paying yet. The slots are released automatically if they don't pay within 30 minutes.
                  </p>
                </div>
              ) : booking.receipt_url ? (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14 }}>
                  <p style={labelStyle}>Transaction Receipt</p>
                  <ReceiptThumb src={receiptSrc} onClick={() => setShowReceiptPreview(true)} />
                </div>
              ) : (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14 }}>
                  <p style={labelStyle}>Transaction Receipt</p>
                  <div style={{
                    border: '2px dashed rgba(180,81,30,0.25)', borderRadius: 16,
                    padding: '1.5rem', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)',
                  }}>
                    <ImageIcon size={26} style={{ marginBottom: 8 }} />
                    <p style={{ fontSize: 11, fontWeight: 700, margin: 0 }}>No receipt uploaded</p>
                  </div>
                </div>
              )}
            </div>
          </ViewSection>
 
          {/* Rejection Notice */}
          {isRejected && (
            <Notice
              color="#8C2F1C" bg="rgba(140,47,28,0.07)"
              icon={<AlertCircle size={20} />}
              title="Booking Rejected"
              text="This booking was rejected due to insufficient or unverifiable GCash payment. Please contact the joiner for clarification."
            />
          )}
 
          {/* Cancellation request: approve or decline */}
          {cancelRequested && (
            <div style={{ background: 'rgba(140,47,28,0.07)', border: '1px solid rgba(140,47,28,0.2)', borderRadius: 18, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <AlertCircle size={20} style={{ color: '#8C2F1C', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 900, color: '#8C2F1C', margin: 0 }}>Cancellation requested</p>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '4px 0 0', lineHeight: 1.6 }}>
                    Asked {formatDateTime(booking.cancellation_requested_at)}. Reason: “{booking.cancellation_reason || '—'}”.
                    {' '}The slots stay held until you decide. If no one decides within 12 hours, it's approved automatically.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => decideCancellation(true)} disabled={!!deciding} style={{ flex: '1 1 180px', padding: '12px 16px', borderRadius: 14, border: 'none', background: '#8C2F1C', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {deciding === 'approve' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} Approve Cancellation
                </button>
                <button type="button" onClick={() => decideCancellation(false)} disabled={!!deciding} style={{ flex: '1 1 160px', padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(180,81,30,0.3)', background: '#FDF6EE', color: '#A8481A', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {deciding === 'decline' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={14} />} Decline
                </button>
              </div>
            </div>
          )}

          {/* Cancellation Notice */}
          {isCancelled && (
            <Notice
              color="#1A0A00" bg="rgba(26,10,0,0.05)"
              icon={<XCircle size={20} />}
              title="Booking Cancelled"
              text={booking.cancellation_reason ? `Cancelled at the joiner's request (“${booking.cancellation_reason}”). The slot has been released back to the tour.` : 'This booking was cancelled. The slot has been released back to the tour.'}
            />
          )}
 
          {/* Confirmed Notice */}
          {isComplete && (
            <Notice
              color="#A8481A" bg="rgba(180,81,30,0.08)"
              icon={<CheckCircle2 size={20} />}
              title="Booking Confirmed"
              text="Payment has been verified and the booking is confirmed."
            />
          )}

          <BookingActivity bookingId={booking.id} />
        </div>
 
        {/* Footer: Action Buttons */}
        {isPending && (
          <div style={{
            padding: '1.5rem 2.5rem', borderTop: '1px solid rgba(180,81,30,0.12)',
            background: '#FDF6EE', display: 'flex', gap: 16, flexShrink: 0, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200, background: '#F2E4D0', borderRadius: 16, padding: '14px 18px' }}>
              <p style={labelStyle}>Admin Action Required</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '4px 0 0', lineHeight: 1.5 }}>
                Verify the GCash reference number and receipt screenshot before confirming.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button
                onClick={handleReject}
                disabled={rejecting || confirming}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '13px 22px',
                  background: 'rgba(140,47,28,0.1)', color: '#8C2F1C',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                  opacity: (rejecting || confirming) ? 0.5 : 1,
                }}
              >
                {rejecting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={14} />} Reject Payment
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming || rejecting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '13px 26px',
                  background: '#B4511E', color: '#FDF6EE',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                  boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
                  opacity: (confirming || rejecting) ? 0.5 : 1,
                }}
              >
                {confirming ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} Confirm Payment
              </button>
            </div>
          </div>
        )}
 
        {/* Footer: Balance settlement (Downpayment bookings) + Receipt printing */}
        {isComplete && (
          <div style={{
            padding: '1.5rem 2.5rem', borderTop: '1px solid rgba(180,81,30,0.12)',
            background: '#FDF6EE', display: 'flex', gap: 16, flexShrink: 0,
            flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {isDownpayment && !balanceSettled ? (
              <>
                <div style={{ flex: 1, minWidth: 200, background: 'rgba(140,47,28,0.08)', borderRadius: 16, padding: '14px 18px' }}>
                  <p style={{ ...labelStyle, color: '#8C2F1C' }}>Balance Due On Tour Day</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '4px 0 0', lineHeight: 1.5 }}>
                    Remaining balance of {formatPeso(balance)} is still unpaid. Mark it as paid once the joiner settles it on the day of the tour.
                  </p>
                </div>
                <button
                  onClick={() => { setBalanceReceived(false); setShowSettleConfirm(true); }}
                  disabled={settlingBalance}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '13px 26px',
                    background: '#B4511E', color: '#FDF6EE',
                    border: 'none', borderRadius: 999, cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 900,
                    fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                    boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
                    opacity: settlingBalance ? 0.5 : 1, flexShrink: 0,
                  }}
                >
                  {settlingBalance ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Wallet size={14} />} Mark Balance as Paid
                </button>
              </>
            ) : (
              <>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={labelStyle}>Payment Status</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#A8481A', margin: '4px 0 0' }}>
                    {isDownpayment
                      ? `Full payment received${balanceSettledAt ? ' — balance settled ' + formatDateTime(balanceSettledAt) : ''}.`
                      : 'Payment received in full.'}
                  </p>
                </div>
                <button
                  onClick={handlePrintReceipt}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '13px 26px',
                    background: '#1A0A00', color: '#E8A265',
                    border: 'none', borderRadius: 999, cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 900,
                    fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                    boxShadow: '0 6px 20px rgba(26,10,0,0.28)', flexShrink: 0,
                  }}
                >
                  <Printer size={14} /> Print Receipt
                </button>
              </>
            )}
          </div>
        )}
      </div>
 
      {/* Confirm Settle Balance Modal */}
      {showSettleConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10050,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(26,10,0,0.75)', backdropFilter: 'blur(4px)', padding: 16,
        }}>
          <div style={{
            position: 'relative', background: '#FDF6EE',
            width: '100%', maxWidth: 420,
            borderRadius: 24, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
            borderTop: '7px solid #B4511E',
            padding: '2rem',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(180,81,30,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 18, color: '#A8481A',
            }}>
              <Wallet size={26} />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', color: '#1A0A00', margin: '0 0 10px' }}>
              Confirm Balance Payment
            </h3>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#7A3A18', opacity: 0.9, margin: '0 0 24px', lineHeight: 1.6 }}>
              Confirm that the remaining balance of <strong style={{ color: '#1A0A00' }}>{formatPeso(balance)}</strong> for booking <strong style={{ color: '#1A0A00' }}>{booking.booking_number}</strong> has been paid in full.
            </p>
            {/* A second, deliberate step so the balance isn't marked paid by an accidental click. */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', margin: '-8px 0 22px',
              background: 'rgba(180,81,30,0.07)', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 14, padding: '10px 12px',
              fontSize: 12.5, fontWeight: 700, color: '#1A0A00', lineHeight: 1.5,
            }}>
              <input type="checkbox" checked={balanceReceived} onChange={(e) => setBalanceReceived(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 1, accentColor: '#B4511E', flexShrink: 0 }} />
              <span>I received {formatPeso(balance)} from {joinerName !== '—' ? joinerName : 'the joiner'}.</span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSettleConfirm(false)}
                style={{
                  padding: '12px 22px',
                  background: 'rgba(122,58,24,0.1)', color: '#7A3A18',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSettleBalance}
                disabled={!balanceReceived}
                title={balanceReceived ? undefined : 'Tick the box above first'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '12px 24px',
                  background: '#B4511E', color: '#FDF6EE',
                  border: 'none', borderRadius: 999, cursor: balanceReceived ? 'pointer' : 'not-allowed',
                  opacity: balanceReceived ? 1 : 0.45,
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                  boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
                }}
              >
                <CheckCircle2 size={14} /> Mark Balance as Paid
              </button>
            </div>
          </div>
        </div>
      )}
 
      {/* Receipt Full Preview */}
      {showReceiptPreview && receiptSrc && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.95)', padding: 16,
          }}
          onClick={() => setShowReceiptPreview(false)}
        >
          <button style={{
            position: 'absolute', top: 32, right: 32,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#FDF6EE',
          }}>
            <X size={40} />
          </button>
          <img src={receiptSrc} style={{ maxWidth: '100%', maxHeight: '90dvh', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }} alt="Receipt" />
        </div>
      )}
    </div>
  );
};       
 
/* ─────────────────────────────────────────────
   RECEIPT THUMBNAIL (helper)
───────────────────────────────────────────── */
const ReceiptThumb = ({ src, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', borderRadius: 16, overflow: 'hidden',
        cursor: 'pointer', border: '1px solid rgba(180,81,30,0.2)',
        boxShadow: '0 4px 14px rgba(26,10,0,0.1)',
      }}
    >
      <img src={src} style={{ width: '100%', height: 160, objectFit: 'cover', objectPosition: 'top', display: 'block', transform: hovered ? 'scale(1.03)' : 'scale(1)', transition: 'transform 0.3s' }} alt="GCash Receipt" />
      <div style={{
        position: 'absolute', inset: 0,
        background: hovered ? 'rgba(26,10,0,0.45)' : 'rgba(26,10,0,0)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.2s',
      }}>
        {hovered && (
          <span style={{
            background: 'rgba(253,246,238,0.95)', borderRadius: 999,
            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00',
          }}>
            <Eye size={12} /> View Full Receipt
          </span>
        )}
      </div>
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const ViewSection = ({ title, icon, children }) => (
  <section>
    <h4 style={{
      fontSize: 11, fontWeight: 900, letterSpacing: '0.25em',
      textTransform: 'uppercase', color: '#1A0A00',
      margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8,
      paddingBottom: 12, borderBottom: '1px solid rgba(180,81,30,0.12)',
    }}>
      <span style={{ color: '#A8481A' }}>{icon}</span> {title}
    </h4>
    {children}
  </section>
);
 
/* Who confirmed, rejected, moved or edited this booking, and when (booking_activity). */
const ACTIVITY_FIELD_LABELS = {
  payment_status: 'Payment status', booking_status: 'Booking status', tour_id: 'Tour',
  amount_paid: 'Amount paid', total_price: 'Total price', slots_booked: 'Slots',
  receipt_url: 'Receipt', gcash_reference_no: 'GCash reference', gcash_number: 'GCash number',
  payment_method: 'Payment method', balance_settled: 'Balance settled', cancellation_reason: 'Cancellation reason',
  full_name: 'Name', contact_number: 'Contact number', email: 'Email',
};

const BookingActivity = ({ bookingId }) => {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('booking_activity')
      .select('id, actor_name, action, changes, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Error loading booking activity:', error.message);
        if (active) setEntries(data || []);
      });
    return () => { active = false; };
  }, [bookingId]);

  const describe = (changes) => Object.keys(changes || {})
    .filter((k) => ACTIVITY_FIELD_LABELS[k] && typeof changes[k] === 'object' && changes[k] !== null && 'to' in changes[k])
    .map((k) => {
      const { from, to } = changes[k];
      if (k === 'receipt_url' || k === 'tour_id') return ACTIVITY_FIELD_LABELS[k] + ' changed';
      return `${ACTIVITY_FIELD_LABELS[k]}: ${from ?? '—'} → ${to ?? '—'}`;
    })
    .join(' · ');

  return (
    <ViewSection title="Activity" icon={<History size={14} />}>
      {entries === null ? (
        <SkeletonLines lines={3} label="Loading activity" />
      ) : entries.length === 0 ? (
        <p style={{ fontSize: 12, color: '#7A3A18', margin: 0 }}>No activity recorded yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map((e) => (
            <div key={e.id} style={{ borderLeft: '3px solid rgba(180,81,30,0.35)', paddingLeft: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: 0 }}>
                {e.action} <span style={{ fontWeight: 600, color: '#7A3A18' }}>by {e.actor_name}</span>
              </p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0' }}>
                {new Date(e.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                {describe(e.changes) && ` · ${describe(e.changes)}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </ViewSection>
  );
};

const InfoItem = ({ label, value, mono = false }) => (
  <div>
    <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A3A18', margin: '0 0 4px' }}>
      {label}
    </p>
    <p style={{ fontSize: 15, fontWeight: 800, color: '#1A0A00', margin: 0, fontFamily: mono ? 'monospace' : 'inherit' }}>
      {value || '—'}
    </p>
  </div>
);
 
const Notice = ({ color, bg, icon, title, text }) => (
  <div style={{
    background: bg, borderRadius: 18, padding: '1.25rem 1.5rem',
    border: `1px solid ${color}33`, display: 'flex', gap: 14,
  }}>
    <span style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</span>
    <div>
      <p style={{ fontSize: 13, fontWeight: 900, color, margin: '0 0 4px' }}>{title}</p>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0, lineHeight: 1.6 }}>{text}</p>
    </div>
  </div>
);
 
const STATUS_STYLES = {
  Pending: { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
  'Verification Pending': { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
  Complete: { bg: 'rgba(180,81,30,0.14)', color: '#A8481A' },
  Verified: { bg: 'rgba(180,81,30,0.14)', color: '#A8481A' },
  Rejected: { bg: 'rgba(140,47,28,0.14)', color: '#8C2F1C' },
  Cancelled: { bg: 'rgba(26,10,0,0.08)', color: 'rgba(26,10,0,0.8)' },
  'Cancellation Requested': { bg: 'rgba(140,47,28,0.12)', color: '#8C2F1C' },
  'Downpayment Paid': { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
  'Awaiting Payment': { bg: 'rgba(63,93,98,0.14)', color: '#3F5D62' },
  Expired: { bg: 'rgba(26,10,0,0.08)', color: 'rgba(26,10,0,0.8)' },
};
 
// wrap: long labels (e.g. Cancellation Requested) go onto two lines instead of
// spilling into the next column.
const StatusBadge = ({ status, large = false, wrap = false }) => {
  const { bg, color } = STATUS_STYLES[status] || STATUS_STYLES.Pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: large ? color : bg,
      color: large ? '#FDF6EE' : color,
      borderRadius: 999,
      padding: large ? '7px 18px' : '4px 12px',
      fontSize: large ? 11 : 9,
      fontWeight: 900, letterSpacing: wrap ? '0.1em' : '0.16em', textTransform: 'uppercase',
      whiteSpace: wrap ? 'normal' : 'nowrap', lineHeight: wrap ? 1.35 : undefined, maxWidth: '100%',
    }}>
      {status || 'Pending'}
    </span>
  );
};
 
const BALANCE_STATUS_STYLES = {
  'Fully Paid': { bg: 'rgba(180,81,30,0.14)', color: '#A8481A' },
  'Balance Due': { bg: 'rgba(140,47,28,0.12)', color: '#8C2F1C' },
};
 
const BalanceStatusBadge = ({ status }) => {
  const { bg, color } = BALANCE_STATUS_STYLES[status] || BALANCE_STATUS_STYLES['Balance Due'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, color, borderRadius: 999,
      padding: '3px 10px', fontSize: 11,
      fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      <Wallet size={9} /> {status}
    </span>
  );
};
 
const PAYMENT_METHOD_STYLES = {
  'Full Payment': { bg: 'rgba(122,58,24,0.12)', color: '#7A3A18' },
  Downpayment: { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
};
 
const PaymentMethodBadge = ({ method }) => {
  if (!method) return <span style={{ color: '#7A3A18', fontSize: 11, fontWeight: 700 }}>—</span>;
  const { bg, color } = PAYMENT_METHOD_STYLES[method] || { bg: 'rgba(180,81,30,0.1)', color: '#7A3A18' };
  const Icon = method === 'Downpayment' ? Wallet : CreditCard;
  return (
    // Sized to its text (not stretched to the column), like the status badges beside it.
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', width: 'fit-content',
      background: bg, color, borderRadius: 999,
      padding: '4px 11px', fontSize: 10, fontWeight: 900,
      letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      <Icon size={11} /> {method}
    </span>
  );
};
 
export default BookingManagement;