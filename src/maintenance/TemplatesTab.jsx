import { useEffect, useState } from 'react';
import { Mail, Pencil, RotateCcw, X, Loader2, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import StatusFilter from '../ui/StatusFilter';
import Pager from '../ui/Pager';
import { paginate } from '../ui/paginate';
import { EMAIL_DEFAULTS, EMAIL_KINDS, PLACEHOLDER_HELP, SAMPLE_VARS, fillIn } from '../emailTemplates';
import { card, h3, hint, btn, input, label, when, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Notification Templates
// The subject, heading and message of each email joiners get. Words in
// {braces} are filled in; **text** is bold; a blank line starts a new
// paragraph. "Use default" archives the change (it's kept, not deleted).
// Booking details, pickup lists and buttons are added by the website.
// ─────────────────────────────────────────────

const inp = { ...input, letterSpacing: 0, textTransform: 'none', fontWeight: 600 };
const STATUSES = ['All', 'Changed', 'Default'];

const TemplatesTab = () => {
  const [rows, setRows] = useState(null);
  const [problem, setProblem] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from('notification_templates').select('*');
    if (error) { setProblem(error.message); setRows({}); return; }
    setRows(Object.fromEntries((data || []).map((r) => [r.key, r])));
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the templates when the tab opens
  useEffect(() => { load(); }, []);

  const isChanged = (key) => !!rows?.[key]?.is_active;
  const q = query.trim().toLowerCase();
  const matches = (k, st) => (st === 'All' || (st === 'Changed' ? isChanged(k[0]) : !isChanged(k[0])))
    && (!q || `${k[1]} ${k[2]} ${(isChanged(k[0]) ? rows[k[0]].subject : EMAIL_DEFAULTS[k[0]].subject)}`.toLowerCase().includes(q));
  const shown = EMAIL_KINDS.filter((k) => matches(k, status));
  const { visible, pages, current } = paginate(shown, page, 8);

  const resetToDefault = async (k) => {
    if (!(await confirmDialog({ title: `Use the default "${k[1]}" email?`, message: 'Your changes are kept (archived) but the default text is sent from now on.', confirmLabel: 'Use Default', cancelLabel: 'Keep Mine' }))) return;
    const { error } = await supabase.from('notification_templates').update({ is_active: false }).eq('key', k[0]);
    if (error) { reportError("Couldn't change it", error); return; }
    toast.success('Default text in use', k[1]);
    load();
  };

  if (problem) {
    return (
      <div style={card}>
        <h3 style={h3}><Mail size={16} color="#8C2F1C" /> Templates aren't installed yet</h3>
        <p style={{ ...hint, margin: 0 }}>Run the database update <strong>20261228000000_maintenance_tabs.sql</strong> and redeploy the send-email function. ({problem})</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <h3 style={h3}><Mail size={16} color="#B4511E" /> Notification Templates</h3>
      <p style={hint}>The emails joiners get. Change the subject, heading and message; booking details, pickup points and buttons are added automatically. Sign-in codes and the monthly summary aren't editable.</p>
      <label style={{ position: 'relative', display: 'block', marginBottom: 10 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7A3A18' }} />
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search emails" aria-label="Search emails" style={{ ...inp, paddingLeft: 34 }} />
      </label>
      <StatusFilter statuses={STATUSES} value={status} onChange={(v) => { setStatus(v); setPage(1); }} count={(st) => (rows ? EMAIL_KINDS.filter((k) => matches(k, st)).length : 0)} style={{ marginBottom: 12 }} />
      {!rows ? <p style={{ ...hint, display: 'flex', gap: 8 }}><Loader2 size={15} style={spin} /> Loading…</p> : visible.length === 0 ? <p style={{ ...hint, margin: 0 }}>No emails match.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
          {visible.map((k) => {
            const t = isChanged(k[0]) ? rows[k[0]] : EMAIL_DEFAULTS[k[0]];
            return (
              <div key={k[0]} style={{ background: '#F2E4D0', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00' }}>{k[1]} {isChanged(k[0]) && <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', color: '#A8481A', background: 'rgba(168,72,26,0.12)', borderRadius: 999, padding: '2px 7px', marginLeft: 4 }}>CHANGED</span>}</p>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>{k[2]}</p>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#1A0A00' }}>Subject: {fillIn(t.subject, SAMPLE_VARS)}</p>
                {isChanged(k[0]) && <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: '#7A3A18' }}>Changed {when(rows[k[0]].updated_at)}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <button type="button" style={btn(false)} onClick={() => setEditing(k)}><Pencil size={13} /> Edit</button>
                  {isChanged(k[0]) && <button type="button" style={btn(false)} onClick={() => resetToDefault(k)}><RotateCcw size={13} /> Use default</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pager page={current} pages={pages} onPage={setPage} />
      {editing && <TemplateForm kind={editing} saved={rows?.[editing[0]] || null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
};

const TemplateForm = ({ kind, saved, onClose, onSaved }) => {
  const [key, name, , words] = kind;
  const start = saved?.is_active ? saved : EMAIL_DEFAULTS[key];
  const [f, setF] = useState({ subject: start.subject, heading: start.heading, message: start.message });
  const [saving, setSaving] = useState(false);
  const unknown = [...`${f.subject} ${f.heading} ${f.message}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((w) => !words.includes(w));

  const save = async () => {
    if (f.subject.trim().length < 3 || f.heading.trim().length < 2 || f.message.trim().length < 5) { toast.error('Fill in the subject, heading and message'); return; }
    if (unknown.length) { toast.error('Unknown words in {braces}', `${[...new Set(unknown)].map((w) => `{${w}}`).join(', ')} can't be filled in for this email.`); return; }
    if (!(await confirmDialog({ title: `Save the "${name}" email?`, message: 'Joiners get the new text from the next email on.', confirmLabel: 'Save', cancelLabel: 'Keep Editing' }))) return;
    setSaving(true);
    const { error } = await supabase.from('notification_templates').upsert([{ key, subject: f.subject.trim(), heading: f.heading.trim(), message: f.message.trim(), is_active: true }], { onConflict: 'key' });
    setSaving(false);
    if (error) { reportError("Couldn't save the template", error); return; }
    toast.success('Email updated', name);
    onSaved();
  };

  const paragraphs = fillIn(f.message, SAMPLE_VARS).split(/\n\s*\n/);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.6)', backdropFilter: 'blur(3px)' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`Edit ${name}`} style={{ position: 'relative', width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', background: '#FDF6EE', borderRadius: 24, borderTop: '8px solid #B4511E', padding: '1.5rem', boxShadow: '0 24px 60px rgba(26,10,0,0.35)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A0A00' }}>{name}</h3>
          <button type="button" className="x-close" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={20} /></button>
        </div>
        <p style={{ ...hint, margin: 0 }}>Words you can use: {words.map((w) => `{${w}} = ${PLACEHOLDER_HELP[w]}`).join(' · ')}. **text** is bold; a blank line starts a new paragraph.</p>
        <label style={label}>Subject<input value={f.subject} maxLength={200} onChange={(e) => setF({ ...f, subject: e.target.value })} style={inp} /></label>
        <label style={label}>Heading<input value={f.heading} maxLength={120} onChange={(e) => setF({ ...f, heading: e.target.value })} style={inp} /></label>
        <label style={label}>Message<textarea value={f.message} rows={7} maxLength={4000} onChange={(e) => setF({ ...f, message: e.target.value })} style={{ ...inp, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }} /></label>
        {unknown.length > 0 && <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#8C2F1C' }}>{[...new Set(unknown)].map((w) => `{${w}}`).join(', ')} can't be filled in for this email.</p>}
        <div style={{ background: '#FFFDF9', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 14, padding: '14px 16px' }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18' }}>Preview · {fillIn(f.subject, SAMPLE_VARS)}</p>
          <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 900, color: '#C45C26' }}>{fillIn(f.heading, SAMPLE_VARS)}</p>
          {paragraphs.map((p, i) => (
            <p key={i} style={{ margin: '0 0 8px', fontSize: 13.5, color: '#1A0A00', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {p.split(/(\*\*.+?\*\*)/g).map((part, j) => (part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part))}
            </p>
          ))}
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18' }}>(+ the booking details the website adds)</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={btn(false)} onClick={() => setF({ ...EMAIL_DEFAULTS[key] })}><RotateCcw size={13} /> Start from default</button>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
          <button type="button" style={btn(true)} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} style={spin} /> : null} Save Email</button>
        </div>
      </div>
    </div>
  );
};

export default TemplatesTab;
