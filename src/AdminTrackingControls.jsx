import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';
import {
  MapPin, Plus, Milestone, FolderArchive, X, Calendar,
  Armchair, Compass, ImageIcon, Loader2, Truck, AlertTriangle,
  ChevronLeft, ChevronRight, Check, CheckCircle2, ListChecks,
} from 'lucide-react';

const PALETTE = {
  espresso: '#1A0A00',
  burntSienna: '#C45C26',
  warmAmber: '#E8A265',
  cream: '#FDF6EE',
  rust: '#7A3A18',
};

// ── status → visual treatment for a pickup stop ──
const STOP_STATUS_STYLES = {
  DEPARTURE: { bg: 'rgba(232,162,101,0.25)', color: '#9A5B1E', label: 'Awaiting Departure' },
  DEPARTED: { bg: 'rgba(26,10,0,0.08)', color: 'rgba(26,10,0,0.6)', label: 'Departed' },
  'CURRENTLY HERE': { bg: '#C45C26', color: '#FDF6EE', label: 'On The Way' },
  ARRIVED: { bg: '#1A0A00', color: '#FDF6EE', label: 'Arrived' },
};

// ── shared input style (matches TourManagement / BookingManagement / JoinerTracking) ──
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: '#F2E4D0',
  border: '1px solid rgba(196,92,38,0.18)',
  borderRadius: 14,
  padding: '10px 14px',
  fontSize: 13, fontWeight: 600,
  color: '#1A0A00',
  fontFamily: 'inherit',
  outline: 'none',
};

// ── parses a tour's free-text itinerary into selectable checkpoint options ──
// Matches lines like "04:00 AM – Assembly & Departure" or
// "08:15 AM – 11:00 AM – Trek to Aw Asen Falls" and pulls out a time + label
// so the admin can pick a checkpoint instead of retyping the itinerary by hand.
const ITINERARY_LINE_REGEX = /^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:[–—-]\s*\d{1,2}:\d{2}\s*(?:AM|PM))?\s*[–—-]\s*(.+)$/i;
const ITINERARY_DAY_REGEX = /^day\s*\d+\s*:?$/i;

const parseItineraryStops = (itineraryText) => {
  if (!itineraryText) return [];
  const lines = itineraryText.split('\n').map(l => l.trim()).filter(Boolean);
  const stops = [];
  let currentDay = '';

  lines.forEach((line) => {
    if (ITINERARY_DAY_REGEX.test(line)) {
      currentDay = line.replace(/:$/, '');
      return;
    }
    const match = line.match(ITINERARY_LINE_REGEX);
    if (match) {
      const [, time, label] = match;
      stops.push({
        time: time.trim().toUpperCase(),
        label: label.trim(),
        day: currentDay,
      });
    }
  });

  return stops;
};

