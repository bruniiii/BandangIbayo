import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Dashboard pages (tabs) as browser history steps: opening a page adds a step,
// so the browser's Back button goes to the previous page instead of leaving
// the dashboard (which used to land on the login form). The open page is kept
// in the history entry's state; the address stays the same.
export const useTabHistory = (activeTab, setActiveTab, fallback) => {
  const navigate = useNavigate();

  // A page was opened: add a history step for it (only when the current step
  // isn't already that page, e.g. right after Back).
  useEffect(() => {
    const saved = window.history.state?.usr;
    if (saved?.tab === activeTab) return;
    const { pathname, search, hash } = window.location;
    // First page of this visit: label the current entry. Later pages: add one.
    navigate(`${pathname}${search}${hash}`, { replace: !saved?.tab, state: { ...(saved || {}), tab: activeTab } });
  }, [activeTab, navigate]);

  // Back / Forward: show the page saved in that history step.
  useEffect(() => {
    const onBack = () => setActiveTab(window.history.state?.usr?.tab || fallback);
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, [setActiveTab, fallback]);
};
