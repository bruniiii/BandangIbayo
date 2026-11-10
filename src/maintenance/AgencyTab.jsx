import { useEffect, useState } from 'react';
import { Building2, Lock, Loader2, Upload, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast, reportError } from '../ui/toast';
import { confirmDialog } from '../ui/ConfirmDialog';
import { useAdminMe } from '../adminMe';
import { shrinkImage } from '../imageCompress';
import { phoneError, emailError } from '../validation';
import { DEFAULT_AGENCY, applyAgencyInfo, loadAgencyInfo } from '../agencyInfo';
import { maintenanceChanged } from '../maintenanceMode';
import { card, h3, hint, btn, input, label, spin } from './shared';

// ─────────────────────────────────────────────
// System Maintenance → Agency Information
// The agency's name, email, phone, Facebook page, address and logo: shown on
// the landing page, receipts, the help button and the "We'll be back soon"
// page. Everyone can read it; only the main admin changes it.
// ─────────────────────────────────────────────

const inp = { ...input, letterSpacing: 0, textTransform: 'none', fontWeight: 600 };
const FIELDS = [
  ['name', 'Agency name *', 'Bandang IBAYO'], ['email', 'Email', 'name@example.com'], ['phone', 'Phone', '0917 123 4567'],
  ['facebook', 'Facebook / Messenger link', 'https://facebook.com/…'], ['address', 'Address', 'City, Province'],
];

const AgencyTab = () => {
  const me = useAdminMe();
  const canEdit = me.isMain;
  const [f, setF] = useState(null);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc('get_agency_info').then(({ data }) => { if (alive) setF({ ...DEFAULT_AGENCY, ...(data || {}) }); });
    return () => { alive = false; };
  }, []);

  const problem = () => {
    if (!f.name.trim()) return 'Enter the agency name.';
    if (f.email.trim()) { const e = emailError(f.email); if (e) return e; }
    if (f.phone.trim()) { const p = phoneError(f.phone, 'Phone', { required: false }); if (p) return p; }
    if (f.facebook.trim() && !/^https?:\/\//i.test(f.facebook.trim())) return 'The Facebook link must start with https://';
    if (f.address.length > 300) return 'Keep the address under 300 characters.';
    return '';
  };

  const save = async () => {
    const p = problem();
    if (p) { toast.error('Please check the form', p); return; }
    if (!(await confirmDialog({ title: 'Save the agency information?', message: 'It shows on the landing page, receipts, the help button and the maintenance page.', confirmLabel: 'Save', cancelLabel: 'Keep Editing' }))) return;
    setSaving(true);
    try {
      let logo = f.logo_url;
      if (file) {
        const small = await shrinkImage(file, { maxSide: 512 });
        const path = `agency/logo-${Date.now()}.${small.type === 'image/png' ? 'png' : 'jpg'}`;
        const { error: upErr } = await supabase.storage.from('tours').upload(path, small, { contentType: small.type || 'image/jpeg' });
        if (upErr) throw upErr;
        logo = supabase.storage.from('tours').getPublicUrl(path).data.publicUrl;
      }
      const { data, error } = await supabase.rpc('set_agency_info', { p_info: { ...f, logo_url: logo } });
      if (error) throw error;
      applyAgencyInfo(data);
      await loadAgencyInfo().catch(() => null);
      maintenanceChanged?.();
      setF({ ...DEFAULT_AGENCY, ...data, logo_url: data.logo_url || '' });
      setFile(null);
      toast.success('Agency information saved');
    } catch (err) {
      reportError("Couldn't save the agency information", err);
    } finally {
      setSaving(false);
    }
  };

  if (!f) return <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, color: '#5C2A10' }}><Loader2 size={15} style={spin} /> Loading…</div>;
  const preview = file ? URL.createObjectURL(file) : f.logo_url;

  return (
    <div style={card}>
      <h3 style={h3}><Building2 size={16} color="#B4511E" /> Agency Information</h3>
      <p style={hint}>Shown on the landing page, receipts, the help button and the "We'll be back soon" page, so joiners can always reach you.</p>
      {!canEdit && (
        <p style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#F2E4D0', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, fontWeight: 700, color: '#5C2A10', margin: '0 0 12px' }}>
          <Lock size={15} /> Only the main admin can change the agency information.
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 12 }}>
        {FIELDS.map(([k, l, ph]) => (
          <label key={k} style={label}>{l}
            <input value={f[k] || ''} disabled={!canEdit} maxLength={k === 'address' ? 300 : 200} placeholder={ph} onChange={(e) => setF((o) => ({ ...o, [k]: e.target.value }))} style={inp} />
          </label>
        ))}
        <div style={label}>Logo
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: '#1A0A00', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8A265', fontSize: 11, flexShrink: 0 }}>
              {preview ? <img src={preview} alt="Agency logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'Default'}
            </div>
            {canEdit && (
              <>
                <label style={{ ...btn(false), letterSpacing: '0.08em' }}>
                  <Upload size={13} /> {preview ? 'Change' : 'Upload'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) setFile(x); }} />
                </label>
                {preview && <button type="button" style={btn(false)} onClick={() => { setFile(null); setF((o) => ({ ...o, logo_url: '' })); }}><X size={13} /> Use default</button>}
              </>
            )}
          </div>
        </div>
      </div>
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" style={btn(true)} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} style={spin} /> : null} Save Agency Information</button>
        </div>
      )}
    </div>
  );
};

export default AgencyTab;
