import { Star, Quote, MapPin } from 'lucide-react';

// One joiner review, as shown on the landing page and the joiner homepage
// (data from usePublicReviews in publicReviews.js).

const Stars = ({ rating, size = 14 }) => (
  <span aria-label={`${rating} out of 5 stars`} style={{ display: 'inline-flex', gap: 2 }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={size} fill={n <= rating ? '#E8A265' : 'none'} color={n <= rating ? '#E8A265' : 'rgba(122,58,24,0.35)'} />
    ))}
  </span>
);

const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const monthYear = (iso) => (iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : '');

export const ReviewCard = ({ review, compact = false }) => (
  <article style={{
    background: '#FDF6EE', borderRadius: compact ? 18 : 22, padding: compact ? '1.1rem 1.2rem' : '1.5rem',
    border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 18px rgba(26,10,0,0.05)',
    display: 'flex', flexDirection: 'column', gap: compact ? 10 : 14, height: '100%', boxSizing: 'border-box',
  }}>
    {!compact && review.photo_url && (
      <img src={review.photo_url} alt="" loading="lazy" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 14 }} />
    )}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <Stars rating={review.rating} size={compact ? 13 : 15} />
      <Quote size={compact ? 18 : 22} style={{ color: 'rgba(180,81,30,0.3)' }} />
    </div>
    <p style={{
      fontSize: compact ? 13 : 14.5, fontWeight: 500, color: '#1A0A00', margin: 0, lineHeight: 1.65, flex: 1,
      display: '-webkit-box', WebkitLineClamp: compact ? 3 : 5, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    }}>
      “{review.comment}”
    </p>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {review.reviewer_avatar ? (
        <img src={review.reviewer_avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: '50%', background: '#1A0A00', color: '#E8A265', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, flexShrink: 0 }}>
          {initials(review.reviewer_name)}
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{review.reviewer_name}</p>
        <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: 0, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <MapPin size={11} style={{ flexShrink: 0 }} />
          {review.tour_title || review.tour_destination || 'Bandang IBAYO tour'}{review.created_at ? ` · ${monthYear(review.created_at)}` : ''}
        </p>
      </div>
    </div>
  </article>
);
