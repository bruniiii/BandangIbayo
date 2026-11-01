import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Route, Loader2, CheckSquare, Square } from 'lucide-react';
import PlaceSearch from './PlaceSearch';
import { findRoute } from '../routeApi';
import { spotsAlongRoute } from '../geo';

const RouteMap = lazy(() => import('./RouteMap'));

// ─────────────────────────────────────────────
// Tour form: the van's starting point and the destination → the saved pickup
// spots along that road, in the order the van passes them, to tick.
//   spots:  saved pickup spots [{ name, lat, lng }]
//   route:  { start, end, coords, distance_km, duration_min } or null
//   picked: the tour's pickup point names (ticked here or typed below)
// ─────────────────────────────────────────────

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const hours = (min) => (min >= 60 ? `${Math.floor(min / 60)} hr ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`);

const RoutePickupPicker = ({ spots, route, onRouteChange, picked, onPickedChange }) => {
  const [start, setStart] = useState(route?.start || null);
  const [end, setEnd] = useState(route?.end || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const along = useMemo(() => (route?.coords ? spotsAlongRoute(spots, route.coords, 2) : []), [route, spots]);
  const isPicked = (name) => picked.some((p) => same(p, name));
  const toggle = (name) => onPickedChange(isPicked(name) ? picked.filter((p) => !same(p, name)) : [...picked, name]);

  const find = async () => {
    if (!start || !end) { setError('Choose the starting point and the destination first.'); return; }
    setBusy(true); setError('');
    const res = await findRoute([start, end]);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onRouteChange({ start, end, coords: res.data.coords, distance_km: res.data.distance_km, duration_min: res.data.duration_min });
  };

  const changePlace = (which, value) => {
    if (which === 'start') setStart(value); else setEnd(value);
    // A new place means a new road: find it again.
    if (route) onRouteChange(null);
  };

  const pickedAlong = along.filter((s) => isPicked(s.name));
  const unpickedAlong = along.filter((s) => !isPicked(s.name));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Route size={14} /> The van's route
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>
          Where the van leaves from and where it's going. The saved pickup spots on the way are listed for you to tick.
        </p>
      </div>
      <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <PlaceSearch label="Starting point" name="route_start" value={start} onChange={(v) => changePlace('start', v)} placeholder="e.g. SM Mall of Asia, Pasay" />
        <PlaceSearch label="Destination" name="route_end" value={end} onChange={(v) => changePlace('end', v)} placeholder="e.g. Ambangeg Ranger Station, Bokod" />
      </div>
      {!route && (
        <button type="button" onClick={find} disabled={busy || !start || !end} style={{
          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 999, border: 'none',
          cursor: busy || !start || !end ? 'not-allowed' : 'pointer', opacity: !start || !end ? 0.5 : 1,
          background: '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Route size={14} />} Find pickup points along the route</button>
      )}
      {error && <span role="alert" style={{ fontSize: 12, fontWeight: 700, color: '#8C2F1C' }}>{error}</span>}

      {route && (
        <>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#1A0A00' }}>
            {route.distance_km} km · about {hours(route.duration_min)} of driving
          </p>
          <Suspense fallback={<div style={{ height: 280, borderRadius: 16, background: '#F2E4D0' }} />}>
            <RouteMap route={route} stops={pickedAlong} others={unpickedAlong} height={280} />
          </Suspense>
          {along.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#8C5216', background: 'rgba(232,162,101,0.2)', borderRadius: 10, padding: '10px 12px' }}>
              None of the saved pickup spots is along this route. Add spots in Pickup Spots, or type the pickup points below.
            </p>
          ) : (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7A3A18' }}>
                On the van's way — tick the pickup points
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {along.map((s, i) => (
                  <li key={s.id ?? s.name}>
                    <button type="button" role="checkbox" aria-checked={isPicked(s.name)} onClick={() => toggle(s.name)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                      background: isPicked(s.name) ? 'rgba(180,81,30,0.1)' : '#FDF6EE', border: `1px solid ${isPicked(s.name) ? '#B4511E' : 'rgba(180,81,30,0.18)'}`,
                      borderRadius: 12, padding: '10px 12px',
                    }}>
                      {isPicked(s.name) ? <CheckSquare size={18} color="#B4511E" /> : <Square size={18} color="#7A3A18" />}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>{i + 1}. {s.name}</span>
                        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#7A3A18' }}>
                          {s.alongKm.toFixed(0)} km from the start{s.offKm >= 0.5 ? ` · ${s.offKm.toFixed(1)} km off the road` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RoutePickupPicker;
