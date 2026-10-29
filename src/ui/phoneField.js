import { formatPhPhone } from '../validation';

// ─────────────────────────────────────────────
// PHONE FIELDS: shown as "+63 917 123 4567".
// The "+63 " is filled in when the field is focused, and digits are grouped
// as they're typed or pasted (09…, 639… and +63… all work). The forms still
// save the number in the usual 09XXXXXXXXX form via normalizePhone().
// ─────────────────────────────────────────────

// Keys that would only be dropped are never typed at all: letters, a 0 right
// after +63, and digits past the 10 that fit.
const NAV_KEYS = ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
export const blockPhoneKeys = (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || NAV_KEYS.includes(e.key) || e.key.length !== 1) return;
  if (!/\d/.test(e.key)) { e.preventDefault(); return; }
  const el = e.target;
  const value = String(el.value || '');
  const selected = el.selectionStart !== el.selectionEnd;
  const digits = value.replace(/^\+63\s?/, '').replace(/\D/g, '');
  // A 0 as the first digit after +63 (an empty field gets "+63 " on focus).
  const caret = el.selectionStart ?? value.length;
  if (e.key === '0' && (digits.length === 0 || caret <= (value.startsWith('+63') ? 4 : 0))) { e.preventDefault(); return; }
  if (!selected && digits.length >= 10) e.preventDefault();
};

const shared = {
  type: 'tel',
  inputMode: 'tel',
  autoComplete: 'tel',
  'data-allow': 'phone',
  maxLength: 16,
  placeholder: '+63 917 123 4567',
  onKeyDown: blockPhoneKeys,
};

// For uncontrolled inputs inside a plain <form>.
export const phoneInputProps = {
  ...shared,
  onFocus: (e) => { if (!e.target.value) e.target.value = '+63 '; },
  onBlur: (e) => { if (e.target.value.trim() === '+63') e.target.value = ''; },
  onInput: (e) => {
    const formatted = formatPhPhone(e.target.value);
    if (formatted !== e.target.value) e.target.value = formatted;
  },
};

// For controlled inputs: phoneFieldProps(value, setValue) → value / onChange / onFocus / onBlur.
export const phoneFieldProps = (value, setValue) => ({
  ...shared,
  value: value ?? '',
  onChange: (e) => setValue(formatPhPhone(e.target.value)),
  onFocus: () => { if (!value) setValue('+63 '); },
  onBlur: () => { if (String(value ?? '').trim() === '+63') setValue(''); },
});
