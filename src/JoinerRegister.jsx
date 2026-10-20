import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Loader2,
  CheckCircle2,
  X,
  AlertTriangle,
  Camera,
  UserRound,
  Phone,
  CalendarDays,
  MapPin,
  Mail,
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { shrinkImage } from './imageCompress';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { safeNextPath } from './tourUtils';
import { passwordErrorMessage } from './passwordPolicy';
import {
  checkFields, flagField, usernameError, nameError, suffixError, emailError, emailSuggestion,
  phoneError, samePhone, normalizePhone, birthDateError, textError, cleanName, todayPH,
} from './validation';
import PasswordChecklist from './PasswordChecklist';
import AddressFields from './AddressFields';
import { composeAddress } from './phAddress';
import logoIcon from './assets/newIcon.png';
import PasswordField from './ui/PasswordField';
import RequiredMark from './ui/RequiredMark';
import { phoneInputProps } from './ui/phoneField';
import TermsModal from './ui/TermsModal';
import { googleNameParts } from './googleAuth';

// mode="complete" (/complete-profile): after "Continue with Google", the
// same form without email and password fills in the rest of the profile.
const JoinerRegister = ({ mode = 'register' }) => {
  const completing = mode === 'complete';
  const [googleUser, setGoogleUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);

  // Optional profile picture
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const navigate = useNavigate();
  const [passwordInput, setPasswordInput] = useState('');
  // Keep a pending tour (?next=/tours/12) through register → login.
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const loginPath = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login';

  // Completing a Google sign-up: needs the signed-in account (its email and name).
  useEffect(() => {
    if (!completing) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate(loginPath, { replace: true });
      else setGoogleUser(data.session.user);
    });
  }, [completing, navigate, loginPath]);
  const googleName = googleNameParts(googleUser);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Not a photo', 'Please choose an image file (JPG, PNG or WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo is too big', 'Your profile picture must be 5 MB or smaller.');
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const uploadAvatar = async (userId, original) => {
    if (!original) return null;
    const file = await shrinkImage(original, { maxSide: 512 }); // a profile picture never shows bigger than this

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filePath = `avatars/${userId}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('tours')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('tours')
      .getPublicUrl(filePath);

    return data?.publicUrl || null;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;

    if (!agreedToTerms) {
      setTermsError(true);
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData(form);

      let email = String(formData.get('email') || '').trim().toLowerCase();
      const password = String(formData.get('password') || '');
      const confirmPassword = String(formData.get('confirmPassword') || '');

      const username = String(formData.get('username') || '').trim();
      const firstName = String(formData.get('firstName') || '').trim();
      const middleName = String(formData.get('middleName') || '').trim();
      const lastName = String(formData.get('lastName') || '').trim();
      const suffix = String(formData.get('suffix') || '').trim();
      const phone = String(formData.get('phone') || '').trim();

      const dateOfBirth = String(formData.get('dateOfBirth') || '').trim();
      const emergencyContactNumber = String(
        formData.get('emergencyContactNumber') || ''
      ).trim();
      const emergencyContactName = String(formData.get('emergencyContactName') || '').trim();
      const province = String(formData.get('province') || '').trim();
      const city = String(formData.get('city') || '').trim();
      const barangay = String(formData.get('barangay') || '').trim();
      const street = String(formData.get('street') || '').trim();
      const address = composeAddress({ street, barangay, city, province });

      // Catch typing mistakes field by field; the first problem is shown at its field.
      const hasEmergency = !!(emergencyContactName || emergencyContactNumber);
      const ok = checkFields(form, [
        ['username', usernameError(username)],
        ['firstName', nameError(firstName, 'First name')],
        ['middleName', nameError(middleName, 'Middle initial', { required: false, min: 1 })],
        ['lastName', nameError(lastName, 'Last name')],
        ['suffix', suffixError(suffix)],
        ['email', completing ? '' : emailError(email)],
        ['phone', phoneError(phone, 'Phone number')],
        ['dateOfBirth', birthDateError(dateOfBirth)],
        ['emergencyContactName', hasEmergency ? nameError(emergencyContactName, 'Emergency contact name', { max: 120 }) : ''],
        ['emergencyContactNumber', hasEmergency ? phoneError(emergencyContactNumber, 'Emergency contact number') : ''],
        ['emergencyContactNumber', samePhone(emergencyContactNumber, phone)
          ? "Your emergency contact should be someone else. This is your own phone number." : ''],
        ['province', province ? '' : 'Please choose your province.'],
        ['city', city ? '' : 'Please choose your city or municipality.'],
        ['barangay', barangay ? '' : 'Please choose your barangay.'],
        ['street', textError(street, 'Street / house no.', { min: 2, max: 200 })],
        ['password', completing ? '' : passwordErrorMessage(password)],
        ['confirmPassword', !completing && password !== confirmPassword ? 'The passwords do not match.' : ''],
        ['password', !completing && username && password.toLowerCase().includes(username.toLowerCase()) ? "Your password shouldn't contain your username." : ''],
      ]);
      if (!ok) return;

      // "juan@gmial.com" → offer "juan@gmail.com", since the confirmation link goes there.
      const suggested = completing ? null : emailSuggestion(email);
      if (suggested && await confirmDialog({ title: `Did you mean ${suggested}?`, message: 'Your confirmation link will be sent to this address.', confirmLabel: `Use ${suggested.split('@')[1]}`, cancelLabel: `Keep ${email.split('@')[1]}` })) {
        email = suggested;
        const emailInput = form.querySelector('[name="email"]');
        if (emailInput) emailInput.value = suggested;
      }

      // Usernames must be unique (checked without logging in).
      const { data: takenBy } = await supabase.rpc('email_for_login', { p_username: username });
      if (takenBy && !(completing && takenBy.toLowerCase() === String(googleUser?.email || '').toLowerCase())) {
        flagField(form, 'username', 'This username is already taken. Please choose another one.');
        return;
      }

      // Google sign-up: save the rest of the profile, then into the dashboard.
      if (completing) {
        let avatarUrl = googleName.avatar || null;
        if (avatarFile) {
          try { avatarUrl = (await uploadAvatar(googleUser.id, avatarFile)) || avatarUrl; }
          catch (avatarError) { console.error('Avatar upload failed:', avatarError); }
        }
        const { error: saveError } = await supabase.rpc('complete_my_profile', {
          p: {
            username,
            first_name: cleanName(firstName),
            middle_name: cleanName(middleName),
            last_name: cleanName(lastName),
            suffix,
            phone_number: normalizePhone(phone),
            date_of_birth: dateOfBirth || null,
            address, province, city_municipality: city, barangay, street,
            emergency_contact_name: cleanName(emergencyContactName),
            emergency_contact_number: emergencyContactNumber ? normalizePhone(emergencyContactNumber) : '',
            avatar_url: avatarUrl,
          },
        });
        if (saveError) {
          if (/username/i.test(saveError.message)) flagField(form, 'username', saveError.message);
          else toast.error("Couldn't save your profile", saveError.message);
          return;
        }
        toast.success('Welcome to Bandang IBAYO!', 'Your profile is all set.');
        navigate(nextPath || '/dashboard', { replace: true });
        return;
      }

      /*
       * The existing project creates the profiles row from auth.users
       * metadata through the on_auth_user_created trigger.
       *
       * We therefore send ALL profile fields through user metadata.
       * The database trigger should copy these fields into public.profiles.
       */
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            first_name: cleanName(firstName),
            middle_name: cleanName(middleName),
            last_name: cleanName(lastName),
            suffix,
            phone_number: normalizePhone(phone),
            date_of_birth: dateOfBirth || null,
            address,
            province,
            city_municipality: city,
            barangay,
            street,
            emergency_contact_name: cleanName(emergencyContactName),
            emergency_contact_number: emergencyContactNumber ? normalizePhone(emergencyContactNumber) : '',
            terms_accepted: true,
          },
        },
      });

      if (authError) {
        toast.error('Registration failed', authError.message);
        return;
      }

      if (!data.user) {
        toast.error('Registration could not be completed', 'Please try again.');
        return;
      }

      // Supabase answers a sign-up for an email that's already registered with an
      // empty identity list (so it doesn't reveal accounts to strangers).
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        flagField(form, 'email', 'This email is already registered. Please log in, or use "Forgot password?" on the login page.');
        return;
      }

      // Admins get a "New Joiner Registered" notification from the database
      // (notify_admins_new_joiner trigger), even before the new user is logged in.

      /*
       * Profile picture is optional.
       *
       * If Supabase gives the new account an active session immediately,
       * we can upload the selected image now and save avatar_url.
       *
       * If email confirmation is required, there is no authenticated
       * session yet. In that case the account is still created normally
       * and the user can add the optional photo later in Profile Settings.
       */
      if (avatarFile && data.session) {
        try {
          const avatarUrl = await uploadAvatar(data.user.id, avatarFile);

          if (avatarUrl) {
            const { error: avatarUpdateError } = await supabase
              .from('profiles')
              .update({ avatar_url: avatarUrl })
              .eq('id', data.user.id);

            if (avatarUpdateError) {
              console.error('Avatar database update failed:', avatarUpdateError);
              toast.info('Account created, photo not saved', 'You can add your profile picture later in Profile Settings.');
            }
          }
        } catch (avatarError) {
          console.error('Avatar upload failed:', avatarError);
          toast.info('Account created, photo not uploaded', 'You can add your profile picture later in Profile Settings.');
        }
      }

      setIsSuccess(true);

      if (data.session) {
        setNeedsEmailConfirmation(false);

        setTimeout(() => {
          navigate(loginPath);
        }, 2000);
      } else {
        setNeedsEmailConfirmation(true);
      }
    } catch (err) {
      console.error('Registration error:', err);
      toast.error('Registration failed', err?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 10,
    border: '1.5px solid rgba(180,81,30,0.2)',
    background: '#FDF6EE',
    fontSize: 14,
    color: '#1A0A00',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: '#7A3A18',
    marginBottom: 6,
    opacity: 0.9,
  };

  const fieldIconStyle = {
    position: 'absolute',
    left: 13,
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#A8481A',
    opacity: 0.65,
    pointerEvents: 'none',
  };

  const inputWithIconStyle = {
    ...inputStyle,
    paddingLeft: 42,
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FDF6EE',
        fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
        color: '#1A0A00',
        padding: '3rem 1rem',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* SUCCESS OVERLAY */}
      {isSuccess && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(26,10,0,0.88)',
            backdropFilter: 'blur(10px)',
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#FDF6EE',
              padding: '3.5rem',
              borderRadius: 40,
              boxShadow: '0 32px 80px rgba(26,10,0,0.45)',
              textAlign: 'center',
              borderTop: '8px solid #B4511E',
              maxWidth: 420,
              width: '100%',
            }}
          >
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                background: '#B4511E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 28px',
                boxShadow: '0 12px 32px rgba(180,81,30,0.45)',
                color: '#FDF6EE',
              }}
            >
              <CheckCircle2 size={44} strokeWidth={2.5} />
            </div>

            <h3
              style={{
                fontWeight: 900,
                fontSize: 26,
                letterSpacing: '-0.03em',
                color: '#1A0A00',
                textTransform: 'uppercase',
                margin: '0 0 10px',
              }}
            >
              {needsEmailConfirmation
                ? 'Almost There!'
                : 'Registration Successful!'}
            </h3>

            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#7A3A18',
                opacity: 0.9,
              }}
            >
              {needsEmailConfirmation
                ? 'Check your email to confirm your account'
                : 'Welcome to the Bandang IBAYO Tribe'}
            </p>

            {needsEmailConfirmation ? (
              <button
                onClick={() => navigate(loginPath)}
                style={{
                  marginTop: 24,
                  background: '#1A0A00',
                  color: '#E8A265',
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 24px',
                  fontWeight: 900,
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Go to Login
              </button>
            ) : (
              <div
                style={{
                  marginTop: 28,
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {[0, 0.15, 0.3].map((delay, i) => (
                  <div
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#B4511E',
                      animation: `bounce 0.9s ${delay}s infinite`,
                    }}
                  />
                ))}
              </div>
            )}

            <style>{`
              @keyframes bounce {
                0%,100% { transform: translateY(0); }
                50% { transform: translateY(-8px); }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* MAIN CARD */}
      <div
        style={{
          position: 'relative',
          background: '#FDF6EE',
          padding: '2.5rem',
          borderRadius: 24,
          boxShadow: '0 20px 60px rgba(26,10,0,0.14)',
          width: '100%',
          maxWidth: 760,
          borderTop: '7px solid #B4511E',
        }}
      >
        {/* CLOSE */}
        <Link
          to="/"
          aria-label="Close and go to the home page"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 44,
            height: 44,
            justifyContent: 'center',
            borderRadius: 12,
            color: 'rgba(122,58,24,0.85)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={22} />
        </Link>

        {/* HEADER */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 14,
            }}
          >
            <img
              src={logoIcon}
              alt="BANDANG IBAYO"
              style={{
                width: 78,
                height: 78,
                objectFit: 'contain',
              }}
            />
          </div>

          <h1
            style={{
              fontWeight: 900,
              fontSize: 28,
              letterSpacing: '-0.03em',
              color: '#1A0A00',
              margin: '0 0 8px',
            }}
          >
            {completing ? 'Almost there!' : 'Join the Adventure'}
          </h1>

          <p
            style={{
              fontSize: 14,
              color: '#7A3A18',
              opacity: 0.9,
              margin: 0,
              fontWeight: 500,
            }}
          >
            {completing
              ? `Signed in with Google${googleUser?.email ? ` as ${googleUser.email}` : ''}. Finish your traveler profile to start booking.`
              : 'Create your traveler profile for Bandang Ibayo.'}
          </p>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: '6px 0 0' }}>
            Fields marked <RequiredMark /> are required.
          </p>
        </div>

        {completing && !googleUser ? (
          <div role="status" style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0', color: '#A8481A' }}>
            <Loader2 size={26} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
        <form
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
          onSubmit={handleRegister}
        >
          {/* OPTIONAL PROFILE PICTURE */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              padding: 18,
              background: 'rgba(242,228,208,0.55)',
              border: '1px solid rgba(180,81,30,0.15)',
              borderRadius: 16,
            }}
          >
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                overflow: 'hidden',
                flexShrink: 0,
                background: '#1A0A00',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid rgba(180,81,30,0.2)',
                boxShadow: '0 8px 20px rgba(26,10,0,0.12)',
              }}
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Profile preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <UserRound size={30} color="#E8A265" />
              )}
            </div>

            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Profile Picture</label>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <label
                  htmlFor="register-avatar"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    background: '#1A0A00',
                    color: '#E8A265',
                    padding: '10px 14px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontWeight: 900,
                    fontSize: 11.5,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  <Camera size={14} />
                  {avatarPreview ? 'Change Photo' : 'Choose Photo'}
                </label>

                <input
                  id="register-avatar"
                  name="avatar"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleAvatarChange}
                  style={{ display: 'none' }}
                />

                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(180,81,30,0.25)',
                      color: '#7A3A18',
                      padding: '9px 13px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontWeight: 800,
                      fontSize: 11.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>

              <p
                style={{
                  fontSize: 11,
                  color: '#7A3A18',
                  opacity: 0.9,
                  margin: '8px 0 0',
                }}
              >
                JPG, PNG, or WebP
              </p>
            </div>
          </div>

          {/* USERNAME */}
          <div>
            <label style={labelStyle}>Username <RequiredMark /></label>
            <input
              name="username"
              type="text"
              placeholder="traveler_2026"
              style={inputStyle}
              required
            />
          </div>

          {/* NAME ROW */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 14,
            }}
          >
            <div>
              <label style={labelStyle}>First Name <RequiredMark /></label>
              <input
                name="firstName"
                defaultValue={completing ? googleName.first : undefined}
                data-allow="name"
                type="text"
                placeholder="Juan"
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label style={labelStyle}>Middle Initial</label>
              <input
                name="middleName"
                data-allow="name"
                type="text"
                placeholder="D."
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Last Name <RequiredMark /></label>
              <input
                name="lastName"
                defaultValue={completing ? googleName.last : undefined}
                data-allow="name"
                type="text"
                placeholder="Dela Cruz"
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label style={labelStyle}>Suffix</label>
              <input
                name="suffix"
                data-allow="name"
                type="text"
                placeholder="Jr."
                style={inputStyle}
              />
            </div>
          </div>

          {/* EMAIL + PHONE */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Email Address <RequiredMark /></label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={fieldIconStyle} />
                <input
                  name="email"
                  type="email"
                  placeholder="juan@email.com"
                  style={completing ? { ...inputWithIconStyle, background: '#F2E4D0', color: '#7A3A18' } : inputWithIconStyle}
                  {...(completing ? { value: googleUser?.email || '', readOnly: true, 'aria-readonly': true } : {})}
                  required
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Phone Number <RequiredMark /></label>
              <div style={{ position: 'relative' }}>
                <Phone size={16} style={fieldIconStyle} />
                <input
                  name="phone"
                  {...phoneInputProps}
                  style={inputWithIconStyle}
                  required
                />
              </div>
            </div>
          </div>

          {/* DATE OF BIRTH */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Date of Birth</label>
              <div style={{ position: 'relative' }}>
                <CalendarDays size={16} style={fieldIconStyle} />
                <input
                  name="dateOfBirth"
                  type="date"
                  max={todayPH()}
                  style={inputWithIconStyle}
                />
              </div>
            </div>
          </div>

          {/* EMERGENCY CONTACT: name + number */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
            }}
          >
            <div>
              <label style={labelStyle}>
                Emergency Contact Name
              </label>
              <div style={{ position: 'relative' }}>
                <UserRound size={16} style={fieldIconStyle} />
                <input
                  name="emergencyContactName"
                data-allow="name"
                  type="text"
                  placeholder="e.g. Maria Dela Cruz"
                  maxLength={120}
                  autoComplete="off"
                  style={inputWithIconStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>
                Emergency Contact Number
              </label>
              <div style={{ position: 'relative' }}>
                <Phone size={16} style={fieldIconStyle} />
                <input
                  name="emergencyContactNumber"
                  {...phoneInputProps}
                  style={inputWithIconStyle}
                />
              </div>
            </div>
          </div>

          {/* ADDRESS: province → city/municipality → barangay dropdowns + street */}
          <AddressFields markRequired
            labelStyle={labelStyle}
            selectStyle={{ ...inputStyle, cursor: 'pointer' }}
            inputStyle={inputStyle}
            required
          />

          {/* PASSWORD ROW (Google accounts sign in with Google, no password) */}
          {!completing && <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Password <RequiredMark /></label>
              <PasswordField
                name="password"
                placeholder="••••••••"
                style={inputStyle}
                minLength={8}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoComplete="new-password"
                required
              />
              <PasswordChecklist password={passwordInput} />
            </div>

            <div>
              <label style={labelStyle}>Confirm Password <RequiredMark /></label>
              <PasswordField
                name="confirmPassword"
                placeholder="••••••••"
                style={inputStyle}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
          </div>}

          <div
            style={{
              borderTop: '1px solid rgba(180,81,30,0.15)',
              marginTop: 4,
            }}
          />

          {/* TERMS */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => {
                  setAgreedToTerms(e.target.checked);
                  if (e.target.checked) setTermsError(false);
                }}
                style={{
                  marginTop: 2,
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  accentColor: '#B4511E',
                  cursor: 'pointer',
                }}
              />

              <span
                style={{
                  fontSize: 12.5,
                  color: '#7A3A18',
                  lineHeight: 1.6,
                  fontWeight: 500,
                }}
              >
                I have read and agree to the{' '}
                <button
                  type="button"
                  className="no-touch-size"
                  onClick={() => setShowTerms(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#A8481A',
                    fontWeight: 800,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: 'inherit',
                    fontFamily: 'inherit',
                  }}
                >
                  Terms &amp; Conditions and Medical Disclaimer
                </button>
                , including the non-refundable payment and cancellation
                policy.
              </span>
            </label>

            {termsError && (
              <p
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#dc2626',
                  margin: '8px 0 0 26px',
                }}
              >
                <AlertTriangle size={13} />
                Please review and accept the Terms &amp; Conditions to
                continue.
              </p>
            )}
          </div>

          {/* SUBMIT */}
          <button
            disabled={loading}
            type="submit"
            style={{
              width: '100%',
              background: loading
                ? '#A8481A'
                : '#A8481A',
              color: '#FDF6EE',
              fontWeight: 900,
              fontSize: 13,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '16px',
              borderRadius: 12,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading
                ? 'none'
                : '0 8px 24px rgba(168,72,26,0.38)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontFamily: 'inherit',
            }}
          >
            {loading ? (
              <>
                <Loader2
                  size={18}
                  style={{
                    animation: 'spin 1s linear infinite',
                  }}
                />
                {completing ? 'Saving...' : 'Creating Account...'}
              </>
            ) : (
              completing ? 'Save and Continue' : 'Create Account'
            )}
          </button>

          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </form>
        )}

        {/* FOOTER */}
        <p
          style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            fontSize: 13,
            color: '#7A3A18',
            opacity: 0.9,
          }}
        >
          {completing ? 'Not you?' : 'Already have an account?'}{' '}
          <Link className="text-link"
            to={loginPath}
            onClick={completing ? () => supabase.auth.signOut() : undefined}
            style={{
              color: '#A8481A',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            {completing ? 'Sign out and use another account' : 'Login here'}
          </Link>
        </p>
      </div>

      {/* TERMS MODAL */}
      {showTerms && (
        <TermsModal
          onClose={() => setShowTerms(false)}
          onAgree={() => {
            setAgreedToTerms(true);
            setTermsError(false);
            setShowTerms(false);
          }}
        />
      )}
    </div>
  );
};

export default JoinerRegister;