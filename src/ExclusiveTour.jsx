import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { notifyAdmins } from "./notifications";
import {
  MapPin, Users, Calendar, ChevronRight, ChevronDown, CheckCircle, CheckCircle2,
  FileText, Send, Shield, Star, Clock, ArrowRight, XCircle, MessageSquare,
  Phone, Globe, Loader2
} from 'lucide-react';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light card bg)
// #2D1B0E  deep brown (dark card)
// #7A3A18  rust mid-tone
// #8C2F1C  deep rust red (error / alert)
// #F2E4D0  parchment (inset panel / input bg)
// #EDEAE3  warm stone (page bg)
// #3F5D62  slate teal (secondary contrast accent)
// ---------------------------------------------------------
 
// ─── Shared helpers ────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 16px',
  borderRadius: 14,
  border: '1px solid rgba(196,92,38,0.18)',
  background: '#F2E4D0',
  fontSize: 13,
  fontWeight: 600,
  color: '#1A0A00',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'all 0.2s',
};

const labelStyle = {
  fontSize: 10,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  color: '#1A0A00',
  marginBottom: 6,
  display: 'block',
};

const InputField = ({ label, type = 'text', placeholder, value, onChange, required }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <label style={labelStyle}>
      {label} {required && <span style={{ color: '#C45C26' }}>*</span>}
    </label>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      style={inputStyle}
      onFocus={e => {
        e.currentTarget.style.borderColor = '#C45C26';
        e.currentTarget.style.background = '#FDF6EE';
      }}
      onBlur={e => {
        e.currentTarget.style.borderColor = 'rgba(196,92,38,0.18)';
        e.currentTarget.style.background = '#F2E4D0';
      }}
    />
  </div>
);
 
const TextAreaField = ({ label, placeholder, value, onChange, required, rows = 4 }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <label style={labelStyle}>
      {label} {required && <span style={{ color: '#C45C26' }}>*</span>}
    </label>
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      rows={rows}
      style={{ ...inputStyle, resize: 'none' }}
      onFocus={e => {
        e.currentTarget.style.borderColor = '#C45C26';
        e.currentTarget.style.background = '#FDF6EE';
      }}
      onBlur={e => {
        e.currentTarget.style.borderColor = 'rgba(196,92,38,0.18)';
        e.currentTarget.style.background = '#F2E4D0';
      }}
    />
  </div>
);
 
const SelectField = ({ label, value, onChange, options, required }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <label style={labelStyle}>
      {label} {required && <span style={{ color: '#C45C26' }}>*</span>}
    </label>
    <select
      value={value}
      onChange={onChange}
      required={required}
      style={{ ...inputStyle, cursor: 'pointer' }}
      onFocus={e => {
        e.currentTarget.style.borderColor = '#C45C26';
        e.currentTarget.style.background = '#FDF6EE';
      }}
      onBlur={e => {
        e.currentTarget.style.borderColor = 'rgba(196,92,38,0.18)';
        e.currentTarget.style.background = '#F2E4D0';
      }}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// ─── Prefill helper ─────────────────────────────────────────────────────────────
const usePrefilledContact = () => {
  const [contact, setContact] = useState({ fullName: '', contact: '', email: '' });
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone_number, email')
        .eq('id', user.id)
        .single();
      const fullName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '';
      setContact({
        fullName,
        contact: profile?.phone_number || '',
        email: profile?.email || user.email || '',
      });
    })();
  }, []);
  return contact;
};
 
