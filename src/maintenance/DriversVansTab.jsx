import { useEffect, useState } from 'react';
import { Truck, UserRound, Plus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import FleetManager from '../FleetManager';
import { formatPhPhone } from '../validation';
import RecordList from './RecordList';
import { card, h3, hint, btn } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Drivers & Vehicles
// The saved drivers and vans (picked for each tour in Tracking). Admins only;
// joiners never see this list. Archived, never deleted; a driver or van an
// upcoming tour uses can't be archived (the database says which tour).
// ─────────────────────────────────────────────

const DriversVansTab = () => {
  const [kind, setKind] = useState('drivers');
  const [rows, setRows] = useState({ drivers: null, vans: null });
  const [manage, setManage] = useState(false);

  const load = async () => {
    const [d, v] = await Promise.all([
      supabase.from('fleet_drivers').select('*').order('name'),
      supabase.from('fleet_vans').select('*').order('car_type'),
    ]);
    setRows({ drivers: d.data || [], vans: v.data || [] });
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the lists when the tab opens
  useEffect(() => { load(); }, []);

  const table = kind === 'drivers' ? 'fleet_drivers' : 'fleet_vans';
  const nameOf = (x) => (kind === 'drivers' ? x.name : `${x.car_type} · ${x.plate_number}`);
  const setActive = async (x, on) => {
    if (!on && !(await confirmDialog({ title: `Archive ${nameOf(x)}?`, message: 'It won\'t be offered for new tours. Past tours keep their details, and you can restore it any time.', confirmLabel: 'Archive', cancelLabel: 'Keep', tone: 'danger' }))) return;
    const { error } = await supabase.from(table).update({ is_active: on }).eq('id', x.id);
    if (error) { toast.error(on ? "Couldn't restore it" : "Couldn't archive it", error.message); return; }
    toast.success(on ? 'Restored' : 'Archived', nameOf(x));
    load();
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h3 style={h3}><Truck size={16} color="#B4511E" /> Drivers & Vehicles</h3>
          <p style={hint}>The drivers and vans you pick for each tour in Tracking. Only admins see this list (drivers' numbers and IDs stay private).</p>
        </div>
        <button type="button" style={btn(true)} onClick={() => setManage(true)}><Plus size={14} /> Add or Edit</button>
      </div>
      <div role="tablist" aria-label="Drivers or vans" style={{ display: 'flex', gap: 4, background: '#F2E4D0', borderRadius: 12, padding: 4, width: 'fit-content', marginBottom: 12 }}>
        {[['drivers', 'Drivers', UserRound], ['vans', 'Vans', Truck]].map((t) => {
          const Icon = t[2];
          return (
            <button key={t[0]} type="button" role="tab" aria-selected={kind === t[0]} onClick={() => setKind(t[0])} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 9, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', background: kind === t[0] ? '#1A0A00' : 'transparent', color: kind === t[0] ? '#FDF6EE' : '#5C2A10',
            }}><Icon size={14} /> {t[1]}</button>
          );
        })}
      </div>
      <RecordList
        key={kind}
        items={rows[kind]}
        placeholder={kind === 'drivers' ? 'Search drivers (name, number)' : 'Search vans (model, plate, color)'}
        empty={kind === 'drivers' ? 'No saved drivers yet. Click Add or Edit.' : 'No saved vans yet. Click Add or Edit.'}
        textOf={(x) => (kind === 'drivers' ? `${x.name} ${x.contact}` : `${x.car_type} ${x.plate_number} ${x.color} ${x.notes}`)}
        onEdit={() => setManage(true)}
        onArchive={(x) => setActive(x, false)}
        onRestore={(x) => setActive(x, true)}
        render={(x) => (kind === 'drivers' ? (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00' }}>{x.name}</p>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#5C2A10' }}>{formatPhPhone(x.contact) || x.contact}</p>
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: '#7A3A18' }}>{x.license_path ? 'License/ID saved' : 'No license/ID yet'}{x.photo_path ? ' · photo saved' : ''}</p>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00' }}>{x.car_type}</p>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#5C2A10' }}>{x.plate_number} · {x.color}</p>
            {x.notes && <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18' }}>{x.notes}</p>}
          </>
        ))}
      />
      {manage && <FleetManager onClose={() => { setManage(false); load(); }} onChanged={load} />}
    </div>
  );
};

export default DriversVansTab;
