import React, { useEffect, useMemo, useState } from 'react';
import { Truck, Plus, Search, Loader2, Pencil, Archive, RotateCcw, X, Star, Phone, User } from 'lucide-react';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import StatusFilter from '../ui/StatusFilter';
import PrettySelect from '../ui/PrettySelect';
import Pager from '../ui/Pager';
import { paginate } from '../ui/paginate';
import { supabase } from '../supabaseClient';
import { formatPeso } from '../tourUtils';
import { phoneError, normalizePhone, formatPhPhone } from '../validation';
import {
  SUPPLIER_TYPES, TYPE_LABEL, TYPE_INCLUSION, BASIS_LABEL, loadSuppliers, loadSupplierRatings, supplierErrorText, sameText,
} from '../suppliers';
import { card, h3, hint, btn, input, label, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Suppliers
// Van rentals, tour guides, boats, accommodations, attractions and food,
// saved once and ticked when building a tour. Admins only. Never deleted:
// archived and restored (a supplier an upcoming tour uses can't be archived).
// ─────────────────────────────────────────────

const PAGE = 10;
// Boxes inside a label don't take its capitals and spacing.
const inp = { ...input, letterSpacing: 0, textTransform: 'none', fontWeight: 600 };
const STATUSES = ['Active', 'Archived', 'All'];
const BLANK = { name: '', supplier_type: 'van_rental', inclusion_name: TYPE_INCLUSION.van_rental, contact_person: '', contact_number: '', destinations: [], default_rate: '', rate_basis: 'per_trip', notes: '' };

const SuppliersTab = () => {
  const [list, setList] = useState(null);
  const [ratings, setRatings] = useState({});
  const [problem, setProblem] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [dest, setDest] = useState('all');
  const [status, setStatus] = useState('Active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // {} new, or a supplier
  const [busy, setBusy] = useState('');

  const load = async () => {
    const [{ suppliers, error }, r] = await Promise.all([loadSuppliers(), loadSupplierRatings()]);
    if (error) { setProblem(error.message); setList([]); return; }
    setProblem('');
    setList(suppliers);
    setRatings(r);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the list when the tab opens
  useEffect(() => { load(); }, []);

  const destinations = useMemo(() => {
    const seen = new Map();
    (list || []).forEach((s) => (s.destinations || []).forEach((d) => { if (!seen.has(d.toLowerCase())) seen.set(d.toLowerCase(), d); }));
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [list]);

  const q = query.trim().toLowerCase();
  const matches = (s, st) => (st === 'All' || (st === 'Active' ? s.is_active : !s.is_active))
    && (type === 'all' || s.supplier_type === type)
    && (dest === 'all' || (s.destinations || []).some((d) => sameText(d, dest)))
    && (!q || `${s.name} ${s.inclusion_name} ${s.contact_person || ''} ${s.contact_number || ''} ${(s.destinations || []).join(' ')} ${s.notes || ''}`.toLowerCase().includes(q));
  const shown = (list || []).filter((s) => matches(s, status));
  const { visible, pages, current } = paginate(shown, page, PAGE);

  const archive = async (s) => {
    if (!(await confirmDialog({
      title: `Archive ${s.name}?`,
      message: 'It won\'t be offered when building tours. Past tours keep it, and you can restore it any time.',
      confirmLabel: 'Archive', cancelLabel: 'Keep', tone: 'danger',
    }))) return;
    setBusy(s.id);
    const { error } = await supabase.from('suppliers').update({ is_active: false }).eq('id', s.id);
    setBusy('');
    if (error) { toast.error("Couldn't archive it", supplierErrorText(error)); return; }
    toast.success('Supplier archived', s.name);
    load();
  };
  const restore = async (s) => {
    setBusy(s.id);
    const { error } = await supabase.from('suppliers').update({ is_active: true }).eq('id', s.id);
    setBusy('');
    if (error) { toast.error("Couldn't restore it", supplierErrorText(error)); return; }
    toast.success('Supplier restored', s.name);
    load();
  };

  if (problem) {
    return (
      <div style={card}>
        <h3 style={h3}><Truck size={16} color="#8C2F1C" /> Suppliers aren't installed yet</h3>
        <p style={{ ...hint, margin: 0 }}>Run the database update <strong>20261223000000_suppliers.sql</strong> (in supabase/updates/install_updates.sql), then open this tab again. ({problem})</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <h3 style={h3}><Truck size={16} color="#B4511E" /> Suppliers</h3>
          <p style={hint}>Van rentals, tour guides, boats, places to stay, attractions and food. Save each once, then tick them when you build a tour. Joiners only ever see the inclusion name.</p>
        </div>
        <button type="button" style={btn(true)} onClick={() => setEditing({})}><Plus size={14} /> Add Supplier</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10, marginBottom: 12 }}>
        <label style={{ position: 'relative', minWidth: 0, gridColumn: 'span 1' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7A3A18' }} />
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search name, contact, place…" aria-label="Search suppliers" style={{ ...input, paddingLeft: 34 }} />
        </label>
        <PrettySelect ariaLabel="Filter by type" value={type} onChange={(v) => { setType(v); setPage(1); }}
          options={[{ value: 'all', label: 'All types' }, ...SUPPLIER_TYPES.map(([v, l]) => ({ value: v, label: l }))]} />
        <PrettySelect ariaLabel="Filter by destination" value={dest} onChange={(v) => { setDest(v); setPage(1); }}
          options={[{ value: 'all', label: 'All destinations' }, ...destinations.map((d) => ({ value: d, label: d }))]} />
      </div>
      <StatusFilter statuses={STATUSES} value={status} onChange={(v) => { setStatus(v); setPage(1); }}
        count={(st) => (list || []).filter((s) => matches(s, st)).length} style={{ marginBottom: 14 }} />

      {!list ? (
        <p style={{ ...hint, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={15} style={spin} /> Loading suppliers…</p>
      ) : visible.length === 0 ? (
        <p style={{ ...hint, margin: 0 }}>{list.length === 0 ? 'No suppliers yet. Click Add Supplier to save your first one.' : 'No suppliers match these filters.'}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
          {visible.map((s) => {
            const r = ratings[s.id];
            return (
              <div key={s.id} style={{ background: s.is_active ? '#F2E4D0' : 'rgba(242,228,208,0.5)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, opacity: s.is_active ? 1 : 0.85 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00', overflowWrap: 'anywhere' }}>{s.name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A8481A' }}>
                      {TYPE_LABEL[s.supplier_type]}{!s.is_active && ' · Archived'}
                    </p>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#1A0A00', whiteSpace: 'nowrap' }}>{formatPeso(s.default_rate)}<span style={{ fontSize: 11, fontWeight: 700, color: '#5C2A10' }}> {BASIS_LABEL[s.rate_basis]}</span></span>
                </div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>Joiners see: <strong style={{ color: '#1A0A00' }}>{s.inclusion_name}</strong></p>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>Serves: {(s.destinations || []).join(', ')}</p>
                {(s.contact_person || s.contact_number) && (
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#5C2A10', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {s.contact_person && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><User size={12} /> {s.contact_person}</span>}
                    {s.contact_number && <a href={`tel:${s.contact_number}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#A8481A', fontWeight: 800 }}><Phone size={12} /> {formatPhPhone(s.contact_number)}</a>}
                  </p>
                )}
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#5C2A10', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <Star size={13} fill={r?.count ? '#E8A265' : 'none'} color="#E8A265" />
                  {r?.count ? `${r.avg.toFixed(1)} from ${r.count} joiner rating${r.count === 1 ? '' : 's'}` : 'No joiner ratings yet'}
                </p>
                {s.notes && <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: '#5C2A10', whiteSpace: 'pre-wrap' }}>{s.notes}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <button type="button" style={btn(false)} onClick={() => setEditing(s)}><Pencil size={13} /> Edit</button>
                  {s.is_active
                    ? <button type="button" style={btn(false)} disabled={busy === s.id} onClick={() => archive(s)}>{busy === s.id ? <Loader2 size={13} style={spin} /> : <Archive size={13} />} Archive</button>
                    : <button type="button" style={btn(true)} disabled={busy === s.id} onClick={() => restore(s)}>{busy === s.id ? <Loader2 size={13} style={spin} /> : <RotateCcw size={13} />} Restore</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pager page={current} pages={pages} onPage={setPage} />

      {editing && <SupplierForm supplier={editing} all={list || []} knownDestinations={destinations} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
};

// What's wrong with the form ({ field: message }).
const formErrors = (f, all, id) => {
  const e = {};
  const name = f.name.trim();
  if (name.length < 2) e.name = 'Enter the supplier\'s name.';
  else if (all.some((s) => s.id !== id && sameText(s.name, name))) e.name = 'A supplier with this name is already saved.';
  if (f.inclusion_name.trim().length < 2) e.inclusion_name = 'Enter what joiners will see, e.g. Van roundtrip.';
  const phone = phoneError(f.contact_number, 'Contact number', { required: false });
  if (phone) e.contact_number = phone;
  if (!f.destinations.length) e.destinations = 'Add at least one destination.';
  const rate = String(f.default_rate).trim();
  if (rate === '') e.default_rate = 'Enter the default rate (0 if it varies).';
  else if (!/^\d+(\.\d{1,2})?$/.test(rate)) e.default_rate = rate.startsWith('-') ? 'The rate can\'t be negative.' : 'Enter an amount, e.g. 1500 or 1500.50.';
  return e;
};

const SupplierForm = ({ supplier, all, knownDestinations, onClose, onSaved }) => {
  const isNew = !supplier.id;
  const [f, setF] = useState(() => (isNew ? { ...BLANK } : {
    ...BLANK, ...supplier,
    contact_person: supplier.contact_person || '', contact_number: supplier.contact_number ? formatPhPhone(supplier.contact_number) : '',
    notes: supplier.notes || '', default_rate: String(supplier.default_rate ?? ''), destinations: supplier.destinations || [],
  }));
  const [destText, setDestText] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = formErrors(f, all, supplier.id);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));

  const addDest = (raw) => {
    const parts = String(raw).split(',').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!parts.length) return;
    setF((o) => ({ ...o, destinations: [...o.destinations, ...parts.filter((p) => !o.destinations.some((d) => sameText(d, p)))] }));
    setDestText('');
  };

  const save = async () => {
    setTried(true);
    const pending = destText.trim();
    const dests = pending ? [...f.destinations, ...pending.split(',').map((x) => x.trim()).filter((x) => x && !f.destinations.some((d) => sameText(d, x)))] : f.destinations;
    const errs = formErrors({ ...f, destinations: dests }, all, supplier.id);
    if (Object.keys(errs).length) { toast.error('Please check the form', Object.values(errs)[0]); return; }
    const row = {
      name: f.name.trim(), supplier_type: f.supplier_type, inclusion_name: f.inclusion_name.trim(),
      contact_person: f.contact_person.trim() || null, contact_number: f.contact_number.trim() ? normalizePhone(f.contact_number) : null,
      destinations: dests, default_rate: Math.round(Number(f.default_rate) * 100) / 100, rate_basis: f.rate_basis, notes: f.notes.trim() || null,
    };
    setSaving(true);
    try {
      const { error } = isNew
        ? await supabase.from('suppliers').insert([row])
        : await supabase.from('suppliers').update(row).eq('id', supplier.id);
      if (error) throw new Error(supplierErrorText(error));
      toast.success(isNew ? 'Supplier saved' : 'Supplier updated', row.name);
      onSaved();
    } catch (err) {
      reportError("Couldn't save the supplier", err);
    } finally {
      setSaving(false);
    }
  };

  const err = (k) => tried && errors[k] ? <span role="alert" style={{ fontSize: 11.5, fontWeight: 800, color: '#8C2F1C', letterSpacing: 0, textTransform: 'none' }}>{errors[k]}</span> : null;
  const field = (k) => ({ ...inp, borderColor: tried && errors[k] ? '#8C2F1C' : 'rgba(180,81,30,0.25)' });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={isNew ? 'Add supplier' : 'Edit supplier'} style={{
        position: 'relative', width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', background: '#FDF6EE',
        borderRadius: 24, borderTop: '8px solid #B4511E', padding: '1.5rem', boxShadow: '0 24px 60px rgba(26,10,0,0.35)', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A0A00' }}>{isNew ? 'Add Supplier' : `Edit ${supplier.name}`}</h3>
          <button type="button" className="x-close" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          <label style={label}>Supplier name *
            <input value={f.name} maxLength={120} onChange={(e) => set('name', e.target.value)} placeholder="e.g. JM Van Rentals" style={field('name')} />{err('name')}
          </label>
          <div style={label}>Type *
            <PrettySelect ariaLabel="Supplier type" value={f.supplier_type} onChange={(v) => setF((o) => ({
              ...o, supplier_type: v,
              inclusion_name: !o.inclusion_name.trim() || SUPPLIER_TYPES.some(([, , i]) => i && sameText(i, o.inclusion_name)) ? TYPE_INCLUSION[v] : o.inclusion_name,
            }))} options={SUPPLIER_TYPES.map(([v, l]) => ({ value: v, label: l }))} />
          </div>
          <label style={label}>What joiners see *
            <input value={f.inclusion_name} maxLength={80} onChange={(e) => set('inclusion_name', e.target.value)} placeholder="e.g. Van roundtrip" style={field('inclusion_name')} />{err('inclusion_name')}
          </label>
          <label style={label}>Contact person
            <input value={f.contact_person} maxLength={120} onChange={(e) => set('contact_person', e.target.value)} placeholder="e.g. Mang Jun" style={inp} />
          </label>
          <label style={label}>Contact number
            <input value={f.contact_number} maxLength={20} inputMode="tel" onChange={(e) => set('contact_number', e.target.value)} placeholder="0917 123 4567" style={field('contact_number')} />{err('contact_number')}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
            <label style={label}>Default rate (₱) *
              <input value={f.default_rate} inputMode="decimal" onChange={(e) => set('default_rate', e.target.value.replace(/[^\d.-]/g, ''))} placeholder="0.00" style={field('default_rate')} />{err('default_rate')}
            </label>
            <div style={label}>Rate basis *
              <PrettySelect ariaLabel="Rate basis" value={f.rate_basis} onChange={(v) => set('rate_basis', v)}
                options={[{ value: 'per_trip', label: 'Per trip' }, { value: 'per_person', label: 'Per person' }]} />
            </div>
          </div>
        </div>

        <div style={label}>Destinations it serves *
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {f.destinations.map((d) => (
              <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#F2E4D0', borderRadius: 999, padding: '4px 6px 4px 10px', fontSize: 12, fontWeight: 800, color: '#1A0A00', letterSpacing: 0, textTransform: 'none' }}>
                {d}
                <button type="button" aria-label={`Remove ${d}`} onClick={() => set('destinations', f.destinations.filter((x) => x !== d))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', display: 'flex', padding: 2 }}><X size={13} /></button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input list="supplier-destinations" value={destText} onChange={(e) => setDestText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addDest(destText); } }}
              placeholder="e.g. Baguio City (Enter to add)" style={{ ...field('destinations'), flex: 1 }} />
            <button type="button" style={btn(false)} onClick={() => addDest(destText)}><Plus size={13} /> Add</button>
          </div>
          <datalist id="supplier-destinations">{knownDestinations.map((d) => <option key={d} value={d} />)}</datalist>
          {err('destinations')}
        </div>

        <label style={label}>Notes
          <textarea value={f.notes} maxLength={1000} rows={3} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Book 2 weeks ahead; GCash only." style={{ ...inp, resize: 'vertical' }} />
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
          <button type="button" style={btn(true)} onClick={save} disabled={saving}>{saving ? <Loader2 size={14} style={spin} /> : null} {isNew ? 'Save Supplier' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
};

export default SuppliersTab;
