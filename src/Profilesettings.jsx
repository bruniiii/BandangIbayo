import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { shrinkImage } from './imageCompress';
import { toast } from './ui/toast';
import MyData from './MyData';
import ChangePassword from './ChangePassword';
import { nameError, phoneError, emailError, samePhone, normalizePhone, birthDateError, textError, cleanName, todayPH, formatPhPhone } from './validation';
import AddressFields from './AddressFields';
import { composeAddress } from './phAddress';
import {
  User, Mail, Phone, Calendar, MapPin,
  Loader2, CheckCircle2, Camera, Trash2, PencilLine, X,
} from 'lucide-react';
import { confirmDialog } from './ui/ConfirmDialog';
import { phoneFieldProps } from './ui/phoneField';
import { Skel, SkeletonRegion } from './ui/Skeleton';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// ---------------------------------------------------------

const inputStyle = {
  width: '100%',
  padding: '11px 14px 11px 40px',
  borderRadius: 12,
  border: '1px solid rgba(180,81,30,0.18)',
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
  opacity: 0.9,
};

const Field = ({ label, icon, children }) => (
  <div>
    <label style={labelStyle}>{label}</label>
    <div style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
        color: '#A8481A', opacity: 0.9, display: 'flex', pointerEvents: 'none',
      }}>
        {icon}
      </span>
      {children}
    </div>
  </div>
);

// One line of the read-only view.
const InfoRow = ({ label, icon, value, note }) => (
  <div style={{ minWidth: 0 }}>
    <p style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ color: '#A8481A', display: 'flex' }}>{icon}</span> {label}
    </p>
    <p style={{ fontSize: 14, fontWeight: 700, color: value ? '#1A0A00' : 'rgba(122,58,24,0.7)', margin: 0, overflowWrap: 'anywhere' }}>
      {value || 'Not set'}
      {note && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8481A', background: 'rgba(180,81,30,0.12)', borderRadius: 999, padding: '2px 8px', verticalAlign: 'middle' }}>{note}</span>}
    </p>
  </div>
);

// "Primary" choice beside an email or phone field.
const PrimaryRadio = ({ name, checked, onChange, disabled }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11.5, fontWeight: 800, color: disabled ? 'rgba(122,58,24,0.5)' : '#7A3A18', cursor: disabled ? 'not-allowed' : 'pointer' }}>
    <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} style={{ accentColor: '#B4511E', width: 15, height: 15, margin: 0 }} />
    Primary
  </label>
);

