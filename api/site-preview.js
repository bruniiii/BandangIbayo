// ─────────────────────────────────────────────
// LINK PREVIEW FOR THE WEBSITE (/ and /tours)
// What Facebook, Messenger and other link-preview bots show when someone
// shares the website: the title, text and photo from System Maintenance →
// Home Page & Banner → Link preview (get_share_preview). vercel.json sends
// only those bots here (by their user agent); people get the normal site.
// Nothing saved yet → the same preview as index.html.
// ─────────────────────────────────────────────

const SUPABASE_URL = 'https://renugdlntgybazpikmbu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_IaplUePHeDyuIpofBrNPTA_PRaBA-AR'; // the public key (same as src/supabaseClient.js)
const SITE = 'https://www.bandangibayo.website';

export const DEFAULT_PREVIEW = Object.freeze({
  title: 'Bandang IBAYO · Group tours across the Philippines',
  description: 'Join group tours across the Philippines. Share the ride, split the cost, and discover more places.',
  image_url: `${SITE}/og-image.jpg`,
});

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fetchPreview = async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_share_preview`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return {};
  const data = await res.json();
  return data && typeof data === 'object' ? data : {};
};

export const sitePreviewHtml = (path, saved = {}) => {
  const p = path === '/tours' ? '/tours' : '/';
  const title = (typeof saved.title === 'string' && saved.title.trim()) || DEFAULT_PREVIEW.title;
  const description = (typeof saved.description === 'string' && saved.description.trim()) || DEFAULT_PREVIEW.description;
  const image = (typeof saved.image_url === 'string' && /^https:\/\//.test(saved.image_url) && saved.image_url) || DEFAULT_PREVIEW.image_url;
  const link = `${SITE}${p}`;
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
  let saved = {};
  try { saved = await fetchPreview(); } catch { saved = {}; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(sitePreviewHtml(req.query?.path, saved));
}
