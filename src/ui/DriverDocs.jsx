import React, { useEffect, useState } from 'react';
import { IdCard, Camera, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { shrinkImage } from '../imageCompress';
import { toast } from './toast';

// ─────────────────────────────────────────────
// Tracking → Fleet & Driver: the driver's license (or a valid ID) and a photo
// of the driver's face, so it's on record who drove (liability). Stored in the
// private "driver-docs" bucket: only admins can see them, never joiners.
//   <DriverDocs tourId={…} onReady={(bothUploaded) => …} readOnly />
// ─────────────────────────────────────────────

const KINDS = [
  ['license_path', "Driver's license / valid ID", IdCard],
  ['photo_path', "Driver's photo (face)", Camera],
];

// refreshKey: change it to load the pictures again (e.g. after picking a saved driver).
const DriverDocs = ({ tourId, onReady, readOnly = false, refreshKey = 0 }) => {
  const [doc, setDoc] = useState(null); // { license_path, photo_path }
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!tourId) return undefined;
    let alive = true;
    (async () => {
      const { data } = await supabase.from('driver_documents').select('license_path, photo_path').eq('tour_id', tourId).maybeSingle();
      if (!alive) return;
      setDoc(data || {});
    })();
    return () => { alive = false; };
  }, [tourId, refreshKey]);

  // Short-lived links to show the pictures.
  useEffect(() => {
    if (!doc) return undefined;
    let alive = true;
    onReady?.(!!(doc.license_path && doc.photo_path));
    (async () => {
      const next = {};
      for (const [key] of KINDS) {
        if (!doc[key]) continue;
        const { data } = await supabase.storage.from('driver-docs').createSignedUrl(doc[key], 600);
        if (data?.signedUrl) next[key] = data.signedUrl;
      }
      if (alive) setUrls(next);
    })();
    return () => { alive = false; };
  }, [doc, onReady]);

  const upload = async (key, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Not a photo', 'Please choose a picture (JPG, PNG or WebP).'); return; }
    setBusy(key);
    try {
      const small = await shrinkImage(file, { maxSide: 1400 });
      const path = `${tourId}/${key === 'license_path' ? 'license' : 'photo'}-${Date.now()}.${(small.name.split('.').pop() || 'jpg').toLowerCase()}`;
      const { error: upErr } = await supabase.storage.from('driver-docs').upload(path, small, { contentType: small.type, upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from('driver_documents').upsert([{ tour_id: tourId, [key]: path, updated_at: new Date().toISOString() }], { onConflict: 'tour_id' });
      if (error) throw error;
      setDoc((d) => ({ ...(d || {}), [key]: path }));
      toast.success('Uploaded', 'Saved privately; only admins can see it.');
    } catch (err) {
      toast.error("Couldn't upload it", err.message);
    } finally {
      setBusy('');
    }
  };

  if (!doc) return <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#7A3A18' }}>Loading driver ID…</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
      {KINDS.map((kind) => {
        const [key, label] = kind;
        const Icon = kind[2];
        return (
        <div key={key} style={{ border: `1px ${doc[key] ? 'solid' : 'dashed'} rgba(180,81,30,0.35)`, borderRadius: 12, padding: 10, display: 'flex', gap: 10, alignItems: 'center', background: '#FDF6EE' }}>
          {urls[key]
            ? <a href={urls[key]} target="_blank" rel="noreferrer"><img src={urls[key]} alt={label} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, display: 'block' }} /></a>
            : <span style={{ width: 56, height: 56, borderRadius: 10, background: '#F2E4D0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A8481A', flexShrink: 0 }}><Icon size={22} /></span>}
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#1A0A00' }}>{label}{!readOnly && <span style={{ color: '#A8481A' }}> *</span>}</p>
            {doc[key] ? (
              <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 700, color: '#1B5E3B', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> On file (admins only)</p>
            ) : (
              <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 700, color: '#8C2F1C' }}>Not uploaded yet</p>
            )}
            {!readOnly && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#B4511E', cursor: busy ? 'wait' : 'pointer' }}>
                {busy === key ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Icon size={12} />}
                {doc[key] ? 'Replace' : 'Upload'}
                <input type="file" accept="image/*" capture={key === 'photo_path' ? 'user' : undefined} disabled={!!busy} onChange={(e) => { upload(key, e.target.files?.[0]); e.target.value = ''; }} style={{ display: 'none' }} />
              </label>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
};

export default DriverDocs;
