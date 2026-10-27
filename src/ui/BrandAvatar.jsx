import logoIcon from '../assets/newIcon.png';

// Bandang IBAYO's picture wherever the agency (or an admin) appears: the logo
// on the dark brand background.
const BrandAvatar = ({ size = 36, radius = '50%', style }) => (
  <span
    aria-hidden="true"
    style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0, overflow: 'hidden',
      background: '#1A0A00', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}
  >
    <img src={logoIcon} alt="" style={{ width: '82%', height: '82%', objectFit: 'contain' }} />
  </span>
);

export default BrandAvatar;
