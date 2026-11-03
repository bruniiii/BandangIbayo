import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { primaryBtn, secondaryBtn, dangerBtn, COLORS } from './buttons';

// The dialog box itself; opened with confirmDialog() from ./ConfirmDialog.
// typeToConfirm: a second check for big changes: the button works only after
// this word is typed.
const ConfirmDialogBox = ({ title, message, confirmLabel, cancelLabel, tone, typeToConfirm = '', onClose }) => {
  const [typed, setTyped] = useState('');
  const word = String(typeToConfirm || '').toLowerCase();
  const ready = !word || typed.trim().toLowerCase() === word;
  const typeRef = useRef(null);
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const danger = tone === 'danger';

  useEffect(() => {
    (word ? typeRef : danger ? cancelRef : confirmRef).current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [danger, word, onClose]);

  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={() => onClose(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? 'confirm-message' : undefined}
        style={{
          position: 'relative', width: '100%', maxWidth: 420, background: COLORS.cream, borderRadius: 22,
          padding: '1.6rem', boxShadow: '0 24px 60px rgba(26,10,0,0.35)',
          borderTop: `6px solid ${danger ? COLORS.danger : COLORS.primary}`,
          fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: danger ? 'rgba(192,54,44,0.1)' : 'rgba(180,81,30,0.12)', color: danger ? COLORS.danger : COLORS.primary,
          }}>
            <Icon size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 id="confirm-title" style={{ margin: '6px 0 6px', fontSize: 17, fontWeight: 900, color: COLORS.dark, lineHeight: 1.3 }}>{title}</h2>
            {message && (
              <p id="confirm-message" style={{ margin: 0, fontSize: 13, color: COLORS.rust, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{message}</p>
            )}
            {word && (
              <form onSubmit={(e) => { e.preventDefault(); if (ready) onClose(true); }} style={{ marginTop: 12 }}>
                <label htmlFor="confirm-type" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: COLORS.dark, marginBottom: 6 }}>
                  To confirm, type <strong style={{ color: danger ? COLORS.danger : COLORS.primary }}>{word}</strong> below.
                </label>
                <input
                  ref={typeRef} id="confirm-type" value={typed} onChange={(e) => setTyped(e.target.value)}
                  placeholder={word} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={30}
                  aria-invalid={typed !== '' && !ready}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#FDF6EE', borderRadius: 12, padding: '10px 12px',
                    border: `1px solid ${ready ? (danger ? COLORS.danger : COLORS.primary) : 'rgba(168,72,26,0.25)'}`,
                    fontSize: 16, fontWeight: 700, color: COLORS.dark, fontFamily: 'inherit',
                  }}
                />
              </form>
            )}
          </div>
        </div>
        {/* Phones: the two buttons stack full width, the main one on top. */}
        <div className="confirm-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 22 }}>
          <button ref={cancelRef} type="button" onClick={() => onClose(false)} style={secondaryBtn()}>{cancelLabel}</button>
          <button ref={confirmRef} type="button" onClick={() => ready && onClose(true)} disabled={!ready}
            title={ready ? undefined : `Type "${word}" first`}
            style={{ ...(danger ? dangerBtn() : primaryBtn()), ...(ready ? {} : { opacity: 0.45, cursor: 'not-allowed', boxShadow: 'none' }) }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialogBox;
