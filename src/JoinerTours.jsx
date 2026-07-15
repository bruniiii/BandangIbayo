import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { 
  Search, MapPin, Clock, Users, Calendar, ChevronDown, ChevronLeft, ChevronRight,
  Eye, ImageIcon, Loader2, CheckCircle2, X, AlertCircle, Star,
  CreditCard, Smartphone, Receipt, Upload, ArrowLeft, Check
} from 'lucide-react';
 
const JoinerTours = () => {
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
 
  const formatDateRange = (dateString, duration) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split('-').map(Number);
 
    // Parse number of days from strings like "3 Days", "1 Day", "2 Days", etc.
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
 
  const fetchToursWithSlots = useCallback(async () => {
    setLoading(true);
    const { data: toursData } = await supabase
      .from('tours')
      .select('*')
      .eq('is_archived', false)
      .order('start_date', { ascending: true });
 
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('tour_id, slots_booked')
      .eq('booking_status', 'Completed')
 
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
 
  const filteredTours = tours.filter((t) => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.destination.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDifficulty = difficultyFilter === "All Difficulty" || t.difficulty === difficultyFilter;
    return matchesSearch && matchesDifficulty;
  }).sort((a, b) => {
    if (priceSort === "highToLow") return b.price - a.price;
    if (priceSort === "lowToHigh") return a.price - b.price;
    return 0;
  });
 
  // ── shared input style (matches TourManagement) ──
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

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
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={15} style={{
            position: 'absolute', left: 13, top: '50%',
            transform: 'translateY(-50%)',
            color: 'rgba(122,58,24,0.35)', pointerEvents: 'none',
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
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.35)' }} />
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
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.35)' }} />
        </div>
      </div>

      {/* ── Tour Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {loading ? (
          <div style={{
            gridColumn: '1 / -1',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '5rem 0', color: 'rgba(122,58,24,0.4)',
          }}>
            <Loader2 size={30} className="animate-spin" style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
              Finding Adventures…
            </p>
          </div>
        ) : filteredTours.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            padding: '5rem 0', textAlign: 'center',
            background: '#FDF6EE',
            borderRadius: 20,
            border: '2px dashed rgba(196,92,38,0.2)',
          }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.4)', margin: 0 }}>
              No tours found.
            </p>
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
  const isFull = tour.available_slots <= 0;

  return (
    <div
      style={{
        background: '#FDF6EE',
        borderRadius: 22, overflow: 'hidden',
        border: '1px solid rgba(196,92,38,0.12)',
        boxShadow: hovered ? '0 12px 36px rgba(26,10,0,0.14)' : '0 4px 16px rgba(26,10,0,0.06)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all 0.25s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div style={{ height: 186, background: '#E8D5BC', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {tour.image_urls?.[0]
          ? <img src={tour.image_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.4s' }} alt="" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.2)' }}><ImageIcon size={44} /></div>
        }
        {/* badges */}
        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <span style={{
            background: 'rgba(253,246,238,0.92)', borderRadius: 999,
            padding: '4px 12px', fontSize: 9, fontWeight: 900,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: '#1A0A00',
          }}>{tour.difficulty}</span>
        </div>
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <span style={{
            background: isFull ? '#ef4444' : '#C45C26', color: '#FDF6EE',
            borderRadius: 999, padding: '4px 10px',
            fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
          }}>
            {isFull ? 'Fully Booked' : `${tour.available_slots} Slots Left`}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: 0, flex: 1 }}>{tour.title}</h3>
            <span style={{ fontSize: 15, fontWeight: 900, color: '#C45C26', marginLeft: 10, flexShrink: 0 }}>₱{tour.price.toLocaleString()}</span>
          </div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 12px' }}>
            <MapPin size={11} style={{ color: '#C45C26' }} /> {tour.destination}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 700, color: '#7A3A18', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              <Calendar size={12} style={{ color: '#C45C26' }} /> {formatDateRange(tour.start_date, tour.duration)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 700, color: isFull ? '#C45C26' : '#7A3A18', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              <Users size={12} style={{ color: '#C45C26' }} />
              {tour.current_booked} / {tour.group_size} Booked
              {isFull && (
                <span style={{ background: 'rgba(196,92,38,0.12)', color: '#C45C26', fontSize: 7, fontWeight: 900, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Full</span>
              )}
            </div>
          </div>
          <div style={{ width: '100%', background: '#F2E4D0', borderRadius: 999, height: 6, overflow: 'hidden', marginBottom: 4 }}>
            <div
              style={{
                height: 6, borderRadius: 999, transition: 'all 0.3s',
                background: isFull ? '#ef4444' : tour.available_slots <= 3 ? '#f59e0b' : '#C45C26',
                width: `${Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Action */}
        <button
          onClick={onDetails}
          disabled={isFull}
          style={{
            width: '100%', marginTop: 14,
            padding: '11px 0',
            border: 'none', borderRadius: 12, cursor: isFull ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', fontWeight: 900,
            fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'opacity 0.15s',
            background: isFull ? '#F2E4D0' : '#1A0A00',
            color: isFull ? 'rgba(122,58,24,0.5)' : '#FDF6EE',
          }}
        >
          <Eye size={13} /> {isFull ? 'Closed' : 'View Details'}
        </button>
      </div>
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   HELPERS (mirrors TourManagement's design system)
───────────────────────────────────────────── */
const ViewSection = ({ title, titleColor, icon, children }) => (
  <section>
    <h4 style={{
      fontSize: 9, fontWeight: 900, letterSpacing: '0.25em',
      textTransform: 'uppercase', color: titleColor || '#1A0A00',
      margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {icon} {title}
    </h4>
    {children}
  </section>
);

/* Renders newline-separated text (inclusions/exclusions/things-to-bring)
   as a tidy checklist grid instead of a raw text block. */
const ChecklistGrid = ({ text, variant = 'neutral' }) => {
  const items = (text || '').split('\n').map(s => s.trim()).filter(Boolean);

  if (items.length === 0) {
    return <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', opacity: 0.5, margin: 0 }}>N/A</p>;
  }

  const iconColor = variant === 'exclude' ? '#8C2F1C' : variant === 'include' ? '#C45C26' : '#7A3A18';
  const itemBg = variant === 'exclude' ? 'rgba(140,47,28,0.06)' : variant === 'include' ? 'rgba(196,92,38,0.07)' : 'rgba(122,58,24,0.06)';
  const Icon = variant === 'exclude' ? X : CheckCircle2;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: itemBg, borderRadius: 12, padding: '9px 12px',
        }}>
          <span style={{ color: iconColor, flexShrink: 0, marginTop: 1 }}><Icon size={13} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', lineHeight: 1.4 }}>{item}</span>
        </div>
      ))}
    </div>
  );
};

/* Slideable photo gallery, identical behavior to TourManagement's carousel */
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
          background: '#E8D5BC', marginBottom: hasMultiple ? 12 : 20,
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
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.3)' }}>
            <ImageIcon size={40} />
          </div>
        )}

        {hasMultiple && (
          <>
            <button
              type="button" onClick={prev}
              style={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(26,10,0,0.5)', border: 'none', borderRadius: '50%',
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#FDF6EE',
              }}
            ><ChevronLeft size={18} /></button>
            <button
              type="button" onClick={next}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(26,10,0,0.5)', border: 'none', borderRadius: '50%',
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
                border: i === index ? '2px solid #C45C26' : '1px solid rgba(196,92,38,0.15)',
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
   (split panel, mirrors TourManagement's TourViewModal)
───────────────────────────────────────────── */
const DetailedTourModal = ({ tour, onClose, formatDateRange, onBookingSuccess }) => {
    const images = tour.image_urls || [];
    const [numPersons, setNumPersons] = useState(1);
    const [isBooking, setIsBooking] = useState(false);
    const [slotError, setSlotError] = useState("");
    // Payment flow states: null | 'proceed' | 'choose' | 'gcash' | 'success'
    const [paymentStep, setPaymentStep] = useState(null);
    const [paymentType, setPaymentType] = useState(null); // 'full' | 'down'
    const [bookingId, setBookingId] = useState(null);
    const [createdBooking, setCreatedBooking] = useState(null);

    const isFullyBooked = tour.available_slots <= 0;
    const isAlmostFull = !isFullyBooked && tour.available_slots <= 3;
    const maxBookingLimit = Math.min(tour.available_slots || 0, 10);
    const subtotal = tour.price * numPersons;
    const downpaymentAmount = Math.round(subtotal * 0.4);
    const filledPct = Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100);

    const handleBookThisTour = async () => {
        setSlotError("");
        setIsBooking(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { alert("Please log in to book a tour."); setIsBooking(false); return; }

        const { data: freshBookings } = await supabase
            .from('bookings')
            .select('slots_booked')
            .eq('tour_id', tour.id)
            .eq('booking_status', 'Completed')

        const totalBooked = (freshBookings || []).reduce((sum, b) => sum + (b.slots_booked || 0), 0);
        const freshAvailable = (tour.group_size || 15) - totalBooked;

        if (freshAvailable <= 0) {
            setSlotError("Sorry, this tour just became fully booked.");
            setIsBooking(false);
            return;
        }

        if (numPersons > freshAvailable) {
            setSlotError(`Only ${freshAvailable} slot${freshAvailable > 1 ? 's' : ''} remaining. Please reduce the number of persons.`);
            setIsBooking(false);
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
            setIsBooking(false);
            return;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, contact_number, email')
            .eq('id', user.id)
            .single();

        // Generate booking number
        const bookingNumber = `BK-${Date.now().toString().slice(-8)}`;

        const { data: booking, error } = await supabase.from('bookings').insert([{
            tour_id: tour.id,
            user_id: user.id,
            booking_number: bookingNumber,
            full_name: profile?.full_name || "N/A",
            email: user.email || profile?.email || "N/A",
            contact_number: profile?.contact_number || "N/A",
            slots_booked: numPersons,
            total_price: subtotal,
            payment_status: 'Pending',
            booking_status: 'Active',
            payment_method: null,
        }]).select();

        if (error) {
            alert("Database Error: " + error.message);
            setIsBooking(false);
        } else {
            setBookingId(booking[0].id);
            setCreatedBooking({
                ...booking[0],
                full_name: profile?.full_name || "N/A",
                email: user.email || profile?.email || "N/A",
                contact_number: profile?.contact_number || "N/A",
                booking_number: bookingNumber,
            });
            setPaymentStep('proceed');
            if (onBookingSuccess) onBookingSuccess();
        }
        setIsBooking(false);
    };

    const handleChoosePaymentType = (type) => {
        setPaymentType(type);
        setPaymentStep('gcash');
    };

    const handlePaymentSuccess = () => {
        setPaymentStep('success');
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={paymentStep ? undefined : onClose} />
            <div style={{
                position: 'relative', background: '#FDF6EE',
                width: '100%', maxWidth: 1100,
                borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
                overflow: 'hidden',
                maxHeight: '92vh',
                display: 'flex', flexDirection: 'column',
            }}>
                <button onClick={onClose} style={{
                    position: 'absolute', top: 24, right: 24, zIndex: 50,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(122,58,24,0.5)',
                }}><X size={28} /></button>

                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>

                        {/* Left panel: gallery, meta, price, booking action */}
                        <div className="responsive-modal-padding" style={{
                            background: '#F2E4D0',
                            padding: '2.5rem 2rem',
                            borderRight: '1px solid rgba(196,92,38,0.12)',
                            display: 'flex', flexDirection: 'column',
                        }}>
                            <TourImageCarousel images={images} />

                            <h2 style={{
                                fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em',
                                color: '#1A0A00', margin: '0 0 18px', lineHeight: 1.15,
                            }}>{tour.title}</h2>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                                {[
                                    { icon: <MapPin size={16} />, text: tour.destination },
                                    { icon: <Calendar size={16} />, text: formatDateRange(tour.start_date, tour.duration) },
                                    { icon: <Clock size={16} />, text: tour.duration },
                                ].map((row, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>
                                        <span style={{ color: '#C45C26' }}>{row.icon}</span> {row.text}
                                    </div>
                                ))}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: isFullyBooked ? '#C45C26' : '#7A3A18' }}>
                                    <span style={{ color: '#C45C26' }}><Users size={16} /></span>
                                    {tour.current_booked} / {tour.group_size} Slots Booked
                                </div>
                                <div style={{ background: 'rgba(196,92,38,0.15)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', borderRadius: 999,
                                        width: `${filledPct}%`,
                                        background: isFullyBooked ? '#C45C26' : isAlmostFull ? '#E8A265' : '#7A3A18',
                                        transition: 'width 0.4s',
                                    }} />
                                </div>
                                <span style={{
                                    display: 'inline-block',
                                    background: '#FDF6EE',
                                    border: '1px solid rgba(196,92,38,0.2)',
                                    borderRadius: 999, padding: '4px 14px',
                                    fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
                                    color: '#1A0A00', width: 'fit-content',
                                }}>{tour.difficulty}</span>

                                {isFullyBooked ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(196,92,38,0.1)', border: '1px solid rgba(196,92,38,0.25)', borderRadius: 14, padding: '10px 14px' }}>
                                        <AlertCircle size={16} style={{ color: '#C45C26', flexShrink: 0 }} />
                                        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C45C26', margin: 0 }}>Fully Booked</p>
                                    </div>
                                ) : isAlmostFull ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(232,162,101,0.18)', border: '1px solid rgba(232,162,101,0.4)', borderRadius: 14, padding: '10px 14px' }}>
                                        <AlertCircle size={16} style={{ color: '#B9762E', flexShrink: 0 }} />
                                        <p style={{ fontSize: 11, fontWeight: 700, color: '#8A5A1E', margin: 0 }}>Only {tour.available_slots} slot{tour.available_slots > 1 ? 's' : ''} left!</p>
                                    </div>
                                ) : null}
                            </div>

                            {!isFullyBooked && (
                                <div style={{ marginBottom: 20 }}>
                                    <label style={{
                                        display: 'block', fontSize: 9, fontWeight: 800,
                                        letterSpacing: '0.2em', textTransform: 'uppercase',
                                        color: '#7A3A18', opacity: 0.7, marginBottom: 6,
                                    }}>Number of Persons</label>
                                    <div style={{ position: 'relative' }}>
                                        <select
                                            value={numPersons}
                                            onChange={(e) => { setNumPersons(parseInt(e.target.value)); setSlotError(""); }}
                                            style={{
                                                width: '100%', boxSizing: 'border-box',
                                                background: '#FDF6EE',
                                                border: '1px solid rgba(196,92,38,0.18)',
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
                                        <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(196,92,38,0.5)' }} />
                                    </div>
                                    {slotError && (
                                        <p style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: '#C45C26', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <AlertCircle size={13} /> {slotError}
                                        </p>
                                    )}
                                </div>
                            )}

                            <div style={{ marginTop: 'auto' }}>
                                {!isFullyBooked && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                                        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7 }}>Total</span>
                                        <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', color: '#C45C26' }}>₱{subtotal.toLocaleString()}</span>
                                    </div>
                                )}
                                {isFullyBooked && (
                                    <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.6, margin: '0 0 16px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>₱{tour.price.toLocaleString()} per person</p>
                                )}
                                <button
                                    onClick={handleBookThisTour}
                                    disabled={isBooking || isFullyBooked}
                                    style={{
                                        width: '100%', padding: '14px 0',
                                        background: isFullyBooked ? '#E8D5BC' : '#C45C26',
                                        color: isFullyBooked ? 'rgba(122,58,24,0.6)' : '#FDF6EE',
                                        border: 'none', borderRadius: 14, cursor: isFullyBooked ? 'not-allowed' : 'pointer',
                                        fontFamily: 'inherit', fontWeight: 900,
                                        fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        boxShadow: isFullyBooked ? 'none' : '0 6px 18px rgba(196,92,38,0.32)',
                                    }}
                                >
                                    {isBooking ? <Loader2 className="animate-spin" size={15} /> : <><CreditCard size={14} /> {isFullyBooked ? 'Fully Booked' : 'Book This Tour'}</>}
                                </button>
                            </div>
                        </div>

                        {/* Right panel: description, inclusions/exclusions, itinerary */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 28 }}>

                                <ViewSection title="About the Tour">
                                    <p style={{ fontSize: 14, lineHeight: 1.8, fontWeight: 500, color: '#7A3A18', whiteSpace: 'pre-wrap', margin: 0 }}>
                                        {tour.description || 'No description provided.'}
                                    </p>
                                </ViewSection>

                                <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid rgba(196,92,38,0.1)', paddingTop: 24 }}>
                                    <ViewSection title="Inclusions" titleColor="#C45C26" icon={<CheckCircle2 size={14} />}>
                                        <ChecklistGrid text={tour.inclusions} variant="include" />
                                    </ViewSection>
                                    <ViewSection title="Exclusions" titleColor="#C45C26" icon={<X size={14} />}>
                                        <ChecklistGrid text={tour.exclusions} variant="exclude" />
                                    </ViewSection>
                                </div>

                                <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid rgba(196,92,38,0.1)', paddingTop: 24 }}>
                                    <ViewSection title="Itinerary">
                                        <pre style={{ fontSize: 13, fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#7A3A18', margin: 0 }}>{tour.itinerary || 'N/A'}</pre>
                                    </ViewSection>
                                    <ViewSection title="Things to Bring">
                                        <ChecklistGrid text={tour.things_to_bring} variant="neutral" />
                                    </ViewSection>
                                </div>

                                {tour.important_note && (
                                    <div style={{
                                        background: 'rgba(196,92,38,0.07)',
                                        borderRadius: 18, padding: '1.5rem',
                                        border: '1px solid rgba(196,92,38,0.2)',
                                        display: 'flex', gap: 16,
                                    }}>
                                        <AlertCircle size={22} style={{ color: '#C45C26', flexShrink: 0 }} />
                                        <div>
                                            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C45C26', margin: '0 0 8px' }}>
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
                    onCancel={() => { setPaymentStep(null); onClose(); }}
                    formatDateRange={formatDateRange}
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
                    bookingId={bookingId}
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
                    onClose={() => { setPaymentStep(null); onClose(); }}
                />
            )}
        </div>
    );
};

/* ─────────────────────────────────────────────
   PAYMENT FLOW OVERLAYS (inline-style, matches TourManagement palette)
───────────────────────────────────────────── */

const overlayBackdrop = {
    position: 'fixed', inset: 0, zIndex: 10000, display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: 16,
    background: 'rgba(26,10,0,0.8)', backdropFilter: 'blur(4px)',
};

// Step 1: Proceed to Payment confirmation
const ProceedToPaymentModal = ({ tour, numPersons, subtotal, onProceed, onCancel, formatDateRange }) => {
  return (
    <div style={overlayBackdrop}>
      <div style={{
        background: '#FDF6EE', width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto',
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', borderTop: '8px solid rgba(196,92,38,0.9)',
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
              <Calendar size={15} style={{ color: '#C45C26', flexShrink: 0 }} /> {formatDateRange(tour.start_date, tour.duration)}
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
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <CreditCard size={16} /> Proceed to Payment
          </button>
        </div>
      </div>
    </div>
  );
};

// Step 2: Choose Full or Downpayment
const ChoosePaymentTypeModal = ({ subtotal, downpaymentAmount, onChoose, onBack }) => (
    <div style={overlayBackdrop}>
        <div style={{
            background: '#FDF6EE', width: '100%', maxWidth: 420, maxHeight: '92vh', overflowY: 'auto',
            padding: '2rem', borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
            textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20,
            borderTop: '8px solid rgba(196,92,38,0.9)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(122,58,24,0.7)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                    <ArrowLeft size={14} /> Back
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
                    style={{ width: '100%', background: '#1A0A00', color: '#FDF6EE', borderRadius: 20, padding: '1.25rem 1.5rem', textAlign: 'left', border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(26,10,0,0.25)' }}
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
                    style={{ width: '100%', background: '#FDF6EE', border: '2px solid rgba(196,92,38,0.18)', borderRadius: 20, padding: '1.25rem 1.5rem', textAlign: 'left', cursor: 'pointer' }}
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
const GCashPaymentModal = ({ bookingId, tour, numPersons, subtotal, downpaymentAmount, paymentType, onSuccess, onBack }) => {
    const [gcashNumber, setGcashNumber] = useState("");

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
    const [refNumber, setRefNumber] = useState("");
    const [screenshot, setScreenshot] = useState(null);
    const [screenshotPreview, setScreenshotPreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const amountDue = paymentType === 'full' ? subtotal : downpaymentAmount;
    const balance = paymentType === 'down' ? subtotal - downpaymentAmount : 0;

    const handleScreenshotChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setScreenshot(file);
            const reader = new FileReader();
            reader.onloadend = () => setScreenshotPreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleConfirmBooking = async () => {
        if (!gcashNumber.trim()) return alert("Please enter your GCash number.");
        if (!refNumber.trim()) return alert("Please enter your GCash Reference Number.");
        if (!screenshot) return alert("Please upload a screenshot of your transaction.");

        setSubmitting(true);
        try {
            // Upload screenshot to Supabase storage
            const fileExt = screenshot.name.split('.').pop();
            const fileName = `receipts/${bookingId}_${Date.now()}.${fileExt}`;
            let receiptUrl = null;

            const { error: uploadError } = await supabase.storage
              .from('booking-receipts')
              .upload(fileName, screenshot);

            if (!uploadError) {
                const { data: urlData } = supabase.storage
                    .from('booking-receipts')
                    .getPublicUrl(fileName);
                receiptUrl = urlData?.publicUrl || null;
            }

            const { error } = await supabase.from('bookings').update({
                gcash_number: gcashNumber,
                gcash_reference_no: refNumber,
                receipt_url: receiptUrl,
                payment_method: paymentType === 'full' ? 'Full Payment' : 'Downpayment',
                amount_paid: amountDue,
                payment_status: 'Pending',
            }).eq('id', bookingId);

            if (error) {
                alert("Error: " + error.message);
            } else {
                onSuccess();
            }
        } catch {
            alert("Something went wrong. Please try again.");
        }
        setSubmitting(false);
    };

    const fieldLabelStyle = { display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, marginBottom: 8 };
    const fieldInputStyle = { width: '100%', boxSizing: 'border-box', background: '#F2E4D0', border: 'none', borderRadius: 16, padding: '14px 16px', fontSize: 13, fontWeight: 700, color: '#1A0A00', fontFamily: 'inherit', outline: 'none' };

    return (
        <div style={{ ...overlayBackdrop, overflowY: 'auto' }}>
            <div style={{ background: '#FDF6EE', width: '100%', maxWidth: 720, borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', overflow: 'hidden', margin: 'auto' }}>
                {/* Header */}
                <div style={{ background: '#1A0A00', padding: '1.75rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
                            <ArrowLeft size={20} />
                        </button>
                        <div style={{ minWidth: 0 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 900, color: '#FDF6EE', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0 }}>GCash Payment</h3>
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>{paymentType === 'full' ? 'Full Payment' : 'Downpayment (40%)'}</p>
                        </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>Step 3 of 3</span>
                </div>

                <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* GCash Send To */}
                    <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 20, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 48, height: 48, background: '#3b82f6', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Smartphone size={22} style={{ color: '#fff' }} />
                        </div>
                        <div>
                            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#3b82f6', margin: '0 0 4px' }}>Send GCash Payment To</p>
                            <p style={{ fontSize: 20, fontWeight: 900, color: '#1A0A00', margin: 0 }}>09XX XXX XXXX</p>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', margin: '2px 0 0' }}>Bandang IBAYO Tours</p>
                        </div>
                    </div>

                    <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                        {/* Left: Form */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <div>
                                <label style={fieldLabelStyle}>Your GCash Number</label>
                                <input
                                    type="tel"
                                    value={gcashNumber}
                                    onChange={(e) => setGcashNumber(e.target.value)}
                                    placeholder="09XX XXX XXXX"
                                    style={fieldInputStyle}
                                />
                            </div>
                            <div>
                                <label style={fieldLabelStyle}>GCash Reference Number</label>
                                <input
                                    type="text"
                                    value={refNumber}
                                    onChange={(e) => setRefNumber(e.target.value)}
                                    placeholder="13-digit reference number"
                                    style={fieldInputStyle}
                                />
                            </div>
                            <div>
                                <label style={fieldLabelStyle}>Transaction Screenshot</label>
                                <label style={{ width: '100%', boxSizing: 'border-box', border: '2px dashed rgba(196,92,38,0.25)', borderRadius: 16, padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                    <input type="file" accept="image/*" onChange={handleScreenshotChange} style={{ display: 'none' }} />
                                    {screenshotPreview ? (
                                        <img src={screenshotPreview} alt="Receipt" style={{ width: '100%', height: 128, objectFit: 'cover', borderRadius: 12 }} />
                                    ) : (
                                        <>
                                            <Upload size={22} style={{ color: 'rgba(196,92,38,0.4)', marginBottom: 8 }} />
                                            <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.7, margin: 0 }}>Upload Screenshot</p>
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
                                    <span style={{ fontWeight: 700, color: '#1A0A00', textAlign: 'right' }}>{tour.title}</span>
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
                                            <span style={{ fontWeight: 700, color: '#B9762E' }}>₱{downpaymentAmount.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#7A3A18', opacity: 0.8, fontWeight: 500 }}>Remaining Balance</span>
                                            <span style={{ fontWeight: 700, color: '#7A3A18', opacity: 0.7 }}>₱{balance.toLocaleString()}</span>
                                        </div>
                                    </>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid rgba(196,92,38,0.18)', paddingTop: 10, marginTop: 4 }}>
                                    <span style={{ fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>
                                        {paymentType === 'full' ? 'Total Payment' : 'Amount Due Now'}
                                    </span>
                                    <span style={{ fontWeight: 900, color: '#C45C26', fontSize: 18 }}>₱{amountDue.toLocaleString()}</span>
                                </div>
                            </div>

                            {paymentType === 'down' && (
                                <div style={{ background: 'rgba(232,162,101,0.18)', border: '1px solid rgba(232,162,101,0.4)', borderRadius: 14, padding: '10px 14px', marginTop: 4 }}>
                                    <p style={{ fontSize: 10, fontWeight: 700, color: '#8A5A1E', lineHeight: 1.5, margin: 0 }}>⚠️ Remaining balance of ₱{balance.toLocaleString()} must be settled before the tour date.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleConfirmBooking}
                        disabled={submitting}
                        style={{
                            width: '100%', padding: '15px 0', background: '#C45C26', color: '#FDF6EE',
                            border: 'none', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
                            fontWeight: 900, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            boxShadow: '0 8px 24px rgba(196,92,38,0.3)',
                        }}
                    >
                        {submitting ? <><Loader2 className="animate-spin" size={16} /> Processing...</> : <><Check size={16} /> Confirm Booking</>}
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
            borderTop: '8px solid rgba(196,92,38,0.9)',
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

export default JoinerTours;