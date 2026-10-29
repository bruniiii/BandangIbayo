import React from 'react';

// Admin: tick the pickup points a tour stops at (see pickupPoints.js).
// choices: the fixed list plus any older custom point the tour still has.
const PickupCheckboxes = ({ choices, value, onToggle }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    {choices.map((place, i) => {
      const on = value.includes(place);
      return (
        <label key={place} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none',
          padding: '9px 14px', borderRadius: 12, fontSize: 12.5, fontWeight: 800,
          background: on ? 'rgba(180,81,30,0.12)' : '#F2E4D0', color: on ? '#A8481A' : '#7A3A18',
          border: `1px solid ${on ? 'rgba(180,81,30,0.45)' : 'rgba(180,81,30,0.18)'}`,
        }}>
          <input
            type="checkbox"
            name={i === 0 ? 'pickup_0' : undefined}
            checked={on}
            onChange={() => onToggle(place)}
            style={{ width: 16, height: 16, accentColor: '#B4511E', margin: 0 }}
          />
          {place}
        </label>
      );
    })}
  </div>
);

export default PickupCheckboxes;
