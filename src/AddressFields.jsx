import { useState } from 'react';
import { usePhLocations } from './phAddress';

// Province → City/Municipality dropdowns plus a Street field.
// Works inside a plain <form> (inputs are named province / city / street) and,
// with onChange, as a controlled part of a page's state.
const AddressFields = ({ defaultValue = {}, onChange, selectStyle, inputStyle, labelStyle, required = false }) => {
  const locations = usePhLocations();
  const [value, setValue] = useState({
    province: defaultValue.province || '',
    city: defaultValue.city || '',
    street: defaultValue.street || '',
  });

  const update = (patch) => {
    const next = { ...value, ...patch };
    setValue(next);
    if (onChange) onChange(next);
  };

  const provinces = locations ? Object.keys(locations) : [];
  const cities = locations && value.province ? locations[value.province] || [] : [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
      <div>
        <label style={labelStyle} htmlFor="address-province">Province</label>
        <select
          id="address-province"
          name="province"
          value={value.province}
          onChange={(e) => update({ province: e.target.value, city: '' })}
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
          onChange={(e) => update({ city: e.target.value })}
          style={selectStyle}
          required={required}
          disabled={!value.province}
        >
          <option value="">{value.province ? 'Select city / municipality' : 'Select a province first'}</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle} htmlFor="address-street">Street, Barangay, House No.</label>
        <input
          id="address-street"
          name="street"
          type="text"
          value={value.street}
          onChange={(e) => update({ street: e.target.value })}
          placeholder="e.g. 123 Rizal St., Brgy. San Isidro"
          maxLength={200}
          style={inputStyle}
          required={required}
        />
      </div>
    </div>
  );
};

export default AddressFields;
