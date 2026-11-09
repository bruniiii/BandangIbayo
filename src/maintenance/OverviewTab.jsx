import React, { useEffect, useState } from 'react';
import { Activity, Database, Users, Map as MapIcon, Archive, CalendarCheck, Wrench, Download, RefreshCw, CheckCircle2, AlertTriangle, Inbox } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { card, h3, hint, btn, when } from './shared';

// ─────────────────────────────────────────────
// System Overview: is the website working, is the database reachable, the
// main totals, and when maintenance and backups were last done.
// ─────────────────────────────────────────────

const Stat = ({ icon, label, value, sub }) => {
  const Icon = icon;
  return (
    <div style={{ background: '#F2E4D0', borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: '#1A0A00', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={18} /></span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18' }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 900, color: '#1A0A00' }}>{value ?? '—'}</p>
        {sub && <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: '#5C2A10' }}>{sub}</p>}
      </div>
    </div>
  );
};

const OverviewTab = ({ onTab }) => {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [db, setDb] = useState({ ok: null, ms: null, error: '' });

  const load = async () => {
    const t0 = performance.now();
    const [o, h] = await Promise.all([supabase.rpc('system_overview'), supabase.rpc('system_health')]);
    const ms = Math.round(performance.now() - t0);
    setDb(o.error ? { ok: false, ms, error: o.error.message } : { ok: true, ms, error: '' });
    setData(o.data || {});
    setHealth(h.data || {});
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the numbers when the tab opens
  useEffect(() => { load(); }, []);

  const m = data?.maintenance || {};
  const outdated = health ? ['past_tours_open', 'expired_holds', 'old_notifications', 'old_errors'].reduce((n, k) => n + (Number(health[k]) || 0), 0) : 0;
  const statusOk = db.ok && !m.on;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section style={{ ...card, background: '#1A0A00', border: 'none', color: '#FDF6EE', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {statusOk ? <CheckCircle2 size={30} color="#7FD1A4" /> : <AlertTriangle size={30} color="#E8A265" />}
        <div style={{ flex: '1 1 260px' }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E8A265' }}>System status</p>
          <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 900 }}>
            {db.ok === null ? 'Checking…' : !db.ok ? "Can't reach the database" : m.on ? 'Under Maintenance' : 'Operational'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600, color: '#F2E4D0' }}>
            {db.ok === null ? '' : !db.ok ? `${db.error} (run the latest database update: install_updates.sql)`
              : m.on ? `Joiners see the "We'll be back soon" page${m.started_at ? ` since ${when(m.started_at)}` : ''}. Turn it off in System Settings.`
                : 'Joiners can browse, book and pay as normal.'}
          </p>
        </div>
        <button type="button" onClick={load} style={{ ...btn(false), color: '#FDF6EE', borderColor: 'rgba(253,246,238,0.4)' }}><RefreshCw size={14} /> Check Again</button>
      </section>

      <section style={card}>
        <h3 style={h3}><Activity size={16} color="#A8481A" /> At a glance</h3>
        <p style={hint}>The main numbers in the database right now.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(210px, 100%), 1fr))', gap: 10 }}>
          <Stat icon={Database} label="Database" value={db.ok === null ? '…' : db.ok ? 'Connected' : 'Not reachable'} sub={db.ms != null ? `Answered in ${db.ms} ms` : ''} />
          <Stat icon={Users} label="Registered joiners" value={data?.joiners} sub={data?.archived_joiners ? `+ ${data.archived_joiners} archived` : ''} />
          <Stat icon={MapIcon} label="Active tours" value={data?.active_tours} sub="Open for booking" />
          <Stat icon={Archive} label="Archived tours" value={data?.archived_tours} sub="In Tour Archive" />
          <Stat icon={CalendarCheck} label="Bookings" value={data?.bookings} sub="All time" />
          <Stat icon={Inbox} label="Private tours & requests" value={data?.requests} sub="All time" />
        </div>
      </section>

      <section style={card}>
        <h3 style={h3}><Wrench size={16} color="#A8481A" /> Maintenance & backups</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 10, marginTop: 10 }}>
          <div style={{ background: '#F2E4D0', borderRadius: 14, padding: '12px 14px' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#1A0A00' }}>Last maintenance</p>
            <p style={{ margin: '2px 0 8px', fontSize: 12.5, fontWeight: 600, color: '#5C2A10' }}>
              {data?.last_maintenance ? when(data.last_maintenance) : 'No cleanup run from this page yet (the automatic ones still run).'}
              {outdated ? ` · ${outdated} outdated item${outdated === 1 ? '' : 's'} waiting` : ''}
            </p>
            <button type="button" onClick={() => onTab('data')} style={btn(!!outdated)}><Wrench size={14} /> Data Maintenance</button>
          </div>
          <div style={{ background: '#F2E4D0', borderRadius: 14, padding: '12px 14px' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#1A0A00' }}>Last backup</p>
            <p style={{ margin: '2px 0 8px', fontSize: 12.5, fontWeight: 600, color: '#5C2A10' }}>
              {data?.last_backup ? when(data.last_backup) : 'No backup downloaded yet.'}
            </p>
            <button type="button" onClick={() => onTab('database')} style={btn(!data?.last_backup)}><Download size={14} /> Database Management</button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default OverviewTab;
