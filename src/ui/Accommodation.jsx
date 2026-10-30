import React from 'react';
import { BedDouble } from 'lucide-react';
import PrettySelect from './PrettySelect';

import { ACCOMMODATION_OPTIONS, cleanAccommodation } from '../accommodation';

// Admin checkboxes and the joiner's dropdown for accommodation (see accommodation.js).

const label = {
  display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase',
  color: '#7A3A18', opacity: 0.9, marginBottom: 6,
};

// Admin: tick the accommodation joiners can choose from.
export const AccommodationCheckboxes = ({ value = [], onChange, required = false, name = 'accommodation_options', error = '' }) => {
  const toggle = (option) => {
    const next = value.includes(option) ? value.filter((v) => v !== option) : [...value, option];
    onChange(cleanAccommodation(next));
  };
  return (
    <fieldset name={name} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={label}>Accommodation{required ? ' *' : ''}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ACCOMMODATION_OPTIONS.map((option, i) => {
          const on = value.includes(option);
          return (
            <label key={option} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none',
              padding: '9px 14px', borderRadius: 12, fontSize: 12.5, fontWeight: 800,
              background: on ? 'rgba(180,81,30,0.12)' : '#F2E4D0', color: on ? '#A8481A' : '#7A3A18',
              border: `1px solid ${error ? '#8C2F1C' : on ? 'rgba(180,81,30,0.45)' : 'rgba(180,81,30,0.18)'}`,
            }}>
              <input
                type="checkbox"
                name={i === 0 ? name : undefined}
                checked={on}
                onChange={() => toggle(option)}
                style={{ width: 16, height: 16, accentColor: '#B4511E', margin: 0 }}
              />
              {option}
            </label>
          );
        })}
      </div>
      <p style={{ fontSize: 11.5, fontWeight: 600, color: error ? '#8C2F1C' : '#7A3A18', margin: '6px 0 0' }}>
        {error || (required ? 'Tick at least one. Joiners choose from these.' : 'Optional. Joiners choose from the ones you tick.')}
      </p>
    </fieldset>
  );
};

// Joiner: choose one of the tour's accommodations.
export const AccommodationSelect = ({ options = [], value, onChange, error = '', id = 'accommodation' }) => {
  const choices = cleanAccommodation(options);
  if (!choices.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={id} style={label}>Accommodation</label>
      <PrettySelect
        id={id}
        icon={BedDouble}
        value={value}
        placeholder="Choose your accommodation"
        invalid={!!error}
        onChange={onChange}
        options={choices.map((o) => ({ value: o, label: o }))}
      />
      {error && <p role="alert" style={{ fontSize: 12, fontWeight: 800, color: '#8C2F1C', margin: '6px 2px 0' }}>{error}</p>}
    </div>
  );
};
