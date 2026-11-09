import React, { useCallback, useEffect, useState } from 'react';
import { Wrench, Archive, Clock, BellOff, Bug, UserX, Download, Loader2, CheckCircle2, History, Database, RefreshCw, Search } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { downloadCsv } from './csvExport';

// ─────────────────────────────────────────────
// Admin → System Maintenance: keeps the data clean and up to date.
//  • Health check: what's outdated (past tours still open, expired unpaid
//    checkouts, old notifications and error reports, inactive accounts),
//    with a Clean Up button for each (system_health / run_maintenance).
//  • What runs automatically, and the log of every cleanup.
//  • Backups: bookings, tours, joiners, private tour requests and refunds
//    as Excel/CSV files (instead of the old Google Sheets / Excel records).
//  • Admin activity: who changed what, and when.
// ─────────────────────────────────────────────

const TASKS = [
  { key: 'archive_past_tours', count: 'past_tours_open', icon: Archive, title: 'Past tours still open', what: 'Tours whose dates have passed but are still listed. Clean up moves them to Tour Archive.' },
  { key: 'expire_holds', count: 'expired_holds', icon: Clock, title: 'Expired unpaid checkouts', what: "Bookings whose 15-minute payment window passed without paying. Clean up cancels them and frees their slots." },
  { key: 'old_notifications', count: 'old_notifications', icon: BellOff, title: 'Old read notifications', what: 'Notifications already read and older than 90 days. Clean up deletes them.' },
  { key: 'old_errors', count: 'old_errors', icon: Bug, title: 'Old error reports', what: 'Website error reports older than 30 days. Clean up deletes them.' },
  { key: 'inactive_joiners', count: null, icon: UserX, title: 'Inactive joiners', what: 'Archives joiners who haven\'t logged in for the time set in Admin Settings (they can restore their account).' },
];

const TASK_NAMES = Object.fromEntries(TASKS.map((t) => [t.key, t.title]));

const AUTOMATIC = [
  ['Every day', 'Past tours move to Tour Archive; inactive joiners are archived; old error reports are deleted.'],
  ['Every 15 minutes', 'Unpaid checkouts expire and their slots open again.'],
  ['Every hour', 'Overdue cancellation requests are approved; requests not answered in time are closed; trip emails go out.'],
  ['Every 5 minutes (tour day)', "Departure reminders, and alerts when the van's location goes quiet."],
  ['1st of the month', "Last month's summary is emailed to the main admin."],
];

const TABLE_NAMES = {
  tours: 'Tour', tour_rates: 'Regular Rate', tour_expenses: 'Tour expenses', bookings: 'Booking', exclusive_requests: 'Private tour / request',
  feed_posts: 'Feed post', pickup_spots: 'Pickup spot', fleet_drivers: 'Driver', fleet_vans: 'Van', tour_vehicles: 'Tour driver & van', app_settings: 'Setting',
};

