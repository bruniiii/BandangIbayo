import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import EmptyState from './ui/EmptyState';
import { Compass, Mountain, CalendarX2, QrCode, MessagesSquare } from 'lucide-react';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { notifyAdmins } from './notifications';
import { cancellationDeadline, isWithinCancellationWindow, CANCELLATION_CUTOFF_DAYS, CANCELLATION_APPROVAL_HOURS, withAvailableSlots, todayManila, formatPeso, formatDateRange as formatTourDates } from './tourUtils';
import { sendWaitlistOpeningsEmail } from './Email';
import { downloadReceipt, balanceRemaining } from './paymentReceipt';
import { verifyCheckout, cancelCheckout, startBalanceCheckout } from './payments';
import CheckInQr from './ui/CheckInQr';
import PackingChecklist from './ui/PackingChecklist';
import TripDayCard from './TripDayCard';
import { CustomPickupSection } from './CustomPickup';
import { openGroupChat } from './groupChat';
import { tripDayBookings } from './tripDay';
import { 
  ShoppingBag, MapPin, Calendar,
  ChevronRight, Loader2, X,
  History, Trash2, ShieldAlert, MessageSquare, Users, CalendarClock, FileDown, CreditCard, Clock, Backpack
} from 'lucide-react';
import { Skel, SkeletonRegion } from './ui/Skeleton';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light card bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #8C2F1C  deep rust red (error / cancelled)
// #F2E4D0  parchment (inset panel bg)
// #EDEAE3  warm stone (page bg)
// #3F5D62  slate teal (secondary contrast accent)
// ---------------------------------------------------------
 
/* Tracks viewport width so the booking card can switch from a
   horizontal (desktop) to a stacked (mobile) layout. */
const useIsMobile = (breakpoint = 640) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
};

