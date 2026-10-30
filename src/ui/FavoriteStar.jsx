import { Star } from 'lucide-react';
import { useFavorites, isFavorite, toggleFavorite } from '../favorites';

// The star on a tour card: tap to add the tour to (or remove it from) Favorites.
const FavoriteStar = ({ trip, size = 36, style }) => {
  const { ids } = useFavorites();
  const on = isFavorite(ids, trip);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleFavorite(trip); }}
      aria-pressed={on}
      aria-label={on ? `Remove ${trip.title} from Favorites` : `Add ${trip.title} to Favorites`}
      title={on ? 'Remove from Favorites' : 'Add to Favorites'}
      style={{
        width: size, height: size, borderRadius: '50%', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: on ? '#B4511E' : 'rgba(253,246,238,0.92)', color: on ? '#FDF6EE' : '#A8481A',
        boxShadow: '0 4px 14px rgba(26,10,0,0.22)', transition: 'transform 0.15s, background 0.15s',
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
