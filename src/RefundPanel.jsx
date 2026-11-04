import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Wallet, Upload, Undo2, ShieldCheck, History, X, Image as ImageIcon, RotateCcw, Printer } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { formatPeso } from './tourUtils';
import { formatYmdRange } from './dateRange';
import { shrinkImage } from './imageCompress';
import { useAdminMe } from './adminMe';
import { refundWeatherThroughPaymongo, weatherRefundStatus } from './payments';
import { printRefundReceipt } from './paymentReceipt';

// ─────────────────────────────────────────────
// Sending a weather refund, safely (20261209 update). Used in Booking
// Management → Weather refunds and in a booking's details.
//   1. Any admin PREPARES it: through PayMongo, or by GCash with the
//      reference and a screenshot of the GCash receipt.
//   2. Only the MAIN ADMIN sends/approves it, after typing "refund".
//   3. The joiner then says "I received it" or "I didn't get it".
// Every step goes in the refund history (main admin only, can't be changed).
// ─────────────────────────────────────────────

export const REFUND_SELECT = 'id, user_id, booking_number, full_name, gcash_number, amount_paid, weather_refund, weather_refund_status, weather_refund_ref, weather_refund_at, '
  + 'weather_refund_method, weather_refund_proof, weather_refund_prepared_by, weather_refund_prepared_at, weather_refund_received, weather_refund_received_at, '
  + 'weather_refund_paymongo, paymongo_payment_id, slots_booked';

const PROOF_BUCKET = 'refund-proofs';
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : '');
const smallBtn = (bg, fg, border = 'none', off = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, background: bg, color: fg, border, borderRadius: 12, padding: '10px 14px',
  fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase',
  cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.5 : 1,
});
const note = { margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 };

// The GCash receipt screenshot: a short-lived private link (admins and the joiner).
export const RefundProofLink = ({ path, label = 'See the GCash receipt' }) => {
  const [busy, setBusy] = useState(false);
  if (!path) return null;
  const open = async () => {
    // (Opened right away, then pointed at the link, so phones don't block it.)
    const win = window.open('', '_blank');
    setBusy(true);
    const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 10 * 60);
    setBusy(false);
    if (error || !data?.signedUrl) { win?.close(); toast.error("Couldn't open the receipt", error?.message || 'Please try again.'); return; }
    if (win) win.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };
  return (
    <button type="button" onClick={open} disabled={busy} className="text-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
      {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ImageIcon size={13} />} {label}
    </button>
  );
};

// Who prepared it (their name).
const usePersonName = (id) => {
  const [name, setName] = useState('');
  useEffect(() => {
    let alive = true;
    if (!id) return undefined;
    supabase.from('profiles').select('first_name, last_name').eq('id', id).maybeSingle()
      .then(({ data }) => { if (alive) setName([data?.first_name, data?.last_name].filter(Boolean).join(' ').trim() || 'An admin'); });
    return () => { alive = false; };
  }, [id]);
  return id ? name : '';
};

const askTypeRefund = (title, message, confirmLabel) => confirmDialog({ title, message, confirmLabel, cancelLabel: 'Not Yet', tone: 'danger', typeToConfirm: 'refund' });

