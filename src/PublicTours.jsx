import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Search, MapPin, Calendar, Clock, Users, Loader2, CheckCircle2, X,
  AlertCircle, Share2, Check, ArrowLeft, Mountain,
} from 'lucide-react';
import { supabase } from './supabaseClient';
import {
  JoinerTourCard, ViewSection, ChecklistGrid, ItineraryTimeline, TourImageCarousel,
} from './JoinerTours';
import { withAvailableSlots, formatDateRange, todayManila, DEFAULT_GROUP_SIZE, formatPeso, groupTripDates, tripForDate } from './tourUtils';
import { TripDatePicker } from './ui/TripDates';
import { MoreTourFilters } from './ui/TourFilters';
import { applyTripFilters, useTripFilters } from './tripFilters';
import logoIcon from './assets/newIcon.png';
import EmptyState from './ui/EmptyState';
import { SearchX, CalendarClock } from 'lucide-react';
import { SkeletonTourCards, SkeletonRegion, Skel } from './ui/Skeleton';

// ─────────────────────────────────────────────
// PUBLIC TOUR PAGES (no login needed)
//   /tours      — every open tour, with search and filters
//   /tours/:id  — one tour, with its own shareable link
// Booking still needs an account: "Book" sends logged-out visitors to
// login/register first, then straight into that tour's booking window
// on the dashboard (/dashboard?book=<id>).
// Uses <div> rather than <main>: App.css styles <main> as the dashboard's
// fixed-height scroll area.
// ─────────────────────────────────────────────

const SITE_TITLE = 'Bandang IBAYO — Joiner Tours';

const useSession = () => {
  const [session, setSession] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  return session;
};

const bookPathFor = (tourId, session) => {
  const dashboardPath = `/dashboard?book=${encodeURIComponent(tourId)}`;
  return session ? dashboardPath : `/login?next=${encodeURIComponent(dashboardPath)}`;
};

const PublicNav = ({ session }) => {
  const { pathname } = useLocation();
  const onTourList = pathname === '/tours';
  return (
  <nav className="site-nav" style={{
    position: 'sticky', top: 0, zIndex: 50,
    background: 'rgba(253,246,238,0.92)', backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(180,81,30,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 clamp(1rem,5vw,4rem)', height: 64, gap: 12,
  }}>
    <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textDecoration: 'none' }}>
      <img src={logoIcon} alt="BANDANG IBAYO" style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0 }} />
      <span className="public-nav-brand font-display" style={{ fontWeight: 900, fontSize: 17, letterSpacing: '-0.03em', color: '#1A0A00', whiteSpace: 'nowrap' }}>
        Bandang <span className="font-accent" style={{ color: '#A8481A' }}>IBAYO</span>
      </span>
    </Link>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
      {/* Already on the list: go back to the top instead of doing nothing. */}
      <Link
        to="/tours"
        aria-current={onTourList ? 'page' : undefined}
        onClick={() => { if (onTourList) window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        style={{
          fontSize: 13, fontWeight: onTourList ? 900 : 700, color: onTourList ? '#A8481A' : '#7A3A18', textDecoration: 'none',
          borderBottom: onTourList ? '2px solid #B4511E' : '2px solid transparent', paddingBottom: 2,
        }}
      >
        Tours
      </Link>
      {!session && (
        <>
          <Link to="/login" style={{ fontSize: 13, fontWeight: 700, color: '#7A3A18', textDecoration: 'none' }}>Log in</Link>
          <Link to="/register" style={navCta}>Join Now</Link>
        </>
      )}
    </div>
  </nav>
  );
};

const navCta = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, fontWeight: 900, color: '#FDF6EE', textDecoration: 'none',
  background: '#B4511E', borderRadius: 10, padding: '9px 16px',
  letterSpacing: '0.04em', whiteSpace: 'nowrap',
};

const pageStyle = {
  background: '#FDF6EE', minHeight: '100dvh',
  fontFamily: "'Outfit', 'Inter', system-ui, sans-serif", color: '#1A0A00', overflowX: 'hidden',
};

const CenteredMessage = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '6rem 1rem', textAlign: 'center' }}>
    {children}
  </div>
);

const fetchOpenTours = () => supabase
  .from('tours')
  .select('*')
  .eq('is_archived', false)
  .gte('start_date', todayManila())
  .order('start_date', { ascending: true });

