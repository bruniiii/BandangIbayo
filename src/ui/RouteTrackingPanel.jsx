import React, { useEffect, useState } from 'react';
import { Route, Clock, Loader2 } from 'lucide-react';
import { addMinutesToTime, distanceKm, liveEtas } from '../geo';
import { agoText } from '../useVanLocation';

// ─────────────────────────────────────────────
// Tracking: the van's route in words (from → to) and the live van status
// (no map: kept simple), and for admins
// (ETAs fill themselves in from the itinerary; EtaAutoFill below changes the
// departure time by hand.)
//   tour:  the tour (tour.route from the tour form)
//   stops: its pickup stops (lat/lng, minutes_from_start, status)
//   onAutoFill(updates): admin only; updates = [{ id, scheduled_time }]
//   van:    the live van location (useVanLocation), or null
//   myStop: the joiner's pickup point name (shows how far the van is from it)
// ─────────────────────────────────────────────

const label = { fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: 0, display: 'flex', alignItems: 'center', gap: 6 };

// "21:00" (time input) → "9:00 PM"
const to12h = (hhmm) => addMinutesToTime(hhmm, 0);

const RouteTrackingPanel = ({ tour, stops = [], onAutoFill = null, van = null, myStop = '' }) => {
  // A clock for "updated 2 min ago" (ticks every 30 seconds).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const route = tour?.route || null;
  const mapped = stops.filter((s) => s.lat != null && s.lng != null && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)));
  if (!route?.start && !van && !onAutoFill) return null;

  // Live van: how long ago it was seen, and how far it is from the joiner's stop.
  const vanLive = van && Number.isFinite(Number(van.lat));
  const stale = vanLive && now - new Date(van.updated_at).getTime() > 10 * 60000;
  const mine = myStop ? mapped.find((s) => s.location_name.trim().toLowerCase() === myStop.trim().toLowerCase()) : null;
  const mineKm = vanLive && mine && mine.status !== 'ARRIVED' ? distanceKm({ lat: Number(van.lat), lng: Number(van.lng) }, { lat: Number(mine.lat), lng: Number(mine.lng) }) : null;
  const speed = Number(van?.speed_kmh) >= 10 ? Number(van.speed_kmh) : 30;
  const mineLive = mine && vanLive ? liveEtas(stops, van, now)[mine.id] : null;
  const mineMin = mineLive ? mineLive.minutes : mineKm != null ? Math.max(1, Math.round((mineKm / speed) * 60)) : null;

  return (
    <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(180,81,30,0.1)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={label}><Route size={14} /> The van's route</p>
      {route?.start && route?.end && (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#7A3A18', lineHeight: 1.5 }}>
          From <strong style={{ color: '#1A0A00' }}>{route.start.name}</strong> to <strong style={{ color: '#1A0A00' }}>{route.end.name}</strong>
          {route.distance_km ? ` · ${route.distance_km} km` : ''}
        </p>
      )}
      {vanLive && (
        <div role="status" style={{ background: stale ? 'rgba(232,162,101,0.2)' : 'rgba(46,125,50,0.12)', border: `1px solid ${stale ? 'rgba(232,162,101,0.6)' : 'rgba(46,125,50,0.35)'}`, borderRadius: 12, padding: '10px 12px', fontSize: 12.5, fontWeight: 800, color: stale ? '#8C5216' : '#1F5E36', lineHeight: 1.5 }}>
          🚐 {stale ? `The van's location was last updated ${agoText(van.updated_at, now)}.` : `Live: the van's location was updated ${agoText(van.updated_at, now)}.`}
          {mineKm != null && !stale && (
            <span style={{ display: 'block', color: '#1A0A00' }}>
              About {mineKm < 1 ? `${Math.round(mineKm * 1000)} m` : `${mineKm.toFixed(1)} km`} from your stop ({mine.location_name}) · about {mineMin} min{mineLive ? ` (around ${mineLive.time})` : ''}
            </span>
          )}
        </div>
      )}

      {onAutoFill && <EtaAutoFill route={route} stops={stops} onAutoFill={onAutoFill} />}
    </div>
  );
};

// "Change the departure time": every stop's ETA from a new departure time and
// the driving time saved with the tour (admins; used in Manual override).
export const EtaAutoFill = ({ route, stops = [], onAutoFill }) => {
  const [departure, setDeparture] = useState('');
  const [busy, setBusy] = useState(false);
  const timed = stops.filter((s) => s.minutes_from_start != null && Number.isFinite(Number(s.minutes_from_start)));
  if (!onAutoFill || timed.length === 0) return null;
  const preview = departure ? timed.map((s) => `${s.location_name} ${addMinutesToTime(departure, Number(s.minutes_from_start))}`) : [];
  const fill = async () => {
    if (!departure) return;
    setBusy(true);
    await onAutoFill(timed.map((s) => ({ id: s.id, location_name: s.location_name, scheduled_time: addMinutesToTime(departure, Number(s.minutes_from_start)) })), to12h(departure));
    setBusy(false);
  };
  return (
    <div style={{ background: 'rgba(180,81,30,0.06)', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12, padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ ...label, letterSpacing: '0.14em' }}><Clock size={14} /> Change the departure time</p>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>
        When does the van leave {route?.start?.name ? <strong>{route.start.name}</strong> : 'the starting point'}? Every stop's ETA is worked out again from the driving time.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="time" name="departure_time" value={departure} onChange={(e) => setDeparture(e.target.value)} aria-label="Departure time" style={{
          background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 10, padding: '9px 12px', fontSize: 16, fontWeight: 700, color: '#1A0A00', fontFamily: 'inherit',
        }} />
        <button type="button" onClick={fill} disabled={!departure || busy} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 999, border: 'none',
          cursor: !departure || busy ? 'not-allowed' : 'pointer', opacity: departure ? 1 : 0.5,
          background: '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Clock size={14} />} Fill In ETAs</button>
      </div>
      {preview.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1A0A00', lineHeight: 1.6 }}>{preview.join(' · ')}</p>
      )}
    </div>
  );
};

export default RouteTrackingPanel;
