import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Trash2, Loader2, Eye, EyeOff, Crown, UserRound, Pencil, MailCheck, ArrowLeft } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { createAdminAccount, verifyAdminAccount, resendLoginCode } from './authApi';
import OtpInput from './ui/OtpInput';
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
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // After "Send Code": { challengeId, sentTo } until the right code is entered.
  const [pending, setPending] = useState(null);
  const [code, setCode] = useState('');
  const [editingName, setEditingName] = useState(false);

  // Loads quietly after the first time. Nothing is asked for while signed out.
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyId(user.id);
    const { data, error: err } = await supabase.rpc('list_admins');
    if (err) { toast.error("Couldn't load the admins", err.message); setAdmins([]); return; }
    setAdmins(data || []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data when the page opens; state updates happen after the request
  useEffect(() => { load(); }, [load]);

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(''); };

  // Step 1: check the details and email a code to the new admin.
  const sendCode = async (e) => {
    e.preventDefault();
    const problem = fullNameError(`${form.first_name} ${form.last_name}`, 'Name')
      || emailError(form.email) || passwordErrorMessage(form.password);
    if (problem) { setError(problem); return; }
    if (!(await confirmDialog({
      title: `Add ${form.first_name.trim()} ${form.last_name.trim()} as an admin?`,
      message: `We'll email a 6-digit code to ${form.email.trim()}. Ask them for it to finish adding them. They'll be able to do everything admins can.`,
      confirmLabel: 'Send Code', cancelLabel: 'Go Back',
    }))) return;
    setBusy(true);
    const result = await createAdminAccount({ ...form, email: form.email.trim() });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setPending({ challengeId: result.data.challengeId, sentTo: result.data.sentTo });
    setCode('');
  };

  // Step 2: the code they received → the admin account is created.
  const verifyCode = async (e) => {
    e.preventDefault();
    if (code.length !== 6) { setError('Enter the 6-digit code they received.'); return; }
    setBusy(true);
    const result = await verifyAdminAccount(pending.challengeId, code, form.password);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    toast.success('Admin added', `${result.data.name} can now log in. Share the password with them; they can change it from their name at the top right.`);
    setPending(null);
    setCode('');
    setForm({ first_name: '', last_name: '', email: '', password: '' });
    load();
  };

  const resend = async () => {
    setError('');
    const result = await resendLoginCode(pending.challengeId);
    if (!result.ok) { setError(result.error); return; }
    toast.info('New code sent', `Sent to ${result.data.sentTo}.`);
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={cardTitle}><UserRound size={16} style={{ color: '#A8481A' }} /> Your Name</h3>
            <p style={{ ...cardHint, marginBottom: 0 }}>
              {needsName
                ? 'Your account has no name yet, so your email shows instead. Add your name: it shows at the top right and on the receipts of payments you process.'
                : 'Shown at the top right and on the receipts of payments you process.'}
            </p>
          </div>
          {!editingName && (
            <button type="button" onClick={() => setEditingName(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 10, cursor: 'pointer',
              background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.3)', color: '#A8481A', fontFamily: 'inherit',
              fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}><Pencil size={13} /> {needsName ? 'Add Name' : 'Edit'}</button>
          )}
        </div>
        {editingName ? (
          <div style={{ marginTop: 14 }}>
            <AdminNameForm onSaved={() => { setEditingName(false); load(); }} onCancel={() => setEditingName(false)} />
          </div>
        ) : (
          <dl style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 40px', margin: '14px 0 0' }}>
            <div>
              <dt style={label}>Name</dt>
              <dd style={{ margin: 0, fontSize: 14, fontWeight: 800, color: needsName ? '#8C2F1C' : '#1A0A00' }}>{needsName ? 'Not set yet' : me.name}</dd>
            </div>
            <div>
              <dt style={label}>Email</dt>
              <dd style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A0A00' }}>{me.email || '—'}</dd>
            </div>
            <div>
              <dt style={label}>Role</dt>
              <dd style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A0A00' }}>{me.isMain ? 'Main Admin' : 'Admin'}</dd>
            </div>
          </dl>
        )}
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
          {!pending ? (
            <form onSubmit={sendCode} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }} noValidate>
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
              <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5, background: '#F2E4D0', borderRadius: 10, padding: '8px 10px' }}>
                To verify the email, we'll send them a 6-digit code. Ask them for it to finish.
              </p>
              {error && <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#8C2F1C' }}>{error}</p>}
              <button type="submit" disabled={busy} style={primaryBtn(busy)}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <MailCheck size={14} />} Send Code</button>
            </form>
          ) : (
            <form onSubmit={verifyCode} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }} noValidate>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#1A0A00', lineHeight: 1.55 }}>
                We emailed a 6-digit code to <strong>{pending.sentTo}</strong>. Ask <strong>{form.first_name.trim() || 'them'}</strong> for it and enter it here. It's valid for 10 minutes.
              </p>
              <OtpInput value={code} onChange={(v) => { setCode(v); setError(''); }} invalid={!!error} autoFocus />
              {error && <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#8C2F1C' }}>{error}</p>}
              <button type="submit" disabled={busy || code.length !== 6} style={primaryBtn(busy || code.length !== 6)}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={14} />} Verify &amp; Add Admin</button>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => { setPending(null); setError(''); }} className="text-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                  <ArrowLeft size={13} /> Change details
                </button>
                <button type="button" onClick={resend} className="text-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Send a new code</button>
              </div>
            </form>
          )}
        </section>
      </div>
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @media (max-width: 980px){.admin-settings-grid{grid-template-columns:minmax(0,1fr) !important}}'}</style>
    </div>
  );
};

export default AdminSettings;
