import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { 
  Search, MapPin, Clock, Users, Calendar, ChevronDown, 
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
 
  // â”€â”€ shared input style (matches TourManagement) â”€â”€
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

      {/* â”€â”€ Filters â”€â”€ */}
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
            type="text" placeholder="Search toursâ€¦"
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

      {/* â”€â”€ Tour Grid â”€â”€ */}
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
              Finding Adventuresâ€¦
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
            <span style={{ fontSize: 15, fontWeight: 900, color: '#C45C26', marginLeft: 10, flexShrink: 0 }}>â‚±{tour.price.toLocaleString()}</span>
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
 
const DetailedTourModal = ({ tour, onClose, formatDateRange, onBookingSuccess }) => {
    const [primaryImage, setPrimaryImage] = useState(tour.image_urls?.[0] || null);
    const [numPersons, setNumPersons] = useState(1);
    const [isBooking, setIsBooking] = useState(false);
    const [slotError, setSlotError] = useState("");
    // Payment flow states: null | 'proceed' | 'choose' | 'gcash' | 'success'
    const [paymentStep, setPaymentStep] = useState(null);
    const [paymentType, setPaymentType] = useState(null); // 'full' | 'down'
    const [bookingId, setBookingId] = useState(null);
    const [createdBooking, setCreatedBooking] = useState(null);
 
    const isFullyBooked = tour.available_slots <= 0;
    const maxBookingLimit = Math.min(tour.available_slots || 0, 10);
    const subtotal = tour.price * numPersons;
    const downpaymentAmount = Math.round(subtotal * 0.4);
 
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
            .select('first_name, last_name, phone_number, email')
            .eq('id', user.id)
            .single();

        const resolvedFullName = profile
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || "N/A"
               : "N/A";
 
        // Generate booking number
        const bookingNumber = `BK-${Date.now().toString().slice(-8)}`;
 
        const { data: booking, error } = await supabase.from('bookings').insert([{ 
            tour_id: tour.id, 
            user_id: user.id,
            booking_number: bookingNumber,
            full_name: resolvedFullName,
            email: user.email || profile?.email || "N/A",
            contact_number: profile?.phone_number || "N/A",
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
                full_name: resolvedFullName,
                email: user.email || profile?.email || "N/A",
                contact_number: profile?.phone_number || "N/A",
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
        <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 animate-in fade-in duration-300 text-left">
            <div className="absolute inset-0 bg-[#1A0A00]/95 backdrop-blur-md" onClick={paymentStep ? undefined : onClose}></div>
            <div className="relative bg-[#FDF6EE] w-full max-w-7xl h-[95vh] rounded-[1.75rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col md:flex-row border-t-8 border-[#C45C26]/90 text-left">
                <button onClick={onClose} className="absolute top-8 right-8 text-[#7A3A18]/70 hover:text-[#1A0A00] z-50 transition-colors"><X size={32}/></button>
 
                {/* Left: Tour Details */}
                <div className="flex-1 p-12 overflow-y-auto space-y-12 h-full text-left custom-scrollbar">
                    <section className="text-left">
                        <div className="rounded-3xl overflow-hidden shadow-xl mb-6 h-112 bg-[#F2E4D0] shrink-0">
                          {primaryImage 
                            ? <img src={primaryImage} className="w-full h-full object-cover animate-in fade-in" alt="" /> 
                            : <div className="w-full h-full flex items-center justify-center italic text-[#C45C26]/30"><ImageIcon size={64}/></div>
                          }
                        </div>
                        {tour.image_urls?.length > 1 && (
                          <div className="flex gap-3 mb-6 flex-wrap">
                            {tour.image_urls.map((url, idx) => (
                              <div key={idx} onClick={() => setPrimaryImage(url)} className="w-16 h-16 rounded-xl overflow-hidden border-2 cursor-pointer transition-all hover:border-[#C45C26]" style={{ borderColor: primaryImage === url ? '#C45C26' : '#e2e8f0' }}>
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
 
                    <div className="grid grid-cols-2 gap-12 border-t 	border-[#C45C26]/12 pt-10">
                        <section>
                            <h4 className="text-xs font-black text-[#C45C26] uppercase tracking-widest mb-4 flex items-center gap-2">
                                <CheckCircle2 size={16}/> Inclusions
                            </h4>
                            <pre className="text-[#7A3A18]/80 text-sm font-sans whitespace-pre-wrap leading-relaxed">{tour.inclusions || "N/A"}</pre>
                        </section>
                        <section>
                            <h4 className="text-xs font-black text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <X size={16}/> Exclusions
                            </h4>
                            <pre className="text-[#7A3A18]/80 text-sm font-sans whitespace-pre-wrap leading-relaxed">{tour.exclusions || "N/A"}</pre>
                        </section>
                    </div>
 
                    <div className="grid grid-cols-2 gap-12 border-t 	border-[#C45C26]/12 pt-10">
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
                        <div className="bg-red-50 p-8 rounded-3xl border border-red-100 flex gap-5">
                            <AlertCircle className="text-red-500 shrink-0" size={24}/>
                            <div>
                                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-2">Important Note</p>
                                <pre className="text-red-700 text-sm font-bold font-sans leading-relaxed whitespace-pre-wrap">{tour.important_note}</pre>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Booking Sidebar */}
                <div className="w-full md:w-96 bg-[#f8fafc] p-12 flex flex-col h-full shrink-0 border-l 	border-[#C45C26]/12 overflow-hidden text-left">
                    <h2 className="text-4xl font-black text-[#1A0A00] leading-tight mb-8">{tour.title}</h2>

                    <div className="space-y-8 mb-8 flex-1">
                        <div className="space-y-5">
                            <div className="flex items-center gap-3 text-[#7A3A18]/80 font-bold text-sm">
                              <Calendar size={18} className="text-[#C45C26]"/> {formatDateRange(tour.start_date, tour.duration)}
                            </div>
                            <div className="flex items-center gap-3 text-[#7A3A18]/80 font-bold text-sm">
                              <Clock size={18} className="text-[#C45C26]"/> {tour.duration}
                            </div>
                            <div className="flex items-center gap-3 font-bold text-sm">
                              <Users size={18} className="text-[#C45C26]"/>
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
                                <AlertCircle size={16} className="text-red-500 shrink-0"/>
                                <p className="text-red-600 text-xs font-black uppercase tracking-wide">Fully Booked</p>
                              </div>
                            ) : tour.available_slots <= 3 ? (
                              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                                <AlertCircle size={16} className="text-amber-500 shrink-0"/>
                                <p className="text-amber-600 text-xs font-bold">Only {tour.available_slots} slot{tour.available_slots > 1 ? 's' : ''} left!</p>
                              </div>
                            ) : null}
                        </div>

                        {!isFullyBooked && (
                          <div className="pt-8 border-t 	border-[#C45C26]/18">
                              <label className="text-[10px] font-black text-[#7A3A18]/70 uppercase block mb-4">Number of Persons</label>
                              <div className="relative">
                                  <select 
                                    value={numPersons} 
                                    onChange={(e) => { setNumPersons(parseInt(e.target.value)); setSlotError(""); }} 
                                    className="w-full bg-[#FDF6EE] rounded-2xl px-6 py-4 text-sm font-bold text-[#1A0A00] appearance-none cursor-pointer focus:ring-2 focus:ring-[#C45C26] shadow-sm"
                                  >
                                      {[...Array(maxBookingLimit)].map((_, i) => (
                                        <option key={i+1} value={i+1}>{i+1} {i === 0 ? 'Person' : 'Persons'}</option>
                                      ))}
                                  </select>
                                  <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-[#C45C26]/30 pointer-events-none" size={18} />
                              </div>
                              {slotError && (
                                <p className="mt-3 text-xs text-red-500 font-bold flex items-center gap-2">
                                  <AlertCircle size={14}/> {slotError}
                                </p>
                              )}
                          </div>
                        )}
                    </div>

                    <div className="pt-8 border-t-2 	border-[#C45C26]/18 mt-auto">
                        {!isFullyBooked && (
                          <div className="flex justify-between items-end mb-8">
                              <p className="text-sm font-black text-[#1A0A00] uppercase tracking-widest">Total</p>
                              <p className="text-4xl font-black text-[#C45C26]">â‚±{subtotal.toLocaleString()}</p>
                          </div>
                        )}
                        <button 
                          onClick={handleBookThisTour} 
                          disabled={isBooking || isFullyBooked} 
                          className={`w-full py-5 rounded-2xl font-black text-xs uppercase shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-center ${isFullyBooked ? 'bg-[#F2E4D0] text-[#7A3A18]/70 cursor-not-allowed' : 'bg-[#C45C26] hover:bg-[#9C4A1F] text-white'}`}
                        >
                            {isBooking ? <Loader2 className="animate-spin" size={16}/> : isFullyBooked ? 'Fully Booked' : 'Book This Tour'}
                        </button>
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

// Step 1: Proceed to Payment confirmation
const ProceedToPaymentModal = ({ tour, numPersons, subtotal, onProceed, onCancel, formatDateRange }) => {
  return (
    <div className="fixed inset-0 z-2000 flex items-center justify-center p-6 bg-[#1A0A00]/80 backdrop-blur-sm">
      <div className="bg-[#FDF6EE] w-full max-w-lg rounded-[1.75rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-t-8 border-[#C45C26]/90">
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
              <Calendar size={16} className="text-[#C45C26] shrink-0" /> {formatDateRange(tour.start_date, tour.duration)}
            </div>
            <div className="flex items-center gap-3 text-[#7A3A18] text-sm font-bold">
              <Users size={16} className="text-[#C45C26] shrink-0" /> {numPersons} {numPersons === 1 ? 'Person' : 'Persons'}
            </div>
          </div>
          <div className="border-t-2 	border-[#C45C26]/12 pt-6">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-bold text-[#7A3A18]/80">Price per person</span>
              <span className="text-sm font-black text-[#1A0A00]">â‚±{tour.price.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-black text-[#1A0A00] uppercase tracking-wide">Subtotal</span>
              <span className="text-3xl font-black text-[#C45C26]">â‚±{subtotal.toLocaleString()}</span>
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
};

// Step 2: Choose Full or Downpayment
const ChoosePaymentTypeModal = ({ subtotal, downpaymentAmount, onChoose, onBack }) => (
    <div className="fixed inset-0 z-2000 flex items-center justify-center p-6 bg-[#1A0A00]/80 backdrop-blur-sm">
        <div className="bg-[#FDF6EE] w-full max-w-md p-10 rounded-[1.75rem] shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300 border-t-8 border-[#C45C26]/90">
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
                    <p className="text-3xl font-black">â‚±{subtotal.toLocaleString()}</p>
                    <p className="text-xs text-[#C45C26]/30 font-medium mt-1">Pay the complete amount now</p>
                </button>
 
                {/* Downpayment */}
                <button
                    onClick={() => onChoose('down')}
                    className="w-full bg-[#FDF6EE] border-2 	border-[#C45C26]/18 rounded-3xl p-6 text-left hover:border-[#C45C26] hover:bg-[#C45C26]/5 transition-all group"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#C45C26]">Downpayment (40%)</span>
                        <span className="text-[10px] font-black text-[#7A3A18]/70 uppercase">Balance Later</span>
                    </div>
                    <p className="text-3xl font-black text-[#1A0A00]">â‚±{downpaymentAmount.toLocaleString()}</p>
                    <p className="text-xs text-[#7A3A18]/70 font-medium mt-1">Pay 40% now, settle the rest before the tour</p>
                </button>
            </div>
        </div>
    </div>
);
 
// Step 3: GCash Payment Form + Booking Summary
const GCashPaymentModal = ({ bookingId, tour, numPersons, subtotal, downpaymentAmount, paymentType, onSuccess, onBack }) => {
    const [gcashNumber, setGcashNumber] = useState("");
    const [paymentMode, setPaymentMode] = useState('manual');

    useEffect(() => {
        supabase.from('app_settings').select('value').eq('key', 'gcash_payment_mode').single()
            .then(({ data }) => { if (data) setPaymentMode(data.value); });
    }, []);

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
 
            if (uploadError) {
                console.error('Screenshot upload failed:', uploadError);
                alert("Couldn't upload your screenshot: " + uploadError.message + "\nPlease check the file and try again.");
                setSubmitting(false);
                return;
            }

            const { data: urlData } = supabase.storage
                .from('booking-receipts')
                .getPublicUrl(fileName);
            receiptUrl = urlData?.publicUrl || null;
 
            const { error } = await supabase.from('bookings').update({
                gcash_number: gcashNumber,
                gcash_reference_no: refNumber,
                receipt_url: receiptUrl,
                payment_method: paymentType === 'full' ? 'Full Payment' : 'Downpayment',
                amount_paid: amountDue,
                payment_status: 'Pending',
            }).eq('id', bookingId);
 
            if (error) {
                console.error('Booking update failed:', error);
                alert("Error: " + error.message);
            } else {
                onSuccess();
            }
        } catch (err) {
            console.error('Confirm booking failed:', err);
            alert("Something went wrong: " + (err?.message || 'Unknown error') + "\nPlease try again.");
        }
        setSubmitting(false);
    };
 
    return (
        <div className="fixed inset-0 z-2000 flex items-center justify-center p-6 bg-[#1A0A00]/80 backdrop-blur-sm overflow-y-auto">
            <div className="bg-[#FDF6EE] w-full max-w-2xl rounded-[1.75rem] shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden my-auto">
                {/* Header */}
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
                    {/* GCash Send To */}
                    {paymentMode !== 'paymongo' && (
                    <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 flex items-center gap-5">
                        <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shrink-0">
                            <Smartphone size={22} className="text-white"/>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Send GCash Payment To</p>
                            <p className="text-2xl font-black text-[#1A0A00]">09XX XXX XXXX</p>
                            <p className="text-xs text-blue-500 font-bold mt-0.5">Bandang IBAYO Tours</p>
                        </div>
                    </div>
                    )}
 
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Left: Form */}
                        <div className="space-y-5">
                        {paymentMode === 'paymongo' ? (
                            <div className="h-full flex flex-col justify-center gap-6">
                                <p className="text-sm font-medium text-[#7A3A18]/80 leading-relaxed">
                                    You'll be redirected to GCash to authorize this payment securely. Once confirmed, your booking updates automatically â€” no need to upload a screenshot.
                                </p>
                                <PayMongoGCashButton bookingId={bookingId} />
                            </div>
                        ) : (
                        <>
                            <div>
                                <label className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest block mb-2">Your GCash Number</label>
                                <input
                                    type="tel"
                                    value={gcashNumber}
                                    onChange={(e) => setGcashNumber(e.target.value)}
                                    placeholder="09XX XXX XXXX"
                                    className="w-full bg-[#F2E4D0] border-none rounded-2xl px-5 py-4 text-sm font-bold text-[#1A0A00] focus:ring-2 focus:ring-[#C45C26] outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest block mb-2">GCash Reference Number</label>
                                <input
                                    type="text"
                                    value={refNumber}
                                    onChange={(e) => setRefNumber(e.target.value)}
                                    placeholder="13-digit reference number"
                                    className="w-full bg-[#F2E4D0] border-none rounded-2xl px-5 py-4 text-sm font-bold text-[#1A0A00] focus:ring-2 focus:ring-[#C45C26] outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest block mb-2">Transaction Screenshot</label>
                                <label className="w-full border-2 border-dashed 	border-[#C45C26]/18 hover:border-[#C45C26] rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all group">
                                    <input type="file" accept="image/*" onChange={handleScreenshotChange} className="hidden" />
                                    {screenshotPreview ? (
                                        <img src={screenshotPreview} alt="Receipt" className="w-full h-32 object-cover rounded-xl" />
                                    ) : (
                                        <>
                                            <Upload size={24} className="text-[#C45C26]/30 group-hover:text-[#C45C26] mb-2 transition-colors"/>
                                            <p className="text-xs font-bold text-[#7A3A18]/70 group-hover:text-[#C45C26] transition-colors">Upload Screenshot</p>
                                        </>
                                    )}
                                </label>
                            </div>
                        </>
                        )}
                        </div>
                        {/* Right: Booking Summary */}
                        <div className="bg-[#F2E4D0] rounded-3xl p-6 space-y-4">
                            <div className="flex items-center gap-2 mb-4">
                                <Receipt size={16} className="text-[#C45C26]"/>
                                <p className="text-[10px] font-black text-[#7A3A18]/70 uppercase tracking-widest">Booking Summary</p>
                            </div>
 
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-[#7A3A18]/80 font-medium">Tour</span>
                                    <span className="font-bold text-[#1A0A00] text-right max-w-35 leading-snug">{tour.title}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#7A3A18]/80 font-medium">Quantity</span>
                                    <span className="font-bold text-[#1A0A00]">{numPersons} {numPersons === 1 ? 'pax' : 'pax'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#7A3A18]/80 font-medium">Price/pax</span>
                                    <span className="font-bold text-[#1A0A00]">â‚±{tour.price.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between border-t 	border-[#C45C26]/18 pt-3">
                                    <span className="text-[#7A3A18]/80 font-medium">Subtotal</span>
                                    <span className="font-bold text-[#1A0A00]">â‚±{subtotal.toLocaleString()}</span>
                                </div>
 
                                {paymentType === 'down' && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-[#7A3A18]/80 font-medium">Downpayment (40%)</span>
                                            <span className="font-bold text-amber-600">â‚±{downpaymentAmount.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#7A3A18]/80 font-medium">Remaining Balance</span>
                                            <span className="font-bold text-[#7A3A18]/70">â‚±{balance.toLocaleString()}</span>
                                        </div>
                                    </>
                                )}
 
                                <div className="flex justify-between border-t-2 	border-[#C45C26]/18 pt-3 mt-3">
                                    <span className="font-black text-[#1A0A00] uppercase text-xs tracking-widest">
                                        {paymentType === 'full' ? 'Total Payment' : 'Amount Due Now'}
                                    </span>
                                    <span className="font-black text-[#C45C26] text-xl">â‚±{amountDue.toLocaleString()}</span>
                                </div>
                            </div>
 
                            {paymentType === 'down' && (
                                <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mt-2">
                                    <p className="text-amber-700 text-[10px] font-bold leading-snug">âšï¸ Remaining balance of â‚±{balance.toLocaleString()} must be settled before the tour date.</p>
                                </div>
                            )}
                        </div>
                    </div>
 
                    {paymentMode !== 'paymongo' && (
                    <button
                        onClick={handleConfirmBooking}
                        disabled={submitting}
                        className="w-full py-5 bg-[#C45C26] hover:bg-[#9C4A1F] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        {submitting ? <><Loader2 className="animate-spin" size={16}/> Processing...</> : <><Check size={16}/> Confirm Booking</>}
                    </button>
                    )}
                </div>
            </div>
        </div>
    );
};
 
// Step 4: Success screen
const BookingSuccessModal = ({ booking, tour, onClose }) => (
    <div className="fixed inset-0 z-2000 flex items-center justify-center p-6 bg-[#1A0A00]/80 backdrop-blur-sm">
        <div className="bg-[#FDF6EE] w-full max-w-md p-10 rounded-[1.75rem] shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300 border-t-8 border-[#C45C26]/90">
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
                <p className="text-[#1A0A00] text-xs font-bold">We'll verify your GCash payment and confirm your slot shortly. Thank you! ðŸŽ‰</p>
            </div>
            <button onClick={onClose} className="w-full py-4 bg-[#1A0A00] text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#2D1B0E] transition-all">Done</button>
        </div>
    </div>
);
 
export default JoinerTours;