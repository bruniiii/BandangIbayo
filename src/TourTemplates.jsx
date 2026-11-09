import React, { useEffect, useMemo, useState } from 'react';
import { X, LayoutTemplate, Trash2, Pencil, ChevronLeft, CheckSquare, Square, Plus } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { linesOf, formatPeso } from './tourUtils';
import { parseItinerary, serializeItinerary } from './itinerary';

// ─────────────────────────────────────────────
// Tour templates (pre-made tours, e.g. "Baguio"). Create New Tour (and the
// Private Tour / Requested Tour package form, without onBlank) → pick a
// template → tick what to use (details, rates, photos, pickup points,
// accommodation, lists, itinerary days, expenses) → the tour form opens
// filled in with just those; only the dates are left to pick.
// Templates are saved from the tour form ("Save as Template").
//   <TourTemplatePicker onUse={(trip) => …} onBlank={() => …} onClose={…} />
// ─────────────────────────────────────────────

const card = { background: '#FDF6EE', borderRadius: 24, borderTop: '8px solid #B4511E', padding: '1.5rem', boxShadow: '0 24px 60px rgba(26,10,0,0.35)' };
const btn = (main) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, padding: '0 18px', borderRadius: 999, cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase',
  background: main ? '#B4511E' : 'transparent', color: main ? '#FDF6EE' : '#5C2A10', border: main ? 'none' : '1px solid rgba(180,81,30,0.3)',
});
const sectionTitle = { margin: '14px 0 6px', fontSize: 11.5, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A' };

// Everything in a template, as checklist items: { id, section, label, img? }.
const itemsOf = (d) => {
  const items = [];
  const add = (section, id, label, extra = {}) => items.push({ section, id, label, ...extra });
  [['title', 'Tour title'], ['destination', 'Destination'], ['description', 'Description'], ['difficulty', 'Difficulty'], ['important_note', 'Important notes']]
    .forEach(([k, l]) => { if (d[k]) add('Details', `f:${k}`, `${l}: ${String(d[k]).slice(0, 70)}${String(d[k]).length > 70 ? '…' : ''}`); });
  if (d.price) add('Rates & slots', 'f:price', `Joiner Rate: ${formatPeso(d.price)}`);
  if (d.regular_rate) add('Rates & slots', 'f:regular_rate', `Regular Rate: ${formatPeso(d.regular_rate)}`);
  if (d.group_size) add('Rates & slots', 'f:group_size', `Slots: ${d.group_size}`);
  (d.image_urls || []).forEach((u, i) => add('Photos', `img:${i}`, `Photo ${i + 1}`, { img: u }));
  (d.pickup_points || []).forEach((p, i) => add('Pickup points', `pick:${i}`, p.location_name));
  if (d.route || d.departure_time) add('Pickup points', 'f:route', `Van route on the map${d.departure_time ? ` · leaves at ${d.departure_time}` : ''}`);
  (d.accommodation_options || []).forEach((a, i) => add('Accommodation', `acc:${i}`, a));
  linesOf(d.inclusions).forEach((l, i) => add('Inclusions', `inc:${i}`, l));
  linesOf(d.exclusions).forEach((l, i) => add('Exclusions', `exc:${i}`, l));
  linesOf(d.things_to_bring).forEach((l, i) => add('Things to bring', `bring:${i}`, l));
  Object.entries(parseItinerary(d.itinerary || '')).forEach(([day, text]) => {
    if (String(text || '').trim()) add('Itinerary', `day:${day}`, `${Number(day) === 0 ? 'Day before' : `Day ${day}`}: ${String(text).split('\n')[0].slice(0, 70)}`);
  });
  if (d.expenses?.van_rent) add('Expenses', 'exp:van_rent', `Van rent: ${formatPeso(d.expenses.van_rent)}`);
  if (d.expenses?.tour_guide) add('Expenses', 'exp:tour_guide', `Tour guide: ${formatPeso(d.expenses.tour_guide)}`);
  (d.expenses?.others || []).forEach((o, i) => add('Expenses', `other:${i}`, `${o.name}: ${formatPeso(o.amount)}`));
  return items;
};

// The template with only the ticked items, shaped like a tour for the tour form.
const pickFrom = (d, on) => {
  const has = (id) => on.has(id);
  const keep = (lines, prefix) => linesOf(lines).filter((_, i) => has(`${prefix}:${i}`)).join('\n');
  const days = parseItinerary(d.itinerary || '');
  return {
    title: has('f:title') ? d.title : '', destination: has('f:destination') ? d.destination : '',
    description: has('f:description') ? d.description : '', difficulty: has('f:difficulty') ? d.difficulty : '',
    important_note: has('f:important_note') ? d.important_note : '',
    price: has('f:price') ? d.price : '', regular_rate: has('f:regular_rate') ? d.regular_rate : '', group_size: has('f:group_size') ? d.group_size : '',
    image_urls: (d.image_urls || []).filter((_, i) => has(`img:${i}`)),
    pickup_points: (d.pickup_points || []).filter((_, i) => has(`pick:${i}`)),
    route: has('f:route') ? d.route || null : null, departure_time: has('f:route') ? d.departure_time || null : null,
    accommodation_options: (d.accommodation_options || []).filter((_, i) => has(`acc:${i}`)),
    inclusions: keep(d.inclusions, 'inc'), exclusions: keep(d.exclusions, 'exc'), things_to_bring: keep(d.things_to_bring, 'bring'),
    itinerary: serializeItinerary(Object.fromEntries(Object.entries(days).filter(([day]) => has(`day:${day}`)))),
    expenses: {
      van_rent: has('exp:van_rent') ? d.expenses?.van_rent : '', tour_guide: has('exp:tour_guide') ? d.expenses?.tour_guide : '',
      others: (d.expenses?.others || []).filter((_, i) => has(`other:${i}`)),
    },
  };
};

export const TourTemplatePicker = ({ onUse, onBlank, onClose }) => {
  const [templates, setTemplates] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [on, setOn] = useState(new Set());

  const load = async () => {
    const { data, error } = await supabase.from('tour_templates').select('*').order('name');
    if (error) toast.error("Couldn't load the templates", `${error.message} (run the latest database update).`);
    setTemplates(data || []);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the list when the window opens
  useEffect(() => { load(); }, []);

  const items = useMemo(() => (chosen ? itemsOf(chosen.data || {}) : []), [chosen]);
  const choose = (t) => { setChosen(t); setOn(new Set(itemsOf(t.data || {}).map((i) => i.id))); };
  const toggle = (id) => setOn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sections = [...new Set(items.map((i) => i.section))];

  const rename = async (t) => {
    const name = await confirmDialog({ title: `Rename "${t.name}"`, message: 'The new name for this template.', reasonLabel: 'Name', confirmLabel: 'Rename', cancelLabel: 'Cancel' });
    if (!name) return;
    const { error } = await supabase.from('tour_templates').update({ name: name.slice(0, 80), updated_at: new Date().toISOString() }).eq('id', t.id);
    if (error) { toast.error("Couldn't rename it", error.message); return; }
    load();
  };
  const remove = async (t) => {
    if (!(await confirmDialog({ title: `Delete the "${t.name}" template?`, message: 'Tours already made from it stay as they are.', confirmLabel: 'Delete Template', cancelLabel: 'Keep It', tone: 'danger' }))) return;
    const { error } = await supabase.from('tour_templates').delete().eq('id', t.id);
    if (error) { toast.error("Couldn't delete it", error.message); return; }
    load();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={onBlank ? 'Create a tour' : 'Use a template'} style={{ ...card, position: 'relative', width: '100%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto' }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>

        {!chosen ? (
          <>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 900, color: '#1A0A00', display: 'flex', alignItems: 'center', gap: 8 }}><LayoutTemplate size={20} color="#B4511E" /> {onBlank ? 'Create a tour' : 'Use a template'}</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#5C2A10', lineHeight: 1.5 }}>
              {onBlank
                ? 'Start from a pre-made tour for the place and tick what you need, or start from scratch.'
                : 'Pick a pre-made tour for the place and tick what you need. It fills in this form; you can still change anything.'}
            </p>
            {onBlank && <button type="button" onClick={onBlank} style={{ ...btn(false), marginBottom: 14 }}><Plus size={14} /> Start From Scratch</button>}
            {templates === null ? <p style={{ margin: 0, color: '#7A3A18' }}>Loading…</p> : templates.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#5C2A10', background: '#F2E4D0', borderRadius: 12, padding: '12px 14px' }}>
                No templates yet. Fill in a tour once, then click <strong>Save as Template</strong> at the bottom of the tour form. Next time, pick it here.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {templates.map((t) => (
                  <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F2E4D0', borderRadius: 14, padding: '10px 12px' }}>
                    {t.data?.image_urls?.[0]
                      ? <img src={t.data.image_urls[0]} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                      : <span style={{ width: 48, height: 48, borderRadius: 10, background: '#1A0A00', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><LayoutTemplate size={18} /></span>}
                    <button type="button" onClick={() => choose(t)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 900, color: '#1A0A00' }}>{t.name}</span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>{t.data?.destination || ''}{t.data?.price ? ` · ${formatPeso(t.data.price)}` : ''}</span>
                    </button>
                    <button type="button" onClick={() => choose(t)} style={btn(true)}>Use</button>
                    <button type="button" onClick={() => rename(t)} aria-label={`Rename ${t.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', padding: 6 }}><Pencil size={15} /></button>
                    <button type="button" onClick={() => remove(t)} aria-label={`Delete ${t.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C2F1C', padding: 6 }}><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <button type="button" onClick={() => setChosen(null)} className="text-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
              <ChevronLeft size={14} /> All templates
            </button>
            <h3 style={{ margin: '8px 0 4px', fontSize: 18, fontWeight: 900, color: '#1A0A00' }}>{chosen.name}: what do you need for this tour?</h3>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#5C2A10', lineHeight: 1.5 }}>
              Everything is ticked. Untick what this tour won't have; you can still change anything in the tour form.
            </p>
            <div style={{ display: 'flex', gap: 8, margin: '10px 0 0', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setOn(new Set(items.map((i) => i.id)))} className="text-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Tick all</button>
              <span style={{ color: '#B4511E' }}>·</span>
              <button type="button" onClick={() => setOn(new Set())} className="text-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Untick all</button>
            </div>
            {sections.map((sec) => {
              const list = items.filter((i) => i.section === sec);
              const allOn = list.every((i) => on.has(i.id));
              return (
                <div key={sec}>
                  <p style={sectionTitle}>
                    <button type="button" onClick={() => setOn((s) => { const n = new Set(s); list.forEach((i) => (allOn ? n.delete(i.id) : n.add(i.id))); return n; })}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}>
                      {allOn ? <CheckSquare size={15} /> : <Square size={15} />} {sec} ({list.filter((i) => on.has(i.id)).length}/{list.length})
                    </button>
                  </p>
                  <div style={{ display: sec === 'Photos' ? 'flex' : 'grid', flexWrap: 'wrap', gap: 6 }}>
                    {list.map((i) => (
                      <label key={i.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1A0A00',
                        background: on.has(i.id) ? 'rgba(180,81,30,0.08)' : 'transparent', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 10, padding: i.img ? 4 : '7px 10px',
                      }}>
                        <input type="checkbox" checked={on.has(i.id)} onChange={() => toggle(i.id)} style={{ width: 17, height: 17, accentColor: '#B4511E', flexShrink: 0 }} />
                        {i.img ? <img src={i.img} alt={i.label} style={{ width: 70, height: 52, objectFit: 'cover', borderRadius: 8 }} /> : <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{i.label}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 18, position: 'sticky', bottom: -24, background: '#FDF6EE', padding: '10px 0' }}>
              <button type="button" onClick={() => setChosen(null)} style={btn(false)}>Back</button>
              <button type="button" onClick={() => onUse(pickFrom(chosen.data || {}, on))} style={btn(true)}>Use Selected ({on.size})</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
