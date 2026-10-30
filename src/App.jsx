import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase, openedFromResetLink } from './supabaseClient';
import { FaFacebook } from "react-icons/fa"; 
import { 
  MapPin, Calendar, Users, Clock, Loader2, CheckCircle, 
  ShieldCheck, Smartphone, Map, CreditCard, Globe, Mail, Phone
} from 'lucide-react';
import logoIcon from './assets/logo.png';
 
// Pages other than the landing page load only when they're opened, so the
// landing page doesn't download the whole app first.
const JoinerLogin = lazy(() => import('./JoinerLogin'));
const JoinerRegister = lazy(() => import('./JoinerRegister'));
const AuthCallback = lazy(() => import('./AuthCallback'));
import HelpWidget from './ui/HelpWidget';
const AdminDashboard = lazy(() => import('./AdminDashboard'));
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
const JoinerDashboard = lazy(() => import('./JoinerDashboard'));
const ForgotPassword = lazy(() => import('./ForgotPassword'));
const ResetPassword = lazy(() => import('./ResetPassword'));
const PublicTourList = lazy(() => import('./PublicTours').then((m) => ({ default: m.PublicTourList })));
const PublicTourDetail = lazy(() => import('./PublicTours').then((m) => ({ default: m.PublicTourDetail })));
import { todayManila, groupTripDates, weekdayRange } from './tourUtils';
import { ReviewCard } from './ui/ReviewCards';
import PriceTag from './ui/PriceTag';
import { usePublicReviews } from './publicReviews';
import { SkeletonTourCards } from './ui/Skeleton';
import { reportError } from './ui/toast';
 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------
 

// What joiners say: recent 4–5★ reviews with a comment. Hidden until there
// are reviews to show.
const LandingReviews = () => {
  const reviews = usePublicReviews(6);
  if (!reviews || reviews.length === 0) return null;
  return (
    <section style={{ background: '#FDF6EE', padding: 'clamp(5rem,10vw,8rem) clamp(1.5rem,5vw,4rem)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#A8481A' }}>Joiner Stories</span>
          <h2 style={{ fontWeight: 900, fontSize: 'clamp(2rem,3.5vw,3rem)', letterSpacing: '-0.03em', color: '#1A0A00', marginTop: 10, marginBottom: 8 }}>What Our Joiners Say</h2>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#7A3A18' }}>Reviews from joiners who have finished a tour with us.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        </div>
      </div>
    </section>
  );
};

