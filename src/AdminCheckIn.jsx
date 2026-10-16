import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import EmptyState from './ui/EmptyState';
import { primaryBtn, secondaryBtn } from './ui/buttons';
import { formatDateRange, todayManila } from './tourUtils';
import {
  ScanLine, Camera, CameraOff, CheckCircle2, AlertTriangle, XCircle, Users, Undo2, Loader2, Search,
} from 'lucide-react';

// ─────────────────────────────────────────────
// CHECK-IN (admin)
// On the day of the tour, pick the tour and scan each joiner's QR (from
// My Bookings). The database confirms the booking belongs to this tour,
// is paid and not cancelled, then marks it checked in. A booking number
// can be typed instead when a phone can't show the QR.
// ─────────────────────────────────────────────

const RESULT_STYLES = {
  ok: { bg: 'rgba(46,107,74,0.1)', border: '#2E6B4A', color: '#2E6B4A', Icon: CheckCircle2 },
  already: { bg: 'rgba(154,91,30,0.1)', border: '#9A5B1E', color: '#8C5216', Icon: AlertTriangle },
  bad: { bg: 'rgba(140,47,28,0.08)', border: '#8C2F1C', color: '#8C2F1C', Icon: XCircle },
};

const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '');
const peso = (n) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const describe = (r) => {
  const who = r.full_name || 'This joiner';
  const pax = r.slots_booked > 1 ? `${r.slots_booked} people` : '1 person';
  switch (r.result) {
    case 'ok': return { tone: 'ok', title: `Checked in — ${who}`, detail: `${pax} · ${r.booking_number}` };
    case 'already': return { tone: 'already', title: `${who} is already checked in`, detail: `Checked in at ${timeOf(r.checked_in_at)} · ${pax} · ${r.booking_number}` };
    case 'wrong_tour': return { tone: 'bad', title: 'Not on this tour', detail: `${who} is booked for ${r.tour_title || 'another tour'}${r.tour_start ? ` (${formatDateRange(r.tour_start)})` : ''}.` };
    case 'cancelled': return { tone: 'bad', title: 'Booking cancelled', detail: `${who}'s booking ${r.booking_number} was ${String(r.booking_status || 'cancelled').toLowerCase()}.` };
    case 'unpaid': return { tone: 'bad', title: 'Payment not confirmed', detail: `${who}'s payment is "${r.payment_status}". Confirm it in Booking Management first.` };
    default: return { tone: 'bad', title: 'QR not recognised', detail: 'No booking matches this code. Ask the joiner to open the QR in My Bookings, or type their booking number.' };
  }
};

