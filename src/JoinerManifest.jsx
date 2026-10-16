import { useEffect, useState } from 'react';
import { Download, Printer, X, Loader2, MapPin, Truck, Users } from 'lucide-react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { formatDateRange, formatPeso } from './tourUtils';
import EmptyState from './ui/EmptyState';
import { UsersRound } from 'lucide-react';
import { SkeletonRows } from './ui/Skeleton';

// ─────────────────────────────────────────────
// JOINER LIST (manifest) for one tour, for drivers and guides.
// Everyone on an active booking: the person who booked plus their
// companions, with contact numbers, payment status and balance due,
// plus the tour's pickup points and vehicle. Download as CSV, or
// print / save as PDF from the browser's print dialog.
// ─────────────────────────────────────────────

const balanceDue = (b) =>
  b.payment_method === 'Downpayment' && !b.balance_settled
    ? Math.max(0, (b.total_price || 0) - (b.amount_paid || 0))
    : 0;

const peso = formatPeso;

// One row per person.
const toPeople = (bookings) => bookings.flatMap((b) => [
  {
    name: b.full_name, contact: b.contact_number, booking: b.booking_number,
    role: 'Booked', payment: b.payment_status, balance: balanceDue(b),
  },
  ...(b.companions || []).map((c) => ({
    name: c.full_name, contact: c.contact_number, booking: b.booking_number,
    role: `With ${b.full_name}`, payment: '', balance: 0,
  })),
]);

