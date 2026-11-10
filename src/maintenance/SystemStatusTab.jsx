import { useState } from 'react';
import { Activity, Power, Wrench, ShieldCheck } from 'lucide-react';
import OverviewTab from './OverviewTab';
import SettingsTab from './SettingsTab';
import DataTab from './DataTab';
import SecurityTab from './SecurityTab';

// ─────────────────────────────────────────────
// System Maintenance → System Status
// How the website is doing (overview), Maintenance Mode and the email
// switches, cleanups of outdated data, and the security summary.
// onTab: opens another System Maintenance tab (e.g. Backup & Export).
// ─────────────────────────────────────────────

const PARTS = [
  ['overview', 'Overview', Activity],
  ['settings', 'Maintenance Mode & Emails', Power],
  ['data', 'Cleanups', Wrench],
  ['security', 'Security', ShieldCheck],
];

const SystemStatusTab = ({ onNavigate, onTab, start = 'overview' }) => {
  const [part, setPart] = useState(start);
  const go = (k) => (PARTS.some(([p]) => p === k) ? setPart(k) : onTab?.(k === 'database' ? 'backup' : k));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div role="tablist" aria-label="System Status sections" style={{ display: 'flex', gap: 4, background: '#F2E4D0', borderRadius: 14, padding: 4, flexWrap: 'wrap' }}>
        {PARTS.map((p) => {
          const Icon = p[2];
          const on = part === p[0];
          return (
            <button key={p[0]} type="button" role="tab" aria-selected={on} onClick={() => setPart(p[0])} style={{
              flex: '1 1 150px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38, border: 'none', borderRadius: 10,
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
              background: on ? '#1A0A00' : 'transparent', color: on ? '#FDF6EE' : '#5C2A10',
            }}><Icon size={14} /> {p[1]}</button>
          );
        })}
      </div>
      {part === 'overview' && <OverviewTab onTab={go} />}
      {part === 'settings' && <SettingsTab onNavigate={onNavigate} />}
      {part === 'data' && <DataTab onNavigate={onNavigate} />}
      {part === 'security' && <SecurityTab onNavigate={onNavigate} />}
    </div>
  );
};

export default SystemStatusTab;
