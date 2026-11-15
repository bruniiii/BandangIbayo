import { useState } from 'react';
import { Download, ShieldOff, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from './toast';
import { confirmDialog } from './ConfirmDialog';
import { useAdminMe } from '../adminMe';

// Joiner Accounts (main admin): a joiner's data request under the Data
// Privacy Act. "Download their data" saves everything about them as a file;
// "Remove personal details" anonymizes them for good (bookings and money
// records stay, under "Removed joiner"; they can't log in anymore).
const btn = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
  fontWeight: 900, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'transparent', color, border: `1px solid ${color}55`,
});

const JoinerPrivacyActions = ({ joiner, onChanged }) => {
  const me = useAdminMe();
  const [busy, setBusy] = useState('');
  if (!me.isMain || !joiner?.id) return null;
  const anonymized = String(joiner.archive_reason || '').startsWith('anonymized');

  const download = async () => {
    setBusy('export');
    const { data, error } = await supabase.rpc('export_joiner_data', { p_user_id: joiner.id });
    setBusy('');
    if (error) { reportError("Couldn't export the data", error); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `joiner-data-${(joiner.username || joiner.id).toString().replace(/[^\w-]/g, '')}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Data downloaded', 'Send it to the joiner by a safe channel.');
  };

  const anonymize = async () => {
    const reason = await confirmDialog({
      title: 'Remove this joiner\'s personal details?',
      message: 'Their name, contacts, address, birthday and photo are erased for good, and they can\'t log in anymore. Their bookings and payments stay for the records, under "Removed joiner". This can\'t be undone.',
      confirmLabel: 'Remove Details', cancelLabel: 'Keep', tone: 'danger', typeToConfirm: 'REMOVE',
      reasonLabel: 'Why (e.g. "Joiner asked by email on Nov 15")',
    });
    if (!reason) return;
    setBusy('anon');
    const { error } = await supabase.rpc('anonymize_joiner', { p_user_id: joiner.id, p_reason: reason });
    setBusy('');
    if (error) { reportError("Couldn't remove the details", error); return; }
    toast.success('Personal details removed');
    onChanged?.();
  };

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <button type="button" onClick={download} disabled={!!busy} style={btn('#7A3A18')}>{busy === 'export' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />} Download Their Data</button>
      {!anonymized && <button type="button" onClick={anonymize} disabled={!!busy} style={btn('#8C2F1C')}>{busy === 'anon' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldOff size={13} />} Remove Personal Details</button>}
    </div>
  );
};

export default JoinerPrivacyActions;
