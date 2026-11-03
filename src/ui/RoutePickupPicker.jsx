import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Route, Loader2, CheckSquare, Square, Star, Info, Search, MapPin, Plus } from 'lucide-react';
import PlaceSearch from './PlaceSearch';
import { findRoute, searchPlaces } from '../routeApi';
import { placeOnRoute } from '../geo';

const RouteMap = lazy(() => import('./RouteMap'));

// ─────────────────────────────────────────────
// Tour form: the van's starting point and the destination, then its pickup
// points along that road, in the order the van passes them:
//   • Saved Pickup Spots near the road, to tick;
//   • "Search a pickup point": any place by name (e.g. "Petron Bocaue"),
//     looked for around the route with the same place search as the start
//     and destination (OpenRouteService, through our own server), so it works
//     every time; the results show how far along the road each one is;
//   • places pinned on the map (PinPickupButton, under the Pickup Points list).
//   spots:  saved pickup spots [{ name, lat, lng }]
//   route:  { start, end, coords, distance_km, duration_min } or null
//   picked: the tour's pickup point names (ticked here or typed below)
//   onAddPlace(place): a place found by search, to save as a pickup spot
// ─────────────────────────────────────────────

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const hours = (min) => (min >= 60 ? `${Math.floor(min / 60)} hr ${min % 60 ? `${min % 60} min` : ''}`.trim() : `${min} min`);

