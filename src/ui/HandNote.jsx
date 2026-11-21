import { useEffect } from 'react';
import { X } from 'lucide-react';
import { celebrate } from '../motion';

// ─────────────────────────────────────────────
// HANDWRITTEN NOTE: a little note card for happy moments (a payment went
// through, thanks for your feedback): lined paper held by a strip of tape,
// the message handwritten, signed by the team with a doodled heart.
//   <HandNote title="You're going!" onClose={…}>Your booking is confirmed.</HandNote>
// A short burst of confetti comes with it (confetti={false} to skip).
// Styles: index.css (.hand-note).
// ─────────────────────────────────────────────

const HandNote = ({ title, children, signature = '— the Bandang IBAYO team', onClose, style, confetti = true }) => {
  // A short burst of confetti when the note appears (motion.js).
  useEffect(() => { if (confetti) celebrate(); }, [confetti]);
  return (
  <div role="status" className="hand-note" style={style}>
    {onClose && (
      <button type="button" aria-label="Dismiss" className="hand-note-close" onClick={onClose}><X size={16} /></button>
    )}
    {title && <p className="hand-note-title">{title}</p>}
    <div className="hand-note-text">{children}</div>
    <p className="hand-note-sign">
      {signature}
      <svg aria-hidden="true" viewBox="0 0 24 22" width="20" height="18" style={{ display: 'inline-block', marginLeft: 6, verticalAlign: '-3px' }}>
        <path d="M12 20 C 4 14, 1 9, 3.5 5.5 C 6 2, 10 3.5, 12 7 C 14 3.5, 18 2, 20.5 5.5 C 23 9, 20 14, 12 20 Z" fill="none" stroke="var(--ib-accent, #B4511E)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </p>
  </div>
  );
};

export default HandNote;
