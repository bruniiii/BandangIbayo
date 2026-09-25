import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  Bell, CheckCheck, Compass, Loader2, ArrowRight, Clock, ChevronDown,
  CreditCard, Wallet, Globe, Package, Star, Users, Map as MapIconLucide,
  MoreHorizontal, Trash2, X, XCircle,
} from 'lucide-react';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// #3F5D62  slate teal (secondary contrast accent)
// ---------------------------------------------------------

const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fullDateTime = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

// ── notification "type" → icon / accent color / friendly label ──
// Covers every type ever inserted from either the admin or joiner side
// (see notifications.js, AdminExclusiveTours.jsx, BookingManagement.jsx, etc.)
const TYPE_META = {
  booking:            { Icon: CreditCard,     color: '#3F5D62', bg: 'rgba(63,93,98,0.14)',   label: 'Booking' },
  payment:            { Icon: Wallet,         color: '#C45C26', bg: 'rgba(196,92,38,0.14)',  label: 'Payment' },
  cancellation:       { Icon: XCircle,        color: '#8C2F1C', bg: 'rgba(140,47,28,0.12)',  label: 'Cancellation' },
  exclusive_request:  { Icon: Globe,          color: '#7A3A18', bg: 'rgba(122,58,24,0.12)',  label: 'Exclusive / Request' },
  exclusive_package:  { Icon: Package,        color: '#C45C26', bg: 'rgba(196,92,38,0.14)',  label: 'Tour Package' },
  review:             { Icon: Star,           color: '#9A5B1E', bg: 'rgba(232,162,101,0.25)',label: 'Review' },
  account:            { Icon: Users,          color: '#3F5D62', bg: 'rgba(63,93,98,0.14)',   label: 'Account' },
  tour:               { Icon: MapIconLucide,  color: '#1A0A00', bg: 'rgba(26,10,0,0.08)',    label: 'Tour' },
  default:            { Icon: Bell,           color: '#7A3A18', bg: 'rgba(122,58,24,0.1)',   label: 'Update' },
};

const metaFor = (type) => TYPE_META[type] || TYPE_META.default;

const FILTERABLE_TYPES = Object.keys(TYPE_META).filter((t) => t !== 'default');

/* ─────────────────────────────────────────────
   NOTIFICATIONS  (full-page module — shared by AdminDashboard & JoinerDashboard)
   isAdmin only changes copy, not data: every row is scoped server-side
   by `user_id = auth.uid()`, so admins and joiners each just see their own
   feed of everything that's happened to their account, Facebook-style.
───────────────────────────────────────────── */
const Notifications = ({ isAdmin = false, onNavigate }) => {
  const [userId, setUserId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all'); // 'all' | 'unread'
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [clearing, setClearing] = useState(false);
  const menuRef = useRef(null);

  const fetchNotifications = useCallback(async (uid) => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(150);
    if (!error) setNotifications(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      fetchNotifications(user.id);
    })();
  }, [fetchNotifications]);

  // Live updates — new activity from either side of the app (a joiner booking,
  // an admin decision, a new review, etc.) appears here immediately.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-page-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => fetchNotifications(userId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpenId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
  };

  const deleteNotification = async (id) => {
    setMenuOpenId(null);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  };

  const clearAll = async () => {
    if (!userId || notifications.length === 0) return;
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return;
    setClearing(true);
    const ids = notifications.map((n) => n.id);
    setNotifications([]);
    await supabase.from('notifications').delete().in('id', ids);
    setClearing(false);
  };

  const handleOpen = (n) => {
    if (!n.is_read) markAsRead(n.id);
    onNavigate?.(n);
  };

  const filtered = notifications.filter((n) => {
    if (tab === 'unread' && n.is_read) return false;
    if (typeFilter !== 'All Types' && (n.type || 'default') !== typeFilter) return false;
    return true;
  });

  const unread = filtered.filter((n) => !n.is_read);
  const read = filtered.filter((n) => n.is_read);

  const todayStr = new Date().toDateString();
  const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
  const groups = { today: [], yesterday: [], earlier: [] };
  read.forEach((n) => {
    const d = new Date(n.created_at).toDateString();
    if (d === todayStr) groups.today.push(n);
    else if (d === yesterdayStr) groups.yesterday.push(n);
    else groups.earlier.push(n);
  });

  const selectStyle = {
    appearance: 'none', background: '#F2E4D0',
    border: '1px solid rgba(196,92,38,0.18)', borderRadius: 12,
    padding: '9px 30px 9px 14px', fontSize: 11.5, fontWeight: 700,
    color: '#1A0A00', fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720, margin: '0 auto' }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8A265',
            position: 'relative',
          }}>
            <Bell size={19} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999,
                background: '#C45C26', color: '#FDF6EE', fontSize: 9, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(196,92,38,0.4)',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 style={{ fontWeight: 900, fontSize: 18, letterSpacing: '-0.02em', color: '#1A0A00', margin: 0 }}>
              Notifications
            </h2>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.78, margin: '2px 0 0' }}>
              {isAdmin ? 'Every activity across bookings, requests, reviews & more' : 'Updates on your bookings, requests & account'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)', borderRadius: 999,
                padding: '9px 16px', cursor: 'pointer', color: '#7A3A18', fontFamily: 'inherit',
                fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
              }}
            >
              <CheckCheck size={13} /> Mark all read
            </button>
          )}
          <button
            onClick={clearAll}
            disabled={clearing || notifications.length === 0}
            title="Clear all notifications"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(140,47,28,0.08)', border: 'none', borderRadius: 999,
              padding: '9px 12px', cursor: notifications.length ? 'pointer' : 'default',
              color: '#8C2F1C', fontFamily: 'inherit', fontWeight: 900, fontSize: 10,
              letterSpacing: '0.08em', textTransform: 'uppercase', opacity: notifications.length ? 1 : 0.4,
            }}
          >
            {clearing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>

      {/* filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', background: '#F2E4D0', padding: 5, borderRadius: 14, border: '1px solid rgba(196,92,38,0.14)' }}>
          {[['all', 'All'], ['unread', 'Unread']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 900, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                background: tab === key ? '#1A0A00' : 'transparent',
                color: tab === key ? '#FDF6EE' : '#7A3A18',
                transition: 'all 0.15s',
              }}
            >
              {label}{key === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value="All Types">All Activity</option>
            {FILTERABLE_TYPES.map((t) => (
              <option key={t} value={t}>{metaFor(t).label}</option>
            ))}
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.4)' }} />
        </div>
      </div>

      {/* list */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', color: 'rgba(122,58,24,0.4)' }}>
          <Loader2 size={20} style={{ marginRight: 10, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading notifications…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '4rem 2rem', border: '2px dashed rgba(196,92,38,0.18)', borderRadius: 20,
          color: 'rgba(122,58,24,0.35)', textAlign: 'center',
        }}>
          <Compass size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
            {tab === 'unread' ? "You're all caught up" : 'Nothing here yet'}
          </p>
          <p style={{ fontSize: 12, fontWeight: 600, margin: '6px 0 0', opacity: 0.85 }}>
            {tab === 'unread' ? 'No unread notifications right now.' : "Activity on your account will show up here."}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {unread.length > 0 && (
            <NotificationSection
              title="New"
              items={unread}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              menuRef={menuRef}
              onOpen={handleOpen}
              onDelete={deleteNotification}
            />
          )}
          {groups.today.length > 0 && (
            <NotificationSection
              title="Today"
              items={groups.today}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              menuRef={menuRef}
              onOpen={handleOpen}
              onDelete={deleteNotification}
            />
          )}
          {groups.yesterday.length > 0 && (
            <NotificationSection
              title="Yesterday"
              items={groups.yesterday}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              menuRef={menuRef}
              onOpen={handleOpen}
              onDelete={deleteNotification}
            />
          )}
          {groups.earlier.length > 0 && (
            <NotificationSection
              title="Earlier"
              items={groups.earlier}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              menuRef={menuRef}
              onOpen={handleOpen}
              onDelete={deleteNotification}
            />
          )}
        </div>
      )}

      {/* full-message viewer for long notifications */}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

