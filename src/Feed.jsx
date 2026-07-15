import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  Image as ImageIcon, Send, Trash2, X, Loader2, MapPin,
  Compass, Rss, Video, ChevronDown, MessageCircle,
} from 'lucide-react';

const REACTIONS = [
  { emoji: '👍', label: 'Like' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '😡', label: 'Angry' },
];

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------

const timeAgo = (dateStr) => {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) !== 1 ? 's' : ''} ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) !== 1 ? 's' : ''} ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const displayName = (profile, fallback = 'Bandang IBAYO') => {
  if (!profile) return fallback;
  const combo = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  if (combo) return combo;
  if (profile.username) return profile.username;
  return fallback;
};

/* ─────────────────────────────────────────────
   FEED  (shared between AdminDashboard & JoinerDashboard)
   isAdmin=true  -> shows the composer + delete controls
   isAdmin=false -> read-only feed for joiners
───────────────────────────────────────────── */
const Feed = ({ isAdmin = false }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [mediaItems, setMediaItems] = useState([]); // [{ file, preview, type: 'image'|'video' }]
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const fileInputRef = useRef(null);

  // ── reactions & comments ──
  const [reactionsMap, setReactionsMap] = useState({});   // { postId: [{ id, user_id, emoji }] }
  const [commentsMap, setCommentsMap] = useState({});      // { postId: [{ id, user_id, content, created_at, author }] }
  const [commentDrafts, setCommentDrafts] = useState({});  // { postId: string }
  const [openPickerId, setOpenPickerId] = useState(null);
  const [expandedPostIds, setExpandedPostIds] = useState(new Set());
  const [reactingId, setReactingId] = useState(null);
  const [commentingId, setCommentingId] = useState(null);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const postIdsRef = useRef([]);

  const fetchReactions = useCallback(async (postIds) => {
    if (!postIds.length) { setReactionsMap({}); return; }
    const { data, error } = await supabase.from('feed_reactions').select('id, post_id, user_id, emoji').in('post_id', postIds);
    if (error) { console.error('Error fetching reactions:', error.message); return; }
    const map = {};
    postIds.forEach(id => { map[id] = []; });
    (data || []).forEach(r => { (map[r.post_id] ||= []).push(r); });
    setReactionsMap(map);
  }, []);

  const fetchComments = useCallback(async (postIds) => {
    if (!postIds.length) { setCommentsMap({}); return; }
    const { data, error } = await supabase
      .from('feed_comments')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true });
    if (error) { console.error('Error fetching comments:', error.message); return; }

    const authorIds = [...new Set((data || []).map(c => c.user_id).filter(Boolean))];
    const { data: profilesData, error: profilesError } = authorIds.length
      ? await supabase.from('profiles').select('id, first_name, last_name, username, avatar_url, role').in('id', authorIds)
      : { data: [] };
    if (profilesError) console.error('Error fetching comment authors:', profilesError.message);
    const profileMap = Object.fromEntries((profilesData || []).map(p => [p.id, p]));

    const map = {};
    postIds.forEach(id => { map[id] = []; });
    (data || []).forEach(c => {
      (map[c.post_id] ||= []).push({ ...c, author: profileMap[c.user_id] || null });
    });
    setCommentsMap(map);
  }, []);

  const fetchPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from('feed_posts')
      .select('*, tours(id, title, destination, image_urls, price)')
      .order('created_at', { ascending: false });
    // `media` (jsonb array of { url, type }) comes back automatically via '*'

    if (error) { console.error('Error fetching feed:', error.message); setLoading(false); return; }

    const authorIds = [...new Set((data || []).map(p => p.author_id).filter(Boolean))];
    const { data: profilesData, error: profilesError } = authorIds.length
      ? await supabase.from('profiles').select('id, first_name, last_name, username, avatar_url, role').in('id', authorIds)
      : { data: [] };
    if (profilesError) console.error('Error fetching post authors:', profilesError.message);
    const profileMap = Object.fromEntries((profilesData || []).map(p => [p.id, p]));

    const nextPosts = (data || []).map(p => ({ ...p, author: profileMap[p.author_id] || null }));
    setPosts(nextPosts);
    setLoading(false);

    const ids = nextPosts.map(p => p.id);
    postIdsRef.current = ids;
    fetchReactions(ids);
    fetchComments(ids);
  }, [fetchReactions, fetchComments]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    })();
    setLoading(true);
    fetchPosts();
  }, [fetchPosts]);

  // Live updates — new posts (including auto tour posts) appear instantly
  // for whoever else has this feed open.
  useEffect(() => {
    const channel = supabase
      .channel('feed-posts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts' }, () => fetchPosts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPosts]);

  // Live updates for reactions & comments on whatever posts are currently loaded.
  useEffect(() => {
    const reactionsChannel = supabase
      .channel('feed-reactions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_reactions' }, () => fetchReactions(postIdsRef.current))
      .subscribe();
    const commentsChannel = supabase
      .channel('feed-comments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_comments' }, () => fetchComments(postIdsRef.current))
      .subscribe();
    return () => {
      supabase.removeChannel(reactionsChannel);
      supabase.removeChannel(commentsChannel);
    };
  }, [fetchReactions, fetchComments]);

  const handleMediaSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const next = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
    }));
    setMediaItems(prev => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMediaItem = (index) => {
    setMediaItems(prev => prev.filter((_, i) => i !== index));
  };

  const clearComposer = () => {
    setContent('');
    setMediaItems([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePost = async () => {
    if (!content.trim() && mediaItems.length === 0) return;
    setPosting(true);
    try {
      const media = [];
      for (const item of mediaItems) {
        const ext = item.file.name.split('.').pop();
        const fileName = `${Math.random()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('tours').upload(`feed-media/${fileName}`, item.file);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('tours').getPublicUrl(`feed-media/${fileName}`);
        media.push({ url: data.publicUrl, type: item.type });
      }
      // Keep image_url populated for backward compatibility with older feed posts / tour auto-posts.
      const firstImage = media.find(m => m.type === 'image');

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('feed_posts').insert([{
        author_id: user?.id,
        content: content.trim(),
        image_url: firstImage ? firstImage.url : null,
        media,
        post_type: 'post',
      }]);
      if (error) throw error;

      clearComposer();
      fetchPosts();
    } catch (err) {
      alert('Error posting: ' + err.message);
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    setDeletingId(id);
    const { error } = await supabase.from('feed_posts').delete().eq('id', id);
    if (error) alert('Error: ' + error.message); else fetchPosts();
    setDeletingId(null);
  };

  const toggleReaction = async (postId, emoji) => {
    if (!currentUserId) { alert('Please log in to react.'); return; }
    setReactingId(postId);
    try {
      const mine = (reactionsMap[postId] || []).find(r => r.user_id === currentUserId);
      if (mine && mine.emoji === emoji) {
        const { error } = await supabase.from('feed_reactions').delete().eq('post_id', postId).eq('user_id', currentUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('feed_reactions')
          .upsert([{ post_id: postId, user_id: currentUserId, emoji }], { onConflict: 'post_id,user_id' });
        if (error) throw error;
      }
      setOpenPickerId(null);
      fetchReactions(postIdsRef.current);
    } catch (err) {
      alert('Error reacting: ' + err.message);
    } finally {
      setReactingId(null);
    }
  };

  const handleQuickLike = (postId) => {
    const mine = (reactionsMap[postId] || []).find(r => r.user_id === currentUserId);
    toggleReaction(postId, mine ? mine.emoji : '👍');
  };

  const toggleCommentsExpanded = (postId) => {
    setExpandedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  };

  const handleCommentDraftChange = (postId, value) => {
    setCommentDrafts(prev => ({ ...prev, [postId]: value }));
  };

  const handleAddComment = async (postId) => {
    const text = (commentDrafts[postId] || '').trim();
    if (!text || !currentUserId) return;
    setCommentingId(postId);
    try {
      const { error } = await supabase.from('feed_comments').insert([{ post_id: postId, user_id: currentUserId, content: text }]);
      if (error) throw error;
      setCommentDrafts(prev => ({ ...prev, [postId]: '' }));
      fetchComments(postIdsRef.current);
    } catch (err) {
      alert('Error posting comment: ' + err.message);
    } finally {
      setCommentingId(null);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return;
    setDeletingCommentId(commentId);
    try {
      const { error } = await supabase.from('feed_comments').delete().eq('id', commentId);
      if (error) throw error;
      fetchComments(postIdsRef.current);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeletingCommentId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680, margin: '0 auto' }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, background: '#1A0A00',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8A265',
        }}>
          <Rss size={18} />
        </div>
        <div>
          <h2 style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.02em', color: '#1A0A00', margin: 0 }}>
            Community Feed
          </h2>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.6, margin: '2px 0 0' }}>
            Updates, announcements &amp; newly posted tours
          </p>
        </div>
      </div>

      {/* composer — admin only */}
      {isAdmin && (
        <div style={{
          background: '#FDF6EE', borderRadius: 20, padding: '1.5rem',
          border: '1px solid rgba(196,92,38,0.14)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share an announcement with your joiners..."
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical',
              background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)',
              borderRadius: 14, padding: '12px 14px', fontSize: 13, fontWeight: 600,
              color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
            }}
          />

          {mediaItems.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              {mediaItems.map((item, idx) => (
                <div key={idx} style={{ position: 'relative', width: 100, height: 100 }}>
                  {item.type === 'video' ? (
                    <video src={item.preview} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 14 }} muted />
                  ) : (
                    <img src={item.preview} alt="Preview" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 14, display: 'block' }} />
                  )}
                  {item.type === 'video' && (
                    <div style={{
                      position: 'absolute', bottom: 5, left: 5, background: 'rgba(26,10,0,0.7)',
                      borderRadius: 6, padding: '2px 5px', display: 'flex', alignItems: 'center',
                    }}>
                      <Video size={11} color="#FDF6EE" />
                    </div>
                  )}
                  <button
                    onClick={() => removeMediaItem(idx)}
                    style={{
                      position: 'absolute', top: -8, right: -8,
                      width: 26, height: 26, borderRadius: '50%',
                      background: '#1A0A00', color: '#FDF6EE', border: '2px solid #FDF6EE',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
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
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleMediaSelect}
              style={{ display: 'none' }}
            />

            <button
              onClick={handlePost}
              disabled={posting || (!content.trim() && mediaItems.length === 0)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: posting || (!content.trim() && mediaItems.length === 0) ? 'rgba(26,10,0,0.35)' : '#1A0A00',
                color: '#E8A265', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em',
                textTransform: 'uppercase', padding: '11px 22px', borderRadius: 999,
                border: 'none', cursor: posting || (!content.trim() && mediaItems.length === 0) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', boxShadow: '0 6px 18px rgba(26,10,0,0.22)',
              }}
            >
              {posting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
              Post
            </button>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>
      )}

      {/* feed list */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', color: 'rgba(122,58,24,0.35)' }}>
          <Loader2 size={20} style={{ marginRight: 10, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading feed…</span>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : posts.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '4rem 2rem', border: '2px dashed rgba(196,92,38,0.18)', borderRadius: 20,
          color: 'rgba(122,58,24,0.35)', textAlign: 'center',
        }}>
          <Compass size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
            No posts yet
          </p>
          <p style={{ fontSize: 12, fontWeight: 600, margin: '6px 0 0', opacity: 0.85 }}>
            {isAdmin ? 'Share your first update above.' : 'Check back soon for updates from Bandang IBAYO.'}
          </p>
        </div>
      ) : (
        posts.map(post => (
          <FeedPostCard
            key={post.id}
            post={post}
            canDelete={isAdmin}
            deleting={deletingId === post.id}
            onDelete={() => handleDelete(post.id)}
            currentUserId={currentUserId}
            reactions={reactionsMap[post.id] || []}
            reacting={reactingId === post.id}
            pickerOpen={openPickerId === post.id}
            onTogglePicker={() => setOpenPickerId(prev => (prev === post.id ? null : post.id))}
            onQuickLike={() => handleQuickLike(post.id)}
            onPickReaction={(emoji) => toggleReaction(post.id, emoji)}
            comments={commentsMap[post.id] || []}
            commentsExpanded={expandedPostIds.has(post.id)}
            onToggleComments={() => toggleCommentsExpanded(post.id)}
            commentDraft={commentDrafts[post.id] || ''}
            onCommentDraftChange={(v) => handleCommentDraftChange(post.id, v)}
            onAddComment={() => handleAddComment(post.id)}
            commenting={commentingId === post.id}
            onDeleteComment={handleDeleteComment}
            deletingCommentId={deletingCommentId}
          />
        ))
      )}
    </div>
  );
};

/* ── FEED POST CARD ── */
const FeedPostCard = ({
  post, canDelete, deleting, onDelete,
  currentUserId, reactions, reacting, pickerOpen, onTogglePicker, onQuickLike, onPickReaction,
  comments, commentsExpanded, onToggleComments, commentDraft, onCommentDraftChange, onAddComment, commenting,
  onDeleteComment, deletingCommentId,
}) => {
  const isTourPost = post.post_type === 'tour';
  const tour = post.tours;
  const coverImage = post.image_url || tour?.image_urls?.[0] || null;
  const media = Array.isArray(post.media) && post.media.length > 0
    ? post.media
    : (coverImage ? [{ url: coverImage, type: 'image' }] : []);

  const [lightboxIndex, setLightboxIndex] = useState(null);

  const mine = reactions.find(r => r.user_id === currentUserId);
  const reactionCounts = {};
  reactions.forEach(r => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1; });
  const topEmojis = Object.entries(reactionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);

  return (
    <div style={{
      background: '#FDF6EE', borderRadius: 20, overflow: 'hidden',
      border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
    }}>
      <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#E8A265', fontWeight: 900, fontSize: 16,
          }}>
            {isTourPost ? <Compass size={18} /> : displayName(post.author).charAt(0).toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0 }}>
              {displayName(post.author)}
              {post.author?.role === 'admin' && (
                <span style={{
                  marginLeft: 8, background: '#C45C26', color: '#FDF6EE',
                  fontSize: 8, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
                  borderRadius: 999, padding: '2px 8px', verticalAlign: 'middle',
                }}>Admin</span>
              )}
            </p>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.55, margin: '3px 0 0' }}>
              {timeAgo(post.created_at)} {isTourPost && '· New Tour Posted'}
            </p>
          </div>
        </div>

        {canDelete && (
          <button
            onClick={onDelete}
            disabled={deleting}
            title="Delete post"
            style={{
              background: 'none', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer',
              color: 'rgba(140,47,28,0.5)', padding: 6, flexShrink: 0,
            }}
          >
            {deleting ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={15} />}
          </button>
        )}
      </div>

      {post.content && (
        <p style={{ padding: '0 1.5rem 1rem', fontSize: 13, fontWeight: 500, color: '#1A0A00', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
          {post.content}
        </p>
      )}

      {media.length === 1 && (
        <div style={{ width: '100%', maxHeight: 340, overflow: 'hidden', background: '#E8D5BC' }}>
          {media[0].type === 'video' ? (
            <video src={media[0].url} controls style={{ width: '100%', maxHeight: 340, display: 'block', background: '#000' }} />
          ) : (
            <img
              src={media[0].url}
              alt=""
              onClick={() => setLightboxIndex(0)}
              style={{ width: '100%', height: '100%', maxHeight: 340, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
            />
          )}
        </div>
      )}

      {media.length > 1 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: media.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)',
          gap: 3, background: '#E8D5BC',
        }}>
          {media.map((m, idx) => (
            m.type === 'video' ? (
              <video key={idx} src={m.url} controls style={{ width: '100%', height: 160, objectFit: 'cover', background: '#000' }} />
            ) : (
              <img
                key={idx}
                src={m.url}
                alt=""
                onClick={() => setLightboxIndex(idx)}
                style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
              />
            )
          ))}
        </div>
      )}

      {isTourPost && tour && (
        <div style={{
          margin: '1rem 1.5rem 1.5rem', padding: '14px 16px',
          background: '#F2E4D0', borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {tour.title}
            </p>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 4, margin: '4px 0 0' }}>
              <MapPin size={11} /> {tour.destination}
            </p>
          </div>
          {tour.price != null && (
            <span style={{ fontSize: 14, fontWeight: 900, color: '#C45C26', flexShrink: 0 }}>
              ₱{Number(tour.price).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* reaction summary + comment count */}
      {(reactions.length > 0 || comments.length > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 1.5rem 10px', fontSize: 11.5, fontWeight: 700, color: '#7A3A18',
        }}>
          {reactions.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'flex' }}>
                {topEmojis.map((e, i) => (
                  <span key={e} style={{ marginLeft: i === 0 ? 0 : -6, fontSize: 14 }}>{e}</span>
                ))}
              </span>
              <span>{reactions.length}</span>
            </div>
          ) : <span />}
          {comments.length > 0 && (
            <button
              onClick={onToggleComments}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', opacity: 0.8 }}
            >
              {comments.length} Comment{comments.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      <div style={{ borderTop: '1px solid rgba(196,92,38,0.12)', margin: '0 1.5rem' }} />

      {/* action row: like / comment toggle */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 1rem', gap: 4 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={onQuickLike}
            disabled={reacting}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
              cursor: reacting ? 'not-allowed' : 'pointer', padding: '10px 10px', borderRadius: 10,
              fontSize: 12, fontWeight: 800, color: mine ? '#C45C26' : '#7A3A18', fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 15 }}>{mine ? mine.emoji : '👍'}</span>
            {mine ? 'Reacted' : 'Like'}
          </button>
          <button
            onClick={onTogglePicker}
            title="Choose a reaction"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#7A3A18', opacity: 0.55 }}
          >
            <ChevronDown size={13} />
          </button>

          {pickerOpen && (
            <div style={{
              position: 'absolute', bottom: '110%', left: 0, background: '#FDF6EE',
              border: '1px solid rgba(196,92,38,0.18)', borderRadius: 999, padding: '6px 10px',
              display: 'flex', gap: 6, boxShadow: '0 8px 24px rgba(26,10,0,0.18)', zIndex: 5,
            }}>
              {REACTIONS.map(r => (
                <button
                  key={r.emoji}
                  title={r.label}
                  onClick={() => onPickReaction(r.emoji)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 2, lineHeight: 1 }}
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onToggleComments}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            cursor: 'pointer', padding: '10px 10px', borderRadius: 10,
            fontSize: 12, fontWeight: 800, color: '#7A3A18', fontFamily: 'inherit',
          }}
        >
          <MessageCircle size={15} /> Comment
        </button>
      </div>

      {/* comment section */}
      {commentsExpanded && (
        <div style={{ padding: '0 1.5rem 1.25rem' }}>
          {comments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {comments.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                    background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#E8A265', fontWeight: 900, fontSize: 11,
                  }}>
                    {c.author?.avatar_url ? (
                      <img src={c.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      displayName(c.author, 'Joiner').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div style={{ flex: 1, background: '#F2E4D0', borderRadius: 14, padding: '8px 12px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ fontSize: 11.5, fontWeight: 900, color: '#1A0A00', margin: 0 }}>
                        {displayName(c.author, 'Joiner')}
                      </p>
                      {(canDelete || c.user_id === currentUserId) && (
                        <button
                          onClick={() => onDeleteComment(c.id)}
                          disabled={deletingCommentId === c.id}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(140,47,28,0.5)', padding: 2, flexShrink: 0 }}
                        >
                          {deletingCommentId === c.id
                            ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                            : <Trash2 size={11} />}
                        </button>
                      )}
                    </div>
                    <p style={{ fontSize: 12.5, color: '#1A0A00', margin: '2px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {c.content}
                    </p>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#7A3A18', opacity: 0.5, margin: '4px 0 0' }}>
                      {timeAgo(c.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={commentDraft}
              onChange={(e) => onCommentDraftChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAddComment(); } }}
              placeholder="Write a comment..."
              style={{
                flex: 1, boxSizing: 'border-box', background: '#F2E4D0',
                border: '1px solid rgba(196,92,38,0.18)', borderRadius: 999,
                padding: '9px 14px', fontSize: 12.5, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              onClick={onAddComment}
              disabled={commenting || !commentDraft.trim()}
              style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: (commenting || !commentDraft.trim()) ? 'rgba(196,92,38,0.35)' : '#C45C26',
                color: '#FDF6EE', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: (commenting || !commentDraft.trim()) ? 'not-allowed' : 'pointer',
              }}
            >
              {commenting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
            </button>
          </div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* image lightbox */}
      {lightboxIndex !== null && media[lightboxIndex] && (
        <div
          onClick={() => setLightboxIndex(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(26,10,0,0.92)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '3rem 1.5rem', cursor: 'zoom-out',
          }}
        >
          <button
            onClick={() => setLightboxIndex(null)}
            title="Close"
            style={{
              position: 'absolute', top: 20, right: 20,
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(253,246,238,0.12)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FDF6EE', cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>

          {media.length > 1 && lightboxIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => i - 1); }}
              style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(253,246,238,0.12)', border: 'none',
                color: '#FDF6EE', fontSize: 20, cursor: 'pointer',
              }}
            >
              ‹
            </button>
          )}
          {media.length > 1 && lightboxIndex < media.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => i + 1); }}
              style={{
                position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(253,246,238,0.12)', border: 'none',
                color: '#FDF6EE', fontSize: 20, cursor: 'pointer',
              }}
            >
              ›
            </button>
          )}

          <img
            src={media[lightboxIndex].url}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '100%', maxHeight: '100%', borderRadius: 12,
              boxShadow: '0 24px 70px rgba(0,0,0,0.55)', objectFit: 'contain',
            }}
          />
        </div>
      )}
    </div>
  );
};

export default Feed;