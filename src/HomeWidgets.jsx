import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, Star, ChevronLeft, ChevronRight, MapPin, CheckCircle2, Wallet, Sparkles } from 'lucide-react';
import { supabase } from './supabaseClient';
import { formatPeso, requestStatusLabel, requestPaymentLabel, requestOverdueReason } from './tourUtils';
import { formatYmdRange } from './dateRange';
// Booking (details, companions, payment, waitlist) is one shared flow in JoinerTours.
import Reviews from './Reviews';
import { ReviewCard } from './ui/ReviewCards';
import { usePublicReviews } from './publicReviews';
import { Skel, SkeletonRegion, SkeletonLines } from './ui/Skeleton';

// ─────────────────────────────────────────────
// JOINER HOMEPAGE widgets: trip stats, next trip, trip readiness, calendar,
// tracking, Exclusive & Requested Tours, and reviews.
// ─────────────────────────────────────────────

/* ── TRIP PULSE STAT ── */
const PulseStat = ({ icon, label, value, subcopy, onClick }) => (
  <div
    onClick={onClick}
    role="button"
    style={{
      flex: 1, display: 'flex', alignItems: 'center', gap: 16,
      cursor: onClick ? 'pointer' : 'default',
      borderRadius: 14, padding: '4px 8px', margin: '-4px -8px',
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
  >
    <div style={{
      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
      background: 'rgba(232,162,101,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#E8A265',
    }}>
      {icon}
    </div>
    <div style={{ flex: 1 }}>
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(232,210,190,0.85)', margin: '0 0 4px' }}>
        {label}
      </p>
      <p style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', color: '#FDF6EE', margin: '0 0 4px', lineHeight: 1 }}>
        {value}
      </p>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(232,210,190,0.85)', margin: 0 }}>
        {subcopy}
      </p>
    </div>
    {onClick && (
      <ChevronRight size={16} style={{ color: 'rgba(232,210,190,0.85)', flexShrink: 0 }} />
    )}
  </div>
);

/* ── NEXT TRIP CARD ── */
const NextTripCard = ({ trip, onViewBookings }) => {
  const cardStyle = {
    background: '#FDF6EE',
    borderRadius: 22,
    border: '1px solid rgba(180,81,30,0.12)',
    boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
    overflow: 'hidden',
  };

  if (!trip?.tours) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(trip.tours.start_date);
  const daysToGo = Math.max(0, Math.ceil((startDate - today) / 86400000));
  const cover = trip.tours.image_urls?.[0];

  return (
    <div
      onClick={onViewBookings}
      style={{ ...cardStyle, cursor: 'pointer', position: 'relative', minHeight: 220 }}
    >
      {cover && (
        <img src={cover} alt={trip.tours.title} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover',
        }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(26,10,0,0.92) 0%, rgba(26,10,0,0.35) 60%, rgba(26,10,0,0.15) 100%)',
      }} />
      <div style={{ position: 'relative', zIndex: 1, padding: '1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', minHeight: 220 }}>
        <span style={{
          alignSelf: 'flex-start',
          background: '#B4511E', color: '#FDF6EE',
          fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
          borderRadius: 999, padding: '5px 12px',
        }}>
          Next Trip
        </span>
        <div>
          <p style={{ fontSize: 30, fontWeight: 900, color: '#FDF6EE', margin: '0 0 4px', letterSpacing: '-0.03em' }}>
            {daysToGo === 0 ? 'Today!' : `${daysToGo} day${daysToGo === 1 ? '' : 's'} to go`}
          </p>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#E8A265', margin: '0 0 4px' }}>
            {trip.tours.title}
          </p>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(253,246,238,0.85)', display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}>
            <MapPin size={13} /> {trip.tours.destination}
          </p>
        </div>
      </div>
    </div>
  );
};

