// The title at the top of every dashboard page (joiner and admin): the
// page's sidebar icon in a dark "passport stamp", the page name with a
// brush-stroke underline, and one handwritten line about it (index.css:
// the travel-journal touches).
const PageHeader = ({ icon, title, subtitle }) => {
  const Icon = icon;
  return (
  <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
    <div aria-hidden="true" className="journal-stamp" style={{
      width: 38, height: 38, borderRadius: 11, background: 'var(--ib-ink, #1A0A00)', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ib-amber, #E8A265)',
    }}>
      <Icon size={18} />
    </div>
    <div style={{ minWidth: 0 }}>
      <h1 className="journal-title" style={{ fontSize: 18, letterSpacing: '-0.01em', color: 'var(--ib-dark, #1A0A00)', margin: 0, lineHeight: 1.2 }}>{title}</h1>
      {subtitle && (
        <p className="page-header-subtitle journal-hand" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1, color: 'var(--ib-sienna, #A8481A)', margin: '3px 0 0' }}>{subtitle}</p>
      )}
    </div>
  </div>
  );
};

export default PageHeader;
