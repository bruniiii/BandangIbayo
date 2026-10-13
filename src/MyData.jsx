import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { deleteMyAccount } from './Email';

// ─────────────────────────────────────────────
// YOUR DATA (Data Privacy Act of 2012): a joiner can download a copy of
// everything the system keeps about them, or delete their account.
// Deleting keeps past booking records for the agency's accounts but
// removes the joiner's name, contacts, receipts and companions from them.
// ─────────────────────────────────────────────

const OWN_ROWS = [
  ['bookings', 'user_id'],
  ['reviews', 'user_id'],
  ['feed_comments', 'user_id'],
  ['feed_reactions', 'user_id'],
  ['exclusive_requests', 'user_id'],
  ['notifications', 'user_id'],
  ['tour_waitlist', 'user_id'],
];

const MyData = () => {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    setExporting(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please log in again.');
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      const results = await Promise.all(
        OWN_ROWS.map(([table, column]) => supabase.from(table).select('*').eq(column, user.id)),
      );
      const exportData = {
        exported_at: new Date().toISOString(),
        account: { id: user.id, email: user.email, created_at: user.created_at },
        profile,
        ...Object.fromEntries(OWN_ROWS.map(([table], i) => [table, results[i].data || []])),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bandang-ibayo-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || 'Could not prepare your data.');
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    const { ok, error: deleteError } = await deleteMyAccount();
    if (!ok) {
      setError(deleteError);
      setDeleting(false);
      return;
    }
    // Leave the dashboard first, so signing out doesn't bounce to the login page.
    navigate('/', { replace: true });
    await supabase.auth.signOut();
    toast.success('Your account has been deleted', 'Thank you for travelling with Bandang IBAYO.');
  };

  return (
    <div style={{ background: '#FDF6EE', border: '1px solid rgba(196,92,38,0.15)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: 16, color: '#1A0A00', margin: 0 }}>
          <ShieldCheck size={18} style={{ color: '#C45C26' }} /> Your Data
        </h3>
        <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.9, margin: '4px 0 0', lineHeight: 1.6 }}>
          Under the Data Privacy Act of 2012 you can get a copy of your personal data or ask us to delete it.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" onClick={handleDownload} disabled={exporting} style={button('#1A0A00', '#FDF6EE')}>
          {exporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />} Download my data
        </button>
        {!showDelete && (
          <button type="button" onClick={() => setShowDelete(true)} style={button('rgba(140,47,28,0.08)', '#8C2F1C', '1px solid rgba(140,47,28,0.25)')}>
            <Trash2 size={14} /> Delete my account
          </button>
        )}
      </div>

      {showDelete && (
        <div style={{ background: 'rgba(140,47,28,0.06)', border: '1px solid rgba(140,47,28,0.2)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00', margin: 0, lineHeight: 1.6 }}>
            This permanently deletes your account, profile, requests and uploaded files.
            Past booking records stay in our accounts without your name, contact details or receipts.
            Your reviews and comments stay up but are shown as "Deleted account".
            You can't delete your account while you have an upcoming booking.
          </p>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18' }}>
            Type <strong>DELETE</strong> to confirm
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, background: '#FDF6EE', border: '1px solid rgba(140,47,28,0.25)', borderRadius: 10, padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { setShowDelete(false); setConfirmText(''); }} disabled={deleting} style={button('#FDF6EE', '#1A0A00', '1px solid rgba(196,92,38,0.25)')}>
              Keep my account
            </button>
            <button type="button" onClick={handleDelete} disabled={confirmText !== 'DELETE' || deleting} style={{ ...button('#C0362C', '#FFFFFF'), opacity: confirmText === 'DELETE' ? 1 : 0.5 }}>
              {deleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />} Delete My Account
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12, fontWeight: 700, color: '#8C2F1C', margin: 0 }}>{error}</p>}
    </div>
  );
};

const button = (bg, color, border = 'none') => ({
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px',
  background: bg, color, border, borderRadius: 12, cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase',
});

export default MyData;
