import { useEffect, useState } from 'react';
import { loadDestinations } from '../destinations';

// <datalist> of the saved destinations: give an input list={id} to suggest them.
const DestinationOptions = ({ id }) => {
  const [rows, setRows] = useState([]);
  useEffect(() => { let alive = true; loadDestinations().then((r) => { if (alive) setRows(r); }); return () => { alive = false; }; }, []);
  return <datalist id={id}>{rows.map((d) => <option key={d.id} value={d.name}>{d.region || ''}</option>)}</datalist>;
};

export default DestinationOptions;
