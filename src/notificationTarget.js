import { supabase, currentUser } from './supabaseClient';

/* Works out which booking or tour a notification is about, so clicking it
   opens that exact item. Uses the item saved with the notification (ref) or
   related_id when it has one, and otherwise the booking number
   (BK-2026-00115) or the tour name in its text, so older notifications open
   the right item too. */

const BOOKING_NUMBER = /BK-\d{4}-\d+/i;
const BOOKING_COLS = 'id, tour_id, user_id, booking_status, payment_status, created_at';
const textOf = (n) => `${n?.title || ''} ${n?.message || ''}`;

// The exact item saved with the notification (20261203): 'booking:<id>' / 'post:<id>'.
const refOf = (n, kind) => {
  const m = String(n?.ref || '').match(/^(\w+):(.+)$/);
  return m && m[1] === kind ? m[2] : null;
};

export const bookingForNotification = async (n) => {
  const refId = refOf(n, 'booking');
  if (refId) {
    const { data } = await supabase.from('bookings').select(BOOKING_COLS).eq('id', refId).limit(1);
    if (data?.[0]) return data[0];
  }
  const number = textOf(n).match(BOOKING_NUMBER)?.[0]?.toUpperCase();
  if (number) {
    const { data } = await supabase.from('bookings').select(BOOKING_COLS).eq('booking_number', number).limit(1);
    if (data?.[0]) return data[0];
  }
  if (n?.related_id) {
    const { data } = await supabase.from('bookings').select(BOOKING_COLS).eq('id', n.related_id).limit(1);
    if (data?.[0]) return data[0];
  }
  return bookingByTourAndName(n);
};

// Notices without a booking number ("Isabella Sabado booked Mt. Ulap (2 pax)
// and paid online."): the booking on the tour named in the text, made by the
// person named in it, closest in time to the notice.
const bookingByTourAndName = async (n) => {
  const text = textOf(n).toLowerCase();
  const { data: tours } = await supabase.from('tours').select('id, title').limit(1000);
  const hits = (tours || []).filter((t) => t?.title && text.includes(t.title.toLowerCase()));
  if (!hits.length) return null;
  const longest = Math.max(...hits.map((t) => t.title.length));
  const ids = hits.filter((t) => t.title.length === longest).map((t) => t.id);
  const { data } = await supabase.from('bookings').select(`${BOOKING_COLS}, full_name`)
    .in('tour_id', ids).order('created_at', { ascending: false }).limit(500);
  const named = (data || []).filter((b) => {
    const name = String(b.full_name || '').trim().toLowerCase();
    return name && name !== 'n/a' && text.includes(name);
  });
  const list = named.length ? named : (data || []);
  if (!list.length) return null;
  const at = new Date(n?.created_at || Date.now()).getTime();
  return [...list].sort((a, b) => Math.abs(new Date(a.created_at) - at) - Math.abs(new Date(b.created_at) - at))[0];
};

// Admins: the feed post a "New post to review" notice is about (the post by
// the person named in it, made closest in time to the notice).
export const postForNotification = async (n) => {
  const refId = refOf(n, 'post');
  if (refId) {
    const { data } = await supabase.from('feed_posts').select('id, author_id, created_at, status').eq('id', refId).limit(1);
    if (data?.[0]) return data[0];
  }
  const at = new Date(n?.created_at || Date.now()).getTime();
  const from = new Date(at - 10 * 60 * 1000).toISOString();
  const to = new Date(at + 2 * 60 * 1000).toISOString();
  const { data } = await supabase.from('feed_posts').select('id, author_id, created_at, status')
    .gte('created_at', from).lte('created_at', to).limit(50);
  if (!data?.length) return null;
  const authorIds = [...new Set(data.map((p) => p.author_id).filter(Boolean))];
  const { data: people } = authorIds.length
    ? await supabase.from('profiles').select('id, first_name, last_name, username').in('id', authorIds)
    : { data: [] };
  const text = textOf(n).toLowerCase();
  const nameOf = (id) => {
    const p = (people || []).find((x) => x.id === id);
    return p ? [`${p.first_name || ''} ${p.last_name || ''}`.trim(), p.username].filter(Boolean).map((x) => x.toLowerCase()) : [];
  };
  const named = data.filter((p) => nameOf(p.author_id).some((w) => text.includes(w)));
  const list = named.length ? named : data;
  return [...list].sort((a, b) => Math.abs(new Date(a.created_at) - at) - Math.abs(new Date(b.created_at) - at))[0];
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "2026-11-05" → ["nov 05", "nov 5"], the ways a date is written in notifications.
const dateWords = (iso) => {
  const [, m, d] = String(iso || '').split('-').map(Number);
  if (!m || !d) return [];
  const mon = MONTHS[m - 1].toLowerCase();
  return [`${mon} ${String(d).padStart(2, '0')}`, `${mon} ${d}`];
};

// Picks the tour named in the text. The longest matching name wins (so
// "Mt. Pulag (Ambangeg Trail)" beats "Mt. Pulag"); among dates of the same
// tour, the one whose date is in the text, else the next upcoming one.
const pickTour = (tours, n) => {
  const text = textOf(n).toLowerCase();
  const hits = (tours || []).filter((t) => t?.title && text.includes(t.title.toLowerCase()));
  if (!hits.length) return null;
  const longest = Math.max(...hits.map((t) => t.title.length));
  const same = hits.filter((t) => t.title.length === longest);
  const dated = same.find((t) => dateWords(t.start_date).some((w) => text.includes(w)));
  if (dated) return dated;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = same.filter((t) => String(t.start_date) >= today).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  return upcoming[0] || same[0];
};

export const tourForNotification = async (n) => {
  if (n?.related_id) {
    const { data } = await supabase.from('tours').select('id, title, start_date').eq('id', n.related_id).limit(1);
    if (data?.[0]) return data[0];
  }
  const { data } = await supabase.from('tours').select('id, title, start_date').order('start_date', { ascending: false }).limit(1000);
  return pickTour(data, n);
};

// Joiners: their own booking the notification is about, by booking number,
// related_id, or the tour named in it.
export const myBookingForNotification = async (n) => {
  const direct = await bookingForNotification(n);
  if (direct) return direct;
  const user = await currentUser();
  if (!user) return null;
  const { data } = await supabase.from('bookings').select(`${BOOKING_COLS}, tours(id, title, start_date)`)
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
  const tour = pickTour((data || []).map((b) => b.tours), n);
  return tour ? (data || []).find((b) => b.tours?.id === tour.id) || null : null;
};
