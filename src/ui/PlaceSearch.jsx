import React, { useState } from 'react';
import { Search, Loader2, MapPin, X } from 'lucide-react';
import { searchPlaces } from '../routeApi';

// ─────────────────────────────────────────────
// Type a place, click Search, pick the right one from the list.
// value: { name, lat, lng } or null; onChange(place or null).
// ─────────────────────────────────────────────

const box = {
  width: '100%', boxSizing: 'border-box', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.2)',
  borderRadius: 12, padding: '11px 14px', fontSize: 16, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
};

const PlaceSearch = ({ label, value, onChange, placeholder = 'e.g. SM Mall of Asia, Pasay', name }) => {
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    if (text.trim().length < 2) { setError('Type at least 2 letters of the place.'); return; }
    setBusy(true); setError('');
    const res = await searchPlaces(text.trim());
    setBusy(false);
    if (!res.ok) { setError(res.error); setResults(null); return; }
    setResults(res.data.places || []);
    if (!(res.data.places || []).length) setError('No place found. Try a nearby landmark or the town name.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {label && <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7A3A18' }}>{label}</span>}
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 12, padding: '10px 12px' }}>
          <MapPin size={15} color="#B4511E" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#1A0A00', overflowWrap: 'anywhere' }}>{value.name}</span>
          <button type="button" onClick={() => { onChange(null); setResults(null); }} aria-label={`Change ${label || 'place'}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18', display: 'flex', padding: 2 }}><X size={15} /></button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              name={name} value={text} placeholder={placeholder} style={box} maxLength={120}
              onChange={(e) => { setText(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
            />
            <button type="button" onClick={search} disabled={busy} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
              background: '#1A0A00', color: '#E8A265', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />} Search</button>
          </div>
          {error && <span role="alert" style={{ fontSize: 12, fontWeight: 700, color: '#8C2F1C' }}>{error}</span>}
          {results?.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 4, background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 12, maxHeight: 220, overflowY: 'auto' }}>
              {results.map((p, i) => (
                <li key={`${p.lat},${p.lng},${i}`}>
                  <button type="button" onClick={() => { onChange({ name: p.label || p.name, lat: p.lat, lng: p.lng }); setResults(null); setText(''); }} style={{
                    width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#1A0A00', display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}><MapPin size={14} color="#B4511E" style={{ flexShrink: 0, marginTop: 2 }} /> {p.label || p.name}</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

export default PlaceSearch;