// ── A refund still to send (Due / Refunding) ──
export const RefundPanel = ({ booking: b, onDone }) => {
  const me = useAdminMe();
  const isMain = me.isMain;
  // Refunds are sent manually through GCash only (PayMongo refunds were turned off).
  const method = 'gcash';
  const [ref, setRef] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const prepared = !!b.weather_refund_prepared_at;
  const preparedBy = usePersonName(b.weather_refund_prepared_by);
  const gcash = b.gcash_number || '';
  const amount = formatPeso(b.weather_refund);

  // Upload the screenshot, then prepare (→ waits for the main admin's approval).
  const prepare = async () => {
    if (method === 'gcash') {
      if (!/^\d{13}$/.test(ref)) { toast.error('Type the GCash reference no.', 'It\'s the 13-digit number on the GCash receipt (numbers only).'); return false; }
      if (!file) { toast.error('Add the GCash receipt', 'Upload a screenshot of the GCash receipt of this refund.'); return false; }
    }
    let proof = null;
    if (method === 'gcash') {
      const small = await shrinkImage(file);
      proof = `${b.id}/${Date.now()}.${small.type === 'image/png' ? 'png' : 'jpg'}`;
      const { error: upErr } = await supabase.storage.from(PROOF_BUCKET).upload(proof, small, { contentType: small.type || 'image/jpeg' });
      if (upErr) { toast.error("Couldn't upload the receipt", upErr.message); return false; }
    }
    const { error } = await supabase.rpc('prepare_weather_refund', {
      p_booking_id: b.id, p_method: method, p_reference: method === 'gcash' ? ref.trim() : null, p_proof: proof,
    });
    if (error) { toast.error("Couldn't prepare the refund", error.message); return false; }
    return true;
  };

  // Main admin: send it (PayMongo) or approve it (GCash, with the receipt).
  const send = async (how) => {
    if (how === 'paymongo') {
      const res = await refundWeatherThroughPaymongo({ bookingId: b.id });
      if (!res.ok) { toast.error("PayMongo couldn't send the refund", res.error); return; }
      if (res.data?.status === 'partial') toast.info('Part of the refund was sent', `${formatPeso(res.data.refunded)} went back through PayMongo. Send the other ${formatPeso(res.data.left)} by GCash (with the receipt).`);
      else toast.success('Refund sent through PayMongo', 'The joiner was notified.');
      return;
    }
    const { error } = await supabase.rpc('mark_weather_refund_sent', { p_booking_id: b.id });
    if (error) { toast.error("Couldn't send the refund", error.message); return; }
    toast.success('Refund sent', 'The joiner was notified and can see the GCash receipt.');
  };

  const submit = async () => {
    if (isMain) {
      const ok = await askTypeRefund(
        `Send the ${amount} GCash refund?`,
        `${b.booking_number}: make sure ${amount} was really sent by GCash${gcash ? ` to ${gcash}` : ''} and the receipt matches. The joiner is notified and can see the receipt.`,
        'Send Refund',
      );
      if (!ok) return;
    }
    setBusy('submit');
    if (await prepare()) {
      if (isMain) await send(method);
      else toast.success('Sent for approval', 'The main admin was asked to approve this refund.');
    }
    setBusy('');
    onDone?.();
  };

  // A PayMongo refund that was cut off ("Refunding" for over 10 minutes).
  const retryPaymongo = async () => {
    const ok = await askTypeRefund(`Send ${amount} through PayMongo again?`, 'Anything PayMongo already refunded is counted first, so it\'s never sent twice.', 'Send Again');
    if (!ok) return;
    setBusy('retry');
    await send('paymongo');
    setBusy('');
    onDone?.();
  };

  const approve = async () => {
    const how = b.weather_refund_method;
    if (how !== 'gcash') { toast.error('Send it back first', 'This was prepared for PayMongo, which isn\'t used for refunds anymore. Send it back and prepare it with GCash.'); return; }
    const ok = await askTypeRefund(
      `Approve the ${amount} refund for ${b.booking_number}?`,
      how === 'paymongo'
        ? `${preparedBy || 'An admin'} prepared it. PayMongo sends it back to the joiner's own payment. The joiner is notified.`
        : `${preparedBy || 'An admin'} says it was sent by GCash (${b.weather_refund_ref || 'no reference'}). Check the receipt first. The joiner is notified and can see the receipt.`,
      'Approve & Send',
    );
    if (!ok) return;
    setBusy('approve');
    await send(how);
    setBusy('');
    onDone?.();
  };

  const sendBack = async () => {
    const ok = await confirmDialog({ title: 'Send it back?', message: `The refund for ${b.booking_number} goes back to be prepared again (e.g. a wrong receipt). ${preparedBy || 'The admin'} is told.`, confirmLabel: 'Send Back', cancelLabel: 'Keep' });
    if (!ok) return;
    setBusy('back');
    const { error } = await supabase.rpc('return_weather_refund', { p_booking_id: b.id, p_note: null });
    setBusy('');
    if (error) { toast.error("Couldn't send it back", error.message); return; }
    toast.success('Sent back', 'It can be prepared again.');
    onDone?.();
  };

  if (b.weather_refund_status === 'Refunding') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ ...note, color: '#8C5216', fontWeight: 700 }}>
          Being sent through PayMongo. If it still says this after 10 minutes, the main admin can tap Send again: anything already refunded is counted, so it's never sent twice.
        </p>
        {isMain && <button type="button" onClick={retryPaymongo} disabled={!!busy} style={{ ...smallBtn('#B4511E', '#FDF6EE'), alignSelf: 'flex-start' }}><Wallet size={13} /> Send again</button>}
      </div>
    );
  }

  // Waiting for the main admin.
  if (prepared) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(232,162,101,0.14)', border: '1px solid rgba(180,81,30,0.3)', borderRadius: 12, padding: '10px 12px' }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 900, color: '#8C5216' }}>
          Waiting for the main admin's approval · {b.weather_refund_method === 'gcash' ? 'GCash' : 'PayMongo'}
        </p>
        <p style={note}>
          Prepared by {preparedBy || '…'} on {when(b.weather_refund_prepared_at)}{b.weather_refund_method === 'gcash' && b.weather_refund_ref ? ` · ${b.weather_refund_ref}` : ''}
        </p>
        {b.weather_refund_method === 'gcash' && <RefundProofLink path={b.weather_refund_proof} />}
        {b.weather_refund_method !== 'gcash' && <p style={{ ...note, fontWeight: 800 }}>Prepared for PayMongo, which isn't used for refunds anymore: send it back and prepare it with GCash.</p>}
        {isMain ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {b.weather_refund_method === 'gcash' && <button type="button" onClick={approve} disabled={!!busy} style={smallBtn('#1F6B4A', '#FDF6EE')}>
              {busy === 'approve' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={13} />} Approve & Send
            </button>}
            <button type="button" onClick={sendBack} disabled={!!busy} style={smallBtn('transparent', '#8C2F1C', '1px solid rgba(140,47,28,0.4)')}>
              <Undo2 size={13} /> Send back
            </button>
          </div>
        ) : <p style={{ ...note, fontWeight: 800 }}>Only the main admin can approve and send it.</p>}
      </div>
    );
  }

  // GCash reference numbers are 13 digits.
  const gcashReady = /^\d{13}$/.test(ref) && !!file;
  const ready = gcashReady;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={note}>
        Send {amount} manually through GCash{gcash ? ` to ${gcash}` : ''}, then add the GCash reference and a screenshot of the GCash receipt.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input aria-label="GCash reference of the refund" placeholder="GCash reference no. (13 digits) *" value={ref} maxLength={13}
              inputMode="numeric" pattern="\d{13}" autoComplete="off"
              onChange={(e) => setRef(e.target.value.replace(/\D/g, '').slice(0, 13))}
          style={{ flex: '1 1 180px', minWidth: 0, background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 10, padding: '9px 10px', fontSize: 16, fontFamily: 'inherit', color: '#1A0A00' }} />
        <label style={{ ...smallBtn('#F2E4D0', '#7A3A18', '1px dashed rgba(180,81,30,0.45)'), maxWidth: '100%' }}>
          <Upload size={13} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{file ? file.name : 'GCash receipt *'}</span>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
        </label>
      </div>
      <button type="button" onClick={submit} disabled={!!busy || !ready} title={ready ? undefined : 'Add the 13-digit GCash reference no. and the receipt first'}
        style={{ ...smallBtn(isMain ? '#B4511E' : '#3F5D62', '#FDF6EE', 'none', !!busy || !ready), alignSelf: 'flex-start' }}>
        {busy === 'submit' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : isMain ? <Wallet size={13} /> : <CheckCircle2 size={13} />}
        {isMain ? 'Send refund' : 'Send for approval'}
      </button>
      {!isMain && me.loaded && <p style={{ ...note, fontSize: 11.5 }}>The main admin approves every refund before the joiner is told.</p>}
    </div>
  );
};

