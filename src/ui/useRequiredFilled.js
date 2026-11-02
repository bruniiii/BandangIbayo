import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────
// Submit buttons stay disabled until every required box of a form is filled.
//
//   const [formRef, filled] = useRequiredFilled(['extraName', …]);
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
  if (el.disabled || el.type === 'hidden') return false;
  if (el.type === 'checkbox') return !el.checked;
  if (el.type === 'radio') return !form.querySelector(`input[type="radio"][name="${esc(el.name)}"]:checked`);
  return String(el.value ?? '').trim() === '';
};

export const allRequiredFilled = (form, names = []) => {
  if (!form) return false;
  const byName = names.map((n) => form.querySelector(`[name="${esc(n)}"]`)).filter(Boolean);
  const all = [...form.querySelectorAll('input[required], select[required], textarea[required]'), ...byName];
  return !all.some((el) => isEmpty(el, form));
};

// names: extra boxes (by name) that must be filled even without `required`
// (a name not on the page is skipped).
export const useRequiredFilled = (names = []) => {
  const nodeRef = useRef(null);
  const [filled, setFilled] = useState(false);
  const key = names.join('|');
  const check = useCallback(() => setFilled(allRequiredFilled(nodeRef.current, key ? key.split('|') : [])), [key]);

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

  return [ref, filled];
};
