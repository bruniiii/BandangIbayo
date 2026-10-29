import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import EmptyState from './ui/EmptyState';
import { SearchX, ClipboardList } from 'lucide-react';
import { toast } from './ui/toast';
import { sendBookingStatusEmail, sendWaitlistOpeningsEmail } from "./Email";
import { notifyUser } from './notifications';
import { formatPeso, CANCELLATION_APPROVAL_HOURS } from './tourUtils';
import { Search, MapPin, Eye, AlertCircle, ChevronDown, Wallet, Clock } from 'lucide-react';
import { SkeletonTable } from './ui/Skeleton';
import { StatusBadge, BalanceStatusBadge, PaymentMethodBadge } from './BookingBadges';
import { getBalanceStatus, balanceOwed, owesBalance, getShownStatus } from './bookingStatus';
import { BookingDetailModal } from './BookingDetailModal';

 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent / confirm)
// #E8A265  warm amber (highlight / pending)
// #FDF6EE  cream (light bg)
// #F2E4D0  parchment (section bg)
// #7A3A18  rust mid-tone (secondary text)
// #8C2F1C  oxblood (reject / danger — extends palette for booking actions)
// ---------------------------------------------------------
 
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
 
  // Loads quietly: the page starts in its loading state, and later reloads
  // (live updates, after an action) just swap in the new rows.
  const fetchBookings = async () => {
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
      // Unpaid checkouts aren't bookings yet: they're held only while the
      // joiner pays, and cancelled automatically if they don't.
      .not('payment_status', 'in', '("Awaiting Payment","Expired")')
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
    // Loads data when the page opens; its state updates happen after the request returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
 
  // The chosen tour counts only while the selected date still includes it;
  // otherwise the filter acts as All Tours.
  const activeTourFilter = tourFilter !== 'All Tours' && !tourOptions.some(t => String(t.id) === String(tourFilter))
    ? 'All Tours' : tourFilter;
 
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
    const matchesTour = activeTourFilter === 'All Tours' || String(b.tour_id) === String(activeTourFilter);
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
            <span style={{ fontWeight: 600, color: '#7A3A18' }}>Approve them, or they're approved automatically within {CANCELLATION_APPROVAL_HOURS} hours.</span>
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
            value={activeTourFilter} onChange={e => setTourFilter(e.target.value)}
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
                  {(searchTerm || statusFilter !== 'All Status' || methodFilter !== 'All Methods' || activeTourFilter !== 'All Tours' || dateFilter) ? (
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
 
export default BookingManagement;