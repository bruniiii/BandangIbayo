import { useEffect, useState } from 'react';
import { ShieldBan, Plus, Lock, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { useAdminMe } from '../adminMe';
import RecordList from './RecordList';
import { card, h3, hint, btn, input, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Chat Filter
// The words hidden as **** in group chat messages and reviews (the database
// does it, so nothing gets through). Only the main admin adds, archives or
// restores words; words are archived, never deleted.
// ─────────────────────────────────────────────

const inp = { ...input, letterSpacing: 0, textTransform: 'none', fontWeight: 600 };

const ChatFilterTab = () => {
  const me = useAdminMe();
  const [rows, setRows] = useState(null);
  const [problem, setProblem] = useState('');
  const [word, setWord] = useState('');
  const [test, setTest] = useState('');
  const [tested, setTested] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from('chat_filter_words').select('*').order('word');
    if (error) { setProblem(error.message); setRows([]); return; }
    setRows(data || []);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the words when the tab opens
  useEffect(() => { load(); }, []);

  const add = async () => {
    const w = word.trim().replace(/\s+/g, ' ').toLowerCase();
    if (w.length < 2 || w.length > 60) { toast.error('Enter a word of 2 to 60 letters'); return; }
    if (/[<>{}\\]/.test(w)) { toast.error('Use letters, numbers and spaces only'); return; }
    const existing = (rows || []).find((r) => r.word === w);
    if (existing) { toast.info(existing.is_active ? 'Already blocked' : 'It\'s archived', existing.is_active ? w : 'Restore it from the Archived list.'); return; }
    setBusy('add');
    const { error } = await supabase.from('chat_filter_words').insert([{ word: w }]);
    setBusy('');
    if (error) { toast.error("Couldn't add it", error.message); return; }
    setWord('');
    toast.success('Word blocked', `"${w}" will show as **** in chats and reviews.`);
    load();
  };
  const setActive = async (x, on) => {
    if (!on && !(await confirmDialog({ title: `Allow "${x.word}" again?`, message: 'It won\'t be hidden in new messages and reviews. You can restore it any time.', confirmLabel: 'Archive', cancelLabel: 'Keep Blocking', tone: 'danger' }))) return;
    const { error } = await supabase.from('chat_filter_words').update({ is_active: on }).eq('id', x.id);
    if (error) { toast.error("Couldn't change it", error.message); return; }
    toast.success(on ? 'Blocked again' : 'Archived', x.word);
    load();
  };
  const runTest = async () => {
    setBusy('test');
    const { data, error } = await supabase.rpc('mask_sensitive_words', { p_text: test });
    setBusy('');
    if (error) { toast.error("Couldn't test it", error.message); return; }
    setTested(data ?? '');
  };

  if (problem) {
    return (
      <div style={card}>
        <h3 style={h3}><ShieldBan size={16} color="#8C2F1C" /> Chat filter isn't installed yet</h3>
        <p style={{ ...hint, margin: 0 }}>Run the database update <strong>20261228000000_maintenance_tabs.sql</strong>. ({problem})</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <h3 style={h3}><ShieldBan size={16} color="#B4511E" /> Chat Filter</h3>
      <p style={hint}>Words hidden as **** in group chat messages and reviews (English, Filipino, Bisaya, Ilocano, Spanish). Whole words only, so "class" isn't caught by "ass".</p>
      {me.isMain ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input value={word} maxLength={60} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Add a word or phrase" aria-label="Word to block" style={{ ...inp, flex: '1 1 200px' }} />
          <button type="button" style={btn(true)} disabled={busy === 'add'} onClick={add}>{busy === 'add' ? <Loader2 size={14} style={spin} /> : <Plus size={14} />} Block Word</button>
        </div>
      ) : (
        <p style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#F2E4D0', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, fontWeight: 700, color: '#5C2A10', margin: '0 0 12px' }}>
          <Lock size={15} /> Only the main admin can change the blocked words.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <input value={test} maxLength={500} onChange={(e) => setTest(e.target.value)} placeholder="Try a sentence to see what gets hidden" aria-label="Test sentence" style={{ ...inp, flex: '1 1 240px' }} />
        <button type="button" style={btn(false)} disabled={!test.trim() || busy === 'test'} onClick={runTest}>{busy === 'test' ? <Loader2 size={14} style={spin} /> : null} Test</button>
      </div>
      {tested !== '' && <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#1A0A00', background: '#FFFDF9', borderRadius: 10, padding: '8px 10px' }}>{tested}</p>}
      <RecordList
        items={rows}
        pageSize={30}
        placeholder="Search blocked words"
        empty="No blocked words."
        canEdit={me.isMain}
        textOf={(x) => x.word}
        onArchive={(x) => setActive(x, false)}
        onRestore={(x) => setActive(x, true)}
        render={(x) => <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00', overflowWrap: 'anywhere' }}>{x.word}</p>}
      />
    </div>
  );
};

export default ChatFilterTab;
