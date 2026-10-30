import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { safeNextPath } from './tourUtils';
import { Loader2, CheckCircle2, MailCheck, ArrowLeft } from 'lucide-react';
import { loginStart, verifyLoginCode, resendLoginCode } from './authApi';
import OtpInput from './ui/OtpInput';
import PasswordField from './ui/PasswordField';
import GoogleButton, { OrDivider } from './ui/GoogleButton';
import { usePopupError } from './ui/usePopupError';
import { askToReactivate } from './reactivate';

// "Continue with Google" is turned off for now; set to true to show it again.
const SHOW_GOOGLE_LOGIN = false;
 import logoIcon from './assets/logo.png';
 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------
 
const errorBorder = { borderColor: '#8C2F1C', background: 'rgba(140,47,28,0.04)' };

// Red message right under a field, e.g. "Invalid code." + "4 tries left."
const FieldError = ({ id, error }) => (
  <p id={id} role="alert" style={{ margin: '6px 2px 0', fontSize: 12, fontWeight: 800, color: '#8C2F1C', lineHeight: 1.5 }}>
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

  // The login page always asks for the username/email and password: a sign-in
  // still saved in this browser is ended here, so nobody gets in without them.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) supabase.auth.signOut({ scope: 'local' });
    });
  }, []);
 
  // Step 2 (after the right password): the 6-digit code we emailed.
  const [challenge, setChallenge] = useState(null); // { challengeId, sentTo, expiresInMinutes }
  const [code, setCode] = useState('');
  const [message, setMessage] = useState({ text: '', tone: 'error' });
  usePopupError(message.tone === 'error' ? message.text : '');
  const [resending, setResending] = useState(false);

  const showError = (text) => setMessage({ text, tone: 'error' });
  // Shown right under the field: wrong username/password, or a wrong code.
  const [credError, setCredError] = useState(null);   // { field: 'identifier' | 'password' | 'both', text, hint }
  const [codeError, setCodeError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', tone: 'error' });
    setCredError(null);

    const formData = new FormData(e.target);
    const identifier = formData.get('identifier').trim();
    const password = formData.get('password');

    // The server counts wrong passwords (3 → locked for 15 minutes) and signs you in.
    const result = await loginStart(identifier, password);
    if (!result.ok) {
      setLoading(false);
      if (result.field === 'identifier') {
        // No account has that username or Gmail.
        setCredError({ field: 'identifier', text: 'Invalid username or Gmail.', hint: 'No account uses that. Check the spelling, or register.' });
      } else if (result.attemptsLeft != null) {
        const left = result.attemptsLeft;
        const hint = `${left} attempt${left === 1 ? '' : 's'} left before your account is locked for 15 minutes.`;
        // Older servers don't say which part was wrong.
        setCredError(result.field === 'password'
          ? { field: 'password', text: 'Invalid password.', hint }
          : { field: 'both', text: 'Invalid Gmail/username or password.', hint });
      } else {
        showError(result.error);   // locked, email not confirmed, no connection…
      }
      return;
    }
    // Only an auth function deployed before the code step was removed asks for a code.
    if (result.data.challenge) {
      setLoading(false);
      setChallenge(result.data.challenge);
      setCode('');
      setCodeError(null);
      return;
    }
    await finishLogin(result.data.user);
  };

  // Signed in: check the role and go to the right dashboard.
  const finishLogin = async (user) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, deactivated_at')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      // No profile row at all — treat as invalid account rather than guessing.
      await supabase.auth.signOut();
      setLoading(false);
      setChallenge(null);
      showError('No profile found for this account.');
      return;
    }

    // An archived admin can't log in until the main admin restores them.
    if (profile.role === 'archived_admin') {
      await supabase.auth.signOut();
      setLoading(false);
      setChallenge(null);
      showError("This admin account was archived, so it can't log in. Ask the main admin to restore it.");
      return;
    }

    // A deactivated account: reactivate it, or stay logged out.
    if (profile.deactivated_at && !(await askToReactivate())) {
      setLoading(false);
      setChallenge(null);
      showError('Your account is still deactivated. Log in again anytime to reactivate it.');
      return;
    }

    const role = profile.role === 'admin' ? 'admin' : 'joiner';
    setSuccessRole(role);
    setIsSuccess(true);

    setTimeout(() => {
      // Replace the login page in history, so Back doesn't return to it.
      navigate(role === 'admin' ? '/admin/dashboard' : nextPath || '/dashboard', { replace: true });
    }, 1500);
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
    await finishLogin(result.data.user);
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
    border: '1.5px solid rgba(180,81,30,0.2)',
    background: '#FDF6EE',
    fontSize: 14,
    color: '#1A0A00',
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
    color: '#7A3A18',
    marginBottom: 6,
    opacity: 0.9,
  };
 
  const submitStyle = (disabled) => ({
    width: '100%',
    background: disabled ? 'rgba(180,81,30,0.55)' : '#B4511E',
    color: '#FDF6EE',
    fontWeight: 900,
    fontSize: 13,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '16px',
    borderRadius: 12,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: disabled ? 'none' : '0 8px 24px rgba(180,81,30,0.38)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.2s',
    fontFamily: 'inherit',
  });

  const linkButton = {
    display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0,
    fontSize: 12, fontWeight: 800, color: '#A8481A', cursor: 'pointer', fontFamily: 'inherit',
  };

  const spinner = <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></>;

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#FDF6EE',
      fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
      color: '#1A0A00',
      padding: '3rem 1rem',
      position: 'relative',
      overflowX: 'hidden',
    }}>
 
      {/* ── SUCCESS OVERLAY ── */}
      {isSuccess && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(10px)',
        }}>
          <div style={{
            background: '#FDF6EE',
            padding: '3.5rem',
            borderRadius: 40,
            boxShadow: '0 32px 80px rgba(26,10,0,0.45)',
            textAlign: 'center',
            borderTop: '7px solid #B4511E',
            maxWidth: 380,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: '#B4511E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 12px 32px rgba(180,81,30,0.45)',
              color: '#FDF6EE',
            }}>
              <CheckCircle2 size={40} strokeWidth={2.5} />
            </div>
            <h3 style={{
              fontWeight: 900, fontSize: 24, letterSpacing: '-0.03em',
              color: '#1A0A00', textTransform: 'uppercase', margin: '0 0 10px',
            }}>
              Login Successful
            </h3>
            <p style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9, margin: 0,
            }}>
              {successRole === 'admin'
                ? 'Redirecting to Administrator Portal...'
                : 'Redirecting to Traveler Portal...'}
            </p>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 8 }}>
              {[0, 0.15, 0.3].map((delay, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#B4511E',
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
        background: '#FDF6EE',
        padding: '2.5rem',
        borderRadius: 24,
        boxShadow: '0 20px 60px rgba(26,10,0,0.14)',
        width: '100%',
        maxWidth: 420,
        borderTop: '7px solid #B4511E',
      }}>
 
        {/* close button */}
        <Link to="/" aria-label="Close and go to the home page" style={{
          position: 'absolute', top: 8, right: 8, width: 44, height: 44, justifyContent: 'center', borderRadius: 12,
          color: 'rgba(122,58,24,0.85)',
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
                style={{ width: 64, height: 64, objectFit: 'contain' }} 
              />
          </div>
          <h1 style={{ fontWeight: 900, fontSize: 26, letterSpacing: '-0.03em', color: '#1A0A00', margin: '0 0 8px' }}>
            Bandang <span className="font-accent" style={{ color: '#A8481A' }}>IBAYO</span>
          </h1>
          <p style={{ fontSize: 14, color: '#7A3A18', opacity: 0.9, margin: 0, fontWeight: 500 }}>
            {challenge ? 'Check your email for your verification code.' : 'Welcome back! Login to continue.'}
          </p>
        </div>
 
        {message.text && (
          <p role={message.tone === 'error' ? 'alert' : 'status'} style={{
            fontSize: 12, fontWeight: 700, lineHeight: 1.6, margin: '0 0 16px', padding: '10px 14px', borderRadius: 10,
            color: message.tone === 'error' ? '#8C2F1C' : '#2D1B0E',
            background: message.tone === 'error' ? 'rgba(140,47,28,0.08)' : 'rgba(232,162,101,0.2)',
          }}>
            {message.text}
          </p>
        )}

        {/* Google: one tap, no password (hidden for now, see SHOW_GOOGLE_LOGIN) */}
        {SHOW_GOOGLE_LOGIN && !challenge && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
            <GoogleButton nextPath={nextPath} />
            <OrDivider />
          </div>
        )}

        {/* form */}
        {!challenge && (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={handleLogin}>
          <div>
            <label style={labelStyle}>Username or Email</label>
            <input
              name="identifier"
              type="text"
              placeholder="e.g. juandelacruz or juan@gmail.com"
              style={{ ...inputStyle, ...(credError && credError.field !== 'password' ? errorBorder : null) }}
              aria-invalid={credError?.field === 'identifier'}
              aria-describedby={credError?.field === 'identifier' ? 'identifier-error' : undefined}
              onChange={() => setCredError(null)}
              required
            />
            {credError?.field === 'identifier' && <FieldError id="identifier-error" error={credError} />}
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <PasswordField
              name="password"
              placeholder="••••••••"
              style={{ ...inputStyle, ...(credError && credError.field !== 'identifier' ? errorBorder : null) }}
              aria-invalid={!!credError && credError.field !== 'identifier'}
              aria-describedby={credError && credError.field !== 'identifier' ? 'cred-error' : undefined}
              onChange={() => setCredError(null)}
              required
            />
            {credError && credError.field !== 'identifier' && <FieldError id="cred-error" error={credError} />}
          </div>

          <div style={{ textAlign: 'right' }}>
            <Link className="text-link" to="/forgot-password" style={{ fontSize: 12 }}>
              Forgot password?
            </Link>
          </div>
          
          <div style={{ borderTop: '1px solid rgba(180,81,30,0.15)', marginTop: 4 }} />
 
          <button disabled={loading || isSuccess} style={submitStyle(loading || isSuccess)}>
            {loading ? spinner : 'Login'}
          </button>
        </form>
        )}
 
        {challenge && (
          <form style={{ display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={handleVerify}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#7A3A18', lineHeight: 1.6 }}>
              <MailCheck size={20} style={{ color: '#A8481A', flexShrink: 0, marginTop: 2 }} />
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
        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: '#7A3A18', opacity: 0.9 }}>
          Don't have an account?{' '}
          <Link className="text-link" to={nextPath ? `/register?next=${encodeURIComponent(nextPath)}` : '/register'} style={{ color: '#A8481A', fontWeight: 800, textDecoration: 'none' }}>
            Register here
          </Link>
        </p>
 
      </div>
    </div>
  );
};
 
export default JoinerLogin;