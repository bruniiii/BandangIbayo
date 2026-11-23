import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaFacebook, FaInstagram, FaTiktok } from 'react-icons/fa';
import {
  MapPin, Calendar, Users, Clock, CheckCircle, ShieldCheck, Smartphone, Map as MapIcon, CreditCard, Globe, Mail, Phone, ArrowRight, Bus,
} from 'lucide-react';
import { supabase } from './supabaseClient';
import logoIcon from './assets/logo.png';
import HelpWidget from './ui/HelpWidget';
import { todayManila, groupTripDates, weekdayRange } from './tourUtils';
import { ReviewCard } from './ui/ReviewCards';
import PriceTag from './ui/PriceTag';
import { usePublicReviews } from './publicReviews';
import { reportError } from './ui/toast';
import { AGENCY } from './agencyInfo';
import AnnouncementBanner from './ui/AnnouncementBanner';
import { SITE } from './siteContent';
import ThemeToggle from './ui/ThemeToggle';

// ─────────────────────────────────────────────
// LANDING PAGE: "Bright & Tropical" (sand, ocean blue, sunset orange).
//  • A photo always at the top: the Site Content photos, else the open
//    tours' photos, else the agency's forest photo.
//  • Tours, then reviews, then tour types (photo cards), How to Book (a
//    numbered path), Why Us, a strip of trip
//    photos, About & Contact, and a call to action on a photo.
// Styles: PAGE_CSS below, scoped under .lk.

// The menu's links (each one a section of this page).
const NAV = [['tours', 'Tours'], ['how', 'How to Book'], ['why', 'Why Us'], ['contact', 'Contact']];
const FALLBACK_PHOTO = '/tour-placeholder.webp';
// The default hero photo: hikers watching the sunrise above the clouds.
const HERO_PHOTO = '/hero-elnido.webp';

const formatDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${month}-${day}-${year}`;
};
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

// Shown in the moving ribbon under the photo when there are few destinations.
const KINDS = ['Mountains', 'Beaches', 'Islands', 'Waterfalls', 'Sunrise hikes', 'Food trips'];

const LandingTropical = () => {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [booked, setBooked] = useState(null); // { [tour date id]: slots taken }
  const [tripPhotos, setTripPhotos] = useState([]); // photos from tours, past ones too
  const [scrolled, setScrolled] = useState(false);
  const [here, setHere] = useState(''); // the section on screen now (underlined in the menu)
  const [slide, setSlide] = useState(0);
  const pageRef = useRef(null);
  const navigate = useNavigate();

  // Opening the home-screen app (manifest start_url "/?app=1"): a signed-in
  // joiner goes straight to their dashboard; everyone else sees this page.
  // Only on launch, so tapping the logo later still shows the landing page.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('app') !== '1') return;
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) navigate('/dashboard', { replace: true });
      else window.history.replaceState(null, '', '/');
    });
  }, [navigate]);


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
    const onScroll = () => {
      setScrolled(window.scrollY > 30);
      // The last section whose top has passed the menu bar; Contact at the very bottom.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const line = window.innerHeight * 0.35;
      let id = '';
      NAV.forEach(([k]) => { const el = document.getElementById(k); if (el && el.getBoundingClientRect().top <= line) id = k; });
      setHere(atBottom ? 'contact' : id);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Sections float up as they scroll into view (not with "reduce motion").
  useEffect(() => {
    const root = pageRef.current;
    if (!root || lessMotion() || !('IntersectionObserver' in window)) return undefined;
    const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); seen.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    root.classList.add('lk-anim');
    root.querySelectorAll('.lk-reveal:not(.is-in)').forEach((el) => seen.observe(el));
    return () => seen.disconnect();
  }, [loading, tripPhotos.length]);

  const landing = SITE.landing || {};
  const customPhotos = Array.isArray(landing.hero_images) ? landing.hero_images.filter(Boolean) : [];
  // Always a photo: Site Content photos, else the default hero photo.
  const heroPhotos = customPhotos.length ? customPhotos : [HERO_PHOTO];
  const slideCount = heroPhotos.length;
  useEffect(() => {
    if (slideCount < 2 || lessMotion()) return undefined;
    const t = setInterval(() => setSlide((i) => (i + 1) % slideCount), 7000);
    return () => clearInterval(t);
  }, [slideCount]);

  const slotsLeft = (d) => (booked ? Math.max(0, (Number(d.group_size) || 0) - (booked[d.id] || 0)) : null);
  const places = useMemo(() => [...new Set(tours.map((t) => String(t.destination || '').trim()).filter(Boolean))].sort(), [tours]);
  const shown = tours;

  // Photos for the tour-type cards and the "why us" photo: trip photos, else the agency's.
  const pool = [...tripPhotos.map((p) => p.src), ...heroPhotos].filter((s, i, a) => a.indexOf(s) === i);
  const photo = (i) => pool[i % Math.max(1, pool.length)] || FALLBACK_PHOTO;
  const [priceColor, priceMuted] = ['var(--text)', 'var(--muted)'];

  return (
    <div className="lk lk-tropical" ref={pageRef}>
      <nav className={`lk-nav${scrolled ? ' is-scrolled' : ''}`}>
        <Link to="/" className="lk-brand" aria-label="Bandang IBAYO home">
          <img src={logoIcon} alt="BANDANG IBAYO" />
          <span>Bandang IBAYO</span>
        </Link>
        <div className="lk-links">
          {NAV.map(([k, label]) => (
            <a key={k} href={`#${k}`} className={here === k ? 'is-here' : ''} aria-current={here === k ? 'location' : undefined}>{label}</a>
          ))}
        </div>
        <div className="lk-nav-right">
          <ThemeToggle className="lk-theme" />
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
        </div>
        <div className="lk-hero-copy">
          <AnnouncementBanner style={{ marginBottom: 14, maxWidth: 640, textAlign: 'left' }} />
          {landing.headline || landing.headline_accent
            ? <h1 className="lk-h1">{landing.headline}{landing.headline && landing.headline_accent ? <br /> : null}{landing.headline_accent && <em>{landing.headline_accent}</em>}</h1>
            : <h1 className="lk-h1">Your next adventure <br />is <em>one seat away.</em></h1>}
          <p className="lk-lead">{landing.lead || 'Join group tours across the Philippines. Share the ride, split the cost, and discover more places.'}</p>
        </div>
      </header>

      {/* ── A tilted ribbon of destinations, always moving ── */}
      <div className="lk-ribbon" aria-hidden="true">
        <div className="lk-ribbon-track">
          {[0, 1].map((k) => (
            <span key={k}>{(places.length >= 3 ? places : KINDS).map((p) => <span key={p}>{p} <i>✦</i> </span>)}</span>
          ))}
        </div>
      </div>

      {/* ── TOURS ── */}
      <section id="tours" className="lk-section">
        <div className="lk-wrap">
          <div className="lk-head lk-head-row">
            <div>
              <span className="lk-eyebrow">Live Now</span>
              <h2 className="lk-h2">Upcoming Adventures</h2>
              <p className="lk-sub">Verified joiner packages, updated in real time.</p>
            </div>
            <div className="lk-head-actions">
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
                  <article key={tour.id} className="lk-card lk-reveal">
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
                      <div className="lk-card-tear" aria-hidden="true" />
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
                <p className="lk-empty-title">New dates are coming soon!</p>
                <p className="lk-sub">Follow us on Facebook to be the first to know, or request a tour of your own.</p>
                <div className="lk-head-actions" style={{ marginTop: 14 }}>
                  <a href={AGENCY.facebook} target="_blank" rel="noreferrer" className="lk-btn lk-btn-main lk-btn-sm"><FaFacebook size={16} /> Follow on Facebook</a>
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
          <div className="lk-head lk-center">
            <div>
              <span className="lk-eyebrow">New to this?</span>
              <h2 className="lk-h2">What is a Joiner Tour?</h2>
            </div>
            <p className="lk-body-lg" style={{ maxWidth: 760, margin: '10px auto 0' }}>
              A Joiner is a solo traveler or small group who shares a tour package with others — splitting transport and accommodation costs. Check live seat availability, full pricing, and itinerary details all in one place.
            </p>
          </div>
          <div className="lk-head lk-center lk-gap-top">
            <h2 className="lk-h2 lk-h2-sm">Choose Your Tour Type</h2>
            <p className="lk-sub">Solo, barkada, or custom — there's a fit for every kind of traveler.</p>
          </div>
          <div className="lk-types">
            {TOUR_TYPES.map((t, i) => {
              const Icon = t.icon;
              return (
                <div key={t.title} className="lk-type lk-reveal">
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
          <ol className="lk-steps lk-reveal">
            <li className="lk-van" aria-hidden="true"><Bus size={22} /></li>
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

      {/* ── WHY US: the reasons, then safety ── */}
      <section id="why" className="lk-section lk-alt">
        <div className="lk-wrap lk-why">
          <div>
            <div className="lk-center">
              <span className="lk-eyebrow">Why Us</span>
              <h2 className="lk-h2">Built for Smarter, Safer Journeys</h2>
            </div>
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
          <div className="lk-wrap"><div className="lk-head lk-center"><span className="lk-eyebrow">From Our Trips</span><h2 className="lk-h2 lk-h2-sm">Where we've been</h2></div></div>
          <div className="lk-strip">
            {tripPhotos.map((p) => (
              <figure key={p.src} className="lk-reveal"><img src={p.src} alt={p.label} loading="lazy" decoding="async" /><figcaption>{p.label}</figcaption></figure>
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
              {AGENCY.instagram && <a href={AGENCY.instagram} target="_blank" rel="noreferrer" className="lk-btn lk-btn-ghost lk-btn-sm"><FaInstagram size={17} /> Instagram</a>}
              {AGENCY.tiktok && <a href={AGENCY.tiktok} target="_blank" rel="noreferrer" className="lk-btn lk-btn-ghost lk-btn-sm"><FaTiktok size={16} /> TikTok</a>}
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
      <style>{PAGE_CSS}</style>
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

const PAGE_CSS = `
/* ═════════ Layout ═════════ */
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
.lk-links a { position: relative; padding: 4px 0; }
.lk-links a::after { content: ''; position: absolute; left: -4px; right: -4px; bottom: -6px; height: 7px; border-radius: 6px; transform: scaleX(0) rotate(-1.5deg); transform-origin: left;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M2 6 C 25 2, 55 3, 98 5' fill='none' stroke='%23FF7A3D' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center / 100% 100%;
  transition: transform 0.3s ease; }
.lk-links a:hover { opacity: 1; }
.lk-links a:hover::after { transform: scaleX(0.6) rotate(-1.5deg); opacity: 0.6; }
.lk-links a.is-here { opacity: 1; font-weight: 800; }
.lk-links a.is-here::after { transform: scaleX(1) rotate(-1.5deg); opacity: 1; }
.lk-nav-right { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.lk-theme { width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;
  background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.35); color: inherit; transition: background 0.2s ease, transform 0.2s ease; }
.lk-theme:hover { background: rgba(255,255,255,0.24); transform: rotate(-12deg); }
.lk-nav.is-scrolled .lk-theme { background: var(--panel); border-color: var(--line-strong); }
.lk-login { font-size: 15.5px; font-weight: 700; text-decoration: none; }

.lk-hero { position: relative; min-height: 92dvh; display: flex; flex-direction: column; justify-content: center; padding: 120px clamp(1rem, 4vw, 3.5rem) 110px; box-sizing: border-box; overflow: hidden; color: #FFFFFF; }
.lk-hero-media { position: absolute; inset: 0; z-index: 0; background: #2A2018; }
.lk-hero-media > img { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; opacity: 0; transition: opacity 1.6s ease; animation: lk-drift 26s ease-in-out infinite alternate; }
.lk-hero-media > img.is-on { opacity: 1; }
@keyframes lk-drift { from { transform: scale(1.02); } to { transform: scale(1.1); } }
.lk-hero-shade { position: absolute; inset: 0; background: var(--hero-shade); }
.lk-hero-copy { position: relative; z-index: 2; width: 100%; max-width: 1000px; margin: 0 auto; text-align: center; animation: lk-rise 0.8s ease both; }
@keyframes lk-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
.lk-h1 { margin: 20px 0 16px; font-size: clamp(2.7rem, 7vw, 5.8rem); line-height: 1.02; font-weight: 800; letter-spacing: -0.04em; text-shadow: 0 4px 30px rgba(0,0,0,0.35); }
.lk-hero .lk-h1 em { color: var(--hero-accent); }
.lk-lead { margin: 0 auto 30px; max-width: 620px; font-size: clamp(17px, 1.7vw, 21px); line-height: 1.55; font-weight: 500; text-shadow: 0 2px 16px rgba(0,0,0,0.35); }
.lk-tiny { font-size: 11.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0; }

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

.lk-why .lk-reasons { grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }
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
  .lk-about { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .lk { font-size: 16px; }
  .lk-hero { padding: 96px 1rem 90px; min-height: 80dvh; }
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
/* Small phones: keep Log in visible. The name next to the logo hides (the
   logo stays) and the menu buttons get a little smaller to make room. */
@media (max-width: 440px) {
  .lk-brand span { display: none; }
  .lk-nav-right { gap: 10px; }
  .lk-theme { width: 36px; height: 36px; }
  .lk-login { font-size: 14.5px; }
  .lk-nav .lk-btn-sm { padding: 10px 16px; font-size: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .lk-hero-media > img, .lk-hero-copy, .lk-skeleton { animation: none !important; }
  .lk-hero-media > img { transition: none; }
}

/* ═════════ Colors: sand, ocean blue, sunset orange ═════════ */
.lk-tropical { --bg: #FFF8EE; --bg2: #FDEBD3; --panel: #FFFFFF; --text: #0B3B4F; --muted: #3F6372; --accent: #FF7A3D; --accent2: #0A8BA6; --on-accent: #0B3B4F;
  --hero-accent: #FFD27A; --line: rgba(11,59,79,0.1); --line-strong: rgba(10,139,166,0.35); --radius: 28px; --btn-radius: 999px; --search-radius: 999px;
  --btn-shadow: 0 10px 24px rgba(255,122,61,0.35); --card-border: none; --card-shadow: 0 14px 40px rgba(11,59,79,0.1); --icon-bg: rgba(10,139,166,0.12);
  --nav-bg: rgba(255,248,238,0.9); --head: 'Outfit', system-ui, sans-serif; --body: 'Outfit', system-ui, sans-serif;
  --hero-shade: linear-gradient(180deg, rgba(5,40,55,0.45) 0%, rgba(5,40,55,0.15) 40%, rgba(5,40,55,0.55) 100%);
  --cta-shade: linear-gradient(120deg, rgba(10,139,166,0.85), rgba(255,122,61,0.75)); }
.lk-tropical .lk-hero { margin: 12px; border-radius: 36px; min-height: calc(92dvh - 24px); }
.lk-tropical .lk-tropical .lk-step-num { background: linear-gradient(135deg, #FF7A3D, #FFB23D); }


/* ═════════ Creative touches ═════════ */
/* Handwritten labels and a brush-stroke under the headline's accent */
.lk-eyebrow { font-family: 'Caveat', cursive; font-size: 27px; font-weight: 700; letter-spacing: 0; text-transform: none; color: var(--accent); transform: rotate(-2deg); transform-origin: left; }
.lk-center .lk-eyebrow { transform-origin: center; }
.lk-hero .lk-h1 em { position: relative; display: inline-block; }
.lk-hero .lk-h1 em::after { content: ''; position: absolute; left: 2%; right: 2%; bottom: -0.14em; height: 0.22em; z-index: -1;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 20' preserveAspectRatio='none'%3E%3Cpath d='M3 14 C 60 4, 120 4, 170 10 S 260 16, 297 6' fill='none' stroke='%23FF7A3D' stroke-width='7' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center / 100% 100%; }
.lk-hero .lk-h1 { isolation: isolate; }

/* The moving ribbon of destinations */
.lk-ribbon { position: relative; z-index: 5; margin: -34px -2% 0; padding: 14px 0; background: #0A8BA6; color: #FFFFFF; transform: rotate(-1.6deg); box-shadow: 0 12px 30px rgba(10,139,166,0.3); overflow: hidden; }
.lk-ribbon-track { display: flex; width: max-content; animation: lk-marquee 38s linear infinite; }
.lk-ribbon-track > span { display: flex; white-space: nowrap; }
.lk-ribbon-track span span { font-family: 'Caveat', cursive; font-size: 30px; font-weight: 700; padding: 0 6px; }
.lk-ribbon i { font-style: normal; color: #FFD27A; font-family: 'Outfit', sans-serif; font-size: 18px; padding: 0 14px; vertical-align: middle; }
@keyframes lk-marquee { to { transform: translateX(-50%); } }

/* Soft sun and sea shapes behind the sections */
.lk-section { position: relative; }
.lk-alt { overflow: hidden; }
.lk-alt::before, .lk-alt::after { content: ''; position: absolute; border-radius: 50%; pointer-events: none; z-index: 0; }
.lk-alt::before { width: 420px; height: 420px; top: -140px; right: -120px; background: radial-gradient(circle, rgba(255,178,61,0.35), rgba(255,178,61,0) 70%); }
.lk-alt::after { width: 520px; height: 520px; bottom: -260px; left: -180px; background: radial-gradient(circle, rgba(10,139,166,0.16), rgba(10,139,166,0) 70%); }
.lk-alt > .lk-wrap { position: relative; z-index: 1; }

/* Tour cards as tickets: a torn line with notches above the price */
.lk-card { position: relative; }
.lk-card-tear { position: relative; margin: 18px -22px 0; border-top: 2px dashed rgba(11,59,79,0.18); }
.lk-card-tear::before, .lk-card-tear::after { content: ''; position: absolute; top: -12px; width: 22px; height: 22px; border-radius: 50%; background: var(--bg); }
.lk-card-tear::before { left: -11px; }
.lk-card-tear::after { right: -11px; }
.lk-card-foot { padding-top: 14px; }

/* Tour types as tilted photo prints with tape */
.lk-type { background: #FFFFFF; padding: 12px 12px 4px; border-radius: 10px; box-shadow: 0 16px 36px rgba(11,59,79,0.14); transition: transform 0.35s ease, box-shadow 0.35s ease; position: relative; overflow: visible; }
.lk-type:nth-child(1) { transform: rotate(-2.2deg); }
.lk-type:nth-child(2) { transform: rotate(1.4deg) translateY(10px); }
.lk-type:nth-child(3) { transform: rotate(-1deg); }
.lk-type:hover { transform: rotate(0) translateY(-6px); box-shadow: 0 24px 50px rgba(11,59,79,0.2); }
.lk-type::before { content: ''; position: absolute; top: -12px; left: 50%; width: 96px; height: 26px; transform: translateX(-50%) rotate(-3deg); background: rgba(255,210,122,0.75); z-index: 2; border-radius: 3px; }
.lk-type-img { border-radius: 4px; }
.lk-type-body { padding: 16px 8px 18px; }

/* How to Book: a little bus drives along the road */
.lk-steps::before { border-top: 4px dashed rgba(10,139,166,0.45); }
.lk-van { position: absolute; top: 18px; left: calc(16.7% + 46px); z-index: 2; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: #FFFFFF; color: #0A8BA6; box-shadow: 0 6px 16px rgba(11,59,79,0.18); animation: lk-drive 9s ease-in-out infinite; list-style: none; }
@keyframes lk-drive { 0%, 8% { left: calc(16.7% + 46px); } 46%, 54% { left: calc(83.3% - 82px); } 92%, 100% { left: calc(16.7% + 46px); } }
.lk-step:nth-child(3) .lk-step-num { background: linear-gradient(135deg, #0A8BA6, #2BB3C9); color: #FFFFFF; }
.lk-step:nth-child(4) .lk-step-num { background: linear-gradient(135deg, #19A974, #5CC98F); color: #FFFFFF; }

/* Trip photos as tilted prints with handwritten captions */
.lk-strip figure { background: #FFFFFF; padding: 10px 10px 46px; border-radius: 6px; box-shadow: 0 14px 30px rgba(11,59,79,0.16); height: auto; overflow: visible; }
.lk-strip figure img { height: clamp(220px, 26vw, 320px); border-radius: 3px; }
.lk-strip figure:nth-child(odd) { transform: rotate(-1.8deg); }
.lk-strip figure:nth-child(even) { transform: rotate(1.6deg); }
.lk-strip figcaption { top: auto; bottom: 8px; padding: 0 12px; background: none; color: #0B3B4F; font-family: 'Caveat', cursive; font-size: 25px; font-weight: 700; }
.lk-strip { padding-top: 18px; padding-bottom: 26px; }

/* Float up into view */
.lk-anim .lk-reveal { opacity: 0; translate: 0 28px; transition: opacity 0.7s ease, translate 0.7s ease; }
.lk-anim .lk-reveal.is-in { opacity: 1; translate: 0 0; }

@media (max-width: 760px) {
  .lk-ribbon { margin-top: -26px; padding: 10px 0; }
  .lk-ribbon-track span span { font-size: 24px; }
  .lk-eyebrow { font-size: 24px; }
  .lk-type:nth-child(2) { transform: rotate(1.4deg); }
  .lk-van { display: none; }
  .lk-steps::before { border-top: none; border-left: 4px dashed rgba(10,139,166,0.45); }
}
@media (prefers-reduced-motion: reduce) {
  .lk-ribbon-track, .lk-van { animation: none !important; }
}

/* ═════════ Dark mode (theme.js; the moon button in the menu) ═════════
   Night by the sea: deep ocean navy, teal and sunset orange. The --ib-*
   colours (shared parts like the reviews, prices and help button) are
   flipped here too, only inside the landing page. */
:root[data-theme="dark"] .lk-tropical { color-scheme: dark;
  --bg: #08202B; --bg2: #0C2A37; --panel: #113442; --text: #EAF4F6; --muted: #A9C3CB; --accent: #FF8A52; --accent2: #4CC3DA; --on-accent: #0B3B4F;
  --line: rgba(234,244,246,0.1); --line-strong: rgba(76,195,218,0.4); --btn-shadow: 0 10px 24px rgba(255,122,61,0.25);
  --card-shadow: 0 14px 40px rgba(0,0,0,0.4); --icon-bg: rgba(76,195,218,0.14); --nav-bg: rgba(8,32,43,0.86);
  --ib-dark: #EAF4F6; --ib-deep: #0C2A37; --ib-brown: #EAF4F6; --ib-rust: #A9C3CB; --ib-sienna: #4CC3DA; --ib-sienna-hover: #6FD0E3;
  --ib-accent: #FF8A52; --ib-amber: #FFC266; --ib-cream: #113442; --ib-parch: #0C2A37; --ib-red: #FF7A66;
  --ib-dark-rgb: 234,244,246; --ib-rust-rgb: 169,195,203; --ib-accent-rgb: 76,195,218; --ib-sienna-rgb: 76,195,218; --ib-cream-rgb: 17,52,66;
  --ib-parch-rgb: 12,42,55; --ib-soft-rgb: 169,195,203; --ib-amber-rgb: 255,194,102; --ib-red-rgb: 255,122,102; }
:root[data-theme="dark"] .lk-tropical .lk-type, :root[data-theme="dark"] .lk-tropical .lk-strip figure { background: var(--panel); box-shadow: 0 16px 36px rgba(0,0,0,0.45); }
:root[data-theme="dark"] .lk-tropical .lk-strip figcaption { color: var(--text); }
:root[data-theme="dark"] .lk-tropical .lk-van { background: var(--panel); color: var(--accent2); box-shadow: 0 6px 16px rgba(0,0,0,0.4); }
:root[data-theme="dark"] .lk-tropical .lk-alt::before { background: radial-gradient(circle, rgba(255,138,82,0.18), rgba(255,138,82,0) 70%); }
:root[data-theme="dark"] .lk-tropical .lk-alt::after { background: radial-gradient(circle, rgba(76,195,218,0.14), rgba(76,195,218,0) 70%); }
:root[data-theme="dark"] .lk-tropical .lk-card-tear { border-top-color: rgba(234,244,246,0.18); }
:root[data-theme="dark"] .lk-tropical .lk-ribbon { background: #0A6F86; box-shadow: 0 12px 30px rgba(0,0,0,0.35); }
`;

export default LandingTropical;
