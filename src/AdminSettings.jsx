import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Trash2, Loader2, Eye, EyeOff, Crown } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { createAdminAccount } from './authApi';
import PasswordChecklist from './PasswordChecklist';
import { passwordErrorMessage } from './passwordPolicy';
import { emailError, fullNameError } from './validation';
import { SkeletonRows } from './ui/Skeleton';
import { useAdminMe } from './adminMe';

// ─────────────────────────────────────────────
// ADMIN SETTINGS (main admin only): the list of admins, adding an admin (a new
// account, or an existing one by email) and removing one. Every admin can do
// everything else; only their name differs (top-right card, receipts).
// ─────────────────────────────────────────────

const card = {
  background: '#FDF6EE', borderRadius: 20, padding: '1.5rem 1.75rem',
  border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
};
const label = { display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', marginBottom: 6 };
const input = {
  width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(180,81,30,0.18)',
  background: '#F2E4D0', fontSize: 13.5, fontWeight: 600, color: '#1A0A00', outline: 'none', fontFamily: 'inherit',
};
const primaryBtn = (busy) => ({
  display: 'inline-flex', alignItems: 'center', gap: 8, background: '#1A0A00', color: '#E8A265', border: 'none', borderRadius: 12,
  padding: '12px 22px', fontFamily: 'inherit', fontWeight: 900, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
});
const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

const AdminSettings = () => {
  const me = useAdminMe();
  const [myId, setMyId] = useState(null);
  const [admins, setAdmins] = useState(null);
  const [mode, setMode] = useState('new'); // 'new' | 'existing'
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' });
  const [existingEmail, setExistingEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Loads quietly after the first time.
  const load = useCallback(async () => {
    const [{ data: { user } }, { data, error: err }] = await Promise.all([supabase.auth.getUser(), supabase.rpc('list_admins')]);
    setMyId(user?.id || null);
    if (err) { toast.error("Couldn't load the admins", err.message); setAdmins([]); return; }
    setAdmins(data || []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data when the page opens; state updates happen after the request
  useEffect(() => { load(); }, [load]);

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(''); };

  const addNew = async (e) => {
    e.preventDefault();
    const problem = fullNameError(`${form.first_name} ${form.last_name}`, 'Name')
      || emailError(form.email) || passwordErrorMessage(form.password);
    if (problem) { setError(problem); return; }
    if (!(await confirmDialog({
      title: `Add ${form.first_name.trim()} ${form.last_name.trim()} as an admin?`,
      message: `They can log in with ${form.email.trim()} and the password you set, and do everything admins can. Only you can add or remove admins.`,
      confirmLabel: 'Add Admin', cancelLabel: 'Go Back',
    }))) return;
    setBusy(true);
    const result = await createAdminAccount({ ...form, email: form.email.trim() });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    toast.success('Admin added', `${result.data.name} can now log in. Share the password with them; they can change it from their name at the top right.`);
    setForm({ first_name: '', last_name: '', email: '', password: '' });
    load();
  };

  const addExisting = async (e) => {
    e.preventDefault();
    const problem = emailError(existingEmail);
    if (problem) { setError(problem); return; }
    if (!(await confirmDialog({
      title: 'Make this account an admin?',
      message: `${existingEmail.trim()} will get the admin dashboard and can do everything admins can.`,
      confirmLabel: 'Make Admin', cancelLabel: 'Go Back',
    }))) return;
    setBusy(true);
    const { data, error: err } = await supabase.rpc('make_admin', { p_email: existingEmail.trim() });
    setBusy(false);
    if (err) { setError(err.message); return; }
    toast.success('Admin added', `${data} is now an admin. They'll see the admin dashboard the next time they log in.`);
    setExistingEmail('');
    load();
  };

  const remove = async (a) => {
    if (!(await confirmDialog({
      title: `Remove ${a.name} as an admin?`,
      message: "They'll no longer see the admin dashboard. Their account stays, as a joiner account.",
      confirmLabel: 'Remove Admin', cancelLabel: 'Keep', tone: 'danger',
    }))) return;
    const { error: err } = await supabase.rpc('remove_admin', { p_id: a.id });
    if (err) { toast.error("Couldn't remove the admin", err.message); return; }
    toast.success('Admin removed', `${a.name} is no longer an admin.`);
    load();
  };

  if (me.loaded && !me.isMain) {
    return (
      <div style={card}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>Only the main admin can manage admins.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>
      {/* ── Admins ── */}
      <section style={card} aria-label="Admins">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#1A0A00' }}>
          <ShieldCheck size={17} style={{ color: '#A8481A' }} /> Admins
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#7A3A18' }}>
          Every admin can do everything on the admin dashboard. Their name shows at the top right and on the receipts of payments they process.
        </p>
        {admins === null ? <SkeletonRows count={2} label="Loading admins" /> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {admins.map((a) => (
              <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#F2E4D0', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: '#1A0A00', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {a.name}{a.id === myId && <span style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18' }}>(you)</span>}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: '#7A3A18', overflowWrap: 'anywhere' }}>{a.email} · Added {formatDate(a.created_at)}</p>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: a.is_main_admin ? '#A8481A' : '#7A3A18' }}>
                  {a.is_main_admin && <Crown size={13} />} {a.is_main_admin ? 'Main Admin' : 'Admin'}
                </span>
                {!a.is_main_admin && a.id !== myId && (
                  <button type="button" onClick={() => remove(a)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(140,47,28,0.08)', color: '#8C2F1C', border: 'none',
                    borderRadius: 10, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}><Trash2 size={13} /> Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Add an admin ── */}
      <section style={card} aria-label="Add an admin">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 15, fontWeight: 900, color: '#1A0A00' }}>
          <UserPlus size={17} style={{ color: '#A8481A' }} /> Add an Admin
        </h3>
        <div role="tablist" style={{ display: 'flex', gap: 6, background: '#F2E4D0', borderRadius: 12, padding: 4, width: 'fit-content', marginBottom: 16, flexWrap: 'wrap' }}>
          {[['new', 'New account'], ['existing', 'Existing account']].map(([key, text]) => (
            <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => { setMode(key); setError(''); }} style={{
              border: 'none', borderRadius: 9, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5,
              letterSpacing: '0.06em', textTransform: 'uppercase', background: mode === key ? '#1A0A00' : 'transparent', color: mode === key ? '#FDF6EE' : '#7A3A18',
            }}>{text}</button>
          ))}
        </div>

        {mode === 'new' ? (
          <form onSubmit={addNew} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><label style={label} htmlFor="admin-first">First Name</label><input id="admin-first" data-allow="name" value={form.first_name} onChange={set('first_name')} maxLength={60} style={input} /></div>
              <div><label style={label} htmlFor="admin-last">Last Name</label><input id="admin-last" data-allow="name" value={form.last_name} onChange={set('last_name')} maxLength={60} style={input} /></div>
            </div>
            <div><label style={label} htmlFor="admin-email">Email</label><input id="admin-email" type="email" value={form.email} onChange={set('email')} maxLength={120} placeholder="maria@gmail.com" style={input} /></div>
            <div>
              <label style={label} htmlFor="admin-password">Temporary Password</label>
              <div style={{ position: 'relative' }}>
                <input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={set('password')} style={{ ...input, paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <PasswordChecklist password={form.password} />
              <p style={{ margin: '6px 0 0', fontSize: 11.5, fontWeight: 600, color: '#7A3A18' }}>Share it with them privately. They can change it from their name at the top right.</p>
            </div>
            {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#8C2F1C' }}>{error}</p>}
            <div><button type="submit" disabled={busy} style={primaryBtn(busy)}>{busy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <UserPlus size={15} />} Add Admin</button></div>
          </form>
        ) : (
          <form onSubmit={addExisting} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#7A3A18' }}>For someone who already has an account on the site (for example, they registered as a joiner).</p>
            <div><label style={label} htmlFor="admin-existing">Their Account Email</label><input id="admin-existing" type="email" value={existingEmail} onChange={(e) => { setExistingEmail(e.target.value); setError(''); }} maxLength={120} placeholder="maria@gmail.com" style={input} /></div>
            {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#8C2F1C' }}>{error}</p>}
            <div><button type="submit" disabled={busy} style={primaryBtn(busy)}>{busy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={15} />} Make Admin</button></div>
          </form>
        )}
      </section>
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
};

export default AdminSettings;
