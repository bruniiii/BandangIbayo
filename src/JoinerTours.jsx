import React, { useState, useEffect, useCallback, useRef } from 'react';

import { supabase } from './supabaseClient';
import { toast } from './ui/toast';

import { withAvailableSlots, formatDateRange, formatPeso, downpaymentFor, archivePastTours, notEndedFilter, groupTripDates, tripForDate } from './tourUtils';
import { TripDatePicker, TripDateLines } from './ui/TripDates';
import { MoreTourFilters } from './ui/TourFilters';
import { applyTripFilters, useTripFilters } from './tripFilters';
import { startCheckout } from './payments';
import EmptyState from './ui/EmptyState';
import { SearchX, CalendarClock as CalendarClockIcon } from 'lucide-react';
import { fullNameError, phoneError, cleanName, normalizePhone } from './validation';

import { 

  Search, MapPin, Clock, Users, Calendar, ChevronDown, ChevronLeft, ChevronRight,

  Eye, ImageIcon, Loader2, CheckCircle2, X, AlertCircle, Star,

  CreditCard, Smartphone, Receipt, Upload, ArrowLeft, Check

} from 'lucide-react';
import { phoneFieldProps } from './ui/phoneField';
import { SkeletonTourCards } from './ui/Skeleton';
import ItineraryTimeline from './ui/ItineraryTimeline';



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

 

const JoinerTours = ({ initialTourId = null }) => {

  const pendingTourId = useRef(initialTourId);

  const [tours, setTours] = useState([]);

  const [loading, setLoading] = useState(true);

  const [selectedTour, setSelectedTour] = useState(null); 

  const [searchQuery, setSearchQuery] = useState("");

  const [difficultyFilter, setDifficultyFilter] = useState("All Difficulty");

  const [priceSort, setPriceSort] = useState("default");

 

  const formatDate = (dateString) => {

    if (!dateString) return "";

    const [year, month, day] = dateString.split('-');

    return `${month}-${day}-${year}`;

  };

 


 

  const fetchToursWithSlots = useCallback(async () => {

    setLoading(true);

    await archivePastTours();
    const { data: toursData } = await supabase

      .from('tours')

      .select('*')

      .eq('is_archived', false)

      .or(notEndedFilter())

      .order('start_date', { ascending: true });

 

    // One card per trip; the joiner picks the date in the booking window.
    const updatedTours = groupTripDates(await withAvailableSlots(toursData));



    setTours(updatedTours);

    // Opened from a shared tour link (/dashboard?book=<id>): show that tour's booking window once.
    if (pendingTourId.current) {
      const target = tripForDate(updatedTours, pendingTourId.current);
      pendingTourId.current = null;
      if (target) setSelectedTour(target);
    }

    setLoading(false);

  }, []);

 

  useEffect(() => {

    const initFetch = async () => { await fetchToursWithSlots(); };

    initFetch();

 

    const channel = supabase

      .channel('joiner-booking-changes')

      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {

        fetchToursWithSlots();

      })

      .subscribe();

 

    return () => { supabase.removeChannel(channel); };

  }, [fetchToursWithSlots]);

 

  const handleBookingSuccess = () => {

    fetchToursWithSlots();

  };

 

  // Month, price range and trip length (ui/TourFilters.jsx).
  const { filters: tripFilters, setFilter: setTripFilter, clearFilters: clearTripFilters, active: tripFiltersActive } = useTripFilters();
  const anyFilter = tripFiltersActive || searchQuery || difficultyFilter !== "All Difficulty";
  const clearAllFilters = () => { setSearchQuery(''); setDifficultyFilter('All Difficulty'); setPriceSort('default'); clearTripFilters(); };

  const filteredTours = applyTripFilters(tours, tripFilters).filter((t) => {

    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.destination.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDifficulty = difficultyFilter === "All Difficulty" || t.difficulty === difficultyFilter;

    return matchesSearch && matchesDifficulty;

  }).sort((a, b) => {

    if (priceSort === "highToLow") return b.price - a.price;

    if (priceSort === "lowToHigh") return a.price - b.price;

    return 0;

  });

 

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



  return (

    <div style={{ display: 'flex', flexDirection: 'column' }}>



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

        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>

          <Search size={15} style={{

            position: 'absolute', left: 13, top: '50%',

            transform: 'translateY(-50%)',

            color: 'rgba(122,58,24,0.85)', pointerEvents: 'none',

          }} />

          <input

            type="text" placeholder="Search tours…"

            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}

            style={{ ...inputStyle, paddingLeft: 36 }}

          />

        </div>

        {/* Difficulty */}

        <div style={{ position: 'relative', minWidth: 160 }}>

          <select

            value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)}

            style={{ ...inputStyle, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}

          >

            <option value="All Difficulty">All Difficulty</option>

            <option value="Easy">Easy</option>

            <option value="Moderate">Moderate</option>

            <option value="Challenging">Challenging</option>

          </select>

          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.85)' }} />

        </div>

        {/* Price sort */}

        <div style={{ position: 'relative', minWidth: 175 }}>

          <select

            value={priceSort} onChange={e => setPriceSort(e.target.value)}

            style={{ ...inputStyle, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}

          >

            <option value="default">Sort by Price</option>

            <option value="highToLow">High to Low</option>

            <option value="lowToHigh">Low to High</option>

          </select>

          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.85)' }} />

        </div>

        {/* Second row: when, how much, how long */}
        <div style={{ flexBasis: '100%', height: 0 }} />
        <MoreTourFilters trips={tours} filters={tripFilters} setFilter={setTripFilter} inputStyle={inputStyle} />
        {anyFilter && (
          <button type="button" className="text-link" onClick={clearAllFilters} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, padding: '0 4px' }}>
            Clear filters
          </button>
        )}

      </div>



      {/* ── Tour Grid ── */}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>

        {loading ? (

          <SkeletonTourCards count={6} />

        ) : filteredTours.length === 0 ? (
          <div style={{ gridColumn: '1 / -1' }}>
            {tours.length ? (
              <EmptyState
                icon={SearchX}
                title="No tours match your search"
                message="Try another month, price or destination, or clear the filters to see every open tour."
                action={{ label: 'Clear Filters', onClick: clearAllFilters }}
              />
            ) : (
              <EmptyState
                icon={CalendarClockIcon}
                title="No open tours right now"
                message="New tour dates are posted regularly. Check the feed for announcements, or request your own trip from Exclusive Tours."
              />
            )}
          </div>

        ) : filteredTours.map((tour) => (

            <JoinerTourCard key={tour.id} tour={tour} onDetails={() => setSelectedTour(tour)} formatDate={formatDate} formatDateRange={formatDateRange} />

        ))}

      </div>



      {selectedTour && (

        <DetailedTourModal 

          tour={selectedTour} 

          onClose={() => setSelectedTour(null)} 

          formatDate={formatDate}

          formatDateRange={formatDateRange}

          onBookingSuccess={handleBookingSuccess}

        />

      )}

    </div>

  );

};

 

