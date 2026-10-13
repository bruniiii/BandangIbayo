import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { confirmDialog } from './ui/ConfirmDialog';
import { Loader2, CheckCircle2, Mail } from 'lucide-react';
import logoIcon from './assets/newIcon.png';
import { emailError, emailSuggestion } from './validation';

// ── PALETTE ──────────────────────────────────────────────
// #0E0F0B  ink (dark surfaces, main text)
// #FE813C  orange (main accent: buttons, active states, highlights)
// #B5511B  orange ink (orange text and links on light backgrounds)
// #5E6A5A  sage ink (secondary text)
// #727E6E  sage
// #4E6B48  sage green (confirmed / success)
// #BC656A  rose, with #A9474E / #B24F55 for errors and cancellations
// #F1F2EE  soft stone (inset panels, chips, inputs)
// #F4F5F1  page background
// #FFFFFF  cards
// ---------------------------------------------------------

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: '1.5px solid rgba(14,15,11,0.12)',
  background: '#FFFFFF',
  fontSize: 14,
  color: '#0E0F0B',
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
  color: '#5E6A5A',
  marginBottom: 6,
  opacity: 0.9,
};

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const problem = emailError(email);
    if (problem) { setError(problem); return; }
    // A misspelled domain would send the reset link nowhere.
    let target = email.trim().toLowerCase();
    const suggested = emailSuggestion(target);
    if (suggested && await confirmDialog({ title: `Did you mean ${suggested}?`, message: 'The reset link will be sent to this address.', confirmLabel: `Use ${suggested.split('@')[1]}`, cancelLabel: `Keep ${target.split('@')[1]}` })) {
      target = suggested;
      setEmail(suggested);
    }
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setSent(true);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#FFFFFF', fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif", color: '#0E0F0B',
      padding: '3rem 1rem',
    }}>
      <div style={{
        background: '#FFFFFF', padding: '2.5rem', borderRadius: 24,
        boxShadow: '0 20px 60px rgba(14,15,11,0.14)', width: '100%', maxWidth: 420,
        borderTop: '7px solid #FE813C',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src={logoIcon} alt="BANDANG IBAYO" style={{ width: 64, height: 64, objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
          <h1 style={{ fontWeight: 900, fontSize: 24, letterSpacing: '-0.03em', color: '#0E0F0B', margin: '0 0 8px' }}>
            Reset Your Password
          </h1>
          <p style={{ fontSize: 13, color: '#5E6A5A', opacity: 0.9, margin: 0, fontWeight: 500 }}>
            {sent ? 'Check your inbox for a reset link.' : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: 'rgba(254,129,60,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#B5511B',
            }}>
              <CheckCircle2 size={30} />
            </div>
            <p style={{ fontSize: 13, color: '#5E6A5A', margin: '0 0 20px', lineHeight: 1.6 }}>
              If an account exists for <strong style={{ color: '#0E0F0B' }}>{email}</strong>, a password reset link is on its way. It may take a few minutes to arrive.
            </p>
            <Link className="text-link" to="/login" style={{ color: '#B5511B', fontWeight: 800, textDecoration: 'none', fontSize: 13 }}>
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
              <p style={{ fontSize: 12, fontWeight: 700, color: '#A9474E', margin: 0 }}>{error}</p>
            )}

            <button
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'rgba(254,129,60,0.55)' : '#FE813C',
                color: '#0E0F0B',
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
          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: '#5E6A5A', opacity: 0.9 }}>
            Remembered it?{' '}
            <Link className="text-link" to="/login" style={{ color: '#B5511B', fontWeight: 800, textDecoration: 'none' }}>
              Log in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;