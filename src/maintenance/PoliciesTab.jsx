import { useEffect, useState } from 'react';
import { FileText, Loader2, Lock, Send, History, Eye, RotateCcw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import Pager from '../ui/Pager';
import { paginate } from '../ui/paginate';
import { useAdminMe } from '../adminMe';
import { POLICY_WORDS, policySections, forgetPolicy } from '../policies';
import { card, h3, hint, btn, input, label, when, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Policies & Content
// The Terms & Conditions joiners agree to. Each change is published as a new
// version (old versions are kept, never edited or deleted). Only the main
// admin publishes; all admins can read every version.
// ─────────────────────────────────────────────

const inp = { ...input, letterSpacing: 0, textTransform: 'none', fontWeight: 600 };

const PoliciesTab = () => {
  const me = useAdminMe();
  const [versions, setVersions] = useState(null);
  const [problem, setProblem] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  const load = async () => {
    const { data, error } = await supabase.from('site_policies').select('*').eq('slug', 'terms').order('version', { ascending: false });
    if (error) { setProblem(error.message); setVersions([]); return; }
    setVersions(data || []);
    const cur = (data || []).find((v) => v.is_current);
    if (cur) { setTitle(cur.title); setBody(cur.body); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the versions when the tab opens
  useEffect(() => { load(); }, []);

  const current = (versions || []).find((v) => v.is_current);
  const changed = current && (title.trim() !== current.title || body.trim() !== current.body.trim());

  const publish = async () => {
    if (title.trim().length < 3) { toast.error('Add a title'); return; }
    if (body.trim().length < 20) { toast.error('The text is too short'); return; }
    if (!(await confirmDialog({
      title: `Publish version ${(current?.version || 0) + 1}?`,
      message: 'Joiners will see the new Terms & Conditions right away (registration and Private Tours). The current version is kept in the history.',
      confirmLabel: 'Publish', cancelLabel: 'Keep Editing',
    }))) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('publish_policy', { p_slug: 'terms', p_title: title.trim(), p_body: body.trim(), p_note: note.trim() || null });
    setSaving(false);
    if (error) { reportError("Couldn't publish it", error); return; }
    forgetPolicy('terms');
    setNote('');
    toast.success(`Version ${data} published`, 'Joiners see it now.');
    load();
  };

  if (problem) {
    return (
      <div style={card}>
        <h3 style={h3}><FileText size={16} color="#8C2F1C" /> Policies aren't installed yet</h3>
        <p style={{ ...hint, margin: 0 }}>Run the database update <strong>20261228000000_maintenance_tabs.sql</strong>, then open this tab again. ({problem})</p>
      </div>
    );
  }

  const { visible, pages, current: pageNow } = paginate(versions || [], page, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <h3 style={h3}><FileText size={16} color="#B4511E" /> Terms & Conditions</h3>
        <p style={hint}>
          What joiners agree to when they register and send a private tour request. {current ? `Now showing version ${current.version} (published ${when(current.published_at)}).` : ''}
          {' '}Start a section with <strong>## </strong>. These words are filled in from Booking Rules: {POLICY_WORDS.map(([k, d]) => `{${k}} (${d})`).join(', ')}.
        </p>
        {!me.isMain && (
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#F2E4D0', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, fontWeight: 700, color: '#5C2A10', margin: '0 0 12px' }}>
            <Lock size={15} /> Only the main admin can publish a new version. You can read every version here.
          </p>
        )}
        {!versions ? <p style={{ ...hint, display: 'flex', gap: 8 }}><Loader2 size={15} style={spin} /> Loading…</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={label}>Title
              <input value={title} disabled={!me.isMain} maxLength={120} onChange={(e) => setTitle(e.target.value)} style={inp} />
            </label>
            <label style={label}>Text
              <textarea value={body} disabled={!me.isMain} rows={16} maxLength={30000} onChange={(e) => setBody(e.target.value)} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
            </label>
            {me.isMain && (
              <label style={label}>What changed (optional, for the history)
                <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Updated the cancellation section" style={inp} />
              </label>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" style={btn(false)} onClick={() => setPreview((v) => !v)}><Eye size={14} /> {preview ? 'Hide preview' : 'Preview'}</button>
              {me.isMain && <button type="button" style={{ ...btn(true), opacity: changed ? 1 : 0.55 }} disabled={saving || !changed} onClick={publish}>{saving ? <Loader2 size={14} style={spin} /> : <Send size={14} />} Publish New Version</button>}
            </div>
            {preview && (
              <div style={{ background: '#FFFDF9', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 14, padding: '14px 16px' }}>
                {policySections(body).map((s, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    {s.title && <p style={{ margin: '0 0 6px', fontSize: 11.5, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A' }}>{s.title}</p>}
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: '#7A3A18', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{s.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={h3}><History size={16} color="#B4511E" /> Version history</h3>
        {(versions || []).length === 0 ? <p style={{ ...hint, margin: 0 }}>No versions yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map((v) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: v.is_current ? 'rgba(46,107,74,0.1)' : '#F2E4D0', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#1A0A00' }}>Version {v.version}{v.is_current ? ' · current' : ''}</p>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#5C2A10' }}>{when(v.published_at)}{v.note ? ` · ${v.note}` : ''}</p>
                </div>
                {!v.is_current && me.isMain && (
                  <button type="button" style={btn(false)} onClick={() => { setTitle(v.title); setBody(v.body); setNote(`Brought back version ${v.version}`); toast.info(`Version ${v.version} loaded`, 'Check it, then Publish New Version.'); }}><RotateCcw size={13} /> Use this text</button>
                )}
              </div>
            ))}
            <Pager page={pageNow} pages={pages} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
};

export default PoliciesTab;