export const AdminTrackingControls = () => {
  const [activeTour, setActiveTour] = useState(null);
  const [toursList, setToursList] = useState([]);
  const [meetupStops, setMeetupStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingConsole, setLoadingConsole] = useState(false);
  const [customNotes, setCustomNotes] = useState({});
  const [trackingLogs, setTrackingLogs] = useState([]);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [savingStop, setSavingStop] = useState(false);
  const [updatingStopId, setUpdatingStopId] = useState(null);
  const [generatingStops, setGeneratingStops] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  // Checkpoint Inputs
  const [newLocName, setNewLocName] = useState('');
  const [newTime, setNewTime] = useState('');

  // Logistics Form States
  const [carType, setCarType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverContact, setDriverContact] = useState('');
  const [isLogisticsSaved, setIsLogisticsSaved] = useState(false);
  const [savingLogistics, setSavingLogistics] = useState(false);

  // 1. FETCH TOURS FROM DB
  const fetchToursFromDatabase = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tours')
        .select('*')
        .eq('is_archived', false)
        .order('start_date', { ascending: true });

      if (!error && data) setToursList(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchToursFromDatabase();
  }, []);

  // 2. LOAD TRACKING STATE FOR THE SELECTED TOUR FROM SUPABASE
  const fetchTrackingConsole = useCallback(async (tourId) => {
    setLoadingConsole(true);
    try {
      const [{ data: vehicle }, { data: stops }, { data: logs }] = await Promise.all([
        supabase.from('tour_vehicles').select('*').eq('tour_id', tourId).maybeSingle(),
        supabase.from('tour_meetups').select('*').eq('tour_id', tourId).order('created_at', { ascending: true }),
        supabase.from('tour_tracking_logs').select('*').eq('tour_id', tourId).order('created_at', { ascending: false }),
      ]);

      if (vehicle) {
        setCarType(vehicle.car_type || '');
        setPlateNumber(vehicle.plate_number || '');
        setDriverName(vehicle.driver_name || '');
        setDriverContact(vehicle.driver_contact || '');
        setIsLogisticsSaved(true);
      } else {
        setCarType('');
        setPlateNumber('');
        setDriverName('');
        setDriverContact('');
        setIsLogisticsSaved(false);
      }

      setMeetupStops(stops || []);
      setTrackingLogs(logs || []);
    } catch (err) {
      console.error('Error loading tracking console:', err.message);
    } finally {
      setLoadingConsole(false);
    }
  }, []);

  useEffect(() => {
    if (activeTour) fetchTrackingConsole(activeTour.id);
  }, [activeTour, fetchTrackingConsole]);

  // Auto-populate checkpoints straight from the tour's itinerary, so the admin
  // never has to retype stops the tour already describes. Runs once fleet
  // details exist and no checkpoints have been created yet for this tour.
  // Inserted one row at a time (awaited) so each gets a strictly later
  // created_at than the last — that's what the list is ordered by.
  const generateStopsFromItinerary = useCallback(async () => {
    if (!activeTour) return;
    const stops = parseItineraryStops(activeTour.itinerary);
    if (stops.length === 0) return;

    setGeneratingStops(true);
    try {
      const inserted = [];
      for (const s of stops) {
        const { data, error } = await supabase.from('tour_meetups').insert([{
          tour_id: activeTour.id,
          location_name: s.label,
          scheduled_time: s.time,
          status: 'DEPARTURE',
          note: '',
        }]).select().single();
        if (error) throw error;
        inserted.push(data);
      }
      setMeetupStops(inserted);
    } catch (err) {
      alert('Error auto-generating checkpoints from itinerary: ' + err.message);
    } finally {
      setGeneratingStops(false);
    }
  }, [activeTour]);

  useEffect(() => {
    if (!activeTour || loadingConsole || generatingStops) return;
    if (!isLogisticsSaved) return;
    if (meetupStops.length > 0) return;
    generateStopsFromItinerary();
  }, [activeTour, loadingConsole, generatingStops, isLogisticsSaved, meetupStops.length, generateStopsFromItinerary]);

  // Live updates — realtime sync so admin + joiners always see the same state.
  useEffect(() => {
    const channel = supabase
      .channel('admin-tracking-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_meetups' }, () => {
        if (activeTour) fetchTrackingConsole(activeTour.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_tracking_logs' }, () => {
        if (activeTour) fetchTrackingConsole(activeTour.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_vehicles' }, () => {
        if (activeTour) fetchTrackingConsole(activeTour.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTour, fetchTrackingConsole]);

  // SAVE VEHICLE DISPATCH
  const handleSaveVehicleInfo = async (e) => {
    e.preventDefault();
    if (!carType || !plateNumber || !driverName || !driverContact) {
      alert('Please complete all driver and vehicle form fields.');
      return;
    }

    const numericRegex = /^[0-9]+$/;
    if (!numericRegex.test(driverContact)) {
      alert('Invalid Format: Contact number must contain numeric values digits only!');
      return;
    }

    setSavingLogistics(true);
    const { error } = await supabase.from('tour_vehicles').upsert([{
      tour_id: activeTour.id,
      car_type: carType,
      plate_number: plateNumber,
      driver_name: driverName,
      driver_contact: driverContact,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'tour_id' });

    setSavingLogistics(false);
    if (error) {
      alert('Error saving fleet details: ' + error.message);
      return;
    }
    setIsLogisticsSaved(true);
  };

  // 2. ADD PICKUP STOP
  const handleAddPickupStop = async (e) => {
    e.preventDefault();
    if (!newLocName || !newTime || !activeTour) return;

    setSavingStop(true);
    const { data, error } = await supabase.from('tour_meetups').insert([{
      tour_id: activeTour.id,
      location_name: newLocName,
      scheduled_time: newTime,
      status: 'DEPARTURE',
      note: '',
    }]).select();

    setSavingStop(false);
    if (error) {
      alert('Error adding checkpoint: ' + error.message);
      return;
    }

    setMeetupStops(prev => [...prev, ...(data || [])]);
    setNewLocName('');
    setNewTime('');
  };

  // 3. ARCHIVE SESSION — clears all tracking rows for this tour in Supabase
  const executeArchiveTrackingTimeline = async () => {
    if (!activeTour) return;
    try {
      await Promise.all([
        supabase.from('tour_tracking_logs').delete().eq('tour_id', activeTour.id),
        supabase.from('tour_meetups').delete().eq('tour_id', activeTour.id),
        supabase.from('tour_vehicles').delete().eq('tour_id', activeTour.id),
      ]);
    } catch (err) {
      alert('Error archiving tracking: ' + err.message);
      return;
    }
    setMeetupStops([]);
    setTrackingLogs([]);
    setCarType('');
    setPlateNumber('');
    setDriverName('');
    setDriverContact('');
    setIsLogisticsSaved(false);
    setShowArchiveConfirm(false);
    setActiveTour(null);
  };

  // Drives the whole checkpoint list with a single button: finds the first
  // stop that hasn't been reached yet, and either sends the van "on the way"
  // to it, or — if it's already on the way — marks it arrived and
  // immediately starts the next stop in the sequence.
  const advanceToNextStop = async () => {
    if (!activeTour || advancing) return;
    const idx = meetupStops.findIndex(s => s.status !== 'ARRIVED');
    if (idx === -1) return;
    const current = meetupStops[idx];

    setAdvancing(true);
    setUpdatingStopId(current.id);
    try {
      if (current.status !== 'CURRENTLY HERE') {
        const note = customNotes[current.id] || '';
        const { error } = await supabase
          .from('tour_meetups')
          .update({ status: 'CURRENTLY HERE', note: note || current.note })
          .eq('id', current.id);
        if (error) throw error;

        const { error: logError } = await supabase.from('tour_tracking_logs').insert([{
          tour_id: activeTour.id,
          meetup_id: current.id,
          location_name: current.location_name,
          status: 'CURRENTLY HERE',
          display_text: `Van is now heading to ${current.location_name}.`,
          note,
        }]);
        if (logError) throw logError;

        setMeetupStops(prev => prev.map(s => s.id === current.id ? { ...s, status: 'CURRENTLY HERE', note: note || s.note } : s));
      } else {
        const note = customNotes[current.id] || '';
        const { error } = await supabase
          .from('tour_meetups')
          .update({ status: 'ARRIVED', note: note || current.note })
          .eq('id', current.id);
        if (error) throw error;

        const { error: logError } = await supabase.from('tour_tracking_logs').insert([{
          tour_id: activeTour.id,
          meetup_id: current.id,
          location_name: current.location_name,
          status: 'ARRIVED',
          display_text: `Destination Reached: Van has arrived at [${current.location_name}]`,
          note,
        }]);
        if (logError) throw logError;

        let updated = meetupStops.map(s => s.id === current.id ? { ...s, status: 'ARRIVED', note: note || s.note } : s);
        const next = meetupStops[idx + 1];
        if (next) {
          const { error: nextError } = await supabase
            .from('tour_meetups')
            .update({ status: 'CURRENTLY HERE' })
            .eq('id', next.id);
          if (nextError) throw nextError;

          const { error: nextLogError } = await supabase.from('tour_tracking_logs').insert([{
            tour_id: activeTour.id,
            meetup_id: next.id,
            location_name: next.location_name,
            status: 'CURRENTLY HERE',
            display_text: `Van is now heading to ${next.location_name}.`,
            note: '',
          }]);
          if (nextLogError) throw nextLogError;

          updated = updated.map(s => s.id === next.id ? { ...s, status: 'CURRENTLY HERE' } : s);
        }

        setMeetupStops(updated);
        setCustomNotes(prev => ({ ...prev, [current.id]: '' }));
      }
    } catch (err) {
      alert('Error updating checkpoint: ' + err.message);
    } finally {
      setAdvancing(false);
      setUpdatingStopId(null);
    }
  };

  const hasActiveOrPendingStop = meetupStops.some(stop => stop.status !== 'ARRIVED');

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Tour Grid (matches JoinerTracking's card grid) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {loading ? (
          <div style={{
            gridColumn: '1 / -1',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '5rem 0', color: 'rgba(122,58,24,0.4)',
          }}>
            <Loader2 size={30} style={{ marginBottom: 10, animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
              Loading Tour Directory…
            </p>
          </div>
        ) : toursList.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            padding: '5rem 0', textAlign: 'center',
            background: '#FDF6EE',
            borderRadius: 20,
            border: '2px dashed rgba(196,92,38,0.2)',
          }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.4)', margin: 0 }}>
              No active tours to track yet.
            </p>
          </div>
        ) : toursList.map((tour) => (
          <TrackingTourCard key={tour.id} tour={tour} onTrack={() => setActiveTour(tour)} />
        ))}
      </div>

      {activeTour && (
        <TrackingConsoleModal
          tour={activeTour}
          meetupStops={meetupStops}
          trackingLogs={trackingLogs}
          loadingConsole={loadingConsole}
          customNotes={customNotes}
          setCustomNotes={setCustomNotes}
          isLogisticsSaved={isLogisticsSaved}
          setIsLogisticsSaved={setIsLogisticsSaved}
          savingLogistics={savingLogistics}
          savingStop={savingStop}
          updatingStopId={updatingStopId}
          generatingStops={generatingStops}
          advancing={advancing}
          carType={carType} setCarType={setCarType}
          plateNumber={plateNumber} setPlateNumber={setPlateNumber}
          driverName={driverName} setDriverName={setDriverName}
          driverContact={driverContact} setDriverContact={setDriverContact}
          newLocName={newLocName} setNewLocName={setNewLocName}
          newTime={newTime} setNewTime={setNewTime}
          hasActiveOrPendingStop={hasActiveOrPendingStop}
          onSaveVehicleInfo={handleSaveVehicleInfo}
          onAddPickupStop={handleAddPickupStop}
          onAdvanceStop={advanceToNextStop}
          onRequestArchive={() => setShowArchiveConfirm(true)}
          onClose={() => { setActiveTour(null); setIsLogisticsSaved(false); }}
        />
      )}

      {/* ── Archive Confirmation Modal ── */}
      {showArchiveConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10050,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)',
          padding: 16,
        }}>
          <div style={{
            background: '#FDF6EE', padding: '3rem',
            borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
            textAlign: 'center', width: '100%', maxWidth: 420,
            borderTop: '8px solid #8C2F1C',
          }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: '#8C2F1C',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 28px', color: '#FDF6EE',
              boxShadow: '0 12px 32px rgba(26,10,0,0.25)',
            }}>
              <FolderArchive size={38} />
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 12px' }}>
              Archive Tracking?
            </h3>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', opacity: 0.65, lineHeight: 1.7, margin: '0 0 32px' }}>
              This clears the checkpoints, timeline, and fleet details for <strong>{activeTour?.title}</strong>. Joiners will no longer see live tracking for this tour.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowArchiveConfirm(false)}
                style={{
                  flex: 1, padding: '13px 0',
                  background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.18)',
                  borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: '#7A3A18',
                }}
              >Cancel</button>
              <button
                onClick={executeArchiveTrackingTimeline}
                style={{
                  flex: 1, padding: '13px 0',
                  background: '#8C2F1C', border: 'none', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: '#FDF6EE',
                  boxShadow: '0 6px 20px rgba(26,10,0,0.22)',
                }}
              >Archive</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   TOUR CARD — identical language to JoinerTracking's TrackingTourCard
