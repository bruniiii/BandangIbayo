import React, { useEffect, useRef, useState } from 'react';
import { Power, Search, X, CornerDownLeft } from 'lucide-react';
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
import DatabaseTab from './maintenance/DatabaseTab';
import OverviewTab from './maintenance/OverviewTab';
import SettingsTab from './maintenance/SettingsTab';
import DataTab from './maintenance/DataTab';
import SecurityTab from './maintenance/SecurityTab';
import HealthTab from './maintenance/HealthTab';
import LastChanged from './maintenance/LastChanged';
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

  const chip = (key, label, icon) => {
    const Icon = icon;
    const on = tab === key;
    return (
      <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setTab(key)} className={on ? 'maint-chip is-on' : 'maint-chip'} style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 38, padding: '0 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
        fontFamily: 'inherit', fontWeight: 800, fontSize: 12.5,
        background: on ? 'var(--ib-ink, #1A0A00)' : 'var(--ib-surface, #FFFDF9)', color: on ? 'var(--ib-on-ink, #FDF6EE)' : 'var(--ib-brown, #5C2A10)',
        border: `1px solid ${on ? 'var(--ib-dark, #1A0A00)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.22)'}`, boxShadow: on ? '0 6px 16px rgba(var(--ib-shadow-rgb, 26,10,0), 0.15)' : 'none',
      }}>
        <Icon size={14} style={{ color: on ? 'var(--ib-amber, #E8A265)' : 'var(--ib-accent, #B4511E)' }} /> {label}
      </button>
    );
  };

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
          <div role="tablist" aria-label="System Maintenance groups" style={{ display: 'grid', gridTemplateColumns: `repeat(${GROUPS.length}, minmax(0, 1fr))`, borderBottom: '1px dashed rgba(var(--ib-accent-rgb, 180,81,30), 0.28)' }}>
            {GROUPS.map(([group, list]) => {
              const on = group === SECTION[tab].group;
              return (
                <button key={group} type="button" role="tab" aria-selected={on} onClick={() => { if (!on) setTab(lastIn.current[group] || list[0][0]); }} style={{
                  position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '12px 8px 10px', border: 'none', cursor: on ? 'default' : 'pointer',
                  fontFamily: 'inherit', background: on ? 'rgba(var(--ib-accent-rgb, 180,81,30), 0.07)' : 'transparent',
                }}>
                  <span className="journal-hand" style={{ fontSize: 23, lineHeight: 1.05, color: 'var(--ib-sienna, #A8481A)', opacity: on ? 1 : 0.7, transform: 'rotate(-1.5deg)' }}>{group}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ib-rust, #7A3A18)' }}>{list.length} section{list.length === 1 ? '' : 's'}</span>
                  {on && <span aria-hidden="true" style={{ position: 'absolute', left: '22%', right: '22%', bottom: -1, height: 3, borderRadius: 3, background: 'var(--ib-sienna, #A8481A)' }} />}
                </button>
              );
            })}
          </div>
          <div role="tablist" aria-label={`${SECTION[tab].group} sections`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 16px' }}>
            {GROUPS.find(([g]) => g === SECTION[tab].group)[1].map(([key, label, Icon]) => chip(key, label, Icon))}
          </div>
        </div>
      )}

      <LastChanged key={tab} section={tab} onOpenAudit={() => setTab('audit')} />

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
      {tab === 'backup' && <DatabaseTab onNavigate={onNavigate} onTab={setTab} />}
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
};

export default SystemMaintenance;
