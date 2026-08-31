import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  MapPin, Plus, Trash2, Archive, RefreshCw, History, X, Calendar,
  Armchair, Compass, ImageIcon, Loader2, Truck, Check, CheckCircle2,
  Navigation, Clock, Send, ChevronLeft, ChevronRight
} from 'lucide-react';

const PALETTE = {
  espresso: '#1A0A00',
  burntSienna: '#C45C26',
  warmAmber: '#E8A265',
  cream: '#FDF6EE',
  rust: '#7A3A18',
  parchment: '#F2E4D0',
};

const STOP_STATUS_STYLES = {
  DEPARTURE: { bg: 'rgba(232,162,101,0.25)', color: '#9A5B1E', label: 'Pending Pickup' },
  'CURRENTLY HERE': { bg: '#C45C26', color: '#FDF6EE', label: 'En Route / On The Way' },
  ARRIVED: { bg: '#1F8A5C', color: '#FDF6EE', label: 'Arrived at Stop' },
  DEPARTED: { bg: 'rgba(26,10,0,0.1)', color: 'rgba(26,10,0,0.6)', label: 'Departed' },
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#F2E4D0',
  border: '1px solid rgba(196,92,38,0.18)',
  borderRadius: 14,
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 600,
  color: '#1A0A00',
  fontFamily: 'inherit',
  outline: 'none',
};

