import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Loader2,
  CheckCircle2,
  X,
  ShieldCheck,
  AlertTriangle,
  Camera,
  UserRound,
  Phone,
  CalendarDays,
  MapPin,
  Mail,
} from 'lucide-react';
import { supabase } from './supabaseClient';
import logoIcon from './assets/newIcon.png';

const JoinerRegister = () => {
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

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Profile picture must be 5 MB or smaller.');
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const uploadAvatar = async (userId, file) => {
    if (!file) return null;

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

    if (!agreedToTerms) {
      setTermsError(true);
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);

      const email = String(formData.get('email') || '').trim();
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
      const address = String(formData.get('address') || '').trim();

      if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
      }

      if (password.length < 6) {
        alert('Password must be at least 6 characters long.');
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
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            suffix,
            phone_number: phone,
            date_of_birth: dateOfBirth || null,
            address,
            emergency_contact_number: emergencyContactNumber,
            terms_accepted: true,
          },
        },
      });

      if (authError) {
        alert('Registration failed: ' + authError.message);
        return;
      }

      if (!data.user) {
        alert('Registration could not be completed. Please try again.');
        return;
      }

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
              alert(
                'Your account was created, but the profile picture could not be saved. You can add it later in Profile Settings.'
              );
            }
          }
        } catch (avatarError) {
          console.error('Avatar upload failed:', avatarError);
          alert(
            'Your account was created, but the profile picture could not be uploaded. You can add it later in Profile Settings.'
          );
        }
      }

      setIsSuccess(true);

      if (data.session) {
        setNeedsEmailConfirmation(false);

        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setNeedsEmailConfirmation(true);
      }
    } catch (err) {
      console.error('Registration error:', err);
      alert('Registration failed: ' + (err?.message || 'Unknown error.'));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 10,
    border: '1.5px solid rgba(196,92,38,0.2)',
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
    opacity: 0.85,
  };

  const fieldIconStyle = {
    position: 'absolute',
    left: 13,
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#C45C26',
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
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F2E4D0',
        fontFamily: "'Inter', system-ui, sans-serif",
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
              borderTop: '8px solid #C45C26',
              maxWidth: 420,
              width: '100%',
            }}
          >
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                background: '#C45C26',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 28px',
                boxShadow: '0 12px 32px rgba(196,92,38,0.45)',
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
                opacity: 0.65,
              }}
            >
              {needsEmailConfirmation
                ? 'Check your email to confirm your account'
                : 'Welcome to the Bandang IBAYO Tribe'}
            </p>

            {needsEmailConfirmation ? (
              <button
                onClick={() => navigate('/login')}
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
                      background: '#C45C26',
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
          borderTop: '7px solid #C45C26',
        }}
      >
        {/* CLOSE */}
        <Link
          to="/"
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            color: 'rgba(122,58,24,0.45)',
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
            Join the Adventure
          </h1>

          <p
            style={{
              fontSize: 14,
              color: '#7A3A18',
              opacity: 0.75,
              margin: 0,
              fontWeight: 500,
            }}
          >
            Create your traveler profile for Bandang Ibayo.
          </p>
        </div>

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
              border: '1px solid rgba(196,92,38,0.15)',
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
                border: '2px solid rgba(196,92,38,0.2)',
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
                    fontSize: 10,
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
                      border: '1px solid rgba(196,92,38,0.25)',
                      color: '#7A3A18',
                      padding: '9px 13px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontWeight: 800,
                      fontSize: 10,
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
                  opacity: 0.65,
                  margin: '8px 0 0',
                }}
              >
                Optional • JPG, PNG, or WebP • Maximum 5 MB
              </p>
            </div>
          </div>

          {/* USERNAME */}
          <div>
            <label style={labelStyle}>Username</label>
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
              <label style={labelStyle}>First Name</label>
              <input
                name="firstName"
                type="text"
                placeholder="Juan"
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label style={labelStyle}>Middle Name</label>
              <input
                name="middleName"
                type="text"
                placeholder="D."
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                name="lastName"
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
              <label style={labelStyle}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={fieldIconStyle} />
                <input
                  name="email"
                  type="email"
                  placeholder="juan@email.com"
                  style={inputWithIconStyle}
                  required
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Phone Number</label>
              <div style={{ position: 'relative' }}>
                <Phone size={16} style={fieldIconStyle} />
                <input
                  name="phone"
                  type="tel"
                  placeholder="0912 345 6789"
                  style={inputWithIconStyle}
                  required
                />
              </div>
            </div>
          </div>

          {/* DATE OF BIRTH + EMERGENCY CONTACT */}
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
                  type="tel"
                  placeholder="+63 917 123 4567"
                  style={inputWithIconStyle}
                />
              </div>
            </div>
          </div>

          {/* ADDRESS */}
          <div>
            <label style={labelStyle}>Address</label>
            <div style={{ position: 'relative' }}>
              <MapPin size={16} style={fieldIconStyle} />
              <input
                name="address"
                type="text"
                placeholder="City, Province"
                style={inputWithIconStyle}
              />
            </div>
          </div>

          {/* PASSWORD ROW */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Password</label>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                style={inputStyle}
                minLength={6}
                required
              />
            </div>

            <div>
              <label style={labelStyle}>Confirm Password</label>
              <input
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                style={inputStyle}
                minLength={6}
                required
              />
            </div>
          </div>

          <div
            style={{
              borderTop: '1px solid rgba(196,92,38,0.15)',
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
                  accentColor: '#C45C26',
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
                  onClick={() => setShowTerms(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#C45C26',
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
                ? 'rgba(196,92,38,0.55)'
                : '#C45C26',
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
                : '0 8px 24px rgba(196,92,38,0.38)',
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
                Creating Account...
              </>
            ) : (
              'Create Account'
            )}
          </button>

          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </form>

        {/* FOOTER */}
        <p
          style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            fontSize: 13,
            color: '#7A3A18',
            opacity: 0.8,
          }}
        >
          Already have an account?{' '}
          <Link
            to="/login"
            style={{
              color: '#C45C26',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            Login here
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

/* TERMS & CONDITIONS MODAL */
const TermsModal = ({ onClose, onAgree }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 300,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(26,10,0,0.88)',
      backdropFilter: 'blur(6px)',
      padding: 16,
    }}
  >
    <div
      style={{
        position: 'relative',
        background: '#FDF6EE',
        width: '100%',
        maxWidth: 620,
        maxHeight: '85vh',
        borderRadius: 24,
        boxShadow: '0 32px 80px rgba(26,10,0,0.45)',
        borderTop: '7px solid #C45C26',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          background: '#1A0A00',
          padding: '1.75rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: '#C45C26',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={19} color="#FDF6EE" />
          </div>

          <div>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 900,
                letterSpacing: '0.02em',
                color: '#FDF6EE',
                margin: 0,
              }}
            >
              Terms &amp; Conditions
            </h3>

            <p
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(232,162,101,0.7)',
                margin: '3px 0 0',
              }}
            >
              Bandang IBAYO Joiner Agreement
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(232,210,190,0.5)',
          }}
        >
          <X size={22} />
        </button>
      </div>

      <div
        style={{
          padding: '1.75rem 2rem',
          overflowY: 'auto',
          flex: 1,
        }}
      >
        <TermsSection title="1. Booking & Payment">
          All bookings are confirmed only after payment is received via
          GCash, either in full or as a 40% downpayment. Every joiner is
          charged the full listed tour price regardless of age or status —
          the platform does not offer PWD or senior citizen discounts.
        </TermsSection>

        <TermsSection title="2. Non-Refundable & Cancellation Policy">
          All payments made through the platform are strictly
          non-refundable. Cancellations are not accepted within two (2)
          weeks of the scheduled tour date. This policy protects the
          agency from the financial losses caused by last-minute
          withdrawals, since the cost of shared transport and
          accommodations depends on a fixed number of confirmed
          passengers.
        </TermsSection>

        <TermsSection title="3. Medical Disclaimer">
          Joiner tours may involve physical activity, travel to remote
          areas, and varying difficulty levels. By booking, you confirm
          that you are physically fit to participate and that you have
          disclosed any relevant medical conditions, allergies, or
          limitations to the organizer prior to the trip. Bandang IBAYO
          and its partner organizers are not liable for pre-existing
          health conditions not disclosed at the time of booking.
        </TermsSection>

        <TermsSection title="4. Tracking & Vehicle Information">
          Estimated Time of Arrival (ETA), driver details, and vehicle
          plate numbers shown on the platform are provided for
          transparency and safety. ETA information is an estimate only
          and does not reflect real-time GPS tracking.
        </TermsSection>

        <TermsSection title="5. Account & Data Privacy">
          Your account information, including your contact details and
          payment records, is stored securely and protected through
          role-based access controls. Information you provide is used
          solely to process your bookings, verify payments, and send
          tour-related reminders and updates.
        </TermsSection>

        <TermsSection title="6. Conduct & Reviews">
          Joiners are expected to conduct themselves respectfully toward
          organizers, drivers, and fellow travelers. Reviews and comments
          posted on tours should reflect genuine experiences and may be
          moderated by the agency to maintain a trustworthy platform for
          future joiners.
        </TermsSection>

        <div
          style={{
            background: 'rgba(196,92,38,0.08)',
            border: '1px solid rgba(196,92,38,0.18)',
            borderRadius: 16,
            padding: '1rem 1.25rem',
            marginTop: 8,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle
            size={16}
            style={{
              color: '#C45C26',
              flexShrink: 0,
              marginTop: 1,
            }}
          />

          <p
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: '#7A3A18',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            By creating an account, you acknowledge that you have read,
            understood, and agree to be bound by these Terms &amp;
            Conditions and the Medical Disclaimer above for every tour
            you book through Bandang IBAYO.
          </p>
        </div>
      </div>

      <div
        style={{
          padding: '1.25rem 2rem',
          borderTop: '1px solid rgba(196,92,38,0.15)',
          display: 'flex',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: '13px 0',
            background: '#F2E4D0',
            border: '1px solid rgba(196,92,38,0.18)',
            borderRadius: 999,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 900,
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#7A3A18',
          }}
        >
          Close
        </button>

        <button
          onClick={onAgree}
          style={{
            flex: 1.4,
            padding: '13px 0',
            background: '#C45C26',
            border: 'none',
            borderRadius: 999,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 900,
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#FDF6EE',
            boxShadow: '0 6px 20px rgba(196,92,38,0.35)',
          }}
        >
          I Agree to the Terms
        </button>
      </div>
    </div>
  </div>
);

const TermsSection = ({ title, children }) => (
  <div style={{ marginBottom: 22 }}>
    <h4
      style={{
        fontSize: 10.5,
        fontWeight: 900,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#C45C26',
        margin: '0 0 8px',
      }}
    >
      {title}
    </h4>

    <p
      style={{
        fontSize: 12.5,
        fontWeight: 500,
        color: '#7A3A18',
        lineHeight: 1.7,
        margin: 0,
      }}
    >
      {children}
    </p>
  </div>
);

export default JoinerRegister;
