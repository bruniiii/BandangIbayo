import React, { useEffect, useState } from 'react';
import { Wrench, Archive, Clock, BellOff, Bug, UserX, Loader2, CheckCircle2, History, Database, Map as MapIcon, Calendar, Users, Inbox, ChevronRight } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { card, h3, hint, row, btn, when, spin } from './shared';
import { PAYMENT_HOLD_MINUTES, minutesText } from '../bookingRules';

// ─────────────────────────────────────────────
// Data Maintenance: where to update and correct records (tours, prices,
// schedules, slots, bookings, archived tours), the cleanups for outdated
// data (system_health / run_maintenance), what runs automatically, and the
// log of cleanups.
// ─────────────────────────────────────────────

const TASKS = [
  { key: 'archive_past_tours', count: 'past_tours_open', icon: Archive, title: 'Past tours still open', what: 'Tours whose dates have passed but are still listed. Clean up moves them to Tour Archive.' },
  { key: 'expire_holds', count: 'expired_holds', icon: Clock, title: 'Expired unpaid checkouts', what: 'Bookings whose 15-minute payment window passed without paying. Clean up cancels them and frees their slots.' },
  { key: 'old_notifications', count: 'old_notifications', icon: BellOff, title: 'Old read notifications', what: 'Notifications already read and older than 90 days. Clean up deletes them.' },
  { key: 'old_errors', count: 'old_errors', icon: Bug, title: 'Old error reports', what: 'Website error reports older than 30 days. Clean up deletes them.' },
  { key: 'inactive_joiners', count: null, icon: UserX, title: 'Inactive joiners', what: "Archives joiners who haven't logged in for the time set in Admin Settings (they can restore their account)." },
];
const TASK_NAMES = Object.fromEntries(TASKS.map((t) => [t.key, t.title]));

// Built when shown, so the payment hold follows the Booking Rules.
const automatic = () => [
  ['Every day', 'Past tours move to Tour Archive; inactive joiners are archived; old error reports are deleted.'],
  ['Every 5 minutes', `Checkouts not paid within ${minutesText(PAYMENT_HOLD_MINUTES)} expire and their slots open again.`],
  ['Every hour', 'Overdue cancellation requests are approved; requests not answered in time are closed; trip emails go out.'],
  ['Every 5 minutes (tour day)', "Departure reminders, and alerts when the van's location goes quiet."],
  ['1st of the month', "Last month's summary is emailed to the main admin."],
];

const SHORTCUTS = [
  { page: 'Tour Management', icon: MapIcon, title: 'Tours, prices, schedules and slots', what: 'Edit a tour to change its details, Joiner Rate, Regular Rate, dates, slots or pickup points.' },
  { page: 'Tour Management', icon: Archive, title: 'Archived tours', what: 'Open Tour Archive (button at the top of Tour Management) to review past tours and restore one by adding a new date.' },
  { page: 'Booking Management', icon: Calendar, title: 'Booking records', what: 'Check payments, balances, cancellations and refunds; fix a booking status.' },
  { page: 'Private Tours', icon: Inbox, title: 'Private tours & requests', what: 'Answer requests and update their packages.' },
  { page: 'Joiner Accounts', icon: Users, title: 'Joiner accounts', what: 'Archive, restore or remove joiner accounts.' },
];

