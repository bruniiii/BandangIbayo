import React, { useState, useEffect } from 'react';
import { useRequiredFilled } from './ui/useRequiredFilled';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { askRestoreAccount, restoreMyAccount, askAdminRestore } from './restoreAccount';
import { safeNextPath } from './tourUtils';
import { Loader2, CheckCircle2, MailCheck, ArrowLeft } from 'lucide-react';
import { loginStart, verifyLoginCode, resendLoginCode } from './authApi';
import OtpInput from './ui/OtpInput';
import PasswordField from './ui/PasswordField';
import GoogleButton, { OrDivider } from './ui/GoogleButton';
import { usePopupError } from './ui/usePopupError';

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
  const [loginFormRef, loginFilled] = useRequiredFilled();
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
    let result = await loginStart(identifier, password);
    // An archived joiner with the right password: they decide whether to restore it.
    if (!result.ok && result.archived) {
      if (await askRestoreAccount(result.archiveReason)) {
        result = await loginStart(identifier, password, { restore: true });
      } else {
        setLoading(false);
        showError('Your account stays archived. Log in again any time to restore it.');
        return;
      }
    }
    // An archived admin with the right password: they can ask the main admin to restore them.
    if (!result.ok && result.archivedAdmin) {
      if (await askAdminRestore()) {
        result = await loginStart(identifier, password, { requestRestore: true });
      } else {
        setLoading(false);
        showError("Your admin account stays archived. Log in again any time to ask the main admin to restore it.");
        return;
      }
    }
    if (!result.ok && result.adminRestoreRequested) {
      setLoading(false);
      setMessage({ text: result.error, tone: 'info' });
      return;
    }
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
      .select('*') // every column, so login still works before the latest database update
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
      // Asked while still signed in (Sign in with Google): send the request first.
      const wantsRestore = !profile.admin_restore_pending_at && !profile.admin_restore_requested_at && await askAdminRestore();
      const requestError = wantsRestore ? (await supabase.rpc('request_admin_restore')).error : null;
      await supabase.auth.signOut();
      setLoading(false);
      setChallenge(null);
      if (profile.admin_restore_pending_at) {
        showError("This admin account is waiting for email verification. Give the main admin the 6-digit code we emailed you so they can finish restoring it.");
        return;
      }
      if (profile.admin_restore_requested_at) {
        setMessage({ text: "Your request to be restored is waiting for the main admin's approval. You can log in once they approve it.", tone: 'info' });
        return;
      }
      if (requestError) { showError(`Couldn't send the request: ${requestError.message}`); return; }
      if (!wantsRestore) {
        showError('Your admin account stays archived. Log in again any time to ask the main admin to restore it.');
        return;
      }
      setMessage({ text: 'Request sent. The main admin was told; you can log in once they approve it.', tone: 'info' });
      return;
    }

    // An archived joiner (deactivated, or no login for a long time) chooses
    // whether to restore the account.
    // Removed by an admin: no way back from here.
    if (profile.archived_at && profile.archive_reason === 'removed') {
      await supabase.auth.signOut();
      setLoading(false);
      setChallenge(null);
      showError(`This account was removed by Bandang IBAYO${profile.removed_reason ? ` (${profile.removed_reason})` : ''}. Please message us if you think this is a mistake.`);
      return;
    }
    if (profile.archived_at) {
      const restoreError = (await askRestoreAccount(profile.archive_reason)) ? await restoreMyAccount() : 'Your account stays archived. Log in again any time to restore it.';
      if (restoreError) {
        await supabase.auth.signOut();
        setLoading(false);
        setChallenge(null);
        showError(restoreError);
        return;
      }
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
 
      {/* ── CARD: the login form on the left, Bandang IBAYO's branding on the right (desktop) ── */}
      <div className="login-split" style={{
        display: 'flex', width: '100%', maxWidth: 1000, background: '#FDF6EE', borderRadius: 28,
        boxShadow: '0 20px 60px rgba(26,10,0,0.14)', overflow: 'hidden', borderTop: '7px solid #B4511E',
      }}>
      <div className="login-form-side" style={{
        position: 'relative',
        background: '#FDF6EE',
        padding: '2.5rem',
        width: '100%',
        flex: '1 1 440px',
        maxWidth: 520,
        margin: '0 auto',
        boxSizing: 'border-box',
        alignSelf: 'center',
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
        <form ref={loginFormRef} style={{ display: 'flex', flexDirection: 'column', gap: 18 }} onSubmit={handleLogin}>
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
 
          <button disabled={loading || isSuccess || !loginFilled} style={submitStyle(loading || isSuccess || !loginFilled)}>
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
      <LoginBrandPanel />
      </div>
    </div>
  );
};

// The right half of the login page (hidden on phones and tablets: index.css).
const LoginBrandPanel = () => (
  <aside className="login-brand-side" aria-label="About Bandang IBAYO" style={{
    flex: '1 1 460px', position: 'relative', minHeight: 560, color: '#FDF6EE', padding: '3rem',
    background: "linear-gradient(160deg, rgba(26,10,0,0.92) 0%, rgba(26,10,0,0.78) 55%, rgba(140,47,28,0.85) 100%), url('/nature-bg.webp') center / cover",
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 28,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <img src={logoIcon} alt="" style={{ width: 46, height: 46, objectFit: 'contain' }} />
      <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: '-0.01em' }}>Bandang <span className="font-accent" style={{ color: '#E8A265' }}>IBAYO</span></span>
    </div>
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E8A265' }}>Your travel partner</p>
      <h2 style={{ margin: '0 0 14px', fontSize: 30, lineHeight: 1.15, fontWeight: 900, letterSpacing: '-0.02em' }}>
        Adventures across the Philippines, by land.
      </h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#F2E4D0', maxWidth: 400 }}>
        Book budget-friendly land tours and road trips, pay online, chat with your group and follow the van live on tour day.
      </p>
    </div>
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
      {['Book and pay online (GCash or card)', 'Live van tracking on tour day', 'Private Tours for your group'].map((t) => (
        <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 700, color: '#FDF6EE' }}>
          <CheckCircle2 size={17} color="#E8A265" style={{ flexShrink: 0 }} /> {t}
        </li>
      ))}
    </ul>
  </aside>
);
 
export default JoinerLogin;