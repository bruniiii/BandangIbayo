import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, MapPin, Users, Calendar as CalendarIcon,
  Loader2, Eye, X, CheckCircle2, ImageIcon, AlertCircle, ChevronDown,
  Clock, CreditCard, Wallet, Receipt, Upload, ArrowRight, Check,
  ArrowLeft, Smartphone // <-- Add these two
} from 'lucide-react';
 
/* ─────────────────────────────────────────────
  TOUR CALENDAR
───────────────────────────────────────────── */
const TourCalendar = ({ initialDate }) => {
  // initialDate is an optional { year, month, day } object passed down from
  // JoinerDashboard when the joiner clicks a specific day/month in the
  // dashboard's mini calendar. `month` is 0-indexed to match Date's API.
  // Falls back to "today" when this component is opened from the sidebar nav.
  const [currentMonth, setCurrentMonth] = useState(() =>
    initialDate ? new Date(initialDate.year, initialDate.month, 1) : new Date()
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    initialDate ? new Date(initialDate.year, initialDate.month, initialDate.day || 1) : new Date()
  );
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTour, setSelectedTour] = useState(null);
 
  const fetchToursWithAvailability = useCallback(async () => {
    setLoading(true);
    const { data: toursData } = await supabase.from('tours').select('*').eq('is_archived', false);
    const { data: bookingsData } = await supabase.from('bookings').select('tour_id, slots_booked').eq('booking_status', 'Completed')
 
    const updatedTours = (toursData || []).map(tour => {
      const totalBooked = (bookingsData || [])
        .filter(b => b.tour_id === tour.id)
        .reduce((sum, b) => sum + (b.slots_booked || 0), 0);
      const maxCapacity = tour.group_size || 15;
      return {
        ...tour,
        current_booked: totalBooked,
        available_slots: Math.max(0, maxCapacity - totalBooked)
      };
    });
 
    setTours(updatedTours);
    setLoading(false);
  }, []);
 
  useEffect(() => {
    const initFetch = async () => { await fetchToursWithAvailability(); };
    initFetch();
    const channel = supabase
      .channel('calendar-booking-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchToursWithAvailability();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentMonth, fetchToursWithAvailability]);
 
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
 
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
 
  const getToursForDay = (day) => {
    return tours.filter(tour => {
      const checkDay = new Date(new Date(day).setHours(0, 0, 0, 0));
      const start = new Date(new Date(tour.start_date).setHours(0, 0, 0, 0));
      const end = new Date(new Date(tour.end_date).setHours(0, 0, 0, 0));
      return checkDay >= start && checkDay <= end;
    });
  };
 
  const selectedDayTours = getToursForDay(selectedDate);
 
  return (
    <div className="space-y-8 animate-in fade-in duration-500 text-left">
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8 text-left">
 
        {/* ── Calendar Grid ── */}
        <div className="lg:col-span-8 bg-[#FDF6EE] p-8 rounded-[2.5rem] border border-[#C45C26]/12 shadow-sm text-left">
          <div className="flex justify-between items-center mb-10 text-left">
            <h2 className="text-2xl font-black text-[#1A0A00] uppercase tracking-tight text-left">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <div className="flex gap-2 text-left">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-[#F2E4D0] rounded-full transition-colors"><ChevronLeft /></button>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-[#F2E4D0] rounded-full transition-colors"><ChevronRight /></button>
            </div>
          </div>
 
          <div className="grid grid-cols-7 mb-6 text-center border-b border-[#C45C26]/8 pb-4">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-[11px] font-black text-[#1A0A00] uppercase tracking-[0.2em]">{day}</div>
            ))}
          </div>
 
          <div className="grid grid-cols-7 gap-2 text-left">
            {calendarDays.map((day, idx) => {
              const dayTours = getToursForDay(new Date(day));
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, monthStart);
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const isPast = day < today;
              return (
                <button
                  key={idx}
                  onClick={() => !isPast && setSelectedDate(day)}
                  disabled={isPast}
                  className={`h-24 rounded-2xl p-3 transition-all flex flex-col border-2 text-left
                    ${isPast ? 'bg-[#F2E4D0]/10 cursor-not-allowed opacity-20 border-transparent' : 'bg-[#F2E4D0]/30'}
                    ${isSelected && !isPast ? 'border-[#C45C26] bg-[#C45C26]/8' : 'border-transparent hover:border-[#C45C26]/12'}`}
                >
                  <span className={`text-sm font-black ${isPast ? 'text-[#C45C26]/30' : isSelected ? 'text-[#C45C26]' : isCurrentMonth ? 'text-[#1A0A00]' : 'text-[#7A3A18]/70'}`}>
                    {format(day, 'd')}
                  </span>
                  {dayTours.length > 0 && !isPast && (
                    <div className="mt-auto">
                      <div className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md inline-block ${isCurrentMonth ? 'text-[#7A3A18] bg-[#E8A265]/18' : 'text-[#7A3A18]/70 bg-[#F2E4D0]'}`}>
                        {dayTours.length} {dayTours.length === 1 ? 'Tour' : 'Tours'}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
 
        {/* ── Daily Sidebar ── */}
        <div className="lg:col-span-4 space-y-6 h-full text-left">
          <div className="bg-[#1A0A00] p-8 rounded-[2.5rem] text-white shadow-xl h-full flex flex-col text-left">
            <p className="text-[10px] font-black text-[#C45C26] uppercase tracking-[0.2em] mb-2">Schedule for</p>
            <h3 className="text-3xl font-black mb-8">{format(selectedDate, 'MMMM dd')}</h3>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/20" size={32} /></div>
              ) : selectedDayTours.length > 0 ? (
                selectedDayTours.map(tour => (
                  <div key={tour.id} className="bg-[#FDF6EE]/10 p-5 rounded-3xl border border-white/5 group hover:bg-[#FDF6EE]/20 transition-all duration-300">
                    <h4 className="font-black text-sm uppercase mb-2">{tour.title}</h4>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/60 mb-1">
                      <MapPin size={12} className="text-[#C45C26]" /> {tour.destination}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold mb-4">
                      <Users size={12} className="text-[#C45C26]" />
                      <span className={tour.available_slots > 0 ? 'text-white/70' : 'text-red-400'}>
                        {tour.current_booked}/{tour.group_size} Booked
                      </span>
                      {tour.available_slots <= 0 && (
                        <span className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Full</span>
                      )}
                    </div>
                    {/* Slot bar */}
                    <div className="w-full bg-[#FDF6EE]/10 rounded-full h-1.5 overflow-hidden mb-4">
                      <div
                        className={`h-1.5 rounded-full transition-all ${tour.available_slots <= 0 ? 'bg-red-400' : tour.available_slots <= 3 ? 'bg-amber-400' : 'bg-[#C45C26]'}`}
                        style={{ width: `${Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-black text-[#C45C26]">₱{tour.price.toLocaleString()}</span>
                      <button
                        onClick={() => setSelectedTour(tour)}
                        className="bg-[#FDF6EE] text-[#1A0A00] px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#C45C26] hover:text-white transition-all"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center opacity-30 italic text-sm border-2 border-dashed border-white/10 rounded-4xl">
                  No tours scheduled.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
 
      {/* ── Tour Detail Modal ── */}
      {selectedTour && (
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 text-left">
          <div className="absolute inset-0 bg-[#1A0A00]/95 backdrop-blur-md" onClick={() => setSelectedTour(null)}></div>
          <div className="relative bg-[#FDF6EE] w-full max-w-7xl h-[95vh] rounded-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row text-left">
            <TourDetailView
              tour={selectedTour}
              onClose={() => setSelectedTour(null)}
              formatDate={formatDate}
              formatDateRange={formatDateRange}
              onBookingSuccess={fetchToursWithAvailability}
            />
          </div>
        </div>
      )}
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   TOUR DETAIL VIEW (inside Calendar modal)
───────────────────────────────────────────── */
const TourDetailView = ({ tour, onClose, formatDate, formatDateRange, onBookingSuccess }) => {
  const [primaryImage, setPrimaryImage] = useState(tour.image_urls?.[0] || null);
  const [numPersons, setNumPersons] = useState(1);
  const [showPaymentFlow, setShowPaymentFlow] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [validating, setValidating] = useState(false);
 
  const isFullyBooked = tour.available_slots <= 0;
  const maxBookingLimit = Math.min(tour.available_slots || 0, 10);
 
  const handleProceedToPayment = async () => {
    setSlotError("");
    setValidating(true);
 
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("Please log in to book a tour."); setValidating(false); return; }
 
    const { data: freshBookings } = await supabase
      .from('bookings')
      .select('slots_booked')
      .eq('tour_id', tour.id)
      .eq('booking_status', 'Completed')
 
    const totalBooked = (freshBookings || []).reduce((sum, b) => sum + (b.slots_booked || 0), 0);
    const freshAvailable = (tour.group_size || 15) - totalBooked;
 
    if (freshAvailable <= 0) {
      setSlotError("Sorry, this tour is now fully booked.");
      setValidating(false);
      return;
    }
    if (numPersons > freshAvailable) {
      setSlotError(`Only ${freshAvailable} slot${freshAvailable > 1 ? 's' : ''} remaining. Please reduce the number of persons.`);
      setValidating(false);
      return;
    }
 
    // Duplicate guard: check if user already has an active/pending booking for this tour
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id, booking_number')
      .eq('tour_id', tour.id)
      .eq('user_id', user.id)
      .not('booking_status', 'in', '("Cancelled","Rejected")')
      .maybeSingle();
 
    if (existingBooking) {
      setSlotError(`You already have an active booking for this tour (${existingBooking.booking_number}). Please check My Bookings.`);
      setValidating(false);
      return;
    }
 
    setValidating(false);
    setShowPaymentFlow(true);
  };
 
  const handleBookingComplete = () => {
    setShowPaymentFlow(false);
    onClose();
    if (onBookingSuccess) onBookingSuccess();
  };
 
  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden w-full relative text-left">
      <button onClick={onClose} className="absolute top-8 right-8 text-[#7A3A18]/70 hover:text-[#1A0A00] z-50 transition-colors"><X size={32} /></button>
 
      {/* Left: Tour details */}
      <div className="flex-1 p-12 overflow-y-auto space-y-12 h-full text-left custom-scrollbar">
        <section>
          <div className="rounded-3xl overflow-hidden shadow-xl mb-6 h-112 bg-[#F2E4D0] shrink-0">
            {primaryImage
              ? <img src={primaryImage} className="w-full h-full object-cover animate-in fade-in" alt="" />
              : <div className="w-full h-full flex items-center justify-center italic text-[#C45C26]/30"><ImageIcon size={64} /></div>
            }
          </div>
          {tour.image_urls?.length > 1 && (
            <div className="flex gap-3 mb-6 flex-wrap">
              {tour.image_urls.map((url, idx) => (
                <div key={idx} onClick={() => setPrimaryImage(url)}
                  className="w-16 h-16 rounded-xl overflow-hidden border-2 cursor-pointer transition-all hover:border-[#C45C26]"
                  style={{ borderColor: primaryImage === url ? '#C45C26' : '#F2E4D0' }}>
                  <img src={url} className="w-full h-full object-cover" alt="" />
                </div>
              ))}
            </div>
          )}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest">Description</h4>
            <p className="text-[#7A3A18] text-base font-medium leading-relaxed whitespace-pre-wrap">{tour.description}</p>
          </div>
        </section>
 
        <div className="grid grid-cols-2 gap-12 border-t border-[#C45C26]/12 pt-10">
          <section>
            <h4 className="text-xs font-black text-[#C45C26] uppercase tracking-widest mb-4 flex items-center gap-2"><CheckCircle2 size={16} /> Inclusions</h4>
            <pre className="text-[#7A3A18]/80 text-sm font-sans whitespace-pre-wrap leading-relaxed">{tour.inclusions || "N/A"}</pre>
          </section>
          <section>
            <h4 className="text-xs font-black text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2"><X size={16} /> Exclusions</h4>
            <pre className="text-[#7A3A18]/80 text-sm font-sans whitespace-pre-wrap leading-relaxed">{tour.exclusions || "N/A"}</pre>
          </section>
        </div>
 
        <div className="grid grid-cols-2 gap-12 border-t border-[#C45C26]/12 pt-10">
          <section>
            <h4 className="text-xs font-black text-[#1A0A00] uppercase tracking-widest mb-4">Itinerary</h4>
            <pre className="text-[#7A3A18]/80 text-sm font-sans whitespace-pre-wrap leading-relaxed">{tour.itinerary || "N/A"}</pre>
          </section>
          <section>
            <h4 className="text-xs font-black text-[#1A0A00] uppercase tracking-widest mb-4">Things to Bring</h4>
            <pre className="text-[#7A3A18]/80 text-sm font-sans whitespace-pre-wrap leading-relaxed">{tour.things_to_bring || "N/A"}</pre>
          </section>
        </div>
 
        {tour.important_note && (
          <div className="bg-red-50 p-8 rounded-[2.5rem] border border-red-100 flex gap-5">
            <AlertCircle className="text-red-500 shrink-0" size={24} />
            <div>
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-2">Important Note</p>
              <pre className="text-red-700 text-sm font-bold font-sans leading-relaxed whitespace-pre-wrap">{tour.important_note}</pre>
            </div>
          </div>
        )}
      </div>
 
      {/* Right: Booking sidebar */}
      <div className="w-full md:w-96 bg-[#f8fafc] p-12 flex flex-col h-full shrink-0 border-l border-[#C45C26]/12 overflow-hidden text-left">
        <h2 className="text-4xl font-black text-[#1A0A00] leading-tight mb-8">{tour.title}</h2>
 
        <div className="space-y-8 mb-8 flex-1">
          <div className="space-y-5">
            <div className="flex items-center gap-3 text-[#7A3A18]/80 font-bold text-sm">
              <CalendarIcon size={18} className="text-[#C45C26]" /> {formatDateRange(tour.start_date, tour.duration)}
            </div>
            <div className="flex items-center gap-3 text-[#7A3A18]/80 font-bold text-sm">
              <Clock size={18} className="text-[#C45C26]" /> {tour.duration}
            </div>
            <div className="flex items-center gap-3 font-bold text-sm">
              <Users size={18} className="text-[#C45C26]" />
              <span className={isFullyBooked ? 'text-red-500' : 'text-[#7A3A18]/80'}>
                {tour.current_booked} / {tour.group_size} Slots Booked
              </span>
            </div>
            <div className="w-full bg-[#F2E4D0] rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${isFullyBooked ? 'bg-red-500' : tour.available_slots <= 3 ? 'bg-amber-500' : 'bg-[#C45C26]'}`}
                style={{ width: `${Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100)}%` }}
              />
            </div>
            {isFullyBooked ? (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                <AlertCircle size={16} className="text-red-500 shrink-0" />
                <p className="text-red-600 text-xs font-black uppercase tracking-wide">Fully Booked</p>
              </div>
            ) : tour.available_slots <= 3 ? (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <AlertCircle size={16} className="text-amber-500 shrink-0" />
                <p className="text-amber-600 text-xs font-bold">Only {tour.available_slots} slot{tour.available_slots > 1 ? 's' : ''} left!</p>
              </div>
            ) : null}
          </div>
 
          {!isFullyBooked && (
            <div className="pt-6 border-t border-[#C45C26]/18">
              <label className="text-[10px] font-black text-[#7A3A18]/70 uppercase block mb-4">Number of Persons</label>
              <div className="relative">
                <select
                  value={numPersons}
                  onChange={(e) => { setNumPersons(parseInt(e.target.value)); setSlotError(""); }}
                  className="w-full bg-[#FDF6EE] rounded-2xl px-6 py-4 text-sm font-bold text-[#1A0A00] appearance-none cursor-pointer focus:ring-2 focus:ring-[#C45C26] shadow-sm"
                >
                  {[...Array(maxBookingLimit)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? 'Person' : 'Persons'}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-[#C45C26]/30 pointer-events-none" size={18} />
              </div>
              {slotError && (
                <p className="mt-3 text-xs text-red-500 font-bold flex items-center gap-2">
                  <AlertCircle size={14} /> {slotError}
                </p>
              )}
            </div>
          )}
        </div>
 
        <div className="pt-8 border-t-2 border-[#C45C26]/18 mt-auto">
          {!isFullyBooked && (
            <div className="flex justify-between items-end mb-8">
              <p className="text-sm font-black text-[#1A0A00] uppercase tracking-widest">Total</p>
              <p className="text-4xl font-black text-[#C45C26]">₱{(tour.price * numPersons).toLocaleString()}</p>
            </div>
          )}
          <button
            onClick={handleProceedToPayment}
            disabled={validating || isFullyBooked}
            className={`w-full py-5 rounded-2xl font-black text-xs uppercase shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-center ${isFullyBooked ? 'bg-[#F2E4D0] text-[#7A3A18]/70 cursor-not-allowed' : 'bg-[#C45C26] hover:bg-[#9C4A1F] text-white'}`}
          >
            {validating ? <Loader2 className="animate-spin" size={16} /> : isFullyBooked ? 'Fully Booked' : <><ArrowRight size={16} /> Book This Tour</>}
          </button>
        </div>
      </div>
 
      {/* Payment Flow Overlay */}
      {showPaymentFlow && (
        <PaymentFlowModal
          tour={tour}
          numPersons={numPersons}
          formatDate={formatDate}
          formatDateRange={formatDateRange}
          onClose={() => setShowPaymentFlow(false)}
          onSuccess={handleBookingComplete}
        />
      )}
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   PAYMENT FLOW MODAL  (4-step)
   Step 1 → Proceed to Payment Modal
   Step 2 → Choose Payment Type Modal
   Step 3 → GCash Payment Modal
   Step 4 → Success Modal
───────────────────────────────────────────── */
 
// Step 1: Proceed to Payment confirmation
const ProceedToPaymentModal = ({ tour, numPersons, subtotal, formatDateRange, onProceed, onCancel }) => (
  <div className="fixed inset-0 z-2000 flex items-center justify-center p-6 bg-[#1A0A00]/80 backdrop-blur-sm">
    <div className="bg-[#FDF6EE] w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
      <div className="p-10 space-y-8">
        <div className="flex items-center justify-between">
          <button onClick={onCancel} className="text-[#7A3A18]/70 hover:text-[#7A3A18] transition-colors"><X size={24} /></button>
          <span className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest">Step 1 of 3</span>
        </div>
        <div>
          <p className="text-[10px] font-black text-[#C45C26] uppercase tracking-widest mb-1">Booking Preview</p>
          <h3 className="text-3xl font-black text-[#1A0A00] leading-tight">{tour.title}</h3>
        </div>
        <div className="bg-[#F2E4D0] rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-3 text-[#7A3A18] text-sm font-bold">
            <MapPin size={16} className="text-[#C45C26] shrink-0" /> {tour.destination}
          </div>
          <div className="flex items-center gap-3 text-[#7A3A18] text-sm font-bold">
            <CalendarIcon size={16} className="text-[#C45C26] shrink-0" /> {formatDateRange(tour.start_date, tour.duration)}
          </div>
          <div className="flex items-center gap-3 text-[#7A3A18] text-sm font-bold">
            <Users size={16} className="text-[#C45C26] shrink-0" /> {numPersons} {numPersons === 1 ? 'Person' : 'Persons'}
          </div>
        </div>
        <div className="border-t-2 border-[#C45C26]/12 pt-6">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-[#7A3A18]/80">Price per person</span>
            <span className="text-sm font-black text-[#1A0A00]">₱{tour.price.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base font-black text-[#1A0A00] uppercase tracking-wide">Subtotal</span>
            <span className="text-3xl font-black text-[#C45C26]">₱{subtotal.toLocaleString()}</span>
          </div>
        </div>
        <button onClick={onProceed}
          className="w-full py-5 bg-[#1A0A00] hover:bg-[#2D1B0E] text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <CreditCard size={16} /> Proceed to Payment
        </button>
      </div>
    </div>
  </div>
);
 
// Step 2: Choose Full or Downpayment
const ChoosePaymentTypeModal = ({ subtotal, downpaymentAmount, onChoose, onBack }) => (
  <div className="fixed inset-0 z-2000 flex items-center justify-center p-6 bg-[#1A0A00]/80 backdrop-blur-sm">
    <div className="bg-[#FDF6EE] w-full max-w-md p-10 rounded-[3rem] shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between w-full mb-2">
        <button onClick={onBack} className="flex items-center gap-2 text-[#7A3A18]/70 hover:text-[#1A0A00] text-xs font-black uppercase tracking-widest transition-colors">
          <ArrowLeft size={14}/> Back
        </button>
        <span className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest">Step 2 of 3</span>
      </div>
      <div>
        <h3 className="text-2xl font-black text-[#1A0A00] uppercase tracking-tight">Choose Payment Type</h3>
        <p className="text-[#7A3A18]/80 text-sm font-medium mt-2">How would you like to pay for your booking?</p>
      </div>
      <div className="space-y-4 text-left">
        {/* Full Payment */}
        <button
          onClick={() => onChoose('full')}
          className="w-full bg-[#1A0A00] text-white rounded-3xl p-6 text-left hover:bg-[#2D1B0E] transition-all group shadow-lg"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#C45C26]">Full Payment</span>
            <Check size={16} className="text-[#C45C26]" />
          </div>
          <p className="text-3xl font-black">₱{subtotal.toLocaleString()}</p>
          <p className="text-xs text-[#C45C26]/30 font-medium mt-1">Pay the complete amount now</p>
        </button>
        
        {/* Downpayment */}
        <button
          onClick={() => onChoose('down')}
          className="w-full bg-[#FDF6EE] border-2 border-[#C45C26]/18 rounded-3xl p-6 text-left hover:border-[#C45C26] hover:bg-[#C45C26]/5 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#C45C26]">Downpayment (40%)</span>
            <span className="text-[10px] font-black text-[#7A3A18]/70 uppercase">Balance Later</span>
          </div>
          <p className="text-3xl font-black text-[#1A0A00]">₱{downpaymentAmount.toLocaleString()}</p>
          <p className="text-xs text-[#7A3A18]/70 font-medium mt-1">Pay 40% now, settle the rest before the tour</p>
        </button>
      </div>
    </div>
  </div>
);
 
// Step 3: GCash Payment Form + Booking Summary
const GCashPaymentModal = ({ tour, numPersons, subtotal, downpaymentAmount, paymentType, onSuccess, onBack }) => {
  const [gcashNumber, setGcashNumber] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  
  useEffect(() => {
    const prefillPhone = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone_number')
        .eq('id', user.id)
        .single();
      if (profile?.phone_number) setGcashNumber(profile.phone_number);
    };
    prefillPhone();
  }, []);
  
  const totalDue = paymentType === 'full' ? subtotal : downpaymentAmount;
  
  const handleReceiptChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { 
      setError("Please upload an image file."); 
      return; 
    }
    setReceipt(file);
    setReceiptPreview(URL.createObjectURL(file));
    setError("");
  };
  
  const handleConfirmBooking = async () => {
    if (!gcashNumber.trim()) return setError("Please enter your GCash number.");
    if (!refNumber.trim()) return setError("Please enter the GCash reference number.");
    if (!receipt) return setError("Please upload a screenshot of your transaction.");
    
    setSubmitting(true);
    setError("");
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please log in to book a tour.");
      
      /* Race condition: re-verify slots */
      const { data: freshBookings } = await supabase
        .from('bookings')
        .select('slots_booked')
        .eq('tour_id', tour.id)
        .eq('booking_status', 'Completed');
      
      const totalBooked = (freshBookings || []).reduce((sum, b) => sum + (b.slots_booked || 0), 0);
      const freshAvailable = (tour.group_size || 15) - totalBooked;
      if (numPersons > freshAvailable) throw new Error(`Only ${freshAvailable} slot(s) remaining.`);
      
      /* Upload receipt */
      const fileExt = receipt.name.split('.').pop();
      const fileName = `receipts/${Date.now()}_${user.id}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('booking-receipts')
        .upload(fileName, receipt, { upsert: true });
      if (uploadError) throw new Error("Receipt upload failed: " + uploadError.message);
      
      const { data: { publicUrl } } = supabase.storage.from('booking-receipts').getPublicUrl(fileName);
      
      /* Fetch profile */
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone_number')
        .eq('id', user.id)
        .single();
      
      /* Generate booking number */
      const bkNum = 'BK-' + Math.random().toString(36).substr(2, 8).toUpperCase();
      
      /* Insert booking */
      const { error: bookingError } = await supabase.from('bookings').insert([{
        tour_id: tour.id,
        user_id: user.id,
        booking_number: bkNum,
        full_name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || "N/A" : "N/A",
        contact_number: profile?.phone_number || "N/A",
        email: user.email,        
        slots_booked: numPersons,
        total_price: totalDue,
        receipt_url: publicUrl, 
        payment_method: paymentType === 'full' ? 'Full Payment' : 'Downpayment',
      }]);
      
      if (bookingError) throw new Error(bookingError.message);
      onSuccess({ booking_number: bkNum });
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };
  
  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center p-6 bg-[#1A0A00]/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#FDF6EE] w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-300">
        <div className="bg-[#1A0A00] px-10 py-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-white/60 hover:text-white transition-colors">
              <ArrowLeft size={20}/>
            </button>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">GCash Payment</h3>
              <p className="text-white/60 text-xs font-bold mt-0.5">{paymentType === 'full' ? 'Full Payment' : 'Downpayment (40%)'}</p>
            </div>
          </div>
          <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Step 3 of 3</span>
        </div>
        
        <div className="p-10 space-y-8">
          {/* Blue send-to card */}
          <div className="bg-[#E8A265]/18 border border-blue-100 rounded-3xl p-6 flex items-center gap-5">
            <div className="w-12 h-12 bg-[#E8A265]/[0.18]0 rounded-2xl flex items-center justify-center shrink-0">
              <Smartphone size={22} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Send GCash Payment To</p>
              <p className="text-2xl font-black text-[#1A0A00]">09XX XXX XXXX</p>
              <p className="text-xs text-[#7A3A18] font-bold mt-0.5">Bandang IBAYO Tours</p>
            </div>
          </div>
          
          {/* 2-column: form left, summary right */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Form */}
            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest block mb-2">Your GCash Number</label>
                <input type="tel" value={gcashNumber} onChange={(e) => { setGcashNumber(e.target.value); setError(""); }}
                  placeholder="09XX XXX XXXX"
                  className="w-full bg-[#F2E4D0] border-none rounded-2xl px-5 py-4 text-sm font-bold text-[#1A0A00] focus:ring-2 focus:ring-[#C45C26] outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest block mb-2">GCash Reference Number</label>
                <input type="text" value={refNumber} onChange={(e) => { setRefNumber(e.target.value); setError(""); }}
                  placeholder="13-digit reference number"
                  className="w-full bg-[#F2E4D0] border-none rounded-2xl px-5 py-4 text-sm font-bold text-[#1A0A00] focus:ring-2 focus:ring-[#C45C26] outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest block mb-2">Transaction Screenshot</label>
                <label className="w-full border-2 border-dashed border-[#C45C26]/18 hover:border-[#C45C26] rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all group">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleReceiptChange} className="hidden" />
                  {receiptPreview ? (
                    <img src={receiptPreview} alt="Receipt" className="w-full h-32 object-cover rounded-xl" />
                  ) : (
                    <>
                      <Upload size={24} className="text-[#C45C26]/30 group-hover:text-[#C45C26] mb-2 transition-colors" />
                      <p className="text-xs font-bold text-[#7A3A18]/70 group-hover:text-[#C45C26] transition-colors">Upload Screenshot</p>
                      <p className="text-[10px] text-[#C45C26]/30 mt-1">Click to browse your GCash transaction receipt</p>
                    </>
                  )}
                </label>
              </div>
            </div>
            
            {/* Right: Booking Summary */}
            <div className="bg-[#F2E4D0] rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Receipt size={16} className="text-[#C45C26]" />
                <p className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest">Booking Summary</p>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#7A3A18]/80 font-medium">Tour</span>
                  <span className="font-bold text-[#1A0A00] text-right max-w-[55%] leading-snug">{tour.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7A3A18]/80 font-medium">Quantity</span>
                  <span className="font-bold text-[#1A0A00]">{numPersons} pax</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7A3A18]/80 font-medium">Price/pax</span>
                  <span className="font-bold text-[#1A0A00]">₱{tour.price.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-[#C45C26]/18 pt-3">
                  <span className="text-[#7A3A18]/80 font-medium">Subtotal</span>
                  <span className="font-bold text-[#1A0A00]">₱{subtotal.toLocaleString()}</span>
                </div>
                {paymentType === 'down' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[#7A3A18]/80 font-medium">Downpayment (40%)</span>
                      <span className="font-bold text-amber-600">₱{downpaymentAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7A3A18]/80 font-medium">Remaining Balance</span>
                      <span className="font-bold text-[#7A3A18]/70">₱{(subtotal - downpaymentAmount).toLocaleString()}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between border-t-2 border-[#C45C26]/18 pt-3 mt-2">
                  <span className="font-black text-[#1A0A00] uppercase text-xs tracking-widest">
                    {paymentType === 'full' ? 'Total Payment' : 'Amount Due Now'}
                  </span>
                  <span className="font-black text-[#C45C26] text-xl">₱{totalDue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#7A3A18]/70 font-bold">Payment Method</span>
                  <span className={`font-black uppercase tracking-widest text-xs px-3 py-1 rounded-full ${paymentType === 'full' ? 'bg-[#C45C26]/10 text-[#C45C26]' : 'bg-[#1A0A00]/10 text-[#1A0A00]'}`}>
                    {paymentType === 'full' ? 'Full Payment' : 'Downpayment'}
                  </span>
                </div>
              </div>
              {paymentType === 'down' && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
                  <p className="text-amber-700 text-[10px] font-bold leading-snug">⚠️ Remaining balance of ₱{(subtotal - downpaymentAmount).toLocaleString()} must be settled before the tour date.</p>
                </div>
              )}
            </div>
          </div>
          
          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
              <AlertCircle size={16} className="text-red-500 shrink-0" />
              <p className="text-red-600 text-xs font-bold">{error}</p>
            </div>
          )}
          
          <button onClick={handleConfirmBooking} disabled={submitting}
            className="w-full py-5 bg-[#C45C26] hover:bg-[#9C4A1F] disabled:bg-[#F2E4D0] disabled:text-[#7A3A18]/70 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : <><Check size={16} /> Confirm Booking</>}
          </button>
        </div>
      </div>
    </div>
  );
};
 
// Step 4: Success screen
const BookingSuccessModal = ({ booking, tour, onClose }) => (
  <div className="fixed inset-0 z-2000 flex items-center justify-center p-6 bg-[#1A0A00]/80 backdrop-blur-sm">
    <div className="bg-[#FDF6EE] w-full max-w-md p-10 rounded-[3rem] shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300">
      <div className="w-20 h-20 bg-[#C45C26]/10 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 size={40} className="text-[#C45C26]" />
      </div>
      <div>
        <h3 className="text-2xl font-black text-[#1A0A00] uppercase tracking-tight">Booking Submitted!</h3>
        <p className="text-[#7A3A18]/80 text-sm font-medium mt-2">Your booking is now pending verification by our team.</p>
      </div>
      <div className="bg-[#F2E4D0] rounded-3xl p-6 text-left space-y-2">
        <p className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest mb-3">Booking Reference</p>
        <p className="text-2xl font-black text-[#1A0A00]">{booking?.booking_number}</p>
        <p className="text-xs text-[#7A3A18]/80 font-medium">{tour?.title}</p>
      </div>
      <div className="bg-[#C45C26]/10 rounded-2xl px-5 py-4">
        <p className="text-[#1A0A00] text-xs font-bold">We'll verify your GCash payment and confirm your slot shortly. Thank you! 🎉</p>
      </div>
      <button onClick={onClose} className="w-full py-4 bg-[#1A0A00] text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#2D1B0E] transition-all">Done</button>
    </div>
  </div>
);
 
const PaymentFlowModal = ({ tour, numPersons, formatDate, formatDateRange, onClose, onSuccess }) => {
  const [paymentStep, setPaymentStep] = useState('proceed');
  const [paymentType, setPaymentType] = useState(null);
  const [createdBooking, setCreatedBooking] = useState(null);
  
  const subtotal = tour.price * numPersons;
  const downpaymentAmount = Math.round(subtotal * 0.40);
  
  const handleProceed = () => {
    setPaymentStep('choose');
  };
  
  const handleChoosePaymentType = (type) => {
    setPaymentType(type);
    setPaymentStep('gcash');
  };
  
  const handlePaymentSuccess = (booking) => {
    setCreatedBooking(booking);
    setPaymentStep('success');
  };
  
  return (
    <>
      {paymentStep === 'proceed' && (
        <ProceedToPaymentModal
          tour={tour}
          numPersons={numPersons}
          subtotal={subtotal}
          formatDate={formatDate}
          formatDateRange={formatDateRange}
          onProceed={handleProceed}
          onCancel={onClose}
        />
      )}
      
      {paymentStep === 'choose' && (
        <ChoosePaymentTypeModal
          subtotal={subtotal}
          downpaymentAmount={downpaymentAmount}
          onChoose={handleChoosePaymentType}
          onBack={() => setPaymentStep('proceed')}
        />
      )}
      
      {paymentStep === 'gcash' && (
        <GCashPaymentModal
          tour={tour}
          numPersons={numPersons}
          subtotal={subtotal}
          downpaymentAmount={downpaymentAmount}
          paymentType={paymentType}
          onSuccess={handlePaymentSuccess}
          onBack={() => setPaymentStep('choose')}
        />
      )}
      
      {paymentStep === 'success' && (
        <BookingSuccessModal
          booking={createdBooking}
          tour={tour}
          subtotal={subtotal}
          downpaymentAmount={downpaymentAmount}
          paymentType={paymentType}
          onClose={() => {
            onSuccess();
            onClose();
          }}
        />
      )}
    </>
  );
}
 
export default TourCalendar;