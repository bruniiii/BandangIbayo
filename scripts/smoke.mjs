// ─────────────────────────────────────────────
// SMOKE TEST: opens every joiner and admin page while "logged in", and fails
// if a page crashes, shows "Something went wrong", or shows an error message.
//
// No real database or account is used: a fake sign-in is saved in the
// browser and every request to Supabase gets sample data back (below). So it
// checks that each page loads and draws, not that the data is right.
//
//   npm run build && npm run smoke            (or: npm run smoke -- --shots)
//   --shots  also saves a screenshot of each page in smoke-shots/
//
// Runs on the built site (vite preview). Uses Playwright's Chromium.
// ─────────────────────────────────────────────
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.argv.includes('--shots');
const PROJECT = 'renugdlntgybazpikmbu';

// ── Sample data ──
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const now = new Date().toISOString();
const JOINER = { id: '11111111-1111-4111-8111-111111111111', email: 'joiner@example.com' };
const ADMIN = { id: '22222222-2222-4222-8222-222222222222', email: 'admin@example.com' };
const PHOTO = '/tour-placeholder.webp';
const tour = (id, title, startIn, extra = {}) => ({
  id, title, destination: 'Itogon, Benguet', start_date: day(startIn), end_date: day(startIn + 1), duration: '2 Days, 1 Night',
  group_size: 14, price: 2500, regular_rate: 2000, difficulty: 'Easy', image_urls: [PHOTO], is_archived: false, is_exclusive: false,
  itinerary: 'Day 1\n4:00 AM Meet at Petron', things_to_bring: 'Water\nJacket', inclusions: 'Van\nTour guide\nEnvironmental fee', exclusions: 'Meals', accommodation_options: ['Tent'], created_at: now, ...extra,
});
const TOURS = [tour(101, 'Mt. Ulap Eco-Trail', 8), tour(102, 'Anawangin Cove Camping', 15), tour(103, 'Mt. Pulag Ambangeg', 22), tour(104, 'Baler Surf Weekend', -10, { is_archived: false })];
const profile = (u, role, extra = {}) => ({
  id: u.id, email: u.email, first_name: role === 'admin' ? 'Ana' : 'Mia', last_name: 'Cruz', username: role === 'admin' ? 'ana' : 'mia', role,
  is_main_admin: role === 'admin', phone: '09171234567', created_at: now, terms_version: 999, terms_accepted_at: now, birthdate: '1998-05-01',
  address_region: 'NCR', address_city: 'Quezon City', emergency_contact_name: 'Rey Cruz', emergency_contact_phone: '09170000000', ...extra,
});
const BOOKINGS = [
  { id: 501, booking_number: 'BK-2026-00501', user_id: JOINER.id, tour_id: 101, tours: TOURS[0], full_name: 'Mia Cruz', slots_booked: 2, total_price: 5000, amount_paid: 2500,
    payment_method: 'Downpayment', payment_status: 'Complete', booking_status: 'Confirmed', balance_settled: false, pickup_point: 'Petron Balintawak', created_at: now },
  { id: 502, booking_number: 'BK-2026-00502', user_id: JOINER.id, tour_id: 104, tours: TOURS[3], full_name: 'Mia Cruz', slots_booked: 1, total_price: 2500, amount_paid: 2500,
    payment_method: 'Full', payment_status: 'Complete', booking_status: 'Completed', balance_settled: true, created_at: now },
];
const TABLES = {
  tours: TOURS,
  bookings: BOOKINGS,
  reviews: [{ id: 1, rating: 5, comment: 'Great trip, very organized!', created_at: now, user_id: JOINER.id, tour_id: 104, tours: { title: TOURS[3].title } }],
  notifications: [{ id: 1, user_id: JOINER.id, title: 'Payment confirmed', message: 'Your booking is confirmed.', type: 'payment', is_read: false, created_at: now }],
  tour_meetups: [{ id: 1, tour_id: 101, location_name: 'Petron Balintawak', scheduled_time: '4:00 AM', status: 'UPCOMING', created_at: now }],
  suppliers: [{ id: 1, name: 'Benguet Vans', category: 'Van rental', is_active: true, created_at: now }],
  fleet_drivers: [{ id: 1, name: 'Juan Dela Cruz', contact: '09171234567', is_active: true }],
  fleet_vans: [{ id: 1, car_type: 'Toyota Hiace', plate_number: 'NBT 8921', color: 'White', notes: 'Sticker', seats: 14, is_active: true }],
  destinations: [{ id: 1, name: 'Itogon, Benguet', is_active: true }],
  option_lists: [{ id: 1, list_key: 'cancel_reasons', label: 'Schedule conflict', is_active: true, sort_order: 1 }],
  help_faqs: [{ id: 1, question: 'How do I book?', answer: 'Pick a tour and pay.', is_active: true, sort_order: 1 }],
  admin_activity: [{ id: 1, at: now, admin_name: 'Ana Cruz', table_name: 'tours', action: 'changed', summary: 'Mt. Ulap', changed: ['price'] }],
  system_feedback: [{ id: 1, ease: 5, booking: 4, payment: 5, tracking: 4, overall: 5, comment: 'Love it', created_at: now }],
  feed_posts: [], exclusive_requests: [], tour_favorites: [], app_settings: [], tour_vehicles: [], site_policies: [],
};
const SINGLE = {
  profiles: null, // per scenario
  booking_rules: { id: 1 },
};

