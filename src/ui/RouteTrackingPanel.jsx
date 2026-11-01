import React, { Suspense, lazy, useState } from 'react';
import { Route, Clock, Loader2 } from 'lucide-react';
import { addMinutesToTime } from '../geo';

const RouteMap = lazy(() => import('./RouteMap'));

// ─────────────────────────────────────────────
// Tracking: the van's route with the pickup stops (in order), and for admins
// "Auto-fill ETAs": type when the van leaves, and every stop's ETA is worked
// out from the driving time saved with the tour.
//   tour:  the tour (tour.route from the tour form)
//   stops: its pickup stops (lat/lng, minutes_from_start, status)
//   onAutoFill(updates): admin only; updates = [{ id, scheduled_time }]
// ─────────────────────────────────────────────

const label = { fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: 0, display: 'flex', alignItems: 'center', gap: 6 };

// "21:00" (time input) → "9:00 PM"
const to12h = (hhmm) => addMinutesToTime(hhmm, 0);

const RouteTrackingPanel = ({ tour, stops = [], onAutoFill = null, height = 260 }) => {
  const [departure, setDeparture] = useState('');
  const [busy, setBusy] = useState(false);
  const route = tour?.route || null;
  const mapped = stops.filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)));
  const timed = stops.filter((s) => Number.isFinite(Number(s.minutes_from_start)));
  if (!route && mapped.length === 0) return null;

  const preview = departure ? timed.map((s) => `${s.location_name} ${addMinutesToTime(departure, Number(s.minutes_from_start))}`) : [];

  const fill = async () => {
    if (!departure || !onAutoFill) return;
    setBusy(true);
    await onAutoFill(timed.map((s) => ({ id: s.id, location_name: s.location_name, scheduled_time: addMinutesToTime(departure, Number(s.minutes_from_start)) })), to12h(departure));
    setBusy(false);
  };

  return (
    <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(180,81,30,0.1)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={label}><Route size={14} /> The van's route</p>
      {route?.start && route?.end && (
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#7A3A18', lineHeight: 1.5 }}>
          From <strong style={{ color: '#1A0A00' }}>{route.start.name}</strong> to <strong style={{ color: '#1A0A00' }}>{route.end.name}</strong>
          {route.distance_km ? ` · ${route.distance_km} km` : ''}
        </p>
      )}
      <Suspense fallback={<div style={{ height, borderRadius: 16, background: '#F2E4D0' }} />}>
        <RouteMap route={route} stops={mapped.map((s) => ({ name: s.location_name, lat: s.lat, lng: s.lng, status: s.status }))} height={height} />
      </Suspense>

      {onAutoFill && timed.length > 0 && (
        <div style={{ background: 'rgba(180,81,30,0.06)', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 12, padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ ...label, letterSpacing: '0.14em' }}><Clock size={14} /> Auto-fill ETAs</p>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>
            When does the van leave {route?.start?.name ? <strong>{route.start.name}</strong> : 'the starting point'}? Every stop's ETA is worked out from the driving time.
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
      )}
    </div>
  );
};

export default RouteTrackingPanel;