const csvCell = (v) => {
  const s = String(v ?? '');
  // Stop spreadsheet apps from treating a cell as a formula.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const JoinerListModal = ({ tour, onClose }) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: bookings, error }, { data: stops }, { data: vehicle }] = await Promise.all([
        supabase
          .from('bookings')
          .select('booking_number, full_name, contact_number, email, slots_booked, companions, payment_status, payment_method, total_price, amount_paid, balance_settled, created_at')
          .eq('tour_id', tour.id)
          .not('booking_status', 'in', '("Cancelled","Rejected")')
          .order('created_at', { ascending: true }),
        supabase.from('tour_meetups').select('location_name, scheduled_time, note').eq('tour_id', tour.id).order('created_at', { ascending: true }),
        supabase.from('tour_vehicles').select('car_type, plate_number, driver_name, driver_contact').eq('tour_id', tour.id).maybeSingle(),
      ]);
      if (error) console.error('Error loading joiner list:', error.message);
      if (active) setData({ bookings: bookings || [], stops: stops || [], vehicle: vehicle || null });
    })();
    return () => { active = false; };
  }, [tour.id]);

  const people = data ? toPeople(data.bookings) : [];
  const fileBase = `joiners-${(tour.title || 'tour').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${tour.start_date}`;

  const downloadCsv = () => {
    const lines = [
      [tour.title, formatDateRange(tour.start_date, tour.duration), tour.destination],
      [],
      ['#', 'Name', 'Contact number', 'Booking number', 'Booked / with', 'Payment status', 'Balance due'],
      ...people.map((p, i) => [i + 1, p.name, p.contact, p.booking, p.role, p.payment, p.balance ? p.balance : '']),
      [],
      ['Pickup point', 'ETA', 'Note'],
      ...data.stops.map((s) => [s.location_name, s.scheduled_time, s.note]),
    ];
    if (data.vehicle) {
      lines.push([], ['Vehicle', 'Plate number', 'Driver', 'Driver contact'],
        [data.vehicle.car_type, data.vehicle.plate_number, data.vehicle.driver_name, data.vehicle.driver_contact]);
    }
    // BOM so Excel reads ₱ and ñ correctly.
    const blob = new Blob(['﻿' + lines.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBase}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printList = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Pop-up blocked', 'Please allow pop-ups for this site to print the joiner list.'); return; }
    const v = data.vehicle;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileBase)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #1A0A00; margin: 24px; font-size: 12px; }
        h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .08em; }
        table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
        th { background: #F2E4D0; } .muted { color: #7A3A18; } .box { width: 16px; }
      </style></head><body>
      <h1>${esc(tour.title)}</h1>
      <div class="muted">${esc(formatDateRange(tour.start_date, tour.duration))} · ${esc(tour.destination)} · ${people.length} joiner${people.length === 1 ? '' : 's'}</div>
      ${v ? `<h2>Vehicle</h2><div>${esc(v.car_type)} · Plate ${esc(v.plate_number)} · Driver ${esc(v.driver_name)} (${esc(v.driver_contact)})</div>` : ''}
      ${data.stops.length ? `<h2>Pickup points</h2><table><tr><th>Pickup point</th><th>ETA</th><th>Note</th></tr>${data.stops.map((s) => `<tr><td>${esc(s.location_name)}</td><td>${esc(s.scheduled_time)}</td><td>${esc(s.note)}</td></tr>`).join('')}</table>` : ''}
      <h2>Joiners</h2>
      <table><tr><th class="box">✓</th><th>#</th><th>Name</th><th>Contact</th><th>Booking</th><th>Booked / with</th><th>Payment</th><th>Balance due</th></tr>
      ${people.map((p, i) => `<tr><td class="box"></td><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.contact)}</td><td>${esc(p.booking)}</td><td>${esc(p.role)}</td><td>${esc(p.payment)}</td><td>${p.balance ? esc(peso(p.balance)) : ''}</td></tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.8)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#FDF6EE', width: '100%', maxWidth: 820, maxHeight: '90dvh', borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderTop: '8px solid #B4511E' }}>
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(180,81,30,0.15)' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: 0 }}>Joiner List</p>
            <h3 style={{ fontSize: 18, fontWeight: 900, color: '#1A0A00', margin: '4px 0 2px', overflowWrap: 'anywhere' }}>{tour.title}</h3>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: 0 }}>{formatDateRange(tour.start_date, tour.duration)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}><X size={22} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!data ? (
            <SkeletonRows count={5} boxed={false} label="Loading joiner list" />
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button type="button" onClick={downloadCsv} style={actionButton('#1A0A00')}><Download size={14} /> Download CSV</button>
                <button type="button" onClick={printList} style={actionButton('#A8481A')}><Printer size={14} /> Print / Save as PDF</button>
              </div>

              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#1A0A00', margin: 0 }}>
                <Users size={14} style={{ color: '#A8481A' }} /> {people.length} joiner{people.length === 1 ? '' : 's'} on {data.bookings.length} booking{data.bookings.length === 1 ? '' : 's'}
              </p>

              {data.vehicle && (
                <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: 0 }}>
                  <Truck size={14} style={{ color: '#A8481A' }} /> {data.vehicle.car_type} · {data.vehicle.plate_number} · {data.vehicle.driver_name} ({data.vehicle.driver_contact})
                </p>
              )}

              {data.stops.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {data.stops.map((s, i) => (
                    <p key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: 0 }}>
                      <MapPin size={13} style={{ color: '#A8481A', flexShrink: 0 }} /> {s.location_name} · {s.scheduled_time}{s.note ? ` · ${s.note}` : ''}
                    </p>
                  ))}
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['#', 'Name', 'Contact', 'Booking', 'Booked / with', 'Payment', 'Balance'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', background: '#F2E4D0', color: '#7A3A18', fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(180,81,30,0.1)' }}>
                        <td style={cell}>{i + 1}</td>
                        <td style={{ ...cell, fontWeight: 800, color: '#1A0A00' }}>{p.name}</td>
                        <td style={cell}>{p.contact}</td>
                        <td style={{ ...cell, fontFamily: 'monospace' }}>{p.booking}</td>
                        <td style={cell}>{p.role}</td>
                        <td style={cell}>{p.payment}</td>
                        <td style={cell}>{p.balance ? peso(p.balance) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {people.length === 0 && (
                  <EmptyState compact icon={UsersRound} title="No joiners yet" message="Confirmed joiners for this tour will be listed here." />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const cell = { padding: '8px 10px', color: '#7A3A18', fontWeight: 600, whiteSpace: 'nowrap' };

const actionButton = (bg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
  background: bg, color: '#FDF6EE', border: 'none', borderRadius: 12, cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase',
});

export default JoinerListModal;
