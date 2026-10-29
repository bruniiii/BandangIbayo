import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Trash2, Loader2, Eye, EyeOff, Crown, UserRound } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { createAdminAccount } from './authApi';
import PasswordChecklist from './PasswordChecklist';
import { passwordErrorMessage } from './passwordPolicy';
import { emailError, fullNameError } from './validation';
import { SkeletonRows } from './ui/Skeleton';
import { useAdminMe } from './adminMe';
import AdminNameForm from './AdminNameForm';

// ─────────────────────────────────────────────
// ADMIN SETTINGS (main admin only): the list of admins, adding an admin (a new
// account, or an existing one by email) and removing one. Every admin can do
// everything else; only their name differs (top-right card, receipts).
// ─────────────────────────────────────────────

const card = {
  background: '#FDF6EE', borderRadius: 20, padding: '1.4rem 1.5rem',
  border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.05)',
};
const cardTitle = { display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 14.5, fontWeight: 900, color: '#1A0A00' };
const cardHint = { margin: '4px 0 14px', fontSize: 12, lineHeight: 1.5, color: '#7A3A18' };
const label = { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', marginBottom: 5 };
const input = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(180,81,30,0.2)',
  background: '#FFFDF9', fontSize: 13, fontWeight: 600, color: '#1A0A00', outline: 'none', fontFamily: 'inherit',
};
const primaryBtn = (busy) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 40, background: '#1A0A00', color: '#E8A265',
  border: 'none', borderRadius: 10, fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase',
  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
});
const initials = (name) => String(name || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
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
      message: "They'll no longer see the admin dashboard. Their account stays, as a joiner account, and you can make it an admin again later.",
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

  const needsName = me.loaded && (!me.name || me.name === me.email);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Your name (shown at the top right and on receipts) ── */}
      <section style={{ ...card, border: needsName ? '1.5px solid rgba(180,81,30,0.45)' : card.border }} aria-label="Your name">
        <h3 style={cardTitle}><UserRound size={16} style={{ color: '#A8481A' }} /> Your Name</h3>
        <p style={cardHint}>
          {needsName
            ? 'Your account has no name yet, so your email shows instead. Add your name: it shows at the top right and on the receipts of payments you process.'
            : 'Shown at the top right and on the receipts of payments you process.'}
        </p>
        <AdminNameForm onSaved={load} />
      </section>

      <div className="admin-settings-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* ── Admins ── */}
        <section style={card} aria-label="Admins">
          <h3 style={cardTitle}><ShieldCheck size={16} style={{ color: '#A8481A' }} /> Admins{admins ? ` (${admins.length})` : ''}</h3>
          <p style={cardHint}>Every admin can do everything on the admin dashboard. Only the main admin can add or remove admins.</p>
          {admins === null ? <SkeletonRows count={2} label="Loading admins" /> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {admins.map((a) => {
                const showEmail = a.email && a.email !== a.name;
                return (
                  <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F2E4D0', borderRadius: 14, padding: '10px 12px' }}>
                    <span aria-hidden="true" style={{
                      width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: a.is_main_admin ? '#1A0A00' : '#FDF6EE', color: a.is_main_admin ? '#E8A265' : '#A8481A',
                      border: '1px solid rgba(180,81,30,0.25)', fontSize: 12.5, fontWeight: 900,
                    }}>{initials(a.name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: '#1A0A00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.name}{a.id === myId && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#7A3A18' }}>(you)</span>}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 600, color: '#7A3A18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {showEmail ? `${a.email} · ` : ''}Added {formatDate(a.created_at)}
                      </p>
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, padding: '4px 9px', borderRadius: 999,
                      fontSize: 10.5, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase',
                      background: a.is_main_admin ? 'rgba(180,81,30,0.14)' : 'rgba(26,10,0,0.06)', color: a.is_main_admin ? '#A8481A' : '#7A3A18',
                    }}>{a.is_main_admin && <Crown size={12} />}{a.is_main_admin ? 'Main' : 'Admin'}</span>
                    {a.id !== myId && (
                      <button type="button" onClick={() => remove(a)} aria-label={`Remove ${a.name} as an admin`} title="Remove as admin" style={{
                        flexShrink: 0, width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(140,47,28,0.08)', color: '#8C2F1C', border: 'none', borderRadius: 10, cursor: 'pointer',
                      }}><Trash2 size={15} /></button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Add an admin ── */}
        <section style={card} aria-label="Add an admin">
          <h3 style={cardTitle}><UserPlus size={16} style={{ color: '#A8481A' }} /> Add an Admin</h3>
          <div role="tablist" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, background: '#F2E4D0', borderRadius: 10, padding: 4, margin: '12px 0 14px' }}>
            {[['new', 'New account'], ['existing', 'Existing account']].map(([key, text]) => (
              <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => { setMode(key); setError(''); }} style={{
                border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 11,
                letterSpacing: '0.06em', textTransform: 'uppercase', background: mode === key ? '#1A0A00' : 'transparent', color: mode === key ? '#FDF6EE' : '#7A3A18',
              }}>{text}</button>
            ))}
          </div>

          {mode === 'new' ? (
            <form onSubmit={addNew} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={label} htmlFor="admin-first">First Name</label><input id="admin-first" data-allow="name" value={form.first_name} onChange={set('first_name')} maxLength={60} style={input} /></div>
                <div><label style={label} htmlFor="admin-last">Last Name</label><input id="admin-last" data-allow="name" value={form.last_name} onChange={set('last_name')} maxLength={60} style={input} /></div>
              </div>
              <div><label style={label} htmlFor="admin-email">Email</label><input id="admin-email" type="email" value={form.email} onChange={set('email')} maxLength={120} placeholder="maria@gmail.com" style={input} /></div>
              <div>
                <label style={label} htmlFor="admin-password">Temporary Password</label>
                <div style={{ position: 'relative' }}>
                  <input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={set('password')} style={{ ...input, paddingRight: 40 }} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', display: 'flex' }}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {form.password && <PasswordChecklist password={form.password} />}
                <p style={{ margin: '6px 0 0', fontSize: 11.5, fontWeight: 600, color: '#7A3A18' }}>Share it with them privately. They can change it from their name at the top right.</p>
              </div>
              {error && <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#8C2F1C' }}>{error}</p>}
              <button type="submit" disabled={busy} style={primaryBtn(busy)}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <UserPlus size={14} />} Add Admin</button>
            </form>
          ) : (
            <form onSubmit={addExisting} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>For someone who already has an account on the site, for example a joiner.</p>
              <div><label style={label} htmlFor="admin-existing">Their Account Email</label><input id="admin-existing" type="email" value={existingEmail} onChange={(e) => { setExistingEmail(e.target.value); setError(''); }} maxLength={120} placeholder="maria@gmail.com" style={input} /></div>
              {error && <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#8C2F1C' }}>{error}</p>}
              <button type="submit" disabled={busy} style={primaryBtn(busy)}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={14} />} Make Admin</button>
            </form>
          )}
        </section>
      </div>
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @media (max-width: 980px){.admin-settings-grid{grid-template-columns:minmax(0,1fr) !important}}'}</style>
    </div>
  );
};

export default AdminSettings;
