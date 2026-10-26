import { useCallback, useEffect, useRef, useState } from 'react';
import { MessagesSquare, Send, ArrowLeft, Users, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import EmptyState from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';
import { formatYmdRange } from './dateRange';
import { fetchMyChats, chatChanged, CHAT_CHANGED } from './groupChat';

// ─────────────────────────────────────────────
// TOUR GROUP CHAT: one chat per tour date for everyone booked on it (paid,
// not cancelled) and the admins. Joiners see each other as first name + last
// initial; admins see full names. Messages arrive live.
// ─────────────────────────────────────────────

const MAX_LEN = 1000;

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
const dayOf = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
const shortTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? timeOf(iso)
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

const nameFor = (profile, isAdminViewer) => {
  if (!profile) return 'Former joiner';
  if (profile.role === 'admin') return 'Bandang IBAYO';
  const first = (profile.first_name || '').trim();
  const last = (profile.last_name || '').trim();
  if (isAdminViewer) return `${first} ${last}`.trim() || profile.username || 'Joiner';
  return `${first}${last ? ` ${last[0]}.` : ''}`.trim() || profile.username || 'Joiner';
};
const initialsOf = (profile) => {
  if (profile?.role === 'admin') return 'BI';
  return `${(profile?.first_name || '?')[0]}${(profile?.last_name || '')[0] || ''}`.toUpperCase();
};

const useIsNarrow = () => {
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 760);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return narrow;
};

const GroupChat = ({ isAdmin = false, initialTourId = null, onExplore }) => {
  const narrow = useIsNarrow();
  const [me, setMe] = useState(null);
  const [chats, setChats] = useState(null); // null = loading
  const [openId, setOpenId] = useState(initialTourId ? String(initialTourId) : null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data?.user?.id || null));
  }, []);

  // The chat list, refreshed when messages arrive or a chat is read.
  useEffect(() => {
    let active = true;
    const refresh = () => fetchMyChats().then((list) => { if (active) setChats(list); });
    refresh();
    const channel = supabase
      .channel('chat-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tour_chat_messages' }, refresh)
      .subscribe();
    window.addEventListener(CHAT_CHANGED, refresh);
    return () => { active = false; supabase.removeChannel(channel); window.removeEventListener(CHAT_CHANGED, refresh); };
  }, []);

  // On a wide screen, open the first chat when none is picked.
  const shownId = openId || (!narrow && chats?.length ? String(chats[0].tour_id) : null);
  const openChat = chats?.find((c) => String(c.tour_id) === shownId) || null;

  if (chats === null) return <SkeletonRows count={4} label="Loading group chats" />;

  if (chats.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="No group chats yet"
        message={isAdmin
          ? 'A group chat opens for each tour date once someone has a paid booking.'
          : 'When you book a tour, you join its group chat with the other joiners and the Bandang IBAYO team.'}
        action={!isAdmin && onExplore ? { label: 'Explore Tours', onClick: onExplore } : null}
      />
    );
  }

  const showList = !narrow || !openChat;
  const showChat = !!openChat && (!narrow || openId);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(240px, 320px) minmax(0, 1fr)',
      background: '#FDF6EE', borderRadius: 22, border: '1px solid rgba(180,81,30,0.14)',
      boxShadow: '0 4px 20px rgba(26,10,0,0.06)', overflow: 'hidden',
      height: narrow ? 'calc(100dvh - 190px)' : 'calc(100dvh - 210px)', minHeight: 460,
    }}>
      {showList && (
        <ChatList chats={chats} activeId={shownId} onPick={(id) => setOpenId(String(id))} narrow={narrow} />
      )}
      {showChat && (
        <ChatWindow
          key={openChat.tour_id}
          chat={openChat}
          me={me}
          isAdmin={isAdmin}
          narrow={narrow}
          onBack={() => setOpenId(null)}
        />
      )}
    </div>
  );
};

