import { useEffect, useRef } from 'react';

/* Opening the exact item a notification is about (a booking, a request, a
   post, a review, a joiner...). Pages mark items with focusAttr(id); a page
   given an id opens it with useOpenOnce, or scrolls to it with flashFocus. */

// Put on the element that shows an item, so flashFocus can find it.
export const focusAttr = (id) => ({ 'data-focus-id': String(id) });

// Scrolls to the item and makes it glow for a moment. Waits a little for it
// to show up (the page may still be loading).
export const flashFocus = (id, tries = 30) => {
  if (id == null) return;
  const run = (left) => {
    const el = document.querySelector(`[data-focus-id="${CSS.escape(String(id))}"]`);
    if (!el) { if (left > 0) setTimeout(() => run(left - 1), 150); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('focus-flash');
    void el.offsetWidth; // restart the glow if it's already running
    el.classList.add('focus-flash');
    setTimeout(() => el.classList.remove('focus-flash'), 2800);
  };
  run(tries);
};

// Calls open(item) once, as soon as the item with this id is in the loaded list.
// match(item, id) can widen the match (e.g. a trip that holds several dates).
export const useOpenOnce = (openId, items, open, match) => {
  const pending = useRef(openId);
  const openRef = useRef(open);
  const matchRef = useRef(match);
  useEffect(() => { openRef.current = open; matchRef.current = match; });
  useEffect(() => {
    if (pending.current == null || !items?.length) return;
    const id = String(pending.current);
    const hit = items.find((x) => (matchRef.current ? matchRef.current(x, id) : String(x.id) === id));
    if (hit) { pending.current = null; openRef.current(hit); }
  }, [items]);
};
