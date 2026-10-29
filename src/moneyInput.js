// ─────────────────────────────────────────────
// PRICE FIELDS: shown as 000,000,000.00. Never negative, up to 9 digits and
// 2 decimal places (centavos).
// The field drops anything that isn't a digit or one decimal point as it's
// typed or pasted, so "-500" can't even be entered. Commas are added as you
// type and ".00" when you leave the field. Forms still check the number on
// submit, and the database rejects negative tour prices.
// ─────────────────────────────────────────────

const MAX_WHOLE_DIGITS = 9;

// "1,500.5" → "1500.5": the number as typed, without commas.
export const cleanMoney = (raw) => {
  let v = String(raw ?? '').replace(/[^0-9.]/g, '');
  const dot = v.indexOf('.');
  let whole = dot === -1 ? v : v.slice(0, dot);
  const frac = dot === -1 ? null : v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  whole = whole.replace(/^0+(?=\d)/, '').slice(0, MAX_WHOLE_DIGITS);
  if (frac !== null && whole === '') whole = '0';
  return frac === null ? whole : `${whole}.${frac}`;
};

// The number in a price field ("1,500.00" → 1500); NaN when it's empty.
export const moneyNumber = (raw) => {
  const v = cleanMoney(raw);
  return v === '' ? NaN : Number(v);
};

// "1500.5" → "1,500.5" while typing.
export const moneyText = (raw) => {
  const v = cleanMoney(raw);
  if (v === '') return '';
  const [whole, frac] = v.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? grouped : `${grouped}.${frac}`;
};

// "1500.5" → "1500.50" (two decimals) once the field is left.
export const padMoney = (raw) => {
  const v = cleanMoney(raw);
  return v === '' ? '' : Number(v).toFixed(2);
};

// A saved amount shown in a price field: 1500 → "1,500.00".
export const moneyDisplay = (n) => (n === null || n === undefined || n === '' ? '' : moneyText(padMoney(n)));

// Keys that would make a number negative or exponential (number fields allow them).
// Whole-number fields (group size, slots) also can't start with 0.
export const blockSignKeys = (e) => {
  if (['-', '+', 'e', 'E', '.'].includes(e.key) && e.target.type === 'number') { e.preventDefault(); return; }
  if (['-', '+', 'e', 'E'].includes(e.key)) { e.preventDefault(); return; }
  if (e.key === '0' && e.target.type === 'number' && (e.target.value === '' || e.target.selectionStart === 0)) e.preventDefault();
};

// Props for an uncontrolled price <input> (read it back with moneyNumber()).
export const moneyInputProps = {
  type: 'text',
  inputMode: 'decimal',
  'data-allow': 'decimal',
  autoComplete: 'off',
  maxLength: 14,
  title: 'Amount, e.g. 1,500.00 (no negative amounts)',
  onKeyDown: blockSignKeys,
  onInput: (e) => {
    const shown = moneyText(e.target.value);
    if (shown !== e.target.value) e.target.value = shown;
  },
  onBlur: (e) => {
    const shown = moneyText(padMoney(e.target.value));
    if (shown !== e.target.value) e.target.value = shown;
  },
};

// Props for a controlled price <input>: the state keeps the plain number
// ("1500.50"); the field shows "1,500.50".
export const moneyField = (value, setValue) => ({
  ...moneyInputProps,
  value: moneyText(value),
  onInput: undefined,
  onChange: (e) => setValue(cleanMoney(e.target.value)),
  onBlur: () => setValue(padMoney(value)),
});
