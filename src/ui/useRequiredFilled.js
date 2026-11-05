import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────
// Submit buttons stay disabled until every required box of a form is filled.
//
//   const [formRef, filled, missing] = useRequiredFilled(['extraName', …]);
//   (missing: the empty boxes by label, for <MissingHint items={missing} />)
//   <form ref={formRef}> … <input required /> … <button disabled={busy || !filled}>
//
// "Required" = any input, select or textarea with the `required` attribute
// (checkboxes must be ticked, a radio group needs one choice). Hidden and
// disabled boxes don't count. Checked again on typing and on every render, so
// boxes filled in by the page (e.g. from the profile) count too. The checks
// that run on submit still catch typing mistakes (wrong email, short password…).
// ─────────────────────────────────────────────

const esc = (v) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'));

const isEmpty = (el, form) => {
  // (Hidden boxes don't count, except the value box of the site's own
  // dropdowns and date pickers when they're required.)
  if (el.disabled || (el.type === 'hidden' && el.dataset?.required !== 'true')) return false;
  if (el.type === 'checkbox') return !el.checked;
  if (el.type === 'radio') return !form.querySelector(`input[type="radio"][name="${esc(el.name)}"]:checked`);
  return String(el.value ?? '').trim() === '';
};

const clean = (t) => String(t || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

// The label a box shows on screen.
const labelFor = (el) => {
  if (el.getAttribute('aria-label')) return clean(el.getAttribute('aria-label'));
  if (el.id) {
    const byFor = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
    if (byFor && clean(byFor.textContent)) return clean(byFor.textContent);
  }
  if (el.type === 'checkbox') {
    const t = clean(el.closest('label')?.textContent);
    if (t) return t.length > 40 ? `${t.slice(0, 38)}… box` : `${t} box`;
  }
  // The label in the same field wrapper (stops before a wrapper holding other boxes).
  let node = el.parentElement;
  for (let i = 0; node && i < 4; i += 1, node = node.parentElement) {
    if ([...node.querySelectorAll('[name]')].some((o) => o !== el && o.name !== el.name)) break;
    const lab = node.querySelector('label');
    if (lab && clean(lab.textContent)) return clean(lab.textContent);
  }
  return clean(el.placeholder) || clean(el.name) || 'A required box';
};

// The empty required boxes of a form, with the label each shows.
export const missingInForm = (form, names = []) => {
  if (!form) return [];
  const seen = new Set();
  const out = [];
  const byName = names.map((n) => form.querySelector(`[name="${esc(n)}"]`)).filter(Boolean);
  [...form.querySelectorAll('input[required], select[required], textarea[required], input[data-required="true"]'), ...byName].forEach((el) => {
    if (!isEmpty(el, form)) return;
    const key = el.type === 'radio' ? `r:${el.name}` : el;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: labelFor(el), el });
  });
  return out;
};

// Jump to a box: focus it (or the button of the site's own dropdowns/date pickers).
export const jumpTo = (target) => {
  let el = target;
  if (typeof target === 'string') el = document.querySelector(`[name="${target}"]`);
  if (!el) return;
  if (el.type === 'hidden') el = el.parentElement?.querySelector('button, input:not([type="hidden"])') || el.parentElement;
  el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  el?.focus?.({ preventScroll: true });
};

export const allRequiredFilled = (form, names = []) => {
  if (!form) return false;
  const byName = names.map((n) => form.querySelector(`[name="${esc(n)}"]`)).filter(Boolean);
  const all = [...form.querySelectorAll('input[required], select[required], textarea[required], input[data-required="true"]'), ...byName];
  return !all.some((el) => isEmpty(el, form));
};

// names: extra boxes (by name) that must be filled even without `required`
// (a name not on the page is skipped).
export const useRequiredFilled = (names = []) => {
  const nodeRef = useRef(null);
  const [filled, setFilled] = useState(false);
  const [missing, setMissing] = useState([]);
  const lastRef = useRef('');
  const key = names.join('|');
  const check = useCallback(() => {
    const extra = key ? key.split('|') : [];
    setFilled(allRequiredFilled(nodeRef.current, extra));
    // The named list (for MissingHint): only replaced when it changed.
    const list = missingInForm(nodeRef.current, extra);
    const sig = list.map((m) => m.label).join('|');
    if (sig !== lastRef.current) { lastRef.current = sig; setMissing(list); }
  }, [key]);

  const ref = useCallback((node) => {
    if (nodeRef.current) {
      nodeRef.current.removeEventListener('input', nodeRef.current.__rfCheck);
      nodeRef.current.removeEventListener('change', nodeRef.current.__rfCheck);
    }
    nodeRef.current = node;
    if (node) {
      // A tick later: React has finished updating the boxes.
      node.__rfCheck = () => setTimeout(check, 0);
      node.addEventListener('input', node.__rfCheck);
      node.addEventListener('change', node.__rfCheck);
      check();
    }
  }, [check]);

  // Boxes filled in by the page (not typed) and boxes that appear later.
  useEffect(() => { check(); });

  return [ref, filled, missing];
};
