import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Dashboard pages (tabs) as browser history steps with their own address:
// /dashboard/messages, /dashboard/my-bookings, /admin/dashboard/tracking-management…
// Opening a page adds a step, so the browser's Back button goes to the
// previous page instead of leaving the dashboard, and an address opened
// directly (a bookmark, a refresh, a shared link) opens that page.

// "Tracking Management" → "tracking-management", "HomePage" → "homepage".
export const tabSlug = (label) => String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The page named in the address (/dashboard/<page>), if it's one of these.
export const tabFromUrl = (base, labels) => {
  const { pathname } = window.location;
  if (!pathname.startsWith(base)) return null;
  const slug = pathname.slice(base.length).replace(/^\/+|\/+$/g, '');
  return labels.find((l) => tabSlug(l) === slug) || null;
};

//   base: '/dashboard' or '/admin/dashboard'; labels: the dashboard's pages.
export const useTabHistory = (activeTab, setActiveTab, fallback, { base, labels } = {}) => {
  const navigate = useNavigate();

  // A page was opened: show its address and add a history step for it (only
  // when the current step isn't already that page, e.g. right after Back).
  useEffect(() => {
    const saved = window.history.state?.usr;
    const { pathname, search, hash } = window.location;
    const path = base ? `${base}/${tabSlug(activeTab)}` : pathname;
    if (saved?.tab === activeTab && pathname === path) return;
    // First page of this visit: replace the current entry (keeping its ?…, e.g.
    // coming back from PayMongo). Later pages: add one.
    const first = !saved?.tab;
    navigate(`${path}${first ? search + hash : ''}`, { replace: first, state: { ...(saved || {}), tab: activeTab } });
  }, [activeTab, navigate, base]);

  // Back / Forward: show the page saved in that history step (or named in its address).
  useEffect(() => {
    const onBack = () => setActiveTab(window.history.state?.usr?.tab || (base && labels ? tabFromUrl(base, labels) : null) || fallback);
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, [setActiveTab, fallback, base, labels]);
};
