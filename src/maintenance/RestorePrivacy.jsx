import { useEffect, useState } from 'react';
import { LifeBuoy, ShieldOff, Loader2, Lock } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import PrettySelect from '../ui/PrettySelect';
import { useAdminMe } from '../adminMe';
import { card, h3, hint, btn } from './shared';

// Backup & Export: how to restore the database (done in Supabase, not here,
// since a restore replaces everything), and the auto-anonymize setting.

const STEPS = [
  'Supabase keeps automatic daily backups of the whole database. Check they are on: Supabase → your project → Database → Backups. (Free plans keep fewer days; Pro adds Point-in-Time Recovery to a chosen minute.)',
  'The CSV backups on this page are copies to read in Excel or Google Sheets and keep for your records. They are not used to restore the website.',
  'To restore: in Supabase → Database → Backups, pick the backup (or the time, with Point-in-Time Recovery) and click Restore. The website is unavailable for a few minutes, and everything after that time is lost, so turn on Maintenance Mode first and tell your admins.',
  'After a restore: open Status Overview, run Check Again and the data check here, and make a fresh CSV backup.',
  'Never paste database passwords or keys in chats or screenshots.',
];
const OPTIONS = [['off', 'Off (keep them)'], ['365', 'After 1 year archived'], ['730', 'After 2 years archived'], ['1095', 'After 3 years archived'], ['1825', 'After 5 years archived']];

export const RestoreHelp = () => (
  <section style={card}>
    <h3 style={h3}><LifeBuoy size={16} color="var(--ib-sienna, #A8481A)" /> Restoring the database</h3>
    <p style={hint}>A restore replaces the whole database, so it's done in Supabase, not on this page.</p>
    <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ib-dark, #1A0A00)', lineHeight: 1.6 }}>
      {STEPS.map((s) => <li key={s}>{s}</li>)}
    </ol>
  </section>
);

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
