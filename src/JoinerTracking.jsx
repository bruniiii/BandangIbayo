import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { MapPin, ArrowLeft, X, Calendar, Armchair, Compass } from 'lucide-react';

const PALETTE = {
  espresso: '#1A0A00',
  burntSienna: '#C45C26',
  warmAmber: '#E8A265',
  cream: '#FDF6EE',
  rust: '#7A3A18',
};

export const JoinerTracking = () => {
  const [activeTour, setActiveTour] = useState(null); 
  const [toursList, setToursList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [vehicleInfo, setVehicleInfo] = useState(null);

  // 1. FETCH USER'S BOOKED TOUR ID AND DETAILS
  useEffect(() => {
    const fetchMyBookedAdventure = async () => {
      try {
        setLoading(true);
        let targetTourIds = [];

        // FIND THE USER'S BOOKED TOUR ID FROM DATABASE
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: bookedData } = await supabase
            .from('bookings')
            .select('tour_id')
            .eq('user_id', user.id);

          if (bookedData && bookedData.length > 0) {
            targetTourIds = bookedData.map(b => b.tour_id);
          }
        }

        //READ FROM LOCAL STORAGE IF NO TOUR ID FOUND IN DATABASE
        if (targetTourIds.length === 0) {
          const allKeys = Object.keys(localStorage);
          const activeLogKey = allKeys.find(key => key && key.startsWith('logs_'));
          
          if (activeLogKey) {
            const extractedId = activeLogKey.replace('logs_', '');
            targetTourIds.push(extractedId);
          }
          
          // Check for any live checkpoint logs in localStorage as a fallback
          const currentLogs = localStorage.getItem('sandbox_live_checkpoint');
          if (currentLogs) {
            const parsedCurrent = JSON.parse(currentLogs);
            if (parsedCurrent.length > 0 && parsedCurrent[0].tour_id) {
              if (!targetTourIds.includes(parsedCurrent[0].tour_id)) {
                targetTourIds.push(parsedCurrent[0].tour_id);
              }
            }
          }
        }

        // FETCH TOUR DETAILS BASED ON THE FOUND TOUR IDS 
        if (targetTourIds.length > 0) {
          const { data: finalTours, error: fetchError } = await supabase
            .from('tours')
            .select('*')
            .in('id', targetTourIds)
            .eq('is_archived', false);

          if (!fetchError && finalTours) {
            setToursList(finalTours);
            setLoading(false);
            return;
          }
        }

        // If no tours found, fetch the next upcoming tour as a fallback
        const { data: panicTours } = await supabase
          .from('tours')
          .select('*')
          .eq('is_archived', false)
          .order('start_date', { ascending: true })
          .limit(1);

        if (panicTours) setToursList(panicTours);

      } catch (err) {
        console.error("Critical recovery interceptor error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMyBookedAdventure();
  }, []);

  // SYNC LIVE TRACKING LOGS AND VEHICLE INFO FROM LOCAL STORAGE
  useEffect(() => {
    if (!activeTour) {
      setLogs([]);
      setVehicleInfo(null);
      return;
    }

    const syncLiveTrackingMemory = () => {
      try {
        const currentLogs = localStorage.getItem('sandbox_live_checkpoint');
        const allKeys = Object.keys(localStorage);

        const logKey = `logs_${activeTour.id}`;
        const savedLogs = localStorage.getItem(logKey);
        
        if (savedLogs) {
          setLogs(JSON.parse(savedLogs));
        } else if (currentLogs) {
          const parsedCurrent = JSON.parse(currentLogs);
          if (parsedCurrent.length > 0 && parsedCurrent[0].tour_id === activeTour.id) {
            setLogs(parsedCurrent);
          } else {
            setLogs([]);
          }
        } else {
          setLogs([]);
        }

        const vehicleKey = `vehicle_info_${activeTour.id}`;
        const savedVehicle = localStorage.getItem(vehicleKey);
        
        if (savedVehicle) {
          setVehicleInfo(JSON.parse(savedVehicle));
        } else {
          const generalVehicleKey = allKeys.find(key => key && key.startsWith('vehicle_info_'));
          if (generalVehicleKey && !savedLogs) {
            setVehicleInfo(JSON.parse(localStorage.getItem(generalVehicleKey)));
          } else {
            setVehicleInfo(null);
          }
        }
      } catch (err) {
        console.error("Error parsing layout updates:", err);
      }
    };

    syncLiveTrackingMemory();
    const interval = setInterval(syncLiveTrackingMemory, 1200);
    return () => clearInterval(interval);
  }, [activeTour]);

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', padding: '10px', fontFamily: 'sans-serif' }}>
      
      {/* LOADING STATE */}
      
      {loading && <p style={{ textAlign: 'center', color: PALETTE.rust, fontSize: '20px' }}>Loading your adventure tracks...</p>}

      {/* JOINER MAIN GRID SELECTION VIEW (Strictly shows your active booked tracking card target) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 24 }}>
        {toursList.map((tour) => {
          if (!tour) return null;
          const hasImage = Array.isArray(tour.image_urls) && tour.image_urls.length > 0;
          const displayImage = hasImage ? tour.image_urls[0] : (tour.image || '');
          
          return (
            <div key={tour.id} style={{ background: '#FFF', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
              <div style={{ height: 140, background: PALETTE.espresso, position: 'relative' }}>
                {displayImage ? <img src={displayImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#E8D5BC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>⛰️</div>}
              </div>
              <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 15, color: PALETTE.espresso, fontWeight: 900 }}>{tour.title}</h3>
                <p style={{ margin: 0, fontSize: 11, color: '#7A3A18', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color={PALETTE.burntSienna} strokeWidth={1.8} />
                  <span>{tour.destination || 'Not Specified'}</span>
                </p>
                <button onClick={() => setActiveTour(tour)} style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 12, background: PALETTE.burntSienna, color: '#FFF', border: 'none', cursor: 'pointer', fontWeight: 800 }}>Track</button>
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
            
            {/* NAVIGATION HEADER BAR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem 2rem', background: '#FFF', borderBottom: '1px solid rgba(26,10,0,0.06)' }}>
              <button onClick={() => setActiveTour(null)} style={{ background: 'none', border: 'none', color: PALETTE.rust, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '13px' }}>
                
              </button>
              <X size={20} style={{ cursor: 'pointer', color: '#888' }} onClick={() => setActiveTour(null)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', flex: 1, overflow: 'hidden' }}>
              
              <div style={{ padding: '2rem', overflowY: 'auto', borderRight: '1px solid rgba(26,10,0,0.06)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ width: '100%', height: '150px', borderRadius: '16px', overflow: 'hidden', background: PALETTE.espresso, flexShrink: 0 }}>
                  {((Array.isArray(activeTour.image_urls) && activeTour.image_urls.length > 0) || activeTour.image) ? <img src={Array.isArray(activeTour.image_urls) ? activeTour.image_urls[0] : activeTour.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#E8D5BC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🚌</div>}
                </div>

                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: PALETTE.espresso, margin: '0 0 2px 0' }}>{activeTour.title}</h2>
                  <p style={{ margin: 0, fontSize: '12px', color: '#7A3A18', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} color={PALETTE.burntSienna} strokeWidth={1.8} />
                    <span>{activeTour.destination || 'Dynamic Target Route'}</span>
                  </p>
                </div>

                {/* FLEET DETAILS DISPLAY CARD */}
                <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(196,92,38,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '13px', color: PALETTE.burntSienna, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Assign Fleet Details</h3>
                  
                  {vehicleInfo ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', color: PALETTE.espresso }}>
                      <div><strong>Van Model:</strong> {vehicleInfo.carType || "Pending Dispatch"}</div>
                      <div><strong>Plate/Template No:</strong> {vehicleInfo.plateNumber || "Pending Setup"}</div>
                      <div><strong>Driver Assigned:</strong> {vehicleInfo.driverName || "Assigning Staff"}</div>
                      <div><strong>Contact Number:</strong> {vehicleInfo.driverContact || "No Files Configured"}</div>
                      
                      <div style={{ gridColumn: 'span 2', borderTop: '1px dashed rgba(26,10,0,0.06)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', color: '#7A3A18', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} color={PALETTE.burntSienna} strokeWidth={1.8} />
                          <span>Tour Date: {activeTour.start_date || activeTour.date || 'No Date Assigned'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Armchair size={14} color={PALETTE.burntSienna} strokeWidth={1.8} />
                          <span>Van Capacity: {activeTour.max_seats || activeTour.seats || 'Not Specified'} Seats</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#888', fontSize: '12px', fontStyle: 'italic' }}>
                      🚌 Organizer has not deployed the vehicle details yet.
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT PANEL (Timeline Log Feed) */}
              <div style={{ background: '#FFF', padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 900, color: PALETTE.burntSienna, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #EEE', paddingBottom: '12px', marginBottom: '20px', marginTop: 0 }}>
                  TRACKING DETAILS
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 16 }}>
                  {!logs || logs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#888' }}>
                      <Compass size={24} color={PALETTE.burntSienna} style={{ opacity: 0.5, marginBottom: 8, marginLeft: 'auto', marginRight: 'auto' }} />
                      <p style={{ fontSize: 12, margin: 0, fontStyle: 'italic' }}>Waiting for arrival updates...</p>
                    </div>
                  ) : (
                    logs.map((log, index) => {
                      const isArrivedStatus = log.status === 'ARRIVED';
                      const isLatestUpdate = index === 0;

                      let textColor = '#6B7280'; 
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
                        <div key={log.id || index} style={{ display: 'flex', gap: '16px', position: 'relative', paddingBottom: '20px', alignItems: 'flex-start' }}>
                          {index !== logs.length - 1 && (
                            <div style={{ position: 'absolute', left: '4px', top: '16px', bottom: 0, width: '2px', background: '#E5E7EB', zIndex: 1 }} />
                          )}
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: dotColor, marginTop: '5px', zIndex: 2, flexShrink: 0 }} />
                          
                          <div style={{ flex: 1, fontSize: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: textWeight, color: textColor }}>
                              <span style={{ lineHeight: '1.4' }}>{log.display_text || ""}</span>
                              <span style={{ fontSize: '10px', color: timeColor, fontWeight: textWeight, whiteSpace: 'nowrap', marginLeft: 8 }}>
                                {log.timestamp || ""}
                              </span>
                            </div>
                            {log.note && <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '11px', fontStyle: 'italic' }}>— Note: "{log.note}"</p>}
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