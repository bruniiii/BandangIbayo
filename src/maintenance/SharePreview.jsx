import { useEffect, useState } from 'react';
import { Share2, Upload, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { shrinkImage } from '../imageCompress';
import { card, h3, hint, btn, input, label, spin } from './shared';

// System Maintenance → Home Page & Banner → Link preview: what Facebook,
// Messenger and other apps show when someone shares the website's link
// (api/site-preview.js reads it). Each tour's own link still shows that tour.
// Facebook keeps a copy for a while: the Sharing Debugger's "Scrape Again"
// updates it right away.

const DEFAULTS = {
  title: 'Bandang IBAYO · Group tours across the Philippines',
  description: 'Join group tours across the Philippines. Share the ride, split the cost, and discover more places.',
  image_url: '/og-image.jpg',
};
const inp = { ...input, letterSpacing: 0, textTransform: 'none', fontWeight: 600 };

const SharePreview = ({ canEdit }) => {
  const [v, setV] = useState(null);
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc('get_share_preview').then(({ data }) => {
      if (alive) setV({ title: data?.title || '', description: data?.description || '', image_url: data?.image_url || '' });
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!file) return undefined;
    const u = URL.createObjectURL(file);
    setFileUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!v) return null;
  const image = (file && fileUrl) || v.image_url || DEFAULTS.image_url;

  const save = async () => {
    setSaving(true);
    try {
      let url = v.image_url;
      if (file) {
        const small = await shrinkImage(file, { maxSide: 1200 });
        const path = `site/share-${Date.now()}.${small.type === 'image/png' ? 'png' : 'jpg'}`;
        const { error } = await supabase.storage.from('tours').upload(path, small, { contentType: small.type || 'image/jpeg' });
        if (error) throw error;
        url = supabase.storage.from('tours').getPublicUrl(path).data.publicUrl;
      }
      const { data, error } = await supabase.rpc('set_share_preview', { p_title: v.title, p_description: v.description, p_image_url: url || null });
      if (error) throw error;
      setV({ title: data?.title || '', description: data?.description || '', image_url: data?.image_url || '' });
      setFile(null);
      toast.success('Link preview saved', 'New shares show it. Facebook may keep the old one for a while.');
    } catch (err) {
      reportError("Couldn't save the link preview", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={card}>
      <h3 style={h3}><Share2 size={16} color="var(--ib-accent, #B4511E)" /> Link preview</h3>
      <p style={hint}>What Facebook, Messenger and other apps show when someone shares the website's link. Leave a box empty to use the usual text. Each tour's link shows that tour instead.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={label}>Title<input value={v.title} disabled={!canEdit} maxLength={90} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder={DEFAULTS.title} style={inp} /></label>
          <label style={label}>Text<textarea value={v.description} disabled={!canEdit} maxLength={200} rows={3} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder={DEFAULTS.description} style={{ ...inp, resize: 'vertical' }} /></label>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={btn(false)}>
                <Upload size={14} /> {v.image_url || file ? 'Change photo' : 'Choose photo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setFile(f); }} />
              </label>
              {(v.image_url || file) && <button type="button" style={btn(false)} onClick={() => { setFile(null); setV({ ...v, image_url: '' }); }}>Use usual photo</button>}
            </div>
          )}
          <p style={{ ...hint, margin: 0, fontSize: 12 }}>A wide photo looks best (about 1200 × 630).</p>
        </div>
        {/* How it looks on Facebook */}
        <div aria-label="Preview on Facebook" style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #DADDE1', background: '#F0F2F5', color: '#1C1E21', fontFamily: 'Helvetica, Arial, sans-serif' }}>
          <img src={image} alt="" style={{ display: 'block', width: '100%', aspectRatio: '1.91 / 1', objectFit: 'cover', maxWidth: 'none' }} />
          <div style={{ padding: '10px 12px' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#65676B', textTransform: 'uppercase' }}>bandangibayo.website</p>
            <p style={{ margin: '3px 0 0', fontSize: 16, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{v.title.trim() || DEFAULTS.title}</p>
            <p style={{ margin: '3px 0 0', fontSize: 14, color: '#65676B', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{v.description.trim() || DEFAULTS.description}</p>
          </div>
        </div>
      </div>
      {canEdit && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button type="button" style={btn(true)} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} style={spin} /> : null} Save Link Preview</button></div>}
    </section>
  );
};

export default SharePreview;
