import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Megaphone, ChevronDown } from 'lucide-react';
import { fetchAdminMessages, messageSourceLabel, useTourNames } from '../adminMessages';
import { SkeletonLines } from './Skeleton';

// Admin: messages already sent to one joiner (userId), or to everyone
// (names maps joiner ids to names). Tap a message to read it in full.

const formatSent = (iso) => new Date(iso).toLocaleString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export const MessageItem = ({ m, to = '', unread = false, admin = false, tourName = '' }) => {
  const [open, setOpen] = useState(false);
  const Icon = m.source === 'tour' ? Megaphone : Mail;
  return (
    <li style={{ listStyle: 'none', background: unread ? 'rgba(180,81,30,0.1)' : '#F2E4D0', border: `1px solid ${unread ? 'rgba(180,81,30,0.4)' : 'rgba(180,81,30,0.14)'}`, borderRadius: 14 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{
        width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <Icon size={15} style={{ color: '#A8481A', flexShrink: 0, marginTop: 2 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: '#1A0A00', overflowWrap: 'anywhere' }}>{m.subject}</span>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7A3A18', marginTop: 2 }}>
            {[to && `To ${to}`, tourName ? `Tour update · ${tourName}` : messageSourceLabel(m), formatSent(m.created_at), admin && (m.emailed ? 'Emailed' : 'In-app only')].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ChevronDown size={15} style={{ color: '#A8481A', flexShrink: 0, marginTop: 2, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <p style={{ margin: 0, padding: '0 12px 12px 37px', fontSize: 12.5, fontWeight: 500, color: '#1A0A00', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {m.message}
        </p>
      )}
    </li>
  );
};

const SentMessages = ({ userId = null, names = null, limit = 50 }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchAdminMessages({ userId, limit }).then(({ data, error: err }) => {
      if (!alive) return;
      setRows(data);
      setError(err ? err.message : '');
    });
    return () => { alive = false; };
  }, [userId, limit]);

  const tourNames = useTourNames(rows);
  // Filter: everything, personal messages only, or one tour's updates.
  const [filter, setFilter] = useState('all');
  const tourIds = useMemo(() => [...new Set((rows || []).filter((m) => m.source === 'tour' && m.tour_id).map((m) => m.tour_id))], [rows]);
  const shown = (rows || []).filter((m) => (filter === 'all' ? true
    : filter === 'personal' ? m.source !== 'tour'
      : filter === 'tour' ? m.source === 'tour'
        : m.source === 'tour' && `tour:${m.tour_id}` === filter));

  if (rows === null) return <SkeletonLines lines={2} label="Loading sent messages" />;
  if (error) return <p style={{ fontSize: 12, fontWeight: 700, color: '#8C2F1C', margin: 0 }}>Couldn't load sent messages: {error}</p>;
  if (!rows.length) return <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: 0 }}>No messages sent yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18' }}>
        Show
        <select aria-label="Filter sent messages" value={filter} onChange={(e) => setFilter(e.target.value)} style={{
          flex: 1, minWidth: 0, background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 10, padding: '7px 10px',
          fontSize: 12.5, fontWeight: 700, color: '#1A0A00', fontFamily: 'inherit', letterSpacing: 0, textTransform: 'none', cursor: 'pointer',
        }}>
          <option value="all">All messages ({rows.length})</option>
          <option value="personal">Personal messages ({rows.filter((m) => m.source !== 'tour').length})</option>
          <option value="tour">All tour updates ({rows.filter((m) => m.source === 'tour').length})</option>
          {tourIds.map((id) => (
            <option key={id} value={`tour:${id}`}>Tour: {tourNames[id] || 'Tour'} ({rows.filter((m) => m.source === 'tour' && m.tour_id === id).length})</option>
          ))}
        </select>
      </label>
      {shown.length === 0 ? (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: 0 }}>No messages of this kind.</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((m) => <MessageItem key={m.id} m={m} admin tourName={m.source === 'tour' ? tourNames[m.tour_id] : ''} to={names ? names[m.user_id] || 'Joiner' : ''} />)}
        </ul>
      )}
    </div>
  );
};

export default SentMessages;
