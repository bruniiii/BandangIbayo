import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────
// Full-screen photo viewer: opens on a photo, swipe (or the arrows / arrow
// keys) for the others, tap the X, the dark area or press Esc to close.
//   images: [url…]; start: the photo to open on; onClose()
// ─────────────────────────────────────────────

const round = {
  position: 'absolute', width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
  background: 'rgba(253,246,238,0.16)', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const PhotoViewer = ({ images = [], start = 0, onClose }) => {
  const [i, setI] = useState(start);
  const startX = useRef(null);
  const count = images.length;
  const go = (n) => setI(((n % count) + count) % count);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && count > 1) setI((n) => (n - 1 + count) % count);
      if (e.key === 'ArrowRight' && count > 1) setI((n) => (n + 1) % count);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [count, onClose]);

  if (!count) return null;
  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label={`Photo ${i + 1} of ${count}`}
      onClick={onClose}
      onPointerDown={(e) => { startX.current = e.clientX; }}
      onPointerUp={(e) => {
        if (startX.current == null || count < 2) return;
        const d = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(d) > 50) { e.stopPropagation(); go(d > 0 ? i - 1 : i + 1); }
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(26,10,0,0.94)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 12px', boxSizing: 'border-box', touchAction: 'pan-y',
      }}
    >
      <img
        src={images[i]} alt={`Photo ${i + 1} of ${count}`} draggable={false}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12, userSelect: 'none', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      />
      <button type="button" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ ...round, top: 14, right: 14 }}><X size={22} /></button>
      {count > 1 && (
        <>
          <button type="button" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); go(i - 1); }} style={{ ...round, left: 10, top: '50%', transform: 'translateY(-50%)' }}><ChevronLeft size={24} /></button>
          <button type="button" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); go(i + 1); }} style={{ ...round, right: 10, top: '50%', transform: 'translateY(-50%)' }}><ChevronRight size={24} /></button>
          <p style={{ position: 'absolute', bottom: 18, left: 0, right: 0, margin: 0, textAlign: 'center', color: '#FDF6EE', fontSize: 13, fontWeight: 800, fontFamily: "'Outfit', 'Inter', system-ui, sans-serif" }}>
            {i + 1} / {count}
          </p>
        </>
      )}
    </div>,
    document.body,
  );
};

export default PhotoViewer;
