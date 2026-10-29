import React, { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { isOnSale } from './tourUtils';
import PriceTag from './ui/PriceTag';
import { Edit, Archive, Eye, MapPin, Users, ImageIcon, Calendar, RefreshCw } from 'lucide-react';

// ─────────────────────────────────────────────
// TOUR CARD (Tour Management): one trip with its dates, slots and the
// View / Edit / Add Date / Joiners / Archive actions.
// ─────────────────────────────────────────────

const TourCard = ({ tour, onConfirmAction, onView, onEdit, onAddDate, onJoiners, formatDateRange }) => {
  const [hovered, setHovered] = useState(false);
  const today  = new Date().toISOString().split('T')[0];
  const dates  = tour.dates || [tour];
  const isLive = dates.some((d) => today >= d.start_date && today <= d.end_date);
 
  return (
    <div
      style={{
        background: '#FDF6EE',
        borderRadius: 22, overflow: 'hidden',
        border: '1px solid rgba(180,81,30,0.12)',
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
        {tour.image_urls?.[0]
          ? <img src={tour.image_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.4s' }} alt="Primary" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)' }}><ImageIcon size={44} /></div>
        }
        {/* badges */}
        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <span style={{
            background: 'rgba(253,246,238,0.92)', borderRadius: 999,
            padding: '4px 12px', fontSize: 11, fontWeight: 900,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: '#1A0A00',
          }}>{tour.difficulty}</span>
        </div>
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {isLive && !tour.is_archived && (
            <span style={{
              background: '#B4511E', color: '#FDF6EE',
              borderRadius: 999, padding: '4px 10px',
              fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>● Live</span>
          )}
          {tour.is_archived && (
            <span style={{
              background: 'rgba(26,10,0,0.6)', color: '#FDF6EE',
              borderRadius: 999, padding: '4px 10px',
              fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>Archived</span>
          )}
        </div>
      </div>
 
      {/* Body */}
      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: 0, flex: 1 }}>{tour.title}</h3>
            <PriceTag tour={tour} size={15} style={{ marginLeft: 10, flexShrink: 0 }} />
          </div>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 12px' }}>
            <MapPin size={11} style={{ color: '#A8481A' }} /> {tour.destination}
          </p>
          {/* Each date: when, how full, and its joiner list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {dates.map((d) => {
              const full = (d.available_slots ?? 1) <= 0;
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(180,81,30,0.06)', borderRadius: 10, padding: '7px 8px 7px 10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Wraps onto two lines when long (dates + weekdays) instead of running under the Joiners button */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, fontWeight: 800, color: '#1A0A00', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                      <Calendar size={12} style={{ color: '#A8481A', flexShrink: 0, marginTop: 2 }} /> <span style={{ minWidth: 0 }}>{formatDateRange(d.start_date, d.duration)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: full ? '#A8481A' : '#7A3A18', marginTop: 2, paddingLeft: 18 }}>
                      {d.current_booked ?? 0} / {d.group_size || 18} booked
                      {d.sale_starts && d.sale_ends && (
                        <span title={`Sale ${d.sale_starts} to ${d.sale_ends}`} style={{ background: isOnSale(d) ? '#8C2F1C' : 'rgba(140,47,28,0.12)', color: isOnSale(d) ? '#FDF6EE' : '#8C2F1C', fontSize: 10.5, fontWeight: 900, padding: '1px 7px', borderRadius: 999, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {isOnSale(d) ? 'On sale' : 'Sale soon'}
                        </span>
                      )}
                      {full && <span style={{ background: 'rgba(180,81,30,0.12)', color: '#A8481A', fontSize: 10.5, fontWeight: 900, padding: '1px 7px', borderRadius: 999, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Full</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onJoiners(d)}
                    title={`Joiners on ${formatDateRange(d.start_date, d.duration)}`}
                    style={{
                      flexShrink: 0, minHeight: 32, padding: '0 10px', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid rgba(122,58,24,0.25)', background: '#FDF6EE', color: '#1A0A00',
                      fontFamily: 'inherit', fontWeight: 900, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  ><Users size={11} /> Joiners</button>
                </div>
              );
            })}
          </div>
        </div>
 
        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 8 }}>
          {[
            { label: 'View', icon: <Eye size={11} />, onClick: onView, style: { background: '#F2E4D0', color: '#1A0A00' } },
            { label: 'Edit', icon: <Edit size={11} />, onClick: onEdit, style: { background: '#F2E4D0', color: '#1A0A00' } },
            {
              label: tour.is_archived ? 'Restore' : 'Archive',
              icon: tour.is_archived ? <RefreshCw size={11} /> : <Archive size={11} />,
              onClick: onConfirmAction,
              // A rarely used action: outlined, so it doesn't compete with View/Edit.
              style: { background: 'transparent', color: '#7A3A18', border: '1px solid rgba(122,58,24,0.3)' },
            },
          ].map(({ label, icon, onClick, style: btnStyle }) => (
            <button
              key={label}
              onClick={onClick}
              style={{
                minHeight: 40, padding: '0 4px',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 900,
                fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'opacity 0.15s',
                ...btnStyle,
              }}
            >
              {icon} {label}
            </button>
          ))}
          {!tour.is_archived && <button
            type="button"
            onClick={onAddDate}
            title="Run this tour on another date"
            style={{
              minHeight: 40, padding: '0 4px',
              border: '1px dashed rgba(180,81,30,0.45)', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(180,81,30,0.06)', color: '#A8481A',
              fontFamily: 'inherit', fontWeight: 900,
              fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <CalendarPlus size={12} /> Add Date
          </button>}
        </div>
      </div>
    </div>
  );
};

export {
  TourCard,
};
