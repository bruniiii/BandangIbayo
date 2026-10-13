import { useSyncExternalStore } from 'react';
import { CheckCircle2, XCircle, Info, Loader2, X } from 'lucide-react';
import { subscribe, getToasts, dismiss } from './toast';

// Where toasts appear: bottom-right on desktop, bottom-center on phones.
// Screen readers announce them (polite for info/success, assertive for errors).

const STYLES = {
  success: { icon: CheckCircle2, accent: '#4E6B48', bg: '#FFFFFF', title: '#0E0F0B' },
  error: { icon: XCircle, accent: '#B24F55', bg: '#FBEFEF', title: '#7A363C' },
  info: { icon: Info, accent: '#B5511B', bg: '#FFFFFF', title: '#0E0F0B' },
  loading: { icon: Loader2, accent: '#B5511B', bg: '#FFFFFF', title: '#0E0F0B' },
};

const Toaster = () => {
  const toasts = useSyncExternalStore(subscribe, getToasts);
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed', zIndex: 2000, right: 16, bottom: 16, left: 16,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, pointerEvents: 'none',
      }}
      className="toaster"
    >
      <style>{`
        @keyframes toast-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes toast-spin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) { .toaster { align-items: center !important; } }
      `}</style>
      {toasts.map((t) => {
        const s = STYLES[t.type] || STYLES.info;
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            style={{
              pointerEvents: 'auto', width: 'min(380px, 100%)', boxSizing: 'border-box',
              display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 12px 14px 16px',
              background: s.bg, borderRadius: 14, borderLeft: `5px solid ${s.accent}`,
              boxShadow: '0 12px 32px rgba(14,15,11,0.18)', fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
              animation: 'toast-in 0.2s ease-out',
            }}
          >
            <Icon size={20} style={{ color: s.accent, flexShrink: 0, marginTop: 1, animation: t.type === 'loading' ? 'toast-spin 1s linear infinite' : 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: s.title, lineHeight: 1.4 }}>{t.title}</p>
              {t.message && <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#5E6A5A', lineHeight: 1.5, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{t.message}</p>}
              {t.action && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => { dismiss(t.id); t.action.onClick(); }}
                  style={{ background: 'none', border: 'none', padding: '6px 0 0', fontFamily: 'inherit', fontSize: 12.5 }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            {t.type !== 'loading' && (
              <button
                type="button"
                aria-label="Close notification"
                onClick={() => dismiss(t.id)}
                style={{ background: 'none', border: 'none', color: '#5E6A5A', cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex' }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Toaster;
