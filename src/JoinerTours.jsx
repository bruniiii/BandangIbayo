import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { withAvailableSlots, formatDateRange, archivePastTours, notEndedFilter, groupTripDates, tripForDate } from './tourUtils';
import PriceTag from './ui/PriceTag';
import { TripDateLines } from './ui/TripDates';
import { MoreTourFilters } from './ui/TourFilters';

// The search and filter box on Explore Tours is hidden for now.
const SHOW_FILTERS = false;
import { applyTripFilters, useTripFilters } from './tripFilters';
import EmptyState from './ui/EmptyState';
import { SearchX, CalendarClock as CalendarClockIcon } from 'lucide-react';
import { Search, MapPin, Users, Calendar, ChevronDown, Eye, ImageIcon, Check } from 'lucide-react';
import { SkeletonTourCards } from './ui/Skeleton';
import ItineraryTimeline from './ui/ItineraryTimeline';
import { ViewSection, ChecklistGrid, TourImageCarousel } from './TourDetailParts';
import { DetailedTourModal } from './TourBookingWindow';
import FavoriteStar from './ui/FavoriteStar';

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



      {/* ── Filters (hidden for now; set SHOW_FILTERS to true to bring them back) ── */}

      <div style={{

        background: '#FDF6EE',

        borderRadius: 20, padding: '14px 18px',

        border: '1px solid rgba(180,81,30,0.12)',

        boxShadow: '0 4px 16px rgba(26,10,0,0.05)',

        display: SHOW_FILTERS ? 'flex' : 'none', flexWrap: 'wrap', gap: 12, alignItems: 'center',

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

 

const JoinerTourCard = ({ tour, onDetails, formatDateRange, showFavorite = true }) => {

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

        // Grows a little when the mouse is over it.
        transform: hovered ? 'translateY(-5px) scale(1.07)' : 'none',
        position: 'relative', zIndex: hovered ? 2 : 'auto',
        transition: 'transform 0.25s, box-shadow 0.25s',

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

        {/* Favorite: save this tour to book later (the star beside the bell lists them). */}

        {showFavorite && <FavoriteStar trip={tour} style={{ position: 'absolute', bottom: 12, right: 12 }} />}

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

            <PriceTag tour={tour} size={15} style={{ marginLeft: 10, flexShrink: 0 }} />

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

 

export { JoinerTourCard, ViewSection, ChecklistGrid, ItineraryTimeline, TourImageCarousel, DetailedTourModal };

export default JoinerTours;