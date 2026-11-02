import React, { Suspense, lazy, useState } from 'react';
import { MapPin } from 'lucide-react';

const MapPicker = lazy(() => import('./MapPicker'));

// ─────────────────────────────────────────────
// Tour form, under the Pickup Points list: a pickup point that isn't in any
// list — drop it on the map and name it. It's added to the list (with its
// map pin, so tracking can mark it Arrived).
//   near: { lat, lng } to start the map around (the route's start)
//   picked / onPickedChange: the pickup point names
//   onAddPlace({ name, address, lat, lng }): remembers where it is
// ─────────────────────────────────────────────

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

const PinPickupButton = ({ near = null, picked = [], onPickedChange, onAddPlace }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="no-touch-size" onClick={() => setOpen(true)} style={{
        alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
        color: '#A8481A', fontFamily: 'inherit', fontWeight: 800, fontSize: 12.5, textDecoration: 'underline', textUnderlineOffset: 3,
      }}><MapPin size={14} /> Pickup point not in the list? Pin it on the map</button>
      {open && (
        <Suspense fallback={null}>
          <MapPicker title="Add a pickup point" askName near={near}
            onPick={(pl) => {
              if (!picked.some((p) => same(p, pl.name))) onPickedChange([...picked, pl.name]);
              onAddPlace?.({ name: pl.name, address: '', lat: pl.lat, lng: pl.lng });
            }}
            onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
};

export default PinPickupButton;