───────────────────────────────────────────── */
const TrackingTourCard = ({ tour, onTrack }) => {
  const [hovered, setHovered] = useState(false);
  const hasImage = Array.isArray(tour.image_urls) && tour.image_urls.length > 0;
  const displayImage = hasImage ? tour.image_urls[0] : (tour.image || '');

  return (
    <div
      style={{
        background: '#FDF6EE',
        borderRadius: 22, overflow: 'hidden',
        border: '1px solid rgba(196,92,38,0.12)',
        boxShadow: hovered ? '0 12px 36px rgba(26,10,0,0.14)' : '0 4px 16px rgba(26,10,0,0.06)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all 0.25s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div style={{ height: 186, background: '#E8D5BC', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {displayImage
          ? <img src={displayImage} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.4s' }} alt="" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.2)' }}><ImageIcon size={44} /></div>
        }
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <span style={{
            background: PALETTE.burntSienna, color: '#FDF6EE',
            borderRadius: 999, padding: '4px 10px',
            fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 4,
          }}><Compass size={10} /> Tracking</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: '0 0 10px' }}>{tour.title}</h3>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 8px' }}>
            <MapPin size={11} style={{ color: '#C45C26' }} /> {tour.destination || 'Not Specified'}
          </p>
          {(tour.start_date || tour.date) && (
            <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 5, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <Calendar size={11} style={{ color: '#C45C26' }} /> {tour.start_date || tour.date}
            </p>
          )}
        </div>

        {/* Action */}
        <button
          onClick={onTrack}
          style={{
            width: '100%', marginTop: 14,
            padding: '11px 0',
            border: 'none', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 900,
            fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'opacity 0.15s',
            background: '#1A0A00', color: '#FDF6EE',
          }}
        >
          <Compass size={13} /> Track Checkpoints
        </button>
      </div>
    </div>
  );
};

