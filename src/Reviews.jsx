import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Star, Send, Trash2, Loader2, MapPin, MessageSquare, Image as ImageIcon, Video, X, Calendar } from 'lucide-react';

const displayName = (profile) => {
  if (!profile) return 'A Traveler';
  if (profile.full_name) return profile.full_name;
  const combo = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  return combo || 'A Traveler';
};

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/* Formats a tour's date (or date range, if start/end differ) for display */
const formatTourDate = (startStr, endStr) => {
  if (!startStr) return '';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const start = new Date(startStr);
  if (!endStr || endStr === startStr) return start.toLocaleDateString('en-US', opts);
  const end = new Date(endStr);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = sameMonth
    ? start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : start.toLocaleDateString('en-US', opts);
  const endLabel = end.toLocaleDateString('en-US', opts);
  return `${startLabel} – ${endLabel}`;
};

/* Read-only star display */
const StarRow = ({ rating, size = 14 }) => (
  <div style={{ display: 'flex', gap: 2 }}>
    {[1, 2, 3, 4, 5].map(n => (
      <Star key={n} size={size} fill={n <= rating ? '#E8A265' : 'none'} color={n <= rating ? '#E8A265' : 'rgba(122,58,24,0.3)'} />
    ))}
  </div>
);

/* Interactive star picker */
const StarPicker = ({ value, onChange }) => {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
        >
          <Star size={26} fill={n <= (hover || value) ? '#E8A265' : 'none'} color={n <= (hover || value) ? '#E8A265' : 'rgba(122,58,24,0.3)'} />
        </button>
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────
   REVIEWS  (shared between AdminDashboard & JoinerDashboard)
   isAdmin=true  -> read-only, sees every review, can moderate (delete)
   isAdmin=false -> can leave a review for any tour they've completed
───────────────────────────────────────────── */
const Reviews = ({ isAdmin = false }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewableTours, setReviewableTours] = useState([]);
  const [selectedTourId, setSelectedTourId] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [mediaItems, setMediaItems] = useState([]); // [{ file, preview, type: 'image'|'video' }]
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const mediaInputRef = useRef(null);

  const fetchReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select('*, tours(id, title, destination, start_date, end_date)')
      .order('created_at', { ascending: false });

    if (error) { console.error('Error fetching reviews:', error.message); setLoading(false); return; }

    const userIds = [...new Set((data || []).map(r => r.user_id).filter(Boolean))];
    const { data: profilesData } = userIds.length
      ? await supabase.from('profiles').select('id, full_name, first_name, last_name').in('id', userIds)
      : { data: [] };
    const profileMap = Object.fromEntries((profilesData || []).map(p => [p.id, p]));

    setReviews((data || []).map(r => ({ ...r, author: profileMap[r.user_id] || null })));
    setLoading(false);
  }, []);

  // Tours this joiner has completed and hasn't reviewed yet.
  const fetchReviewableTours = useCallback(async (userId, existingReviewTourIds) => {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('tour_id, tours(id, title, destination, start_date, end_date)')
      .eq('user_id', userId)
      .eq('booking_status', 'Completed');

    const uniqueMap = {};
    (bookings || []).forEach(b => {
      if (b.tour_id && b.tours && !existingReviewTourIds.includes(b.tour_id)) {
        uniqueMap[b.tour_id] = b.tours;
      }
    });
    setReviewableTours(Object.values(uniqueMap));
  }, []);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
      await fetchReviews();
      if (user && !isAdmin) {
        const { data: myReviews } = await supabase.from('reviews').select('tour_id').eq('user_id', user.id);
        await fetchReviewableTours(user.id, (myReviews || []).map(r => r.tour_id));
      }
    })();
  }, [fetchReviews, fetchReviewableTours, isAdmin]);

  useEffect(() => {
    const channel = supabase
      .channel('reviews-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => fetchReviews())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchReviews]);

  const handleMediaSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const next = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
    }));
    setMediaItems(prev => [...prev, ...next]);
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  };

  const removeMediaItem = (index) => {
    setMediaItems(prev => prev.filter((_, i) => i !== index));
  };

  const uploadReviewMedia = async () => {
    const uploaded = [];
    for (const item of mediaItems) {
      const ext = item.file.name.split('.').pop();
      const fileName = `${Math.random()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('tours')
        .upload(`review-media/${fileName}`, item.file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('tours').getPublicUrl(`review-media/${fileName}`);
      uploaded.push({ url: data.publicUrl, type: item.type });
    }
    return uploaded;
  };

  const handleSubmit = async () => {
    if (!selectedTourId || rating === 0) { alert('Please select a tour and give it a star rating.'); return; }
    setSubmitting(true);
    try {
      const media = mediaItems.length ? await uploadReviewMedia() : [];

      const { error } = await supabase.from('reviews').insert([{
        tour_id: selectedTourId,
        user_id: currentUserId,
        rating,
        comment: comment.trim() || null,
        media,
      }]);
      if (error) throw error;

      setSelectedTourId('');
      setRating(0);
      setComment('');
      mediaItems.forEach(m => URL.revokeObjectURL(m.preview));
      setMediaItems([]);
      fetchReviews();
      const { data: myReviews } = await supabase.from('reviews').select('tour_id').eq('user_id', currentUserId);
      fetchReviewableTours(currentUserId, (myReviews || []).map(r => r.tour_id));
    } catch (err) {
      const msg = err.message?.includes('duplicate') ? "You've already reviewed this tour." : err.message;
      alert('Error submitting review: ' + msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this review? This cannot be undone.')) return;
    setDeletingId(id);
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if (error) alert('Error: ' + error.message); else fetchReviews();
    setDeletingId(null);
  };

  const avgRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 780, margin: '0 auto' }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, background: '#1A0A00',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8A265',
          }}>
            <MessageSquare size={18} />
          </div>
          <div>
            <h2 style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.02em', color: '#1A0A00', margin: 0 }}>
              Tour Reviews
            </h2>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.6, margin: '2px 0 0' }}>
              {isAdmin ? 'What joiners are saying about your tours' : 'Share your experience &amp; read what others say'}
            </p>
          </div>
        </div>

        {avgRating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FDF6EE', border: '1px solid rgba(196,92,38,0.14)', borderRadius: 999, padding: '8px 16px' }}>
            <StarRow rating={Math.round(avgRating)} size={13} />
            <span style={{ fontSize: 12, fontWeight: 900, color: '#1A0A00' }}>{avgRating}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.6 }}>({reviews.length})</span>
          </div>
        )}
      </div>

      {/* composer — joiner only */}
      {!isAdmin && (
        <div style={{
          background: '#FDF6EE', borderRadius: 20, padding: '1.5rem',
          border: '1px solid rgba(196,92,38,0.14)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        }}>
          {reviewableTours.length === 0 ? (
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.65, margin: 0 }}>
              Once you've completed a tour, it'll show up here so you can leave a review.
            </p>
          ) : (
            <>
              <label style={{
                display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, marginBottom: 6,
              }}>
                Which tour would you like to review?
              </label>
              <select
                value={selectedTourId}
                onChange={(e) => setSelectedTourId(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box', background: '#F2E4D0',
                  border: '1px solid rgba(196,92,38,0.18)', borderRadius: 14,
                  padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#1A0A00',
                  fontFamily: 'inherit', outline: 'none',
                }}
              >
                <option value="">Select a completed tour…</option>
                {reviewableTours.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title} — {t.destination}{t.start_date ? ` (${formatTourDate(t.start_date, t.end_date)})` : ''}
                  </option>
                ))}
              </select>

              {selectedTourId && (() => {
                const selectedTour = reviewableTours.find(t => t.id === selectedTourId);
                if (!selectedTour?.start_date) return null;
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
                    fontSize: 11, fontWeight: 800, color: '#7A3A18', opacity: 0.75,
                  }}>
                    <Calendar size={12} /> Tour date: {formatTourDate(selectedTour.start_date, selectedTour.end_date)}
                  </div>
                );
              })()}

              <div style={{ marginBottom: 16 }} />

              <label style={{
                display: 'block', fontSize: 9, fontWeight: 800, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: '#7A3A18', opacity: 0.7, marginBottom: 8,
              }}>
                Your Rating
              </label>
              <StarPicker value={rating} onChange={setRating} />

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell other joiners about your experience..."
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical', marginTop: 16,
                  background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)',
                  borderRadius: 14, padding: '12px 14px', fontSize: 13, fontWeight: 600,
                  color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
                }}
              />

              {mediaItems.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                  {mediaItems.map((item, idx) => (
                    <div key={idx} style={{ position: 'relative', width: 84, height: 84 }}>
                      {item.type === 'video' ? (
                        <video src={item.preview} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 12 }} muted />
                      ) : (
                        <img src={item.preview} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 12, display: 'block' }} />
                      )}
                      {item.type === 'video' && (
                        <div style={{
                          position: 'absolute', bottom: 4, left: 4, background: 'rgba(26,10,0,0.7)',
                          borderRadius: 6, padding: '2px 5px', display: 'flex', alignItems: 'center',
                        }}>
                          <Video size={10} color="#FDF6EE" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMediaItem(idx)}
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          width: 20, height: 20, borderRadius: '50%',
                          background: '#1A0A00', color: '#FDF6EE', border: '2px solid #FDF6EE',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: '#7A3A18', opacity: 0.75,
                    background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
                  }}
                >
                  <ImageIcon size={15} /> Add Photos / Videos
                </button>
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleMediaSelect}
                  style={{ display: 'none' }}
                />

                <button
                  onClick={handleSubmit}
                  disabled={submitting || !selectedTourId || rating === 0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: (submitting || !selectedTourId || rating === 0) ? 'rgba(196,92,38,0.4)' : '#C45C26',
                    color: '#FDF6EE', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em',
                    textTransform: 'uppercase', padding: '11px 22px', borderRadius: 999,
                    border: 'none', cursor: (submitting || !selectedTourId || rating === 0) ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', boxShadow: '0 6px 18px rgba(196,92,38,0.3)',
                  }}
                >
                  {submitting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                  Submit Review
                </button>
                <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
              </div>
            </>
          )}
        </div>
      )}

      {/* review list */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', color: 'rgba(122,58,24,0.35)' }}>
          <Loader2 size={20} style={{ marginRight: 10, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading reviews…</span>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : reviews.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '4rem 2rem', border: '2px dashed rgba(196,92,38,0.18)', borderRadius: 20,
          color: 'rgba(122,58,24,0.35)', textAlign: 'center',
        }}>
          <Star size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
            No reviews yet
          </p>
          <p style={{ fontSize: 12, fontWeight: 600, margin: '6px 0 0', opacity: 0.85 }}>
            Reviews from joiners will appear here.
          </p>
        </div>
      ) : (
        reviews.map(review => (
          <ReviewCard
            key={review.id}
            review={review}
            canDelete={isAdmin || review.user_id === currentUserId}
            deleting={deletingId === review.id}
            onDelete={() => handleDelete(review.id)}
          />
        ))
      )}
    </div>
  );
};

/* ── REVIEW CARD ── */
const ReviewCard = ({ review, canDelete, deleting, onDelete }) => (
  <div style={{
    background: '#FDF6EE', borderRadius: 20, padding: '1.25rem 1.5rem',
    border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#E8A265', fontWeight: 900, fontSize: 15,
        }}>
          {displayName(review.author).charAt(0).toUpperCase()}
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0 }}>
            {displayName(review.author)}
          </p>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.55, margin: '3px 0 0' }}>
            {formatDate(review.created_at)}
          </p>
        </div>
      </div>

      {canDelete && (
        <button
          onClick={onDelete}
          disabled={deleting}
          title="Delete review"
          style={{
            background: 'none', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer',
            color: 'rgba(140,47,28,0.5)', padding: 6, flexShrink: 0,
          }}
        >
          {deleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
        </button>
      )}
    </div>

    {review.tours && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{
          background: '#F2E4D0', borderRadius: 999, padding: '4px 12px',
          fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <MapPin size={10} /> {review.tours.title}
        </span>
        {review.tours.start_date && (
          <span style={{
            background: '#F2E4D0', borderRadius: 999, padding: '4px 12px',
            fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Calendar size={10} /> {formatTourDate(review.tours.start_date, review.tours.end_date)}
          </span>
        )}
      </div>
    )}

    <div style={{ marginTop: 12 }}>
      <StarRow rating={review.rating} />
    </div>

    {review.comment && (
      <p style={{ fontSize: 13, fontWeight: 500, color: '#1A0A00', lineHeight: 1.6, margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>
        {review.comment}
      </p>
    )}

    {Array.isArray(review.media) && review.media.length > 0 && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {review.media.map((m, idx) => (
          m.type === 'video' ? (
            <video
              key={idx}
              src={m.url}
              controls
              style={{ width: 160, height: 120, objectFit: 'cover', borderRadius: 12, background: '#000' }}
            />
          ) : (
            <img
              key={idx}
              src={m.url}
              alt=""
              style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, cursor: 'pointer' }}
              onClick={() => window.open(m.url, '_blank')}
            />
          )
        ))}
      </div>
    )}
  </div>
);

export default Reviews;