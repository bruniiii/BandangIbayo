import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, ChevronDown, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import BrandAvatar from './ui/BrandAvatar';
import ChangePassword from './ChangePassword';

// The "Administrator" box at the top right of the admin pages. Clicking it
// shows who is signed in and a Change Password option (admins have no
// Profile Settings page).
const AdminAccountMenu = () => {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [email, setEmail] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => { if (alive) setEmail(data?.user?.email || ''); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#F2E4D0',
          border: '1px solid rgba(180,81,30,0.18)',
          borderRadius: 14, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span className="dashboard-user-chip-text" style={{ textAlign: 'right' }}>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1A0A00', lineHeight: 1 }}>Administrator</span>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, marginTop: 3, lineHeight: 1 }}>Bandang IBAYO</span>
        </span>
        <BrandAvatar size={38} style={{ boxShadow: '0 4px 12px rgba(26,10,0,0.22)' }} />
        <ChevronDown size={14} style={{ color: '#A8481A', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div role="menu" style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 400, minWidth: 240,
          background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 16,
          boxShadow: '0 18px 44px rgba(26,10,0,0.22)', padding: 8,
        }}>
          {email && (
            <p style={{ margin: 0, padding: '8px 12px 10px', fontSize: 11.5, fontWeight: 700, color: '#7A3A18', borderBottom: '1px solid rgba(180,81,30,0.12)', overflowWrap: 'anywhere' }}>
              Signed in as<br /><strong style={{ color: '#1A0A00' }}>{email}</strong>
            </p>
          )}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setChanging(true); }} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginTop: 4,
            background: 'none', border: 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#1A0A00', textAlign: 'left',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F2E4D0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <KeyRound size={15} style={{ color: '#A8481A' }} /> Change Password
          </button>
        </div>
      )}

      {changing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setChanging(false)} />
          <div role="dialog" aria-label="Change password" style={{ position: 'relative', width: '100%', maxWidth: 620, maxHeight: '92dvh', overflowY: 'auto', borderRadius: 22 }}>
            <button type="button" onClick={() => setChanging(false)} aria-label="Close" style={{
              position: 'absolute', top: 14, right: 14, zIndex: 1, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18',
            }}><X size={18} /></button>
            <ChangePassword startOpen onClose={() => setChanging(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAccountMenu;
