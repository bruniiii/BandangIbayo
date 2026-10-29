import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import EmptyState from './ui/EmptyState';
import { Compass, Mountain, CalendarX2, QrCode, MessagesSquare, BedDouble } from 'lucide-react';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { cancellationDeadline, isWithinCancellationWindow, CANCELLATION_CUTOFF_DAYS, CANCELLATION_APPROVAL_HOURS, withAvailableSlots, todayManila, formatPeso, formatDateRange as formatTourDates, formatPickupTime, effectivePrice, isOnSale } from './tourUtils';
import { sendWaitlistOpeningsEmail } from './Email';
import { downloadReceipt, balanceRemaining, hasBalanceReceipt } from './paymentReceipt';
import { AccommodationSelect } from './ui/Accommodation';
import { cleanAccommodation } from './accommodation';
import { verifyCheckout, cancelCheckout, startBalanceCheckout, payHeldBooking } from './payments';
import { fullNameError, phoneError, cleanName, normalizePhone } from './validation';
import { phoneFieldProps } from './ui/phoneField';
import CheckInQr from './ui/CheckInQr';
import PackingChecklist from './ui/PackingChecklist';
import TripDayCard from './TripDayCard';
import { openGroupChat } from './chatStore';
import { fetchTourExpenses, expenseItems } from './tourExpenses';
import { tripDayBookings } from './tripDay';
import { 
  ShoppingBag, MapPin, Calendar,
  ChevronRight, Loader2, X,
  History, Trash2, ShieldAlert, MessageSquare, Users, CalendarClock, FileDown, CreditCard, Clock, Backpack, Wallet, CheckCircle2
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

const MyBookings = ({ onExplore, openBookingId = null }) => {
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
 
  // Opened from the homepage's Trip Readiness card: show that booking's details once loaded.
  const openIdRef = useRef(openBookingId);

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
          sale_starts,
          sale_ends,
          accommodation_options,
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
      if (openIdRef.current) {
        const target = processedBookings.find((b) => String(b.id) === String(openIdRef.current));
        openIdRef.current = null;
        if (target) setSelectedBooking(target);
      }
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
    // Approve any cancellation request left unanswered for 12 hours, then load.
    const initFetch = async () => { await supabase.rpc('run_overdue_cancellations').then(() => {}, () => {}); await fetchMyBookings(); };
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
      </div>
    </div>
  );
};

/* ─── Booking Detail Modal ─── */
// Reasons a joiner can pick when cancelling; "Other" asks them to type one.
const CANCEL_REASONS = [
  'Schedule conflict / change of plans',
  'Work or school commitments',
  'Personal or family emergency',
  'Health reasons / feeling unwell',
  'Financial reasons',
  'Weather or safety concerns',
  'Travel companion(s) can’t join',
  'Booked the wrong tour or date',
  'No longer interested in this tour',
];
const OTHER_REASON = 'Other (please specify)';

