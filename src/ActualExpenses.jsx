import { useEffect, useState } from 'react';
import { X, Loader2, Plus, Trash2, Camera, Lock, Unlock, CheckCircle2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast, reportError } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import PrettySelect from './ui/PrettySelect';
import { useAdminMe } from './adminMe';
import { shrinkImage } from './imageCompress';
import { formatPeso } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { EXPENSE_CATEGORIES, CATEGORY_LABEL, newLineKey } from './tourExpenses';

// ─────────────────────────────────────────────
// ACTUAL EXPENSES (Tour Management, a tour date that has ended)
// Each expense line's estimate next to what was really paid. Per-person
// lines start at rate × the joiners who checked in (QR check-in). Optional
// receipt photo and note per line; unplanned costs can be added. "Mark
// expenses as final" locks them; then only the main admin can change them.
// ─────────────────────────────────────────────

const BUCKET = 'expense-receipts';
const box = {
  width: '100%', boxSizing: 'border-box', background: '#FFFDF9', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 10,
  padding: '8px 10px', fontSize: 14, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
};
const btn = (main, disabled = false) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38, padding: '0 14px', borderRadius: 12,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'inherit', fontWeight: 900, fontSize: 11,
  letterSpacing: '0.08em', textTransform: 'uppercase', background: main ? '#B4511E' : 'transparent', color: main ? '#FDF6EE' : '#5C2A10',
  border: main ? 'none' : '1px solid rgba(180,81,30,0.3)',
});
const money = (v) => String(v ?? '').replace(/[^\d.]/g, '').replace(/^(\d*\.\d{0,2}).*$/, '$1');
const num = (v) => (String(v ?? '').trim() === '' ? null : Number(v));

const ReceiptLink = ({ path }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    if (path) supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => { if (alive) setUrl(data?.signedUrl || ''); });
    return () => { alive = false; };
  }, [path]);
  if (!path) return null;
  return url
    ? <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: '#A8481A' }}><ImageIcon size={13} /> View receipt</a>
    : <span style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18' }}>Receipt saved</span>;
};

