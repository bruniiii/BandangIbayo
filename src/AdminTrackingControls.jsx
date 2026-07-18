import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  MapPin, Plus, Milestone, FolderArchive, X, Calendar,
  Armchair, Compass, ImageIcon, Loader2, Truck, AlertTriangle,
  ChevronLeft, ChevronRight, History, RefreshCw, Trash2
} from 'lucide-react';

const PALETTE = {
  espresso: '#1A0A00',
  burntSienna: '#C45C26',
  warmAmber: '#E8A265',
  cream: '#FDF6EE',
  rust: '#7A3A18',
};

const STOP_STATUS_STYLES = {
  DEPARTURE: { bg: 'rgba(232,162,101,0.25)', color: '#9A5B1E', label: 'Awaiting Departure' },
  DEPARTED: { bg: 'rgba(26,10,0,0.08)', color: 'rgba(26,10,0,0.6)', label: 'Departed' },
  'CURRENTLY HERE': { bg: '#C45C26', color: '#FDF6EE', label: 'On The Way' },
  ARRIVED: { bg: '#1A0A00', color: '#FDF6EE', label: 'Arrived' },
};

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
  
  // Custom states for validation modals rendering
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [appNotice, setAppNotice] = useState(null); 

  const [currentTab, setCurrentTab] = useState('active'); 
  const [isViewingArchivedSession, setIsViewingArchivedSession] = useState(false);
  const [forcedEditMode, setForcedEditMode] = useState(false); // ── BINALIK KO ITO ANNE PARA SA EDIT BUTTON! ──

  const [newLocName, setNewLocName] = useState('');
  const [newTime, setNewTime] = useState('');

  const [carType, setCarType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverContact, setDriverContact] = useState('');
  const [isLogisticsSaved, setIsLogisticsSaved] = useState(false);

  // FETCH TOURS DIRECTLY FROM DATABASE
  const fetchToursFromDatabase = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tours')
        .select('*')
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

  // LOAD DATA BASED ON DB STATUS AND EDIT OVERRIDES
  useEffect(() => {
    if (activeTour) {
      if (activeTour.is_archived && !forcedEditMode) {
      
        setIsViewingArchivedSession(true);
      } else {
        
        setIsViewingArchivedSession(false);
      }

      
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
        setCarType(''); setPlateNumber(''); setDriverName(''); setDriverContact('');
        setIsLogisticsSaved(false);
      }
    }
  }, [activeTour, forcedEditMode]);

  const handleSaveVehicleInfo = (e) => {
    e.preventDefault();
    if (!carType || !plateNumber || !driverName || !driverContact) {
      setAppNotice({
        type: 'warning',
        title: 'Form Incomplete',
        message: 'Please complete all driver and vehicle form fields.'
      });
      return;
    }

    const numericRegex = /^[0-9]+$/;
    if (!numericRegex.test(driverContact)) {
      setAppNotice({
        type: 'warning',
        title: 'Invalid Format',
        message: 'Invalid Format: Contact number must contain numeric values digits only!'
      });
      return;
    }

    const manifest = { carType, plateNumber, driverName, driverContact };
    localStorage.setItem(`vehicle_info_${activeTour.id}`, JSON.stringify(manifest));
    setIsLogisticsSaved(true);
  };

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
    localStorage.setItem(`offline_stops_${activeTour.id}`, JSON.stringify(updatedStops));

    try {
      await supabase.from('tour_meetups').insert([newStopRow]);
    } catch (err) {
      console.log('Saved.');
    }

    setNewLocName('');
    setNewTime('');
  };

  // ── CLEAR BUTTON VALIDATION HOOK LAYER ──
  const handleClearButtonClickCheck = () => {
    const hasData = meetupStops.length > 0 || trackingLogs.length > 0 || carType || plateNumber || driverName || driverContact;

    if (!hasData) {
      setAppNotice({
        type: 'warning',
        title: 'Form Already Empty',
        message: 'There is no active tracking logs, checkpoints, or fleet details to clear inside this tour session.'
      });
    } else {
      setShowClearConfirm(true);
    }
  };

  const executeClearAllTrackingData = () => {
    if (!activeTour) return;

    localStorage.setItem(`offline_stops_${activeTour.id}`, JSON.stringify([]));
    localStorage.setItem(`logs_${activeTour.id}`, JSON.stringify([]));
    localStorage.removeItem(`vehicle_info_${activeTour.id}`);
    localStorage.removeItem('sandbox_live_checkpoint');

    setMeetupStops([]);
    setTrackingLogs([]);
    setCarType('');
    setPlateNumber('');
    setDriverName('');
    setDriverContact('');
    setIsLogisticsSaved(false);
    setShowClearConfirm(false); 

    setAppNotice({
      type: 'success',
      title: 'Data Cleared',
      message: 'All checkpoints, timeline tracker logs, and fleet info have been wiped out successfully!'
    });
  };

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

  const displayedTours = toursList.filter(tour => {
    return currentTab === 'archive' ? tour.is_archived === true : !tour.is_archived;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 24, borderBottom: '2px solid rgba(196,92,38,0.1)', paddingBottom: 12, marginBottom: 24 }}>
        <button onClick={() => { setCurrentTab('active'); setForcedEditMode(false); }} style={{ background: 'none', border: 'none', padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: currentTab === 'active' ? '#C45C26' : 'rgba(26,10,0,0.4)', borderBottom: currentTab === 'active' ? '3px solid #C45C26' : '3px solid transparent', transition: 'all 0.2s' }}>Manage Active</button>
        <button onClick={() => setCurrentTab('archive')} style={{ background: 'none', border: 'none', padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6, color: currentTab === 'archive' ? '#C45C26' : 'rgba(26,10,0,0.4)', borderBottom: currentTab === 'archive' ? '3px solid #C45C26' : '3px solid transparent', transition: 'all 0.2s' }}><History size={15} /> Tracking Archive</button>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {loading ? (
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 0', color: 'rgba(122,58,24,0.4)' }}><Loader2 size={30} style={{ marginBottom: 10, animation: 'spin 1s linear infinite' }} /><p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>Loading Tour Directory…</p></div>
        ) : displayedTours.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '5rem 0', textAlign: 'center', background: '#FDF6EE', borderRadius: 20, border: '2px dashed rgba(196,92,38,0.2)' }}><p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.4)', margin: 0 }}>{currentTab === 'archive' ? 'No archived tracking records found.' : 'No active tours to track yet.'}</p></div>
        ) : displayedTours.map((tour) => (
          <TrackingTourCard key={tour.id} tour={tour} isArchiveMode={currentTab === 'archive'} onTrack={() => { setForcedEditMode(false); setActiveTour(tour); }} onEdit={() => { setForcedEditMode(true); setActiveTour(tour); }} />
        ))}
      </div>

      {activeTour && (
        <TrackingConsoleModal
          tour={activeTour} meetupStops={meetupStops} trackingLogs={trackingLogs} customNotes={customNotes} setCustomNotes={setCustomNotes} isLogisticsSaved={isLogisticsSaved} setIsLogisticsSaved={setIsLogisticsSaved} carType={carType} setCarType={setCarType} plateNumber={plateNumber} setPlateNumber={setPlateNumber} driverName={driverName} setDriverName={setDriverName} driverContact={driverContact} setDriverContact={setDriverContact} newLocName={newLocName} setNewLocName={setNewLocName} newTime={newTime} setNewTime={setNewTime} hasActiveOrPendingStop={hasActiveOrPendingStop} isArchivedSession={isViewingArchivedSession} isForcedEditing={forcedEditMode} onSaveVehicleInfo={handleSaveVehicleInfo} onAddPickupStop={handleAddPickupStop} onUpdateStopStatus={updateStopStatus} onClearAllData={handleClearButtonClickCheck} onClose={() => { setActiveTour(null); setIsLogisticsSaved(false); setForcedEditMode(false); }}
        />
      )}

      {/* ── CLEAR ALL VERIFICATION PANEL ── */}
      {showClearConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,10,0,0.5)', backdropFilter: 'blur(4px)', padding: 16 }}>
          <div style={{ background: '#FDF6EE', padding: '2.5rem 2rem', borderRadius: 28, boxShadow: '0 24px 64px rgba(26,10,0,0.15)', textAlign: 'center', width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 74, height: 74, borderRadius: '50%', background: '#8C2F1C', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, color: '#FDF6EE' }}><Trash2 size={32} /></div>
            <h3 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 12px', letterSpacing: '-0.01em' }}>Clear All Data?</h3>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.7, lineHeight: 1.6, margin: '0 0 26px', maxWidth: '90%' }}>Are you sure you want to delete all checkpoints, transit history logs, and vehicle info details for <span style={{ color: '#C45C26' }}>{activeTour?.title}</span>? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button onClick={() => setShowClearConfirm(false)} style={{ flex: 1, padding: '12px 0', background: '#E8D5BC', border: 'none', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A3A18' }}>Cancel</button>
              <button onClick={executeClearAllTrackingData} style={{ flex: 1, padding: '12px 0', background: '#8C2F1C', border: 'none', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FDF6EE' }}>Clear All</button>
            </div>
          </div>
        </div>
      )}

      {/* ── GENERAL SYSTEM NOTIFICATIONS ── */}
      {appNotice && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,10,0,0.5)', backdropFilter: 'blur(4px)', padding: 16 }}>
          <div style={{ background: '#FDF6EE', padding: '2.5rem 2rem', borderRadius: 28, boxShadow: '0 24px 64px rgba(26,10,0,0.15)', textAlign: 'center', width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 74, height: 74, borderRadius: '50%', background: appNotice.type === 'success' ? '#10B981' : '#C45C26', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, color: '#FDF6EE' }}>{appNotice.type === 'success' ? <RefreshCw size={32} /> : <AlertTriangle size={32} />}</div>
            <h3 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 12px' }}>{appNotice.title}</h3>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.7, lineHeight: 1.6, margin: '0 0 26px', maxWidth: '90%' }}>{appNotice.message}</p>
            <button onClick={() => setAppNotice(null)} style={{ width: '100%', padding: '12px 0', background: '#1A0A00', border: 'none', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FDF6EE' }}>OK</button>
          </div>
        </div>
      )}

    </div>
  );
};

