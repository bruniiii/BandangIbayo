import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  Search, MapPin, Loader2, Eye, X, CheckCircle2, XCircle, Calendar,
  Hash, User, CreditCard, AlertCircle, Image as ImageIcon, ChevronDown,
} from 'lucide-react';
 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent / confirm)
// #E8A265  warm amber (highlight / pending)
// #FDF6EE  cream (light bg)
// #F2E4D0  parchment (section bg)
// #7A3A18  rust mid-tone (secondary text)
// #8C2F1C  oxblood (reject / danger — extends palette for booking actions)
// ---------------------------------------------------------
 
const getDerivedStatus = (b) => (
  b.payment_status === 'Rejected' ? 'Rejected' :
  b.booking_status === 'Cancelled' ? 'Cancelled' :
  b.payment_status
);
 
/* ─────────────────────────────────────────────
   BOOKING MANAGEMENT  (Admin)
───────────────────────────────────────────── */
const BookingManagement = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [methodFilter, setMethodFilter] = useState('All Methods');
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
 
  const filteredBookings = bookings.filter(b => {
    const matchesSearch =
      (b.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.tours?.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.booking_number || '').toLowerCase().includes(searchTerm.toLowerCase());
    const derived = getDerivedStatus(b);
    const matchesStatus = statusFilter === 'All Status' || derived === statusFilter;
    const matchesMethod = methodFilter === 'All Methods' || b.payment_method === methodFilter;
    return matchesSearch && matchesStatus && matchesMethod;
  });
 
  // ── shared input style ──
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#F2E4D0',
    border: '1px solid rgba(196,92,38,0.18)',
    borderRadius: 14,
    padding: '10px 14px',
    fontSize: 13, fontWeight: 600,
    color: '#1A0A00',
    fontFamily: 'inherit',
    outline: 'none',
  };
 
  const thStyle = {
    padding: '14px 20px',
    fontSize: 9, fontWeight: 900, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: 'rgba(122,58,24,0.6)',
    textAlign: 'left', whiteSpace: 'nowrap',
  };
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
 
      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        borderBottom: '1px solid rgba(196,92,38,0.15)',
        paddingBottom: 16, marginBottom: 20, gap: 20, flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', color: '#1A0A00', margin: '0 0 6px' }}>
            Manage Booking Records
          </h2>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.7, margin: 0, maxWidth: 540, lineHeight: 1.6 }}>
            Verify GCash payments, track downpayments, and update booking status across all joiner reservations.
          </p>
        </div>
      </div>
 
      {/* ── Filters ── */}
      <div style={{
        background: '#FDF6EE',
        borderRadius: 20, padding: '14px 18px',
        border: '1px solid rgba(196,92,38,0.12)',
        boxShadow: '0 4px 16px rgba(26,10,0,0.05)',
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        marginBottom: 24,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{
            position: 'absolute', left: 13, top: '50%',
            transform: 'translateY(-50%)',
            color: 'rgba(122,58,24,0.35)', pointerEvents: 'none',
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
            <option value="Rejected">Rejected</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.35)' }} />
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
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.35)' }} />
        </div>
      </div>
 
      {/* ── Table Card ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: '#FDF6EE',
        borderRadius: 22,
        border: '1px solid rgba(196,92,38,0.12)',
        boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '5rem 0', color: 'rgba(122,58,24,0.4)',
          }}>
            <Loader2 size={30} style={{ marginBottom: 10, animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
              Loading Records…
            </p>
          </div>
        ) : (
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F2E4D0' }}>
                  <th style={thStyle}>Booking No.</th>
                  <th style={thStyle}>Joiner Details</th>
                  <th style={thStyle}>Tour / Destination</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Slots</th>
                  <th style={thStyle}>Total Amount</th>
                  <th style={thStyle}>Payment Method</th>
                  <th style={thStyle}>Booking Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length > 0 ? (
                  filteredBookings.map(booking => (
                    <BookingRow
                      key={booking.id}
                      booking={booking}
                      onView={() => setSelectedBooking(booking)}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" style={{ padding: '5rem 0', textAlign: 'center' }}>
                      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.4)', margin: 0 }}>
                        No booking records found.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
 
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onStatusUpdate={async (id, status) => {
            const newBookingStatus = status === 'Confirmed' ? 'Completed' : 'Cancelled';
            const newPaymentStatus = status === 'Confirmed' ? 'Complete' : 'Rejected';
            const { error } = await supabase.from('bookings').update({
              booking_status: newBookingStatus,
              payment_status: newPaymentStatus,
            }).eq('id', id);
 
            if (!error) {
              setSelectedBooking(null);
              fetchBookings();
            } else {
              alert('Error updating status: ' + error.message);
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
  const tdStyle = { padding: '16px 20px', verticalAlign: 'middle' };
 
  return (
    <tr
      style={{ background: hovered ? 'rgba(196,92,38,0.04)' : 'transparent', borderBottom: '1px solid rgba(196,92,38,0.08)', transition: 'background 0.15s' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={tdStyle}>
        <p style={{ fontFamily: 'monospace', fontWeight: 700, color: '#C45C26', fontSize: 12, margin: 0 }}>
          {booking.booking_number || '—'}
        </p>
      </td>
      <td style={tdStyle}>
        <p style={{ fontWeight: 900, color: '#1A0A00', fontSize: 13, margin: 0 }}>
          {booking.profiles ? `${booking.profiles.first_name || ''} ${booking.profiles.last_name || ''}`.trim() : booking.full_name || '—'}
        </p>
        <p style={{ color: '#7A3A18', opacity: 0.55, fontSize: 11, fontWeight: 600, margin: '3px 0 0' }}>
          {booking.profiles?.phone_number || booking.contact_number || '—'}
        </p>
      </td>
      <td style={tdStyle}>
        <p style={{ fontWeight: 800, color: '#1A0A00', fontSize: 13, margin: 0 }}>{booking.tours?.title || '—'}</p>
        <p style={{ color: '#7A3A18', opacity: 0.55, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, margin: '3px 0 0' }}>
          <MapPin size={11} style={{ color: '#C45C26' }} /> {booking.tours?.destination}
        </p>
      </td>
      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, color: '#1A0A00', fontSize: 13 }}>
        {booking.slots_booked}
      </td>
      <td style={tdStyle}>
        <p style={{ fontWeight: 900, color: '#C45C26', fontSize: 13, margin: 0 }}>
          ₱{booking.total_price?.toLocaleString()}
        </p>
        {booking.payment_method === 'Downpayment' && (
          <p style={{ fontSize: 9, fontWeight: 800, color: '#9A5B1E', margin: '3px 0 0', letterSpacing: '0.04em' }}>
            Paid: ₱{booking.amount_paid?.toLocaleString()}
          </p>
        )}
      </td>
      <td style={tdStyle}>
        <PaymentMethodBadge method={booking.payment_method} />
      </td>
      <td style={tdStyle}>
        <StatusBadge status={getDerivedStatus(booking)} />
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        <button
          onClick={onView}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#F2E4D0', color: '#1A0A00',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 900,
            fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
            padding: '9px 16px',
          }}
        >
          <Eye size={12} /> View Info
        </button>
      </td>
    </tr>
  );
};
 
/* ─────────────────────────────────────────────
   BOOKING DETAIL MODAL
───────────────────────────────────────────── */
const BookingDetailModal = ({ booking, onClose, onStatusUpdate }) => {
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [profile, setProfile] = useState(null);
 
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
 
  const formatDateRange = (dateString, duration) => {
    if (!dateString) return '—';
    const [year, month, day] = dateString.split('-').map(Number);
    const daysMatch = duration ? duration.match(/(\d+)\s*day/i) : null;
    const numDays = daysMatch ? parseInt(daysMatch[1]) : 1;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const startDate = new Date(year, month - 1, day);
    const endDate = new Date(year, month - 1, day + numDays - 1);
    const startMonth = monthNames[startDate.getMonth()];
    const endMonth = monthNames[endDate.getMonth()];
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    if (numDays <= 1) return `${startMonth} ${startDate.getDate()}, ${startYear}`;
    if (startMonth === endMonth && startYear === endYear) return `${startMonth} ${startDate.getDate()} - ${endDate.getDate()}, ${startYear}`;
    if (startYear === endYear) return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}, ${startYear}`;
    return `${startMonth} ${startDate.getDate()}, ${startYear} - ${endMonth} ${endDate.getDate()}, ${endYear}`;
  };
 
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
    setRejecting(true);
    await onStatusUpdate(booking.id, 'Rejected');
    setRejecting(false);
  };
 
  const isPending = booking.payment_status === 'Pending' || booking.payment_status === 'Verification Pending';
  const isComplete = booking.payment_status === 'Complete';
  const isRejected = booking.payment_status === 'Rejected';
  const isCancelled = booking.booking_status === 'Cancelled' && booking.payment_status !== 'Rejected';
  const derivedStatus = isRejected ? 'Rejected' : isCancelled ? 'Cancelled' : booking.payment_status;
 
  const subtotal = booking.total_price || 0;
  const amountPaid = booking.amount_paid || subtotal;
  const downpaymentAmount = Math.round(subtotal * 0.4);
  const balance = booking.payment_method === 'Downpayment' ? subtotal - downpaymentAmount : 0;
 
  const accentColor = isRejected ? '#8C2F1C' : isCancelled ? '#1A0A00' : isComplete ? '#C45C26' : '#E8A265';
 
  const labelStyle = {
    display: 'block',
    fontSize: 9, fontWeight: 800,
    letterSpacing: '0.2em', textTransform: 'uppercase',
    color: '#7A3A18', opacity: 0.7,
    marginBottom: 5,
  };
 
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 760,
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        overflow: 'hidden',
        borderTop: `8px solid ${accentColor}`,
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
      }}>
 
        {/* Header */}
        <div style={{
          background: '#1A0A00', padding: '2rem 2.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(232,210,190,0.4)', margin: '0 0 6px' }}>
              Booking Details
            </p>
            <h2 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', color: '#FDF6EE', margin: 0 }}>
              {booking.booking_number || 'N/A'}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <StatusBadge status={derivedStatus} large />
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(232,210,190,0.5)', padding: 0 }}>
              <X size={24} />
            </button>
          </div>
        </div>
 
        {/* Scrollable Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 28 }}>
 
          <ViewSection title="Booking Information" icon={<Hash size={14} />}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InfoItem label="Booking Number" value={booking.booking_number} mono />
              <InfoItem label="Booking Date" value={formatDateTime(booking.created_at)} />
            </div>
          </ViewSection>
 
          <ViewSection title="Joiner Information" icon={<User size={14} />}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InfoItem
                label="Full Name"
                value={profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || '—' : booking.full_name || '—'}
              />
              <InfoItem label="Phone Number" value={profile?.phone_number || booking.contact_number || '—'} />
              <InfoItem label="Email Address" value={booking.email || '—'} />
            </div>
          </ViewSection>
 
          <ViewSection title="Tour Information" icon={<MapPin size={14} />}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InfoItem label="Tour Name" value={booking.tours?.title || '—'} />
              <InfoItem label="Destination" value={booking.tours?.destination || '—'} />
              <InfoItem label="Tour Date" value={formatDateRange(booking.tours?.start_date, booking.tours?.duration)} />
              <InfoItem label="Quantity (pax)" value={`${booking.slots_booked} ${booking.slots_booked === 1 ? 'person' : 'persons'}`} />
            </div>
          </ViewSection>
 
          <ViewSection title="Payment Information" icon={<CreditCard size={14} />}>
            <div style={{ background: '#F2E4D0', borderRadius: 18, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
 
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={labelStyle}>Payment Method</p>
                  <PaymentMethodBadge method={booking.payment_method} />
                </div>
                <div>
                  <p style={labelStyle}>Booking Status</p>
                  <StatusBadge status={booking.booking_status} />
                </div>
              </div>
 
              {/* Payment Breakdown */}
              <div style={{ borderTop: '1px solid rgba(196,92,38,0.18)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#7A3A18', opacity: 0.7 }}>Quantity</span>
                  <span style={{ fontWeight: 700, color: '#1A0A00' }}>{booking.slots_booked} pax × ₱{booking.tours?.price?.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#7A3A18', opacity: 0.7 }}>Subtotal</span>
                  <span style={{ fontWeight: 700, color: '#1A0A00' }}>₱{subtotal.toLocaleString()}</span>
                </div>
 
                {booking.payment_method === 'Downpayment' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.7 }}>Downpayment (40%)</span>
                      <span style={{ fontWeight: 700, color: '#9A5B1E' }}>₱{downpaymentAmount.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.7 }}>Remaining Balance</span>
                      <span style={{ fontWeight: 700, color: 'rgba(122,58,24,0.55)' }}>₱{balance.toLocaleString()}</span>
                    </div>
                  </>
                )}
 
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid rgba(196,92,38,0.18)', paddingTop: 12, marginTop: 4 }}>
                  <span style={{ fontWeight: 900, color: '#1A0A00', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                    {booking.payment_method === 'Downpayment' ? 'Amount Paid (Due Now)' : 'Total Payment'}
                  </span>
                  <span style={{ fontWeight: 900, color: '#C45C26', fontSize: 22, letterSpacing: '-0.02em' }}>₱{amountPaid.toLocaleString()}</span>
                </div>
              </div>
 
              {/* GCash Details */}
              {(booking.gcash_number || booking.gcash_reference_no) && (
                <div style={{ borderTop: '1px solid rgba(196,92,38,0.18)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={labelStyle}>GCash Details</p>
                  {booking.gcash_number && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.7 }}>GCash Number</span>
                      <span style={{ fontWeight: 700, color: '#1A0A00', fontFamily: 'monospace' }}>{booking.gcash_number}</span>
                    </div>
                  )}
                  {booking.gcash_reference_no && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.7 }}>Reference No.</span>
                      <span style={{ fontWeight: 700, color: '#1A0A00', fontFamily: 'monospace' }}>{booking.gcash_reference_no}</span>
                    </div>
                  )}
                </div>
              )}
 
              {/* Receipt Screenshot */}
              {booking.receipt_url ? (
                <div style={{ borderTop: '1px solid rgba(196,92,38,0.18)', paddingTop: 14 }}>
                  <p style={labelStyle}>Transaction Receipt</p>
                  <ReceiptThumb src={booking.receipt_url} onClick={() => setShowReceiptPreview(true)} />
                </div>
              ) : (
                <div style={{ borderTop: '1px solid rgba(196,92,38,0.18)', paddingTop: 14 }}>
                  <p style={labelStyle}>Transaction Receipt</p>
                  <div style={{
                    border: '2px dashed rgba(196,92,38,0.25)', borderRadius: 16,
                    padding: '1.5rem', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.35)',
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
 
          {/* Cancellation Notice */}
          {isCancelled && (
            <Notice
              color="#1A0A00" bg="rgba(26,10,0,0.05)"
              icon={<XCircle size={20} />}
              title="Booking Cancelled by Joiner"
              text="This booking was cancelled by the joiner. The slot has been released back to the tour."
            />
          )}
 
          {/* Confirmed Notice */}
          {isComplete && (
            <Notice
              color="#C45C26" bg="rgba(196,92,38,0.08)"
              icon={<CheckCircle2 size={20} />}
              title="Booking Confirmed"
              text="Payment has been verified and the booking is confirmed."
            />
          )}
        </div>
 
        {/* Footer: Action Buttons */}
        {isPending && (
          <div style={{
            padding: '1.5rem 2.5rem', borderTop: '1px solid rgba(196,92,38,0.12)',
            background: '#FDF6EE', display: 'flex', gap: 16, flexShrink: 0, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200, background: '#F2E4D0', borderRadius: 16, padding: '14px 18px' }}>
              <p style={labelStyle}>Admin Action Required</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.75, margin: '4px 0 0', lineHeight: 1.5 }}>
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
                  fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                  opacity: (rejecting || confirming) ? 0.5 : 1,
                }}
              >
                {rejecting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={14} />} Reject
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming || rejecting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '13px 26px',
                  background: '#C45C26', color: '#FDF6EE',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                  boxShadow: '0 6px 20px rgba(196,92,38,0.35)',
                  opacity: (confirming || rejecting) ? 0.5 : 1,
                }}
              >
                {confirming ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} Confirm
              </button>
            </div>
          </div>
        )}
      </div>
 
      {/* Receipt Full Preview */}
      {showReceiptPreview && booking.receipt_url && (
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
          <img src={booking.receipt_url} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }} alt="Receipt" />
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
        cursor: 'pointer', border: '1px solid rgba(196,92,38,0.2)',
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
            fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00',
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
      fontSize: 9, fontWeight: 900, letterSpacing: '0.25em',
      textTransform: 'uppercase', color: '#1A0A00',
      margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8,
      paddingBottom: 12, borderBottom: '1px solid rgba(196,92,38,0.12)',
    }}>
      <span style={{ color: '#C45C26' }}>{icon}</span> {title}
    </h4>
    {children}
  </section>
);
 
const InfoItem = ({ label, value, mono = false }) => (
  <div>
    <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, margin: '0 0 5px' }}>
      {label}
    </p>
    <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: 0, fontFamily: mono ? 'monospace' : 'inherit' }}>
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
      <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.8, margin: 0, lineHeight: 1.6 }}>{text}</p>
    </div>
  </div>
);
 
const STATUS_STYLES = {
  Pending: { bg: 'rgba(232,162,101,0.25)', color: '#9A5B1E' },
  'Verification Pending': { bg: 'rgba(232,162,101,0.25)', color: '#9A5B1E' },
  Complete: { bg: 'rgba(196,92,38,0.14)', color: '#C45C26' },
  Verified: { bg: 'rgba(196,92,38,0.14)', color: '#C45C26' },
  Rejected: { bg: 'rgba(140,47,28,0.14)', color: '#8C2F1C' },
  Cancelled: { bg: 'rgba(26,10,0,0.08)', color: 'rgba(26,10,0,0.55)' },
};
 
const StatusBadge = ({ status, large = false }) => {
  const { bg, color } = STATUS_STYLES[status] || STATUS_STYLES.Pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: large ? color : bg,
      color: large ? '#FDF6EE' : color,
      borderRadius: 999,
      padding: large ? '7px 18px' : '4px 12px',
      fontSize: large ? 11 : 9,
      fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {status || 'Pending'}
    </span>
  );
};
 
const PAYMENT_METHOD_STYLES = {
  'Full Payment': { bg: 'rgba(26,10,0,0.06)', color: '#1A0A00' },
  Downpayment: { bg: 'rgba(232,162,101,0.25)', color: '#9A5B1E' },
};
 
const PaymentMethodBadge = ({ method }) => {
  if (!method) return <span style={{ color: 'rgba(122,58,24,0.4)', fontSize: 11, fontWeight: 700 }}>—</span>;
  const { bg, color } = PAYMENT_METHOD_STYLES[method] || { bg: 'rgba(196,92,38,0.1)', color: '#7A3A18' };
  return (
    <span style={{
      background: bg, color, borderRadius: 999,
      padding: '4px 12px', fontSize: 9, fontWeight: 900,
      letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {method}
    </span>
  );
};
 
export default BookingManagement;