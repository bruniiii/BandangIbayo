// ─────────────────────────────────────────────
// TYPE-AHEAD INPUT FILTER
// Fields say what they accept with a data-allow attribute, and anything
// else is blocked as it's typed, pasted or dropped (with a short hint):
//   data-allow="name"    letters, spaces and . ' - ,   (no numbers)
//   data-allow="place"   letters, spaces and . ' - , ( ) / &   (no numbers)
//   data-allow="phone"   digits, spaces and + - ( )   (no letters)
//   data-allow="digits"  0-9 only
//   data-allow="decimal" digits and a decimal point (prices)
// Number inputs (<input type="number">) are treated as "digits", or
// "decimal" when their step allows fractions.
// One listener on the document covers every page; install it once.
// ─────────────────────────────────────────────

const RULES = {
  name: { ok: /[\p{L}\p{M} .'’,-]/u, hint: 'Letters only — numbers and symbols aren’t allowed here.' },
  place: { ok: /[\p{L}\p{M} .'’,()/&-]/u, hint: 'Letters only — numbers aren’t allowed here.' },
  phone: { ok: /[0-9 +()-]/, hint: 'Numbers only — letters aren’t allowed here.' },
  digits: { ok: /[0-9]/, hint: 'Whole numbers only.' },
  decimal: { ok: /[0-9.]/, hint: 'Numbers only, e.g. 1500 or 1499.50.' },
};

const ruleFor = (el) => {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
  const kind = el.dataset.allow;
  if (kind && RULES[kind]) return RULES[kind];
  if (el.type === 'number') {
    const step = el.getAttribute('step');
    return step && step !== '1' ? RULES.decimal : RULES.digits;
  }
  return null;
};

const clean = (rule, text) => [...text].filter((ch) => rule.ok.test(ch)).join('');

// Brief browser bubble on the field explaining why the key did nothing.
const timers = new WeakMap();
const showHint = (el, message) => {
  if (typeof el.setCustomValidity !== 'function') return;
  el.setCustomValidity(message);
  el.reportValidity();
  clearTimeout(timers.get(el));
  timers.set(el, setTimeout(() => el.setCustomValidity(''), 1800));
};

const clearHint = (e) => {
  const el = e.target;
  if (!ruleFor(el)) return;
  clearTimeout(timers.get(el));
  el.setCustomValidity('');
};

const onBeforeInput = (e) => {
  const el = e.target;
  const rule = ruleFor(el);
  if (!rule || !e.inputType?.startsWith('insert')) return;
  const text = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
  if (!text) return;
  const cleaned = clean(rule, text);
  if (cleaned === text) return;
  e.preventDefault();
  // Keep the allowed part of a paste ("0917-123-4567 (mobile)" → "0917-123-4567 ()").
  // insertText goes through the normal input events, so React state stays in sync.
  // Number inputs don't support text selection, so they just drop the input.
  if (cleaned && e.inputType !== 'insertText' && el.type !== 'number') {
    document.execCommand('insertText', false, cleaned);
  }
  showHint(el, rule.hint);
};

let installed = false;
export const installInputFilter = () => {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('beforeinput', onBeforeInput, true);
  document.addEventListener('input', clearHint, true);
};