/* ─────────────────────────────────────────────
   /tours
───────────────────────────────────────────── */
export const PublicTourList = () => {
  const session = useSession();
  const navigate = useNavigate();
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('All Difficulty');
  const [priceSort, setPriceSort] = useState('default');

  useEffect(() => {
    document.title = `Tours | ${SITE_TITLE}`;
    const load = async () => {
      const { data, error } = await fetchOpenTours();
      if (error) console.error('Error fetching tours:', error.message);
      setTours(groupTripDates(await withAvailableSlots(data)));
      setLoading(false);
    };
    load();
    return () => { document.title = SITE_TITLE; };
  }, []);

  // Month, price range and trip length (ui/TourFilters.jsx).
  const { filters: tripFilters, setFilter: setTripFilter, clearFilters: clearTripFilters, active: tripFiltersActive } = useTripFilters();
  const clearAllFilters = () => { setSearchQuery(''); setDifficultyFilter('All Difficulty'); clearTripFilters(); };

  const q = searchQuery.trim().toLowerCase();
  const filteredTours = applyTripFilters(tours, tripFilters).filter((t) => {
    const matchesSearch = !q || t.title?.toLowerCase().includes(q) || t.destination?.toLowerCase().includes(q);
    const matchesDifficulty = difficultyFilter === 'All Difficulty' || t.difficulty === difficultyFilter;
    return matchesSearch && matchesDifficulty;
  }).sort((a, b) => {
    if (priceSort === 'highToLow') return b.price - a.price;
    if (priceSort === 'lowToHigh') return a.price - b.price;
    return 0;
  });

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', background: '#F2E4D0',
    border: '1px solid rgba(180,81,30,0.18)', borderRadius: 14,
    padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#1A0A00',
    fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div style={pageStyle}>
      <PublicNav session={session} />
      <div className="public-main" style={{ maxWidth: 1280, margin: '0 auto', padding: 'clamp(2rem,5vw,4rem) clamp(1rem,5vw,4rem)' }}>
        {/* Back to the top of the landing page */}
        <Link
          className="text-link"
          to="/"
          onClick={() => setTimeout(() => window.scrollTo({ top: 0 }), 0)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#7A3A18', textDecoration: 'none', marginBottom: 18 }}
        >
          <ArrowLeft size={15} /> Back
        </Link>
        <div />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#A8481A' }}>Open for booking</span>
        <h1 style={{ fontWeight: 900, fontSize: 'clamp(2rem,4vw,3rem)', letterSpacing: '-0.03em', margin: '8px 0 6px' }}>Upcoming Tours</h1>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '0 0 28px' }}>
          Browse every joiner tour. Create a free account when you're ready to book.
        </p>

        <div className="public-tour-filters" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#A8481A' }} />
            <input
              type="search"
              aria-label="Search tours"
              placeholder="Search by tour or destination…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 40 }}
            />
          </div>
          <select aria-label="Difficulty" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} style={inputStyle}>
            <option value="All Difficulty">All Difficulty</option>
            <option value="Easy">Easy</option>
            <option value="Moderate">Moderate</option>
            <option value="Challenging">Challenging</option>
          </select>
          <select aria-label="Sort by price" value={priceSort} onChange={(e) => setPriceSort(e.target.value)} style={inputStyle}>
            <option value="default">Sort by Date</option>
            <option value="lowToHigh">Price: Low to High</option>
            <option value="highToLow">Price: High to Low</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <MoreTourFilters trips={tours} filters={tripFilters} setFilter={setTripFilter} inputStyle={inputStyle} />
          {(tripFiltersActive || q || difficultyFilter !== 'All Difficulty') && (
            <button type="button" className="text-link" onClick={clearAllFilters} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, padding: '0 4px' }}>
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <SkeletonTourCards count={6} />
        ) : filteredTours.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 20 }}>
            {filteredTours.map((tour) => (
              <JoinerTourCard
                key={tour.id}
                tour={tour}
                formatDateRange={formatDateRange}
                onDetails={() => navigate(`/tours/${tour.id}`)}
              />
            ))}
          </div>
        ) : (
          tours.length ? (
            <EmptyState
              icon={SearchX}
              title="No tours match your search"
              message="Try another month, price or destination, or clear the filters to see every open tour."
              action={{ label: 'Clear Filters', onClick: clearAllFilters }}
            />
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="No open tours right now"
              message="New dates are posted regularly. Create a free account to get notified about new tours."
              action={{ label: 'Create a Free Account', onClick: () => navigate('/register') }}
            />
          )
        )}
      </div>
      <style>{publicCss}</style>
    </div>
  );
};

