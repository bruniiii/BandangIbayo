import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------
 
const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const navigate = useNavigate();
 
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
 
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
 
    if (authError) {
      alert("Login Failed: " + authError.message);
      setLoading(false);
      return;
    }
 
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single();
 
    if (profileError || profile?.role !== 'admin') {
      await supabase.auth.signOut();
      alert("Access Denied: Administrator privileges required.");
      setLoading(false);
    } else {
      setIsSuccess(true);
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 1500);
    }
  };
 
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
    opacity: 0.85,
  };
 
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F2E4D0',
      fontFamily: "'Inter', system-ui, sans-serif",
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
            borderTop: '7px solid #C45C26',
            maxWidth: 380,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: '#C45C26',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 12px 32px rgba(196,92,38,0.45)',
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
              textTransform: 'uppercase', color: '#7A3A18', opacity: 0.65, margin: 0,
            }}>
              Welcome back to Bandang IBAYO
            </p>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 8 }}>
              {[0, 0.15, 0.3].map((delay, i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#C45C26',
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
        borderTop: '7px solid #1A0A00',
      }}>
 
        {/* close button */}
        <Link to="/" style={{
          position: 'absolute', top: 18, right: 18,
          color: 'rgba(122,58,24,0.45)',
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
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
              <polygon points="16,4 30,28 2,28" fill="#C45C26" opacity="0.9"/>
              <polygon points="16,10 26,28 6,28" fill="#1A0A00" opacity="0.55"/>
            </svg>
          </div>
          <h1 style={{ fontWeight: 900, fontSize: 26, letterSpacing: '-0.03em', color: '#1A0A00', margin: '0 0 10px' }}>
            Bandang <span style={{ color: '#C45C26' }}>IBAYO</span>
          </h1>
          {/* admin badge */}
          <div style={{
            display: 'inline-block',
            background: '#2D1B0E',
            padding: '5px 14px',
            borderRadius: 8,
          }}>
            <p style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: '#E8A265', margin: 0,
            }}>
              Administrator Portal
            </p>
          </div>
        </div>
 
        {/* form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>Admin Email</label>
            <input
              type="email"
              required
              placeholder="admin@bandangibayo.com"
              style={inputStyle}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              style={inputStyle}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
 
          <div style={{ borderTop: '1px solid rgba(196,92,38,0.15)', marginTop: 4 }} />
 
          <button
            disabled={loading || isSuccess}
            style={{
              width: '100%',
              background: (loading || isSuccess) ? 'rgba(26,10,0,0.45)' : '#1A0A00',
              color: '#E8A265',
              fontWeight: 900,
              fontSize: 13,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '16px',
              borderRadius: 12,
              border: 'none',
              cursor: (loading || isSuccess) ? 'not-allowed' : 'pointer',
              boxShadow: (loading || isSuccess) ? 'none' : '0 8px 24px rgba(26,10,0,0.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s',
              fontFamily: 'inherit',
            }}
          >
            {loading
              ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></>
              : 'Login'
            }
          </button>
        </form>
 
        {/* return link */}
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(196,92,38,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <p style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: '#7A3A18', opacity: 0.5,
            fontStyle: 'italic', margin: 0,
          }}>
            Not an admin?
          </p>
          <Link to="/" style={{
            padding: '10px 28px',
            background: '#C45C26',
            color: '#FDF6EE',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            borderRadius: 999,
            textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(196,92,38,0.35)',
            transition: 'all 0.2s',
          }}>
            Return to Public Page
          </Link>
        </div>
 
      </div>
    </div>
  );
};
 
export default AdminLogin;