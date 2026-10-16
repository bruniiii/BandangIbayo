// The title at the top of every dashboard page (joiner and admin): the
// page's sidebar icon in a dark square, the page name and one line about it.
// Same font and size on every page.
const PageHeader = ({ icon, title, subtitle }) => {
  const Icon = icon;
  return (
  <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
    <div aria-hidden="true" style={{
      width: 38, height: 38, borderRadius: 11, background: '#1A0A00', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8A265',
    }}>
      <Icon size={18} />
    </div>
    <div style={{ minWidth: 0 }}>
      <h1 style={{ fontSize: 18, letterSpacing: '-0.01em', color: '#1A0A00', margin: 0, lineHeight: 1.2 }}>{title}</h1>
      {subtitle && (
        <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: '2px 0 0' }}>{subtitle}</p>
      )}
    </div>
  </div>
  );
};

export default PageHeader;
