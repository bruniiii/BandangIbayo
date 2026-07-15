import React, { useState, useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { FaFacebook } from "react-icons/fa"; 
import { 
  MapPin, Calendar, Users, Clock, Loader2, CheckCircle, 
  ShieldCheck, Smartphone, Map, CreditCard, Globe, Mail, Phone
} from 'lucide-react';
 import logoIcon from './assets/newIcon.png';
 
import JoinerLogin from './JoinerLogin'; 
import JoinerRegister from './JoinerRegister';
import AdminDashboard from './AdminDashboard';
import AdminLogin from './AdminLogin';
import ProtectedRoute from './ProtectedRoute';
import JoinerDashboard from './JoinerDashboard';
 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------
 
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
        .order('start_date', { ascending: true });
      if (error) console.error('Error fetching tours:', error.message);
      else setTours(data);
      setLoading(false);
    };
    fetchPublicTours();
  }, []);
 
  return (
    <div style={{ background: '#FDF6EE', fontFamily: "'Inter', system-ui, sans-serif", color: '#1A0A00', overflowX: 'hidden' }}>
 
      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(253,246,238,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(196,92,38,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 clamp(1.5rem,5vw,4rem)', height: 64,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
  {/* Car Custom Image Icon */}
  <img 
    src={logoIcon} 
    alt="BANDANG IBAYO" 
    style={{ width: 68, height: 68, objectFit: 'contain' }} 
  />
          <span style={{ fontWeight: 900, fontSize: 17, letterSpacing: '-0.03em', color: '#1A0A00' }}>
            Bandang <span style={{ color: '#C45C26' }}>IBAYO</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link to="/login" style={{ fontSize: 13, fontWeight: 700, color: '#7A3A18', textDecoration: 'none', letterSpacing: '0.04em' }}>Log in</Link>
          <Link to="/register" style={{
            fontSize: 13, fontWeight: 900, color: '#FDF6EE', textDecoration: 'none',
            background: '#C45C26', borderRadius: 10, padding: '9px 20px',
            letterSpacing: '0.04em', boxShadow: '0 4px 16px rgba(196,92,38,0.35)',
            transition: 'all 0.2s',
          }}>Join Now</Link>
        </div>
      </nav>
 
      {/* ── HERO ── */}
      {/* Two-panel: left = full-bleed warm texture + big type, right = logo on terrain art */}
      <section style={{
        minHeight: '92vh', display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        background: '#1A0A00',
        position: 'relative', overflow: 'hidden',
      }} className="hero-grid">
        {/* LEFT PANEL */}
        <div style={{
          position: 'relative', zIndex: 2,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: 'clamp(3rem,8vw,7rem) clamp(2rem,5vw,5rem)',
          background: 'linear-gradient(135deg, #1A0A00 60%, #2D1B0E 100%)',
        }}>
          {/* angled cut on the right edge */}
          <div style={{
            position: 'absolute', top: 0, right: -1, width: 80, height: '100%',
            background: '#1A0A00',
            clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
            zIndex: 3,
          }}/>
           
          <h1 style={{
            fontWeight: 900, lineHeight: 1.0,
            fontSize: 'clamp(3.2rem, 6.5vw, 6rem)',
            color: '#FDF6EE', marginBottom: 28, letterSpacing: '-0.03em',
          }}>
            Explore<br/>
            <span style={{ color: '#C45C26' }}>More</span><br/>
            <span style={{ color: '#E8A265', fontStyle: 'italic', fontSize: '0.72em', fontWeight: 700 }}>Adventures.</span>
          </h1>
 
          <p style={{
            fontSize: 17, lineHeight: 1.75, fontWeight: 500, marginBottom: 44,
            color: 'rgba(232,210,190,0.72)', maxWidth: 420,
          }}>
            Join group tours across the Philippines. Share the ride, split the cost, and discover more places.
          </p>
 
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontWeight: 900, fontSize: 14, color: '#1A0A00', textDecoration: 'none',
              background: '#E8A265', borderRadius: 12,
              padding: '15px 32px', letterSpacing: '0.04em',
              boxShadow: '0 8px 28px rgba(232,162,101,0.38)',
            }}>Browse Tours →</Link>
            <Link to="/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontWeight: 700, fontSize: 14, color: 'rgba(232,210,190,0.8)', textDecoration: 'none',
              border: '1.5px solid rgba(232,210,190,0.22)', borderRadius: 12,
              padding: '15px 28px', letterSpacing: '0.04em',
            }}>Log In</Link>
          </div>
        </div>
 
        {/* RIGHT PANEL — abstract terrain + logo */}
        <div style={{ position: 'relative', overflow: 'hidden', background: '#2D1B0E' }}>
          {/* layered terrain SVG */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 600 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="sunGlow" cx="50%" cy="35%" r="45%">
                <stop offset="0%" stopColor="#E8A265" stopOpacity="0.45"/>
                <stop offset="100%" stopColor="#C45C26" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <rect width="600" height="700" fill="#2D1B0E"/>
            <circle cx="300" cy="200" r="160" fill="url(#sunGlow)"/>
            {/* terrain layers far to near */}
            <path d="M0 700 L0 420 L80 340 L160 400 L260 290 L340 370 L420 280 L500 360 L600 300 L600 700Z" fill="#3D2410" opacity="0.9"/>
            <path d="M0 700 L0 480 L100 390 L200 450 L320 350 L400 420 L480 360 L600 410 L600 700Z" fill="#4A2C12" opacity="0.85"/>
            <path d="M0 700 L0 540 L150 460 L280 510 L380 440 L500 490 L600 450 L600 700Z" fill="#5A3418" opacity="0.8"/>
            <path d="M0 700 L0 600 L200 540 L350 580 L500 530 L600 560 L600 700Z" fill="#6B3D1C" opacity="0.75"/>
            {/* horizon glow strip */}
            <rect x="0" y="195" width="600" height="30" fill="#C45C26" opacity="0.08"/>
          </svg>
 
          {/* logo centered */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
          }}>
            <div style={{
              width: 420, height: 420, borderRadius: '50%',
              background: 'rgba(26,10,0,0.55)', backdropFilter: 'blur(10px)',
              border: '1.5px solid rgba(232,162,101,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 80px rgba(196,92,38,0.2)',
            }}>
              <img src="/sampLOGO.png" alt="Bandang IBAYO" style={{ width: 340, height: 340, objectFit: 'contain' }}/>
            </div>
          </div>
 
          {/* bottom fade into page */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(to bottom,transparent,#1A0A00)', zIndex: 3 }}/>
        </div>
 
        {/* diagonal bottom edge */}
        <div style={{ position: 'absolute', bottom: -2, left: 0, right: 0, zIndex: 10 }}>
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none" style={{ width: '100%', height: 80, display: 'block' }}>
            <polygon points="0,80 1440,0 1440,80" fill="#FDF6EE"/>
          </svg>
        </div>
      </section>
 
      {/* Mobile hero fix */}
      <style>{`
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-grid > div:last-child { display: none !important; }
        }
      `}</style>
 
      {/* ── WHAT IS A JOINER TOUR ── */}
      <section style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.5rem,5vw,4rem)', textAlign: 'center' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C45C26', marginBottom: 16 }}>
            New to this?
          </span>
          <h2 style={{ fontWeight: 900, fontSize: 'clamp(2.2rem,4vw,3.5rem)', letterSpacing: '-0.03em', color: '#1A0A00', marginBottom: 20, lineHeight: 1.1 }}>
            What is a Joiner Tour?
          </h2>
          <p style={{ fontSize: 18, lineHeight: 1.8, fontWeight: 500, color: '#7A3A18', opacity: 0.85 }}>
            A Joiner is a solo traveler or small group who shares a tour package with others — splitting transport and accommodation costs so you can explore more without spending more. Check live seat availability, full pricing, and itinerary details all in one place.
          </p>
        </div>
      </section>
 
      {/* ── TOUR TYPE GRID ── */}
      <section style={{ background: '#F2E4D0', padding: 'clamp(4rem,8vw,7rem) clamp(1.5rem,5vw,4rem)', position: 'relative', clipPath: 'polygon(0 3%, 100% 0, 100% 97%, 0 100%)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>           
            <h2 style={{ fontWeight: 900, fontSize: 'clamp(2rem,3.5vw,3rem)', letterSpacing: '-0.03em', color: '#1A0A00', marginTop: 10, marginBottom: 8 }}>
              Choose Your Tour Type
            </h2>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#7A3A18', opacity: 0.7 }}>Solo, barkada, or custom — there's a fit for every kind of traveler.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 24 }}>
            {[
              { icon: <Users size={32} strokeWidth={1.6}/>, title: 'Joiner Tour', desc: 'Share a van and accommodation with other travelers. Perfect for solo adventurers on a budget.', tag: 'Most Popular', accent: '#C45C26' },
              { icon: <Map size={32} strokeWidth={1.6}/>, title: 'Exclusive Tour', desc: 'Book the entire vehicle for your group. Keep your itinerary private and travel at your own pace.', tag: 'For Groups', accent: '#7A3A18' },
              { icon: <Globe size={32} strokeWidth={1.6}/>, title: 'Request a Tour', desc: 'Have a destination in mind that isn\'t listed? Submit a custom request and we\'ll price it for you.', tag: 'Custom', accent: '#E8A265' },
            ].map((t, i) => (
              <div key={i} style={{
                background: '#FDF6EE', borderRadius: 24, padding: '36px 32px',
                border: '1px solid rgba(196,92,38,0.12)',
                boxShadow: '0 2px 20px rgba(26,10,0,0.06)',
                transition: 'all 0.25s',
              }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: `${t.accent}18`, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  {t.icon}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <h3 style={{ fontWeight: 900, fontSize: 20, color: '#1A0A00', margin: 0 }}>{t.title}</h3>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.accent, background: `${t.accent}15`, padding: '3px 10px', borderRadius: 999 }}>{t.tag}</span>
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.7, color: '#7A3A18', margin: 0, opacity: 0.85 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
 
      {/* ── HOW TO BOOK ── */}
      <section style={{ padding: 'clamp(5rem,10vw,8rem) clamp(1.5rem,5vw,4rem)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C45C26' }}>Simple Process</span>
            <h2 style={{ fontWeight: 900, fontSize: 'clamp(2rem,3.5vw,3rem)', letterSpacing: '-0.03em', color: '#1A0A00', marginTop: 10, marginBottom: 8 }}>How to Book</h2>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#7A3A18', opacity: 0.7 }}>No more chaotic Facebook threads. Confirm your seat in minutes.</p>
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
                  <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', color: '#C45C26', textTransform: 'uppercase' }}>{s.num}</span>
                  <h3 style={{ fontWeight: 900, fontSize: 20, color: '#1A0A00', margin: '4px 0 8px' }}>{s.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: '#7A3A18', margin: 0, opacity: 0.85 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
 
      {/* ── FEATURED TOURS ── */}
      <section style={{ background: '#F2E4D0', padding: 'clamp(4rem,8vw,7rem) clamp(1.5rem,5vw,4rem)', clipPath: 'polygon(0 3%, 100% 0, 100% 100%, 0 100%)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C45C26' }}>Live Now</span>
              <h2 style={{ fontWeight: 900, fontSize: 'clamp(2rem,3.5vw,3rem)', letterSpacing: '-0.03em', color: '#1A0A00', margin: '8px 0 4px' }}>Upcoming Adventures</h2>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#7A3A18', opacity: 0.7, margin: 0 }}>Verified joiner packages, updated in real time.</p>
            </div>
            <Link to="/login" style={{ fontWeight: 900, fontSize: 14, color: '#C45C26', textDecoration: 'none', letterSpacing: '0.04em' }}>
              Explore All →
            </Link>
          </div>
 
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5rem 0', color: '#C45C26' }}>
              <Loader2 style={{ animation: 'spin 1s linear infinite' }} size={36}/>
              <p style={{ marginTop: 16, fontWeight: 800, fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.6 }}>Syncing Tours…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : tours.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 28 }}>
              {tours.map((tour) => (
                <div key={tour.id} style={{
                  background: '#FDF6EE', borderRadius: 24, overflow: 'hidden',
                  border: '1px solid rgba(196,92,38,0.1)',
                  boxShadow: '0 4px 24px rgba(26,10,0,0.07)',
                  display: 'flex', flexDirection: 'column',
                  transition: 'transform 0.3s, box-shadow 0.3s',
                }}>
                  <div style={{ height: 220, overflow: 'hidden', position: 'relative', background: '#2D1B0E' }}>
                    <img src={tour.image_urls?.[0] || '/LogoLS.png'} alt={tour.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s' }}/>
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
                      <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: '#C45C26', marginBottom: 20 }}>
                        <MapPin size={14}/> {tour.destination}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                          [<Calendar size={15}/>, formatDate(tour.start_date)],
                          [<Clock size={15}/>, tour.duration],
                          [<Users size={15}/>, `${tour.group_size} max pax`],
                        ].map(([icon, text], i) => (
                          <p key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#7A3A18', margin: 0, opacity: 0.85 }}>
                            <span style={{ color: '#C45C26' }}>{icon}</span>{text}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 22, marginTop: 22, borderTop: '1px solid rgba(196,92,38,0.1)' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.6, marginBottom: 2 }}>Starting at</div>
                        <span style={{ fontSize: 28, fontWeight: 900, color: '#1A0A00', letterSpacing: '-0.03em' }}>₱{tour.price.toLocaleString()}</span>
                      </div>
                      <Link to="/login" style={{
                        fontWeight: 900, fontSize: 13, color: '#FDF6EE', textDecoration: 'none',
                        background: '#1A0A00', borderRadius: 12, padding: '12px 22px',
                        letterSpacing: '0.04em', boxShadow: '0 4px 14px rgba(26,10,0,0.22)',
                      }}>Book Now</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '5rem', textAlign: 'center', borderRadius: 24, border: '2px dashed rgba(196,92,38,0.25)', background: 'rgba(253,246,238,0.5)' }}>
              <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C45C26', opacity: 0.6, margin: 0 }}>Check back soon for new dates!</p>
            </div>
          )}
        </div>
      </section>
 
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
                { icon: <Clock size={24} strokeWidth={1.8}/>, title: 'Real-Time ETA Tracking', text: 'Know exactly when your vehicle is arriving at the pickup point.' },
                { icon: <Calendar size={24} strokeWidth={1.8}/>, title: 'Live Availability', text: 'Open dates, remaining seats, and full pricing — updated in real time.' },
                { icon: <Smartphone size={24} strokeWidth={1.8}/>, title: 'No More Facebook Chaos', text: 'Confirm your booking instantly without waiting on DMs or comment threads.' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 16 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(232,162,101,0.12)', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <div>
                    <h4 style={{ fontWeight: 900, fontSize: 16, color: '#FDF6EE', margin: '0 0 4px' }}>{item.title}</h4>
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(232,210,190,0.55)', margin: 0 }}>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
 
          {/* safety card */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(232,162,101,0.14)', borderRadius: 28, padding: '40px 36px' }}>
            <h3 style={{ fontWeight: 900, fontSize: 24, color: '#E8A265', margin: '0 0 16px' }}>Safety & Transparency</h3>
            <p style={{ fontSize: 15, lineHeight: 1.75, color: 'rgba(232,210,190,0.7)', marginBottom: 28 }}>
              Building trust is our priority, especially for solo travelers. Organizer accountability details are always visible, and medical term acceptance is required before every booking.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 36 }}>
              {['Non-refundable deposit policy protects both parties.', 'Automatic email reminder sent 24 hours before departure.'].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <CheckCircle size={17} style={{ color: '#E8A265', flexShrink: 0, marginTop: 2 }}/>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(232,210,190,0.6)', margin: 0 }}>{item}</p>
                </div>
              ))}
            </div>
            <Link to="/register" style={{
              display: 'inline-block', fontWeight: 900, fontSize: 14, color: '#1A0A00', textDecoration: 'none',
              background: '#E8A265', borderRadius: 12, padding: '14px 28px',
              letterSpacing: '0.04em', boxShadow: '0 6px 20px rgba(232,162,101,0.3)',
            }}>Browse Available Tours</Link>
          </div>
        </div>
      </section>
 
      {/* ── ABOUT & CONTACT ── */}
      <section style={{ padding: 'clamp(5rem,10vw,8rem) clamp(1.5rem,5vw,4rem)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 56, alignItems: 'start' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#C45C26', display: 'block', marginBottom: 16 }}>About</span>
            <h2 style={{ fontWeight: 900, fontSize: 'clamp(2.5rem,4vw,3.8rem)', letterSpacing: '-0.04em', color: '#1A0A00', lineHeight: 1.0, margin: '0 0 20px' }}>
              Bandang<br/><span style={{ color: '#C45C26' }}>IBAYO.</span>
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.8, color: '#7A3A18', marginBottom: 32, opacity: 0.9 }}>
              A local travel agency from Bulacan on a mission to help Filipinos explore the country affordably. By modernizing our booking process, every trip is secure, organized, and stress-free from day one.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <a href="https://facebook.com/bandangibayo" target="_blank" rel="noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 13,
                color: '#1877F2', textDecoration: 'none', background: '#EFF6FF',
                border: '1px solid #BFDBFE', borderRadius: 12, padding: '10px 18px',
              }}><FaFacebook size={18}/> Facebook</a>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 13,
                color: '#7A3A18', background: '#FDF6EE', border: '1px solid rgba(196,92,38,0.15)',
                borderRadius: 12, padding: '10px 18px',
              }}><Phone size={16} style={{ color: '#C45C26' }}/> +63 9XX XXX XXXX</div>
            </div>
          </div>
 
          <div style={{ background: '#FDF6EE', borderRadius: 28, padding: '36px 32px', border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 24px rgba(26,10,0,0.07)' }}>
            <h3 style={{ fontWeight: 900, fontSize: 20, color: '#1A0A00', margin: '0 0 20px' }}>Contact Our Coordinator</h3>
            <div style={{ background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.2)', borderRadius: 16, padding: '16px 20px', marginBottom: 24 }}>
              <p style={{ fontWeight: 800, fontSize: 13, color: '#C45C26', margin: '0 0 4px' }}>For Exclusive & Request Tours Only</p>
              <p style={{ fontSize: 13, color: '#7A3A18', margin: 0, opacity: 0.8 }}>Joiner tours can be booked directly on the platform.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 15, fontWeight: 700, color: '#1A0A00', margin: 0 }}>
                <Mail size={18} style={{ color: '#C45C26', flexShrink: 0 }}/> bandangibayo@gmail.com
              </p>
              <p style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 15, fontWeight: 700, color: '#1A0A00', margin: 0 }}>
                <MapPin size={18} style={{ color: '#C45C26', flexShrink: 0 }}/> Bulacan, Philippines
              </p>
            </div>
          </div>
        </div>
      </section>
 
      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(196,92,38,0.15)', padding: '28px clamp(1.5rem,5vw,4rem)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
  {/* Car Custom Image Icon */}
  <img 
    src={logoIcon} 
    alt="BANDANG IBAYO" 
    style={{ width: 68, height: 68, objectFit: 'contain' }} 
  />
          <span style={{ fontWeight: 900, fontSize: 13, color: '#1A0A00', letterSpacing: '-0.02em' }}>Bandang <span style={{ color: '#C45C26' }}>IBAYO</span></span>
        </div>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.5, margin: 0 }}>
          © 2026 
        </p>
      </footer>
 
    </div>
  );
}
 
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<JoinerLogin />} />
      <Route path="/register" element={<JoinerRegister />} />
      <Route path="/dashboard/*" element={<ProtectedRoute><JoinerDashboard /></ProtectedRoute>} />
      <Route path="/admin/*" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}