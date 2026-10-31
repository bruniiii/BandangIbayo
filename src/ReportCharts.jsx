import React, { useState } from 'react';
import { formatPeso } from './tourUtils';
import { TrendingUp, TrendingDown } from 'lucide-react';

// ─────────────────────────────────────────────
// REPORTS: charts and small building blocks used on the Reports page
// (month comparison, forecast, bar / donut / funnel charts, metric cards).
// ─────────────────────────────────────────────

const peso = formatPeso;

// This month vs. last month as two lines: running totals by day of the month.
const COMPARISON_METRICS = [
  { key: 'bookings', label: 'Bookings', change: 'bookingsChangePct', format: (v) => String(v) },
  { key: 'revenue', label: 'Revenue', change: 'revenueChangePct', format: (v) => peso(v) },
  { key: 'pax', label: 'Pax', change: 'paxChangePct', format: (v) => String(v) },
  { key: 'cancellations', label: 'Cancellations', change: 'cancellationChangePct', format: (v) => String(v), lowerIsBetter: true },
];

const MonthComparisonChart = ({ comparison }) => {
  const [metricKey, setMetricKey] = useState('bookings');
  const [hoverDay, setHoverDay] = useState(null);
  const metric = COMPARISON_METRICS.find((m) => m.key === metricKey);
  const { thisMonth, lastMonth } = comparison.series[metricKey];
  const days = Math.max(thisMonth.length, lastMonth.length, 1);
  const lastDay = Math.max(lastMonth.length, 28);
  const max = Math.max(1, ...thisMonth, ...lastMonth);
  const W = 640, H = 200, padL = 46, padR = 14, padT = 14, padB = 28;
  const x = (i) => padL + (i / Math.max(1, lastDay - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const change = comparison[metric.change];
  const good = metric.lowerIsBetter ? change <= 0 : change >= 0;
  // Gridlines at 0, half and the top (once each: with a top of 1, half rounds to 1 too).
  const ticks = [...new Set([0, 0.5, 1].map((t) => Math.round(max * t)))];
  const thisTotal = thisMonth[thisMonth.length - 1] || 0;
  const lastTotal = lastMonth[lastMonth.length - 1] || 0;
  const hover = hoverDay != null ? { day: hoverDay + 1, now: thisMonth[hoverDay], before: lastMonth[hoverDay] } : null;

  return (
    <div>
      <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {COMPARISON_METRICS.map((m) => (
          <button key={m.key} type="button" aria-pressed={metricKey === m.key} onClick={() => setMetricKey(m.key)} style={{
            padding: '7px 14px', borderRadius: 999, cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontWeight: 900,
            fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: metricKey === m.key ? '#1A0A00' : '#F2E4D0', color: metricKey === m.key ? '#FDF6EE' : '#7A3A18',
          }}>{m.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>
          <span style={{ width: 18, height: 3, borderRadius: 2, background: '#B4511E' }} />
          {comparison.thisMonthLabel} (so far): {metric.format(thisTotal)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#7A3A18' }}>
          <span style={{ width: 18, height: 0, borderTop: '3px dashed rgba(122,58,24,0.6)' }} />
          {comparison.lastMonthLabel}: {metric.format(lastTotal)}
        </span>
        <span style={{ fontSize: 12, fontWeight: 900, color: good ? '#2E6B4A' : '#8C2F1C' }}>
          {change >= 0 ? '+' : ''}{change}% vs last month
        </span>
      </div>

      <div style={{ position: 'relative', maxWidth: 720 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 720, height: 'auto', display: 'block' }} role="img"
          aria-label={`${metric.label}: ${comparison.thisMonthLabel} ${metric.format(thisTotal)} so far, ${comparison.lastMonthLabel} ${metric.format(lastTotal)}`}
          onMouseLeave={() => setHoverDay(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - padL) / (W - padL - padR)) * (lastDay - 1));
            setHoverDay(i >= 0 && i < days ? i : null);
          }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="rgba(180,81,30,0.12)" />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#7A3A18">
                {metricKey === 'revenue' && t >= 1000 ? `₱${Math.round(t / 1000)}k` : t}
              </text>
            </g>
          ))}
          {[1, 8, 15, 22, lastDay].map((d) => (
            <text key={d} x={x(d - 1)} y={H - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill="#7A3A18">{d}</text>
          ))}
          <path d={path(lastMonth)} fill="none" stroke="rgba(122,58,24,0.55)" strokeWidth="2.5" strokeDasharray="6 5" strokeLinejoin="round" />
          <path d={path(thisMonth)} fill="none" stroke="#B4511E" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {thisMonth.length > 0 && <circle cx={x(thisMonth.length - 1)} cy={y(thisTotal)} r="4.5" fill="#B4511E" />}
          {hover && (
            <line x1={x(hover.day - 1)} x2={x(hover.day - 1)} y1={padT} y2={H - padB} stroke="rgba(26,10,0,0.25)" strokeDasharray="3 3" />
          )}
        </svg>
        {hover && (
          <div style={{
            position: 'absolute', top: 6, left: `${(x(hover.day - 1) / W) * 100}%`, transform: 'translateX(-50%)', pointerEvents: 'none',
            background: '#1A0A00', color: '#FDF6EE', borderRadius: 10, padding: '6px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            Day {hover.day}: {hover.now != null ? metric.format(hover.now) : '—'} vs {hover.before != null ? metric.format(hover.before) : '—'}
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0' }}>Running totals by day of the month.</p>
    </div>
  );
};

// Last 6 months as a solid line, then a dashed line to next month's forecast
// (a weighted average of the last three months).
const ForecastChart = ({ forecast }) => {
  const [metric, setMetric] = useState('bookings');
  const [hover, setHover] = useState(null);
  const isRevenue = metric === 'revenue';
  const fmt = (v) => (isRevenue ? peso(v) : String(v));
  const actual = forecast.history.map((h) => h[metric]);
  const predicted = isRevenue ? forecast.expectedRevenue : forecast.expectedBookings;
  const labels = [...forecast.history.map((h) => h.label), forecast.nextLabel];
  const values = [...actual, predicted];
  const max = Math.max(1, ...values);
  const W = 640, H = 200, padL = 46, padR = 18, padT = 14, padB = 28;
  const x = (i) => padL + (i / (labels.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const line = (pts) => pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = actual.length - 1;
  // Gridlines at 0, half and the top (once each: with a top of 1, half rounds to 1 too).
  const ticks = [...new Set([0, 0.5, 1].map((t) => Math.round(max * t)))];

  return (
    <div>
      <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['bookings', 'Bookings'], ['revenue', 'Revenue']].map(([key, label]) => (
          <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)} style={{
            padding: '7px 14px', borderRadius: 999, cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontWeight: 900,
            fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: metric === key ? '#1A0A00' : '#F2E4D0', color: metric === key ? '#FDF6EE' : '#7A3A18',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>
          <span style={{ width: 18, height: 3, borderRadius: 2, background: '#B4511E' }} /> Actual
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#7A3A18' }}>
          <span style={{ width: 18, height: 0, borderTop: '3px dashed #E8A265' }} /> Expected in {forecast.nextLabel}: {fmt(predicted)}
        </span>
      </div>

      <div style={{ position: 'relative', maxWidth: 720 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 720, height: 'auto', display: 'block' }} role="img"
          aria-label={`${isRevenue ? 'Revenue' : 'Bookings'} for the last 6 months, and ${fmt(predicted)} expected in ${forecast.nextLabel}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - padL) / (W - padL - padR)) * (labels.length - 1));
            setHover(i >= 0 && i < labels.length ? i : null);
          }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="rgba(180,81,30,0.12)" />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#7A3A18">
                {isRevenue && t >= 1000 ? `₱${Math.round(t / 1000)}k` : t}
              </text>
            </g>
          ))}
          {labels.map((l, i) => (
            <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fontWeight={i === labels.length - 1 ? 900 : 700} fill={i === labels.length - 1 ? '#A8481A' : '#7A3A18'}>{l}</text>
          ))}
          <path d={line(actual.map((v, i) => [i, v]))} fill="none" stroke="#B4511E" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <path d={line([[last, actual[last]], [labels.length - 1, predicted]])} fill="none" stroke="#E8A265" strokeWidth="3" strokeDasharray="6 5" />
          {actual.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#B4511E" />)}
          <circle cx={x(labels.length - 1)} cy={y(predicted)} r="5" fill="#FDF6EE" stroke="#E8A265" strokeWidth="3" />
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="rgba(26,10,0,0.25)" strokeDasharray="3 3" />}
        </svg>
        {hover != null && (
          <div style={{
            position: 'absolute', top: 6, left: `${(x(hover) / W) * 100}%`, transform: 'translateX(-50%)', pointerEvents: 'none',
            background: '#1A0A00', color: '#FDF6EE', borderRadius: 10, padding: '6px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            {labels[hover]}: {fmt(values[hover])}{hover === labels.length - 1 ? ' (expected)' : hover === last ? ' (so far)' : ''}
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0' }}>
        The forecast is a weighted average of the last three months. This month counts what's booked so far.
      </p>
    </div>
  );
};

const BarChart = ({ data, color = '#A8481A', height = 180 }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  const showEveryLabel = data.length <= 14;
  const labelStep = showEveryLabel ? 1 : Math.ceil(data.length / 10);

  if (data.length === 0) {
    return <EmptyChartNotice />;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.length > 40 ? 3 : 8, height, overflowX: 'auto', paddingBottom: 6 }}>
      {data.map((d, i) => (
        <div
          key={d.key || i}
          title={`${d.label}: ${d.value}`}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-end', minWidth: data.length > 40 ? 8 : 24,
            flex: 1, height: '100%',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: '#1A0A00', opacity: d.value ? 0.7 : 0, marginBottom: 4 }}>
            {d.value || ''}
          </span>
          <div style={{
            width: '100%', maxWidth: 28,
            height: `${Math.max(2, (d.value / max) * (height - 46))}px`,
            background: d.value === 0 ? 'rgba(180,81,30,0.12)' : color,
            borderRadius: '6px 6px 2px 2px',
            transition: 'height 0.3s',
          }} />
          <span style={{
            fontSize: 11, fontWeight: 800, color: '#7A3A18', opacity: 0.9,
            marginTop: 8, whiteSpace: 'nowrap',
          }}>
            {i % labelStep === 0 ? d.label : ''}
          </span>
        </div>
      ))}
    </div>
  );
};

const HorizontalBarChart = ({ data, color = '#A8481A', onBarClick, activeLabel }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <EmptyChartNotice />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.map((d, i) => (
        <div
          key={i}
          onClick={onBarClick ? () => onBarClick(d.label) : undefined}
          style={{ cursor: onBarClick ? 'pointer' : 'default', opacity: activeLabel && activeLabel !== d.label ? 0.45 : 1 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00' }}>{d.label}</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#A8481A' }}>{d.value}</span>
          </div>
          <div style={{ background: '#F2E4D0', borderRadius: 999, height: 10, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999,
              width: `${(d.value / max) * 100}%`,
              background: color, transition: 'width 0.4s',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const DonutChart = ({ segments, size = 140, thickness = 20, onSegmentClick, activeKey }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <EmptyChartNotice />;

  // Each segment runs from the total of the ones before it to that plus its own value.
  const stops = segments.map((seg, i) => {
    const before = segments.slice(0, i).reduce((sum, s) => sum + s.value, 0);
    const startPct = (before / total) * 100;
    const endPct = ((before + seg.value) / total) * 100;
    return `${seg.color} ${startPct}% ${endPct}%`;
  }).join(', ');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `conic-gradient(${stops})`,
        position: 'relative', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', inset: thickness,
          background: '#FDF6EE', borderRadius: '50%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: '#1A0A00', lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#7A3A18', opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>
            Total
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {segments.map((seg, i) => (
          <div
            key={i}
            onClick={onSegmentClick ? () => onSegmentClick(seg.key || seg.label) : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, fontWeight: 700, color: '#1A0A00',
              cursor: onSegmentClick ? 'pointer' : 'default',
              opacity: activeKey && activeKey !== (seg.key || seg.label) ? 0.45 : 1,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            {seg.label}
            <span style={{ opacity: 0.68, fontWeight: 700 }}>
              ({seg.value} · {Math.round((seg.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const FunnelChart = ({ steps }) => {
  const max = Math.max(1, steps[0]?.value || 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((s, i) => {
        const widthPct = Math.max(8, (s.value / max) * 100);
        const dropOff = i > 0 && steps[i - 1].value > 0 ? Math.round(((steps[i - 1].value - s.value) / steps[i - 1].value) * 100) : null;
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#A8481A' }}>
                {s.value}{dropOff !== null && dropOff > 0 && <span style={{ color: '#8C2F1C', fontWeight: 700, marginLeft: 6, fontSize: 11.5 }}>-{dropOff}%</span>}
              </span>
            </div>
            <div style={{ width: `${widthPct}%`, minWidth: 60, height: 32, background: '#1A0A00', borderRadius: 10, opacity: 0.85 - i * 0.12, transition: 'width 0.4s' }} />
          </div>
        );
      })}
    </div>
  );
};

const EmptyChartNotice = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '2.5rem 0', color: '#7A3A18',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  }}>
    No data for this range
  </div>
);

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const SectionTitle = ({ icon, children }) => (
  <h4 style={{
    fontSize: 11, fontWeight: 900, letterSpacing: '0.22em',
    textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9,
    margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: 7,
  }}>
    <span style={{ color: '#A8481A' }}>{icon}</span> {children}
  </h4>
);

const MiniMetric = ({ label, value, trend, trendLabel, tone, compact, showValueless, invertTrendColor }) => {
  const trendGood = invertTrendColor ? (trend ?? 0) <= 0 : (trend ?? 0) >= 0;
  return (
    <div style={{
      background: tone === 'warn' ? 'rgba(140,47,28,0.06)' : '#F2E4D0',
      borderRadius: 14, padding: compact ? '10px 14px' : '14px 18px',
    }}>
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9, margin: '0 0 6px' }}>
        {label}
      </p>
      {!showValueless && (
        <p style={{ fontSize: compact ? 16 : 20, fontWeight: 900, color: tone === 'warn' ? '#8C2F1C' : '#1A0A00', margin: 0, letterSpacing: '-0.02em' }}>
          {value}
        </p>
      )}
      {trend !== undefined && trend !== null && (
        <p style={{
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800,
          color: trendGood ? '#A8481A' : '#8C2F1C', margin: showValueless ? 0 : '4px 0 0',
        }}>
          {trendGood ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trend >= 0 ? '+' : ''}{trend}% {trendLabel || ''}
        </p>
      )}
    </div>
  );
};

const HighlightCard = ({ icon, label, title, sub, tone }) => (
  <div style={{
    background: tone === 'good' ? 'rgba(180,81,30,0.08)' : 'rgba(140,47,28,0.06)',
    border: `1px solid ${tone === 'good' ? 'rgba(180,81,30,0.2)' : 'rgba(140,47,28,0.18)'}`,
    borderRadius: 16, padding: '1.1rem 1.3rem', display: 'flex', gap: 12, alignItems: 'flex-start',
  }}>
    <span style={{ color: tone === 'good' ? '#A8481A' : '#8C2F1C', flexShrink: 0, marginTop: 2 }}>{icon}</span>
    <div>
      <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: tone === 'good' ? '#A8481A' : '#8C2F1C', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 900, color: '#1A0A00', margin: '0 0 2px' }}>{title}</p>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: 0 }}>{sub}</p>
    </div>
  </div>
);

const ExportButton = ({ icon, label, onClick, disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      opacity: disabled ? 0.55 : 1,
      display: 'flex', alignItems: 'center', gap: 7,
      background: '#1A0A00', color: '#E8A265', border: 'none', borderRadius: 999,
      padding: '10px 18px', fontFamily: 'inherit', fontWeight: 900,
      fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: '0 4px 14px rgba(26,10,0,0.2)',
    }}
  >
    {icon} {label}
  </button>
);

export {
  COMPARISON_METRICS,
  MonthComparisonChart,
  ForecastChart,
  BarChart,
  HorizontalBarChart,
  DonutChart,
  FunnelChart,
  EmptyChartNotice,
  SectionTitle,
  MiniMetric,
  HighlightCard,
  ExportButton,
};
