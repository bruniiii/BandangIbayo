import { useLayoutEffect, useRef } from 'react';
import { lessMotion } from '../motion';

// ─────────────────────────────────────────────
// A number that counts up from 0 when it first shows (dashboards' totals).
// Keeps the value's own look: "₱12,450.00" counts as ₱0.00 → ₱12,450.00,
// "42" as 0 → 42. Text without a number is shown as is.
// ─────────────────────────────────────────────

const NUM = /-?\d[\d,]*(\.\d+)?/;

const format = (text, m, n) => {
  const decimals = m[1] ? m[1].length - 1 : 0;
  const num = n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: m[0].includes(',') });
  return `${text.slice(0, m.index)}${num}${text.slice(m.index + m[0].length)}`;
};

const CountUp = ({ value, duration = 900 }) => {
  const text = String(value ?? '');
  const ref = useRef(null);

  // The span's text is written here only (no re-render per frame, and React
  // never holds a text node that this replaces).
  useLayoutEffect(() => {
    const el = ref.current;
    const m = text.match(NUM);
    if (!el) return undefined;
    if (!m || lessMotion()) { el.textContent = text; return undefined; }
    const target = Number(m[0].replace(/,/g, ''));
    const t0 = performance.now();
    let raf = 0;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      el.textContent = format(text, m, target * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    el.textContent = format(text, m, 0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, duration]);

  return <span ref={ref} />;
};

export default CountUp;
