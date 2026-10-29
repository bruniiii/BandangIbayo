import React, { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { supabase } from './supabaseClient';
import { fetchAdminMessages, markAdminMessagesRead } from './adminMessages';
import { MessageItem } from './ui/SentMessages';
import EmptyState from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';

// Joiner: messages from Bandang IBAYO (emails from Joiner Accounts and tour
// updates from Message Joiners). Opening the page marks them as read.
const AdminInbox = ({ onRead }) => {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
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
        {rows.map((m) => <MessageItem key={m.id} m={m} unread={!m.read_at} />)}
      </ul>
    </div>
  );
};

export default AdminInbox;

