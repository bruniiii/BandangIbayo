import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import {
  MapPin, X, Calendar, Armchair, Compass, ChevronLeft,
  ChevronRight, ImageIcon, Loader2, Check, CheckCircle2, Truck, Phone, Navigation, Clock
} from 'lucide-react';

export const JoinerTracking = () => {
  const [activeTour, setActiveTour] = useState(null);
  const [toursList, setToursList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingConsole, setLoadingConsole] = useState(false);
  const [logs, setLogs] = useState([]);
  const [meetupStops, setMeetupStops] = useState([]);
  const [vehicleInfo, setVehicleInfo] = useState(null);

  useEffect(() => {
    const fetchMyBookedAdventure = async () => {
      try {
        setLoading(true);
        let targetTourIds = [];
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: bookedData } = await supabase
            .from('bookings')
            .select('tour_id')
            .eq('user_id', user.id)
            .not('booking_status', 'in', '("Cancelled","Rejected")');

          if (bookedData && bookedData.length > 0) {
            targetTourIds = [...new Set(bookedData.map(b => b.tour_id).filter(Boolean))];
          }
        }

        if (targetTourIds.length > 0) {
          const { data: finalTours, error: fetchError } = await supabase
            .from('tours')
            .select('*')
            .in('id', targetTourIds)
            .eq('is_archived', false);

          if (!fetchError && finalTours && finalTours.length > 0) {
            setToursList(finalTours);
            setLoading(false);
            return;
          }
        }

        const { data: fallbackTours } = await supabase
          .from('tours')
          .select('*')
          .eq('is_archived', false)
          .order('start_date', { ascending: true })
          .limit(1);

        setToursList(fallbackTours || []);
      } catch (err) {
        console.error('Error loading tracked tours:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMyBookedAdventure();
  }, []);

  const fetchTrackingForTour = useCallback(async (tourId) => {
    setLoadingConsole(true);
    try {
      const [{ data: vehicle }, { data: stops }, { data: trackingLogs }] = await Promise.all([
        supabase.from('tour_vehicles').select('*').eq('tour_id', tourId).maybeSingle(),
        supabase.from('tour_meetups').select('*').eq('tour_id', tourId).order('created_at', { ascending: true }),
        supabase.from('tour_tracking_logs').select('*').eq('tour_id', tourId).order('created_at', { ascending: false }),
      ]);
      setVehicleInfo(vehicle || null);
      setMeetupStops(stops || []);
      setLogs(trackingLogs || []);
    } catch (err) {
      console.error('Error loading tracking:', err.message);
    } finally {
      setLoadingConsole(false);
    }
  }, []);

  useEffect(() => {
    if (!activeTour) {
      setLogs([]);
      setMeetupStops([]);
      setVehicleInfo(null);
      return;
    }
    fetchTrackingForTour(activeTour.id);
  }, [activeTour, fetchTrackingForTour]);

  // Realtime updates
  useEffect(() => {
    if (!activeTour) return;
    const channel = supabase
      .channel(`joiner-tracking-${activeTour.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_tracking_logs' }, () => fetchTrackingForTour(activeTour.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_meetups' }, () => fetchTrackingForTour(activeTour.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_vehicles' }, () => fetchTrackingForTour(activeTour.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTour, fetchTrackingForTour]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {loading ? (
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5rem 0', color: 'rgba(122,58,24,0.4)' }}>
            <Loader2 size={30} style={{ marginBottom: 10, color: '#C45C26', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading Trips…</p>
          </div>
        ) : toursList.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '5rem 0', textAlign: 'center', background: '#FDF6EE', borderRadius: 20, border: '2px dashed rgba(196,92,38,0.2)' }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.4)' }}>No booked tours to track yet.</p>
          </div>
        ) : toursList.map(tour => (
          <TrackingTourCard key={tour.id} tour={tour} onTrack={() => setActiveTour(tour)} />
        ))}
      </div>

      {activeTour && (
        <TrackingDetailModal
          tour={activeTour}
          logs={logs}
          meetupStops={meetupStops}
          vehicleInfo={vehicleInfo}
          loadingConsole={loadingConsole}
          onClose={() => setActiveTour(null)}
        />
      )}
    </div>
  );
};

const TrackingTourCard = ({ tour, onTrack }) => {
  const [hovered, setHovered] = useState(false);
  const displayImage = Array.isArray(tour.image_urls) && tour.image_urls.length > 0 ? tour.image_urls[0] : (tour.image || '');

  return (
    <div
      style={{
        background: '#FDF6EE', borderRadius: 22, overflow: 'hidden',
        border: '1px solid rgba(196,92,38,0.12)',
        boxShadow: hovered ? '0 12px 36px rgba(26,10,0,0.14)' : '0 4px 16px rgba(26,10,0,0.06)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all 0.25s', display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ height: 186, background: '#F2E4D0', position: 'relative' }}>
        {displayImage ? (
          <img src={displayImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.2)' }}><ImageIcon size={44} /></div>
        )}
        <span style={{ position: 'absolute', top: 12, right: 12, background: '#C45C26', color: '#FDF6EE', borderRadius: 999, padding: '4px 10px', fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>
          Tracking
        </span>
      </div>

      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', margin: '0 0 8px' }}>{tour.title}</h3>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 6px' }}>
            <MapPin size={11} style={{ color: '#C45C26' }} /> {tour.destination}
          </p>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}>
            <Calendar size={11} style={{ color: '#C45C26' }} /> {tour.start_date || tour.date}
          </p>
        </div>

        <button
          onClick={onTrack}
          style={{
            width: '100%', marginTop: 14, padding: '11px 0',
            border: 'none', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 900, fontSize: 10,
            textTransform: 'uppercase', background: '#1A0A00', color: '#FDF6EE',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Compass size={13} /> View Van ETA & Updates
        </button>
      </div>
    </div>
  );
};

/* Tracks viewport width so the tracking console can switch from a
   two-column desktop layout to a stacked mobile layout. */
const useIsMobile = (breakpoint = 900) => {
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

const TrackingDetailModal = ({ tour, logs, meetupStops, vehicleInfo, loadingConsole, onClose }) => {
  const isMobile = useIsMobile();
  const images = Array.isArray(tour.image_urls) ? tour.image_urls : (tour.image ? [tour.image] : []);
  const activeStop = meetupStops.find(s => s.status === 'CURRENTLY HERE') || meetupStops.find(s => s.status !== 'ARRIVED');
  const isCompleted = meetupStops.length > 0 && meetupStops.every(s => s.status === 'ARRIVED');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE', width: '100%', maxWidth: 1100,
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)', borderTop: '8px solid #C45C26',
        overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: isMobile ? 12 : 20, right: isMobile ? 12 : 20, zIndex: 50,
            background: isMobile ? '#FDF6EE' : 'none',
            border: isMobile ? '1px solid rgba(196,92,38,0.2)' : 'none',
            borderRadius: isMobile ? '50%' : 0,
            width: isMobile ? 34 : 'auto', height: isMobile ? 34 : 'auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#7A3A18',
          }}
        >
          <X size={isMobile ? 18 : 26} />
        </button>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', minHeight: 0 }}>
            {/* Left Side: Vehicle & Route Checkpoints */}
            <div style={{
              background: '#F2E4D0',
              padding: isMobile ? '3.5rem 1.25rem 1.5rem' : '2.5rem 2rem',
              borderRight: isMobile ? 'none' : '1px solid rgba(196,92,38,0.12)',
              borderBottom: isMobile ? '1px solid rgba(196,92,38,0.12)' : 'none',
            }}>
              <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#1A0A00', margin: '0 0 6px' }}>{tour.title}</h2>
              <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 700, color: '#7A3A18', display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} style={{ color: '#C45C26' }} /> {tour.destination}
              </p>

              {/* Live Status Header Banner */}
              <div style={{
                background: isCompleted ? '#1F8A5C' : activeStop?.status === 'CURRENTLY HERE' ? '#C45C26' : '#1A0A00',
                color: '#FDF6EE', padding: '14px 18px', borderRadius: 16, marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Navigation size={16} />
                  <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                    {isCompleted ? 'Route Completed' : activeStop?.status === 'CURRENTLY HERE' ? 'Van En Route' : 'Awaiting Departure'}
                  </span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 900, margin: '4px 0' }}>
                  {isCompleted
                    ? 'All pickup stops completed!'
                    : activeStop
                      ? `Next Stop: ${activeStop.location_name}`
                      : 'Preparing Vehicle Dispatch'}
                </h3>
                {activeStop && !isCompleted && (
                  <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.9, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={12} /> Estimated Arrival: {activeStop.scheduled_time}
                  </p>
                )}
              </div>

              {/* Fleet & Driver Information */}
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, marginBottom: 16, border: '1px solid rgba(196,92,38,0.1)' }}>
                <h4 style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#C45C26', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Truck size={14} /> Assigned Driver & Vehicle
                </h4>
                {vehicleInfo ? (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, fontSize: 12, color: '#1A0A00' }}>
                    <div><strong style={{ color: '#7A3A18' }}>Vehicle:</strong> {vehicleInfo.car_type || 'Pending'}</div>
                    <div><strong style={{ color: '#7A3A18' }}>Plate No:</strong> {vehicleInfo.plate_number || 'Pending'}</div>
                    <div><strong style={{ color: '#7A3A18' }}>Driver:</strong> {vehicleInfo.driver_name || 'Assigned Staff'}</div>
                    <div><strong style={{ color: '#7A3A18' }}>Contact:</strong> {vehicleInfo.driver_contact || 'N/A'}</div>
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: '#7A3A18', opacity: 0.7, margin: 0, fontStyle: 'italic' }}>
                    Organizer will post the driver and plate details prior to departure.
                  </p>
                )}
              </div>

              {/* Delivery-Style Pickup Progress */}
              <div style={{ background: '#FFF', padding: '1.25rem', borderRadius: 16, border: '1px solid rgba(196,92,38,0.1)' }}>
                <h4 style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#C45C26', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={14} /> Pickup Points & ETAs
                </h4>
                {meetupStops.length === 0 ? (
                  <p style={{ fontSize: 11, color: '#7A3A18', opacity: 0.7, margin: 0, fontStyle: 'italic' }}>
                    Pickup schedule is currently being finalized.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {meetupStops.map((stop, i) => {
                      const isArrived = stop.status === 'ARRIVED';
                      const isCurrent = stop.status === 'CURRENTLY HERE';

                      return (
                        <div key={stop.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          flexWrap: 'wrap', gap: 8,
                          padding: '10px 12px', borderRadius: 12,
                          background: isCurrent ? 'rgba(196,92,38,0.08)' : '#FDF6EE',
                          border: isCurrent ? '1.5px solid #C45C26' : '1px solid rgba(196,92,38,0.1)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 20, height: 20, borderRadius: '50%',
                              background: isArrived ? '#1F8A5C' : isCurrent ? '#C45C26' : 'rgba(26,10,0,0.15)',
                              color: '#FFF', fontSize: 10, fontWeight: 900,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isArrived ? <Check size={11} strokeWidth={3} /> : i + 1}
                            </div>
                            <div>
                              <p style={{ fontSize: 12, fontWeight: 800, color: '#1A0A00', margin: 0 }}>{stop.location_name}</p>
                              {stop.note && <p style={{ fontSize: 10, color: '#C45C26', fontWeight: 700, margin: '2px 0 0' }}>{stop.note}</p>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: isCurrent ? '#C45C26' : '#7A3A18' }}>
                              ETA: {stop.scheduled_time}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: Detailed Updates Feed */}
            <div style={{ padding: isMobile ? '1.5rem 1.25rem' : '2.5rem 2rem', display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#C45C26', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Compass size={14} /> Live Departure Feed & Whereabouts
              </h4>

              {loadingConsole ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: '#7A3A18' }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8, color: '#C45C26' }} />
                  <p style={{ fontSize: 12, fontWeight: 700 }}>Checking vehicle location…</p>
                </div>
              ) : (
                <LiveTimeline logs={logs} />
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

const LiveTimeline = ({ logs }) => {
  if (!logs || logs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#FDF6EE', borderRadius: 16, border: '2px dashed rgba(196,92,38,0.2)' }}>
        <Compass size={22} style={{ color: 'rgba(122,58,24,0.3)', marginBottom: 8 }} />
        <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(122,58,24,0.5)', margin: 0 }}>Waiting for departure day updates from driver/organizer…</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {logs.map((log, index) => {
        const { title, description } = splitLogText(log.display_text);
        const date = new Date(log.created_at || log.timestamp);
        const timeFormatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return (
          <div key={log.id || index} style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 56, fontSize: 10, fontWeight: 800, color: '#7A3A18', opacity: 0.65, paddingTop: 2 }}>
              {timeFormatted}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: index === 0 ? '#C45C26' : '#1F8A5C',
                color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {log.status === 'ARRIVED' ? <CheckCircle2 size={13} /> : <Check size={12} strokeWidth={3} />}
              </div>
              {index !== logs.length - 1 && <div style={{ width: 2, flex: 1, background: 'rgba(196,92,38,0.2)', margin: '4px 0' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 13, color: '#1A0A00' }}>{title}</strong>
              <p style={{ fontSize: 12, color: '#7A3A18', margin: '3px 0 0', lineHeight: 1.5 }}>{description}</p>
              {log.note && (
                <div style={{ background: 'rgba(196,92,38,0.08)', padding: '6px 10px', borderRadius: 8, marginTop: 6, fontSize: 11, fontWeight: 700, color: '#9A5B1E' }}>
                  Note from Driver: {log.note}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default JoinerTracking;