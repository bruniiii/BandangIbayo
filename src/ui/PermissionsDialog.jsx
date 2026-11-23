import { useState } from 'react';
import { X, Loader2, KeyRound } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from './toast';
import { PERMISSIONS } from '../adminPermissions';

// Admin Settings → an admin's permissions (main admin only). Everything ticked
// = "can do everything" (also for permissions added in later updates).
const PermissionsDialog = ({ admin, perms, onClose, onSaved }) => {
  const [picked, setPicked] = useState(() => (Array.isArray(perms) ? perms : PERMISSIONS.map(([k]) => k)));
  const [busy, setBusy] = useState(false);
  const all = PERMISSIONS.every(([k]) => picked.includes(k));
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('set_admin_permissions', { p_id: admin.id, p_permissions: all ? null : picked });
    setBusy(false);
    if (error) { toast.error("Couldn't save the permissions", error.message); return; }
    toast.success('Permissions saved', `${admin.name}'s changes apply right away.`);
    onSaved(data ?? null);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ib-ink-rgb, 26,10,0), 0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="paper-card" role="dialog" aria-modal="true" aria-label={`Permissions for ${admin.name}`} style={{ position: 'relative', width: '100%', maxWidth: 520, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', background: 'var(--ib-cream, #FDF6EE)', borderRadius: 24, borderTop: '8px solid var(--ib-accent, #B4511E)', padding: '1.5rem', boxShadow: '0 24px 60px rgba(var(--ib-shadow-rgb, 26,10,0), 0.35)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)', display: 'flex', alignItems: 'center', gap: 8 }}><KeyRound size={18} color="var(--ib-accent, #B4511E)" /> What {admin.name} can do</h3>
          <button type="button" className="x-close" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ib-rust, #7A3A18)' }}><X size={20} /></button>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)', lineHeight: 1.5 }}>
          They can still see every page (except Reports, if unticked). What's unticked, they can't change: the website tells them to ask you.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PERMISSIONS.map(([k, name, what]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, background: picked.includes(k) ? 'rgba(var(--ib-accent-rgb, 180,81,30), 0.08)' : 'var(--ib-surface, #FFFDF9)', border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.18)', cursor: 'pointer' }}>
              <input type="checkbox" checked={picked.includes(k)} onChange={() => toggle(k)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)', lineHeight: 1.45 }}>
                <strong style={{ display: 'block', fontSize: 13.5, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{name}</strong>{what}
              </span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="text-link" onClick={() => setPicked(all ? [] : PERMISSIONS.map(([k]) => k))} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800 }}>{all ? 'Untick all' : 'Tick all'}</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ height: 40, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.3)', background: 'transparent', color: 'var(--ib-brown, #5C2A10)', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={save} disabled={busy} style={{ height: 40, padding: '0 18px', borderRadius: 12, border: 'none', background: 'var(--ib-accent, #B4511E)', color: 'var(--ib-on-accent, #FDF6EE)', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PermissionsDialog;
