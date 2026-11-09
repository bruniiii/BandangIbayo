import { useEffect } from 'react';

// Hooks and styles for the landing page extras (see LandingFx.jsx).

export const lessMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Sections' headings, blocks and cards slide up and fade in when they come
// into view (grids one card after another). Elements already on screen are
// left alone, and the marker is removed afterwards so hover effects still work.
export const useScrollReveal = (rootRef) => {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || lessMotion() || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      io.unobserve(el);
      el.dataset.rv = 'in';
      setTimeout(() => { delete el.dataset.rv; el.style.removeProperty('--rv-delay'); }, 1100 + (Number(el.dataset.rvN) || 0) * 90);
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    const add = (el, n = 0) => {
      if (el.dataset.rvSeen || el.tagName === 'STYLE' || el.tagName === 'SVG') return;
      el.dataset.rvSeen = '1';
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return; // already visible: no flash
      el.dataset.rv = 'wait';
      el.dataset.rvN = String(n);
      el.style.setProperty('--rv-delay', `${Math.min(n, 6) * 90}ms`);
      io.observe(el);
    };
    const scan = () => root.querySelectorAll('section[data-reveal] > div > *').forEach((el) => {
      const kids = [...el.children];
      if (kids.length > 1 && getComputedStyle(el).display === 'grid') kids.forEach((k, i) => add(k, i));
      else add(el);
    });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect(); io.disconnect();
      // Nothing stays hidden if this stops (and a fresh start can pick everything up again).
      root.querySelectorAll('[data-rv-seen]').forEach((el) => { delete el.dataset.rv; delete el.dataset.rvSeen; delete el.dataset.rvN; el.style.removeProperty('--rv-delay'); });
    };
  }, [rootRef]);
};

// Tour cards lean toward the mouse.
export const useCardTilt = (rootRef) => {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || lessMotion() || !window.matchMedia?.('(hover: hover)').matches) return undefined;
    let last = null;
    const reset = (card) => { card?.style.removeProperty('--rx'); card?.style.removeProperty('--ry'); };
    const move = (e) => {
      const card = e.target.closest?.('.tour-card');
      if (card !== last) { reset(last); last = card; }
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.classList.add('fx-tilt');
      card.style.setProperty('--ry', `${(x * 7).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${(-y * 7).toFixed(2)}deg`);
    };
    const leave = () => { reset(last); last = null; };
    root.addEventListener('mousemove', move);
    root.addEventListener('mouseleave', leave);
    return () => { root.removeEventListener('mousemove', move); root.removeEventListener('mouseleave', leave); };
  }, [rootRef]);
};