const BookingDetailModal = ({ booking, onClose, formatDateRange, onCancelSuccess }) => {
  const tour = booking.tours || {};
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [agreedNoRefund, setAgreedNoRefund] = useState(false);
  const [agreeError, setAgreeError] = useState(false);

  const [otherReason, setOtherReason] = useState('');
  const reasonText = cancelReason === OTHER_REASON ? otherReason.trim() : cancelReason;

  // Cancels the booking right away (cancel_my_booking): the slots are released,
  // the joiner leaves the tour's chat and tracking, and the admins are told.
  const handleCancelBooking = async () => {
    if (!cancelReason || (cancelReason === OTHER_REASON && otherReason.trim().length < 5)) {
      setReasonError(true);
      return;
    }
    if (!agreedNoRefund) {
      setAgreeError(true);
      return;
    }
    if (!(await confirmDialog({
      title: 'Cancel this booking now?',
      message: `${booking.booking_number} is cancelled right away and your slot${booking.slots_booked === 1 ? ' is' : 's are'} released. The amount you paid won't be refunded.`,
      confirmLabel: 'Cancel Booking', cancelLabel: 'Keep Booking', tone: 'danger',
    }))) return;

    setCancelling(true);
    const reason = cancelReason === OTHER_REASON ? `Other: ${otherReason.trim()}` : cancelReason;
    const { error } = await supabase.rpc('cancel_my_booking', { p_booking_id: booking.id, p_reason: reason });
    setCancelling(false);
    if (error) {
      toast.error("Couldn't cancel your booking", error.message);
      return;
    }
    // The admins are notified by the database.
    sendWaitlistOpeningsEmail({ tourId: booking.tour_id });
    toast.success('Booking cancelled', `${booking.booking_number} has been cancelled.`);
    onCancelSuccess();
  };

  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const isPaymentConfirmed = booking.payment_status === 'Complete' &&
                             booking.booking_status !== 'Cancelled' &&
                             booking.booking_status !== 'Rejected';
  // part: 'payment' (full payment / downpayment) or 'balance' (the paid balance).
  const handleDownloadReceipt = async (part = 'payment') => {
    setDownloadingReceipt(part);
    try {
      await downloadReceipt(booking, tour, part);
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

                {booking.booking_status !== 'Cancelled' && booking.booking_status !== 'Rejected' && (
                  <PickupPointSection booking={booking} tour={tour} />
                )}
                {booking.accommodation && (
                  <ViewSection title="Accommodation" icon={<BedDouble size={14} style={{ color: '#A8481A' }} />}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{booking.accommodation}</p>
                  </ViewSection>
                )}

                {isPaymentConfirmed && <TourExpensesSection tourId={booking.tour_id} />}

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
                      {' '}Bandang IBAYO will review it within {CANCELLATION_APPROVAL_HOURS} hours. If there's no answer by{' '}
                      <strong style={{ color: '#1A0A00' }}>{new Date(new Date(booking.cancellation_requested_at).getTime() + CANCELLATION_APPROVAL_HOURS * 3600e3).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>,
                      {' '}it's approved automatically. You've left this tour's group chat; you'll get a notification once it's approved.
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
                        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0' }}>Your booking is cancelled right away. The amount you paid won't be refunded.</p>
                      </div>
                    </div>

                    <div>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900,
                        color: '#8C2F1C', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8,
                      }}>
                        <MessageSquare size={12} /> Reason for Cancellation <span style={{ color: '#8C2F1C' }}>*</span>
                      </label>
                      <select
                        value={cancelReason}
                        aria-label="Reason for cancellation"
                        onChange={(e) => { setCancelReason(e.target.value); setReasonError(false); }}
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '12px 14px',
                          background: '#FDF6EE', border: `2px solid ${reasonError && !cancelReason ? '#8C2F1C' : 'rgba(180,81,30,0.2)'}`,
                          borderRadius: 16, fontSize: 13, color: '#1A0A00', cursor: 'pointer',
                          outline: 'none', fontFamily: 'inherit', fontWeight: 600,
                        }}
                      >
                        <option value="">Choose a reason…</option>
                        {CANCEL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        <option value={OTHER_REASON}>{OTHER_REASON}</option>
                      </select>
                      {cancelReason === OTHER_REASON && (
                        <textarea
                          value={otherReason}
                          maxLength={500}
                          required
                          aria-label="Please specify your reason"
                          onChange={(e) => { setOtherReason(e.target.value); setReasonError(false); }}
                          placeholder="Please specify your reason…"
                          rows={3}
                          style={{
                            width: '100%', boxSizing: 'border-box', padding: '12px 14px', marginTop: 10,
                            background: '#FDF6EE', border: `2px solid ${reasonError ? '#8C2F1C' : 'rgba(180,81,30,0.2)'}`,
                            borderRadius: 16, fontSize: 13, color: '#1A0A00', resize: 'none',
                            outline: 'none', fontFamily: 'inherit', fontWeight: 500,
                          }}
                        />
                      )}
                      {reasonError && (
                        <p style={{ fontSize: 11.5, fontWeight: 900, color: '#8C2F1C', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0 0' }}>
                          ⚠ {cancelReason === OTHER_REASON ? 'Please specify your reason (at least 5 characters).' : 'Please choose a reason for cancelling.'}
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
                        I understand that all payments are <strong>non-refundable</strong>, and that my cancellation is final.
                      </span>
                    </label>
                    {agreeError && (
                      <p style={{ fontSize: 11.5, fontWeight: 900, color: '#8C2F1C', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '-8px 0 0' }}>
                        ⚠ Please tick the box to confirm you understand.
                      </p>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <button
                        onClick={() => { setShowCancelConfirm(false); setCancelReason(''); setOtherReason(''); setReasonError(false); setAgreedNoRefund(false); setAgreeError(false); }}
                        style={{
                          flex: '1 1 170px', minHeight: 48, padding: '12px 14px', background: '#F2E4D0', color: '#7A3A18',
                          border: '1px solid rgba(180,81,30,0.18)', borderRadius: 14, cursor: 'pointer',
                          fontFamily: 'inherit', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#EDEAE3'}
                        onMouseLeave={e => e.currentTarget.style.background = '#F2E4D0'}
                      >
                        Keep Booking
                      </button>
                      <button
                        onClick={handleCancelBooking}
                        disabled={cancelling || !agreedNoRefund || !reasonText}
                        title={agreedNoRefund ? undefined : 'Tick the box above first'}
                        style={{
                          flex: '1 1 170px', minHeight: 48, padding: '12px 14px', background: '#C0362C', color: '#FFFFFF',
                          opacity: agreedNoRefund && reasonText ? 1 : 0.5,
                          border: 'none', borderRadius: 14, cursor: cancelling || !agreedNoRefund || !reasonText ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                          fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#9E2B23'}
                        onMouseLeave={e => e.currentTarget.style.background = '#C0362C'}
                      >
                        {cancelling
                          ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                          : <><Trash2 size={15} style={{ flexShrink: 0 }} /> Cancel Booking</>
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
                    onClick={() => handleDownloadReceipt('payment')}
                    disabled={!!downloadingReceipt}
                    style={{
                      flex: '1 1 190px', padding: '14px 16px', whiteSpace: 'nowrap', background: '#1A0A00', color: '#FDF6EE',
                      border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: 900, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.1em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {downloadingReceipt === 'payment' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileDown size={14} />}
                    {booking.payment_method === 'Downpayment' ? 'Downpayment Receipt' : 'Download Receipt'}
                  </button>
                )}
                {/* A second receipt once the remaining balance is paid */}
                {isPaymentConfirmed && hasBalanceReceipt(booking) && (
                  <button
                    type="button"
                    onClick={() => handleDownloadReceipt('balance')}
                    disabled={!!downloadingReceipt}
                    style={{
                      flex: '1 1 190px', padding: '14px 16px', whiteSpace: 'nowrap', background: '#B4511E', color: '#FDF6EE',
                      border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: 900, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.1em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {downloadingReceipt === 'balance' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileDown size={14} />} Balance Receipt
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
  // Slots the agency held for the tour this joiner requested (2 days to pay).
  if (isAwaitingPayment && booking.request_id) return <HeldSlotsPayment booking={booking} onChanged={onChanged} />;

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

// The joiner requested this tour, so the agency held their group's slots when
// it was posted. They choose full payment or a 40% downpayment, name the
// people joining them, and pay before the hold runs out (or the slots go to others).
const HeldSlotsPayment = ({ booking, onChanged }) => {
  const others = Math.max(0, (booking.slots_booked || 1) - 1);
  const [companions, setCompanions] = useState(() => Array.from({ length: others }, (_, i) => booking.companions?.[i] || { full_name: '', contact_number: '' }));
  const [paymentType, setPaymentType] = useState('full');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(null); // 'pay' | 'cancel'
  const [problem, setProblem] = useState('');
  const [accommodation, setAccommodation] = useState(booking.accommodation || '');
  const accommodationChoices = cleanAccommodation(booking.tours?.accommodation_options);
  // Today's price for this date (5% off while it's on sale), the same as the database charges.
  const total = (booking.tours ? effectivePrice(booking.tours) * (booking.slots_booked || 1) : 0) || Number(booking.total_price || 0);
  // A date on sale is paid in full (no downpayment).
  const onSale = !!booking.tours && isOnSale(booking.tours);
  const amount = paymentType === 'full' || onSale ? total : Math.round(total * 40) / 100;
  const until = booking.hold_expires_at
    ? new Date(booking.hold_expires_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  const setCompanion = (i, field, value) => setCompanions((rows) => rows.map((c, j) => (j === i ? { ...c, [field]: value } : c)));

  // Booking for a group: the names are entered in a pop-up, then payment opens.
  const [namesOpen, setNamesOpen] = useState(false);
  const [namesProblem, setNamesProblem] = useState('');
  const namesError = () => {
    for (let i = 0; i < companions.length; i++) {
      const c = companions[i];
      const err = fullNameError(c.full_name, `Person ${i + 2}'s name`) || phoneError(c.contact_number, `Person ${i + 2}'s contact number`);
      if (err) return err;
    }
    const names = companions.map((c) => cleanName(c.full_name).toLowerCase());
    if (names.some((n, i) => names.indexOf(n) !== i)) return 'Each person joining needs their own name.';
    return '';
  };

  const pay = async ({ namesDone = false } = {}) => {
    setProblem('');
    if (accommodationChoices.length && !accommodation) { setProblem('Please choose your accommodation.'); return; }
    if (companions.length && !namesDone) { setNamesProblem(''); setNamesOpen(true); return; }
    const err = namesError();
    if (err) { setNamesProblem(err); setNamesOpen(true); return; }
    setNamesOpen(false);
    setBusy('pay');
    const { ok, data, error } = await payHeldBooking({
      bookingId: booking.id,
      paymentType: onSale ? 'full' : paymentType,
      companions: companions.map((c) => ({ full_name: cleanName(c.full_name), contact_number: normalizePhone(c.contact_number) || c.contact_number.trim() })),
      accommodation: accommodation || null,
    });
    if (!ok) { toast.error("Couldn't open the payment page", error); setBusy(null); return; }
    if (data.alreadyPaid) { toast.success('Already paid', 'Your booking is confirmed.'); setBusy(null); onChanged(); return; }
    window.location.assign(data.checkoutUrl);
  };

  const release = async () => {
    if (!(await confirmDialog({ title: 'Give up your held slots?', message: 'Your slots will be released so other joiners can book them.', confirmLabel: 'Release Slots', cancelLabel: 'Keep My Slots', tone: 'danger' }))) return;
    setBusy('cancel');
    const { ok, error } = await cancelCheckout({ bookingId: booking.id });
    setBusy(null);
    if (!ok) { toast.error("Couldn't release the slots", error); return; }
    onChanged();
  };

  const field = { width: '100%', boxSizing: 'border-box', background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 12, padding: '10px 12px', minHeight: 44, fontSize: 13, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit', outline: 'none' };
  const choice = (active) => ({
    flex: 1, minWidth: 140, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 14, padding: '10px 12px',
    border: active ? '2px solid #B4511E' : '1px solid rgba(180,81,30,0.25)', background: active ? 'rgba(180,81,30,0.08)' : '#FDF6EE', color: '#1A0A00',
  });

  return (
    <ViewSection title="Your Held Slots" icon={<CreditCard size={14} style={{ color: '#A8481A' }} />}>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', margin: '0 0 12px', lineHeight: 1.6 }}>
        You requested this tour, so we're holding <strong>{booking.slots_booked} slot{booking.slots_booked === 1 ? '' : 's'}</strong> for you
        {until ? <> until <strong>{until}</strong></> : null}. Pay before then to keep them, or they'll be released to other joiners.
      </p>

      <div role="radiogroup" aria-label="Payment" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['full', 'Full payment', total], ...(onSale ? [] : [['down', '40% downpayment', Math.round(total * 40) / 100]])].map(([key, label, value]) => (
          <button key={key} type="button" role="radio" aria-checked={paymentType === key} onClick={() => setPaymentType(key)} style={choice(paymentType === key)}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A8481A' }}>{label}</span>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 900 }}>{formatPeso(value)}</span>
          </button>
        ))}
      </div>
      {onSale && (
        <p style={{ fontSize: 12, fontWeight: 700, color: '#8C2F1C', margin: '-4px 0 12px' }}>This date is on sale, so it must be paid in full.</p>
      )}

      {companions.length > 0 && (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '0 0 12px', lineHeight: 1.5 }}>
          When you pay, you'll enter the name and contact number of the {companions.length} {companions.length === 1 ? 'person' : 'people'} joining you.
        </p>
      )}

      {namesOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(26,10,0,0.8)', backdropFilter: 'blur(4px)' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="held-names-title" style={{
            background: '#FDF6EE', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto',
            borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', borderTop: '8px solid #B4511E', padding: '2rem',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div>
              <p style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 4px' }}>Your group</p>
              <h3 id="held-names-title" style={{ fontSize: 22, fontWeight: 900, color: '#1A0A00', margin: 0 }}>Who's joining you?</h3>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0' }}>Enter each person's full name and contact number, then continue to payment.</p>
            </div>
            {companions.map((c, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: '#A8481A' }}>Person {i + 2}</span>
                <input aria-label={`Person ${i + 2}'s full name`} data-allow="name" placeholder="Full name" value={c.full_name} maxLength={120}
                  onChange={(e) => { setCompanion(i, 'full_name', e.target.value); setNamesProblem(''); }} style={field} />
                <input {...phoneFieldProps(c.contact_number, (v) => { setCompanion(i, 'contact_number', v); setNamesProblem(''); })} aria-label={`Person ${i + 2}'s contact number`} style={field} />
              </div>
            ))}
            {namesProblem && <p role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: '#8C2F1C', margin: 0 }}>{namesProblem}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setNamesOpen(false)} style={{
                flex: 1, minWidth: 120, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(180,81,30,0.25)', background: '#F2E4D0', color: '#1A0A00',
                fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
              }}>Back</button>
              <button type="button" onClick={() => pay({ namesDone: true })} style={{
                flex: 2, minWidth: 180, padding: '13px 0', borderRadius: 14, border: 'none', background: '#B4511E', color: '#FDF6EE',
                fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
              }}>Continue to Payment</button>
            </div>
          </div>
        </div>
      )}

      <AccommodationSelect id={`held-accommodation-${booking.id}`} options={accommodationChoices} value={accommodation} onChange={(v) => { setAccommodation(v); setProblem(''); }} />

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5, margin: '0 0 12px', cursor: 'pointer' }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, accentColor: '#B4511E', flexShrink: 0 }} />
        <span>I agree that my payment is <strong>non-refundable</strong>, that cancellations close 14 days before the tour, and that the tour date <strong>may be moved because of bad weather</strong> or other safety concerns.</span>
      </label>

      {problem && <p role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: '#8C2F1C', margin: '0 0 10px' }}>{problem}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" disabled={busy !== null || !agreed} onClick={() => pay()} title={agreed ? undefined : 'Tick the agreement above first'} style={{
          flex: 2, minWidth: 180, padding: '12px 0', borderRadius: 14, border: 'none', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5,
          letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: '#B4511E', color: '#FDF6EE', cursor: agreed ? 'pointer' : 'not-allowed', opacity: agreed ? 1 : 0.5,
        }}>
          {busy === 'pay' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CreditCard size={14} />} Pay {formatPeso(amount)} now
        </button>
        <button type="button" disabled={busy !== null} onClick={release} style={{
          flex: 1, minWidth: 140, padding: '12px 0', borderRadius: 14, fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5,
          letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: '#FDF6EE', color: '#8C2F1C', border: '1px solid rgba(140,47,28,0.25)', cursor: 'pointer',
        }}>
          {busy === 'cancel' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={14} />} Release slots
        </button>
      </div>
    </ViewSection>
  );
};

/* ── Move to another date: same trip (destination) at the same price ── */
// What the tour covers (van, guide, bag tag, others): names only, no prices.
const TourExpensesSection = ({ tourId }) => {
  const [expenses, setExpenses] = useState(undefined);
  useEffect(() => {
    let active = true;
    fetchTourExpenses(tourId).then((e) => { if (active) setExpenses(e); });
    return () => { active = false; };
  }, [tourId]);
  if (!expenses) return null;
  return (
    <ViewSection title="Tour Expenses" icon={<Wallet size={14} style={{ color: '#A8481A' }} />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {expenseItems(expenses).map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#1A0A00' }}>
            <CheckCircle2 size={14} style={{ color: '#1F8A5C', flexShrink: 0 }} /><span>{item.label}</span>
          </div>
        ))}
      </div>
    </ViewSection>
  );
};