const ChatList = ({ chats, activeId, onPick, narrow }) => (
  <div style={{ borderRight: narrow ? 'none' : '1px solid rgba(180,81,30,0.12)', overflowY: 'auto', minHeight: 0 }}>
    <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#A8481A', margin: 0, padding: '16px 18px 10px' }}>
      Tour group chats
    </p>
    {chats.map((c) => {
      const active = String(c.tour_id) === activeId;
      return (
        <button
          key={c.tour_id}
          type="button"
          onClick={() => onPick(c.tour_id)}
          aria-current={active ? 'true' : undefined}
          style={{
            width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', gap: 12, alignItems: 'center', padding: '12px 18px',
            background: active ? 'rgba(180,81,30,0.1)' : 'transparent',
            borderLeft: active ? '3px solid #B4511E' : '3px solid transparent',
          }}
        >
          <span style={{ width: 42, height: 42, borderRadius: 14, background: '#1A0A00', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={18} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: c.unread ? 900 : 800, color: '#1A0A00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7A3A18', flexShrink: 0 }}>{shortTime(c.last_message_at)}</span>
            </span>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#A8481A', margin: '1px 0' }}>
              {formatYmdRange(c.start_date, c.end_date)} · {c.members} joiner{c.members === 1 ? '' : 's'}
            </span>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: c.unread ? 800 : 500, color: c.unread ? '#1A0A00' : '#7A3A18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.last_message || 'No messages yet. Say hi!'}
              </span>
              {c.unread > 0 && (
                <span style={{ background: '#B4511E', color: '#FDF6EE', borderRadius: 999, minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              )}
            </span>
          </span>
        </button>
      );
    })}
  </div>
);

const ChatWindow = ({ chat, me, isAdmin, narrow, onBack }) => {
  const [messages, setMessages] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const profilesRef = useRef({});
  const tourId = chat.tour_id;
  const canSend = isAdmin || chat.is_open;

  const loadProfiles = useCallback(async (ids) => {
    const missing = [...new Set(ids.filter((id) => id && !profilesRef.current[id]))];
    if (!missing.length) return;
    const { data } = await supabase.from('public_profiles').select('id, first_name, last_name, username, avatar_url, role').in('id', missing);
    (data || []).forEach((p) => { profilesRef.current[p.id] = p; });
    setProfiles({ ...profilesRef.current });
  }, []);

  const markRead = useCallback(async () => {
    await supabase.from('tour_chat_reads').upsert({ tour_id: tourId, last_read_at: new Date().toISOString() }, { onConflict: 'tour_id,user_id' });
    chatChanged();
  }, [tourId]);

  // Last 300 messages, then live updates.
  useEffect(() => {
    let active = true;
    supabase.from('tour_chat_messages').select('*').eq('tour_id', tourId)
      .order('created_at', { ascending: false }).limit(300)
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) { toast.error("Couldn't load the chat", error.message); setMessages([]); return; }
        const list = (data || []).reverse();
        await loadProfiles(list.map((m) => m.user_id));
        if (active) setMessages(list);
        markRead();
      });
    const channel = supabase
      .channel(`chat-${tourId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tour_chat_messages', filter: `tour_id=eq.${tourId}` }, async ({ new: m }) => {
        await loadProfiles([m.user_id]);
        setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
        if (!document.hidden) markRead();
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [tourId, loadProfiles, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const { data, error } = await supabase.from('tour_chat_messages').insert([{ tour_id: tourId, body }]).select().single();
    setSending(false);
    if (error) { toast.error("Couldn't send your message", error.message); return; }
    setText('');
    setMessages((prev) => (prev && !prev.some((x) => x.id === data.id) ? [...prev, data] : prev));
    await loadProfiles([data.user_id]);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !narrow) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid rgba(180,81,30,0.12)', background: '#F2E4D0' }}>
        {narrow && (
          <button type="button" onClick={onBack} aria-label="Back to chats" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', padding: 4, display: 'flex' }}>
            <ArrowLeft size={18} />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 900, color: '#1A0A00', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title}</p>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', margin: 0 }}>
            {formatYmdRange(chat.start_date, chat.end_date)} · {chat.members} joiner{chat.members === 1 ? '' : 's'} + Bandang IBAYO
          </p>
        </div>
      </div>

      {/* messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
        <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#7A3A18', textAlign: 'center', margin: '0 0 8px' }}>
          <ShieldCheck size={13} /> Only people booked on this tour and the Bandang IBAYO team can see this chat.
        </p>
        {messages === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Loader2 size={22} style={{ color: '#B4511E', animation: 'spin 1s linear infinite' }} /></div>
        ) : messages.length === 0 ? (
          <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', textAlign: 'center', margin: '30px 0' }}>No messages yet. Say hi to your travel buddies! 👋</p>
        ) : messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayOf(prev.created_at) !== dayOf(m.created_at);
          const mine = m.user_id && m.user_id === me;
          const author = profiles[m.user_id];
          const fromAdmin = author?.role === 'admin';
          const sameAuthor = prev && !newDay && prev.user_id === m.user_id;
          return (
            <div key={m.id}>
              {newDay && (
                <p style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8481A', margin: '12px 0 6px' }}>{dayOf(m.created_at)}</p>
              )}
              <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 8, marginTop: sameAuthor ? 0 : 6 }}>
                {!mine && (
                  <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, visibility: sameAuthor ? 'hidden' : 'visible', background: fromAdmin ? '#B4511E' : '#1A0A00', color: fromAdmin ? '#FDF6EE' : '#E8A265', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {author?.avatar_url && !fromAdmin ? <img src={author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(author)}
                  </span>
                )}
                <div style={{ maxWidth: '75%', minWidth: 0 }}>
                  {!mine && !sameAuthor && (
                    <p style={{ fontSize: 11, fontWeight: 800, color: fromAdmin ? '#B4511E' : '#7A3A18', margin: '0 0 2px 4px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {nameFor(author, isAdmin)}
                      {fromAdmin && <span style={{ background: '#B4511E', color: '#FDF6EE', borderRadius: 999, padding: '1px 7px', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Admin</span>}
                    </p>
                  )}
                  <div title={timeOf(m.created_at)} style={{
                    background: mine ? '#B4511E' : fromAdmin ? 'rgba(180,81,30,0.12)' : '#F2E4D0',
                    color: mine ? '#FDF6EE' : '#1A0A00',
                    border: fromAdmin && !mine ? '1px solid rgba(180,81,30,0.3)' : 'none',
                    borderRadius: 16, padding: '8px 12px', fontSize: 13.5, fontWeight: 500, lineHeight: 1.5,
                    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                  }}>
                    {m.body}
                    <span style={{ display: 'block', textAlign: 'right', fontSize: 10, fontWeight: 600, marginTop: 2, opacity: 0.75 }}>{timeOf(m.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      {canSend ? (
        <form onSubmit={send} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '10px 12px', borderTop: '1px solid rgba(180,81,30,0.12)', background: '#FDF6EE' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Write a message…"
            aria-label="Message"
            style={{
              flex: 1, resize: 'none', maxHeight: 120, minHeight: 42, boxSizing: 'border-box',
              background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 14,
              padding: '10px 14px', fontSize: 14, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button type="submit" disabled={!text.trim() || sending} aria-label="Send" style={{
            width: 42, height: 42, borderRadius: 14, border: 'none', flexShrink: 0,
            background: !text.trim() || sending ? 'rgba(180,81,30,0.4)' : '#B4511E', color: '#FDF6EE',
            cursor: !text.trim() || sending ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {sending ? <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={17} />}
          </button>
        </form>
      ) : (
        <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#7A3A18', padding: '12px 16px', margin: 0, borderTop: '1px solid rgba(180,81,30,0.12)' }}>
          <Lock size={13} /> This trip is over, so the chat is read-only now.
        </p>
      )}
    </div>
  );
};

export default GroupChat;
