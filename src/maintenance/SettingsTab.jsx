import React, { useEffect, useState } from 'react';
import { Power, Mail, Settings, Loader2, Lock, UserCog, KeyRound, AlertTriangle, CalendarClock } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { useAdminMe } from '../adminMe';
import { maintenanceChanged } from '../maintenanceMode';
import { card, h3, hint, btn, input, label, row, when, spin } from './shared';
import Toggle from './Toggle';

// ─────────────────────────────────────────────
// System Settings (the main admin changes them; other admins can look):
//  • Maintenance Mode: the joiner side shows "We'll be back soon" with this
//    message (set_maintenance). Admins keep working.
//  (Agency information has its own tab now.)
//  • Email reminders: day-before, balance and monthly summary on/off
//    (the send-email function checks them).
//  • Where the other settings are (admin profile, password, admins,
//    auto-archive of inactive joiners).
// ─────────────────────────────────────────────

const EMAILS = [
  ['day_before', 'Day-before trip reminder', 'The evening before a tour: meeting time, first pickup and things to bring.'],
  ['balance', 'Balance reminder', 'Two to three days before a tour, to joiners who paid a downpayment and still owe the balance.'],
  ['monthly_summary', 'Monthly summary', "On the 1st of the month: last month's bookings and sales, emailed to the main admin."],
];