/* ─────────────────────────────────────────────
   /tours/:id
───────────────────────────────────────────── */
export const PublicTourDetail = () => {
  const { id } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const [tour, setTour] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'missing'
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.from('tours').select('*').eq('id', id).maybeSingle();
      if (!active) return;
      if (error || !data || data.is_archived) {
        setStatus('missing');
        document.title = `Tour not found | ${SITE_TITLE}`;
        return;
      }
      // The trip's other open dates, so the visitor can pick one here.
      const { data: open } = await fetchOpenTours();
      const withSlots = await withAvailableSlots([data, ...(open || []).filter((t) => t.id !== data.id)]);
      if (!active) return;
      setTour(tripForDate(groupTripDates(withSlots), data.id));
      setStatus('ready');
      document.title = `${data.title} — ${data.destination} | ${SITE_TITLE}`;
    };
    load();
    return () => { active = false; document.title = SITE_TITLE; };
  }, [id]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: tour.title, text: `${tour.title} — ${tour.destination}`, url }); }
      catch { /* user closed the share sheet */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  if (status !== 'ready') {
    return (
      <div style={pageStyle}>
        <PublicNav session={session} />
        {status === 'loading' ? (
          <SkeletonRegion label="Loading tour" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(1.25rem,4vw,3rem) clamp(1rem,5vw,4rem) 4rem' }}>
            <Skel w={90} h={12} style={{ marginBottom: 22 }} />
            <div className="public-tour-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 32, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Skel w={80} h={10} /><Skel w="65%" h={36} r={10} /><Skel w="30%" h={13} />
                <Skel h={300} r={18} style={{ marginTop: 12 }} />
                <Skel w="25%" h={10} style={{ marginTop: 12 }} /><Skel w="95%" h={12} /><Skel w="85%" h={12} /><Skel w="60%" h={12} />
              </div>
              <div style={{ background: '#1A0A00', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Skel dark w="40%" h={10} /><Skel dark w="60%" h={30} /><Skel dark w="85%" h={10} />
                <Skel dark h={44} r={12} /><Skel dark h={44} r={12} />
                <Skel dark w="70%" h={12} /><Skel dark w="55%" h={12} />
                <Skel dark h={48} r={14} />
              </div>
            </div>
          </SkeletonRegion>
        ) : (
        <CenteredMessage>
          {(
            <>
              <Mountain size={40} style={{ color: '#A8481A' }} />
              <h1 style={{ fontWeight: 900, fontSize: 24, margin: 0 }}>This tour isn't available</h1>
              <p style={{ fontWeight: 600, color: '#7A3A18', margin: 0 }}>It may have been removed or the link is wrong.</p>
              <Link to="/tours" style={{ ...navCta, padding: '12px 22px' }}>See open tours</Link>
            </>
          )}
        </CenteredMessage>
        )}
        <style>{publicCss}</style>
      </div>
    );
  }

  const capacity = tour.group_size || DEFAULT_GROUP_SIZE;
  const hasDeparted = tour.start_date < todayManila();
  const isFull = tour.available_slots <= 0;
  // Full tours still open the booking window, where joiners can join the waitlist.
  const canBook = !hasDeparted;
  const filledPct = Math.min(100, (tour.current_booked / capacity) * 100);

  const facts = [
    [<Calendar size={15} key="c" />, formatDateRange(tour.start_date, tour.duration)],
    [<Clock size={15} key="d" />, tour.duration],
    [<MapPin size={15} key="m" />, tour.destination],
    [<Users size={15} key="u" />, `Up to ${capacity} joiners`],
  ].filter(([, text]) => text);

  return (
    <div className="public-tour-page" style={pageStyle}>
      <PublicNav session={session} />
      <div className="public-main" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(1.25rem,4vw,3rem) clamp(1rem,5vw,4rem) 4rem' }}>
        <Link className="text-link" to="/tours" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#7A3A18', textDecoration: 'none', marginBottom: 18 }}>
          <ArrowLeft size={15} /> All tours
        </Link>

        <div className="public-tour-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 32, alignItems: 'start' }}>
          {/* ── Left: photos and details ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>
            <div>
              {tour.difficulty && (
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8481A' }}>{tour.difficulty}</span>
              )}
              <h1 style={{ fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.8rem)', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '6px 0 8px', overflowWrap: 'anywhere' }}>{tour.title}</h1>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: '#A8481A', margin: 0 }}>
                <MapPin size={16} /> {tour.destination}
              </p>
            </div>

            <TourImageCarousel images={tour.image_urls || []} />

            <ViewSection title="About the Tour">
              <p style={{ fontSize: 15, lineHeight: 1.8, fontWeight: 500, color: '#7A3A18', whiteSpace: 'pre-wrap', margin: 0 }}>
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
              <div style={{ background: 'rgba(180,81,30,0.07)', borderRadius: 18, padding: '1.25rem', border: '1px solid rgba(180,81,30,0.2)', display: 'flex', gap: 14 }}>
                <AlertCircle size={22} style={{ color: '#A8481A', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 8px' }}>Important Note</p>
                  <p style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.7, color: '#1A0A00', whiteSpace: 'pre-wrap', margin: 0, overflowWrap: 'anywhere' }}>{tour.important_note}</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: price and booking ── */}
          <aside className="public-tour-aside" style={{
            position: 'sticky', top: 88, background: '#1A0A00', color: '#FDF6EE',
            borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 18,
            boxShadow: '0 16px 40px rgba(26,10,0,0.18)',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(232,210,190,0.85)' }}>Price per joiner</div>
              <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em' }}>{formatPeso(Number(tour.price || 0))}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(232,210,190,0.85)' }}>Pay in full or 40% downpayment online (GCash, Maya, card)</div>
            </div>

            {tour.dates.length > 1 && (
              <TripDatePicker
                dark
                dates={tour.dates}
                activeId={tour.id}
                onPick={(dateId) => { setTour(tripForDate([tour], dateId)); navigate(`/tours/${dateId}`, { replace: true }); }}
              />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {facts.map(([icon, text], i) => (
                <p key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, margin: 0, color: 'rgba(253,246,238,0.9)' }}>
                  <span style={{ color: '#E8A265', display: 'flex' }}>{icon}</span>{text}
                </p>
              ))}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
                <span style={{ color: isFull ? '#E8A265' : '#FDF6EE' }}>
                  {isFull ? 'Fully booked' : `${tour.available_slots} slot${tour.available_slots === 1 ? '' : 's'} left`}
                </span>
                <span style={{ color: 'rgba(232,210,190,0.85)' }}>{tour.current_booked} / {capacity}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(253,246,238,0.12)', overflow: 'hidden' }}>
                <div style={{ width: `${filledPct}%`, height: '100%', background: isFull ? '#8C2F1C' : '#B4511E' }} />
              </div>
            </div>

            <button
              type="button"
              disabled={!canBook}
              onClick={() => navigate(bookPathFor(tour.id, session))}
              style={{
                border: 'none', borderRadius: 14, padding: '15px 18px', fontFamily: 'inherit',
                fontSize: 14, fontWeight: 900, letterSpacing: '0.04em',
                cursor: canBook ? 'pointer' : 'not-allowed',
                background: canBook ? '#B4511E' : 'rgba(253,246,238,0.12)',
                color: canBook ? '#FDF6EE' : 'rgba(253,246,238,0.85)',
              }}
            >
              {hasDeparted ? 'This tour has departed' : isFull ? (session ? 'Join the waitlist' : 'Log in to join the waitlist') : session ? 'Book this tour' : 'Log in to book'}
            </button>
            {canBook && !session && (
              <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(232,210,190,0.85)', margin: '-8px 0 0', textAlign: 'center' }}>
                New here? <Link className="text-link" to={`/register?next=${encodeURIComponent(`/dashboard?book=${tour.id}`)}`} style={{ color: '#E8A265', fontWeight: 800 }}>Create a free account</Link>
              </p>
            )}

            <button
              type="button"
              onClick={handleShare}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                border: '1.5px solid rgba(232,210,190,0.25)', background: 'transparent', color: '#FDF6EE',
                borderRadius: 14, padding: '12px 18px', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {copied ? <><Check size={15} /> Link copied</> : <><Share2 size={15} /> Share this tour</>}
            </button>
          </aside>
        </div>
      </div>

      {/* Phones: the booking card sits below the itinerary, so keep Book reachable. */}
      <div className="public-tour-mobilebar" style={{
        display: 'none', position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
        background: '#1A0A00', color: '#FDF6EE', padding: '12px 16px',
        alignItems: 'center', justifyContent: 'space-between', gap: 12,
        boxShadow: '0 -8px 24px rgba(26,10,0,0.2)',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{formatPeso(Number(tour.price || 0))}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(232,210,190,0.85)' }}>
            {isFull ? 'Fully booked' : `${tour.available_slots} slot${tour.available_slots === 1 ? '' : 's'} left`}
          </div>
        </div>
        <button
          type="button"
          disabled={!canBook}
          onClick={() => navigate(bookPathFor(tour.id, session))}
          style={{
            border: 'none', borderRadius: 12, padding: '12px 18px', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 900, flexShrink: 0,
            cursor: canBook ? 'pointer' : 'not-allowed',
            background: canBook ? '#B4511E' : 'rgba(253,246,238,0.12)',
            color: canBook ? '#FDF6EE' : 'rgba(253,246,238,0.85)',
          }}
        >
          {hasDeparted ? 'Departed' : isFull ? 'Join waitlist' : session ? 'Book now' : 'Log in to book'}
        </button>
      </div>
      <style>{publicCss}</style>
    </div>
  );
};

const publicCss = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 900px) {
    .public-tour-layout { grid-template-columns: minmax(0, 1fr) !important; }
    .public-tour-aside { position: static !important; }
    .public-tour-mobilebar { display: flex !important; }
    .public-tour-page .public-main { padding-bottom: 96px !important; }
    .public-tour-filters { grid-template-columns: 1fr 1fr !important; }
    .public-tour-filters > :first-child { grid-column: 1 / -1; }
  }
  @media (max-width: 480px) {
    .public-nav-brand { display: none; }
  }
`;
