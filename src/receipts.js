import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// GCash receipts live in the private `booking-receipts` bucket, one folder
// per joiner (<user id>/<file>). bookings.receipt_url stores that path.
// Older bookings store a full public URL; both forms are handled below.
const BUCKET = 'booking-receipts';

// Uploads a receipt image for the logged-in joiner; returns its storage path.
export const uploadReceipt = async (file) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please log in again to upload your receipt.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${user.id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error('Receipt upload failed: ' + error.message);
  return path;
};

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
