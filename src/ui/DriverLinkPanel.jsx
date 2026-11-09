import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, Copy, RotateCcw, Loader2, ExternalLink, MessageSquare, Share2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from './toast';
import { confirmDialog } from './ConfirmDialog';

// ─────────────────────────────────────────────
// Tracking Management: the tour's private driver link. Send it to the driver
// (e.g. on Messenger); on the trip day they open it on their phone and tap
// Start Trip, and the van shows live on everyone's map. Resetting it makes the
// old link stop working. Hidden before the 20261201 database update.
// ─────────────────────────────────────────────

const btn = (dark) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 999, cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none',
  background: dark ? '#1A0A00' : 'transparent', color: dark ? '#E8A265' : '#7A3A18',
  border: dark ? 'none' : '1px solid rgba(180,81,30,0.3)',
});

const DriverLinkPanel = ({ tourId }) => {
  const [token, setToken] = useState(null);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [driver, setDriver] = useState(null); // { name, phone } from the tour's Fleet & Driver details

  const load = useCallback(async () => {
    if (!tourId) return;
    const [{ data, error }, { data: v }] = await Promise.all([
      supabase.from('tour_driver_links').select('token').eq('tour_id', tourId).maybeSingle(),
      supabase.from('tour_vehicles').select('driver_name, driver_contact').eq('tour_id', tourId).maybeSingle(),
    ]);
    setAvailable(!error);
    setToken(data?.token || null);
    setDriver(v?.driver_contact ? { name: v.driver_name || 'the driver', phone: v.driver_contact } : null);
  }, [tourId]);
  // Loads the link when the tour opens; its state updates after the request returns.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // The phone's share menu (Messenger, Viber…), or copy when there's none.
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Bandang IBAYO driver link', text: 'Your trip link. On the trip, open it and tap Start Trip.', url: link }); return; }
      catch (err) { if (err?.name === 'AbortError') return; }
    }
    copy();
  };

  if (!available) return null;
  const link = token ? `${window.location.origin}/driver/${token}` : '';

  const make = async () => {
    if (token && !(await confirmDialog({
      title: 'Make a new driver link?',
      message: 'The old link stops working. Send the new one to the driver.',
      confirmLabel: 'New Link', cancelLabel: 'Keep Old Link',
    }))) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('create_driver_link', { p_tour_id: tourId });
    setBusy(false);
    if (error) { toast.error("Couldn't make the driver link", error.message); return; }
    setToken(data);
    toast.success(token ? 'New driver link made' : 'Driver link made', 'Copy it and send it to the driver.');
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success('Link copied', 'Paste it in Messenger for the driver.'); }
    catch { toast.info('Copy the link', link); }
  };

  return (
    <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(180,81,30,0.1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Smartphone size={14} /> Driver link (live van location)
      </p>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>
        Send this link to the driver. On the trip, they open it on their phone and tap <strong>Start Trip</strong>: the van shows live on the map, each stop is marked Arrived when the van gets there, and the joiners there are notified. It works from the day before the tour until its last day.
      </p>
      {token ? (
        <>
          <code style={{ display: 'block', background: '#F2E4D0', borderRadius: 10, padding: '9px 11px', fontSize: 12, color: '#1A0A00', overflowWrap: 'anywhere' }}>{link}</code>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={copy} style={btn(true)}><Copy size={13} /> Copy Link</button>
            {/* Send it straight to the driver: a text message to their number, or any app (Messenger…) */}
            {driver && (
              <a href={`sms:${driver.phone}?&body=${encodeURIComponent(`Hi ${driver.name}! Here's your Bandang IBAYO trip link. On the trip, open it and tap Start Trip: ${link}`)}`} style={btn(false)}>
                <MessageSquare size={13} /> Text {driver.name.split(' ')[0]}
              </a>
            )}
            <button type="button" onClick={share} style={btn(false)}><Share2 size={13} /> Share</button>
            <a href={link} target="_blank" rel="noreferrer" style={btn(false)}><ExternalLink size={13} /> Open</a>
            <button type="button" onClick={make} disabled={busy} style={btn(false)}>{busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={13} />} New Link</button>
          </div>
        </>
      ) : (
        <button type="button" onClick={make} disabled={busy} style={{ ...btn(true), alignSelf: 'flex-start' }}>
          {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Smartphone size={13} />} Make Driver Link
        </button>
      )}
    </div>
  );
};

export default DriverLinkPanel;