function LandingPage() {
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
 
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split('-');
    return `${month}-${day}-${year}`;
  };
 
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
      else setTours(groupTripDates(data, { openFirst: false })); // one card per trip, however many dates it has
      setLoading(false);
    };
    fetchPublicTours();
  }, []);
 
  return (
    <div style={{ background: '#FDF6EE', fontFamily: "'Outfit', 'Inter', system-ui, sans-serif", color: '#1A0A00', overflowX: 'hidden' }}>
 
      {/* ── NAV ── */}
      <nav className="site-nav" style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(253,246,238,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(180,81,30,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 clamp(1.5rem,5vw,4rem)', height: 64, gap: 12,
      }}>
        <div className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {/* Car Custom Image Icon */}
          <img 
            src={logoIcon} 
            alt="BANDANG IBAYO" 
            className="nav-brand-logo"
            style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }} 
          />
          <span className="nav-brand-text font-display" style={{ fontWeight: 900, fontSize: 17, letterSpacing: '-0.03em', color: '#1A0A00', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Bandang <span className="font-accent" style={{ color: '#A8481A' }}>IBAYO</span>
          </span>
        </div>
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
          <Link to="/login" className="nav-login btn-text-link" style={{ fontSize: 13, fontWeight: 700, color: '#7A3A18', textDecoration: 'none', letterSpacing: '0.04em' }}>Log in</Link>
          <Link to="/register" className="nav-cta btn-primary" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap',
            fontSize: 13, fontWeight: 900, color: '#FDF6EE', textDecoration: 'none',
            background: '#B4511E', borderRadius: 10, padding: '9px 20px',
            letterSpacing: '0.04em', boxShadow: '0 4px 16px rgba(180,81,30,0.35)',
          }}>Join Now</Link>
        </div>
      </nav>
 
      {/* ── HERO ── */}
      <section style={{
        minHeight: '92dvh', display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        background: '#1A0A00',
        position: 'relative', overflow: 'hidden',
      }} className="hero-grid">
        {/* LEFT PANEL */}
        <div className="hero-left" style={{
          position: 'relative', zIndex: 2,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: 'clamp(3rem,8vw,7rem) clamp(2rem,5vw,5rem)',
          background: 'linear-gradient(135deg, #1A0A00 60%, #2D1B0E 100%)',
        }}>
          <div className="hero-cut" style={{
            position: 'absolute', top: 0, right: -1, width: 80, height: '100%',
            background: '#1A0A00',
            clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
            zIndex: 3,
          }}/>
           
          <h1 className="hero-heading" style={{
            fontWeight: 900, lineHeight: 1.0,
            fontSize: 'clamp(2.6rem, 6.5vw, 6rem)',
            color: '#FDF6EE', marginBottom: 28, letterSpacing: '-0.03em',
          }}>
            Explore<br/>
            <span className="font-accent" style={{ color: '#E8A265' }}>More</span><br/>
            <span className="font-accent" style={{ color: '#FDF6EE', fontSize: '0.8em' }}>Adventures.</span>
          </h1>
 
          <p style={{
            fontSize: 17, lineHeight: 1.75, fontWeight: 500, marginBottom: 44,
            color: 'rgba(232,210,190,0.85)', maxWidth: 420,
          }}>
            Join group tours across the Philippines. Share the ride, split the cost, and discover more places.
          </p>
 
          <div className="hero-buttons" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/login" className="btn-primary" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontWeight: 900, fontSize: 14, color: '#1A0A00', textDecoration: 'none',
              background: '#E8A265', borderRadius: 12,
              padding: '15px 32px', letterSpacing: '0.04em',
              boxShadow: '0 8px 28px rgba(232,162,101,0.38)',
            }}>Log In</Link>
            <Link to="/tours" className="btn-outline" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontWeight: 700, fontSize: 14, color: 'rgba(232,210,190,0.85)', textDecoration: 'none',
              border: '1.5px solid rgba(232,210,190,0.22)', borderRadius: 12,
              padding: '15px 28px', letterSpacing: '0.04em',
            }}>Browse Tours →</Link>
          </div>
        </div>
 
        {/* RIGHT PANEL */}
        <div style={{ position: 'relative', overflow: 'hidden', background: '#2D1B0E' }}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 600 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="sunGlow" cx="50%" cy="35%" r="45%">
                <stop offset="0%" stopColor="#E8A265" stopOpacity="0.45"/>
                <stop offset="100%" stopColor="#A8481A" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <rect width="600" height="700" fill="#2D1B0E"/>
            <circle cx="300" cy="200" r="160" fill="url(#sunGlow)"/>
            <path d="M0 700 L0 420 L80 340 L160 400 L260 290 L340 370 L420 280 L500 360 L600 300 L600 700Z" fill="#3D2410" opacity="0.9"/>
            <path d="M0 700 L0 480 L100 390 L200 450 L320 350 L400 420 L480 360 L600 410 L600 700Z" fill="#4A2C12" opacity="0.85"/>
            <path d="M0 700 L0 540 L150 460 L280 510 L380 440 L500 490 L600 450 L600 700Z" fill="#5A3418" opacity="0.8"/>
            <path d="M0 700 L0 600 L200 540 L350 580 L500 530 L600 560 L600 700Z" fill="#6B3D1C" opacity="0.75"/>
          </svg>
 
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
          }}>
            <div style={{
              width: 420, height: 420, borderRadius: '50%',
              background: 'rgba(26,10,0,0.55)', backdropFilter: 'blur(10px)',
              border: '1.5px solid rgba(232,162,101,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 80px rgba(180,81,30,0.2)',
            }}>
              <img src="/hero-logo.webp" alt="Bandang IBAYO" width={340} height={340} fetchPriority="high" decoding="async" style={{ width: 340, height: 340, objectFit: 'contain' }}/>
            </div>
          </div>
 
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(to bottom,transparent,#1A0A00)', zIndex: 3 }}/>
        </div>
 
      </section>
 
      {/* ── Responsive & interaction polish ── */}
      <style>{`
        .btn-primary { transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease; }
        .btn-primary:hover { transform: translateY(-2px); filter: brightness(1.06); }
        .btn-outline { transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease; }
        .btn-outline:hover { background: rgba(232,210,190,0.08); border-color: rgba(232,210,190,0.4) !important; transform: translateY(-2px); }
        .btn-text-link { transition: color 0.2s ease; }
        .btn-text-link:hover { color: #A8481A !important; }
        .tour-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .tour-card:hover { transform: translateY(-6px); box-shadow: 0 16px 36px rgba(26,10,0,0.14); }
        .tour-card:hover .tour-card-img { transform: scale(1.07); }
        .type-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .type-card:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(26,10,0,0.1); }

        @media (max-width: 1024px) {
          .hero-grid { min-height: auto !important; }
        }

        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; min-height: auto !important; }
          .hero-grid > div:last-child { display: none !important; }
          .hero-cut { display: none !important; }
          .hero-left { padding: 3.5rem 1.75rem 3rem !important; }
        }

        @media (max-width: 640px) {
          .site-nav { padding: 0 1.25rem !important; height: 60px !important; }
          .nav-brand-logo { width: 36px !important; height: 36px !important; }
          .nav-brand-text { font-size: 14px !important; }
          .nav-links { gap: 12px !important; }
          .nav-cta { padding: 8px 16px !important; font-size: 12px !important; }
        }
        @media (max-width: 480px) {
          /* The hero's "Browse Tours" button covers it on phones. */
        }
        /* Phones: the hero already has a big Log In button, so the nav keeps just Join Now. */
        @media (max-width: 480px) {
          .nav-login { display: none !important; }
        }

        @media (max-width: 420px) {
          .hero-heading { font-size: 2.5rem !important; }
          .hero-buttons { flex-direction: column !important; align-items: stretch !important; }
          .hero-buttons a { width: 100% !important; }
        }
      `}</style>
 
      {/* ── FEATURED TOURS ── */}
      <section style={{ background: '#FDF6EE', padding: 'clamp(4rem,8vw,7rem) clamp(1.5rem,5vw,4rem)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#A8481A' }}>Live Now</span>
              <h2 style={{ fontWeight: 900, fontSize: 'clamp(2rem,3.5vw,3rem)', letterSpacing: '-0.03em', color: '#1A0A00', margin: '8px 0 4px' }}>Upcoming Adventures</h2>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>Verified joiner packages, updated in real time.</p>
            </div>
            <Link className="text-link" to="/tours" style={{ fontWeight: 900, fontSize: 14, color: '#A8481A', textDecoration: 'none', letterSpacing: '0.04em' }}>
              Explore All →
            </Link>
          </div>
 
          {loading ? (
            <SkeletonTourCards count={3} imageHeight={220} />
          ) : tours.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 28 }}>
              {tours.map((tour) => (
                <div key={tour.id} className="tour-card" style={{
                  background: '#FDF6EE', borderRadius: 24, overflow: 'hidden',
                  border: '1px solid rgba(180,81,30,0.1)',
                  boxShadow: '0 4px 24px rgba(26,10,0,0.07)',
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{ height: 220, overflow: 'hidden', position: 'relative', background: '#2D1B0E' }}>
                    <Link to={`/tours/${tour.id}`} aria-label={tour.title} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
                    <img src={tour.image_urls?.[0] || '/tour-placeholder.webp'} alt={tour.title} className="tour-card-img" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s' }}/>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(26,10,0,0.55) 0%, transparent 55%)' }}/>
                    {tour.difficulty && (
                      <span style={{
                        position: 'absolute', top: 14, left: 14,
                        fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
                        background: 'rgba(253,246,238,0.92)', color: '#1A0A00',
                        padding: '5px 12px', borderRadius: 999, backdropFilter: 'blur(4px)',
                      }}>{tour.difficulty}</span>
                    )}
                  </div>
                  <div style={{ padding: '28px 28px 24px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ fontWeight: 900, fontSize: 20, color: '#1A0A00', marginBottom: 6, lineHeight: 1.2 }}>{tour.title}</h3>
                      <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: '#A8481A', marginBottom: 20 }}>
                        <MapPin size={14}/> {tour.destination}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                          [<Calendar size={15}/>, `${formatDate(tour.start_date)} (${weekdayRange(tour.start_date, tour.duration)})` + (tour.dates?.length > 1 ? `  +${tour.dates.length - 1} more date${tour.dates.length > 2 ? 's' : ''}` : '')],
                          [<Clock size={15}/>, tour.duration],
                          [<Users size={15}/>, `${tour.group_size} max pax`],
                        ].map(([icon, text], i) => (
                          <p key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#7A3A18', margin: 0, opacity: 0.9 }}>
                            <span style={{ color: '#A8481A' }}>{icon}</span>{text}
                          </p>
                        ))}
                      </div>
                    </div>
                    {/* Price on its own line, full-width button below, so long prices never squeeze the button. */}
                    <div style={{ paddingTop: 20, marginTop: 22, borderTop: '1px solid rgba(180,81,30,0.1)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9, marginBottom: 2 }}>Starts at</div>
                      <PriceTag tour={tour} size={26} color="#1A0A00" align="flex-start" style={{ letterSpacing: '-0.03em' }} />
                      <Link to={`/tours/${tour.id}`} className="btn-primary" style={{
                        position: 'relative', zIndex: 2,
                        display: 'block', textAlign: 'center', marginTop: 14,
                        fontWeight: 900, fontSize: 13, color: '#FDF6EE', textDecoration: 'none',
                        background: '#1A0A00', borderRadius: 12, padding: '13px 22px',
                        letterSpacing: '0.04em', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(26,10,0,0.22)',
                      }}>Book Now</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '5rem', textAlign: 'center', borderRadius: 24, border: '2px dashed rgba(180,81,30,0.25)', background: 'rgba(253,246,238,0.5)' }}>
              <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', opacity: 0.9, margin: 0 }}>Check back soon for new dates!</p>
            </div>
          )}
        </div>
      </section>
 
      {/* ── WHAT IS A JOINER TOUR ── */}
      <section style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.5rem,5vw,4rem)', textAlign: 'center' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#A8481A', marginBottom: 16 }}>
            New to this?
          </span>
          <h2 style={{ fontWeight: 900, fontSize: 'clamp(2.2rem,4vw,3.5rem)', letterSpacing: '-0.03em', color: '#1A0A00', marginBottom: 20, lineHeight: 1.1 }}>
            What is a Joiner Tour?
          </h2>
          <p style={{ fontSize: 18, lineHeight: 1.8, fontWeight: 500, color: '#7A3A18', opacity: 0.9 }}>
            A Joiner is a solo traveler or small group who shares a tour package with others — splitting transport and accommodation costs. Check live seat availability, full pricing, and itinerary details all in one place.
          </p>
        </div>
      </section>
 
      {/* ── TOUR TYPE GRID ── */}
      <section style={{ background: '#FDF6EE', padding: 'clamp(4rem,8vw,7rem) clamp(1.5rem,5vw,4rem)', position: 'relative', clipPath: 'polygon(0 3%, 100% 0, 100% 97%, 0 100%)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>           
            <h2 style={{ fontWeight: 900, fontSize: 'clamp(2rem,3.5vw,3rem)', letterSpacing: '-0.03em', color: '#1A0A00', marginTop: 10, marginBottom: 8 }}>
              Choose Your Tour Type
            </h2>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#7A3A18', opacity: 0.9 }}>Solo, barkada, or custom — there's a fit for every kind of traveler.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 24 }}>
            {[
              { icon: <Users size={32} strokeWidth={1.6}/>, title: 'Joiner Tour', desc: 'Share a van and accommodation with other travelers. Perfect for solo adventurers on a budget.', tag: 'Most Popular', accent: '#A8481A' },
              { icon: <Map size={32} strokeWidth={1.6}/>, title: 'Exclusive Tour', desc: 'Book the entire vehicle for your group. Keep your itinerary private and travel at your own pace.', tag: 'For Groups', accent: '#7A3A18' },
              { icon: <Globe size={32} strokeWidth={1.6}/>, title: 'Request a Tour', desc: 'Have a destination in mind that isn\'t listed? Submit a custom request and we\'ll price it for you.', tag: 'Custom', accent: '#9A5B1E' },
            ].map((t, i) => (
              <div key={i} className="type-card" style={{
                background: '#FDF6EE', borderRadius: 24, padding: '36px 32px',
                border: '1px solid rgba(180,81,30,0.12)',
                boxShadow: '0 2px 20px rgba(26,10,0,0.06)',
              }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: `${t.accent}18`, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  {t.icon}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <h3 style={{ fontWeight: 900, fontSize: 20, color: '#1A0A00', margin: 0 }}>{t.title}</h3>
                  <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.accent, background: `${t.accent}15`, padding: '3px 10px', borderRadius: 999 }}>{t.tag}</span>
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.7, color: '#7A3A18', margin: 0, opacity: 0.9 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
 
      {/* ── HOW TO BOOK ── */}
      <section style={{ padding: 'clamp(5rem,10vw,8rem) clamp(1.5rem,5vw,4rem)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#A8481A' }}>Simple Process</span>
            <h2 style={{ fontWeight: 900, fontSize: 'clamp(2rem,3.5vw,3rem)', letterSpacing: '-0.03em', color: '#1A0A00', marginTop: 10, marginBottom: 8 }}>How to Book</h2>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#7A3A18', opacity: 0.9 }}>No more chaotic Facebook threads. Confirm your seat in minutes.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 32 }}>
            {[
              { icon: <Map size={28} strokeWidth={1.6}/>, num: '01', title: 'Browse a Tour', desc: 'See prices, itineraries, remaining seats, and verified agency info before committing.' },
              { icon: <CreditCard size={28} strokeWidth={1.6}/>, num: '02', title: 'Book & Pay via GCash', desc: 'Secure your slot instantly. Your seat is confirmed the moment payment clears.' },
              { icon: <CheckCircle size={28} strokeWidth={1.6}/>, num: '03', title: 'Get Confirmation', desc: 'Receive a digital receipt right away and an email reminder 24 hours before departure.' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 18,
                  background: '#1A0A00', color: '#E8A265',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(26,10,0,0.2)',
                  flexShrink: 0,
                }}>{s.icon}</div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', color: '#A8481A', textTransform: 'uppercase' }}>{s.num}</span>
                  <h3 style={{ fontWeight: 900, fontSize: 20, color: '#1A0A00', margin: '4px 0 8px' }}>{s.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: '#7A3A18', margin: 0, opacity: 0.9 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
 
      {/* ── JOINER REVIEWS ── */}
      <LandingReviews />

      {/* ── WHY CHOOSE US ── */}
      <section style={{ background: '#1A0A00', padding: 'clamp(5rem,10vw,8rem) clamp(1.5rem,5vw,4rem)', position: 'relative' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 64, alignItems: 'start', position: 'relative', zIndex: 1 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#E8A265' }}>Why Us</span>
            <h2 style={{ fontWeight: 900, fontSize: 'clamp(2rem,3.5vw,3rem)', letterSpacing: '-0.03em', color: '#FDF6EE', margin: '12px 0 36px', lineHeight: 1.1 }}>
              Built for Smarter, Safer Journeys
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {[
                { icon: <ShieldCheck size={24} strokeWidth={1.8}/>, title: 'Verified Safety', text: 'Driver names, plate numbers, and medical disclaimers shown for every trip.' },
                { icon: <Clock size={24} strokeWidth={1.8}/>, title: 'ETA Tracking', text: 'Know exactly when your vehicle is arriving at the pickup point.' },
                { icon: <Calendar size={24} strokeWidth={1.8}/>, title: 'Live Availability', text: 'Open dates, remaining seats, and full pricing — updated in real time.' },
                { icon: <Smartphone size={24} strokeWidth={1.8}/>, title: 'No More Facebook Chaos', text: 'Confirm your booking instantly without waiting on DMs or comment threads.' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 16 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(232,162,101,0.12)', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <div>
                    <h4 style={{ fontWeight: 900, fontSize: 16, color: '#FDF6EE', margin: '0 0 4px' }}>{item.title}</h4>
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(232,210,190,0.85)', margin: 0 }}>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
 
          {/* safety card */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(232,162,101,0.14)', borderRadius: 28, padding: '40px 36px' }}>
            <h3 style={{ fontWeight: 900, fontSize: 24, color: '#E8A265', margin: '0 0 16px' }}>Safety & Transparency</h3>
            <p style={{ fontSize: 15, lineHeight: 1.75, color: 'rgba(232,210,190,0.85)', marginBottom: 28 }}>
              Building trust is our priority, especially for solo travelers. Organizer accountability details are always visible, and medical term acceptance is required before every booking.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {['Non-refundable deposit policy protects both parties.', 'Automatic email reminder sent 24 hours before departure.'].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <CheckCircle size={17} style={{ color: '#E8A265', flexShrink: 0, marginTop: 2 }}/>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(232,210,190,0.85)', margin: 0 }}>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT & CONTACT ── */}
      <section style={{ padding: 'clamp(5rem,10vw,8rem) clamp(1.5rem,5vw,4rem)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 56, alignItems: 'start' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#A8481A', display: 'block', marginBottom: 16 }}>About</span>
            <h2 style={{ fontWeight: 900, fontSize: 'clamp(2.5rem,4vw,3.8rem)', letterSpacing: '-0.04em', color: '#1A0A00', lineHeight: 1.0, margin: '0 0 20px' }}>
              Bandang<br/><span style={{ color: '#A8481A' }}>IBAYO.</span>
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.8, color: '#7A3A18', marginBottom: 32, opacity: 0.9 }}>
              A local travel agency from Bulacan on a mission to help Filipinos explore the country. By modernizing our booking process, every trip is secure, organized, and stress-free from day one.
            </p>            
          </div>
 
          <div style={{ background: '#FDF6EE', borderRadius: 28, padding: '36px 32px', border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 24px rgba(26,10,0,0.07)' }}>
            <h3 style={{ fontWeight: 900, fontSize: 20, color: '#1A0A00', margin: '0 0 20px' }}>Contact Our Coordinator</h3>           
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 15, fontWeight: 700, color: '#1A0A00', margin: 0 }}>
                <Mail size={18} style={{ color: '#A8481A', flexShrink: 0 }}/> bandangibayo@gmail.com
              </p>
              <p style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 15, fontWeight: 700, color: '#1A0A00', margin: 0 }}>
                <MapPin size={18} style={{ color: '#A8481A', flexShrink: 0 }}/> Bulacan, Philippines
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <a href="https://facebook.com/bandangibayo" target="_blank" rel="noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 13,
                color: '#1877F2', textDecoration: 'none', background: '#EFF6FF',
                border: '1px solid #BFDBFE', borderRadius: 12, padding: '10px 18px',
              }}><FaFacebook size={18}/> Facebook</a>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 13,
                color: '#7A3A18', background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.15)',
                borderRadius: 12, padding: '10px 18px',
              }}><Phone size={16} style={{ color: '#A8481A' }}/> +63 9XX XXX XXXX</div>
            </div>
            </div>
          </div>
        </div>
      </section>
 
      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(180,81,30,0.15)', padding: '28px clamp(1.5rem,5vw,4rem)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img 
            src={logoIcon} 
            alt="BANDANG IBAYO" 
            style={{ width: 68, height: 68, objectFit: 'contain' }} 
          />
          <span className="font-display" style={{ fontSize: 15, color: '#1A0A00' }}>Bandang <span className="font-accent" style={{ color: '#A8481A' }}>IBAYO</span></span>
        </div>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9, margin: 0 }}>
          © 2026 
        </p>
      </footer>

      {/* Floating help: joiner FAQ and user guide */}
      <HelpWidget />
 
    </div>
  );
}
 
