import { useSyncExternalStore } from 'react';
import { CheckCircle2, XCircle, Info, Loader2, X } from 'lucide-react';
import { subscribe, getToasts, dismiss } from './toast';

// Where toasts appear: the top of the screen, centred, so they're noticed.
// Each has a coloured top bar and icon by type; they slide down from the top.
// Screen readers announce them (polite for info/success, assertive for errors).
// Colours follow Light/Dark glass (the .toast styles below).

const STYLES = {
  success: { icon: CheckCircle2, accent: '#2E9B5F' },
  error: { icon: XCircle, accent: '#D9443A' },
  info: { icon: Info, accent: '#D9772F' },
  loading: { icon: Loader2, accent: '#D9772F' },
};

const CSS = `
.toaster { position: fixed; z-index: 200001; top: 14px; left: 50%; transform: translateX(-50%); width: min(520px, calc(100% - 24px));
  display: flex; flex-direction: column; align-items: stretch; gap: 10px; pointer-events: none; }
.toast { pointer-events: auto; position: relative; overflow: hidden; display: flex; gap: 14px; align-items: flex-start; box-sizing: border-box;
  padding: 16px 14px 16px 18px; border-radius: 18px; font-family: 'Outfit', 'Inter', system-ui, sans-serif;
  background: rgba(255,255,255,0.94); color: #1A0A00; border: 1px solid rgba(255,255,255,0.9);
  box-shadow: 0 18px 50px rgba(26,10,0,0.28), 0 2px 6px rgba(26,10,0,0.08);
  -webkit-backdrop-filter: blur(20px) saturate(170%); backdrop-filter: blur(20px) saturate(170%);
  animation: toast-in 0.28s cubic-bezier(.2,.9,.3,1.2); }
.toast::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--toast-accent); }
.toast-icon { flex-shrink: 0; width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
  color: #FFFFFF; background: var(--toast-accent); box-shadow: 0 6px 16px rgba(0,0,0,0.15); }
.toast-title { margin: 0; font-size: 15px; font-weight: 900; line-height: 1.35; color: #1A0A00; }
.toast-msg { margin: 3px 0 0; font-size: 13.5px; font-weight: 600; line-height: 1.5; color: #5C2A10; white-space: pre-line; overflow-wrap: anywhere; }
html[data-theme="dark"] .toast { background: rgba(32,32,40,0.92); border-color: rgba(255,255,255,0.16); box-shadow: 0 18px 50px rgba(0,0,0,0.55); }
html[data-theme="dark"] .toast-title { color: #FFFFFF; }
html[data-theme="dark"] .toast-msg { color: rgba(246,242,238,0.8); }
@keyframes toast-in { from { opacity: 0; transform: translateY(-18px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes toast-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
`;

const Toaster = () => {
  const toasts = useSyncExternalStore(subscribe, getToasts);
  return (
    <div aria-live="polite" className="toaster">
      <style>{CSS}</style>
      {toasts.map((t) => {
        const s = STYLES[t.type] || STYLES.info;
        const Icon = s.icon;
        return (
          <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} className="toast" style={{ '--toast-accent': s.accent }}>
            <span className="toast-icon">
              <Icon size={20} style={{ animation: t.type === 'loading' ? 'toast-spin 1s linear infinite' : 'none' }} />
            </span>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <p className="toast-title">{t.title}</p>
              {t.message && <p className="toast-msg">{t.message}</p>}
              {t.action && (
                <button type="button" className="text-link" onClick={() => { dismiss(t.id); t.action.onClick(); }}
                  style={{ background: 'none', border: 'none', padding: '6px 0 0', fontFamily: 'inherit', fontSize: 13 }}>
                  {t.action.label}
                </button>
              )}
            </div>
            {t.type !== 'loading' && (
              <button className="x-close x-close-sm" type="button" aria-label="Close notification" onClick={() => dismiss(t.id)}>
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
