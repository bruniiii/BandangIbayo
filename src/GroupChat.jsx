import { useCallback, useEffect, useRef, useState } from 'react';
import BrandAvatar from './ui/BrandAvatar';
import { MessagesSquare, Send, ArrowLeft, Users, Loader2, Lock, ShieldCheck, SmilePlus, Reply, X, Archive } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import EmptyState from './ui/EmptyState';
import { SkeletonRows } from './ui/Skeleton';
import { formatYmdRange } from './dateRange';
import { fetchMyChats, chatChanged, CHAT_CHANGED } from './chatStore';

// ─────────────────────────────────────────────
// TOUR GROUP CHAT: one chat per tour date for everyone booked on it (paid,
// not cancelled) and the admins. Joiners see each other as first name + last
// initial; admins see full names. Messages arrive live.
// ─────────────────────────────────────────────

const MAX_LEN = 1000;
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

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

  // Phones: the list in the page, and an open chat fills the whole screen (like Messenger).
  if (narrow) {
    return (
      <>
        <div style={{ background: '#FDF6EE', borderRadius: 20, border: '1px solid rgba(180,81,30,0.14)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)', overflow: 'hidden' }}>
          <ChatList chats={chats} activeId={null} onPick={(id) => setOpenId(String(id))} narrow />
        </div>
        {openChat && (
          <FullScreen>
            <ChatWindow key={openChat.tour_id} chat={openChat} me={me} isAdmin={isAdmin} narrow onBack={() => setOpenId(null)} />
          </FullScreen>
        )}
      </>
    );
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)',
      background: '#FDF6EE', borderRadius: 22, border: '1px solid rgba(180,81,30,0.14)',
      boxShadow: '0 4px 20px rgba(26,10,0,0.06)', overflow: 'hidden',
      height: 'calc(100dvh - 190px)', minHeight: 420,
    }}>
      <ChatList chats={chats} activeId={shownId} onPick={(id) => setOpenId(String(id))} narrow={false} />
      {openChat && <ChatWindow key={openChat.tour_id} chat={openChat} me={me} isAdmin={isAdmin} narrow={false} onBack={() => setOpenId(null)} />}
    </div>
  );
};

// Covers the whole screen (above the menu tab), and stops the page behind from scrolling.
const FullScreen = ({ children }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 400, background: '#FDF6EE',
      height: '100dvh', display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', boxSizing: 'border-box',
    }}>
      {children}
    </div>
  );
};

