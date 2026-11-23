import React, { useEffect, useRef, useState } from 'react';
import ChipTabs from './ui/ChipTabs';
import { Power, Search, X, CornerDownLeft, Scale, Bus, Globe, Activity } from 'lucide-react';
import { useMaintenance } from './maintenanceMode';
import PrettySelect from './ui/PrettySelect';
import BookingRulesTab from './maintenance/BookingRulesTab';
import SuppliersTab from './maintenance/SuppliersTab';
import DriversVansTab from './maintenance/DriversVansTab';
import PickupPointsTab from './maintenance/PickupPointsTab';
import DestinationsTab from './maintenance/DestinationsTab';
import PoliciesTab from './maintenance/PoliciesTab';
import TemplatesTab from './maintenance/TemplatesTab';
import ListsTab from './maintenance/ListsTab';
import SiteContentTab from './maintenance/SiteContentTab';
import ChatFilterTab from './maintenance/ChatFilterTab';
import AgencyTab from './maintenance/AgencyTab';
import ActivityTab from './maintenance/ActivityTab';
import OverviewTab from './maintenance/OverviewTab';
import SettingsTab from './maintenance/SettingsTab';
import DataTab from './maintenance/DataTab';
import SecurityTab from './maintenance/SecurityTab';
import HealthTab from './maintenance/HealthTab';
import LastChanged from './maintenance/LastChanged';
import PaymentsTab from './maintenance/PaymentsTab';
import { GROUPS, SECTIONS, SECTION, OLD_SECTIONS, searchSections } from './maintenance/sections';

// ─────────────────────────────────────────────
// Admin → System Maintenance: reference data and business rules, changed
// here instead of in the code. All admins can look; the database decides
// who can change what (booking rules, policies, the chat filter, contact
// details and exports: the main admin only).
// The sections come in 4 groups (maintenance/sections.js):
//   Bookings · Trips · Website & messages · System
// A search box at the top finds a section or a booking rule by name.
// Under the sections: who changed this one last (from the Audit Trail).
// Master data is archived and restored, never deleted.
// ─────────────────────────────────────────────

const SAVED_TAB = 'ibayo:maintenance-tab';
const GROUP_ICONS = { Bookings: Scale, Trips: Bus, 'Website & messages': Globe, System: Activity };
const fix = (t) => OLD_SECTIONS[t] || t;

const readTab = () => {
  try {
    const t = fix(localStorage.getItem(SAVED_TAB));
    return SECTION[t] ? t : 'overview';
  } catch { return 'overview'; }
};

// Phones: the sections become one menu.
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

