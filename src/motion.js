// ─────────────────────────────────────────────
// MOTION: the site's small animations, in one place.
//  • pageEnter(): a new page fades and slides in (called when the page changes).
//  • startReveal(): cards and sections rise into view as you scroll.
//  • celebrate(): a short burst of confetti for happy moments.
// Nothing moves for people who ask for less motion (their phone or computer's
// "reduce motion" setting). Low-power phones (index.html sets data-lite) get
// only the light ones: no confetti, a shorter page change.
// The CSS side (buttons, pop-ups, menus, bell, star…) is in index.css: "Motion".
// ─────────────────────────────────────────────

export const lessMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const lite = () => !!document.documentElement.dataset.lite;

// Fades and slides in the page under `root` (skips its top bar).
export const pageEnter = (root) => {
  if (!root || lessMotion() || typeof root.animate !== 'function') return;
  const frames = [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }];
  [...root.children].forEach((el) => {
    if (el.classList.contains('dashboard-topbar') || el.matches('nav, header.site-nav, .site-nav')) return;
    el.animate(frames, { duration: lite() ? 200 : 320, easing: 'cubic-bezier(.2,.7,.3,1)' });
  });
};

// Cards that rise into view. Ones already on screen when they appear don't
// move (the page change covers them); ones further down wait until scrolled to.
const REVEAL = '.boarding-pass, .polaroid, .clickable-card, .grow-card, .journal-ticket, .reveal-on-scroll, .dashboard-content article';
let started = false;
export const startReveal = () => {
  if (started || lessMotion() || !('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
  started = true;
  const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('fx-in');
    seen.unobserve(e.target);
  }), { rootMargin: '0px 0px -6% 0px' });
  const scan = (node) => {
    if (!(node instanceof Element)) return;
    const found = node.matches(REVEAL) ? [node] : [];
    found.push(...node.querySelectorAll(REVEAL));
    found.forEach((el) => {
      if (el.dataset.fxSeen) return;
      el.dataset.fxSeen = '1';
      if (el.closest('[role="dialog"]')) return; // pop-ups have their own entrance
      if (el.getBoundingClientRect().top < window.innerHeight) return; // already in view
      el.classList.add('fx-reveal');
      seen.observe(el);
    });
  };
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
};

// Confetti from the top of the screen, gone in about 2 seconds.
const COLORS = ['#FF7A3D', '#FFB23D', '#0A8BA6', '#2BB3C9', '#19A974', '#E6266E', '#FFD27A'];
export const celebrate = () => {
  if (lessMotion() || lite() || typeof document === 'undefined') return;
  const box = document.createElement('div');
  box.className = 'fx-confetti';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 70; i += 1) {
    const p = document.createElement('i');
    const x = Math.random() * 100;
    p.style.left = `${x}vw`;
    p.style.background = COLORS[i % COLORS.length];
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 30}vw`);
    p.style.setProperty('--spin', `${(Math.random() - 0.5) * 1440}deg`);
    p.style.animationDelay = `${Math.random() * 0.35}s`;
    p.style.animationDuration = `${1.4 + Math.random() * 0.9}s`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2800);
};
