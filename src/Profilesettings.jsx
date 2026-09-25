import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  User, Mail, Phone, Calendar, MapPin, ShieldAlert,
  Loader2, CheckCircle2, Camera, Trash2,
} from 'lucide-react';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------

const inputStyle = {
  width: '100%',
  padding: '11px 14px 11px 40px',
  borderRadius: 12,
  border: '1px solid rgba(196,92,38,0.18)',
  background: '#F2E4D0',
  fontSize: 13.5,
  fontWeight: 600,
  color: '#1A0A00',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const readOnlyInputStyle = {
  ...inputStyle,
  color: '#7A3A18',
  opacity: 0.7,
  cursor: 'not-allowed',
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#7A3A18',
  marginBottom: 7,
  opacity: 0.85,
};

const Field = ({ label, icon, children }) => (
  <div>
    <label style={labelStyle}>{label}</label>
    <div style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
        color: '#C45C26', opacity: 0.6, display: 'flex', pointerEvents: 'none',
      }}>
        {icon}
      </span>
      {children}
    </div>
  </div>
);

const initialsOf = (profile) => {
  const first = (profile?.first_name || '').trim();
  const last = (profile?.last_name || '').trim();
  if (first || last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || first.charAt(0).toUpperCase();
  if (profile?.username) return profile.username.charAt(0).toUpperCase();
  return '?';
};

const ProfileSettings = () => {
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    date_of_birth: '',
    address: '',
    emergency_contact_number: '',
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        setToast({ type: 'error', message: 'Could not load profile: ' + error.message });
      } else if (data) {
        setProfile(data);
        setAvatarPreview(data.avatar_url || null);
        setForm({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          phone_number: data.phone_number || '',
          date_of_birth: data.date_of_birth || '',
          address: data.address || '',
          emergency_contact_number: data.emergency_contact_number || '',
        });
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setToast({ type: 'error', message: 'Please choose a valid image file.' });
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setToast({ type: 'error', message: 'Profile photo must be 5 MB or smaller.' });
      e.target.value = '';
      return;
    }

    setPendingAvatarFile(file);
    setAvatarPreview(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleRemoveAvatar = () => {
    setPendingAvatarFile('REMOVE');
    setAvatarPreview(null);
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);

    try {
      let finalAvatarUrl = profile?.avatar_url || null;

      // 1. Upload new avatar if selected
      if (pendingAvatarFile === 'REMOVE') {
        finalAvatarUrl = null;
      } else if (pendingAvatarFile instanceof File) {
        setAvatarBusy(true);
        const rawExt = pendingAvatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const ext = rawExt.replace(/[^a-z0-9]/g, '') || 'jpg';
        const filePath = `avatars/${userId}-${Date.now()}.${ext}`;

        // Use the same public bucket already used elsewhere in the app.
        // A unique path avoids browser/CDN caching an older profile photo.
        const { error: uploadError } = await supabase.storage
          .from('tours')
          .upload(filePath, pendingAvatarFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: pendingAvatarFile.type,
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
          .from('tours')
          .getPublicUrl(filePath);

        finalAvatarUrl = publicData.publicUrl;
        setAvatarBusy(false);
      }

      // 2. Update Database Record
      const updatePayload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone_number: form.phone_number.trim(),
        date_of_birth: form.date_of_birth || null,
        address: form.address.trim(),
        emergency_contact_number: form.emergency_contact_number.trim(),
        avatar_url: finalAvatarUrl,
      };

      const { data: savedProfile, error: updateError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId)
        .select('id, avatar_url, first_name, last_name, phone_number, date_of_birth, address, emergency_contact_number')
        .single();

      if (updateError) throw updateError;
      if (!savedProfile) throw new Error('Profile was not updated. Check your Supabase RLS UPDATE policy.');

      setProfile(prev => ({ ...prev, ...updatePayload, ...savedProfile }));
      setPendingAvatarFile(null);
      setAvatarPreview(finalAvatarUrl);

      // 3. Notify Dashboard Header immediately so both profile pictures match
      window.dispatchEvent(new CustomEvent('user_profile_updated', {
        detail: {
          first_name: updatePayload.first_name,
          last_name: updatePayload.last_name,
          avatar_url: finalAvatarUrl
        }
      }));

      setToast({ type: 'success', message: 'Profile and photo saved successfully!' });
    } catch (err) {
      setToast({ type: 'error', message: 'Failed to save: ' + err.message });
    } finally {
      setSaving(false);
      setAvatarBusy(false);
    }
  };

  const fullName = `${form.first_name} ${form.last_name}`.trim() || profile?.username || 'Joiner';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', color: 'rgba(122,58,24,0.4)' }}>
        <Loader2 size={20} style={{ marginRight: 10, animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading profile…</span>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 780, margin: '0 auto', position: 'relative' }}>
      <div>
        <h2 style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.02em', color: '#1A0A00', margin: 0 }}>
          Profile Settings
        </h2>
        <p style={{ fontSize: 13, color: '#7A3A18', opacity: 0.7, margin: '4px 0 0' }}>
          Manage your account information and preferences
        </p>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 400,
          display: 'flex', alignItems: 'center', gap: 8,
          background: toast.type === 'success' ? '#1A0A00' : '#7A2020',
          color: toast.type === 'success' ? '#E8A265' : '#FDE8E8',
          padding: '12px 18px', borderRadius: 12,
          fontSize: 12.5, fontWeight: 700,
          boxShadow: '0 12px 32px rgba(26,10,0,0.3)',
        }}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
          {toast.message}
        </div>
      )}

      {/* avatar card */}
      <div style={{
        background: '#FDF6EE', borderRadius: 20, padding: '1.75rem',
        border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%', overflow: 'hidden',
            background: '#1A0A00', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#E8A265', fontWeight: 900, fontSize: 28,
            boxShadow: '0 6px 20px rgba(26,10,0,0.25)',
          }}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initialsOf(form.first_name ? form : profile)
            )}
          </div>
          {avatarBusy && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(26,10,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Loader2 size={20} color="#FDF6EE" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ fontWeight: 900, fontSize: 17, color: '#1A0A00', margin: 0 }}>{fullName}</p>
          <p style={{ fontSize: 12.5, color: '#7A3A18', opacity: 0.7, margin: '3px 0 0' }}>{profile?.email}</p>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#1A0A00', color: '#E8A265', border: 'none',
                borderRadius: 10, padding: '9px 16px', fontSize: 11.5, fontWeight: 800,
                cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              <Camera size={14} /> Choose Photo
            </button>
            {avatarPreview && (
              <button
                onClick={handleRemoveAvatar}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', color: '#7A3A18', border: '1px solid rgba(196,92,38,0.25)',
                  borderRadius: 10, padding: '9px 16px', fontSize: 11.5, fontWeight: 800,
                  cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarSelect}
            />
          </div>
        </div>
      </div>

      {/* personal information card */}
      <div style={{
        background: '#FDF6EE', borderRadius: 20, padding: '1.75rem',
        border: '1px solid rgba(196,92,38,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
      }}>
        <h3 style={{ fontWeight: 900, fontSize: 15, color: '#1A0A00', margin: 0 }}>Personal Information</h3>
        <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.65, margin: '4px 0 20px' }}>
          Update your personal details and click Save Changes below.
        </p>

        <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Field label="First Name" icon={<User size={15} />}>
            <input style={inputStyle} value={form.first_name} onChange={handleChange('first_name')} placeholder="Juan" />
          </Field>
          <Field label="Last Name" icon={<User size={15} />}>
            <input style={inputStyle} value={form.last_name} onChange={handleChange('last_name')} placeholder="Dela Cruz" />
          </Field>
        </div>

        <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Field label="Email Address" icon={<Mail size={15} />}>
            <input style={readOnlyInputStyle} value={profile?.email || ''} readOnly title="Contact support to change your login email" />
          </Field>
          <Field label="Phone Number" icon={<Phone size={15} />}>
            <input style={inputStyle} value={form.phone_number} onChange={handleChange('phone_number')} placeholder="+63 912 345 6789" />
          </Field>
        </div>

        <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Field label="Date of Birth" icon={<Calendar size={15} />}>
            <input type="date" style={inputStyle} value={form.date_of_birth || ''} onChange={handleChange('date_of_birth')} />
          </Field>
          <Field label="Emergency Contact Number" icon={<Phone size={15} />}>
            <input style={inputStyle} value={form.emergency_contact_number} onChange={handleChange('emergency_contact_number')} placeholder="+63 917 123 4567" />
          </Field>
        </div>

        <div style={{ marginBottom: 8 }}>
          <Field label="Address" icon={<MapPin size={15} />}>
            <input style={inputStyle} value={form.address} onChange={handleChange('address')} placeholder="City, Province" />
          </Field>
        </div>

        <div style={{ borderTop: '1px solid rgba(196,92,38,0.15)', paddingTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: saving ? 'rgba(26,10,0,0.5)' : '#1A0A00',
              color: '#E8A265', fontWeight: 900, fontSize: 12, letterSpacing: '0.08em',
              textTransform: 'uppercase', border: 'none', borderRadius: 12,
              padding: '13px 26px', cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', boxShadow: saving ? 'none' : '0 8px 20px rgba(26,10,0,0.25)',
            }}
          >
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={15} />}
            Save Changes
          </button>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;