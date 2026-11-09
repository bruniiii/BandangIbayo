import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook } from 'react-icons/fa';
import {
  MapPin, Calendar, Users, Clock, CheckCircle, ShieldCheck, Smartphone, Map as MapIcon, CreditCard, Globe, Mail, Phone, ArrowRight,
} from 'lucide-react';
import { supabase } from './supabaseClient';
import logoIcon from './assets/logo.png';
import HelpWidget from './ui/HelpWidget';
import { todayManila, groupTripDates, weekdayRange } from './tourUtils';
import { ReviewCard } from './ui/ReviewCards';
import PriceTag from './ui/PriceTag';
import { usePublicReviews } from './publicReviews';
import { SkeletonTourCards } from './ui/Skeleton';
import { reportError } from './ui/toast';

// ─────────────────────────────────────────────
// LANDING PAGE, Y2K style: a deep-night background with holographic
// (pink, cyan, lavender, peach) glows, a retro perspective grid, twinkling
// ✦ sparkles, chrome headings, glossy bubble buttons, iridescent card
// borders, a scrolling ticker and old-computer "window" panels.
// Same text, sections and links as the original (LandingClassic.jsx).
// All styles live in Y2K_CSS below, scoped under .y2k.
// ─────────────────────────────────────────────

const formatDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${month}-${day}-${year}`;
};

// The bubbly display font, loaded only on this page.
const useY2KFont = () => {
  useEffect(() => {
    if (document.getElementById('y2k-font')) return;
    const link = document.createElement('link');
    link.id = 'y2k-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&display=swap';
    document.head.appendChild(link);
  }, []);
};

// Four-point sparkles scattered around the page.
const SPARKS = [
  [6, 14, 18, 0], [88, 10, 26, 1.2], [72, 34, 14, 0.6], [14, 58, 22, 2], [93, 62, 16, 0.3], [48, 8, 12, 1.6], [30, 86, 20, 0.9], [80, 88, 14, 2.4],
];
const Spark = ({ size = 18, style, className = '' }) => (
  <svg className={`y2k-spark ${className}`} width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true">
    <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill="currentColor" />
  </svg>
);

// An old-computer window: a title bar with three dots, then the content.
const Window = ({ title, children, className = '' }) => (
  <div className={`y2k-window ${className}`}>
    <div className="y2k-window-bar">
      <span className="y2k-dots" aria-hidden="true"><i /><i /><i /></span>
      <span className="y2k-window-title">{title}</span>
    </div>
    <div className="y2k-window-body">{children}</div>
  </div>
);

const Ticker = () => {
  const words = ['Join group tours', 'Share the ride', 'Split the cost', 'Discover more places', 'Book & pay online', 'Live van tracking'];
  const row = words.map((w) => <span key={w}>{w} <Spark size={14} /></span>);
  return (
    <div className="y2k-ticker" aria-hidden="true">
      <div className="y2k-ticker-track">{row}{row}</div>
    </div>
  );
};

// What joiners say: recent 4–5★ reviews with a comment. Hidden until there are reviews to show.
const LandingReviews = () => {
  const reviews = usePublicReviews(6);
  if (!reviews || reviews.length === 0) return null;
  return (
    <section className="y2k-section">
      <div className="y2k-wrap">
        <div className="y2k-head y2k-center">
          <span className="y2k-eyebrow"><Spark size={12} /> Joiner Stories <Spark size={12} /></span>
          <h2 className="y2k-h2">What Our Joiners Say</h2>
          <p className="y2k-sub">Reviews from joiners who have finished a tour with us.</p>
        </div>
        <div className="y2k-grid y2k-reviews">
          {reviews.map((r) => <div key={r.id} className="y2k-holo-border"><ReviewCard review={r} /></div>)}
        </div>
      </div>
    </section>
  );
};

const LandingY2K = () => {
  useY2KFont();
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

  return (
    <div className="y2k">
      {/* Background: holographic glows + sparkles */}
      <div className="y2k-bg" aria-hidden="true">
        <div className="y2k-blob y2k-blob-a" /><div className="y2k-blob y2k-blob-b" /><div className="y2k-blob y2k-blob-c" />
        {SPARKS.map(([x, y, s, d], i) => <Spark key={i} size={s} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />)}
      </div>

      {/* ── NAV ── */}
      <nav className="y2k-nav">
        <Link to="/" className="y2k-brand" aria-label="Bandang IBAYO home">
          <img src={logoIcon} alt="BANDANG IBAYO" className="y2k-brand-logo" />
          <span className="y2k-brand-text">Bandang <b>IBAYO</b></span>
        </Link>
        <div className="y2k-nav-links">
          <Link to="/login" className="y2k-nav-login">Log in</Link>
          <Link to="/register" className="y2k-btn y2k-btn-pink y2k-btn-sm">Join Now</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="y2k-hero">
        <div className="y2k-grid-floor" aria-hidden="true" />
        <div className="y2k-hero-inner">
          <div className="y2k-hero-copy">
            <span className="y2k-sticker"><Spark size={13} /> Group tours across the Philippines</span>
            <h1 className="y2k-h1">
              <span className="y2k-chrome">Explore</span><br />
              <span className="y2k-holo-text">More</span><br />
              <span className="y2k-chrome y2k-h1-small">Adventures.</span>
            </h1>
            <p className="y2k-lead">Join group tours across the Philippines. Share the ride, split the cost, and discover more places.</p>
            <div className="y2k-hero-buttons">
              <Link to="/login" className="y2k-btn y2k-btn-pink">Log In</Link>
              <Link to="/tours" className="y2k-btn y2k-btn-chrome">Browse Tours <ArrowRight size={16} /></Link>
            </div>
          </div>

          <div className="y2k-orb-wrap" aria-hidden="true">
            <div className="y2k-ring" />
            <div className="y2k-ring y2k-ring-2" />
            <div className="y2k-orb">
              <img src="/hero-logo.webp" alt="" width={300} height={300} fetchPriority="high" decoding="async" />
            </div>
            <Spark size={34} className="y2k-orbit y2k-orbit-a" />
            <Spark size={22} className="y2k-orbit y2k-orbit-b" />
          </div>
        </div>
      </header>

      <Ticker />

      {/* ── FEATURED TOURS ── */}
      <section className="y2k-section">
        <div className="y2k-wrap-wide">
          <div className="y2k-head y2k-head-row">
            <div>
              <span className="y2k-eyebrow"><Spark size={12} /> Live Now</span>
              <h2 className="y2k-h2">Upcoming Adventures</h2>
              <p className="y2k-sub">Verified joiner packages, updated in real time.</p>
            </div>
            <Link to="/tours" className="y2k-btn y2k-btn-chrome y2k-btn-sm">Explore All <ArrowRight size={15} /></Link>
          </div>

          {loading ? (
            <div className="y2k-skeleton"><SkeletonTourCards count={3} imageHeight={220} /></div>
          ) : tours.length > 0 ? (
            <div className="y2k-grid">
              {tours.map((tour) => (
                <article key={tour.id} className="y2k-card y2k-holo-border">
                  <div className="y2k-card-inner">
                    <div className="y2k-card-img">
                      <Link to={`/tours/${tour.id}`} aria-label={tour.title} className="y2k-cover-link" />
                      <img src={tour.image_urls?.[0] || '/tour-placeholder.webp'} alt={tour.title} loading="lazy" decoding="async" />
                      {tour.difficulty && <span className="y2k-pill">{tour.difficulty}</span>}
                    </div>
                    <div className="y2k-card-body">
                      <h3 className="y2k-h3">{tour.title}</h3>
                      <p className="y2k-meta y2k-meta-accent"><MapPin size={14} /> {tour.destination}</p>
                      <p className="y2k-meta"><Calendar size={15} /> {`${formatDate(tour.start_date)} (${weekdayRange(tour.start_date, tour.duration)})` + (tour.dates?.length > 1 ? `  +${tour.dates.length - 1} more date${tour.dates.length > 2 ? 's' : ''}` : '')}</p>
                      <p className="y2k-meta"><Clock size={15} /> {tour.duration}</p>
                      <p className="y2k-meta"><Users size={15} /> {tour.group_size} max pax</p>
                      <div className="y2k-card-foot">
                        <div className="y2k-tiny">Starts at</div>
                        <PriceTag tour={tour} size={26} color="#FFFFFF" mutedColor="rgba(255,255,255,0.7)" align="flex-start" style={{ letterSpacing: '-0.03em' }} />
                        <Link to={`/tours/${tour.id}`} className="y2k-btn y2k-btn-pink y2k-btn-block">Book Now</Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Window title="tours.exe">
              <p className="y2k-empty">Check back soon for new dates!</p>
            </Window>
          )}
        </div>
      </section>

      {/* ── WHAT IS A JOINER TOUR ── */}
      <section className="y2k-section">
        <div className="y2k-wrap-narrow">
          <Window title="what_is_a_joiner_tour.txt">
            <div className="y2k-center">
              <span className="y2k-eyebrow">New to this?</span>
              <h2 className="y2k-h2">What is a Joiner Tour?</h2>
              <p className="y2k-body-lg">
                A Joiner is a solo traveler or small group who shares a tour package with others — splitting transport and accommodation costs. Check live seat availability, full pricing, and itinerary details all in one place.
              </p>
            </div>
          </Window>
        </div>
      </section>

      {/* ── TOUR TYPES ── */}
      <section className="y2k-section">
        <div className="y2k-wrap">
          <div className="y2k-head y2k-center">
            <h2 className="y2k-h2">Choose Your Tour Type</h2>
            <p className="y2k-sub">Solo, barkada, or custom — there's a fit for every kind of traveler.</p>
          </div>
          <div className="y2k-grid">
            {[
              { icon: <Users size={30} strokeWidth={1.8} />, title: 'Joiner Tour', desc: 'Share a van and accommodation with other travelers. Perfect for solo adventurers on a budget.', tag: 'Most Popular', tone: 'pink' },
              { icon: <MapIcon size={30} strokeWidth={1.8} />, title: 'Private Tour', desc: 'Book the entire vehicle for your group. Keep your itinerary private and travel at your own pace.', tag: 'For Groups', tone: 'cyan' },
              { icon: <Globe size={30} strokeWidth={1.8} />, title: 'Request a Tour', desc: 'Have a destination in mind that isn\'t listed? Submit a custom request and we\'ll price it for you.', tag: 'Custom', tone: 'lime' },
            ].map((t) => (
              <div key={t.title} className={`y2k-holo-border y2k-lift y2k-tone-${t.tone}`}>
                <div className="y2k-card-inner y2k-pad">
                  <div className="y2k-icon">{t.icon}</div>
                  <div className="y2k-title-row">
                    <h3 className="y2k-h3">{t.title}</h3>
                    <span className="y2k-tag">{t.tag}</span>
                  </div>
                  <p className="y2k-body">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW TO BOOK ── */}
      <section className="y2k-section">
        <div className="y2k-wrap">
          <div className="y2k-head y2k-center">
            <span className="y2k-eyebrow"><Spark size={12} /> Simple Process</span>
            <h2 className="y2k-h2">How to Book</h2>
            <p className="y2k-sub">No more chaotic Facebook threads. Confirm your seat in minutes.</p>
          </div>
          <div className="y2k-grid">
            {[
              { icon: <MapIcon size={26} strokeWidth={1.8} />, num: '01', title: 'Browse a Tour', desc: 'See prices, itineraries, remaining seats, and verified agency info before committing.' },
              { icon: <CreditCard size={26} strokeWidth={1.8} />, num: '02', title: 'Book & Pay via GCash', desc: 'Secure your slot instantly. Your seat is confirmed the moment payment clears.' },
              { icon: <CheckCircle size={26} strokeWidth={1.8} />, num: '03', title: 'Get Confirmation', desc: 'Receive a digital receipt right away and an email reminder 24 hours before departure.' },
            ].map((s) => (
              <Window key={s.num} title={`step_${s.num}`}>
                <div className="y2k-step">
                  <span className="y2k-step-num">{s.num}</span>
                  <div className="y2k-icon">{s.icon}</div>
                  <h3 className="y2k-h3">{s.title}</h3>
                  <p className="y2k-body">{s.desc}</p>
                </div>
              </Window>
            ))}
          </div>
        </div>
      </section>

      <LandingReviews />

      {/* ── WHY CHOOSE US ── */}
      <section className="y2k-section">
        <div className="y2k-wrap">
          <div className="y2k-head y2k-center">
            <span className="y2k-eyebrow"><Spark size={12} /> Why Us</span>
            <h2 className="y2k-h2">Built for Smarter, Safer Journeys</h2>
          </div>
          <div className="y2k-grid y2k-grid-4">
            {[
              { icon: <ShieldCheck size={22} strokeWidth={1.9} />, title: 'Verified Safety', text: 'Driver names, plate numbers, and medical disclaimers shown for every trip.' },
              { icon: <Clock size={22} strokeWidth={1.9} />, title: 'ETA Tracking', text: 'Know exactly when your vehicle is arriving at the pickup point.' },
              { icon: <Calendar size={22} strokeWidth={1.9} />, title: 'Live Availability', text: 'Open dates, remaining seats, and full pricing — updated in real time.' },
              { icon: <Smartphone size={22} strokeWidth={1.9} />, title: 'No More Facebook Chaos', text: 'Confirm your booking instantly without waiting on DMs or comment threads.' },
            ].map((item) => (
              <div key={item.title} className="y2k-holo-border y2k-lift">
                <div className="y2k-card-inner y2k-pad">
                  <div className="y2k-icon y2k-icon-sm">{item.icon}</div>
                  <h4 className="y2k-h4">{item.title}</h4>
                  <p className="y2k-body">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="y2k-safety">
            <div>
              <h3 className="y2k-h3 y2k-h3-lg">Safety & Transparency</h3>
              <p className="y2k-body">
                Building trust is our priority, especially for solo travelers. Organizer accountability details are always visible, and medical term acceptance is required before every booking.
              </p>
            </div>
            <div className="y2k-checks">
              {['Non-refundable deposit policy protects both parties.', 'Automatic email reminder sent 24 hours before departure.'].map((item) => (
                <p key={item} className="y2k-check"><CheckCircle size={17} /> {item}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT & CONTACT ── */}
      <section className="y2k-section">
        <div className="y2k-wrap">
          <Window title="about_bandang_ibayo.html">
            <div className="y2k-about">
              <div>
                <span className="y2k-eyebrow">About</span>
                <h2 className="y2k-h2 y2k-about-title"><span className="y2k-chrome">Bandang</span><br /><span className="y2k-holo-text">IBAYO.</span></h2>
                <p className="y2k-body-lg">
                  A local travel agency from Bulacan on a mission to help Filipinos explore the country. By modernizing our booking process, every trip is secure, organized, and stress-free from day one.
                </p>
              </div>
              <div className="y2k-contact">
                <h3 className="y2k-h3 y2k-h3-lg">Contact Our Coordinator</h3>
                <p className="y2k-meta y2k-meta-lg"><Mail size={18} /> bandangibayo@gmail.com</p>
                <p className="y2k-meta y2k-meta-lg"><MapPin size={18} /> Bulacan, Philippines</p>
                <div className="y2k-contact-buttons">
                  <a href="https://facebook.com/bandangibayo" target="_blank" rel="noreferrer" className="y2k-btn y2k-btn-chrome y2k-btn-sm"><FaFacebook size={17} /> Facebook</a>
                  {/* Tapping it on a phone starts a call. */}
                  <a href="tel:+639993071958" aria-label="Call Bandang IBAYO at +63 999 307 1958" className="y2k-btn y2k-btn-chrome y2k-btn-sm"><Phone size={16} /> +63 999 307 1958</a>
                </div>
              </div>
            </div>
          </Window>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="y2k-footer">
        <div className="y2k-brand">
          <img src={logoIcon} alt="BANDANG IBAYO" className="y2k-footer-logo" />
          <span className="y2k-brand-text">Bandang <b>IBAYO</b></span>
        </div>
        <p className="y2k-tiny">© 2026 <Spark size={10} /></p>
      </footer>

      <HelpWidget />
      <style>{Y2K_CSS}</style>
    </div>
  );
};

const Y2K_CSS = `
.y2k { --pink: #FF5FD2; --cyan: #5CF2FF; --lav: #B79CFF; --lime: #C8FF5C; --peach: #FFB27A; --ink: #0D0A22;
  --holo: linear-gradient(115deg, #FF5FD2, #B79CFF 25%, #5CF2FF 50%, #C8FF5C 72%, #FFB27A 100%);
  --chrome: linear-gradient(180deg, #FFFFFF 0%, #E9E6FF 30%, #9C97C9 52%, #FFFFFF 62%, #D4D0F5 80%, #8E89BD 100%);
  position: relative; min-height: 100dvh; color: #F4F1FF; background: var(--ink); overflow-x: hidden; isolation: isolate;
  font-family: 'Outfit', 'Inter', system-ui, sans-serif; }
.y2k h1, .y2k h2, .y2k h3, .y2k h4, .y2k-brand-text, .y2k-btn, .y2k-eyebrow, .y2k-tag, .y2k-sticker, .y2k-window-title, .y2k-step-num { font-family: 'Unbounded', 'Outfit', system-ui, sans-serif; }

/* Background */
.y2k-bg { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none;
  background: radial-gradient(ellipse at 50% -10%, #2A1B66 0%, #120C33 45%, #0D0A22 75%); }
.y2k-blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.55; mix-blend-mode: screen; }
.y2k-blob-a { width: 46vw; height: 46vw; left: -12vw; top: -8vw; background: var(--pink); animation: y2k-float 16s ease-in-out infinite alternate; }
.y2k-blob-b { width: 40vw; height: 40vw; right: -10vw; top: 22vh; background: var(--cyan); opacity: 0.4; animation: y2k-float 20s ease-in-out infinite alternate-reverse; }
.y2k-blob-c { width: 38vw; height: 38vw; left: 28vw; bottom: -14vw; background: var(--lav); opacity: 0.45; animation: y2k-float 24s ease-in-out infinite alternate; }
@keyframes y2k-float { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(5vw,-6vh,0) scale(1.08); } }
.y2k-spark { position: absolute; color: #FFFFFF; filter: drop-shadow(0 0 6px rgba(255,255,255,0.9)) drop-shadow(0 0 14px var(--cyan)); animation: y2k-twinkle 2.8s ease-in-out infinite; }
.y2k-eyebrow .y2k-spark, .y2k-sticker .y2k-spark, .y2k-ticker .y2k-spark, .y2k-tiny .y2k-spark { position: static; display: inline-block; vertical-align: -1px; animation-duration: 2.2s; }
@keyframes y2k-twinkle { 0%,100% { transform: scale(0.6) rotate(0deg); opacity: 0.5; } 50% { transform: scale(1.1) rotate(45deg); opacity: 1; } }

/* Text */
.y2k-chrome { background: var(--chrome); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 2px 0 rgba(60,40,140,0.6)) drop-shadow(0 8px 24px rgba(183,156,255,0.35)); }
.y2k-holo-text { background: var(--holo); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: y2k-shift 6s linear infinite; filter: drop-shadow(0 6px 22px rgba(255,95,210,0.4)); }
@keyframes y2k-shift { to { background-position: 200% 0; } }
.y2k-h1 { font-weight: 900; font-size: clamp(2.8rem, 7vw, 6rem); line-height: 1.02; letter-spacing: -0.03em; margin: 0 0 22px; }
.y2k-h1-small { font-size: 0.78em; }
.y2k-h2 { font-weight: 900; font-size: clamp(1.7rem, 3.2vw, 2.7rem); letter-spacing: -0.02em; line-height: 1.12; margin: 10px 0 8px; color: #FFFFFF; text-shadow: 0 0 24px rgba(183,156,255,0.45); }
.y2k-h3 { font-weight: 700; font-size: 18px; line-height: 1.25; margin: 0; color: #FFFFFF; }
.y2k-h3-lg { font-size: 21px; margin-bottom: 12px; }
.y2k-h4 { font-weight: 700; font-size: 15px; margin: 14px 0 6px; color: #FFFFFF; }
.y2k-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: var(--cyan); text-shadow: 0 0 12px rgba(92,242,255,0.7); }
.y2k-lead { font-size: clamp(16px, 1.5vw, 19px); line-height: 1.7; font-weight: 500; color: rgba(244,241,255,0.86); max-width: 480px; margin: 0 0 34px; }
.y2k-sub { font-size: 15.5px; font-weight: 500; color: rgba(244,241,255,0.75); margin: 0; }
.y2k-body { font-size: 15px; line-height: 1.7; color: rgba(244,241,255,0.8); margin: 0; }
.y2k-body-lg { font-size: 17px; line-height: 1.8; color: rgba(244,241,255,0.85); margin: 0; }
.y2k-meta { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: rgba(244,241,255,0.82); margin: 6px 0 0; }
.y2k-meta svg { color: var(--cyan); flex-shrink: 0; }
.y2k-meta-accent { color: var(--pink); font-weight: 700; margin-bottom: 10px; }
.y2k-meta-accent svg { color: var(--pink); }
.y2k-meta-lg { font-size: 15px; font-weight: 600; color: #FFFFFF; margin: 0; gap: 12px; }
.y2k-tiny { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(244,241,255,0.6); margin: 0 0 2px; display: inline-flex; gap: 6px; align-items: center; }
.y2k-center { text-align: center; }

/* Buttons: glossy bubbles */
.y2k-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; text-decoration: none;
  font-weight: 700; font-size: 13px; letter-spacing: 0.04em; padding: 15px 30px; border-radius: 999px; box-sizing: border-box; overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease; }
.y2k-btn::after { content: ''; position: absolute; left: 12%; right: 12%; top: 3px; height: 42%; border-radius: 999px; background: linear-gradient(180deg, rgba(255,255,255,0.75), rgba(255,255,255,0)); pointer-events: none; }
.y2k-btn:hover { transform: translateY(-2px) scale(1.03); filter: brightness(1.08); }
.y2k-btn-sm { padding: 10px 20px; font-size: 12px; }
.y2k-btn-block { display: flex; width: 100%; margin-top: 14px; }
.y2k-btn-pink { color: #FFFFFF; background: linear-gradient(180deg, #FF8BE2, #FF4FCB 55%, #D52FA8); border: 1px solid rgba(255,255,255,0.55);
  box-shadow: 0 0 0 3px rgba(255,95,210,0.25), 0 10px 30px rgba(255,79,203,0.5), inset 0 -4px 10px rgba(120,0,90,0.35); text-shadow: 0 1px 2px rgba(120,0,90,0.5); }
.y2k-btn-chrome { color: #1B1640; background: linear-gradient(180deg, #FFFFFF, #E4E1FA 45%, #B7B2DE 55%, #F1EFFF); border: 1px solid rgba(255,255,255,0.8);
  box-shadow: 0 0 0 3px rgba(183,156,255,0.25), 0 10px 28px rgba(92,242,255,0.25), inset 0 -3px 8px rgba(80,70,140,0.25); }

/* Nav */
.y2k-nav { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 50; width: min(1200px, calc(100% - 28px)); box-sizing: border-box;
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px 8px 14px; border-radius: 999px;
  background: rgba(20,14,50,0.55); border: 1px solid rgba(255,255,255,0.22); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2); }
.y2k-brand { display: flex; align-items: center; gap: 10px; min-width: 0; text-decoration: none; color: #FFFFFF; }
.y2k-brand-logo { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; filter: drop-shadow(0 0 8px rgba(92,242,255,0.5)); }
.y2k-brand-text { font-weight: 700; font-size: 15px; letter-spacing: -0.01em; white-space: nowrap; color: #FFFFFF; }
.y2k-brand-text b { background: var(--holo); -webkit-background-clip: text; background-clip: text; color: transparent; }
.y2k-nav-links { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.y2k-nav-login { font-size: 13px; font-weight: 700; color: rgba(244,241,255,0.88); text-decoration: none; }
.y2k-nav-login:hover { color: var(--cyan); }

/* Hero */
.y2k-hero { position: relative; min-height: 100dvh; display: flex; align-items: center; padding: 110px clamp(1.25rem,5vw,4rem) 70px; box-sizing: border-box; overflow: hidden; }
.y2k-grid-floor { position: absolute; left: -50%; right: -50%; bottom: -10%; height: 55%; pointer-events: none; opacity: 0.55;
  background-image: linear-gradient(rgba(92,242,255,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,95,210,0.5) 1px, transparent 1px);
  background-size: 60px 60px; transform: perspective(500px) rotateX(62deg); transform-origin: center top;
  -webkit-mask-image: linear-gradient(to top, #000 10%, transparent 85%); mask-image: linear-gradient(to top, #000 10%, transparent 85%);
  animation: y2k-grid-move 6s linear infinite; }
@keyframes y2k-grid-move { to { background-position: 0 60px, 0 0; } }
.y2k-hero-inner { position: relative; width: 100%; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: clamp(2rem,5vw,4rem); align-items: center; }
.y2k-sticker { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; margin-bottom: 22px; border-radius: 999px; font-size: 11px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; color: #1B1640; background: linear-gradient(90deg, var(--lime), var(--cyan)); box-shadow: 0 0 22px rgba(200,255,92,0.45); transform: rotate(-2deg); }
.y2k-sticker .y2k-spark { color: #1B1640; filter: none; }
.y2k-hero-buttons { display: flex; gap: 14px; flex-wrap: wrap; }
.y2k-orb-wrap { position: relative; width: min(420px, 80vw); aspect-ratio: 1; margin: 0 auto; }
.y2k-ring { position: absolute; inset: 0; border-radius: 50%; padding: 3px; background: var(--holo);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
  animation: y2k-spin 14s linear infinite; filter: drop-shadow(0 0 18px rgba(255,95,210,0.6)); }
.y2k-ring-2 { inset: 9%; opacity: 0.6; animation-duration: 20s; animation-direction: reverse; }
.y2k-orb { position: absolute; inset: 15%; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.4), rgba(183,156,255,0.18) 40%, rgba(20,14,50,0.7) 72%);
  border: 1px solid rgba(255,255,255,0.35); box-shadow: inset 0 0 40px rgba(92,242,255,0.35), 0 0 60px rgba(183,156,255,0.4); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.y2k-orb img { width: 82%; height: auto; filter: drop-shadow(0 10px 24px rgba(0,0,0,0.45)); }
.y2k-orbit { position: absolute; color: #FFFFFF; }
.y2k-orbit-a { top: 4%; right: 10%; }
.y2k-orbit-b { bottom: 10%; left: 4%; animation-delay: 1.1s; }
@keyframes y2k-spin { to { transform: rotate(360deg); } }

/* Ticker */
.y2k-ticker { overflow: hidden; border-top: 1px solid rgba(255,255,255,0.25); border-bottom: 1px solid rgba(255,255,255,0.25);
  background: linear-gradient(90deg, rgba(255,95,210,0.35), rgba(183,156,255,0.35), rgba(92,242,255,0.35)); }
.y2k-ticker-track { display: flex; width: max-content; animation: y2k-marquee 30s linear infinite; }
.y2k-ticker-track span { display: inline-flex; align-items: center; gap: 22px; padding: 14px 22px 14px 0; font-family: 'Unbounded', 'Outfit', sans-serif; font-weight: 700;
  font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase; color: #FFFFFF; white-space: nowrap; text-shadow: 0 0 12px rgba(255,255,255,0.6); }
@keyframes y2k-marquee { to { transform: translateX(-50%); } }

/* Sections and cards */
.y2k-section { padding: clamp(3.5rem,7vw,6rem) clamp(1.25rem,5vw,4rem); }
.y2k-wrap { max-width: 1150px; margin: 0 auto; }
.y2k-wrap-wide { max-width: 1280px; margin: 0 auto; }
.y2k-wrap-narrow { max-width: 780px; margin: 0 auto; }
.y2k-head { margin-bottom: 2.4rem; }
.y2k-head-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.y2k-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(290px, 100%), 1fr)); gap: 24px; }
.y2k-grid-4 { grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }
/* Iridescent border: a holographic gradient frame around a dark glassy inside. */
.y2k-holo-border { position: relative; border-radius: 26px; padding: 2px; background: var(--holo); background-size: 200% 200%;
  box-shadow: 0 0 26px rgba(183,156,255,0.25), 0 18px 40px rgba(0,0,0,0.35); animation: y2k-shift 10s linear infinite; }
.y2k-card-inner { height: 100%; box-sizing: border-box; border-radius: 24px; overflow: hidden; display: flex; flex-direction: column;
  background: linear-gradient(160deg, rgba(42,30,96,0.92), rgba(16,11,40,0.95)); }
.y2k-pad { padding: 28px 26px; }
.y2k-lift { transition: transform 0.25s ease, box-shadow 0.25s ease; }
.y2k-lift:hover, .y2k-card:hover { transform: translateY(-6px) rotate(-0.5deg); box-shadow: 0 0 40px rgba(255,95,210,0.45), 0 24px 50px rgba(0,0,0,0.45); }
.y2k-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
.y2k-card-img { position: relative; height: 200px; overflow: hidden; }
.y2k-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.6s ease; }
.y2k-card:hover .y2k-card-img img { transform: scale(1.07); }
.y2k-cover-link { position: absolute; inset: 0; z-index: 2; }
.y2k-pill { position: absolute; top: 14px; left: 14px; z-index: 3; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #1B1640;
  padding: 6px 12px; border-radius: 999px; background: linear-gradient(180deg, #FFFFFF, #D9D4FA); box-shadow: 0 0 14px rgba(92,242,255,0.6); }
.y2k-card-body { padding: 20px 22px 22px; flex: 1; display: flex; flex-direction: column; }
.y2k-card-body .y2k-h3 { margin-bottom: 6px; }
.y2k-card-foot { margin-top: auto; padding-top: 16px; border-top: 1px dashed rgba(255,255,255,0.22); margin-top: 18px; }
.y2k-icon { width: 54px; height: 54px; border-radius: 18px; display: flex; align-items: center; justify-content: center; color: #FFFFFF;
  background: linear-gradient(145deg, var(--pink), var(--lav) 55%, var(--cyan)); box-shadow: 0 0 20px rgba(255,95,210,0.45), inset 0 2px 0 rgba(255,255,255,0.5); margin-bottom: 16px; }
.y2k-icon-sm { width: 46px; height: 46px; border-radius: 15px; margin-bottom: 0; }
.y2k-tone-cyan .y2k-icon { background: linear-gradient(145deg, var(--cyan), var(--lav)); box-shadow: 0 0 20px rgba(92,242,255,0.5), inset 0 2px 0 rgba(255,255,255,0.5); }
.y2k-tone-lime .y2k-icon { background: linear-gradient(145deg, var(--lime), var(--cyan)); color: #1B1640; box-shadow: 0 0 20px rgba(200,255,92,0.45), inset 0 2px 0 rgba(255,255,255,0.5); }
.y2k-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.y2k-tag { font-size: 9.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #1B1640; background: var(--lime); padding: 4px 10px; border-radius: 999px; transform: rotate(-3deg); }
.y2k-tone-pink .y2k-tag { background: var(--pink); color: #FFFFFF; }
.y2k-tone-cyan .y2k-tag { background: var(--cyan); }

/* Old-computer windows */
.y2k-window { border-radius: 18px; overflow: hidden; border: 2px solid rgba(255,255,255,0.7);
  background: linear-gradient(160deg, rgba(42,30,96,0.88), rgba(16,11,40,0.92)); box-shadow: 6px 6px 0 rgba(255,95,210,0.55), 0 20px 50px rgba(0,0,0,0.4); }
.y2k-window-bar { display: flex; align-items: center; gap: 12px; padding: 9px 14px; background: linear-gradient(90deg, #6D5CFF, #B79CFF 50%, #5CF2FF); border-bottom: 2px solid rgba(255,255,255,0.7); }
.y2k-dots { display: inline-flex; gap: 6px; }
.y2k-dots i { width: 11px; height: 11px; border-radius: 50%; background: #FFFFFF; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.15); }
.y2k-dots i:nth-child(1) { background: #FF5F8A; } .y2k-dots i:nth-child(2) { background: #FFD45C; } .y2k-dots i:nth-child(3) { background: var(--lime); }
.y2k-window-title { font-size: 11px; font-weight: 700; color: #FFFFFF; letter-spacing: 0.04em; text-shadow: 0 1px 2px rgba(0,0,0,0.3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.y2k-window-body { padding: clamp(1.5rem,4vw,2.5rem); }
.y2k-step { position: relative; }
.y2k-step-num { position: absolute; top: -6px; right: 0; font-size: 40px; font-weight: 900; background: var(--holo); -webkit-background-clip: text; background-clip: text; color: transparent; opacity: 0.85; }
.y2k-step .y2k-h3 { margin-bottom: 8px; }
.y2k-empty { margin: 0; text-align: center; font-size: 13px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--cyan); }

/* Why us: safety strip */
.y2k-safety { margin-top: 24px; display: grid; grid-template-columns: 1.3fr 1fr; gap: clamp(1.25rem,4vw,3rem); align-items: center; padding: clamp(1.5rem,4vw,2.5rem);
  border-radius: 26px; background: linear-gradient(120deg, rgba(255,95,210,0.28), rgba(183,156,255,0.22) 50%, rgba(92,242,255,0.22)); border: 1px solid rgba(255,255,255,0.35);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.3), 0 18px 40px rgba(0,0,0,0.3); }
.y2k-checks { display: flex; flex-direction: column; gap: 14px; }
.y2k-check { display: flex; gap: 12px; align-items: flex-start; font-size: 14.5px; line-height: 1.6; color: #FFFFFF; margin: 0; }
.y2k-check svg { color: var(--lime); flex-shrink: 0; margin-top: 2px; filter: drop-shadow(0 0 6px rgba(200,255,92,0.7)); }

/* About */
.y2k-about { display: grid; grid-template-columns: 1.2fr 1fr; gap: clamp(1.5rem,4vw,3.5rem); align-items: center; }
.y2k-about-title { font-size: clamp(2.2rem,4vw,3.4rem); line-height: 1.02; margin-bottom: 18px; text-shadow: none; }
.y2k-contact { display: flex; flex-direction: column; gap: 14px; padding-left: clamp(1.5rem,4vw,3.5rem); border-left: 2px dashed rgba(255,255,255,0.25); }
.y2k-contact-buttons { display: flex; gap: 10px; flex-wrap: wrap; }

/* Reviews: their cards inside an iridescent frame */
.y2k-reviews .y2k-holo-border > article { background: linear-gradient(160deg, rgba(42,30,96,0.95), rgba(16,11,40,0.97)) !important; border: none !important; border-radius: 24px !important; box-shadow: none !important; }
.y2k-reviews article p, .y2k-reviews article strong { color: #FFFFFF !important; }
.y2k-reviews article span { color: rgba(244,241,255,0.75) !important; }
.y2k-skeleton { border-radius: 24px; padding: 12px; background: rgba(253,246,238,0.9); }

/* Footer */
.y2k-footer { margin: 0 clamp(1rem,4vw,3rem) 20px; padding: 12px 86px 12px 20px; border-radius: 999px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
  background: rgba(20,14,50,0.6); border: 1px solid rgba(255,255,255,0.22); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
.y2k-footer-logo { width: 46px; height: 46px; object-fit: contain; }

.y2k .help-widget-button { background: linear-gradient(180deg, #FF8BE2, #FF4FCB 55%, #D52FA8) !important; border: 1px solid rgba(255,255,255,0.55) !important;
  box-shadow: 0 0 0 3px rgba(255,95,210,0.25), 0 10px 30px rgba(255,79,203,0.5) !important; }
.y2k a:focus-visible, .y2k button:focus-visible { outline: 3px solid var(--cyan); outline-offset: 3px; }

@media (max-width: 900px) {
  .y2k-hero-inner { grid-template-columns: 1fr; }
  .y2k-orb-wrap { width: min(300px, 70vw); order: -1; }
  .y2k-safety, .y2k-about { grid-template-columns: 1fr; }
  .y2k-contact { padding-left: 0; border-left: none; padding-top: 1.5rem; border-top: 2px dashed rgba(255,255,255,0.25); }
}
@media (max-width: 640px) {
  .y2k-nav { top: 10px; padding: 6px 8px 6px 10px; }
  .y2k-brand-logo { width: 32px; height: 32px; }
  .y2k-brand-text { font-size: 12.5px; }
  .y2k-nav-links { gap: 10px; }
  .y2k-hero { padding-top: 96px; }
  .y2k-ticker-track span { font-size: 12px; }
  .y2k-step-num { font-size: 30px; }
  .y2k-footer { border-radius: 22px; }
}
@media (max-width: 480px) {
  .y2k-nav-login { display: none; }
  .y2k-h1 { font-size: 2.6rem; }
  .y2k-hero-buttons { flex-direction: column; align-items: stretch; }
  .y2k-hero-buttons .y2k-btn { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .y2k *, .y2k *::before, .y2k *::after { animation: none !important; }
}
`;

export default LandingY2K;
