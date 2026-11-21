import { useState } from 'react';
import { Bus, CalendarDays, Wallet, Globe, AlertTriangle, ChevronRight, TrendingUp } from 'lucide-react';
import { formatYmdRange } from './dateRange';

// ─────────────────────────────────────────────
// Admin Overview pieces: the greeting bar, the 6-month revenue chart and
// the slots-filled list of the tours leaving soon. AdminDashboard loads the
// numbers (fetchOverviewData) and passes them in.
// ─────────────────────────────────────────────

const peso = (n) => `₱${Math.round(Number(n) || 0).toLocaleString('en-PH')}`;
const manilaHour = () => Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false })) % 24;

// "Good morning, Ana" + today's date + what today holds, each a shortcut.
export const GreetingBar = ({ name, toursToday, payments, requests, loading, onOpen }) => {
  const h = manilaHour();
  const hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const first = String(name || '').trim().split(/\s+/)[0];
  const chips = [
    [CalendarDays, toursToday ? `${toursToday} tour${toursToday === 1 ? '' : 's'} leave${toursToday === 1 ? 's' : ''} today` : 'No tours leave today', 'Tracking Management', !!toursToday],
    [Wallet, payments ? `${payments} payment${payments === 1 ? '' : 's'} to check` : 'No payments to check', 'Booking Management', !!payments],
    [Globe, requests ? `${requests} request${requests === 1 ? '' : 's'} waiting` : 'No requests waiting', 'Private Tours', !!requests],
  ];
  return (
    <div className="dashboard-hero-padding" style={{ background: 'var(--ib-ink, #1A0A00)', borderRadius: 20, padding: '1.4rem 1.75rem', boxShadow: '0 8px 28px rgba(var(--ib-shadow-rgb, 26,10,0), 0.2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p className="journal-hand" style={{ margin: 0, fontSize: 30, lineHeight: 1.05, color: 'var(--ib-amber, #E8A265)' }}>{hello}{first ? `, ${first}` : ''}!</p>
        <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: 'rgba(var(--ib-soft-rgb, 232,210,190), 0.9)' }}>
          {new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chips.map(([icon, text, page, busy]) => { const Icon = icon; return (
          <button key={page} type="button" onClick={() => onOpen(page)} disabled={loading} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800,
            background: busy ? 'var(--ib-amber, #E8A265)' : 'rgba(255,255,255,0.08)', color: busy ? 'var(--ib-ink, #1A0A00)' : 'rgba(var(--ib-soft-rgb, 232,210,190), 0.95)',
            border: busy ? 'none' : '1px solid rgba(255,255,255,0.16)', opacity: loading ? 0.6 : 1,
          }}>
            <Icon size={14} /> {loading ? '…' : text}
          </button>
        ); })}
      </div>
    </div>
  );
};

const panel = {
  background: 'var(--ib-cream, #FDF6EE)', borderRadius: 20, border: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.12)',
  boxShadow: '0 4px 20px rgba(var(--ib-shadow-rgb, 26,10,0), 0.05)', padding: '1.1rem 1.35rem', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
};
const head = (icon, title, sub, action) => { const Icon = icon; return (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: 'var(--ib-ink, #1A0A00)', color: 'var(--ib-amber, #E8A265)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={16} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ib-rust, #7A3A18)' }}>{sub}</span>
      </span>
    </div>
    {action}
  </div>
); };
const viewAll = (onClick) => (
  <button type="button" onClick={onClick} className="text-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
    View all <ChevronRight size={14} />
  </button>
);

