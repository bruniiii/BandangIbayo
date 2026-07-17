import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { MapPin, X, Calendar, Armchair, Compass, ChevronLeft, ChevronRight, ImageIcon, Loader2 } from 'lucide-react';

const PALETTE = {
  espresso: '#1A0A00',
  burntSienna: '#C45C26',
  warmAmber: '#E8A265',
  cream: '#FDF6EE',
  rust: '#7A3A18',
};

export const JoinerTracking = () => {
  const [activeTour, setActiveTour] = useState(null); 
  const [toursList, setToursList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [vehicleInfo, setVehicleInfo] = useState(null);

  // 1. FETCH USER'S BOOKED TOUR ID AND DETAILS
  useEffect(() => {
    const fetchMyBookedAdventure = async () => {
      try {
        setLoading(true);
        let targetTourIds = [];

        // FIND THE USER'S BOOKED TOUR ID FROM DATABASE
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: bookedData } = await supabase
            .from('bookings')
            .select('tour_id')
            .eq('user_id', user.id);

          if (bookedData && bookedData.length > 0) {
            targetTourIds = bookedData.map(b => b.tour_id);
          }
        }

        //READ FROM LOCAL STORAGE IF NO TOUR ID FOUND IN DATABASE
        if (targetTourIds.length === 0) {
          const allKeys = Object.keys(localStorage);
          const activeLogKey = allKeys.find(key => key && key.startsWith('logs_'));
          
          if (activeLogKey) {
            const extractedId = activeLogKey.replace('logs_', '');
            targetTourIds.push(extractedId);
          }
          
          // Check for any live checkpoint logs in localStorage as a fallback
          const currentLogs = localStorage.getItem('sandbox_live_checkpoint');
          if (currentLogs) {
            const parsedCurrent = JSON.parse(currentLogs);
            if (parsedCurrent.length > 0 && parsedCurrent[0].tour_id) {
              if (!targetTourIds.includes(parsedCurrent[0].tour_id)) {
                targetTourIds.push(parsedCurrent[0].tour_id);
              }
            }
          }
        }

        // FETCH TOUR DETAILS BASED ON THE FOUND TOUR IDS 
        if (targetTourIds.length > 0) {
          const { data: finalTours, error: fetchError } = await supabase
            .from('tours')
            .select('*')
            .in('id', targetTourIds)
            .eq('is_archived', false);

          if (!fetchError && finalTours) {
            setToursList(finalTours);
            setLoading(false);
            return;
          }
        }

        // If no tours found, fetch the next upcoming tour as a fallback
        const { data: panicTours } = await supabase
          .from('tours')
          .select('*')
          .eq('is_archived', false)
          .order('start_date', { ascending: true })
          .limit(1);

        if (panicTours) setToursList(panicTours);

      } catch (err) {
        console.error("Critical recovery interceptor error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMyBookedAdventure();
  }, []);

  // SYNC LIVE TRACKING LOGS AND VEHICLE INFO FROM LOCAL STORAGE
  useEffect(() => {
    if (!activeTour) {
      setLogs([]);
      setVehicleInfo(null);
      return;
    }

    const syncLiveTrackingMemory = () => {
      try {
        const currentLogs = localStorage.getItem('sandbox_live_checkpoint');
        const allKeys = Object.keys(localStorage);

        const logKey = `logs_${activeTour.id}`;
        const savedLogs = localStorage.getItem(logKey);
        
        if (savedLogs) {
          setLogs(JSON.parse(savedLogs));
        } else if (currentLogs) {
          const parsedCurrent = JSON.parse(currentLogs);
          if (parsedCurrent.length > 0 && parsedCurrent[0].tour_id === activeTour.id) {
            setLogs(parsedCurrent);
          } else {
            setLogs([]);
          }
        } else {
          setLogs([]);
        }

        const vehicleKey = `vehicle_info_${activeTour.id}`;
        const savedVehicle = localStorage.getItem(vehicleKey);
        
        if (savedVehicle) {
          setVehicleInfo(JSON.parse(savedVehicle));
        } else {
          const generalVehicleKey = allKeys.find(key => key && key.startsWith('vehicle_info_'));
          if (generalVehicleKey && !savedLogs) {
            setVehicleInfo(JSON.parse(localStorage.getItem(generalVehicleKey)));
          } else {
            setVehicleInfo(null);
          }
        }
      } catch (err) {
        console.error("Error parsing layout updates:", err);
      }
    };

    syncLiveTrackingMemory();
    const interval = setInterval(syncLiveTrackingMemory, 1200);
    return () => clearInterval(interval);
  }, [activeTour]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Tour Grid (matches JoinerTours card grid) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {loading ? (
          <div style={{
            gridColumn: '1 / -1',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '5rem 0', color: 'rgba(122,58,24,0.4)',
          }}>
            <Loader2 size={30} className="animate-spin" style={{ marginBottom: 10 }} />
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
      <div style={{ height: 186, background: '#E8D5BC', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {displayImage
          ? <img src={displayImage} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.4s' }} alt="" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.2)' }}><ImageIcon size={44} /></div>
        }
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <span style={{
            background: PALETTE.burntSienna, color: '#FDF6EE',
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
            transition: 'opacity 0.15s',
            background: '#1A0A00', color: '#FDF6EE',
          }}
        >
          <MapPin size={13} /> Track This Tour
        </button>
      </div>
    </div>
  );
};

/* Slideable photo gallery -- identical behavior/style to JoinerTours' carousel */
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
          background: '#E8D5BC', marginBottom: hasMultiple ? 12 : 20,
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
                background: 'rgba(26,10,0,0.5)', border: 'none', borderRadius: '50%',
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#FDF6EE',
              }}
            ><ChevronLeft size={18} /></button>
            <button
              type="button" onClick={next}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(26,10,0,0.5)', border: 'none', borderRadius: '50%',
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

/* Section header helper, mirrors TourManagement/JoinerTours' ViewSection */
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
   TRACKING DETAIL MODAL
   (split panel, mirrors JoinerTours' DetailedTourModal)
───────────────────────────────────────────── */
const TrackingDetailModal = ({ tour, logs, vehicleInfo, onClose }) => {
  const images = Array.isArray(tour.image_urls) ? tour.image_urls : (tour.image ? [tour.image] : []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 1100,
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
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
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(196,92,38,0.1)', boxShadow: '0 2px 8px rgba(26,10,0,0.02)' }}>
                <ViewSection title="Assigned Fleet Details" titleColor="#C45C26">
                  {vehicleInfo ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: '#1A0A00' }}>
                      <div><strong>Van Model:</strong> {vehicleInfo.carType || "Pending Dispatch"}</div>
                      <div><strong>Plate No:</strong> {vehicleInfo.plateNumber || "Pending Setup"}</div>
                      <div><strong>Driver:</strong> {vehicleInfo.driverName || "Assigning Staff"}</div>
                      <div><strong>Contact:</strong> {vehicleInfo.driverContact || "Not Available"}</div>

                      <div style={{ gridColumn: 'span 2', borderTop: '1px dashed rgba(26,10,0,0.1)', paddingTop: 10, marginTop: 2, display: 'flex', justifyContent: 'space-between', color: '#7A3A18', fontWeight: 600 }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 16, marginTop: 8 }}>
                  {!logs || logs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: 'rgba(122,58,24,0.5)' }}>
                      <Compass size={24} style={{ opacity: 0.5, marginBottom: 8 }} />
                      <p style={{ fontSize: 12, margin: 0, fontStyle: 'italic' }}>Waiting for arrival updates…</p>
                    </div>
                  ) : (
                    logs.map((log, index) => {
                      const isArrivedStatus = log.status === 'ARRIVED';
                      const isLatestUpdate = index === 0;

                      let textColor = '#9CA3AF';
                      let timeColor = '#9CA3AF';
                      let textWeight = 500;
                      let dotColor = '#D1D5DB';

                      if (isArrivedStatus) {
                        textColor = PALETTE.espresso;
                        timeColor = PALETTE.espresso;
                        textWeight = 900;
                        dotColor = '#10B981';
                      } else if (isLatestUpdate) {
                        textColor = PALETTE.espresso;
                        timeColor = '#9CA3AF';
                        textWeight = 700;
                        dotColor = PALETTE.burntSienna;
                      }

                      return (
                        <div key={log.id || index} style={{ display: 'flex', gap: 16, position: 'relative', paddingBottom: 20, alignItems: 'flex-start' }}>
                          {index !== logs.length - 1 && (
                            <div style={{ position: 'absolute', left: 4, top: 16, bottom: 0, width: 2, background: '#E5E7EB', zIndex: 1 }} />
                          )}
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, marginTop: 5, zIndex: 2, flexShrink: 0 }} />

                          <div style={{ flex: 1, fontSize: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: textWeight, color: textColor }}>
                              <span style={{ lineHeight: 1.4 }}>{log.display_text || ""}</span>
                              <span style={{ fontSize: 10, color: timeColor, fontWeight: textWeight, whiteSpace: 'nowrap', marginLeft: 8 }}>
                                {log.timestamp || ""}
                              </span>
                            </div>
                            {log.note && <p style={{ margin: '4px 0 0', color: '#9CA3AF', fontSize: 11, fontStyle: 'italic' }}>— Note: "{log.note}"</p>}
                          </div>
                        </div>
                      );
                    })
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