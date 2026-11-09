import React, { useEffect, useState } from 'react';
import { History, Search, Download, RefreshCw, ArrowRight } from 'lucide-react';
import { supabase } from '../supabaseClient';
import PrettySelect from '../ui/PrettySelect';
import NiceDate from '../ui/NiceDate';
import { downloadCsv } from '../csvExport';
import { card, h3, hint, btn, input, when, TABLE_NAMES } from './shared';

// ─────────────────────────────────────────────
// Activity Logs: who added, changed or removed what, when, and (for
// changes) each field's value before and after. Filter by admin, record
// type, action and dates; download as CSV.
// ─────────────────────────────────────────────

const ACTIONS = [['', 'All actions'], ['added', 'Added'], ['changed', 'Changed'], ['removed', 'Removed']];
const ACTION_COLOR = { added: '#1B5E3B', changed: '#1E4672', removed: '#8C2F1C' };
// Plain words for common field names.
const FIELD_NAMES = {
  price: 'Joiner Rate', regular_rate: 'Regular Rate', group_size: 'Slots', start_date: 'Start date', end_date: 'End date', is_archived: 'Archived',
  booking_status: 'Booking status', payment_status: 'Payment status', amount_paid: 'Amount paid', total_price: 'Total price', balance_settled: 'Balance settled',
  slots_booked: 'Slots booked', value: 'Value', role: 'Role', archived_at: 'Archived on', first_name: 'First name', last_name: 'Last name',
};
const fieldName = (k) => FIELD_NAMES[k] || k.replace(/_/g, ' ');
const MONEY = new Set(['price', 'regular_rate', 'amount_paid', 'total_price', 'budget', 'van_rent', 'tour_guide', 'weather_refund', 'sale_price']);
const show = (v, key = '') => {
  if (v == null || v === '') return '(empty)';
  if (MONEY.has(key) && Number.isFinite(Number(v))) return `₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? `${v.length} item${v.length === 1 ? '' : 's'}` : '(none)';
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(', ').slice(0, 160);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return when(s);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

const PAGE = 300;

const ActivityTab = () => {
  const [rows, setRows] = useState(null);
  const [admin, setAdmin] = useState('');
  const [type, setType] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const load = async () => {
    let query = supabase.from('admin_activity').select('*').order('at', { ascending: false }).limit(PAGE);
    if (from) query = query.gte('at', `${from}T00:00:00+08:00`);
    if (to) query = query.lte('at', `${to}T23:59:59+08:00`);
    const { data } = await query;
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reloads when the dates change
  useEffect(() => { load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = rows || [];
  const admins = [...new Set(list.map((r) => r.admin_name || 'An admin'))].sort();
  const types = [...new Set(list.map((r) => r.table_name))].sort();
  const text = q.trim().toLowerCase();
  const shown = list.filter((a) => (!admin || (a.admin_name || 'An admin') === admin)
    && (!type || a.table_name === type) && (!action || a.action === action)
    && (!text || `${a.admin_name} ${TABLE_NAMES[a.table_name] || a.table_name} ${a.summary} ${(a.changed || []).join(' ')} ${JSON.stringify(a.old_values || '')} ${JSON.stringify(a.new_values || '')}`.toLowerCase().includes(text)));

  const download = () => downloadCsv(`activity-logs-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['at', 'When'], ['admin_name', 'Admin'], ['action', 'Action'], [(r) => TABLE_NAMES[r.table_name] || r.table_name, 'Record type'], ['summary', 'Record'],
    [(r) => (r.changed || []).map(fieldName).join(', '), 'Fields changed'],
    [(r) => (r.changed || []).map((k) => `${fieldName(k)}: ${show(r.old_values?.[k], k)}`).join(' | '), 'Before'],
    [(r) => (r.changed || []).map((k) => `${fieldName(k)}: ${show(r.new_values?.[k], k)}`).join(' | '), 'After'],
  ], shown);

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={h3}><History size={16} color="#A8481A" /> Activity logs</h3>
          <p style={hint}>Every change an admin made: tours and prices, bookings and payments, requests, accounts, drivers and settings. Click a change to see the values before and after.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={load} style={btn(false)}><RefreshCw size={14} /> Refresh</button>
          <button type="button" onClick={download} disabled={!shown.length} style={btn(true)}><Download size={14} /> Download</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(190px, 100%), 1fr))', gap: 8, marginBottom: 12 }}>
        <PrettySelect ariaLabel="Admin" value={admin} onChange={setAdmin} options={[{ value: '', label: 'All admins' }, ...admins.map((a) => ({ value: a, label: a }))]} compact />
        <PrettySelect ariaLabel="Record type" value={type} onChange={setType} options={[{ value: '', label: 'All records' }, ...types.map((t) => ({ value: t, label: TABLE_NAMES[t] || t }))]} compact />
        <PrettySelect ariaLabel="Action" value={action} onChange={setAction} options={ACTIONS.map(([value, label]) => ({ value, label }))} compact />
        <NiceDate value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} placeholder="From date" clearable aria-label="From date" />
        <NiceDate value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} placeholder="To date" clearable aria-label="To date" />
        <div style={{ position: 'relative' }}>
          <Search size={15} color="#7A3A18" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search activity" style={{ ...input, paddingLeft: 34, fontSize: 13 }} />
        </div>
      </div>

      {rows === null ? <p style={{ margin: 0, color: '#5C2A10' }}>Loading…</p> : shown.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: '#5C2A10' }}>{list.length ? 'Nothing matches these filters.' : 'No admin changes recorded yet.'}</p>
      ) : (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#5C2A10' }}>
            {shown.length} change{shown.length === 1 ? '' : 's'}{list.length >= PAGE ? ` (latest ${PAGE}; pick dates to see older ones)` : ''}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {shown.map((a) => {
              const hasValues = !!(a.action === 'changed' && a.changed?.length && (a.old_values || a.new_values));
              const isOpen = open === a.id;
              return (
                <li key={a.id} style={{ fontSize: 12.5, background: '#F2E4D0', borderRadius: 10, lineHeight: 1.5 }}>
                  {(() => {
                    const content = (
                      <>
                        <strong>{a.admin_name || 'An admin'}</strong>{' '}
                        <span style={{ color: ACTION_COLOR[a.action] || '#1A0A00', fontWeight: 800 }}>{a.action}</span>{' '}
                        {(TABLE_NAMES[a.table_name] || a.table_name).toLowerCase()} <strong>{a.summary}</strong>
                        {a.changed?.length ? <span style={{ color: '#5C2A10' }}> ({a.changed.slice(0, 6).map(fieldName).join(', ')}{a.changed.length > 6 ? '…' : ''})</span> : null}
                        <span style={{ display: 'block', color: '#5C2A10', fontSize: 11.5, fontWeight: 600 }}>
                          {when(a.at)}{hasValues ? (isOpen ? ' · hide before and after' : ' · see before and after') : ''}
                        </span>
                      </>
                    );
                    const box = { width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '8px 12px', fontFamily: 'inherit', fontSize: 12.5, color: '#1A0A00' };
                    return hasValues
                      ? <button type="button" onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen} style={{ ...box, background: 'none', border: 'none', cursor: 'pointer' }}>{content}</button>
                      : <div style={box}>{content}</div>;
                  })()}
                  {isOpen && hasValues && (
                    <div style={{ padding: '0 12px 10px', display: 'grid', gap: 4 }}>
                      {a.changed.map((k) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#FDF6EE', borderRadius: 8, padding: '6px 10px' }}>
                          <span style={{ fontWeight: 900, color: '#7A3A18', minWidth: 120 }}>{fieldName(k)}</span>
                          <span style={{ color: '#8C2F1C', textDecoration: 'line-through', overflowWrap: 'anywhere' }}>{show(a.old_values?.[k], k)}</span>
                          <ArrowRight size={13} color="#7A3A18" />
                          <span style={{ color: '#1B5E3B', fontWeight: 800, overflowWrap: 'anywhere' }}>{show(a.new_values?.[k], k)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
};

export default ActivityTab;
