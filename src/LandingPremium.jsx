import React, { useEffect, useMemo, useRef, useState } from 'react';
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

// ─────────────────────────────────────────────
// LANDING PAGE: sleek, dark "booking platform" design.
//  • Hero: an open tour's photo fills the screen (the featured tours take
//    turns), a centred headline, a glass search bar (Where / When / Who)
//    and the next departures on small glass cards.
//  • The search filters the tours listed on this page and scrolls to them.
//  • Then the same sections and text as the original page (kept in
//    LandingClassic.jsx), on near-black with amber accents.
// Styles: PREMIUM_CSS below, scoped under .lx.
// ─────────────────────────────────────────────

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

// What joiners say: recent 4–5★ reviews with a comment. Hidden until there are reviews to show.
const LandingReviews = () => {
  const reviews = usePublicReviews(6);
  if (!reviews || reviews.length === 0) return null;
  return (
    <section id="reviews" className="lx-section">
      <div className="lx-wrap">
        <div className="lx-head lx-center">
          <span className="lx-eyebrow">Joiner Stories</span>
          <h2 className="lx-h2">What Our Joiners Say</h2>
          <p className="lx-sub">Reviews from joiners who have finished a tour with us.</p>
        </div>
        <div className="lx-grid lx-reviews">
          {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        </div>
      </div>
    </section>
  );
};

const LandingPremium = () => {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [booked, setBooked] = useState(null); // { [tour date id]: slots taken }
  const [scrolled, setScrolled] = useState(false);
  const [slide, setSlide] = useState(0);
  // The search bar's boxes, and the search that's applied to the list.
  const [form, setForm] = useState({ where: '', when: '', who: '' });
  const [applied, setApplied] = useState({ where: '', when: '', who: '' });
  const listRef = useRef(null);

  useEffect(() => {
    const fetchPublicTours = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('tours')
        .select('*')
        .eq('is_archived', false)
        .gte('start_date', todayManila())
        .order('start_date', { ascending: true });
      if (error) reportError("Couldn't load tours", error.message);
      else setTours(groupTripDates((data || []).filter((t) => !t.is_exclusive), { openFirst: false })); // one card per trip, however many dates it has
      setLoading(false);
    };
    fetchPublicTours();
    supabase.rpc('tour_slots_booked').then(({ data }) => {
      if (data) setBooked(Object.fromEntries(data.map((r) => [r.tour_id, Number(r.slots_booked) || 0])));
    });
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The hero's featured tours (those with a photo) take turns.
  const featured = useMemo(() => tours.filter((t) => t.image_urls?.[0]).slice(0, 5), [tours]);
  useEffect(() => {
    if (featured.length < 2 || lessMotion()) return undefined;
    const t = setInterval(() => setSlide((i) => (i + 1) % featured.length), 7000);
    return () => clearInterval(t);
  }, [featured.length]);
  const hero = featured[slide % Math.max(1, featured.length)] || null;
  const upNext = featured.length > 1 ? [1, 2].map((n) => featured[(slide + n) % featured.length]).filter((t, i, a) => t && t.id !== hero?.id && a.indexOf(t) === i) : [];

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

  const heroLeft = hero ? slotsLeft(hero) : null;

  return (
    <div className="lx">
      {/* ── NAV ── */}
      <nav className={`lx-nav${scrolled ? ' is-scrolled' : ''}`}>
        <Link to="/" className="lx-brand" aria-label="Bandang IBAYO home">
          <img src={logoIcon} alt="BANDANG IBAYO" />
          <span>Bandang IBAYO</span>
        </Link>
        <div className="lx-links">
          <a href="#tours">Tours</a>
          <a href="#how">How to Book</a>
          <a href="#why">Why Us</a>
          <a href="#contact">Contact</a>
        </div>
        <div className="lx-nav-right">
          <Link to="/login" className="lx-login">Log in</Link>
          <Link to="/register" className="lx-btn lx-btn-amber lx-btn-sm">Join now</Link>
        </div>
      </nav>

      {/* ── HERO: full-screen tour photo, centred headline, search ── */}
      <header className="lx-hero">
        <div className="lx-hero-bg" aria-hidden="true">
          {featured.length ? featured.map((t, i) => (
            <img key={t.id} src={t.image_urls[0]} alt="" className={i === slide % featured.length ? 'is-on' : ''} decoding="async" fetchPriority={i === 0 ? 'high' : 'low'} />
          )) : <div className="lx-hero-empty"><img src="/hero-logo.webp" alt="" /></div>}
          <div className="lx-hero-shade" />
        </div>

        <div className="lx-hero-copy">
          <span className="lx-pill"><Sparkles size={13} /> {tours.length ? `${tours.length} tour${tours.length === 1 ? '' : 's'} open for booking` : 'Group tours across the Philippines'}</span>
          <h1 className="lx-h1">Your next adventure<br /><i>is</i> <em>one seat away.</em></h1>
          <p className="lx-lead">Join group tours across the Philippines. Share the ride, split the cost, and discover more places.</p>

          <form className="lx-search" onSubmit={search} role="search" aria-label="Search tours">
            <label className="lx-field">
              <small>Where</small>
              <select value={form.where} onChange={(e) => setForm((f) => ({ ...f, where: e.target.value }))} aria-label="Destination">
                <option value="">Any destination</option>
                {places.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="lx-field">
              <small>When</small>
              <select value={form.when} onChange={(e) => setForm((f) => ({ ...f, when: e.target.value }))} aria-label="Month">
                <option value="">Any month</option>
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </label>
            <label className="lx-field">
              <small>Who</small>
              <select value={form.who} onChange={(e) => setForm((f) => ({ ...f, who: e.target.value }))} aria-label="Number of joiners">
                <option value="">Any group size</option>
                {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} joiner{n === 1 ? '' : 's'}</option>)}
              </select>
            </label>
            <button type="submit" className="lx-btn lx-btn-amber lx-search-go"><Search size={16} /> Search tours</button>
          </form>
        </div>

        {/* The tour in the photo, and the ones coming up */}
        {hero && (
          <div className="lx-hero-foot">
            <Link to={`/tours/${hero.id}`} className="lx-glass lx-now" key={hero.id}>
              <span className="lx-tiny">In the photo</span>
              <b>{hero.title}</b>
              <span>Leaves {shortDay(hero.start_date)}{heroLeft != null ? ` · ${heroLeft === 0 ? 'fully booked' : `${heroLeft} slot${heroLeft === 1 ? '' : 's'} left`}` : ''} · from {formatPeso(hero.price)}</span>
            </Link>
            {featured.length > 1 && (
              <div className="lx-dots" role="tablist" aria-label="Featured tours">
                {featured.map((t, i) => (
                  <button key={t.id} type="button" role="tab" aria-selected={i === slide % featured.length} aria-label={t.title}
                    className={`no-touch-size${i === slide % featured.length ? ' is-on' : ''}`} onClick={() => setSlide(i)} />
                ))}
              </div>
            )}
            <div className="lx-next">
              {upNext.map((t) => (
                <Link key={t.id} to={`/tours/${t.id}`} className="lx-glass lx-next-card">
                  <img src={t.image_urls[0]} alt="" loading="lazy" decoding="async" />
                  <span><b>{t.title}</b><small>{shortDay(t.start_date)} · from {formatPeso(t.price)}</small></span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ── TOURS ── */}
      <section id="tours" ref={listRef} className="lx-section">
        <div className="lx-wrap-wide">
          <div className="lx-head lx-head-row">
            <div>
              <span className="lx-eyebrow">Live Now</span>
              <h2 className="lx-h2">{searching ? 'Tours that match' : 'Upcoming Adventures'}</h2>
              <p className="lx-sub">
                {searching
                  ? `${shown.length} tour${shown.length === 1 ? '' : 's'}${applied.where ? ` in ${applied.where}` : ''}${applied.when ? ` in ${monthLabel(applied.when)}` : ''}${applied.who ? ` with room for ${applied.who}` : ''}.`
                  : 'Verified joiner packages, updated in real time.'}
              </p>
            </div>
            <div className="lx-head-actions">
              {searching && <button type="button" onClick={clearSearch} className="lx-btn lx-btn-ghost lx-btn-sm"><X size={14} /> Clear search</button>}
              <Link to="/tours" className="lx-btn lx-btn-ghost lx-btn-sm">Explore all <ArrowRight size={15} /></Link>
            </div>
          </div>

          {loading ? (
            <div className="lx-grid" aria-label="Loading tours" role="status">
              {[0, 1, 2].map((i) => <div key={i} className="lx-card lx-skeleton" />)}
            </div>
          ) : shown.length > 0 ? (
            <div className="lx-grid">
              {shown.map((tour) => {
                const left = slotsLeft(tour);
                return (
                  <article key={tour.id} className="lx-card">
                    <div className="lx-card-img">
                      <Link to={`/tours/${tour.id}`} aria-label={tour.title} className="lx-cover" />
                      <img src={tour.image_urls?.[0] || '/tour-placeholder.webp'} alt={tour.title} loading="lazy" decoding="async" />
                      {tour.difficulty && <span className="lx-chip">{tour.difficulty}</span>}
                      {left != null && <span className={`lx-chip lx-chip-right${left <= 5 ? ' is-low' : ''}`}>{left === 0 ? 'Fully booked' : `${left} slot${left === 1 ? '' : 's'} left`}</span>}
                    </div>
                    <div className="lx-card-body">
                      <h3 className="lx-h3">{tour.title}</h3>
                      <p className="lx-meta lx-meta-amber"><MapPin size={14} /> {tour.destination}</p>
                      <p className="lx-meta"><Calendar size={15} /> {`${formatDate(tour.start_date)} (${weekdayRange(tour.start_date, tour.duration)})` + (tour.dates?.length > 1 ? `  +${tour.dates.length - 1} more date${tour.dates.length > 2 ? 's' : ''}` : '')}</p>
                      <p className="lx-meta"><Clock size={15} /> {tour.duration}</p>
                      <p className="lx-meta"><Users size={15} /> {tour.group_size} max pax</p>
                      <div className="lx-card-foot">
                        <div>
                          <div className="lx-tiny">Starts at</div>
                          <PriceTag tour={tour} size={24} color="#F5F1EC" mutedColor="rgba(245,241,236,0.6)" align="flex-start" style={{ letterSpacing: '-0.03em' }} />
                        </div>
                        <Link to={`/tours/${tour.id}`} className="lx-btn lx-btn-amber lx-btn-sm">Book now</Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="lx-empty">
              <p>{searching ? 'No tours match that search yet.' : 'Check back soon for new dates!'}</p>
              {searching && <button type="button" onClick={clearSearch} className="lx-btn lx-btn-amber lx-btn-sm">Show all tours</button>}
            </div>
          )}
        </div>
      </section>

      {/* ── WHAT IS A JOINER TOUR + TOUR TYPES ── */}
      <section className="lx-section">
        <div className="lx-wrap">
          <div className="lx-head lx-center lx-narrow">
            <span className="lx-eyebrow">New to this?</span>
            <h2 className="lx-h2">What is a Joiner Tour?</h2>
            <p className="lx-body-lg">
              A Joiner is a solo traveler or small group who shares a tour package with others — splitting transport and accommodation costs. Check live seat availability, full pricing, and itinerary details all in one place.
            </p>
          </div>
          <div className="lx-head lx-center lx-gap-top">
            <h2 className="lx-h2 lx-h2-sm">Choose Your Tour Type</h2>
            <p className="lx-sub">Solo, barkada, or custom — there's a fit for every kind of traveler.</p>
          </div>
          <div className="lx-grid">
            {[
              { icon: <Users size={26} strokeWidth={1.7} />, title: 'Joiner Tour', desc: 'Share a van and accommodation with other travelers. Perfect for solo adventurers on a budget.', tag: 'Most Popular' },
              { icon: <MapIcon size={26} strokeWidth={1.7} />, title: 'Private Tour', desc: 'Book the entire vehicle for your group. Keep your itinerary private and travel at your own pace.', tag: 'For Groups' },
              { icon: <Globe size={26} strokeWidth={1.7} />, title: 'Request a Tour', desc: 'Have a destination in mind that isn\'t listed? Submit a custom request and we\'ll price it for you.', tag: 'Custom' },
            ].map((t) => (
              <div key={t.title} className="lx-panel lx-lift">
                <div className="lx-icon">{t.icon}</div>
                <div className="lx-title-row"><h3 className="lx-h3">{t.title}</h3><span className="lx-tag">{t.tag}</span></div>
                <p className="lx-body">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW TO BOOK ── */}
      <section id="how" className="lx-section">
        <div className="lx-wrap">
          <div className="lx-head lx-center">
            <span className="lx-eyebrow">Simple Process</span>
            <h2 className="lx-h2">How to Book</h2>
            <p className="lx-sub">No more chaotic Facebook threads. Confirm your seat in minutes.</p>
          </div>
          <div className="lx-grid lx-steps">
            {[
              { icon: <MapIcon size={24} strokeWidth={1.7} />, num: '01', title: 'Browse a Tour', desc: 'See prices, itineraries, remaining seats, and verified agency info before committing.' },
              { icon: <CreditCard size={24} strokeWidth={1.7} />, num: '02', title: 'Book & Pay via GCash', desc: 'Secure your slot instantly. Your seat is confirmed the moment payment clears.' },
              { icon: <CheckCircle size={24} strokeWidth={1.7} />, num: '03', title: 'Get Confirmation', desc: 'Receive a digital receipt right away and an email reminder 24 hours before departure.' },
            ].map((s) => (
              <div key={s.num} className="lx-step">
                <span className="lx-step-num">{s.num}</span>
                <div className="lx-icon">{s.icon}</div>
                <h3 className="lx-h3">{s.title}</h3>
                <p className="lx-body">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LandingReviews />

      {/* ── WHY CHOOSE US ── */}
      <section id="why" className="lx-section">
        <div className="lx-wrap">
          <div className="lx-head lx-center">
            <span className="lx-eyebrow">Why Us</span>
            <h2 className="lx-h2">Built for Smarter, Safer Journeys</h2>
          </div>
          <div className="lx-grid lx-grid-4">
            {[
              { icon: <ShieldCheck size={22} strokeWidth={1.8} />, title: 'Verified Safety', text: 'Driver names, plate numbers, and medical disclaimers shown for every trip.' },
              { icon: <Clock size={22} strokeWidth={1.8} />, title: 'ETA Tracking', text: 'Know exactly when your vehicle is arriving at the pickup point.' },
              { icon: <Calendar size={22} strokeWidth={1.8} />, title: 'Live Availability', text: 'Open dates, remaining seats, and full pricing — updated in real time.' },
              { icon: <Smartphone size={22} strokeWidth={1.8} />, title: 'No More Facebook Chaos', text: 'Confirm your booking instantly without waiting on DMs or comment threads.' },
            ].map((item) => (
              <div key={item.title} className="lx-panel lx-lift">
                <div className="lx-icon lx-icon-sm">{item.icon}</div>
                <h4 className="lx-h4">{item.title}</h4>
                <p className="lx-body">{item.text}</p>
              </div>
            ))}
          </div>
          <div className="lx-safety">
            <div>
              <h3 className="lx-h3 lx-h3-lg">Safety & Transparency</h3>
              <p className="lx-body">
                Building trust is our priority, especially for solo travelers. Organizer accountability details are always visible, and medical term acceptance is required before every booking.
              </p>
            </div>
            <div className="lx-checks">
              {['Non-refundable deposit policy protects both parties.', 'Automatic email reminder sent 24 hours before departure.'].map((item) => (
                <p key={item}><CheckCircle size={17} /> {item}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT & CONTACT ── */}
      <section id="contact" className="lx-section">
        <div className="lx-wrap lx-about">
          <div>
            <span className="lx-eyebrow">About</span>
            <h2 className="lx-h2 lx-about-title">Bandang <em>IBAYO.</em></h2>
            <p className="lx-body-lg">
              A local travel agency from Bulacan on a mission to help Filipinos explore the country. By modernizing our booking process, every trip is secure, organized, and stress-free from day one.
            </p>
          </div>
          <div className="lx-contact">
            <h3 className="lx-h3 lx-h3-lg">Contact Our Coordinator</h3>
            <p className="lx-meta lx-meta-lg"><Mail size={18} /> {AGENCY.email}</p>
            <p className="lx-meta lx-meta-lg"><MapPin size={18} /> {AGENCY.address}</p>
            <div className="lx-contact-buttons">
              <a href={AGENCY.facebook} target="_blank" rel="noreferrer" className="lx-btn lx-btn-ghost lx-btn-sm"><FaFacebook size={17} /> Facebook</a>
              {/* Tapping it on a phone starts a call. */}
              <a href={`tel:${AGENCY.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${AGENCY.name} at ${AGENCY.phone}`} className="lx-btn lx-btn-ghost lx-btn-sm"><Phone size={16} /> {AGENCY.phone}</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── CALL TO ACTION + FOOTER ── */}
      <section className="lx-section lx-cta-wrap">
        <div className="lx-cta">
          <h2 className="lx-h2">Ready when you are.</h2>
          <p className="lx-sub">Create your account and book your first seat in minutes.</p>
          <div className="lx-cta-buttons">
            <Link to="/register" className="lx-btn lx-btn-amber">Join now</Link>
            <Link to="/login" className="lx-btn lx-btn-ghost">Log in</Link>
          </div>
        </div>
      </section>
      <footer className="lx-footer">
        <div className="lx-brand"><img src={logoIcon} alt="BANDANG IBAYO" /><span>Bandang IBAYO</span></div>
        <p className="lx-tiny">© 2026</p>
      </footer>

      <HelpWidget />
      <style>{PREMIUM_CSS}</style>
    </div>
  );
};

const PREMIUM_CSS = `
.lx { --bg: #0E0C0B; --panel: #171412; --line: rgba(255,255,255,0.10); --text: #F5F1EC; --muted: rgba(245,241,236,0.68); --amber: #E8A265; --amber2: #D9772F;
  position: relative; min-height: 100dvh; background: var(--bg); color: var(--text); font-family: 'Outfit', 'Inter', system-ui, sans-serif; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
.lx a { color: inherit; }
.lx em { font-style: normal; background: linear-gradient(90deg, #F2B67E, var(--amber2)); -webkit-background-clip: text; background-clip: text; color: transparent; }

/* Buttons */
.lx-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; text-decoration: none; cursor: pointer; font-family: inherit;
  font-weight: 700; font-size: 14.5px; padding: 14px 26px; border-radius: 16px; border: 1px solid transparent; transition: transform 0.2s ease, filter 0.2s ease, background 0.2s ease, border-color 0.2s ease; }
.lx-btn:hover { transform: translateY(-2px); }
.lx-btn-sm { padding: 10px 18px; font-size: 13.5px; border-radius: 999px; }
.lx-btn-amber { background: linear-gradient(180deg, #F0AE74, var(--amber2)); color: #1A0F08 !important; box-shadow: 0 10px 30px rgba(217,119,47,0.35); }
.lx-btn-amber:hover { filter: brightness(1.07); }
.lx-btn-ghost { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.16); color: var(--text) !important; }
.lx-btn-ghost:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.3); }

/* Nav */
.lx-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 18px clamp(1.25rem, 4.5vw, 4rem); transition: background 0.3s ease, padding 0.3s ease, border-color 0.3s ease; border-bottom: 1px solid transparent; }
.lx-nav.is-scrolled { background: rgba(14,12,11,0.78); -webkit-backdrop-filter: blur(18px) saturate(150%); backdrop-filter: blur(18px) saturate(150%); border-bottom-color: var(--line); padding-top: 12px; padding-bottom: 12px; }
.lx-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 800; font-size: 17px; letter-spacing: -0.02em; color: var(--text); min-width: 0; }
.lx-brand img { width: 38px; height: 38px; object-fit: contain; flex-shrink: 0; }
.lx-brand span { white-space: nowrap; }
.lx-links { display: flex; gap: clamp(16px, 2.4vw, 32px); font-size: 14px; font-weight: 500; }
.lx-links a { text-decoration: none; color: rgba(245,241,236,0.78); transition: color 0.2s; }
.lx-links a:hover { color: var(--amber); }
.lx-nav-right { display: flex; align-items: center; gap: 18px; flex-shrink: 0; }
.lx-login { font-size: 14px; font-weight: 600; text-decoration: none; color: var(--text); }
.lx-login:hover { color: var(--amber); }

/* Hero */
.lx-hero { position: relative; min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; padding: 110px clamp(1.25rem, 4.5vw, 4rem) 190px; box-sizing: border-box; overflow: hidden; }
.lx-hero-bg { position: absolute; inset: 0; z-index: 0; background: radial-gradient(ellipse at 50% 0%, #2A1A10 0%, #0E0C0B 60%); }
.lx-hero-bg > img { position: absolute; inset: -3%; width: 106%; height: 106%; max-width: none; max-height: none; object-fit: cover; opacity: 0;
  transition: opacity 1.6s ease; animation: lx-drift 24s ease-in-out infinite alternate; }
.lx-hero-bg > img.is-on { opacity: 1; }
@keyframes lx-drift { from { transform: scale(1.02); } to { transform: scale(1.1) translate3d(-1%, -1%, 0); } }
.lx-hero-empty { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6vh; opacity: 0.16; }
.lx-hero-empty img { width: min(420px, 60vw); height: auto; }
.lx-hero-shade { position: absolute; inset: 0; background:
  radial-gradient(ellipse 70% 55% at 50% 42%, rgba(14,12,11,0.62), rgba(14,12,11,0.18) 70%),
  linear-gradient(180deg, rgba(14,12,11,0.72) 0%, rgba(14,12,11,0.25) 30%, rgba(14,12,11,0.35) 62%, rgba(14,12,11,0.96) 100%); }
.lx-hero-copy { position: relative; z-index: 2; width: 100%; max-width: 980px; margin: 0 auto; text-align: center; animation: lx-rise 0.8s ease both; }
@keyframes lx-rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
.lx-pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--amber); border: 1px solid rgba(232,162,101,0.4); background: rgba(14,12,11,0.45); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
.lx-h1 { margin: 20px 0 14px; font-size: clamp(2.5rem, 6.4vw, 5.4rem); line-height: 1.02; font-weight: 700; letter-spacing: -0.045em; text-shadow: 0 4px 40px rgba(0,0,0,0.45); }
.lx-h1 i { font-style: normal; font-weight: 300; }
.lx-lead { margin: 0 auto 30px; max-width: 560px; font-size: clamp(16px, 1.5vw, 18.5px); line-height: 1.6; color: rgba(245,241,236,0.85); }

/* Search */
.lx-glass { background: rgba(20,17,15,0.5); -webkit-backdrop-filter: blur(22px) saturate(160%); backdrop-filter: blur(22px) saturate(160%); border: 1px solid rgba(255,255,255,0.18); }
.lx-search { display: inline-flex; align-items: stretch; text-align: left; border-radius: 22px; padding: 8px; gap: 0; max-width: 100%;
  background: rgba(20,17,15,0.58); -webkit-backdrop-filter: blur(24px) saturate(160%); backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 24px 60px rgba(0,0,0,0.45); }
.lx-field { display: flex; flex-direction: column; gap: 2px; padding: 8px 18px; min-width: 0; cursor: pointer; }
.lx-field + .lx-field { border-left: 1px solid rgba(255,255,255,0.14); }
.lx-field small { font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(245,241,236,0.6); }
.lx-field select { appearance: none; -webkit-appearance: none; background: transparent; border: none; outline: none; color: var(--text); font-family: inherit; font-size: 15px; font-weight: 600;
  padding: 2px 18px 2px 0; cursor: pointer; max-width: 190px; text-overflow: ellipsis;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23E8A265' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right center; }
.lx-field select option { color: #1A0F08; background: #FFFFFF; }
.lx-field:focus-within small { color: var(--amber); }
.lx-search-go { margin-left: 8px; border-radius: 16px; padding: 0 24px; }

/* Hero foot: the tour in the photo + next departures */
.lx-hero-foot { position: absolute; z-index: 2; left: clamp(1.25rem, 4.5vw, 4rem); right: max(104px, clamp(1.25rem, 4.5vw, 4rem)); bottom: 34px; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.lx-now { display: flex; flex-direction: column; gap: 3px; padding: 14px 18px; border-radius: 20px; text-decoration: none; text-align: left; max-width: 380px; animation: lx-rise 0.5s ease both; transition: border-color 0.2s; }
.lx-now:hover, .lx-next-card:hover { border-color: rgba(232,162,101,0.6); }
.lx-now b { font-size: 16px; font-weight: 700; }
.lx-now span:last-child { font-size: 13px; color: var(--muted); }
.lx-tiny { font-size: 10.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(245,241,236,0.6); margin: 0; }
.lx-now .lx-tiny { color: var(--amber); }
.lx-dots { display: flex; gap: 8px; align-items: center; padding-bottom: 8px; }
.lx-dots button { width: 26px; height: 4px; padding: 0; border: none; border-radius: 4px; background: rgba(255,255,255,0.3); cursor: pointer; transition: width 0.3s, background 0.3s; }
.lx-dots button.is-on { width: 46px; background: var(--amber); }
.lx-next { display: flex; gap: 12px; }
.lx-next-card { display: flex; align-items: center; gap: 12px; padding: 8px 16px 8px 8px; border-radius: 18px; text-decoration: none; max-width: 250px; transition: border-color 0.2s; }
.lx-next-card img { width: 58px; height: 58px; border-radius: 12px; object-fit: cover; flex-shrink: 0; }
.lx-next-card span { display: flex; flex-direction: column; min-width: 0; text-align: left; }
.lx-next-card b { font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lx-next-card small { font-size: 12px; color: var(--muted); }

/* Sections */
.lx-section { padding: clamp(3.5rem, 7vw, 6.5rem) clamp(1.25rem, 4.5vw, 4rem); scroll-margin-top: 60px; }
.lx-wrap { max-width: 1150px; margin: 0 auto; }
.lx-wrap-wide { max-width: 1280px; margin: 0 auto; }
.lx-head { margin-bottom: 2.4rem; }
.lx-head-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.lx-head-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.lx-center { text-align: center; }
.lx-narrow { max-width: 720px; margin-left: auto; margin-right: auto; }
.lx-gap-top { margin-top: clamp(3rem, 6vw, 5rem); }
.lx-eyebrow { display: inline-block; font-size: 11.5px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: var(--amber); }
.lx-h2 { margin: 10px 0 8px; font-size: clamp(1.9rem, 3.6vw, 3rem); font-weight: 700; letter-spacing: -0.04em; line-height: 1.08; color: var(--text); }
.lx-h2-sm { font-size: clamp(1.6rem, 2.8vw, 2.3rem); }
.lx-h3 { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.25; color: var(--text); }
.lx-h3-lg { font-size: 23px; margin-bottom: 12px; }
.lx-h4 { margin: 16px 0 6px; font-size: 16.5px; font-weight: 700; color: var(--text); }
.lx-sub { margin: 0; font-size: 15.5px; color: var(--muted); }
.lx-body { margin: 0; font-size: 15px; line-height: 1.7; color: var(--muted); }
.lx-body-lg { margin: 0; font-size: 17.5px; line-height: 1.8; color: rgba(245,241,236,0.8); }
.lx-meta { display: flex; align-items: center; gap: 8px; margin: 6px 0 0; font-size: 14px; color: rgba(245,241,236,0.78); }
.lx-meta svg { color: var(--amber); flex-shrink: 0; }
.lx-meta-amber { color: var(--amber); font-weight: 600; margin-bottom: 8px; }
.lx-meta-lg { font-size: 15.5px; font-weight: 600; color: var(--text); margin: 0; gap: 12px; }
.lx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 22px; }
.lx-grid-4 { grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }

/* Tour cards */
.lx-card { border-radius: 26px; overflow: hidden; background: var(--panel); border: 1px solid var(--line); display: flex; flex-direction: column; transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease; }
.lx-card:hover { transform: translateY(-6px); border-color: rgba(232,162,101,0.45); box-shadow: 0 26px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(232,162,101,0.15); }
.lx-card-img { position: relative; height: 230px; overflow: hidden; background: #1F1A17; }
.lx-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.7s ease; }
.lx-card:hover .lx-card-img img { transform: scale(1.06); }
.lx-card-img::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(14,12,11,0.25), transparent 35%, rgba(23,20,18,0.9)); pointer-events: none; }
.lx-cover { position: absolute; inset: 0; z-index: 2; }
.lx-chip { position: absolute; z-index: 3; top: 14px; left: 14px; padding: 6px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--text); background: rgba(14,12,11,0.55); border: 1px solid rgba(255,255,255,0.2); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
.lx-chip-right { left: auto; right: 14px; }
.lx-chip.is-low { background: var(--amber2); border-color: transparent; color: #1A0F08; }
.lx-card-body { padding: 20px 22px 22px; flex: 1; display: flex; flex-direction: column; }
.lx-card-body .lx-h3 { margin-bottom: 4px; font-size: 20px; }
.lx-card-foot { margin-top: auto; padding-top: 18px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.lx-card-foot > div { margin-top: 16px; }
.lx-skeleton { height: 430px; background: linear-gradient(100deg, #171412 30%, #221d1a 50%, #171412 70%); background-size: 200% 100%; animation: lx-shine 1.4s linear infinite; }
@keyframes lx-shine { to { background-position: -200% 0; } }
.lx-empty { border-radius: 26px; padding: 4rem 1.5rem; text-align: center; border: 1px dashed rgba(232,162,101,0.35); display: flex; flex-direction: column; align-items: center; gap: 16px; }
.lx-empty p { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--amber); }

/* Panels */
.lx-panel { border-radius: 24px; padding: 28px 26px; background: var(--panel); border: 1px solid var(--line); }
.lx-lift { transition: transform 0.25s ease, border-color 0.25s ease; }
.lx-lift:hover { transform: translateY(-4px); border-color: rgba(232,162,101,0.4); }
.lx-icon { width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; color: var(--amber);
  background: rgba(232,162,101,0.12); border: 1px solid rgba(232,162,101,0.28); }
.lx-icon-sm { width: 46px; height: 46px; border-radius: 14px; margin-bottom: 0; }
.lx-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.lx-tag { font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--amber); padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(232,162,101,0.4); }
.lx-steps { gap: 0; border: 1px solid var(--line); border-radius: 26px; overflow: hidden; background: var(--panel); grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); }
.lx-step { position: relative; padding: 32px 30px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); margin: 0 -1px -1px 0; }
.lx-step .lx-h3 { margin-bottom: 8px; }
.lx-step-num { position: absolute; top: 22px; right: 26px; font-size: 54px; font-weight: 800; letter-spacing: -0.05em; line-height: 1; color: transparent; -webkit-text-stroke: 1px rgba(232,162,101,0.4); }
.lx-safety { margin-top: 22px; display: grid; grid-template-columns: 1.3fr 1fr; gap: clamp(1.25rem, 4vw, 3rem); align-items: center; padding: clamp(1.5rem, 4vw, 2.5rem); border-radius: 26px;
  background: linear-gradient(120deg, rgba(232,162,101,0.16), rgba(217,119,47,0.05)); border: 1px solid rgba(232,162,101,0.28); }
.lx-checks { display: flex; flex-direction: column; gap: 14px; }
.lx-checks p { display: flex; gap: 12px; align-items: flex-start; margin: 0; font-size: 14.5px; line-height: 1.6; color: var(--text); }
.lx-checks svg { color: var(--amber); flex-shrink: 0; margin-top: 2px; }
.lx-about { display: grid; grid-template-columns: 1.2fr 1fr; gap: clamp(1.5rem, 4vw, 3.5rem); align-items: center; }
.lx-about-title { font-size: clamp(2.4rem, 4.4vw, 3.8rem); margin-bottom: 18px; }
.lx-contact { display: flex; flex-direction: column; gap: 14px; padding: clamp(1.5rem, 3vw, 2.25rem); border-radius: 26px; background: var(--panel); border: 1px solid var(--line); }
.lx-contact-buttons { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }

/* Reviews: their cards go dark too */
.lx-reviews article { background: var(--panel) !important; border: 1px solid var(--line) !important; box-shadow: none !important; border-radius: 24px !important; }
.lx-reviews article p, .lx-reviews article strong { color: var(--text) !important; }
.lx-reviews article span { color: var(--muted) !important; }

/* Call to action + footer */
.lx-cta-wrap { padding-top: 0; }
.lx-cta { max-width: 1150px; margin: 0 auto; text-align: center; padding: clamp(2.5rem, 6vw, 4.5rem) 1.5rem; border-radius: 32px; border: 1px solid rgba(232,162,101,0.25);
  background: radial-gradient(ellipse at 50% 0%, rgba(217,119,47,0.3), rgba(23,20,18,0.9) 65%); }
.lx-cta-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 24px; }
.lx-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 22px clamp(1.25rem, 4.5vw, 4rem) 26px; border-top: 1px solid var(--line); padding-right: max(96px, clamp(1.25rem, 4.5vw, 4rem)); }

.lx a:focus-visible, .lx button:focus-visible, .lx select:focus-visible { outline: 3px solid var(--amber); outline-offset: 3px; border-radius: 8px; }

@media (max-width: 1000px) {
  .lx-links { display: none; }
  .lx-next { display: none; }
  .lx-safety, .lx-about { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .lx-hero { padding: 96px 1.25rem 150px; }
  .lx-search { display: flex; flex-direction: column; width: 100%; border-radius: 24px; }
  .lx-field { padding: 10px 14px; }
  .lx-field + .lx-field { border-left: none; border-top: 1px solid rgba(255,255,255,0.14); }
  .lx-field select { max-width: none; width: 100%; font-size: 16px; }
  .lx-search-go { margin: 8px 0 0; padding: 14px; }
  .lx-hero-foot { bottom: 22px; }
  .lx-now { max-width: none; flex: 1; }
  .lx-dots { display: none; }
  .lx-brand span { font-size: 15px; }
  .lx-brand img { width: 32px; height: 32px; }
  .lx-step-num { font-size: 40px; }
}
@media (max-width: 420px) { .lx-login { display: none; } }
@media (prefers-reduced-motion: reduce) {
  .lx-hero-bg > img, .lx-hero-copy, .lx-now, .lx-skeleton { animation: none !important; }
  .lx-hero-bg > img { transition: none; }
}
`;

export default LandingPremium;
