import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Wallet, Upload, Undo2, ShieldCheck, History, X, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { formatPeso } from './tourUtils';
import { shrinkImage } from './imageCompress';
import { useAdminMe } from './adminMe';
import { refundWeatherThroughPaymongo, weatherRefundStatus } from './payments';

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
  + 'weather_refund_paymongo, paymongo_payment_id';

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
  const canPaymongo = !!b.paymongo_payment_id;
  const [method, setMethod] = useState(canPaymongo ? 'paymongo' : 'gcash');
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
      if (ref.replace(/\s/g, '').length < 6) { toast.error('Type the GCash reference', 'It\'s on the GCash receipt (at least 6 characters).'); return false; }
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
        method === 'paymongo' ? `Send ${amount} through PayMongo?` : `Send the ${amount} GCash refund?`,
        method === 'paymongo'
          ? `${b.booking_number}: PayMongo sends it back to the joiner's own payment (GCash, Maya or card). The joiner is notified.`
          : `${b.booking_number}: make sure ${amount} was really sent by GCash${gcash ? ` to ${gcash}` : ''} and the receipt matches. The joiner is notified and can see the receipt.`,
        'Send Refund',
      );
      if (!ok) return;
    }
    setBusy('submit');
    if (method === 'paymongo' && isMain) {
      await send('paymongo');
    } else if (await prepare()) {
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
        {isMain ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={approve} disabled={!!busy} style={smallBtn('#1F6B4A', '#FDF6EE')}>
              {busy === 'approve' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={13} />} Approve & Send
            </button>
            <button type="button" onClick={sendBack} disabled={!!busy} style={smallBtn('transparent', '#8C2F1C', '1px solid rgba(140,47,28,0.4)')}>
              <Undo2 size={13} /> Send back
            </button>
          </div>
        ) : <p style={{ ...note, fontWeight: 800 }}>Only the main admin can approve and send it.</p>}
      </div>
    );
  }

  const gcashReady = ref.replace(/\s/g, '').length >= 6 && !!file;
  const ready = method === 'paymongo' || gcashReady;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {canPaymongo && (
        <div role="radiogroup" aria-label="How to send the refund" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['paymongo', 'PayMongo (recommended)'], ['gcash', 'GCash by hand']].map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={method === k} onClick={() => setMethod(k)} style={{
              ...smallBtn(method === k ? '#1A0A00' : 'transparent', method === k ? '#E8A265' : '#7A3A18', `1px solid ${method === k ? '#1A0A00' : 'rgba(180,81,30,0.3)'}`), padding: '8px 12px',
            }}>{label}</button>
          ))}
        </div>
      )}
      {method === 'paymongo' ? (
        <p style={note}>PayMongo sends it back to the joiner's own payment (the GCash, Maya or card they paid with), and keeps a record of it.</p>
      ) : (
        <>
          <p style={note}>
            {canPaymongo ? 'Only if PayMongo can\'t be used. ' : ''}Send {amount} by GCash{gcash ? ` to ${gcash}` : ''}, then add the GCash reference and a screenshot of the GCash receipt.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input aria-label="GCash reference of the refund" placeholder="GCash reference no. *" value={ref} maxLength={40} onChange={(e) => setRef(e.target.value)}
              style={{ flex: '1 1 180px', minWidth: 0, background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 10, padding: '9px 10px', fontSize: 16, fontFamily: 'inherit', color: '#1A0A00' }} />
            <label style={{ ...smallBtn('#F2E4D0', '#7A3A18', '1px dashed rgba(180,81,30,0.45)'), maxWidth: '100%' }}>
              <Upload size={13} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{file ? file.name : 'GCash receipt *'}</span>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            </label>
          </div>
        </>
      )}
      <button type="button" onClick={submit} disabled={!!busy || !ready} title={ready ? undefined : 'Add the GCash reference and receipt first'}
        style={{ ...smallBtn(isMain ? '#B4511E' : '#3F5D62', '#FDF6EE', 'none', !!busy || !ready), alignSelf: 'flex-start' }}>
        {busy === 'submit' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : isMain ? <Wallet size={13} /> : <CheckCircle2 size={13} />}
        {isMain ? (method === 'paymongo' ? 'Send through PayMongo' : 'Send refund') : 'Send for approval'}
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
      b.weather_refund_method === 'paymongo'
        ? 'It goes back to Weather refunds to send. Sending it through PayMongo again counts what PayMongo already refunded, so it\'s never paid twice.'
        : 'It goes back to Weather refunds to send. Check the GCash receipt first: a GCash refund sent again is paid twice.',
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
      {b.weather_refund_proof && <RefundProofLink path={b.weather_refund_proof} />}
      {/ref_[A-Za-z0-9]+/.test(b.weather_refund_ref || '') && <PaymongoState bookingId={b.id} />}
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
const ACTION = {
  prepared: ['Prepared', '#8C5216'], sent: ['Sent', '#1F6B4A'], failed: ['Failed at PayMongo', '#8C2F1C'],
  received: ['Joiner received it', '#1F6B4A'], not_received: ["Joiner didn't get it", '#8C2F1C'],
  returned: ['Sent back', '#7A3A18'], reopened: ['Moved back to send again', '#7A3A18'], paymongo_succeeded: ['PayMongo finished', '#1F6B4A'],
};