const card = { background: '#FDF6EE', borderRadius: 20, border: '1px solid rgba(180,81,30,0.14)', padding: '1.25rem 1.5rem', boxShadow: '0 4px 20px rgba(26,10,0,0.06)' };
const h3 = { display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px', fontSize: 13, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00' };
const hint = { margin: '0 0 14px', fontSize: 12.5, fontWeight: 600, color: '#5C2A10', lineHeight: 1.5 };
const btn = (main) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 12, cursor: 'pointer', flexShrink: 0,
  fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  background: main ? '#B4511E' : 'transparent', color: main ? '#FDF6EE' : '#5C2A10', border: main ? 'none' : '1px solid rgba(180,81,30,0.3)',
});
const when = (d) => new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const SystemMaintenance = () => {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState('');
  const [log, setLog] = useState([]);
  const [activity, setActivity] = useState([]);
  const [names, setNames] = useState({});
  const [activityQuery, setActivityQuery] = useState('');
  const [exporting, setExporting] = useState('');

  const load = useCallback(async () => {
    const [h, l, a] = await Promise.all([
      supabase.rpc('system_health'),
      supabase.from('maintenance_log').select('*').order('ran_at', { ascending: false }).limit(20),
      supabase.from('admin_activity').select('*').order('at', { ascending: false }).limit(200),
    ]);
    if (h.error) { setError(h.error.message); setHealth({}); } else { setError(''); setHealth(h.data || {}); }
    setLog(l.data || []);
    setActivity(a.data || []);
    const ids = [...new Set((l.data || []).map((r) => r.admin_id).filter(Boolean))];
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
      setNames(Object.fromEntries((data || []).map((p) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Admin'])));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

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

  // ── Backups (Excel / CSV) ──
  const exportData = async (kind) => {
    setExporting(kind);
    try {
      const day = new Date().toISOString().slice(0, 10);
      if (kind === 'bookings') {
        const { data, error: err } = await supabase.from('bookings').select('*, tours ( title, start_date, end_date )').order('created_at', { ascending: false });
        if (err) throw err;
        downloadCsv(`bookings-${day}.csv`, [
          ['booking_number', 'Booking no.'], ['full_name', 'Joiner'], ['contact_number', 'Contact'], ['email', 'Email'],
          [(r) => r.tours?.title, 'Tour'], [(r) => r.tours?.start_date, 'Start'], [(r) => r.tours?.end_date, 'End'],
          ['slots_booked', 'Slots'], ['total_price', 'Total (PHP)'], ['amount_paid', 'Paid (PHP)'], ['payment_method', 'Payment method'],
          ['payment_status', 'Payment status'], ['booking_status', 'Booking status'], [(r) => (r.balance_settled ? 'Yes' : 'No'), 'Balance settled'],
          ['pickup_point', 'Pickup point'], ['created_at', 'Booked at'],
        ], data || []);
      } else if (kind === 'tours') {
        const { data, error: err } = await supabase.from('tours').select('*').order('start_date', { ascending: false });
        if (err) throw err;
        downloadCsv(`tours-${day}.csv`, [
          ['title', 'Tour'], ['destination', 'Destination'], ['start_date', 'Start'], ['end_date', 'End'], ['price', 'Joiner Rate (PHP)'],
          ['group_size', 'Slots'], ['difficulty', 'Difficulty'], [(r) => (r.is_exclusive ? 'Private' : 'Joiner'), 'Type'], [(r) => (r.is_archived ? 'Archived' : 'Open'), 'Status'],
        ], data || []);
      } else if (kind === 'joiners') {
        const { data, error: err } = await supabase.from('profiles').select('*').not('role', 'in', '(admin,archived_admin)').order('created_at', { ascending: false });
        if (err) throw err;
        downloadCsv(`joiners-${day}.csv`, [
          ['first_name', 'First name'], ['last_name', 'Last name'], ['username', 'Username'], ['email', 'Email'], ['phone_number', 'Phone'],
          ['address', 'Address'], ['emergency_contact_name', 'Emergency contact'], ['emergency_contact_number', 'Emergency number'],
          ['created_at', 'Registered'], [(r) => (r.archived_at ? `Archived (${r.archive_reason || ''})` : 'Active'), 'Status'],
        ], data || []);
      } else if (kind === 'private') {
        const { data, error: err } = await supabase.from('exclusive_requests').select('*').order('created_at', { ascending: false });
        if (err) throw err;
        downloadCsv(`private-tours-and-requests-${day}.csv`, [
          [(r) => (r.request_type === 'request' ? 'Requested tour' : 'Private tour'), 'Type'], ['full_name', 'Name'], ['contact', 'Contact'], ['email', 'Email'],
          ['destination', 'Destination'], ['preferred_date', 'From'], ['preferred_end_date', 'To'], ['group_size', 'People'], ['budget', 'Budget (PHP)'],
          ['status', 'Status'], ['payment_status', 'Payment'], ['amount_paid', 'Paid (PHP)'], ['created_at', 'Sent at'],
        ], data || []);
      } else if (kind === 'refunds') {
        const { data, error: err } = await supabase.from('bookings').select('booking_number, full_name, weather_refund, weather_refund_status, weather_refund_ref, weather_refund_at, weather_refund_received, tours ( title )').not('weather_refund_status', 'is', null).order('weather_refund_at', { ascending: false });
        if (err) throw err;
        downloadCsv(`refunds-${day}.csv`, [
          ['booking_number', 'Booking no.'], ['full_name', 'Joiner'], [(r) => r.tours?.title, 'Tour'], ['weather_refund', 'Refund (PHP)'],
          ['weather_refund_status', 'Status'], ['weather_refund_ref', 'GCash reference'], ['weather_refund_at', 'Sent at'], ['weather_refund_received', 'Joiner confirmed'],
        ], data || []);
      }
      toast.success('Download ready', 'Open it in Excel or Google Sheets.');
    } catch (err) {
      toast.error("Couldn't make the file", err.message);
    } finally {
      setExporting('');
    }
  };

  const q = activityQuery.trim().toLowerCase();
  const shownActivity = activity.filter((a) => !q || `${a.admin_name} ${TABLE_NAMES[a.table_name] || a.table_name} ${a.summary} ${(a.changed || []).join(' ')} ${a.action}`.toLowerCase().includes(q)).slice(0, 60);
  const needCleaning = TASKS.reduce((n, t) => n + (t.count ? Number(health?.[t.count]) || 0 : 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* Summary */}
      <section style={{ ...card, background: '#1A0A00', border: 'none', color: '#FDF6EE', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Wrench size={28} color="#E8A265" />
        <div style={{ flex: '1 1 260px' }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E8A265' }}>System health</p>
          <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 900 }}>
            {health === null ? 'Checking…' : needCleaning ? `${needCleaning} outdated item${needCleaning === 1 ? '' : 's'} to clean up` : 'Everything is up to date'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600, color: '#F2E4D0' }}>
            {health && !error ? `${health.tours} open tours · ${health.bookings} bookings · ${health.joiners} joiners${health.last_run ? ` · last cleanup ${when(health.last_run)}` : ''}` : ''}
          </p>
        </div>
        <button type="button" onClick={load} style={{ ...btn(false), color: '#FDF6EE', borderColor: 'rgba(253,246,238,0.4)' }}><RefreshCw size={14} /> Check Again</button>
        <button type="button" onClick={runAll} disabled={!!running || !!error} style={{ ...btn(true), background: '#E8A265', color: '#1A0A00' }}>
          {running === 'all' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Wrench size={14} />} Run All Cleanups
        </button>
      </section>

      {error && <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#8C2F1C' }}>Couldn't check the system ({error}). Run the latest database update (install_updates.sql).</p>}

      {/* Health check + cleanup */}
      <section style={card}>
        <h3 style={h3}><Database size={16} color="#A8481A" /> Health check</h3>
        <p style={hint}>Outdated data that can cause confusion. Most of it is cleaned up automatically; you can also clean it up now.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TASKS.map((t) => {
            const n = t.count ? Number(health?.[t.count]) || 0 : null;
            const Icon = t.icon;
            return (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: n ? 'rgba(232,162,101,0.14)' : '#F2E4D0', borderRadius: 14, padding: '12px 14px' }}>
                <Icon size={18} color={n ? '#B4511E' : '#5C2A10'} style={{ flexShrink: 0 }} />
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>
                    {t.title}{n != null && <span style={{ marginLeft: 8, color: n ? '#8C2F1C' : '#1B5E3B' }}>{n ? n : '✓ none'}</span>}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>{t.what}</p>
                </div>
                <button type="button" onClick={() => run(t)} disabled={!!running || (n === 0)} style={btn(!!n || n == null)}>
                  {running === t.key ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Wrench size={14} />} Clean Up
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

      {/* Backups */}
      <section style={card}>
        <h3 style={h3}><Download size={16} color="#A8481A" /> Backups (Excel / CSV)</h3>
        <p style={hint}>Download the records any time. The files open in Excel or Google Sheets, so the old spreadsheets are no longer needed for daily work.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['bookings', 'Bookings'], ['tours', 'Tours & schedules'], ['joiners', 'Joiners (customers)'], ['private', 'Private tours & requests'], ['refunds', 'Refunds']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => exportData(k)} disabled={!!exporting} style={btn(false)}>
              {exporting === k ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />} {l}
            </button>
          ))}
        </div>
      </section>

      {/* Automatic */}
      <section style={card}>
        <h3 style={h3}><Clock size={16} color="#A8481A" /> Runs automatically</h3>
        <p style={hint}>The database does these by itself, so the data stays up to date even when no one is cleaning.</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {AUTOMATIC.map(([w, t]) => (
            <li key={w} style={{ display: 'flex', gap: 10, fontSize: 12.5, color: '#1A0A00' }}>
              <CheckCircle2 size={15} color="#2E9B5F" style={{ flexShrink: 0, marginTop: 2 }} />
              <span><strong>{w}:</strong> {t}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Maintenance log */}
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

      {/* Admin activity */}
      <section style={card}>
        <h3 style={h3}><History size={16} color="#A8481A" /> Admin activity</h3>
        <p style={hint}>Who added, changed or removed what (tours, prices, bookings, payments, requests, drivers, settings), and when.</p>
        <div style={{ position: 'relative', maxWidth: 360, marginBottom: 12 }}>
          <Search size={15} color="#7A3A18" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={activityQuery} onChange={(e) => setActivityQuery(e.target.value)} placeholder="Search by admin, tour, booking…" aria-label="Search admin activity"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 34px', borderRadius: 12, border: '1px solid rgba(180,81,30,0.25)', background: '#FFFDF9', fontFamily: 'inherit', fontSize: 13, color: '#1A0A00' }} />
        </div>
        {shownActivity.length === 0 ? <p style={{ margin: 0, fontSize: 12.5, color: '#5C2A10' }}>{activity.length ? 'Nothing matches your search.' : 'No admin changes recorded yet.'}</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {shownActivity.map((a) => (
              <li key={a.id} style={{ fontSize: 12.5, background: '#F2E4D0', borderRadius: 10, padding: '8px 12px', lineHeight: 1.5 }}>
                <strong style={{ color: '#1A0A00' }}>{a.admin_name || 'An admin'}</strong>{' '}
                <span style={{ color: a.action === 'removed' ? '#8C2F1C' : a.action === 'added' ? '#1B5E3B' : '#1E4672', fontWeight: 800 }}>{a.action}</span>{' '}
                {(TABLE_NAMES[a.table_name] || a.table_name).toLowerCase()} <strong style={{ color: '#1A0A00' }}>{a.summary}</strong>
                {a.changed?.length ? <span style={{ color: '#5C2A10' }}> ({a.changed.slice(0, 6).join(', ').replace(/_/g, ' ')}{a.changed.length > 6 ? '…' : ''})</span> : null}
                <span style={{ display: 'block', color: '#5C2A10', fontSize: 11.5, fontWeight: 600 }}>{when(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default SystemMaintenance;
