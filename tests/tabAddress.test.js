import { describe, it, expect, vi } from 'vitest';
import { tabSlug, tabFromUrl } from '../src/useTabHistory';

describe('dashboard page addresses', () => {
  it('makes a short address from each page name', () => {
    expect(tabSlug('Tracking Management')).toBe('tracking-management');
    expect(tabSlug('HomePage')).toBe('homepage');
    expect(tabSlug('Request a Tour')).toBe('request-a-tour');
  });
  it('opens the page named in the address', () => {
    const labels = ['HomePage', 'Messages', 'My Bookings'];
    vi.stubGlobal('window', { location: { pathname: '/dashboard/my-bookings' } });
    expect(tabFromUrl('/dashboard', labels)).toBe('My Bookings');
    vi.stubGlobal('window', { location: { pathname: '/dashboard' } });
    expect(tabFromUrl('/dashboard', labels)).toBe(null);
    vi.stubGlobal('window', { location: { pathname: '/dashboard/nope' } });
    expect(tabFromUrl('/dashboard', labels)).toBe(null);
  });
});