// ─── Success Screen ─────────────────────────────────────────────────────────────
const SuccessScreen = ({ type, onReset }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '6rem 1.5rem', textAlign: 'center', gap: 24,
  }}>
    <div style={{
      width: 80, height: 80, background: 'rgba(196,92,38,0.12)', borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C45C26',
    }}>
      <CheckCircle size={44} />
    </div>
    <div>
      <h3 style={{ fontSize: 24, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '-0.01em', margin: 0 }}>
        {type === 'exclusive' ? 'Exclusive Booking Submitted!' : 'Tour Request Sent!'}
      </h3>
      <p style={{ fontSize: 13, fontWeight: 500, color: '#7A3A18', opacity: 0.85, marginTop: 8, maxWidth: 420, lineHeight: 1.6 }}>
        {type === 'exclusive'
          ? "Our team will review your exclusive booking and reach out within 24 hours to confirm your itinerary and pricing. You'll also get a notification here once it's reviewed."
          : "Your destination request has been forwarded to the Bandang IBAYO team. You'll get a notification here once they've reviewed it."}
      </p>
    </div>
    <button
      onClick={onReset}
      style={{
        padding: '12px 28px', background: '#1A0A00', color: '#FDF6EE',
        borderRadius: 14, border: 'none', fontSize: 11, fontWeight: 900,
        textTransform: 'uppercase', letterSpacing: '0.15em', cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#C45C26';
        e.currentTarget.style.color = '#FDF6EE';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = '#1A0A00';
        e.currentTarget.style.color = '#FDF6EE';
      }}
    >
      Submit Another
    </button>
  </div>
);
 
