import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Loader2, CheckCircle2, Lock } from 'lucide-react';
import logoIcon from './assets/newIcon.png';

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: '1.5px solid rgba(196,92,38,0.2)',
  background: '#FDF6EE',
  fontSize: 14,
  color: '#1A0A00',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#7A3A18',
  marginBottom: 6,
  opacity: 0.85,
};

// Reached via the link in the "reset password" email. Supabase puts a
// recovery token in the URL and, once the client library picks it up,
// fires a PASSWORD_RECOVERY auth event and establishes a temporary
// session — that's what authorizes the updateUser({ password }) call
// below, without the user needing to know their old password.
const ResetPassword = () => {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setReady(true);
        setChecking(false);
      }
    });

    // Covers the case where the PASSWORD_RECOVERY event already fired
    // before this component mounted (Supabase processes the URL hash
    // immediately on client init).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) { setError(updateError.message); return; }
    setDone(true);
    await supabase.auth.signOut();
    setTimeout(() => navigate('/login'), 2000);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F2E4D0', fontFamily: "'Inter', system-ui, sans-serif", color: '#1A0A00',
      padding: '3rem 1rem',
    }}>
      <div style={{
        background: '#FDF6EE', padding: '2.5rem', borderRadius: 24,
        boxShadow: '0 20px 60px rgba(26,10,0,0.14)', width: '100%', maxWidth: 420,
        borderTop: '7px solid #C45C26',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src={logoIcon} alt="BANDANG IBAYO" style={{ width: 64, height: 64, objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
          <h1 style={{ fontWeight: 900, fontSize: 24, letterSpacing: '-0.03em', color: '#1A0A00', margin: '0 0 8px' }}>
            Set a New Password
          </h1>
        </div>

        {checking ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0', color: 'rgba(122,58,24,0.5)' }}>
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : done ? (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={40} style={{ color: '#C45C26', marginBottom: 12 }} />
            <p style={{ fontSize: 13, color: '#7A3A18' }}>Password updated! Redirecting you to login…</p>
          </div>
        ) : !ready ? (
          <p style={{ fontSize: 13, color: '#7A3A18', textAlign: 'center', lineHeight: 1.7 }}>
            This link is invalid or has expired. Please request a new one from the{' '}
            <Link to="/forgot-password" style={{ color: '#C45C26', fontWeight: 800 }}>forgot password</Link> page.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>New Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                style={inputStyle}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Confirm New Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                style={inputStyle}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {error && (
              <p style={{ fontSize: 12, fontWeight: 700, color: '#8C2F1C', margin: 0 }}>{error}</p>
            )}

            <button
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'rgba(196,92,38,0.55)' : '#C45C26',
                color: '#FDF6EE',
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '16px',
                borderRadius: 12,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontFamily: 'inherit',
              }}
            >
              {loading
                ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                : <><Lock size={16} /> Update Password</>
              }
              <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;