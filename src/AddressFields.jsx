import { useState } from 'react';
import { usePhLocations, useBarangays } from './phAddress';

// Province → City/Municipality → Barangay dropdowns plus a Street field.
// Works inside a plain <form> (inputs are named province / city / barangay /
// street) and, with onChange, as a controlled part of a page's state.
const AddressFields = ({ defaultValue = {}, onChange, selectStyle, inputStyle, labelStyle, required = false }) => {
  const locations = usePhLocations();
  const [value, setValue] = useState({
    province: defaultValue.province || '',
    city: defaultValue.city || '',
    barangay: defaultValue.barangay || '',
    street: defaultValue.street || '',
  });
  const barangaysByCity = useBarangays(value.province);

  const update = (patch) => {
    const next = { ...value, ...patch };
    setValue(next);
    if (onChange) onChange(next);
  };

  const provinces = locations ? Object.keys(locations) : [];
  const cities = locations && value.province ? locations[value.province] || [] : [];
  const barangays = barangaysByCity && value.city ? barangaysByCity[value.city] || [] : [];

  let barangayPlaceholder = 'Select barangay';
  if (!value.city) barangayPlaceholder = 'Select a city / municipality first';
  else if (!barangaysByCity) barangayPlaceholder = 'Loading…';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
      <div>
        <label style={labelStyle} htmlFor="address-province">Province</label>
        <select
          id="address-province"
          name="province"
          value={value.province}
          onChange={(e) => update({ province: e.target.value, city: '', barangay: '' })}
          style={selectStyle}
          required={required}
          disabled={!locations}
        >
          <option value="">{locations ? 'Select province' : 'Loading…'}</option>
          {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle} htmlFor="address-city">City / Municipality</label>
        <select
          id="address-city"
          name="city"
          value={value.city}
          onChange={(e) => update({ city: e.target.value, barangay: '' })}
          style={selectStyle}
          required={required}
          disabled={!value.province}
        >
          <option value="">{value.province ? 'Select city / municipality' : 'Select a province first'}</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle} htmlFor="address-barangay">Barangay</label>
        <select
          id="address-barangay"
          name="barangay"
          value={value.barangay}
          onChange={(e) => update({ barangay: e.target.value })}
          style={selectStyle}
          required={required}
          disabled={!value.city || !barangaysByCity}
        >
          <option value="">{barangayPlaceholder}</option>
          {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle} htmlFor="address-street">Street / House No.</label>
        <input
          id="address-street"
          name="street"
          type="text"
          value={value.street}
          onChange={(e) => update({ street: e.target.value })}
          placeholder="e.g. 123 Rizal St."
          maxLength={200}
          style={inputStyle}
          required={required}
        />
      </div>
    </div>
  );
};

export default AddressFields;
