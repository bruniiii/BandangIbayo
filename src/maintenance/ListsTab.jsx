import { useEffect, useState } from 'react';
import { ListChecks, Plus, X, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { LIST_NAMES, loadOptionLists } from '../optionLists';
import { POLICY_WORDS } from '../policies';
import RecordList from './RecordList';
import { card, h3, hint, btn, input, label, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Lists & FAQ
// The short lists the forms offer (cancellation reasons, bad-weather
// reasons, request rejection reasons, accommodation choices, difficulty
// levels) and the Help button's FAQ. Admins add, edit, archive and
// restore; nothing is deleted. An accommodation or difficulty an upcoming
// tour uses can't be archived or renamed.
// ─────────────────────────────────────────────

const inp = { ...input, letterSpacing: 0, textTransform: 'none', fontWeight: 600 };
const SECTIONS = [...Object.entries(LIST_NAMES), ['faq', 'Help FAQ']];
const HINTS = {
  cancel_reasons: 'Joiners pick one when cancelling (plus "Other"). Reports groups cancellations by them.',
  weather_reasons: 'Picked when postponing or cancelling a tour date for bad weather; joiners see it.',
  reject_reasons: 'Picked when rejecting a private tour or tour request; the joiner sees it.',
  accommodation: 'Ticked on each tour; joiners choose one of the tour\'s when they book.',
  difficulty: 'Shown on each tour.',
  faq: 'The questions in the Help button. Words in {braces} are filled in from Booking Rules.',
};

const ListsTab = () => {
  const [section, setSection] = useState('cancel_reasons');
  const [rows, setRows] = useState(null);
  const [problem, setProblem] = useState('');
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState(null);
  const isFaq = section === 'faq';

  const load = async (sec = section) => {
    setRows(null);
    const q = sec === 'faq'
      ? supabase.from('help_faqs').select('*').order('sort_order')
      : supabase.from('option_lists').select('*').eq('list_key', sec).order('sort_order').order('label');
    const { data, error } = await q;
    if (error) { setProblem(error.message); setRows([]); return; }
    setProblem('');
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the chosen list
  useEffect(() => { load(section); }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  const table = isFaq ? 'help_faqs' : 'option_lists';
  // (Rows of the other kind can still be on screen for a moment while switching.)
  const nameOf = (x) => (isFaq ? x.question ?? x.label : x.label ?? x.question) || '';
  const changed = async () => { await loadOptionLists().catch(() => null); load(); };

  const add = async () => {
    const v = adding.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if ((rows || []).some((r) => r.label?.toLowerCase() === v.toLowerCase())) { toast.info('Already in the list', v); return; }
    const max = Math.max(0, ...(rows || []).map((r) => r.sort_order || 0));
    const { error } = await supabase.from('option_lists').insert([{ list_key: section, label: v, sort_order: max + 1 }]);
    if (error) { reportError("Couldn't add it", error); return; }
    setAdding('');
    toast.success('Added', v);
    changed();
  };
  const setActive = async (x, on) => {
    if (!on && !(await confirmDialog({ title: `Archive "${nameOf(x)}"?`, message: 'It won\'t be offered anymore. Records that already use it keep it, and you can restore it any time.', confirmLabel: 'Archive', cancelLabel: 'Keep', tone: 'danger' }))) return;
    const { error } = await supabase.from(table).update({ is_active: on }).eq('id', x.id);
    if (error) { toast.error(on ? "Couldn't restore it" : "Couldn't archive it", error.message); return; }
    toast.success(on ? 'Restored' : 'Archived', nameOf(x));
    changed();
  };

  if (problem) {
    return (
      <div style={card}>
        <h3 style={h3}><ListChecks size={16} color="var(--ib-red, #8C2F1C)" /> Lists aren't installed yet</h3>
        <p style={{ ...hint, margin: 0 }}>Run the database update <strong>20261231000000_option_lists_faq.sql</strong>. ({problem})</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <h3 style={h3}><ListChecks size={16} color="var(--ib-accent, #B4511E)" /> Lists & FAQ</h3>
      <p style={hint}>The choices the website offers in its forms, and the Help FAQ. Changes show the next time a page is opened.</p>
      <div role="tablist" aria-label="Which list" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {SECTIONS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={section === k} onClick={() => { if (k !== section) { setRows(null); setSection(k); setAdding(''); } }} style={{
            minHeight: 36, padding: '0 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
            background: section === k ? 'var(--ib-ink, #1A0A00)' : 'var(--ib-cream, #FDF6EE)', color: section === k ? 'var(--ib-on-ink, #FDF6EE)' : 'var(--ib-brown, #5C2A10)', border: `1px solid ${section === k ? 'var(--ib-dark, #1A0A00)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.25)'}`,
          }}>{l}</button>
        ))}
      </div>
      <p style={{ ...hint, marginBottom: 10 }}>{HINTS[section]}</p>
      {isFaq ? (
        <button type="button" style={{ ...btn(true), marginBottom: 12 }} onClick={() => setEditing({})}><Plus size={14} /> Add Question</button>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input value={adding} maxLength={80} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={`Add to ${LIST_NAMES[section].toLowerCase()}`} aria-label="New item" style={{ ...inp, flex: '1 1 220px' }} />
          <button type="button" style={btn(true)} onClick={add}><Plus size={14} /> Add</button>
        </div>
      )}
      <RecordList
        key={section}
        items={rows}
        pageSize={20}
        placeholder={isFaq ? 'Search questions' : 'Search this list'}
        empty="Nothing in this list yet."
        textOf={(x) => (isFaq ? `${x.question || ''} ${x.answer || ''}` : x.label || '')}
        onEdit={(x) => setEditing(x)}
        onArchive={(x) => setActive(x, false)}
        onRestore={(x) => setActive(x, true)}
        render={(x) => (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)', overflowWrap: 'anywhere' }}>{nameOf(x)}</p>
              {isFaq && <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--ib-brown, #5C2A10)', lineHeight: 1.5 }}>{String(x.answer || '').length > 160 ? `${String(x.answer).slice(0, 160)}…` : x.answer || ''}</p>}
            </div>
          </div>
        )}
      />
      {editing && <EditItem isFaq={isFaq} item={editing} rows={rows || []} section={section} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed(); }} />}
    </div>
  );
};

const EditItem = ({ isFaq, item, rows, section, onClose, onSaved }) => {
  const [a, setA] = useState(isFaq ? item.question || '' : item.label || '');
  const [b, setB] = useState(isFaq ? item.answer || '' : '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const one = a.trim().replace(/\s+/g, ' ');
    if (!one || (isFaq && b.trim().length < 3)) { toast.error(isFaq ? 'Write the question and the answer' : 'Enter a name'); return; }
    if (!isFaq && rows.some((r) => r.id !== item.id && r.label.toLowerCase() === one.toLowerCase())) { toast.error('Already in the list', one); return; }
    setSaving(true);
    const table = isFaq ? 'help_faqs' : 'option_lists';
    const row = isFaq ? { question: one, answer: b.trim() } : { label: one };
    const max = Math.max(0, ...rows.map((r) => r.sort_order || 0));
    const { error } = item.id ? await supabase.from(table).update(row).eq('id', item.id)
      : await supabase.from(table).insert([{ ...row, sort_order: max + 1, ...(isFaq ? {} : { list_key: section }) }]);
    setSaving(false);
    if (error) { reportError("Couldn't save it", error); return; }
    toast.success('Saved', one);
    onSaved();
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--ib-ink-rgb, 26,10,0), 0.6)', }} onClick={onClose} />
      <div className="paper-card" role="dialog" aria-modal="true" aria-label="Edit" style={{ position: 'relative', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', background: 'var(--ib-cream, #FDF6EE)', borderRadius: 24, borderTop: '8px solid var(--ib-accent, #B4511E)', padding: '1.5rem', boxShadow: '0 24px 60px rgba(var(--ib-shadow-rgb, 26,10,0), 0.35)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{item.id ? 'Edit' : 'Add'} {isFaq ? 'Question' : 'Item'}</h3>
          <button type="button" className="x-close" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ib-rust, #7A3A18)' }}><X size={20} /></button>
        </div>
        {!isFaq && item.id && <p style={{ ...hint, margin: 0 }}>Renaming changes what the forms show from now on. Records saved before keep the old name.</p>}
        <label style={label}>{isFaq ? 'Question' : 'Name'}<input value={a} maxLength={isFaq ? 200 : 80} onChange={(e) => setA(e.target.value)} style={inp} /></label>
        {isFaq && (
          <>
            <label style={label}>Answer<textarea value={b} rows={6} maxLength={2000} onChange={(e) => setB(e.target.value)} style={{ ...inp, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }} /></label>
            <p style={{ ...hint, margin: 0 }}>Booking Rules words: {POLICY_WORDS.map(([k, d]) => `{${k}} = ${d}`).join(' · ')}</p>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
          <button type="button" style={btn(true)} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} style={spin} /> : null} Save</button>
        </div>
      </div>
    </div>
  );
};

export default ListsTab;
