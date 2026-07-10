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
    <div className="space-y-8 animate-in fade-in duration-500 text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-[#C45C26]/[0.12] pb-8">
        <div>
          <p className="text-[#7A3A18]/70 font-medium mt-1">Track your adventures and manage your reservations.</p>
        </div>
        <div className="flex bg-[#F2E4D0] p-1.5 rounded-2xl w-full md:w-auto">
          {['Upcoming', 'Completed', 'Cancelled'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab 
                  ? 'bg-[#FDF6EE] text-[#1A0A00] shadow-sm' 
                  : 'text-[#7A3A18]/70 hover:text-[#7A3A18]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
 
      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="py-20 text-center col-span-full">
            <Loader2 className="animate-spin mx-auto mb-4 text-[#C45C26]" size={40} />
            <p className="text-[#7A3A18]/70 font-bold uppercase tracking-widest text-xs">Retrieving your trips...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="py-24 text-center bg-[#FDF6EE] rounded-[3rem] border-2 border-dashed border-[#C45C26]/[0.12]">
            <div className="w-20 h-20 bg-[#F2E4D0] rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag size={32} className="text-[#C45C26]/20" />
            </div>
            <h3 className="text-lg font-black text-[#1A0A00] uppercase tracking-wide">No {activeTab} Bookings</h3>
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
 
/* ─── Booking List Card ─────────────────────────────────────────── */
const BookingListItem = ({ booking, onView, formatDateRange }) => {
  const tour = booking.tours || {};
  return (
    <div className="bg-[#FDF6EE] rounded-[2.5rem] border border-[#C45C26]/[0.12] p-6 flex flex-col md:flex-row items-center gap-8 hover:shadow-xl hover:shadow-[#C45C26]/[0.08] transition-all group">
      <div className="w-full md:w-48 h-32 rounded-4xl overflow-hidden shrink-0 bg-[#F2E4D0]">
        <img src={tour.image_urls?.[0]} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
      </div>
      <div className="flex-1 text-left">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <span className="px-3 py-1 bg-[#F2E4D0] rounded-full text-[9px] font-black text-[#1A0A00] uppercase tracking-widest font-mono">
            {booking.booking_number}
          </span>
          <StatusBadge booking={booking} />
        </div>
        <h3 className="text-xl font-black text-[#1A0A00] leading-tight mb-3">{tour.title}</h3>
        <div className="flex flex-wrap gap-6 text-[#7A3A18]/70">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide"><MapPin size={14} className="text-[#C45C26]"/> {tour.destination}</div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide"><Calendar size={14} className="text-[#C45C26]"/> {formatDateRange(tour.start_date, tour.duration)}</div>
        </div>
      </div>
      <div className="w-full md:w-auto shrink-0 border-t md:border-t-0 md:border-l border-[#C45C26]/[0.12] pt-6 md:pt-0 md:pl-8 flex flex-col items-center justify-center">
        <p className="text-2xl font-black text-[#1A0A00] mb-4">₱{booking.total_price?.toLocaleString()}</p>
        <button onClick={onView} className="w-full md:w-auto px-8 py-3 bg-[#1A0A00] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#2D1B0E] active:scale-95 transition-all flex items-center justify-center gap-2">
          View Details <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
 
/* ─── Booking Detail Modal ──────────────────────────────────────── */
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
 
  const heroBg = tour.image_urls?.[0];
 
  return (
    <div className="fixed inset-0 z-2000 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-[#1A0A00]/95 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative bg-[#FDF6EE] w-full max-w-2xl max-h-[95vh] rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col text-left">
 
        {/* ── Redesigned Hero Header ── */}
        <div className="relative h-52 shrink-0 overflow-hidden rounded-t-[3rem]">
          {/* Tour image background */}
          {heroBg ? (
            <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover scale-105" />
          ) : (
            <div className="absolute inset-0 bg-[#1A0A00]" />
          )}
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-linear-to-t from-[#120700]/95 via-[#1A0A00]/70 to-transparent" />
          {/* Green accent line at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#C45C26]" />
 
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white hover:bg-black/50 transition-all z-50"
          >
            <X size={18} />
          </button>
 
          {/* Header content */}
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="flex items-end justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[#C45C26] text-[9px] font-black uppercase tracking-[0.25em] mb-2 flex items-center gap-2">
                  <span className="inline-block w-4 h-px bg-[#C45C26]"></span>
                  Booking Confirmation
                </p>
                <h2 className="text-2xl font-black text-white leading-tight truncate">{tour.title}</h2>
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mt-1 font-mono">
                  {booking.booking_number}
                </p>
              </div>
              <div className="shrink-0">
                <StatusBadge booking={booking} large />
              </div>
            </div>
          </div>
        </div>
 
        {/* ── Scrollable Body ── */}
        <div className="overflow-y-auto flex-1 p-8 space-y-6 custom-scrollbar">
 
          {/* Trip Info */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[#C45C26]/[0.12] pb-3">
              <History size={15} className="text-[#C45C26]" />
              <h4 className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest">Trip Information</h4>
            </div>
            <div className="grid grid-cols-2 gap-5">
              <DetailItem label="Destination" value={tour.destination} />
              <DetailItem label="Tour Date" value={formatDateRange(tour.start_date, tour.duration)} />
              <DetailItem label="Pax Count" value={`${booking.slots_booked} persons`} />
              <DetailItem label="Total Price" value={`₱${booking.total_price?.toLocaleString()}`} />
            </div>
          </section>
 
          {/* Non-refundable disclaimer */}
          {canCancel && !showCancelConfirm && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex gap-3">
              <ShieldAlert size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-amber-700 text-xs font-bold leading-relaxed">
                Need to change your plans? You can cancel below. Per our agency policy, all payments are{' '}
                <span className="underline font-black text-amber-900 uppercase">non-refundable</span>.
              </p>
            </div>
          )}
 
          {/* Cancellation Confirmation Panel */}
          {showCancelConfirm && (
            <div className="bg-red-50 border-2 border-red-100 rounded-4xl p-7 space-y-5 animate-in slide-in-from-top-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-red-600 uppercase tracking-wide">Confirm Cancellation</h4>
                  <p className="text-red-400 text-[10px] font-bold">This action cannot be undone. Payment is non-refundable.</p>
                </div>
              </div>
 
              {/* Reason Field */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-black text-red-500 uppercase tracking-widest">
                  <MessageSquare size={12} />
                  Reason for Cancellation <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => { setCancelReason(e.target.value); setReasonError(false); }}
                  placeholder="Please tell us why you're cancelling this tour..."
                  rows={3}
                  className={`w-full px-4 py-3 bg-[#FDF6EE] border-2 rounded-2xl text-sm text-[#1A0A00] placeholder-[#C45C26]/30 resize-none focus:outline-none transition-colors font-medium ${
                    reasonError 
                      ? 'border-red-400 focus:border-red-500' 
                      : 'border-red-100 focus:border-red-300'
                  }`}
                />
                {reasonError && (
                  <p className="text-red-500 text-[10px] font-black uppercase tracking-wide">
                    ⚠ Please provide a reason before cancelling.
                  </p>
                )}
              </div>
 
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowCancelConfirm(false); setCancelReason(''); setReasonError(false); }}
                  className="flex-1 py-3 bg-[#FDF6EE] text-[#7A3A18]/80 rounded-xl font-black text-[10px] uppercase border border-[#C45C26]/[0.18] hover:border-[#C45C26]/[0.25] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCancelBooking}
                  disabled={cancelling}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-[10px] uppercase shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
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
 
        {/* ── Footer Actions ── */}
        <div className="p-6 border-t border-[#C45C26]/[0.12] bg-[#F2E4D0] flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 bg-[#FDF6EE] text-[#7A3A18]/70 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-[#C45C26]/[0.18] hover:border-[#C45C26]/[0.25] transition-all"
          >
            Close
          </button>
          {canCancel && !showCancelConfirm && (
            <button 
              onClick={() => setShowCancelConfirm(true)}
              className="flex-1 py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <Trash2 size={15} /> Cancel Tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
 
/* ─── Helpers ───────────────────────────────────────────────────── */
const DetailItem = ({ label, value }) => (
  <div>
    <p className="text-[9px] font-black text-[#7A3A18]/70 uppercase tracking-widest mb-1">{label}</p>
    <p className="text-sm font-bold text-[#1A0A00]">{value || '—'}</p>
  </div>
);
 
const StatusBadge = ({ booking, large = false }) => {
  let colorClass = "bg-[#F2E4D0] text-[#7A3A18]/80";
  let label = "Pending Action";
 
  if (booking.isActuallyCompleted) {
    colorClass = "bg-[#C45C26]/20 text-[#C45C26]";
    label = "Completed";
  } else if (booking.booking_status === 'Cancelled' || booking.booking_status === 'Rejected') {
    colorClass = "bg-red-500/20 text-red-300";
    label = "Cancelled";
  } else if (booking.payment_status === 'Complete') {
    colorClass = "bg-blue-500/20 text-blue-200";
    label = "Confirmed Trip";
  } else if (booking.payment_status === 'Pending' || booking.payment_status === 'Verification Pending') {
    colorClass = "bg-amber-400/20 text-amber-200";
    label = "Verification Pending";
  }
 
  // In the hero header context the badge sits over the image — use translucent backdrop
  const size = large 
    ? "px-4 py-1.5 text-[10px] backdrop-blur-sm" 
    : "px-3 py-1 text-[9px]";
 
  // For list items (not large), use opaque variants instead
  const listColorClass = large ? colorClass : colorClass
    .replace("text-blue-200", "text-blue-600")
    .replace("text-amber-200", "text-amber-600")
    .replace("text-red-300", "text-red-500")
    .replace("text-[#C45C26]", "text-[#9C4A1F]")
    .replace("bg-blue-500/20", "bg-blue-100")
    .replace("bg-amber-400/20", "bg-amber-100")
    .replace("bg-red-500/20", "bg-red-50")
    .replace("bg-[#C45C26]/20", "bg-[#C45C26]/10");
 
  return (
    <span className={`${size} rounded-full font-black uppercase tracking-widest ${large ? colorClass : listColorClass}`}>
      {label}
    </span>
  );
};
 
export default MyBookings; 