/* ── SECTION ── */
const NotificationSection = ({ title, items, menuOpenId, setMenuOpenId, menuRef, onOpen, onDelete }) => (
  <div>
    <h3 style={{
      fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
      color: '#7A3A18', opacity: 0.6, margin: '0 0 10px',
    }}>
      {title}
    </h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((n) => (
        <NotificationRow
          key={n.id}
          notification={n}
          menuOpen={menuOpenId === n.id}
          onToggleMenu={() => setMenuOpenId((prev) => (prev === n.id ? null : n.id))}
          menuRef={menuOpenId === n.id ? menuRef : null}
          onOpen={() => onOpen(n)}
          onDelete={() => onDelete(n.id)}
        />
      ))}
    </div>
  </div>
);

/* ── ROW ── */
const NotificationRow = ({ notification, menuOpen, onToggleMenu, menuRef, onOpen, onDelete }) => {
  const [hovered, setHovered] = useState(false);
  const { Icon, color, bg } = metaFor(notification.type);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '14px 16px', borderRadius: 16, cursor: 'pointer',
        background: notification.is_read ? (hovered ? '#F8F3EA' : '#FDF6EE') : (hovered ? 'rgba(196,92,38,0.1)' : 'rgba(196,92,38,0.07)'),
        border: '1px solid rgba(196,92,38,0.1)',
        transition: 'background 0.15s',
      }}
      onClick={onOpen}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{notification.title}</p>
        <p style={{
          fontSize: 12, fontWeight: 500, color: '#7A3A18', opacity: 0.85, margin: '4px 0 0', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {notification.message}
        </p>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.55, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={10} /> {timeAgo(notification.created_at)}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {!notification.is_read && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#C45C26' }} />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(122,58,24,0.5)', padding: 4 }}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 44, right: 12, zIndex: 20,
            background: '#FDF6EE', border: '1px solid rgba(196,92,38,0.18)', borderRadius: 12,
            boxShadow: '0 12px 32px rgba(26,10,0,0.2)', overflow: 'hidden', minWidth: 150,
          }}
        >
          <button
            onClick={onDelete}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
              color: '#8C2F1C', fontFamily: 'inherit', fontWeight: 800, fontSize: 11, textAlign: 'left',
            }}
          >
            <Trash2 size={13} /> Remove
          </button>
        </div>
      )}
    </div>
  );
};

export default Notifications;