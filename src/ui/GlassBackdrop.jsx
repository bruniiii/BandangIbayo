import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { todayManila } from '../tourUtils';

// ─────────────────────────────────────────────
// The photo behind every page: full-screen pictures of the open tours,
// slowly zooming and fading one into the next (the nature photo when there
// are none), under a cream (light glass) or dark (dark glass) tint.
// ─────────────────────────────────────────────

let cached = null;
const loadPhotos = async () => {
  if (cached) return cached;
  const { data } = await supabase.from('tours').select('image_urls, is_exclusive')
    .eq('is_archived', false).gte('start_date', todayManila()).order('start_date', { ascending: true }).limit(20);
  cached = [...new Set((data || []).filter((t) => !t.is_exclusive).map((t) => t.image_urls?.[0]).filter(Boolean))].slice(0, 5);
  return cached;
};

const GlassBackdrop = () => {
  const [photos, setPhotos] = useState(cached || []);
  const [index, setIndex] = useState(0);
  useEffect(() => { loadPhotos().then(setPhotos).catch(() => {}); }, []);
  const images = photos.length ? photos : ['/nature-bg.webp'];
  useEffect(() => {
    if (images.length < 2) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), 8000);
    return () => clearInterval(t);
  }, [images.length]);
  return (
    <div className="gb" aria-hidden="true">
      {images.map((src, i) => (
        <img key={src} src={src} alt="" className={`gb-slide${i === index % images.length ? ' is-on' : ''}`} decoding="async" fetchPriority={i === 0 ? 'high' : 'low'} />
      ))}
      <div className="gb-shade" />
      <div className="gb-orb gb-orb-a" />
      <div className="gb-orb gb-orb-b" />
    </div>
  );
};

export default GlassBackdrop;
