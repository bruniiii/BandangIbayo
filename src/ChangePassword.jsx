import { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';
import PasswordChecklist from './PasswordChecklist';
import { passwordErrorMessage } from './passwordPolicy';
import { changePassword } from './authApi';

// ─────────────────────────────────────────────
// CHANGE PASSWORD (Profile Settings)
// The server checks the current password (wrong ones count toward the
// 3-attempt login lock) and the password rules before changing it.
// ─────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 12,
  border: '1px solid rgba(196,92,38,0.18)', background: '#F2E4D0',
  fontSize: 13.5, fontWeight: 600, color: '#1A0A00', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#7A3A18', marginBottom: 7, opacity: 0.85,
};

const ChangePassword = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', tone: 'error' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ text: '', tone: 'error' });

    const ruleError = passwordErrorMessage(next);
    if (ruleError) return setMessage({ text: ruleError, tone: 'error' });
    if (next !== confirm) return setMessage({ text: 'The new passwords do not match.', tone: 'error' });
    if (next === current) return setMessage({ text: 'Your new password must be different from the current one.', tone: 'error' });

    setSaving(true);
    const result = await changePassword(current, next);
    setSaving(false);
    if (!result.ok) return setMessage({ text: result.error, tone: 'error' });

    setCurrent('');
    setNext('');
    setConfirm('');
    setMessage({ text: 'Your password has been changed. Use the new one the next time you log in.', tone: 'success' });
  };

  const type = show ? 'text' : 'password';

  return (
    <form onSubmit={handleSubmit} style={{
      background: '#FDF6EE', borderRadius: 20, padding: '1.75rem',
      border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: 15, color: '#1A0A00', margin: 0 }}>
          <KeyRound size={17} style={{ color: '#C45C26' }} /> Change Password
        </h3>
        <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.65, margin: '4px 0 0' }}>
          Enter your current password, then choose a new one.
        </p>
      </div>

      <div>
        <label style={labelStyle} htmlFor="current-password">Current Password</label>
        <input id="current-password" type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} style={inputStyle} required />
      </div>

      <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle} htmlFor="new-password">New Password</label>
          <input id="new-password" type={type} autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} style={inputStyle} required />
          <PasswordChecklist password={next} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="confirm-new-password">Confirm New Password</label>
          <input id="confirm-new-password" type={type} autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} required />
          {confirm && confirm !== next && (
            <p style={{ fontSize: 11, fontWeight: 700, color: '#8C2F1C', margin: '8px 0 0' }}>Passwords do not match.</p>
          )}
        </div>
      </div>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#7A3A18', cursor: 'pointer', width: 'fit-content' }}>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        {show ? <EyeOff size={13} /> : <Eye size={13} />} Show passwords
      </label>

      {message.text && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} style={{
          fontSize: 12, fontWeight: 700, lineHeight: 1.6, margin: 0, padding: '10px 14px', borderRadius: 10,
          color: message.tone === 'error' ? '#8C2F1C' : '#3F5D62',
          background: message.tone === 'error' ? 'rgba(140,47,28,0.08)' : 'rgba(63,93,98,0.1)',
        }}>
          {message.text}
        </p>
      )}

      <div style={{ borderTop: '1px solid rgba(196,92,38,0.15)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={saving} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: saving ? 'rgba(26,10,0,0.5)' : '#1A0A00',
          color: '#E8A265', fontWeight: 900, fontSize: 12, letterSpacing: '0.08em',
          textTransform: 'uppercase', border: 'none', borderRadius: 12,
          padding: '13px 26px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <KeyRound size={15} />}
          Update Password
        </button>
      </div>
    </form>
  );
};

export default ChangePassword;
