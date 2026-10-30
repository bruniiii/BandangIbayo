import React from 'react';
import { Book, BookOpen } from 'lucide-react';

// Keeps the desktop sidebar open (pinned) or back to opening on hover.
// The book is open while the sidebar is pinned open, closed when it isn't.
const SidebarPinButton = ({ pinned, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={pinned}
    aria-label={pinned ? 'Unpin the sidebar (open it on hover)' : 'Pin the sidebar open'}
    title={pinned ? 'Unpin sidebar' : 'Keep sidebar open'}
    style={{
      position: 'absolute', top: 12, right: 12, zIndex: 31,
      width: 30, height: 30, borderRadius: 10, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: pinned ? '#B4511E' : 'rgba(253,246,238,0.08)',
      border: '1px solid rgba(232,162,101,0.35)',
      color: pinned ? '#FDF6EE' : '#E8A265',
    }}
  >
    {pinned ? <BookOpen size={15} /> : <Book size={15} />}
  </button>
);

export default SidebarPinButton;
