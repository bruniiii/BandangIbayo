import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { deleteMyAccount } from './Email';
import { usePopupError } from './ui/usePopupError';

// ─────────────────────────────────────────────
// YOUR DATA (Data Privacy Act of 2012): a joiner can delete their account
// (Delete my account first, then type DELETE to confirm).
// Deleting keeps past booking records for the agency's accounts but
// removes the joiner's name, contacts, receipts and companions from them.
// ─────────────────────────────────────────────

const MyData = () => {
  const navigate = useNavigate();
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  usePopupError(error);

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
    <div style={{ background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.15)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: 16, color: '#1A0A00', margin: 0 }}>
          <ShieldCheck size={18} style={{ color: '#A8481A' }} /> Your Data
        </h3>
        <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.9, margin: '4px 0 0', lineHeight: 1.6 }}>
          Under the Data Privacy Act of 2012 you can ask us to delete your account and personal data.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
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
            Bandang IBAYO keeps only a short note that the account existed (your name, email and the date it was deleted).
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
            <button type="button" onClick={() => { setShowDelete(false); setConfirmText(''); }} disabled={deleting} style={button('#FDF6EE', '#1A0A00', '1px solid rgba(168,72,26,0.25)')}>
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