// The joiner's pickup point: shown, and changeable until the tour date.
const PickupPointSection = ({ booking, tour }) => {
  const [points, setPoints] = useState(null);
  const [current, setCurrent] = useState(booking.pickup_point || '');
  const [saving, setSaving] = useState(false);
  const canChange = !!tour.start_date && tour.start_date > todayManila();

  useEffect(() => {
    let active = true;
    supabase.rpc('tour_pickup_points', { p_tour_id: booking.tour_id })
      .then(({ data, error }) => { if (active) setPoints(error ? [] : data || []); });
    return () => { active = false; };
  }, [booking.tour_id]);

  const change = async (value) => {
    if (!value || value === current) return;
    setSaving(true);
    const { error } = await supabase.from('bookings').update({ pickup_point: value }).eq('id', booking.id);
    setSaving(false);
    if (error) { toast.error("Couldn't change your pickup point", error.message); return; }
    setCurrent(value);
    toast.success('Pickup point updated', value);
  };

  const timeOf = (name) => points?.find((p) => p.location_name === name)?.scheduled_time;

  return (
    <ViewSection title="Pickup Point" icon={<MapPin size={14} style={{ color: '#A8481A' }} />}>
      {current ? (
        <p style={{ fontSize: 14, fontWeight: 800, color: '#1A0A00', margin: '0 0 8px' }}>
          {current}{timeOf(current) ? <span style={{ fontWeight: 600, color: '#7A3A18' }}> · {formatPickupTime(timeOf(current))}</span> : null}
        </p>
      ) : (
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '0 0 8px' }}>
          {points?.length ? "You haven't chosen a pickup point yet." : 'Pickup points will be posted before the trip.'}
        </p>
      )}
      {canChange && points?.length > 0 && (
        <select
          aria-label={current ? 'Change pickup point' : 'Choose pickup point'}
          value=""
          disabled={saving}
          onChange={(e) => change(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.22)',
            borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#7A3A18', fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          <option value="">{saving ? 'Saving…' : current ? 'Change pickup point…' : 'Choose your pickup point…'}</option>
          {points.filter((p) => p.location_name !== current).map((p) => (
            <option key={p.location_name} value={p.location_name}>{p.location_name}{p.scheduled_time ? ` · ${formatPickupTime(p.scheduled_time)}` : ''}</option>
          ))}
        </select>
      )}
    </ViewSection>
  );
};

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