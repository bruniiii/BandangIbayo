import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bus, MapPin, Calendar, ArrowRight } from 'lucide-react';
import PriceTag from '../ui/PriceTag';
import { weekdayRange } from '../tourUtils';
import { LUZON, project, placeOf } from './luzonMap';
import { lessMotion } from './landingHooks';

// ─────────────────────────────────────────────
// Landing page extras (same brown and cream design, more alive):
//  • HeroSlides: the open tours' photos fill the hero and fade one into the
//    next, under the dark brown tint.
//  • RoadTrip: a dotted route with a van that drives along it as the page
//    scrolls and stops at each section marked data-stop="Name" (a rail on
//    the left on wide screens, a line under the top bar on small ones).
//  • landingHooks.js: sections and cards slide in as they come into view;
//    tour cards tilt toward the mouse; and the styles for all of this.
//  • TourMap: Luzon with a pin per open tour; a pin shows its tour.
//  • MountainDivider: a mountain ridge between sections.
// Everything is skipped for people who ask for less motion.
// ─────────────────────────────────────────────


export const HeroSlides = ({ images }) => {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (images.length < 2 || lessMotion()) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), 6500);
    return () => clearInterval(t);
  }, [images.length]);
  if (!images.length) return null;
  return (
    <div className="fx-hero-slides" aria-hidden="true">
      {images.map((src, i) => (
        <img key={src} src={src} alt="" className={i === index % images.length ? 'is-on' : ''} decoding="async" fetchPriority={i === 0 ? 'high' : 'low'} />
      ))}
    </div>
  );
};

// A ridge of mountains in `color`, rising from the section above (or hanging
// from the one above when flipped).
export const MountainDivider = ({ color = '#1A0A00', flip = false }) => (
  <svg className="fx-mountains" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true" style={{ transform: flip ? 'scaleY(-1)' : 'none' }}>
    <path d="M0 120 L0 86 L90 52 L170 78 L270 30 L350 66 L430 20 L520 70 L610 40 L700 82 L800 26 L890 64 L980 12 L1070 60 L1160 34 L1250 74 L1340 44 L1440 80 L1440 120 Z" fill={color} opacity="0.45" />
    <path d="M0 120 L0 100 L120 70 L220 96 L330 58 L430 92 L540 62 L650 98 L760 54 L870 90 L980 50 L1090 88 L1200 60 L1310 94 L1440 66 L1440 120 Z" fill={color} />
  </svg>
);

export const RoadTrip = ({ rootRef }) => {
  const [stops, setStops] = useState([]);
  const [pos, setPos] = useState(0); // 0 … stops.length - 1 (between two stops while scrolling)
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let els = [];
    const scan = () => {
      els = [...root.querySelectorAll('[data-stop]')];
      setStops((old) => {
        const names = els.map((e) => e.dataset.stop);
        return names.join('|') === old.join('|') ? old : names;
      });
    };
    const update = () => {
      if (!els.length) return;
      const line = window.scrollY + window.innerHeight * 0.45;
      const tops = els.map((e) => e.getBoundingClientRect().top + window.scrollY);
      setShown(line > tops[0] - window.innerHeight * 0.2);
      let p = 0;
      for (let i = 0; i < tops.length; i++) {
        const next = tops[i + 1] ?? (document.documentElement.scrollHeight - window.innerHeight * 0.3);
        if (line >= next) { p = Math.min(i + 1, tops.length - 1); continue; }
        if (line >= tops[i]) p = i + Math.min(1, (line - tops[i]) / Math.max(1, next - tops[i]));
        break;
      }
      setPos(Math.min(p, tops.length - 1));
    };
    scan(); update();
    let queued = false;
    const onScroll = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; update(); }); };
    const mo = new MutationObserver(() => { scan(); onScroll(); });
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { mo.disconnect(); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [rootRef]);

  if (stops.length < 2) return null;
  const pct = (pos / (stops.length - 1)) * 100;
  const current = Math.round(pos);
  const go = (i) => rootRef.current?.querySelectorAll('[data-stop]')[i]?.scrollIntoView({ behavior: lessMotion() ? 'auto' : 'smooth', block: 'start' });

  return (
    <>
      {/* Wide screens: a route down the left edge */}
      <nav className={`fx-rail${shown ? ' is-on' : ''}`} aria-label="Sections of this page">
        <span className="fx-rail-line" aria-hidden="true" />
        {stops.map((name, i) => (
          <button key={name} type="button" className={`fx-stop no-touch-size${i <= current ? ' is-passed' : ''}${i === current ? ' is-here' : ''}`}
            style={{ top: `${(i / (stops.length - 1)) * 100}%` }} onClick={() => go(i)} aria-label={`Go to ${name}`} aria-current={i === current ? 'true' : undefined}>
            <span className="fx-stop-label">{name}</span>
          </button>
        ))}
        <span className="fx-van" style={{ top: `${pct}%` }} aria-hidden="true"><Bus size={15} /></span>
      </nav>
      {/* Small screens: a route under the top bar */}
      <div className={`fx-bar${shown ? ' is-on' : ''}`} aria-hidden="true">
        <span className="fx-bar-done" style={{ width: `${pct}%` }} />
        <span className="fx-van" style={{ left: `${pct}%` }}><Bus size={13} /></span>
      </div>
    </>
  );
};

// "3 slots left" on a tour card's photo.
export const SlotsTag = ({ tour, booked }) => {
  if (booked == null || !Number(tour.group_size)) return null;
  const left = Math.max(0, Number(tour.group_size) - Number(booked));
  return (
    <span className={`fx-slots${left <= 5 ? ' is-low' : ''}`}>
      {left === 0 ? 'Fully booked' : `${left} slot${left === 1 ? '' : 's'} left`}
    </span>
  );
};

const formatDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${m}-${day}-${y}`;
};

// Luzon with a pin for each open tour. Tours saved with a map route use its
// destination; the others are placed by their destination's name.
export const TourMap = ({ tours }) => {
  const { pins, others } = useMemo(() => {
    const placed = [], rest = [], used = {};
    tours.forEach((t) => {
      const end = t.route?.end;
      const at = (end && Number.isFinite(Number(end.lat)) && Number.isFinite(Number(end.lng)) ? { lat: end.lat, lng: end.lng } : null)
        || placeOf(t.destination) || placeOf(t.title);
      const pt = at && project(at.lat, at.lng);
      if (!pt) { rest.push(t); return; }
      // Tours at the same place sit side by side instead of on top of each other.
      const key = `${Math.round(pt.x / 8)}:${Math.round(pt.y / 8)}`;
      const n = used[key] = (used[key] || 0) + 1;
      placed.push({ tour: t, x: pt.x + (n - 1) * 11, y: pt.y - (n - 1) * 5 });
    });
    return { pins: placed, others: rest };
  }, [tours]);
  const [picked, setPicked] = useState(null);
  const svgRef = useRef(null);

  if (!pins.length) return null;
  const active = pins.find((p) => p.tour.id === picked) || pins[0];
  const t = active.tour;
  // The map is zoomed to where the pins are (with room around them), never tighter than a third of Luzon.
  const xs = pins.map((p) => p.x), ys = pins.map((p) => p.y);
  const pad = 70;
  let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const minH = LUZON.h * 0.42, ratio = 0.78; // width / height of the map box
  let h = Math.max(y1 - y0, minH, (x1 - x0) / ratio), w = h * ratio;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  h = Math.min(h, LUZON.h); w = Math.min(w, LUZON.w);
  x0 = Math.min(Math.max(0, cx - w / 2), LUZON.w - w); y0 = Math.min(Math.max(0, cy - h / 2), LUZON.h - h);
  const unit = h / 420; // keeps pins the same size on screen whatever the zoom

  return (
    <section data-stop="Map" data-reveal style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.5rem,5vw,4rem)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#A8481A' }}>Where We're Going</span>
          <h2 style={{ fontWeight: 900, fontSize: 'clamp(2rem,3.5vw,3rem)', letterSpacing: '-0.03em', color: '#1A0A00', margin: '8px 0 4px' }}>Find Your Next Stop</h2>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>Tap a pin to see the tour going there.</p>
        </div>

        <div className="fx-map-card">
          <div className="fx-map">
            <svg ref={svgRef} viewBox={`${x0} ${y0} ${w} ${h}`} role="group" aria-label="Map of Luzon with a pin for each open tour">
              <path d={LUZON.d} className="fx-land" style={{ strokeWidth: 1.2 * unit }} />
              {pins.map((p) => {
                const on = p.tour.id === t.id;
                return (
                  <g key={p.tour.id} className={`fx-pin${on ? ' is-on' : ''}`} transform={`translate(${p.x} ${p.y}) scale(${unit})`}
                    role="button" tabIndex={0} aria-label={`${p.tour.title}, ${p.tour.destination}`} aria-pressed={on}
                    onClick={() => setPicked(p.tour.id)} onMouseEnter={() => setPicked(p.tour.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(p.tour.id); } }}>
                    <circle r="16" className="fx-pin-pulse" />
                    <circle r="16" fill="transparent" />
                    <path d="M0 -22 C-8 -22 -13 -16 -13 -9.5 C-13 -1 0 9 0 9 C0 9 13 -1 13 -9.5 C13 -16 8 -22 0 -22 Z" className="fx-pin-body" />
                    <circle cy="-10" r="4.5" className="fx-pin-dot" />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="fx-map-side">
            <p className="fx-map-count">{pins.length} tour{pins.length === 1 ? '' : 's'} on the map</p>
            <article key={t.id} className="fx-map-tour">
              <div className="fx-map-photo">
                <img src={t.image_urls?.[0] || '/tour-placeholder.webp'} alt={t.title} loading="lazy" decoding="async" />
              </div>
              <h3>{t.title}</h3>
              <p className="fx-map-meta"><MapPin size={14} /> {t.destination}</p>
              <p className="fx-map-meta"><Calendar size={14} /> {formatDate(t.start_date)} ({weekdayRange(t.start_date, t.duration)}){t.dates?.length > 1 ? `  +${t.dates.length - 1} more` : ''}</p>
              <div className="fx-map-foot">
                <div>
                  <div className="fx-map-tiny">Starts at</div>
                  <PriceTag tour={t} size={24} color="#FDF6EE" mutedColor="rgba(232,210,190,0.75)" align="flex-start" style={{ letterSpacing: '-0.03em' }} />
                </div>
                <Link to={`/tours/${t.id}`} className="btn-primary fx-map-book">Book Now <ArrowRight size={15} /></Link>
              </div>
            </article>
            <div className="fx-map-list">
              {pins.map((p) => (
                <button key={p.tour.id} type="button" className={`no-touch-size${p.tour.id === t.id ? ' is-on' : ''}`} onClick={() => setPicked(p.tour.id)}>
                  <MapPin size={12} /> {p.tour.title}
                </button>
              ))}
              {others.map((o) => (
                <Link key={o.id} to={`/tours/${o.id}`} className="fx-map-other">{o.title} <ArrowRight size={12} /></Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