// The search box: type "seats", "gcash", "refund"… and pick where to go.
const SectionSearch = ({ onPick }) => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);
  const results = searchSections(text);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const pick = (r) => { onPick(r); setText(''); setOpen(false); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[hi]) { e.preventDefault(); pick(results[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', maxWidth: 560 }}>
      <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ib-rust, #7A3A18)', pointerEvents: 'none' }} />
      <input
        type="text" inputMode="search" enterKeyHint="go" value={text} placeholder='Search settings: seats, GCash, refund…' aria-label="Search System Maintenance"
        role="combobox" aria-expanded={open && results.length > 0} aria-controls="maint-search-list" aria-autocomplete="list"
        onChange={(e) => { setText(e.target.value); setHi(0); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        style={{
          width: '100%', boxSizing: 'border-box', height: 46, padding: '0 40px 0 40px', borderRadius: 999, fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
          border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.28)', background: 'var(--ib-surface, #FFFDF9)', color: 'var(--ib-dark, #1A0A00)',
          boxShadow: '0 4px 14px rgba(var(--ib-shadow-rgb, 26,10,0), 0.05)',
        }} />
      {text && (
        <button type="button" aria-label="Clear search" onClick={() => { setText(''); setOpen(false); }} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--ib-rust, #7A3A18)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
      )}
      {open && text.trim() && (
        <div id="maint-search-list" role="listbox" style={{
          position: 'absolute', zIndex: 30, top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--ib-surface, #FFFDF9)', borderRadius: 16, padding: 6,
          border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.2)', boxShadow: '0 18px 40px rgba(var(--ib-shadow-rgb, 26,10,0), 0.18)',
        }}>
          {results.length === 0 ? (
            <p style={{ margin: 0, padding: '12px 14px', fontSize: 13, fontWeight: 600, color: 'var(--ib-rust, #7A3A18)' }}>Nothing matches “{text.trim()}”. Try another word.</p>
          ) : results.map((r, i) => {
            const Icon = SECTION[r.tab].icon;
            return (
              <button key={r.id} type="button" role="option" aria-selected={i === hi} onMouseEnter={() => setHi(i)} onClick={() => pick(r)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                background: i === hi ? 'rgba(var(--ib-accent-rgb, 180,81,30), 0.1)' : 'transparent', color: 'var(--ib-dark, #1A0A00)',
              }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ib-parch, #F2E4D0)', color: 'var(--ib-accent, #B4511E)' }}><Icon size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800 }}>{r.label}</span>
                  <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ib-rust, #7A3A18)' }}>{r.where}</span>
                </span>
                {i === hi && <CornerDownLeft size={14} style={{ color: 'var(--ib-rust, #7A3A18)' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SystemMaintenance = ({ onNavigate = () => {} }) => {
  const [tab, setTabState] = useState(readTab);
  const [redraw, setRedraw] = useState(0); // after an Undo, the section reloads
  const [ruleQuery, setRuleQuery] = useState(''); // a booking rule picked in the search
  // The last section opened in each group (clicking a group goes back to it).
  const lastIn = useRef({ [SECTION[tab].group]: tab });
  const narrow = useNarrow();
  const maintenance = useMaintenance();
  const setTab = (raw) => {
    const t = SECTION[fix(raw)] ? fix(raw) : 'overview';
    setRuleQuery('');
    lastIn.current[SECTION[t].group] = t;
    setTabState(t);
    try { localStorage.setItem(SAVED_TAB, t); } catch { /* not saved */ }
  };
  const fromSearch = (r) => { setTab(r.tab); if (r.rule) setRuleQuery(r.rule); };



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 40 }}>
      {maintenance.on && (
        <button type="button" onClick={() => setTab('settings')} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(var(--ib-red-rgb, 140,47,28), 0.4)',
          background: 'var(--ib-surface-2, #FBEDE6)', color: 'var(--ib-red, #8C2F1C)', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', textAlign: 'left',
        }}>
          <Power size={16} style={{ flexShrink: 0 }} />
          <span>Maintenance Mode is on: joiners see the "We'll be back soon" page. Open System → Maintenance Mode & Emails to turn it off.</span>
        </button>
      )}

      <SectionSearch onPick={fromSearch} />

      {narrow ? (
        <PrettySelect ariaLabel="System Maintenance section" value={tab} onChange={setTab}
          options={SECTIONS.map((s) => ({ value: s.key, label: `${s.group} · ${s.label}` }))} />
      ) : (
        <div className="maint-nav" style={{
          borderRadius: 20, overflow: 'hidden', border: '1px dashed rgba(var(--ib-accent-rgb, 180,81,30), 0.28)',
          background: 'rgba(var(--ib-accent-rgb, 180,81,30), 0.05)',
        }}>
          {/* The 4 groups, side by side; the chosen one's sections underneath. */}
          <div role="tablist" aria-label="System Maintenance groups" className="maint-group-row" style={{ display: 'grid', gap: 10, padding: '12px 12px 14px', borderBottom: '1px dashed rgba(var(--ib-accent-rgb, 180,81,30), 0.28)' }}>
            {GROUPS.map(([group, list]) => {
              const on = group === SECTION[tab].group;
              const Icon = GROUP_ICONS[group];
              return (
                <button key={group} type="button" role="tab" aria-selected={on} onClick={() => { if (!on) setTab(lastIn.current[group] || list[0][0]); }} className={on ? 'maint-group-btn is-on' : 'maint-group-btn'} style={{
                  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 62, padding: '8px 12px', borderRadius: 16,
                  cursor: on ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  background: on ? 'rgba(var(--ib-sienna-rgb, 10,124,148), 0.1)' : 'var(--ib-surface, #FFFDF9)',
                  border: on ? '2px solid var(--ib-sienna, #A8481A)' : '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.2)',
                  boxShadow: on ? 'none' : '0 3px 10px rgba(var(--ib-shadow-rgb, 26,10,0), 0.08)',
                }}>
                  <span style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: on ? 'var(--ib-sienna, #A8481A)' : 'rgba(var(--ib-sienna-rgb, 10,124,148), 0.1)', color: on ? 'var(--ib-on-ink, #FDF6EE)' : 'var(--ib-sienna, #A8481A)' }}><Icon size={17} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="journal-hand" style={{ display: 'block', fontSize: 23, lineHeight: 1.05, color: 'var(--ib-sienna, #A8481A)' }}>{group}</span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ib-rust, #7A3A18)' }}>{list.length} section{list.length === 1 ? '' : 's'}</span>
                  </span>
                  {/* A little arrow from the chosen group down to its sections */}
                  {on && <span aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: -9, width: 14, height: 14, transform: 'translateX(-50%) rotate(45deg)', background: 'var(--ib-surface, #FFFDF9)', borderRight: '2px solid var(--ib-sienna, #A8481A)', borderBottom: '2px solid var(--ib-sienna, #A8481A)', borderRadius: '0 0 3px 0' }} />}
                </button>
              );
            })}
          </div>
          <div style={{ padding: '14px 16px' }}>
            <ChipTabs ariaLabel={`${SECTION[tab].group} sections`} value={tab} onChange={setTab} items={GROUPS.find(([g]) => g === SECTION[tab].group)[1].map(([key, label, icon]) => ({ value: key, label, icon }))} />
          </div>
        </div>
      )}

      <LastChanged key={tab} section={tab} onOpenAudit={() => setTab('audit')} onUndone={() => setRedraw((n) => n + 1)} />
      <React.Fragment key={redraw}>

      {tab === 'rules' && <BookingRulesTab key={ruleQuery} initialQuery={ruleQuery} />}
      {tab === 'suppliers' && <SuppliersTab />}
      {tab === 'fleet' && <DriversVansTab />}
      {tab === 'destinations' && <DestinationsTab />}
      {tab === 'pickup' && <PickupPointsTab />}
      {tab === 'site' && <SiteContentTab />}
      {tab === 'policies' && <PoliciesTab />}
      {tab === 'lists' && <ListsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'chat' && <ChatFilterTab />}
      {tab === 'agency' && <AgencyTab />}
      {tab === 'overview' && <OverviewTab onTab={setTab} />}
      {tab === 'settings' && <SettingsTab onNavigate={onNavigate} />}
      {tab === 'health' && <HealthTab />}
      {tab === 'data' && <DataTab onNavigate={onNavigate} />}
      {tab === 'security' && <SecurityTab onNavigate={onNavigate} />}
      {tab === 'audit' && <ActivityTab />}
      {tab === 'payments' && <PaymentsTab />}
      </React.Fragment>
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
};

export default SystemMaintenance;
