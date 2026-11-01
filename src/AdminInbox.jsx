import React, { useEffect, useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { currentUser } from './supabaseClient';
import { flashFocus } from './focusTarget';
import { fetchAdminMessages, markAdminMessagesRead, useTourNames } from './adminMessages';
import { MessageItem } from './ui/SentMessages';
import EmptyState from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

// Joiner: messages from Bandang IBAYO (emails from Joiner Accounts and tour
// updates from Message Joiners). Opening the page marks them as read.
// focus (from a notification): { title, at } — opens the message sent with
// that subject, closest to that time.
const AdminInbox = ({ onRead, focus = null }) => {
  const [rows, setRows] = useState(null);
  const focusId = useMemo(() => {
    if (!focus || !rows?.length) return null;
    const same = rows.filter((m) => (m.subject || '').trim() === (focus.title || '').trim());
    if (!same.length) return null;
    const at = new Date(focus.at || 0).getTime();
    return same.reduce((best, m) => (Math.abs(new Date(m.created_at).getTime() - at) < Math.abs(new Date(best.created_at).getTime() - at) ? m : best)).id;
  }, [focus, rows]);
  useEffect(() => { if (focusId != null) flashFocus(`message-${focusId}`); }, [focusId]);
  const tourNames = useTourNames(rows);

  useEffect(() => {
    let alive = true;
    (async () => {
      const user = await currentUser();
      if (!user) { if (alive) setRows([]); return; }
      const { data } = await fetchAdminMessages({ userId: user.id, limit: 100 });
      if (!alive) return;
      setRows(data);
      if (data.some((m) => !m.read_at)) { await markAdminMessagesRead(); onRead?.(); }
    })();
    return () => { alive = false; };
  }, [onRead]);

  if (rows === null) return <SkeletonRows count={3} label="Loading your messages" />;
  if (!rows.length) {
    return <EmptyState icon={Inbox} title="No messages yet" message="Messages and tour updates from Bandang IBAYO will show up here." />;
  }
  return (
    <div style={{ background: '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(180,81,30,0.12)' }}>
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((m) => <MessageItem key={m.id} m={m} defaultOpen={m.id === focusId} unread={!m.read_at} tourName={m.source === 'tour' ? tourNames[m.tour_id] : ''} />)}
      </ul>
    </div>
  );
};

export default AdminInbox;

