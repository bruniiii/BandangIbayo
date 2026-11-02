import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Archive, ArchiveRestore, ChevronDown, Loader2, Eye, EyeOff, Crown, Pencil, MailCheck, ArrowLeft, X, Plus, Mail } from 'lucide-react';
import { supabase, currentUser } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { createAdminAccount, verifyAdminAccount, resendLoginCode, restoreAdminAccount, verifyRestoredAdmin } from './authApi';
import OtpInput from './ui/OtpInput';
import PasswordChecklist from './PasswordChecklist';
import { passwordErrorMessage } from './passwordPolicy';
import { emailError, fullNameError } from './validation';
import { SkeletonRows } from './ui/Skeleton';
import { useAdminMe } from './adminMe';
import AdminNameForm from './AdminNameForm';
import BrandAvatar from './ui/BrandAvatar';
import { usePopupError } from './ui/usePopupError';

// ─────────────────────────────────────────────
// ADMIN SETTINGS (main admin only): the list of admins, adding an admin (a new
// account), archiving one (they can't log in, nothing is deleted) and
// restoring an archived admin. Every admin can do everything else; only their
// name differs (top-right card, receipts).
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
  const [archived, setArchived] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  usePopupError(error);
  const [busy, setBusy] = useState(false);
  // After "Send Code": { challengeId, sentTo } until the right code is entered.
  const [pending, setPending] = useState(null);
  const [code, setCode] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [adding, setAdding] = useState(false); // the Add Admin window
  const closeAdding = () => { if (busy) return; setAdding(false); setPending(null); setCode(''); setError(''); };

  // Loads quietly after the first time. Nothing is asked for while signed out.
  const load = useCallback(async () => {
    const user = await currentUser();
    if (!user) return;
    setMyId(user.id);
    const { data, error: err } = await supabase.rpc('list_admins');
    if (err) { toast.error("Couldn't load the admins", err.message); setAdmins([]); return; }
    setAdmins(data || []);
    const { data: old, error: oldErr } = await supabase.rpc('list_archived_admins');
    if (oldErr) toast.error("Couldn't load the archived admins", oldErr.message);
    setArchived(old || []);
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
    setAdding(false);
    load();
  };

  const resend = async () => {
    setError('');
    const result = await resendLoginCode(pending.challengeId);
    if (!result.ok) { setError(result.error); return; }
    toast.info('New code sent', `Sent to ${result.data.sentTo}.`);
  };

  const archive = async (a) => {
    if (!(await confirmDialog({
      title: `Archive ${a.name}?`,
      message: "They won't be able to log in or open the admin dashboard. Nothing is deleted: their name stays on the receipts they processed, and you can restore them anytime from Archived Admins.",
      confirmLabel: 'Archive Admin', cancelLabel: 'Keep', tone: 'danger',
    }))) return;
    const { error: err } = await supabase.rpc('archive_admin', { p_id: a.id });
    if (err) { toast.error("Couldn't archive the admin", err.message); return; }
    toast.success('Admin archived', `${a.name} can't log in now. Restore them from Archived Admins anytime.`);
    load();
  };

  // Restoring: a 6-digit code is emailed to the admin. They stay unable to
  // log in ("Pending verification") until the code is entered here.
  const [verifying, setVerifying] = useState(null); // the admin whose code is being entered
  const [restoreCode, setRestoreCode] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const sendRestoreCode = async (a, again = false) => {
    if (!again && !(await confirmDialog({
      title: `Restore ${a.name}?`,
      message: `We'll email a 6-digit code to ${a.email}. They stay unable to log in until the code is entered here (ask them for it). The code expires after 10 minutes.`,
      confirmLabel: 'Send Code', cancelLabel: 'Cancel',
    }))) return;
    setRestoreBusy(true);
    const result = await restoreAdminAccount(a.id);
    setRestoreBusy(false);
    if (!result.ok) { toast.error("Couldn't send the code", result.error); return; }
    toast.info(again ? 'New code sent' : 'Code sent', `A 6-digit code went to ${result.data.sentTo}. It expires in ${result.data.expiresInMinutes} minutes.`);
    setRestoreCode('');
    setVerifying(a);
    load();
  };
  const confirmRestoreCode = async (e) => {
    e?.preventDefault?.();
    if (restoreCode.length !== 6) { toast.error('Enter the 6-digit code', 'Ask the admin for the code we emailed them.'); return; }
    setRestoreBusy(true);
    const result = await verifyRestoredAdmin(verifying.id, restoreCode);
    setRestoreBusy(false);
    if (!result.ok) { toast.error("That didn't work", result.error); return; }
    toast.success('Admin restored', `${verifying.name}'s email is verified. They can log in again.`);
    setVerifying(null);
    setRestoreCode('');
    load();
  };
  const pendingAdmins = archived.filter((a) => a.pending);
  const archivedOnly = archived.filter((a) => !a.pending);

  if (me.loaded && !me.isMain) {
    return (
      <div style={card}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#7A3A18' }}>Only the main admin can manage admins.</p>
      </div>
    );
  }

  const needsName = me.loaded && (!me.name || me.name === me.email);
  const step = pending ? 2 : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      {/* ── Your profile: dark banner like the Overview header ── */}
      <section aria-label="Your profile" className="dashboard-hero-padding" style={{
        position: 'relative', overflow: 'hidden', background: '#1A0A00', borderRadius: 22, padding: '1.75rem 2rem',
        boxShadow: '0 10px 30px rgba(26,10,0,0.22)', borderBottom: '4px solid #B4511E',
      }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '45%', height: '100%', background: 'radial-gradient(ellipse at top right, rgba(180,81,30,0.22) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <BrandAvatar size={72} style={{ boxShadow: '0 0 0 3px rgba(232,162,101,0.35)' }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#E8A265' }}>Your Admin Profile</p>
            {editingName ? (
              <div style={{ background: '#FDF6EE', borderRadius: 14, padding: '12px 14px', maxWidth: 640 }}>
                <AdminNameForm onSaved={() => { setEditingName(false); load(); }} onCancel={() => setEditingName(false)} />
              </div>
            ) : (
              <>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: '-0.01em', color: needsName ? '#E8A265' : '#FDF6EE', overflowWrap: 'anywhere' }}>
                  {needsName ? 'Add your name' : me.name}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'rgba(232,210,190,0.9)' }}>
                    <Mail size={13} /> {me.email || '—'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: 'rgba(232,162,101,0.16)', color: '#E8A265', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {me.isMain && <Crown size={12} />} {me.isMain ? 'Main Admin' : 'Admin'}
                  </span>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 600, color: 'rgba(232,210,190,0.75)' }}>
                  {needsName ? 'Your email shows until you add a name. ' : ''}Your name shows at the top right and on the receipts of payments you process.
                </p>
              </>
            )}
          </div>
          {!editingName && (
            <button type="button" onClick={() => setEditingName(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px', borderRadius: 12, cursor: 'pointer',
              background: '#E8A265', border: 'none', color: '#1A0A00', fontFamily: 'inherit',
              fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase',
            }}><Pencil size={14} /> {needsName ? 'Add Name' : 'Edit Name'}</button>
          )}
        </div>
      </section>

      {/* ── Admins ── */}
      <section style={{ ...card, padding: 0, overflow: 'hidden' }} aria-label="Admins">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(180,81,30,0.12)' }}>
          <div>
            <h3 style={cardTitle}><ShieldCheck size={16} style={{ color: '#A8481A' }} /> Admins
              {admins && <span style={{ marginLeft: 4, padding: '1px 9px', borderRadius: 999, background: '#F2E4D0', fontSize: 11.5, fontWeight: 900, color: '#A8481A' }}>{admins.length}</span>}
            </h3>
            <p style={{ ...cardHint, margin: '4px 0 0' }}>Every admin can do everything on the dashboard. Only the main admin can add, archive or restore admins.</p>
          </div>
          <button type="button" onClick={() => { setAdding(true); setError(''); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase',
            boxShadow: '0 6px 18px rgba(180,81,30,0.3)',
          }}><Plus size={15} /> Add Admin</button>
        </div>
        {admins === null ? <div style={{ padding: '1rem 1.5rem' }}><SkeletonRows count={2} label="Loading admins" /></div> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {admins.map((a, i) => {
              const showEmail = a.email && a.email !== a.name;
              return (
                <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 1.5rem', borderTop: i ? '1px solid rgba(180,81,30,0.1)' : 'none', flexWrap: 'wrap' }}>
                  <span aria-hidden="true" style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: a.is_main_admin ? '#1A0A00' : '#F2E4D0', color: a.is_main_admin ? '#E8A265' : '#A8481A', fontSize: 13, fontWeight: 900,
                  }}>{initials(a.name)}</span>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}{a.id === myId && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#7A3A18' }}>(you)</span>}
                    </p>
                    {showEmail && <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: '#7A3A18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.email}</p>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', minWidth: 120 }}>Added {formatDate(a.created_at)}</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, minWidth: 64, justifyContent: 'center',
                    fontSize: 10.5, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
                    background: a.is_main_admin ? 'rgba(180,81,30,0.14)' : 'rgba(26,10,0,0.06)', color: a.is_main_admin ? '#A8481A' : '#7A3A18',
                  }}>{a.is_main_admin && <Crown size={12} />}{a.is_main_admin ? 'Main' : 'Admin'}</span>
                  <span style={{ width: 34, flexShrink: 0 }}>
                    {a.id !== myId && (
                      <button type="button" onClick={() => archive(a)} aria-label={`Archive ${a.name}`} title="Archive this admin" style={{
                        width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(140,47,28,0.08)', color: '#8C2F1C', border: 'none', borderRadius: 10, cursor: 'pointer',
                      }}><Archive size={15} /></button>
                    )}
                  </span>
                </li>
              );
            })}
            {pendingAdmins.map((a) => (
              <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 1.5rem', borderTop: '1px solid rgba(180,81,30,0.1)', flexWrap: 'wrap', background: 'rgba(252,231,166,0.25)' }}>
                <span aria-hidden="true" style={{
                  width: 42, height: 42, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#FCE7A6', color: '#7A5200', fontSize: 13, fontWeight: 900,
                }}>{initials(a.name)}</span>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                  {a.email && a.email !== a.name && <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: '#7A3A18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.email}</p>}
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999,
                  fontSize: 10.5, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  background: '#FCE7A6', color: '#7A5200', border: '1px solid #E8C25A',
                }}><MailCheck size={12} /> Pending verification</span>
                <button type="button" onClick={() => { setRestoreCode(''); setVerifying(a); }} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 10, cursor: 'pointer',
                  background: '#1A0A00', color: '#E8A265', border: 'none', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>Enter Code</button>
                <button type="button" disabled={restoreBusy} onClick={() => sendRestoreCode(a, true)} className="text-link" style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12 }}>
                  Resend code
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Archived admins: can't log in until restored. */}
        <div style={{ borderTop: '1px solid rgba(180,81,30,0.12)' }}>
          <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 1.5rem',
            background: 'rgba(242,228,208,0.45)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7A3A18' }}>
              <Archive size={14} /> Archived Admins
              <span style={{ padding: '1px 9px', borderRadius: 999, background: '#F2E4D0', fontSize: 11.5, color: '#A8481A' }}>{archivedOnly.length}</span>
            </span>
            <ChevronDown size={16} style={{ color: '#7A3A18', transition: 'transform 0.2s', transform: showArchived ? 'rotate(180deg)' : 'none' }} />
          </button>
          {showArchived && (archivedOnly.length === 0 ? (
            <p style={{ margin: 0, padding: '12px 1.5rem 16px', fontSize: 12.5, fontWeight: 600, color: '#7A3A18' }}>No archived admins. Admins you archive are kept here, and you can restore them anytime.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {archivedOnly.map((a) => (
                <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 1.5rem', borderTop: '1px solid rgba(180,81,30,0.1)', flexWrap: 'wrap' }}>
                  <span aria-hidden="true" style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(26,10,0,0.06)', color: 'rgba(122,58,24,0.8)', fontSize: 13, fontWeight: 900,
                  }}>{initials(a.name)}</span>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#7A3A18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                    {a.email && a.email !== a.name && <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: '#7A3A18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.email}</p>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', minWidth: 120 }}>Archived {formatDate(a.archived_at)}</span>
                  <button type="button" disabled={restoreBusy} onClick={() => sendRestoreCode(a)} aria-label={`Restore ${a.name}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 10, cursor: 'pointer',
                    background: '#1A0A00', color: '#E8A265', border: 'none', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}><ArchiveRestore size={14} /> Restore</button>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      <AutoArchiveSetting />

      {/* ── Restore: enter the code the admin received ── */}
      {verifying && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => !restoreBusy && setVerifying(null)} />
          <form role="dialog" aria-label="Verify the restored admin" onSubmit={confirmRestoreCode} style={{
            position: 'relative', width: '100%', maxWidth: 420, background: '#FDF6EE', borderRadius: 22, borderTop: '6px solid #B4511E',
            boxShadow: '0 30px 70px rgba(26,10,0,0.4)', padding: '1.5rem 1.6rem',
          }}>
            <button type="button" onClick={() => setVerifying(null)} disabled={restoreBusy} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>
            <h3 style={{ ...cardTitle, fontSize: 16 }}><MailCheck size={17} style={{ color: '#A8481A' }} /> Verify {verifying.name}</h3>
            <p style={{ ...cardHint, margin: '6px 0 16px' }}>
              Enter the 6-digit code we emailed to <strong>{verifying.email}</strong>. Ask them for it. The code expires 10 minutes after it was sent.
            </p>
            <OtpInput value={restoreCode} onChange={setRestoreCode} autoFocus />
            <button type="submit" disabled={restoreBusy || restoreCode.length !== 6} style={{ ...primaryBtn(restoreBusy || restoreCode.length !== 6), marginTop: 16 }}>
              {restoreBusy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={15} />} Verify & Restore
            </button>
            <p style={{ margin: '12px 0 0', fontSize: 12, fontWeight: 600, color: '#7A3A18', textAlign: 'center' }}>
              Didn't get it, or it expired?{' '}
              <button type="button" disabled={restoreBusy} onClick={() => sendRestoreCode(verifying, true)} className="text-link" style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12 }}>Resend code</button>
            </p>
          </form>
        </div>
      )}

      {/* ── Add Admin window: 1 Details → 2 Verify email ── */}
      {adding && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={closeAdding} />
          <div role="dialog" aria-label="Add an admin" style={{
            position: 'relative', width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto', background: '#FDF6EE',
            borderRadius: 22, borderTop: '6px solid #B4511E', boxShadow: '0 30px 70px rgba(26,10,0,0.4)', padding: '1.5rem 1.6rem 1.6rem',
          }}>
            <button type="button" onClick={closeAdding} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', display: 'flex' }}><X size={20} /></button>
            <h3 style={{ ...cardTitle, fontSize: 17 }}><UserPlus size={18} style={{ color: '#A8481A' }} /> Add an Admin</h3>
            {/* steps */}
            <ol style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 18px', padding: 0 }}>
              {[[1, 'Details'], [2, 'Verify email']].map(([n, text], idx) => (
                <React.Fragment key={n}>
                  {idx > 0 && <span aria-hidden="true" style={{ flex: 1, height: 2, borderRadius: 2, background: step >= n ? '#B4511E' : 'rgba(180,81,30,0.2)' }} />}
                  <li style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 900, color: step >= n ? '#1A0A00' : 'rgba(122,58,24,0.6)' }} aria-current={step === n ? 'step' : undefined}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, background: step >= n ? '#1A0A00' : 'rgba(180,81,30,0.14)', color: step >= n ? '#E8A265' : '#A8481A' }}>{n}</span>
                    {text}
                  </li>
                </React.Fragment>
              ))}
            </ol>

            {!pending ? (
              <form onSubmit={sendCode} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={label} htmlFor="admin-first">First Name</label><input id="admin-first" data-allow="name" value={form.first_name} onChange={set('first_name')} maxLength={60} style={input} autoFocus /></div>
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
                <button type="submit" disabled={busy} style={primaryBtn(busy)}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <MailCheck size={14} />} Send Verification Code</button>
              </form>
            ) : (
              <form onSubmit={verifyCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#F2E4D0', borderRadius: 12, padding: '10px 12px' }}>
                  <MailCheck size={18} style={{ color: '#A8481A', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#1A0A00', lineHeight: 1.55 }}>
                    We emailed a 6-digit code to <strong>{pending.sentTo}</strong>. Ask <strong>{form.first_name.trim() || 'them'}</strong> for it and enter it below. It's valid for 10 minutes.
                  </p>
                </div>
                <OtpInput value={code} onChange={(v) => { setCode(v); setError(''); }} invalid={!!error} autoFocus />
                {error && <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#8C2F1C', textAlign: 'center' }}>{error}</p>}
                <button type="submit" disabled={busy || code.length !== 6} style={primaryBtn(busy || code.length !== 6)}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={14} />} Verify &amp; Add Admin</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => { setPending(null); setError(''); }} className="text-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                    <ArrowLeft size={13} /> Change details
                  </button>
                  <button type="button" onClick={resend} className="text-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Send a new code</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
};

// ── Archive inactive joiners automatically ──
// Saved in app_settings; the database archives joiners with no login for
// this long every day (archive_inactive_joiners). Default: on, 2 years.
const ARCHIVE_OPTIONS = [[180, '6 months'], [365, '1 year'], [548, '1½ years'], [730, '2 years'], [1095, '3 years'], [1825, '5 years']];

const AutoArchiveSetting = () => {
  const [enabled, setEnabled] = useState(true);
  const [days, setDays] = useState(730);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.from('app_settings').select('key, value').in('key', ['inactive_archive_enabled', 'inactive_archive_days']).then(({ data, error }) => {
      if (!active) return;
      if (error) { toast.error("Couldn't load the archive setting", error.message); return; }
      const get = (k) => (data || []).find((r) => r.key === k)?.value;
      if (get('inactive_archive_enabled') != null) setEnabled(get('inactive_archive_enabled') === true);
      if (get('inactive_archive_days') != null) setDays(Number(get('inactive_archive_days')) || 730);
      setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const save = async (nextEnabled, nextDays) => {
    const label = ARCHIVE_OPTIONS.find(([d]) => d === nextDays)?.[1] || `${nextDays} days`;
    if (!(await confirmDialog(nextEnabled
      ? { title: `Archive joiners after ${label} without a login?`, message: 'Joiners who haven\'t logged in for this long are archived automatically every day. When they log in again, they choose whether to restore their account. Joiners close to the limit get a yellow warning in Joiner Accounts.', confirmLabel: 'Save Setting', cancelLabel: 'Cancel' }
      : { title: 'Turn off automatic archiving?', message: 'Inactive joiners will no longer be archived automatically. Accounts already archived stay archived.', confirmLabel: 'Turn Off', cancelLabel: 'Keep It On' }))) return;
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('app_settings').upsert([
      { key: 'inactive_archive_enabled', value: nextEnabled, updated_at: now },
      { key: 'inactive_archive_days', value: nextDays, updated_at: now },
    ], { onConflict: 'key' });
    setSaving(false);
    if (error) { toast.error("Couldn't save the setting", error.message); return; }
    setEnabled(nextEnabled); setDays(nextDays);
    toast.success('Setting saved', nextEnabled ? `Joiners are archived after ${label} without a login.` : 'Automatic archiving is off.');
  };

  return (
    <section style={card} aria-label="Archive inactive joiners">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h3 style={cardTitle}><Archive size={16} style={{ color: '#A8481A' }} /> Archive Inactive Joiners</h3>
          <p style={{ ...cardHint, margin: '4px 0 0' }}>
            Automatically archive joiner accounts that haven't logged in for a while. When an archived joiner logs in again, they choose whether to restore their account.
          </p>
        </div>
        <button type="button" role="switch" className="no-touch-size" aria-checked={enabled} disabled={!loaded || saving} onClick={() => save(!enabled, days)}
          style={{
            flexShrink: 0, width: 52, height: 30, minHeight: 30, minWidth: 52, padding: 0, boxSizing: 'border-box', alignSelf: 'center',
            borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative',
            background: enabled ? '#B4511E' : 'rgba(122,58,24,0.25)', transition: 'background 0.2s', opacity: loaded ? 1 : 0.5,
          }}
          aria-label={enabled ? 'Turn off automatic archiving' : 'Turn on automatic archiving'}>
          <span style={{ position: 'absolute', top: 3, left: enabled ? 25 : 3, width: 24, height: 24, borderRadius: '50%', background: '#FDF6EE', transition: 'left 0.2s', boxShadow: '0 2px 6px rgba(26,10,0,0.25)' }} />
        </button>
      </div>
      {enabled && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label htmlFor="archive-after" style={{ ...label, margin: 0 }}>Archive after no login for</label>
          <select id="archive-after" value={days} disabled={!loaded || saving} onChange={(e) => save(true, Number(e.target.value))}
            style={{ ...input, width: 'auto', cursor: 'pointer' }}>
            {ARCHIVE_OPTIONS.map(([d, l]) => <option key={d} value={d}>{l}{d === 730 ? ' (default)' : ''}</option>)}
            {!ARCHIVE_OPTIONS.some(([d]) => d === days) && <option value={days}>{days} days</option>}
          </select>
        </div>
      )}
    </section>
  );
};


export default AdminSettings;
