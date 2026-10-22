import { useEffect, useState } from 'react';
import { QrCode, Download, CheckCircle2 } from 'lucide-react';

// ─────────────────────────────────────────────
// CHECK-IN QR (joiner's booking details)
// Each booking has its own random check-in code. On the day of the tour
// the coordinator scans this QR to confirm the joiner is on that tour's
// list. One QR covers everyone in the booking.
// ─────────────────────────────────────────────

const checkinPayload = (code) => `BANDANGIBAYO-CHECKIN:${code}`;

const CheckInQr = ({ booking, tourTitle, isPaymentConfirmed, tourEnded }) => {
  const [src, setSrc] = useState('');
  const code = booking.checkin_code;
  const show = Boolean(code) && isPaymentConfirmed && !tourEnded;

  useEffect(() => {
    if (!show) return undefined;
    let cancelled = false;
    // Loaded on demand so the QR library isn't in every page's bundle.
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(checkinPayload(code), { width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1A0A00', light: '#FFFFFF' } })
    ).then((url) => { if (!cancelled) setSrc(url); }).catch(() => {});
    return () => { cancelled = true; };
  }, [show, code]);

  if (tourEnded) return null;

  if (!isPaymentConfirmed) {
    return (
      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: 0, lineHeight: 1.6 }}>
        Your check-in QR will appear here once your payment is confirmed.
      </p>
    );
  }

  // Bookings get their code from the database update that adds check-in.
  if (!code) {
    return (
      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: 0, lineHeight: 1.6 }}>
        Your check-in QR isn't ready yet. Please check back later, or show your booking number <strong style={{ fontFamily: 'monospace', color: '#1A0A00' }}>{booking.booking_number}</strong> on the day of the tour.
      </p>
    );
  }

  const people = booking.slots_booked || 1;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ width: 150, height: 150, borderRadius: 14, background: '#FFFFFF', border: '1px solid rgba(180,81,30,0.2)', padding: 8, boxSizing: 'border-box', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {src ? <img src={src} alt={`Check-in QR for booking ${booking.booking_number}`} style={{ width: '100%', height: '100%' }} /> : <QrCode size={40} style={{ color: '#7A3A18' }} />}
      </div>
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        {booking.checked_in_at ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#2E6B4A', margin: '0 0 6px' }}>
            <CheckCircle2 size={15} /> Checked in at {new Date(booking.checked_in_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
          </p>
        ) : (
          <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: '0 0 6px' }}>Show this on the day of the tour</p>
        )}
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '0 0 10px', lineHeight: 1.6 }}>
          The coordinator scans it to confirm you're on the list. {people > 1 ? `One QR covers your whole group of ${people}.` : ''}
        </p>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', margin: '0 0 10px', fontFamily: 'monospace' }}>{booking.booking_number}</p>
        {src && (
          <a
            href={src}
            download={`bandang-ibayo-checkin-${booking.booking_number || 'qr'}.png`}
            className="text-link"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}
            title={tourTitle ? `Save the QR for ${tourTitle}` : 'Save the QR'}
          >
            <Download size={13} /> Save QR image
          </a>
        )}
      </div>
    </div>
  );
};

export default CheckInQr;
