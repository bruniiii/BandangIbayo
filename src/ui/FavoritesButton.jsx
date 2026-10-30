import { useEffect, useRef, useState } from 'react';
import { Star, MapPin, Calendar, ImageIcon, ArrowRight } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useFavorites, toggleFavorite } from '../favorites';
import { formatPeso, formatDateRange, todayManila } from '../tourUtils';

// The star beside the notification bell (joiners): the tours they starred on
// Explore Tours, to book later. onOpenTour(id) opens that tour's booking window.
const FavoritesButton = ({ onOpenTour }) => {
  const { ids } = useFavorites();
  const [open, setOpen] = useState(false);
  const [tours, setTours] = useState(null);
  const wrapRef = useRef(null);
  const count = ids.size;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // The starred tours' details, loaded when the list opens.
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const list = [...ids];
    const cols = 'id, title, destination, price, start_date, end_date, duration, image_urls, is_archived';
    (async () => {
      const { data: starred } = list.length ? await supabase.from('tours').select(cols).in('id', list) : { data: [] };
      // A trip runs on several dates: show its next open date, even if the
      // starred one has passed.
      const titles = [...new Set((starred || []).map((t) => t.title))];
      const { data: upcoming } = titles.length
        ? await supabase.from('tours').select(cols).in('title', titles).eq('is_archived', false).gte('start_date', todayManila()).order('start_date', { ascending: true })
        : { data: [] };
      // starredIds: the starred date(s) behind each row, for removing it.
      const byId = new Map();
      (starred || []).forEach((t) => {
        const row = (upcoming || []).find((u) => u.title === t.title && u.destination === t.destination) || t;
        const prev = byId.get(row.id);
        byId.set(row.id, { ...row, starredIds: [...(prev?.starredIds || []), t.id] });
      });
      const unique = [...byId.values()].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
      if (active) setTours(unique);
    })();
    return () => { active = false; };
  }, [open, ids]);

  const today = todayManila();
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        aria-label={`Favorites (${count})`} title="Favorites"
        style={{
          position: 'relative', width: 40, height: 40, borderRadius: 12, cursor: 'pointer',
          background: open ? '#1A0A00' : '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: open ? '#E8A265' : '#1A0A00',
        }}
      >
        <Star size={18} fill={count ? '#E8A265' : 'none'} color={count ? '#B4511E' : 'currentColor'} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 999,
            background: '#B4511E', color: '#FDF6EE', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #FDF6EE',
          }}>{count}</span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Your favorite tours" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 10px)', zIndex: 60, width: 'min(360px, calc(100vw - 32px))',
          background: '#FFFDF9', borderRadius: 18, border: '1px solid rgba(180,81,30,0.18)', boxShadow: '0 20px 48px rgba(26,10,0,0.2)', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(180,81,30,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Star size={16} fill="#E8A265" color="#B4511E" />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A0A00' }}>Favorites</p>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#7A3A18' }}>Saved to book later</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: 8 }}>
            {tours === null ? (
              <p style={{ margin: 0, padding: 16, fontSize: 12.5, fontWeight: 600, color: '#7A3A18' }}>Loading…</p>
            ) : tours.length === 0 ? (
              <div style={{ padding: '22px 16px', textAlign: 'center' }}>
                <Star size={28} style={{ color: '#E8A265' }} />
                <p style={{ margin: '8px 0 4px', fontSize: 13, fontWeight: 900, color: '#1A0A00' }}>No favorites yet</p>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5 }}>Tap the star on a tour in Explore Tours to save it here for later.</p>
              </div>
            ) : tours.map((t) => {
              const ended = t.is_archived || (t.end_date || t.start_date) < today;
              return (
                <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 8, borderRadius: 14 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(242,228,208,0.6)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ width: 52, height: 52, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: '#F2E4D0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.7)' }}>
                    {t.image_urls?.[0] ? <img src={t.image_urls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon size={20} />}
                  </div>
                  <button type="button" disabled={ended} onClick={() => { setOpen(false); onOpenTour?.(t.id); }}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: ended ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#1A0A00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={11} /> {t.destination} · {formatPeso(t.price)}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, fontWeight: 800, color: ended ? '#8C2F1C' : '#A8481A', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {ended ? 'This date has passed' : <><Calendar size={11} /> {formatDateRange(t.start_date, t.duration)} <ArrowRight size={11} /> Book</>}
                    </p>
                  </button>
                  <button type="button" onClick={() => toggleFavorite({ title: t.title, dates: t.starredIds.map((id) => ({ id })) })} aria-label={`Remove ${t.title} from Favorites`} title="Remove from Favorites"
                    style={{ width: 32, height: 32, flexShrink: 0, borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#B4511E', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Star size={15} fill="currentColor" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FavoritesButton;
