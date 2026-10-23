import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { withAvailableSlots, formatPeso, archivePastTours, notEndedFilter, TRIP_REQUEST_LEAD_DAYS } from './tourUtils';
import { addDaysPH } from './validation';
import { DetailedTourModal } from './JoinerTours';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, MapPin, Users, Loader2
} from 'lucide-react';
import { Skel, SkeletonRegion } from './ui/Skeleton';

// ── PALETTE ──────────────────────────────────────────────  
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
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
// onPlanTrip(form, date): a day without tours offers an exclusive tour or a tour request.
const TourCalendar = ({ initialDate, onPlanTrip }) => {
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
    await archivePastTours();
    const { data: toursData } = await supabase.from('tours').select('*').eq('is_archived', false).or(notEndedFilter());
    // Joiners can only read their own bookings, so slot totals come from tour_slots_booked().
    const updatedTours = await withAvailableSlots(toursData);
 
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
          border: '1px solid rgba(180,81,30,0.12)',
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
                  padding: 8, background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.15)',
                  borderRadius: 12, cursor: 'pointer', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                style={{
                  padding: 8, background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.15)',
                  borderRadius: 12, cursor: 'pointer', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
 
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 14, textAlign: 'center', borderBottom: '1px solid rgba(180,81,30,0.1)', paddingBottom: 12 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} style={{ fontSize: 11.5, fontWeight: 900, color: '#7A3A18', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{day}</div>
            ))}
          </div>
 
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, textAlign: 'left' }}>
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
                    minWidth: 0,
                    overflow: 'hidden',
                    borderRadius: 16,
                    padding: 10,
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    border: isSelected && !isPast ? '2px solid #B4511E' : '1px solid transparent',
                    background: isPast ? 'rgba(242,228,208,0.2)' : isSelected ? 'rgba(180,81,30,0.08)' : '#F2E4D0',
                    cursor: isPast ? 'not-allowed' : 'pointer',
                    opacity: isPast ? 0.7 : 1,
                    textAlign: 'left'
                  }}
                >
                  <span style={{
                    fontSize: 13,
                    fontWeight: 900,
                    color: isPast ? '#7A3A18' : isSelected ? '#A8481A' : isCurrentMonth ? '#1A0A00' : 'rgba(122,58,24,0.85)'
                  }}>
                    {format(day, 'd')}
                  </span>
                  {/* The tours on this day by name (two at most, then "+N more"). */}
                  {dayTours.length > 0 && !isPast && (
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, width: '100%' }}>
                      {dayTours.slice(0, 2).map((t) => (
                        <span key={t.id} title={t.title} className="cal-tour-chip" style={{
                          display: 'block', maxWidth: '100%', boxSizing: 'border-box',
                          fontSize: 11, fontWeight: 800, lineHeight: 1.3,
                          padding: '2px 6px', borderRadius: 6,
                          color: '#1A0A00', background: '#E8A265',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {t.title}
                        </span>
                      ))}
                      {dayTours.length > 2 && (
                        <span className="cal-tour-more" style={{ fontSize: 10.5, fontWeight: 800, color: '#A8481A', paddingLeft: 2 }}>+{dayTours.length - 2} more</span>
                      )}
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
            <p style={{ fontSize: 11, fontWeight: 900, color: '#E8A265', textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 6px' }}>Schedule for</p>
            <h3 style={{ fontSize: 24, fontWeight: 900, color: '#FDF6EE', margin: '0 0 24px' }}>{format(selectedDate, 'MMMM dd')}</h3>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {loading ? (
                <SkeletonRegion label="Loading tours" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[0, 1].map((i) => (
                    <div key={i} style={{ background: 'rgba(253,246,238,0.06)', borderRadius: 18, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <Skel dark w="65%" h={14} /><Skel dark w="45%" h={10} /><Skel dark h={34} r={10} />
                    </div>
                  ))}
                </SkeletonRegion>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'rgba(232,210,190,0.85)', marginBottom: 4 }}>
                      <MapPin size={12} style={{ color: '#A8481A' }} /> {tour.destination}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, marginBottom: 12 }}>
                      <Users size={12} style={{ color: '#A8481A' }} />
                      <span style={{ color: tour.available_slots > 0 ? '#FDF6EE' : '#8C2F1C' }}>
                        {tour.current_booked}/{tour.group_size} Booked
                      </span>
                      {tour.available_slots <= 0 && (
                        <span style={{ background: '#8C2F1C', color: '#FDF6EE', fontSize: 11, fontWeight: 900, padding: '2px 6px', borderRadius: 999, textTransform: 'uppercase' }}>Full</span>
                      )}
                    </div>
                    {/* Slot bar */}
                    <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: 999, height: 5, overflow: 'hidden', marginBottom: 14 }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 999,
                          transition: 'all 0.3s',
                          background: tour.available_slots <= 0 ? '#8C2F1C' : tour.available_slots <= 3 ? '#E8A265' : '#B4511E',
                          width: `${Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100)}%`
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: '#E8A265' }}>{formatPeso(tour.price)}</span>
                      <button
                        onClick={() => setSelectedTour(tour)}
                        style={{
                          background: '#FDF6EE',
                          color: '#1A0A00',
                          border: 'none',
                          padding: '7px 14px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 900,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#B4511E'; e.currentTarget.style.color = '#FDF6EE'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#FDF6EE'; e.currentTarget.style.color = '#1A0A00'; }}
                      >
                        Details
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{
                  padding: '3rem 1rem', textAlign: 'center', color: 'rgba(232,210,190,0.85)', fontStyle: 'italic',
                  fontSize: 12, border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 20
                }}>
                  No tours scheduled.
                  {/* Exclusive tours and requests start at least 3 weeks ahead. */}
                  {onPlanTrip && format(selectedDate, 'yyyy-MM-dd') < addDaysPH(TRIP_REQUEST_LEAD_DAYS) && (
                    <p style={{ fontStyle: 'normal', margin: '14px 0 0', fontSize: 12.5, fontWeight: 600, color: 'rgba(232,210,190,0.9)', lineHeight: 1.6 }}>
                      Exclusive tours and tour requests can be booked from 3 weeks ahead.
                      Pick a day from <strong style={{ color: '#E8A265' }}>{format(new Date(`${addDaysPH(TRIP_REQUEST_LEAD_DAYS)}T00:00:00`), 'MMMM d')}</strong> onwards.
                    </p>
                  )}
                  {onPlanTrip && format(selectedDate, 'yyyy-MM-dd') >= addDaysPH(TRIP_REQUEST_LEAD_DAYS) && (
                    <div style={{ fontStyle: 'normal', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'rgba(232,210,190,0.9)' }}>Want to travel on this day?</p>
                      <button type="button" onClick={() => onPlanTrip('exclusive', format(selectedDate, 'yyyy-MM-dd'))} style={{
                        padding: '12px 16px', borderRadius: 14, border: 'none', background: '#B4511E', color: '#FDF6EE',
                        fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                      }}>
                        Exclusive Tour
                      </button>
                      <button type="button" onClick={() => onPlanTrip('request', format(selectedDate, 'yyyy-MM-dd'))} style={{
                        padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(232,162,101,0.45)', background: 'transparent', color: '#E8A265',
                        fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                      }}>
                        Request a Tour
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
 
      {/* ── Tour Detail + booking (shared with Explore Tours) ── */}
      {selectedTour && (
        <DetailedTourModal
          tour={selectedTour}
          onClose={() => setSelectedTour(null)}
          formatDateRange={formatDateRange}
          onBookingSuccess={fetchToursWithAvailability}
        />
      )}
    </div>
  );
};

export default TourCalendar;