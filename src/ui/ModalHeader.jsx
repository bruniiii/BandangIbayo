import { X } from 'lucide-react';

// Top of an admin details window, in the Joiner Accounts style: a round
// avatar (photo or initials), a small label, the title, then a status line.
// The window itself carries the orange top edge (borderTop 6px #B4511E).

const initialsOf = (name) =>
  String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

const ModalHeader = ({ name, photo, label, title, children, onClose }) => (
  <div className="modal-header-light" style={{
    position: 'relative', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
    padding: '1.75rem 4rem 1.4rem 2.25rem', borderBottom: '1px solid rgba(180,81,30,0.12)',
  }}>
    <div style={{
      width: 60, height: 60, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#E8A265', fontWeight: 900, fontSize: 20,
    }}>
      {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(name)}
    </div>
    <div style={{ minWidth: 0, flex: 1 }}>
      {label && (
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 3px' }}>
          {label}
        </p>
      )}
      <p style={{ fontWeight: 900, fontSize: 18, color: '#1A0A00', margin: 0, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{title}</p>
      {children && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{children}</div>}
    </div>
    <button type="button" onClick={onClose} aria-label="Close" style={{
      position: 'absolute', top: 18, right: 18, background: 'none', border: 'none',
      cursor: 'pointer', color: 'rgba(122,58,24,0.85)', padding: 4, display: 'flex',
    }}>
      <X size={20} />
    </button>
  </div>
);

export default ModalHeader;
