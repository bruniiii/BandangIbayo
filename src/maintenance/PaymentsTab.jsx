import { useEffect, useState } from 'react';
import { CreditCard, PauseCircle, Loader2, Lock } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { useAdminMe } from '../adminMe';
import Toggle from './Toggle';
import { card, h3, hint, btn, input, label, row, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Payments (main admin changes it, other admins look):
//  • which online payment methods joiners can choose on the PayMongo page
//  • pause online payments (e.g. while GCash or PayMongo has problems):
//    joiners can't start a payment, and see the message instead.
// The payments function reads these (get_payment_settings).
// ─────────────────────────────────────────────

const METHODS = [
  ['gcash', 'GCash'],
  ['paymaya', 'Maya'],
  ['card', 'Credit / debit card'],
  ['grab_pay', 'GrabPay'],
];

const PaymentsTab = () => {
  const me = useAdminMe();
  const canEdit = me.isMain;
  const [s, setS] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { supabase.rpc('get_payment_settings').then(({ data, error }) => {
    const v = error || !data ? { methods: METHODS.map(([k]) => k), paused: false } : data;
    setS(v); setMessage(v.message || '');
  }); }, []);

  const save = async (next, what) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('set_payment_settings', { p_methods: next.methods, p_paused: next.paused, p_message: message });
    setBusy(false);
    if (error) { toast.error("Couldn't save it", error.message); return; }
    setS(data);
    toast.success(what, "It's in Audit Trail.");
  };

  const setMethod = (k, on) => {
    const methods = on ? [...new Set([...s.methods, k])] : s.methods.filter((m) => m !== k);
    save({ ...s, methods }, `${METHODS.find(([m]) => m === k)[1]} ${on ? 'turned on' : 'turned off'}`);
  };

  const setPaused = async (paused) => {
    if (paused && !(await confirmDialog({
      title: 'Pause online payments?', confirmLabel: 'Pause', cancelLabel: 'Cancel', tone: 'danger',
      message: "Joiners can't book or pay online until you resume. Payments already made are not affected.",
    }))) return;
    save({ ...s, paused }, paused ? 'Online payments paused' : 'Online payments resumed');
  };

  if (!s) return <div style={card}><Loader2 size={18} style={spin} /></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!canEdit && (
        <p role="note" style={{ ...row, margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ib-warn, #7A4410)' }}>
          <Lock size={15} /> Only the main admin can change the payment settings. You can see them here.
        </p>
      )}
      <section style={{ ...card, borderColor: s.paused ? 'rgba(var(--ib-red-rgb, 140,47,28), 0.45)' : card.border }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h3 style={h3}><PauseCircle size={16} color={s.paused ? 'var(--ib-red, #8C2F1C)' : 'var(--ib-sienna, #A8481A)'} /> Online payments</h3>
            <p style={{ ...hint, margin: 0 }}>
              {s.paused
                ? <><strong style={{ color: 'var(--ib-red, #8C2F1C)' }}>Paused.</strong> Joiners can't book or pay online right now; they see the message below.</>
                : 'Open. Pause them if GCash or PayMongo is having problems, so joiners don\'t get stuck halfway through paying.'}
            </p>
          </div>
          <button type="button" disabled={!canEdit || busy} onClick={() => setPaused(!s.paused)}
            style={{ ...btn(true), height: 42, background: s.paused ? '#1B5E3B' : 'var(--ib-red-solid, #8C2F1C)' }}>
            {busy ? <Loader2 size={14} style={spin} /> : <PauseCircle size={14} />} {s.paused ? 'Resume' : 'Pause'}
          </button>
        </div>
        <label style={{ ...label, marginTop: 14 }}>
          Message joiners see while paused
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={2} disabled={!canEdit}
            placeholder="e.g. GCash is down right now. Please try again in an hour, or message us."
            style={{ ...input, resize: 'vertical', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }} />
        </label>
        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={() => save(s, 'Message saved')} style={btn(false)}>Save Message</button>
          </div>
        )}
      </section>

      <section style={card}>
        <h3 style={h3}><CreditCard size={16} color="var(--ib-sienna, #A8481A)" /> Payment methods</h3>
        <p style={hint}>What joiners can choose on the payment page. Saved right away. Keep at least one on.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {METHODS.map(([k, t]) => {
            const on = s.methods.includes(k);
            return (
              <div key={k} style={row}>
                <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>
                  {t} <span style={{ marginLeft: 6, color: on ? 'var(--ib-green, #1B5E3B)' : 'var(--ib-red, #8C2F1C)' }}>{on ? 'On' : 'Off'}</span>
                </p>
                <Toggle on={on} onChange={(v) => setMethod(k, v)} disabled={!canEdit || busy || (on && s.methods.length === 1 && !s.paused)} label={t} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default PaymentsTab;
