import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, ChevronDown, X, ShieldCheck, UserRound } from 'lucide-react';
import BrandAvatar from './ui/BrandAvatar';
import ChangePassword from './ChangePassword';
import { useAdminMe } from './adminMe';
import AdminNameForm from './AdminNameForm';

// The box at the top right of the admin pages: the signed-in admin's name.
// Clicking it shows their email, Change Password (admins have no Profile
// Settings page) and, for the main admin, Admin Settings.
const AdminAccountMenu = ({ onOpenSettings }) => {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const me = useAdminMe();
  const email = me.email;
  const wrapRef = useRef(null);

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
          <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: '#1A0A00', lineHeight: 1.1, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name || 'Administrator'}</span>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, marginTop: 3, lineHeight: 1 }}>{me.isMain ? 'Main Admin' : 'Admin'} · Bandang IBAYO</span>
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
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setEditingName(true); }} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginTop: 4,
            background: 'none', border: 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#1A0A00', textAlign: 'left',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F2E4D0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <UserRound size={15} style={{ color: '#A8481A' }} /> Edit My Name
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setChanging(true); }} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            background: 'none', border: 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#1A0A00', textAlign: 'left',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F2E4D0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <KeyRound size={15} style={{ color: '#A8481A' }} /> Change Password
          </button>
          {me.isMain && onOpenSettings && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenSettings(); }} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#1A0A00', textAlign: 'left',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F2E4D0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <ShieldCheck size={15} style={{ color: '#A8481A' }} /> Admin Settings
            </button>
          )}
        </div>
      )}

      {editingName && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setEditingName(false)} />
          <div role="dialog" aria-label="Edit my name" style={{ position: 'relative', width: '100%', maxWidth: 420, background: '#FDF6EE', borderRadius: 20, padding: '1.5rem', boxShadow: '0 24px 60px rgba(26,10,0,0.35)' }}>
            <button type="button" onClick={() => setEditingName(false)} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={18} /></button>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#1A0A00', display: 'flex', alignItems: 'center', gap: 8 }}><UserRound size={16} style={{ color: '#A8481A' }} /> Your Name</h3>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#7A3A18', lineHeight: 1.5 }}>Shown at the top right and on the receipts of payments you process.</p>
            <AdminNameForm compact onSaved={() => setEditingName(false)} />
          </div>
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
