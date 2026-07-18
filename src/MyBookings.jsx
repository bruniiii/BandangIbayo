import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { 
  ShoppingBag, MapPin, Calendar,
  ChevronRight, Loader2, X,
  History, Trash2, ShieldAlert, MessageSquare
} from 'lucide-react';
 
const MyBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Upcoming'); 
  const [selectedBooking, setSelectedBooking] = useState(null);
  
 
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split('-');
    return `${month}-${day}-${year}`;
  };
 
  const formatDateRange = (dateString, duration) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split('-').map(Number);
 
    const daysMatch = duration ? duration.match(/(\d+)\s*day/i) : null;
    const numDays = daysMatch ? parseInt(daysMatch[1]) : 1;
 
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 
    const startDate = new Date(year, month - 1, day);
    const endDate = new Date(year, month - 1, day + numDays - 1);
 
    const startMonth = monthNames[startDate.getMonth()];
    const endMonth = monthNames[endDate.getMonth()];
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
 
    if (numDays <= 1) {
      return `${startMonth} ${startDate.getDate()}, ${startYear}`;
    } else if (startMonth === endMonth && startYear === endYear) {
      return `${startMonth} ${startDate.getDate()} - ${endDate.getDate()}, ${startYear}`;
    } else if (startYear === endYear) {
      return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}, ${startYear}`;
    } else {
      return `${startMonth} ${startDate.getDate()}, ${startYear} - ${endMonth} ${endDate.getDate()}, ${endYear}`;
    }
  };
 
  const fetchMyBookings = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) { setLoading(false); return; }
 
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        tours (
          title,
          destination,
          start_date,
          end_date,
          duration,
          image_urls,
          price
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
 
    if (error) {
      console.error('Error fetching bookings:', error.message);
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
 
      const processedBookings = (data || []).map(booking => {
        const endDate = new Date(booking.tours?.end_date);
        const isPastTour = endDate < today;
        const isVerified = booking.payment_status === 'Complete' || booking.booking_status === 'Completed';
        return { ...booking, isActuallyCompleted: isVerified && isPastTour };
      });
 
      setBookings(processedBookings);
    }
    setLoading(false);
  }, []);
 
  useEffect(() => {
    const initFetch = async () => { await fetchMyBookings(); };
    initFetch();
    
    const channel = supabase
      .channel('my-booking-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchMyBookings();
      })
      .subscribe();
 
    return () => { supabase.removeChannel(channel); };
  }, [fetchMyBookings]);
 
  const filteredBookings = bookings.filter(b => {
    if (activeTab === 'Upcoming') return !b.isActuallyCompleted && b.booking_status !== 'Cancelled' && b.booking_status !== 'Rejected';
    if (activeTab === 'Completed') return b.isActuallyCompleted;
    if (activeTab === 'Cancelled') return b.booking_status === 'Cancelled' || b.booking_status === 'Rejected';
    return true;
  });
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header / Tabs ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
        gap: 20, borderBottom: '1px solid rgba(196,92,38,0.12)', paddingBottom: 24,
      }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', opacity: 0.7, margin: '4px 0 0' }}>
            Track your adventures and manage your reservations.
          </p>
        </div>
        <div style={{ display: 'flex', background: '#F2E4D0', padding: 6, borderRadius: 16, width: '100%', maxWidth: 380 }}>
          {['Upcoming', 'Completed', 'Cancelled'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 12,
                fontSize: 10, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase',
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: activeTab === tab ? '#FDF6EE' : 'transparent',
                color: activeTab === tab ? '#1A0A00' : 'rgba(122,58,24,0.7)',
                boxShadow: activeTab === tab ? '0 2px 8px rgba(26,10,0,0.08)' : 'none',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bookings List ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading ? (
          <div style={{ padding: '5rem 0', textAlign: 'center', color: 'rgba(122,58,24,0.4)' }}>
            <Loader2 size={36} className="animate-spin" style={{ marginBottom: 14, color: '#C45C26' }} />
            <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
              Retrieving your trips…
            </p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div style={{
            padding: '5rem 0', textAlign: 'center', background: '#FDF6EE',
            borderRadius: 28, border: '2px dashed rgba(196,92,38,0.2)',
          }}>
            <div style={{
              width: 80, height: 80, background: '#F2E4D0', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
            }}>
              <ShoppingBag size={32} style={{ color: 'rgba(196,92,38,0.25)' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              No {activeTab} Bookings
            </h3>
          </div>
        ) : (
          filteredBookings.map((booking) => (
            <BookingListItem
              key={booking.id}
              booking={booking}
              onView={() => setSelectedBooking(booking)}
              formatDate={formatDate}
              formatDateRange={formatDateRange}
            />
          ))
        )}
      </div>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          formatDate={formatDate}
          formatDateRange={formatDateRange}
          onCancelSuccess={() => {
            setSelectedBooking(null);
            fetchMyBookings();
          }}
        />
      )}
    </div>
  );
};

/* ─── Booking List Card (mirrors TourManagement's card language) ─── */
const BookingListItem = ({ booking, onView, formatDateRange }) => {
  const [hovered, setHovered] = useState(false);
  const tour = booking.tours || {};
  return (
    <div
      style={{
        background: '#FDF6EE', borderRadius: 24,
        border: '1px solid rgba(196,92,38,0.12)',
        boxShadow: hovered ? '0 12px 36px rgba(26,10,0,0.1)' : '0 4px 16px rgba(26,10,0,0.05)',
        transition: 'all 0.25s',
        padding: '1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ width: 168, height: 112, borderRadius: 18, overflow: 'hidden', flexShrink: 0, background: '#F2E4D0' }}>
        {tour.image_urls?.[0]
          ? <img src={tour.image_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.2)' }}><ShoppingBag size={28} /></div>
        }
      </div>

      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            background: '#F2E4D0', borderRadius: 999, padding: '3px 12px',
            fontSize: 9, fontWeight: 900, color: '#1A0A00', letterSpacing: '0.1em', fontFamily: 'monospace',
          }}>{booking.booking_number}</span>
          <StatusBadge booking={booking} />
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: '0 0 10px' }}>{tour.title}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <MapPin size={13} style={{ color: '#C45C26' }} /> {tour.destination}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Calendar size={13} style={{ color: '#C45C26' }} /> {formatDateRange(tour.start_date, tour.duration)}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        borderLeft: '1px solid rgba(196,92,38,0.12)', paddingLeft: 24, flexShrink: 0,
      }}>
        <p style={{ fontSize: 20, fontWeight: 900, color: '#1A0A00', margin: 0 }}>₱{booking.total_price?.toLocaleString()}</p>
        <button
          onClick={onView}
          style={{
            padding: '10px 22px', background: '#1A0A00', color: '#FDF6EE',
            border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
            fontWeight: 900, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}
        >
          View Details <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
};

/* ─── Booking Detail Modal (split panel, mirrors TourManagement's TourViewModal) ─── */
const BookingDetailModal = ({ booking, onClose, formatDateRange, onCancelSuccess }) => {
  const tour = booking.tours || {};
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [reasonError, setReasonError] = useState(false);

  const handleCancelBooking = async () => {
    if (!cancelReason.trim()) {
      setReasonError(true);
      return;
    }

    setCancelling(true);

    const { error } = await supabase
      .from('bookings')
      .update({
        booking_status: 'Cancelled',
        cancellation_reason: cancelReason.trim()
      })
      .eq('id', booking.id);

    if (error) {
      alert("Error: " + error.message);
    } else {
      onCancelSuccess();
    }
    setCancelling(false);
  };

  const canCancel = booking.booking_status !== 'Cancelled' &&
                    booking.booking_status !== 'Rejected' &&
                    !booking.isActuallyCompleted;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 900,
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        overflow: 'hidden', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 24, right: 24, zIndex: 50,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(122,58,24,0.5)',
        }}><X size={28} /></button>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>

            {/* Left panel: photo, status, price */}
            <div className="responsive-modal-padding" style={{
              background: '#F2E4D0', padding: '2.5rem 2rem',
              borderRight: '1px solid rgba(196,92,38,0.12)',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                width: '100%', height: 190, borderRadius: 18, overflow: 'hidden',
                background: '#E8D5BC', marginBottom: 20, boxShadow: '0 8px 24px rgba(26,10,0,0.15)',
              }}>
                {tour.image_urls?.[0]
                  ? <img src={tour.image_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.3)' }}><ShoppingBag size={40} /></div>
                }
              </div>

              <p style={{
                fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
                color: '#C45C26', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ display: 'inline-block', width: 16, height: 1, background: '#C45C26' }} /> Booking Confirmation
              </p>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1A0A00', margin: '0 0 4px', lineHeight: 1.2 }}>{tour.title}</h2>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.6, margin: '0 0 16px', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                {booking.booking_number}
              </p>

              <div style={{ marginBottom: 20 }}>
                <StatusBadge booking={booking} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>
                  <MapPin size={16} style={{ color: '#C45C26' }} /> {tour.destination}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>
                  <Calendar size={16} style={{ color: '#C45C26' }} /> {formatDateRange(tour.start_date, tour.duration)}
                </div>
              </div>

              <div style={{ marginTop: 'auto' }}>
                <p style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: '#C45C26', margin: '0 0 2px', lineHeight: 1 }}>
                  ₱{booking.total_price?.toLocaleString()}
                </p>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.6, margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>total paid</p>
              </div>
            </div>

            {/* Right panel: trip info + cancellation */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 24 }}>

                <ViewSection title="Trip Information" icon={<History size={14} style={{ color: '#C45C26' }} />}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 4 }}>
                    <DetailItem label="Destination" value={tour.destination} />
                    <DetailItem label="Tour Date" value={formatDateRange(tour.start_date, tour.duration)} />
                    <DetailItem label="Pax Count" value={`${booking.slots_booked} persons`} />
                    <DetailItem label="Total Price" value={`₱${booking.total_price?.toLocaleString()}`} />
                  </div>
                </ViewSection>

                {canCancel && !showCancelConfirm && (
                  <div style={{
                    background: 'rgba(232,162,101,0.18)', border: '1px solid rgba(232,162,101,0.4)',
                    borderRadius: 18, padding: '1.25rem', display: 'flex', gap: 12,
                  }}>
                    <ShieldAlert size={18} style={{ color: '#B9762E', flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#8A5A1E', lineHeight: 1.6, margin: 0 }}>
                      Need to change your plans? You can cancel below. Per our agency policy, all payments are{' '}
                      <span style={{ textDecoration: 'underline', fontWeight: 900, color: '#6B3F14', textTransform: 'uppercase' }}>non-refundable</span>.
                    </p>
                  </div>
                )}

                {showCancelConfirm && (
                  <div style={{
                    background: 'rgba(140,47,28,0.06)', border: '2px solid rgba(140,47,28,0.15)',
                    borderRadius: 20, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 18,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, background: 'rgba(140,47,28,0.12)', color: '#8C2F1C',
                        borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Trash2 size={18} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: 13, fontWeight: 900, color: '#8C2F1C', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Confirm Cancellation</h4>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#A8543A', margin: '2px 0 0' }}>This action cannot be undone. Payment is non-refundable.</p>
                      </div>
                    </div>

                    <div>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 900,
                        color: '#8C2F1C', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8,
                      }}>
                        <MessageSquare size={12} /> Reason for Cancellation <span style={{ color: '#A8543A' }}>*</span>
                      </label>
                      <textarea
                        value={cancelReason}
                        onChange={(e) => { setCancelReason(e.target.value); setReasonError(false); }}
                        placeholder="Please tell us why you're cancelling this tour..."
                        rows={3}
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '12px 14px',
                          background: '#FDF6EE', border: `2px solid ${reasonError ? '#C45C26' : 'rgba(140,47,28,0.15)'}`,
                          borderRadius: 16, fontSize: 13, color: '#1A0A00', resize: 'none',
                          outline: 'none', fontFamily: 'inherit', fontWeight: 500,
                        }}
                      />
                      {reasonError && (
                        <p style={{ fontSize: 10, fontWeight: 900, color: '#C45C26', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0 0' }}>
                          ⚠ Please provide a reason before cancelling.
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        onClick={() => { setShowCancelConfirm(false); setCancelReason(''); setReasonError(false); }}
                        style={{
                          flex: 1, padding: '12px 0', background: '#FDF6EE', color: '#7A3A18',
                          border: '1px solid rgba(196,92,38,0.18)', borderRadius: 14, cursor: 'pointer',
                          fontFamily: 'inherit', fontWeight: 900, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCancelBooking}
                        disabled={cancelling}
                        style={{
                          flex: 1, padding: '12px 0', background: '#8C2F1C', color: '#FDF6EE',
                          border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                          fontWeight: 900, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                      >
                        {cancelling
                          ? <Loader2 className="animate-spin" size={14} />
                          : <><Trash2 size={13} /> Yes, Cancel Tour</>
                        }
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div style={{
                marginTop: 'auto', padding: '1.25rem 2.5rem', borderTop: '1px solid rgba(196,92,38,0.12)',
                background: '#F2E4D0', display: 'flex', gap: 12,
              }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, padding: '14px 0', background: '#FDF6EE', color: '#7A3A18',
                    border: '1px solid rgba(196,92,38,0.18)', borderRadius: 14, cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 900, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
                  }}
                >
                  Close
                </button>
                {canCancel && !showCancelConfirm && (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    style={{
                      flex: 1, padding: '14px 0', background: 'rgba(140,47,28,0.08)', color: '#8C2F1C',
                      border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: 900, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <Trash2 size={14} /> Cancel Tour
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Helpers ───────────────────────────────────────────────────── */
const ViewSection = ({ title, titleColor, icon, children }) => (
  <section>
    <h4 style={{
      fontSize: 9, fontWeight: 900, letterSpacing: '0.25em',
      textTransform: 'uppercase', color: titleColor || '#7A3A18', opacity: titleColor ? 1 : 0.7,
      margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6,
      borderBottom: '1px solid rgba(196,92,38,0.12)', paddingBottom: 12,
    }}>
      {icon} {title}
    </h4>
    {children}
  </section>
);

const DetailItem = ({ label, value }) => (
  <div>
    <p style={{ fontSize: 9, fontWeight: 900, color: '#7A3A18', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 5px' }}>{label}</p>
    <p style={{ fontSize: 14, fontWeight: 700, color: '#1A0A00', margin: 0 }}>{value || '—'}</p>
  </div>
);

const StatusBadge = ({ booking }) => {
  let bg = 'rgba(122,58,24,0.1)', color = '#7A3A18', label = 'Pending Action';

  if (booking.isActuallyCompleted) {
    bg = 'rgba(196,92,38,0.15)'; color = '#C45C26'; label = 'Completed';
  } else if (booking.booking_status === 'Cancelled' || booking.booking_status === 'Rejected') {
    bg = 'rgba(140,47,28,0.1)'; color = '#8C2F1C'; label = 'Cancelled';
  } else if (booking.payment_status === 'Complete') {
    bg = 'rgba(59,130,246,0.12)'; color = '#2563eb'; label = 'Confirmed Trip';
  } else if (booking.payment_status === 'Pending' || booking.payment_status === 'Verification Pending') {
    bg = 'rgba(232,162,101,0.25)'; color = '#B9762E'; label = 'Verification Pending';
  }

  return (
    <span style={{
      display: 'inline-block', padding: '4px 14px', borderRadius: 999,
      fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em',
      background: bg, color,
    }}>
      {label}
    </span>
  );
};

export default MyBookings;