const MyBookings = ({ onExplore }) => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Upcoming'); 
  const [selectedBooking, setSelectedBooking] = useState(null);
 
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split('-');
    return `${month}-${day}-${year}`;
  };
 
  const formatDateRange = formatTourDates;
 
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
          price,
          things_to_bring,
          important_note
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
 
  // Checkouts still marked "Awaiting Payment": ask PayMongo once whether they were paid
  // (covers a missed webhook or a joiner who closed the tab after paying).
  const reconciledRef = useRef(false);
  useEffect(() => {
    const awaiting = bookings.filter((b) => b.payment_status === 'Awaiting Payment');
    if (!awaiting.length || reconciledRef.current) return;
    reconciledRef.current = true;
    Promise.all(awaiting.map((b) => verifyCheckout({ bookingId: b.id }))).then(fetchMyBookings);
  }, [bookings, fetchMyBookings]);

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

      {/* ── Trip Day: the next few days' confirmed trips, with pickups, driver and QR ── */}
      {!loading && tripDayBookings(bookings).map((b) => <TripDayCard key={b.id} booking={b} />)}

      {/* ── Header / Tabs ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
        gap: 20, borderBottom: '1px solid rgba(180,81,30,0.12)', paddingBottom: 24,
      }}>
        <div style={{ display: 'flex', background: '#F2E4D0', padding: 6, borderRadius: 16, width: '100%', maxWidth: 380, border: '1px solid rgba(180,81,30,0.14)' }}>
          {['Upcoming', 'Completed', 'Cancelled'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 12,
                fontSize: 11.5, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase',
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === tab ? '#1A0A00' : 'transparent',
                color: activeTab === tab ? '#FDF6EE' : '#7A3A18',
                boxShadow: activeTab === tab ? '0 4px 14px rgba(26,10,0,0.15)' : 'none',
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
          <SkeletonRegion label="Loading your trips" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 18, background: '#FDF6EE', borderRadius: 22, padding: '1.25rem', border: '1px solid rgba(180,81,30,0.12)', flexWrap: 'wrap' }}>
                <Skel w={160} h={120} r={16} />
                <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
                  <Skel w="25%" h={10} /><Skel w="55%" h={16} /><Skel w="40%" h={11} /><Skel w="30%" h={11} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center', alignItems: 'flex-end' }}><Skel w={90} h={16} /><Skel w={120} h={36} r={12} /></div>
              </div>
            ))}
          </SkeletonRegion>
        ) : filteredBookings.length === 0 ? (
          <EmptyState
            icon={activeTab === 'Upcoming' ? Compass : activeTab === 'Completed' ? Mountain : CalendarX2}
            title={activeTab === 'Upcoming' ? 'No upcoming trips yet' : activeTab === 'Completed' ? 'No completed trips yet' : 'No cancelled bookings'}
            message={activeTab === 'Upcoming'
              ? 'Your next adventure is one booking away. Pick a tour and it will show up here.'
              : activeTab === 'Completed'
                ? 'Tours you have joined will show up here once they are done.'
                : "Good news: you haven't cancelled any bookings."}
            action={activeTab === 'Upcoming' && onExplore ? { label: 'Explore Tours', onClick: onExplore } : null}
            secondaryAction={activeTab !== 'Upcoming' ? { label: 'View Upcoming Trips', onClick: () => setActiveTab('Upcoming') } : null}
          />
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

/* ─── Booking List Card ─── */
const BookingListItem = ({ booking, onView, formatDateRange }) => {
  const [hovered, setHovered] = useState(false);
  const isMobile = useIsMobile();
  const tour = booking.tours || {};
  return (
    <div
      style={{
        background: '#FDF6EE', borderRadius: 24,
        border: '1px solid rgba(180,81,30,0.12)',
        boxShadow: hovered ? '0 12px 36px rgba(26,10,0,0.1)' : '0 4px 16px rgba(26,10,0,0.05)',
        transform: hovered && !isMobile ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.25s',
        padding: isMobile ? '1rem' : '1.25rem',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? 14 : 24,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        width: isMobile ? '100%' : 168,
        height: isMobile ? 160 : 112,
        borderRadius: 18, overflow: 'hidden', flexShrink: 0, background: '#F2E4D0',
      }}>
        {tour.image_urls?.[0]
          ? <img src={tour.image_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)' }}><ShoppingBag size={28} /></div>
        }
      </div>

      <div style={{ flex: 1, minWidth: isMobile ? 'auto' : 220 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            background: '#F2E4D0', borderRadius: 999, padding: '3px 12px',
            fontSize: 11, fontWeight: 900, color: '#1A0A00', letterSpacing: '0.1em', fontFamily: 'monospace',
            border: '1px solid rgba(180,81,30,0.15)',
          }}>{booking.booking_number}</span>
          <StatusBadge booking={booking} />
        </div>
        <h3 style={{ fontSize: isMobile ? 15 : 17, fontWeight: 900, color: '#1A0A00', lineHeight: 1.25, margin: '0 0 10px' }}>{tour.title}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 10 : 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <MapPin size={13} style={{ color: '#A8481A' }} /> {tour.destination}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Calendar size={13} style={{ color: '#A8481A' }} /> {formatDateRange(tour.start_date, tour.duration)}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: isMobile ? 'space-between' : 'center',
        gap: isMobile ? 0 : 12,
        width: isMobile ? '100%' : 'auto',
        borderLeft: isMobile ? 'none' : '1px solid rgba(180,81,30,0.12)',
        borderTop: isMobile ? '1px solid rgba(180,81,30,0.12)' : 'none',
        paddingLeft: isMobile ? 0 : 24,
        paddingTop: isMobile ? 14 : 0,
        flexShrink: 0,
      }}>
        <div style={{ textAlign: isMobile ? 'left' : 'center' }}>
          <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A3A18', margin: '0 0 2px' }}>Total price</p>
          <p style={{ fontSize: isMobile ? 20 : 22, fontWeight: 900, color: '#1A0A00', margin: 0, lineHeight: 1.1 }}>{formatPeso(booking.total_price)}</p>
        </div>
        <button
          onClick={onView}
          style={{
            padding: isMobile ? '10px 18px' : '10px 22px', background: '#1A0A00', color: '#FDF6EE',
            border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
            fontWeight: 900, fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#B4511E'}
          onMouseLeave={e => e.currentTarget.style.background = '#1A0A00'}
        >
          View Details <ChevronRight size={13} />
        </button>
        {booking.payment_status === 'Complete' && !booking.isActuallyCompleted
          && booking.booking_status !== 'Cancelled' && booking.booking_status !== 'Rejected' && (
          <button type="button" className="text-link" onClick={onView} style={{ background: 'none', border: 'none', padding: '4px 0', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            <QrCode size={13} /> Check-in QR
          </button>
        )}
      </div>
    </div>
  );
};

/* ─── Booking Detail Modal ─── */
const BookingDetailModal = ({ booking, onClose, formatDateRange, onCancelSuccess }) => {
  const tour = booking.tours || {};
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [agreedNoRefund, setAgreedNoRefund] = useState(false);
  const [agreeError, setAgreeError] = useState(false);

  // Sends a cancellation request: the slots stay held until the agency approves
  // it (within 12 hours, or it's approved automatically).
  const handleCancelBooking = async () => {
    // At least a few words, so the agency knows why (e.g. not just "x").
    if (cancelReason.trim().length < 5) {
      setReasonError(true);
      return;
    }
    if (!agreedNoRefund) {
      setAgreeError(true);
      return;
    }

    setCancelling(true);
    const reason = cancelReason.trim();
    let { error } = await supabase
      .from('bookings')
      .update({ cancellation_reason: reason, cancellation_requested_at: new Date().toISOString() })
      .eq('id', booking.id);
    let requested = true;
    // Database without 20261026000000_cancellation_requests.sql yet: cancel right away, as before.
    if (error && /cancellation_requested_at/.test(error.message || '')) {
      requested = false;
      ({ error } = await supabase.from('bookings')
        .update({ booking_status: 'Cancelled', cancellation_reason: reason })
        .eq('id', booking.id));
    }

    if (error) {
      toast.error("Couldn't cancel your booking", error.message);
    } else if (requested) {
      notifyAdmins({
        title: 'Cancellation Request',
        message: `A joiner asked to cancel ${tour.title || 'a tour'} (${booking.booking_number}). Reason: ${reason}. Approve or decline it in Booking Management within ${CANCELLATION_APPROVAL_HOURS} hours, or it's approved automatically.`,
        type: 'cancellation',
        related_id: booking.id,
      });
      toast.success('Cancellation requested', `We'll review it within ${CANCELLATION_APPROVAL_HOURS} hours. Your slot stays reserved until then.`);
      onCancelSuccess();
    } else {
      notifyAdmins({
        title: 'Booking Cancellation',
        message: `A joiner cancelled their booking for ${tour.title || 'a tour'} (${booking.booking_number}). Reason: ${reason}`,
        type: 'cancellation',
        related_id: booking.id,
      });
      sendWaitlistOpeningsEmail({ tourId: booking.tour_id });
      toast.success('Booking cancelled', `${booking.booking_number} has been cancelled.`);
      onCancelSuccess();
    }
    setCancelling(false);
  };

  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const isPaymentConfirmed = booking.payment_status === 'Complete' &&
                             booking.booking_status !== 'Cancelled' &&
                             booking.booking_status !== 'Rejected';
  const handleDownloadReceipt = async () => {
    setDownloadingReceipt(true);
    try {
      await downloadReceipt(booking, tour);
    } catch (err) {
      toast.error("Couldn't create the receipt", String(err?.message || err));
    }
    setDownloadingReceipt(false);
  };

  const isAwaitingPayment = booking.payment_status === 'Awaiting Payment' &&
                            booking.booking_status !== 'Cancelled' &&
                            booking.booking_status !== 'Rejected';
  const cancelRequested = !!booking.cancellation_requested_at &&
                          booking.booking_status !== 'Cancelled' && booking.booking_status !== 'Rejected';
  const isOpenBooking = booking.booking_status !== 'Cancelled' &&
                        booking.booking_status !== 'Rejected' &&
                        !booking.isActuallyCompleted &&
                        !isAwaitingPayment &&
                        !cancelRequested;
  // Terms, section 2: no cancellations within two weeks of the tour date.
  const cancellationClosed = isOpenBooking && isWithinCancellationWindow(tour.start_date);
  const canCancel = isOpenBooking && !cancellationClosed;
  const deadline = cancellationDeadline(tour.start_date);
  const deadlineLabel = deadline
    ? new Date(`${deadline}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 900,
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        borderTop: '8px solid #B4511E',
        overflow: 'hidden', maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 24, right: 24, zIndex: 50,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(122,58,24,0.85)',
        }}><X size={28} /></button>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>

            {/* Left panel: photo, status, price */}
            <div className="responsive-modal-padding" style={{
              background: '#F2E4D0', padding: '2.5rem 2rem',
              borderRight: '1px solid rgba(180,81,30,0.12)',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                width: '100%', height: 190, borderRadius: 18, overflow: 'hidden',
                background: '#EDEAE3', marginBottom: 20, boxShadow: '0 8px 24px rgba(26,10,0,0.15)',
              }}>
                {tour.image_urls?.[0]
                  ? <img src={tour.image_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)' }}><ShoppingBag size={40} /></div>
                }
              </div>

              <p style={{
                fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
                color: '#A8481A', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ display: 'inline-block', width: 16, height: 1, background: '#B4511E' }} /> Booking Confirmation
              </p>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1A0A00', margin: '0 0 4px', lineHeight: 1.2 }}>{tour.title}</h2>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '0 0 16px', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                {booking.booking_number}
              </p>

              <div style={{ marginBottom: 20 }}>
                <StatusBadge booking={booking} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>
                  <MapPin size={16} style={{ color: '#A8481A' }} /> {tour.destination}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>
                  <Calendar size={16} style={{ color: '#A8481A' }} /> {formatDateRange(tour.start_date, tour.duration)}
                </div>
              </div>

              <div style={{ marginTop: 'auto' }}>
                <p style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: '#A8481A', margin: '0 0 2px', lineHeight: 1 }}>
                  {formatPeso((isAwaitingPayment ? 0 : (booking.amount_paid ?? booking.total_price) ?? 0))}
                </p>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{isAwaitingPayment ? 'not paid yet' : isPaymentConfirmed ? 'amount paid' : 'amount sent'}</p>
              </div>
            </div>

            {/* Right panel: trip info + cancellation */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 24 }}>

                <ViewSection title="Trip Information" icon={<History size={14} style={{ color: '#A8481A' }} />}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 4 }}>
                    <DetailItem label="Destination" value={tour.destination} />
                    <DetailItem label="Tour Date" value={formatDateRange(tour.start_date, tour.duration)} />
                    <DetailItem label="Pax Count" value={`${booking.slots_booked} persons`} />
                    <DetailItem label="Total Price" value={`${formatPeso(booking.total_price)}`} />
                  </div>
                </ViewSection>

                {!booking.isActuallyCompleted && booking.booking_status !== 'Cancelled' && booking.booking_status !== 'Rejected' && (
                  <ViewSection title="Check-in QR" icon={<QrCode size={14} style={{ color: '#A8481A' }} />}>
                    <CheckInQr booking={booking} tourTitle={tour.title} isPaymentConfirmed={isPaymentConfirmed} tourEnded={booking.isActuallyCompleted} />
                  </ViewSection>
                )}

                {isPaymentConfirmed && !booking.isActuallyCompleted && tour.things_to_bring?.trim() && (
                  <ViewSection title="Things to Bring" icon={<Backpack size={14} style={{ color: '#A8481A' }} />}>
                    <PackingChecklist bookingId={booking.id} text={tour.things_to_bring} />
                  </ViewSection>
                )}

                {booking.companions?.length > 0 && (
                  <ViewSection title="Joining You" icon={<Users size={14} style={{ color: '#A8481A' }} />}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {booking.companions.map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, fontWeight: 700, color: '#1A0A00' }}>
                          <span>{c.full_name}</span>
                          <span style={{ color: '#7A3A18', fontWeight: 600 }}>{c.contact_number}</span>
                        </div>
                      ))}
                    </div>
                  </ViewSection>
                )}

                <OnlinePaymentActions booking={booking} isAwaitingPayment={isAwaitingPayment} isPaymentConfirmed={isPaymentConfirmed} onChanged={onCancelSuccess} />

                {isPaymentConfirmed && (
                  <button
                    type="button"
                    onClick={() => { onClose(); openGroupChat(booking.tour_id); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
                      background: '#1A0A00', color: '#FDF6EE', border: 'none', borderRadius: 14, padding: '12px 16px',
                      fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <MessagesSquare size={16} /> Open Tour Group Chat
                  </button>
                )}

                {isPaymentConfirmed && !booking.cancellation_requested_at && (
                  <CustomPickupSection booking={booking} canRequest={!!tour.start_date && tour.start_date > todayManila()} />
                )}

                {canCancel && !showCancelConfirm && (
                  <RescheduleSection booking={booking} tour={tour} formatDateRange={formatDateRange} onMoved={onCancelSuccess} />
                )}

                {canCancel && !showCancelConfirm && (
                  <div style={{
                    background: 'rgba(232,162,101,0.18)', border: '1px solid rgba(232,162,101,0.4)',
                    borderRadius: 18, padding: '1.25rem', display: 'flex', gap: 12,
                  }}>
                    <ShieldAlert size={18} style={{ color: '#A8481A', flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', lineHeight: 1.6, margin: 0 }}>
                      Need to change your plans? You can cancel until <strong>{deadlineLabel}</strong>. Per our agency policy, all payments are{' '}
                      <span style={{ textDecoration: 'underline', fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase' }}>non-refundable</span>.
                    </p>
                  </div>
                )}

                {cancelRequested && (
                  <div style={{
                    background: 'rgba(232,162,101,0.18)', border: '1px solid rgba(232,162,101,0.4)',
                    borderRadius: 18, padding: '1.25rem', display: 'flex', gap: 12,
                  }}>
                    <Clock size={18} style={{ color: '#A8481A', flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', lineHeight: 1.6, margin: 0 }}>
                      <strong style={{ color: '#1A0A00' }}>Cancellation requested</strong> on {new Date(booking.cancellation_requested_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.
                      {' '}Bandang IBAYO will review it within {CANCELLATION_APPROVAL_HOURS} hours; your slot stays reserved until then. You'll get a notification once it's approved.
                    </p>
                  </div>
                )}

                {cancellationClosed && (
                  <div style={{
                    background: 'rgba(140,47,28,0.08)', border: '1px solid rgba(140,47,28,0.2)',
                    borderRadius: 18, padding: '1.25rem', display: 'flex', gap: 12,
                  }}>
                    <ShieldAlert size={18} style={{ color: '#8C2F1C', flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', lineHeight: 1.6, margin: 0 }}>
                      Cancellations for this tour closed on <strong>{deadlineLabel}</strong>. Per our Terms, bookings can't be cancelled within {CANCELLATION_CUTOFF_DAYS} days of the tour date.
                    </p>
                  </div>
                )}

                {showCancelConfirm && (
                  <div style={{
                    background: 'rgba(140,47,28,0.06)', border: '2px solid rgba(140,47,28,0.18)',
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
                        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0' }}>The agency approves cancellations within {CANCELLATION_APPROVAL_HOURS} hours. The amount you paid won't be refunded.</p>
                      </div>
                    </div>

                    <div>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900,
                        color: '#8C2F1C', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8,
                      }}>
                        <MessageSquare size={12} /> Reason for Cancellation <span style={{ color: '#8C2F1C' }}>*</span>
                      </label>
                      <textarea
                        value={cancelReason}
                        maxLength={500}
                        onChange={(e) => { setCancelReason(e.target.value); setReasonError(false); }}
                        placeholder="Please tell us why you're cancelling this tour..."
                        rows={3}
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '12px 14px',
                          background: '#FDF6EE', border: `2px solid ${reasonError ? '#8C2F1C' : 'rgba(180,81,30,0.2)'}`,
                          borderRadius: 16, fontSize: 13, color: '#1A0A00', resize: 'none',
                          outline: 'none', fontFamily: 'inherit', fontWeight: 500,
                        }}
                      />
                      {reasonError && (
                        <p style={{ fontSize: 11.5, fontWeight: 900, color: '#8C2F1C', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0 0' }}>
                          ⚠ Please give a short reason (at least 5 characters) before cancelling.
                        </p>
                      )}
                    </div>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#1A0A00', lineHeight: 1.55 }}>
                      <input
                        type="checkbox"
                        checked={agreedNoRefund}
                        onChange={(e) => { setAgreedNoRefund(e.target.checked); setAgreeError(false); }}
                        style={{ width: 18, height: 18, marginTop: 1, accentColor: '#8C2F1C', flexShrink: 0 }}
                      />
                      <span>
                        I understand that all payments are <strong>non-refundable</strong>, and that my cancellation is final once
                        Bandang IBAYO approves it (within {CANCELLATION_APPROVAL_HOURS} hours).
                      </span>
                    </label>
                    {agreeError && (
                      <p style={{ fontSize: 11.5, fontWeight: 900, color: '#8C2F1C', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '-8px 0 0' }}>
                        ⚠ Please tick the box to confirm you understand.
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        onClick={() => { setShowCancelConfirm(false); setCancelReason(''); setReasonError(false); setAgreedNoRefund(false); setAgreeError(false); }}
                        style={{
                          flex: 1, padding: '12px 0', background: '#F2E4D0', color: '#7A3A18',
                          border: '1px solid rgba(180,81,30,0.18)', borderRadius: 14, cursor: 'pointer',
                          fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.1em',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#EDEAE3'}
                        onMouseLeave={e => e.currentTarget.style.background = '#F2E4D0'}
                      >
                        Keep Booking
                      </button>
                      <button
                        onClick={handleCancelBooking}
                        disabled={cancelling}
                        style={{
                          flex: 1, padding: '12px 0', background: '#C0362C', color: '#FFFFFF',
                          border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                          fontWeight: 900, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.1em',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#9E2B23'}
                        onMouseLeave={e => e.currentTarget.style.background = '#C0362C'}
                      >
                        {cancelling
                          ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                          : <><Trash2 size={13} /> Request Cancellation</>
                        }
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div style={{
                marginTop: 'auto', padding: '1.25rem 2.5rem', borderTop: '1px solid rgba(180,81,30,0.12)',
                background: '#F2E4D0', display: 'flex', flexWrap: 'wrap', gap: 12,
              }}>
                {/* Labels stay on one line; when there's no room the buttons wrap to a new row. */}
                <button
                  onClick={onClose}
                  style={{
                    flex: '1 1 110px', padding: '14px 16px', whiteSpace: 'nowrap', background: '#FDF6EE', color: '#1A0A00',
                    border: '1px solid rgba(180,81,30,0.18)', borderRadius: 14, cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.1em',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EDEAE3'}
                  onMouseLeave={e => e.currentTarget.style.background = '#FDF6EE'}
                >
                  Close
                </button>
                {/* Receipt once the payment has been verified */}
                {isPaymentConfirmed && (
                  <button
                    type="button"
                    onClick={handleDownloadReceipt}
                    disabled={downloadingReceipt}
                    style={{
                      flex: '1 1 190px', padding: '14px 16px', whiteSpace: 'nowrap', background: '#1A0A00', color: '#FDF6EE',
                      border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: 900, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.1em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {downloadingReceipt ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileDown size={14} />} Download Receipt
                  </button>
                )}
                {canCancel && !showCancelConfirm && (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    style={{
                      flex: '1 1 180px', padding: '14px 16px', whiteSpace: 'nowrap', background: 'rgba(140,47,28,0.08)', color: '#8C2F1C',
                      border: '1px solid rgba(140,47,28,0.2)', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: 900, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.1em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#C0362C';
                      e.currentTarget.style.color = '#FFFFFF';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(140,47,28,0.08)';
                      e.currentTarget.style.color = '#8C2F1C';
                    }}
                  >
                    <Trash2 size={14} /> Cancel Booking
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
/* ── PayMongo: finish an unfinished checkout, or pay a downpayment's balance online ── */
const OnlinePaymentActions = ({ booking, isAwaitingPayment, isPaymentConfirmed, onChanged }) => {
  const [busy, setBusy] = useState(null); // 'resume' | 'cancel' | 'balance'
  const balance = balanceRemaining(booking);
  const canPayBalance = isPaymentConfirmed && booking.payment_method === 'Downpayment' && balance > 0 && !booking.isActuallyCompleted;
  if (!isAwaitingPayment && !canPayBalance) return null;

  const holdUntil = booking.hold_expires_at
    ? new Date(booking.hold_expires_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : null;

  const cancel = async () => {
    if (!(await confirmDialog({ title: 'Cancel this unfinished booking?', message: 'Your held slots will be released so others can book them.', confirmLabel: 'Cancel Booking', cancelLabel: 'Keep Booking', tone: 'danger' }))) return;
    setBusy('cancel');
    const { ok, error } = await cancelCheckout({ bookingId: booking.id });
    setBusy(null);
    if (!ok) { toast.error("Couldn't cancel the booking", error); return; }
    onChanged();
  };

  const payBalance = async () => {
    setBusy('balance');
    const { ok, data, error } = await startBalanceCheckout({ bookingId: booking.id });
    if (!ok) { toast.error("Couldn't open the payment page", error); setBusy(null); return; }
    if (data.alreadyPaid) { toast.success('Balance already paid', 'Thank you! Nothing more is due.'); setBusy(null); onChanged(); return; }
    window.location.assign(data.checkoutUrl);
  };

  const buttonStyle = (primary) => ({
    flex: 1, minWidth: 160, padding: '12px 0', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
    fontWeight: 900, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.1em',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: primary ? '#B4511E' : '#FDF6EE', color: primary ? '#FDF6EE' : '#8C2F1C',
    border: primary ? 'none' : '1px solid rgba(140,47,28,0.25)',
  });

  return (
    <ViewSection title={isAwaitingPayment ? 'Payment Not Finished' : 'Remaining Balance'} icon={<CreditCard size={14} style={{ color: '#A8481A' }} />}>
      {!isAwaitingPayment && (
        <div style={{ margin: '0 0 8px' }}>
          <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A3A18', margin: '0 0 2px' }}>Balance due</p>
          <p style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em', color: '#1A0A00', margin: 0, lineHeight: 1.1 }}>{formatPeso(balance)}</p>
        </div>
      )}
      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '0 0 12px', lineHeight: 1.6 }}>
        {isAwaitingPayment
          ? `Your slots are held${holdUntil ? ` until ${holdUntil}` : ''}. Finish paying on PayMongo to confirm your booking.`
          : 'Pay it online now, or in person on the day of the tour.'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {isAwaitingPayment ? (
          <>
            {booking.paymongo_checkout_url && (
              <button type="button" disabled={busy !== null} onClick={() => { setBusy('resume'); window.location.assign(booking.paymongo_checkout_url); }} style={buttonStyle(true)}>
                {busy === 'resume' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CreditCard size={14} />} Complete payment
              </button>
            )}
            <button type="button" disabled={busy !== null} onClick={cancel} style={buttonStyle(false)}>
              {busy === 'cancel' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={14} />} Cancel booking
            </button>
          </>
        ) : (
          <button type="button" disabled={busy !== null} onClick={payBalance} style={buttonStyle(true)}>
            {busy === 'balance' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CreditCard size={14} />} Pay {formatPeso(balance)} online
          </button>
        )}
      </div>
    </ViewSection>
  );
};

/* ── Move to another date: same trip (destination) at the same price ── */
const RescheduleSection = ({ booking, tour, formatDateRange, onMoved }) => {
  const [options, setOptions] = useState(null); // null = still checking
  const [moving, setMoving] = useState(null);

  // Other dates of the same trip: same destination and price, still upcoming,
  // with room for this group. The section only shows when there is one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tours')
        .select('*')
        .eq('is_archived', false)
        .eq('price', tour.price)
        .ilike('destination', (tour.destination || '').trim())
        .gt('start_date', todayManila())
        .neq('id', booking.tour_id)
        .order('start_date', { ascending: true });
      if (error) console.error('Error loading other dates:', error.message);
      const withSlots = await withAvailableSlots(data || []);
      if (!cancelled) setOptions(withSlots.filter((t) => t.available_slots >= booking.slots_booked));
    })();
    return () => { cancelled = true; };
  }, [tour.price, tour.destination, booking.tour_id, booking.slots_booked]);

  const moveTo = async (newTour) => {
    if (!(await confirmDialog({ title: `Move booking ${booking.booking_number}?`, message: `New date: ${formatDateRange(newTour.start_date, newTour.duration)}.`, confirmLabel: 'Move Booking', cancelLabel: 'Keep Current Date' }))) return;
    setMoving(newTour.id);
    const { error } = await supabase.rpc('reschedule_booking', { p_booking_id: booking.id, p_new_tour_id: newTour.id });
    setMoving(null);
    if (error) {
      toast.error("Couldn't move the booking", error.message);
      return;
    }
    // The old date now has free slots: email anyone waiting for them.
    sendWaitlistOpeningsEmail({ tourId: booking.tour_id });
    toast.success('Booking moved', 'Your payment carries over to the new date.');
    onMoved();
  };

  if (!options || options.length === 0) return null;

  return (
    <ViewSection title="Move to Another Date" icon={<CalendarClock size={14} style={{ color: '#A8481A' }} />}>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '0 0 10px' }}>
        This trip also runs on {options.length === 1 ? 'this date' : 'these dates'}. Tap one to move your booking.
      </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => moveTo(t)}
              disabled={moving !== null}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                width: '100%', padding: '12px 14px', background: '#FDF6EE', textAlign: 'left',
                border: '1px solid rgba(180,81,30,0.2)', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00' }}>{formatDateRange(t.start_date, t.duration)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18' }}>
                {moving === t.id ? 'Moving…' : `${t.available_slots} slot${t.available_slots === 1 ? '' : 's'} left`}
              </span>
            </button>
          ))}
        </div>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '10px 0 0' }}>
        Same trip and price, so your payment carries over. Possible until the cancellation deadline.
      </p>
    </ViewSection>
  );
};

const ViewSection = ({ title, titleColor, icon, children }) => (
  <section>
    <h4 style={{
      fontSize: 11, fontWeight: 900, letterSpacing: '0.25em',
      textTransform: 'uppercase', color: titleColor || '#7A3A18', opacity: titleColor ? 1 : 0.9,
      margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6,
      borderBottom: '1px solid rgba(180,81,30,0.12)', paddingBottom: 12,
    }}>
      {icon} {title}
    </h4>
    {children}
  </section>
);

const DetailItem = ({ label, value }) => (
  <div>
    <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>{label}</p>
    <p style={{ fontSize: 16, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{value || '—'}</p>
  </div>
);

const StatusBadge = ({ booking }) => {
  let bg = 'rgba(122,58,24,0.1)', color = '#7A3A18', label = 'Pending Action';

  if (booking.isActuallyCompleted) {
    bg = 'rgba(180,81,30,0.15)'; color = '#A8481A'; label = 'Completed';
  } else if (booking.booking_status === 'Cancelled' || booking.booking_status === 'Rejected') {
    bg = 'rgba(140,47,28,0.1)'; color = '#8C2F1C'; label = 'Cancelled';
  } else if (booking.cancellation_requested_at) {
    bg = 'rgba(140,47,28,0.08)'; color = '#8C2F1C'; label = 'Cancellation Requested';
  } else if (booking.payment_status === 'Awaiting Payment') {
    bg = 'rgba(232,162,101,0.25)'; color = '#A8481A'; label = 'Awaiting Payment';
  } else if (booking.payment_status === 'Complete' || booking.payment_status === 'Verified') {
    bg = 'rgba(63,93,98,0.15)'; color = '#3F5D62'; label = 'Confirmed Trip';
  } else if (booking.payment_status === 'Pending' || booking.payment_status === 'Verification Pending') {
    bg = 'rgba(232,162,101,0.25)'; color = '#A8481A'; label = 'Verification Pending';
  }

  return (
    <span style={{
      display: 'inline-block', padding: '4px 14px', borderRadius: 999,
      fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em',
      background: bg, color,
    }}>
      {label}
    </span>
  );
};

export default MyBookings;