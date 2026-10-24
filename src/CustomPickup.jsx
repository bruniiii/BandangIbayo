import { useCallback, useEffect, useState } from 'react';
import { MapPinned, AlertTriangle, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { formatPeso } from './tourUtils';

// ─────────────────────────────────────────────
// CUSTOM PICKUP (pickup_requests table)
// Joiner: on a confirmed booking, ask to be picked up somewhere other than the
// regular pickup points (may cost extra, e.g. tolls). Admin: approve with any
// extra fee, or decline, from Tracking Management.
// ─────────────────────────────────────────────

const STATUS = {
  Requested: { Icon: Clock, color: '#8C5216', bg: 'rgba(232,162,101,0.18)', label: 'Waiting for the agency' },
  Approved: { Icon: CheckCircle2, color: '#2E6B4A', bg: 'rgba(46,107,74,0.1)', label: 'Approved' },
  Declined: { Icon: XCircle, color: '#8C2F1C', bg: 'rgba(140,47,28,0.08)', label: 'Declined' },
};

const FeeNotice = () => (
  <p style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, fontWeight: 700, color: '#8C5216', lineHeight: 1.55, margin: 0, background: 'rgba(232,162,101,0.16)', border: '1px solid rgba(232,162,101,0.4)', borderRadius: 12, padding: '9px 11px' }}>
    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
    <span>A custom pickup may come with an <strong>additional fee</strong> (for example toll fees or extra distance). We'll confirm the pickup and any fee before the trip.</span>
  </p>
);

const field = {
  width: '100%', boxSizing: 'border-box', background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.22)',
  borderRadius: 12, padding: '10px 12px', fontSize: 13, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
};
const btn = (primary, disabled) => ({
  border: primary ? 'none' : '1px solid rgba(180,81,30,0.3)', borderRadius: 999, padding: '9px 16px',
  fontSize: 11.5, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit',
  background: primary ? '#B4511E' : 'transparent', color: primary ? '#FDF6EE' : '#7A3A18',
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

// ── Joiner: in the booking details ──
export const CustomPickupSection = ({ booking, canRequest }) => {
  const [request, setRequest] = useState(undefined); // undefined = loading, null = none
  const [editing, setEditing] = useState(false);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('pickup_requests').select('*').eq('booking_id', booking.id).maybeSingle();
    setRequest(data || null);
  }, [booking.id]);

  useEffect(() => {
    let active = true;
    supabase.from('pickup_requests').select('*').eq('booking_id', booking.id).maybeSingle()
      .then(({ data }) => { if (active) setRequest(data || null); });
    return () => { active = false; };
  }, [booking.id]);

  if (request === undefined) return null;
  if (!request && !canRequest) return null;

  const startEdit = () => {
    setLocation(request?.location || '');
    setNote(request?.note || '');
    setAgreed(!!request);
    setEditing(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (location.trim().length < 5) { toast.error('Pickup location needed', 'Please enter the full address or place, e.g. "Jollibee, Commonwealth Ave, Quezon City".'); return; }
    if (!agreed) { toast.error('Please tick the box', 'You need to agree that an additional fee may apply.'); return; }
    setSaving(true);
    const row = { location: location.trim(), note: note.trim() || null };
    const { error } = request
      ? await supabase.from('pickup_requests').update(row).eq('booking_id', booking.id)
      : await supabase.from('pickup_requests').insert([{ booking_id: booking.id, ...row }]);
    setSaving(false);
    if (error) { toast.error("Couldn't send your request", error.message); return; }
    toast.success(request ? 'Request updated' : 'Request sent', "We'll let you know if we can pick you up there, and about any extra fee.");
    setEditing(false);
    load();
  };

  const withdraw = async () => {
    if (!(await confirmDialog({ title: 'Withdraw this request?', message: "You'll use the regular pickup points instead.", confirmLabel: 'Withdraw', cancelLabel: 'Keep Request', tone: 'danger' }))) return;
    const { error } = await supabase.from('pickup_requests').delete().eq('booking_id', booking.id);
    if (error) { toast.error("Couldn't withdraw it", error.message); return; }
    toast.info('Request withdrawn');
    setRequest(null);
  };

  const meta = request ? STATUS[request.status] || STATUS.Requested : null;

  return (
    <div style={{ background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.15)', borderRadius: 18, padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#A8481A', margin: 0 }}>
        <MapPinned size={14} /> Custom pickup
      </p>

      {editing ? (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: '#7A3A18' }}>
            Where should we pick you up?
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="e.g. Jollibee, Commonwealth Ave, Quezon City" style={{ ...field, marginTop: 6 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 800, color: '#7A3A18' }}>
            Landmark or note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. In front of the main gate" style={{ ...field, marginTop: 6 }} />
          </label>
          <FeeNotice />
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, fontWeight: 700, color: '#1A0A00', cursor: 'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 17, height: 17, accentColor: '#B4511E', flexShrink: 0, marginTop: 1 }} />
            I understand there may be an additional fee (such as tolls) for a custom pickup.
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" disabled={saving} style={btn(true, saving)}>
              {saving && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />} {request ? 'Save Changes' : 'Send Request'}
            </button>
            <button type="button" onClick={() => setEditing(false)} style={btn(false)}>Cancel</button>
          </div>
        </form>
      ) : request ? (
        <>
          <div style={{ background: meta.bg, borderRadius: 12, padding: '10px 12px' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 900, color: meta.color, margin: '0 0 4px' }}>
              <meta.Icon size={15} /> {meta.label}
            </p>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{request.location}</p>
            {request.note && <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '2px 0 0' }}>{request.note}</p>}
            {request.status === 'Approved' && (
              <p style={{ fontSize: 12.5, fontWeight: 800, color: '#1A0A00', margin: '6px 0 0' }}>
                {Number(request.extra_fee) > 0 ? `Additional fee: ${formatPeso(request.extra_fee)}` : 'No additional fee.'}
              </p>
            )}
            {request.admin_note && <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '4px 0 0' }}>From the agency: {request.admin_note}</p>}
          </div>
          {request.status === 'Requested' && canRequest && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={startEdit} style={btn(false)}>Edit</button>
              <button type="button" onClick={withdraw} style={btn(false)}>Withdraw</button>
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: 0, lineHeight: 1.55 }}>
            Can't make it to the regular pickup points? Ask us to pick you up somewhere else along the way.
          </p>
          <FeeNotice />
          <div><button type="button" onClick={startEdit} style={btn(true)}>Request Custom Pickup</button></div>
        </>
      )}
    </div>
  );
};