const DataTab = ({ onNavigate }) => {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState('');
  const [log, setLog] = useState([]);
  const [names, setNames] = useState({});

  const load = async () => {
    const [h, l] = await Promise.all([
      supabase.rpc('system_health'),
      supabase.from('maintenance_log').select('*').order('ran_at', { ascending: false }).limit(20),
    ]);
    if (h.error) { setError(h.error.message); setHealth({}); } else { setError(''); setHealth(h.data || {}); }
    setLog(l.data || []);
    const ids = [...new Set((l.data || []).map((r) => r.admin_id).filter(Boolean))];
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
      setNames(Object.fromEntries((data || []).map((p) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Admin'])));
    }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the counts when the tab opens
  useEffect(() => { load(); }, []);

  const run = async (task) => {
    const n = task.count ? Number(health?.[task.count]) || 0 : null;
    if (!(await confirmDialog({
      title: `Clean up: ${task.title.toLowerCase()}?`,
      message: task.what + (n != null ? `\n\n${n} item${n === 1 ? '' : 's'} will be cleaned up.` : ''),
      confirmLabel: 'Clean Up', cancelLabel: 'Cancel',
    }))) return;
    setRunning(task.key);
    const { data, error: err } = await supabase.rpc('run_maintenance', { p_task: task.key });
    setRunning('');
    if (err) { toast.error("Couldn't clean up", err.message); return; }
    toast.success('Cleaned up', `${Number(data) || 0} item${Number(data) === 1 ? '' : 's'} handled. It's in the maintenance log.`);
    load();
  };

  const runAll = async () => {
    if (!(await confirmDialog({ title: 'Run every cleanup now?', message: 'Archives past tours, expires unpaid checkouts, deletes old read notifications and error reports, and archives inactive joiners.', confirmLabel: 'Run All', cancelLabel: 'Cancel' }))) return;
    setRunning('all');
    let total = 0;
    for (const t of TASKS) {
      const { data, error: err } = await supabase.rpc('run_maintenance', { p_task: t.key });
      if (err) { toast.error(`Couldn't run "${t.title}"`, err.message); continue; }
      total += Number(data) || 0;
    }
    setRunning('');
    toast.success('Maintenance done', `${total} item${total === 1 ? '' : 's'} handled.`);
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section style={card}>
        <h3 style={h3}><MapIcon size={16} color="#A8481A" /> Update records</h3>
        <p style={hint}>Where to update or correct each kind of record. Every change is saved in Audit Trail.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 8 }}>
          {SHORTCUTS.map((s) => {
            const Icon = s.icon;
            return (
              <button key={s.title} type="button" onClick={() => onNavigate(s.page)} style={{ ...row, flexWrap: 'nowrap', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                <Icon size={18} color="#B4511E" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>{s.title}</span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>{s.what}</span>
                </span>
                <ChevronRight size={16} color="#7A3A18" style={{ flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      </section>

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}><Database size={16} color="#A8481A" /> Clean up outdated data</h3>
            <p style={hint}>Most of it is cleaned up automatically; you can also clean it up now.</p>
          </div>
          <button type="button" onClick={runAll} disabled={!!running || !!error} style={btn(true)}>
            {running === 'all' ? <Loader2 size={14} style={spin} /> : <Wrench size={14} />} Run All Cleanups
          </button>
        </div>
        {error && <p role="alert" style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#8C2F1C' }}>Couldn't check the data ({error}). Run the latest database update (install_updates.sql).</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TASKS.map((t) => {
            const n = t.count ? Number(health?.[t.count]) || 0 : null;
            const Icon = t.icon;
            return (
              <div key={t.key} style={{ ...row, background: n ? 'rgba(232,162,101,0.14)' : '#F2E4D0' }}>
                <Icon size={18} color={n ? '#B4511E' : '#5C2A10'} style={{ flexShrink: 0 }} />
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>
                    {t.title}{n != null && <span style={{ marginLeft: 8, color: n ? '#8C2F1C' : '#1B5E3B' }}>{n ? n : '✓ none'}</span>}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>{t.what}</p>
                </div>
                <button type="button" onClick={() => run(t)} disabled={!!running || n === 0} style={btn(!!n || n == null)}>
                  {running === t.key ? <Loader2 size={14} style={spin} /> : <Wrench size={14} />} Clean Up
                </button>
              </div>
            );
          })}
          {health && (Number(health.stale_requests) > 0 || Number(health.errors_7_days) > 0) && (
            <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 700, color: '#7A4410' }}>
              {Number(health.stale_requests) > 0 && `${health.stale_requests} request${health.stale_requests === 1 ? ' has' : 's have'} waited over 30 days for an answer (see Private Tours / Requested Tours). `}
              {Number(health.errors_7_days) > 0 && `${health.errors_7_days} website error${health.errors_7_days === 1 ? '' : 's'} in the last 7 days.`}
            </p>
          )}
        </div>
      </section>

      <section style={card}>
        <h3 style={h3}><Clock size={16} color="#A8481A" /> Runs automatically</h3>
        <p style={hint}>The database does these by itself, so the data stays up to date even when no one is cleaning.</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {automatic().map(([w, t]) => (
            <li key={w} style={{ display: 'flex', gap: 10, fontSize: 12.5, color: '#1A0A00' }}>
              <CheckCircle2 size={15} color="#2E9B5F" style={{ flexShrink: 0, marginTop: 2 }} />
              <span><strong>{w}:</strong> {t}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={card}>
        <h3 style={h3}><History size={16} color="#A8481A" /> Maintenance log</h3>
        <p style={hint}>Every cleanup run from this page.</p>
        {log.length === 0 ? <p style={{ margin: 0, fontSize: 12.5, color: '#5C2A10' }}>No cleanups yet.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {log.map((r) => (
              <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12.5, background: '#F2E4D0', borderRadius: 10, padding: '8px 12px' }}>
                <span style={{ fontWeight: 800, color: '#1A0A00' }}>{TASK_NAMES[r.task] || r.task}: {r.affected} item{r.affected === 1 ? '' : 's'}</span>
                <span style={{ color: '#5C2A10', fontWeight: 600 }}>{names[r.admin_id] || (r.automatic ? 'Automatic' : 'Admin')} · {when(r.ran_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default DataTab;
