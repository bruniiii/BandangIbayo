import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook } from 'react-icons/fa';
import {
  MapPin, Calendar, Users, Clock, CheckCircle, ShieldCheck, Smartphone, Map as MapIcon, CreditCard, Globe, Mail, Phone, ChevronDown, ArrowRight,
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
// LANDING PAGE: "immersive + glassmorphism" design.
//  • Behind the whole page: full-screen photos of the open tours, slowly
//    fading from one to the next (the nature photo when there are none),
//    under a dark warm overlay so white text stays readable.
//  • On top: frosted-glass panels (see the .lp-glass styles below): the
//    floating nav, the hero card, tour cards, sections and the footer.
// Same content and links as before; only the look changed.
// ─────────────────────────────────────────────

const formatDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${month}-${day}-${year}`;
};

// What joiners say: recent 4–5★ reviews with a comment. Hidden until there are reviews to show.
const LandingReviews = () => {
  const reviews = usePublicReviews(6);
  if (!reviews || reviews.length === 0) return null;
  return (
    <section className="lp-section">
      <div className="lp-wrap">
        <div className="lp-head lp-center">
          <span className="lp-eyebrow">Joiner Stories</span>
          <h2 className="lp-h2">What Our Joiners Say</h2>
          <p className="lp-sub">Reviews from joiners who have finished a tour with us.</p>
        </div>
        <div className="lp-grid lp-reviews">
          {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        </div>
      </div>
    </section>
  );
};

// Full-screen tour photos fading one into the next.
const BackdropSlides = ({ images }) => {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (images.length < 2) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), 7000);
    return () => clearInterval(t);
  }, [images.length]);
  return (
    <div className="lp-backdrop" aria-hidden="true">
      {images.map((src, i) => (
        <img key={src} src={src} alt="" className={`lp-slide${i === index ? ' is-on' : ''}`} decoding="async" fetchPriority={i === 0 ? 'high' : 'low'} />
      ))}
      <div className="lp-shade" />
      <div className="lp-orb lp-orb-a" />
      <div className="lp-orb lp-orb-b" />
    </div>
  );
};

const LandingPage = () => {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);

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

  // The floating nav gets a little more solid once the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const photos = [...new Set(tours.map((t) => t.image_urls?.[0]).filter(Boolean))].slice(0, 5);
  const backdrop = photos.length ? photos : ['/nature-bg.webp'];
  const next = tours[0];

  return (
    <div className="lp">
      <BackdropSlides images={backdrop} />

      {/* ── NAV (floating glass bar) ── */}
      <nav className={`lp-nav lp-glass${scrolled ? ' is-scrolled' : ''}`}>
        <Link to="/" className="lp-brand" aria-label="Bandang IBAYO home">
          <img src={logoIcon} alt="BANDANG IBAYO" className="lp-brand-logo" />
          <span className="lp-brand-text font-display">Bandang <span className="font-accent">IBAYO</span></span>
        </Link>
        <div className="lp-nav-links">
          <Link to="/login" className="lp-nav-login">Log in</Link>
          <Link to="/register" className="lp-btn lp-btn-amber lp-btn-sm">Join Now</Link>
        </div>
      </nav>

      {/* ── HERO (full screen) ── */}
      <header className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <span className="lp-chip lp-glass"><MapPin size={14} /> Tours across the Luzon, Philippines</span>
            <h1 className="lp-h1">
              Explore<br />
              <span className="font-accent lp-amber">More</span><br />
              <span className="font-accent lp-h1-small">Adventures</span>
            </h1>
            <p className="lp-lead">
              Join group tours across the Philippines. Share the ride, split the cost, and discover more places.
            </p>
            <div className="lp-hero-buttons">
              <Link to="/login" className="lp-btn lp-btn-amber">Log In</Link>
              <Link to="/tours" className="lp-btn lp-btn-glass">Browse Tours <ArrowRight size={16} /></Link>
            </div>
          </div>

        </div>
        <a href={next ? '#next' : '#tours'} className="lp-scroll" aria-label="Scroll down to the tours"><ChevronDown size={22} /></a>
      </header>

      {/* ── NEXT ADVENTURE (below the hero): the next open tour on a wide glass card ── */}
      {next && (
        <section id="next" className="lp-section lp-section-tight">
          <article className="lp-next lp-glass">
            <div className="lp-next-img">
              <Link to={`/tours/${next.id}`} aria-label={next.title} className="lp-cover-link" />
              <img src={next.image_urls?.[0] || '/tour-placeholder.webp'} alt={next.title} decoding="async" />
              <span className="lp-pill">Next adventure</span>
            </div>
            <div className="lp-next-body">
              <span className="lp-eyebrow">Coming up next</span>
              <h2 className="lp-h2 lp-next-title">{next.title}</h2>
              <p className="lp-meta"><MapPin size={15} /> {next.destination}</p>
              <p className="lp-meta"><Calendar size={15} /> {formatDate(next.start_date)} ({weekdayRange(next.start_date, next.duration)})</p>
              {next.duration && <p className="lp-meta"><Clock size={15} /> {next.duration}</p>}
              <div className="lp-next-foot">
                <div>
                  <div className="lp-tiny">Starts at</div>
                  <PriceTag tour={next} size={30} color="#FFFFFF" mutedColor="rgba(255,255,255,0.7)" align="flex-start" style={{ letterSpacing: '-0.03em' }} />
                </div>
                <Link to={`/tours/${next.id}`} className="lp-btn lp-btn-amber">Book Now <ArrowRight size={16} /></Link>
              </div>
            </div>
          </article>
        </section>
      )}

      {/* ── FEATURED TOURS ── */}
      <section id="tours" className="lp-section">
        <div className="lp-wrap-wide">
          <div className="lp-head lp-head-row">
            <div>
              <span className="lp-eyebrow">Live Now</span>
              <h2 className="lp-h2">Upcoming Adventures</h2>
              <p className="lp-sub">Verified joiner packages, updated in real time.</p>
            </div>
            <Link to="/tours" className="lp-btn lp-btn-glass lp-btn-sm">Explore All <ArrowRight size={15} /></Link>
          </div>

          {loading ? (
            <div className="lp-skeleton"><SkeletonTourCards count={3} imageHeight={220} /></div>
          ) : tours.length > 0 ? (
            <div className="lp-grid">
              {tours.map((tour) => (
                <article key={tour.id} className="lp-tour lp-glass">
                  <div className="lp-tour-img">
                    <Link to={`/tours/${tour.id}`} aria-label={tour.title} className="lp-cover-link" />
                    <img src={tour.image_urls?.[0] || '/tour-placeholder.webp'} alt={tour.title} loading="lazy" decoding="async" />
                    {tour.difficulty && <span className="lp-pill">{tour.difficulty}</span>}
                  </div>
                  <div className="lp-tour-body">
                    <h3 className="lp-h3">{tour.title}</h3>
                    <p className="lp-meta lp-amber"><MapPin size={14} /> {tour.destination}</p>
                    <div className="lp-tour-facts">
                      <p className="lp-meta"><Calendar size={15} /> {`${formatDate(tour.start_date)} (${weekdayRange(tour.start_date, tour.duration)})` + (tour.dates?.length > 1 ? `  +${tour.dates.length - 1} more date${tour.dates.length > 2 ? 's' : ''}` : '')}</p>
                      <p className="lp-meta"><Clock size={15} /> {tour.duration}</p>
                      <p className="lp-meta"><Users size={15} /> {tour.group_size} max pax</p>
                    </div>
                    <div className="lp-tour-foot">
                      <div className="lp-tiny">Starts at</div>
                      <PriceTag tour={tour} size={26} color="#FFFFFF" mutedColor="rgba(255,255,255,0.7)" align="flex-start" style={{ letterSpacing: '-0.03em' }} />
                      <Link to={`/tours/${tour.id}`} className="lp-btn lp-btn-amber lp-btn-block">Book Now</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="lp-empty lp-glass">
              <p>Check back soon for new dates!</p>
            </div>
          )}
        </div>
      </section>

      {/* ── WHAT IS A JOINER TOUR ── */}
      <section className="lp-section">
        <div className="lp-wrap-narrow lp-glass lp-panel lp-center">
          <span className="lp-eyebrow">New to this?</span>
          <h2 className="lp-h2">What is a Joiner Tour?</h2>
          <p className="lp-body-lg">
            A Joiner is a solo traveler or small group who shares a tour package with others — splitting transport and accommodation costs. Check live seat availability, full pricing, and itinerary details all in one place.
          </p>
        </div>
      </section>

      {/* ── TOUR TYPE GRID ── */}
      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head lp-center">
            <h2 className="lp-h2">Choose Your Tour Type</h2>
            <p className="lp-sub">Solo, barkada, or custom — there's a fit for every kind of traveler.</p>
          </div>
          <div className="lp-grid">
            {[
              { icon: <Users size={30} strokeWidth={1.6} />, title: 'Joiner Tour', desc: 'Share a van and accommodation with other travelers. Perfect for solo adventurers on a budget.', tag: 'Most Popular' },
              { icon: <MapIcon size={30} strokeWidth={1.6} />, title: 'Private Tour', desc: 'Book the entire vehicle for your group. Keep your itinerary private and travel at your own pace.', tag: 'For Groups' },
              { icon: <Globe size={30} strokeWidth={1.6} />, title: 'Request a Tour', desc: 'Have a destination in mind that isn\'t listed? Submit a custom request and we\'ll price it for you.', tag: 'Custom' },
            ].map((t) => (
              <div key={t.title} className="lp-glass lp-card lp-lift">
                <div className="lp-icon">{t.icon}</div>
                <div className="lp-card-title-row">
                  <h3 className="lp-h3">{t.title}</h3>
                  <span className="lp-tag">{t.tag}</span>
                </div>
                <p className="lp-body">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW TO BOOK ── */}
      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head lp-center">
            <span className="lp-eyebrow">Simple Process</span>
            <h2 className="lp-h2">How to Book</h2>
            <p className="lp-sub">No more chaotic Facebook threads. Confirm your seat in minutes.</p>
          </div>
          <div className="lp-grid lp-steps">
            {[
              { icon: <MapIcon size={26} strokeWidth={1.6} />, num: '01', title: 'Browse a Tour', desc: 'See prices, itineraries, remaining seats, and verified agency info before committing.' },
              { icon: <CreditCard size={26} strokeWidth={1.6} />, num: '02', title: 'Book & Pay via GCash', desc: 'Secure your slot instantly. Your seat is confirmed the moment payment clears.' },
              { icon: <CheckCircle size={26} strokeWidth={1.6} />, num: '03', title: 'Get Confirmation', desc: 'Receive a digital receipt right away and an email reminder 24 hours before departure.' },
            ].map((s) => (
              <div key={s.num} className="lp-glass lp-card lp-step">
                <span className="lp-step-num">{s.num}</span>
                <div className="lp-icon lp-icon-dark">{s.icon}</div>
                <h3 className="lp-h3">{s.title}</h3>
                <p className="lp-body">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── JOINER REVIEWS ── */}
      <LandingReviews />

      {/* ── WHY CHOOSE US: heading, four equal feature cards, then the safety strip ── */}
      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head lp-center">
            <span className="lp-eyebrow">Why Us</span>
            <h2 className="lp-h2">Built for Smarter, Safer Journeys</h2>
          </div>
          <div className="lp-grid lp-grid-4">
            {[
              { icon: <ShieldCheck size={22} strokeWidth={1.8} />, title: 'Verified Safety', text: 'Driver names, plate numbers, and medical disclaimers shown for every trip.' },
              { icon: <Clock size={22} strokeWidth={1.8} />, title: 'ETA Tracking', text: 'Know exactly when your vehicle is arriving at the pickup point.' },
              { icon: <Calendar size={22} strokeWidth={1.8} />, title: 'Live Availability', text: 'Open dates, remaining seats, and full pricing — updated in real time.' },
              { icon: <Smartphone size={22} strokeWidth={1.8} />, title: 'No More Facebook Chaos', text: 'Confirm your booking instantly without waiting on DMs or comment threads.' },
            ].map((item) => (
              <div key={item.title} className="lp-glass lp-card lp-lift">
                <div className="lp-icon lp-icon-sm">{item.icon}</div>
                <h4 className="lp-h4 lp-feature-title">{item.title}</h4>
                <p className="lp-body">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="lp-glass lp-panel lp-panel-warm lp-safety">
            <div>
              <h3 className="lp-h3 lp-amber lp-h3-lg">Safety & Transparency</h3>
              <p className="lp-body">
                Building trust is our priority, especially for solo travelers. Organizer accountability details are always visible, and medical term acceptance is required before every booking.
              </p>
            </div>
            <div className="lp-checks">
              {['Non-refundable deposit policy protects both parties.', 'Automatic email reminder sent 24 hours before departure.'].map((item) => (
                <p key={item} className="lp-check"><CheckCircle size={17} /> {item}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT & CONTACT: one glass panel, two columns ── */}
      <section className="lp-section">
        <div className="lp-wrap lp-glass lp-panel lp-about">
          <div>
            <span className="lp-eyebrow">About</span>
            <h2 className="lp-h2 lp-about-title">Bandang<br /><span className="lp-amber">IBAYO.</span></h2>
            <p className="lp-body-lg">
              A local travel agency from Bulacan on a mission to help Filipinos explore the country. By modernizing our booking process, every trip is secure, organized, and stress-free from day one.
            </p>
          </div>
          <div className="lp-about-contact">
            <h3 className="lp-h3 lp-h3-lg">Contact Our Coordinator</h3>
            <div className="lp-contact">
              <p className="lp-meta lp-meta-lg"><Mail size={18} /> bandangibayo@gmail.com</p>
              <p className="lp-meta lp-meta-lg"><MapPin size={18} /> Bulacan, Philippines</p>
              <div className="lp-contact-buttons">
                <a href="https://facebook.com/bandangibayo" target="_blank" rel="noreferrer" className="lp-btn lp-btn-glass lp-btn-sm"><FaFacebook size={17} /> Facebook</a>
                {/* Tapping it on a phone starts a call. */}
                <a href="tel:+639993071958" aria-label="Call Bandang IBAYO at +63 999 307 1958" className="lp-btn lp-btn-glass lp-btn-sm"><Phone size={16} /> +63 999 307 1958</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer lp-glass">
        <div className="lp-brand">
          <img src={logoIcon} alt="BANDANG IBAYO" className="lp-footer-logo" />
          <span className="font-display lp-brand-text">Bandang <span className="font-accent">IBAYO</span></span>
        </div>
        <p className="lp-tiny">© 2026</p>
      </footer>

      {/* Floating help: joiner FAQ and user guide */}
      <HelpWidget />

      <style>{LANDING_CSS}</style>
    </div>
  );
};

// Glassmorphism: translucent white panels with a blur of what's behind them,
// a thin light border and a soft shadow, on top of the photo backdrop.
const LANDING_CSS = `
.lp { position: relative; min-height: 100dvh; color: #FFFFFF; font-family: 'Outfit', 'Inter', system-ui, sans-serif; overflow-x: hidden; isolation: isolate; }
.lp-backdrop { position: fixed; inset: 0; z-index: -1; background: #1A0A00; overflow: hidden; }
.lp-slide { position: absolute; inset: -4%; width: 108%; height: 108%; object-fit: cover; opacity: 0; transform: scale(1.04); transition: opacity 1.8s ease; animation: lp-drift 24s ease-in-out infinite alternate; }
.lp-slide.is-on { opacity: 1; }
@keyframes lp-drift { from { transform: scale(1.04) translate3d(0,0,0); } to { transform: scale(1.12) translate3d(-1.5%, -1%, 0); } }
.lp-shade { position: absolute; inset: 0; background:
  radial-gradient(ellipse at 20% 10%, rgba(232,162,101,0.22), transparent 55%),
  linear-gradient(180deg, rgba(26,10,0,0.55) 0%, rgba(26,10,0,0.62) 45%, rgba(26,10,0,0.82) 100%); }
.lp-orb { position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.55; }
.lp-orb-a { width: 42vw; height: 42vw; left: -12vw; top: 40vh; background: #B4511E; animation: lp-float 18s ease-in-out infinite alternate; }
.lp-orb-b { width: 34vw; height: 34vw; right: -10vw; top: 5vh; background: #E8A265; opacity: 0.35; animation: lp-float 22s ease-in-out infinite alternate-reverse; }
@keyframes lp-float { from { transform: translate3d(0,0,0); } to { transform: translate3d(6vw, -8vh, 0); } }

.lp-glass {
  background: linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06));
  -webkit-backdrop-filter: blur(18px) saturate(150%); backdrop-filter: blur(18px) saturate(150%);
  border: 1px solid rgba(255,255,255,0.22); box-shadow: 0 20px 50px rgba(10,4,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18);
}
.lp-amber { color: #F2B67E !important; }

/* Nav */
.lp-nav { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 50; width: min(1200px, calc(100% - 28px)); box-sizing: border-box;
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px 8px 14px; border-radius: 20px; transition: background 0.3s, box-shadow 0.3s; }
.lp-nav.is-scrolled { background: linear-gradient(135deg, rgba(40,18,4,0.72), rgba(40,18,4,0.55)); }
.lp-brand { display: flex; align-items: center; gap: 10px; min-width: 0; text-decoration: none; color: #FFFFFF; }
.lp-brand-logo { width: 42px; height: 42px; object-fit: contain; flex-shrink: 0; }
.lp-brand-text { font-weight: 900; font-size: 17px; letter-spacing: -0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #FFFFFF; }
.lp-brand-text .font-accent { color: #F2B67E; }
.lp-nav-links { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
.lp-nav-login { font-size: 13px; font-weight: 800; color: rgba(255,255,255,0.88); text-decoration: none; letter-spacing: 0.04em; }
.lp-nav-login:hover { color: #FFFFFF; }

/* Buttons */
.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; text-decoration: none; font-weight: 900; font-size: 14px; letter-spacing: 0.04em;
  padding: 15px 30px; border-radius: 14px; transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, filter 0.2s ease; box-sizing: border-box; }
.lp-btn:hover { transform: translateY(-2px); }
.lp-btn-sm { padding: 10px 18px; font-size: 13px; border-radius: 12px; }
.lp-btn-block { display: flex; width: 100%; margin-top: 14px; }
.lp-btn-amber { background: linear-gradient(135deg, #F2B67E, #E8A265 45%, #D9884A); color: #1A0A00; box-shadow: 0 10px 30px rgba(232,162,101,0.45); }
.lp-btn-amber:hover { filter: brightness(1.06); }
.lp-btn-glass { color: #FFFFFF; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.32); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.lp-btn-glass:hover { background: rgba(255,255,255,0.22); }

/* Hero */
.lp-hero { position: relative; min-height: 100dvh; display: flex; align-items: center; padding: 110px clamp(1.25rem,5vw,4rem) 80px; box-sizing: border-box; }
.lp-hero-inner { width: 100%; max-width: 980px; margin: 0 auto; display: flex; justify-content: center; text-align: center; }
.lp-hero-copy { display: flex; flex-direction: column; align-items: center; }
.lp-hero-copy .lp-lead { margin-left: auto; margin-right: auto; max-width: 560px; }
.lp-hero-buttons { justify-content: center; }
.lp-section-tight { padding-top: clamp(2rem,4vw,3rem); padding-bottom: 0; }
.lp-next { max-width: 1150px; margin: 0 auto; border-radius: 28px; overflow: hidden; display: grid; grid-template-columns: 1.1fr 1fr; transition: transform 0.3s ease, box-shadow 0.3s ease; }
.lp-next:hover { transform: translateY(-4px); box-shadow: 0 28px 60px rgba(10,4,0,0.45); }
.lp-next-img { position: relative; min-height: 320px; overflow: hidden; }
.lp-next-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 0.6s ease; }
.lp-next:hover .lp-next-img img { transform: scale(1.05); }
.lp-next-body { padding: clamp(1.5rem,3.5vw,2.5rem); display: flex; flex-direction: column; justify-content: center; }
.lp-next-title { font-size: clamp(1.7rem,3vw,2.5rem); margin-bottom: 10px; }
.lp-next-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-top: 22px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.18); }
.lp-chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #FFFFFF; margin-bottom: 22px; }
.lp-h1 { font-weight: 900; line-height: 0.98; font-size: clamp(3rem, 7vw, 6.4rem); letter-spacing: -0.035em; margin: 0 0 24px; text-shadow: 0 6px 40px rgba(0,0,0,0.35); }
.lp-h1-small { font-size: 0.8em; }
.lp-lead { font-size: clamp(16px, 1.6vw, 19px); line-height: 1.7; font-weight: 500; color: rgba(255,255,255,0.88); max-width: 470px; margin: 0 0 36px; }
.lp-hero-buttons { display: flex; gap: 14px; flex-wrap: wrap; }
@keyframes lp-rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
.lp-hero-copy { animation: lp-rise 0.8s ease both; }
.lp-scroll { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: #FFFFFF; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.3); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); animation: lp-bob 2.2s ease-in-out infinite; }
@keyframes lp-bob { 0%,100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, 6px); } }

/* Sections */
.lp-section { padding: clamp(3.5rem,7vw,6rem) clamp(1.25rem,5vw,4rem); scroll-margin-top: 80px; }
.lp-wrap { max-width: 1150px; margin: 0 auto; }
.lp-wrap-wide { max-width: 1280px; margin: 0 auto; }
.lp-wrap-narrow { max-width: 760px; margin: 0 auto; }
.lp-head { margin-bottom: 2.5rem; }
.lp-head-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.lp-center { text-align: center; }
.lp-eyebrow { display: inline-block; font-size: 11.5px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: #F2B67E; }
.lp-h2 { font-weight: 900; font-size: clamp(2rem,3.6vw,3.1rem); letter-spacing: -0.03em; line-height: 1.08; margin: 10px 0 8px; color: #FFFFFF; }
.lp-h3 { font-weight: 900; font-size: 20px; line-height: 1.2; margin: 0; color: #FFFFFF; }
.lp-h3-lg { font-size: 24px; margin-bottom: 14px; }
.lp-h4 { font-weight: 900; font-size: 16px; margin: 0 0 4px; color: #FFFFFF; }
.lp-sub { font-size: 15.5px; font-weight: 600; color: rgba(255,255,255,0.8); margin: 0; }
.lp-body { font-size: 15px; line-height: 1.7; color: rgba(255,255,255,0.84); margin: 0; }
.lp-body-lg { font-size: 17px; line-height: 1.8; color: rgba(255,255,255,0.86); margin: 0; }
.lp-meta { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.85); margin: 6px 0 0; }
.lp-meta svg { color: #F2B67E; flex-shrink: 0; }
.lp-meta-lg { font-size: 15px; font-weight: 700; color: #FFFFFF; margin: 0; gap: 14px; }
.lp-tiny { font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.7); margin: 0 0 2px; }
.lp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(290px, 100%), 1fr)); gap: 24px; }
.lp-panel { border-radius: 28px; padding: clamp(1.75rem,4vw,2.75rem); }
.lp-panel-warm { background: linear-gradient(135deg, rgba(232,162,101,0.22), rgba(180,81,30,0.10)); }
.lp-card { border-radius: 24px; padding: 30px 28px; }
.lp-lift { transition: transform 0.25s ease, background 0.25s ease; }
.lp-lift:hover { transform: translateY(-5px); background: linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08)); }
.lp-icon { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 18px;
  background: rgba(242,182,126,0.18); color: #F2B67E; border: 1px solid rgba(242,182,126,0.3); }
.lp-icon-dark { background: rgba(26,10,0,0.55); }
.lp-icon-sm { width: 46px; height: 46px; border-radius: 13px; margin: 0; flex-shrink: 0; }
.lp-card-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.lp-tag { font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #1A0A00; background: #F2B67E; padding: 3px 10px; border-radius: 999px; }
.lp-step { position: relative; }
.lp-step .lp-h3 { margin-bottom: 8px; }
.lp-step-num { position: absolute; top: 18px; right: 22px; font-size: 44px; font-weight: 900; letter-spacing: -0.04em; color: rgba(255,255,255,0.14); }
/* Why Us: four equal cards, then a full-width safety strip. */
.lp-grid-4 { grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }
.lp-feature-title { margin: 16px 0 6px; font-size: 17px; }
.lp-safety { margin-top: 24px; display: grid; grid-template-columns: 1.3fr 1fr; gap: clamp(1.25rem,4vw,3rem); align-items: center; }
.lp-safety .lp-checks { margin-top: 0; }
/* About + Contact: one panel, two columns with a divider. */
.lp-about { display: grid; grid-template-columns: 1.2fr 1fr; gap: clamp(1.5rem,4vw,3.5rem); align-items: center; }
.lp-about-contact { padding-left: clamp(1.5rem,4vw,3.5rem); border-left: 1px solid rgba(255,255,255,0.18); }
@media (max-width: 860px) {
  .lp-safety, .lp-about { grid-template-columns: 1fr; }
  .lp-about-contact { padding-left: 0; border-left: none; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.18); }
}
.lp-checks { display: flex; flex-direction: column; gap: 14px; margin-top: 24px; }
.lp-check { display: flex; gap: 12px; align-items: flex-start; font-size: 14.5px; line-height: 1.6; color: rgba(255,255,255,0.88); margin: 0; }
.lp-check svg { color: #F2B67E; flex-shrink: 0; margin-top: 2px; }
.lp-about-title { font-size: clamp(2.6rem,4.2vw,3.8rem); line-height: 1; margin-bottom: 20px; }
.lp-contact { display: flex; flex-direction: column; gap: 16px; margin-top: 8px; }
.lp-meta-lg svg { color: #F2B67E; }
.lp-contact-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
.lp-empty { border-radius: 24px; padding: 4rem 1.5rem; text-align: center; }
.lp-empty p { margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: #F2B67E; }

/* Tour cards */
.lp-tour { border-radius: 24px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.3s ease, box-shadow 0.3s ease; }
.lp-tour:hover { transform: translateY(-6px); box-shadow: 0 28px 60px rgba(10,4,0,0.45); }
.lp-tour-img { position: relative; height: 210px; overflow: hidden; background: #2D1B0E; }
.lp-tour-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.6s ease; }
.lp-tour:hover .lp-tour-img img { transform: scale(1.07); }
.lp-tour-img::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(26,10,0,0.55), transparent 55%); pointer-events: none; }
.lp-cover-link { position: absolute; inset: 0; z-index: 2; }
.lp-pill { position: absolute; top: 14px; left: 14px; z-index: 3; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #FFFFFF;
  padding: 6px 12px; border-radius: 999px; background: rgba(26,10,0,0.45); border: 1px solid rgba(255,255,255,0.3); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.lp-tour-body { padding: 22px 24px 24px; flex: 1; display: flex; flex-direction: column; }
.lp-tour-body .lp-amber { margin-bottom: 14px; font-weight: 800; }
.lp-tour-facts { display: flex; flex-direction: column; gap: 2px; }
.lp-tour-foot { margin-top: auto; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.16); margin-top: 20px; }

/* Reviews: their cards become glass too. */
.lp-reviews article { background: linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06)) !important; border: 1px solid rgba(255,255,255,0.22) !important;
  -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); box-shadow: 0 20px 50px rgba(10,4,0,0.3) !important; }
.lp-reviews article p, .lp-reviews article span, .lp-reviews article strong { color: #FFFFFF !important; }
.lp-skeleton { border-radius: 24px; padding: 12px; background: rgba(253,246,238,0.88); }

/* Footer */
.lp-footer { margin: 0 clamp(1rem,4vw,3rem) 20px; border-radius: 22px; padding: 14px 86px 14px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.lp-footer-logo { width: 56px; height: 56px; object-fit: contain; }

/* Links on glass stay readable. */
.lp a:focus-visible, .lp button:focus-visible { outline: 3px solid #F2B67E; outline-offset: 3px; }

@media (max-width: 900px) {
  .lp-hero { padding-top: 100px; }
}
@media (max-width: 640px) {
  .lp-nav { top: 10px; padding: 6px 8px 6px 10px; border-radius: 16px; }
  .lp-brand-logo { width: 34px; height: 34px; }
  .lp-brand-text { font-size: 14px; }
  .lp-nav-links { gap: 10px; }
  .lp-next { grid-template-columns: 1fr; }
  .lp-next-img { min-height: 210px; }
  .lp-scroll { display: none; }
  .lp-step-num { font-size: 34px; }
}
@media (max-width: 480px) {
  .lp-nav-login { display: none; }
  .lp-h1 { font-size: 2.9rem; }
  .lp-hero-buttons { flex-direction: column; align-items: stretch; }
  .lp-hero-buttons .lp-btn { width: 100%; }
}
/* Older phones without blur: a solid dark glass so text stays readable. */
@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .lp-glass { background: rgba(40,18,4,0.86); }
}
@media (prefers-reduced-motion: reduce) {
  .lp-slide, .lp-orb, .lp-scroll, .lp-hero-copy { animation: none !important; }
  .lp-slide { transition: none; }
}
`;

export default LandingPage;