const AdminCheckIn = () => {
  const [tours, setTours] = useState([]);
  const [toursLoaded, setToursLoaded] = useState(false);
  const [tourId, setTourId] = useState('');
  const [roster, setRoster] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [manual, setManual] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const lastScanRef = useRef({ code: '', at: 0 });
  const busyRef = useRef(false);
  const tourIdRef = useRef('');
  useEffect(() => { tourIdRef.current = tourId; }, [tourId]);

  // Tours that are on now or coming up (past ones are archived automatically).
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('tours')
        .select('id, title, destination, start_date, end_date')
        .eq('is_archived', false)
        .order('start_date', { ascending: true });
      setToursLoaded(true);
      if (error) { toast.error("Couldn't load tours", error.message); return; }
      const list = data || [];
      setTours(list);
      const today = todayManila();
      const current = list.find((t) => t.start_date <= today && (t.end_date || t.start_date) >= today)
        || list.find((t) => t.start_date >= today) || list[0];
      if (current) setTourId(String(current.id));
    })();
  }, []);

  const loadRoster = useCallback(async (id) => {
    if (!id) { setRoster([]); return; }
    setLoadingRoster(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('id, booking_number, full_name, slots_booked, payment_status, booking_status, checked_in_at')
      .eq('tour_id', id)
      .eq('payment_status', 'Complete')
      .not('booking_status', 'in', '("Cancelled","Rejected")')
      .order('full_name', { ascending: true });
    setLoadingRoster(false);
    if (error) { toast.error("Couldn't load the joiner list", error.message); return; }
    setRoster(data || []);
  }, []);

  useEffect(() => { loadRoster(tourId); setResult(null); }, [tourId, loadRoster]);

  const verify = useCallback(async (code) => {
    const id = tourIdRef.current;
    if (!code || !id || busyRef.current) return;
    busyRef.current = true;
    setChecking(true);
    const { data, error } = await supabase.rpc('check_in_booking', { p_code: code, p_tour_id: Number(id) });
    busyRef.current = false;
    setChecking(false);
    if (error) { toast.error("Couldn't check this code", error.message); return; }
    setResult(data);
    if (data?.result === 'ok') {
      navigator.vibrate?.(120);
      loadRoster(id);
    } else {
      navigator.vibrate?.([80, 60, 80]);
    }
  }, [loadRoster]);

  const undo = async (bookingId) => {
    const { error } = await supabase.rpc('undo_check_in', { p_booking_id: bookingId });
    if (error) { toast.error("Couldn't undo the check-in", error.message); return; }
    toast.info('Check-in undone');
    setResult(null);
    loadRoster(tourId);
  };

  // ── Camera scanning ──────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    if (!cameraOn) return undefined;
    let stopped = false;
    let timer = null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let detector = null;
    let jsQR = null;

    const decodeFrame = async () => {
      const video = videoRef.current;
      if (stopped || !video || video.readyState < 2) return null;
      if (detector) {
        const codes = await detector.detect(video).catch(() => []);
        return codes[0]?.rawValue || null;
      }
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return null;
      const scale = Math.min(1, 640 / Math.max(w, h));
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
    };

    const loop = async () => {
      if (stopped) return;
      const text = await decodeFrame();
      if (text) {
        const now = Date.now();
        // The same QR stays in view for a while; don't re-check it every frame.
        if (text !== lastScanRef.current.code || now - lastScanRef.current.at > 4000) {
          lastScanRef.current = { code: text, at: now };
          verify(text);
        }
      }
      timer = setTimeout(loop, 250);
    };

    (async () => {
      try {
        if ('BarcodeDetector' in window) {
          const formats = await window.BarcodeDetector.getSupportedFormats?.().catch(() => []);
          if (!formats || formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        }
        if (!detector) jsQR = (await import('jsqr')).default;
        loop();
      } catch {
        setCameraError('This browser cannot read QR codes. Type the booking number instead.');
      }
    })();

    return () => { stopped = true; clearTimeout(timer); };
  }, [cameraOn, verify]);

  const startCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not available here. Use HTTPS on a phone or laptop with a camera, or type the booking number.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      });
    } catch (err) {
      setCameraError(err?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access for this site, then try again.'
        : "Couldn't open the camera. Type the booking number instead.");
    }
  };

  const submitManual = (e) => {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    verify(code);
    setManual('');
  };

  const tour = tours.find((t) => String(t.id) === tourId);
  const totalPeople = roster.reduce((n, b) => n + (b.slots_booked || 1), 0);
  const inPeople = roster.filter((b) => b.checked_in_at).reduce((n, b) => n + (b.slots_booked || 1), 0);
  const shown = result ? describe(result) : null;
  const tone = shown ? RESULT_STYLES[shown.tone] : null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {!toursLoaded ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#7A3A18' }}><Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /></div>
      ) : tours.length === 0 ? (
        <EmptyState icon={ScanLine} title="No tours to check in" message="Upcoming and ongoing tours will appear here." />
      ) : (
        <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
          {/* Scanner */}
          <div style={card}>
            <label htmlFor="checkin-tour" style={label}>Tour</label>
            <select
              id="checkin-tour"
              value={tourId}
              onChange={(e) => setTourId(e.target.value)}
              style={{ ...field, marginBottom: 16 }}
            >
              {tours.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} — {formatDateRange(t.start_date)}{t.start_date <= todayManila() && (t.end_date || t.start_date) >= todayManila() ? ' (today)' : ''}
                </option>
              ))}
            </select>

            <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#1A0A00', aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {cameraOn ? (
                <>
                  <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div aria-hidden style={{ position: 'absolute', inset: '18%', border: '3px solid rgba(232,162,101,0.9)', borderRadius: 18, boxShadow: '0 0 0 9999px rgba(26,10,0,0.35)' }} />
                  {checking && <Loader2 size={28} style={{ position: 'absolute', color: '#FDF6EE', animation: 'spin 1s linear infinite' }} />}
                </>
              ) : (
                <div style={{ textAlign: 'center', color: 'rgba(232,210,190,0.85)', padding: 20 }}>
                  <ScanLine size={40} style={{ color: '#E8A265', marginBottom: 10 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Point the camera at the joiner's QR code.</p>
                </div>
              )}
            </div>
            {cameraError && <p role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: '#8C2F1C', margin: '10px 0 0' }}>{cameraError}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              {cameraOn
                ? <button type="button" onClick={stopCamera} style={secondaryBtn()}><CameraOff size={15} /> Stop Camera</button>
                : <button type="button" onClick={startCamera} disabled={!tourId} style={primaryBtn(!tourId)}><Camera size={15} /> Start Scanning</button>}
            </div>

            <form onSubmit={submitManual} style={{ marginTop: 18 }}>
              <label htmlFor="checkin-manual" style={label}>No QR? Type the booking number</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  id="checkin-manual"
                  value={manual}
                  onChange={(e) => setManual(e.target.value.toUpperCase())}
                  placeholder="e.g. BK-2610-01001"
                  autoComplete="off"
                  style={{ ...field, flex: 1, fontFamily: 'monospace' }}
                />
                <button type="submit" disabled={!manual.trim() || checking} style={secondaryBtn(!manual.trim() || checking)}><Search size={15} /> Check</button>
              </div>
            </form>

            {shown && (
              <div role="status" aria-live="polite" style={{ marginTop: 18, borderRadius: 16, padding: '16px 18px', background: tone.bg, border: `2px solid ${tone.border}` }}>
                <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 900, color: tone.color, margin: '0 0 4px' }}>
                  <tone.Icon size={20} /> {shown.title}
                </p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', margin: 0 }}>{shown.detail}</p>
                {(result.result === 'ok' || result.result === 'already') && result.companions?.length > 0 && (
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0' }}>
                    With: {result.companions.map((c) => c.full_name).filter(Boolean).join(', ')}
                  </p>
                )}
                {(result.result === 'ok' || result.result === 'already') && Number(result.balance_due) > 0 && (
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#8C5216', margin: '8px 0 0' }}>Balance to collect: {peso(result.balance_due)}</p>
                )}
                {(result.result === 'ok' || result.result === 'already') && (
                  <button type="button" className="text-link" onClick={() => undo(result.booking_id)} style={{ background: 'none', border: 'none', padding: '8px 0 0', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Undo2 size={13} /> Undo check-in
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Joiner list */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <p style={{ ...label, margin: 0 }}>Joiner list{tour ? ` · ${tour.title}` : ''}</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: 0, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 22, fontWeight: 900 }}>{inPeople}</span> / {totalPeople} checked in
              </p>
            </div>
            {loadingRoster ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 30, color: '#7A3A18' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
            ) : roster.length === 0 ? (
              <EmptyState compact icon={Users} title="No confirmed joiners yet" message="Paid bookings for this tour will appear here." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {roster.map((b) => (
                  <li key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: b.checked_in_at ? 'rgba(46,107,74,0.08)' : '#FDF6EE', border: '1px solid rgba(180,81,30,0.1)' }}>
                    {b.checked_in_at
                      ? <CheckCircle2 size={18} style={{ color: '#2E6B4A', flexShrink: 0 }} aria-label="Checked in" />
                      : <span aria-label="Not yet" style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(122,58,24,0.45)', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 800, color: '#1A0A00', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.full_name}</p>
                      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: 0 }}>{b.booking_number} · {b.slots_booked > 1 ? `${b.slots_booked} people` : '1 person'}</p>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: b.checked_in_at ? '#2E6B4A' : '#7A3A18', whiteSpace: 'nowrap' }}>
                      {b.checked_in_at ? timeOf(b.checked_in_at) : 'Not yet'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const card = {
  background: '#FDF6EE', borderRadius: 22, padding: '1.5rem',
  border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.05)',
};
const label = {
  display: 'block', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: '#7A3A18', margin: '0 0 6px',
};
const field = {
  width: '100%', boxSizing: 'border-box', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)',
  borderRadius: 12, padding: '10px 14px', minHeight: 44, fontSize: 14, fontWeight: 600, color: '#1A0A00',
  fontFamily: 'inherit', outline: 'none',
};

export default AdminCheckIn;
