import React, { useState, useEffect } from 'react';
import { CheckCircle2, MapPin, Clock } from 'lucide-react';
import { supabase } from './supabaseClient'; // Adjust this import path based on your project

const PALETTE = {
  espresso: '#1A0A00',
  burntSienna: '#C45C26',
  warmAmber: '#E8A265',
  cream: '#FDF6EE',
  rust: '#7A3A18',
};

export const JoinerTracking = ({ selectedTourId }) => {
  const [meetupStops, setMeetupStops] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch the specific route stops from Supabase when the component loads
  useEffect(() => {
    async function fetchRoute() {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('tour_meetups')
        .select('*')
        .eq('tour_id', selectedTourId)
        .order('stop_order', { ascending: true }); // Sorts them by route sequence (1, 2, 3...)

      if (!error && data) {
        setMeetupStops(data);
      }
      setLoading(false);
    }

    if (selectedTourId) {
      fetchRoute();
    }
  }, [selectedTourId]);

  if (loading) return <p style={{ color: PALETTE.espresso, fontSize: 14 }}>Loading tracking route...</p>;
  
  // If the admin hasn't added any meetup points for this trip yet
  if (meetupStops.length === 0) {
    return <p style={{ color: PALETTE.rust, fontSize: 13 }}>No pickup locations scheduled for this trip yet.</p>;
  }

  return (
    <div style={{
      maxWidth: 600, margin: '0 auto', background: PALETTE.cream,
      borderRadius: 24, padding: '2.5rem', border: `1px solid rgba(196,92,38,0.12)`,
      boxShadow: '0 12px 40px rgba(26,10,0,0.08)'
    }}>
      
      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid rgba(26,10,0,0.06)`, paddingBottom: '1.25rem', marginBottom: '2rem' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: PALETTE.rust, letterSpacing: '0.14em', margin: 0 }}>LIVE ROUTE PICKUP TRACKER</p>
          <h3 style={{ fontSize: 18, fontWeight: 900, color: PALETTE.espresso, margin: '4px 0 0' }}>Route Itinerary</h3>
        </div>
      </div>

      {/* The Timeline Steps (Automatically scales to match meetupStops count) */}
      <div style={{ position: 'relative', paddingLeft: 36 }}>
        
        {/* Core Vertical line track */}
        <div style={{ position: 'absolute', left: 11, top: 12, bottom: 12, width: 2, background: 'rgba(26,10,0,0.1)' }} />

        {meetupStops.map((stop) => {
          const isActive = stop.status === 'CURRENTLY HERE';
          const isPassed = stop.status === 'DEPARTED' || isActive;
          
          const textColor = isActive ? PALETTE.burntSienna : isPassed ? PALETTE.espresso : 'rgba(26,10,0,0.35)';
          const markerBg = isActive ? PALETTE.warmAmber : isPassed ? PALETTE.burntSienna : '#E5E7EB';

          return (
            <div key={stop.id} style={{ position: 'relative', marginBottom: '2.5rem' }}>
              
              {/* Pinpoint Dot Indicator */}
              <div style={{
                position: 'absolute', left: -36, top: 2, width: 24, height: 24, borderRadius: '50%',
                background: markerBg, display: 'flex', alignItems: 'center',
                justifyContent: 'center', zIndex: 2,
                boxShadow: isActive ? `0 0 0 6px rgba(232,162,101,0.25)` : 'none'
              }}>
                {isActive ? (
                  <MapPin size={13} color={PALETTE.espresso} />
                ) : isPassed ? (
                  <CheckCircle2 size={13} color={PALETTE.cream} />
                ) : (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#9CA3AF' }} />
                )}
              </div>

              {/* Location Text Content */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: textColor }}>
                    {stop.location_name}
                  </span>
                  <span style={{ 
                    fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                    background: isActive ? PALETTE.burntSienna : isPassed ? 'rgba(26,10,0,0.06)' : '#F3F4F6',
                    color: isActive ? PALETTE.cream : isPassed ? PALETTE.espresso : '#6B7280'
                  }}>
                    {stop.status}
                  </span>
                </div>
                
                <span style={{ fontSize: 11, fontWeight: 700, color: isPassed ? PALETTE.rust : 'rgba(26,10,0,0.4)' }}>
                  Target Pickup Time: {stop.scheduled_time}
                </span>

                {stop.note && (
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(26,10,0,0.6)', marginTop: 4 }}>
                    {stop.note}
                  </span>
                )}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
};