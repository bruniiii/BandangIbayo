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
  ArrowLeft, Smartphone
} from 'lucide-react';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light card bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #8C2F1C  deep rust red (error / full / alert)
// #F2E4D0  parchment (inset panel bg)
// #EDEAE3  warm stone (page bg)
// #3F5D62  slate teal (secondary contrast accent)
// ---------------------------------------------------------
 
/* ─────────────────────────────────────────────
  TOUR CALENDAR
───────────────────────────────────────────── */
const TourCalendar = ({ initialDate }) => {
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
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('tour_id, slots_booked')
      .not('booking_status', 'in', '("Cancelled","Rejected")');
 
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
      const end = new Date(new Date(tour.end_date || tour.start_date).setHours(0, 0, 0, 0));
      return checkDay >= start && checkDay <= end;
    });
  };
 
  const selectedDayTours = getToursForDay(selectedDate);
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, textAlign: 'left' }}>
      <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32, alignItems: 'start' }}>
 
        {/* ── Calendar Grid ── */}
        <div style={{
          background: '#FDF6EE',
          padding: '2rem',
          borderRadius: 28,
          border: '1px solid rgba(196,92,38,0.12)',
          boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
          textAlign: 'left'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0 }}>
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                style={{
                  padding: 8, background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.15)',
                  borderRadius: 12, cursor: 'pointer', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                style={{
                  padding: 8, background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.15)',
                  borderRadius: 12, cursor: 'pointer', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
 
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 14, textAlign: 'center', borderBottom: '1px solid rgba(196,92,38,0.1)', paddingBottom: 12 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} style={{ fontSize: 10, fontWeight: 900, color: '#7A3A18', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{day}</div>
            ))}
          </div>
 
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, textAlign: 'left' }}>
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
                  style={{
                    height: 92,
                    borderRadius: 16,
                    padding: 10,
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    border: isSelected && !isPast ? '2px solid #C45C26' : '1px solid transparent',
                    background: isPast ? 'rgba(242,228,208,0.2)' : isSelected ? 'rgba(196,92,38,0.08)' : '#F2E4D0',
                    cursor: isPast ? 'not-allowed' : 'pointer',
                    opacity: isPast ? 0.35 : 1,
                    textAlign: 'left'
                  }}
                >
                  <span style={{
                    fontSize: 13,
                    fontWeight: 900,
                    color: isPast ? '#7A3A18' : isSelected ? '#C45C26' : isCurrentMonth ? '#1A0A00' : 'rgba(122,58,24,0.45)'
                  }}>
                    {format(day, 'd')}
                  </span>
                  {dayTours.length > 0 && !isPast && (
                    <div style={{ marginTop: 'auto' }}>
                      <div style={{
                        fontSize: 8,
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: 6,
                        display: 'inline-block',
                        color: '#1A0A00',
                        background: '#E8A265'
                      }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%', textAlign: 'left' }}>
          <div style={{
            background: '#1A0A00',
            padding: '2rem',
            borderRadius: 28,
            color: '#FDF6EE',
            boxShadow: '0 16px 40px rgba(26,10,0,0.22)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            textAlign: 'left'
          }}>
            <p style={{ fontSize: 9, fontWeight: 900, color: '#C45C26', textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 6px' }}>Schedule for</p>
            <h3 style={{ fontSize: 24, fontWeight: 900, color: '#FDF6EE', margin: '0 0 24px' }}>{format(selectedDate, 'MMMM dd')}</h3>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem 0' }}><Loader2 style={{ animation: 'spin 1s linear infinite', color: '#E8A265' }} size={28} /></div>
              ) : selectedDayTours.length > 0 ? (
                selectedDayTours.map(tour => (
                  <div key={tour.id} style={{
                    background: 'rgba(253,246,238,0.06)',
                    padding: '1.25rem',
                    borderRadius: 20,
                    border: '1px solid rgba(255,255,255,0.08)',
                    transition: 'all 0.2s'
                  }}>
                    <h4 style={{ fontWeight: 900, fontSize: 13, textTransform: 'uppercase', color: '#FDF6EE', margin: '0 0 8px' }}>{tour.title}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: 'rgba(232,210,190,0.7)', marginBottom: 4 }}>
                      <MapPin size={12} style={{ color: '#C45C26' }} /> {tour.destination}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, marginBottom: 12 }}>
                      <Users size={12} style={{ color: '#C45C26' }} />
                      <span style={{ color: tour.available_slots > 0 ? '#FDF6EE' : '#8C2F1C' }}>
                        {tour.current_booked}/{tour.group_size} Booked
                      </span>
                      {tour.available_slots <= 0 && (
                        <span style={{ background: '#8C2F1C', color: '#FDF6EE', fontSize: 7, fontWeight: 900, padding: '2px 6px', borderRadius: 999, textTransform: 'uppercase' }}>Full</span>
                      )}
                    </div>
                    {/* Slot bar */}
                    <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: 999, height: 5, overflow: 'hidden', marginBottom: 14 }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 999,
                          transition: 'all 0.3s',
                          background: tour.available_slots <= 0 ? '#8C2F1C' : tour.available_slots <= 3 ? '#E8A265' : '#C45C26',
                          width: `${Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100)}%`
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: '#E8A265' }}>₱{tour.price.toLocaleString()}</span>
                      <button
                        onClick={() => setSelectedTour(tour)}
                        style={{
                          background: '#FDF6EE',
                          color: '#1A0A00',
                          border: 'none',
                          padding: '7px 14px',
                          borderRadius: 10,
                          fontSize: 9,
                          fontWeight: 900,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#C45C26'; e.currentTarget.style.color = '#FDF6EE'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#FDF6EE'; e.currentTarget.style.color = '#1A0A00'; }}
                      >
                        Details
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{
                  padding: '3rem 1rem', textAlign: 'center', color: 'rgba(232,210,190,0.4)', fontStyle: 'italic',
                  fontSize: 12, border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 20
                }}>
                  No tours scheduled.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
 
      {/* ── Tour Detail Modal ── */}
      {selectedTour && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'left' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={() => setSelectedTour(null)}></div>
          <div style={{
            position: 'relative', background: '#FDF6EE', width: '100%', maxWidth: 1100, height: '92vh',
            borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
            borderTop: '8px solid #C45C26', textAlign: 'left'
          }}>
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
      .not('booking_status', 'in', '("Cancelled","Rejected")');

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
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative', textAlign: 'left', overflow: 'hidden' }}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 20, right: 24, zIndex: 50,
          background: '#FDF6EE', border: 'none', cursor: 'pointer',
          color: 'rgba(122,58,24,0.7)', borderRadius: '50%', padding: 6,
          boxShadow: '0 2px 8px rgba(26,10,0,0.1)'
        }}
      >
        <X size={24} />
      </button>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', minHeight: 0 }}>

          {/* Left panel: gallery, meta, booking */}
          <div style={{
            background: '#F2E4D0', padding: '2.5rem 2rem',
            borderRight: '1px solid rgba(196,92,38,0.12)', display: 'flex', flexDirection: 'column'
          }}>
            <TourImageCarousel images={tour.image_urls || []} />

            <h2 style={{ fontSize: 24, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: '20px 0 16px' }}>{tour.title}</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#7A3A18', fontWeight: 600, fontSize: 13 }}>
                <CalendarIcon size={16} style={{ color: '#C45C26', flexShrink: 0 }} /> {formatDateRange(tour.start_date, tour.duration)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#7A3A18', fontWeight: 600, fontSize: 13 }}>
                <Clock size={16} style={{ color: '#C45C26', flexShrink: 0 }} /> {tour.duration}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 13, color: isFullyBooked ? '#8C2F1C' : '#7A3A18' }}>
                <Users size={16} style={{ color: '#C45C26', flexShrink: 0 }} />
                {tour.current_booked} / {tour.group_size} Slots Booked
              </div>
              <div style={{ width: '100%', background: 'rgba(196,92,38,0.15)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%', borderRadius: 999, transition: 'all 0.3s',
                    background: isFullyBooked ? '#8C2F1C' : tour.available_slots <= 3 ? '#E8A265' : '#C45C26',
                    width: `${Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100)}%`
                  }}
                />
              </div>
              {tour.difficulty && (
                <span style={{
                  display: 'inline-block', background: '#FDF6EE', border: '1px solid rgba(196,92,38,0.2)',
                  borderRadius: 999, padding: '4px 14px', fontSize: 9, fontWeight: 900,
                  textTransform: 'uppercase', letterSpacing: '0.15em', color: '#1A0A00', width: 'fit-content'
                }}>
                  {tour.difficulty}
                </span>
              )}
            </div>

            {isFullyBooked ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(140,47,28,0.1)', border: '1px solid rgba(140,47,28,0.25)', borderRadius: 16, padding: '12px 16px', marginBottom: 20 }}>
                <AlertCircle size={16} style={{ color: '#8C2F1C', flexShrink: 0 }} />
                <p style={{ color: '#8C2F1C', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Fully Booked</p>
              </div>
            ) : tour.available_slots <= 3 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(232,162,101,0.18)', border: '1px solid rgba(232,162,101,0.4)', borderRadius: 16, padding: '12px 16px', marginBottom: 20 }}>
                <AlertCircle size={16} style={{ color: '#C45C26', flexShrink: 0 }} />
                <p style={{ color: '#7A3A18', fontSize: 11, fontWeight: 700, margin: 0 }}>Only {tour.available_slots} slot{tour.available_slots > 1 ? 's' : ''} left!</p>
              </div>
            ) : null}

            <div style={{ marginBottom: 4 }}>
              <p style={{ fontSize: 34, fontWeight: 900, color: '#C45C26', margin: 0, lineHeight: 1 }}>₱{tour.price.toLocaleString()}</p>
              <p style={{ fontSize: 9, fontWeight: 800, color: '#7A3A18', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.18em', marginTop: 4 }}>Per Person</p>
            </div>

            {!isFullyBooked && (
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(196,92,38,0.18)' }}>
                <label style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#7A3A18', display: 'block', marginBottom: 8 }}>Number of Persons</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={numPersons}
                    onChange={(e) => { setNumPersons(parseInt(e.target.value)); setSlotError(""); }}
                    style={{
                      width: '100%', background: '#FDF6EE', borderRadius: 14, padding: '12px 16px',
                      fontSize: 13, fontWeight: 700, color: '#1A0A00', appearance: 'none', cursor: 'pointer',
                      border: '1px solid rgba(196,92,38,0.2)', outline: 'none'
                    }}
                  >
                    {[...Array(maxBookingLimit)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? 'Person' : 'Persons'}</option>
                    ))}
                  </select>
                  <ChevronDown style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(196,92,38,0.5)', pointerEvents: 'none' }} size={16} />
                </div>
                {slotError && (
                  <p style={{ marginTop: 8, fontSize: 11, color: '#8C2F1C', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={14} /> {slotError}
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18, marginBottom: 18 }}>
                  <p style={{ fontSize: 11, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>Total</p>
                  <p style={{ fontSize: 26, fontWeight: 900, color: '#C45C26', margin: 0 }}>₱{(tour.price * numPersons).toLocaleString()}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleProceedToPayment}
              disabled={validating || isFullyBooked}
              style={{
                width: '100%', padding: '15px 0', borderRadius: 14, fontWeight: 900,
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em', border: 'none',
                cursor: isFullyBooked ? 'not-allowed' : 'pointer',
                background: isFullyBooked ? '#EDEAE3' : '#C45C26',
                color: isFullyBooked ? '#7A3A18' : '#FDF6EE',
                boxShadow: isFullyBooked ? 'none' : '0 6px 20px rgba(196,92,38,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 'auto',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => { if (!isFullyBooked && !validating) e.currentTarget.style.background = '#1A0A00'; }}
              onMouseLeave={e => { if (!isFullyBooked && !validating) e.currentTarget.style.background = '#C45C26'; }}
            >
              {validating ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : isFullyBooked ? 'Fully Booked' : <><ArrowRight size={16} /> Book This Tour</>}
            </button>
          </div>

          {/* Right panel: descriptive content */}
          <div style={{ background: '#FDF6EE', padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 28 }}>
            <section>
              <h4 style={{ fontSize: 9, fontWeight: 900, color: '#7A3A18', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 12px' }}>About the Tour</h4>
              <p style={{ color: '#7A3A18', fontSize: 13, lineHeight: 1.8, fontWeight: 500, whiteSpace: 'pre-wrap', margin: 0 }}>{tour.description}</p>
            </section>

            <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid rgba(196,92,38,0.1)', paddingTop: 24 }}>
              <section>
                <h4 style={{ fontSize: 9, fontWeight: 900, color: '#C45C26', textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} /> Inclusions</h4>
                <ChecklistGrid text={tour.inclusions} variant="include" />
              </section>
              <section>
                <h4 style={{ fontSize: 9, fontWeight: 900, color: '#8C2F1C', textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}><X size={14} /> Exclusions</h4>
                <ChecklistGrid text={tour.exclusions} variant="exclude" />
              </section>
            </div>

            <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid rgba(196,92,38,0.1)', paddingTop: 24 }}>
              <section>
                <h4 style={{ fontSize: 9, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 12px' }}>Itinerary</h4>
                <pre style={{ color: '#7A3A18', fontSize: 13, fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0 }}>{tour.itinerary || "N/A"}</pre>
              </section>
              <section>
                <h4 style={{ fontSize: 9, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 12px' }}>Things to Bring</h4>
                <ChecklistGrid text={tour.things_to_bring} variant="neutral" />
              </section>
            </div>

            {tour.important_note && (
              <div style={{ background: 'rgba(196,92,38,0.07)', padding: '1.5rem', borderRadius: 20, border: '1px solid rgba(196,92,38,0.2)', display: 'flex', gap: 16 }}>
                <AlertCircle style={{ color: '#C45C26', flexShrink: 0 }} size={22} />
                <div>
                  <p style={{ fontSize: 9, fontWeight: 900, color: '#C45C26', textTransform: 'uppercase', letterSpacing: '0.18em', margin: '0 0 6px' }}>Important Note</p>
                  <pre style={{ color: '#1A0A00', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{tour.important_note}</pre>
                </div>
              </div>
            )}
          </div>
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
   TOUR IMAGE CAROUSEL
───────────────────────────────────────────── */
const TourImageCarousel = ({ images = [] }) => {
  const [index, setIndex] = useState(0);
  const dragStartX = useRef(null);
  const hasImages = images.length > 0;
  const hasMultiple = images.length > 1;

  const goTo = (i) => setIndex(((i % images.length) + images.length) % images.length);
  const prev = (e) => { e.stopPropagation(); goTo(index - 1); };
  const next = (e) => { e.stopPropagation(); goTo(index + 1); };

  const handleDragStart = (e) => {
    dragStartX.current = e.clientX ?? e.touches?.[0]?.clientX ?? null;
  };
  const handleDragEnd = (e) => {
    if (dragStartX.current == null) return;
    const endX = e.clientX ?? e.changedTouches?.[0]?.clientX ?? dragStartX.current;
    const delta = endX - dragStartX.current;
    if (Math.abs(delta) > 40) { delta > 0 ? goTo(index - 1) : goTo(index + 1); }
    dragStartX.current = null;
  };

  return (
    <div>
      <div
        style={{
          position: 'relative', width: '100%', height: 190,
          borderRadius: 20, overflow: 'hidden', background: '#F2E4D0',
          boxShadow: '0 8px 24px rgba(26,10,0,0.15)', flexShrink: 0, userSelect: 'none', touchAction: 'pan-y'
        }}
        onPointerDown={handleDragStart}
        onPointerUp={handleDragEnd}
      >
        {hasImages ? (
          <div style={{ display: 'flex', width: '100%', height: '100%', transition: 'transform 0.35s ease', transform: `translateX(-${index * 100}%)` }}>
            {images.map((url, i) => (
              <img key={i} src={url} draggable={false} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', flexShrink: 0 }} />
            ))}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.3)' }}><ImageIcon size={40} /></div>
        )}

        {hasMultiple && (
          <>
            <button
              type="button" onClick={prev}
              style={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                width: 32, height: 32, borderRadius: '50%', background: 'rgba(26,10,0,0.6)',
                border: 'none', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button" onClick={next}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                width: 32, height: 32, borderRadius: '50%', background: 'rgba(26,10,0,0.6)',
                border: 'none', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
            >
              <ChevronRight size={18} />
            </button>
            <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
              {images.map((_, i) => (
                <span
                  key={i}
                  onClick={(e) => { e.stopPropagation(); goTo(i); }}
                  style={{
                    height: 6, borderRadius: 999, cursor: 'pointer', transition: 'all 0.2s',
                    width: i === index ? 16 : 6,
                    background: i === index ? '#FDF6EE' : 'rgba(253,246,238,0.5)'
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {hasMultiple && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
          {images.map((url, i) => (
            <div
              key={i}
              onClick={() => goTo(i)}
              style={{
                aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                border: i === index ? '2px solid #C45C26' : '1px solid rgba(196,92,38,0.15)',
                opacity: i === index ? 1 : 0.65, transition: 'all 0.2s'
              }}
            >
              <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={`Thumbnail ${i + 1}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ChecklistGrid = ({ text, variant = 'neutral' }) => {
  const items = (text || '').split('\n').map(s => s.trim()).filter(Boolean);

  if (items.length === 0) {
    return <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', opacity: 0.5, margin: 0 }}>N/A</p>;
  }

  const iconColor = variant === 'exclude' ? '#8C2F1C' : variant === 'include' ? '#C45C26' : '#7A3A18';
  const itemBg = variant === 'exclude' ? 'rgba(140,47,28,0.06)' : variant === 'include' ? 'rgba(196,92,38,0.07)' : 'rgba(122,58,24,0.06)';
  const Icon = variant === 'exclude' ? X : CheckCircle2;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: '8px 12px', background: itemBg }}>
          <Icon size={13} style={{ color: iconColor, flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', lineHeight: 1.4 }}>{item}</span>
        </div>
      ))}
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   PAYMENT FLOW MODAL (4-step)
───────────────────────────────────────────── */

const overlayBackdrop = {
  position: 'fixed', inset: 0, zIndex: 2000, display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 16,
  background: 'rgba(26,10,0,0.8)', backdropFilter: 'blur(4px)',
};

// Step 1: Proceed to Payment confirmation
const ProceedToPaymentModal = ({ tour, numPersons, subtotal, formatDateRange, onProceed, onCancel }) => (
  <div style={overlayBackdrop}>
    <div style={{
      background: '#FDF6EE', width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto',
      borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', borderTop: '8px solid #C45C26'
    }}>
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(122,58,24,0.7)' }}><X size={22} /></button>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.7)' }}>Step 1 of 3</span>
        </div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C45C26', margin: '0 0 4px' }}>Booking Preview</p>
          <h3 style={{ fontSize: 24, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: 0 }}>{tour.title}</h3>
        </div>
        <div style={{ background: '#F2E4D0', borderRadius: 20, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>
            <MapPin size={15} style={{ color: '#C45C26', flexShrink: 0 }} /> {tour.destination}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>
            <CalendarIcon size={15} style={{ color: '#C45C26', flexShrink: 0 }} /> {formatDateRange(tour.start_date, tour.duration)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>
            <Users size={15} style={{ color: '#C45C26', flexShrink: 0 }} /> {numPersons} {numPersons === 1 ? 'Person' : 'Persons'}
          </div>
        </div>
        <div style={{ borderTop: '2px solid rgba(196,92,38,0.12)', paddingTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#7A3A18', opacity: 0.8 }}>Price per person</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00' }}>₱{tour.price.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1A0A00' }}>Subtotal</span>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#C45C26' }}>₱{subtotal.toLocaleString()}</span>
          </div>
        </div>
        <button onClick={onProceed}
          style={{
            width: '100%', padding: '15px 0', background: '#1A0A00', color: '#FDF6EE',
            border: 'none', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
            fontWeight: 900, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#C45C26'}
          onMouseLeave={e => e.currentTarget.style.background = '#1A0A00'}
        >
          <CreditCard size={16} /> Proceed to Payment
        </button>
      </div>
    </div>
  </div>
);
 
// Step 2: Choose Full or Downpayment
const ChoosePaymentTypeModal = ({ subtotal, downpaymentAmount, onChoose, onBack }) => (
  <div style={overlayBackdrop}>
    <div style={{
      background: '#FDF6EE', width: '100%', maxWidth: 420, maxHeight: '92vh', overflowY: 'auto',
      padding: '2rem', borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
      textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20,
      borderTop: '8px solid #C45C26'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(122,58,24,0.7)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
          <ArrowLeft size={14}/> Back
        </button>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.7)' }}>Step 2 of 3</span>
      </div>
      <div>
        <h3 style={{ fontSize: 20, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0 }}>Choose Payment Type</h3>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#7A3A18', opacity: 0.8, margin: '8px 0 0' }}>How would you like to pay for your booking?</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
        <button
          onClick={() => onChoose('full')}
          style={{ width: '100%', background: '#1A0A00', color: '#FDF6EE', borderRadius: 20, padding: '1.25rem 1.5rem', textAlign: 'left', border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(26,10,0,0.25)', transition: 'background 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.background = '#2D1B0E'}
          onMouseLeave={e => e.currentTarget.style.background = '#1A0A00'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E8A265' }}>Full Payment</span>
            <Check size={16} style={{ color: '#E8A265' }} />
          </div>
          <p style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>₱{subtotal.toLocaleString()}</p>
          <p style={{ fontSize: 11, opacity: 0.6, fontWeight: 500, margin: '4px 0 0' }}>Pay the complete amount now</p>
        </button>
        
        <button
          onClick={() => onChoose('down')}
          style={{ width: '100%', background: '#F2E4D0', border: '2px solid rgba(196,92,38,0.18)', borderRadius: 20, padding: '1.25rem 1.5rem', textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#C45C26'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(196,92,38,0.18)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C45C26' }}>Downpayment (40%)</span>
            <span style={{ fontSize: 9, fontWeight: 900, color: '#7A3A18', opacity: 0.7, textTransform: 'uppercase', flexShrink: 0 }}>Balance Later</span>
          </div>
          <p style={{ fontSize: 24, fontWeight: 900, color: '#1A0A00', margin: 0 }}>₱{downpaymentAmount.toLocaleString()}</p>
          <p style={{ fontSize: 11, color: '#7A3A18', opacity: 0.7, fontWeight: 500, margin: '4px 0 0' }}>Pay 40% now, settle the rest before the tour</p>
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
      
      const { data: freshBookings } = await supabase
        .from('bookings')
        .select('slots_booked')
        .eq('tour_id', tour.id)
        .not('booking_status', 'in', '("Cancelled","Rejected")');
      
      const totalBooked = (freshBookings || []).reduce((sum, b) => sum + (b.slots_booked || 0), 0);
      const freshAvailable = (tour.group_size || 15) - totalBooked;
      if (numPersons > freshAvailable) throw new Error(`Only ${freshAvailable} slot(s) remaining.`);
      
      const fileExt = receipt.name.split('.').pop();
      const fileName = `receipts/${Date.now()}_${user.id}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('booking-receipts')
        .upload(fileName, receipt, { upsert: true });
      if (uploadError) throw new Error("Receipt upload failed: " + uploadError.message);
      
      const { data: { publicUrl } } = supabase.storage.from('booking-receipts').getPublicUrl(fileName);
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone_number')
        .eq('id', user.id)
        .single();
      
      const bkNum = 'BK-' + Math.random().toString(36).substr(2, 8).toUpperCase();
      
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
        payment_status: 'Pending',
        booking_status: 'Active',
      }]);
      
      if (bookingError) throw new Error(bookingError.message);
      onSuccess({ booking_number: bkNum });
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  const fieldLabelStyle = { display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, marginBottom: 8 };
  const fieldInputStyle = { width: '100%', boxSizing: 'border-box', background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)', borderRadius: 16, padding: '14px 16px', fontSize: 13, fontWeight: 700, color: '#1A0A00', fontFamily: 'inherit', outline: 'none' };
  
  return (
    <div style={{ ...overlayBackdrop, overflowY: 'auto' }}>
      <div style={{ background: '#FDF6EE', width: '100%', maxWidth: 720, borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', overflow: 'hidden', margin: 'auto' }}>
        <div style={{ background: '#1A0A00', padding: '1.75rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E8A265', flexShrink: 0 }}>
              <ArrowLeft size={20}/>
            </button>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#FDF6EE', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0 }}>GCash Payment</h3>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(232,210,190,0.7)', margin: '2px 0 0' }}>{paymentType === 'full' ? 'Full Payment' : 'Downpayment (40%)'}</p>
            </div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(232,210,190,0.4)', flexShrink: 0 }}>Step 3 of 3</span>
        </div>
        
        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Slate Teal send-to card */}
          <div style={{ background: 'rgba(63,93,98,0.08)', border: '1px solid rgba(63,93,98,0.25)', borderRadius: 20, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, background: '#3F5D62', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Smartphone size={22} style={{ color: '#FDF6EE' }} />
            </div>
            <div>
              <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#3F5D62', margin: '0 0 4px' }}>Send GCash Payment To</p>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#1A0A00', margin: 0 }}>09XX XXX XXXX</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.8, margin: '2px 0 0' }}>Bandang IBAYO Tours</p>
            </div>
          </div>
          
          <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Left: Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={fieldLabelStyle}>Your GCash Number</label>
                <input type="tel" value={gcashNumber} onChange={(e) => { setGcashNumber(e.target.value); setError(""); }}
                  placeholder="09XX XXX XXXX"
                  style={fieldInputStyle} />
              </div>
              <div>
                <label style={fieldLabelStyle}>GCash Reference Number</label>
                <input type="text" value={refNumber} onChange={(e) => { setRefNumber(e.target.value); setError(""); }}
                  placeholder="13-digit reference number"
                  style={fieldInputStyle} />
              </div>
              <div>
                <label style={fieldLabelStyle}>Transaction Screenshot</label>
                <label style={{ width: '100%', boxSizing: 'border-box', border: '2px dashed rgba(196,92,38,0.25)', borderRadius: 16, padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#F2E4D0' }}>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleReceiptChange} style={{ display: 'none' }} />
                  {receiptPreview ? (
                    <img src={receiptPreview} alt="Receipt" style={{ width: '100%', height: 128, objectFit: 'cover', borderRadius: 12 }} />
                  ) : (
                    <>
                      <Upload size={22} style={{ color: 'rgba(196,92,38,0.5)', marginBottom: 8 }} />
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.7, margin: 0 }}>Upload Screenshot</p>
                      <p style={{ fontSize: 9, color: 'rgba(122,58,24,0.5)', margin: '4px 0 0' }}>Click to browse your GCash transaction receipt</p>
                    </>
                  )}
                </label>
              </div>
            </div>
            
            {/* Right: Booking Summary */}
            <div style={{ background: '#F2E4D0', borderRadius: 20, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Receipt size={15} style={{ color: '#C45C26' }} />
                <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, margin: 0 }}>Booking Summary</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: '#7A3A18', opacity: 0.8, fontWeight: 500 }}>Tour</span>
                  <span style={{ fontWeight: 700, color: '#1A0A00', textAlign: 'right', maxWidth: '55%', lineHeight: 1.3 }}>{tour.title}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#7A3A18', opacity: 0.8, fontWeight: 500 }}>Quantity</span>
                  <span style={{ fontWeight: 700, color: '#1A0A00' }}>{numPersons} pax</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#7A3A18', opacity: 0.8, fontWeight: 500 }}>Price/pax</span>
                  <span style={{ fontWeight: 700, color: '#1A0A00' }}>₱{tour.price.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(196,92,38,0.18)', paddingTop: 10 }}>
                  <span style={{ color: '#7A3A18', opacity: 0.8, fontWeight: 500 }}>Subtotal</span>
                  <span style={{ fontWeight: 700, color: '#1A0A00' }}>₱{subtotal.toLocaleString()}</span>
                </div>
                {paymentType === 'down' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#7A3A18', opacity: 0.8, fontWeight: 500 }}>Downpayment (40%)</span>
                      <span style={{ fontWeight: 700, color: '#C45C26' }}>₱{downpaymentAmount.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#7A3A18', opacity: 0.8, fontWeight: 500 }}>Remaining Balance</span>
                      <span style={{ fontWeight: 700, color: '#7A3A18', opacity: 0.7 }}>₱{(subtotal - downpaymentAmount).toLocaleString()}</span>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid rgba(196,92,38,0.18)', paddingTop: 10, marginTop: 4 }}>
                  <span style={{ fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>
                    {paymentType === 'full' ? 'Total Payment' : 'Amount Due Now'}
                  </span>
                  <span style={{ fontWeight: 900, color: '#C45C26', fontSize: 18 }}>₱{totalDue.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 4 }}>
                  <span style={{ color: '#7A3A18', opacity: 0.7, fontWeight: 700 }}>Payment Method</span>
                  <span style={{
                    fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 9, padding: '3px 10px', borderRadius: 999,
                    background: paymentType === 'full' ? 'rgba(196,92,38,0.15)' : 'rgba(26,10,0,0.08)',
                    color: paymentType === 'full' ? '#C45C26' : '#1A0A00'
                  }}>
                    {paymentType === 'full' ? 'Full Payment' : 'Downpayment'}
                  </span>
                </div>
              </div>
              {paymentType === 'down' && (
                <div style={{ background: 'rgba(232,162,101,0.18)', border: '1px solid rgba(232,162,101,0.4)', borderRadius: 14, padding: '10px 14px', marginTop: 4 }}>
                  <p style={{ color: '#7A3A18', fontSize: 10, fontWeight: 700, lineHeight: 1.5, margin: 0 }}>⚠️ Remaining balance of ₱{(subtotal - downpaymentAmount).toLocaleString()} must be settled before the tour date.</p>
                </div>
              )}
            </div>
          </div>
          
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(140,47,28,0.1)', border: '1px solid rgba(140,47,28,0.25)', borderRadius: 14, padding: '10px 14px' }}>
              <AlertCircle size={16} style={{ color: '#8C2F1C', flexShrink: 0 }} />
              <p style={{ color: '#8C2F1C', fontSize: 12, fontWeight: 700, margin: 0 }}>{error}</p>
            </div>
          )}
          
          <button onClick={handleConfirmBooking} disabled={submitting}
            style={{
              width: '100%', padding: '15px 0', background: '#C45C26', color: '#FDF6EE',
              border: 'none', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: 900, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(196,92,38,0.3)', transition: 'background 0.2s'
            }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = '#1A0A00'; }}
            onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = '#C45C26'; }}
          >
            {submitting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <><Check size={16} /> Confirm Booking</>}
          </button>
        </div>
      </div>
    </div>
  );
};
 
// Step 4: Success screen
const BookingSuccessModal = ({ booking, tour, onClose }) => (
  <div style={overlayBackdrop}>
    <div style={{
      background: '#FDF6EE', width: '100%', maxWidth: 420, maxHeight: '92vh', overflowY: 'auto',
      padding: '2rem', borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
      textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20,
      borderTop: '8px solid #C45C26'
    }}>
      <div style={{ width: 72, height: 72, background: 'rgba(196,92,38,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
        <CheckCircle2 size={36} style={{ color: '#C45C26' }} />
      </div>
      <div>
        <h3 style={{ fontSize: 22, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0 }}>Booking Submitted!</h3>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#7A3A18', opacity: 0.8, margin: '8px 0 0' }}>Your booking is now pending verification by our team.</p>
      </div>
      <div style={{ background: '#F2E4D0', borderRadius: 20, padding: '1.25rem 1.5rem', textAlign: 'left' }}>
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, margin: '0 0 10px' }}>Booking Reference</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#1A0A00', margin: 0, wordBreak: 'break-word' }}>{booking?.booking_number}</p>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#7A3A18', opacity: 0.8, margin: '4px 0 0' }}>{tour?.title}</p>
      </div>
      <div style={{ background: 'rgba(196,92,38,0.1)', borderRadius: 16, padding: '14px 18px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00', margin: 0 }}>We'll verify your GCash payment and confirm your slot shortly. Thank you! 🎉</p>
      </div>
      <button onClick={onClose} style={{ width: '100%', padding: '14px 0', background: '#1A0A00', color: '#FDF6EE', border: 'none', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Done</button>
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