export const RefundHistoryButton = () => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    supabase.from('refund_log').select('*').order('created_at', { ascending: false }).limit(300)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { toast.error("Couldn't load the refund history", error.message); setRows([]); return; }
        setRows(data || []);
      });
    return () => { alive = false; };
  }, [open]);
  const q = search.trim().toLowerCase();
  const shown = (rows || []).filter((r) => !q || [r.booking_number, r.by_name, r.reference, r.method, r.action].some((v) => String(v || '').toLowerCase().includes(q)));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={smallBtn('#1A0A00', '#E8A265')}><History size={13} /> Refund history</button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} />
          <div role="dialog" aria-label="Refund history" style={{ position: 'relative', width: '100%', maxWidth: 760, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: '#FDF6EE', borderRadius: 20, boxShadow: '0 24px 60px rgba(26,10,0,0.35)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(180,81,30,0.15)' }}>
              <History size={18} style={{ color: '#B4511E' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#1A0A00' }}>Refund history</p>
                <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: '#7A3A18' }}>Every refund step: who, how much, how and when. It can't be changed or deleted.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '10px 18px' }}>
              <input aria-label="Search the refund history" placeholder="Search booking no., name or reference" value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 10, padding: '9px 10px', fontSize: 16, fontFamily: 'inherit', color: '#1A0A00' }} />
            </div>
            <div style={{ overflowY: 'auto', padding: '0 18px 18px' }}>
              {rows === null ? <p style={note}>Loading…</p> : shown.length === 0 ? <p style={note}>No refund steps yet.</p> : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shown.map((r) => {
                    const [label, color] = ACTION[r.action] || [r.action, '#7A3A18'];
                    return (
                      <li key={r.id} style={{ background: '#FFFDF9', border: '1px solid rgba(180,81,30,0.12)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color }}>{label}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 800, color: '#1A0A00' }}>{r.booking_number || '—'}</span>
                          {r.amount != null && <strong style={{ fontSize: 13, color: '#1A0A00' }}>{formatPeso(r.amount)}</strong>}
                          {r.method && <span style={{ fontSize: 11.5, fontWeight: 800, color: '#7A3A18' }}>{r.method === 'gcash' ? 'GCash' : 'PayMongo'}</span>}
                          <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#7A3A18' }}>{when(r.created_at)}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18', overflowWrap: 'anywhere' }}>
                          By {r.by_name || '—'}{r.reference ? ` · ${r.reference}` : ''}{r.note ? ` · ${r.note}` : ''}
                        </p>
                        {r.proof && <RefundProofLink path={r.proof} label="GCash receipt" />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