const SettingsTab = ({ onNavigate }) => {
  const me = useAdminMe();
  const canEdit = me.isMain;
  const [mode, setMode] = useState(null);
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState('');
  const [emails, setEmails] = useState({ day_before: true, balance: true, monthly_summary: true });
  const [saving, setSaving] = useState('');

  const load = async () => {
    const [m, s] = await Promise.all([
      supabase.rpc('get_maintenance'),
      supabase.from('app_settings').select('key, value').in('key', ['agency_info', 'email_settings']),
    ]);
    const mm = m.data || { on: false };
    setMode(mm);
    setMessage(mm.message || '');
    setUntil(mm.until || '');
    const byKey = Object.fromEntries((s.data || []).map((r) => [r.key, r.value]));
    if (byKey.email_settings) setEmails((e) => ({ ...e, ...byKey.email_settings }));
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the settings when the tab opens
  useEffect(() => { load(); }, []);

  const switchMaintenance = async (turnOn) => {
    if (!(await confirmDialog(turnOn
      ? {
        title: 'Turn on Maintenance Mode?',
        message: "Joiners will see the \"We'll be back soon\" page and can't book, pay, post or chat until you turn it off. Joiners already on the site are moved to it within a minute. Admins keep working.",
        confirmLabel: 'Turn On', cancelLabel: 'Cancel', tone: 'danger',
      }
      : { title: 'Turn off Maintenance Mode?', message: 'The website opens again for joiners right away.', confirmLabel: 'Turn Off', cancelLabel: 'Keep It On' }))) return;
    setSaving('mode');
    let { data, error } = await supabase.rpc('set_maintenance', { p_on: turnOn, p_message: message, p_until: until });
    // On because of a planned time: turning it off ends that plan too.
    if (!error && !turnOn && data?.on && mode?.starts_at) {
      ({ data, error } = await supabase.rpc('set_maintenance_schedule', { p_starts: null, p_ends: null, p_message: null }));
    }
    setSaving('');
    if (error) { toast.error("Couldn't change Maintenance Mode", error.message); return; }
    setMode(data);
    maintenanceChanged();
    toast.success(turnOn ? 'Maintenance Mode is on' : 'Maintenance Mode is off', turnOn ? "Joiners now see the \"We'll be back soon\" page." : 'The website is open for joiners again.');
  };

  const saveMessage = async () => {
    setSaving('message');
    const { data, error } = await supabase.rpc('set_maintenance', { p_on: !!mode?.manual, p_message: message, p_until: until });
    setSaving('');
    if (error) { toast.error("Couldn't save the message", error.message); return; }
    setMode(data);
    maintenanceChanged();
    toast.success('Message saved', mode?.on ? 'Joiners see the new message.' : "It's shown the next time Maintenance Mode is on.");
  };

  const saveSetting = async (key, value, what) => {
    setSaving(key);
    const { error } = await supabase.from('app_settings').upsert([{ key, value, updated_at: new Date().toISOString() }], { onConflict: 'key' });
    setSaving('');
    if (error) { toast.error(`Couldn't save the ${what}`, error.message); return false; }
    toast.success(`${what[0].toUpperCase()}${what.slice(1)} saved`, "It's in Audit Trail.");
    return true;
  };


  const setEmail = async (k, v) => {
    const next = { ...emails, [k]: v };
    setEmails(next);
    if (!(await saveSetting('email_settings', next, 'email setting'))) setEmails(emails);
  };

  const on = !!mode?.on;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!canEdit && (
        <p role="note" style={{ ...row, margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ib-warn, #7A4410)' }}>
          <Lock size={15} /> Only the main admin can change these settings. You can see them here.
        </p>
      )}

      {/* Maintenance Mode */}
      <section style={{ ...card, borderColor: on ? 'rgba(var(--ib-red-rgb, 140,47,28), 0.45)' : card.border, background: on ? 'var(--ib-surface-2, #FBEDE6)' : card.background }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h3 style={h3}><Power size={16} color={on ? 'var(--ib-red, #8C2F1C)' : 'var(--ib-sienna, #A8481A)'} /> Maintenance Mode</h3>
            <p style={{ ...hint, margin: 0 }}>
              {on
                ? <><strong style={{ color: 'var(--ib-red, #8C2F1C)' }}>On{mode?.started_at ? ` since ${when(mode.started_at)}` : ''}{!mode?.manual && mode?.ends_at ? ` (planned, turns off by itself ${when(mode.ends_at)})` : ''}.</strong> Joiners see the "We'll be back soon" page. Admins and drivers' tracking links keep working.</>
                : 'Off. Turn it on while you fix or update the website: the whole joiner side shows a "We\'ll be back soon" page (no booking, paying, posting or chatting). Admins keep working.'}
            </p>
          </div>
          {mode === null ? <Loader2 size={18} style={spin} /> : (
            <button type="button" onClick={() => switchMaintenance(!on)} disabled={!canEdit || saving === 'mode'} style={{ ...btn(true), background: on ? '#1B5E3B' : 'var(--ib-red-solid, #8C2F1C)', height: 42 }}>
              {saving === 'mode' ? <Loader2 size={14} style={spin} /> : <Power size={14} />} {on ? 'Turn Off' : 'Turn On'}
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 12, marginTop: 14 }}>
          <label style={{ ...label, gridColumn: '1 / -1' }}>
            Message joiners see
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} disabled={!canEdit}
              placeholder="e.g. We're updating our booking system. Your bookings are safe."
              style={{ ...input, resize: 'vertical', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }} />
          </label>
          <label style={label}>
            Back by (optional)
            <input value={until} onChange={(e) => setUntil(e.target.value)} maxLength={60} disabled={!canEdit} placeholder="e.g. Nov 10, 5:00 PM"
              style={{ ...input, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }} />
          </label>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" onClick={saveMessage} disabled={saving === 'message'} style={btn(false)}>
              {saving === 'message' ? <Loader2 size={14} style={spin} /> : null} Save Message
            </button>
          </div>
        )}
      </section>

      <PlanMaintenance mode={mode} canEdit={canEdit} message={message} onSaved={(d) => { setMode(d); maintenanceChanged(); }} />

      {/* Email reminders */}
      <section style={card}>
        <h3 style={h3}><Mail size={16} color="var(--ib-sienna, #A8481A)" /> Email reminders</h3>
        <p style={hint}>Automatic emails. Switch one off to stop it (it's saved right away). Booking confirmations, receipts and cancellations are always sent.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {EMAILS.map(([k, t, d]) => (
            <div key={k} style={row}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{t} <span style={{ marginLeft: 6, color: emails[k] !== false ? 'var(--ib-green, #1B5E3B)' : 'var(--ib-red, #8C2F1C)' }}>{emails[k] !== false ? 'On' : 'Off'}</span></p>
                <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)' }}>{d}</p>
              </div>
              <Toggle on={emails[k] !== false} onChange={(v) => setEmail(k, v)} disabled={!canEdit || saving === 'email_settings'} label={t} />
            </div>
          ))}
        </div>
      </section>

      {/* Where the rest is */}
      <section style={card}>
        <h3 style={h3}><Settings size={16} color="var(--ib-sienna, #A8481A)" /> Other settings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 8, marginTop: 10 }}>
          <div style={row}>
            <KeyRound size={18} color="var(--ib-accent, #B4511E)" />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)' }}>
              <strong style={{ display: 'block', color: 'var(--ib-dark, #1A0A00)', fontSize: 13.5 }}>Your name and password</strong>
              Click your name at the top right → edit your name or Change Password.
            </span>
          </div>
          <button type="button" onClick={() => onNavigate('Admin Settings')} disabled={!canEdit} style={{ ...row, border: 'none', cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left' }}>
            <UserCog size={18} color="var(--ib-accent, #B4511E)" />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)' }}>
              <strong style={{ display: 'block', color: 'var(--ib-dark, #1A0A00)', fontSize: 13.5 }}>Admins and inactive joiners</strong>
              Admin Settings: add or archive admins, and how long before inactive joiners are archived{canEdit ? '' : ' (main admin only)'}.
            </span>
          </button>
          <div style={row}>
            <AlertTriangle size={18} color="var(--ib-accent, #B4511E)" />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)' }}>
              <strong style={{ display: 'block', color: 'var(--ib-dark, #1A0A00)', fontSize: 13.5 }}>Notifications</strong>
              The bell at the top shows new bookings, payments and requests; each admin marks them read.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};


