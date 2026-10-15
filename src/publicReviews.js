import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// JOINER REVIEWS for the landing page and the joiner homepage.
// public_reviews() works for logged-out visitors too and only shares the
// reviewer's first name + last initial. Recent 4–5★ reviews with a
// comment are returned. null while loading.
// ─────────────────────────────────────────────

export const usePublicReviews = (limit = 6) => {
  const [reviews, setReviews] = useState(null);   // null = loading
  useEffect(() => {
    let cancelled = false;
    supabase.rpc('public_reviews', { p_limit: limit, p_min_rating: 4 }).then(({ data, error }) => {
      if (!cancelled) setReviews(error ? [] : data || []);
    });
    return () => { cancelled = true; };
  }, [limit]);
  return reviews;
};
