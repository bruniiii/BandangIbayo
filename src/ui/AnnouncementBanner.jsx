import { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { SITE } from '../siteContent';

// The announcement from System Maintenance → Site Content (homepage and the
// joiner dashboard). Closing it hides that announcement in this browser.
const AnnouncementBanner = ({ style }) => {
  const a = SITE.announcement;
  const key = a ? `bi_announcement_closed:${a.posted_at}` : '';
  const [closed, setClosed] = useState(() => { try { return !!key && localStorage.getItem(key) === '1'; } catch { return false; } });
  if (!a?.message || closed) return null;
  const warn = a.tone === 'warning';
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 14,
      background: warn ? 'var(--ib-surface-2, #FBEDE6)' : '#FFF4E3', border: `1px solid ${warn ? 'rgba(var(--ib-red-rgb, 140,47,28), 0.4)' : 'rgba(var(--ib-accent-rgb, 180,81,30), 0.3)'}`,
      color: warn ? 'var(--ib-red, #8C2F1C)' : 'var(--ib-brown, #5C2A10)', fontSize: 13, fontWeight: 800, lineHeight: 1.5, ...style,
    }}>
      <Megaphone size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-line' }}>{a.message}</span>
      <button type="button" aria-label="Close announcement" onClick={() => { try { localStorage.setItem(key, '1'); } catch { /* fine */ } setClosed(true); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2, display: 'flex' }}><X size={15} /></button>
    </div>
  );
};

export default AnnouncementBanner;
