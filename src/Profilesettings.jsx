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
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message }
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
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
        setToast({ type: 'error', message: 'Could not load your profile: ' + error.message });
      } else if (data) {
        setProfile(data);
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

  const uploadAvatar = async (file) => {
    setAvatarBusy(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `avatars/${userId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('tours').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('tours').getPublicUrl(path);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('id', userId);
      if (updateError) throw updateError;

      setProfile(prev => ({ ...prev, avatar_url: data.publicUrl }));
      setToast({ type: 'success', message: 'Profile photo updated.' });
    } catch (err) {
      setToast({ type: 'error', message: 'Error uploading photo: ' + err.message });
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile?.avatar_url) return;
    setAvatarBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
      if (error) throw error;
      setProfile(prev => ({ ...prev, avatar_url: null }));
      setToast({ type: 'success', message: 'Profile photo removed.' });
    } catch (err) {
      setToast({ type: 'error', message: 'Error removing photo: ' + err.message });
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone_number: form.phone_number.trim(),
          date_of_birth: form.date_of_birth || null,
          address: form.address.trim(),
          emergency_contact_number: form.emergency_contact_number.trim(),
        })
        .eq('id', userId);
      if (error) throw error;

      setProfile(prev => ({ ...prev, ...form }));
      setToast({ type: 'success', message: 'Your changes have been saved.' });
    } catch (err) {
      setToast({ type: 'error', message: 'Error saving changes: ' + err.message });
    } finally {
      setSaving(false);
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

      {/* header */}
      <div>
        <h2 style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.02em', color: '#1A0A00', margin: 0 }}>
          Profile Settings
        </h2>
        <p style={{ fontSize: 13, color: '#7A3A18', opacity: 0.7, margin: '4px 0 0' }}>
          Manage your account information and preferences
        </p>
      </div>

      {/* toast */}
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
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initialsOf(profile)
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
              disabled={avatarBusy}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#1A0A00', color: '#E8A265', border: 'none',
                borderRadius: 10, padding: '9px 16px', fontSize: 11.5, fontWeight: 800,
                cursor: avatarBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
            >
              <Camera size={14} /> Change Photo
            </button>
            {profile?.avatar_url && (
              <button
                onClick={handleRemoveAvatar}
                disabled={avatarBusy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', color: '#7A3A18', border: '1px solid rgba(196,92,38,0.25)',
                  borderRadius: 10, padding: '9px 16px', fontSize: 11.5, fontWeight: 800,
                  cursor: avatarBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
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
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }}
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
          Update your personal details and contact information
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
        <p style={{ fontSize: 11, color: '#7A3A18', opacity: 0.55, margin: '0 0 20px' }}>
          Your emergency contact will be notified in case of emergencies during your tours.
        </p>

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