const ActualExpenses = ({ tour, onClose, onSaved }) => {
  const me = useAdminMe();
  const [rows, setRows] = useState(null);
  const [suppliers, setSuppliers] = useState({});
  const [checkedIn, setCheckedIn] = useState(0);
  const [finalAt, setFinalAt] = useState(tour.expenses_final_at || null);
  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);
  const locked = !!finalAt && !me.isMain;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [l, b, t] = await Promise.all([
        supabase.from('tour_expense_lines').select('*, suppliers ( name )').eq('tour_id', tour.id).order('sort_order'),
        supabase.from('bookings').select('slots_booked, checked_in_at, booking_status').eq('tour_id', tour.id).not('checked_in_at', 'is', null),
        supabase.from('tours').select('expenses_final_at').eq('id', tour.id).maybeSingle(),
      ]);
      if (!alive) return;
      if (l.error) { reportError("Couldn't load the expenses", l.error); setRows([]); return; }
      const people = (b.data || []).filter((x) => x.booking_status !== 'Cancelled').reduce((s, x) => s + (x.slots_booked || 1), 0);
      setCheckedIn(people);
      setFinalAt(t.data?.expenses_final_at || null);
      setSuppliers(Object.fromEntries((l.data || []).filter((r) => r.supplier_id).map((r) => [r.supplier_id, r.suppliers?.name])));
      setRows((l.data || []).map((r) => ({
        key: r.id, id: r.id, label: r.label, category: r.category, supplier_id: r.supplier_id, rate: Number(r.rate) || 0, rate_basis: r.rate_basis,
        estimated: r.is_unplanned ? 0 : Number(r.estimated_amount) || 0, is_unplanned: r.is_unplanned,
        // Not entered yet: per-person lines start at rate × checked-in joiners; per-trip at the estimate.
        actual: r.actual_amount != null ? String(Number(r.actual_amount))
          : r.is_unplanned ? '' : String(r.rate_basis === 'per_person' ? Math.round((Number(r.rate) || 0) * people * 100) / 100 : Number(r.estimated_amount) || 0),
        entered: r.actual_amount != null, note: r.actual_note || '', receipt_path: r.receipt_path || '', file: null,
      })));
    })();
    return () => { alive = false; };
  }, [tour.id]);

  const update = (key, patch) => { setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r))); setDirty(true); };
  const addUnplanned = () => {
    setRows((list) => [...list, { key: newLineKey(), id: null, label: '', category: 'other', supplier_id: null, rate: 0, rate_basis: 'per_trip', estimated: 0, is_unplanned: true, actual: '', entered: false, note: '', receipt_path: '', file: null }]);
    setDirty(true);
  };

  const estTotal = (rows || []).reduce((s, r) => s + r.estimated, 0);
  const actTotal = (rows || []).reduce((s, r) => s + (num(r.actual) ?? 0), 0);
  const diff = actTotal - estTotal;

  const problems = () => {
    for (const r of rows || []) {
      if (r.is_unplanned && !r.label.trim()) return 'Name each unplanned expense.';
      if (r.actual !== '' && !/^\d+(\.\d{1,2})?$/.test(String(r.actual))) return `${r.label || 'A line'}: enter an amount of ₱0 or more.`;
      if (r.is_unplanned && r.actual === '') return `${r.label || 'An unplanned expense'}: enter the amount paid.`;
    }
    return '';
  };

  const save = async ({ quiet = false } = {}) => {
    const p = problems();
    if (p) { toast.error('Please check the expenses', p); return false; }
    setBusy('save');
    try {
      // Receipt photos first.
      const withPaths = [];
      for (const r of rows) {
        let path = r.receipt_path;
        if (r.file) {
          const small = await shrinkImage(r.file);
          path = `${tour.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${small.type === 'image/png' ? 'png' : 'jpg'}`;
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, small, { contentType: small.type || 'image/jpeg' });
          if (upErr) throw new Error(`Couldn't upload the receipt for ${r.label || 'a line'}: ${upErr.message}`);
        }
        withPaths.push({ ...r, receipt_path: path, file: null });
      }
      const payload = withPaths.map((r) => ({
        id: r.id, label: r.label.trim(), category: r.category, supplier_id: r.supplier_id,
        actual_amount: r.actual === '' ? null : Math.round(Number(r.actual) * 100) / 100, actual_note: r.note.trim(), receipt_path: r.receipt_path || null,
      }));
      const { error } = await supabase.rpc('save_actual_expenses', { p_tour_id: tour.id, p_lines: payload });
      if (error) throw error;
      // Reload the ids of new unplanned lines.
      const { data } = await supabase.from('tour_expense_lines').select('id, label, is_unplanned, actual_amount').eq('tour_id', tour.id).order('sort_order');
      const unplannedIds = (data || []).filter((d) => d.is_unplanned).map((d) => d.id);
      let u = 0;
      setRows(withPaths.map((r) => (r.is_unplanned ? { ...r, id: unplannedIds[u++] || r.id, entered: true } : { ...r, entered: r.actual !== '' })));
      setDirty(false);
      if (!quiet) toast.success('Actual expenses saved', `${tour.title}: ${formatPeso(actTotal)} paid.`);
      onSaved?.();
      return true;
    } catch (err) {
      reportError("Couldn't save the expenses", err);
      return false;
    } finally {
      setBusy('');
    }
  };

  const markFinal = async () => {
    if ((rows || []).some((r) => r.actual === '')) { toast.error('Enter every amount first', 'Put 0 for anything that wasn\'t paid.'); return; }
    if (!(await confirmDialog({
      title: 'Mark these expenses as final?',
      message: `Total paid: ${formatPeso(actTotal)} (estimated ${formatPeso(estTotal)}).\n\nReports will use these amounts. After this, only the main admin can change them.`,
      confirmLabel: 'Mark as Final', cancelLabel: 'Keep Editing',
    }))) return;
    if (dirty || rows.some((r) => !r.entered)) { if (!(await save({ quiet: true }))) return; }
    setBusy('final');
    const { data, error } = await supabase.rpc('set_expenses_final', { p_tour_id: tour.id, p_final: true });
    setBusy('');
    if (error) { reportError("Couldn't mark them final", error); return; }
    setFinalAt(data);
    toast.success('Expenses are final', 'Reports now use the actual amounts.');
    onSaved?.();
  };
  const reopen = async () => {
    if (!(await confirmDialog({ title: 'Reopen these expenses?', message: 'Admins can edit them again, and Reports goes back to showing them as not final.', confirmLabel: 'Reopen', cancelLabel: 'Keep Final' }))) return;
    setBusy('final');
    const { error } = await supabase.rpc('set_expenses_final', { p_tour_id: tour.id, p_final: false });
    setBusy('');
    if (error) { reportError("Couldn't reopen them", error); return; }
    setFinalAt(null);
    toast.success('Expenses reopened');
    onSaved?.();
  };

  const close = async () => {
    if (dirty && !(await confirmDialog({ title: 'Discard your changes?', message: "The amounts you entered won't be saved.", confirmLabel: 'Discard', cancelLabel: 'Keep Editing', tone: 'danger' }))) return;
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} onClick={close} />
      <div role="dialog" aria-modal="true" aria-label="Actual expenses" style={{
        position: 'relative', width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto', background: '#FDF6EE',
        borderRadius: 24, borderTop: '8px solid #B4511E', padding: '1.5rem', boxShadow: '0 24px 60px rgba(26,10,0,0.35)', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#A8481A' }}>Actual Expenses</p>
            <h3 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 900, color: '#1A0A00', overflowWrap: 'anywhere' }}>{tour.title}</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, fontWeight: 600, color: '#5C2A10' }}>
              {formatYmdRange(tour.start_date, tour.end_date)} · {checkedIn} joiner{checkedIn === 1 ? '' : 's'} checked in
            </p>
          </div>
          <button type="button" className="x-close" onClick={close} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>
        </div>

        {finalAt && (
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0, background: 'rgba(46,107,74,0.1)', color: '#2E6B4A', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, fontWeight: 800 }}>
            <Lock size={15} /> Final since {new Date(finalAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.
            {me.isMain ? ' You can still change them (main admin).' : ' Only the main admin can change them.'}
          </p>
        )}

        {!rows ? (
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0, fontSize: 13, fontWeight: 700, color: '#5C2A10' }}><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0, fontSize: 13, fontWeight: 700, color: '#5C2A10' }}><AlertCircle size={15} /> This tour has no expense lines. Add unplanned expenses below.</p>
        ) : null}

        {rows && rows.map((r) => {
          const actual = num(r.actual);
          const d = actual == null ? null : actual - r.estimated;
          return (
            <div key={r.key} style={{ background: r.is_unplanned ? 'rgba(232,162,101,0.14)' : '#F2E4D0', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '2 1 220px' }}>
                  {r.is_unplanned ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: '2 1 160px', minWidth: 0 }}><input aria-label="Unplanned expense name" value={r.label} maxLength={80} disabled={locked} onChange={(e) => update(r.key, { label: e.target.value })} placeholder="e.g. Extra fuel, Parking" style={box} /></div>
                      <div style={{ flex: '1 1 130px', minWidth: 0 }}><PrettySelect compact ariaLabel="Category" value={r.category} disabled={locked} onChange={(v) => update(r.key, { category: v })}
                        options={EXPENSE_CATEGORIES.filter(([v]) => v !== 'bag_tag').map(([v, l]) => ({ value: v, label: l }))} /></div>
                    </div>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00' }}>{r.label}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 700, color: '#5C2A10' }}>
                        {CATEGORY_LABEL[r.category]}{r.supplier_id && suppliers[r.supplier_id] ? ` · ${suppliers[r.supplier_id]}` : ''}
                        {r.rate_basis === 'per_person' ? ` · ${formatPeso(r.rate)} per person` : ''}
                      </p>
                    </>
                  )}
                  {r.is_unplanned && <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', color: '#A8481A' }}>UNPLANNED</p>}
                </div>
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18' }}>Estimated</p>
                  <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 800, color: '#1A0A00' }}>{r.is_unplanned ? '—' : formatPeso(r.estimated)}</p>
                </div>
                <label style={{ flex: '1 1 140px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18' }}>Actual (₱)</span>
                  <input value={r.actual} inputMode="decimal" disabled={locked} onChange={(e) => update(r.key, { actual: money(e.target.value) })} placeholder="0.00" style={box} />
                  {d != null && !r.is_unplanned && Math.abs(d) >= 0.01 && (
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: d > 0 ? '#8C2F1C' : '#2E6B4A' }}>{d > 0 ? '+' : '−'}{formatPeso(Math.abs(d))} vs estimate</span>
                  )}
                </label>
                {r.is_unplanned && !locked && (
                  <button type="button" aria-label="Remove this expense" onClick={() => { setRows((list) => list.filter((x) => x.key !== r.key)); setDirty(true); }}
                    style={{ width: 38, height: 38, marginTop: 18, borderRadius: 10, border: '1px solid rgba(122,58,24,0.3)', background: 'transparent', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Trash2 size={14} /></button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '3 1 220px', minWidth: 0 }}><input aria-label={`Note for ${r.label || 'this expense'}`} value={r.note} maxLength={500} disabled={locked} onChange={(e) => update(r.key, { note: e.target.value })} placeholder="Note (optional)" style={box} /></div>
                <ReceiptLink path={r.receipt_path} />
                {!locked && (
                  <label style={{ ...btn(false), minHeight: 36 }}>
                    <Camera size={13} /> {r.file ? r.file.name.slice(0, 18) : r.receipt_path ? 'Replace receipt' : 'Receipt photo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) update(r.key, { file: f }); }} />
                  </label>
                )}
              </div>
            </div>
          );
        })}

        {rows && !locked && <button type="button" onClick={addUnplanned} style={{ ...btn(false), borderStyle: 'dashed', color: '#A8481A' }}><Plus size={13} /> Add unplanned expense</button>}

        {rows && rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 8 }}>
            {[['Estimated', formatPeso(estTotal), '#1A0A00'], ['Actual', formatPeso(actTotal), '#1A0A00'],
              ['Difference', `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${formatPeso(Math.abs(diff))}`, diff > 0 ? '#8C2F1C' : '#2E6B4A']].map(([k, v, c]) => (
              <div key={k} style={{ background: '#F2E4D0', borderRadius: 12, padding: '10px 12px' }}>
                <p style={{ margin: 0, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18' }}>{k}</p>
                <p style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 900, color: c }}>{v}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={btn(false)} onClick={close}>Close</button>
          {finalAt && me.isMain && <button type="button" style={btn(false, !!busy)} disabled={!!busy} onClick={reopen}><Unlock size={13} /> Reopen</button>}
          {!locked && rows && <button type="button" style={btn(false, !!busy)} disabled={!!busy} onClick={() => save()}>{busy === 'save' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null} Save</button>}
          {!finalAt && rows && rows.length > 0 && <button type="button" style={btn(true, !!busy)} disabled={!!busy} onClick={markFinal}>{busy === 'final' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={13} />} Mark Expenses as Final</button>}
        </div>
      </div>
    </div>
  );
};

export default ActualExpenses;