// Shown for a moment while a page's code loads.
const PageLoading = () => (
  <div role="status" aria-label="Loading" style={{ minHeight: '100dvh', background: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <img src={logoIcon} alt="" width={56} height={56} style={{ opacity: 0.85, animation: 'ibayo-pulse 1.2s ease-in-out infinite' }} />
    <style>{'@keyframes ibayo-pulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.06);opacity:1}}'}</style>
  </div>
);

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // A password reset link always opens the "set a new password" page, even if
  // Supabase sent it to the homepage.
  useEffect(() => {
    // Waits for Supabase to read the sign-in details from the link first.
    if (openedFromResetLink && pathname !== '/reset-password') {
      supabase.auth.getSession().then(() => navigate('/reset-password', { replace: true }));
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') navigate('/reset-password', { replace: true });
    });
    return () => subscription.unsubscribe();
    // Only when the site first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<JoinerLogin />} />
      <Route path="/register" element={<JoinerRegister />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/complete-profile" element={<JoinerRegister mode="complete" />} />
      <Route path="/tours" element={<PublicTourList />} />
      <Route path="/tours/:id" element={<PublicTourDetail />} />
      <Route path="/dashboard/*" element={<ProtectedRoute><JoinerDashboard /></ProtectedRoute>} />
      <Route path="/admin/*" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
    </Suspense>
  );
}