import { useEffect, useRef } from 'react';
import { Star } from 'lucide-react';
import { useFavorites, isFavorite, toggleFavorite } from '../favorites';

// The star on a tour card: tap to add the tour to (or remove it from) Favorites.
const FavoriteStar = ({ trip, size = 36, style }) => {
  const { ids } = useFavorites();
  const on = isFavorite(ids, trip);
  // Pops once when added (index.css .fx-pop-once); not on first show.
  const ref = useRef(null);
  const was = useRef(on);
  useEffect(() => {
    const el = ref.current;
    if (on && !was.current && el) { el.classList.remove('fx-pop-once'); void el.offsetWidth; el.classList.add('fx-pop-once'); }
    was.current = on;
  }, [on]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleFavorite(trip); }}
      aria-pressed={on}
      aria-label={on ? `Remove ${trip.title} from Favorites` : `Add ${trip.title} to Favorites`}
      title={on ? 'Remove from Favorites' : 'Add to Favorites'}
      style={{
        width: size, height: size, borderRadius: '50%', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: on ? 'var(--ib-accent, #B4511E)' : 'rgba(var(--ib-cream-rgb, 253,246,238), 0.92)', color: on ? 'var(--ib-on-accent, #FDF6EE)' : 'var(--ib-sienna, #A8481A)',
        boxShadow: '0 4px 14px rgba(var(--ib-shadow-rgb, 26,10,0), 0.22)', transition: 'transform 0.15s, background 0.15s',
        ...style,
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.9)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'none'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
    >
      <Star size={Math.round(size * 0.47)} fill={on ? 'currentColor' : 'none'} strokeWidth={2.2} />
    </button>
  );
};

export default FavoriteStar;
