import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { MapPin, X, Calendar, Armchair, Compass, ChevronLeft, ChevronRight, ImageIcon, Loader2, Check, CheckCircle2 } from 'lucide-react';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light card bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #8C2F1C  deep rust red (error / alert)
// #F2E4D0  parchment (inset panel bg)
// #EDEAE3  warm stone (page bg)
// #3F5D62  slate teal (secondary contrast accent / arrived)
// ---------------------------------------------------------

export const JoinerTracking = () => {
  const [activeTour, setActiveTour] = useState(null);
  const [toursList, setToursList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingConsole, setLoadingConsole] = useState(false);
  const [logs, setLogs] = useState([]);
  const [vehicleInfo, setVehicleInfo] = useState(null);

  // 1. FETCH USER'S BOOKED TOUR(S) FROM SUPABASE
  useEffect(() => {
    const fetchMyBookedAdventure = async () => {
      try {
        setLoading(true);
        let targetTourIds = [];

        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: bookedData } = await supabase
            .from('bookings')
            .select('tour_id')
            .eq('user_id', user.id)
            .not('booking_status', 'in', '("Cancelled","Rejected")');

          if (bookedData && bookedData.length > 0) {
            targetTourIds = [...new Set(bookedData.map(b => b.tour_id).filter(Boolean))];
          }
        }

        if (targetTourIds.length > 0) {
          const { data: finalTours, error: fetchError } = await supabase
            .from('tours')
            .select('*')
            .in('id', targetTourIds)
            .eq('is_archived', false);

          if (!fetchError && finalTours && finalTours.length > 0) {
            setToursList(finalTours);
            setLoading(false);
            return;
          }
        }

        // Fallback: show the next upcoming tour
        const { data: fallbackTours } = await supabase
          .from('tours')
          .select('*')
          .eq('is_archived', false)
          .order('start_date', { ascending: true })
          .limit(1);

        setToursList(fallbackTours || []);
      } catch (err) {
        console.error('Error loading tracked tours:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMyBookedAdventure();
  }, []);

  // 2. LOAD LIVE TRACKING DATA FOR THE SELECTED TOUR FROM SUPABASE
  const fetchTrackingForTour = useCallback(async (tourId) => {
    setLoadingConsole(true);
    try {
      const [{ data: vehicle }, { data: trackingLogs }] = await Promise.all([
        supabase.from('tour_vehicles').select('*').eq('tour_id', tourId).maybeSingle(),
        supabase.from('tour_tracking_logs').select('*').eq('tour_id', tourId).order('created_at', { ascending: false }),
      ]);
      setVehicleInfo(vehicle || null);
      setLogs(trackingLogs || []);
    } catch (err) {
      console.error('Error loading tracking:', err.message);
    } finally {
      setLoadingConsole(false);
    }
  }, []);

  useEffect(() => {
    if (!activeTour) {
      setLogs([]);
      setVehicleInfo(null);
      return;
    }
    fetchTrackingForTour(activeTour.id);
  }, [activeTour, fetchTrackingForTour]);

  // Live updates
  useEffect(() => {
    if (!activeTour) return;
    const channel = supabase
      .channel(`joiner-tracking-${activeTour.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_tracking_logs' }, () => fetchTrackingForTour(activeTour.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_vehicles' }, () => fetchTrackingForTour(activeTour.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTour, fetchTrackingForTour]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Tour Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {loading ? (
          <div style={{
            gridColumn: '1 / -1',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '5rem 0', color: 'rgba(122,58,24,0.4)',
          }}>
            <Loader2 size={30} style={{ marginBottom: 10, color: '#C45C26', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
              Loading Your Adventures…
            </p>
          </div>
        ) : toursList.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            padding: '5rem 0', textAlign: 'center',
            background: '#FDF6EE',
            borderRadius: 20,
            border: '2px dashed rgba(196,92,38,0.2)',
          }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.4)', margin: 0 }}>
              No booked tours to track yet.
            </p>
          </div>
        ) : toursList.map((tour) => {
          if (!tour) return null;
          return (
            <TrackingTourCard key={tour.id} tour={tour} onTrack={() => setActiveTour(tour)} />
          );
        })}
      </div>

      {activeTour && (
        <TrackingDetailModal
          tour={activeTour}
          logs={logs}
          vehicleInfo={vehicleInfo}
          loadingConsole={loadingConsole}
          onClose={() => setActiveTour(null)}
        />
      )}
    </div>
  );
};

const TrackingTourCard = ({ tour, onTrack }) => {
  const [hovered, setHovered] = useState(false);
  const hasImage = Array.isArray(tour.image_urls) && tour.image_urls.length > 0;
  const displayImage = hasImage ? tour.image_urls[0] : (tour.image || '');

  return (
    <div
      style={{
        background: '#FDF6EE',
        borderRadius: 22, overflow: 'hidden',
        border: '1px solid rgba(196,92,38,0.12)',
        boxShadow: hovered ? '0 12px 36px rgba(26,10,0,0.14)' : '0 4px 16px rgba(26,10,0,0.06)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all 0.25s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div style={{ height: 186, background: '#F2E4D0', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {displayImage
          ? <img src={displayImage} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.4s' }} alt="" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.2)' }}><ImageIcon size={44} /></div>
        }
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <span style={{
            background: '#C45C26', color: '#FDF6EE',
            borderRadius: 999, padding: '4px 10px',
            fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 4,
          }}><Compass size={10} /> Tracking</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: '0 0 10px' }}>{tour.title}</h3>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 8px' }}>
            <MapPin size={11} style={{ color: '#C45C26' }} /> {tour.destination || 'Not Specified'}
          </p>
          {(tour.start_date || tour.date) && (
            <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 5, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <Calendar size={11} style={{ color: '#C45C26' }} /> {tour.start_date || tour.date}
            </p>
          )}
        </div>

        {/* Action */}
        <button
          onClick={onTrack}
          style={{
            width: '100%', marginTop: 14,
            padding: '11px 0',
            border: 'none', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 900,
            fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'background 0.2s',
            background: '#1A0A00', color: '#FDF6EE',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#C45C26'}
          onMouseLeave={e => e.currentTarget.style.background = '#1A0A00'}
        >
          <MapPin size={13} /> Track This Tour
        </button>
      </div>
    </div>
  );
};

const TourImageCarousel = ({ images = [] }) => {
  const [index, setIndex] = useState(0);
  const dragStartX = React.useRef(null);
  const hasImages = images.length > 0;
  const hasMultiple = images.length > 1;

  const goTo = (i) => setIndex(((i % images.length) + images.length) % images.length);
  const prev = (e) => { e.stopPropagation(); goTo(index - 1); };
  const next = (e) => { e.stopPropagation(); goTo(index + 1); };

  const handleDragStart = (e) => {
    dragStartX.current = e.clientX ?? e.touches?.[0]?.clientX ?? null;
  };
  const handleDragEnd = (e) => {
    if (dragStartX.current == null) return;
    const endX = e.clientX ?? e.changedTouches?.[0]?.clientX ?? dragStartX.current;
    const delta = endX - dragStartX.current;
    if (Math.abs(delta) > 40) {
      delta > 0 ? goTo(index - 1) : goTo(index + 1);
    }
    dragStartX.current = null;
  };

  return (
    <div>
      <div
        style={{
          position: 'relative', width: '100%', height: 190,
          borderRadius: 18, overflow: 'hidden',
          background: '#F2E4D0', marginBottom: hasMultiple ? 12 : 20,
          boxShadow: '0 8px 24px rgba(26,10,0,0.15)',
          flexShrink: 0, touchAction: 'pan-y', userSelect: 'none',
        }}
        onPointerDown={handleDragStart}
        onPointerUp={handleDragEnd}
      >
        {hasImages ? (
          <div style={{
            display: 'flex', width: '100%', height: '100%',
            transform: `translateX(-${index * 100}%)`,
            transition: 'transform 0.35s ease',
          }}>
            {images.map((url, i) => (
              <img
                key={i} src={url} draggable={false} alt={`Photo ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', flexShrink: 0 }}
              />
            ))}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.3)' }}>
            <ImageIcon size={40} />
          </div>
        )}

        {hasMultiple && (
          <>
            <button
              type="button" onClick={prev}
              style={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(26,10,0,0.65)', border: 'none', borderRadius: '50%',
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#FDF6EE',
              }}
            ><ChevronLeft size={18} /></button>
            <button
              type="button" onClick={next}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(26,10,0,0.65)', border: 'none', borderRadius: '50%',
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#FDF6EE',
              }}
            ><ChevronRight size={18} /></button>
            <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
              {images.map((_, i) => (
                <span
                  key={i}
                  onClick={(e) => { e.stopPropagation(); goTo(i); }}
                  style={{
                    width: i === index ? 16 : 6, height: 6, borderRadius: 999,
                    background: i === index ? '#FDF6EE' : 'rgba(253,246,238,0.5)',
                    cursor: 'pointer', transition: 'width 0.2s',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {hasMultiple && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {images.map((url, i) => (
            <div
              key={i}
              onClick={() => goTo(i)}
              style={{
                aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                border: i === index ? '2px solid #C45C26' : '1px solid rgba(196,92,38,0.15)',
                opacity: i === index ? 1 : 0.65, transition: 'opacity 0.2s, border-color 0.2s',
              }}
            >
              <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={`Thumbnail ${i + 1}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ViewSection = ({ title, titleColor, icon, children }) => (
  <section>
    <h4 style={{
      fontSize: 9, fontWeight: 900, letterSpacing: '0.25em',
      textTransform: 'uppercase', color: titleColor || '#1A0A00',
      margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {icon} {title}
    </h4>
    {children}
  </section>
);

/* ─────────────────────────────────────────────
   TRACKING TIMELINE
───────────────────────────────────────────── */
const splitLogText = (text) => {
  if (!text) return { title: 'Update', description: '' };
  const idx = text.indexOf(':');
  if (idx === -1) return { title: text, description: '' };
  return { title: text.slice(0, idx).trim(), description: text.slice(idx + 1).trim() };
};

const formatLogDateTime = (createdAt) => {
  if (!createdAt) return { dateLabel: '', timeLabel: '' };
  const d = new Date(createdAt);
  const isToday = d.toDateString() === new Date().toDateString();
  return {
    dateLabel: isToday ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    timeLabel: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
};

const TrackingTimeline = ({ logs, emptyText = 'No logs posted yet.' }) => {
  if (!logs || logs.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '2.5rem 1rem',
        background: '#FDF6EE', borderRadius: 16,
        border: '2px dashed rgba(196,92,38,0.2)',
      }}>
        <Compass size={22} style={{ color: 'rgba(122,58,24,0.3)', marginBottom: 8 }} />
        <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(122,58,24,0.5)', margin: 0, fontStyle: 'italic' }}>{emptyText}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {logs.map((log, index) => {
        const isLast = index === logs.length - 1;
        const isArrivedStatus = log.status === 'ARRIVED';
        const isLatestUpdate = index === 0;
        const { title, description } = splitLogText(log.display_text);
        const { dateLabel, timeLabel } = formatLogDateTime(log.created_at || log.timestamp);

        const badgeBg = isArrivedStatus ? '#3F5D62' : isLatestUpdate ? '#C45C26' : 'rgba(122,58,24,0.12)';
        const badgeColor = isArrivedStatus || isLatestUpdate ? '#FDF6EE' : '#7A3A18';
        const titleColor = isLatestUpdate || isArrivedStatus ? '#1A0A00' : 'rgba(26,10,0,0.55)';
        const titleWeight = isLatestUpdate || isArrivedStatus ? 900 : 700;

        return (
          <div key={log.id || index} style={{ display: 'flex', gap: 12, paddingBottom: isLast ? 0 : 22 }}>
            {/* date / time column */}
            <div style={{ width: 56, flexShrink: 0, textAlign: 'right', paddingTop: 3 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#7A3A18', opacity: 0.55, margin: 0, lineHeight: 1.5, whiteSpace: 'nowrap' }}>{dateLabel}</p>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#7A3A18', opacity: 0.55, margin: 0, lineHeight: 1.5, whiteSpace: 'nowrap' }}>{timeLabel}</p>
            </div>

            {/* badge + connector column */}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: badgeBg, color: badgeColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2,
                boxShadow: isLatestUpdate && !isArrivedStatus ? '0 0 0 4px rgba(196,92,38,0.16)' : 'none',
              }}>
                {isArrivedStatus ? <CheckCircle2 size={14} strokeWidth={2.5} /> : <Check size={13} strokeWidth={3} />}
              </div>
              {!isLast && (
                <div style={{ position: 'absolute', top: 26, bottom: -22, width: 2, background: 'rgba(196,92,38,0.18)' }} />
              )}
            </div>

            {/* content column */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <p style={{ fontSize: 13, fontWeight: titleWeight, color: titleColor, margin: 0, lineHeight: 1.4 }}>
                {title}
              </p>
              {description && (
                <p style={{ fontSize: 12, fontWeight: 500, color: '#7A3A18', opacity: 0.75, margin: '4px 0 0', lineHeight: 1.6 }}>
                  {description}
                </p>
              )}
              {log.note && (
                <div style={{
                  marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 6,
                  background: 'rgba(196,92,38,0.08)',
                  border: '1px solid rgba(196,92,38,0.18)', borderRadius: 10,
                  padding: '8px 12px',
                }}>
                  <MapPin size={12} style={{ color: '#C45C26', flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', margin: 0, lineHeight: 1.5 }}>
                    {log.note}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─────────────────────────────────────────────
   TRACKING DETAIL MODAL
───────────────────────────────────────────── */
const TrackingDetailModal = ({ tour, logs, vehicleInfo, loadingConsole, onClose }) => {
  const images = Array.isArray(tour.image_urls) ? tour.image_urls : (tour.image ? [tour.image] : []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 1100,
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        borderTop: '8px solid #C45C26',
        overflow: 'hidden',
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 24, right: 24, zIndex: 50,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(122,58,24,0.5)',
        }}><X size={28} /></button>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>

            {/* Left panel: gallery, meta, fleet details */}
            <div className="responsive-modal-padding" style={{
              background: '#F2E4D0',
              padding: '2.5rem 2rem',
              borderRight: '1px solid rgba(196,92,38,0.12)',
              display: 'flex', flexDirection: 'column',
            }}>
              <TourImageCarousel images={images} />

              <h2 style={{
                fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em',
                color: '#1A0A00', margin: '0 0 10px', lineHeight: 1.15,
              }}>{tour.title}</h2>

              <p style={{ margin: '0 0 20px', fontSize: 13, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 10 }}>
                <MapPin size={16} style={{ color: '#C45C26', flexShrink: 0 }} />
                <span>{tour.destination || 'Dynamic Target Route'}</span>
              </p>

              {/* Fleet details */}
              <div style={{ background: '#FDF6EE', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 16px rgba(26,10,0,0.04)' }}>
                <ViewSection title="Assigned Fleet Details" titleColor="#C45C26">
                  {loadingConsole ? (
                    <div style={{ padding: '10px 0', textAlign: 'center', color: '#7A3A18', opacity: 0.6, fontSize: 12 }}>
                      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', marginRight: 6, verticalAlign: 'middle', color: '#C45C26' }} />
                      Loading fleet details…
                    </div>
                  ) : vehicleInfo ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: '#1A0A00' }}>
                      <div><strong style={{ color: '#7A3A18' }}>Van Model:</strong> {vehicleInfo.car_type || "Pending Dispatch"}</div>
                      <div><strong style={{ color: '#7A3A18' }}>Plate No:</strong> {vehicleInfo.plate_number || "Pending Setup"}</div>
                      <div><strong style={{ color: '#7A3A18' }}>Driver:</strong> {vehicleInfo.driver_name || "Assigning Staff"}</div>
                      <div><strong style={{ color: '#7A3A18' }}>Contact:</strong> {vehicleInfo.driver_contact || "Not Available"}</div>

                      <div style={{ gridColumn: 'span 2', borderTop: '1px dashed rgba(196,92,38,0.15)', paddingTop: 10, marginTop: 2, display: 'flex', justifyContent: 'space-between', color: '#7A3A18', fontWeight: 700 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Calendar size={14} style={{ color: '#C45C26' }} />
                          <span>{tour.start_date || tour.date || 'No Date Assigned'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Armchair size={14} style={{ color: '#C45C26' }} />
                          <span>{tour.max_seats || tour.seats || 'N/A'} Seats</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '10px 0', textAlign: 'center', color: '#7A3A18', opacity: 0.6, fontSize: 12, fontStyle: 'italic' }}>
                      Organizer has not deployed the vehicle details yet.
                    </div>
                  )}
                </ViewSection>
              </div>
            </div>

            {/* Right panel: live tracking timeline */}
            <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column' }}>
              <ViewSection title="Tracking Details" titleColor="#C45C26" icon={<Compass size={14} />}>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 8 }}>
                  {loadingConsole ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: 'rgba(122,58,24,0.5)' }}>
                      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8, color: '#C45C26' }} />
                      <p style={{ fontSize: 12, margin: 0, fontWeight: 700 }}>Loading updates…</p>
                    </div>
                  ) : (
                    <TrackingTimeline logs={logs} emptyText="Waiting for arrival updates…" />
                  )}
                </div>
              </ViewSection>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};