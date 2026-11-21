import React, { useCallback, useEffect, useState } from 'react';
import ChipTabs from './ui/ChipTabs';
import { X, Plus, Pencil, Archive, Truck, UserRound } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { formatPhPhone } from './validation';
import { DriverForm, VanForm } from './FleetForms';
import PrettySelect from './ui/PrettySelect';
import { loadFleet } from './fleet';

// ─────────────────────────────────────────────
// Tracking Management → Drivers & Vans: the saved drivers (name, number,
// license/ID and photo) and vans (model, plate, color, how to spot it).
// Saved once, then picked for each tour in the Fleet & Driver form
// (FleetPicker below). Only admins can see these.
// ─────────────────────────────────────────────

const btn = (main) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, padding: '0 18px', borderRadius: 999, cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase',
  background: main ? 'var(--ib-accent, #B4511E)' : 'transparent', color: main ? 'var(--ib-on-accent, #FDF6EE)' : 'var(--ib-brown, #5C2A10)', border: main ? 'none' : '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.3)',
});

// ── The Drivers & Vans window ──
const FleetManager = ({ onClose, onChanged }) => {
  const [tab, setTab] = useState('drivers');
  const [fleet, setFleet] = useState(null);
  const [editing, setEditing] = useState(null); // { kind, item|null }

  const load = useCallback(async () => {
    const f = await loadFleet();
    if (f.error) toast.error("Couldn't load drivers and vans", `${f.error} (run the latest database update).`);
    setFleet(f);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the lists when the window opens
  useEffect(() => { load(); }, [load]);

  const done = () => { setEditing(null); load(); onChanged?.(); };
  const remove = async (kind, item) => {
    const what = kind === 'drivers' ? item.name : `${item.car_type} · ${item.plate_number}`;
    if (!(await confirmDialog({
      title: `Archive ${what}?`,
      message: "It won't be offered for new tours anymore. Tours that already used it keep their details, and it can be restored in System Maintenance → Drivers & Vehicles.",
      confirmLabel: 'Archive', cancelLabel: 'Keep It', tone: 'danger',
    }))) return;
    const { error } = await supabase.from(kind === 'drivers' ? 'fleet_drivers' : 'fleet_vans').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (error) { toast.error("Couldn't archive it", error.message); return; }
    toast.success('Archived', what);
    load(); onChanged?.();
  };

  const list = fleet ? fleet[tab] : null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ib-ink-rgb, 26,10,0), 0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div className="paper-card" role="dialog" aria-modal="true" aria-label="Drivers and vans" style={{
        position: 'relative', width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto', background: 'var(--ib-cream, #FDF6EE)',
        borderRadius: 24, borderTop: '8px solid var(--ib-accent, #B4511E)', padding: '1.5rem', boxShadow: '0 24px 60px rgba(var(--ib-shadow-rgb, 26,10,0), 0.35)', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>Drivers & Vans</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)', lineHeight: 1.5 }}>
              Save each driver and van once. Then, in a tour's Fleet & Driver form, just pick which ones to use.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ib-rust, #7A3A18)' }}><X size={20} /></button>
        </div>

        <ChipTabs ariaLabel="Drivers or vans" value={tab} onChange={(k) => { setTab(k); setEditing(null); }}
          items={[{ value: 'drivers', label: 'Drivers', icon: UserRound, count: fleet?.drivers.length }, { value: 'vans', label: 'Vans', icon: Truck, count: fleet?.vans.length }]} />

        {editing ? (
          <div style={{ background: 'rgba(var(--ib-accent-rgb, 180,81,30), 0.06)', border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.18)', borderRadius: 16, padding: '1rem' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ib-sienna, #A8481A)' }}>
              {editing.item ? `Change ${editing.kind === 'drivers' ? editing.item.name : editing.item.plate_number}` : editing.kind === 'drivers' ? 'Add a driver' : 'Add a van'}
            </p>
            {editing.kind === 'drivers'
              ? <DriverForm driver={editing.item} onDone={done} onCancel={() => setEditing(null)} />
              : <VanForm van={editing.item} vans={fleet?.vans || []} onDone={done} onCancel={() => setEditing(null)} />}
          </div>
        ) : (
          <button type="button" onClick={() => setEditing({ kind: tab, item: null })} style={{ ...btn(true), alignSelf: 'flex-start' }}>
            <Plus size={14} /> {tab === 'drivers' ? 'Add Driver' : 'Add Van'}
          </button>
        )}

        {list === null ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ib-rust, #7A3A18)' }}>Loading…</p>
        ) : list.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)' }}>{tab === 'drivers' ? 'No drivers saved yet.' : 'No vans saved yet.'}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((item) => (
              <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--ib-parch, #F2E4D0)', borderRadius: 12, padding: '10px 12px' }}>
                {tab === 'drivers' ? <UserRound size={16} color="var(--ib-accent, #B4511E)" style={{ flexShrink: 0 }} /> : <Truck size={16} color="var(--ib-accent, #B4511E)" style={{ flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{tab === 'drivers' ? item.name : `${item.car_type} · ${item.plate_number}`}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)', overflowWrap: 'anywhere' }}>
                    {tab === 'drivers'
                      ? `${formatPhPhone(item.contact)} · ${item.license_path && item.photo_path ? 'ID and photo on file' : 'ID or photo missing'}`
                      : `${item.color} · ${item.seats ?? 14} seats · ${item.notes}`}
                  </p>
                </div>
                <button type="button" onClick={() => setEditing({ kind: tab, item })} aria-label="Change" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ib-rust, #7A3A18)', padding: 4 }}><Pencil size={15} /></button>
                <button type="button" onClick={() => remove(tab, item)} aria-label="Archive" title="Archive" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ib-red, #8C2F1C)', padding: 4 }}><Archive size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ── In a tour's Fleet & Driver form: pick a saved driver and van ──
// onDriver(driver) / onVan(van) fill the form; onManage opens Drivers & Vans.
// slots: the tour's slots; a warning shows when the picked van has fewer seats.
export const FleetPicker = ({ driverId, vanId, onDriver, onVan, onManage, refreshKey = 0, slots = 0 }) => {
  const [fleet, setFleet] = useState({ drivers: [], vans: [] });
  useEffect(() => {
    let alive = true;
    loadFleet().then((f) => { if (alive) setFleet(f); });
    return () => { alive = false; };
  }, [refreshKey]);
  const pickedVan = fleet.vans.find((v) => v.id === vanId);
  const tooSmall = !!pickedVan && Number(slots) > Number(pickedVan.seats ?? 14);
  return (
    <div style={{ background: 'rgba(var(--ib-accent-rgb, 180,81,30), 0.06)', border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.18)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ib-sienna, #A8481A)' }}>Use a saved driver and van</p>
        <button type="button" className="text-link" onClick={onManage} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Manage Drivers & Vans</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
        <PrettySelect ariaLabel="Driver" icon={UserRound} value={driverId || ''} placeholder={fleet.drivers.length ? 'Choose a driver…' : 'No saved drivers yet'}
          options={fleet.drivers.map((d) => ({ value: d.id, label: `${d.name} · ${formatPhPhone(d.contact)}` }))}
          onChange={(id) => { const d = fleet.drivers.find((x) => x.id === id); if (d) onDriver(d); }} />
        <PrettySelect ariaLabel="Van" icon={Truck} value={vanId || ''} placeholder={fleet.vans.length ? 'Choose a van…' : 'No saved vans yet'}
          options={fleet.vans.map((v) => ({ value: v.id, label: `${v.car_type} · ${v.plate_number} · ${v.seats ?? 14} seats` }))}
          onChange={(id) => { const v = fleet.vans.find((x) => x.id === id); if (v) onVan(v); }} />
      </div>
      {tooSmall && (
        <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 800, color: 'var(--ib-red, #8C2F1C)', background: 'rgba(var(--ib-red-rgb, 140,47,28), 0.08)', border: '1px solid rgba(var(--ib-red-rgb, 140,47,28), 0.25)', borderRadius: 10, padding: '8px 10px' }}>
          This tour has {slots} slots but {pickedVan.car_type} · {pickedVan.plate_number} has only {pickedVan.seats} seats. Pick a bigger van, or plan a second one.
        </p>
      )}
      <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)' }}>Picking one fills in the details below (you can still change them).</p>
    </div>
  );
};

export default FleetManager;
