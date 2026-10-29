import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ImageIcon, CheckCircle2, X } from 'lucide-react';

// ─────────────────────────────────────────────
// TOUR DETAIL pieces shared by the joiner and public tour pages: section
// headings, inclusion / exclusion checklists, and the photo carousel.
// ─────────────────────────────────────────────

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

export {
  ViewSection,
  ChecklistGrid,
  TourImageCarousel,
};
