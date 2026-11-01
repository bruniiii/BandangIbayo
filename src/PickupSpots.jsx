import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { MapPin, Plus, Trash2, X, Loader2, Pencil } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import PlaceSearch from './ui/PlaceSearch';
import { loadPickupSpots } from './pickupSpots';

const RouteMap = lazy(() => import('./ui/RouteMap'));

// ─────────────────────────────────────────────
// PICKUP SPOTS (admin): the saved places the van can pick joiners up at.
// The tour form lists the ones along a trip's route to tick.
// ─────────────────────────────────────────────

const input = {
  width: '100%', boxSizing: 'border-box', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.2)',
  borderRadius: 12, padding: '11px 14px', fontSize: 16, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
};

const PickupSpots = ({ onClose, onChanged }) => {
  const [spots, setSpots] = useState(null);
  const [name, setName] = useState('');
  const [place, setPlace] = useState(null);
  const [editing, setEditing] = useState(null); // spot being moved/renamed
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { spots: list } = await loadPickupSpots();
    setSpots(list);
  }, []);
  // Loads the list when the window opens; its state updates after the request returns.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const reset = () => { setName(''); setPlace(null); setEditing(null); };

  const save = async () => {
    const clean = name.trim();
    if (clean.length < 2) { toast.error('Name the pickup spot', 'e.g. Greenfield or Petron NLEX Bocaue.'); return; }
    if (!place) { toast.error('Find the place on the map', 'Search for it and pick the right one from the list.'); return; }
    if ((spots || []).some((s) => s.id !== editing?.id && s.name.trim().toLowerCase() === clean.toLowerCase())) {
      toast.error('That name is already saved', 'Use a different name for this spot.');
      return;
    }
    setSaving(true);
    const row = { name: clean, address: place.name, lat: place.lat, lng: place.lng };
    const { error } = editing
      ? await supabase.from('pickup_spots').update(row).eq('id', editing.id)
      : await supabase.from('pickup_spots').insert([row]);
    setSaving(false);
    if (error) { toast.error("Couldn't save the pickup spot", error.message); return; }
    toast.success(editing ? 'Pickup spot updated' : 'Pickup spot added', clean);
    reset(); load(); onChanged?.();
  };

  const remove = async (s) => {
    if (!(await confirmDialog({
      title: `Remove ${s.name}?`,
      message: 'It won\'t be suggested for new tours anymore. Tours that already use it keep it.',
      confirmLabel: 'Remove Spot', cancelLabel: 'Keep It', tone: 'danger',
    }))) return;
    const { error } = await supabase.from('pickup_spots').delete().eq('id', s.id);
    if (error) { toast.error("Couldn't remove it", error.message); return; }
    if (editing?.id === s.id) reset();
    load(); onChanged?.();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Pickup spots" style={{
        position: 'relative', width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', background: '#FDF6EE',
        borderRadius: 24, borderTop: '8px solid #B4511E', padding: '1.75rem', boxShadow: '0 24px 60px rgba(26,10,0,0.35)', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A0A00' }}>Pickup Spots</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>
              The places the van can pick joiners up at. When you make a tour, the ones along its route are listed for you to tick.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>
        </div>

        <Suspense fallback={<div style={{ height: 260, borderRadius: 16, background: '#F2E4D0' }} />}>
          <RouteMap route={null} others={(spots || []).map((s) => ({ name: s.name, lat: s.lat, lng: s.lng }))} stops={place ? [{ name: name || 'New spot', lat: place.lat, lng: place.lng }] : []} height={260} />
        </Suspense>

        <div style={{ background: 'rgba(180,81,30,0.06)', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 16, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A' }}>
            {editing ? `Change ${editing.name}` : 'Add a pickup spot'}
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7A3A18' }}>Name joiners see</span>
            <input name="spot_name" value={name} maxLength={120} placeholder="e.g. Petron NLEX Bocaue" style={input} onChange={(e) => setName(e.target.value)} />
          </label>
          <PlaceSearch label="Where it is" name="spot_place" value={place} onChange={setPlace} placeholder="Search the place, e.g. Petron Bocaue NLEX" />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {editing && <button type="button" onClick={reset} style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid rgba(180,81,30,0.25)', background: 'transparent', color: '#7A3A18', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>}
            <button type="button" onClick={save} disabled={saving} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>{saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} {editing ? 'Save Changes' : 'Add Spot'}</button>
          </div>
        </div>

        <div>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A' }}>
            Saved spots ({spots?.length ?? '…'})
          </p>
          {spots === null ? (
            <p style={{ margin: 0, fontSize: 13, color: '#7A3A18' }}>Loading…</p>
          ) : spots.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>No pickup spots yet. Add the first one above.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {spots.map((s) => (
                <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F2E4D0', borderRadius: 12, padding: '10px 12px' }}>
                  <MapPin size={16} color="#B4511E" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>{s.name}</p>
                    {s.address && <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 600, color: '#7A3A18', overflowWrap: 'anywhere' }}>{s.address}</p>}
                  </div>
                  <button type="button" onClick={() => { setEditing(s); setName(s.name); setPlace({ name: s.address || s.name, lat: s.lat, lng: s.lng }); }} aria-label={`Change ${s.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', padding: 4 }}><Pencil size={15} /></button>
                  <button type="button" onClick={() => remove(s)} aria-label={`Remove ${s.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C2F1C', padding: 4 }}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default PickupSpots;
