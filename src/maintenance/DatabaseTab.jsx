import React, { useEffect, useState } from 'react';
import { ShieldCheck, Download, Loader2, History, RefreshCw, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from '../ui/toast';
import { downloadCsv } from '../csvExport';
import { card, h3, hint, row, btn, when, spin } from './shared';

// ─────────────────────────────────────────────
// Database Management: checks for incomplete or inconsistent records
// (data_integrity), Excel/CSV backups of each kind of record, and the
// list of backups downloaded (backup_log).
// ─────────────────────────────────────────────

// Each check: what it means, and where to fix it.
const CHECKS = {
  overbooked: { title: 'Tours with more joiners than slots', fix: 'Raise the slots or move a booking to another date.', page: 'Tour Management' },
  booking_without_tour: { title: 'Bookings whose tour no longer exists', fix: 'Check the booking and cancel or move it.', page: 'Booking Management' },
  overpaid: { title: 'Bookings paid more than their total', fix: 'Check the payment, then fix the amount or refund the extra.', page: 'Booking Management' },
  open_tour_missing_details: { title: 'Open tours missing details', fix: 'Add the missing price, slots, photo or pickup points.', page: 'Tour Management' },
  bad_dates: { title: 'Tours that end before they start', fix: 'Fix the dates in the tour form.', page: 'Tour Management' },
  past_tour_open: { title: 'Tours that ended but are still open', fix: 'Data Maintenance → Clean Up moves them to Tour Archive.', page: null },
  joiner_missing_contact: { title: 'Joiners without a name or phone number', fix: 'They are asked to finish their profile when they log in.', page: 'Joiner Accounts' },
};

const BACKUPS = [['bookings', 'Bookings'], ['tours', 'Tours & schedules'], ['joiners', 'Joiners (customers)'], ['private', 'Private tours & requests'], ['refunds', 'Refunds'], ['activity', 'Activity logs']];

const DatabaseTab = ({ onNavigate, onTab }) => {
  const [checks, setChecks] = useState(null);
  const [checkError, setCheckError] = useState('');
  const [counts, setCounts] = useState(null);
  const [backups, setBackups] = useState([]);
  const [exporting, setExporting] = useState('');

  const load = async () => {
    const [c, o, b] = await Promise.all([
      supabase.rpc('data_integrity'),
      supabase.rpc('system_overview'),
      supabase.from('backup_log').select('*').order('at', { ascending: false }).limit(15),
    ]);
    if (c.error) { setCheckError(c.error.message); setChecks([]); } else { setCheckError(''); setChecks(c.data?.checks || []); }
    setCounts(o.data || null);
    setBackups(b.data || []);
  };
  // (Runs the checks when the tab opens.)
  useEffect(() => { load(); }, []);

  const logBackup = async (what, rows) => {
    const { data: me } = await supabase.auth.getUser();
    const { data: p } = me?.user ? await supabase.from('profiles').select('first_name, last_name').eq('id', me.user.id).maybeSingle() : { data: null };
    await supabase.from('backup_log').insert([{ what, rows, admin_name: `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || null }]);
  };

  const exportData = async (kind, label) => {
    setExporting(kind);
    try {
      const day = new Date().toISOString().slice(0, 10);
      let rows = [];
      if (kind === 'bookings') {
        const { data, error } = await supabase.from('bookings').select('*, tours ( title, start_date, end_date )').order('created_at', { ascending: false });
        if (error) throw error;
        rows = data || [];
        downloadCsv(`bookings-${day}.csv`, [
          ['booking_number', 'Booking no.'], ['full_name', 'Joiner'], ['contact_number', 'Contact'], ['email', 'Email'],
          [(r) => r.tours?.title, 'Tour'], [(r) => r.tours?.start_date, 'Start'], [(r) => r.tours?.end_date, 'End'],
          ['slots_booked', 'Slots'], ['total_price', 'Total (PHP)'], ['amount_paid', 'Paid (PHP)'], ['payment_method', 'Payment method'],
          ['payment_status', 'Payment status'], ['booking_status', 'Booking status'], [(r) => (r.balance_settled ? 'Yes' : 'No'), 'Balance settled'],
          ['pickup_point', 'Pickup point'], ['created_at', 'Booked at'],
        ], rows);
      } else if (kind === 'tours') {
        const { data, error } = await supabase.from('tours').select('*').order('start_date', { ascending: false });
        if (error) throw error;
        rows = data || [];
        downloadCsv(`tours-${day}.csv`, [
          ['title', 'Tour'], ['destination', 'Destination'], ['start_date', 'Start'], ['end_date', 'End'], ['price', 'Joiner Rate (PHP)'],
          ['group_size', 'Slots'], ['difficulty', 'Difficulty'], [(r) => (r.is_exclusive ? 'Private' : 'Joiner'), 'Type'], [(r) => (r.is_archived ? 'Archived' : 'Open'), 'Status'],
        ], rows);
      } else if (kind === 'joiners') {
        const { data, error } = await supabase.from('profiles').select('*').not('role', 'in', '(admin,archived_admin)').order('created_at', { ascending: false });
        if (error) throw error;
        rows = data || [];
        downloadCsv(`joiners-${day}.csv`, [
          ['first_name', 'First name'], ['last_name', 'Last name'], ['username', 'Username'], ['email', 'Email'], ['phone_number', 'Phone'],
          ['address', 'Address'], ['emergency_contact_name', 'Emergency contact'], ['emergency_contact_number', 'Emergency number'],
          ['created_at', 'Registered'], [(r) => (r.archived_at ? `Archived (${r.archive_reason || ''})` : 'Active'), 'Status'],
        ], rows);
      } else if (kind === 'private') {
        const { data, error } = await supabase.from('exclusive_requests').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        rows = data || [];
        downloadCsv(`private-tours-and-requests-${day}.csv`, [
          [(r) => (r.request_type === 'request' ? 'Requested tour' : 'Private tour'), 'Type'], ['full_name', 'Name'], ['contact', 'Contact'], ['email', 'Email'],
          ['destination', 'Destination'], ['preferred_date', 'From'], ['preferred_end_date', 'To'], ['group_size', 'People'], ['budget', 'Budget (PHP)'],
          ['status', 'Status'], ['payment_status', 'Payment'], ['amount_paid', 'Paid (PHP)'], ['created_at', 'Sent at'],
        ], rows);
      } else if (kind === 'refunds') {
        const { data, error } = await supabase.from('bookings').select('booking_number, full_name, weather_refund, weather_refund_status, weather_refund_ref, weather_refund_at, weather_refund_received, tours ( title )').not('weather_refund_status', 'is', null).order('weather_refund_at', { ascending: false });
        if (error) throw error;
        rows = data || [];
        downloadCsv(`refunds-${day}.csv`, [
          ['booking_number', 'Booking no.'], ['full_name', 'Joiner'], [(r) => r.tours?.title, 'Tour'], ['weather_refund', 'Refund (PHP)'],
          ['weather_refund_status', 'Status'], ['weather_refund_ref', 'GCash reference'], ['weather_refund_at', 'Sent at'], ['weather_refund_received', 'Joiner confirmed'],
        ], rows);
      } else if (kind === 'activity') {
        const { data, error } = await supabase.from('admin_activity').select('*').order('at', { ascending: false }).limit(5000);
        if (error) throw error;
        rows = data || [];
        downloadCsv(`activity-logs-${day}.csv`, [
          ['at', 'When'], ['admin_name', 'Admin'], ['action', 'Action'], ['table_name', 'Record type'], ['summary', 'Record'],
          ['changed', 'Fields changed'], ['old_values', 'Before'], ['new_values', 'After'],
        ], rows);
      }
      await logBackup(label, rows.length);
      toast.success('Backup downloaded', `${rows.length} record${rows.length === 1 ? '' : 's'}. Open it in Excel or Google Sheets.`);
      load();
    } catch (err) {
      toast.error("Couldn't make the backup", err.message);
    } finally {
      setExporting('');
    }
  };

  const problems = (checks || []).reduce((n, c) => n + (Number(c.count) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}><ShieldCheck size={16} color="#A8481A" /> Data check</h3>
            <p style={hint}>Looks for incomplete or inconsistent records. Click a record to open it and fix it.</p>
          </div>
          <button type="button" onClick={load} style={btn(false)}><RefreshCw size={14} /> Check Again</button>
        </div>
        {checkError && <p role="alert" style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#8C2F1C' }}>Couldn't run the check ({checkError}). Run the latest database update (install_updates.sql).</p>}
        {checks === null ? <p style={{ margin: 0, color: '#5C2A10' }}>Checking…</p> : (
          <>
            <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 900, color: problems ? '#8C2F1C' : '#1B5E3B', display: 'flex', alignItems: 'center', gap: 6 }}>
              {problems ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {problems ? `${problems} record${problems === 1 ? '' : 's'} to look at` : 'No problems found'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checks.map((c) => {
                const info = CHECKS[c.key] || { title: c.key };
                const n = Number(c.count) || 0;
                return (
                  <div key={c.key} style={{ ...row, alignItems: 'flex-start', background: n ? 'rgba(232,162,101,0.14)' : '#F2E4D0' }}>
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>
                        {info.title} <span style={{ marginLeft: 6, color: c.count == null ? '#7A4410' : n ? '#8C2F1C' : '#1B5E3B' }}>{c.count == null ? "couldn't check" : n ? n : '✓ none'}</span>
                      </p>
                      {n > 0 && <p style={{ margin: '2px 0 6px', fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>{info.fix}</p>}
                      {n > 0 && (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                          {(c.items || []).map((it) => (
                            <li key={it.id}>
                              {info.page ? (
                                <button type="button" onClick={() => onNavigate(info.page, it.id)} className="text-link"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>
                                  {it.label} <ChevronRight size={13} />
                                </button>
                              ) : <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1A0A00' }}>{it.label}</span>}
                            </li>
                          ))}
                          {n > (c.items || []).length && <li style={{ fontSize: 12, color: '#5C2A10' }}>and {n - c.items.length} more</li>}
                        </ul>
                      )}
                    </div>
                    {n > 0 && !info.page && <button type="button" onClick={() => onTab('data')} style={btn(true)}>Data Maintenance</button>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section style={card}>
        <h3 style={h3}><Download size={16} color="#A8481A" /> Backups (Excel / CSV)</h3>
        <p style={hint}>
          Download a copy of the records. The files open in Excel or Google Sheets.
          {counts ? ` Stored now: ${counts.bookings ?? '—'} bookings, ${(Number(counts.active_tours) || 0) + (Number(counts.archived_tours) || 0)} tours, ${(Number(counts.joiners) || 0) + (Number(counts.archived_joiners) || 0)} joiner accounts.` : ''}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {BACKUPS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => exportData(k, l)} disabled={!!exporting} style={btn(false)}>
              {exporting === k ? <Loader2 size={14} style={spin} /> : <Download size={14} />} {l}
            </button>
          ))}
        </div>
      </section>

      <section style={card}>
        <h3 style={h3}><History size={16} color="#A8481A" /> Backup history</h3>
        <p style={hint}>Every backup downloaded from this page: what, how many records, who and when.</p>
        {backups.length === 0 ? <p style={{ margin: 0, fontSize: 12.5, color: '#5C2A10' }}>No backups downloaded yet.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {backups.map((b) => (
              <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12.5, background: '#F2E4D0', borderRadius: 10, padding: '8px 12px' }}>
                <span style={{ fontWeight: 800, color: '#1A0A00' }}>{b.what}: {b.rows} record{b.rows === 1 ? '' : 's'}</span>
                <span style={{ color: '#5C2A10', fontWeight: 600 }}>{b.admin_name || 'Admin'} · {when(b.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default DatabaseTab;