export const AdminTrackingControls = () => {
  const [currentTab, setCurrentTab] = useState('active'); // 'active' | 'archive'
  const [activeTour, setActiveTour] = useState(null);
  const [toursList, setToursList] = useState([]);
  const [meetupStops, setMeetupStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingConsole, setLoadingConsole] = useState(false);
  const [trackingLogs, setTrackingLogs] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [savingStop, setSavingStop] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [clearingFeed, setClearingFeed] = useState(false);

  // New Checkpoint Inputs
  const [newLocName, setNewLocName] = useState('');
  const [newTime, setNewTime] = useState('');

  // Fleet & Driver Form States
  const [carType, setCarType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverContact, setDriverContact] = useState('');
  const [isLogisticsSaved, setIsLogisticsSaved] = useState(false);
  const [savingLogistics, setSavingLogistics] = useState(false);

  // 1. FETCH TOURS
  const fetchTours = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tours')
        .select('*')
        .eq('is_archived', currentTab === 'archive')
        .order('start_date', { ascending: currentTab !== 'archive' });

      if (!error && data) {
        setToursList(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentTab]);

  useEffect(() => {
    fetchTours();
  }, [fetchTours]);

  // 2. FETCH TRACKING STATE FOR ACTIVE TOUR
  const fetchTrackingConsole = useCallback(async (tourId) => {
    if (!tourId) return;
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

      setMeetupStops(Array.isArray(stops) ? stops : []);
      setTrackingLogs(Array.isArray(logs) ? logs : []);
    } catch (err) {
      console.error('Error loading tracking console:', err.message);
    } finally {
      setLoadingConsole(false);
    }
  }, []);

  useEffect(() => {
    if (activeTour?.id) {
      fetchTrackingConsole(activeTour.id);
    }
  }, [activeTour, fetchTrackingConsole]);

  // Realtime Subscriptions
  useEffect(() => {
    if (!activeTour?.id) return;
    const channel = supabase
      .channel(`admin-tracking-realtime-${activeTour.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_meetups' }, () => {
        fetchTrackingConsole(activeTour.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_tracking_logs' }, () => {
        fetchTrackingConsole(activeTour.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_vehicles' }, () => {
        fetchTrackingConsole(activeTour.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTour, fetchTrackingConsole]);

  // Toggle Archive Status
  const executeToggleArchive = async () => {
    if (!confirmAction) return;
    const { id, isArchived } = confirmAction;
    const { error } = await supabase.from('tours').update({ is_archived: !isArchived }).eq('id', id);
    if (error) {
      alert('Error updating archive status: ' + error.message);
    } else {
      fetchTours();
      if (activeTour?.id === id) setActiveTour(null);
    }
    setConfirmAction(null);
  };

  const handleSaveVehicleInfo = async (e) => {
    e.preventDefault();
    if (!activeTour?.id) return;
    if (!carType || !plateNumber || !driverName || !driverContact) {
      alert('Please fill in all driver and vehicle fields.');
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

  // Add Pickup Stop
  const handleAddPickupStop = async (e) => {
    e.preventDefault();
    if (!newLocName || !newTime || !activeTour?.id) return;

    setSavingStop(true);
    const { data, error } = await supabase.from('tour_meetups').insert([{
      tour_id: activeTour.id,
      location_name: newLocName.trim(),
      scheduled_time: newTime.trim(),
      status: 'DEPARTURE',
      note: '',
    }]).select();

    setSavingStop(false);
    if (error) {
      alert('Error adding checkpoint: ' + error.message);
      return;
    }

    setMeetupStops(prev => [...(prev || []), ...(data || [])]);
    setNewLocName('');
    setNewTime('');
  };

  // Delete Pickup Stop
  const handleDeleteStop = async (stopId) => {
    if (!window.confirm('Delete this pickup stop?')) return;

    const { error } = await supabase.from('tour_meetups').delete().eq('id', stopId);
    if (error) {
      alert('Error deleting stop: ' + error.message);
      return;
    }
    setMeetupStops(prev => (prev || []).filter(s => s.id !== stopId));
  };

  // Stop Field Change
  const handleStopFieldChange = (stopId, field, value) => {
    setMeetupStops(prev =>
      (prev || []).map(s => (s.id === stopId ? { ...s, [field]: value } : s))
    );
  };

  // Update Stop Details
  const handleUpdateStopDetails = async (stop) => {
    if (!activeTour?.id || !stop?.id) return;
    const { error } = await supabase
      .from('tour_meetups')
      .update({
        scheduled_time: stop.scheduled_time,
        note: stop.note || ''
      })
      .eq('id', stop.id);

    if (error) {
      alert('Error updating stop: ' + error.message);
      return;
    }

    await supabase.from('tour_tracking_logs').insert([{
      tour_id: activeTour.id,
      meetup_id: stop.id,
      location_name: stop.location_name,
      status: stop.status,
      display_text: `ETA Update: Vehicle expected at [${stop.location_name}] by ${stop.scheduled_time}.`,
      note: stop.note || '',
    }]);

    alert('ETA updated for joiners.');
    fetchTrackingConsole(activeTour.id);
  };

  // Clear Live Tracking Activity Feed
  const handleClearTrackingFeed = async () => {
    if (!activeTour?.id) return;
    if (!window.confirm('Clear all tracking activity logs for this tour? This cannot be undone.')) return;

    setClearingFeed(true);
    const { error } = await supabase.from('tour_tracking_logs').delete().eq('tour_id', activeTour.id);
    setClearingFeed(false);

    if (error) {
      alert('Error clearing feed: ' + error.message);
      return;
    }
    setTrackingLogs([]);
  };

  // Advance Vehicle Progress
  const advanceToNextStop = async () => {
    if (!activeTour?.id || advancing || !Array.isArray(meetupStops)) return;
    const idx = meetupStops.findIndex(s => s.status !== 'ARRIVED');
    if (idx === -1) return;
    const current = meetupStops[idx];

    setAdvancing(true);
    try {
      if (current.status !== 'CURRENTLY HERE') {
        const { error } = await supabase
          .from('tour_meetups')
          .update({ status: 'CURRENTLY HERE' })
          .eq('id', current.id);
        if (error) throw error;

        await supabase.from('tour_tracking_logs').insert([{
          tour_id: activeTour.id,
          meetup_id: current.id,
          location_name: current.location_name,
          status: 'CURRENTLY HERE',
          display_text: `En Route: Driver ${driverName || 'assigned'} is heading to [${current.location_name}]. ETA: ${current.scheduled_time}`,
          note: current.note || '',
        }]);
      } else {
        const { error } = await supabase
          .from('tour_meetups')
          .update({ status: 'ARRIVED' })
          .eq('id', current.id);
        if (error) throw error;

        await supabase.from('tour_tracking_logs').insert([{
          tour_id: activeTour.id,
          meetup_id: current.id,
          location_name: current.location_name,
          status: 'ARRIVED',
          display_text: `Arrived: Vehicle (${plateNumber || 'Van'}) arrived at [${current.location_name}]. Joiners please board now.`,
          note: current.note || '',
        }]);

        const next = meetupStops[idx + 1];
        if (next) {
          await supabase.from('tour_meetups').update({ status: 'CURRENTLY HERE' }).eq('id', next.id);
          await supabase.from('tour_tracking_logs').insert([{
            tour_id: activeTour.id,
            meetup_id: next.id,
            location_name: next.location_name,
            status: 'CURRENTLY HERE',
            display_text: `En Route: Heading next to [${next.location_name}]. ETA: ${next.scheduled_time}`,
            note: next.note || '',
          }]);
        }
      }
      fetchTrackingConsole(activeTour.id);
    } catch (err) {
      alert('Error advancing status: ' + err.message);
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Top Header Tabs ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(196,92,38,0.15)',
        paddingBottom: 16, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <button
            onClick={() => setCurrentTab('active')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', padding: 0,
              fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em',
              color: currentTab === 'active' ? '#1A0A00' : 'rgba(122,58,24,0.3)',
            }}
          >
            Active Trips
          </button>
          <span style={{ color: 'rgba(196,92,38,0.25)', fontSize: 18 }}>|</span>
          <button
            onClick={() => setCurrentTab('archive')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', padding: 0,
              fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em',
              color: currentTab === 'archive' ? '#1A0A00' : 'rgba(122,58,24,0.3)',
            }}
          >
            <History size={18} /> Tracking Archive
          </button>
        </div>
      </div>

      {/* ── Cards Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {loading ? (
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5rem 0', color: 'rgba(122,58,24,0.4)' }}>
            <Loader2 size={30} style={{ marginBottom: 10, animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading Tours…</p>
          </div>
        ) : toursList.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '5rem 0', textAlign: 'center', background: '#FDF6EE', borderRadius: 20, border: '2px dashed rgba(196,92,38,0.2)' }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.4)' }}>
              No {currentTab === 'archive' ? 'archived' : 'active'} tours found.
            </p>
          </div>
        ) : toursList.map(tour => (
          <TrackingTourCard
            key={tour.id}
            tour={tour}
            onTrack={() => setActiveTour(tour)}
            onConfirmArchive={() => setConfirmAction({ id: tour.id, isArchived: tour.is_archived })}
          />
        ))}
      </div>

      {/* ── Tracking Console Modal ── */}
      {activeTour && (
        <TrackingConsoleModal
          tour={activeTour}
          meetupStops={meetupStops || []}
          trackingLogs={trackingLogs || []}
          loadingConsole={loadingConsole}
          isLogisticsSaved={isLogisticsSaved}
          setIsLogisticsSaved={setIsLogisticsSaved}
          savingLogistics={savingLogistics}
          savingStop={savingStop}
          advancing={advancing}
          carType={carType} setCarType={setCarType}
          plateNumber={plateNumber} setPlateNumber={setPlateNumber}
          driverName={driverName} setDriverName={setDriverName}
          driverContact={driverContact} setDriverContact={setDriverContact}
          newLocName={newLocName} setNewLocName={setNewLocName}
          newTime={newTime} setNewTime={setNewTime}
          onSaveVehicleInfo={handleSaveVehicleInfo}
          onAddPickupStop={handleAddPickupStop}
          onDeleteStop={handleDeleteStop}
          onStopFieldChange={handleStopFieldChange}
          onUpdateStopDetails={handleUpdateStopDetails}
          onAdvanceStop={advanceToNextStop}
          onClearFeed={handleClearTrackingFeed}
          clearingFeed={clearingFeed}
          onRequestArchive={() => setConfirmAction({ id: activeTour.id, isArchived: activeTour.is_archived })}
          onClose={() => { setActiveTour(null); setIsLogisticsSaved(false); }}
        />
      )}

      {/* ── Archive / Restore Confirmation Modal ── */}
      {confirmAction && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10050,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)', padding: 16,
        }}>
          <div style={{
            background: '#FDF6EE', padding: '3rem',
            borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
            textAlign: 'center', width: '100%', maxWidth: 420,
            borderTop: `8px solid ${confirmAction.isArchived ? '#C45C26' : '#E8A265'}`,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: confirmAction.isArchived ? '#C45C26' : '#1A0A00',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', color: '#FDF6EE',
            }}>
              {confirmAction.isArchived ? <RefreshCw size={36} /> : <Archive size={36} />}
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: '#1A0A00', margin: '0 0 10px', textTransform: 'uppercase' }}>
              {confirmAction.isArchived ? 'Restore Tour?' : 'Archive Tour?'}
            </h3>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', opacity: 0.8, lineHeight: 1.6, margin: '0 0 24px' }}>
              {confirmAction.isArchived
                ? 'This tour will be moved back to the active listings.'
                : 'This tour will be archived and hidden from the active list.'}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setConfirmAction(null)} style={{ flex: 1, padding: '12px 0', background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.2)', borderRadius: 999, fontWeight: 900, fontSize: 10, cursor: 'pointer', color: '#7A3A18', textTransform: 'uppercase' }}>
                Cancel
              </button>
              <button onClick={executeToggleArchive} style={{ flex: 1, padding: '12px 0', background: confirmAction.isArchived ? '#C45C26' : '#1A0A00', border: 'none', borderRadius: 999, fontWeight: 900, fontSize: 10, cursor: 'pointer', color: '#FDF6EE', textTransform: 'uppercase' }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TrackingTourCard = ({ tour, onTrack, onConfirmArchive }) => {
  const [hovered, setHovered] = useState(false);
  const displayImage = Array.isArray(tour?.image_urls) && tour.image_urls.length > 0
    ? tour.image_urls[0]
    : (tour?.image || '');

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
      <div style={{ height: 186, background: '#E8D5BC', position: 'relative' }}>
        {displayImage ? (
          <img src={displayImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.2)' }}><ImageIcon size={44} /></div>
        )}
        <span style={{ position: 'absolute', top: 12, right: 12, background: tour?.is_archived ? '#7A3A18' : PALETTE.burntSienna, color: '#FDF6EE', borderRadius: 999, padding: '4px 10px', fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Compass size={10} /> {tour?.is_archived ? 'Archived' : 'Tracking'}
        </span>
      </div>

      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', margin: '0 0 8px' }}>{tour?.title || 'Untitled Tour'}</h3>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 6px' }}>
            <MapPin size={12} style={{ color: '#C45C26' }} /> {tour?.destination || 'Destination'}
          </p>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.78, display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}>
            <Calendar size={11} style={{ color: '#C45C26' }} /> {tour?.start_date || tour?.date || 'Scheduled'}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 14 }}>
          <button
            onClick={onTrack}
            style={{
              padding: '10px 0', border: 'none', borderRadius: 12, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 900, fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', background: '#1A0A00', color: '#FDF6EE',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Navigation size={13} /> Manage ETA
          </button>
          <button
            onClick={onConfirmArchive}
            style={{
              padding: '10px 0', border: 'none', borderRadius: 12, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 900, fontSize: 9, letterSpacing: '0.1em',
              textTransform: 'uppercase', background: tour?.is_archived ? '#C45C26' : '#F2E4D0',
              color: tour?.is_archived ? '#FDF6EE' : '#7A3A18',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            {tour?.is_archived ? <RefreshCw size={11} /> : <Archive size={11} />}
            {tour?.is_archived ? 'Restore' : 'Archive'}
          </button>
        </div>
      </div>
    </div>
  );
};

const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
};

const TrackingConsoleModal = ({
  tour, meetupStops = [], trackingLogs = [], loadingConsole,
  isLogisticsSaved, setIsLogisticsSaved,
  savingLogistics, savingStop, advancing,
  carType, setCarType, plateNumber, setPlateNumber,
  driverName, setDriverName, driverContact, setDriverContact,
  newLocName, setNewLocName, newTime, setNewTime,
  onSaveVehicleInfo, onAddPickupStop, onDeleteStop,
  onStopFieldChange, onUpdateStopDetails,
  onAdvanceStop, onClearFeed, clearingFeed, onRequestArchive, onClose,
}) => {
  const safeStops = Array.isArray(meetupStops) ? meetupStops : [];
  const safeLogs = Array.isArray(trackingLogs) ? trackingLogs : [];
  const activeIdx = safeStops.findIndex(s => s.status !== 'ARRIVED');
  const allArrived = safeStops.length > 0 && activeIdx === -1;
  const currentActiveStop = !allArrived && activeIdx !== -1 ? safeStops[activeIdx] : null;
  const isMobile = useIsMobile();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 1150, borderRadius: 28,
        boxShadow: '0 32px 80px rgba(26,10,0,0.4)', overflow: 'hidden',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Top Controls */}
        <div style={{ position: 'absolute', top: isMobile ? 12 : 20, right: isMobile ? 12 : 20, zIndex: 50, display: 'flex', gap: isMobile ? 8 : 12 }}>
          <button
            type="button"
            onClick={onRequestArchive}
            title={tour?.is_archived ? 'Restore Tour' : 'Archive Tour'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: '#FDF6EE',
              border: '1px solid rgba(196,92,38,0.3)', borderRadius: 999,
              padding: isMobile ? '8px' : '7px 14px',
              cursor: 'pointer', color: '#7A3A18', fontWeight: 900, fontSize: 9, textTransform: 'uppercase',
            }}
          >
            {tour?.is_archived ? <RefreshCw size={12} /> : <Archive size={12} />}
            {!isMobile && (tour?.is_archived ? 'Restore Tour' : 'Archive Tour')}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#FDF6EE', border: '1px solid rgba(196,92,38,0.2)', borderRadius: '50%',
              width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#1A0A00', flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', minHeight: 0 }}>
            {/* Left Console */}
            <div style={{
              background: '#F2E4D0',
              padding: isMobile ? '4rem 1.25rem 1.5rem' : '2.2rem 2rem',
              borderRight: isMobile ? 'none' : '1px solid rgba(196,92,38,0.12)',
              borderBottom: isMobile ? '1px solid rgba(196,92,38,0.12)' : 'none',
            }}>
              <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#1A0A00', margin: '0 0 6px' }}>{tour?.title}</h2>
              <p style={{ margin: '0 0 18px', fontSize: 12, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} style={{ color: '#C45C26' }} /> {tour?.destination}
              </p>

              {/* Fleet & Driver */}
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, marginBottom: 18, border: '1px solid rgba(196,92,38,0.1)' }}>
                <h4 style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C45C26', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Truck size={14} /> Assigned Fleet & Driver Info
                </h4>

                {!isLogisticsSaved ? (
                  <form onSubmit={onSaveVehicleInfo} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                      <input type="text" placeholder="Van Model (e.g. Toyota Hiace)" value={carType} onChange={e => setCarType(e.target.value)} style={inputStyle} />
                      <input type="text" placeholder="Plate Number (e.g. NBT-8921)" value={plateNumber} onChange={e => setPlateNumber(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                      <input type="text" placeholder="Driver Name" value={driverName} onChange={e => setDriverName(e.target.value)} style={inputStyle} />
                      <input type="text" placeholder="Driver Contact No." value={driverContact} onChange={e => setDriverContact(e.target.value)} style={inputStyle} />
                    </div>
                    <button type="submit" disabled={savingLogistics} style={{
                      padding: '10px 0', background: '#C45C26', color: '#FDF6EE',
                      border: 'none', borderRadius: 999, fontWeight: 900, fontSize: 10,
                      letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer',
                    }}>
                      {savingLogistics ? 'Saving…' : 'Save Driver & Vehicle'}
                    </button>
                  </form>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, fontSize: 12, color: '#1A0A00' }}>
                    <div><strong>Vehicle:</strong> {carType}</div>
                    <div><strong>Plate:</strong> {plateNumber}</div>
                    <div><strong>Driver:</strong> {driverName}</div>
                    <div><strong>Contact:</strong> {driverContact}</div>
                    <button type="button" onClick={() => setIsLogisticsSaved(false)} style={{ gridColumn: isMobile ? 'auto' : 'span 2', background: 'none', border: '1px dashed #C45C26', borderRadius: 999, padding: '6px', fontSize: 9, fontWeight: 800, color: '#7A3A18', cursor: 'pointer', textTransform: 'uppercase' }}>
                      Edit Driver & Vehicle
                    </button>
                  </div>
                )}
              </div>

              {/* Manual Stops */}
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(196,92,38,0.1)' }}>
                <h4 style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C45C26', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={14} /> Manual Pickup Stops & ETA Dispatch
                </h4>

                <form onSubmit={onAddPickupStop} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 14 }}>
                  <input
                    type="text"
                    placeholder="Pickup Point (e.g. Shell Mindanao Ave)"
                    value={newLocName}
                    onChange={e => setNewLocName(e.target.value)}
                    style={{ ...inputStyle, flex: 2 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="ETA (e.g. 04:30 AM)"
                      value={newTime}
                      onChange={e => setNewTime(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button type="submit" disabled={savingStop} style={{
                      width: 44, flexShrink: 0, background: '#1A0A00', color: '#FDF6EE',
                      border: 'none', borderRadius: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {savingStop ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={18} />}
                    </button>
                  </div>
                </form>

                {safeStops.length === 0 ? (
                  <p style={{ fontSize: 11, fontStyle: 'italic', color: '#7A3A18', opacity: 0.7, textAlign: 'center', margin: '14px 0' }}>
                    No pickup stops added yet. Create one above.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {safeStops.map((stop, i) => {
                      if (!stop) return null;
                      const isCurrent = i === activeIdx;
                      const isArrived = stop.status === 'ARRIVED';
                      const badge = STOP_STATUS_STYLES[stop.status] || STOP_STATUS_STYLES.DEPARTURE;

                      return (
                        <div
                          key={stop.id || i}
                          style={{
                            padding: '12px', borderRadius: 14,
                            background: isCurrent ? 'rgba(196,92,38,0.06)' : '#FDF6EE',
                            border: isCurrent ? '2px solid #C45C26' : '1px solid rgba(196,92,38,0.14)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                width: 22, height: 22, borderRadius: '50%',
                                background: isArrived ? '#1F8A5C' : isCurrent ? '#C45C26' : 'rgba(26,10,0,0.1)',
                                color: '#FFF', fontSize: 10, fontWeight: 900,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {isArrived ? <Check size={12} /> : i + 1}
                              </span>
                              <strong style={{ fontSize: 13, color: '#1A0A00' }}>{stop.location_name}</strong>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ background: badge.bg, color: badge.color, fontSize: 8, fontWeight: 900, padding: '4px 8px', borderRadius: 999, textTransform: 'uppercase' }}>
                                {badge.label}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onDeleteStop(stop.id);
                                }}
                                style={{
                                  background: 'rgba(140,47,28,0.1)', border: 'none',
                                  borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: '#8C2F1C',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                                title="Delete stop"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Controlled Stop Edit Inputs */}
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr auto', gap: 6, alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder="ETA"
                              value={stop.scheduled_time || ''}
                              onChange={e => onStopFieldChange(stop.id, 'scheduled_time', e.target.value)}
                              style={{ ...inputStyle, padding: '6px 10px', fontSize: 11 }}
                            />
                            <input
                              type="text"
                              placeholder="Joiner note (e.g. Near Gate 3)"
                              value={stop.note || ''}
                              onChange={e => onStopFieldChange(stop.id, 'note', e.target.value)}
                              style={{ ...inputStyle, padding: '6px 10px', fontSize: 11 }}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                onUpdateStopDetails(stop);
                              }}
                              style={{
                                background: '#7A3A18', color: '#FDF6EE', border: 'none',
                                borderRadius: 10, padding: '7px 12px', cursor: 'pointer',
                                fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 4, width: isMobile ? '100%' : 'auto',
                              }}
                            >
                              <Send size={11} /> Update
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {allArrived ? (
                      <div style={{ background: 'rgba(31,138,92,0.1)', padding: 12, borderRadius: 12, color: '#1F8A5C', fontSize: 11, fontWeight: 800, textAlign: 'center' }}>
                        All joiner pickup checkpoints completed!
                      </div>
                    ) : currentActiveStop && (
                      <button
                        type="button"
                        onClick={onAdvanceStop}
                        disabled={advancing}
                        style={{
                          marginTop: 6, width: '100%', padding: '13px 0',
                          background: currentActiveStop.status === 'CURRENTLY HERE' ? '#1F8A5C' : '#1A0A00',
                          color: '#FDF6EE', border: 'none', borderRadius: 999,
                          fontWeight: 900, fontSize: 11, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        {advancing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Navigation size={14} />}
                        {currentActiveStop.status === 'CURRENTLY HERE'
                          ? `Confirm Arrival at [${currentActiveStop.location_name}]`
                          : `Dispatch Van: En Route to [${currentActiveStop.location_name}]`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Live Feed */}
            <div style={{ padding: isMobile ? '1.5rem 1.25rem' : '4.5rem 2rem 2.2rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4 style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C45C26', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Compass size={14} /> Live Tracking Activity Feed
                </h4>
                {safeLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearFeed}
                    disabled={clearingFeed}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: 'rgba(140,47,28,0.08)', border: 'none',
                      borderRadius: 999, padding: '6px 12px', cursor: clearingFeed ? 'default' : 'pointer',
                      color: '#8C2F1C', fontWeight: 900, fontSize: 9, letterSpacing: '0.1em',
                      textTransform: 'uppercase', opacity: clearingFeed ? 0.6 : 1,
                    }}
                    title="Clear all tracking activity logs"
                  >
                    {clearingFeed ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                    Reset Feed
                  </button>
                )}
              </div>

              {loadingConsole ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: '#7A3A18' }}>
                  <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                  <p style={{ fontSize: 11 }}>Loading tracking logs…</p>
                </div>
              ) : (
                <TrackingTimeline logs={safeLogs} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const splitLogText = (text) => {
  if (!text) return { title: 'Update', description: '' };
  const idx = text.indexOf(':');
  if (idx === -1) return { title: text, description: '' };
  return { title: text.slice(0, idx).trim(), description: text.slice(idx + 1).trim() };
};

const TrackingTimeline = ({ logs = [] }) => {
  const safeLogs = Array.isArray(logs) ? logs : [];
  if (safeLogs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#FDF6EE', borderRadius: 16, border: '2px dashed rgba(196,92,38,0.2)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', opacity: 0.6, margin: 0 }}>No status updates dispatched yet.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {safeLogs.map((log, index) => {
        if (!log) return null;
        const { title, description } = splitLogText(log.display_text);
        const date = log.created_at ? new Date(log.created_at) : new Date();
        const timeFormatted = isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return (
          <div key={log.id || index} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            <div style={{ width: 60, fontSize: 10, fontWeight: 800, color: '#7A3A18', opacity: 0.7, paddingTop: 2 }}>
              {timeFormatted}
            </div>
            <div style={{ width: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: index === 0 ? '#C45C26' : 'rgba(26,10,0,0.3)', zIndex: 2 }} />
              {index !== safeLogs.length - 1 && <div style={{ width: 2, flex: 1, background: 'rgba(196,92,38,0.2)', margin: '4px 0' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 12, color: '#1A0A00' }}>{title}</strong>
              <p style={{ fontSize: 11, color: '#7A3A18', margin: '2px 0 0', lineHeight: 1.4 }}>{description}</p>
              {log.note && (
                <div style={{ background: 'rgba(196,92,38,0.08)', padding: '4px 8px', borderRadius: 6, marginTop: 4, fontSize: 10, fontWeight: 700, color: '#9A5B1E' }}>
                  Note: {log.note}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AdminTrackingControls;