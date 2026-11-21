import React, { useEffect, useMemo, useState } from 'react';
import { Scale, Loader2, Lock, Save, RotateCcw, Search, AlertTriangle, History, Undo2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import StatusFilter from '../ui/StatusFilter';
import { useAdminMe } from '../adminMe';
import { DEFAULT_RULES, applyBookingRules, loadBookingRules } from '../bookingRules';
import { card, h3, hint, btn, input, row, when, spin } from './shared';
import { FIELDS, FIELD, PAIRS, shown, fieldError } from './ruleFields';

// ─────────────────────────────────────────────
// System Maintenance → Booking Rules
// The business rules the whole website follows, in one place (the
// booking_rules table). All admins can look; only the main admin can change
// them (the database refuses anyone else). (Van Rent, Tour Guide and Bag Tag
// limits stay in the database but aren't on this page: suppliers set those costs.) A change applies to new bookings
// only: every booking keeps the cancellation cutoff, downpayment and weather
// refund it was made under. Every change goes to the activity log.
// ─────────────────────────────────────────────

const FILTERS = ['All', 'Changed', 'Not default'];
const PAGE = 12;

// initialQuery: opened from the System Maintenance search (shows that rule).
const BookingRulesTab = ({ initialQuery = '' }) => {
  const me = useAdminMe();
  const canEdit = me.isMain;
  const [saved, setSaved] = useState(null); // the row in the database
  const [form, setForm] = useState({});
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [leftovers, setLeftovers] = useState([]);
  const [history, setHistory] = useState([]);

  const load = async () => {
    const [r, c, h] = await Promise.all([
      supabase.from('booking_rules').select('*').eq('id', 1).maybeSingle(),
      supabase.rpc('booking_rules_check'),
      supabase.from('admin_activity').select('id, at, admin_name, old_values, new_values').eq('table_name', 'booking_rules')
        .order('at', { ascending: false }).limit(5),
    ]);
    if (r.error || !r.data) {
      setProblem(r.error?.message || 'not found');
      return;
    }
    setProblem('');
    setSaved(r.data);
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String(r.data[f.key] ?? DEFAULT_RULES[f.key])])));
    setLeftovers(Array.isArray(c.data) ? c.data : []);
    setHistory(h.data || []);
  };
  useEffect(() => { load(); }, []);

  const errors = useMemo(() => {
    const out = {};
    for (const f of FIELDS) {
      const e = fieldError(f, form[f.key]);
      if (e) out[f.key] = e;
    }
    for (const [lo, hi, msg] of PAIRS) {
      if (!out[lo] && !out[hi] && Number(form[lo]) > Number(form[hi])) out[lo] = msg;
    }
    return out;
  }, [form]);

  const changed = useMemo(() => (saved
    ? FIELDS.filter((f) => String(form[f.key] ?? '').trim() !== '' && Number(form[f.key]) !== Number(saved[f.key]))
    : []), [form, saved]);
  const changedKeys = new Set(changed.map((f) => f.key));
  const notDefault = (f) => saved && Number(saved[f.key]) !== Number(DEFAULT_RULES[f.key]);

  const q = query.trim().toLowerCase();
  const list = FIELDS.filter((f) => (!q || `${f.label} ${f.help} ${f.group}`.toLowerCase().includes(q))
    && (filter === 'All' || (filter === 'Changed' ? changedKeys.has(f.key) || errors[f.key] : notDefault(f))));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const current = Math.min(page, pages);
  const visible = list.slice((current - 1) * PAGE, current * PAGE);
  const countFor = (st) => (st === 'All' ? FIELDS.length : st === 'Changed' ? changed.length : FIELDS.filter(notDefault).length);

  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));

  const save = async () => {
    if (!canEdit || saving || !changed.length) return;
    const bad = Object.keys(errors);
    if (bad.length) {
      toast.error('Please fix the highlighted rules', `${FIELD[bad[0]].label}: ${errors[bad[0]]}`);
      setFilter('Changed');
      return;
    }
    const lines = changed.map((f) => `• ${f.label}: ${shown(f, saved[f.key])} → ${shown(f, Number(form[f.key]))}`).join('\n');
    if (!(await confirmDialog({
      title: `Save ${changed.length} rule change${changed.length === 1 ? '' : 's'}?`,
      message: `${lines}\n\nThese apply to new bookings and requests from now on. Bookings already made keep the rules they were made under.`,
      confirmLabel: 'Save Rules', cancelLabel: 'Keep Editing',
    }))) return;
    setSaving(true);
    try {
      const patch = Object.fromEntries(changed.map((f) => [f.key, Number(form[f.key])]));
      const { data, error } = await supabase.from('booking_rules').update(patch).eq('id', 1).select('*');
      if (error) throw error;
      if (!data?.length) throw new Error('Only the main admin can change the booking rules.');
      applyBookingRules(data[0]);
      await loadBookingRules().catch(() => null); // saves the new copy for the next visit
      toast.success('Booking rules saved', 'New bookings and requests follow them from now on.');
      await load();
    } catch (err) {
      reportError("Couldn't save the booking rules", err);
    } finally {
      setSaving(false);
    }
  };

  // Puts back the values from before the latest change (it's saved as a new
  // change, so it shows in the history and Audit Trail too).
  const undoLast = async () => {
    const last = history[0];
    const keys = Object.keys(last?.old_values || {}).filter((k) => FIELD[k]);
    if (!canEdit || saving || !keys.length) return;
    if (changed.length) { toast.info('Save or undo your edits first', 'Then you can undo the last saved change.'); return; }
    const lines = keys.map((k) => `• ${FIELD[k].label}: ${shown(FIELD[k], saved[k])} → ${shown(FIELD[k], last.old_values[k])}`).join('\n');
    if (!(await confirmDialog({
      title: 'Undo the last rule change?',
      message: `${lines}\n\nMade by ${last.admin_name || 'the main admin'} on ${when(last.at)}. New bookings and requests follow the old values again.`,
      confirmLabel: 'Undo Change', cancelLabel: 'Keep It',
    }))) return;
    setSaving(true);
    try {
      const patch = Object.fromEntries(keys.map((k) => [k, Number(last.old_values[k])]));
      const { data, error } = await supabase.from('booking_rules').update(patch).eq('id', 1).select('*');
      if (error) throw error;
      if (!data?.length) throw new Error('Only the main admin can change the booking rules.');
      applyBookingRules(data[0]);
      await loadBookingRules().catch(() => null);
      toast.success('Change undone', 'The rules are back to what they were before.');
      await load();
    } catch (err) {
      reportError("Couldn't undo the change", err);
    } finally {
      setSaving(false);
    }
  };

  const fillDefaults = () => {
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String(DEFAULT_RULES[f.key])])));
    setFilter('Changed');
    setPage(1);
    toast.info('Original values filled in', 'Review them, then click Save Rules.');
  };

  if (problem) {
    return (
      <div style={card}>
        <h3 style={h3}><AlertTriangle size={16} color="var(--ib-red, #8C2F1C)" /> Booking Rules aren't installed yet</h3>
        <p style={{ ...hint, margin: 0 }}>
          Run the database update <strong>20261222000000_booking_rules.sql</strong> (it's in supabase/updates/install_updates.sql) in the
          Supabase SQL Editor, then open this tab again. Until then the website keeps using its usual values. ({problem})
        </p>
      </div>
    );
  }
  if (!saved) {
    return <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ib-brown, #5C2A10)', fontWeight: 700, fontSize: 13 }}><Loader2 size={16} style={spin} /> Loading the booking rules…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <h3 style={h3}><Scale size={16} color="var(--ib-accent, #B4511E)" /> Booking Rules</h3>
        <p style={hint}>
          The rules the whole website follows: the booking pages, the database and the payment and email functions all read them from here.
          A change applies to <strong>new bookings and requests only</strong>; bookings already made keep the rules they were made under.
          Last changed {when(saved.updated_at)}.
        </p>
        {!canEdit && (
          <p style={{ ...row, margin: '0 0 14px', fontSize: 12.5, fontWeight: 700, color: 'var(--ib-brown, #5C2A10)' }}>
            <Lock size={15} style={{ flexShrink: 0 }} /> Only the main admin can change the booking rules. You can look at them here.
          </p>
        )}
        {leftovers.length > 0 && (
          <p style={{ ...row, margin: '0 0 14px', background: 'var(--ib-surface-2, #FBEDE6)', fontSize: 12.5, fontWeight: 700, color: 'var(--ib-red, #8C2F1C)' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            These database functions still use their old fixed values: {leftovers.join(', ')}. Run the 20261222 update again to switch them over.
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <label style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ib-rust, #7A3A18)' }} />
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search rules (e.g. refund, van, cancel)"
              aria-label="Search rules" style={{ ...input, paddingLeft: 34 }} />
          </label>
        </div>
        <StatusFilter statuses={FILTERS} value={filter} onChange={(v) => { setFilter(v); setPage(1); }} count={countFor} style={{ marginBottom: 14 }} />

        {visible.length === 0 ? (
          <p style={{ ...hint, margin: 0 }}>{filter === 'Changed' ? 'No unsaved changes.' : 'No rules match your search.'}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 10 }}>
            {visible.map((f, i) => {
              const err = errors[f.key];
              const isChanged = changedKeys.has(f.key);
              const groupStart = i === 0 || visible[i - 1].group !== f.group;
              return (
                <React.Fragment key={f.key}>
                  {groupStart && (
                    <p style={{ gridColumn: '1 / -1', margin: i ? '8px 0 0' : 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ib-sienna, #A8481A)' }}>{f.group}</p>
                  )}
                  <div style={{
                    background: 'var(--ib-parch, #F2E4D0)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
                    border: `1.5px solid ${err ? 'var(--ib-red, #8C2F1C)' : isChanged ? 'var(--ib-accent, #B4511E)' : 'transparent'}`,
                  }}>
                    <label htmlFor={`rule-${f.key}`} style={{ fontSize: 13, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{f.label}</label>
                    {f.help && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)', lineHeight: 1.45 }}>{f.help}</span>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {f.unit === '₱' && <span style={{ fontWeight: 900, color: 'var(--ib-brown, #5C2A10)' }}>₱</span>}
                      <input id={`rule-${f.key}`} name={f.key} type="text" inputMode={f.whole ? 'numeric' : 'decimal'} value={form[f.key] ?? ''}
                        disabled={!canEdit} onChange={(e) => set(f.key, e.target.value.replace(/[^\d.]/g, ''))}
                        aria-invalid={!!err} aria-describedby={err ? `rule-${f.key}-err` : undefined}
                        style={{ ...input, flex: 1, minWidth: 0, background: canEdit ? 'var(--ib-surface, #FFFDF9)' : 'var(--ib-surface-2, #EFE3D3)', cursor: canEdit ? 'text' : 'not-allowed' }} />
                      {f.unit !== '₱' && <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ib-brown, #5C2A10)', whiteSpace: 'nowrap' }}>{f.unit}</span>}
                    </div>
                    {err && <span id={`rule-${f.key}-err`} role="alert" style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ib-red, #8C2F1C)' }}>{err}</span>}
                    {!err && isChanged && <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ib-accent, #B4511E)' }}>Was {shown(f, saved[f.key])} · not saved yet</span>}
                    {!err && !isChanged && notDefault(f) && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ib-rust, #7A3A18)' }}>Original value: {shown(f, DEFAULT_RULES[f.key])}</span>}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14 }}>
            <button type="button" style={btn(false)} disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</button>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ib-brown, #5C2A10)' }}>Page {current} of {pages}</span>
            <button type="button" style={btn(false)} disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</button>
          </div>
        )}

        {canEdit && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" style={btn(false)} onClick={fillDefaults} disabled={saving}><RotateCcw size={14} /> Original Values</button>
            {changed.length > 0 && (
              <button type="button" style={btn(false)} onClick={() => setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String(saved[f.key])])))} disabled={saving}>Undo Changes</button>
            )}
            <button type="button" style={{ ...btn(true), opacity: changed.length ? 1 : 0.55, cursor: changed.length ? 'pointer' : 'not-allowed' }} onClick={save} disabled={saving || !changed.length}>
              {saving ? <Loader2 size={14} style={spin} /> : <Save size={14} />} Save Rules{changed.length ? ` (${changed.length})` : ''}
            </button>
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={h3}><History size={16} color="var(--ib-accent, #B4511E)" /> Recent rule changes</h3>
        {history.length === 0 ? (
          <p style={{ ...hint, margin: 0 }}>No changes yet. Every change is saved in Audit Trail with who made it and the old and new values.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h, i) => (
              <div key={h.id} style={{ ...row, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{h.admin_name || 'Main admin'} · {when(h.at)}</span>
                  {i === 0 && canEdit && Object.keys(h.old_values || {}).some((k) => FIELD[k]) && (
                    <button type="button" style={{ ...btn(false), height: 32, marginLeft: 'auto' }} onClick={undoLast} disabled={saving}><Undo2 size={13} /> Undo This Change</button>
                  )}
                </span>
                {Object.keys(h.new_values || {}).filter((k) => FIELD[k]).map((k) => (
                  <span key={k} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)' }}>
                    {FIELD[k].label}: {shown(FIELD[k], h.old_values?.[k])} → {shown(FIELD[k], h.new_values[k])}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BookingRulesTab;