const JoinerTourCard = ({ tour, onDetails, formatDateRange }) => {

  const [hovered, setHovered] = useState(false);

  // A trip with several dates lists them; it's full only when every date is.
  const dates = tour.dates || [tour];
  const manyDates = dates.length > 1;
  const isFull = dates.every((d) => d.available_slots <= 0);



  return (

    <div

      style={{

        background: '#FDF6EE',

        borderRadius: 22, overflow: 'hidden',

        border: '1px solid rgba(180,81,30,0.12)',

        boxShadow: hovered ? '0 12px 36px rgba(26,10,0,0.14)' : '0 4px 16px rgba(26,10,0,0.06)',

        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',

        transition: 'all 0.25s',

        display: 'flex', flexDirection: 'column',

      }}

      onMouseEnter={() => setHovered(true)}

      onMouseLeave={() => setHovered(false)}

    >

      {/* Image */}

      <div style={{ height: 186, background: '#F2E4D0', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>

        {tour.image_urls?.[0]

          ? <img src={tour.image_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.4s' }} alt="" />

          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)' }}><ImageIcon size={44} /></div>

        }

        {/* badges */}

        <div style={{ position: 'absolute', top: 12, left: 12 }}>

          <span style={{

            background: 'rgba(253,246,238,0.92)', borderRadius: 999,

            padding: '4px 12px', fontSize: 11, fontWeight: 900,

            letterSpacing: '0.18em', textTransform: 'uppercase', color: '#1A0A00',

          }}>{tour.difficulty}</span>

        </div>

        <div style={{ position: 'absolute', top: 12, right: 12 }}>

          <span style={{

            background: isFull ? '#8C2F1C' : '#B4511E', color: '#FDF6EE',

            borderRadius: 999, padding: '4px 10px',

            fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',

          }}>

            {isFull ? 'Fully Booked' : manyDates ? `${dates.length} Dates` : `${tour.available_slots} Slots Left`}

          </span>

        </div>

      </div>



      {/* Body */}

      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

        <div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>

            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: 0, flex: 1 }}>{tour.title}</h3>

            <span style={{ fontSize: 15, fontWeight: 900, color: '#A8481A', marginLeft: 10, flexShrink: 0 }}>{formatPeso(tour.price)}</span>

          </div>

          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 12px' }}>

            <MapPin size={11} style={{ color: '#A8481A' }} /> {tour.destination}

          </p>

          {manyDates ? (
            <div style={{ marginBottom: 4 }}><TripDateLines dates={dates} /></div>
          ) : (<>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, color: '#7A3A18', textTransform: 'uppercase', letterSpacing: '0.12em' }}>

              <Calendar size={12} style={{ color: '#A8481A' }} /> {formatDateRange(tour.start_date, tour.duration)}

            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, color: isFull ? '#8C2F1C' : '#7A3A18', textTransform: 'uppercase', letterSpacing: '0.12em' }}>

              <Users size={12} style={{ color: '#A8481A' }} />

              {tour.current_booked} / {tour.group_size} Booked

              {isFull && (

                <span style={{ background: 'rgba(140,47,28,0.1)', color: '#8C2F1C', fontSize: 11, fontWeight: 900, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Full</span>

              )}

            </div>

          </div>

          <div style={{ width: '100%', background: '#F2E4D0', borderRadius: 999, height: 6, overflow: 'hidden', marginBottom: 4 }}>

            <div

              style={{

                height: 6, borderRadius: 999, transition: 'all 0.3s',

                background: isFull ? '#8C2F1C' : tour.available_slots <= 3 ? '#E8A265' : '#B4511E',

                width: `${Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100)}%`,

              }}

            />

          </div>

          </>)}

        </div>



        {/* Action */}

        <button

          onClick={onDetails}

          style={{

            width: '100%', marginTop: 14,

            padding: '11px 0',

            border: 'none', borderRadius: 12, cursor: 'pointer',

            fontFamily: 'inherit', fontWeight: 900,

            fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',

            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,

            transition: 'all 0.2s',

            background: isFull ? '#F2E4D0' : '#1A0A00',

            color: isFull ? 'rgba(122,58,24,0.85)' : '#FDF6EE',

          }}

          onMouseEnter={e => { if (!isFull) e.currentTarget.style.background = '#B4511E'; }}

          onMouseLeave={e => { if (!isFull) e.currentTarget.style.background = '#1A0A00'; }}

        >

          <Eye size={13} /> {isFull ? 'Join Waitlist' : manyDates ? 'Pick a Date' : 'View Details'}

        </button>

      </div>

    </div>

  );

};

 