// "250 m from the start", "3.4 km…", "45 km…": places near the start are told apart.
const fromStart = (km) => {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m from the start`;
  if (km < 10) return `${km.toFixed(1)} km from the start`;
  return `${Math.round(km)} km from the start`;
};
const offRoad = (km) => (km < 1 ? `${Math.round(km * 1000)} m off the road` : `${km.toFixed(1)} km off the road`);

// The box around the route (a little wider), for the place search.
const boxOf = (coords) => {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  let [minLng, minLat, maxLng, maxLat] = [180, 90, -180, -90];
  coords.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  });
  const pad = 0.05; // about 5 km
  return [minLng - pad, minLat - pad, maxLng + pad, maxLat + pad].map((n) => Math.round(n * 1e4) / 1e4);
};

const RoutePickupPicker = ({ spots, route, onRouteChange, picked, onPickedChange, onAddPlace }) => {
  const [start, setStart] = useState(route?.start || null);
  const [end, setEnd] = useState(route?.end || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // "Search a pickup point"
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [added, setAdded] = useState([]); // places found by search this time (with their location)

  // The saved spots near the road and the places added by search, in the order the van passes them.
  const along = useMemo(() => {
    if (!route?.coords) return [];
    const saved = spots
      .map((s) => ({ ...s, kind: 'saved', ...placeOnRoute(s, route.coords) }))
      .filter((s) => s.offKm <= 2);
    const extra = added
      .filter((a) => !saved.some((s) => same(s.name, a.name)))
      .map((a) => ({ ...a, kind: 'added', ...placeOnRoute(a, route.coords) }));
    return [...saved, ...extra].sort((a, b) => a.alongKm - b.alongKm);
  }, [route, spots, added]);

  const isPicked = (name) => picked.some((p) => same(p, name));
  const toggle = (s) => {
    if (isPicked(s.name)) { onPickedChange(picked.filter((p) => !same(p, s.name))); return; }
    onPickedChange([...picked, s.name]);
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
    setResults(null);
  };

  // Places by name around the route: the ones on the road first, in driving order.
  const search = async () => {
    const text = query.trim();
    if (text.length < 2) { setSearchError('Type at least 2 letters, e.g. Petron Bocaue.'); return; }
    setSearching(true); setSearchError('');
    const res = await searchPlaces(text, { bbox: boxOf(route?.coords) });
    setSearching(false);
    if (!res.ok) { setSearchError(res.error); setResults(null); return; }
    const found = (res.data.places || []).map((p) => ({ ...p, name: p.label || p.name, ...placeOnRoute(p, route.coords) }));
    const onRoad = found.filter((p) => p.offKm <= 3).sort((a, b) => a.alongKm - b.alongKm);
    const near = found.filter((p) => p.offKm > 3).sort((a, b) => a.offKm - b.offKm);
    setResults([...onRoad, ...near]);
    if (!found.length) setSearchError(`No place called "${text}" was found near the route. Try another name, or pin it on the map below.`);
  };
  const addResult = (p) => {
    const name = String(p.name || '').trim();
    if (!name) return;
    if (!isPicked(name)) onPickedChange([...picked, name]);
    setAdded((list) => (list.some((x) => same(x.name, name)) ? list : [...list, { name, lat: p.lat, lng: p.lng }]));
    onAddPlace?.({ name, address: '', lat: p.lat, lng: p.lng });
    setResults(null);
    setQuery('');
  };

  const pickedAlong = along.filter((s) => isPicked(s.name));
  const unpicked = along.filter((s) => !isPicked(s.name));
  const smallBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
    background: '#1A0A00', color: '#E8A265', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Route size={14} /> The van's route
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>
          Where the van leaves from and where it's going. Then search the pickup points on the way, or tick your saved spots.
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 11.5, fontWeight: 700, color: '#8C5216', display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.5 }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} /> Island or boat trip (e.g. Calaguas, Anawangin)? Choose the port or jump-off as the destination, since the van only goes that far.
        </p>
      </div>
      <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <PlaceSearch label="Starting point" name="route_start" value={start} onChange={(v) => changePlace('start', v)} placeholder="e.g. SM Mall of Asia, Pasay" allowCurrent />
        <PlaceSearch label="Destination" name="route_end" value={end} onChange={(v) => changePlace('end', v)} placeholder="e.g. Ambangeg Ranger Station, Bokod" near={start} />
      </div>
      {!route && (
        <button type="button" onClick={find} disabled={busy || !start || !end} style={{
          alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 999, border: 'none',
          cursor: busy || !start || !end ? 'not-allowed' : 'pointer', opacity: !start || !end ? 0.5 : 1,
          background: '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Route size={14} />} Show the van's route</button>
      )}
      {error && <span role="alert" style={{ fontSize: 12, fontWeight: 700, color: '#8C2F1C' }}>{error}</span>}

      {route && (
        <>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#1A0A00' }}>
            {route.distance_km} km · about {hours(route.duration_min)} of driving
          </p>
          <Suspense fallback={<div style={{ height: 300, borderRadius: 16, background: '#F2E4D0' }} />}>
            <RouteMap route={route} stops={pickedAlong} others={unpicked} height={300} />
          </Suspense>

          {/* Search a pickup point by name, around the route. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="pickup-search" style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7A3A18' }}>Search a pickup point</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="pickup-search" value={query} maxLength={120} placeholder="e.g. Petron Bocaue, SM Marilao, Jollibee San Fernando"
                onChange={(e) => { setQuery(e.target.value); setSearchError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 12, padding: '11px 12px', fontSize: 16, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit' }} />
              <button type="button" onClick={search} disabled={searching} style={smallBtn}>
                {searching ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />} Search
              </button>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>
              Gas stations, malls, terminals, fast food… Places on the van's road are listed first, in the order the van passes them.
            </span>
            {searchError && <span role="alert" style={{ fontSize: 12, fontWeight: 700, color: '#8C2F1C' }}>{searchError}</span>}
            {results?.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 4, background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 12, maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {results.map((p, i) => {
                  const there = isPicked(p.name);
                  return (
                    <li key={`${p.lat},${p.lng},${i}`}>
                      <button type="button" disabled={there} onClick={() => addResult(p)} style={{
                        width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: there ? 'default' : 'pointer',
                        fontFamily: 'inherit', display: 'flex', gap: 10, alignItems: 'center', opacity: there ? 0.55 : 1,
                      }}>
                        <MapPin size={15} color="#B4511E" style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#1A0A00' }}>{p.name}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: p.offKm <= 3 ? '#1F6B4A' : '#8C5216' }}>
                            {p.offKm <= 3 ? `On the way · ${fromStart(p.alongKm)}` : offRoad(p.offKm)}
                          </span>
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: there ? '#7A3A18' : '#B4511E', flexShrink: 0 }}>
                          {there ? 'Added' : <><Plus size={13} /> Add</>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Saved spots near the road (and places added above), in driving order. */}
          {along.length > 0 ? (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7A3A18' }}>
                On the van's way, from {route.start?.name?.split(/[,(]/)[0].trim() || 'the start'} to {route.end?.name?.split(/[,(]/)[0].trim() || 'the destination'}: tick the pickup points ({pickedAlong.length} ticked)
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
                {along.map((s) => {
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
                            {s.kind === 'saved' ? <Star size={12} /> : <MapPin size={12} />} {s.kind === 'saved' ? 'Saved spot' : 'Found by search'} · {fromStart(s.alongKm)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#7A3A18', background: 'rgba(232,162,101,0.15)', borderRadius: 10, padding: '10px 12px' }}>
              No saved pickup spots near this road yet. Search a pickup point above, or pin one on the map below.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default RoutePickupPicker;
