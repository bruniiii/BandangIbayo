import { CloudRain } from 'lucide-react';

// Shown on every tour's details: the date can move for safety reasons.
const WeatherNotice = ({ compact = false }) => (
  <div role="note" style={{
    background: 'rgba(63,93,98,0.08)', border: '1px solid rgba(63,93,98,0.22)',
    borderRadius: compact ? 14 : 18, padding: compact ? '10px 12px' : '1.1rem 1.25rem',
    display: 'flex', gap: compact ? 10 : 14, alignItems: 'flex-start',
  }}>
    <CloudRain size={compact ? 17 : 21} style={{ color: '#3F5D62', flexShrink: 0, marginTop: 1 }} />
    <div style={{ minWidth: 0 }}>
      {!compact && (
        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#3F5D62', margin: '0 0 6px' }}>
          Weather &amp; safety
        </p>
      )}
      <p style={{ fontSize: compact ? 12 : 13, fontWeight: 700, lineHeight: 1.6, color: '#1A0A00', margin: 0 }}>
        The tour date may be postponed or cancelled because of bad weather (typhoons, heavy rain), road closures or
        other safety concerns. We'll tell you right away, and you can keep the new date, move to another date of the tour
        or get a 50% refund.
      </p>
    </div>
  </div>
);

export default WeatherNotice;