// What Supabase answers. role: 'joiner' | 'admin'
const answer = (role, url, method, accept) => {
  const u = new URL(url);
  const path = u.pathname;
  const user = role === 'admin' ? ADMIN : JOINER;
  if (path.startsWith('/auth/v1/user')) return { json: { ...user, aud: 'authenticated', role: 'authenticated' } };
  if (path.startsWith('/auth/v1/')) return { json: {} };
  if (path.startsWith('/functions/v1/') || path.startsWith('/storage/v1/')) return { json: {} };
  if (path.startsWith('/rest/v1/rpc/')) {
    const fn = path.split('/').pop();
    if (fn === 'get_site_content') return { json: { announcement: null, landing: {} } };
    if (fn === 'get_agency_info') return { json: {} };
    if (fn === 'get_maintenance') return { json: { on: false } };
    return { json: [] };
  }
  const table = path.replace('/rest/v1/', '');
  const rows = table === 'profiles' ? [profile(user, role)] : (TABLES[table] || []);
  const one = accept.includes('vnd.pgrst.object');
  if (method === 'HEAD') return { json: null, headers: { 'content-range': `0-0/${rows.length}` } };
  if (method !== 'GET') return { json: one ? rows[0] || {} : rows };
  if (one) return { json: table === 'profiles' ? profile(user, role) : SINGLE[table] ?? rows[0] ?? {} };
  return { json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } };
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sessionFor = (u) => {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', exp })}.sig`;
  return { access_token: token, refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 86400, expires_at: exp, user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated' } };
};

const slug = (l) => l.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const JOINER_PAGES = ['HomePage', 'Feed', 'Explore Tours', 'My Bookings', 'Messages', 'Calendar', 'Tracking', 'Private Tours', 'Request a Tour', 'Reviews', 'Profile Settings', 'Notification']
  .map((l) => [`joiner: ${l}`, `/dashboard/${slug(l)}`, 'joiner']);
const ADMIN_PAGES = ['Overview', 'Feed', 'Tour Management', 'Booking Management', 'Joiner Accounts', 'Private Tours', 'Requested Tours', 'Tracking Management', 'Messages', 'Reports', 'Reviews', 'Notification', 'System Maintenance', 'Admin Settings']
  .map((l) => [`admin: ${l}`, `/admin/dashboard/${slug(l)}`, 'admin']);
const PUBLIC_PAGES = [['public: landing', '/', null], ['public: login', '/login', null], ['public: register', '/register', null], ['public: tours', '/tours', null], ['public: tour detail', '/tours/101', null]];
const PAGES = [...PUBLIC_PAGES, ...JOINER_PAGES, ...ADMIN_PAGES];

// Messages that aren't the page's fault here (no real server).
const IGNORE = /WebSocket|realtime|net::ERR|Failed to load resource|favicon|ERR_CONNECTION|ResizeObserver/i;

// Sends every Supabase request to the sample data, and (for a role) saves a
// fake sign-in in the browser. Also used by other scripts to open pages logged in.
export const signIn = async (context, page, role) => {
  await page.route(/supabase\.co/, (route) => {
    const r = route.request();
    if (!role) return route.fulfill({ json: r.url().includes('/rest/v1/tours') ? TOURS : [] });
    const { json, headers } = answer(role, r.url(), r.method(), r.headers().accept || '');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: headers || {}, body: JSON.stringify(json) });
  });
  if (role) {
    const session = sessionFor(role === 'admin' ? ADMIN : JOINER);
    const who = role === 'admin' ? ADMIN : JOINER;
    // The sign-in, and the first-visit guided tour marked as seen (it would cover the page).
    await context.addInitScript(([key, value, tourKey]) => {
      try { localStorage.setItem(key, value); localStorage.setItem(tourKey, '1'); } catch { /* */ }
    }, [`sb-${PROJECT}-auth-token`, JSON.stringify(session), `ibayo:walkthrough-done:${role}:${who.id}`]);
  }
};

const main = async () => {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (SHOTS) mkdirSync('smoke-shots', { recursive: true });
  const exe = process.env.PW_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const failures = [];
  for (const [name, path, role] of PAGES) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`crash: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
    await signIn(context, page, role);
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) { errors.push(`load: ${e.message.split('\n')[0]}`); }
    await page.waitForTimeout(1500);
    const body = await page.textContent('body').catch(() => '');
    if (/Something went wrong/.test(body)) errors.push('shows "Something went wrong"');
    if (role && /\/login/.test(page.url())) errors.push('sent to the login page (fake sign-in not accepted)');
    const toastErrors = await page.locator('.toast-error').allTextContents().catch(() => []);
    toastErrors.forEach((t) => errors.push(`error message: ${t.trim().slice(0, 160)}`));
    if (SHOTS) await page.screenshot({ path: `smoke-shots/${slug(name)}.png`, fullPage: false });
    console.log(`${errors.length ? '✗' : '✓'} ${name}${errors.length ? `\n    ${errors.join('\n    ')}` : ''}`);
    if (errors.length) failures.push(name);
    await context.close();
  }
  await browser.close();
  server.kill();
  console.log(failures.length ? `\n${failures.length} page(s) failed: ${failures.join(', ')}` : `\nAll ${PAGES.length} pages loaded.`);
  process.exit(failures.length ? 1 : 0);
};

export { BASE, PORT, TOURS };

// Run the test only when this file is run directly (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
