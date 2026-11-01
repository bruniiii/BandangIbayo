import { describe, it, expect, vi } from 'vitest';

// A tiny pretend database for the lookups.
const db = {
  tours: [{ id: 1, title: 'Mt. Ulap Eco-Trail', start_date: '2026-11-28' }, { id: 2, title: 'Mt. Ulap Eco-Trail', start_date: '2027-01-30' },
    { id: 3, title: 'Mt. Daraitan Overnight Camp', start_date: '2026-11-03' }, { id: 4, title: 'Mt. Daraitan & Tinipak River', start_date: '2026-12-05' }],
  bookings: [
    { id: 'a', tour_id: 1, full_name: 'Isabella Sabado', booking_number: 'BK-2026-00115', created_at: '2026-11-01T10:00:00Z' },
    { id: 'b', tour_id: 2, full_name: 'Isabella Sabado', created_at: '2026-11-01T17:10:00Z' },
    { id: 'd', tour_id: 3, full_name: 'Isabella Sabado', created_at: '2026-11-01T17:45:00Z' },
    { id: 'e', tour_id: 4, full_name: 'Isabella Sabado', created_at: '2026-11-01T17:46:00Z' },
  ],
  feed_posts: [{ id: 7, author_id: 'u1', created_at: '2026-10-31T12:00:00Z', status: 'Approved' }, { id: 8, author_id: 'u2', created_at: '2026-10-31T12:01:00Z', status: 'Pending' }],
  profiles: [{ id: 'u1', first_name: 'Chi', last_name: 'Chi' }, { id: 'u2', first_name: 'Ana', last_name: 'Reyes' }],
};
vi.mock('../src/supabaseClient', () => {
  const from = (t) => {
    let rows = [...db[t]];
    const q = {
      select: () => q, order: () => q, limit: () => q,
      eq: (k, v) => { rows = rows.filter((r) => String(r[k]) === String(v)); return q; },
      in: (k, v) => { rows = rows.filter((r) => v.includes(r[k])); return q; },
      gte: (k, v) => { rows = rows.filter((r) => r[k] >= v); return q; },
      lte: (k, v) => { rows = rows.filter((r) => r[k] <= v); return q; },
      then: (resolve) => resolve({ data: rows }),
    };
    return q;
  };
  return { supabase: { from }, currentUser: async () => null };
});

const { bookingForNotification, postForNotification, tourForNotification } = await import('../src/notificationTarget');

describe('which booking a notification opens', () => {
  it('uses the booking saved with the notification first', async () => {
    expect((await bookingForNotification({ ref: 'booking:e', message: 'Isabella booked Mt. Ulap' })).id).toBe('e');
  });
  it('uses the booking number in the text', async () => {
    expect((await bookingForNotification({ message: 'Payment for BK-2026-00115 went through' })).id).toBe('a');
  });
  it('without either: the right tour date and person, closest in time', async () => {
    const n = { message: 'Isabella Sabado booked Mt. Ulap Eco-Trail (2 pax) and paid online.', created_at: '2026-11-01T17:12:00Z' };
    expect((await bookingForNotification(n)).id).toBe('b');
    const m = { message: 'Isabella Sabado booked Mt. Daraitan Overnight Camp (1 pax).', created_at: '2026-11-01T17:47:00Z' };
    expect((await bookingForNotification(m)).id).toBe('d');
  });
});

describe('which post / tour a notification opens', () => {
  it('uses the saved post, else the person and time', async () => {
    expect((await postForNotification({ ref: 'post:8', message: 'Chi Chi shared a post' })).id).toBe(8);
    expect((await postForNotification({ message: 'Chi Chi shared a post', created_at: '2026-10-31T12:00:01Z' })).id).toBe(7);
  });
  it('picks the longest matching tour name and the dated one', async () => {
    expect((await tourForNotification({ message: 'Reminder: Mt. Daraitan & Tinipak River on Dec 05' })).id).toBe(4);
    expect((await tourForNotification({ message: 'Mt. Ulap Eco-Trail on Jan 30' })).id).toBe(2);
  });
});
