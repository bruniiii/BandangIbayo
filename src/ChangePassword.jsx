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
  border: '1px solid rgba(14,15,11,0.108)', background: '#F1F2EE',
  fontSize: 13.5, fontWeight: 600, color: '#0E0F0B', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#5E6A5A', marginBottom: 7, opacity: 0.9,
};

// Password box with an eye button that shows or hides what's typed.
const PasswordInput = ({ id, value, onChange, autoComplete, minLength }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, paddingRight: 44 }}
        required
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#5E6A5A',
        }}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
};

const ChangePassword = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
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

  return (
    <form onSubmit={handleSubmit} style={{
      background: '#FFFFFF', borderRadius: 20, padding: '1.75rem',
      border: '1px solid rgba(14,15,11,0.072)', boxShadow: '0 4px 20px rgba(14,15,11,0.06)',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: 15, color: '#0E0F0B', margin: 0 }}>
          <KeyRound size={17} style={{ color: '#B5511B' }} /> Change Password
        </h3>
        <p style={{ fontSize: 12, color: '#5E6A5A', opacity: 0.9, margin: '4px 0 0' }}>
          Enter your current password, then choose a new one.
        </p>
      </div>

      <div>
        <label style={labelStyle} htmlFor="current-password">Current Password</label>
        <PasswordInput id="current-password" autoComplete="current-password" value={current} onChange={setCurrent} />
      </div>

      <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle} htmlFor="new-password">New Password</label>
          <PasswordInput id="new-password" autoComplete="new-password" minLength={8} value={next} onChange={setNext} />
          <PasswordChecklist password={next} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="confirm-new-password">Confirm New Password</label>
          <PasswordInput id="confirm-new-password" autoComplete="new-password" minLength={8} value={confirm} onChange={setConfirm} />
          {confirm && confirm !== next && (
            <p style={{ fontSize: 11, fontWeight: 700, color: '#A9474E', margin: '8px 0 0' }}>Passwords do not match.</p>
          )}
        </div>
      </div>

      {message.text && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} style={{
          fontSize: 12, fontWeight: 700, lineHeight: 1.6, margin: 0, padding: '10px 14px', borderRadius: 10,
          color: message.tone === 'error' ? '#A9474E' : '#4E6B48',
          background: message.tone === 'error' ? 'rgba(169,71,78,0.08)' : 'rgba(78,107,72,0.1)',
        }}>
          {message.text}
        </p>
      )}

      <div style={{ borderTop: '1px solid rgba(14,15,11,0.09)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={saving} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: saving ? 'rgba(14,15,11,0.5)' : '#0E0F0B',
          color: '#FE813C', fontWeight: 900, fontSize: 12, letterSpacing: '0.08em',
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