/* ─────────────────────────────────────────────

   HELPERS

───────────────────────────────────────────── */

const ViewSection = ({ title, titleColor, icon, children }) => (

  <section>

    <h4 style={{

      fontSize: 11, fontWeight: 900, letterSpacing: '0.25em',

      textTransform: 'uppercase', color: titleColor || '#1A0A00',

      margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6,

    }}>

      {icon} {title}

    </h4>

    {children}

  </section>

);



const ChecklistGrid = ({ text, variant = 'neutral' }) => {

  const items = (text || '').split('\n').map(s => s.trim()).filter(Boolean);



  if (items.length === 0) {

    return <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>N/A</p>;

  }



  const iconColor = variant === 'exclude' ? '#8C2F1C' : '#A8481A';

  const itemBg = variant === 'exclude' ? 'rgba(140,47,28,0.06)' : variant === 'include' ? 'rgba(168,72,26,0.07)' : 'rgba(180,81,30,0.06)';

  const Icon = variant === 'exclude' ? X : CheckCircle2;



  return (

    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>

      {items.map((item, i) => (

        <div key={i} style={{

          display: 'flex', alignItems: 'flex-start', gap: 8,

          background: itemBg, borderRadius: 12, padding: '9px 12px',

          flex: '0 1 auto', maxWidth: '100%',

        }}>

          <span style={{ color: iconColor, flexShrink: 0, marginTop: 1 }}><Icon size={13} /></span>

          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', lineHeight: 1.4 }}>{item}</span>

        </div>

      ))}

    </div>

  );

};







