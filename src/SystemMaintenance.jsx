import React, { useEffect, useState } from 'react';
import { Activity, Database, Wrench, ShieldCheck, History, Settings, Power, Scale } from 'lucide-react';
import { useMaintenance } from './maintenanceMode';
import PrettySelect from './ui/PrettySelect';
import BookingRulesTab from './maintenance/BookingRulesTab';
import OverviewTab from './maintenance/OverviewTab';
import DatabaseTab from './maintenance/DatabaseTab';
import DataTab from './maintenance/DataTab';
import SecurityTab from './maintenance/SecurityTab';
import ActivityTab from './maintenance/ActivityTab';
import SettingsTab from './maintenance/SettingsTab';

// ─────────────────────────────────────────────
// Admin → System Maintenance: the website's control center.
//  Booking Rules: the business rules the whole website follows (cancellation
//     cutoff, downpayment, refunds, rate limits…); the main admin changes them.
//  System Overview: status (Operational / Under Maintenance), database
//     connection, totals, last maintenance and backup.
//  Database Management: data check for incomplete or inconsistent
//     records, CSV backups and their history.
//  Data Maintenance: where to update records, cleanups of outdated data,
//     what runs automatically, maintenance log.
//  Security Maintenance: admin accounts, failed/locked logins, protections.
//  Activity Logs: who changed what, when, before and after.
//  System Settings (main admin): Maintenance Mode, agency info, email
//     reminders.
// Every save shows a message and is recorded in Activity Logs.
// ─────────────────────────────────────────────

const TABS = [
  ['rules', 'Booking Rules', Scale],
  ['overview', 'System Overview', Activity],
  ['database', 'Database Management', Database],
  ['data', 'Data Maintenance', Wrench],
  ['security', 'Security Maintenance', ShieldCheck],
  ['activity', 'Activity Logs', History],
  ['settings', 'System Settings', Settings],
];
const SAVED_TAB = 'ibayo:maintenance-tab';

const readTab = () => {
  try { const t = localStorage.getItem(SAVED_TAB); return TABS.some(([k]) => k === t) ? t : 'overview'; } catch { return 'overview'; }
};

// Phones: the tabs become one menu.
const useNarrow = () => {
  const q = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setNarrow(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return narrow;
};

const SystemMaintenance = ({ onNavigate = () => {} }) => {
  const [tab, setTabState] = useState(readTab);
  const narrow = useNarrow();
  const maintenance = useMaintenance();
  const setTab = (t) => {
    setTabState(t);
    try { localStorage.setItem(SAVED_TAB, t); } catch { /* not saved */ }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 40 }}>
      {maintenance.on && (
        <button type="button" onClick={() => setTab('settings')} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(140,47,28,0.4)',
          background: '#FBEDE6', color: '#8C2F1C', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', textAlign: 'left',
        }}>
          <Power size={16} style={{ flexShrink: 0 }} />
          <span>Maintenance Mode is on: joiners see the "We'll be back soon" page. Open System Settings to turn it off.</span>
        </button>
      )}

      {narrow ? (
        <PrettySelect ariaLabel="System Maintenance section" value={tab} onChange={setTab}
          options={TABS.map(([key, label], i) => ({ value: key, label: `${i + 1}. ${label}` }))} />
      ) : (
      <div role="tablist" aria-label="System Maintenance sections" className="maintenance-tabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map((t, i) => {
          const [key, label] = t;
          const Icon = t[2];
          const on = tab === key;
          return (
            <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setTab(key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
              background: on ? '#1A0A00' : '#FDF6EE', color: on ? '#FDF6EE' : '#5C2A10',
              border: `1px solid ${on ? '#1A0A00' : 'rgba(180,81,30,0.25)'}`, boxShadow: on ? '0 6px 16px rgba(26,10,0,0.15)' : 'none',
            }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: on ? '#E8A265' : 'rgba(180,81,30,0.12)', color: '#1A0A00', fontSize: 10.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', letterSpacing: 0 }}>{i + 1}</span>
              <Icon size={14} /> {label}
            </button>
          );
        })}
      </div>
      )}

      {tab === 'rules' && <BookingRulesTab />}
      {tab === 'overview' && <OverviewTab onTab={setTab} />}
      {tab === 'database' && <DatabaseTab onNavigate={onNavigate} onTab={setTab} />}
      {tab === 'data' && <DataTab onNavigate={onNavigate} />}
      {tab === 'security' && <SecurityTab onNavigate={onNavigate} />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'settings' && <SettingsTab onNavigate={onNavigate} />}
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
};

export default SystemMaintenance;
