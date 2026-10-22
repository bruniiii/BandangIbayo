// ─────────────────────────────────────────────
// TOAST NOTIFICATIONS: short messages in the corner that confirm an action
// or report a problem without blocking the page (instead of alert()).
//
//   toast.success('Booking cancelled', 'Your slots were released.');
//   toast.error("Couldn't save", err.message, { action: { label: 'Try again', onClick: retry } });
//   const id = toast.loading('Sending email…');  …  toast.dismiss(id);
//
// Successes disappear after a few seconds; errors stay until closed (or
// longer) so they can be read. Rendered by <Toaster /> (src/ui/Toaster.jsx).
// ─────────────────────────────────────────────

let toasts = [];
let nextId = 1;
const listeners = new Set();
const timers = new Map();

const emit = () => listeners.forEach((l) => l());

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getToasts = () => toasts;

const DURATION = { success: 4000, info: 5000, error: 9000, loading: null };

export const dismiss = (id) => {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  emit();
};

const show = (type, title, message = '', options = {}) => {
  const id = options.id ?? nextId++;
  const entry = { id, type, title: String(title ?? ''), message: message ? String(message) : '', action: options.action || null };
  toasts = [...toasts.filter((t) => t.id !== id), entry].slice(-4);   // at most 4 on screen
  emit();
  clearTimeout(timers.get(id));
  const ms = options.duration !== undefined ? options.duration : DURATION[type];
  if (ms) timers.set(id, setTimeout(() => dismiss(id), ms));
  return id;
};

export const toast = {
  success: (title, message, options) => show('success', title, message, options),
  error: (title, message, options) => show('error', title, message, options),
  info: (title, message, options) => show('info', title, message, options),
  loading: (title, message, options) => show('loading', title, message, options),
  dismiss,
};

export default toast;
