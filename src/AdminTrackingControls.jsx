import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  MapPin, Plus, Milestone, FolderArchive, X, Calendar,
  Armchair, Compass, ImageIcon, Loader2, Truck, AlertTriangle,
  ChevronLeft, ChevronRight,
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

export const AdminTrackingControls = () => {
  const [activeTour, setActiveTour] = useState(null);
  const [toursList, setToursList] = useState([]);
  const [meetupStops, setMeetupStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customNotes, setCustomNotes] = useState({});
  const [trackingLogs, setTrackingLogs] = useState([]);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Checkpoint Inputs
  const [newLocName, setNewLocName] = useState('');
  const [newTime, setNewTime] = useState('');

  // Logistics Form States
  const [carType, setCarType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverContact, setDriverContact] = useState('');
  const [isLogisticsSaved, setIsLogisticsSaved] = useState(false);

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

  useEffect(() => {
    if (activeTour) {
      const isArchivedLocally = localStorage.getItem(`archived_tour_${activeTour.id}`);
      if (isArchivedLocally === 'true') {
        setMeetupStops([]);
        setTrackingLogs([]);
        setIsLogisticsSaved(false);
      } else {
        const savedStops = localStorage.getItem(`offline_stops_${activeTour.id}`);
        setMeetupStops(savedStops ? JSON.parse(savedStops) : []);

        const savedLogs = localStorage.getItem(`logs_${activeTour.id}`);
        setTrackingLogs(savedLogs ? JSON.parse(savedLogs) : []);

        const savedVehicle = localStorage.getItem(`vehicle_info_${activeTour.id}`);
        if (savedVehicle) {
          const parsed = JSON.parse(savedVehicle);
          setCarType(parsed.carType || '');
          setPlateNumber(parsed.plateNumber || '');
          setDriverName(parsed.driverName || '');
          setDriverContact(parsed.driverContact || '');
          setIsLogisticsSaved(true);
        } else {
          setCarType('');
          setPlateNumber('');
          setDriverName('');
          setDriverContact('');
          setIsLogisticsSaved(false);
        }
      }
    }
  }, [activeTour]);

  // SAVE VEHICLE DISPATCH
  const handleSaveVehicleInfo = (e) => {
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

    const manifest = { carType, plateNumber, driverName, driverContact };
    localStorage.setItem(`vehicle_info_${activeTour.id}`, JSON.stringify(manifest));
    setIsLogisticsSaved(true);
  };

  // 2. FIXED INSERT
  const handleAddPickupStop = async (e) => {
    e.preventDefault();
    if (!newLocName || !newTime || !activeTour) return;

    const newStopRow = {
      id: `stop-${Date.now()}`,
      tour_id: activeTour.id,
      location_name: newLocName,
      scheduled_time: newTime,
      status: 'DEPARTURE',
      note: '',
    };

    const updatedStops = [...meetupStops, newStopRow];
    setMeetupStops(updatedStops);
    localStorage.removeItem(`archived_tour_${activeTour.id}`);
    localStorage.setItem(`offline_stops_${activeTour.id}`, JSON.stringify(updatedStops));

    try {
      await supabase.from('tour_meetups').insert([newStopRow]);
    } catch (err) {
      console.log('Saved.');
    }

    setNewLocName('');
    setNewTime('');
  };

  // 3. ARCHIVE SESSION
  const executeArchiveTrackingTimeline = () => {
    if (!activeTour) return;
    localStorage.setItem(`archived_tour_${activeTour.id}`, 'true');
    localStorage.removeItem(`offline_stops_${activeTour.id}`);
    localStorage.removeItem(`logs_${activeTour.id}`);
    localStorage.removeItem(`vehicle_info_${activeTour.id}`);
    localStorage.removeItem('sandbox_live_checkpoint');
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

  // 4. TIMELINE FLOW CONTROLLER
  const updateStopStatus = async (stopId, newStatus) => {
    if (!activeTour) return;
    const typedNote = customNotes[stopId] || '';

    const currentLiveDateTime = new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });

    const updatedStops = meetupStops.map(stop => {
      if (stop.id === stopId) {
        return { ...stop, status: newStatus, note: typedNote || stop.note };
      }
      return stop;
    });

    setMeetupStops(updatedStops);
    localStorage.setItem(`offline_stops_${activeTour.id}`, JSON.stringify(updatedStops));

    const targetStop = meetupStops.find(s => s.id === stopId);
    if (targetStop) {
      let labelMessage = `Transit Update: Van is on the way or updating`;
      if (newStatus === 'DEPARTED') labelMessage = `Departure: Van has departed from its location.`;
      if (newStatus === 'ARRIVED') labelMessage = `Destination Reached: Van has arrived at the Final Pick-up [${targetStop.location_name}]`;

      const newLogEntry = {
        id: `log-${Date.now()}`,
        tour_id: activeTour.id,
        location_name: targetStop.location_name,
        status: newStatus,
        display_text: labelMessage,
        note: typedNote,
        timestamp: currentLiveDateTime,
      };

      const updatedLogs = [newLogEntry, ...trackingLogs];
      setTrackingLogs(updatedLogs);
      localStorage.setItem(`logs_${activeTour.id}`, JSON.stringify(updatedLogs));
      localStorage.setItem('sandbox_live_checkpoint', JSON.stringify(updatedLogs));
    }

    setCustomNotes(prev => ({ ...prev, [stopId]: '' }));
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
          customNotes={customNotes}
          setCustomNotes={setCustomNotes}
          isLogisticsSaved={isLogisticsSaved}
          setIsLogisticsSaved={setIsLogisticsSaved}
          carType={carType} setCarType={setCarType}
          plateNumber={plateNumber} setPlateNumber={setPlateNumber}
          driverName={driverName} setDriverName={setDriverName}
          driverContact={driverContact} setDriverContact={setDriverContact}
          newLocName={newLocName} setNewLocName={setNewLocName}
          newTime={newTime} setNewTime={setNewTime}
          hasActiveOrPendingStop={hasActiveOrPendingStop}
          onSaveVehicleInfo={handleSaveVehicleInfo}
          onAddPickupStop={handleAddPickupStop}
          onUpdateStopStatus={updateStopStatus}
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
   TRACKING CONSOLE MODAL
   (split panel, mirrors JoinerTracking's TrackingDetailModal —
   left panel adds the fleet-assignment form and checkpoint controls
   an admin needs; right panel is the same live timeline)
───────────────────────────────────────────── */
const TrackingConsoleModal = ({
  tour, meetupStops, trackingLogs, customNotes, setCustomNotes,
  isLogisticsSaved, setIsLogisticsSaved,
  carType, setCarType, plateNumber, setPlateNumber,
  driverName, setDriverName, driverContact, setDriverContact,
  newLocName, setNewLocName, newTime, setNewTime,
  hasActiveOrPendingStop, onSaveVehicleInfo, onAddPickupStop, onUpdateStopStatus,
  onRequestArchive, onClose,
}) => {
  const images = Array.isArray(tour.image_urls) ? tour.image_urls : (tour.image ? [tour.image] : []);

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
                      <button type="submit" style={{
                        width: '100%', padding: '11px 0',
                        background: '#C45C26', color: '#FDF6EE',
                        border: 'none', borderRadius: 999, cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 900,
                        fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                        boxShadow: '0 6px 20px rgba(196,92,38,0.3)',
                      }}>
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

              {/* Checkpoint management */}
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(196,92,38,0.1)', boxShadow: '0 2px 8px rgba(26,10,0,0.02)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ViewSection title="Checkpoint Management" titleColor="#C45C26" icon={<Milestone size={14} />}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
                    {!isLogisticsSaved ? (
                      <Notice
                        color="#9A5B1E" bg="rgba(232,162,101,0.15)"
                        icon={<AlertTriangle size={16} />}
                        text="Complete the fleet form above to enable checkpoint creation."
                      />
                    ) : hasActiveOrPendingStop && meetupStops.length > 0 ? (
                      <Notice
                        color="#9A5B1E" bg="rgba(232,162,101,0.15)"
                        icon={<AlertTriangle size={16} />}
                        text="Complete the arrival and departure of all checkpoints before adding new ones."
                      />
                    ) : (
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
                        <button type="submit" style={{
                          flexShrink: 0, width: 44,
                          background: '#1A0A00', color: '#FDF6EE',
                          border: 'none', borderRadius: 14, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Plus size={16} strokeWidth={3} />
                        </button>
                      </form>
                    )}

                    {meetupStops.length === 0 ? (
                      <div style={{
                        textAlign: 'center', padding: '1.5rem 1rem',
                        background: '#FDF6EE', borderRadius: 14,
                        border: '2px dashed rgba(196,92,38,0.2)',
                      }}>
                        <Milestone size={20} style={{ color: 'rgba(122,58,24,0.3)', marginBottom: 6 }} />
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(122,58,24,0.5)', margin: 0 }}>
                          No pickup stations created yet.
                        </p>
                      </div>
                    ) : (
                      meetupStops.map((stop) => {
                        const isUpcoming = stop.status === 'DEPARTURE';
                        const isOnTheWay = stop.status === 'CURRENTLY HERE';
                        const isArrived = stop.status === 'ARRIVED';
                        const isDeparted = stop.status === 'DEPARTED';
                        const canMessage = isDeparted || isOnTheWay;
                        const statusStyle = STOP_STATUS_STYLES[stop.status] || STOP_STATUS_STYLES.DEPARTURE;

                        return (
                          <div
                            key={stop.id}
                            style={{
                              background: isOnTheWay ? 'rgba(196,92,38,0.06)' : '#FDF6EE',
                              border: isOnTheWay ? '2px solid #C45C26' : '1px solid rgba(196,92,38,0.12)',
                              borderRadius: 14, padding: '0.9rem',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>
                                {stop.location_name} <span style={{ fontWeight: 600, opacity: 0.6 }}>(ETA: {stop.scheduled_time})</span>
                              </span>
                              <span style={{
                                flexShrink: 0,
                                background: statusStyle.bg, color: statusStyle.color,
                                fontSize: 8, fontWeight: 900, padding: '5px 10px', borderRadius: 999,
                                letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                              }}>
                                {statusStyle.label}
                              </span>
                            </div>
                            <input
                              type="text"
                              placeholder={!canMessage ? "Mark 'Departed' first to add location updates" : 'Type location updates…'}
                              disabled={!canMessage}
                              value={customNotes[stop.id] || ''}
                              onChange={(e) => setCustomNotes({ ...customNotes, [stop.id]: e.target.value })}
                              style={{
                                ...inputStyle, marginTop: 9, padding: '8px 12px', fontSize: 12,
                                background: !canMessage ? 'rgba(122,58,24,0.05)' : '#F2E4D0',
                                cursor: !canMessage ? 'not-allowed' : 'text',
                              }}
                            />
                            <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                              <StopActionButton
                                label="Departed"
                                disabled={isDeparted || isOnTheWay || isArrived}
                                onClick={() => onUpdateStopStatus(stop.id, 'DEPARTED')}
                                variant="dark"
                              />
                              <StopActionButton
                                label="Set Active"
                                disabled={isUpcoming || isArrived}
                                onClick={() => onUpdateStopStatus(stop.id, 'CURRENTLY HERE')}
                                variant="accent"
                              />
                              <StopActionButton
                                label="Arrived"
                                disabled={isUpcoming || isArrived}
                                onClick={() => onUpdateStopStatus(stop.id, 'ARRIVED')}
                                variant="solid"
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ViewSection>
              </div>
            </div>

            {/* Right panel: live tracking timeline — identical to JoinerTracking's */}
            <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column' }}>
              <ViewSection title="Tracking Details" titleColor="#C45C26" icon={<Compass size={14} />}>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 16, marginTop: 8 }}>
                  {!trackingLogs || trackingLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: 'rgba(122,58,24,0.5)' }}>
                      <Compass size={24} style={{ opacity: 0.5, marginBottom: 8 }} />
                      <p style={{ fontSize: 12, margin: 0, fontStyle: 'italic' }}>No logs posted yet.</p>
                    </div>
                  ) : (
                    trackingLogs.map((log, index) => {
                      const isArrivedStatus = log.status === 'ARRIVED';
                      const isLatestUpdate = index === 0;

                      let textColor = '#9CA3AF';
                      let timeColor = '#9CA3AF';
                      let textWeight = 500;
                      let dotColor = '#D1D5DB';

                      if (isArrivedStatus) {
                        textColor = PALETTE.espresso;
                        timeColor = PALETTE.espresso;
                        textWeight = 900;
                        dotColor = '#10B981';
                      } else if (isLatestUpdate) {
                        textColor = PALETTE.espresso;
                        timeColor = '#9CA3AF';
                        textWeight = 700;
                        dotColor = PALETTE.burntSienna;
                      }

                      return (
                        <div key={log.id || index} style={{ display: 'flex', gap: 16, position: 'relative', paddingBottom: 20, alignItems: 'flex-start' }}>
                          {index !== trackingLogs.length - 1 && (
                            <div style={{ position: 'absolute', left: 4, top: 16, bottom: 0, width: 2, background: '#E5E7EB', zIndex: 1 }} />
                          )}
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, marginTop: 5, zIndex: 2, flexShrink: 0 }} />

                          <div style={{ flex: 1, fontSize: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: textWeight, color: textColor }}>
                              <span style={{ lineHeight: 1.4 }}>{log.display_text || ''}</span>
                              <span style={{ fontSize: 10, color: timeColor, fontWeight: textWeight, whiteSpace: 'nowrap', marginLeft: 8 }}>
                                {log.timestamp || ''}
                              </span>
                            </div>
                            {log.note && <p style={{ margin: '4px 0 0', color: '#9CA3AF', fontSize: 11, fontStyle: 'italic' }}>— Note: "{log.note}"</p>}
                          </div>
                        </div>
                      );
                    })
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

const STOP_ACTION_STYLES = {
  dark:   { bg: '#1A0A00', color: '#FDF6EE' },
  accent: { bg: '#C45C26', color: '#FDF6EE' },
  solid:  { bg: '#7A3A18', color: '#FDF6EE' },
};

const StopActionButton = ({ label, disabled, onClick, variant }) => {
  const { bg, color } = STOP_ACTION_STYLES[variant] || STOP_ACTION_STYLES.dark;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, minWidth: 88,
        padding: '8px 8px',
        background: disabled ? 'rgba(122,58,24,0.12)' : bg,
        color: disabled ? 'rgba(122,58,24,0.4)' : color,
        border: 'none', borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', fontWeight: 900,
        fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
        transition: 'opacity 0.15s',
      }}
    >
      {label}
    </button>
  );
};

export default AdminTrackingControls;