import { useEffect, useState } from 'react';
import { ShieldOff, Loader2, Lock } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import PrettySelect from '../ui/PrettySelect';
import { useAdminMe } from '../adminMe';
import { card, h3, hint, btn } from './shared';

// Cleanups → Auto-anonymize: removes the personal details of joiners archived a long time.

const OPTIONS = [['off', 'Off (keep them)'], ['365', 'After 1 year archived'], ['730', 'After 2 years archived'], ['1095', 'After 3 years archived'], ['1825', 'After 5 years archived']];

export const PrivacySetting = () => {
  const me = useAdminMe();
  const [value, setValue] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'privacy').maybeSingle()
      .then(({ data }) => setValue(data?.value?.anonymize_after_days ? String(data.value.anonymize_after_days) : 'off'));
  }, []);
  const save = async (v) => {
    if (v !== 'off' && !(await confirmDialog({ title: 'Turn on auto-anonymize?', message: `Every day, joiners archived longer than ${OPTIONS.find((o) => o[0] === v)[1].replace('After ', '').replace(' archived', '')} lose their personal details for good (their bookings and payments stay, under "Removed joiner").`, confirmLabel: 'Turn On', cancelLabel: 'Cancel', tone: 'danger' }))) return;
    setSaving(true);
    const { error } = await supabase.rpc('set_privacy_settings', { p_days: v === 'off' ? null : Number(v) });
    setSaving(false);
    if (error) { reportError("Couldn't save it", error); return; }
    setValue(v);
    toast.success(v === 'off' ? 'Auto-anonymize is off' : 'Auto-anonymize is on');
  };
  return (
    <section style={card}>
      <h3 style={h3}><ShieldOff size={16} color="var(--ib-sienna, #A8481A)" /> Data privacy</h3>
      <p style={hint}>
        Remove the personal details of joiners who have been archived for a long time, automatically (their bookings and payments stay, under "Removed joiner").
      </p>
      {!me.isMain && <p style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--ib-brown, #5C2A10)', margin: '0 0 10px' }}><Lock size={15} /> Only the main admin can change this.</p>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 1 300px', minWidth: 0 }}>
          {value == null ? <Loader2 size={15} /> : (
            <PrettySelect ariaLabel="Auto-anonymize" value={value} disabled={!me.isMain || saving} onChange={save} options={OPTIONS.map(([v, l]) => ({ value: v, label: l }))} />
          )}
        </div>
        {saving && <span style={{ ...btn(false), border: 'none' }}><Loader2 size={14} /></span>}
      </div>
    </section>
  );
};
