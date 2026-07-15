import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { MapPin, Check, ArrowLeft, Plus, Milestone, Flag, FolderArchive, X, Calendar, Armchair } from 'lucide-react';

const PALETTE = {
  espresso: '#1A0A00',
  burntSienna: '#C45C26',
  warmAmber: '#E8A265',
  cream: '#FDF6EE',
  rust: '#7A3A18',
};

export const AdminTrackingControls = () => {
  const [activeTour, setActiveTour] = useState(null); 
  const [toursList, setToursList] = useState([]);
  const [meetupStops, setMeetupStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customNotes, setCustomNotes] = useState({});
  const [trackingLogs, setTrackingLogs] = useState([]);

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
      alert("Please complete all driver and vehicle form fields.");
      return;
    }

    const numericRegex = /^[0-9]+$/;
    if (!numericRegex.test(driverContact)) {
      alert("Invalid Format: Contact number must contain numeric values digits only!");
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
      note: ''
    };

    const updatedStops = [...meetupStops, newStopRow];
    setMeetupStops(updatedStops);
    localStorage.removeItem(`archived_tour_${activeTour.id}`);
    localStorage.setItem(`offline_stops_${activeTour.id}`, JSON.stringify(updatedStops));

    try {
      await supabase.from('tour_meetups').insert([newStopRow]);
    } catch (err) {
      console.log("Saved.");
    }

    setNewLocName('');
    setNewTime('');
  };

  // 3. ARCHIVE SESSION
  const handleArchiveTrackingTimeline = async () => {
    if (!activeTour) return;
    if (window.confirm(`Do you want to archive the tracking timeline for [${activeTour.title}]?`)) {
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
      setActiveTour(null);
    }
  };

  // 4. TIMELINE FLOW CONTROLLER
  const updateStopStatus = async (stopId, newStatus) => {
    if (!activeTour) return;
    const typedNote = customNotes[stopId] || "";

    const currentLiveDateTime = new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
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
        timestamp: currentLiveDateTime
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
    <div style={{ width: '100%', boxSizing: 'border-box', padding: '10px', fontFamily: 'sans-serif' }}>
      
      {/* MAIN TOUR LISTING GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 24 }}>
        {toursList.map((tour) => {
          const hasImage = Array.isArray(tour.image_urls) && tour.image_urls.length > 0;
          const displayImage = hasImage ? tour.image_urls[0] : (tour.image || '');
          return (
            <div key={tour.id} style={{ background: '#FFF', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
              <div style={{ height: 140, background: PALETTE.espresso, position: 'relative' }}>
                {displayImage ? <img src={displayImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#E8D5BC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>⛰️</div>}
              </div>
              <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 15, color: PALETTE.espresso, fontWeight: 900 }}>{tour.title}</h3>
                
                {/* 📍 CUSTOM THEMED LOCATION ICON - MATCHING TOUR MANAGEMENT */}
                <p style={{ margin: 0, fontSize: 11, color: '#7A3A18', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color={PALETTE.burntSienna} strokeWidth={1.8} />
                  <span>{tour.destination || 'Not Specified'}</span>
                </p>
                
                <button onClick={() => setActiveTour(tour)} style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 12, background: PALETTE.burntSienna, color: '#FFF', border: 'none', cursor: 'pointer', fontWeight: 800 }}>Track Checkpoints</button>
              </div>
            </div>
          );
        })}
      </div>

      {activeTour && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(26, 10, 0, 0.45)', backdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px', boxSizing: 'border-box'
        }}>
          
          <div style={{
            width: '100%', maxWidth: '1150px', height: '90vh', background: '#FDF6EE', 
            borderRadius: '28px', border: '1px solid rgba(196,92,38,0.2)', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 60px rgba(0,0,0,0.15)', overflow: 'hidden'
          }}>
            
            {/* MODAL SYSTEM HEADERBAR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 2rem', background: '#FFF', borderBottom: '1px solid rgba(26,10,0,0.06)' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <button onClick={handleArchiveTrackingTimeline} style={{ background: 'none', border: 'none', color: '#EF4444', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px' }}><FolderArchive size={14} color="#EF4444" /> Archive Tour Tracking</button>
                <X size={20} style={{ cursor: 'pointer', color: '#888' }} onClick={() => { setActiveTour(null); setIsLogisticsSaved(false); }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', flex: 1, overflow: 'hidden' }}>
              
              {/* 👈 LEFT PANEL LAYER (Inputs, Image Banner, Controls) */}
              <div style={{ padding: '2rem', overflowY: 'auto', borderRight: '1px solid rgba(26,10,0,0.06)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ width: '100%', height: '140px', borderRadius: '16px', overflow: 'hidden', background: PALETTE.espresso, flexShrink: 0 }}>
                  {((Array.isArray(activeTour.image_urls) && activeTour.image_urls.length > 0) || activeTour.image) ? <img src={Array.isArray(activeTour.image_urls) ? activeTour.image_urls[0] : activeTour.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#E8D5BC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🚌</div>}
                </div>

                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: PALETTE.espresso, margin: '0 0 2px 0' }}>{activeTour.title}</h2>
                  
                  <p style={{ margin: 0, fontSize: '12px', color: '#7A3A18', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} color={PALETTE.burntSienna} strokeWidth={1.8} />
                    <span> {activeTour.destination || 'Dynamic Target'}</span>
                  </p>
                </div>

                {/* VEHICLE MANAGEMENT  */}
                <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(196,92,38,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '13px', color: PALETTE.burntSienna, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Assign Fleet Details</h3>
                  {!isLogisticsSaved ? (
                    <form onSubmit={handleSaveVehicleInfo} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <input type="text" placeholder="Van Model (e.g., Toyota Hiace)" value={carType} onChange={e => setCarType(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #CCC', outline: 'none', fontSize: '13px' }} />
                        <input type="text" placeholder="Template / Plate No." value={plateNumber} onChange={e => setPlateNumber(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #CCC', outline: 'none', fontSize: '13px' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <input type="text" placeholder="Name of Driver" value={driverName} onChange={e => setDriverName(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #CCC', outline: 'none', fontSize: '13px' }} />
                        <input type="text" placeholder="Contact No. " value={driverContact} onChange={e => setDriverContact(e.target.value.replace(/[^0-9]/g, ''))} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #CCC', outline: 'none', fontSize: '13px' }} />
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 8px', background: '#F9F6F0', borderRadius: '8px', fontSize: '11px', color: '#7A3A18', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} color={PALETTE.burntSienna} strokeWidth={1.8} />
                          <span>Tour: {activeTour.start_date || activeTour.date || 'No Date Assigned'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Armchair size={14} color={PALETTE.burntSienna} strokeWidth={1.8} />
                          <span>Max Capacity: {activeTour.max_seats || activeTour.seats || 'Not Specified'} Seats</span>
                        </div>
                      </div>
                      
                      <button type="submit" style={{ width: '100%', padding: '10px', background: PALETTE.burntSienna, color: '#FFF', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>Save Details</button>
                    </form>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', color: PALETTE.espresso }}>
                      <div><strong>Van Model:</strong> {carType}</div>
                      <div><strong>Plate/Template No:</strong> {plateNumber}</div>
                      <div><strong>Driver Assigned:</strong> {driverName}</div>
                      <div><strong>Contact Number:</strong> {driverContact}</div>
                      
                      {/* Saved Metadata info section */}
                      <div style={{ gridColumn: 'span 2', borderTop: '1px dashed rgba(26,10,0,0.06)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} color={PALETTE.burntSienna} strokeWidth={1.8} />
                          <strong>Tour Date:</strong> {activeTour.start_date || activeTour.date || 'No Date Assigned'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Armchair size={14} color={PALETTE.burntSienna} strokeWidth={1.8} />
                          <strong>Van Capacity:</strong> {activeTour.max_seats || activeTour.seats || 'Not Specified'} Seats
                        </div>
                      </div>
                      
                      <button onClick={() => setIsLogisticsSaved(false)} style={{ gridColumn: 'span 2', marginTop: '4px', background: 'none', border: '1px dashed #CCC', padding: '6px', borderRadius: '6px', color: '#888', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>Edit Form</button>
                    </div>
                  )}
                </div>

                {/* CHECKPOINT MANAGEMENT LAYER */}
                {!isLogisticsSaved ? (
                  <div style={{ background: 'rgba(232,162,101,0.08)', padding: '12px', borderRadius: '12px', border: `1px solid ${PALETTE.warmAmber}`, fontSize: '12px', color: PALETTE.rust, fontWeight: 700, textAlign: 'center' }}>
                    Complete the form above to enable checkpoint creation.
                  </div>
                ) : hasActiveOrPendingStop ? (
                  <div style={{ background: 'rgba(232,162,101,0.08)', padding: '12px', borderRadius: '12px', border: `1px solid ${PALETTE.warmAmber}`, fontSize: '12px', color: PALETTE.rust, fontWeight: 700, textAlign: 'center' }}>
                    Complete the arrival and departure of all checkpoints before adding new ones.
                  </div>
                ) : (
                  <form onSubmit={handleAddPickupStop} style={{ display: 'flex', gap: 10 }}>
                    <input type="text" placeholder="Location (e.g., SM MOA)" value={newLocName} onChange={e => setNewLocName(e.target.value)} style={{ flex: 2, padding: '10px', borderRadius: 8, border: '1px solid #CCC', outline: 'none' }} />
                    <input type="text" placeholder="ETA (e.g., 08:00 PM)" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #CCC', outline: 'none' }} />
                    <button type="submit" style={{ padding: '10px 20px', background: PALETTE.espresso, color: '#FFF', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={14} /></button>
                  </form>
                )}

                {/* STOPS STATIONS RENDERING CARDS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {meetupStops.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: '#888', background: '#FFF', borderRadius: 12, border: '1px dashed #CCC' }}>
                      <Milestone size={24} color={PALETTE.burntSienna} style={{ opacity: 0.6, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }} />
                      <p style={{ fontSize: 12, margin: 0 }}>No pickup stations created yet.</p>
                    </div>
                  ) : (
                    meetupStops.map((stop) => {
                      const isUpcoming = stop.status === 'DEPARTURE';
                      const isOnTheWay = stop.status === 'CURRENTLY HERE'; 
                      const isArrived = stop.status === 'ARRIVED';        
                      const isDeparted = stop.status === 'DEPARTED';      
                      const canMessage = isDeparted || isOnTheWay;

                      return (
                        <div key={stop.id} style={{ background: isOnTheWay ? 'rgba(232,162,101,0.06)' : isArrived ? 'rgba(16,185,129,0.04)' : '#fff', border: isOnTheWay ? `2px solid ${PALETTE.burntSienna}` : '1px solid rgba(26,10,0,0.08)', borderRadius: 16, padding: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, alignItems: 'center' }}>
                            <span style={{ fontSize: 13, color: PALETTE.espresso }}>{stop.location_name} (ETA: {stop.scheduled_time})</span>
                            <span style={{ fontSize: 10, fontWeight: 900, padding: '4px 8px', borderRadius: 6, background: isOnTheWay ? PALETTE.burntSienna : isArrived ? '#10B981' : isDeparted ? '#4B5563' : '#FEF3C7', color: (isOnTheWay || isArrived || isDeparted) ? '#fff' : '#D97706' }}>
                              {stop.status === 'CURRENTLY HERE' ? 'ON THE WAY' : stop.status}
                            </span>
                          </div>
                          <input 
                            type="text" 
                            placeholder={!canMessage ? "Click 'Departed' first to message/update" : "Type location updates..."} 
                            disabled={!canMessage}
                            value={customNotes[stop.id] || ''} 
                            onChange={(e) => setCustomNotes({ ...customNotes, [stop.id]: e.target.value })} 
                            style={{ width: '100%', padding: '8px', marginTop: 8, borderRadius: 8, border: '1px solid #DDD', fontSize: 12, boxSizing: 'border-box', background: !canMessage ? '#F3F4F6' : '#FFF', outline: 'none' }} 
                          />
                          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                            <button onClick={() => updateStopStatus(stop.id, 'DEPARTED')} disabled={isDeparted || isOnTheWay || isArrived} style={{ background: (isDeparted || isOnTheWay || isArrived) ? '#9CA3AF' : '#4B5563', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Departed</button>
                            <button onClick={() => updateStopStatus(stop.id, 'CURRENTLY HERE')} disabled={isUpcoming || isArrived} style={{ background: (isUpcoming || isArrived) ? '#9CA3AF' : PALETTE.burntSienna, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Set Active Location (Update)</button>
                            <button onClick={() => updateStopStatus(stop.id, 'ARRIVED')} disabled={isUpcoming || isArrived} style={{ background: (isUpcoming || isArrived) ? '#9CA3AF' : '#10B981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Arrived</button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* RIGHT PANEL (Real-time Timeline Logs Feed) */}
              <div style={{ background: '#FFF', padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column'}}>
                <h3 style={{ fontSize: '13px', fontWeight: 900, color: PALETTE.burntSienna, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #EEE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0 }}>
                  TRACKING DETAILS
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 16 }}>
                  {trackingLogs.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#888', fontStyle: 'italic', margin: 0, textAlign: 'center' }}>No logs posted.</p>
                  ) : (
                    trackingLogs.map((log, index) => {
                      //check if the log status is 'ARRIVED' to apply bold styling
                      const isArrivedStatus = log.status === 'ARRIVED';

                      return (
                        <div key={log.id} style={{
                          display: 'flex',
                          gap: '16px',
                          position: 'relative',
                          paddingBottom: '20px'
                        }}>
                          {index !== trackingLogs.length - 1 && <div style={{ position: 'absolute', left: '4px', top: '12px', bottom: 0, width: '2px', background: '#E5E7EB' }} />}
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: index === 0 ? (isArrivedStatus ? '#10B981' : PALETTE.burntSienna) : '#D1D5DB', marginTop: '4px', zIndex: 2 }} />
                          <div style={{ flex: 1, fontSize: '12px' }}>
                            {/* TIMELINE TEXT BLOCK AND TIMESTAMP ROW DYNAMIC HIGHLIGHT ENGINE */}
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              color: index === 0 ? '#10B981' : '#6B7280', 
                              // BOLD INTERCEPTOR
                              fontWeight: isArrivedStatus ? 900 : (index === 0 ? 800 : 500) 
                            }}>
                              <span style={{ lineHeight: '1.4' }}>{log.display_text}</span>
                              {/* BOLD TIMESTAMP */}
                              <span style={{ 
                                fontSize: '10px', 
                                color: isArrivedStatus ? '#10B981' : '#9CA3AF', 
                                fontWeight: isArrivedStatus ? 900 : (index === 0 ? 800 : 500),
                                whiteSpace: 'nowrap', 
                                marginLeft: 8 
                              }}>
                                {log.timestamp}
                              </span>
                            </div>
                            {log.note && <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '11px', fontStyle: 'italic' }}>— "{log.note}"</p>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
};