// ─────────────────────────────────────────────
// Where a dropdown list or a calendar should open so it isn't cut off: by
// the screen, or by the box it sits in (a window like the Weather one, a
// scrolling panel). Checks the nearest such box and the screen.
//   popupPlace(anchorEl, { width, height }) → { toLeft, upward }
// ─────────────────────────────────────────────

const clips = (el) => {
  const s = window.getComputedStyle(el);
  return /(auto|scroll|hidden|clip)/.test(`${s.overflow}${s.overflowX}${s.overflowY}`);
};

// The visible area the popup has to stay inside.
const boundsOf = (el) => {
  let left = 8;
  let right = window.innerWidth - 8;
  let top = 8;
  let bottom = window.innerHeight - 8;
  for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
    if (!clips(p)) continue;
    const r = p.getBoundingClientRect();
    left = Math.max(left, r.left + 4);
    right = Math.min(right, r.right - 4);
    top = Math.max(top, r.top + 4);
    bottom = Math.min(bottom, r.bottom - 4);
  }
  return { left, right, top, bottom };
};

export const popupPlace = (anchor, { width = 296, height = 300 } = {}) => {
  const box = anchor?.getBoundingClientRect();
  if (!box) return { toLeft: false, upward: false };
  const b = boundsOf(anchor);
  // Grow leftward when there's no room on the right and more room that way.
  const roomRight = b.right - box.left;
  const roomLeft = box.right - b.left;
  const toLeft = roomRight < width && roomLeft > roomRight;
  const below = b.bottom - box.bottom;
  const above = box.top - b.top;
  const upward = below < height && above > below;
  return { toLeft, upward };
};
