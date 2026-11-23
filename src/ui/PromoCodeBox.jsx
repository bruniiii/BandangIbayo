import { useState } from 'react';
import { TicketPercent, Loader2, X, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { formatPeso } from '../tourUtils';

// "Have a promo code?" in the booking window. The database checks the code
// for this tour and number of persons (check_promo_code); the payments
// function applies it again when the joiner pays.
//   promo: { code, discount, total, label, slots } or null
const PromoCodeBox = ({ tourId, slots, promo, onChange }) => {
  const [open, setOpen] = useState(!!promo);
  const [text, setText] = useState(promo?.code || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stale = promo && promo.slots !== slots;

  const apply = async () => {
    const code = text.trim().toUpperCase();
    if (!code) { setError('Type the promo code.'); return; }
    setBusy(true); setError('');
    const { data, error: e } = await supabase.rpc('check_promo_code', { p_code: code, p_tour_id: tourId, p_slots: slots });
    setBusy(false);
    if (e) { setError(/log in|jwt|auth/i.test(e.message) ? 'Please log in to use a promo code.' : "Couldn't check the code. Please try again."); return; }
    if (!data?.ok) { setError(data?.message || "That code can't be used."); onChange(null); return; }
    onChange({ ...data, slots });
  };
  const remove = () => { onChange(null); setText(''); setError(''); };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-link"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 0 12px', padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, color: 'var(--ib-sienna, #A8481A)' }}>
        <TicketPercent size={14} /> Have a promo code?
      </button>
    );
  }
  if (promo && !stale) {
    return (
      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px', padding: '8px 12px', borderRadius: 12, border: '1.5px dashed var(--ib-green, #1B5E3B)', background: 'rgba(46,155,95,0.08)', fontSize: 12.5, fontWeight: 800, color: 'var(--ib-green, #1B5E3B)' }}>
        <Check size={15} />
        <span style={{ flex: 1, minWidth: 0 }}><span style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.05em' }}>{promo.code}</span> · {promo.label} · you save {formatPeso(promo.discount)}</span>
        <button type="button" onClick={remove} aria-label="Remove promo code" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: 2 }}><X size={15} /></button>
      </div>
    );
  }
  return (
    <div style={{ margin: '0 0 12px' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={text} onChange={(e) => { setText(e.target.value.toUpperCase().replace(/\s/g, '')); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
          maxLength={20} placeholder="Promo code" aria-label="Promo code" aria-invalid={!!error}
          style={{ flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 12, border: `1px solid ${error ? 'var(--ib-red, #8C2F1C)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.3)'}`, background: 'var(--ib-surface, #FFFDF9)', color: 'var(--ib-dark, #1A0A00)', fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.05em' }} />
        <button type="button" onClick={apply} disabled={busy}
          style={{ padding: '0 16px', borderRadius: 12, border: 'none', background: 'var(--ib-sienna, #A8481A)', color: 'var(--ib-on-accent, #FDF6EE)', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null} Apply
        </button>
      </div>
      {stale && !error && <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--ib-warn, #7A4410)' }}>You changed the number of persons. Tap Apply again.</p>}
      {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: 'var(--ib-red, #8C2F1C)' }}>{error}</p>}
    </div>
  );
};

export default PromoCodeBox;
