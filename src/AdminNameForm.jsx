import React, { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { nameError } from './validation';
import { adminMeChanged } from './adminMe';
import { usePopupError } from './ui/usePopupError';

// ─────────────────────────────────────────────
// An admin's own name: shown at the top right and on the receipts of the
// payments they process. (Admin Settings and the menu under their name.)
// ─────────────────────────────────────────────

const label = { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', marginBottom: 5 };
const input = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(180,81,30,0.2)',
  background: '#FFFDF9', fontSize: 13, fontWeight: 600, color: '#1A0A00', outline: 'none', fontFamily: 'inherit',
};

const AdminNameForm = ({ onSaved, onCancel, compact = false }) => {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [error, setError] = useState('');
  usePopupError(error);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle();
      if (!alive) return;
      setFirst(data?.first_name || '');
      setLast(data?.last_name || '');
    })();
    return () => { alive = false; };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const problem = nameError(first, 'First name') || nameError(last, 'Last name');
    if (problem) { setError(problem); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('profiles')
      .update({ first_name: first.trim().replace(/\s+/g, ' '), last_name: last.trim().replace(/\s+/g, ' ') })
      .eq('id', user?.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    adminMeChanged();
    toast.success('Name saved', 'It shows at the top right and on the receipts of payments you process.');
    onSaved?.();
  };

  return (
    <form onSubmit={save} noValidate style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
      <div style={{ flex: compact ? '1 1 100%' : '1 1 180px' }}>
        <label style={label} htmlFor="my-first-name">First Name</label>
        <input id="my-first-name" data-allow="name" value={first} maxLength={60} onChange={(e) => { setFirst(e.target.value); setError(''); }} style={input} />
      </div>
      <div style={{ flex: compact ? '1 1 100%' : '1 1 180px' }}>
        <label style={label} htmlFor="my-last-name">Last Name</label>
        <input id="my-last-name" data-allow="name" value={last} maxLength={60} onChange={(e) => { setLast(e.target.value); setError(''); }} style={input} />
      </div>
      <button type="submit" disabled={saving} style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, padding: '0 18px', borderRadius: 10, border: 'none',
        background: '#1A0A00', color: '#E8A265', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase',
        cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, flex: compact ? '1 1 100%' : '0 0 auto',
      }}>
        {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} Save Name
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={saving} style={{
          height: 38, padding: '0 16px', borderRadius: 10, border: '1px solid rgba(180,81,30,0.3)', background: 'transparent', color: '#7A3A18',
          fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', flex: compact ? '1 1 100%' : '0 0 auto',
        }}>Cancel</button>
      )}
      {error && <p role="alert" style={{ flexBasis: '100%', margin: 0, fontSize: 12, fontWeight: 800, color: '#8C2F1C' }}>{error}</p>}
    </form>
  );
};

export default AdminNameForm;
