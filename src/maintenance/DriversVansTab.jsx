import { useEffect, useState } from 'react';
import { Truck, UserRound, Plus, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { DriverForm, VanForm } from '../FleetForms';
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
  const [editing, setEditing] = useState(null); // { kind, item|null }

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

  const done = () => { setEditing(null); load(); };
  const title = !editing ? '' : editing.item ? `Edit ${editing.kind === 'drivers' ? editing.item.name : editing.item.plate_number}` : editing.kind === 'drivers' ? 'Add a Driver' : 'Add a Van';

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h3 style={h3}><Truck size={16} color="var(--ib-accent, #B4511E)" /> Drivers & Vehicles</h3>
          <p style={hint}>The drivers and vans you pick for each tour in Tracking. Only admins see this list (drivers' numbers and IDs stay private).</p>
        </div>
        <button type="button" style={btn(true)} onClick={() => setEditing({ kind, item: null })}><Plus size={14} /> {kind === 'drivers' ? 'Add Driver' : 'Add Van'}</button>
      </div>
      <div role="tablist" aria-label="Drivers or vans" style={{ display: 'flex', gap: 4, background: 'var(--ib-parch, #F2E4D0)', borderRadius: 12, padding: 4, width: 'fit-content', marginBottom: 12 }}>
        {[['drivers', 'Drivers', UserRound], ['vans', 'Vans', Truck]].map((t) => {
          const Icon = t[2];
          return (
            <button key={t[0]} type="button" role="tab" aria-selected={kind === t[0]} onClick={() => setKind(t[0])} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 9, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', background: kind === t[0] ? 'var(--ib-ink, #1A0A00)' : 'transparent', color: kind === t[0] ? 'var(--ib-on-ink, #FDF6EE)' : 'var(--ib-brown, #5C2A10)',
            }}><Icon size={14} /> {t[1]}</button>
          );
        })}
      </div>
      <RecordList
        key={kind}
        items={rows[kind]}
        placeholder={kind === 'drivers' ? 'Search drivers (name, number)' : 'Search vans (model, plate, color)'}
        empty={kind === 'drivers' ? 'No saved drivers yet. Click Add Driver.' : 'No saved vans yet. Click Add Van.'}
        textOf={(x) => (kind === 'drivers' ? `${x.name} ${x.contact}` : `${x.car_type} ${x.plate_number} ${x.color} ${x.notes}`)}
        onEdit={(x) => setEditing({ kind, item: x })}
        onArchive={(x) => setActive(x, false)}
        onRestore={(x) => setActive(x, true)}
        render={(x) => (kind === 'drivers' ? (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{x.name}</p>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ib-brown, #5C2A10)' }}>{formatPhPhone(x.contact) || x.contact}</p>
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: 'var(--ib-rust, #7A3A18)' }}>{x.license_path ? 'License/ID saved' : 'No license/ID yet'}{x.photo_path ? ' · photo saved' : ''}</p>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{x.car_type}</p>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: 'var(--ib-brown, #5C2A10)' }}>{x.plate_number} · {x.color} · {x.seats ?? 14} seats</p>
            {x.notes && <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--ib-rust, #7A3A18)' }}>{x.notes}</p>}
          </>
        ))}
      />
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ib-ink-rgb, 26,10,0), 0.6)', }} onClick={() => setEditing(null)} />
          <div className="paper-card" role="dialog" aria-modal="true" aria-label={title} style={{ position: 'relative', width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto', background: 'var(--ib-cream, #FDF6EE)', borderRadius: 24, borderTop: '8px solid var(--ib-accent, #B4511E)', padding: '1.5rem', boxShadow: '0 24px 60px rgba(var(--ib-shadow-rgb, 26,10,0), 0.35)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{title}</h3>
              <button type="button" className="x-close" onClick={() => setEditing(null)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ib-rust, #7A3A18)' }}><X size={20} /></button>
            </div>
            {editing.kind === 'drivers'
              ? <DriverForm driver={editing.item} onDone={done} onCancel={() => setEditing(null)} />
              : <VanForm van={editing.item} vans={(rows.vans || []).filter((v) => v.is_active !== false)} onDone={done} onCancel={() => setEditing(null)} />}
          </div>
        </div>
      )}
    </div>
  );
};

export default DriversVansTab;