// What PayMongo says about a refund sent through it.
const PaymongoState = ({ bookingId }) => {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    weatherRefundStatus({ bookingId }).then((res) => { if (alive) setState(res.ok ? res.data : { status: 'unknown', error: res.error }); });
    return () => { alive = false; };
  }, [bookingId]);
  const text = !state ? 'Checking with PayMongo…'
    : state.status === 'succeeded' ? `PayMongo: finished sending it${state.at ? ` (${new Date(state.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })})` : ''}.`
      : state.status === 'pending' ? 'PayMongo: still being sent (usually 1 to 5 days).'
        : state.status === 'failed' ? 'PayMongo: the refund FAILED. It was moved back to Weather refunds to send.'
          : state.status === 'manual' ? '' : `Couldn't check with PayMongo${state.error ? `: ${state.error}` : ''}.`;
  if (!text) return null;
  return <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: state?.status === 'failed' ? '#8C2F1C' : state?.status === 'succeeded' ? '#1F6B4A' : '#8C5216' }}>{text}</p>;
};

// ── A refund already sent: how, the receipt, PayMongo, and the joiner's answer ──
export const RefundSentInfo = ({ booking: b, onDone }) => {
  const me = useAdminMe();
  const [busy, setBusy] = useState(false);
  const received = b.weather_refund_received;
  const reopen = async () => {
    const ok = await askTypeRefund(
      `Send the ${b.booking_number} refund again?`,
      'It goes back to Weather refunds to send by GCash. Check first that the joiner really didn\'t get it (the GCash receipt, or PayMongo for older refunds): a refund sent again is paid twice.',
      'Send Again',
    );
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc('reopen_weather_refund', { p_booking_id: b.id, p_note: received === 'not_received' ? 'The joiner said they didn\'t get it.' : null });
    setBusy(false);
    if (error) { toast.error("Couldn't move it back", error.message); return; }
    toast.success('Moved back to refunds to send', 'Prepare and send it again.');
    onDone?.();
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#1F6B4A' }}>
        Sent{b.weather_refund_method ? ` by ${b.weather_refund_method === 'gcash' ? 'GCash' : 'PayMongo'}` : ''}{b.weather_refund_at ? ` on ${when(b.weather_refund_at)}` : ''}{b.weather_refund_ref ? ` · ${b.weather_refund_ref}` : ''}.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="text-link" onClick={() => printRefundReceipt(b).catch((e) => toast.error("Couldn't make the refund receipt", e?.message))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
          <Printer size={13} /> Print refund receipt
        </button>
        {b.weather_refund_proof && <RefundProofLink path={b.weather_refund_proof} />}
      </div>
      {b.weather_refund_method !== 'gcash' && /ref_[A-Za-z0-9]+/.test(b.weather_refund_ref || '') && <PaymongoState bookingId={b.id} />}
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: received === 'received' ? '#1F6B4A' : received === 'not_received' ? '#8C2F1C' : '#8C5216' }}>
        {received === 'received' ? `✓ The joiner confirmed they received it (${when(b.weather_refund_received_at)}).`
          : received === 'not_received' ? `⚠ The joiner says they didn't get it (${when(b.weather_refund_received_at)}).`
            : 'Waiting for the joiner to confirm they received it.'}
      </p>
      {me.isMain && received !== 'received' && (
        <button type="button" onClick={reopen} disabled={busy} style={{ ...smallBtn('transparent', '#8C2F1C', '1px solid rgba(140,47,28,0.4)'), alignSelf: 'flex-start' }}>
          {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={13} />} Send again
        </button>
      )}
    </div>
  );
};

