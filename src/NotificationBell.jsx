import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Bell, CheckCheck, Compass, Loader2 } from 'lucide-react';

const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) !== 1 ? 's' : ''} ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) !== 1 ? 's' : ''} ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/* ─────────────────────────────────────────────
   NOTIFICATION BELL
   Drop this into any header (JoinerDashboard) to
   give joiners a live inbox for admin decisions —
   e.g. their Exclusive Tour / Request-a-Tour status.
───────────────────────────────────────────── */
const NotificationBell = ({ onNotificationClick }) => {
  const [userId, setUserId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const fetchNotifications = useCallback(async (uid) => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(30);
    if (!error) setNotifications(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        fetchNotifications(user.id);
      } else {
        setLoading(false);
      }
    })();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-realtime-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => fetchNotifications(userId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsRead = async (id) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (!unreadIds.length) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Notifications"
        style={{
          position: 'relative',
          width: 40, height: 40, borderRadius: 12,
          background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#1A0A00',
        }}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999,
            background: '#C45C26', color: '#FDF6EE',
            fontSize: 9, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(196,92,38,0.4)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 500,
          width: 340, maxHeight: 420,
          background: '#FDF6EE', borderRadius: 20,
          border: '1px solid rgba(196,92,38,0.14)',
          boxShadow: '0 20px 50px rgba(26,10,0,0.25)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderBottom: '1px solid rgba(196,92,38,0.12)', flexShrink: 0,
          }}>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1A0A00', margin: 0 }}>
              Notifications
            </p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#C45C26', fontSize: 9.5, fontWeight: 800,
                  letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit',
                }}
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 0', color: 'rgba(122,58,24,0.4)' }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem 1.5rem', color: 'rgba(122,58,24,0.4)', textAlign: 'center' }}>
                <Compass size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ fontSize: 11, fontWeight: 700, margin: 0 }}>You're all caught up.</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) markAsRead(n.id);
                    setOpen(false);
                    onNotificationClick?.(n);
                  }}
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid rgba(196,92,38,0.08)',
                    background: n.is_read ? 'transparent' : 'rgba(196,92,38,0.06)',
                    cursor: 'pointer',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}
                >
                  {!n.is_read && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C45C26', marginTop: 5, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{n.title}</p>
                    <p style={{ fontSize: 11.5, fontWeight: 500, color: '#7A3A18', opacity: 0.85, margin: '4px 0 0', lineHeight: 1.5 }}>
                      {n.message}
                    </p>
                    <p style={{ fontSize: 9.5, fontWeight: 700, color: '#7A3A18', opacity: 0.5, margin: '6px 0 0' }}>
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;