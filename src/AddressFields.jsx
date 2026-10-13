import { useState } from 'react';
import { usePhLocations, useBarangays } from './phAddress';
import SearchSelect from './ui/SearchSelect';

// Province → City/Municipality → Barangay (type to search, or scroll the list) plus a Street field.
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

  let barangayPlaceholder = 'Type or choose a barangay';
  if (!value.city) barangayPlaceholder = 'Select a city / municipality first';
  else if (!barangaysByCity) barangayPlaceholder = 'Loading…';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
      <div>
        <label style={labelStyle} htmlFor="address-province">Province</label>
        <SearchSelect
          id="address-province"
          name="province"
          value={value.province}
          options={provinces}
          onChange={(province) => update({ province, city: '', barangay: '' })}
          placeholder={locations ? 'Type or choose a province' : 'Loading…'}
          style={selectStyle}
          required={required}
          disabled={!locations}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="address-city">City / Municipality</label>
        <SearchSelect
          id="address-city"
          name="city"
          value={value.city}
          options={cities}
          onChange={(city) => update({ city, barangay: '' })}
          placeholder={value.province ? 'Type or choose a city / municipality' : 'Choose a province first'}
          style={selectStyle}
          required={required}
          disabled={!value.province}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="address-barangay">Barangay</label>
        <SearchSelect
          id="address-barangay"
          name="barangay"
          value={value.barangay}
          options={barangays}
          onChange={(barangay) => update({ barangay })}
          placeholder={barangayPlaceholder}
          style={selectStyle}
          required={required}
          disabled={!value.city || !barangaysByCity}
        />
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