const ChatList = ({ chats, activeId, onPick, narrow }) => (
  <div style={{ borderRight: narrow ? 'none' : '1px solid rgba(180,81,30,0.12)', overflowY: 'auto', minHeight: 0 }}>
    <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#A8481A', margin: 0, padding: '16px 18px 10px' }}>
      Tour group chats
    </p>
    {chats.map((c, i) => {
      const active = String(c.tour_id) === activeId;
      const firstArchived = !c.is_open && (i === 0 || chats[i - 1].is_open);
      return (
        <div key={c.tour_id}>
        {firstArchived && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7A3A18', margin: 0, padding: '16px 18px 6px', borderTop: i ? '1px solid rgba(180,81,30,0.12)' : 'none' }}>
            <Archive size={13} /> Archived (tour ended)
          </p>
        )}
        <button
          type="button"
          onClick={() => onPick(c.tour_id)}
          aria-current={active ? 'true' : undefined}
          style={{
            width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', gap: 12, alignItems: 'center', padding: '12px 18px',
            background: active ? 'rgba(180,81,30,0.1)' : 'transparent',
            borderLeft: active ? '3px solid #B4511E' : '3px solid transparent',
            opacity: c.is_open ? 1 : 0.75,
          }}
        >
          <span style={{ width: 42, height: 42, borderRadius: 14, background: c.is_open ? '#1A0A00' : '#7A3A18', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
        </div>
      );
    })}
  </div>
);

const ChatWindow = ({ chat, me, isAdmin, narrow, onBack }) => {
  const [messages, setMessages] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reactions, setReactions] = useState({}); // message id → [{ user_id, emoji }]
  const [pickerFor, setPickerFor] = useState(null); // message id whose reaction picker is open
  const [reactorsFor, setReactorsFor] = useState(null); // message id whose "who reacted" list is open
  const [replyTo, setReplyTo] = useState(null); // the message being answered
  const [flashId, setFlashId] = useState(null); // briefly highlighted after tapping a quoted message
  const inputRef = useRef(null);
  const bottomRef = useRef(null);
  const profilesRef = useRef({});
  const tourId = chat.tour_id;
  // Archived once the tour ends: nobody can send or react, admins included.
  const canSend = chat.is_open;

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

  // Reactions on this chat's messages, then live updates.
  useEffect(() => {
    let active = true;
    const put = (row, remove = false) => setReactions((prev) => {
      const list = (prev[row.message_id] || []).filter((r) => r.user_id !== row.user_id);
      return { ...prev, [row.message_id]: remove ? list : [...list, { user_id: row.user_id, emoji: row.emoji }] };
    });
    supabase.from('tour_chat_reactions').select('message_id, user_id, emoji').eq('tour_id', tourId)
      .then(({ data }) => {
        if (!active) return;
        const map = {};
        (data || []).forEach((r) => { (map[r.message_id] = map[r.message_id] || []).push({ user_id: r.user_id, emoji: r.emoji }); });
        setReactions(map);
        loadProfiles((data || []).map((r) => r.user_id));
      });
    const channel = supabase
      .channel(`chat-reactions-${tourId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_chat_reactions', filter: `tour_id=eq.${tourId}` }, ({ eventType, new: row, old }) => {
        if (eventType === 'DELETE') put(old, true); else { put(row); loadProfiles([row.user_id]); }
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [tourId, loadProfiles]);

  // Tap the same emoji again to remove it; another emoji replaces yours.
  const react = async (messageId, emoji) => {
    setPickerFor(null);
    if (!me) return;
    const mineNow = (reactions[messageId] || []).find((r) => r.user_id === me)?.emoji;
    const removing = mineNow === emoji;
    const apply = (value) => setReactions((prev) => {
      const list = (prev[messageId] || []).filter((r) => r.user_id !== me);
      return { ...prev, [messageId]: value ? [...list, { user_id: me, emoji: value }] : list };
    });
    apply(removing ? null : emoji);
    const { error } = removing
      ? await supabase.from('tour_chat_reactions').delete().eq('message_id', messageId).eq('user_id', me)
      : await supabase.from('tour_chat_reactions').upsert({ message_id: messageId, emoji }, { onConflict: 'message_id,user_id' });
    if (error) {
      apply(mineNow || null);
      toast.error("Couldn't save your reaction", error.message);
    }
  };

  // Close the reaction picker on Escape.
  useEffect(() => {
    if (pickerFor === null && reactorsFor === null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setPickerFor(null); setReactorsFor(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerFor, reactorsFor]);

  const startReply = (m) => {
    setPickerFor(null);
    setReplyTo(m);
    inputRef.current?.focus();
  };

  // Tap a quoted message to jump to the original.
  const jumpTo = (id) => {
    const el = document.getElementById(`chat-msg-${id}`);
    if (!el) { toast.info('That message is too old to show here.'); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(id);
    setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1600);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const row = { tour_id: tourId, body, ...(replyTo ? { reply_to: replyTo.id } : {}) };
    const { data, error } = await supabase.from('tour_chat_messages').insert([row]).select().single();
    setSending(false);
    if (error) { toast.error("Couldn't send your message", error.message); return; }
    setText('');
    setReplyTo(null);
    setMessages((prev) => (prev && !prev.some((x) => x.id === data.id) ? [...prev, data] : prev));
    await loadProfiles([data.user_id]);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !narrow) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, flex: 1 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: narrow ? '10px 12px' : '12px 16px', borderBottom: '1px solid rgba(180,81,30,0.12)', background: '#F2E4D0', flexShrink: 0 }}>
        {narrow && (
          <button type="button" onClick={onBack} aria-label="Back to chats" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ArrowLeft size={22} />
          </button>
        )}
        <span aria-hidden="true" style={{ width: narrow ? 36 : 40, height: narrow ? 36 : 40, borderRadius: 12, background: '#1A0A00', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Users size={17} />
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: narrow ? 15 : 14, fontWeight: 900, color: '#1A0A00', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title}</p>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatYmdRange(chat.start_date, chat.end_date)} · {chat.members} joiner{chat.members === 1 ? '' : 's'} + Bandang IBAYO
          </p>
        </div>
      </div>

      {/* messages */}
      <div onClick={() => setPickerFor(null)} style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: narrow ? '12px 10px' : '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
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
            <div key={m.id} id={`chat-msg-${m.id}`} style={{ borderRadius: 14, transition: 'background 0.4s', background: flashId === m.id ? 'rgba(232,162,101,0.28)' : 'transparent' }}>
              {newDay && (
                <p style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8481A', margin: '12px 0 6px' }}>{dayOf(m.created_at)}</p>
              )}
              <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 8, marginTop: sameAuthor ? 0 : 6 }}>
                {!mine && fromAdmin && <BrandAvatar size={30} style={{ visibility: sameAuthor ? 'hidden' : 'visible' }} />}
                {!mine && !fromAdmin && (
                  <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, visibility: sameAuthor ? 'hidden' : 'visible', background: fromAdmin ? '#B4511E' : '#1A0A00', color: fromAdmin ? '#FDF6EE' : '#E8A265', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {author?.avatar_url && !fromAdmin ? <img src={author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(author)}
                  </span>
                )}
                <div style={{ maxWidth: narrow ? '82%' : '70%', minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {!mine && !sameAuthor && (
                    <p style={{ fontSize: 11, fontWeight: 800, color: fromAdmin ? '#B4511E' : '#7A3A18', margin: '0 0 2px 4px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {nameFor(author, isAdmin)}
                      {fromAdmin && <span style={{ background: '#B4511E', color: '#FDF6EE', borderRadius: 999, padding: '1px 7px', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Admin</span>}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexDirection: mine ? 'row-reverse' : 'row', maxWidth: '100%' }}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Message. Tap to react or reply"
                      onClick={(e) => { e.stopPropagation(); if (canSend) setPickerFor(pickerFor === m.id ? null : m.id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && canSend) setPickerFor(pickerFor === m.id ? null : m.id); }}
                      style={{
                        background: mine ? '#B4511E' : fromAdmin ? 'rgba(180,81,30,0.12)' : '#F2E4D0',
                        color: mine ? '#FDF6EE' : '#1A0A00',
                        border: fromAdmin && !mine ? '1px solid rgba(180,81,30,0.3)' : 'none',
                        borderRadius: 16, padding: '8px 12px', fontSize: narrow ? 15 : 13.5, fontWeight: 500, lineHeight: 1.45,
                        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', cursor: 'pointer', minWidth: 0,
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {m.reply_to && (() => {
                        const orig = messages.find((x) => x.id === m.reply_to);
                        return (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); jumpTo(m.reply_to); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); jumpTo(m.reply_to); } }}
                            style={{
                              display: 'block', borderLeft: `3px solid ${mine ? '#E8A265' : '#B4511E'}`, borderRadius: 8,
                              background: mine ? 'rgba(253,246,238,0.18)' : 'rgba(180,81,30,0.08)',
                              padding: '4px 8px', margin: '0 0 6px', fontSize: 12, lineHeight: 1.4, cursor: 'pointer',
                            }}
                          >
                            <span style={{ display: 'block', fontWeight: 800, fontSize: 11 }}>
                              {orig ? (orig.user_id === me ? 'You' : nameFor(profiles[orig.user_id], isAdmin)) : 'Earlier message'}
                            </span>
                            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', opacity: 0.85 }}>
                              {orig ? orig.body : 'Tap to find it'}
                            </span>
                          </span>
                        );
                      })()}
                      {m.body}
                      <span style={{ display: 'block', textAlign: 'right', fontSize: 10, fontWeight: 600, marginTop: 2, opacity: 0.75 }}>{timeOf(m.created_at)}</span>
                    </div>
                    {!narrow && canSend && (
                      <button
                        type="button"
                        className="chat-react-btn"
                        aria-label="React"
                        onClick={(e) => { e.stopPropagation(); setPickerFor(pickerFor === m.id ? null : m.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8481A', padding: 4, borderRadius: 8, display: 'flex', flexShrink: 0 }}
                      >
                        <SmilePlus size={16} />
                      </button>
                    )}
                    {!narrow && canSend && (
                      <button
                        type="button"
                        className="chat-react-btn"
                        aria-label="Reply"
                        title="Reply"
                        onClick={(e) => { e.stopPropagation(); startReply(m); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A8481A', padding: 4, borderRadius: 8, display: 'flex', flexShrink: 0 }}
                      >
                        <Reply size={16} />
                      </button>
                    )}
                  </div>

                  {pickerFor === m.id && (
                    <div role="menu" aria-label="Pick a reaction" onClick={(e) => e.stopPropagation()} style={{
                      display: 'flex', gap: 2, background: '#FFF', borderRadius: 999, padding: '4px 6px', marginTop: 4,
                      boxShadow: '0 8px 24px rgba(26,10,0,0.18)', border: '1px solid rgba(180,81,30,0.15)', zIndex: 2,
                    }}>
                      {REACTIONS.map((emoji) => {
                        const chosen = (reactions[m.id] || []).some((r) => r.user_id === me && r.emoji === emoji);
                        return (
                          <button key={emoji} type="button" role="menuitem" aria-label={`React ${emoji}`} aria-pressed={chosen} onClick={() => react(m.id, emoji)} style={{
                            fontSize: narrow ? 24 : 20, lineHeight: 1, width: narrow ? 40 : 34, height: narrow ? 40 : 34, borderRadius: '50%',
                            border: 'none', cursor: 'pointer', background: chosen ? 'rgba(180,81,30,0.18)' : 'transparent',
                          }}>
                            {emoji}
                          </button>
                        );
                      })}
                      {canSend && (
                        <>
                          <span aria-hidden="true" style={{ width: 1, background: 'rgba(180,81,30,0.2)', margin: '6px 2px' }} />
                          <button type="button" role="menuitem" aria-label="Reply" onClick={() => startReply(m)} style={{
                            display: 'flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer', borderRadius: 999,
                            background: 'transparent', color: '#A8481A', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, padding: '0 8px',
                          }}>
                            <Reply size={narrow ? 18 : 16} /> Reply
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {(reactions[m.id] || []).length > 0 && (() => {
                    const list = reactions[m.id];
                    const used = REACTIONS.filter((e) => list.some((r) => r.emoji === e));
                    const mineToo = list.some((r) => r.user_id === me);
                    return (
                      <button type="button" aria-label={`${list.length} reaction${list.length === 1 ? '' : 's'}. See who reacted`} onClick={(e) => { e.stopPropagation(); setPickerFor(null); setReactorsFor(m.id); }} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 2, borderRadius: 999, padding: '2px 8px', marginTop: 3,
                        fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', color: '#1A0A00',
                        background: mineToo ? 'rgba(180,81,30,0.16)' : '#FFF',
                        border: mineToo ? '1px solid #B4511E' : '1px solid rgba(180,81,30,0.2)',
                        boxShadow: '0 2px 6px rgba(26,10,0,0.06)',
                      }}>
                        <span style={{ fontSize: 14, letterSpacing: 1 }}>{used.join('')}</span>
                        {list.length > 1 && <span style={{ marginLeft: 3 }}>{list.length}</span>}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* who reacted */}
      {reactorsFor !== null && (
        <ReactorsSheet
          list={reactions[reactorsFor] || []}
          me={me}
          nameOf={(id) => (id === me ? 'You' : nameFor(profiles[id], isAdmin))}
          profiles={profiles}
          onRemoveMine={canSend ? (emoji) => { react(reactorsFor, emoji); setReactorsFor(null); } : null}
          onClose={() => setReactorsFor(null)}
          narrow={narrow}
        />
      )}

      {/* replying to */}
      {canSend && replyTo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid rgba(180,81,30,0.12)', background: '#F2E4D0', flexShrink: 0 }}>
          <Reply size={16} style={{ color: '#A8481A', flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1, borderLeft: '3px solid #B4511E', paddingLeft: 8 }}>
            <p style={{ fontSize: 11.5, fontWeight: 900, color: '#A8481A', margin: 0 }}>
              Replying to {replyTo.user_id === me ? 'yourself' : nameFor(profiles[replyTo.user_id], isAdmin)}
            </p>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: '#1A0A00', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo.body}</p>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* composer */}
      {canSend ? (
        <form onSubmit={send} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: narrow ? '8px 10px' : '10px 12px', borderTop: '1px solid rgba(180,81,30,0.12)', background: '#FDF6EE', flexShrink: 0 }}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={replyTo ? 'Write your reply…' : 'Write a message…'}
            aria-label="Message"
            style={{
              flex: 1, resize: 'none', maxHeight: 120, minHeight: 42, boxSizing: 'border-box',
              background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 14,
              padding: '10px 14px', fontSize: narrow ? 16 : 14, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
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
          <Lock size={13} /> This tour has ended, so its group chat is archived. You can still read it.
        </p>
      )}
    </div>
  );
};

// "Who reacted": everyone's reaction, filterable by emoji. Your own can be removed here.
const ReactorsSheet = ({ list, me, nameOf, profiles, onRemoveMine, onClose, narrow }) => {
  const [tab, setTab] = useState('All');
  const used = REACTIONS.filter((e) => list.some((r) => r.emoji === e));
  const shown = tab === 'All' ? list : list.filter((r) => r.emoji === tab);
  // Your reaction first, then by emoji order.
  const sorted = [...shown].sort((a, b) => (a.user_id === me ? -1 : b.user_id === me ? 1 : REACTIONS.indexOf(a.emoji) - REACTIONS.indexOf(b.emoji)));
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(26,10,0,0.45)', display: 'flex', alignItems: narrow ? 'flex-end' : 'center', justifyContent: 'center', padding: narrow ? 0 : 20 }}>
      <div role="dialog" aria-modal="true" aria-label="Who reacted" onClick={(e) => e.stopPropagation()} style={{
        background: '#FDF6EE', width: '100%', maxWidth: 440, maxHeight: '70dvh', display: 'flex', flexDirection: 'column',
        borderRadius: narrow ? '22px 22px 0 0' : 22, boxShadow: '0 -12px 40px rgba(26,10,0,0.25)',
        paddingBottom: 'env(safe-area-inset-bottom)', marginBottom: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 6px' }}>
          <p style={{ fontSize: 14, fontWeight: 900, color: '#1A0A00', margin: 0 }}>Reactions</p>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} />
          </button>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 6, padding: '0 16px 10px', overflowX: 'auto', borderBottom: '1px solid rgba(180,81,30,0.12)' }}>
          {['All', ...used].map((t) => {
            const count = t === 'All' ? list.length : list.filter((r) => r.emoji === t).length;
            const active = tab === t;
            return (
              <button key={t} type="button" role="tab" aria-selected={active} onClick={() => setTab(t)} style={{
                border: 'none', borderRadius: 999, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, flexShrink: 0,
                background: active ? '#1A0A00' : '#F2E4D0', color: active ? '#FDF6EE' : '#1A0A00',
              }}>
                {t === 'All' ? 'All' : <span style={{ fontSize: 15 }}>{t}</span>} {count}
              </button>
            );
          })}
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0', overflowY: 'auto' }}>
          {sorted.map((r) => {
            const p = profiles[r.user_id];
            const isMe = r.user_id === me;
            return (
              <li key={r.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px' }}>
                {p?.role === 'admin' ? <BrandAvatar size={36} /> : <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: p?.role === 'admin' ? '#B4511E' : '#1A0A00', color: p?.role === 'admin' ? '#FDF6EE' : '#E8A265', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {p?.avatar_url && p.role !== 'admin' ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(p)}
                </span>}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#1A0A00' }}>{nameOf(r.user_id)}</span>
                  {isMe && onRemoveMine && (
                    <button type="button" onClick={() => onRemoveMine(r.emoji)} className="text-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                      Tap to remove
                    </button>
                  )}
                </span>
                <span style={{ fontSize: 22 }}>{r.emoji}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default GroupChat;
