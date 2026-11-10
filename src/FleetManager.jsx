import React, { useCallback, useEffect, useState } from 'react';
import { X, Plus, Pencil, Archive, Loader2, Truck, UserRound, IdCard, Camera, CheckCircle2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { shrinkImage } from './imageCompress';
import { phoneFieldProps } from './ui/phoneField';
import { nameError, phoneError, cleanName, normalizePhone, formatPhPhone } from './validation';
import MissingHint from './ui/MissingHint';
import PrettySelect from './ui/PrettySelect';
import { loadFleet } from './fleet';

// ─────────────────────────────────────────────
// Tracking Management → Drivers & Vans: the saved drivers (name, number,
// license/ID and photo) and vans (model, plate, color, how to spot it).
// Saved once, then picked for each tour in the Fleet & Driver form
// (FleetPicker below). Only admins can see these.
// ─────────────────────────────────────────────

const uploadDoc = async (driverId, kind, file) => {
  const small = await shrinkImage(file, { maxSide: 1400 });
  const ext = (small.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `drivers/${driverId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('driver-docs').upload(path, small, { contentType: small.type, upsert: false });
  if (error) throw error;
  return path;
};

const input = {
  width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(180,81,30,0.25)',
  background: '#FDF6EE', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#1A0A00',
};
const label = { display: 'block', fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#5C2A10', marginBottom: 6 };
const btn = (main) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, padding: '0 18px', borderRadius: 999, cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase',
  background: main ? '#B4511E' : 'transparent', color: main ? '#FDF6EE' : '#5C2A10', border: main ? 'none' : '1px solid rgba(180,81,30,0.3)',
});

// ── Add or change one driver ──
const DriverForm = ({ driver, onDone, onCancel }) => {
  const [name, setName] = useState(driver?.name || '');
  const [contact, setContact] = useState(formatPhPhone(driver?.contact || ''));
  const [license, setLicense] = useState(null); // new file
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const hasLicense = !!(license || driver?.license_path);
  const hasPhoto = !!(photo || driver?.photo_path);
  const missing = [
    !name.trim() && 'Driver name', !contact.trim() && 'Contact number',
    !hasLicense && "Driver's license / valid ID", !hasPhoto && "Driver's photo",
  ];

  const save = async () => {
    const problem = nameError(name, "Driver's name", { max: 80 }) || phoneError(contact, "Driver's contact number");
    if (problem) { toast.error('Please check the details', problem); return; }
    if (!hasLicense || !hasPhoto) { toast.error('Driver ID needed', "Add the driver's license (or a valid ID) and a photo of the driver."); return; }
    setSaving(true);
    try {
      const row = { name: cleanName(name), contact: normalizePhone(contact), updated_at: new Date().toISOString() };
      let id = driver?.id;
      if (id) {
        const { error } = await supabase.from('fleet_drivers').update(row).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('fleet_drivers').insert([row]).select('id').single();
        if (error) throw error;
        id = data.id;
      }
      const docs = {};
      if (license) docs.license_path = await uploadDoc(id, 'license', license);
      if (photo) docs.photo_path = await uploadDoc(id, 'photo', photo);
      if (Object.keys(docs).length) {
        const { error } = await supabase.from('fleet_drivers').update(docs).eq('id', id);
        if (error) throw error;
      }
      toast.success(driver ? 'Driver updated' : 'Driver saved', cleanName(name));
      onDone();
    } catch (err) {
      toast.error("Couldn't save the driver", err.message);
    } finally {
      setSaving(false);
    }
  };

  const fileBox = (key, text, Icon, file, setFile, onFile) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, cursor: 'pointer', background: '#FDF6EE', border: `1px ${onFile || file ? 'solid' : 'dashed'} rgba(180,81,30,0.35)` }}>
      <span style={{ width: 40, height: 40, borderRadius: 10, background: '#F2E4D0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A8481A', flexShrink: 0 }}><Icon size={18} /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#1A0A00' }}>{text} <span style={{ color: '#A8481A' }}>*</span></span>
        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: file || onFile ? '#1B5E3B' : '#8C2F1C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file ? file.name : onFile ? 'On file · tap to replace' : 'Tap to upload a photo'}
        </span>
      </span>
      <input type="file" accept="image/*" capture={key === 'photo' ? 'user' : undefined} onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} style={{ display: 'none' }} />
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div><label style={label} htmlFor="fleet-driver-name">Driver name *</label>
        <input id="fleet-driver-name" data-allow="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juan Dela Cruz" style={input} /></div>
      <div><label style={label} htmlFor="fleet-driver-contact">Contact number *</label>
        <input id="fleet-driver-contact" {...phoneFieldProps(contact, setContact)} style={input} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
        {fileBox('license', "Driver's license / valid ID", IdCard, license, setLicense, driver?.license_path)}
        {fileBox('photo', "Driver's photo (face)", Camera, photo, setPhoto, driver?.photo_path)}
      </div>
      <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: '#5C2A10' }}>The ID and photo are private: only admins can see them (for liability).</p>
      {!saving && missing.some(Boolean) && <MissingHint items={missing} />}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancel} style={btn(false)}>Cancel</button>
        <button type="button" onClick={save} disabled={saving || missing.some(Boolean)} style={btn(true)}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} {driver ? 'Save Changes' : 'Save Driver'}
        </button>
      </div>
    </div>
  );
};

// ── Add or change one van ──
const VanForm = ({ van, vans, onDone, onCancel }) => {
  const [carType, setCarType] = useState(van?.car_type || '');
  const [plate, setPlate] = useState(van?.plate_number || '');
  const [color, setColor] = useState(van?.color || '');
  const [notes, setNotes] = useState(van?.notes || '');
  const [saving, setSaving] = useState(false);
  const missing = [!carType.trim() && 'Van model', !plate.trim() && 'Plate number', !color.trim() && 'Color', !notes.trim() && 'How to spot it'];

  const save = async () => {
    const p = plate.trim().toUpperCase();
    if (!/^[A-Z0-9 -]{2,10}$/.test(p)) { toast.error('Please check the plate number', 'Letters and numbers only, like NBT 8921 or NBT-8921.'); return; }
    if (vans.some((v) => v.id !== van?.id && v.plate_number.toUpperCase() === p)) { toast.error('That plate is already saved', 'Pick it from the list instead.'); return; }
    setSaving(true);
    const row = { car_type: carType.trim(), plate_number: p, color: color.trim(), notes: notes.trim(), updated_at: new Date().toISOString() };
    const { error } = van?.id
      ? await supabase.from('fleet_vans').update(row).eq('id', van.id)
      : await supabase.from('fleet_vans').insert([row]);
    setSaving(false);
    if (error) { toast.error("Couldn't save the van", error.message); return; }
    toast.success(van ? 'Van updated' : 'Van saved', `${row.car_type} · ${row.plate_number}`);
    onDone();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
        <div><label style={label} htmlFor="fleet-van-model">Van model *</label><input id="fleet-van-model" value={carType} maxLength={60} onChange={(e) => setCarType(e.target.value)} placeholder="e.g. Toyota Hiace" style={input} /></div>
        <div><label style={label} htmlFor="fleet-van-plate">Plate number *</label><input id="fleet-van-plate" value={plate} maxLength={10} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="e.g. NBT-8921" style={input} /></div>
        <div><label style={label} htmlFor="fleet-van-color">Color *</label><input id="fleet-van-color" value={color} maxLength={40} onChange={(e) => setColor(e.target.value)} placeholder="e.g. Pearl White" style={input} /></div>
        <div><label style={label} htmlFor="fleet-van-notes">How to spot it *</label><input id="fleet-van-notes" value={notes} maxLength={120} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. IBAYO sticker, tinted" style={input} /></div>
      </div>
      {!saving && missing.some(Boolean) && <MissingHint items={missing} />}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" onClick={onCancel} style={btn(false)}>Cancel</button>
        <button type="button" onClick={save} disabled={saving || missing.some(Boolean)} style={btn(true)}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} {van ? 'Save Changes' : 'Save Van'}
        </button>
      </div>
    </div>
  );
};

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
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Drivers and vans" style={{
        position: 'relative', width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto', background: '#FDF6EE',
        borderRadius: 24, borderTop: '8px solid #B4511E', padding: '1.5rem', boxShadow: '0 24px 60px rgba(26,10,0,0.35)', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A0A00' }}>Drivers & Vans</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600, color: '#5C2A10', lineHeight: 1.5 }}>
              Save each driver and van once. Then, in a tour's Fleet & Driver form, just pick which ones to use.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>
        </div>

        <div role="tablist" aria-label="Drivers or vans" style={{ display: 'flex', gap: 4, background: '#F2E4D0', borderRadius: 12, padding: 4, width: 'fit-content' }}>
          {[['drivers', 'Drivers', UserRound], ['vans', 'Vans', Truck]].map((t) => {
            const Icon = t[2];
            return (
              <button key={t[0]} type="button" role="tab" aria-selected={tab === t[0]} onClick={() => { setTab(t[0]); setEditing(null); }} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 9, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase',
                background: tab === t[0] ? '#1A0A00' : 'transparent', color: tab === t[0] ? '#FDF6EE' : '#5C2A10',
              }}><Icon size={14} /> {t[1]} {fleet ? `(${fleet[t[0]].length})` : ''}</button>
            );
          })}
        </div>

        {editing ? (
          <div style={{ background: 'rgba(180,81,30,0.06)', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 16, padding: '1rem' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A' }}>
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
          <p style={{ margin: 0, fontSize: 13, color: '#7A3A18' }}>Loading…</p>
        ) : list.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#5C2A10' }}>{tab === 'drivers' ? 'No drivers saved yet.' : 'No vans saved yet.'}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((item) => (
              <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F2E4D0', borderRadius: 12, padding: '10px 12px' }}>
                {tab === 'drivers' ? <UserRound size={16} color="#B4511E" style={{ flexShrink: 0 }} /> : <Truck size={16} color="#B4511E" style={{ flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>{tab === 'drivers' ? item.name : `${item.car_type} · ${item.plate_number}`}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 600, color: '#5C2A10', overflowWrap: 'anywhere' }}>
                    {tab === 'drivers'
                      ? `${formatPhPhone(item.contact)} · ${item.license_path && item.photo_path ? 'ID and photo on file' : 'ID or photo missing'}`
                      : `${item.color} · ${item.notes}`}
                  </p>
                </div>
                <button type="button" onClick={() => setEditing({ kind: tab, item })} aria-label="Change" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', padding: 4 }}><Pencil size={15} /></button>
                <button type="button" onClick={() => remove(tab, item)} aria-label="Archive" title="Archive" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C2F1C', padding: 4 }}><Archive size={15} /></button>
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
export const FleetPicker = ({ driverId, vanId, onDriver, onVan, onManage, refreshKey = 0 }) => {
  const [fleet, setFleet] = useState({ drivers: [], vans: [] });
  useEffect(() => {
    let alive = true;
    loadFleet().then((f) => { if (alive) setFleet(f); });
    return () => { alive = false; };
  }, [refreshKey]);
  return (
    <div style={{ background: 'rgba(180,81,30,0.06)', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8481A' }}>Use a saved driver and van</p>
        <button type="button" className="text-link" onClick={onManage} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Manage Drivers & Vans</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
        <PrettySelect ariaLabel="Driver" icon={UserRound} value={driverId || ''} placeholder={fleet.drivers.length ? 'Choose a driver…' : 'No saved drivers yet'}
          options={fleet.drivers.map((d) => ({ value: d.id, label: `${d.name} · ${formatPhPhone(d.contact)}` }))}
          onChange={(id) => { const d = fleet.drivers.find((x) => x.id === id); if (d) onDriver(d); }} />
        <PrettySelect ariaLabel="Van" icon={Truck} value={vanId || ''} placeholder={fleet.vans.length ? 'Choose a van…' : 'No saved vans yet'}
          options={fleet.vans.map((v) => ({ value: v.id, label: `${v.car_type} · ${v.plate_number}` }))}
          onChange={(id) => { const v = fleet.vans.find((x) => x.id === id); if (v) onVan(v); }} />
      </div>
      <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: '#5C2A10' }}>Picking one fills in the details below (you can still change them).</p>
    </div>
  );
};

export default FleetManager;