// Revenue (fully paid bookings) for the last 6 months: one bar per month,
// the current month highlighted. Point at (or tap) a bar for its amount.
export const RevenueChart = ({ months = [], loading, onViewAll }) => {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...months.map((m) => m.total));
  const total = months.reduce((n, m) => n + m.total, 0);
  const last = months.length - 1;
  const shown = hover ?? last;
  return (
    <section style={panel} aria-label="Revenue, last 6 months">
      {head(TrendingUp, 'Revenue, last 6 months', loading ? 'Loading…' : `${peso(total)} in all`, viewAll(onViewAll))}
      {loading ? <div className="skel" style={{ height: 150, borderRadius: 12 }} /> : (
        <>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ib-rust, #7A3A18)', minHeight: 18 }} aria-live="polite">
            {months[shown] ? <><strong style={{ color: 'var(--ib-dark, #1A0A00)' }}>{months[shown].label} {months[shown].year}</strong>: {peso(months[shown].total)}{shown === last ? ' so far' : ''}</> : null}
          </p>
          <div role="list" style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`, gap: 2, alignItems: 'end', height: 130, borderBottom: '1px solid rgba(var(--ib-accent-rgb, 180,81,30), 0.25)' }}
            onMouseLeave={() => setHover(null)}>
            {months.map((m, i) => (
              <button key={m.key} type="button" role="listitem" aria-label={`${m.label} ${m.year}: ${peso(m.total)}`}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)}
                style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'transparent', border: 'none', padding: '0 6px', cursor: 'pointer' }}>
                <span style={{
                  width: '100%', maxWidth: 42, height: `${Math.max(m.total ? 4 : 2, (m.total / max) * 100)}%`, borderRadius: '4px 4px 0 0',
                  background: 'var(--ib-sienna, #A8481A)', opacity: i === shown ? 1 : i === last ? 0.85 : 0.45, transition: 'opacity 0.15s',
                }} />
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`, gap: 2 }}>
            {months.map((m, i) => (
              <span key={m.key} style={{ textAlign: 'center', fontSize: 11, fontWeight: i === last ? 900 : 700, color: i === last ? 'var(--ib-dark, #1A0A00)' : 'var(--ib-rust, #7A3A18)' }}>{m.label}</span>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

// Tours leaving in the next 30 days: slots booked out of slots open, and a
// warning when the booked joiners don't fit the van picked for the tour.
export const SlotsPanel = ({ tours = [], loading, onOpenTour, onViewAll }) => (
  <section style={panel} aria-label="Slots filled, next 30 days">
    {head(Bus, 'Slots filled, next 30 days', loading ? 'Loading…' : `${tours.length} tour${tours.length === 1 ? '' : 's'} leaving`, viewAll(onViewAll))}
    {loading ? <div className="skel" style={{ height: 150, borderRadius: 12 }} />
      : tours.length === 0 ? <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ib-rust, #7A3A18)' }}>No tours in the next 30 days.</p>
      : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tours.map((t) => {
            const pct = t.capacity ? Math.min(100, Math.round((t.booked / t.capacity) * 100)) : 0;
            const full = t.capacity && t.booked >= t.capacity;
            const overVan = t.seats != null && t.booked > t.seats;
            return (
              <button key={t.id} type="button" onClick={() => onOpenTour(t.id)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 10, padding: '7px 6px', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ib-dark, #1A0A00)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ib-rust, #7A3A18)', flexShrink: 0 }}>{formatYmdRange(t.start_date, t.end_date)}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                  <span style={{ flex: 1, height: 7, borderRadius: 999, background: 'rgba(var(--ib-accent-rgb, 180,81,30), 0.14)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 999, background: full ? 'var(--ib-accent, #B4511E)' : 'var(--ib-sienna, #A8481A)' }} />
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--ib-dark, #1A0A00)', flexShrink: 0, minWidth: 44, textAlign: 'right' }}>{t.booked} / {t.capacity}</span>
                </span>
                {overVan && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: 11.5, fontWeight: 800, color: 'var(--ib-red, #8C2F1C)' }}>
                    <AlertTriangle size={12} /> {t.booked} joiners, but the van{t.plate ? ` (${t.plate})` : ''} has {t.seats} seats
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
  </section>
);
