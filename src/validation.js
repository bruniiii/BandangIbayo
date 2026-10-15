import { toast } from './ui/toast';

// ─────────────────────────────────────────────
// INPUT CHECKS shared by the forms, to catch common typing mistakes before
// anything is saved: wrong phone formats, numbers in names, misspelled email
// domains, impossible dates, the same number used twice, and so on.
// Each check returns an error message, or '' when the value is fine.
// ─────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

// ── Phone numbers ────────────────────────────
// Mobile: 09XX XXX XXXX / +63 9XX XXX XXXX / 639XXXXXXXXX
// Landline: (02) 8XXX XXXX / 0XX XXX XXXX
// Spaces, dashes, dots and brackets are allowed while typing.
export const normalizePhone = (raw) => {
  let d = String(raw ?? '').trim().replace(/[\s\-().]/g, '');
  if (d.startsWith('+63')) d = '0' + d.slice(3);
  else if (/^63\d{10}$/.test(d)) d = '0' + d.slice(2);
  if (/^09\d{9}$/.test(d)) return d;            // mobile
  if (/^0[2-8]\d{8}$/.test(d)) return d;        // landline with area code
  return null;
};

export const phoneError = (raw, label = 'Phone number', { required = true } = {}) => {
  const value = String(raw ?? '').trim();
  if (!value) return required ? `Please enter the ${label.toLowerCase()}.` : '';
  if (/[a-z]/i.test(value)) return `${label} can only have numbers.`;
  if (!normalizePhone(value)) return `${label} doesn't look right. Use a Philippine number like 0917 123 4567 or +63 917 123 4567.`;
  return '';
};

// Shows a mobile number as "+63 917 123 4567" while it's typed. Accepts
// 09…, 639…, +63… or just the 10 digits; anything past 10 digits is dropped.
export const formatPhPhone = (raw) => {
  const text = String(raw ?? '');
  let digits = text.replace(/\D/g, '');
  if (text.trim().startsWith('+63') || (digits.startsWith('63') && digits.length > 10)) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return text.startsWith('+63 ') ? '+63 ' : '';
  return '+63 ' + [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(' ');
};

export const samePhone = (a, b) => {
  const x = normalizePhone(a);
  return !!x && x === normalizePhone(b);
};

// ── Names ────────────────────────────────────
// Letters (including ñ and accents), spaces, periods, apostrophes and hyphens.
const NAME_RE = /^[\p{L}][\p{L}\p{M} .'-]*$/u;

export const nameError = (raw, label = 'Name', { required = true, min = 2, max = 60 } = {}) => {
  const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!value) return required ? `Please enter the ${label.toLowerCase()}.` : '';
  if (/\d/.test(value)) return `${label} can't have numbers.`;
  if (!NAME_RE.test(value)) return `${label} can only have letters, spaces, periods, apostrophes and hyphens.`;
  if (value.replace(/[^\p{L}]/gu, '').length < min) return `${label} is too short.`;
  if (value.length > max) return `${label} is too long (${max} characters at most).`;
  return '';
};

// A full name should have at least two words ("Juan Dela Cruz").
export const fullNameError = (raw, label = 'Full name') => {
  const err = nameError(raw, label, { max: 100 });
  if (err) return err;
  return String(raw).trim().split(/\s+/).length < 2 ? `${label} needs both a first and last name.` : '';
};

export const suffixError = (raw) => {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  return /^(jr\.?|sr\.?|i{1,3}|iv|v|vi{0,3})$/i.test(value) ? '' : 'Suffix should be like Jr., Sr., II or III.';
};

export const cleanName = (raw) => String(raw ?? '').trim().replace(/\s+/g, ' ');

// ── Username ─────────────────────────────────
export const usernameError = (raw) => {
  const value = String(raw ?? '').trim();
  if (!value) return 'Please choose a username.';
  if (value.includes('@')) return "A username can't be an email address.";
  if (!/^[A-Za-z0-9_.]{3,30}$/.test(value)) return 'Username must be 3–30 characters: letters, numbers, underscores (_) or periods (.), no spaces.';
  if (/^[._]|[._]$/.test(value)) return "Username can't start or end with a period or underscore.";
  return '';
};

// ── Email ────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOMAIN_TYPOS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmaill.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.om': 'gmail.com', 'gmal.com': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'icloud.co': 'icloud.com',
};