/* Slideable photo gallery — identical behavior/style to JoinerTracking's TourImageCarousel */
const TourImageCarousel = ({ images = [] }) => {
  const [index, setIndex] = useState(0);
  const dragStartX = React.useRef(null);
  const hasImages = images.length > 0;
  const hasMultiple = images.length > 1;

  const goTo = (i) => setIndex(((i % images.length) + images.length) % images.length);
  const prev = (e) => { e.stopPropagation(); goTo(index - 1); };
  const next = (e) => { e.stopPropagation(); goTo(index + 1); };

  const handleDragStart = (e) => {
    dragStartX.current = e.clientX ?? e.touches?.[0]?.clientX ?? null;
  };
  const handleDragEnd = (e) => {
    if (dragStartX.current == null) return;
    const endX = e.clientX ?? e.changedTouches?.[0]?.clientX ?? dragStartX.current;
    const delta = endX - dragStartX.current;
    if (Math.abs(delta) > 40) {
      delta > 0 ? goTo(index - 1) : goTo(index + 1);
    }
    dragStartX.current = null;
  };

  return (
    <div>
      <div
        style={{
          position: 'relative', width: '100%', height: 190,
          borderRadius: 18, overflow: 'hidden',
          background: '#E8D5BC', marginBottom: hasMultiple ? 12 : 20,
          boxShadow: '0 8px 24px rgba(26,10,0,0.15)',
          flexShrink: 0, touchAction: 'pan-y', userSelect: 'none',
        }}
        onPointerDown={handleDragStart}
        onPointerUp={handleDragEnd}
      >
        {hasImages ? (
          <div style={{
            display: 'flex', width: '100%', height: '100%',
            transform: `translateX(-${index * 100}%)`,
            transition: 'transform 0.35s ease',
          }}>
            {images.map((url, i) => (
              <img
                key={i} src={url} draggable={false} alt={`Photo ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', flexShrink: 0 }}
              />
            ))}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.3)' }}>
            <ImageIcon size={40} />
          </div>
        )}

        {hasMultiple && (
          <>
            <button
              type="button" onClick={prev}
              style={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(26,10,0,0.5)', border: 'none', borderRadius: '50%',
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#FDF6EE',
              }}
            ><ChevronLeft size={18} /></button>
            <button
              type="button" onClick={next}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(26,10,0,0.5)', border: 'none', borderRadius: '50%',
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#FDF6EE',
              }}
            ><ChevronRight size={18} /></button>
            <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
              {images.map((_, i) => (
                <span
                  key={i}
                  onClick={(e) => { e.stopPropagation(); goTo(i); }}
                  style={{
                    width: i === index ? 16 : 6, height: 6, borderRadius: 999,
                    background: i === index ? '#FDF6EE' : 'rgba(253,246,238,0.5)',
                    cursor: 'pointer', transition: 'width 0.2s',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {hasMultiple && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {images.map((url, i) => (
            <div
              key={i}
              onClick={() => goTo(i)}
              style={{
                aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                border: i === index ? '2px solid #C45C26' : '1px solid rgba(196,92,38,0.15)',
                opacity: i === index ? 1 : 0.65, transition: 'opacity 0.2s, border-color 0.2s',
              }}
            >
              <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={`Thumbnail ${i + 1}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* Section header helper — identical to JoinerTracking's ViewSection */
const ViewSection = ({ title, titleColor, icon, children }) => (
  <section>
    <h4 style={{
      fontSize: 9, fontWeight: 900, letterSpacing: '0.25em',
      textTransform: 'uppercase', color: titleColor || '#1A0A00',
      margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {icon} {title}
    </h4>
    {children}
  </section>
);

/* ─────────────────────────────────────────────
   TRACKING TIMELINE — shipment-tracker style checkpoint feed,
   shared visual language between AdminTrackingControls & JoinerTracking.
   Each tracking log's `display_text` is written as "Title: description"
   (see updateStopStatus), so we split on the first colon to render a
   bold headline + supporting copy, just like a courier tracking page.
───────────────────────────────────────────── */
const splitLogText = (text) => {
  if (!text) return { title: 'Update', description: '' };
  const idx = text.indexOf(':');
  if (idx === -1) return { title: text, description: '' };
  return { title: text.slice(0, idx).trim(), description: text.slice(idx + 1).trim() };
};

const formatLogDateTime = (createdAt) => {
  if (!createdAt) return { dateLabel: '', timeLabel: '' };
  const d = new Date(createdAt);
  const isToday = d.toDateString() === new Date().toDateString();
  return {
    dateLabel: isToday ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    timeLabel: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
};

const TrackingTimeline = ({ logs, emptyText = 'No logs posted yet.' }) => {
  if (!logs || logs.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '2.5rem 1rem',
        background: '#FDF6EE', borderRadius: 16,
        border: '2px dashed rgba(196,92,38,0.2)',
      }}>
        <Compass size={22} style={{ color: 'rgba(122,58,24,0.3)', marginBottom: 8 }} />
        <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(122,58,24,0.5)', margin: 0, fontStyle: 'italic' }}>{emptyText}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {logs.map((log, index) => {
        const isLast = index === logs.length - 1;
        const isArrivedStatus = log.status === 'ARRIVED';
        const isLatestUpdate = index === 0;
        const { title, description } = splitLogText(log.display_text);
        const { dateLabel, timeLabel } = formatLogDateTime(log.created_at || log.timestamp);

        const badgeBg = isArrivedStatus ? '#1F8A5C' : isLatestUpdate ? '#C45C26' : 'rgba(122,58,24,0.12)';
        const badgeColor = isArrivedStatus || isLatestUpdate ? '#FDF6EE' : '#7A3A18';
        const titleColor = isLatestUpdate || isArrivedStatus ? '#1A0A00' : 'rgba(26,10,0,0.55)';
        const titleWeight = isLatestUpdate || isArrivedStatus ? 900 : 700;

        return (
          <div key={log.id || index} style={{ display: 'flex', gap: 12, paddingBottom: isLast ? 0 : 22 }}>
            {/* date / time column */}
            <div style={{ width: 56, flexShrink: 0, textAlign: 'right', paddingTop: 3 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#7A3A18', opacity: 0.55, margin: 0, lineHeight: 1.5, whiteSpace: 'nowrap' }}>{dateLabel}</p>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#7A3A18', opacity: 0.55, margin: 0, lineHeight: 1.5, whiteSpace: 'nowrap' }}>{timeLabel}</p>
            </div>

            {/* badge + connector column */}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: badgeBg, color: badgeColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2,
                boxShadow: isLatestUpdate && !isArrivedStatus ? '0 0 0 4px rgba(196,92,38,0.16)' : 'none',
              }}>
                {isArrivedStatus ? <CheckCircle2 size={14} strokeWidth={2.5} /> : <Check size={13} strokeWidth={3} />}
              </div>
              {!isLast && (
                <div style={{ position: 'absolute', top: 26, bottom: -22, width: 2, background: 'rgba(196,92,38,0.18)' }} />
              )}
            </div>

            {/* content column */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <p style={{ fontSize: 13, fontWeight: titleWeight, color: titleColor, margin: 0, lineHeight: 1.4 }}>
                {title}
              </p>
              {description && (
                <p style={{ fontSize: 12, fontWeight: 500, color: '#7A3A18', opacity: 0.75, margin: '4px 0 0', lineHeight: 1.6 }}>
                  {description}
                </p>
              )}
              {log.note && (
                <div style={{
                  marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 6,
                  background: 'rgba(196,92,38,0.08)',
                  border: '1px solid rgba(196,92,38,0.18)', borderRadius: 10,
                  padding: '8px 12px',
                }}>
                  <MapPin size={12} style={{ color: '#9A5B1E', flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9A5B1E', margin: 0, lineHeight: 1.5 }}>
                    {log.note}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─────────────────────────────────────────────
   TRACKING CONSOLE MODAL
   (split panel, mirrors JoinerTracking's TrackingDetailModal —
   left panel adds the fleet-assignment form and checkpoint controls
   an admin needs; right panel is the same live timeline)
───────────────────────────────────────────── */
const TrackingConsoleModal = ({
  tour, meetupStops, trackingLogs, loadingConsole, customNotes, setCustomNotes,
  isLogisticsSaved, setIsLogisticsSaved, savingLogistics, savingStop, updatingStopId,
  generatingStops, advancing,
  carType, setCarType, plateNumber, setPlateNumber,
  driverName, setDriverName, driverContact, setDriverContact,
  newLocName, setNewLocName, newTime, setNewTime,
  hasActiveOrPendingStop, onSaveVehicleInfo, onAddPickupStop, onAdvanceStop,
  onRequestArchive, onClose,
}) => {
  const images = Array.isArray(tour.image_urls) ? tour.image_urls : (tour.image ? [tour.image] : []);
  const itineraryStops = useMemo(() => parseItineraryStops(tour.itinerary), [tour.itinerary]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 1100,
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        overflow: 'hidden',
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Top-right controls: archive + close, floating over content like JoinerTracking's X */}
        <div style={{ position: 'absolute', top: 24, right: 24, zIndex: 50, display: 'flex', alignItems: 'center', gap: 18 }}>
          <button
            onClick={onRequestArchive}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(253,246,238,0.9)', border: 'none', borderRadius: 999,
              padding: '8px 14px', cursor: 'pointer',
              color: '#8C2F1C', fontWeight: 900,
              fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
              boxShadow: '0 4px 14px rgba(26,10,0,0.15)',
            }}
          >
            <FolderArchive size={13} /> Archive
          </button>
          <button onClick={onClose} style={{
            background: 'rgba(253,246,238,0.9)', border: 'none', borderRadius: '50%',
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'rgba(26,10,0,0.6)',
            boxShadow: '0 4px 14px rgba(26,10,0,0.15)',
          }}><X size={20} /></button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>

            {/* Left panel: gallery, meta, fleet form, checkpoint management */}
            <div className="responsive-modal-padding" style={{
              background: '#F2E4D0',
              padding: '2.5rem 2rem',
              borderRight: '1px solid rgba(196,92,38,0.12)',
              display: 'flex', flexDirection: 'column',
            }}>
              <TourImageCarousel images={images} />

              <h2 style={{
                fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em',
                color: '#1A0A00', margin: '0 0 10px', lineHeight: 1.15,
              }}>{tour.title}</h2>

              <p style={{ margin: '0 0 20px', fontSize: 13, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 10 }}>
                <MapPin size={16} style={{ color: '#C45C26', flexShrink: 0 }} />
                <span>{tour.destination || 'Dynamic Target Route'}</span>
              </p>

              {loadingConsole ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 0', color: 'rgba(122,58,24,0.4)' }}>
                  <Loader2 size={20} style={{ marginRight: 10, animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading tracking…</span>
                </div>
              ) : (
              <>
              {/* Fleet details */}
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(196,92,38,0.1)', boxShadow: '0 2px 8px rgba(26,10,0,0.02)', marginBottom: 20 }}>
                <ViewSection title="Assigned Fleet Details" titleColor="#C45C26" icon={<Truck size={14} />}>
                  {!isLogisticsSaved ? (
                    <form onSubmit={onSaveVehicleInfo} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                      <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <input type="text" placeholder="Van Model (e.g., Toyota Hiace)" value={carType} onChange={e => setCarType(e.target.value)} style={inputStyle} />
                        <input type="text" placeholder="Plate No." value={plateNumber} onChange={e => setPlateNumber(e.target.value)} style={inputStyle} />
                      </div>
                      <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <input type="text" placeholder="Name of Driver" value={driverName} onChange={e => setDriverName(e.target.value)} style={inputStyle} />
                        <input
                          type="text" placeholder="Contact No."
                          value={driverContact}
                          onChange={e => setDriverContact(e.target.value.replace(/[^0-9]/g, ''))}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                        padding: '10px 12px', background: '#F2E4D0', borderRadius: 12,
                        fontSize: 11, color: '#7A3A18', fontWeight: 700,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Calendar size={13} style={{ color: '#C45C26' }} />
                          {tour.start_date || tour.date || 'No Date Assigned'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Armchair size={13} style={{ color: '#C45C26' }} />
                          {tour.max_seats || tour.seats || 'Not Specified'} Seats
                        </div>
                      </div>
                      <button type="submit" disabled={savingLogistics} style={{
                        width: '100%', padding: '11px 0',
                        background: '#C45C26', color: '#FDF6EE',
                        border: 'none', borderRadius: 999, cursor: savingLogistics ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', fontWeight: 900,
                        fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                        boxShadow: '0 6px 20px rgba(196,92,38,0.3)',
                        opacity: savingLogistics ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        {savingLogistics ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                        Save Details
                      </button>
                    </form>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: '#1A0A00' }}>
                      <div><strong>Van Model:</strong> {carType || 'Pending Dispatch'}</div>
                      <div><strong>Plate No:</strong> {plateNumber || 'Pending Setup'}</div>
                      <div><strong>Driver:</strong> {driverName || 'Assigning Staff'}</div>
                      <div><strong>Contact:</strong> {driverContact || 'Not Available'}</div>

                      <div style={{ gridColumn: 'span 2', borderTop: '1px dashed rgba(26,10,0,0.1)', paddingTop: 10, marginTop: 2, display: 'flex', justifyContent: 'space-between', color: '#7A3A18', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Calendar size={14} style={{ color: '#C45C26' }} />
                          <span>{tour.start_date || tour.date || 'No Date Assigned'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Armchair size={14} style={{ color: '#C45C26' }} />
                          <span>{tour.max_seats || tour.seats || 'N/A'} Seats</span>
                        </div>
                      </div>

                      <button
                        onClick={() => setIsLogisticsSaved(false)}
                        style={{
                          gridColumn: 'span 2', marginTop: 4,
                          background: 'none', border: '1px dashed rgba(196,92,38,0.35)',
                          padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                          color: '#7A3A18', fontSize: 9, fontWeight: 900,
                          letterSpacing: '0.14em', textTransform: 'uppercase',
                        }}
                      >
                        Edit Fleet Info
                      </button>
                    </div>
                  )}
                </ViewSection>
              </div>

              {/* Checkpoint management — auto-built from the tour itinerary */}
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(196,92,38,0.1)', boxShadow: '0 2px 8px rgba(26,10,0,0.02)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ViewSection title="Checkpoint Management" titleColor="#C45C26" icon={<Milestone size={14} />}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
                    {!isLogisticsSaved ? (
                      <Notice
                        color="#9A5B1E" bg="rgba(232,162,101,0.15)"
                        icon={<AlertTriangle size={16} />}
                        text="Complete the fleet form above to enable checkpoint tracking."
                      />
                    ) : generatingStops ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 0', color: 'rgba(122,58,24,0.5)' }}>
                        <Loader2 size={18} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: 11, fontWeight: 700 }}>Pulling checkpoints from the itinerary…</span>
                      </div>
                    ) : meetupStops.length === 0 && itineraryStops.length === 0 ? (
                      <>
                        <Notice
                          color="#9A5B1E" bg="rgba(232,162,101,0.15)"
                          icon={<ListChecks size={16} />}
                          text="No timestamped itinerary lines were found for this tour, so checkpoints can't be auto-filled. Add stops manually below."
                        />
                        <form onSubmit={onAddPickupStop} style={{ display: 'flex', gap: 10 }}>
                          <input
                            type="text" placeholder="Location (e.g., SM MOA)"
                            value={newLocName} onChange={e => setNewLocName(e.target.value)}
                            style={{ ...inputStyle, flex: 2 }}
                          />
                          <input
                            type="text" placeholder="ETA (e.g., 08:00 PM)"
                            value={newTime} onChange={e => setNewTime(e.target.value)}
                            style={{ ...inputStyle, flex: 1 }}
                          />
                          <button type="submit" disabled={savingStop} style={{
                            flexShrink: 0, width: 44,
                            background: '#1A0A00', color: '#FDF6EE',
                            border: 'none', borderRadius: 14, cursor: savingStop ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: savingStop ? 0.6 : 1,
                          }}>
                            {savingStop ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} strokeWidth={3} />}
                          </button>
                        </form>
                      </>
                    ) : (
                      <p style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.6, margin: 0,
                      }}>
                        <ListChecks size={12} style={{ color: '#C45C26', flexShrink: 0 }} />
                        Checkpoints below were pulled straight from this tour's itinerary — just click Next Stop to move the van along.
                      </p>
                    )}

                    {isLogisticsSaved && meetupStops.length > 0 && (() => {
                      const activeIdx = meetupStops.findIndex(s => s.status !== 'ARRIVED');
                      const allArrived = activeIdx === -1;
                      const activeStop = !allArrived ? meetupStops[activeIdx] : null;
                      const isHeadingThere = activeStop?.status === 'CURRENTLY HERE';

                      return (
                        <>
                          {/* Ordered checkpoint list */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {meetupStops.map((stop, i) => {
                              const isArrived = stop.status === 'ARRIVED';
                              const isCurrent = i === activeIdx;
                              const statusStyle = STOP_STATUS_STYLES[stop.status] || STOP_STATUS_STYLES.DEPARTURE;

                              return (
                                <div
                                  key={stop.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px', borderRadius: 12,
                                    background: isCurrent ? 'rgba(196,92,38,0.07)' : '#FDF6EE',
                                    border: isCurrent ? '2px solid #C45C26' : '1px solid rgba(196,92,38,0.12)',
                                  }}
                                >
                                  <div style={{
                                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: isArrived ? '#1A0A00' : isCurrent ? '#C45C26' : 'rgba(122,58,24,0.12)',
                                    color: isArrived || isCurrent ? '#FDF6EE' : '#7A3A18',
                                    fontSize: 10, fontWeight: 900,
                                  }}>
                                    {isArrived ? <Check size={12} strokeWidth={3} /> : i + 1}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00', margin: 0 }}>
                                      {stop.location_name}
                                    </p>
                                    <p style={{ fontSize: 10, fontWeight: 600, color: '#7A3A18', opacity: 0.6, margin: '2px 0 0' }}>
                                      ETA: {stop.scheduled_time}
                                    </p>
                                  </div>
                                  <span style={{
                                    flexShrink: 0,
                                    background: statusStyle.bg, color: statusStyle.color,
                                    fontSize: 8, fontWeight: 900, padding: '5px 10px', borderRadius: 999,
                                    letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                                  }}>
                                    {statusStyle.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Single advance control */}
                          {allArrived ? (
                            <Notice
                              color="#C45C26" bg="rgba(196,92,38,0.08)"
                              icon={<CheckCircle2 size={16} />}
                              text="All checkpoints have been reached — this tour's route is complete."
                            />
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <input
                                type="text"
                                placeholder="Optional note for joiners (e.g. traffic update)…"
                                value={customNotes[activeStop.id] || ''}
                                onChange={(e) => setCustomNotes({ ...customNotes, [activeStop.id]: e.target.value })}
                                style={{ ...inputStyle, fontSize: 12 }}
                              />
                              <button
                                onClick={onAdvanceStop}
                                disabled={advancing}
                                style={{
                                  width: '100%', padding: '13px 0',
                                  background: advancing ? 'rgba(26,10,0,0.4)' : '#1A0A00',
                                  color: '#FDF6EE', border: 'none', borderRadius: 999,
                                  cursor: advancing ? 'not-allowed' : 'pointer',
                                  fontFamily: 'inherit', fontWeight: 900,
                                  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                  boxShadow: advancing ? 'none' : '0 6px 18px rgba(26,10,0,0.25)',
                                }}
                              >
                                {advancing ? (
                                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                ) : (
                                  <ChevronRight size={14} strokeWidth={3} />
                                )}
                                {isHeadingThere ? `Arrived at ${activeStop.location_name}` : `Head to ${activeStop.location_name}`}
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </ViewSection>
              </div>
              </>
              )}
            </div>

            {/* Right panel: live tracking timeline — identical to JoinerTracking's */}
            <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column' }}>
              <ViewSection title="Tracking Details" titleColor="#C45C26" icon={<Compass size={14} />}>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 8 }}>
                  {loadingConsole ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: 'rgba(122,58,24,0.5)' }}>
                      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                      <p style={{ fontSize: 12, margin: 0 }}>Loading updates…</p>
                    </div>
                  ) : (
                    <TrackingTimeline logs={trackingLogs} emptyText="No logs posted yet." />
                  )}
                </div>
              </ViewSection>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const Notice = ({ color, bg, icon, text }) => (
  <div style={{
    background: bg, borderRadius: 14, padding: '12px 16px',
    border: `1px solid ${color}33`, display: 'flex', gap: 10, alignItems: 'center',
  }}>
    <span style={{ color, flexShrink: 0 }}>{icon}</span>
    <p style={{ fontSize: 11, fontWeight: 700, color, margin: 0, lineHeight: 1.5 }}>{text}</p>
  </div>
);

export default AdminTrackingControls;