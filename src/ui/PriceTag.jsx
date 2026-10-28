import { formatPeso, salePriceOf, tripOnSale, tripAllOnSale, SALE_DISCOUNT } from '../tourUtils';

// A tour's price. On sale: the old price crossed out next to the sale price,
// and a SALE badge ("on select dates" when only some of a trip's dates are on sale).
// `tour` can be one tour date or a trip with `dates`.
const PriceTag = ({ tour, size = 15, color = '#A8481A', mutedColor = 'rgba(122,58,24,0.75)', showBadge = true, align = 'flex-end', style }) => {
  const price = Number(tour?.price || 0);
  if (!tripOnSale(tour)) {
    return <span style={{ fontSize: size, fontWeight: 900, color, whiteSpace: 'nowrap', ...style }}>{formatPeso(price)}</span>;
  }
  const some = !tripAllOnSale(tour);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: align, gap: 2, ...style }}>
      {showBadge && (
        <span style={{
          background: '#8C2F1C', color: '#FDF6EE', borderRadius: 999, padding: '2px 8px',
          fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          Sale {Math.round(SALE_DISCOUNT * 100)}% off{some ? ' · select dates' : ''}
        </span>
      )}
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: Math.max(11, Math.round(size * 0.72)), fontWeight: 700, color: mutedColor, textDecoration: 'line-through' }}>{formatPeso(price)}</span>
        <span style={{ fontSize: size, fontWeight: 900, color }}>{formatPeso(salePriceOf(price))}</span>
      </span>
    </span>
  );
};

export default PriceTag;