// ── 5. Refund history (main admin only) ──
// One card per booking: the joiner, the amount, where the refund is now, and
// its steps in order (oldest first) as plain sentences.
const methodName = (m) => (m === 'gcash' ? 'GCash' : m === 'paymongo' ? 'PayMongo' : '');
const stepText = (r, joiner) => {
  const by = r.by_name || 'Someone';
  const how = methodName(r.method);
  const amount = r.amount != null ? formatPeso(r.amount) : '';
  switch (r.action) {
    case 'prepared': return `${by} prepared the refund${how ? ` (${how})` : ''} for the main admin's approval.`;
    case 'sent': return `${by} sent ${amount}${how ? ` by ${how}` : ''}.`;
    case 'paymongo_succeeded': return 'PayMongo finished sending it to the joiner.';
    case 'failed': return "PayMongo couldn't send it. It went back to refunds to send.";
    case 'received': return `${joiner || by} confirmed they received it.`;
    case 'not_received': return `${joiner || by} said they didn't get it.`;
    case 'returned': return `${by} sent it back to be prepared again.`;
    case 'reopened': return `${by} moved it back to be sent again.`;
    default: return `${by}: ${r.action}.`;
  }
};
const DOT = { sent: '#B4511E', paymongo_succeeded: '#B4511E', received: '#1A0A00', not_received: '#8C2F1C', failed: '#8C2F1C' };
// Where the refund is now, from its latest step.
const nowOf = (steps) => {
  const last = [...steps].reverse().find((r) => r.action !== 'paymongo_succeeded') || steps[steps.length - 1];
  switch (last?.action) {
    case 'received': return { t: 'Done · joiner received it', bg: '#1A0A00', fg: '#E8A265' };
    case 'not_received': return { t: "Joiner didn't get it", bg: '#8C2F1C', fg: '#FDF6EE' };
    case 'sent': return { t: 'Sent · waiting for the joiner', bg: '#B4511E', fg: '#FDF6EE' };
    case 'prepared': return { t: 'Waiting for approval', bg: 'transparent', fg: '#B4511E', bd: '1px solid rgba(180,81,30,0.5)' };
    default: return { t: 'To send', bg: 'transparent', fg: '#7A3A18', bd: '1px solid rgba(122,58,24,0.4)' };
  }
};

