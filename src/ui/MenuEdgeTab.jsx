import { ChevronRight } from 'lucide-react';

// Phones and tablets: a small tab stuck to the left edge of the screen that
// opens the sidebar menu, so it's reachable without scrolling back to the
// top. Styled like the menu's orange close button.
const MenuEdgeTab = ({ onOpen }) => (
  <button
    type="button"
    className="menu-edge-tab no-touch-size"
    onClick={onOpen}
    aria-label="Open menu"
    title="Open menu"
    style={{
      position: 'fixed', left: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 90,
      width: 24, height: 56, padding: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#B4511E', color: '#FDF6EE', cursor: 'pointer',
      border: '3px solid #EDEAE3', borderLeft: 'none', borderRadius: '0 16px 16px 0',
      boxShadow: '0 4px 14px rgba(26,10,0,0.3)',
    }}
  >
    <ChevronRight size={16} strokeWidth={3} />
  </button>
);

export default MenuEdgeTab;
