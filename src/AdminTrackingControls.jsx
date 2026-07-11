import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Adjust path
import { MapPin, Check, Navigation, Clock } from 'lucide-react';

const PALETTE = {
  espresso: '#1A0A00',
  burntSienna: '#C45C26',
  warmAmber: '#E8A265',
  cream: '#FDF6EE',
  rust: '#7A3A18',
};

export const AdminTrackingControls = ({ selectedTourId }) => {
  const [meetupStops, setMeetupStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customNotes, setCustomNotes] = useState({}); // Stores typed inputs for each stop

  // 1. Fetch all stops for the selected tour so admin can see them
  const fetchRouteStops = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tour_meetups')
      .select('*')
      .eq('tour_id', selectedTourId)
      .order('stop_order', { ascending: true });

    if (!error && data) {
      setMeetupStops(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedTourId) fetchRouteStops();
  }, [selectedTourId]);

  // 2. Handle updating status and notes in Supabase
  const updateStopStatus = async (stopId, newStatus) => {
    const currentNote = customNotes[stopId] || "";

    // If setting a stop to 'CURRENTLY HERE', we should automatically turn previous active stops to 'DEPARTED'
    if (newStatus === 'CURRENTLY HERE') {
      await supabase
        .from('tour_meetups')
        .update({ status: 'DEPARTED' })
        .eq('tour_id', selectedTourId)
        .eq('status', 'CURRENTLY HERE');
    }

    const { error } = await supabase
      .from('tour_meetups')
      .update({ 
        status: newStatus,
        note: currentNote ? currentNote : undefined // Only update note if admin typed something
      })
      .eq('id', stopId);

    if (error) {
      alert("Failed to update status: " + error.message);
    } else {
      fetchRouteStops(); // Refresh the list on screen to display updates
    }
  };

  if (loading) return <p>Loading admin controls...</p>;

  return (
    <div style={{
      maxWidth: 650, margin: '0 auto', background: '#FDF6EE',
      borderRadius: 24, padding: '2rem', border: '1px solid rgba(196,92,38,0.15)'
    }}>
      <div style={{ borderBottom: '1px solid rgba(26,10,0,0.08)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: PALETTE.espresso, margin: 0 }}>
          Admin Dispatch Dashboard
        </h2>
        <p style={{ fontSize: 12, color: PALETTE.rust, margin: '4px 0 0', fontWeight: 600 }}>
          Update real-time pickup locations for Joiners
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {meetupStops.map((stop) => (
          <div key={stop.id} style={{
            background: stop.status === 'CURRENTLY HERE' ? 'rgba(232,162,101,0.08)' : '#fff',
            border: stop.status === 'CURRENTLY HERE' ? `2px solid ${PALETTE.burntSienna}` : '1px solid rgba(26,10,0,0.08)',
            borderRadius: 16, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12
          }}>
            
            {/* Top row: Info indicators */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 900, color: PALETTE.espresso }}>
                  {stop.location_name}
                </span>
                <span style={{ fontSize: 11, color: PALETTE.rust, display: 'block', mt: 2, fontWeight: 600 }}>
                  Scheduled: {stop.scheduled_time}
                </span>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 900, padding: '4px 8px', borderRadius: 6,
                background: stop.status === 'CURRENTLY HERE' ? PALETTE.burntSienna : stop.status === 'DEPARTED' ? '#E5E7EB' : '#FEF3C7',
                color: stop.status === 'CURRENTLY HERE' ? '#fff' : stop.status === 'DEPARTED' ? '#4B5563' : '#D97706'
              }}>
                {stop.status}
              </span>
            </div>

            {/* Middle row: Dynamic Note Input Text field */}
            <div>
              <input 
                type="text"
                placeholder={stop.note ? `Current: "${stop.note}"` : "Add dynamic update (e.g., 'Approaching in 10 mins')"}
                value={customNotes[stop.id] || ''}
                onChange={(e) => setCustomNotes({ ...customNotes, [stop.id]: e.target.value })}
                style={{
                  width: '100%', padding: '8px 12px', fontSize: 12, borderRadius: 8,
                  border: '1px solid rgba(26,10,0,0.15)', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Bottom row: Control Action Buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button 
                onClick={() => updateStopStatus(stop.id, 'CURRENTLY HERE')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800,
                  background: PALETTE.burntSienna, color: '#fff', border: 'none',
                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer'
                }}>
                <MapPin size={12} /> Set as Current Location
              </button>

              <button 
                onClick={() => updateStopStatus(stop.id, 'DEPARTED')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800,
                  background: '#4B5563', color: '#fff', border: 'none',
                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer'
                }}>
                <Check size={12} /> Mark Departed
              </button>

              <button 
                onClick={() => updateStopStatus(stop.id, 'UPCOMING')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800,
                  background: '#transparent', color: '#4B5563', border: '1px solid #D1D5DB',
                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer'
                }}>
                <Clock size={12} /> Reset to Upcoming
              </button>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
};