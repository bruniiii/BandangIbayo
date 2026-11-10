// Previous / Page x of y / Next under a list. Hidden when everything fits on one page.
const pageBtn = (disabled) => ({
  height: 36, padding: '0 14px', borderRadius: 12, border: '1px solid rgba(180,81,30,0.3)', background: 'transparent',
  color: '#5C2A10', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
});

const Pager = ({ page, pages, onPage, style }) => {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14, ...style }}>
      <button type="button" style={pageBtn(page <= 1)} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span style={{ fontSize: 12, fontWeight: 800, color: '#5C2A10' }}>Page {page} of {pages}</span>
      <button type="button" style={pageBtn(page >= pages)} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
};

export default Pager;
