import React, { useState, useRef } from 'react';
import { formatPeso } from './tourUtils';
import PriceTag from './ui/PriceTag';
import { Edit, Clock, Users, X, CheckCircle2, AlertCircle, ImageIcon, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import ItineraryTimeline from './ui/ItineraryTimeline';

// ─────────────────────────────────────────────
// TOUR VIEW window (Tour Management → View): photo carousel, details,
// inclusions / exclusions, itinerary and things to bring.
// ─────────────────────────────────────────────

/* ─────────────────────────────────────────────
   TOUR IMAGE CAROUSEL (slideable gallery)
───────────────────────────────────────────── */
const TourImageCarousel = ({ images = [], onExpand }) => {
  const [index, setIndex] = useState(0);
  const dragStartX = useRef(null);
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
                onClick={() => onExpand(url)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', flexShrink: 0, cursor: 'zoom-in' }}
              />
            ))}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)' }}>
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
                border: i === index ? '2px solid #B4511E' : '1px solid rgba(180,81,30,0.15)',
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
 
const TourViewModal = ({ tour, onClose, onEdit, setSelectedImage, formatDateRange }) => {
  const filledPct = Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100);
  const isFull    = (tour.available_slots ?? 1) <= 0;
  const isAlmost  = !isFull && (tour.available_slots ?? 99) <= 3;
 
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 1100,
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        overflow: 'hidden',
        maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 24, right: 24, zIndex: 50,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(122,58,24,0.85)',
        }}><X size={28} /></button>
 
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>
 
            {/* Left panel */}
            <div className="responsive-modal-padding" style={{
              background: '#F2E4D0',
              padding: '2.5rem 2rem',
              borderRight: '1px solid rgba(180,81,30,0.12)',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Photo Gallery (slideable) */}
              <TourImageCarousel images={tour.image_urls || []} onExpand={setSelectedImage} />
 
              <h2 style={{
                fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em',
                color: '#1A0A00', margin: '0 0 18px', lineHeight: 1.15,
              }}>{tour.title}</h2>
 
              {/* Meta */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {(tour.dates?.length > 1 ? tour.dates.map((d) => ({
                  icon: <Calendar size={16} />, text: `${formatDateRange(d.start_date, d.duration)} · ${d.current_booked ?? 0}/${d.group_size || 18} booked`,
                })) : [
                  { icon: <Calendar size={16} />, text: formatDateRange(tour.start_date, tour.duration) },
                  { icon: <Clock size={16} />,    text: tour.duration },
                ]).map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>
                    <span style={{ color: '#A8481A' }}>{row.icon}</span> {row.text}
                  </div>
                ))}
                {!(tour.dates?.length > 1) && (<>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: isFull ? '#A8481A' : '#7A3A18' }}>
                  <span style={{ color: '#A8481A' }}><Users size={16} /></span>
                  {tour.current_booked ?? 0} / {tour.group_size || 18} Slots Booked
                </div>
                {/* Progress bar */}
                <div style={{ background: 'rgba(180,81,30,0.15)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    width: `${filledPct}%`,
                    background: isFull ? '#B4511E' : isAlmost ? '#E8A265' : '#7A3A18',
                    transition: 'width 0.4s',
                  }} />
                </div>
                </>)}
                <span style={{
                  display: 'inline-block',
                  background: '#FDF6EE',
                  border: '1px solid rgba(180,81,30,0.2)',
                  borderRadius: 999, padding: '4px 14px',
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: '#1A0A00', width: 'fit-content',
                }}>{tour.difficulty}</span>
              </div>
 
              {/* Price */}
              <div style={{ margin: '0 0 2px', lineHeight: 1 }}>
                <PriceTag tour={tour} size={36} align="flex-start" />
              </div>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '0 0 4px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Joiner rate, per person</p>
              <p style={{ fontSize: 12.5, fontWeight: 800, color: tour.regular_rate ? '#1A0A00' : '#8C2F1C', margin: '0 0 16px' }}>
                {tour.regular_rate ? `Regular rate: ${formatPeso(tour.regular_rate)}` : 'Regular rate not set yet. Edit the tour to add it.'}
              </p>
 
              <button
                onClick={onEdit}
                style={{
                  width: '100%', padding: '12px 0',
                  background: '#B4511E', color: '#FDF6EE',
                  border: 'none', borderRadius: 14, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 6px 18px rgba(180,81,30,0.32)',
                }}
              >
                <Edit size={13} /> Edit This Tour
              </button>
            </div>
 
            {/* Right panel */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 28 }}>
 
                <ViewSection title="About the Tour">
                  <p style={{ fontSize: 14, lineHeight: 1.8, fontWeight: 500, color: '#7A3A18', whiteSpace: 'pre-wrap', margin: 0 }}>
                    {tour.description || 'No description provided.'}
                  </p>
                </ViewSection>
 
                <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>
                  <ViewSection title="Inclusions" titleColor="#A8481A" icon={<CheckCircle2 size={14} />}>
                    <ChecklistGrid text={tour.inclusions} variant="include" />
                  </ViewSection>
                  <ViewSection title="Exclusions" titleColor="#A8481A" icon={<X size={14} />}>
                    <ChecklistGrid text={tour.exclusions} variant="exclude" />
                  </ViewSection>
                </div>
 
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>
                  <ViewSection title="Itinerary" titleColor="#A8481A" icon={<Clock size={14} />}>
                    <ItineraryTimeline text={tour.itinerary} startDate={tour.dates?.length > 1 ? null : tour.start_date} />
                  </ViewSection>
                </div>

                <div style={{ borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>
                  <ViewSection title="Things to Bring">
                    <ChecklistGrid text={tour.things_to_bring} variant="neutral" />
                  </ViewSection>
                </div>
 
                {tour.important_note && (
                  <div style={{
                    background: 'rgba(180,81,30,0.07)',
                    borderRadius: 18, padding: '1.5rem',
                    border: '1px solid rgba(180,81,30,0.2)',
                    display: 'flex', gap: 16,
                  }}>
                    <AlertCircle size={22} style={{ color: '#A8481A', flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 8px' }}>
                        Important Note
                      </p>
                      <pre style={{ fontSize: 13, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1.7, color: '#1A0A00', whiteSpace: 'pre-wrap', margin: 0 }}>
                        {tour.important_note}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const ViewSection = ({ title, titleColor, icon, children }) => (
  <section>
    <h4 style={{
      fontSize: 11, fontWeight: 900, letterSpacing: '0.25em',
      textTransform: 'uppercase', color: titleColor || '#1A0A00',
      margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {icon} {title}
    </h4>
    {children}
  </section>
);
 
/* Renders newline-separated text (inclusions/exclusions/things-to-bring)
   as a tidy checklist grid instead of a raw text block. */
const ChecklistGrid = ({ text, variant = 'neutral' }) => {
  const items = (text || '').split('\n').map(s => s.trim()).filter(Boolean);
 
  if (items.length === 0) {
    return <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>N/A</p>;
  }
 
  const iconColor = variant === 'exclude' ? '#8C2F1C' : '#A8481A';
  const itemBg = variant === 'exclude' ? 'rgba(140,47,28,0.06)' : variant === 'include' ? 'rgba(168,72,26,0.07)' : 'rgba(180,81,30,0.06)';
  const Icon = variant === 'exclude' ? X : CheckCircle2;
 
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: itemBg, borderRadius: 12, padding: '9px 12px',
          flex: '0 1 auto', maxWidth: '100%',
        }}>
          <span style={{ color: iconColor, flexShrink: 0, marginTop: 1 }}><Icon size={13} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', lineHeight: 1.4 }}>{item}</span>
        </div>
      ))}
    </div>
  );
};

export {
  TourImageCarousel,
  TourViewModal,
  ViewSection,
  ChecklistGrid,
};
