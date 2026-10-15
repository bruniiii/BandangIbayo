import { formatPhPhone } from '../validation';

// ─────────────────────────────────────────────
// PHONE FIELDS: shown as "+63 917 123 4567".
// The "+63 " is filled in when the field is focused, and digits are grouped
// as they're typed or pasted (09…, 639… and +63… all work). The forms still
// save the number in the usual 09XXXXXXXXX form via normalizePhone().
// ─────────────────────────────────────────────

const shared = {
  type: 'tel',
  inputMode: 'tel',
  autoComplete: 'tel',
  'data-allow': 'phone',
  maxLength: 16,
  placeholder: '+63 917 123 4567',
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