export const LANDING_FX_CSS = `
/* 1. Hero photos */
.fx-hero-slides { position: absolute; inset: 0; z-index: 0; overflow: hidden; }
.fx-hero-slides img { position: absolute; inset: -3%; width: 106%; height: 106%; max-width: none; max-height: none; object-fit: cover; opacity: 0;
  transition: opacity 1.6s ease; animation: fx-drift 22s ease-in-out infinite alternate; }
.fx-hero-slides img.is-on { opacity: 1; }
@keyframes fx-drift { from { transform: scale(1.02); } to { transform: scale(1.1) translate3d(-1.2%, -0.8%, 0); } }
.hero-photos .hero-left { background: linear-gradient(90deg, rgba(26,10,0,0.93) 0%, rgba(26,10,0,0.8) 55%, rgba(26,10,0,0.35) 100%) !important; }
.hero-photos .hero-cut { display: none !important; }
.hero-photos > div:last-of-type { background: linear-gradient(90deg, rgba(26,10,0,0.35), rgba(26,10,0,0.18)) !important; }
.hero-photos > div:last-of-type > svg, .hero-photos > div:last-of-type > div:last-child { display: none; }
.hero-photos::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 110px; z-index: 1; pointer-events: none; background: linear-gradient(to bottom, transparent, rgba(26,10,0,0.75)); }
@media (max-width: 768px) { .hero-photos .hero-left { background: linear-gradient(180deg, rgba(26,10,0,0.82), rgba(26,10,0,0.7)) !important; } }

/* Mountain ridge between sections */
.fx-mountains { display: block; width: 100%; height: clamp(40px, 7vw, 110px); margin-bottom: -1px; }

/* 2. The road trip */
.fx-rail { position: fixed; z-index: 40; left: 22px; top: 50%; height: min(56vh, 420px); width: 20px; transform: translateY(-50%);
  opacity: 0; pointer-events: none; transition: opacity 0.4s ease; display: none; }
.fx-rail.is-on { opacity: 1; pointer-events: auto; }
.fx-rail-line { position: absolute; left: 9px; top: 0; bottom: 0; border-left: 3px dotted #B4511E; opacity: 0.75; }
.fx-stop { position: absolute; left: 3px; width: 15px; height: 15px; margin-top: -7.5px; padding: 0; border-radius: 50%; cursor: pointer;
  background: #FDF6EE; border: 3px solid #B4511E; box-shadow: 0 2px 8px rgba(26,10,0,0.25); transition: transform 0.2s, background 0.2s; }
.fx-stop.is-passed { background: #B4511E; }
.fx-stop.is-here { transform: scale(1.25); }
.fx-stop-label { position: absolute; left: 24px; top: 50%; transform: translateY(-50%) translateX(-6px); white-space: nowrap; pointer-events: none; opacity: 0;
  padding: 5px 11px; border-radius: 999px; background: #1A0A00; color: #FDF6EE; font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 800;
  letter-spacing: 0.1em; text-transform: uppercase; box-shadow: 0 6px 16px rgba(26,10,0,0.3); transition: opacity 0.2s, transform 0.2s; }
.fx-stop:hover .fx-stop-label, .fx-stop:focus-visible .fx-stop-label, .fx-rail:hover .fx-stop.is-here .fx-stop-label { opacity: 1; transform: translateY(-50%); }
.fx-van { position: absolute; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: #1A0A00; background: #E8A265;
  border: 2px solid #FDF6EE; box-shadow: 0 6px 16px rgba(26,10,0,0.35); pointer-events: none; }
.fx-rail .fx-van { left: -5px; width: 30px; height: 30px; margin-top: -15px; transition: top 0.25s ease-out; }
.fx-bar { position: fixed; z-index: 49; left: 0; right: 0; top: 60px; height: 0; border-top: 3px dotted rgba(180,81,30,0.55); opacity: 0; transition: opacity 0.3s; pointer-events: none; }
.fx-bar.is-on { opacity: 1; }
.fx-bar-done { position: absolute; left: 0; top: -3px; height: 3px; background: #B4511E; }
.fx-bar .fx-van { top: -13px; width: 24px; height: 24px; margin-left: -12px; transition: left 0.2s ease-out; }
@media (min-width: 1280px) { .fx-rail { display: block; } .fx-bar { display: none; } }
@media (min-width: 641px) { .fx-bar { top: 64px; } }

/* 3. Slide in on scroll */
[data-rv] { transition: opacity 0.75s ease var(--rv-delay, 0ms), transform 0.75s cubic-bezier(.2,.8,.2,1) var(--rv-delay, 0ms) !important; }
[data-rv="wait"] { opacity: 0 !important; transform: translateY(34px) !important; }

/* 4. Tour cards */
.tour-card.fx-tilt:hover { transform: perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateY(-6px) scale(1.03); transition: transform 0.12s ease-out, box-shadow 0.3s ease; }
.fx-slots { position: absolute; left: 14px; bottom: 12px; z-index: 2; padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 900; letter-spacing: 0.1em;
  text-transform: uppercase; color: #1A0A00; background: #E8A265; box-shadow: 0 4px 12px rgba(26,10,0,0.35); pointer-events: none;
  opacity: 0; transform: translateY(8px); transition: opacity 0.25s ease, transform 0.25s ease; }
.fx-slots.is-low { background: #B4511E; color: #FDF6EE; opacity: 1; transform: none; }
.tour-card:hover .fx-slots { opacity: 1; transform: none; }
@media (hover: none) { .fx-slots { opacity: 1; transform: none; } }

/* 5. Tour map */
.fx-map-card { display: grid; grid-template-columns: 1.05fr 0.95fr; border-radius: 28px; overflow: hidden; background: #1A0A00;
  box-shadow: 0 24px 60px rgba(26,10,0,0.28); border: 1px solid rgba(232,162,101,0.18); }
.fx-map { position: relative; min-height: 460px; background: radial-gradient(ellipse at 40% 35%, #3A2212 0%, #1A0A00 75%); }
.fx-map svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.fx-land { fill: #5A3418; stroke: #E8A265; stroke-opacity: 0.55; stroke-linejoin: round; }
.fx-pin { cursor: pointer; outline: none; }
.fx-pin-body { fill: #E8A265; stroke: #1A0A00; stroke-width: 1.5; transition: fill 0.2s; }
.fx-pin-dot { fill: #1A0A00; }
.fx-pin-pulse { fill: #E8A265; opacity: 0; transform-origin: center; transform-box: fill-box; }
.fx-pin.is-on .fx-pin-body { fill: #FDF6EE; }
.fx-pin.is-on .fx-pin-pulse { animation: fx-pulse 1.8s ease-out infinite; }
.fx-pin:focus-visible .fx-pin-body { stroke: #FDF6EE; stroke-width: 3; }
@keyframes fx-pulse { 0% { opacity: 0.55; transform: scale(0.5); } 100% { opacity: 0; transform: scale(2); } }
.fx-map-side { padding: clamp(1.25rem, 3vw, 2rem); display: flex; flex-direction: column; gap: 14px; color: #FDF6EE; min-width: 0; }
.fx-map-count { margin: 0; font-size: 11px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: #E8A265; }
.fx-map-tour { animation: fx-pop 0.35s ease; }
@keyframes fx-pop { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.fx-map-photo { height: 190px; border-radius: 18px; overflow: hidden; background: #2D1B0E; margin-bottom: 14px; }
.fx-map-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fx-map-tour h3 { margin: 0 0 6px; font-size: 21px; font-weight: 900; color: #FDF6EE; line-height: 1.2; }
.fx-map-meta { display: flex; align-items: center; gap: 8px; margin: 4px 0 0; font-size: 13.5px; font-weight: 600; color: rgba(232,210,190,0.9); }
.fx-map-meta svg { color: #E8A265; flex-shrink: 0; }
.fx-map-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(232,162,101,0.2); }
.fx-map-tiny { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(232,210,190,0.75); }
.fx-map-book { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 12px; background: #E8A265; color: #1A0A00; font-weight: 900;
  font-size: 13px; letter-spacing: 0.04em; text-decoration: none; box-shadow: 0 6px 20px rgba(232,162,101,0.35); white-space: nowrap; }
.fx-map-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; padding-top: 6px; }
.fx-map-list button, .fx-map-other { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; cursor: pointer; font-family: inherit;
  font-size: 12px; font-weight: 800; color: rgba(232,210,190,0.9); background: rgba(253,246,238,0.07); border: 1px solid rgba(232,162,101,0.25); text-decoration: none; }
.fx-map-list button.is-on { background: #E8A265; color: #1A0A00; border-color: #E8A265; }
@media (max-width: 860px) { .fx-map-card { grid-template-columns: 1fr; } .fx-map { min-height: 340px; } }

@media (prefers-reduced-motion: reduce) {
  .fx-hero-slides img, .fx-pin-pulse, .fx-map-tour { animation: none !important; }
  .fx-hero-slides img { transition: none; }
}
`;
