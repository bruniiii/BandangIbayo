// Shared look for the System Maintenance tabs.
export const card = { background: '#FDF6EE', borderRadius: 20, border: '1px solid rgba(180,81,30,0.14)', padding: '1.25rem 1.5rem', boxShadow: '0 4px 20px rgba(26,10,0,0.06)' };
export const h3 = { display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px', fontSize: 13, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00' };
export const hint = { margin: '0 0 14px', fontSize: 12.5, fontWeight: 600, color: '#5C2A10', lineHeight: 1.5 };
export const row = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#F2E4D0', borderRadius: 14, padding: '12px 14px' };
export const btn = (main) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 12, cursor: 'pointer', flexShrink: 0,
  fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  background: main ? '#B4511E' : 'transparent', color: main ? '#FDF6EE' : '#5C2A10', border: main ? 'none' : '1px solid rgba(180,81,30,0.3)',
});
export const input = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(180,81,30,0.25)',
  background: '#FFFDF9', fontFamily: 'inherit', fontSize: 14, color: '#1A0A00',
};
export const label = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A3A18' };
export const when = (d) => (d ? new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const spin = { animation: 'spin 1s linear infinite' };

// Table names in the activity log, in plain words.
export const TABLE_NAMES = {
  tours: 'Tour', tour_rates: 'Regular Rate', tour_expenses: 'Tour expenses', bookings: 'Booking', exclusive_requests: 'Private tour / request',
  feed_posts: 'Feed post', pickup_spots: 'Pickup spot', fleet_drivers: 'Driver', fleet_vans: 'Van', tour_vehicles: 'Tour driver & van',
  app_settings: 'Setting', tour_templates: 'Tour template', profiles: 'Account', booking_rules: 'Booking rules', suppliers: 'Supplier',
};
