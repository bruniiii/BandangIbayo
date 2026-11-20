import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook } from 'react-icons/fa';
import {
  MapPin, Calendar, Users, Clock, CheckCircle, ShieldCheck, Smartphone, Map as MapIcon, CreditCard, Globe, Mail, Phone, ArrowRight, Search, Sparkles, X,
} from 'lucide-react';
import { supabase } from './supabaseClient';
import logoIcon from './assets/logo.png';
import HelpWidget from './ui/HelpWidget';
import { todayManila, groupTripDates, weekdayRange, formatPeso } from './tourUtils';
import { ReviewCard } from './ui/ReviewCards';
import PriceTag from './ui/PriceTag';
import { usePublicReviews } from './publicReviews';
import { reportError } from './ui/toast';
import { AGENCY } from './agencyInfo';
import AnnouncementBanner from './ui/AnnouncementBanner';
import { SITE } from './siteContent';

// ─────────────────────────────────────────────
// LANDING PAGE LOOKS (preview): four new designs for the landing page, opened
// with /?look=tropical | magazine | dark | fiesta. The live page stays
// LandingPremium until one is picked. Same tours, search, text and links as
// now; what changes is the look:
//  • a photo always at the top (Site Content photos, else the open tours'
//    photos, else the agency's forest photo);
//  • bigger text, less empty space; reviews right after the tours;
//  • each section laid out differently (photo cards, a numbered path, a
//    photo beside the reasons, a strip of trip photos).
// Styles: LOOK_CSS below, scoped under .lk and .lk-<look>.
// ─────────────────────────────────────────────

// Fonts each look adds (Outfit is already on every page).
const FONTS = {
  magazine: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap',
  fiesta: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&display=swap',
};
// The price colors (PriceTag takes them as props).
const PRICE = {
  tropical: ['#0B3B4F', 'rgba(11,59,79,0.6)'],
  magazine: ['#1E1B16', 'rgba(30,27,22,0.55)'],
  dark: ['#F5F1EC', 'rgba(245,241,236,0.6)'],
  light: ['#2A1A10', 'rgba(42,26,16,0.6)'],
  fiesta: ['#1D1340', 'rgba(29,19,64,0.6)'],
};
const FALLBACK_PHOTO = '/tour-placeholder.webp';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const shortDay = (d) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)} ${Number(d.slice(8, 10))}` : '');
const formatDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${month}-${day}-${year}`;
};
const datesOf = (t) => (t.dates?.length ? t.dates : [t]);
const lessMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const TOUR_TYPES = [
  { icon: Users, title: 'Joiner Tour', desc: 'Share a van and accommodation with other travelers. Perfect for solo adventurers on a budget.', tag: 'Most Popular' },
  { icon: MapIcon, title: 'Private Tour', desc: 'Book the entire vehicle for your group. Keep your itinerary private and travel at your own pace.', tag: 'For Groups' },
  { icon: Globe, title: 'Request a Tour', desc: 'Have a destination in mind that isn\'t listed? Submit a custom request and we\'ll price it for you.', tag: 'Custom' },
];
const STEPS = [
  { icon: MapIcon, num: '01', title: 'Browse a Tour', desc: 'See prices, itineraries, remaining seats, and verified agency info before committing.' },
  { icon: CreditCard, num: '02', title: 'Book & Pay via GCash', desc: 'Secure your slot instantly. Your seat is confirmed the moment payment clears.' },
  { icon: CheckCircle, num: '03', title: 'Get Confirmation', desc: 'Receive a digital receipt right away and an email reminder 24 hours before departure.' },
];
const REASONS = [
  { icon: ShieldCheck, title: 'Verified Safety', text: 'Driver names, plate numbers, and medical disclaimers shown for every trip.' },
  { icon: Clock, title: 'ETA Tracking', text: 'Know exactly when your vehicle is arriving at the pickup point.' },
  { icon: Calendar, title: 'Live Availability', text: 'Open dates, remaining seats, and full pricing — updated in real time.' },
  { icon: Smartphone, title: 'No More Facebook Chaos', text: 'Confirm your booking instantly without waiting on DMs or comment threads.' },
];

