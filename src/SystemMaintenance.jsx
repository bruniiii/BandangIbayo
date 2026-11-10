import React, { useEffect, useState } from 'react';
import { Activity, Database, History, Power, Scale, Truck, Bus, MapPin, FileText, Mail, ShieldBan, Building2 } from 'lucide-react';
import { useMaintenance } from './maintenanceMode';
import PrettySelect from './ui/PrettySelect';
import BookingRulesTab from './maintenance/BookingRulesTab';
import SuppliersTab from './maintenance/SuppliersTab';
import DriversVansTab from './maintenance/DriversVansTab';
import PickupPointsTab from './maintenance/PickupPointsTab';
import PoliciesTab from './maintenance/PoliciesTab';
import TemplatesTab from './maintenance/TemplatesTab';
import ChatFilterTab from './maintenance/ChatFilterTab';
import AgencyTab from './maintenance/AgencyTab';
import ActivityTab from './maintenance/ActivityTab';
import DatabaseTab from './maintenance/DatabaseTab';
import SystemStatusTab from './maintenance/SystemStatusTab';

// ─────────────────────────────────────────────
// Admin → System Maintenance: reference data and business rules, changed
// here instead of in the code. All admins can look; the database decides
// who can change what (booking rules, policies, the chat filter, agency
// information and exports: the main admin only).
//   Booking Rules · Suppliers · Drivers & Vehicles · Pickup Points ·
//   Policies & Content · Notification Templates · Chat Filter ·
//   Agency Information · Audit Trail · Backup & Export · System Status
// Master data is archived and restored, never deleted.
// ─────────────────────────────────────────────

const TABS = [
  ['rules', 'Booking Rules', Scale],
  ['suppliers', 'Suppliers', Truck],
  ['fleet', 'Drivers & Vehicles', Bus],
  ['pickup', 'Pickup Points', MapPin],
  ['policies', 'Policies & Content', FileText],
  ['templates', 'Notification Templates', Mail],
  ['chat', 'Chat Filter', ShieldBan],
  ['agency', 'Agency Information', Building2],
  ['audit', 'Audit Trail', History],
  ['backup', 'Backup & Export', Database],
  ['status', 'System Status', Activity],
];
const SAVED_TAB = 'ibayo:maintenance-tab';
// Tabs from before (saved in this browser) open their new place.
const OLD_TABS = { overview: 'status', settings: 'status', data: 'status', security: 'status', activity: 'audit', database: 'backup' };

const readTab = () => {
  try {
    const t = localStorage.getItem(SAVED_TAB);
    const k = OLD_TABS[t] || t;
    return TABS.some(([x]) => x === k) ? k : 'status';
  } catch { return 'status'; }
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
  const [statusPart, setStatusPart] = useState('overview');
  const setTab = (raw) => {
    const t = OLD_TABS[raw] || raw;
    if (raw in OLD_TABS && t === 'status') setStatusPart(raw === 'overview' ? 'overview' : raw);
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
          <span>Maintenance Mode is on: joiners see the "We'll be back soon" page. Open System Status → Maintenance Mode to turn it off.</span>
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
      {tab === 'suppliers' && <SuppliersTab />}
      {tab === 'fleet' && <DriversVansTab />}
      {tab === 'pickup' && <PickupPointsTab />}
      {tab === 'policies' && <PoliciesTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'chat' && <ChatFilterTab />}
      {tab === 'agency' && <AgencyTab />}
      {tab === 'audit' && <ActivityTab />}
      {tab === 'backup' && <DatabaseTab onNavigate={onNavigate} onTab={setTab} />}
      {tab === 'status' && <SystemStatusTab key={statusPart} start={statusPart} onNavigate={onNavigate} onTab={setTab} />}
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
};

export default SystemMaintenance;