/* ── TRIP READINESS CARD ── */
const TripReadinessCard = ({ trip, onClick }) => {
  // Confirmed once payment is verified. Settled when nothing is left to pay:
  // paid in full, or a downpayment whose balance was settled.
  const bookingConfirmed = trip.payment_status === 'Complete' || trip.booking_status === 'Completed';
  const balanceLeft = Math.max(0, (Number(trip.total_price) || 0) - (Number(trip.amount_paid) || 0));
  const paymentSettled = bookingConfirmed
    && (trip.payment_method !== 'Downpayment' || trip.balance_settled || balanceLeft <= 0);

  const chip = (label, ok) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: ok ? 'rgba(180,81,30,0.08)' : 'rgba(122,58,24,0.06)',
      border: `1px solid ${ok ? 'rgba(180,81,30,0.22)' : 'rgba(122,58,24,0.14)'}`,
      borderRadius: 12, padding: '10px 14px', flex: 1,
    }}>
      <CheckCircle2 size={16} style={{ color: ok ? '#A8481A' : 'rgba(122,58,24,0.85)', flexShrink: 0 }} />
      <div>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9, margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{ok ? 'Confirmed' : 'Pending'}</p>
      </div>
    </div>
  );

  return (
    <div
      onClick={onClick}
      style={{
        background: '#FDF6EE', borderRadius: 22, padding: '1.5rem',
        border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wallet size={15} style={{ color: '#A8481A' }} />
          <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00' }}>
            Trip Readiness
          </span>
        </div>
        <ChevronRight size={15} style={{ color: 'rgba(122,58,24,0.85)' }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {chip('Booking', bookingConfirmed)}
        {!paymentSettled && chip('Payment', false)}
      </div>
      {!paymentSettled && (
        <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '12px 0 0' }}>
          {bookingConfirmed && balanceLeft > 0
            ? `Settle your remaining balance of ${formatPeso(balanceLeft)} before departure. Tap to pay it online.`
            : 'Settle your remaining balance before departure to lock in your seat.'}
        </p>
      )}
    </div>
  );
};