const TourImageCarousel = ({ images = [] }) => {

  const [index, setIndex] = useState(0);

  const dragStartX = React.useRef(null);

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

    if (Math.abs(delta) > 40) {

      delta > 0 ? goTo(index - 1) : goTo(index + 1);

    }

    dragStartX.current = null;

  };



  return (

    <div>

      <div

        style={{

          position: 'relative', width: '100%', height: 190,

          borderRadius: 18, overflow: 'hidden',

          background: '#F2E4D0', marginBottom: hasMultiple ? 12 : 20,

          boxShadow: '0 8px 24px rgba(26,10,0,0.15)',

          flexShrink: 0, touchAction: 'pan-y', userSelect: 'none',

        }}

        onPointerDown={handleDragStart}

        onPointerUp={handleDragEnd}

      >

        {hasImages ? (

          <div style={{

            display: 'flex', width: '100%', height: '100%',

            transform: `translateX(-${index * 100}%)`,

            transition: 'transform 0.35s ease',

          }}>

            {images.map((url, i) => (

              <img

                key={i} src={url} draggable={false} alt={`Photo ${i + 1}`}

                style={{ width: '100%', height: '100%', objectFit: 'cover', flexShrink: 0 }}

              />

            ))}

          </div>

        ) : (

          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)' }}>

            <ImageIcon size={40} />

          </div>

        )}



        {hasMultiple && (

          <>

            <button

              type="button" onClick={prev}

              style={{

                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',

                background: 'rgba(26,10,0,0.65)', border: 'none', borderRadius: '50%',

                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',

                cursor: 'pointer', color: '#FDF6EE',

              }}

            ><ChevronLeft size={18} /></button>

            <button

              type="button" onClick={next}

              style={{

                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',

                background: 'rgba(26,10,0,0.65)', border: 'none', borderRadius: '50%',

                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',

                cursor: 'pointer', color: '#FDF6EE',

              }}

            ><ChevronRight size={18} /></button>

            <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>

              {images.map((_, i) => (

                <span

                  key={i}

                  onClick={(e) => { e.stopPropagation(); goTo(i); }}

                  style={{

                    width: i === index ? 16 : 6, height: 6, borderRadius: 999,

                    background: i === index ? '#FDF6EE' : 'rgba(253,246,238,0.5)',

                    cursor: 'pointer', transition: 'width 0.2s',

                  }}

                />

              ))}

            </div>

          </>

        )}

      </div>



      {hasMultiple && (

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>

          {images.map((url, i) => (

            <div

              key={i}

              onClick={() => goTo(i)}

              style={{

                aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',

                border: i === index ? '2px solid #B4511E' : '1px solid rgba(180,81,30,0.15)',

                opacity: i === index ? 1 : 0.65, transition: 'opacity 0.2s, border-color 0.2s',

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



/* ─────────────────────────────────────────────

   TOUR DETAILS + BOOKING MODAL

───────────────────────────────────────────── */

// Booking window. A trip with several dates (tour.dates, from groupTripDates)
// shows a date picker; each date is its own tour, so picking one swaps the
// window over to that date's slots, waitlist and booking.
const DetailedTourModal = ({ tour, ...props }) => {
    const dates = tour.dates?.length ? tour.dates : [tour];
    const [activeId, setActiveId] = useState(tour.id);
    const active = dates.find((d) => d.id === activeId) || dates[0];
    return <TourBookingWindow key={active.id} {...props} tour={active} dates={dates} onPickDate={setActiveId} />;
};

const TourBookingWindow = ({ tour, dates, onPickDate, onClose, formatDateRange }) => {

    const images = tour.image_urls || [];

    const [numPersons, setNumPersons] = useState(1);

    const [isBooking, setIsBooking] = useState(false);

    const [slotError, setSlotError] = useState("");

    const [paymentStep, setPaymentStep] = useState(null);


    const [redirectingToPayment, setRedirectingToPayment] = useState(false);
    // Everyone joining besides the person booking (persons 2..N): name + contact each.
    const [companions, setCompanions] = useState([]);
    const [companionError, setCompanionError] = useState("");
    // Waitlist, shown when the tour is full.
    const [myWaitlist, setMyWaitlist] = useState(null);
    const [waitlistSlots, setWaitlistSlots] = useState(1);
    const [waitlistBusy, setWaitlistBusy] = useState(false);
    // The joiner's own active booking on this date: booked joiners can't join its waitlist.
    const [myBookingNumber, setMyBookingNumber] = useState(null);

    const isFullyBooked = tour.available_slots <= 0;
    const isAlmostFull = !isFullyBooked && tour.available_slots <= 3;
    const maxBookingLimit = Math.min(tour.available_slots || 0, 10);
    const subtotal = tour.price * numPersons;
    const downpaymentAmount = downpaymentFor(subtotal);
    const filledPct = Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100);

    useEffect(() => {
        let active = true;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const [{ data }, { data: booking }] = await Promise.all([
                supabase
                    .from('tour_waitlist')
                    .select('id, slots_wanted, notified_at')
                    .eq('tour_id', tour.id)
                    .eq('user_id', user.id)
                    .maybeSingle(),
                supabase
                    .from('bookings')
                    .select('booking_number')
                    .eq('tour_id', tour.id)
                    .eq('user_id', user.id)
                    .not('booking_status', 'in', '("Cancelled","Rejected")')
                    .limit(1)
                    .maybeSingle(),
            ]);
            if (!active) return;
            setMyWaitlist(data || null);
            setMyBookingNumber(booking?.booking_number || null);
        })();
        return () => { active = false; };
    }, [tour.id]);

    const handlePersonsChange = (count) => {
        setNumPersons(count);
        setCompanions((prev) => Array.from({ length: count - 1 }, (_, i) => prev[i] || { full_name: '', contact_number: '' }));
        setSlotError("");
        setCompanionError("");
    };

    const updateCompanion = (index, field, value) => {
        setCompanions((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
        setCompanionError("");
    };

    // Nothing is reserved here: slots are held only once the joiner picks a
    // payment type and goes to PayMongo (start_online_booking). These checks just
    // stop a joiner from starting checkout for a tour that's full or already booked.
    const handleBookThisTour = async () => {
        setSlotError("");
        setCompanionError("");
        if (companions.some((c) => !c.full_name.trim() || !c.contact_number.trim())) {
            setCompanionError("Please enter the name and contact number of each person joining you.");
            return;
        }
        // Typing mistakes in the companions' details (wrong number format, one-word names, the same person twice).
        for (let i = 0; i < companions.length; i++) {
            const c = companions[i];
            const problem = fullNameError(c.full_name, `Person ${i + 2}'s name`)
                || phoneError(c.contact_number, `Person ${i + 2}'s contact number`);
            if (problem) { setCompanionError(problem); return; }
        }
        const names = companions.map((c) => cleanName(c.full_name).toLowerCase());
        const repeated = names.find((n, i) => names.indexOf(n) !== i);
        if (repeated) {
            setCompanionError(`"${companions[names.indexOf(repeated)].full_name.trim()}" is entered more than once. Each person joining needs their own details.`);
            return;
        }
        setIsBooking(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { toast.info('Please log in to book a tour.'); setIsBooking(false); return; }

        const [fresh] = await withAvailableSlots([tour]);
        if (numPersons > fresh.available_slots) {
            setSlotError(fresh.available_slots <= 0
                ? "Sorry, this tour is now fully booked."
                : `Only ${fresh.available_slots} slot${fresh.available_slots > 1 ? 's' : ''} remaining. Please reduce the number of persons.`);
            setIsBooking(false);
            return;
        }

        const { data: existingBooking } = await supabase
            .from('bookings')
            .select('booking_number')
            .eq('tour_id', tour.id)
            .eq('user_id', user.id)
            .not('booking_status', 'in', '("Cancelled","Rejected")')
            .maybeSingle();
        if (existingBooking) {
            setSlotError(`You already have an active booking for this tour (${existingBooking.booking_number}). Please check My Bookings.`);
            setIsBooking(false);
            return;
        }

        setIsBooking(false);
        setPaymentStep('proceed');
    };

    const handleJoinWaitlist = async () => {
        setWaitlistBusy(true);
        const { data, error } = await supabase
            .from('tour_waitlist')
            .insert([{ tour_id: tour.id, slots_wanted: waitlistSlots }])
            .select('id, slots_wanted, notified_at')
            .single();
        if (error) toast.error("Couldn't join the waitlist", error.message);
        else { setMyWaitlist(data); toast.success("You're on the waitlist", "We'll notify and email you if a slot opens."); }
        setWaitlistBusy(false);
    };

    const handleLeaveWaitlist = async () => {
        setWaitlistBusy(true);
        const { error } = await supabase.from('tour_waitlist').delete().eq('id', myWaitlist.id);
        if (error) toast.error("Couldn't leave the waitlist", error.message);
        else { setMyWaitlist(null); toast.info('You left the waitlist.'); }
        setWaitlistBusy(false);
    };

    // Online payment: hold the slots and go to PayMongo's secure checkout page.
    const handleChoosePaymentType = async (type) => {
        setRedirectingToPayment(true);
        const { ok, data, error } = await startCheckout({
            tourId: tour.id,
            slots: numPersons,
            paymentType: type,
            companions: companions.map((c) => ({ full_name: cleanName(c.full_name), contact_number: normalizePhone(c.contact_number) || c.contact_number.trim() })),
        });
        if (!ok) {
            toast.error("Couldn't start the payment", error);
            setRedirectingToPayment(false);
            return;
        }
        window.location.assign(data.checkoutUrl);
    };



    return (

        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>

            <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={paymentStep ? undefined : onClose} />

            <div style={{

                position: 'relative', background: '#FDF6EE',

                width: '100%', maxWidth: 1100,

                borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',

                borderTop: '8px solid #B4511E',

                overflow: 'hidden',

                maxHeight: '92dvh',

                display: 'flex', flexDirection: 'column',

            }}>

                <button onClick={onClose} style={{

                    position: 'absolute', top: 24, right: 24, zIndex: 50,

                    background: 'none', border: 'none', cursor: 'pointer',

                    color: 'rgba(122,58,24,0.85)',

                }}><X size={28} /></button>



                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>

                    <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>



                        {/* Left panel */}

                        <div className="responsive-modal-padding" style={{

                            background: '#F2E4D0',

                            padding: '2.5rem 2rem',

                            borderRight: '1px solid rgba(180,81,30,0.12)',

                            display: 'flex', flexDirection: 'column',

                        }}>

                            <TourImageCarousel images={images} />



                            <h2 style={{

                                fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em',

                                color: '#1A0A00', margin: '0 0 18px', lineHeight: 1.15,

                            }}>{tour.title}</h2>

                            {dates.length > 1 && (
                                <div style={{ marginBottom: 18 }}>
                                    <TripDatePicker dates={dates} activeId={tour.id} onPick={onPickDate} disabled={Boolean(paymentStep)} />
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>

                                {[

                                    { icon: <MapPin size={16} />, text: tour.destination },

                                    { icon: <Calendar size={16} />, text: formatDateRange(tour.start_date, tour.duration) },

                                    { icon: <Clock size={16} />, text: tour.duration },

                                ].map((row, i) => (

                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>

                                        <span style={{ color: '#A8481A' }}>{row.icon}</span> {row.text}

                                    </div>

                                ))}

                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: isFullyBooked ? '#8C2F1C' : '#7A3A18' }}>

                                    <span style={{ color: '#A8481A' }}><Users size={16} /></span>

                                    {tour.current_booked} / {tour.group_size} Slots Booked

                                </div>

                                <div style={{ background: 'rgba(180,81,30,0.15)', borderRadius: 999, height: 6, overflow: 'hidden' }}>

                                    <div style={{

                                        height: '100%', borderRadius: 999,

                                        width: `${filledPct}%`,

                                        background: isFullyBooked ? '#8C2F1C' : isAlmostFull ? '#E8A265' : '#7A3A18',

                                        transition: 'width 0.4s',

                                    }} />

                                </div>

                                <span style={{

                                    display: 'inline-block',

                                    background: '#FDF6EE',

                                    border: '1px solid rgba(180,81,30,0.2)',

                                    borderRadius: 999, padding: '4px 14px',

                                    fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',

                                    color: '#1A0A00', width: 'fit-content',

                                }}>{tour.difficulty}</span>



                                {isFullyBooked ? (

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(140,47,28,0.1)', border: '1px solid rgba(140,47,28,0.25)', borderRadius: 14, padding: '10px 14px' }}>

                                        <AlertCircle size={16} style={{ color: '#8C2F1C', flexShrink: 0 }} />

                                        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8C2F1C', margin: 0 }}>Fully Booked</p>

                                    </div>

                                ) : isAlmostFull ? (

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(232,162,101,0.18)', border: '1px solid rgba(232,162,101,0.4)', borderRadius: 14, padding: '10px 14px' }}>

                                        <AlertCircle size={16} style={{ color: '#A8481A', flexShrink: 0 }} />

                                        <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', margin: 0 }}>Only {tour.available_slots} slot{tour.available_slots > 1 ? 's' : ''} left!</p>

                                    </div>

                                ) : null}

                            </div>



                            {!isFullyBooked && (

                                <div style={{ marginBottom: 20 }}>

                                    <label style={{

                                        display: 'block', fontSize: 11, fontWeight: 800,

                                        letterSpacing: '0.2em', textTransform: 'uppercase',

                                        color: '#7A3A18', opacity: 0.9, marginBottom: 6,

                                    }}>Number of Persons</label>

                                    <div style={{ position: 'relative' }}>

                                        <select

                                            value={numPersons}

                                            onChange={(e) => handlePersonsChange(parseInt(e.target.value))}

                                            style={{

                                                width: '100%', boxSizing: 'border-box',

                                                background: '#FDF6EE',

                                                border: '1px solid rgba(180,81,30,0.18)',

                                                borderRadius: 14, padding: '12px 14px',

                                                fontSize: 13, fontWeight: 700,

                                                color: '#1A0A00', fontFamily: 'inherit', outline: 'none',

                                                appearance: 'none', cursor: 'pointer', paddingRight: 34,

                                            }}

                                        >

                                            {[...Array(maxBookingLimit)].map((_, i) => (

                                                <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? 'Person' : 'Persons'}</option>

                                            ))}

                                        </select>

                                        <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#A8481A' }} />

                                    </div>

                                    {slotError && (

                                        <p style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#8C2F1C', display: 'flex', alignItems: 'center', gap: 6 }}>

                                            <AlertCircle size={13} /> {slotError}

                                        </p>

                                    )}

                                    {companions.length > 0 && (
                                        <CompanionFields companions={companions} onChange={updateCompanion} error={companionError} />
                                    )}

                                </div>

                            )}



                            <div style={{ marginTop: 20 }}>

                                {!isFullyBooked && (

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>

                                        <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9 }}>Total</span>

                                        <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', color: '#A8481A' }}>{formatPeso(subtotal)}</span>

                                    </div>

                                )}

                                {isFullyBooked && (

                                    <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '0 0 16px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{formatPeso(tour.price)} per person</p>

                                )}

                                {isFullyBooked && (
                                    <WaitlistPanel
                                        entry={myWaitlist}
                                        bookingNumber={myBookingNumber}
                                        slots={waitlistSlots}
                                        onSlotsChange={setWaitlistSlots}
                                        busy={waitlistBusy}
                                        onJoin={handleJoinWaitlist}
                                        onLeave={handleLeaveWaitlist}
                                    />
                                )}

                                {!isFullyBooked && <button

                                    onClick={handleBookThisTour}

                                    disabled={isBooking || isFullyBooked}

                                    style={{

                                        width: '100%', padding: '14px 0',

                                        background: isFullyBooked ? '#EDEAE3' : '#B4511E',

                                        color: isFullyBooked ? '#7A3A18' : '#FDF6EE',

                                        border: 'none', borderRadius: 14, cursor: isFullyBooked ? 'not-allowed' : 'pointer',

                                        fontFamily: 'inherit', fontWeight: 900,

                                        fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',

                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,

                                        boxShadow: isFullyBooked ? 'none' : '0 6px 18px rgba(180,81,30,0.32)',

                                        transition: 'background 0.2s',

                                    }}

                                    onMouseEnter={e => { if (!isFullyBooked && !isBooking) e.currentTarget.style.background = '#1A0A00'; }}

                                    onMouseLeave={e => { if (!isFullyBooked && !isBooking) e.currentTarget.style.background = '#B4511E'; }}

                                >

                                    {isBooking ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <><CreditCard size={14} /> Book This Tour</>}

                                </button>}

                            </div>

                        </div>



                        {/* Right panel */}

                        <div style={{ display: 'flex', flexDirection: 'column' }}>

                            <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 28 }}>



                                <ViewSection title="About the Tour">

                                    <p style={{ fontSize: 14, lineHeight: 1.8, fontWeight: 500, color: '#7A3A18', whiteSpace: 'pre-wrap', margin: 0 }}>

                                        {tour.description || 'No description provided.'}

                                    </p>

                                </ViewSection>



                                <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>

                                    <ViewSection title="Inclusions" titleColor="#A8481A" icon={<CheckCircle2 size={14} />}>

                                        <ChecklistGrid text={tour.inclusions} variant="include" />

                                    </ViewSection>

                                    <ViewSection title="Exclusions" titleColor="#8C2F1C" icon={<X size={14} />}>

                                        <ChecklistGrid text={tour.exclusions} variant="exclude" />

                                    </ViewSection>

                                </div>



                                <div style={{ borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>

                                    <ViewSection title="Itinerary" titleColor="#A8481A" icon={<Clock size={14} />}>

                                        <ItineraryTimeline text={tour.itinerary} />

                                    </ViewSection>

                                </div>



                                <div style={{ borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>

                                    <ViewSection title="Things to Bring">

                                        <ChecklistGrid text={tour.things_to_bring} variant="neutral" />

                                    </ViewSection>

                                </div>



                                {tour.important_note && (

                                    <div style={{

                                        background: 'rgba(180,81,30,0.07)',

                                        borderRadius: 18, padding: '1.5rem',

                                        border: '1px solid rgba(180,81,30,0.2)',

                                        display: 'flex', gap: 16,

                                    }}>

                                        <AlertCircle size={22} style={{ color: '#A8481A', flexShrink: 0 }} />

                                        <div>

                                            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 8px' }}>

                                                Important Note

                                            </p>

                                            <pre style={{ fontSize: 13, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1.7, color: '#1A0A00', whiteSpace: 'pre-wrap', margin: 0 }}>

                                                {tour.important_note}

                                            </pre>

                                        </div>

                                    </div>

                                )}

                            </div>

                        </div>

                    </div>

                </div>

            </div>



            {/* Payment Flow Overlays */}

            {paymentStep === 'proceed' && (

                <ProceedToPaymentModal

                    tour={tour}

                    numPersons={numPersons}

                    subtotal={subtotal}

                    onProceed={() => setPaymentStep('choose')}

                    onCancel={() => setPaymentStep(null)}  // back to this tour's details, choices kept

                    formatDateRange={formatDateRange}

                />

            )}



            {paymentStep === 'choose' && (

                <ChoosePaymentTypeModal

                    subtotal={subtotal}

                    downpaymentAmount={downpaymentAmount}

                    onChoose={handleChoosePaymentType}

                    busy={redirectingToPayment}

                    onBack={() => setPaymentStep('proceed')}

                />

            )}


        </div>

    );

};



/* ─────────────────────────────────────────────

   PAYMENT FLOW OVERLAYS

───────────────────────────────────────────── */



const overlayBackdrop = {

    position: 'fixed', inset: 0, zIndex: 10000, display: 'flex',

    alignItems: 'center', justifyContent: 'center', padding: 16,

    background: 'rgba(26,10,0,0.8)', backdropFilter: 'blur(4px)',

};



const ProceedToPaymentModal = ({ tour, numPersons, subtotal, onProceed, onCancel, formatDateRange }) => {

  return (

    <div style={overlayBackdrop}>

      <div style={{

        background: '#FDF6EE', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto',

        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', borderTop: '8px solid #B4511E',

      }}>

        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

            <button onClick={onCancel} aria-label="Back to tour details" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', fontSize: 11.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'inherit', padding: 0 }}>
              <ArrowLeft size={14} /> Back
            </button>

            <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18' }}>Step 1 of 2</span>

          </div>

          <div>

            <p style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 4px' }}>Booking Preview</p>

            <h3 style={{ fontSize: 24, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: 0 }}>{tour.title}</h3>

          </div>

          <div style={{ background: '#F2E4D0', borderRadius: 20, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>

              <MapPin size={15} style={{ color: '#A8481A', flexShrink: 0 }} /> {tour.destination}

            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>

              <Calendar size={15} style={{ color: '#A8481A', flexShrink: 0 }} /> {formatDateRange(tour.start_date, tour.duration)}

            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>

              <Users size={15} style={{ color: '#A8481A', flexShrink: 0 }} /> {numPersons} {numPersons === 1 ? 'Person' : 'Persons'}

            </div>

          </div>

          <div style={{ borderTop: '2px solid rgba(180,81,30,0.12)', paddingTop: 18 }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>

              <span style={{ fontSize: 13, fontWeight: 700, color: '#7A3A18', opacity: 0.9 }}>Price per person</span>

              <span style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00' }}>{formatPeso(tour.price)}</span>

            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

              <span style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1A0A00' }}>Subtotal</span>

              <span style={{ fontSize: 28, fontWeight: 900, color: '#A8481A' }}>{formatPeso(subtotal)}</span>

            </div>

          </div>

          <button onClick={onProceed}

            style={{

              width: '100%', padding: '15px 0', background: '#1A0A00', color: '#FDF6EE',

              border: 'none', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',

              fontWeight: 900, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',

              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,

              transition: 'background 0.2s',

            }}

            onMouseEnter={e => e.currentTarget.style.background = '#B4511E'}

            onMouseLeave={e => e.currentTarget.style.background = '#1A0A00'}

          >

            <CreditCard size={16} /> Proceed to Payment

          </button>

        </div>

      </div>

    </div>

  );

};



const ChoosePaymentTypeModal = ({ subtotal, downpaymentAmount, onChoose, onBack, busy }) => {
    // Joiners tick the non-refundable agreement before they can pay.
    const [agreed, setAgreed] = useState(false);
    return (

    <div style={overlayBackdrop}>

        <div style={{

            background: '#FDF6EE', width: '100%', maxWidth: 420, maxHeight: '92dvh', overflowY: 'auto',

            padding: '2rem', borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',

            textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20,

            borderTop: '8px solid #B4511E',

        }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

                <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', fontSize: 11.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>

                    <ArrowLeft size={14} /> Back

                </button>

                <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18' }}>Step 2 of 2</span>

            </div>

            <div>

                <h3 style={{ fontSize: 20, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0 }}>Choose Payment Type</h3>

                <p style={{ fontSize: 13, fontWeight: 500, color: '#7A3A18', opacity: 0.9, margin: '8px 0 0' }}>How would you like to pay for your booking?</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '6px 0 0' }}>
                    You'll pay on PayMongo's secure page with GCash, Maya, card or GrabPay. Your slots are held for 30 minutes.
                </p>
                <p style={{ fontSize: 11, fontWeight: 800, color: '#8C2F1C', margin: '8px 0 0' }}>
                    Payments are non-refundable. You can cancel up to 14 days before the tour, but the amount paid won't be returned.
                </p>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', marginTop: 12, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#1A0A00', lineHeight: 1.55, background: 'rgba(140,47,28,0.06)', border: '1px solid rgba(140,47,28,0.18)', borderRadius: 14, padding: '10px 12px' }}>
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, accentColor: '#B4511E', flexShrink: 0 }} />
                    <span>I agree that my payment is <strong>non-refundable</strong>, and that cancellations need the agency's approval and close 14 days before the tour.</span>
                </label>

            </div>



            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>

                <button

                    onClick={() => onChoose('full')}
                    title={agreed ? undefined : 'Tick the agreement above first'}
                    disabled={busy || !agreed}

                    style={{ width: '100%', background: '#1A0A00', color: '#FDF6EE', borderRadius: 20, padding: '1.25rem 1.5rem', textAlign: 'left', border: 'none', boxShadow: '0 8px 24px rgba(26,10,0,0.25)', transition: 'background 0.2s', opacity: agreed ? 1 : 0.45, cursor: agreed ? 'pointer' : 'not-allowed' }}

                    onMouseEnter={e => e.currentTarget.style.background = '#2D1B0E'}

                    onMouseLeave={e => e.currentTarget.style.background = '#1A0A00'}

                >

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>

                        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E8A265' }}>Full Payment</span>

                        <Check size={16} style={{ color: '#E8A265' }} />

                    </div>

                    <p style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{formatPeso(subtotal)}</p>

                    <p style={{ fontSize: 11, opacity: 0.9, fontWeight: 500, margin: '4px 0 0' }}>Pay the complete amount now</p>

                </button>



                <button

                    onClick={() => onChoose('down')}
                    title={agreed ? undefined : 'Tick the agreement above first'}
                    disabled={busy || !agreed}

                    style={{ width: '100%', background: '#F2E4D0', border: '2px solid rgba(180,81,30,0.18)', borderRadius: 20, padding: '1.25rem 1.5rem', textAlign: 'left', transition: 'border-color 0.2s', opacity: agreed ? 1 : 0.45, cursor: agreed ? 'pointer' : 'not-allowed' }}

                    onMouseEnter={e => e.currentTarget.style.borderColor = '#B4511E'}

                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(180,81,30,0.18)'}

                >

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>

                        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A' }}>Downpayment (40%)</span>

                        <span style={{ fontSize: 11, fontWeight: 900, color: '#7A3A18', opacity: 0.9, textTransform: 'uppercase', flexShrink: 0 }}>Balance Later</span>

                    </div>

                    <p style={{ fontSize: 24, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{formatPeso(downpaymentAmount)}</p>

                    <p style={{ fontSize: 11, color: '#7A3A18', opacity: 0.9, fontWeight: 500, margin: '4px 0 0' }}>Pay 40% now; pay the rest online later or in person on the tour day</p>

                </button>

            </div>
            {busy && (
                <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#A8481A', margin: 0 }}>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Opening secure checkout…
                </p>
            )}

        </div>

    </div>

);
};






/* ─────────────────────────────────────────────
   GROUP BOOKING: details of everyone else joining
───────────────────────────────────────────── */
const CompanionFields = ({ companions, onChange, error }) => {
    const inputStyle = {
        width: '100%', boxSizing: 'border-box', background: '#FDF6EE',
        border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12,
        padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#1A0A00',
        fontFamily: 'inherit', outline: 'none',
    };
    return (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9, margin: 0 }}>
                Who's joining you?
            </p>
            {companions.map((c, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: '#A8481A' }}>Person {i + 2}</span>
                    <input
                        aria-label={`Person ${i + 2} full name`}
                        data-allow="name"
                        placeholder="Full name"
                        value={c.full_name}
                        onChange={(e) => onChange(i, 'full_name', e.target.value)}
                        style={inputStyle}
                    />
                    <input
                        aria-label={`Person ${i + 2} contact number`}
                        {...phoneFieldProps(c.contact_number, (v) => onChange(i, 'contact_number', v))}
                        style={inputStyle}
                    />
                </div>
            ))}
            {error && (
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#8C2F1C', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={13} /> {error}
                </p>
            )}
        </div>
    );
};

/* ─────────────────────────────────────────────
   WAITLIST (fully booked tours)
───────────────────────────────────────────── */
const WaitlistPanel = ({ entry, bookingNumber, slots, onSlotsChange, busy, onJoin, onLeave }) => (
    <div style={{ background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bookingNumber ? (
            <p style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00', margin: 0, lineHeight: 1.5 }}>
                You're already booked on this tour ({bookingNumber}), so you don't need the waitlist. You can see your booking in My Bookings.
            </p>
        ) : entry ? (
            <>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00', margin: 0, lineHeight: 1.5 }}>
                    {entry.notified_at
                        ? `A slot opened up! Slots go to whoever books first, so book soon if it's still open.`
                        : `You're on the waitlist for ${entry.slots_wanted} slot${entry.slots_wanted > 1 ? 's' : ''}. We'll notify you and email you if a slot opens.`}
                </p>
                <button type="button" onClick={onLeave} disabled={busy} style={waitlistButton(false)}>
                    {busy ? 'Leaving…' : 'Leave Waitlist'}
                </button>
            </>
        ) : (
            <>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: 0, lineHeight: 1.5 }}>
                    This tour is full. Join the waitlist and we'll let you know if a slot opens.
                </p>
                <select
                    aria-label="Slots needed"
                    value={slots}
                    onChange={(e) => onSlotsChange(parseInt(e.target.value))}
                    style={{ width: '100%', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12, padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#1A0A00', fontFamily: 'inherit' }}
                >
                    {[...Array(10)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? 'Person' : 'Persons'}</option>
                    ))}
                </select>
                <button type="button" onClick={onJoin} disabled={busy} style={waitlistButton(true)}>
                    {busy ? 'Joining…' : 'Join Waitlist'}
                </button>
            </>
        )}
    </div>
);

const waitlistButton = (primary) => ({
    width: '100%', padding: '12px 0', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
    fontWeight: 900, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
    border: primary ? 'none' : '1px solid rgba(140,47,28,0.25)',
    background: primary ? '#1A0A00' : 'transparent',
    color: primary ? '#FDF6EE' : '#8C2F1C',
});




export { JoinerTourCard, ViewSection, ChecklistGrid, ItineraryTimeline, TourImageCarousel, DetailedTourModal };

export default JoinerTours;