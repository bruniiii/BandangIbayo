import adminLogo from '../assets/adminLogo.png';

// Bandang IBAYO's picture wherever the agency (or an admin) appears: the
// round "Bandang Ibayo - Leave No Trace" logo.
const BrandAvatar = ({ size = 36, radius = '50%', style }) => (
  <span
    aria-hidden="true"
    style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0, overflow: 'hidden',
      background: '#1A0A00', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}
  >
    <img src={adminLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  </span>
);

export default BrandAvatar;
