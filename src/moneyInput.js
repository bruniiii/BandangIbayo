// ─────────────────────────────────────────────
// PRICE FIELDS: never negative, up to 2 decimal places (centavos).
// The field drops anything that isn't a digit or one decimal point as it's
// typed or pasted, so "-500" can't even be entered. Forms still check the
// number on submit, and the database rejects negative tour prices.
// ─────────────────────────────────────────────

export const cleanMoney = (raw) => {
  let v = String(raw ?? '').replace(/[^0-9.]/g, '');
  const dot = v.indexOf('.');
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return v;
};

// Keys that would make a number negative or exponential (number fields allow them).
export const blockSignKeys = (e) => {
  if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
};

// Props for a price <input>. Uncontrolled inputs are cleaned in place;
// controlled ones should also pass cleanMoney(e.target.value) to their state.
export const moneyInputProps = {
  type: 'text',
  inputMode: 'decimal',
  'data-allow': 'decimal',
  autoComplete: 'off',
  pattern: '[0-9]+(\\.[0-9]{1,2})?',
  title: 'Numbers only, e.g. 1500 or 1499.50 (no negative amounts)',
  onKeyDown: blockSignKeys,
  onInput: (e) => {
    const cleaned = cleanMoney(e.target.value);
    if (cleaned !== e.target.value) e.target.value = cleaned;
  },
};