export const emailError = (raw, { required = true } = {}) => {
  const value = String(raw ?? '').trim();
  if (!value) return required ? 'Please enter your email address.' : '';
  if (/\s/.test(value)) return "Email address can't have spaces.";
  if (!EMAIL_RE.test(value)) return 'Please enter a valid email address, like juan@gmail.com.';
  return '';
};

// "juan@gmial.com" → "juan@gmail.com", or null when nothing looks misspelled.
export const emailSuggestion = (raw) => {
  const value = String(raw ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1) return null;
  const fix = DOMAIN_TYPOS[value.slice(at + 1)];
  return fix ? `${value.slice(0, at)}@${fix}` : null;
};

// ── Dates ────────────────────────────────────
export const todayPH = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
export const addDaysPH = (days) => new Date(Date.now() + 8 * 3600 * 1000 + days * DAY).toISOString().slice(0, 10);

export const birthDateError = (raw, { required = false } = {}) => {
  const value = String(raw ?? '').trim();
  if (!value) return required ? 'Please enter your date of birth.' : '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Please enter a valid date of birth.';
  if (value > todayPH()) return "Date of birth can't be in the future.";
  const age = (Date.now() - date.getTime()) / (365.25 * DAY);
  if (age > 110) return 'Please check the year of your date of birth.';
  if (age < 1) return 'Please check your date of birth.';
  return '';
};

// ── Free text ────────────────────────────────
export const textError = (raw, label, { required = true, min = 1, max = 2000 } = {}) => {
  const value = String(raw ?? '').trim();
  if (!value) return required ? `Please enter the ${label.toLowerCase()}.` : '';
  if (value.length < min) return `${label} is too short (at least ${min} characters).`;
  if (value.length > max) return `${label} is too long (${max} characters at most).`;
  return '';
};

// ── Files ────────────────────────────────────
export const IMAGE_MAX_MB = 10;
export const VIDEO_MAX_MB = 50;

// Returns an error for a file that isn't an image/video or is too big.
export const mediaFileError = (file, { allowVideo = true } = {}) => {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !(allowVideo && isVideo)) return `"${file.name}" isn't ${allowVideo ? 'a photo or video' : 'a photo'}.`;
  const max = isVideo ? VIDEO_MAX_MB : IMAGE_MAX_MB;
  if (file.size > max * 1024 * 1024) return `"${file.name}" is too big (${(file.size / 1048576).toFixed(1)} MB). ${isVideo ? 'Videos' : 'Photos'} can be up to ${max} MB.`;
  return '';
};

// ── Showing the error at the field ───────────
// Puts the browser's error bubble on the field (and scrolls to it). The
// message clears as soon as the form is edited. Falls back to an alert.
export const flagField = (form, name, message) => {
  const el = form?.querySelector?.(`[name="${name}"]`);
  if (!el || typeof el.setCustomValidity !== 'function') {
    toast.error('Please check this field', message);
    return;
  }
  el.setCustomValidity(message);
  el.reportValidity();
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  // Clear on the next edit anywhere in the form: the fix may be in another
  // field (e.g. changing your own phone when the emergency number matched it).
  const target = el.form || el;
  const clear = () => {
    el.setCustomValidity('');
    target.removeEventListener('input', clear);
    target.removeEventListener('change', clear);
  };
  target.addEventListener('input', clear);
  target.addEventListener('change', clear);
};

// Runs [fieldName, errorMessage] checks in order and flags the first problem.
// Returns true when everything passed.
export const checkFields = (form, checks) => {
  for (const [name, message] of checks) {
    if (message) {
      flagField(form, name, message);
      return false;
    }
  }
  return true;
};
