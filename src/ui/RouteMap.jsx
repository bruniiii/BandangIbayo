import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ─────────────────────────────────────────────
// ROUTE MAP (OpenStreetMap + Leaflet): the van's road, the pickup stops in
// order, the starting point and the destination.
//   route:  { coords: [[lng, lat]…], start: { name, lat, lng }, end: { name, lat, lng } }
//   stops:  [{ name, lat, lng, status }]  (status ARRIVED / CURRENTLY HERE colors the dot)
//   others: [{ name, lat, lng }]          (saved spots not picked, shown faint)
//   van:    { lat, lng }                  (live location, Step 2)
// Loaded only where a map is shown (React.lazy), so pages stay light.
// ─────────────────────────────────────────────

const ok = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
const ll = (p) => [Number(p.lat), Number(p.lng)];

const dot = (color, size = 14, label = '') => L.divIcon({
  className: '',
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
  html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #FDF6EE;box-shadow:0 2px 6px rgba(26,10,0,0.45);display:flex;align-items:center;justify-content:center;color:#FDF6EE;font:900 9px Outfit,sans-serif">${label}</div>`,
});

const STOP_COLORS = { ARRIVED: '#3F5D62', 'CURRENTLY HERE': '#E8A265' };

const RouteMap = ({ route, stops = [], others = [], van = null, height = 300 }) => {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  // The map itself, once.
  useEffect(() => {
    if (!box.current || map.current) return undefined;
    map.current = L.map(box.current, { scrollWheelZoom: false, attributionControl: true }).setView([14.6, 121.0], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // The road, stops and van, whenever they change.
  useEffect(() => {
    const m = map.current; const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds = [];
    const coords = Array.isArray(route?.coords) ? route.coords.map(([lng, lat]) => [lat, lng]) : [];
    if (coords.length > 1) {
      L.polyline(coords, { color: '#B4511E', weight: 5, opacity: 0.85 }).addTo(g);
      bounds.push(...coords);
    }
    others.filter(ok).forEach((s) => {
      L.marker(ll(s), { icon: dot('rgba(122,58,24,0.45)', 11) }).bindTooltip(s.name, { direction: 'top' }).addTo(g);
    });
    if (ok(route?.start)) {
      L.marker(ll(route.start), { icon: dot('#1A0A00', 16) }).bindTooltip(`Start: ${route.start.name || ''}`, { direction: 'top' }).addTo(g);
      bounds.push(ll(route.start));
    }
    stops.filter(ok).forEach((s, i) => {
      L.marker(ll(s), { icon: dot(STOP_COLORS[s.status] || '#B4511E', 20, String(i + 1)) })
        .bindTooltip(`${i + 1}. ${s.name}`, { direction: 'top' })
        .addTo(g);
      bounds.push(ll(s));
    });
    if (ok(route?.end)) {
      L.marker(ll(route.end), { icon: dot('#8C2F1C', 16) }).bindTooltip(`Destination: ${route.end.name || ''}`, { direction: 'top' }).addTo(g);
      bounds.push(ll(route.end));
    }
    if (ok(van)) {
      L.marker(ll(van), { icon: dot('#2E7D32', 22, '🚐'), zIndexOffset: 1000 }).bindTooltip('The van', { direction: 'top' }).addTo(g);
      bounds.push(ll(van));
    }
    // No zoom animation: a window closed mid-animation would leave Leaflet without its map.
    if (bounds.length > 1) m.fitBounds(bounds, { padding: [28, 28], animate: false });
    else if (bounds.length === 1) m.setView(bounds[0], 13, { animate: false });
    // The map may have been drawn while hidden (a closed modal): measure again.
    const t = setTimeout(() => { if (map.current === m) m.invalidateSize({ animate: false }); }, 50);
    return () => clearTimeout(t);
  }, [route, stops, others, van]);

  return (
    <div
      ref={box}
      role="img"
      aria-label="Map of the van's route and pickup stops"
      style={{ height, width: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(180,81,30,0.2)', background: '#F2E4D0', zIndex: 0 }}
    />
  );
};

export default RouteMap;
