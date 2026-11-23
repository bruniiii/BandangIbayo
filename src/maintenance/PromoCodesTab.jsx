import { useEffect, useState } from 'react';
import { TicketPercent, Plus, X, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import PrettySelect from '../ui/PrettySelect';
import RecordList from './RecordList';
import { card, h3, hint, btn, input, label, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Promo Codes
// A code joiners type in the booking window for a discount (a % or a peso
// amount). The database checks it when they pay: dates, the tour, number of
// persons, how many times it can be used, once per joiner. Not for dates
// already on sale. Archived, never deleted.
// ─────────────────────────────────────────────

const inp = { ...input, letterSpacing: 0, textTransform: 'none', fontWeight: 600 };
const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

const promoLabel = (p) => (p.kind === 'percent' ? `${Number(p.value)}% off` : `${peso(p.value)} off`);

const PromoCodesTab = () => {
  const [rows, setRows] = useState(null);
  const [uses, setUses] = useState({});
  const [titles, setTitles] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const [p, b, t] = await Promise.all([
      supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('bookings').select('promo_code, promo_discount, booking_status, payment_status').not('promo_code', 'is', null),
      supabase.from('tours').select('title').order('title'),
    ]);
    if (p.error) toast.error("Couldn't load the promo codes", p.error.message);
    setRows(p.data || []);
    const u = {};
    (b.data || []).forEach((x) => {
      if (['Cancelled', 'Rejected'].includes(x.booking_status) || x.payment_status === 'Expired') return;
      const k = x.promo_code;
      u[k] = { n: (u[k]?.n || 0) + 1, off: (u[k]?.off || 0) + Number(x.promo_discount || 0) };
    });
    setUses(u);
    setTitles([...new Set((t.data || []).map((x) => x.title).filter(Boolean))]);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the list when the tab opens
  useEffect(() => { load(); }, []);

  const setActive = async (x, on) => {
    if (!on && !(await confirmDialog({ title: `Archive ${x.code}?`, message: "Joiners can't use it anymore. Bookings that used it keep their discount, and you can restore it any time.", confirmLabel: 'Archive', cancelLabel: 'Keep', tone: 'danger' }))) return;
    const { error } = await supabase.from('promo_codes').update({ is_active: on }).eq('id', x.id);
    if (error) { toast.error(on ? "Couldn't restore it" : "Couldn't archive it", error.message); return; }
    toast.success(on ? 'Restored' : 'Archived', x.code);
    load();
  };

  const status = (x) => {
    const t = today();
    if (x.is_active === false) return null;
    if (x.ends_on && x.ends_on < t) return ['Expired', 'var(--ib-red, #8C2F1C)'];
    if (x.starts_on && x.starts_on > t) return [`Starts ${day(x.starts_on)}`, 'var(--ib-warn, #7A4410)'];
    if (x.max_uses && (uses[x.code]?.n || 0) >= x.max_uses) return ['Used up', 'var(--ib-red, #8C2F1C)'];
    return ['Working', 'var(--ib-green, #1B5E3B)'];
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h3 style={h3}><TicketPercent size={16} color="var(--ib-accent, #B4511E)" /> Promo Codes</h3>
          <p style={hint}>Joiners type the code in the booking window to get a discount. It's checked when they pay (dates, tour, persons, uses). It can't be used on a date that's already on sale.</p>
        </div>
        <button type="button" style={btn(true)} onClick={() => setEditing({})}><Plus size={14} /> Add Promo Code</button>
      </div>
      <RecordList
        items={rows}
        placeholder="Search promo codes"
        empty="No promo codes yet. Click Add Promo Code."
        textOf={(x) => `${x.code} ${x.description || ''} ${x.tour_title || ''}`}
        onEdit={(x) => setEditing(x)}
        onArchive={(x) => setActive(x, false)}
        onRestore={(x) => setActive(x, true)}
        render={(x) => {
          const st = status(x);
          const u = uses[x.code];
          return (
            <>
              <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 15, fontWeight: 900, letterSpacing: '0.06em', color: 'var(--ib-dark, #1A0A00)', border: '1.5px dashed var(--ib-sienna, #A8481A)', borderRadius: 8, padding: '1px 8px' }}>{x.code}</span>
                <strong style={{ fontSize: 13, color: 'var(--ib-accent, #B4511E)' }}>{promoLabel(x)}</strong>
                {st && <span style={{ fontSize: 11, fontWeight: 900, color: st[1] }}>● {st[0]}</span>}
              </p>
              {x.description && <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 700, color: 'var(--ib-brown, #5C2A10)' }}>{x.description}</p>}
              <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)' }}>
                {[x.tour_title ? `Only ${x.tour_title}` : 'Any tour',
                  x.min_persons > 1 ? `${x.min_persons}+ persons` : null,
                  x.starts_on || x.ends_on ? `${x.starts_on ? day(x.starts_on) : 'Now'} – ${x.ends_on ? day(x.ends_on) : 'no end'}` : null,
                  `Used ${u?.n || 0}${x.max_uses ? ` of ${x.max_uses}` : ''}${u?.off ? ` · ${peso(u.off)} given` : ''}`,
                  x.once_per_joiner ? 'once per joiner' : null].filter(Boolean).join(' · ')}
              </p>
            </>
          );
        }}
      />
      {editing && <PromoForm item={editing} all={rows || []} titles={titles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
};

const PromoForm = ({ item, all, titles, onClose, onSaved }) => {
  const [f, setF] = useState({
    code: item.code || '', description: item.description || '', kind: item.kind || 'percent', value: item.value ?? '',
    tour_title: item.tour_title || '', min_persons: item.min_persons || 1, starts_on: item.starts_on || '', ends_on: item.ends_on || '',
    max_uses: item.max_uses ?? '', once_per_joiner: item.once_per_joiner ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const save = async () => {
    const code = f.code.trim().toUpperCase();
    const value = Number(f.value);
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) { toast.error('Check the code', '3 to 20 letters or numbers, no spaces (e.g. SUMMER10).'); return; }
    if (all.some((p) => p.id !== item.id && p.code === code)) { toast.error('That code already exists', code); return; }
    if (!(value > 0)) { toast.error('Enter the discount'); return; }
    if (f.kind === 'percent' && value > 90) { toast.error('Keep the discount at 90% or less'); return; }
    if (f.starts_on && f.ends_on && f.ends_on < f.starts_on) { toast.error('The end date must be after the start date'); return; }
    setSaving(true);
    const row = {
      code, description: f.description.trim() || null, kind: f.kind, value, tour_title: f.tour_title || null,
      min_persons: Math.max(1, Number(f.min_persons) || 1), starts_on: f.starts_on || null, ends_on: f.ends_on || null,
      max_uses: Number(f.max_uses) > 0 ? Number(f.max_uses) : null, once_per_joiner: !!f.once_per_joiner,
    };
    const { error } = item.id ? await supabase.from('promo_codes').update(row).eq('id', item.id) : await supabase.from('promo_codes').insert([row]);
    setSaving(false);
    if (error) { reportError("Couldn't save it", error); return; }
    toast.success(item.id ? 'Promo code updated' : 'Promo code added', code);
    onSaved();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ib-ink-rgb, 26,10,0), 0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="paper-card" role="dialog" aria-modal="true" aria-label="Promo code" style={{ position: 'relative', width: '100%', maxWidth: 540, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', background: 'var(--ib-cream, #FDF6EE)', borderRadius: 24, borderTop: '8px solid var(--ib-accent, #B4511E)', padding: '1.5rem', boxShadow: '0 24px 60px rgba(var(--ib-shadow-rgb, 26,10,0), 0.35)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{item.id ? 'Edit Promo Code' : 'Add Promo Code'}</h3>
          <button type="button" className="x-close" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ib-rust, #7A3A18)' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
          <label style={label}>Code *<input value={f.code} maxLength={20} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase().replace(/\s/g, '') }))} placeholder="e.g. SUMMER10" style={{ ...inp, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.06em' }} /></label>
          <label style={label}>Short note<input value={f.description} maxLength={200} onChange={set('description')} placeholder="e.g. Summer promo on Facebook" style={inp} /></label>
          <div style={label}>Discount type
            <PrettySelect ariaLabel="Discount type" value={f.kind} onChange={set('kind')} options={[{ value: 'percent', label: 'Percent off (%)' }, { value: 'amount', label: 'Peso amount off (₱)' }]} />
          </div>
          <label style={label}>{f.kind === 'percent' ? 'Percent off *' : 'Pesos off (whole booking) *'}<input type="number" min="1" max={f.kind === 'percent' ? 90 : undefined} value={f.value} onChange={set('value')} placeholder={f.kind === 'percent' ? '10' : '200'} style={inp} /></label>
          <div style={{ ...label, gridColumn: '1 / -1' }}>Tour
            <PrettySelect ariaLabel="Tour" value={f.tour_title} onChange={set('tour_title')} options={[{ value: '', label: 'Any tour' }, ...titles.map((t) => ({ value: t, label: t }))]} />
          </div>
          <label style={label}>From (optional)<input type="date" value={f.starts_on} onChange={set('starts_on')} style={inp} /></label>
          <label style={label}>Until (optional)<input type="date" value={f.ends_on} onChange={set('ends_on')} style={inp} /></label>
          <label style={label}>At least … persons<input type="number" min="1" max="100" value={f.min_persons} onChange={set('min_persons')} style={inp} /></label>
          <label style={label}>Can be used … times<input type="number" min="1" value={f.max_uses} onChange={set('max_uses')} placeholder="No limit" style={inp} /></label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--ib-dark, #1A0A00)' }}>
          <input type="checkbox" checked={f.once_per_joiner} onChange={set('once_per_joiner')} /> Each joiner can use it only once
        </label>
        <p style={{ ...hint, margin: 0 }}>The dates are when joiners can use the code (when they book), not the tour dates.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
          <button type="button" style={btn(true)} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} style={spin} /> : null} Save</button>
        </div>
      </div>
    </div>
  );
};

export default PromoCodesTab;
