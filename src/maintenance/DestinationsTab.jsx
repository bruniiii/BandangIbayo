import { useEffect, useState } from 'react';
import { Map as MapIcon, Plus, X, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import PrettySelect from '../ui/PrettySelect';
import { loadDestinations, forgetDestinations, PH_REGIONS } from '../destinations';
import RecordList from './RecordList';
import { card, h3, hint, btn, input, label, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Destinations
// The saved destinations (name and region) the tour, package, supplier and
// request forms suggest, so tours and suppliers use the same names. A tour
// saved with a new destination adds it here. Archived, never deleted; one an
// upcoming tour goes to can't be archived.
// ─────────────────────────────────────────────

const inp = { ...input, letterSpacing: 0, textTransform: 'none', fontWeight: 600 };

const DestinationsTab = () => {
  const [rows, setRows] = useState(null);
  const [region, setRegion] = useState('all');
  const [editing, setEditing] = useState(null);
  const load = async () => {
    const { rows: list, error } = await loadDestinations({ all: true });
    if (error) toast.error("Couldn't load the destinations", error.message);
    setRows(list);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the list when the tab opens
  useEffect(() => { load(); }, []);

  const setActive = async (x, on) => {
    if (!on && !(await confirmDialog({ title: `Archive ${x.name}?`, message: 'It won\'t be suggested in the forms anymore. Past tours keep it, and you can restore it any time.', confirmLabel: 'Archive', cancelLabel: 'Keep', tone: 'danger' }))) return;
    const { error } = await supabase.from('destinations').update({ is_active: on }).eq('id', x.id);
    if (error) { toast.error(on ? "Couldn't restore it" : "Couldn't archive it", error.message); return; }
    forgetDestinations();
    toast.success(on ? 'Restored' : 'Archived', x.name);
    load();
  };

  const regions = [...new Set((rows || []).map((r) => r.region).filter(Boolean))].sort();
  const shown = rows && (region === 'all' ? rows : rows.filter((r) => (region === 'none' ? !r.region : r.region === region)));

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h3 style={h3}><MapIcon size={16} color="#B4511E" /> Destinations</h3>
          <p style={hint}>Suggested when making tours, packages and suppliers (and to joiners requesting a tour), so the same place always has the same name. Suppliers are matched to tours by these names.</p>
        </div>
        <button type="button" style={btn(true)} onClick={() => setEditing({})}><Plus size={14} /> Add Destination</button>
      </div>
      <RecordList
        items={shown}
        placeholder="Search destinations"
        empty="No destinations yet. Click Add Destination."
        textOf={(x) => `${x.name} ${x.region || ''}`}
        toolbar={(
          <div style={{ flex: '0 1 240px', minWidth: 0 }}>
            <PrettySelect ariaLabel="Filter by region" value={region} onChange={setRegion}
              options={[{ value: 'all', label: 'All regions' }, ...regions.map((r) => ({ value: r, label: r })), { value: 'none', label: 'No region yet' }]} />
          </div>
        )}
        onEdit={(x) => setEditing(x)}
        onArchive={(x) => setActive(x, false)}
        onRestore={(x) => setActive(x, true)}
        render={(x) => (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00' }}>{x.name}</p>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>{x.region || 'No region yet'}</p>
          </>
        )}
      />
      {editing && <DestinationForm item={editing} all={rows || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); forgetDestinations(); load(); }} />}
    </div>
  );
};

const DestinationForm = ({ item, all, onClose, onSaved }) => {
  const [name, setName] = useState(item.name || '');
  const [region, setRegion] = useState(item.region || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (clean.length < 2) { toast.error('Enter the destination name'); return; }
    if (all.some((d) => d.id !== item.id && d.name.toLowerCase() === clean.toLowerCase())) { toast.error('Already in the list', clean); return; }
    setSaving(true);
    const row = { name: clean, region: region.trim() || null };
    const { error } = item.id ? await supabase.from('destinations').update(row).eq('id', item.id) : await supabase.from('destinations').insert([row]);
    setSaving(false);
    if (error) { reportError("Couldn't save it", error); return; }
    toast.success(item.id ? 'Destination updated' : 'Destination added', clean);
    onSaved();
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Destination" style={{ position: 'relative', width: '100%', maxWidth: 460, background: '#FDF6EE', borderRadius: 24, borderTop: '8px solid #B4511E', padding: '1.5rem', boxShadow: '0 24px 60px rgba(26,10,0,0.35)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A0A00' }}>{item.id ? 'Edit Destination' : 'Add Destination'}</h3>
          <button type="button" className="x-close" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>
        </div>
        {item.id && <p style={{ ...hint, margin: 0 }}>Renaming changes the suggestion only; tours already made keep the name they were saved with.</p>}
        <label style={label}>Name *<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sagada, Mountain Province" style={inp} /></label>
        <label style={label}>Region<input value={region} maxLength={80} list="ph-regions" onChange={(e) => setRegion(e.target.value)} placeholder="e.g. CAR (Cordillera)" style={inp} /></label>
        <datalist id="ph-regions">{PH_REGIONS.map((r) => <option key={r} value={r} />)}</datalist>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
          <button type="button" style={btn(true)} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} style={spin} /> : null} Save</button>
        </div>
      </div>
    </div>
  );
};

export default DestinationsTab;