// ─── EXCLUSIVE TOUR FORM ────────────────────────────────────────────────────────
const ExclusiveTourForm = () => {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const prefill = usePrefilledContact();
  const [form, setForm] = useState({
    fullName: '', contact: '', email: '',
    destination: '', groupSize: '', preferredDate: '', alternateDate: '',
    accommodation: '', budget: '', notes: '', agreeTerms: false,
  });

  useEffect(() => {
    setForm(prev => ({
      ...prev,
      fullName: prev.fullName || prefill.fullName,
      contact: prev.contact || prefill.contact,
      email: prev.email || prefill.email,
    }));
  }, [prefill.fullName, prefill.contact, prefill.email]);
 
  const set = (field) => (e) =>
    setForm(prev => ({ ...prev, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.agreeTerms) { alert('Please accept the terms and conditions.'); return; }
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please log in to submit an exclusive booking request.');
      setLoading(false);
      return;
    }

    const { data: inserted, error } = await supabase.from('exclusive_requests').insert([{
      user_id: user.id,
      request_type: 'exclusive',
      full_name: form.fullName,
      contact_number: form.contact,
      email: form.email,
      destination: form.destination,
      group_size: parseInt(form.groupSize) || null,
      preferred_date: form.preferredDate || null,
      alternate_date: form.alternateDate || null,
      accommodation: form.accommodation,
      budget: parseFloat(form.budget) || null,
      notes: form.notes,
    }]).select();

    if (error) {
      alert('Error submitting your request: ' + error.message);
      setLoading(false);
      return;
    }

    notifyAdmins({
      title: 'New Exclusive Tour Request',
      message: `${form.fullName || 'A joiner'} submitted an exclusive tour request for ${form.destination} (${form.groupSize || '?'} pax).`,
      type: 'exclusive_request',
      related_id: inserted?.[0]?.id || null,
    });

    setLoading(false);
    setSubmitted(true);
  };
 
  if (submitted) return <SuccessScreen type="exclusive" onReset={() => setSubmitted(false)} />;
 
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Info Banner */}
      <div style={{
        background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.15)',
        borderRadius: 18, padding: '1.25rem 1.5rem', display: 'flex', gap: 14, alignItems: 'flex-start',
      }}>
        <Shield size={20} style={{ color: '#C45C26', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: 11, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Private Group Booking
          </p>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#7A3A18', opacity: 0.85, marginTop: 4, lineHeight: 1.6, margin: '4px 0 0' }}>
            Exclusive tours reserve the entire vehicle and itinerary just for your group. No other joiners. 
            The agency handles all coordination — accommodation, van, guide. You pay all-in.
          </p>
        </div>
      </div>
 
      {/* Personal Info */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 10, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <span style={{ width: 20, height: 20, background: '#C45C26', borderRadius: '50%', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>1</span>
          Contact Information
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <InputField label="Full Name" placeholder="Juan Dela Cruz" value={form.fullName} onChange={set('fullName')} required />
          <InputField label="Contact Number" type="tel" placeholder="09XXXXXXXXX" value={form.contact} onChange={set('contact')} required />
          <InputField label="Email Address" type="email" placeholder="juan@email.com" value={form.email} onChange={set('email')} required />
        </div>
      </section>
 
      {/* Trip Details */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 10, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <span style={{ width: 20, height: 20, background: '#C45C26', borderRadius: '50%', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>2</span>
          Trip Details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <InputField label="Destination" placeholder="e.g. Mt. Pulag, Sagada, Batanes" value={form.destination} onChange={set('destination')} required />
          <InputField label="Number of Participants" type="number" placeholder="e.g. 10" value={form.groupSize} onChange={set('groupSize')} required />
          <InputField label="Preferred Date" type="date" value={form.preferredDate} onChange={set('preferredDate')} required />
          <InputField label="Alternate Date (optional)" type="date" value={form.alternateDate} onChange={set('alternateDate')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <SelectField
            label="Accommodation Preference"
            value={form.accommodation}
            onChange={set('accommodation')}
            required
            options={[
              { value: '', label: 'Select preference…' },
              { value: 'non-ac', label: 'Non-AC Room' },
              { value: 'ac', label: 'AC Room' },
              { value: 'with-cr', label: 'With Private CR' },
              { value: 'with-all', label: 'With All Amenities' },
              { value: 'none', label: 'No accommodation needed' },
            ]}
          />
          <InputField
            label="Budget for Exclusive Tour"
            type="number"
            placeholder="e.g. 50000"
            value={form.budget}
            onChange={set('budget')}
            required
          />
        </div>
        <TextAreaField
          label="Special Notes / Requests"
          placeholder="Tell us more — specific spots you want to visit, activities, accommodation preferences, etc."
          value={form.notes}
          onChange={set('notes')}
        />
      </section>
 
      {/* Policy Reminder */}
      <div style={{
        background: 'rgba(196,92,38,0.08)', border: '1px solid rgba(196,92,38,0.22)',
        borderRadius: 18, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <p style={{ fontSize: 10, fontWeight: 900, color: '#C45C26', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>
          Policy Reminder
        </p>
        <ul style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>A <strong>downpayment via GCash</strong> is required to confirm the booking.</li>          
          <li>Bookings are <strong>non-refundable</strong>. Cancellations are not allowed.</li>
          <li>All prices are all-in (van, accommodation, coordination). Entrance/environmental fees are separate.</li>
          <li>An email and notification will be sent to confirm your exclusive booking.</li>
        </ul>
      </div>
 
      {/* Terms */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={form.agreeTerms}
          onChange={set('agreeTerms')}
          style={{ marginTop: 3, accentColor: '#C45C26', width: 16, height: 16 }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.85, lineHeight: 1.6 }}>
          I have read and agree to the <span style={{ color: '#1A0A00', fontWeight: 900, textDecoration: 'underline' }}>Terms & Conditions</span> and understand the 
          non-refundable payment policy. I also acknowledge the medical disclaimer applicable to overland travel.
        </span>
      </label>
 
      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%', padding: '16px 0', background: '#1A0A00', color: '#FDF6EE',
          borderRadius: 16, border: 'none', fontWeight: 900, fontSize: 11,
          letterSpacing: '0.18em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 6px 20px rgba(26,10,0,0.15)', transition: 'background 0.2s',
        }}
        onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#C45C26'; }}
        onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#1A0A00'; }}
      >
        {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
        {loading ? 'Submitting…' : 'Submit Exclusive Booking Request'}
      </button>
    </form>
  );
};
 
// ─── REQUEST TOUR FORM ──────────────────────────────────────────────────────────
const RequestTourForm = () => {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const prefill = usePrefilledContact();
  const [form, setForm] = useState({
    fullName: '', contact: '', email: '',
    destination: '', region: '', groupSize: '', preferredDate: '',
    tourType: '', notes: '',
  });

  useEffect(() => {
    setForm(prev => ({
      ...prev,
      fullName: prev.fullName || prefill.fullName,
      contact: prev.contact || prefill.contact,
      email: prev.email || prefill.email,
    }));
  }, [prefill.fullName, prefill.contact, prefill.email]);
 
  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please log in to submit a tour request.');
      setLoading(false);
      return;
    }

    const { data: inserted, error } = await supabase.from('exclusive_requests').insert([{
      user_id: user.id,
      request_type: 'request',
      full_name: form.fullName,
      contact_number: form.contact,
      email: form.email,
      destination: form.destination,
      region: form.region,
      group_size: parseInt(form.groupSize) || null,
      preferred_date: form.preferredDate || null,
      tour_type: form.tourType,
      notes: form.notes,
    }]).select();

    if (error) {
      alert('Error submitting your request: ' + error.message);
      setLoading(false);
      return;
    }

    notifyAdmins({
      title: 'New Tour Request',
      message: `${form.fullName || 'A joiner'} requested a new destination: ${form.destination} (${form.groupSize || '?'} pax).`,
      type: 'exclusive_request',
      related_id: inserted?.[0]?.id || null,
    });

    setLoading(false);
    setSubmitted(true);
  };
 
  if (submitted) return <SuccessScreen type="request" onReset={() => setSubmitted(false)} />;
 
  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Info Banner */}
      <div style={{
        background: 'rgba(196,92,38,0.08)', border: '1px solid rgba(196,92,38,0.22)',
        borderRadius: 18, padding: '1.25rem 1.5rem', display: 'flex', gap: 14, alignItems: 'flex-start',
      }}>
        <Globe size={20} style={{ color: '#C45C26', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: 11, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Suggest a Destination
          </p>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#7A3A18', opacity: 0.85, marginTop: 4, lineHeight: 1.6, margin: '4px 0 0' }}>
            Don't see your dream destination listed? Request it here. The Bandang IBAYO team will review 
            your suggestion, check availability, and send you a <strong>customized price list</strong>. 
            Approved requests may be opened to other joiners.
          </p>
        </div>
      </div>
 
      {/* Personal Info */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 10, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <span style={{ width: 20, height: 20, background: '#C45C26', borderRadius: '50%', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>1</span>
          Your Information
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <InputField label="Full Name" placeholder="Juan Dela Cruz" value={form.fullName} onChange={set('fullName')} required />
          <InputField label="Contact Number" type="tel" placeholder="09XXXXXXXXX" value={form.contact} onChange={set('contact')} required />
          <InputField label="Email Address" type="email" placeholder="juan@email.com" value={form.email} onChange={set('email')} required />
        </div>
      </section>
 
      {/* Destination Details */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 10, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <span style={{ width: 20, height: 20, background: '#C45C26', borderRadius: '50%', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>2</span>
          Destination &amp; Tour Details
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <InputField label="Requested Destination" placeholder="e.g. Sagada, Mountain Province" value={form.destination} onChange={set('destination')} required />
          <InputField label="Region / Province" placeholder="e.g. Cordillera Administrative Region" value={form.region} onChange={set('region')} />
          <InputField label="Estimated Group Size" type="number" placeholder="e.g. 4" value={form.groupSize} onChange={set('groupSize')} required />
          <InputField label="Preferred Tour Date" type="date" value={form.preferredDate} onChange={set('preferredDate')} required />
        </div>
        <SelectField
          label="Tour Type Preference"
          value={form.tourType}
          onChange={set('tourType')}
          required
          options={[
            { value: '', label: 'Select type…' },
            { value: 'joiner', label: 'Open to other joiners (shared cost)' },
            { value: 'exclusive', label: 'Exclusive for my group only' },
          ]}
        />
        <TextAreaField
          label="Additional Details / Preferences"
          placeholder="Tell us more — specific spots you want to visit, activities, accommodation preferences, budget range, etc."
          value={form.notes}
          onChange={set('notes')}
          rows={5}
        />
      </section>
 
      {/* What happens next */}
      <div style={{
        background: '#F2E4D0', border: '1px solid rgba(196,92,38,0.14)',
        borderRadius: 18, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <p style={{ fontSize: 10, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>
          What Happens Next?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['Agency reviews your request', 'Usually within 24–48 hours'],
            ['Custom price list is prepared', 'Based on group size, destination & dates'],
            ['You receive a notification here that the request has been approved or denied', 'If approved, the tour will be open for joiners on the Explore Tours page'],
            ['You may confirm the tour by making a downpayment', 'Via GCash to secure your booking'],
          ].map(([step, desc], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{
                width: 20, height: 20, background: '#1A0A00', color: '#E8A265',
                borderRadius: '50%', fontSize: 9, fontWeight: 900, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
              }}>
                {i + 1}
              </span>
              <div>
                <p style={{ fontSize: 12, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{step}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.7, margin: '2px 0 0' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
 
      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%', padding: '16px 0', background: '#C45C26', color: '#FDF6EE',
          borderRadius: 16, border: 'none', fontWeight: 900, fontSize: 11,
          letterSpacing: '0.18em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 6px 20px rgba(196,92,38,0.25)', transition: 'background 0.2s',
        }}
        onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#1A0A00'; }}
        onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#C45C26'; }}
      >
        {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
        {loading ? 'Sending Request…' : 'Send Tour Request'}
      </button>
    </form>
  );
};
 
// ─── REQUEST STATUS + ADMIN UPDATES (shown to the joiner on this page) ─────────
const STATUS_STYLES = {
  Pending: { bg: 'rgba(232,162,101,0.25)', color: '#9A5B1E' },
  Approved: { bg: 'rgba(196,92,38,0.14)', color: '#C45C26' },
  Rejected: { bg: 'rgba(140,47,28,0.14)', color: '#8C2F1C' },
};

const RequestStatusBadge = ({ status }) => {
  const { bg, color } = STATUS_STYLES[status] || STATUS_STYLES.Pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: bg, color, borderRadius: 999,
      padding: '4px 12px', fontSize: 9, fontWeight: 900,
      letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
};

const formatShortDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const formatFullDateTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// A single labeled block inside the dark "package" panel.
const PackageDetail = ({ label, icon, color = 'rgba(232,210,190,0.5)', textColor = 'rgba(253,246,238,0.9)', children }) => (
  <div>
    <p style={{
      display: 'flex', alignItems: 'center', gap: 5,
      fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
      color, margin: '0 0 4px',
    }}>
      {icon} {label}
    </p>
    <p style={{ fontSize: 12.5, fontWeight: 500, color: textColor, whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>
      {children}
    </p>
  </div>
);

const RequestHistoryCard = ({ request }) => {
  const [expanded, setExpanded] = useState(false);
  const isExclusive = request.request_type === 'exclusive';
  const pkg = request.package_details;
  const hasPackage = !!request.package_sent_at && pkg;

  return (
    <div style={{
      background: '#FDF6EE', borderRadius: 18,
      border: '1px solid rgba(196,92,38,0.12)',
      boxShadow: '0 2px 10px rgba(26,10,0,0.04)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', padding: '1rem 1.25rem',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: isExclusive ? 'rgba(26,10,0,0.06)' : 'rgba(196,92,38,0.12)',
          color: isExclusive ? '#1A0A00' : '#C45C26',
          borderRadius: 999, padding: '4px 12px', fontSize: 9, fontWeight: 900,
          letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0,
        }}>
          {isExclusive ? <Shield size={11} /> : <Globe size={11} />}
          {isExclusive ? 'Exclusive' : 'Request'}
        </span>

        <div style={{ flex: 1, minWidth: 140 }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {request.destination || 'Destination TBD'}
          </p>
          <p style={{ fontSize: 10.5, fontWeight: 700, color: '#7A3A18', opacity: 0.7, margin: '3px 0 0' }}>
            Submitted {formatShortDate(request.created_at)}
          </p>
        </div>

        {hasPackage && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 9, fontWeight: 900, color: '#C45C26',
            letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0,
          }}>
            <FileText size={11} /> Package Ready
          </span>
        )}

        <RequestStatusBadge status={request.status} />

        <ChevronDown
          size={16}
          style={{
            color: 'rgba(122,58,24,0.5)', flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
          }}
        />
      </button>

      {expanded && (
        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Admin's approve/reject note */}
          {request.admin_response ? (
            <div style={{
              background: request.status === 'Rejected' ? 'rgba(140,47,28,0.06)' : '#F2E4D0',
              borderRadius: 14, padding: '12px 16px',
              border: `1px solid ${request.status === 'Rejected' ? 'rgba(140,47,28,0.18)' : 'rgba(196,92,38,0.14)'}`,
            }}>
              <p style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
                color: request.status === 'Rejected' ? '#8C2F1C' : '#C45C26', margin: '0 0 6px',
              }}>
                <MessageSquare size={11} /> Note from Bandang IBAYO
              </p>
              <p style={{ fontSize: 12.5, fontWeight: 500, color: '#1A0A00', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {request.admin_response}
              </p>
              {request.reviewed_at && (
                <p style={{ fontSize: 9.5, fontWeight: 700, color: '#7A3A18', opacity: 0.6, margin: '8px 0 0' }}>
                  Reviewed {formatFullDateTime(request.reviewed_at)}
                </p>
              )}
            </div>
          ) : request.status === 'Pending' && (
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.75, margin: 0 }}>
              Still under review — you'll get a notification once our team responds.
            </p>
          )}

          {/* Full tour package details, once the admin has sent them */}
          {hasPackage && (
            <div style={{
              background: '#1A0A00', borderRadius: 18, padding: '1.25rem 1.5rem',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <p style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: '#E8A265', margin: 0,
                }}>
                  <FileText size={13} /> Tour Package Details
                </p>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(232,210,190,0.5)' }}>
                  Sent {formatFullDateTime(request.package_sent_at)}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 14 }}>
                {pkg.price != null && pkg.price !== '' && (
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(232,210,190,0.5)', margin: '0 0 3px' }}>
                      Price
                    </p>
                    <p style={{ fontSize: 19, fontWeight: 900, color: '#E8A265', margin: 0 }}>
                      ₱{Number(pkg.price).toLocaleString()}
                    </p>
                  </div>
                )}
                {pkg.accommodation && (
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(232,210,190,0.5)', margin: '0 0 3px' }}>
                      Accommodation
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#FDF6EE', margin: 0 }}>{pkg.accommodation}</p>
                  </div>
                )}
              </div>

              {pkg.itinerary && (
                <PackageDetail label="Itinerary" icon={<Calendar size={11} />}>{pkg.itinerary}</PackageDetail>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 14 }}>
                {pkg.inclusions && (
                  <PackageDetail label="Inclusions" icon={<CheckCircle2 size={11} />} color="#C45C26">
                    {pkg.inclusions}
                  </PackageDetail>
                )}
                {pkg.exclusions && (
                  <PackageDetail label="Exclusions" icon={<XCircle size={11} />}>
                    {pkg.exclusions}
                  </PackageDetail>
                )}
              </div>

              {pkg.things_to_bring && (
                <PackageDetail label="Things to Bring" icon={<Star size={11} />}>{pkg.things_to_bring}</PackageDetail>
              )}

              {pkg.additional_notes && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
                  <PackageDetail label="Notes">{pkg.additional_notes}</PackageDetail>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MyRequestsSection = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  const fetchRequests = useCallback(async (uid) => {
    const { data, error } = await supabase
      .from('exclusive_requests')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (!error) setRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      fetchRequests(user.id);
    })();
  }, [fetchRequests]);

  // Live updates — approvals, rejections, and newly-sent package
  // details all appear here immediately without a manual refresh.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`joiner-exclusive-requests-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exclusive_requests', filter: `user_id=eq.${userId}` }, () => fetchRequests(userId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchRequests]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 0', color: 'rgba(122,58,24,0.4)' }}>
        <Loader2 size={18} style={{ marginRight: 10, animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading your requests…</span>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (requests.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.01em', color: '#1A0A00', margin: '0 0 4px' }}>
          Your Submitted Requests
        </h3>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.75, margin: 0 }}>
          Track the status of your exclusive tours and destination requests, plus any updates from our team.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {requests.map(r => <RequestHistoryCard key={r.id} request={r} />)}
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────────
const ExclusiveTour = () => {
  const [activeTab, setActiveTab] = useState('exclusive');
 
  const tabs = [
    {
      id: 'exclusive',
      icon: <Shield size={16} />,
      label: 'Exclusive Tour',
      sub: 'Book a private group trip',
    },
    {
      id: 'request',
      icon: <FileText size={16} />,
      label: 'Request a Tour',
      sub: 'Suggest a new destination',
    },
  ];
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, textAlign: 'left' }}>
      {/* Page Header */}
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.15 }}>
          Exclusive &amp; <span style={{ color: '#C45C26' }}>Requested</span> Tours
        </h2>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', opacity: 0.8, marginTop: 6, margin: '6px 0 0' }}>
          Want privacy, a tailored itinerary, or a destination we don't offer yet? You're in the right place.
        </p>
      </div>
 
      {/* Tab Switcher */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '1.25rem 1.5rem',
                borderRadius: 20, border: active ? '2px solid #1A0A00' : '1px solid rgba(196,92,38,0.15)',
                textAlign: 'left', cursor: 'pointer', transition: 'all 0.25s',
                background: active ? '#1A0A00' : '#FDF6EE',
                color: active ? '#FDF6EE' : '#7A3A18',
                boxShadow: active ? '0 8px 24px rgba(26,10,0,0.18)' : '0 2px 10px rgba(26,10,0,0.04)',
                transform: active ? 'scale(1.01)' : 'scale(1)',
              }}
            >
              <div style={{
                width: 42, height: 42, borderRadius: 12, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: active ? '#C45C26' : '#F2E4D0',
                color: active ? '#FDF6EE' : '#C45C26',
              }}>
                {tab.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 12, fontWeight: 900, textTransform: 'uppercase',
                  letterSpacing: '0.12em', margin: 0, color: active ? '#FDF6EE' : '#1A0A00',
                }}>
                  {tab.label}
                </p>
                <p style={{ fontSize: 10.5, fontWeight: 600, margin: '3px 0 0', opacity: active ? 0.7 : 0.65 }}>
                  {tab.sub}
                </p>
              </div>
              <ChevronRight
                size={16}
                style={{ color: active ? '#E8A265' : 'rgba(196,92,38,0.3)', flexShrink: 0 }}
              />
            </button>
          );
        })}
      </div>
 
      {/* Form Card */}
      <div style={{
        background: '#FDF6EE', borderRadius: 24, padding: '2rem 2.25rem',
        border: '1px solid rgba(196,92,38,0.12)', borderTop: '8px solid #C45C26',
        boxShadow: '0 4px 20px rgba(26,10,0,0.05)',
      }}>
        {activeTab === 'exclusive' ? <ExclusiveTourForm /> : <RequestTourForm />}
      </div>

      {/* Your Submitted Requests — status + admin updates + tour package details */}
      <div style={{ borderTop: '1px solid rgba(196,92,38,0.12)', paddingTop: 28 }}>
        <MyRequestsSection />
      </div>
    </div>
  );
};
 
export default ExclusiveTour;