import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { formatDateRange, formatPeso, todayManila } from './tourUtils';
import CheckInQr from './ui/CheckInQr';
import { Skel } from './ui/Skeleton';
import { daysBetween } from './tripDay';
import PackingChecklist from './ui/PackingChecklist';
import { MapPin, Clock, Bus, Phone, Backpack, Wallet, ExternalLink, AlertCircle } from 'lucide-react';

// ─────────────────────────────────────────────
// TRIP DAY CARD (My Bookings)
// Shown from the day before a confirmed trip until it ends: everything a
// joiner needs on the day in one place. Pickup points and the driver come
// from Tracking Management (tour_meetups, tour_vehicles), so the admin
// doesn't fill anything in twice.
// ─────────────────────────────────────────────

const whenLabel = (tour) => {
  const today = todayManila();
  const until = daysBetween(today, tour.start_date);
  if (until > 1) return `In ${until} days`;
  if (until === 1) return 'Tomorrow';
  if (until === 0) return 'Today';
  const day = -until + 1;
  const total = Math.max(1, daysBetween(tour.start_date, tour.end_date || tour.start_date) + 1);
  return `Happening now · Day ${day} of ${total}`;
};

const mapLink = (place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

const Section = ({ icon, title, children }) => (
  <div>
    <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 8px' }}>
      {icon} {title}
    </p>
    {children}
  </div>
);

const muted = { fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: 0, lineHeight: 1.6 };

const TripDayCard = ({ booking }) => {
  const tour = booking.tours;
  const [details, setDetails] = useState(null); // { stops, vehicle }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: stops }, { data: vehicle }] = await Promise.all([
        supabase.from('tour_meetups').select('*').eq('tour_id', booking.tour_id).order('created_at', { ascending: true }),
        supabase.from('tour_vehicles').select('*').eq('tour_id', booking.tour_id).maybeSingle(),
      ]);
      if (!cancelled) setDetails({ stops: stops || [], vehicle: vehicle || null });
    })();
    return () => { cancelled = true; };
  }, [booking.tour_id]);

  const items = (tour.things_to_bring || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const balance = booking.payment_method === 'Downpayment' && !booking.balance_settled
    ? Math.max(0, (booking.total_price || 0) - (booking.amount_paid || 0)) : 0;
  const vehicle = details?.vehicle;

  return (
    <section aria-label={`Day trip: ${tour.title}`} style={{
      background: '#FDF6EE', borderRadius: 24, overflow: 'hidden',
      border: '1px solid rgba(180,81,30,0.18)', boxShadow: '0 10px 32px rgba(26,10,0,0.10)',
    }}>
      {/* header */}
      <div style={{ background: '#1A0A00', color: '#FDF6EE', padding: '1.1rem 1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E8A265', margin: 0 }}>Day trip</p>
          <h3 style={{ fontSize: 20, color: '#FDF6EE', margin: '4px 0 2px', lineHeight: 1.2 }}>{tour.title}</h3>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(253,246,238,0.85)', margin: 0 }}>
            {formatDateRange(tour.start_date, tour.duration)} · {booking.slots_booked || 1} {booking.slots_booked === 1 ? 'person' : 'persons'} · {booking.booking_number}
          </p>
        </div>
        <span style={{ background: '#B4511E', color: '#FDF6EE', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }}>
          {whenLabel(tour)}
        </span>
      </div>

      <div className="trip-day-grid" style={{ padding: '1.25rem 1.4rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.25rem 1.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <Section icon={<MapPin size={13} />} title="Pickup points">
            {booking.pickup_point && (
              <p style={{ fontSize: 13, fontWeight: 800, color: '#2E6B4A', background: 'rgba(46,107,74,0.1)', borderRadius: 12, padding: '9px 12px', margin: '0 0 8px' }}>
                Your pickup point: {booking.pickup_point}
              </p>
            )}
            {!details ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Skel w="80%" h={12} /><Skel w="60%" h={12} /></div>
            ) : details.stops.length ? (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {details.stops.map((s) => (
                  <li key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(180,81,30,0.06)', borderRadius: 12, padding: '9px 12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{s.location_name}</p>
                      <p style={{ ...muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={12} /> {s.scheduled_time || 'Time to follow'}{s.note ? ` · ${s.note}` : ''}
                      </p>
                    </div>
                    <a className="text-link" href={mapLink(s.location_name)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, flexShrink: 0 }}>
                      Map <ExternalLink size={11} />
                    </a>
                  </li>
                ))}
              </ol>
            ) : (
              <p style={muted}>Pickup points and times will be posted here before the trip. We'll notify you.</p>
            )}
          </Section>

          <Section icon={<Bus size={13} />} title="Driver & vehicle">
            {!details ? <Skel w="70%" h={12} /> : vehicle ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1A0A00', margin: 0 }}>
                  {[vehicle.vehicle_color ? `${vehicle.vehicle_color} ${vehicle.car_type || 'vehicle'}` : vehicle.car_type, vehicle.plate_number && `Plate ${vehicle.plate_number}`, vehicle.driver_name].filter(Boolean).join(' · ') || 'Assigned soon'}
                </p>
                {vehicle.vehicle_notes && (
                  <p style={{ ...muted, width: '100%' }}>How to spot it: {vehicle.vehicle_notes}</p>
                )}
                {vehicle.driver_contact && (
                  <a className="text-link" href={`tel:${String(vehicle.driver_contact).replace(/[^\d+]/g, '')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                    <Phone size={13} /> Call {vehicle.driver_contact}
                  </a>
                )}
              </div>
            ) : (
              <p style={muted}>The driver and vehicle will be posted here before the trip.</p>
            )}
          </Section>

          {items.length > 0 && (
            <Section icon={<Backpack size={13} />} title="Things to bring">
              <PackingChecklist bookingId={booking.id} text={tour.things_to_bring} />
            </Section>
          )}

          {balance > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(140,47,28,0.08)', border: '1px solid rgba(140,47,28,0.2)', borderRadius: 14, padding: '10px 12px' }}>
              <Wallet size={16} style={{ color: '#8C2F1C', flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: '#8C2F1C', margin: 0, lineHeight: 1.5 }}>
                Balance of {formatPeso(balance)} is due on the day. You can pay it online from your booking below, or in cash/GCash on the day.
              </p>
            </div>
          )}

          {tour.important_note && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertCircle size={16} style={{ color: '#A8481A', flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 12.5, fontWeight: 700, color: '#1A0A00', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{tour.important_note}</p>
            </div>
          )}
        </div>

        <Section icon={null} title="Your check-in QR">
          <CheckInQr booking={booking} tourTitle={tour.title} isPaymentConfirmed tourEnded={false} />
        </Section>
      </div>
    </section>
  );
};

export default TripDayCard;
