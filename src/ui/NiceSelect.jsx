import React, { Children, isValidElement, useRef, useState } from 'react';
import PrettySelect from './PrettySelect';

// ─────────────────────────────────────────────
// A drop-in for <select>: the same props and <option> children, but it looks
// like the site's other dropdowns (PrettySelect) instead of the browser's
// plain grey list.
//   <NiceSelect value={v} onChange={(e) => set(e.target.value)}>
//     <option value="">All</option> …
//   </NiceSelect>
// - onChange gets { target: { value, name } }, like a real select.
// - name: a hidden input carries the value, so forms read it (FormData).
// - defaultValue works too (it then keeps its own value).
// - An empty-value option that's disabled or hidden is only the placeholder.
// ─────────────────────────────────────────────

const flatten = (children) => Children.toArray(children).flatMap((c) => {
  if (!isValidElement(c)) return [];
  if (c.type === React.Fragment) return flatten(c.props.children);
  if (c.type === 'optgroup') return flatten(c.props.children);
  return c.type === 'option' ? [c] : [];
});
const textOf = (node) => Children.toArray(node).map((n) => (typeof n === 'string' || typeof n === 'number' ? String(n) : isValidElement(n) ? textOf(n.props.children) : '')).join('');

// Only the layout parts of a select's style apply to the wrapper.
const LAYOUT = ['flex', 'width', 'minWidth', 'maxWidth', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'alignSelf', 'gridColumn'];

const NiceSelect = ({ children, value, defaultValue, onChange, name, id, disabled = false, style = {}, compact, icon, placeholder, required, onBlur, ...rest }) => {
  const controlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue ?? '');
  const current = String(controlled ? value ?? '' : own);
  const hiddenRef = useRef(null);

  const opts = flatten(children).map((o) => ({
    value: String(o.props.value ?? textOf(o.props.children)),
    label: textOf(o.props.children),
    disabled: !!o.props.disabled,
    hidden: !!o.props.hidden,
  }));
  const holder = opts.find((o) => o.value === '' && (o.disabled || o.hidden));
  const options = opts.filter((o) => o !== holder && !o.hidden);

  // Tell the form the person changed it (its "unsaved changes" and required checks listen).
  const announce = () => setTimeout(() => {
    const el = hiddenRef.current;
    if (el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, 0);

  const wrapStyle = { minWidth: 0 };
  LAYOUT.forEach((k) => { if (style[k] !== undefined) wrapStyle[k] = style[k]; });
  const small = compact ?? (Number.parseInt(style.padding, 10) <= 9 || Number(style.fontSize) <= 13);

  return (
    <div style={wrapStyle}>
      {name && <input ref={hiddenRef} type="hidden" name={name} value={current} data-required={required ? 'true' : undefined} />}
      <PrettySelect
        id={id}
        value={current}
        options={options}
        disabled={disabled}
        compact={small}
        icon={icon}
        onBlur={onBlur}
        ariaLabel={rest['aria-label']}
        invalid={rest['aria-invalid'] === true || rest['aria-invalid'] === 'true'}
        placeholder={placeholder || holder?.label || opts.find((o) => o.value === current)?.label || 'Choose…'}
        onChange={(v) => {
          if (!controlled) setOwn(v);
          onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } });
          announce();
        }}
      />
    </div>
  );
};

export default NiceSelect;