/* ── CALENDAR WIDGET ── */
const CalendarWidget = ({ loading, monthDots, nextTripDay, onClick, onDayClick }) => {
  const [monthOffset, setMonthOffset] = useState(0);

  const base = new Date();
  const viewDate = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString('default', { month: 'long' });
  const isCurrentMonth = monthOffset === 0;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const prevMonthLastDate = new Date(year, month, 0).getDate();
  const todayDate = base.getDate();

  const trailingCount = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ day: prevMonthLastDate - i, muted: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, muted: false });
  }
  for (let d = 1; d <= trailingCount; d++) {
    cells.push({ day: d, muted: true });
  }

  const handleCellClick = (day, muted) => {
    if (muted) {
      onClick?.();
      return;
    }
    if (onDayClick) {
      onDayClick({ year, month, day });
    } else {
      onClick?.();
    }
  };

  const handleHeaderClick = () => {
    if (onDayClick) {
      onDayClick({ year, month, day: null });
    } else {
      onClick?.();
    }
  };

  return (
    <div
      style={{
        background: '#FDF6EE', borderRadius: 20, padding: '1rem 1.1rem',
        border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div onClick={handleHeaderClick} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <CalendarIcon size={16} style={{ color: '#A8481A' }} />
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.01em', color: '#1A0A00' }}>
            {monthName} {year}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setMonthOffset(o => o - 1)}
            aria-label="Previous month"
            style={{
              width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(180,81,30,0.18)',
              background: 'transparent', cursor: 'pointer', color: '#7A3A18',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={() => setMonthOffset(o => o + 1)}
            aria-label="Next month"
            style={{
              width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(180,81,30,0.18)',
              background: 'transparent', cursor: 'pointer', color: '#7A3A18',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonRegion label="Loading calendar" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, maxWidth: 280, width: '100%', margin: '0 auto' }}>
          {Array.from({ length: 35 }, (_, i) => <Skel key={i} h={22} r={7} />)}
        </SkeletonRegion>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px 4px', maxWidth: 280, width: '100%', margin: '0 auto' }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 800, textAlign: 'center', color: '#7A3A18', paddingBottom: 2 }}>{d}</span>
          ))}
          {cells.map(({ day, muted }, i) => {
            const isToday = isCurrentMonth && !muted && day === todayDate;
            const isConfirmedTrip = isCurrentMonth && !muted && day === nextTripDay;
            const hasDot = isCurrentMonth && !muted && monthDots.includes(day) && !isConfirmedTrip;
            return (
              <div
                key={i}
                className="cal-day"
                role="button"
                tabIndex={0}
                aria-label={muted ? 'Open calendar' : `${monthName} ${day}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCellClick(day, muted); } }}
                onClick={() => handleCellClick(day, muted)}
                style={{
                  position: 'relative',
                  height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: isConfirmedTrip ? '#E8A265' : isToday ? '#1A0A00' : 'transparent',
                  color: muted ? 'rgba(122,58,24,0.85)' : isConfirmedTrip ? '#1A0A00' : isToday ? '#E8A265' : '#1A0A00',
                  fontSize: 11, fontWeight: (isToday || isConfirmedTrip) ? 900 : 600,
                  boxShadow: isConfirmedTrip ? '0 3px 10px rgba(232,162,101,0.5)' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isConfirmedTrip && !isToday) e.currentTarget.style.background = 'rgba(180,81,30,0.08)'; }}
                onMouseLeave={e => { if (!isConfirmedTrip && !isToday) e.currentTarget.style.background = 'transparent'; }}
              >
                {day}
                {hasDot && (
                  <span style={{
                    position: 'absolute', bottom: 1, width: 4, height: 4, borderRadius: '50%', background: '#B4511E',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(180,81,30,0.1)' }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: '#E8A265', flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9 }}>Confirmed trip</span>
      </div>
    </div>
  );
};

/* ── TRACKING SNIPPET ── */
const TrackingSnippet = ({ loading, hasTrip, stop, onClick }) => {
  const isActive = stop?.status === 'CURRENTLY HERE';

  return (
    <div
      onClick={onClick}
      style={{
        background: isActive ? '#1A0A00' : '#FDF6EE', borderRadius: 22, padding: '1.5rem',
        border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={15} style={{ color: isActive ? '#E8A265' : '#A8481A' }} />
          <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: isActive ? '#FDF6EE' : '#1A0A00' }}>
            Tracking
          </span>
        </div>
        <ChevronRight size={15} style={{ color: isActive ? 'rgba(253,246,238,0.85)' : 'rgba(122,58,24,0.85)' }} />
      </div>

      {loading ? (
        <SkeletonLines lines={3} label="Loading tracking" />
      ) : !hasTrip ? (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
          Tracking activates once you have a confirmed trip.
        </p>
      ) : !stop ? (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
          No pickup route posted for your trip yet.
        </p>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <MapPin size={14} style={{ color: isActive ? '#E8A265' : '#A8481A' }} />
            <span style={{ fontSize: 13, fontWeight: 900, color: isActive ? '#FDF6EE' : '#1A0A00' }}>
              {stop.location_name}
            </span>
          </div>
          <span style={{
            display: 'inline-block', fontSize: 11, fontWeight: 800,
            padding: '3px 10px', borderRadius: 999,
            background: isActive ? '#B4511E' : 'rgba(180,81,30,0.12)',
            color: isActive ? '#FDF6EE' : '#7A3A18',
          }}>
            {stop.status}
          </span>
        </div>
      )}
    </div>
  );
};

/* ── EXCLUSIVE / REQUESTED TOURS CARD ── */
// The joiner's latest Exclusive Tour and Request a Tour requests: where each
// one is (For Approval, Approved, Tour Confirmed, Rejected) and whether the
// tour package has arrived. Tapping one opens its page.
const REQUEST_STATUS_COLORS = {
  'For Approval': { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
  Approved: { bg: 'rgba(31,138,92,0.14)', color: '#1F6B47' },
  'Tour Confirmed': { bg: '#1A0A00', color: '#E8A265' },
  Rejected: { bg: 'rgba(140,47,28,0.12)', color: '#8C2F1C' },
};

const requestNote = (r, label) => {
  if (label === 'Rejected') return requestOverdueReason(r) || 'This request was not approved.';
  if (label === 'For Approval') return 'Waiting for Bandang IBAYO to review it.';
  if (label === 'Approved') return "Approved! We're preparing your tour package.";
  if (r.request_type === 'request') return 'Your tour is posted. Your slots are held, pay to confirm them.';
  const paid = requestPaymentLabel(r);
  return paid ? `Tour package sent · ${paid}` : 'Your tour package is ready. Open it to see the details and pay.';
};

const MyRequestsCard = ({ onOpen }) => {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (alive) setRows([]); return; }
      const { data } = await supabase
        .from('exclusive_requests')
        .select('id, request_type, destination, status, package_sent_at, preferred_date, preferred_end_date, created_at, payment_status, balance_settled')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);
      if (alive) setRows(data || []);
    })().catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);

  return (
    <div style={{
      background: '#FDF6EE', borderRadius: 22, padding: '1.5rem',
      border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Sparkles size={15} style={{ color: '#A8481A' }} />
        <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00' }}>
          Exclusive &amp; Requested Tours
        </span>
      </div>

      {rows === null ? (
        <SkeletonLines lines={3} label="Loading your requests" />
      ) : rows.length === 0 ? (
        <>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '0 0 12px' }}>
            No requests yet. Plan a private trip or ask us to open a tour.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['exclusive', 'Exclusive Tour'], ['request', 'Request a Tour']].map(([type, label]) => (
              <button key={type} type="button" onClick={() => onOpen(type)} style={{
                flex: '1 1 120px', padding: '9px 10px', borderRadius: 10, border: '1px solid rgba(180,81,30,0.3)', background: 'transparent',
                color: '#A8481A', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r) => {
            const label = requestStatusLabel(r);
            const tone = REQUEST_STATUS_COLORS[label] || REQUEST_STATUS_COLORS['For Approval'];
            return (
              <button key={r.id} type="button" onClick={() => onOpen(r.request_type)} style={{
                textAlign: 'left', width: '100%', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.14)', borderRadius: 14,
                padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 5,
              }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A' }}>
                    {r.request_type === 'request' ? 'Requested Tour' : 'Exclusive Tour'}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 900, padding: '2px 8px', borderRadius: 999, background: tone.bg, color: tone.color, whiteSpace: 'nowrap' }}>{label}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.destination || 'Tour request'}</span>
                {r.preferred_date && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <CalendarIcon size={11} style={{ color: '#A8481A' }} /> {formatYmdRange(r.preferred_date, r.preferred_end_date || r.preferred_date)}
                  </span>
                )}
                <span style={{ fontSize: 11.5, fontWeight: 700, color: label === 'Rejected' ? '#8C2F1C' : '#7A3A18', lineHeight: 1.4 }}>{requestNote(r, label)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── REVIEW PROMPT CARD ── */
// Homepage reviews block (under Latest Tour Packages): a few recent 4–5★
// reviews from other joiners, and a prompt to write one after a finished tour
// (gone once every finished tour has a review).
const HomeReviews = ({ loading, toReviewCount, onOpen }) => {
  const reviews = usePublicReviews(3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{ fontWeight: 900, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1A0A00', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Star size={15} style={{ color: '#A8481A' }} /> Reviews
        </h3>
        <button type="button" className="text-link" onClick={onOpen} style={{ background: 'none', border: 'none', padding: '4px 2px', fontSize: 13, whiteSpace: 'nowrap' }}>
          See all reviews
        </button>
      </div>

      {!loading && toReviewCount > 0 && (
        <button
          type="button"
          onClick={onOpen}
          className="clickable-card"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', textAlign: 'left',
            background: '#1A0A00', color: '#FDF6EE', border: 'none', borderRadius: 18, padding: '1rem 1.25rem', fontFamily: 'inherit',
          }}
        >
          <span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 900 }}>
              <Star size={15} fill="#E8A265" style={{ color: '#E8A265' }} />
              {toReviewCount} tour{toReviewCount === 1 ? '' : 's'} to review
            </span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(253,246,238,0.85)', marginTop: 3 }}>
              Tell other joiners how it went — it takes a minute.
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E8A265', whiteSpace: 'nowrap' }}>
            Write a review <ChevronRight size={14} />
          </span>
        </button>
      )}

      {reviews === null ? (
        <SkeletonRegion label="Loading reviews" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: '#FDF6EE', borderRadius: 18, padding: '1.1rem 1.2rem', border: '1px solid rgba(180,81,30,0.12)', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Skel w="40%" h={12} /><Skel w="95%" h={10} /><Skel w="80%" h={10} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}><Skel w={36} h={36} r={999} /><Skel w="45%" h={11} /></div>
            </div>
          ))}
        </SkeletonRegion>
      ) : reviews.length === 0 ? (
        <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', margin: 0 }}>
          No reviews yet. Joiners can review a tour once it's finished.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {reviews.map((r) => <ReviewCard key={r.id} review={r} compact />)}
        </div>
      )}
    </div>
  );
};

export {
  PulseStat,
  NextTripCard,
  TripReadinessCard,
  CalendarWidget,
  TrackingSnippet,
  MyRequestsCard,
  HomeReviews,
};
