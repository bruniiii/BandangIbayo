import React, { useEffect, useState } from 'react';
import { ShieldCheck, Crown, Lock, KeyRound, UserCog, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAdminMe } from '../adminMe';
import { card, h3, hint, row, btn, when } from './shared';

// ─────────────────────────────────────────────
// Security Maintenance: who can use the admin dashboard, when they last
// logged in, failed and locked logins (security_summary), and the
// protections the website already has.
// Adding/archiving admins stays in Admin Settings (main admin only);
// passwords are changed from the account menu (top right).
// ─────────────────────────────────────────────

const PROTECTIONS = [
  'Every table is protected by Row-Level Security: joiners only see their own records; admin pages need an admin account.',
  'Passwords need 8+ characters with upper and lower case, a number and a symbol.',
  'After 3 wrong passwords, the account is locked for 15 minutes.',
  'Recording a payment by hand needs the admin to type their password again.',
  'Only the main admin can add or archive admins, issue refunds, change booking rules, policies, the chat filter, agency information and Maintenance Mode, and download backups.',
  'Every change an admin makes is saved in Audit Trail (who, what, when, before and after).',
];

const SecurityTab = ({ onNavigate }) => {
  const me = useAdminMe();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    const { data: d, error: err } = await supabase.rpc('security_summary');
    if (err) { setError(err.message); setData({}); } else { setError(''); setData(d || {}); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the summary when the tab opens
  useEffect(() => { load(); }, []);

  const admins = data?.admins || [];
  const failed = data?.failed_recent || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#8C2F1C' }}>Couldn't load the security summary ({error}). Run the latest database update (install_updates.sql).</p>}

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}><UserCog size={16} color="#A8481A" /> Admin accounts ({admins.length})</h3>
            <p style={hint}>Everyone who can use the admin dashboard, and when they last logged in.{data?.archived_admins ? ` ${data.archived_admins} archived admin${data.archived_admins === 1 ? '' : 's'} can't log in.` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={load} style={btn(false)}><RefreshCw size={14} /> Refresh</button>
            {me.isMain && <button type="button" onClick={() => onNavigate('Admin Settings')} style={btn(true)}><UserCog size={14} /> Add or Archive Admins</button>}
          </div>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {admins.map((a) => (
            <li key={a.id} style={{ ...row, padding: '10px 14px' }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: a.main ? '#1A0A00' : '#E8D2B8', color: a.main ? '#E8A265' : '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {a.main ? <Crown size={15} /> : <ShieldCheck size={15} />}
              </span>
              <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 900, color: '#1A0A00' }}>{a.name || 'Admin'}{a.main ? ' · Main admin' : ''}</span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5C2A10', overflowWrap: 'anywhere' }}>{a.email}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#5C2A10' }}>Last login: {a.last_sign_in ? when(a.last_sign_in) : 'never'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={card}>
        <h3 style={h3}><Lock size={16} color="#A8481A" /> Failed and locked logins</h3>
        <p style={hint}>Accounts with wrong passwords in the last 7 days (joiners and admins). Many failed tries on one email can mean someone is guessing the password.</p>
        <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 900, color: Number(data?.locked_now) ? '#8C2F1C' : '#1B5E3B', display: 'flex', alignItems: 'center', gap: 6 }}>
          {Number(data?.locked_now) ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          {Number(data?.locked_now) ? `${data.locked_now} account${data.locked_now === 1 ? ' is' : 's are'} locked right now` : 'No account is locked right now'}
        </p>
        {failed.length === 0 ? <p style={{ margin: 0, fontSize: 12.5, color: '#5C2A10' }}>No failed logins in the last 7 days.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {failed.map((f) => (
              <li key={f.email} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12.5, background: '#F2E4D0', borderRadius: 10, padding: '8px 12px' }}>
                <span style={{ fontWeight: 800, color: '#1A0A00', overflowWrap: 'anywhere' }}>{f.email}: {f.failed} wrong password{f.failed === 1 ? '' : 's'}</span>
                <span style={{ color: f.locked_until && new Date(f.locked_until) > new Date() ? '#8C2F1C' : '#5C2A10', fontWeight: 700 }}>
                  {f.locked_until && new Date(f.locked_until) > new Date() ? `Locked until ${when(f.locked_until)}` : `Last try ${when(f.at)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={card}>
        <h3 style={h3}><KeyRound size={16} color="#A8481A" /> Passwords</h3>
        <p style={{ ...hint, margin: 0 }}>
          Each admin changes their own name and password from the account menu (their name at the top right → Change Password).
          {me.isMain ? ' As the main admin, you add new admins and archive or restore them in Admin Settings.' : ' Only the main admin can add or archive admins.'}
        </p>
      </section>

      <section style={card}>
        <h3 style={h3}><ShieldCheck size={16} color="#A8481A" /> Security settings in place</h3>
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 8 }}>
          {PROTECTIONS.map((p) => (
            <li key={p} style={{ display: 'flex', gap: 10, fontSize: 12.5, color: '#1A0A00', lineHeight: 1.5 }}>
              <CheckCircle2 size={15} color="#2E9B5F" style={{ flexShrink: 0, marginTop: 2 }} /> <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default SecurityTab;
