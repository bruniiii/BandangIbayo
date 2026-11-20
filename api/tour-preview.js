// ─────────────────────────────────────────────
// LINK PREVIEW FOR ONE TOUR (/tours/:id)
// Facebook, Messenger, WhatsApp and other link-preview bots don't run the
// site's JavaScript, so they'd only see the site-wide preview. vercel.json
// sends those bots (only them, by their user agent) here: a tiny page with
// the tour's title, place, date, price and first photo. People opening the
// link get the normal site.
// ─────────────────────────────────────────────

const SUPABASE_URL = 'https://renugdlntgybazpikmbu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IaplUePHeDyuIpofBrNPTA_PRaBA-AR'; // the public key (same as src/supabaseClient.js)
const SITE = 'https://www.bandangibayo.website';
const DEFAULT_IMAGE = `${SITE}/og-image.jpg`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n) => (Number(n) > 0 ? `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 })}` : '');
const day = (d) => (d ? new Date(`${d}T00:00:00+08:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : '');

export const fetchTour = async (id) => {
  if (!/^[\w-]{1,64}$/.test(String(id || ''))) return null;
  const url = `${SUPABASE_URL}/rest/v1/tours?id=eq.${encodeURIComponent(id)}&select=title,destination,start_date,price,image_urls,description,is_archived&limit=1`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] && !rows[0].is_archived ? rows[0] : null;
};

export const previewHtml = (id, tour) => {
  const link = `${SITE}/tours/${encodeURIComponent(id)}`;
  const title = tour ? `${tour.title} · Bandang IBAYO` : 'Bandang IBAYO · Group tours across the Philippines';
  const bits = tour ? [tour.destination, day(tour.start_date), peso(tour.price) && `${peso(tour.price)} per joiner`].filter(Boolean).join(' · ') : '';
  const about = tour?.description ? String(tour.description).replace(/\s+/g, ' ').slice(0, 160) : 'Join group tours across the Philippines. Share the ride, split the cost, and discover more places.';
  const description = bits ? `${bits}. ${about}` : about;
  const image = (tour?.image_urls || []).find((u) => /^https:\/\//.test(u)) || DEFAULT_IMAGE;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Bandang IBAYO">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(link)}"><meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">
<link rel="canonical" href="${esc(link)}">
</head><body><a href="${esc(link)}">${esc(title)}</a></body></html>`;
};

export default async function handler(req, res) {
  const id = req.query?.id;
  let tour = null;
  try { tour = await fetchTour(id); } catch { tour = null; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(previewHtml(id, tour));
}
