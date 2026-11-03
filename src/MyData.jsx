import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PowerOff, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { usePopupError } from './ui/usePopupError';

// ─────────────────────────────────────────────
// YOUR ACCOUNT: a joiner can deactivate their account (nothing is deleted).
// The account is archived: logging in again asks whether to restore it.
// ─────────────────────────────────────────────

const MyData = () => {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A second confirmation: the joiner types "deactivate" before the button works.
  const [typed, setTyped] = useState('');
  const confirmed = typed.trim().toLowerCase() === 'deactivate';
  usePopupError(error);

  const handleDeactivate = async () => {
    if (!confirmed) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('deactivate_my_account');
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    // Leave the dashboard first, so signing out doesn't bounce to the login page.
    navigate('/', { replace: true });
    await supabase.auth.signOut();
    toast.success('Your account is deactivated', 'Log in again anytime to restore it.');
  };

  return (
    <div style={{ background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.15)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: 16, color: '#1A0A00', margin: 0 }}>
          <ShieldCheck size={18} style={{ color: '#A8481A' }} /> Your Account
        </h3>
        <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.9, margin: '4px 0 0', lineHeight: 1.6 }}>
          Taking a break? You can deactivate your account. When you want to come back, just log in again and choose to restore it.
        </p>
      </div>

      {!showConfirm && (
        <div>
          <button type="button" onClick={() => setShowConfirm(true)} style={button('rgba(140,47,28,0.08)', '#8C2F1C', '1px solid rgba(140,47,28,0.25)')}>
            <PowerOff size={14} /> Deactivate Account
          </button>
        </div>
      )}

      {showConfirm && (
        <div style={{ background: 'rgba(140,47,28,0.06)', border: '1px solid rgba(140,47,28,0.2)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#1A0A00', margin: 0 }}>Deactivate your account?</p>
          <ul style={{ fontSize: 12, fontWeight: 600, color: '#1A0A00', margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>You'll be logged out and can't use your account while it's deactivated.</li>
            <li>Nothing is deleted. Your profile, bookings and reviews stay as they are.</li>
            <li>To come back, just log in again: you'll be asked if you want to restore your account.</li>
            <li>You can't deactivate while you have an upcoming booking.</li>
          </ul>
          <label htmlFor="confirm-deactivate" style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00', margin: '4px 0 0' }}>
            To confirm, type <strong style={{ color: '#C0362C' }}>deactivate</strong> below.
          </label>
          <input
            id="confirm-deactivate" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy}
            placeholder="deactivate" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={20}
            aria-invalid={typed !== '' && !confirmed}
            style={{
              width: '100%', maxWidth: 320, boxSizing: 'border-box', background: '#FDF6EE', borderRadius: 12, padding: '10px 12px',
              border: `1px solid ${confirmed ? '#C0362C' : 'rgba(168,72,26,0.25)'}`, fontSize: 16, fontWeight: 700, color: '#1A0A00', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { setShowConfirm(false); setTyped(''); }} disabled={busy} style={button('#FDF6EE', '#1A0A00', '1px solid rgba(168,72,26,0.25)')}>
              Keep my account
            </button>
            <button type="button" onClick={handleDeactivate} disabled={busy || !confirmed}
              title={confirmed ? undefined : 'Type "deactivate" first'}
              style={{ ...button('#C0362C', '#FFFFFF'), opacity: confirmed ? 1 : 0.5, cursor: confirmed ? 'pointer' : 'not-allowed' }}>
              {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <PowerOff size={14} />} Deactivate Account
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12, fontWeight: 700, color: '#8C2F1C', margin: 0 }}>{error}</p>}
    </div>
  );
};

const button = (bg, color, border = 'none') => ({
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px',
  background: bg, color, border, borderRadius: 12, cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase',
});

export default MyData;
