import { lazy } from 'react';
import { Link, useLocation } from 'react-router-dom';
import LandingPremium from './LandingPremium';

// ─────────────────────────────────────────────
// The landing page, and the new looks to try (preview only).
//   /                 → the current page (LandingPremium)
//   /?look=tropical   → Bright & Tropical    /?look=magazine → Travel Magazine
//   /?look=dark       → Dark + Photos        /?look=light    → Dark + Photos, lighter
//   /?look=fiesta     → Bold Filipino
// A bar at the bottom switches between them while previewing.
// ─────────────────────────────────────────────

const LandingLooks = lazy(() => import('./LandingLooks'));
const NAMES = [['', 'Current'], ['tropical', '1 · Bright & Tropical'], ['magazine', '2 · Travel Magazine'], ['dark', '3 · Dark + Photos'], ['light', '3b · Lighter'], ['fiesta', '4 · Bold Filipino']];

const LandingSwitch = () => {
  const look = new URLSearchParams(useLocation().search).get('look') || '';
  if (!NAMES.some(([k]) => k && k === look)) return <LandingPremium />;
  return (
    <>
      <LandingLooks look={look} />
      <nav aria-label="Preview a look" style={{
        position: 'fixed', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 60, display: 'flex', gap: 4, padding: 5, maxWidth: 'calc(100vw - 110px)', overflowX: 'auto',
        borderRadius: 999, background: 'rgba(20,16,12,0.88)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', fontFamily: 'Outfit, system-ui, sans-serif',
      }}>
        {NAMES.map(([k, name]) => (
          <Link key={k || 'current'} to={k ? `/?look=${k}` : '/'} aria-current={k === look ? 'page' : undefined} style={{
            whiteSpace: 'nowrap', textDecoration: 'none', fontSize: 12.5, fontWeight: 800, padding: '8px 13px', borderRadius: 999,
            background: k === look ? '#FFFFFF' : 'transparent', color: k === look ? '#1A1410' : '#FFFFFF',
          }}>{name}</Link>
        ))}
      </nav>
    </>
  );
};

export default LandingSwitch;