const LandingLooks = ({ look = 'tropical' }) => {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [booked, setBooked] = useState(null); // { [tour date id]: slots taken }
  const [tripPhotos, setTripPhotos] = useState([]); // photos from tours, past ones too
  const [scrolled, setScrolled] = useState(false);
  const [slide, setSlide] = useState(0);
  const [form, setForm] = useState({ where: '', when: '', who: '' });
  const [applied, setApplied] = useState({ where: '', when: '', who: '' });
  const listRef = useRef(null);

  useEffect(() => {
    const href = FONTS[look];
    if (!href || document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }, [look]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from('tours').select('*').eq('is_archived', false).gte('start_date', todayManila()).order('start_date', { ascending: true });
      if (error) reportError("Couldn't load tours", error.message);
      else setTours(groupTripDates((data || []).filter((t) => !t.is_exclusive), { openFirst: false }));
      setLoading(false);
    })();
    supabase.rpc('tour_slots_booked').then(({ data }) => {
      if (data) setBooked(Object.fromEntries(data.map((r) => [r.tour_id, Number(r.slots_booked) || 0])));
    });
    // The photo strip: photos from the tours (newest first), one per trip.
    supabase.from('tours').select('title, destination, image_urls, is_exclusive').order('start_date', { ascending: false }).limit(40).then(({ data }) => {
      const seen = new Set();
      setTripPhotos((data || []).filter((t) => !t.is_exclusive && t.image_urls?.[0] && !seen.has(t.image_urls[0]) && seen.add(t.image_urls[0]))
        .slice(0, 10).map((t) => ({ src: t.image_urls[0], label: t.destination || t.title })));
    });
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const featured = useMemo(() => tours.filter((t) => t.image_urls?.[0]).slice(0, 5), [tours]);
  const landing = SITE.landing || {};
  const customPhotos = Array.isArray(landing.hero_images) ? landing.hero_images.filter(Boolean) : [];
  // Always a photo: Site Content photos, else the open tours', else the agency's.
  const heroPhotos = customPhotos.length ? customPhotos : featured.length ? featured.map((t) => t.image_urls[0]) : [FALLBACK_PHOTO];
  const slideCount = heroPhotos.length;
  useEffect(() => {
    if (slideCount < 2 || lessMotion()) return undefined;
    const t = setInterval(() => setSlide((i) => (i + 1) % slideCount), 7000);
    return () => clearInterval(t);
  }, [slideCount]);
  const hero = !customPhotos.length && featured.length ? featured[slide % featured.length] : null;

  const slotsLeft = (d) => (booked ? Math.max(0, (Number(d.group_size) || 0) - (booked[d.id] || 0)) : null);
  const places = useMemo(() => [...new Set(tours.map((t) => String(t.destination || '').trim()).filter(Boolean))].sort(), [tours]);
  const months = useMemo(() => [...new Set(tours.flatMap((t) => datesOf(t).map((d) => String(d.start_date).slice(0, 7))))].sort(), [tours]);
  const shown = tours.filter((t) => {
    if (applied.where && String(t.destination || '').trim() !== applied.where) return false;
    const dates = datesOf(t).filter((d) => !applied.when || String(d.start_date).startsWith(applied.when));
    if (!dates.length) return false;
    if (applied.who && booked) return dates.some((d) => slotsLeft(d) >= Number(applied.who));
    return true;
  });
  const searching = !!(applied.where || applied.when || applied.who);
  const search = (e) => {
    e.preventDefault();
    setApplied(form);
    listRef.current?.scrollIntoView({ behavior: lessMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  const clearSearch = () => { const none = { where: '', when: '', who: '' }; setForm(none); setApplied(none); };

  // Photos for the tour-type cards and the "why us" photo: trip photos, else the agency's.
  const pool = [...tripPhotos.map((p) => p.src), ...heroPhotos].filter((s, i, a) => a.indexOf(s) === i);
  const photo = (i) => pool[i % Math.max(1, pool.length)] || FALLBACK_PHOTO;
  const heroLeft = hero ? slotsLeft(hero) : null;
  const [priceColor, priceMuted] = PRICE[look] || PRICE.tropical;

  return (
    <div className={`lk lk-${look}`}>
      <nav className={`lk-nav${scrolled ? ' is-scrolled' : ''}`}>
        <Link to="/" className="lk-brand" aria-label="Bandang IBAYO home">
          <img src={logoIcon} alt="BANDANG IBAYO" />
          <span>Bandang IBAYO</span>
        </Link>
        <div className="lk-links">
          <a href="#tours">Tours</a>
          <a href="#how">How to Book</a>
          <a href="#why">Why Us</a>
          <a href="#contact">Contact</a>
        </div>
        <div className="lk-nav-right">
          <Link to="/login" className="lk-login">Log in</Link>
          <Link to="/register" className="lk-btn lk-btn-main lk-btn-sm">Join now</Link>
        </div>
      </nav>

      {/* ── HERO: always a photo ── */}
      <header className="lk-hero">
        <div className="lk-hero-media" aria-hidden="true">
          {heroPhotos.map((src, i) => (
            <img key={src} src={src} alt="" className={i === slide % heroPhotos.length ? 'is-on' : ''} decoding="async" fetchPriority={i === 0 ? 'high' : 'low'} />
          ))}
          <div className="lk-hero-shade" />
          {hero && (
            <Link to={`/tours/${hero.id}`} className="lk-now" key={hero.id}>
              <span className="lk-tiny">In the photo</span>
              <b>{hero.title}</b>
              <span>Leaves {shortDay(hero.start_date)}{heroLeft != null ? ` · ${heroLeft === 0 ? 'fully booked' : `${heroLeft} slot${heroLeft === 1 ? '' : 's'} left`}` : ''} · from {formatPeso(hero.price)}</span>
            </Link>
          )}
        </div>
        <div className="lk-hero-copy">
          <AnnouncementBanner style={{ marginBottom: 14, maxWidth: 640, textAlign: 'left' }} />
          <span className="lk-pill"><Sparkles size={14} /> {tours.length ? `${tours.length} tour${tours.length === 1 ? '' : 's'} open for booking` : 'Group tours across the Philippines'}</span>
          {landing.headline || landing.headline_accent
            ? <h1 className="lk-h1">{landing.headline}{landing.headline && landing.headline_accent ? <br /> : null}{landing.headline_accent && <em>{landing.headline_accent}</em>}</h1>
            : <h1 className="lk-h1">Your next adventure <br />is <em>one seat away.</em></h1>}
          <p className="lk-lead">{landing.lead || 'Join group tours across the Philippines. Share the ride, split the cost, and discover more places.'}</p>
          <form className="lk-search" onSubmit={search} role="search" aria-label="Search tours">
            <label className="lk-field">
              <small>Where</small>
              <select value={form.where} onChange={(e) => setForm((f) => ({ ...f, where: e.target.value }))} aria-label="Destination">
                <option value="">Any destination</option>
                {places.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="lk-field">
              <small>When</small>
              <select value={form.when} onChange={(e) => setForm((f) => ({ ...f, when: e.target.value }))} aria-label="Month">
                <option value="">Any month</option>
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </label>
            <label className="lk-field">
              <small>Who</small>
              <select value={form.who} onChange={(e) => setForm((f) => ({ ...f, who: e.target.value }))} aria-label="Number of joiners">
                <option value="">Any group size</option>
                {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} joiner{n === 1 ? '' : 's'}</option>)}
              </select>
            </label>
            <button type="submit" className="lk-btn lk-btn-main lk-search-go"><Search size={17} /> Search tours</button>
          </form>
        </div>
        {look === 'fiesta' && (
          <svg className="lk-wave" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40 Q 180 0 360 40 T 720 40 T 1080 40 T 1440 40 V80 H0 Z" /></svg>
        )}
      </header>

      {/* ── TOURS ── */}
      <section id="tours" ref={listRef} className="lk-section">
        <div className="lk-wrap">
          <div className="lk-head lk-head-row">
            <div>
              <span className="lk-eyebrow">Live Now</span>
              <h2 className="lk-h2">{searching ? 'Tours that match' : 'Upcoming Adventures'}</h2>
              <p className="lk-sub">
                {searching
                  ? `${shown.length} tour${shown.length === 1 ? '' : 's'}${applied.where ? ` in ${applied.where}` : ''}${applied.when ? ` in ${monthLabel(applied.when)}` : ''}${applied.who ? ` with room for ${applied.who}` : ''}.`
                  : 'Verified joiner packages, updated in real time.'}
              </p>
            </div>
            <div className="lk-head-actions">
              {searching && <button type="button" onClick={clearSearch} className="lk-btn lk-btn-ghost lk-btn-sm"><X size={14} /> Clear search</button>}
              <Link to="/tours" className="lk-btn lk-btn-ghost lk-btn-sm">Explore all <ArrowRight size={15} /></Link>
            </div>
          </div>
          {loading ? (
            <div className="lk-grid" aria-label="Loading tours" role="status">
              {[0, 1, 2].map((i) => <div key={i} className="lk-card lk-skeleton" />)}
            </div>
          ) : shown.length > 0 ? (
            <div className="lk-grid">
              {shown.map((tour) => {
                const left = slotsLeft(tour);
                return (
                  <article key={tour.id} className="lk-card">
                    <div className="lk-card-img">
                      <Link to={`/tours/${tour.id}`} aria-label={tour.title} className="lk-cover" />
                      <img src={tour.image_urls?.[0] || FALLBACK_PHOTO} alt={tour.title} loading="lazy" decoding="async" />
                      {tour.difficulty && <span className="lk-chip">{tour.difficulty}</span>}
                      {left != null && <span className={`lk-chip lk-chip-right${left <= 5 ? ' is-low' : ''}`}>{left === 0 ? 'Fully booked' : `${left} slot${left === 1 ? '' : 's'} left`}</span>}
                    </div>
                    <div className="lk-card-body">
                      <p className="lk-card-place"><MapPin size={15} /> {tour.destination}</p>
                      <h3 className="lk-h3">{tour.title}</h3>
                      <p className="lk-meta"><Calendar size={15} /> {`${formatDate(tour.start_date)} (${weekdayRange(tour.start_date, tour.duration)})` + (tour.dates?.length > 1 ? `  +${tour.dates.length - 1} more date${tour.dates.length > 2 ? 's' : ''}` : '')}</p>
                      <p className="lk-meta"><Clock size={15} /> {tour.duration} · <Users size={15} /> {tour.group_size} max pax</p>
                      <div className="lk-card-foot">
                        <div>
                          <div className="lk-tiny">Starts at</div>
                          <PriceTag tour={tour} size={26} color={priceColor} mutedColor={priceMuted} align="flex-start" style={{ letterSpacing: '-0.03em' }} />
                        </div>
                        <Link to={`/tours/${tour.id}`} className="lk-btn lk-btn-main lk-btn-sm">Book now</Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="lk-empty">
              <img src={photo(0)} alt="" />
              <div>
                <p className="lk-empty-title">{searching ? 'No tours match that search yet.' : 'New dates are coming soon!'}</p>
                <p className="lk-sub">{searching ? 'Try another month or destination.' : 'Follow us on Facebook to be the first to know, or request a tour of your own.'}</p>
                <div className="lk-head-actions" style={{ marginTop: 14 }}>
                  {searching
                    ? <button type="button" onClick={clearSearch} className="lk-btn lk-btn-main lk-btn-sm">Show all tours</button>
                    : <a href={AGENCY.facebook} target="_blank" rel="noreferrer" className="lk-btn lk-btn-main lk-btn-sm"><FaFacebook size={16} /> Follow on Facebook</a>}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <Reviews />

      {/* ── WHAT IS A JOINER TOUR + TOUR TYPES (photo cards) ── */}
      <section className="lk-section lk-alt">
        <div className="lk-wrap">
          <div className="lk-intro">
            <div>
              <span className="lk-eyebrow">New to this?</span>
              <h2 className="lk-h2">What is a Joiner Tour?</h2>
            </div>
            <p className="lk-body-lg">
              A Joiner is a solo traveler or small group who shares a tour package with others — splitting transport and accommodation costs. Check live seat availability, full pricing, and itinerary details all in one place.
            </p>
          </div>
          <div className="lk-head lk-gap-top">
            <h2 className="lk-h2 lk-h2-sm">Choose Your Tour Type</h2>
            <p className="lk-sub">Solo, barkada, or custom — there's a fit for every kind of traveler.</p>
          </div>
          <div className="lk-types">
            {TOUR_TYPES.map((t, i) => {
              const Icon = t.icon;
              return (
                <div key={t.title} className="lk-type">
                  <div className="lk-type-img"><img src={photo(i + 1)} alt="" loading="lazy" decoding="async" /><span className="lk-tag">{t.tag}</span></div>
                  <div className="lk-type-body">
                    <h3 className="lk-h3"><Icon size={20} /> {t.title}</h3>
                    <p className="lk-body">{t.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── HOW TO BOOK: a numbered path ── */}
      <section id="how" className="lk-section">
        <div className="lk-wrap">
          <div className="lk-head lk-center">
            <span className="lk-eyebrow">Simple Process</span>
            <h2 className="lk-h2">How to Book</h2>
            <p className="lk-sub">No more chaotic Facebook threads. Confirm your seat in minutes.</p>
          </div>
          <ol className="lk-steps">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.num} className="lk-step">
                  <span className="lk-step-num">{s.num}</span>
                  <h3 className="lk-h3"><Icon size={19} /> {s.title}</h3>
                  <p className="lk-body">{s.desc}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── WHY US: a photo beside the reasons ── */}
      <section id="why" className="lk-section lk-alt">
        <div className="lk-wrap lk-why">
          <div className="lk-why-photo"><img src={photo(4)} alt="" loading="lazy" decoding="async" /></div>
          <div>
            <span className="lk-eyebrow">Why Us</span>
            <h2 className="lk-h2">Built for Smarter, Safer Journeys</h2>
            <div className="lk-reasons">
              {REASONS.map((r) => {
                const Icon = r.icon;
                return (
                  <div key={r.title} className="lk-reason">
                    <span className="lk-icon"><Icon size={20} /></span>
                    <div><h4 className="lk-h4">{r.title}</h4><p className="lk-body">{r.text}</p></div>
                  </div>
                );
              })}
            </div>
            <div className="lk-safety">
              <h3 className="lk-h3">Safety & Transparency</h3>
              <p className="lk-body">Building trust is our priority, especially for solo travelers. Organizer accountability details are always visible, and medical term acceptance is required before every booking.</p>
              {['Non-refundable deposit policy protects both parties.', 'Automatic email reminder sent 24 hours before departure.'].map((item) => (
                <p key={item} className="lk-check"><CheckCircle size={17} /> {item}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FROM OUR TRIPS: a strip of tour photos ── */}
      {tripPhotos.length >= 3 && (
        <section className="lk-section lk-strip-wrap" aria-label="Photos from our trips">
          <div className="lk-wrap"><div className="lk-head"><span className="lk-eyebrow">From Our Trips</span><h2 className="lk-h2 lk-h2-sm">Where we've been</h2></div></div>
          <div className="lk-strip">
            {tripPhotos.map((p) => (
              <figure key={p.src}><img src={p.src} alt={p.label} loading="lazy" decoding="async" /><figcaption>{p.label}</figcaption></figure>
            ))}
          </div>
        </section>
      )}

      {/* ── ABOUT & CONTACT ── */}
      <section id="contact" className="lk-section">
        <div className="lk-wrap lk-about">
          <div>
            <span className="lk-eyebrow">About</span>
            <h2 className="lk-h2 lk-about-title">Bandang <em>IBAYO.</em></h2>
            <p className="lk-body-lg">
              A local travel agency from Bulacan on a mission to help Filipinos explore the country. By modernizing our booking process, every trip is secure, organized, and stress-free from day one.
            </p>
          </div>
          <div className="lk-contact">
            <h3 className="lk-h3">Contact Our Coordinator</h3>
            <p className="lk-meta lk-meta-lg"><Mail size={18} /> {AGENCY.email}</p>
            <p className="lk-meta lk-meta-lg"><MapPin size={18} /> {AGENCY.address}</p>
            <div className="lk-head-actions">
              <a href={AGENCY.facebook} target="_blank" rel="noreferrer" className="lk-btn lk-btn-ghost lk-btn-sm"><FaFacebook size={17} /> Facebook</a>
              <a href={`tel:${AGENCY.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${AGENCY.name} at ${AGENCY.phone}`} className="lk-btn lk-btn-ghost lk-btn-sm"><Phone size={16} /> {AGENCY.phone}</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── CALL TO ACTION (on a photo) + FOOTER ── */}
      <section className="lk-section lk-cta-wrap">
        <div className="lk-cta">
          <img src={photo(2)} alt="" loading="lazy" decoding="async" />
          <div className="lk-cta-copy">
            <h2 className="lk-h2">Ready when you are.</h2>
            <p className="lk-sub">Create your account and book your first seat in minutes.</p>
            <div className="lk-head-actions lk-cta-buttons">
              <Link to="/register" className="lk-btn lk-btn-main">Join now</Link>
              <Link to="/login" className="lk-btn lk-btn-light">Log in</Link>
            </div>
          </div>
        </div>
      </section>
      <footer className="lk-footer">
        <div className="lk-brand"><img src={logoIcon} alt="BANDANG IBAYO" /><span>Bandang IBAYO</span></div>
        <p className="lk-tiny">© 2026</p>
      </footer>

      <HelpWidget />
      <style>{LOOK_CSS}</style>
    </div>
  );
};

// Recent 4–5★ reviews with a comment, right after the tours. Hidden until there are some.
const Reviews = () => {
  const reviews = usePublicReviews(6);
  if (!reviews || reviews.length === 0) return null;
  return (
    <section id="reviews" className="lk-section lk-reviews-wrap">
      <div className="lk-wrap">
        <div className="lk-head">
          <span className="lk-eyebrow">Joiner Stories</span>
          <h2 className="lk-h2">What Our Joiners Say</h2>
          <p className="lk-sub">Reviews from joiners who have finished a tour with us.</p>
        </div>
        <div className="lk-reviews">
          {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        </div>
      </div>
    </section>
  );
};

const LOOK_CSS = `
/* ═════════ Shared layout (every look) ═════════ */
.lk { position: relative; min-height: 100dvh; background: var(--bg); color: var(--text); font-family: var(--body); overflow-x: hidden; -webkit-font-smoothing: antialiased; font-size: 17px; }
.lk a { color: inherit; }
.lk em { font-style: normal; color: var(--accent); }
.lk-h1, .lk-h2, .lk-h3, .lk-h4, .lk-brand { font-family: var(--head); }

.lk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; text-decoration: none; cursor: pointer; font-family: inherit;
  font-weight: 700; font-size: 15.5px; padding: 15px 28px; border-radius: var(--btn-radius); border: 2px solid transparent; transition: transform 0.2s ease, filter 0.2s ease, background 0.2s ease; }
.lk-btn:hover { transform: translateY(-2px); }
.lk-btn-sm { padding: 11px 20px; font-size: 14.5px; }
.lk-btn-main { background: var(--accent); color: var(--on-accent) !important; box-shadow: var(--btn-shadow); }
.lk-btn-main:hover { filter: brightness(1.07); }
.lk-btn-ghost { background: transparent; border-color: var(--line-strong); color: var(--text) !important; }
.lk-btn-ghost:hover { background: var(--panel); }
.lk-btn-light { background: rgba(255,255,255,0.92); color: #1A1410 !important; }

.lk-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 16px clamp(1rem, 4vw, 3.5rem); transition: background 0.3s ease, padding 0.3s ease, box-shadow 0.3s ease; color: #FFFFFF; }
.lk-nav.is-scrolled { background: var(--nav-bg); color: var(--text); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); box-shadow: 0 1px 0 var(--line); padding-top: 10px; padding-bottom: 10px; }
.lk-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 800; font-size: 19px; letter-spacing: -0.02em; min-width: 0; }
.lk-brand img { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; }
.lk-brand span { white-space: nowrap; }
.lk-links { display: flex; gap: clamp(16px, 2.4vw, 34px); font-size: 15.5px; font-weight: 600; }
.lk-links a { text-decoration: none; opacity: 0.9; }
.lk-links a:hover { opacity: 1; text-decoration: underline; text-underline-offset: 6px; }
.lk-nav-right { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.lk-login { font-size: 15.5px; font-weight: 700; text-decoration: none; }

.lk-hero { position: relative; min-height: 92dvh; display: flex; flex-direction: column; justify-content: center; padding: 120px clamp(1rem, 4vw, 3.5rem) 110px; box-sizing: border-box; overflow: hidden; color: #FFFFFF; }
.lk-hero-media { position: absolute; inset: 0; z-index: 0; background: #2A2018; }
.lk-hero-media > img { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; opacity: 0; transition: opacity 1.6s ease; animation: lk-drift 26s ease-in-out infinite alternate; }
.lk-hero-media > img.is-on { opacity: 1; }
@keyframes lk-drift { from { transform: scale(1.02); } to { transform: scale(1.1); } }
.lk-hero-shade { position: absolute; inset: 0; background: var(--hero-shade); }
.lk-hero-copy { position: relative; z-index: 2; width: 100%; max-width: 1000px; margin: 0 auto; text-align: center; animation: lk-rise 0.8s ease both; }
@keyframes lk-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
.lk-pill { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 999px; font-size: 13px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
  background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.4); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
.lk-h1 { margin: 20px 0 16px; font-size: clamp(2.7rem, 7vw, 5.8rem); line-height: 1.02; font-weight: 800; letter-spacing: -0.04em; text-shadow: 0 4px 30px rgba(0,0,0,0.35); }
.lk-hero .lk-h1 em { color: var(--hero-accent); }
.lk-lead { margin: 0 auto 30px; max-width: 620px; font-size: clamp(17px, 1.7vw, 21px); line-height: 1.55; font-weight: 500; text-shadow: 0 2px 16px rgba(0,0,0,0.35); }
.lk-search { display: inline-flex; align-items: stretch; text-align: left; border-radius: var(--search-radius); padding: 8px; max-width: 100%; background: #FFFFFF; color: #1A1410; box-shadow: 0 24px 60px rgba(0,0,0,0.3); }
.lk-field { display: flex; flex-direction: column; gap: 2px; padding: 8px 20px; min-width: 0; cursor: pointer; }
.lk-field + .lk-field { border-left: 1px solid rgba(0,0,0,0.1); }
.lk-field small { font-size: 11.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(26,20,16,0.55); }
.lk-field select { appearance: none; -webkit-appearance: none; background: transparent; border: none; outline: none; color: #1A1410; font-family: inherit; font-size: 16.5px; font-weight: 700;
  padding: 2px 20px 2px 0; cursor: pointer; max-width: 200px; text-overflow: ellipsis;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right center; }
.lk-search-go { margin-left: 8px; padding: 0 26px; }
.lk .lk-now { position: absolute; z-index: 3; left: clamp(1rem, 4vw, 3.5rem); bottom: 28px; display: flex; flex-direction: column; gap: 3px; padding: 12px 18px; border-radius: 18px; text-decoration: none;
  max-width: 360px; color: #FFFFFF; background: rgba(0,0,0,0.38); border: 1px solid rgba(255,255,255,0.3); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
.lk-now b { font-size: 16px; }
.lk-now span:last-child { font-size: 13.5px; opacity: 0.85; }
.lk-tiny { font-size: 11.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0; }
.lk-now .lk-tiny { color: #FFFFFF; opacity: 0.75; }

.lk-section { padding: clamp(3rem, 6vw, 5rem) clamp(1rem, 4vw, 3.5rem); scroll-margin-top: 60px; }
.lk-alt { background: var(--bg2); }
.lk-wrap { max-width: 1200px; margin: 0 auto; }
.lk-head { margin-bottom: 2rem; }
.lk-head-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.lk-head-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.lk-center { text-align: center; }
.lk-gap-top { margin-top: clamp(2.5rem, 5vw, 4rem); }
.lk-eyebrow { display: inline-block; font-size: 13px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent2); }
.lk-h2 { margin: 8px 0 8px; font-size: clamp(2.1rem, 4.2vw, 3.4rem); font-weight: 800; letter-spacing: -0.035em; line-height: 1.06; }
.lk-h2-sm { font-size: clamp(1.7rem, 3vw, 2.5rem); }
.lk-h3 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 21px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.25; }
.lk-h3 svg, .lk-meta svg, .lk-card-place svg, .lk-check svg { color: var(--accent2); flex-shrink: 0; }
.lk-h4 { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
.lk-sub { margin: 0; font-size: 17px; color: var(--muted); line-height: 1.55; }
.lk-body { margin: 0; font-size: 16px; line-height: 1.65; color: var(--muted); }
.lk-body-lg { margin: 0; font-size: clamp(17px, 1.6vw, 20px); line-height: 1.7; }
.lk-meta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin: 7px 0 0; font-size: 15px; color: var(--muted); }
.lk-meta-lg { font-size: 16.5px; font-weight: 600; color: var(--text); margin: 0; gap: 12px; }

.lk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); gap: 24px; }
.lk-card { border-radius: var(--radius); overflow: hidden; background: var(--panel); border: var(--card-border); box-shadow: var(--card-shadow); display: flex; flex-direction: column; transition: transform 0.3s ease, box-shadow 0.3s ease; }
.lk-card:hover { transform: translateY(-6px); }
.lk-card-img { position: relative; height: 240px; overflow: hidden; background: var(--bg2); }
.lk-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.7s ease; }
.lk-card:hover .lk-card-img img { transform: scale(1.06); }
.lk-cover { position: absolute; inset: 0; z-index: 2; }
.lk-chip { position: absolute; z-index: 3; top: 14px; left: 14px; padding: 7px 13px; border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #1A1410; background: rgba(255,255,255,0.92); }
.lk-chip-right { left: auto; right: 14px; }
.lk-chip.is-low { background: var(--accent); color: var(--on-accent); }
.lk-card-body { padding: 20px 22px 22px; flex: 1; display: flex; flex-direction: column; }
.lk-card-place { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; font-size: 14px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent2); }
.lk-card-foot { margin-top: auto; padding-top: 18px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.lk-skeleton { height: 440px; background: linear-gradient(100deg, var(--panel) 30%, var(--bg2) 50%, var(--panel) 70%); background-size: 200% 100%; animation: lk-shine 1.4s linear infinite; }
@keyframes lk-shine { to { background-position: -200% 0; } }
.lk-empty { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); align-items: center; gap: clamp(1rem, 3vw, 2.5rem); border-radius: var(--radius); overflow: hidden; background: var(--panel); border: var(--card-border); box-shadow: var(--card-shadow); }
.lk-empty img { width: 100%; height: 100%; min-height: 220px; max-height: 300px; object-fit: cover; display: block; }
.lk-empty > div { padding: 1.5rem 1.5rem 1.5rem 0; }
.lk-empty-title { margin: 0 0 8px; font-family: var(--head); font-size: clamp(1.4rem, 2.4vw, 1.9rem); font-weight: 800; letter-spacing: -0.02em; }

.lk-reviews { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 20px; }
.lk-reviews article { border-radius: var(--radius) !important; }

.lk-intro { display: grid; grid-template-columns: 1fr 1.3fr; gap: clamp(1.25rem, 4vw, 3.5rem); align-items: end; }
.lk-types { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 24px; }
.lk-type { border-radius: var(--radius); overflow: hidden; background: var(--panel); border: var(--card-border); box-shadow: var(--card-shadow); display: flex; flex-direction: column; }
.lk-type-img { position: relative; height: 190px; overflow: hidden; }
.lk-type-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lk-tag { position: absolute; top: 14px; left: 14px; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 12px; border-radius: 999px; background: var(--accent); color: var(--on-accent); }
.lk-type-body { padding: 20px 22px 24px; display: flex; flex-direction: column; gap: 8px; }

.lk-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; position: relative; }
.lk-steps::before { content: ''; position: absolute; top: 34px; left: 12%; right: 12%; border-top: 3px dashed var(--line-strong); z-index: 0; }
.lk-step { position: relative; z-index: 1; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 0 8px; }
.lk-step-num { width: 68px; height: 68px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--head); font-size: 24px; font-weight: 800; background: var(--accent); color: var(--on-accent); box-shadow: 0 0 0 8px var(--bg); }
.lk-step .lk-h3 { justify-content: center; }

.lk-why { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: clamp(1.5rem, 4vw, 3.5rem); align-items: center; }
.lk-why-photo { border-radius: var(--radius); overflow: hidden; height: 100%; min-height: 380px; box-shadow: var(--card-shadow); }
.lk-why-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lk-reasons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 24px; margin: 22px 0; }
.lk-reason { display: flex; gap: 14px; align-items: flex-start; }
.lk-icon { width: 46px; height: 46px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--icon-bg); color: var(--accent2); }
.lk-safety { border-radius: var(--radius); padding: 20px 22px; background: var(--panel); border: var(--card-border); display: flex; flex-direction: column; gap: 10px; }
.lk-check { display: flex; gap: 10px; align-items: flex-start; margin: 0; font-size: 15.5px; font-weight: 600; line-height: 1.5; }
.lk-check svg { margin-top: 2px; }

.lk-strip-wrap { padding-left: 0; padding-right: 0; }
.lk-strip-wrap .lk-wrap { padding: 0 clamp(1rem, 4vw, 3.5rem); }
.lk-strip { display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px clamp(1rem, 4vw, 3.5rem) 12px; scrollbar-width: thin; }
.lk-strip figure { position: relative; margin: 0; flex: 0 0 auto; width: clamp(220px, 26vw, 320px); height: clamp(260px, 30vw, 380px); border-radius: var(--radius); overflow: hidden; scroll-snap-align: start; }
.lk-strip img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lk-strip figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: 30px 16px 14px; font-weight: 800; font-size: 16px; color: #FFFFFF; background: linear-gradient(transparent, rgba(0,0,0,0.65)); }

.lk-about { display: grid; grid-template-columns: 1.2fr 1fr; gap: clamp(1.5rem, 4vw, 3.5rem); align-items: center; }
.lk-about-title { font-size: clamp(2.6rem, 5vw, 4.2rem); margin-bottom: 16px; }
.lk-contact { display: flex; flex-direction: column; gap: 14px; padding: clamp(1.5rem, 3vw, 2.25rem); border-radius: var(--radius); background: var(--panel); border: var(--card-border); box-shadow: var(--card-shadow); }

.lk-cta-wrap { padding-top: 0; }
.lk-cta { position: relative; max-width: 1200px; margin: 0 auto; border-radius: var(--radius); overflow: hidden; min-height: 340px; display: flex; align-items: center; justify-content: center; text-align: center; }
.lk-cta > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lk-cta::after { content: ''; position: absolute; inset: 0; background: var(--cta-shade); }
.lk-cta-copy { position: relative; z-index: 1; padding: 3rem 1.5rem; color: #FFFFFF; }
.lk-cta-copy .lk-sub { color: rgba(255,255,255,0.9); }
.lk-cta-buttons { justify-content: center; margin-top: 22px; }
.lk-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 22px clamp(1rem, 4vw, 3.5rem) 26px; border-top: 1px solid var(--line); padding-right: max(96px, clamp(1rem, 4vw, 3.5rem)); }

.lk a:focus-visible, .lk button:focus-visible, .lk select:focus-visible { outline: 3px solid var(--accent2); outline-offset: 3px; border-radius: 8px; }

@media (max-width: 1000px) {
  .lk-links { display: none; }
  .lk-intro, .lk-why, .lk-about { grid-template-columns: 1fr; }
  .lk-why-photo { min-height: 260px; }
}
@media (max-width: 760px) {
  .lk { font-size: 16px; }
  .lk-hero { padding: 96px 1rem 130px; min-height: 88dvh; justify-content: flex-start; }
  .lk-search { display: flex; flex-direction: column; width: 100%; border-radius: 24px; }
  .lk-search .lk-search-go { border-radius: 16px; }
  .lk-field { padding: 10px 14px; }
  .lk-field + .lk-field { border-left: none; border-top: 1px solid rgba(0,0,0,0.1); }
  .lk-field select { max-width: none; width: 100%; }
  .lk-search-go { margin: 8px 0 0; padding: 15px; }
  .lk-now { right: 1rem; max-width: none; bottom: 18px; }
  .lk-brand span { font-size: 16px; }
  .lk-brand img { width: 34px; height: 34px; }
  .lk-steps { grid-template-columns: 1fr; gap: 28px; }
  .lk-steps::before { top: 0; bottom: 0; left: 34px; right: auto; border-top: none; border-left: 3px dashed var(--line-strong); }
  .lk-step { display: grid; grid-template-columns: 68px minmax(0, 1fr); column-gap: 16px; row-gap: 4px; text-align: left; align-items: start; padding: 0; }
  .lk-step-num { grid-row: span 2; }
  .lk-step .lk-h3 { justify-content: flex-start; padding-top: 18px; }
  .lk-reasons { grid-template-columns: 1fr; }
  .lk-empty { grid-template-columns: 1fr; }
  .lk-empty > div { padding: 0 1.25rem 1.5rem; }
}
@media (max-width: 420px) { .lk-login { display: none; } }
@media (prefers-reduced-motion: reduce) {
  .lk-hero-media > img, .lk-hero-copy, .lk-skeleton { animation: none !important; }
  .lk-hero-media > img { transition: none; }
}

/* ═════════ 1. Bright & Tropical: sand, ocean blue, sunset orange ═════════ */
.lk-tropical { --bg: #FFF8EE; --bg2: #FDEBD3; --panel: #FFFFFF; --text: #0B3B4F; --muted: #3F6372; --accent: #FF7A3D; --accent2: #0A8BA6; --on-accent: #FFFFFF;
  --hero-accent: #FFD27A; --line: rgba(11,59,79,0.1); --line-strong: rgba(10,139,166,0.35); --radius: 28px; --btn-radius: 999px; --search-radius: 999px;
  --btn-shadow: 0 10px 24px rgba(255,122,61,0.35); --card-border: none; --card-shadow: 0 14px 40px rgba(11,59,79,0.1); --icon-bg: rgba(10,139,166,0.12);
  --nav-bg: rgba(255,248,238,0.9); --head: 'Outfit', system-ui, sans-serif; --body: 'Outfit', system-ui, sans-serif;
  --hero-shade: linear-gradient(180deg, rgba(5,40,55,0.45) 0%, rgba(5,40,55,0.15) 40%, rgba(5,40,55,0.55) 100%);
  --cta-shade: linear-gradient(120deg, rgba(10,139,166,0.85), rgba(255,122,61,0.75)); }
.lk-tropical .lk-hero { margin: 12px; border-radius: 36px; min-height: calc(92dvh - 24px); }
.lk-tropical .lk-search .lk-search-go { border-radius: 999px; }
.lk-tropical .lk-step-num { background: linear-gradient(135deg, #FF7A3D, #FFB23D); }

/* ═════════ 2. Travel Magazine: paper, ink, serif headings, split hero ═════════ */
.lk-magazine { --bg: #F7F3EC; --bg2: #EFE8DC; --panel: #FFFDF9; --text: #1E1B16; --muted: #5B544A; --accent: #9C3D1E; --accent2: #9C3D1E; --on-accent: #FFFFFF;
  --hero-accent: #9C3D1E; --line: rgba(30,27,22,0.14); --line-strong: rgba(30,27,22,0.3); --radius: 6px; --btn-radius: 4px; --search-radius: 6px;
  --btn-shadow: none; --card-border: 1px solid rgba(30,27,22,0.12); --card-shadow: none; --icon-bg: transparent;
  --nav-bg: rgba(247,243,236,0.94); --head: 'Fraunces', Georgia, serif; --body: 'Outfit', system-ui, sans-serif;
  --hero-shade: none; --cta-shade: rgba(20,16,12,0.55); }
.lk-magazine .lk-nav { color: var(--text); background: rgba(247,243,236,0.94); box-shadow: 0 1px 0 var(--line); }
.lk-magazine .lk-hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: clamp(1.5rem, 4vw, 3.5rem); align-items: center; color: var(--text); padding-top: 110px; padding-bottom: 60px; min-height: 88dvh; }
.lk-magazine .lk-hero-media { position: relative; inset: auto; order: 2; height: min(72dvh, 640px); border-radius: 6px; overflow: hidden; }
.lk-magazine .lk-hero-copy { text-align: left; margin: 0; max-width: 620px; }
.lk-magazine .lk-h1 { font-weight: 600; letter-spacing: -0.03em; text-shadow: none; font-size: clamp(2.6rem, 5.6vw, 5rem); }
.lk-magazine .lk-h1 em { font-style: italic; }
.lk-magazine .lk-h2 { font-weight: 600; letter-spacing: -0.02em; }
.lk-magazine .lk-h3, .lk-magazine .lk-h4 { font-weight: 600; }
.lk-magazine .lk-lead { margin-left: 0; text-shadow: none; color: var(--muted); }
.lk-magazine .lk-pill { background: transparent; border: none; border-top: 2px solid var(--text); border-radius: 0; padding: 10px 0 0; color: var(--text); }
.lk-magazine .lk-search { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%; box-sizing: border-box; box-shadow: none; border: 1px solid var(--line-strong); }
.lk-magazine .lk-field select { max-width: none; width: 100%; }
.lk-magazine .lk-search-go { grid-column: 1 / -1; margin: 8px 0 0; padding: 14px; }
.lk-magazine .lk-eyebrow { color: var(--text); border-top: 2px solid var(--text); padding-top: 8px; }
.lk-magazine .lk-chip { border-radius: 2px; }
.lk-magazine .lk-tag { border-radius: 2px; }
.lk-magazine .lk-type { flex-direction: row; background: transparent; border: none; border-top: 1px solid var(--line-strong); border-radius: 0; padding-top: 18px; gap: 18px; }
.lk-magazine .lk-types { grid-template-columns: 1fr; gap: 18px; }
.lk-magazine .lk-type-img { width: min(38%, 340px); height: 210px; flex-shrink: 0; border-radius: 4px; }
.lk-magazine .lk-type-body { padding: 0; justify-content: center; }
.lk-magazine .lk-type:nth-child(even) { flex-direction: row-reverse; }
.lk-magazine .lk-step-num { background: transparent; color: var(--accent); border: 2px solid var(--accent); box-shadow: 0 0 0 8px var(--bg); font-family: var(--head); font-style: italic; }
.lk-magazine .lk-icon { border: 1px solid var(--line-strong); }
.lk-magazine .lk-about-title em { font-style: italic; }
.lk-magazine .lk-cta { border-radius: 6px; }
@media (max-width: 900px) {
  .lk-magazine .lk-hero { grid-template-columns: 1fr; padding-top: 86px; }
  .lk-magazine .lk-hero-media { order: 0; height: 42dvh; }
  .lk-magazine .lk-type, .lk-magazine .lk-type:nth-child(even) { flex-direction: column; }
  .lk-magazine .lk-type-img { width: 100%; }
  .lk-magazine .lk-search { grid-template-columns: 1fr; }
  .lk-magazine .lk-field + .lk-field { border-left: none; border-top: 1px solid rgba(0,0,0,0.1); }
}

/* ═════════ 3. Dark + Photos: today's colors, led by photos ═════════ */
.lk-dark { --bg: #0E0C0B; --bg2: #161210; --panel: #1C1815; --text: #F5F1EC; --muted: rgba(245,241,236,0.72); --accent: #E8A265; --accent2: #E8A265; --on-accent: #1A0F08;
  --hero-accent: #F2B67E; --line: rgba(255,255,255,0.1); --line-strong: rgba(232,162,101,0.4); --radius: 24px; --btn-radius: 16px; --search-radius: 22px;
  --btn-shadow: 0 10px 30px rgba(217,119,47,0.35); --card-border: 1px solid rgba(255,255,255,0.1); --card-shadow: none; --icon-bg: rgba(232,162,101,0.14);
  --nav-bg: rgba(14,12,11,0.8); --head: 'Outfit', system-ui, sans-serif; --body: 'Outfit', system-ui, sans-serif;
  --hero-shade: linear-gradient(180deg, rgba(14,12,11,0.6) 0%, rgba(14,12,11,0.2) 35%, rgba(14,12,11,0.4) 65%, #0E0C0B 100%);
  --cta-shade: linear-gradient(180deg, rgba(14,12,11,0.35), rgba(14,12,11,0.8)); }
.lk-dark .lk-hero { min-height: 100dvh; }
.lk-dark .lk-search { background: rgba(20,17,15,0.7); color: var(--text); border: 1px solid rgba(255,255,255,0.2); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.lk-dark .lk-field small { color: rgba(245,241,236,0.6); }
.lk-dark .lk-field select { color: var(--text); }
.lk-dark .lk-field select option { color: #1A0F08; }
.lk-dark .lk-field + .lk-field { border-color: rgba(255,255,255,0.15); }
.lk-dark .lk-chip { background: rgba(14,12,11,0.6); color: #F5F1EC; }
.lk-dark .lk-chip.is-low { background: var(--accent); color: var(--on-accent); }
.lk-dark .lk-reviews article { background: var(--panel) !important; border: 1px solid var(--line) !important; box-shadow: none !important; }
.lk-dark .lk-reviews article p, .lk-dark .lk-reviews article strong { color: var(--text) !important; }
.lk-dark .lk-reviews article span { color: var(--muted) !important; }

/* ═════════ 3b. Look 3, lighter: same layout and amber, on warm cream ═════════ */
.lk-light { --bg: #FBF6EF; --bg2: #F4EADD; --panel: #FFFFFF; --text: #2A1A10; --muted: #6B5446; --accent: #E39552; --accent2: #B85F1F; --on-accent: #1A0F08;
  --hero-accent: #FFC98F; --line: rgba(42,26,16,0.1); --line-strong: rgba(184,95,31,0.4); --radius: 24px; --btn-radius: 16px; --search-radius: 22px;
  --btn-shadow: 0 10px 26px rgba(217,119,47,0.3); --card-border: 1px solid rgba(42,26,16,0.08); --card-shadow: 0 10px 30px rgba(42,26,16,0.07); --icon-bg: rgba(227,149,82,0.16);
  --nav-bg: rgba(251,246,239,0.9); --head: 'Outfit', system-ui, sans-serif; --body: 'Outfit', system-ui, sans-serif;
  --hero-shade: linear-gradient(180deg, rgba(20,12,6,0.45) 0%, rgba(20,12,6,0.12) 35%, rgba(20,12,6,0.25) 70%, rgba(20,12,6,0.5) 100%);
  --cta-shade: linear-gradient(180deg, rgba(20,12,6,0.25), rgba(20,12,6,0.6)); }
.lk-light .lk-hero { min-height: 100dvh; }
.lk-light .lk-chip.is-low { background: var(--accent); color: var(--on-accent); }

/* ═════════ 4. Bold Filipino: fiesta colors, playful shapes ═════════ */
.lk-fiesta { --bg: #FFFBF0; --bg2: #FFE25C; --panel: #FFFFFF; --text: #1D1340; --muted: #4A3F6B; --accent: #E6266E; --accent2: #1D7BD6; --on-accent: #FFFFFF;
  --hero-accent: #FFE25C; --line: rgba(29,19,64,0.12); --line-strong: #1D1340; --radius: 22px; --btn-radius: 14px; --search-radius: 20px;
  --btn-shadow: 4px 4px 0 #1D1340; --card-border: 3px solid #1D1340; --card-shadow: 6px 6px 0 #1D1340; --icon-bg: #FFE25C;
  --nav-bg: rgba(255,251,240,0.95); --head: 'Bricolage Grotesque', 'Outfit', system-ui, sans-serif; --body: 'Outfit', system-ui, sans-serif;
  --hero-shade: linear-gradient(180deg, rgba(29,19,64,0.5) 0%, rgba(29,19,64,0.15) 40%, rgba(29,19,64,0.55) 100%);
  --cta-shade: linear-gradient(120deg, rgba(230,38,110,0.85), rgba(29,123,214,0.8)); }
.lk-fiesta .lk-btn-main { border: 3px solid #1D1340; }
.lk-fiesta .lk-btn-ghost { border: 3px solid #1D1340; background: #FFFFFF; box-shadow: 4px 4px 0 #1D1340; }
.lk-fiesta .lk-btn:hover { transform: translate(-2px, -2px); }
.lk-fiesta .lk-h1 { font-weight: 800; }
.lk-fiesta .lk-hero .lk-h1 em { background: #E6266E; color: #FFFFFF; padding: 0 0.2em; border-radius: 12px; display: inline-block; transform: rotate(-2deg); }
.lk-fiesta .lk-pill { background: #FFE25C; color: #1D1340; border: 3px solid #1D1340; transform: rotate(-2deg); }
.lk-fiesta .lk-search { border: 3px solid #1D1340; box-shadow: 8px 8px 0 #1D1340; }
.lk-fiesta .lk-wave { position: absolute; left: 0; right: 0; bottom: -1px; width: 100%; height: 60px; z-index: 2; fill: var(--bg); }
.lk-fiesta .lk-eyebrow { background: #1D7BD6; color: #FFFFFF; padding: 6px 12px; border-radius: 10px; transform: rotate(-1.5deg); }
.lk-fiesta .lk-alt { background: #FFE25C; }
.lk-fiesta .lk-alt .lk-sub, .lk-fiesta .lk-alt .lk-body { color: #3A2E5C; }
.lk-fiesta .lk-chip { border: 2px solid #1D1340; }
.lk-fiesta .lk-tag { border: 2px solid #1D1340; transform: rotate(-3deg); }
.lk-fiesta .lk-type:nth-child(2) .lk-tag { background: #1D7BD6; }
.lk-fiesta .lk-type:nth-child(3) .lk-tag { background: #19A974; }
.lk-fiesta .lk-type:nth-child(odd) { transform: rotate(-0.6deg); }
.lk-fiesta .lk-type:nth-child(even) { transform: rotate(0.6deg); }
.lk-fiesta .lk-step-num { border: 3px solid #1D1340; }
.lk-fiesta .lk-step:nth-child(2) .lk-step-num { background: #1D7BD6; }
.lk-fiesta .lk-step:nth-child(3) .lk-step-num { background: #19A974; }
.lk-fiesta .lk-icon { border: 2px solid #1D1340; }
.lk-fiesta .lk-why-photo, .lk-fiesta .lk-strip figure, .lk-fiesta .lk-cta { border: 3px solid #1D1340; box-shadow: 6px 6px 0 #1D1340; }
.lk-fiesta .lk-strip figure:nth-child(odd) { transform: rotate(-1.2deg); }
.lk-fiesta .lk-strip figure:nth-child(even) { transform: rotate(1.2deg); }
.lk-fiesta .lk-strip { padding-top: 12px; padding-bottom: 20px; }
.lk-fiesta .lk-reviews article { border: 3px solid #1D1340 !important; box-shadow: 6px 6px 0 #1D1340 !important; }
.lk-fiesta .lk-about-title em { color: #E6266E; }
`;

export default LandingLooks;