export const RefundHistoryButton = () => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [joiners, setJoiners] = useState({}); // booking id → { name, tour }
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('refund_log').select('*').order('created_at', { ascending: true }).limit(1000);
      if (!alive) return;
      if (error) { toast.error("Couldn't load the refund history", error.message); setRows([]); return; }
      setRows(data || []);
      const ids = [...new Set((data || []).map((r) => r.booking_id).filter((v) => v != null))];
      if (ids.length) {
        const { data: bks } = await supabase.from('bookings')
          .select('id, full_name, tours ( title, start_date, end_date, weather_old_start, weather_old_end )').in('id', ids);
        if (alive) setJoiners(Object.fromEntries((bks || []).map((b) => [String(b.id), { name: b.full_name, tour: b.tours }])));
      }
    })();
    return () => { alive = false; };
  }, [open]);

  // Group the steps by booking; the booking with the latest step first.
  const groups = Object.values((rows || []).reduce((acc, r) => {
    const k = String(r.booking_id ?? r.booking_number);
    (acc[k] ||= { key: k, booking_id: r.booking_id, booking_number: r.booking_number, steps: [] }).steps.push(r);
    return acc;
  }, {})).sort((a, b) => new Date(b.steps[b.steps.length - 1].created_at) - new Date(a.steps[a.steps.length - 1].created_at));
  const q = search.trim().toLowerCase();
  const shown = groups.filter((g) => !q || [g.booking_number, joiners[String(g.booking_id)]?.name, joiners[String(g.booking_id)]?.tour?.title, ...g.steps.flatMap((r) => [r.by_name, r.reference])]
    .some((v) => String(v || '').toLowerCase().includes(q)));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={smallBtn('#1A0A00', '#E8A265')}><History size={13} /> Refund history</button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} />
          <div role="dialog" aria-label="Refund history" style={{ position: 'relative', width: '100%', maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: '#F2E4D0', borderRadius: 22, boxShadow: '0 24px 60px rgba(26,10,0,0.35)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', background: '#FDF6EE', borderBottom: '1px solid rgba(180,81,30,0.15)' }}>
              <History size={20} style={{ color: '#B4511E', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#1A0A00' }}>Refund history</p>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18' }}>
                  {rows ? `${groups.length} refund${groups.length === 1 ? '' : 's'}` : 'Loading…'} · each one's steps, in order. Nothing here can be changed or deleted.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '12px 16px 0' }}>
              <input aria-label="Search the refund history" placeholder="Search booking no., joiner, tour or reference" value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 12, padding: '10px 12px', fontSize: 16, fontFamily: 'inherit', color: '#1A0A00' }} />
            </div>
            <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rows === null ? <p style={note}>Loading…</p> : shown.length === 0 ? <p style={note}>{q ? 'Nothing matches that search.' : 'No refunds yet.'}</p> : shown.map((g) => {
                const info = joiners[String(g.booking_id)] || {};
                const joiner = info.name || '';
                const tour = info.tour || null;
                // The tour date that was changed (the original one, if it was postponed).
                const tourDates = tour ? (tour.weather_old_start ? formatYmdRange(tour.weather_old_start, tour.weather_old_end) : formatYmdRange(tour.start_date, tour.end_date)) : '';
                const amount = [...g.steps].reverse().find((r) => r.amount != null)?.amount;
                const method = methodName([...g.steps].reverse().find((r) => r.method)?.method);
                const now = nowOf(g.steps);
                return (
                  <div key={g.key} style={{ background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 16, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00' }}>{joiner || 'Joiner'} · <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{g.booking_number || '—'}</span></p>
                        {tour?.title && (
                          <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 800, color: '#B4511E' }}>
                            {tour.title}{tourDates ? <span style={{ fontWeight: 700, color: '#7A3A18' }}> · {tourDates}</span> : null}
                          </p>
                        )}
                        <p style={{ margin: '2px 0 0', fontSize: 12.5, fontWeight: 700, color: '#7A3A18' }}>{amount != null ? `Refunded ${formatPeso(amount)}` : ''}{method ? ` · ${method}` : ''}</p>
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: 999, background: now.bg, color: now.fg, border: now.bd || `1px solid ${now.bg}`, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{now.t}</span>
                    </div>
                    <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: '0 0 0 4px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(180,81,30,0.12)', paddingTop: 10 }}>
                      {g.steps.map((r) => (
                        <li key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: DOT[r.action] || 'rgba(122,58,24,0.45)' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#1A0A00', lineHeight: 1.45 }}>{stepText(r, joiner)}</p>
                            <p style={{ margin: '1px 0 0', fontSize: 11.5, fontWeight: 600, color: '#7A3A18', overflowWrap: 'anywhere' }}>
                              {when(r.created_at)}{r.reference ? ` · Ref ${r.reference.replace(/^(PayMongo|GCash)\s+/i, '')}` : ''}{r.note && !['paymongo_succeeded', 'failed'].includes(r.action) ? ` · ${r.note}` : ''}
                            </p>
                            {r.proof && <RefundProofLink path={r.proof} label="GCash receipt" />}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
