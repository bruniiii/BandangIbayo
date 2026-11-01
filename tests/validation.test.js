import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/supabaseClient', () => ({ supabase: {}, currentUser: async () => null }));
const { normalizePhone, phoneError, formatPhPhone, paymongoPhone, nameError, fullNameError, emailError, emailSuggestion, usernameError } = await import('../src/validation');
const { formatDateRange, formatPeso, safeNextPath, cancellationDeadline } = await import('../src/tourUtils');

describe('phone numbers', () => {
  it('accepts Philippine mobile and landline numbers', () => {
    expect(normalizePhone('0917 123 4567')).toBe('09171234567');
    expect(normalizePhone('+63 917 123 4567')).toBe('09171234567');
    expect(normalizePhone('(02) 8123 4567')).toBe('0281234567');
    expect(phoneError('12345')).not.toBe('');
    expect(phoneError('0281234567', 'Phone', { mobile: true })).toMatch(/mobile/);
  });
  it('shows and sends numbers the right way', () => {
    expect(formatPhPhone('09171234567')).toBe('+63 917 123 4567');
    expect(paymongoPhone('0917-123-4567')).toBe('+639171234567');
    expect(paymongoPhone('0281234567')).toBeNull();
  });
});

describe('names, email, username', () => {
  it('checks names', () => {
    expect(nameError('Juan')).toBe('');
    expect(nameError('Juan2')).toMatch(/numbers/);
    expect(fullNameError('Juan')).toMatch(/first and last/);
    expect(fullNameError('María Dela Cruz')).toBe('');
  });
  it('checks emails and spots typos', () => {
    expect(emailError('juan@gmail.com')).toBe('');
    expect(emailError('juan@gmail')).not.toBe('');
    expect(emailSuggestion('juan@gmial.com')).toBe('juan@gmail.com');
  });
  it('checks usernames', () => {
    expect(usernameError('juan_dc')).toBe('');
    expect(usernameError('a@b.com')).toMatch(/email/);
  });
});

describe('tour helpers', () => {
  it('writes date ranges with weekdays', () => {
    expect(formatDateRange('2026-11-06', '4 Days')).toBe('Nov 6 - 9, 2026 (Fri – Mon)');
    expect(formatDateRange('2026-11-28', '1 Day')).toBe('Nov 28, 2026 (Sat)');
  });
  it('writes pesos and keeps redirects inside the site', () => {
    expect(formatPeso(2900)).toBe('₱2,900.00');
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
    expect(safeNextPath('//evil.com')).toBeNull();
  });
  it('closes cancellations 14 days before the tour', () => {
    expect(cancellationDeadline('2026-11-28')).toBe('2026-11-14');
  });
});
