import { useEffect, useState } from 'react';
import { Smartphone, Share, SquarePlus, X, Download } from 'lucide-react';
import { canPromptInstall, isInstalled, isIos, onInstallChange, promptInstall } from '../installApp';
import { toast } from './toast';

// "Add Bandang IBAYO to your home screen" on the joiner homepage. Android and
// computers get an Install button; iPhones get the Share → Add to Home Screen
// steps. Hidden once installed, or after the joiner closes it.

const DISMISS_KEY = 'ibayo-install-dismissed';
const readDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };

const InstallAppCard = () => {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [installed, setInstalled] = useState(isInstalled);

  useEffect(() => onInstallChange(() => {
    setCanPrompt(canPromptInstall());
    setInstalled(isInstalled());
  }), []);

  const ios = isIos();
  if (installed || dismissed || (!canPrompt && !ios)) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
  };

  const install = async () => {
    const accepted = await promptInstall();
    if (accepted) toast.success('Added to your home screen', 'Open Bandang IBAYO from its icon anytime.');
  };

  const step = { display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 800, color: '#1A0A00' };

  return (
    <section aria-label="Add to home screen" style={{
      position: 'relative', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 20,
      padding: '1rem 3rem 1rem 1.25rem',
    }}>
      <div style={{ width: 46, height: 46, borderRadius: 14, background: '#1A0A00', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Smartphone size={22} />
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 900, color: '#1A0A00', margin: 0 }}>Add Bandang IBAYO to your home screen</p>
        {ios && !canPrompt ? (
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '3px 0 0', lineHeight: 1.7 }}>
            In Safari, tap <span style={step}><Share size={13} /> Share</span>, then <span style={step}><SquarePlus size={13} /> Add to Home Screen</span>.
          </p>
        ) : (
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '3px 0 0', lineHeight: 1.6 }}>
            Open your trips in one tap, like an app. No app store needed.
          </p>
        )}
      </div>
      {canPrompt && (
        <button type="button" onClick={install} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 14,
          border: 'none', background: '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900,
          fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          <Download size={14} /> Install
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Close" style={{
        position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer',
        color: 'rgba(122,58,24,0.8)', padding: 6, display: 'flex',
      }}>
        <X size={16} />
      </button>
    </section>
  );
};

export default InstallAppCard;
