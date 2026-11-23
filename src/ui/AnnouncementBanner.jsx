import { useState } from 'react';
import { Megaphone, Wrench, X } from 'lucide-react';
import { SITE } from '../siteContent';
import { useMaintenance } from '../maintenanceMode';

const closedKey = (k) => { try { return !!k && localStorage.getItem(k) === '1'; } catch { return false; } };
const fmt = (d) => new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const Bar = ({ icon, warn, text, onClose, style }) => {
  const Icon = icon;
  return (
  <div role="status" style={{
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 14,
    background: warn ? 'var(--ib-surface-2, #FBEDE6)' : 'var(--ib-surface-2, #FFF4E3)', border: `1px solid ${warn ? 'rgba(var(--ib-red-rgb, 140,47,28), 0.4)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.3)'}`,
    color: warn ? 'var(--ib-red, #8C2F1C)' : 'var(--ib-brown, #5C2A10)', fontSize: 13, fontWeight: 800, lineHeight: 1.5, ...style,
  }}>
    <Icon size={16} style={{ flexShrink: 0, marginTop: 2 }} />
    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-line' }}>{text}</span>
    <button type="button" aria-label="Close notice" onClick={onClose}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2, display: 'flex' }}><X size={15} /></button>
  </div>
  );
};

// The announcement from System Maintenance → Home Page & Banner (homepage and the
// joiner dashboard), and a notice during the 7 days before planned maintenance.
// Closing one hides it in this browser.
const AnnouncementBanner = ({ style }) => {
  const a = SITE.announcement;
  const m = useMaintenance();
  const [now] = useState(() => Date.now());
  const aKey = a ? `bi_announcement_closed:${a.posted_at}` : '';
  const soon = !m.on && m.starts_at && new Date(m.starts_at).getTime() - now < 7 * 86400000 && new Date(m.starts_at).getTime() > now;
  const mKey = soon ? `bi_maintenance_notice_closed:${m.starts_at}` : '';
  const [closed, setClosed] = useState({});
  const close = (k) => { try { localStorage.setItem(k, '1'); } catch { /* fine */ } setClosed((c) => ({ ...c, [k]: true })); };

  const showA = a?.message && !closed[aKey] && !closedKey(aKey);
  const showM = soon && !closed[mKey] && !closedKey(mKey);
  if (!showA && !showM) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {showM && (
        <Bar icon={Wrench} warn onClose={() => close(mKey)}
          text={`Planned maintenance: ${fmt(m.starts_at)} to ${fmt(m.ends_at)}. The website will be closed for booking and payments during this time, so please book or pay before then.`} />
      )}
      {showA && <Bar icon={Megaphone} warn={a.tone === 'warning'} text={a.message} onClose={() => close(aKey)} />}
    </div>
  );
};

export default AnnouncementBanner;
