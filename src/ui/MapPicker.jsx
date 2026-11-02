import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, LocateFixed, Check, Loader2, MapPin } from 'lucide-react';
import { getCurrentPlace } from '../currentPlace';

// ─────────────────────────────────────────────
// Pick a place on the map (OpenStreetMap): tap the map or drag the pin, or
// use "My location". With askName, the place gets a name joiners will see.
//   near: { lat, lng } to start around (else the phone's location, else Manila)
//   onPick({ name, lat, lng }); onClose()
// ─────────────────────────────────────────────

const pinIcon = L.divIcon({
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 28],
  html: '<div style="width:30px;height:30px;display:flex;align-items:flex-end;justify-content:center"><div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#B4511E;border:3px solid #FDF6EE;box-shadow:0 3px 8px rgba(26,10,0,0.45)"></div></div>',
});

const round5 = (n) => Math.round(n * 1e5) / 1e5;

const MapPicker = ({ title = 'Pick the place on the map', near = null, askName = false, defaultName = '', onPick, onClose }) => {
  const box = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [point, setPoint] = useState(near && Number.isFinite(Number(near.lat)) ? { lat: Number(near.lat), lng: Number(near.lng) } : null);
  const [name, setName] = useState(defaultName);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  const place = (lat, lng, zoom) => {
    const m = mapRef.current;
    if (!m) return;
    const ll = [lat, lng];
    if (markerRef.current) markerRef.current.setLatLng(ll);
    else {
      markerRef.current = L.marker(ll, { icon: pinIcon, draggable: true }).addTo(m);
      markerRef.current.on('dragend', () => { const p = markerRef.current.getLatLng(); setPoint({ lat: p.lat, lng: p.lng }); });
    }
    if (zoom) m.setView(ll, zoom, { animate: false });
    setPoint({ lat, lng });
  };

  const locate = async (quiet = false) => {
    setLocating(true); setError('');
    try {
      const p = await getCurrentPlace();
      place(p.lat, p.lng, 17);
    } catch (err) {
      if (!quiet) setError(err.message);
    } finally {
      setLocating(false);
    }
  };

  // The map, once; starts on the given place, else the phone's location.
  useEffect(() => {
    if (!box.current || mapRef.current) return undefined;
    const start = point || { lat: 14.5995, lng: 120.9842 };
    const m = L.map(box.current, { attributionControl: true }).setView([start.lat, start.lng], point ? 16 : 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    mapRef.current = m;
    m.on('click', (e) => place(e.latlng.lat, e.latlng.lng));
    if (point) place(point.lat, point.lng);
    else locate(true);
    const t = setTimeout(() => m.invalidateSize({ animate: false }), 60);
    return () => { clearTimeout(t); m.remove(); mapRef.current = null; markerRef.current = null; };
    // Runs once: the map keeps its own state after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = () => {
    if (!point) { setError('Tap the map to drop the pin first.'); return; }
    const label = name.trim() || defaultName.trim() || `Pinned place (${round5(point.lat)}, ${round5(point.lng)})`;
    if (askName && !name.trim()) { setError('Give this place a name joiners will recognize.'); return; }
    onPick({ name: label, lat: round5(point.lat), lng: round5(point.lng) });
    onClose();
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.85)' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} style={{
        position: 'relative', background: '#FDF6EE', width: '100%', maxWidth: 640, maxHeight: '94dvh', borderRadius: 22,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid rgba(180,81,30,0.15)' }}>
          <MapPin size={17} color="#B4511E" />
          <p style={{ flex: 1, margin: 0, fontSize: 14.5, fontWeight: 900, color: '#1A0A00' }}>{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(180,81,30,0.2)', background: '#FDF6EE', color: '#7A3A18', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
        </div>
        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 300, height: '55dvh' }}>
          <div ref={box} style={{ position: 'absolute', inset: 0, background: '#F2E4D0' }} />
          <button type="button" onClick={() => locate(false)} disabled={locating} style={{
            position: 'absolute', right: 10, bottom: 26, zIndex: 500, display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', background: '#1A0A00', color: '#FDF6EE',
            fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
          }}>{locating ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <LocateFixed size={15} />} My location</button>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#7A3A18' }}>
            {point ? `Pin: ${round5(point.lat)}, ${round5(point.lng)} · drag it or tap the map to move it.` : 'Tap the map to drop the pin, or use My location.'}
          </p>
          {askName && (
            <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }} maxLength={120} placeholder="Name joiners see, e.g. Supima Square, Malhacan"
              aria-label="Name of the place" style={{ width: '100%', boxSizing: 'border-box', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 12, padding: '11px 12px', fontSize: 16, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit' }} />
          )}
          {error && <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#8C2F1C' }}>{error}</p>}
          <button type="button" onClick={confirm} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 16px', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}><Check size={16} /> Use this place</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MapPicker;