/* ── TRACKING TOUR CARD COMPONENT ── */
const TrackingTourCard = ({ tour, isArchiveMode, onTrack, onEdit }) => {
  const [hovered, setHovered] = useState(false);
  const hasImage = Array.isArray(tour.image_urls) && tour.image_urls.length > 0;
  const displayImage = hasImage ? tour.image_urls[0] : (tour.image || '');

  return (
    <div style={{ background: '#FDF6EE', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(196,92,38,0.12)', boxShadow: hovered ? '0 12px 36px rgba(26,10,0,0.14)' : '0 4px 16px rgba(26,10,0,0.06)', transform: hovered ? 'translateY(-4px)' : 'translateY(0)', transition: 'all 0.25s', display: 'flex', flexDirection: 'column' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ height: 186, background: '#E8D5BC', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {displayImage ? <img src={displayImage} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.4s' }} alt="" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.2)' }}><ImageIcon size={44} /></div>}
        <div style={{ position: 'absolute', top: 12, right: 12 }}><span style={{ background: isArchiveMode ? 'rgba(26,10,0,0.6)' : PALETTE.burntSienna, color: '#FDF6EE', borderRadius: 999, padding: '4px 10px', fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}><Compass size={10} /> {isArchiveMode ? 'Archived Record' : 'Tracking'}</span></div>
      </div>
      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: '0 0 10px' }}>{tour.title}</h3>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 8px' }}><MapPin size={11} style={{ color: '#C45C26' }} /> {tour.destination || 'Not Specified'}</p>
          {(tour.start_date || tour.date) && (<p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 5, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}><Calendar size={11} style={{ color: '#C45C26' }} /> {tour.start_date || tour.date}</p>)}
        </div>
        
        {isArchiveMode ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={onTrack} style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', background: '#E8D5BC', color: '#1A0A00' }}>View</button>
            <button onClick={onEdit} style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.2)', color: '#7A3A18' }}>Edit</button>
            <div style={{ flex: 1.2, padding: '9px 0', borderRadius: 10, fontFamily: 'inherit', fontWeight: 900, fontSize: 8, letterSpacing: '0.04em', textTransform: 'uppercase', background: 'rgba(122,58,24,0.1)', color: 'rgba(122,58,24,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }} title="Please restore this tour in Tour Postings Management first">Locked</div>
          </div>
        ) : (
          <button onClick={onTrack} style={{ width: '100%', marginTop: 14, padding: '11px 0', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#1A0A00', color: '#FDF6EE' }}><Compass size={13} /> Track Checkpoints</button>
        )}
      </div>
    </div>
  );
};

/* Carousel Component */
const TourImageCarousel = ({ images = [] }) => {
  const [index, setIndex] = useState(0);
  const dragStartX = React.useRef(null);
  const hasImages = images.length > 0;
  const hasMultiple = images.length > 1;

  const goTo = (i) => setIndex(((i % images.length) + images.length) % images.length);
  const prev = (e) => { e.stopPropagation(); goTo(index - 1); };
  const next = (e) => { e.stopPropagation(); goTo(index + 1); };

  return (
    <div>
      <div style={{ position: 'relative', width: '100%', height: 190, borderRadius: 18, overflow: 'hidden', background: '#E8D5BC', marginBottom: hasMultiple ? 12 : 20, boxShadow: '0 8px 24px rgba(26,10,0,0.15)', flexShrink: 0 }} onPointerDown={(e) => { dragStartX.current = e.clientX ?? e.touches?.[0]?.clientX ?? null; }} onPointerUp={(e) => { if (dragStartX.current == null) return; const endX = e.clientX ?? e.changedTouches?.[0]?.clientX ?? dragStartX.current; if (Math.abs(endX - dragStartX.current) > 40) { endX - dragStartX.current > 0 ? goTo(index - 1) : goTo(index + 1); } dragStartX.current = null; }}>
        {hasImages ? (
          <div style={{ display: 'flex', width: '100%', height: '100%', transform: `translateX(-${index * 100}%)`, transition: 'transform 0.35s ease' }}>{images.map((url, i) => (<img key={i} src={url} draggable={false} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', flexShrink: 0 }} />))}</div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.3)' }}><ImageIcon size={40} /></div>
        )}
        {hasMultiple && (
          <>
            <button type="button" onClick={prev} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(26,10,0,0.5)', border: 'none', borderRadius: '50%', width: 30, height: 30, color: '#FDF6EE', cursor: 'pointer' }}><ChevronLeft size={18} /></button>
            <button type="button" onClick={next} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(26,10,0,0.5)', border: 'none', borderRadius: '50%', width: 30, height: 30, color: '#FDF6EE', cursor: 'pointer' }}><ChevronRight size={18} /></button>
          </>
        )}
      </div>
    </div>
  );
};

const ViewSection = ({ title, titleColor, icon, children }) => (
  <section>
    <h4 style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: titleColor || '#1A0A00', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'flex' }}>{icon}</span> {title}</h4>
    {children}
  </section>
);

/* ── TRACKING CONSOLE MODAL COMPONENT ── */
const TrackingConsoleModal = ({
  tour, meetupStops, trackingLogs, customNotes, setCustomNotes,
  isLogisticsSaved, setIsLogisticsSaved, carType, setCarType, plateNumber, setPlateNumber, driverName, setDriverName, driverContact, setDriverContact,
  newLocName, setNewLocName, newTime, setNewTime, hasActiveOrPendingStop, isArchivedSession, isForcedEditing, onSaveVehicleInfo, onAddPickupStop, onUpdateStopStatus,
  onClearAllData, onClose,
}) => {
  const images = Array.isArray(tour.image_urls) ? tour.image_urls : (tour.image ? [tour.image] : []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#FDF6EE', width: '100%', maxWidth: 1100, borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Modal Action Controls Bar */}
        <div style={{ position: 'absolute', top: 24, right: 24, zIndex: 50, display: 'flex', alignItems: 'center', gap: 14 }}>
          
          {/* Clear button */}
          {(isForcedEditing || !isArchivedSession) && (
            <button
              onClick={onClearAllData}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#8C2F1C', border: 'none', borderRadius: 999,
                padding: '8px 16px', cursor: 'pointer',
                color: '#FDF6EE', fontWeight: 900,
                fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
                boxShadow: '0 4px 14px rgba(140,47,28,0.3)',
              }}
            >
              <Trash2 size={12} /> Clear Form Info
            </button>
          )}

          <button onClick={onClose} style={{ background: 'rgba(253,246,238,0.9)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(26,10,0,0.6)', boxShadow: '0 4px 14px rgba(26,10,0,0.15)' }}><X size={20} /></button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>
            
            {/* Left Panel Workspace */}
            <div className="responsive-modal-padding" style={{ background: '#F2E4D0', padding: '2.5rem 2rem', borderRight: '1px solid rgba(196,92,38,0.12)', display: 'flex', flexDirection: 'column' }}>
              <TourImageCarousel images={images} />
              <h2 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', color: '#1A0A00', margin: '0 0 10px', lineHeight: 1.15 }}>{tour.title}</h2>
              <p style={{ margin: '0 0 20px', fontSize: 13, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 10 }}><MapPin size={16} style={{ color: '#C45C26', flexShrink: 0 }} /><span>{tour.destination || 'Dynamic Target Route'}</span></p>

              {/* Fleet details form row container */}
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(196,92,38,0.1)', boxShadow: '0 2px 8px rgba(26,10,0,0.02)', marginBottom: 20 }}>
                <ViewSection title="Assigned Fleet Details" titleColor="#C45C26" icon={<Truck size={14} />}>
                  {!isLogisticsSaved && !isArchivedSession ? (
                    <form onSubmit={onSaveVehicleInfo} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                      <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <input type="text" placeholder="Van Model (e.g., Toyota Hiace)" value={carType} onChange={e => setCarType(e.target.value)} style={inputStyle} />
                        <input type="text" placeholder="Plate No." value={plateNumber} onChange={e => setPlateNumber(e.target.value)} style={inputStyle} />
                      </div>
                      <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <input type="text" placeholder="Name of Driver" value={driverName} onChange={e => setDriverName(e.target.value)} style={inputStyle} />
                        <input type="text" placeholder="Contact No." value={driverContact} onChange={e => setDriverContact(e.target.value.replace(/[^0-9]/g, ''))} style={inputStyle} />
                      </div>
                      <button type="submit" style={{ width: '100%', padding: '11px 0', background: '#C45C26', color: '#FDF6EE', border: 'none', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', boxShadow: '0 6px 20px rgba(196,92,38,0.3)' }}>Save Details</button>
                    </form>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: '#1A0A00' }}>
                      <div><strong>Van Model:</strong> {carType || 'Pending Dispatch'}</div>
                      <div><strong>Plate No:</strong> {plateNumber || 'Pending Setup'}</div>
                      <div><strong>Driver:</strong> {driverName || 'Assigning Staff'}</div>
                      <div><strong>Contact:</strong> {driverContact || 'Not Available'}</div>
                      <div style={{ gridColumn: 'span 2', borderTop: '1px dashed rgba(26,10,0,0.1)', paddingTop: 10, marginTop: 2, display: 'flex', justifyContent: 'space-between', color: '#7A3A18', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} style={{ color: '#C45C26' }} /><span>{tour.start_date || tour.date || 'No Date Assigned'}</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Armchair size={14} style={{ color: '#C45C26' }} /><span>{tour.max_seats || tour.seats || 'N/A'} Seats</span></div>
                      </div>
                      {!isArchivedSession && (
                        <button onClick={() => setIsLogisticsSaved(false)} style={{ gridColumn: 'span 2', marginTop: 4, background: 'none', border: '1px dashed rgba(196,92,38,0.35)', padding: '7px 14px', borderRadius: 999, cursor: 'pointer', color: '#7A3A18', fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Edit Fleet Info</button>
                      )}
                    </div>
                  )}
                </ViewSection>
              </div>

              {/* Checkpoint Layout Section */}
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(196,92,38,0.1)', boxShadow: '0 2px 8px rgba(26,10,0,0.02)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ViewSection title="Checkpoint Form" titleColor="#C45C26" icon={<Milestone size={14} />}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
                    {isArchivedSession ? (
                      <Notice color="#1A0A00" bg="rgba(26,10,0,0.05)" icon={<FolderArchive size={16} />} text="This tour is archived in Postings Management. Click the 'Edit' button outside on the card directly if you want to modify active tracker updates." />
                    ) : !isLogisticsSaved ? (
                      <Notice color="#9A5B1E" bg="rgba(232,162,101,0.15)" icon={<AlertTriangle size={16} />} text="Complete the fleet form above to enable checkpoint creation." />
                    ) : hasActiveOrPendingStop && meetupStops.length > 0 ? (
                      <Notice color="#9A5B1E" bg="rgba(232,162,101,0.15)" icon={<AlertTriangle size={16} />} text="Complete the arrival and departure of all checkpoints before adding new ones." />
                    ) : (
                      <form onSubmit={onAddPickupStop} style={{ display: 'flex', gap: 10 }}>
                        <input type="text" placeholder="Location (e.g., SM MOA)" value={newLocName} onChange={e => setNewLocName(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
                        <input type="text" placeholder="ETA (e.g., 08:00 PM)" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                        <button type="submit" style={{ flexShrink: 0, width: 44, background: '#1A0A00', color: '#FDF6EE', border: 'none', borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={16} strokeWidth={3} /></button>
                      </form>
                    )}

                    {meetupStops.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1.5rem 1rem', background: '#FDF6EE', borderRadius: 14, border: '2px dashed rgba(196,92,38,0.2)' }}><Milestone size={20} style={{ color: 'rgba(122,58,24,0.3)', marginBottom: 6 }} /><p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(122,58,24,0.5)', margin: 0 }}>No pickup stations created yet.</p></div>
                    ) : (
                      meetupStops.map((stop) => {
                        const isUpcoming = stop.status === 'DEPARTURE'; const isOnTheWay = stop.status === 'CURRENTLY HERE'; const isArrived = stop.status === 'ARRIVED'; const isDeparted = stop.status === 'DEPARTED';
                        const canMessage = (isDeparted || isOnTheWay) && !isArchivedSession;
                        const statusStyle = STOP_STATUS_STYLES[stop.status] || STOP_STATUS_STYLES.DEPARTURE;

                        return (
                          <div key={stop.id} style={{ background: isOnTheWay ? 'rgba(196,92,38,0.06)' : '#FDF6EE', border: isOnTheWay ? '2px solid #C45C26' : '1px solid rgba(196,92,38,0.12)', borderRadius: 14, padding: '0.9rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>{stop.location_name} <span style={{ fontWeight: 600, opacity: 0.6 }}>(ETA: {stop.scheduled_time})</span></span>
                              <span style={{ flexShrink: 0, background: statusStyle.bg, color: statusStyle.color, fontSize: 8, fontWeight: 900, padding: '5px 10px', borderRadius: 999, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{statusStyle.label}</span>
                            </div>
                            <input type="text" placeholder={isArchivedSession ? 'Archived view dashboard' : !canMessage ? "Mark 'Departed' first to add location updates" : 'Type location updates…'} disabled={!canMessage || isArchivedSession} value={customNotes[stop.id] || ''} onChange={(e) => setCustomNotes({ ...customNotes, [stop.id]: e.target.value })} style={{ ...inputStyle, marginTop: 9, padding: '8px 12px', fontSize: 12, background: !canMessage || isArchivedSession ? 'rgba(122,58,24,0.05)' : '#F2E4D0', cursor: !canMessage || isArchivedSession ? 'not-allowed' : 'text' }} />
                            {!isArchivedSession && (
                              <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                                <StopActionButton label="Departed" disabled={isDeparted || isOnTheWay || isArrived} onClick={() => onUpdateStopStatus(stop.id, 'DEPARTED')} variant="dark" />
                                <StopActionButton label="Set Active" disabled={isUpcoming || isArrived} onClick={() => onUpdateStopStatus(stop.id, 'CURRENTLY HERE')} variant="accent" />
                                <StopActionButton label="Arrived" disabled={isUpcoming || isArrived} onClick={() => onUpdateStopStatus(stop.id, 'ARRIVED')} variant="solid" />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </ViewSection>
              </div>
            </div>

            <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column' }}>
              <ViewSection title="Tracking Logs Timeline" titleColor="#C45C26" icon={<Compass size={14} />}>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 16, marginTop: 8 }}>
                  {!trackingLogs || trackingLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: 'rgba(122,58,24,0.5)' }}><Compass size={24} style={{ opacity: 0.5, marginBottom: 8 }} /><p style={{ fontSize: 12, margin: 0, fontStyle: 'italic' }}>No logs posted yet.</p></div>
                  ) : (
                    trackingLogs.map((log, index) => {
                      const isArrivedStatus = log.status === 'ARRIVED'; const isLatestUpdate = index === 0;
                      let textColor = '#9CA3AF'; let timeColor = '#9CA3AF'; let textWeight = 500; let dotColor = '#D1D5DB';

                      if (isArrivedStatus) { textColor = PALETTE.espresso; timeColor = PALETTE.espresso; textWeight = 900; dotColor = '#10B981'; }
                      else if (isLatestUpdate) { textColor = PALETTE.espresso; timeColor = '#9CA3AF'; textWeight = 700; dotColor = PALETTE.burntSienna; }

                      return (
                        <div key={log.id || index} style={{ display: 'flex', gap: 16, position: 'relative', paddingBottom: 20, alignItems: 'flex-start' }}>
                          {index !== trackingLogs.length - 1 && (<div style={{ position: 'absolute', left: 4, top: 16, bottom: 0, width: 2, background: '#E5E7EB', zIndex: 1 }} />)}
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, marginTop: 5, zIndex: 2, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: textWeight, color: textColor }}><span style={{ lineHeight: 1.4 }}>{log.display_text || ''}</span><span style={{ fontSize: 10, color: timeColor, fontWeight: textWeight, whiteSpace: 'nowrap', marginLeft: 8 }}>{log.timestamp || ''}</span></div>
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

/* Notice Assistant */
const Notice = ({ color, bg, icon, text }) => (
  <div style={{ background: bg, borderRadius: 14, padding: '12px 16px', border: `1px solid ${color}33`, display: 'flex', gap: 10, alignItems: 'center' }}>
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
    <button onClick={onClick} disabled={disabled} style={{ flex: 1, minWidth: 88, padding: '8px 8px', background: disabled ? 'rgba(122,58,24,0.12)' : bg, color: disabled ? 'rgba(122,58,24,0.4)' : color, border: 'none', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'opacity 0.15s' }}>
      {label}
    </button>
  );
};

export default AdminTrackingControls;