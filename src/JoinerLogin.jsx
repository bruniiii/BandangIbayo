import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { safeNextPath } from './tourUtils';
import { Loader2, CheckCircle2, MailCheck, ArrowLeft } from 'lucide-react';
import { loginStart, verifyLoginCode, resendLoginCode } from './authApi';
import OtpInput from './ui/OtpInput';
 import logoIcon from './assets/newIcon.png';
 
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
 
const errorBorder = { borderColor: '#A9474E', background: 'rgba(169,71,78,0.04)' };

// Red message right under a field, e.g. "Invalid code." + "4 tries left."
const FieldError = ({ id, error }) => (
  <p id={id} role="alert" style={{ margin: '6px 2px 0', fontSize: 12, fontWeight: 800, color: '#A9474E', lineHeight: 1.5 }}>
    {error.text}
    {error.hint && <span style={{ display: 'block', fontWeight: 600, opacity: 0.85 }}>{error.hint}</span>}
  </p>
);

const JoinerLogin = () => {
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successRole, setSuccessRole] = useState('joiner'); // 'joiner' | 'admin'
  const navigate = useNavigate();
  // Where to go after login, e.g. back to a tour page (?next=/tours/12)
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
 
  // Step 2 (after the right password): the 6-digit code we emailed.
  const [challenge, setChallenge] = useState(null); // { challengeId, sentTo, expiresInMinutes }
  const [code, setCode] = useState('');
  const [message, setMessage] = useState({ text: '', tone: 'error' });
  const [resending, setResending] = useState(false);

  const showError = (text) => setMessage({ text, tone: 'error' });
  // Shown right under the field: wrong username/password, or a wrong code.
  const [credError, setCredError] = useState(null);   // { text, hint }
  const [codeError, setCodeError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', tone: 'error' });
    setCredError(null);

    const formData = new FormData(e.target);
    const identifier = formData.get('identifier').trim();
    const password = formData.get('password');

    // The server counts wrong passwords (3 → locked for 15 minutes) and emails a code.
    const result = await loginStart(identifier, password);
    setLoading(false);
    if (!result.ok) {
      if (result.attemptsLeft != null) {
        const left = result.attemptsLeft;
        setCredError({ text: 'Invalid Gmail/username or password.', hint: `${left} attempt${left === 1 ? '' : 's'} left before your account is locked for 15 minutes.` });
      } else {
        showError(result.error);   // locked, email not confirmed, no connection…
      }
      return;
    }
    setChallenge(result.data);
    setCode('');
    setCodeError(null);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', tone: 'error' });
    setCodeError(null);

    const result = await verifyLoginCode(challenge.challengeId, code);
    if (!result.ok) {
      setLoading(false);
      const tries = /(\d+) tr(?:y|ies) left/.exec(result.error || '');
      if (tries) {
        setCodeError({ text: 'Invalid code.', hint: `${tries[1]} ${tries[1] === '1' ? 'try' : 'tries'} left.` });
        return;
      }
      // An expired or used-up code means starting over from the password step.
      if (/log in again/i.test(result.error || '')) setChallenge(null);
      showError(result.error);
      return;
    }

    // Look up role to decide where to send them
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', result.data.user.id)
      .single();

    if (profileError || !profile) {
      // No profile row at all — treat as invalid account rather than guessing.
      await supabase.auth.signOut();
      setLoading(false);
      setChallenge(null);
      showError('No profile found for this account.');
      return;
    }

    const role = profile.role === 'admin' ? 'admin' : 'joiner';
    setSuccessRole(role);
    setIsSuccess(true);

    setTimeout(() => {
      navigate(role === 'admin' ? '/admin/dashboard' : nextPath || '/dashboard');
    }, 1500);
  };

  const handleResend = async () => {
    setResending(true);
    const result = await resendLoginCode(challenge.challengeId);
    setResending(false);
    if (!result.ok) {
      if (/log in again/i.test(result.error || '')) setChallenge(null);
      showError(result.error);
      return;
    }
    setCode('');
    setCodeError(null);
    setMessage({ text: `We sent a new code to ${result.data.sentTo}.`, tone: 'info' });
  };

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
    transition: 'border-color 0.2s',
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
 
  const submitStyle = (disabled) => ({
    width: '100%',
    background: disabled ? 'rgba(254,129,60,0.55)' : '#FE813C',
    color: '#0E0F0B',
    fontWeight: 900,
    fontSize: 13,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '16px',
    borderRadius: 12,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: disabled ? 'none' : '0 8px 24px rgba(254,129,60,0.38)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.2s',
    fontFamily: 'inherit',
  });

  const linkButton = {
    display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0,
    fontSize: 12, fontWeight: 800, color: '#B5511B', cursor: 'pointer', fontFamily: 'inherit',
  };

  const spinner = <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></>;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#FFFFFF',
      fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
      color: '#0E0F0B',
      padding: '3rem 1rem',
      position: 'relative',
      overflowX: 'hidden',
    }}>
 
      {/* ── SUCCESS OVERLAY ── */}
      {isSuccess && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(14,15,11,0.88)', backdropFilter: 'blur(10px)',
        }}>
          <div style={{
            background: '#FFFFFF',
            padding: '3.5rem',
            borderRadius: 40,
            boxShadow: '0 32px 80px rgba(14,15,11,0.45)',
            textAlign: 'center',
            borderTop: '7px solid #FE813C',
            maxWidth: 380,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: '#FE813C',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 12px 32px rgba(254,129,60,0.45)',
              color: '#0E0F0B',
            }}>
              <CheckCircle2 size={40} strokeWidth={2.5} />
            </div>
            <h3 style={{
              fontWeight: 900, fontSize: 24, letterSpacing: '-0.03em',
              color: '#0E0F0B', textTransform: 'uppercase', margin: '0 0 10px',
            }}>
              Login Successful
            </h3>
            <p style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: '#5E6A5A', opacity: 0.9, margin: 0,
            }}>
              {successRole === 'admin'
                ? 'Redirecting to Administrator Portal...'
                : 'Redirecting to Traveler Portal...'}
            </p>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 8 }}>
              {[0, 0.15, 0.3].map((delay, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#FE813C',
                  animation: `bounce 0.9s ${delay}s infinite`,
                }} />
              ))}
            </div>
            <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
          </div>
        </div>
      )}
 
      {/* ── CARD ── */}
      <div style={{
        position: 'relative',
        background: '#FFFFFF',
        padding: '2.5rem',
        borderRadius: 24,
        boxShadow: '0 20px 60px rgba(14,15,11,0.14)',
        width: '100%',
        maxWidth: 420,
        borderTop: '7px solid #FE813C',
      }}>
 
        {/* close button */}
        <Link to="/" aria-label="Close and go to the home page" style={{
          position: 'absolute', top: 8, right: 8, width: 44, height: 44, justifyContent: 'center', borderRadius: 12,
          color: 'rgba(94,106,90,0.75)',
          display: 'flex', alignItems: 'center',
          transition: 'color 0.2s',
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Link>
 
        {/* header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <img 
                src={logoIcon} 
                alt="BANDANG IBAYO" 
                style={{ width: 78, height: 78, objectFit: 'contain' }} 
              />
          </div>
          <h1 style={{ fontWeight: 900, fontSize: 26, letterSpacing: '-0.03em', color: '#0E0F0B', margin: '0 0 8px' }}>
            Bandang <span style={{ color: '#B5511B' }}>IBAYO</span>
          </h1>
          <p style={{ fontSize: 14, color: '#5E6A5A', opacity: 0.9, margin: 0, fontWeight: 500 }}>
            {challenge ? 'Check your email for your verification code.' : 'Welcome back! Login to continue.'}
          </p>
        </div>
 
        {message.text && (
          <p role={message.tone === 'error' ? 'alert' : 'status'} style={{
            fontSize: 12, fontWeight: 700, lineHeight: 1.6, margin: '0 0 16px', padding: '10px 14px', borderRadius: 10,
            color: message.tone === 'error' ? '#A9474E' : '#1E201B',
            background: message.tone === 'error' ? 'rgba(169,71,78,0.08)' : 'rgba(254,129,60,0.2)',
          }}>
            {message.text}
          </p>
        )}

        {/* form */}
        {!challenge && (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={handleLogin}>
          <div>
            <label style={labelStyle}>Username or Email</label>
            <input
              name="identifier"
              type="text"
              placeholder="traveler_2026 or you@email.com"
              style={{ ...inputStyle, ...(credError ? errorBorder : null) }}
              onChange={() => setCredError(null)}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              style={{ ...inputStyle, ...(credError ? errorBorder : null) }}
              aria-invalid={!!credError}
              aria-describedby={credError ? 'cred-error' : undefined}
              onChange={() => setCredError(null)}
              required
            />
            {credError && <FieldError id="cred-error" error={credError} />}
          </div>

          <div style={{ textAlign: 'right' }}>
            <Link className="text-link" to="/forgot-password" style={{ fontSize: 12 }}>
              Forgot password?
            </Link>
          </div>
          
          <div style={{ borderTop: '1px solid rgba(14,15,11,0.09)', marginTop: 4 }} />
 
          <button disabled={loading || isSuccess} style={submitStyle(loading || isSuccess)}>
            {loading ? spinner : 'Login'}
          </button>
        </form>
        )}
 
        {challenge && (
          <form style={{ display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={handleVerify}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#5E6A5A', lineHeight: 1.6 }}>
              <MailCheck size={20} style={{ color: '#B5511B', flexShrink: 0, marginTop: 2 }} />
              <span>
                We sent a 6-digit code to <strong>{challenge.sentTo}</strong>. It's valid for {challenge.expiresInMinutes} minutes.
              </span>
            </div>
            <div>
              <p style={{ ...labelStyle, textAlign: 'center' }}>Verification Code</p>
              <OtpInput
                value={code}
                onChange={(v) => { setCode(v); setCodeError(null); }}
                invalid={!!codeError}
                describedBy={codeError ? 'code-error' : undefined}
                autoFocus
              />
              {codeError && <FieldError id="code-error" error={codeError} />}
            </div>
            <button disabled={loading || isSuccess || code.length !== 6} style={submitStyle(loading || isSuccess || code.length !== 6)}>
              {loading ? spinner : 'Verify & Login'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <button type="button" onClick={() => { setChallenge(null); setMessage({ text: '', tone: 'error' }); }} className="text-link" style={linkButton}>
                <ArrowLeft size={13} /> Back
              </button>
              <button type="button" onClick={handleResend} disabled={resending} className="text-link" style={linkButton}>
                {resending ? 'Sending…' : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {/* register link */}
        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: '#5E6A5A', opacity: 0.9 }}>
          Don't have an account?{' '}
          <Link className="text-link" to={nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : '/register'} style={{ color: '#B5511B', fontWeight: 800, textDecoration: 'none' }}>
            Register here
          </Link>
        </p>
 
      </div>
    </div>
  );
};
 
export default JoinerLogin;