// ── Admin: in the tracking console of a tour ──
export const PickupRequestsAdmin = ({ tourId }) => {
  const [requests, setRequests] = useState(null);
  const [fees, setFees] = useState({});
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

  const fetchRequests = useCallback(() => supabase
    .from('pickup_requests')
    .select('*, bookings ( booking_number, full_name, contact_number, slots_booked )')
    .eq('tour_id', tourId)
    .order('created_at', { ascending: true }), [tourId]);
  const load = useCallback(async () => {
    const { data, error } = await fetchRequests();
    setRequests(error ? [] : data || []);
  }, [fetchRequests]);

  useEffect(() => {
    let active = true;
    fetchRequests().then(({ data, error }) => { if (active) setRequests(error ? [] : data || []); });
    return () => { active = false; };
  }, [fetchRequests]);

  const decide = async (r, status) => {
    const fee = fees[r.booking_id];
    if (status === 'Approved' && fee !== undefined && fee !== '' && !(Number(fee) >= 0)) {
      toast.error('Check the fee', 'Enter the extra fee in pesos, or leave it empty for none.'); return;
    }
    setBusy(r.booking_id);
    const { error } = await supabase.from('pickup_requests').update({
      status,
      extra_fee: status === 'Approved' && fee ? Number(fee) : null,
      admin_note: (notes[r.booking_id] || '').trim() || null,
    }).eq('booking_id', r.booking_id);
    setBusy(null);
    if (error) { toast.error("Couldn't save", error.message); return; }
    toast.success(status === 'Approved' ? 'Pickup approved' : 'Pickup declined', 'The joiner was notified.');
    load();
  };

  if (!requests || requests.length === 0) return null;

  return (
    <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, marginBottom: 18, border: '1px solid rgba(180,81,30,0.1)' }}>
      <h4 style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <MapPinned size={14} /> Custom pickup requests ({requests.length})
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {requests.map((r) => {
          const meta = STATUS[r.status] || STATUS.Requested;
          return (
            <div key={r.booking_id} style={{ border: '1px solid rgba(180,81,30,0.14)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 12.5, fontWeight: 900, color: '#1A0A00', margin: 0 }}>
                  {r.bookings?.full_name} · {r.bookings?.booking_number}
                  {r.bookings?.contact_number && <span style={{ fontWeight: 600, color: '#7A3A18' }}> · {r.bookings.contact_number}</span>}
                </p>
                <span style={{ fontSize: 11, fontWeight: 900, color: meta.color, background: meta.bg, borderRadius: 999, padding: '2px 10px' }}>{r.status}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{r.location}</p>
              {r.note && <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: 0 }}>{r.note}</p>}
              {r.status === 'Approved' && (
                <p style={{ fontSize: 12, fontWeight: 700, color: '#2E6B4A', margin: 0 }}>
                  {Number(r.extra_fee) > 0 ? `Extra fee: ${formatPeso(r.extra_fee)}` : 'No extra fee'}{r.admin_note ? ` · ${r.admin_note}` : ''}
                </p>
              )}
              {r.status === 'Requested' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input inputMode="decimal" placeholder="Extra fee ₱ (optional)" aria-label="Extra fee"
                    value={fees[r.booking_id] ?? ''} onChange={(e) => setFees((f) => ({ ...f, [r.booking_id]: e.target.value.replace(/[^\d.]/g, '') }))}
                    style={{ ...field, width: 150, padding: '7px 10px', fontSize: 12 }} />
                  <input placeholder="Note to joiner (optional)" aria-label="Note to joiner" maxLength={200}
                    value={notes[r.booking_id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.booking_id]: e.target.value }))}
                    style={{ ...field, flex: 1, minWidth: 160, padding: '7px 10px', fontSize: 12 }} />
                  <button type="button" disabled={busy === r.booking_id} onClick={() => decide(r, 'Approved')} style={btn(true, busy === r.booking_id)}>Approve</button>
                  <button type="button" disabled={busy === r.booking_id} onClick={() => decide(r, 'Declined')} style={btn(false, busy === r.booking_id)}>Decline</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', margin: '10px 0 0' }}>
        After approving, add the place as a pickup stop below so it shows on the joiners' tracking page.
      </p>
    </div>
  );
};