// "2026-12-01T22:00" typed in the form is Philippine time.
const toManila = (iso) => {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 8 * 3600000);
  return d.toISOString().slice(0, 16);
};
const fromManila = (v) => (v ? new Date(`${v}:00+08:00`).toISOString() : null);

// Plan Maintenance Mode ahead: it turns on and off by itself, and joiners see a
// notice on the website during the 7 days before it starts.
const PlanMaintenance = ({ mode, canEdit, message, onSaved }) => {
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [busy, setBusy] = useState(false);
  const planned = mode?.starts_at && mode?.ends_at;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the saved plan when it loads
  useEffect(() => { setStarts(toManila(mode?.starts_at)); setEnds(toManila(mode?.ends_at)); }, [mode?.starts_at, mode?.ends_at]);

  const save = async (clear) => {
    if (!clear && (!starts || !ends)) { toast.error('Choose when it starts and ends'); return; }
    if (clear && !(await confirmDialog({ title: 'Cancel the planned maintenance?', message: mode?.on && !mode?.manual ? 'Maintenance Mode turns off right away and the website opens for joiners.' : 'Joiners stop seeing the notice about it.', confirmLabel: 'Cancel It', cancelLabel: 'Keep It' }))) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('set_maintenance_schedule', clear
      ? { p_starts: null, p_ends: null, p_message: null }
      : { p_starts: fromManila(starts), p_ends: fromManila(ends), p_message: message });
    setBusy(false);
    if (error) { toast.error("Couldn't save the plan", error.message); return; }
    onSaved(data);
    toast.success(clear ? 'Planned maintenance cancelled' : 'Maintenance planned', clear ? '' : 'It turns on and off by itself. Joiners see a notice before it starts.');
  };

  const inp = { ...input, textTransform: 'none', letterSpacing: 0, fontWeight: 600 };
  return (
    <section style={card}>
      <h3 style={h3}><CalendarClock size={16} color="var(--ib-sienna, #A8481A)" /> Plan maintenance</h3>
      <p style={hint}>
        Choose a time and Maintenance Mode turns on and off by itself (Philippine time, up to 3 days long). During the 7 days before, joiners see a notice at the top of the website so they can book or pay earlier. It uses the message above.
      </p>
      {planned && (
        <p role="status" style={{ ...row, margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: 'var(--ib-dark, #1A0A00)' }}>
          <CalendarClock size={16} color="var(--ib-accent, #B4511E)" />
          {mode.on && !mode.manual ? 'Happening now' : 'Planned'}: {when(mode.starts_at)} → {when(mode.ends_at)}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
        <label style={label}>Starts<input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} disabled={!canEdit} style={inp} /></label>
        <label style={label}>Ends<input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} disabled={!canEdit} style={inp} /></label>
      </div>
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {planned && <button type="button" onClick={() => save(true)} disabled={busy} style={btn(false)}>Cancel Plan</button>}
          <button type="button" onClick={() => save(false)} disabled={busy} style={btn(true)}>{busy ? <Loader2 size={14} style={spin} /> : <CalendarClock size={14} />} {planned ? 'Save Changes' : 'Plan It'}</button>
        </div>
      )}
    </section>
  );
};

export default SettingsTab;
