import { CalendarDays, Wallet, Star, Compass, Mountain, MapPin, Clock, CheckCircle2, Circle, ChevronRight, Map as MapIcon, Search, CreditCard, Backpack } from 'lucide-react';
import { formatPeso } from './tourUtils';

// ─────────────────────────────────────────────
// Joiner home page pieces: the greeting bar, the next-trip card (countdown,
// meeting time and a ready-check in one), the first-timer welcome and the
// "tours to review" nudge. JoinerDashboard loads the data and passes it in.
// ─────────────────────────────────────────────

const manilaHour = () => Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false })) % 24;
const daysUntil = (ymd) => {
  if (!ymd) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((new Date(`${ymd}T00:00:00`) - today) / 86400000));
};
// What a booking still owes (downpayment bookings whose balance isn't settled).
const balanceOf = (b) => (b && b.payment_method === 'Downpayment' && !b.balance_settled
  ? Math.max(0, (Number(b.total_price) || 0) - (Number(b.amount_paid) || 0)) : 0);

// "Good morning, Mia!" + today's date + chips for what's coming up (each a
// shortcut), on a photo of the next trip (else the latest tour, else the
// beach) fading into navy, with a passport-stamp countdown and a dashed
// travel route.
export const JoinerGreeting = ({ name, loading, upcoming, completed, nextTrip, toReview, photo, onOpen }) => {
  const h = manilaHour();
  const hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const first = String(name || '').trim().split(/\s+/)[0];
  const days = daysUntil(nextTrip?.tours?.start_date);
  const owe = balanceOf(nextTrip);
  const bg = nextTrip?.tours?.image_urls?.[0] || photo || '/hero-elnido.webp';
  const chips = [];
  if (nextTrip?.tours) chips.push([CalendarDays, days === 0 ? `${nextTrip.tours.title} is today!` : `${nextTrip.tours.title} in ${days} day${days === 1 ? '' : 's'}`, 'trip', true]);
  if (owe > 0) chips.push([Wallet, `${formatPeso(owe)} balance due`, 'pay', true]);
  if (toReview > 0) chips.push([Star, `${toReview} tour${toReview === 1 ? '' : 's'} to review`, 'review', true]);
  chips.push([Compass, `${upcoming} upcoming trip${upcoming === 1 ? '' : 's'}`, 'upcoming', false]);
  chips.push([Mountain, `${completed} completed`, 'completed', false]);
  return (
    <div className="joiner-greeting" style={{ position: 'relative', overflow: 'hidden', background: 'var(--ib-ink, #1A0A00)', borderRadius: 22, boxShadow: '0 10px 28px rgba(var(--ib-shadow-rgb, 26,10,0), 0.18)' }}>
      {/* The photo on the right, fading into navy on the left */}
      <img src={bg} alt="" aria-hidden="true" decoding="async" className="joiner-greeting-photo" />
      <span aria-hidden="true" className="joiner-greeting-shade" />
      {/* A dashed travel route with pins, across the bottom */}
      <svg aria-hidden="true" className="joiner-greeting-route" viewBox="0 0 600 80" preserveAspectRatio="none">
        <path d="M10 62 C 120 20, 200 78, 300 44 S 470 18, 590 40" fill="none" stroke="#FFB547" strokeWidth="2.5" strokeDasharray="7 8" strokeLinecap="round" opacity="0.55" />
      </svg>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: '1.4rem 1.6rem 1.6rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, flex: '1 1 320px' }}>
          <div className="joiner-greeting-text">
            <p className="journal-hand" style={{ margin: 0, fontSize: 34, lineHeight: 1.05, color: 'var(--ib-amber, #E8A265)', transform: 'rotate(-1.5deg)', transformOrigin: 'left' }}>{hello}{first && first !== 'Joiner' ? `, ${first}` : ''}!</p>
            <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 700, color: 'rgba(var(--ib-soft-rgb, 232,210,190), 0.92)' }}>
              {new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              {' · '}{nextTrip?.tours ? 'Your next adventure is coming up.' : 'Where to next?'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {chips.map(([icon, text, key, busy]) => {
              const Icon = icon;
              return (
                <button key={key} type="button" onClick={() => onOpen(key)} disabled={loading} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800,
                  background: busy ? 'var(--ib-amber, #E8A265)' : 'rgba(11,59,79,0.55)', color: busy ? 'var(--ib-ink, #1A0A00)' : '#FFF8EE',
                  border: busy ? 'none' : '1px solid rgba(255,255,255,0.22)', opacity: loading ? 0.6 : 1, maxWidth: '100%',
                  WebkitBackdropFilter: busy ? 'none' : 'blur(6px)', backdropFilter: busy ? 'none' : 'blur(6px)',
                }}>
                  <Icon size={14} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loading ? '…' : text}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* A passport stamp: the days to the next trip (or an invitation) */}
        {!loading && (
          <button type="button" onClick={() => onOpen(nextTrip?.tours ? 'trip' : 'explore')} className="joiner-stamp" aria-label={nextTrip?.tours ? `${days} days to ${nextTrip.tours.title}` : 'Explore tours'}>
            {nextTrip?.tours ? (
              <>
                <span style={{ fontSize: 40, fontWeight: 900, lineHeight: 0.95 }}>{days}</span>
                <span className="journal-hand" style={{ fontSize: 17, lineHeight: 1 }}>{days === 1 ? 'day to go' : days === 0 ? 'today!' : 'days to go'}</span>
              </>
            ) : (
              <>
                <Compass size={26} />
                <span className="journal-hand" style={{ fontSize: 17, lineHeight: 1.05 }}>find your<br />next trip</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

// The next trip in one card: photo, countdown, where, the first pickup and a
// ready-check (booking confirmed, paid, pickup point, packing list).
export const NextTripPanel = ({ trip, stop, onOpen }) => {
  const tour = trip?.tours;
  if (!tour) return null;
  const days = daysUntil(tour.start_date);
  const confirmed = trip.payment_status === 'Complete' || trip.booking_status === 'Completed';
  const owe = balanceOf(trip);
  const checks = [
    [CheckCircle2, 'Booking confirmed', confirmed, confirmed ? 'Your seat is saved' : 'Waiting for payment check'],
    [CreditCard, 'Fully paid', confirmed && owe <= 0, owe > 0 ? `${formatPeso(owe)} left to pay` : confirmed ? 'Nothing left to pay' : 'After your payment is checked'],
    [MapPin, 'Pickup point', !!trip.pickup_point, trip.pickup_point || 'Choose it in My Bookings'],
    [Backpack, 'Things to bring', !!tour.things_to_bring, tour.things_to_bring ? 'Packing list ready in My Bookings' : 'Posted closer to the trip'],
  ];
  return (
    <button type="button" onClick={onOpen} className="next-trip-panel" style={{
      display: 'grid', width: '100%', textAlign: 'left', padding: 0, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 22, overflow: 'hidden',
      background: 'var(--ib-cream, #FDF6EE)', border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.14)', boxShadow: '0 6px 22px rgba(var(--ib-shadow-rgb, 26,10,0), 0.08)',
    }}>
      <span style={{ position: 'relative', minHeight: 200, display: 'block', background: 'var(--ib-ink, #1A0A00)' }}>
        {tour.image_urls?.[0] && <img src={tour.image_urls[0]} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(var(--ib-ink-rgb, 26,10,0), 0.92) 0%, rgba(var(--ib-ink-rgb, 26,10,0), 0.25) 65%)' }} />
        <span style={{ position: 'absolute', left: 18, right: 18, bottom: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ alignSelf: 'flex-start', background: 'var(--ib-accent, #B4511E)', color: 'var(--ib-on-accent, #FDF6EE)', fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', borderRadius: 999, padding: '4px 11px', marginBottom: 6 }}>Next Trip</span>
          <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--ib-on-ink, #FDF6EE)', letterSpacing: '-0.03em', lineHeight: 1.05 }}>{days === 0 ? 'Today!' : `${days} day${days === 1 ? '' : 's'} to go`}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ib-amber, #E8A265)' }}>{tour.title}</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(var(--ib-on-ink-rgb, 253,246,238), 0.88)', display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={13} /> {tour.destination}</span>
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '1.1rem 1.25rem' }}>
        {stop?.location_name && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--ib-dark, #1A0A00)', background: 'rgba(var(--ib-amber-rgb, 232,162,101), 0.18)', borderRadius: 12, padding: '9px 12px' }}>
            <Clock size={15} style={{ color: 'var(--ib-sienna, #A8481A)', flexShrink: 0 }} />
            <span>Meet {stop.scheduled_time ? `at ${stop.scheduled_time}` : ''} · {stop.location_name}</span>
          </span>
        )}
        <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ib-rust, #7A3A18)' }}>Ready check</span>
        {checks.map(([icon, label, ok, note]) => {
          const Icon = ok ? icon : Circle;
          return (
            <span key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <Icon size={17} style={{ color: ok ? 'var(--ib-green, #1B5E3B)' : 'rgba(var(--ib-rust-rgb, 122,58,24), 0.7)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--ib-dark, #1A0A00)' }}>{label}</span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: ok ? 'var(--ib-rust, #7A3A18)' : 'var(--ib-red, #8C2F1C)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note}</span>
              </span>
            </span>
          );
        })}
        <span className="text-link" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5, fontWeight: 800, marginTop: 2 }}>Open in My Bookings <ChevronRight size={14} /></span>
      </span>
    </button>
  );
};

// First-time joiners (no bookings yet): how a joiner tour works, in 3 steps.
export const FirstTimeWelcome = ({ onExplore, onPrivate }) => (
  <section aria-label="Welcome" style={{ background: 'var(--ib-cream, #FDF6EE)', borderRadius: 22, padding: '1.4rem 1.5rem', border: '1px dashed rgba(var(--ib-accent-rgb, 180,81,30), 0.35)', display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div>
      <p className="journal-hand" style={{ margin: 0, fontSize: 25, color: 'var(--ib-sienna, #A8481A)', transform: 'rotate(-1.5deg)', transformOrigin: 'left' }}>Welcome aboard!</p>
      <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>Here's how a joiner tour works</p>
    </div>
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
      {[[Search, 'Pick a tour', 'Choose a date with open slots and see the price, itinerary and inclusions.'],
        [CreditCard, 'Book & pay', 'Pay in full or a downpayment with GCash or card. Your seat is saved once it’s checked.'],
        [Backpack, 'Get ready', 'Choose your pickup point, pack the list, and track the van on the day.']].map(([icon, title, text], i) => {
        const Icon = icon;
        return (
          <li key={title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ib-accent, #B4511E)', color: 'var(--ib-on-accent, #FDF6EE)', fontWeight: 900, fontSize: 14 }}>{i + 1}</span>
            <span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}><Icon size={14} style={{ color: 'var(--ib-sienna, #A8481A)' }} /> {title}</span>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ib-rust, #7A3A18)', lineHeight: 1.5, marginTop: 2 }}>{text}</span>
            </span>
          </li>
        );
      })}
    </ol>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <button type="button" onClick={onExplore} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 42, padding: '0 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 13, background: 'var(--ib-primary-btn, #B4511E)', color: 'var(--ib-primary-btn-text, #FDF6EE)' }}><Compass size={15} /> Explore Tours</button>
      <button type="button" onClick={onPrivate} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 42, padding: '0 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 13, background: 'var(--ib-surface, #FFFDF9)', color: 'var(--ib-brown, #5C2A10)', border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.3)' }}><MapIcon size={15} /> Plan a Private Tour</button>
    </div>
  </section>
);

// "2 tours to review": near the top, right after the trip.
export const ReviewNudge = ({ count, onOpen }) => (
  <button type="button" onClick={onOpen} className="clickable-card" style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
    background: 'var(--ib-cream, #FDF6EE)', border: '1px solid rgba(var(--ib-amber-rgb, 232,162,101), 0.6)', borderRadius: 18, padding: '0.9rem 1.15rem', fontFamily: 'inherit',
  }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ib-ink, #1A0A00)', color: 'var(--ib-amber, #E8A265)' }}><Star size={17} fill="currentColor" /></span>
      <span>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{count} tour{count === 1 ? '' : 's'} to review</span>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ib-rust, #7A3A18)' }}>Tell other joiners how it went. It takes a minute.</span>
      </span>
    </span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5, fontWeight: 900, color: 'var(--ib-sienna, #A8481A)', flexShrink: 0 }}>Write a review <ChevronRight size={14} /></span>
  </button>
);
