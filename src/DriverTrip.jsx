import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Navigation, Square, MapPin, CheckCircle2, AlertTriangle, Loader2, Smartphone } from 'lucide-react';
import { supabase } from './supabaseClient';
import { confirmDialog } from './ui/ConfirmDialog';
import { to24h, addMinutesToTime } from './geo';


// ─────────────────────────────────────────────
// DRIVER'S TRIP PAGE (/driver/<link>): the driver opens the private link from
// Tracking Management on their phone and taps Start Trip. The phone's
// location is sent about every 20 seconds; joiners see the van move, and each
// pickup stop is marked Arrived when the van gets there. No account needed.
// Keep the page open, the screen on and the phone charging.
// ─────────────────────────────────────────────

const SEND_EVERY_MS = 20000;

const DriverTrip = () => {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [last, setLast] = useState(null);       // { lat, lng, at, accuracy }
  const [status, setStatus] = useState(null);   // the server's answer: next stop, km, arrived…
  const [gpsError, setGpsError] = useState('');
  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const latestRef = useRef(null);  // the phone's newest location
  const wakeRef = useRef(null);

  const loadInfo = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('driver_trip_info', { p_token: token });
    if (err) { setError(err.message); return; }
    setInfo(data);
  }, [token]);

  // The trip's details when the page opens; its state updates after the request returns.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadInfo(); }, [loadInfo]);

  // Keeps the screen on while sharing (phones pause the location when it sleeps).
  const keepAwake = async () => {
    try { wakeRef.current = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
  };
  const [pausedNote, setPausedNote] = useState('');
  const hiddenAtRef = useRef(null);

  // Sends the newest location (every 20 seconds, moving or parked).
  const send = useCallback(async () => {
    const pos = latestRef.current;
    if (!pos) return;
    const { latitude, longitude, accuracy, speed, heading } = pos.coords;
    setLast({ lat: latitude, lng: longitude, at: new Date(), accuracy });
    const { data, error: err } = await supabase.rpc('share_van_location', {
      p_token: token, p_lat: latitude, p_lng: longitude,
      p_accuracy: Number.isFinite(accuracy) ? accuracy : null,
      p_speed: Number.isFinite(speed) && speed !== null ? speed * 3.6 : null,
      p_heading: Number.isFinite(heading) && heading !== null ? heading : null,
    });
    if (err) { setGpsError(err.message); return; }
    setGpsError('');
    setStatus(data);
    if (data?.arrived) loadInfo();
  }, [token, loadInfo]);

  // Follows the phone's location (sends the first one right away).
  const watch = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const first = !latestRef.current;
        latestRef.current = pos;
        if (first) send();
      },
      (err) => setGpsError(err.code === 1
        ? 'Location is blocked. Allow location for this website in the phone\'s browser settings, then tap Start Trip again.'
        : 'Waiting for the GPS signal… Make sure Location is turned on.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    );
  }, [send]);

  const start = async () => {
    if (!('geolocation' in navigator)) { setGpsError("This phone's browser can't share its location."); return; }
    setGpsError('');
    await keepAwake();
    watch();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(send, SEND_EVERY_MS);
    setSharing(true);
  };

  // Phones stop the location while the screen is off or another app is open.
  // Back on this page: keep the screen on again, follow the location again and
  // send it right away, and tell the driver it was paused.
  useEffect(() => {
    const onChange = () => {
      if (!sharing) return;
      if (document.visibilityState === 'hidden') { hiddenAtRef.current = Date.now(); return; }
      keepAwake();
      latestRef.current = null; // the next location is sent at once
      watch();
      const away = hiddenAtRef.current ? Math.round((Date.now() - hiddenAtRef.current) / 60000) : 0;
      hiddenAtRef.current = null;
      if (away >= 1) setPausedNote(`The location was paused for about ${away} min while this page wasn't on screen. It's sharing again now — keep this page open.`);
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [sharing, watch]);

  const stop = async () => {
    if (!(await confirmDialog({
      title: 'End the trip?',
      message: 'The van leaves the joiners\' map and its location stops being shared.',
      confirmLabel: 'End Trip', cancelLabel: 'Keep Sharing', tone: 'danger',
    }))) return;
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    clearInterval(timerRef.current);
    latestRef.current = null;
    try { await wakeRef.current?.release(); } catch { /* already released */ }
    setSharing(false);
    await supabase.rpc('end_van_trip', { p_token: token });
    loadInfo();
  };

  useEffect(() => () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    clearInterval(timerRef.current);
  }, []);

  const stops = info?.stops || [];
  const next = stops.find((s) => s.status !== 'ARRIVED');

  // Live times, like the joiners see: the next stop = now + the driving time
  // the server worked out from the van's location; each later stop keeps its
  // gap after the next one (from the saved times). Before the trip starts (or
  // with no location yet), the saved times show.
  const minsOf = (t) => { const v = to24h(t || ''); if (!v) return null; const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  const liveTimes = {};
  if (sharing && last && next && Number.isFinite(Number(status?.minutes))) {
    const nowManila = new Date(last.at.getTime() + 8 * 3600000);
    const nowMin = nowManila.getUTCHours() * 60 + nowManila.getUTCMinutes();
    const nextIdx = stops.indexOf(next);
    const base = minsOf(next.scheduled_time);
    stops.slice(nextIdx).forEach((st, k) => {
      if (st.status === 'ARRIVED') return;
      let add = Number(status.minutes);
      if (k > 0) {
        const m = minsOf(st.scheduled_time);
        if (m == null || base == null) return;
        add += ((m - base) + 1440) % 1440; // (past midnight too)
      }
      const at = (nowMin + add) % 1440;
      liveTimes[nextIdx + k] = addMinutesToTime(`${Math.floor(at / 60)}:${String(at % 60).padStart(2, '0')}`, 0);
    });
  }
  const page = { minHeight: '100dvh', background: '#FDF6EE', fontFamily: "'Outfit', 'Inter', system-ui, sans-serif", padding: 'calc(20px + env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom))', boxSizing: 'border-box' };

  if (error) {
    return (
      <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <AlertTriangle size={40} color="#8C2F1C" />
          <h1 style={{ fontSize: 20, color: '#1A0A00', margin: 0 }}>This link can't be used now</h1>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#7A3A18', margin: 0, lineHeight: 1.5 }}>{error}</p>
        </div>
      </div>
    );
  }
  if (!info) {
    return <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={30} color="#B4511E" style={{ animation: 'spin 1s linear infinite' }} /></div>;
  }

  return (
    <div style={page}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A' }}>Bandang IBAYO · Driver</p>
          <h1 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900, color: '#1A0A00' }}>{info.tour?.title}</h1>
        </div>

        {/* Big status + Start / End */}
        <div style={{ background: sharing ? '#1F6B4A' : '#1A0A00', color: '#FDF6EE', borderRadius: 20, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Navigation size={16} /> {sharing ? 'Sharing the van\'s location' : 'Not sharing yet'}
          </p>
          {sharing && next && (
            <p style={{ margin: 0, fontSize: 18, fontWeight: 900, lineHeight: 1.3 }}>
              Next stop: {next.name}
              {status?.km != null && <span style={{ display: 'block', fontSize: 13, fontWeight: 700, opacity: 0.9 }}>About {Number(status.km) < 1 ? `${Math.round(Number(status.km) * 1000)} m` : `${Number(status.km).toFixed(1)} km`} · {status.minutes} min{liveTimes[stops.indexOf(next)] ? ` · ≈ ${liveTimes[stops.indexOf(next)]}` : ''}</span>}
            </p>
          )}
          {sharing && !next && <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>All pickup stops done. Tap End Trip when everyone has arrived.</p>}
          {status?.arrived && <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#BFF0D6', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={15} /> Arrived at {status.arrived}. Joiners there were told to board.</p>}
          {last && <p style={{ margin: 0, fontSize: 12, fontWeight: 600, opacity: 0.85 }}>Last sent {last.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{last.accuracy ? ` · accurate to about ${Math.round(last.accuracy)} m` : ''}</p>}
          {pausedNote && sharing && <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#FFE2B8' }}>{pausedNote}</p>}
          {gpsError && <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#FFD3C2' }}>{gpsError}</p>}
          {!sharing ? (
            <button type="button" onClick={start} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '18px', borderRadius: 16, border: 'none', cursor: 'pointer',
              background: '#E8A265', color: '#1A0A00', fontFamily: 'inherit', fontWeight: 900, fontSize: 16, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}><Navigation size={20} /> Start Trip</button>
          ) : (
            <button type="button" onClick={stop} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px', borderRadius: 16, border: '2px solid #FDF6EE', cursor: 'pointer',
              background: 'transparent', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}><Square size={16} /> End Trip</button>
          )}
        </div>

        <div style={{ background: '#F2E4D0', borderRadius: 14, padding: '12px 14px', fontSize: 12.5, fontWeight: 700, color: '#7A3A18', display: 'flex', gap: 8, lineHeight: 1.5 }}>
          <Smartphone size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          Keep this page open with the screen on, and the phone plugged in. The location stops if the screen turns off or you switch apps.
        </div>

        {stops.some((s) => s.lat == null || s.lng == null) && (
          <div role="note" style={{ background: 'rgba(232,162,101,0.2)', borderRadius: 14, padding: '10px 14px', fontSize: 12.5, fontWeight: 700, color: '#8C5216', lineHeight: 1.5 }}>
            Some pickup stops aren't pinned on the map yet, so they can't be marked Arrived by themselves. The admin can pin them in Tour Management → Edit → The Van's Route (search, Choose on map, or "Pickup point not in the list? Pin it on the map"). The van's location is still shared.
          </div>
        )}


        <div>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#A8481A' }}>Pickup stops</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stops.map((s, i) => (
              <li key={`${s.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, background: s.status === 'ARRIVED' ? 'rgba(31,107,74,0.1)' : '#FFF', border: '1px solid rgba(180,81,30,0.15)', borderRadius: 12, padding: '10px 12px' }}>
                {s.status === 'ARRIVED' ? <CheckCircle2 size={18} color="#1F6B4A" /> : <MapPin size={18} color="#B4511E" />}
                <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: '#1A0A00' }}>{i + 1}. {s.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: liveTimes[i] ? '#1F6B4A' : '#7A3A18', textAlign: 'right' }}>
                  {s.status === 'ARRIVED' ? 'Arrived' : liveTimes[i] ? <>≈ {liveTimes[i]}<span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: '#7A3A18' }}>live</span></> : s.scheduled_time || ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
};

export default DriverTrip;
