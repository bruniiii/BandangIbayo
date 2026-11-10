import { useEffect, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import PickupSpots from '../PickupSpots';
import RecordList from './RecordList';
import { card, h3, hint, btn } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Pickup Points
// The saved pickup spots offered when building a tour. Joiners only see the
// active ones. Archived, never deleted; a spot an upcoming tour picks up at
// can't be archived (the database says which tour).
// ─────────────────────────────────────────────

const PickupPointsTab = () => {
  const [rows, setRows] = useState(null);
  const [manage, setManage] = useState(false);
  const load = async () => {
    const { data, error } = await supabase.from('pickup_spots').select('*').order('name');
    if (error) toast.error("Couldn't load the pickup points", error.message);
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the list when the tab opens
  useEffect(() => { load(); }, []);

  const setActive = async (x, on) => {
    if (!on && !(await confirmDialog({ title: `Archive ${x.name}?`, message: 'It won\'t be offered for new tours or shown to joiners. Past tours keep it, and you can restore it any time.', confirmLabel: 'Archive', cancelLabel: 'Keep', tone: 'danger' }))) return;
    const { error } = await supabase.from('pickup_spots').update({ is_active: on }).eq('id', x.id);
    if (error) { toast.error(on ? "Couldn't restore it" : "Couldn't archive it", error.message); return; }
    toast.success(on ? 'Restored' : 'Archived', x.name);
    load();
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h3 style={h3}><MapPin size={16} color="#B4511E" /> Pickup Points</h3>
          <p style={hint}>The places the van can pick joiners up at. Tick them when building a tour; joiners pick one when booking.</p>
        </div>
        <button type="button" style={btn(true)} onClick={() => setManage(true)}><Plus size={14} /> Add or Edit</button>
      </div>
      <RecordList
        items={rows}
        placeholder="Search pickup points (name, address)"
        empty="No saved pickup points yet. Click Add or Edit."
        textOf={(x) => `${x.name} ${x.address || ''}`}
        onEdit={() => setManage(true)}
        onArchive={(x) => setActive(x, false)}
        onRestore={(x) => setActive(x, true)}
        render={(x) => (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00' }}>{x.name}</p>
            {x.address && <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>{x.address}</p>}
            <a href={`https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 800, color: '#A8481A' }}>Open in Maps</a>
          </>
        )}
      />
      {manage && <PickupSpots onClose={() => { setManage(false); load(); }} onChanged={load} />}
    </div>
  );
};

export default PickupPointsTab;
