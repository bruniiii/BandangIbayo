import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ListChecks } from 'lucide-react';
import { supabase } from '../supabaseClient';

// ─────────────────────────────────────────────
// Tracking → a tour's "ready for tour day?" checklist: driver and van saved,
// the driver's ID on file, the driver link made, everyone paid in full, and
// at least one joiner booked. Green ✓ or a grey circle for each.
// ─────────────────────────────────────────────

const TourDayChecklist = ({ tourId, logisticsSaved, docsReady }) => {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!tourId) return undefined;
    let alive = true;
    Promise.all([
      supabase.from('tour_driver_links').select('tour_id').eq('tour_id', tourId).maybeSingle(),
      supabase.from('bookings').select('id, payment_method, balance_settled, slots_booked').eq('tour_id', tourId).eq('payment_status', 'Complete').not('booking_status', 'in', '("Cancelled","Rejected")'),
    ]).then(([link, paid]) => {
      if (!alive) return;
      const rows = paid.data || [];
      setInfo({
        link: !!link.data,
        joiners: rows.reduce((n, b) => n + (b.slots_booked || 1), 0),
        owing: rows.filter((b) => b.payment_method === 'Downpayment' && !b.balance_settled).length,
      });
    });
    return () => { alive = false; };
  }, [tourId, logisticsSaved]);

  if (!info) return null;
  const items = [
    [logisticsSaved, 'Driver and van saved'],
    [docsReady, "Driver's license/ID and photo on file"],
    [info.link, 'Driver link made (send it to the driver)'],
    [info.joiners > 0, info.joiners ? `${info.joiners} joiner${info.joiners === 1 ? '' : 's'} booked` : 'No paid joiners yet'],
    [info.owing === 0, info.owing ? `${info.owing} booking${info.owing === 1 ? '' : 's'} still owe a balance` : 'Everyone paid in full'],
  ];
  const done = items.filter(([ok]) => ok).length;

  return (
    <div style={{ background: '#FFF', padding: '1rem 1.25rem', borderRadius: 16, border: `1px solid ${done === items.length ? 'rgba(46,155,95,0.4)' : 'rgba(180,81,30,0.15)'}`, marginBottom: 18 }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 10px', fontSize: 11.5, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A' }}>
        <ListChecks size={14} /> Tour-day checklist · {done}/{items.length}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {items.map(([ok, text]) => (
          <li key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: ok ? '#1B5E3B' : '#5C2A10' }}>
            {ok ? <CheckCircle2 size={16} color="#2E9B5F" /> : <Circle size={16} color="#B4511E" />} {text}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TourDayChecklist;
