import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Loader2, CheckCircle2, Mail } from 'lucide-react';
import logoIcon from './assets/newIcon.png';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00 espresso dark · #C45C26 burnt sienna · #FDF6EE cream
// #7A3A18 rust mid-tone · #F2E4D0 parchment · #8C2F1C error
// ---------------------------------------------------------

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

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setSent(true);
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
            Reset Your Password
          </h1>
          <p style={{ fontSize: 13, color: '#7A3A18', opacity: 0.75, margin: 0, fontWeight: 500 }}>
            {sent ? 'Check your inbox for a reset link.' : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: 'rgba(196,92,38,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#C45C26',
            }}>
              <CheckCircle2 size={30} />
            </div>
            <p style={{ fontSize: 13, color: '#7A3A18', margin: '0 0 20px', lineHeight: 1.6 }}>
              If an account exists for <strong style={{ color: '#1A0A00' }}>{email}</strong>, a password reset link is on its way. It may take a few minutes to arrive.
            </p>
            <Link to="/login" style={{ color: '#C45C26', fontWeight: 800, textDecoration: 'none', fontSize: 13 }}>
              ← Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email"
                required
                placeholder="you@email.com"
                style={inputStyle}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                : <><Mail size={16} /> Send Reset Link</>
              }
              <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
            </button>
          </form>
        )}

        {!sent && (
          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: '#7A3A18', opacity: 0.8 }}>
            Remembered it?{' '}
            <Link to="/login" style={{ color: '#C45C26', fontWeight: 800, textDecoration: 'none' }}>
              Log in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;