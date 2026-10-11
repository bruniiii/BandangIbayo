import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// GCash receipts from before online payments live in the private
// `booking-receipts` bucket, one folder per joiner (<user id>/<file>).
// bookings.receipt_url stores that path; older bookings store a full public
// URL. Both forms are handled below so admins can still view them.
const BUCKET = 'booking-receipts';

// Path inside the bucket, from either a stored path or an old public URL.
const receiptPath = (value) => {
  if (!value) return null;
  if (!/^https?:\/\//.test(value)) return value;
  const marker = `/${BUCKET}/`;
  const i = value.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(value.slice(i + marker.length).split('?')[0]);
};

// A short-lived link to view a receipt (only the owner and admins can get one).
export const useReceiptUrl = (value) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    const path = receiptPath(value);
    if (!path) return undefined;
    supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60).then(({ data, error }) => {
      if (error) console.error('Error loading receipt:', error.message);
      if (active) setUrl(data?.signedUrl || null);
    });
    return () => { active = false; };
  }, [value]);
  return url;
};
