import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Route, Loader2, CheckSquare, Square, Fuel, ShoppingBag, Bus, Utensils, Star } from 'lucide-react';
import PlaceSearch from './PlaceSearch';
import { findRoute, findPlacesAlongRoute } from '../routeApi';
import { placeOnRoute, distanceKm } from '../geo';

const RouteMap = lazy(() => import('./RouteMap'));

// ─────────────────────────────────────────────
// Tour form: the van's starting point and the destination → every possible
// pickup point along that road, in the order the van passes them (start to
// destination, so Manila → Baguio lists them south to north and Baguio →
// Manila north to south), to tick:
//   • the saved pickup spots (Pickup Spots)
//   • places on the road from OpenStreetMap: gas stations, malls, bus
//     terminals and fast food
//   spots:  saved pickup spots [{ name, lat, lng }]
//   route:  { start, end, coords, distance_km, duration_min } or null
//   picked: the tour's pickup point names (ticked here or typed below)
//   onAddPlace(place): a ticked map place, to save as a pickup spot
// ─────────────────────────────────────────────

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const hours = (min) => (min >= 60 ? `${Math.floor(min / 60)} hr ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`);

const KINDS = [
  { key: 'saved', label: 'Saved spots', icon: Star },
  { key: 'gas', label: 'Gas stations', icon: Fuel },
  { key: 'mall', label: 'Malls', icon: ShoppingBag },
  { key: 'terminal', label: 'Bus terminals', icon: Bus },
  { key: 'food', label: 'Fast food', icon: Utensils },
];

const RoutePickupPicker = ({ spots, route, onRouteChange, picked, onPickedChange, onAddPlace }) => {
  const [start, setStart] = useState(route?.start || null);
  const [end, setEnd] = useState(route?.end || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [places, setPlaces] = useState(null); // OpenStreetMap places along the road
  const [placesError, setPlacesError] = useState('');
  const [show, setShow] = useState({ saved: true, gas: true, mall: true, terminal: true, food: false });

  // Places on the road: looked up once per route.
  useEffect(() => {
    if (!route?.coords) return undefined;
    let alive = true;
    (async () => {
      setPlaces(null); setPlacesError('');
      const res = await findPlacesAlongRoute(route.coords);
      if (!alive) return;
      if (res.ok) setPlaces(res.data.places || []);
      else { setPlaces([]); setPlacesError(res.error); }
    })();
    return () => { alive = false; };
  }, [route]);

  // Everything along the road, in the order the van passes it.
  const along = useMemo(() => {
    if (!route?.coords) return [];
    const saved = spots
      .map((s) => ({ ...s, kind: 'saved', ...placeOnRoute(s, route.coords) }))
      .filter((s) => s.offKm <= 2);
    const fromMap = [];
    (places || []).forEach((p) => {
      const at = placeOnRoute(p, route.coords);
      if (at.offKm > 0.5) return;
      // Already a saved spot (within 60 m), or the same place listed twice (within 1 km).
      if (saved.some((s) => distanceKm(s, p) < 0.06)) return;
      if (fromMap.some((q) => same(q.baseName, p.name) && distanceKm(q, p) < 1)) return;
      fromMap.push({ ...p, ...at, baseName: p.name });
    });
    // Names joiners can tell apart: "Petron, Bocaue", or "Petron (km 45)".
    const label = (p) => (p.city ? `${p.baseName}, ${p.city}` : p.baseName);
    fromMap.forEach((p) => {
      const twins = fromMap.filter((q) => same(label(q), label(p)));
      p.name = twins.length > 1 ? `${label(p)} (km ${Math.round(p.alongKm)})` : label(p);
    });
    return [...saved, ...fromMap].sort((a, b) => a.alongKm - b.alongKm);
  }, [route, spots, places]);

  const isPicked = (name) => picked.some((p) => same(p, name));
  const toggle = (s) => {
    if (isPicked(s.name)) { onPickedChange(picked.filter((p) => !same(p, s.name))); return; }
    onPickedChange([...picked, s.name]);
    if (s.kind !== 'saved') onAddPlace?.({ name: s.name, address: s.city || '', lat: s.lat, lng: s.lng });
  };

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

  const counts = Object.fromEntries(KINDS.map((k) => [k.key, along.filter((s) => s.kind === k.key).length]));
  // Ticked ones always show, whatever the filter.
  const shown = along.filter((s) => show[s.kind] || isPicked(s.name));
  const pickedAlong = along.filter((s) => isPicked(s.name));
  const unpickedShown = shown.filter((s) => !isPicked(s.name));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Route size={14} /> The van's route
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>
          Where the van leaves from and where it's going. Every possible pickup point on the way is listed, from the start to the destination, for you to tick.
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
          <Suspense fallback={<div style={{ height: 300, borderRadius: 16, background: '#F2E4D0' }} />}>
            <RouteMap route={route} stops={pickedAlong} others={unpickedShown} height={300} />
          </Suspense>

          {/* Which kinds of places to list. */}
          <div role="group" aria-label="Show these places" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {KINDS.map(({ key, label, icon: KindIcon }) => { const Icon = KindIcon; return (
              <button key={key} type="button" aria-pressed={show[key]} onClick={() => setShow((v) => ({ ...v, [key]: !v[key] }))} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase',
                background: show[key] ? '#1A0A00' : '#FDF6EE', color: show[key] ? '#E8A265' : '#7A3A18',
                border: `1px solid ${show[key] ? '#1A0A00' : 'rgba(180,81,30,0.25)'}`,
              }}><Icon size={13} /> {label} ({counts[key]})</button>
            ); })}
          </div>

          {places === null && (
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Looking for gas stations, malls and terminals on the way…
            </p>
          )}
          {placesError && (
            <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#8C2F1C' }}>
              Couldn't list the places on the road ({placesError}). Your saved spots are still listed below.
            </p>
          )}

          {shown.length === 0 && places !== null ? (
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#8C5216', background: 'rgba(232,162,101,0.2)', borderRadius: 10, padding: '10px 12px' }}>
              Nothing to list with these filters. Turn on more kinds of places above, or type the pickup points below.
            </p>
          ) : shown.length > 0 && (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7A3A18' }}>
                On the van's way, from {route.start?.name?.split(',')[0] || 'the start'} to {route.end?.name?.split(',')[0] || 'the destination'} — tick the pickup points ({pickedAlong.length} ticked)
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
                {shown.map((s) => {
                  const kind = KINDS.find((k) => k.key === s.kind) || KINDS[0];
                  const Icon = kind.icon;
                  const on = isPicked(s.name);
                  return (
                    <li key={`${s.kind}-${s.name}-${s.lat}`}>
                      <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(s)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                        background: on ? 'rgba(180,81,30,0.1)' : '#FDF6EE', border: `1px solid ${on ? '#B4511E' : 'rgba(180,81,30,0.18)'}`,
                        borderRadius: 12, padding: '9px 12px',
                      }}>
                        {on ? <CheckSquare size={18} color="#B4511E" /> : <Square size={18} color="#7A3A18" />}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>{s.name}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: '#7A3A18' }}>
                            <Icon size={12} /> {kind.label.replace(/s$/, '')} · {Math.round(s.alongKm)} km from the start
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RoutePickupPicker;
