import React, { useEffect, useRef, useState } from 'react';
import { MessageSquareText, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from './toast';

// ─────────────────────────────────────────────
// Admins' saved replies in the group chat: tap one to put it in the message
// box (then edit or send). Shared by all admins (app_settings
// "chat_quick_replies"); anyone can add or remove them.
// ─────────────────────────────────────────────

const KEY = 'chat_quick_replies';
const DEFAULTS = [
  'Your payment is confirmed. See you on the trip!',
  'Reminder: please be at your pickup point 15 minutes early.',
  'The van is on the way. Please follow it on the Tracking page.',
  "Please bring a valid ID, water, and the things on your checklist in My Bookings.",
  'Thank you for joining Bandang IBAYO! Please leave a review in Reviews.',
];

const QuickReplies = ({ onPick }) => {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState(null);
  const [draft, setDraft] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open || replies) return;
    supabase.from('app_settings').select('value').eq('key', KEY).maybeSingle().then(({ data }) => {
      setReplies(Array.isArray(data?.value) ? data.value : DEFAULTS);
    });
  }, [open, replies]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const save = async (next) => {
    setReplies(next);
    const { error } = await supabase.from('app_settings').upsert([{ key: KEY, value: next, updated_at: new Date().toISOString() }], { onConflict: 'key' });
    if (error) toast.error("Couldn't save the replies", error.message);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Saved replies" title="Saved replies" aria-expanded={open} style={{
        width: 42, height: 42, borderRadius: 14, border: '1px solid rgba(180,81,30,0.25)', background: open ? '#F2E4D0' : '#FDF6EE',
        color: '#A8481A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><MessageSquareText size={18} /></button>
      {open && (
        <div role="dialog" aria-label="Saved replies" style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 320, maxWidth: 'calc(100vw - 40px)', maxHeight: 360, overflowY: 'auto',
          background: '#FFFDF9', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 16, boxShadow: '0 18px 40px rgba(26,10,0,0.2)', padding: 10, zIndex: 30,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 4px 8px' }}>
            <strong style={{ fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8481A' }}>Saved replies</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="no-touch-size" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={15} /></button>
          </div>
          {replies === null ? <p style={{ margin: 6, fontSize: 12.5, color: '#7A3A18' }}>Loading…</p> : replies.map((r, i) => (
            <div key={`${i}-${r}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <button type="button" onClick={() => { onPick(r); setOpen(false); }} style={{
                flex: 1, textAlign: 'left', background: 'none', border: 'none', borderRadius: 10, padding: '8px 8px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#1A0A00', lineHeight: 1.4,
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F2E4D0'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              >{r}</button>
              <button type="button" onClick={() => save(replies.filter((_, j) => j !== i))} aria-label="Remove this reply" className="no-touch-size" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C2F1C', padding: 8 }}><Trash2 size={13} /></button>
            </div>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); const t = draft.trim(); if (t) { save([...(replies || []), t.slice(0, 500)]); setDraft(''); } }}
            style={{ display: 'flex', gap: 6, marginTop: 8, borderTop: '1px solid rgba(180,81,30,0.12)', paddingTop: 8 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="Add a saved reply…" aria-label="New saved reply"
              style={{ flex: 1, minWidth: 0, borderRadius: 10, border: '1px solid rgba(180,81,30,0.25)', padding: '8px 10px', fontFamily: 'inherit', fontSize: 16, background: '#FDF6EE', color: '#1A0A00' }} />
            <button type="submit" disabled={!draft.trim()} aria-label="Add" style={{ width: 38, borderRadius: 10, border: 'none', background: '#B4511E', color: '#FDF6EE', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={16} /></button>
          </form>
        </div>
      )}
    </div>
  );
};

export default QuickReplies;
