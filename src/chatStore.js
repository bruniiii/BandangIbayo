import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// TOUR GROUP CHAT helpers (see GroupChat.jsx and
// 20261031000000_tour_group_chat.sql)
// ─────────────────────────────────────────────

// Fired after a chat is opened or a message arrives, so the unread badge updates.
export const CHAT_CHANGED = 'ibayo:chat-changed';
export const chatChanged = () => window.dispatchEvent(new Event(CHAT_CHANGED));

// Ask the dashboard to open the group chat of one tour (e.g. from My Bookings).
export const OPEN_CHAT = 'ibayo:open-chat';
export const openGroupChat = (tourId) => window.dispatchEvent(new CustomEvent(OPEN_CHAT, { detail: { tourId } }));

export const fetchMyChats = async () => {
  const { data, error } = await supabase.rpc('my_tour_chats');
  return error ? [] : data || [];
};

// Total unread group chat messages, kept live for the sidebar badge.
export const useChatUnread = () => {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => fetchMyChats().then((chats) => {
      if (active) setUnread(chats.reduce((n, c) => n + (c.unread || 0), 0));
    });
    refresh();
    const channel = supabase
      .channel('chat-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tour_chat_messages' }, refresh)
      .subscribe();
    window.addEventListener(CHAT_CHANGED, refresh);
    return () => {
      active = false;
      supabase.removeChannel(channel);
      window.removeEventListener(CHAT_CHANGED, refresh);
    };
  }, []);
  return unread;
};