const formatDob = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');

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
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  // Information is shown first; Edit Profile opens the form.
  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    date_of_birth: '',
    address: '',
    province: '',
    city_municipality: '',
    barangay: '',
    street: '',
    emergency_contact_name: '',
    emergency_contact_number: '',
    secondary_email: '',
    secondary_phone: '',
    primary_email: 'login', // 'login' or 'secondary': which email gets notifications
    primary_phone: 'main', // 'main' or 'secondary': the number used for bookings
  });

  // The form, filled in from the saved profile.
  const formFrom = (data) => ({
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    phone_number: formatPhPhone(data.phone_number || ''),
    date_of_birth: data.date_of_birth || '',
    address: data.address || '',
    province: data.province || '',
    city_municipality: data.city_municipality || '',
    barangay: data.barangay || '',
    street: data.street || '',
    emergency_contact_name: data.emergency_contact_name || '',
    emergency_contact_number: formatPhPhone(data.emergency_contact_number || ''),
    secondary_email: data.secondary_email || '',
    secondary_phone: formatPhPhone(data.secondary_phone || ''),
    primary_email: data.primary_email === 'secondary' && data.secondary_email ? 'secondary' : 'login',
    primary_phone: 'main',
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
        toast.error("Couldn't load your profile", error.message);
      } else if (data) {
        setProfile(data);
        setAvatarPreview(data.avatar_url || null);
        setForm(formFrom(data));
      }
      setLoading(false);
    })();
  }, []);

  const handleChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please check your details', 'Please choose a valid image file.');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Please check your details', 'Profile photo must be 5 MB or smaller.');
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
    // Address: province, city/municipality, barangay and street together (or none, to keep an older address as is).
    const addressParts = [form.province, form.city_municipality, form.barangay, form.street.trim()];
    if (addressParts.some(Boolean) && !addressParts.every(Boolean)) {
      toast.error('Please check your details', 'Please choose your province, city/municipality and barangay, and enter your street.');
      return;
    }
    // Typing mistakes: names with numbers, wrong phone formats, impossible birthdays.
    const hasEmergency = !!(form.emergency_contact_name.trim() || form.emergency_contact_number.trim());
    const secondEmail = form.secondary_email.trim().toLowerCase();
    const problem = [
      nameError(form.first_name, 'First name'),
      nameError(form.last_name, 'Last name'),
      phoneError(form.phone_number, 'Phone number', { required: false }),
      phoneError(form.secondary_phone, 'Second phone number', { required: false }),
      samePhone(form.secondary_phone, form.phone_number) ? 'Your second phone number is the same as your first one.' : '',
      form.primary_phone === 'secondary' && !form.secondary_phone.trim() ? 'Enter your second phone number to make it your primary number.' : '',
      secondEmail ? emailError(secondEmail) : '',
      secondEmail && secondEmail === String(profile?.email || '').toLowerCase() ? 'Your second email is the same as your login email.' : '',
      form.primary_email === 'secondary' && !secondEmail ? 'Enter your second email to make it your primary email.' : '',
      birthDateError(form.date_of_birth),
      hasEmergency ? nameError(form.emergency_contact_name, 'Emergency contact name', { max: 120 }) : '',
      hasEmergency ? phoneError(form.emergency_contact_number, 'Emergency contact number') : '',
      samePhone(form.emergency_contact_number, form.phone_number) || samePhone(form.emergency_contact_number, form.secondary_phone) ? 'Your emergency contact should be someone else, not your own phone number.' : '',
      form.province ? textError(form.street, 'Street / house no.', { min: 2, max: 200 }) : '',
    ].find(Boolean);
    if (problem) {
      toast.error('Please check your details', problem);
      return;
    }
    setSaving(true);

    try {
      let finalAvatarUrl = profile?.avatar_url || null;

      // 1. Upload new avatar if selected
      if (pendingAvatarFile === 'REMOVE') {
        finalAvatarUrl = null;
      } else if (pendingAvatarFile instanceof File) {
        setAvatarBusy(true);
        const avatarFile = await shrinkImage(pendingAvatarFile, { maxSide: 512 }); // a profile picture never shows bigger than this
        const rawExt = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const ext = rawExt.replace(/[^a-z0-9]/g, '') || 'jpg';
        const filePath = `avatars/${userId}/${Date.now()}.${ext}`; // own folder: joiners may only upload into avatars/<their id>/

        // Use the same public bucket already used elsewhere in the app.
        // A unique path avoids browser/CDN caching an older profile photo.
        const { error: uploadError } = await supabase.storage
          .from('tours')
          .upload(filePath, avatarFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: avatarFile.type,
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
          .from('tours')
          .getPublicUrl(filePath);

        finalAvatarUrl = publicData.publicUrl;
        setAvatarBusy(false);
      }

      // 2. Update Database Record. The primary phone number is always kept
      //    as phone_number (it's the one used for bookings).
      const firstPhone = form.phone_number.trim() ? normalizePhone(form.phone_number) : '';
      const secondPhone = form.secondary_phone.trim() ? normalizePhone(form.secondary_phone) : '';
      const [mainPhone, otherPhone] = form.primary_phone === 'secondary' ? [secondPhone, firstPhone] : [firstPhone, secondPhone];
      const updatePayload = {
        first_name: cleanName(form.first_name),
        last_name: cleanName(form.last_name),
        phone_number: mainPhone,
        secondary_phone: otherPhone || null,
        secondary_email: secondEmail || null,
        primary_email: secondEmail && form.primary_email === 'secondary' ? 'secondary' : 'login',
        date_of_birth: form.date_of_birth || null,
        ...(form.province ? {
          province: form.province,
          city_municipality: form.city_municipality,
          barangay: form.barangay,
          street: form.street.trim(),
          address: composeAddress({ street: form.street, barangay: form.barangay, city: form.city_municipality, province: form.province }),
        } : {}),
        emergency_contact_name: cleanName(form.emergency_contact_name),
        emergency_contact_number: form.emergency_contact_number.trim() ? normalizePhone(form.emergency_contact_number) : '',
        avatar_url: finalAvatarUrl,
      };

      const { data: savedProfile, error: updateError } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId)
        .select('id, avatar_url, first_name, last_name, phone_number, secondary_phone, secondary_email, primary_email, date_of_birth, address, province, city_municipality, barangay, street, emergency_contact_name, emergency_contact_number')
        .single();

      if (updateError) throw updateError;
      if (!savedProfile) throw new Error('Profile was not updated. Check your Supabase RLS UPDATE policy.');

      const merged = { ...profile, ...updatePayload, ...savedProfile };
      setProfile(merged);
      setForm(formFrom(merged));
      setPendingAvatarFile(null);
      setAvatarPreview(finalAvatarUrl);
      setEditing(false);

      // 3. Notify Dashboard Header immediately so both profile pictures match
      window.dispatchEvent(new CustomEvent('user_profile_updated', {
        detail: {
          first_name: updatePayload.first_name,
          last_name: updatePayload.last_name,
          avatar_url: finalAvatarUrl
        }
      }));

      toast.success('Profile saved', 'Your changes are up to date.');
    } catch (err) {
      toast.error("Couldn't save your profile", err.message);
    } finally {
      setSaving(false);
      setAvatarBusy(false);
    }
  };

  const fullName = `${form.first_name} ${form.last_name}`.trim() || profile?.username || 'Joiner';

  // Cancel: back to the saved details (asks first if something was changed).
  const cancelEditing = async () => {
    const changed = JSON.stringify(form) !== JSON.stringify(formFrom(profile || {})) || pendingAvatarFile;
    if (changed && !(await confirmDialog({ title: 'Discard your changes?', message: 'Your profile stays as it was.', confirmLabel: 'Discard', cancelLabel: 'Keep Editing', tone: 'danger' }))) return;
    setForm(formFrom(profile || {}));
    setPendingAvatarFile(null);
    setAvatarPreview(profile?.avatar_url || null);
    setEditing(false);
  };

  if (loading) {
    return (
      <SkeletonRegion label="Loading profile" style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 780, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, background: '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(180,81,30,0.12)' }}>
          <Skel w={84} h={84} r={999} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}><Skel w="40%" h={16} /><Skel w="30%" h={11} /><Skel w={120} h={30} r={10} /></div>
        </div>
        <div style={{ background: '#FDF6EE', borderRadius: 22, padding: '1.5rem', border: '1px solid rgba(180,81,30,0.12)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}><Skel w="35%" h={9} /><Skel h={40} r={12} /></div>
          ))}
        </div>
      </SkeletonRegion>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 780, margin: '0 auto', position: 'relative' }}>


      {/* avatar card */}
      <div style={{
        background: '#FDF6EE', borderRadius: 20, padding: '1.75rem',
        border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
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
          <p style={{ fontSize: 12.5, color: '#7A3A18', opacity: 0.9, margin: '3px 0 0' }}>{profile?.email}</p>

          {editing && <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
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
                  background: 'rgba(192,54,44,0.06)', color: '#C0362C', border: '1px solid rgba(192,54,44,0.35)',
                  borderRadius: 10, padding: '9px 16px', fontSize: 11.5, fontWeight: 800,
                  cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}
              >
                <Trash2 size={14} /> Remove Photo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarSelect}
            />
          </div>}
        </div>
      </div>

      {/* personal information card: shown first, editable after Edit Profile */}
      <div style={{
        background: '#FDF6EE', borderRadius: 20, padding: '1.75rem',
        border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 20px rgba(26,10,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontWeight: 900, fontSize: 15, color: '#1A0A00', margin: 0 }}>Personal Information</h3>
            <p style={{ fontSize: 12, color: '#7A3A18', opacity: 0.9, margin: '4px 0 0' }}>
              {editing ? 'Update your details, then click Save Changes.' : 'Your details. Click Edit Profile to change them.'}
            </p>
          </div>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} style={{
              display: 'flex', alignItems: 'center', gap: 8, background: '#1A0A00', color: '#E8A265', fontWeight: 900, fontSize: 12,
              letterSpacing: '0.08em', textTransform: 'uppercase', border: 'none', borderRadius: 12, padding: '12px 22px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <PencilLine size={15} /> Edit Profile
            </button>
          )}
        </div>

        {!editing ? (
          <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <InfoRow label="First Name" icon={<User size={14} />} value={profile?.first_name} />
            <InfoRow label="Last Name" icon={<User size={14} />} value={profile?.last_name} />
            <InfoRow label="Email (login)" icon={<Mail size={14} />} value={profile?.email} note={form.primary_email === 'login' ? 'Primary' : null} />
            <InfoRow label="Second Email" icon={<Mail size={14} />} value={profile?.secondary_email} note={form.primary_email === 'secondary' ? 'Primary' : null} />
            <InfoRow label="Phone Number" icon={<Phone size={14} />} value={formatPhPhone(profile?.phone_number || '')} note={profile?.phone_number ? 'Primary' : null} />
            <InfoRow label="Second Phone Number" icon={<Phone size={14} />} value={formatPhPhone(profile?.secondary_phone || '')} />
            <InfoRow label="Date of Birth" icon={<Calendar size={14} />} value={formatDob(profile?.date_of_birth)} />
            <InfoRow label="Address" icon={<MapPin size={14} />} value={profile?.address} />
            <InfoRow label="Emergency Contact Name" icon={<User size={14} />} value={profile?.emergency_contact_name} />
            <InfoRow label="Emergency Contact Number" icon={<Phone size={14} />} value={formatPhPhone(profile?.emergency_contact_number || '')} />
            <p style={{ gridColumn: '1 / -1', fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: 0, lineHeight: 1.6 }}>
              Your primary email receives notification emails, and your primary phone number is used for your bookings.
            </p>
          </div>
        ) : (
        <>
        <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Field label="First Name" icon={<User size={15} />}>
            <input style={inputStyle} data-allow="name" value={form.first_name} onChange={handleChange('first_name')} placeholder="Juan" />
          </Field>
          <Field label="Last Name" icon={<User size={15} />}>
            <input style={inputStyle} data-allow="name" value={form.last_name} onChange={handleChange('last_name')} placeholder="Dela Cruz" />
          </Field>
        </div>

        <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <Field label="Email Address (login)" icon={<Mail size={15} />}>
              <input style={readOnlyInputStyle} value={profile?.email || ''} readOnly title="Contact support to change your login email" />
            </Field>
            <PrimaryRadio name="primary-email" checked={form.primary_email === 'login'} onChange={() => setForm((f) => ({ ...f, primary_email: 'login' }))} />
          </div>
          <div>
            <Field label="Second Email (optional)" icon={<Mail size={15} />}>
              <input style={inputStyle} type="email" value={form.secondary_email} onChange={handleChange('secondary_email')} placeholder="juan.work@gmail.com" maxLength={200} />
            </Field>
            <PrimaryRadio name="primary-email" checked={form.primary_email === 'secondary'} disabled={!form.secondary_email.trim()} onChange={() => setForm((f) => ({ ...f, primary_email: 'secondary' }))} />
          </div>
        </div>

        <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <Field label="Phone Number" icon={<Phone size={15} />}>
              <input style={inputStyle} {...phoneFieldProps(form.phone_number, (v) => setForm((prev) => ({ ...prev, phone_number: v })))} />
            </Field>
            <PrimaryRadio name="primary-phone" checked={form.primary_phone === 'main'} onChange={() => setForm((f) => ({ ...f, primary_phone: 'main' }))} />
          </div>
          <div>
            <Field label="Second Phone Number (optional)" icon={<Phone size={15} />}>
              <input style={inputStyle} {...phoneFieldProps(form.secondary_phone, (v) => setForm((prev) => ({ ...prev, secondary_phone: v })))} />
            </Field>
            <PrimaryRadio name="primary-phone" checked={form.primary_phone === 'secondary'} disabled={!form.secondary_phone.trim()} onChange={() => setForm((f) => ({ ...f, primary_phone: 'secondary' }))} />
          </div>
        </div>
        <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: '-4px 0 16px', lineHeight: 1.5 }}>
          Your primary email receives notification emails. Your primary phone number is the one used for your bookings.
        </p>

        <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Field label="Date of Birth" icon={<Calendar size={15} />}>
            <input type="date" max={todayPH()} style={inputStyle} value={form.date_of_birth || ''} onChange={handleChange('date_of_birth')} />
          </Field>
        </div>

        <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Field label="Emergency Contact Name" icon={<User size={15} />}>
            <input style={inputStyle} data-allow="name" value={form.emergency_contact_name} onChange={handleChange('emergency_contact_name')} placeholder="Maria Dela Cruz" maxLength={120} />
          </Field>
          <Field label="Emergency Contact Number" icon={<Phone size={15} />}>
            <input style={inputStyle} {...phoneFieldProps(form.emergency_contact_number, (v) => setForm((prev) => ({ ...prev, emergency_contact_number: v })))} />
          </Field>
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <MapPin size={14} style={{ color: '#A8481A' }} /> Address
          </p>
          {!form.province && form.address && (
            <p style={{ fontSize: 12, color: '#7A3A18', margin: '0 0 10px' }}>
              Current address: <strong>{form.address}</strong>. Choose your province, city/municipality and barangay below to update it.
            </p>
          )}
          <AddressFields
            key={userId || 'address'}
            defaultValue={{ province: form.province, city: form.city_municipality, barangay: form.barangay, street: form.street }}
            onChange={({ province, city, barangay, street }) => setForm((f) => ({ ...f, province, city_municipality: city, barangay, street }))}
            labelStyle={labelStyle}
            selectStyle={{ ...inputStyle, paddingLeft: 14, cursor: 'pointer' }}
            inputStyle={{ ...inputStyle, paddingLeft: 14 }}
          />
        </div>

        <div style={{ borderTop: '1px solid rgba(180,81,30,0.15)', paddingTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: '#F2E4D0', color: '#1A0A00', fontWeight: 900, fontSize: 12,
              letterSpacing: '0.08em', textTransform: 'uppercase', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 12,
              padding: '13px 22px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            <X size={15} /> Cancel
          </button>
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
        </div>
        </>
        )}
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>

      <ChangePassword />

      {/* Data Privacy Act: download or delete your data (joiners only) */}
      {profile && profile.role !== 'admin' && <MyData />}
    </div>
  );
};

export default ProfileSettings;