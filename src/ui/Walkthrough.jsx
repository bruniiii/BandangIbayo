import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Compass } from 'lucide-react';

// ─────────────────────────────────────────────
// First-time walkthrough: points at each menu item in turn (a spotlight on
// it, with a card that says what it's for). Shown once to new joiners and
// admins (remembered on this device), skippable, and can be replayed.
//   <Walkthrough steps={[{ target: 'Feed', title, body }]} open onClose onMenu={(open) => …} />
// target: the menu item's label (its data-tour attribute); none = a card in the middle.
// onMenu: phones open the side menu during the tour so the item can be seen.
// ─────────────────────────────────────────────

const PAD = 6;
const CARD_W = 320;

const Walkthrough = ({ steps, open, onClose, onMenu }) => {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[i];

  const measure = useCallback(() => {
    if (!step?.target) { setRect(null); return; }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    const r = el?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) { setRect(null); return; }
    el.scrollIntoView?.({ block: 'nearest' });
    setRect(el.getBoundingClientRect());
  }, [step]);

  useEffect(() => {
    if (!open) return undefined;
    const narrow = window.matchMedia?.('(max-width: 900px)').matches;
    if (narrow) onMenu?.(true);
    return () => { if (narrow) onMenu?.(false); };
  }, [open, onMenu]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(measure, 320); // after the menu slides in
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [open, i, measure]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, steps.length]);

  if (!open || !step) return null;
  const last = i === steps.length - 1;

  // The card sits beside the highlighted item (right of the menu), or in the middle.
  const vw = window.innerWidth, vh = window.innerHeight;
  let cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (rect) {
    const roomRight = vw - rect.right > CARD_W + 24;
    const left = roomRight ? rect.right + 16 : Math.max(12, Math.min(vw - CARD_W - 12, rect.left));
    const top = roomRight ? Math.max(12, Math.min(vh - 240, rect.top - 10)) : Math.min(vh - 240, rect.bottom + 12);
    cardStyle = { left, top };
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Quick tour" style={{ position: 'fixed', inset: 0, zIndex: 300000 }}>
      {/* The dark backdrop with a hole around the highlighted item */}
      {rect ? (
        <div aria-hidden="true" style={{
          position: 'fixed', left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          borderRadius: 14, boxShadow: '0 0 0 9999px rgba(26,10,0,0.62)', border: '2px solid #E8A265', transition: 'all 0.25s ease', pointerEvents: 'none',
        }} />
      ) : <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(26,10,0,0.62)' }} />}

      <div style={{
        position: 'fixed', width: CARD_W, maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box', ...cardStyle,
        background: '#FDF6EE', borderRadius: 18, padding: '1.1rem 1.2rem', boxShadow: '0 20px 50px rgba(26,10,0,0.4)', borderTop: '5px solid #B4511E',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A' }}>
            <Compass size={13} /> Quick tour · {i + 1} of {steps.length}
          </span>
          <button type="button" onClick={onClose} aria-label="Skip the tour" className="no-touch-size" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', padding: 4 }}><X size={16} /></button>
        </div>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 900, color: '#1A0A00' }}>{step.title}</h3>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#5C2A10', lineHeight: 1.55 }}>{step.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onClose} className="text-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Skip tour</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} style={navBtn(false)}><ChevronLeft size={14} /> Back</button>
            )}
            <button type="button" autoFocus onClick={() => (last ? onClose() : setI(i + 1))} style={navBtn(true)}>
              {last ? 'Done' : <>Next <ChevronRight size={14} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const navBtn = (main) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 36, padding: '0 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
  fontWeight: 900, fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase',
  background: main ? '#B4511E' : 'transparent', color: main ? '#FDF6EE' : '#5C2A10', border: main ? 'none' : '1px solid rgba(180,81,30,0.3)',
});

export default Walkthrough;
