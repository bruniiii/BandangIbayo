import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { toast } from './ui/toast';
import { notifyAdmins } from "./notifications";
import {
  formatPeso, TRIP_REQUEST_LEAD_DAYS, MAX_TOUR_DAYS,
  requestOverdueReason, requestStatusLabel, requestPaymentLabel, requestEditable,
} from './tourUtils';
import { expenseItems } from './tourExpenses';
import { downloadExclusiveReceipt } from './paymentReceipt';
import { checkFields, flagField, fullNameError, phoneError, emailError, textError, addDaysPH, normalizePhone, formatPhPhone, cleanName } from './validation';
import { moneyField, blockSignKeys } from './moneyInput';
import {
  MapPin, Calendar, ChevronDown, CheckCircle2,
  FileText, Send, Shield, Star, ArrowRight, XCircle, MessageSquare,
  Globe, Loader2, CreditCard, FileDown, PencilLine, X, BedDouble, Users,
} from 'lucide-react';
import { startExclusiveDownpayment, startExclusiveBalance } from './payments';
import { phoneFieldProps } from './ui/phoneField';
import { SkeletonRows } from './ui/Skeleton';
import TermsModal from './ui/TermsModal';
import DateRangePicker from './ui/DateRangePicker';
import ItineraryTimeline from './ui/ItineraryTimeline';
import { AccommodationSelect } from './ui/Accommodation';
import { cleanAccommodation } from './accommodation';
import { confirmDialog } from './ui/ConfirmDialog';
import { tripDays, daysLabel, formatYmdRange } from './dateRange';

// ─────────────────────────────────────────────
// EXCLUSIVE TOURS and REQUEST A TOUR (joiner): two pages in the sidebar, the
// same component with type="exclusive" or type="request".
//  - "Your Submitted Requests" (at the top) lists that type's requests, with
//    their status, the agency's tour package and payment.
//  - A request can be edited until the agency approves it.
//  - The same destination can't be requested twice while a request for it is
//    still open.
// ─────────────────────────────────────────────

// The most a joiner can enter as their exclusive tour budget.
const MAX_EXCLUSIVE_BUDGET = 100000;
// Share of the package price paid up front to confirm an exclusive tour
// (the payments function uses the same rate).
const EXCLUSIVE_DOWNPAYMENT_RATE = 0.5;
// Exclusive tours: the most people a group can have.
const MAX_GROUP = 100;

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light card bg)
// #7A3A18  rust mid-tone
// #8C2F1C  deep rust red (error / alert)
// #F2E4D0  parchment (inset panel / input bg)
// ---------------------------------------------------------

// ─── Shared helpers ────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 16px',
  borderRadius: 14,
  border: '1px solid rgba(180,81,30,0.18)',
  background: '#F2E4D0',
  fontSize: 13,
  fontWeight: 600,
  color: '#1A0A00',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'all 0.2s',
};

const labelStyle = {
  fontSize: 11.5,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  color: '#1A0A00',
  marginBottom: 6,
  display: 'block',
};

// Requests need time to plan: the earliest trip date is 3 weeks from today.
const earliestTripDate = () => addDaysPH(TRIP_REQUEST_LEAD_DAYS);

const sameName = (a, b) => cleanName(a || '').toLowerCase() === cleanName(b || '').toLowerCase();

// Typing mistakes shared by both request forms: wrong phone format, past
// dates, trips longer than a week, an impossible group size. Exclusive tours
// also check each person's name and number.
const checkRequestFields = (formEl, form, type) => {
  const size = Number(form.groupSize);
  const days = tripDays(form.preferredDate, form.preferredEndDate);
  const people = type === 'exclusive' ? form.participants : [];
  return checkFields(formEl, [
    ['fullName', fullNameError(form.fullName, 'Full name')],
    ['contact', phoneError(form.contact, 'Contact number')],
    ['email', emailError(form.email)],
    ['destination', textError(form.destination, 'Destination', { min: 2, max: 150 })],
    ['groupSize', !Number.isInteger(size) || size < 1 ? 'Group size must be a whole number, at least 1.' : size > MAX_GROUP ? `For groups over ${MAX_GROUP}, please contact us directly.` : ''],
    ['preferredDate', !form.preferredDate ? 'Please choose your trip dates.' : form.preferredDate < earliestTripDate() ? 'Trips can be booked from 3 weeks ahead. Please pick a later date.' : ''],
    ['preferredDate', form.preferredDate && !form.preferredEndDate ? 'Tap the last day of your trip on the calendar (tap the same day twice for a one-day trip).' : ''],
    ['preferredDate', days > MAX_TOUR_DAYS ? `A trip can be at most 1 week (${MAX_TOUR_DAYS} days) long.` : ''],
    ...people.flatMap((p, i) => [
      [`participant_name_${i}`, fullNameError(p.full_name, `Person ${i + 1}'s name`)],
      [`participant_contact_${i}`, phoneError(p.contact_number, `Person ${i + 1}'s contact number`)],
      [`participant_name_${i}`, people.findIndex((o) => sameName(o.full_name, p.full_name)) !== i ? 'This person is listed twice. Each person needs their own details.' : ''],
    ]),
    ['notes', textError(form.notes, 'Notes', { required: false, max: 2000 })],
  ]);
};

const InputField = ({ label, type = 'text', placeholder, value, onChange, required, ...rest }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <label style={labelStyle}>
      {label} {required && <span style={{ color: '#A8481A' }}>*</span>}
    </label>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      {...rest}
      style={inputStyle}
    />
  </div>
);

const TextAreaField = ({ label, placeholder, value, onChange, required, rows = 4, name, maxLength = 2000 }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <label style={labelStyle}>
      {label} {required && <span style={{ color: '#A8481A' }}>*</span>}
    </label>
    <textarea
      name={name}
      maxLength={maxLength}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      rows={rows}
      style={{ ...inputStyle, resize: 'none' }}
    />
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
        contact: formatPhPhone(profile?.phone_number || ''),
        email: profile?.email || user.email || '',
      });
    })();
  }, []);
  return contact;
};

// Preferred dates on a calendar (first day, then last day, at most a week)
// and the number of days worked out from them. Used by both request forms.
const TripDatesFields = ({ form, setForm }) => (
  <>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={labelStyle}>Preferred Dates <span style={{ color: '#A8481A' }}>*</span></label>
      <DateRangePicker
        name="preferredDate"
        start={form.preferredDate}
        end={form.preferredEndDate}
        min={earliestTripDate()}
        maxDays={MAX_TOUR_DAYS}
        onChange={({ start, end }) => setForm((prev) => ({ ...prev, preferredDate: start, preferredEndDate: end }))}
        style={inputStyle}
      />
      <span style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', marginTop: 6 }}>Trips can be booked from 3 weeks ahead, for up to 1 week.</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={labelStyle}>Number of Days</label>
      <input
        readOnly
        tabIndex={-1}
        aria-label="Number of days (filled in from your dates)"
        value={daysLabel(tripDays(form.preferredDate, form.preferredEndDate))}
        placeholder="Filled in from your dates"
        style={{ ...inputStyle, cursor: 'default', fontWeight: form.preferredEndDate ? 800 : inputStyle.fontWeight }}
      />
    </div>
  </>
);

// Exclusive tours: the name and number of each person in the group.
const ParticipantsFields = ({ participants, onChange }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <label style={labelStyle}>Who's Coming <span style={{ color: '#A8481A' }}>*</span></label>
    <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: '-2px 0 4px' }}>
      The full name and contact number of each person in your group (you're person 1).
    </p>
    {participants.map((p, i) => (
      <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignItems: 'end' }}>
        <InputField
          name={`participant_name_${i}`}
          data-allow="name"
          label={`Person ${i + 1}`}
          placeholder="Full name"
          maxLength={120}
          value={p.full_name}
          onChange={(e) => onChange(i, 'full_name', e.target.value)}
        />
        <InputField
          name={`participant_contact_${i}`}
          label="Contact Number"
          {...phoneFieldProps(p.contact_number, (v) => onChange(i, 'contact_number', v))}
        />
      </div>
    ))}
  </div>
);

// ─── Form state ─────────────────────────────────────────────────────────────────
// A start date picked on the calendar, if it's far enough ahead to book.
const usableStart = (date) => (date && date >= earliestTripDate() ? date : '');

const blankForm = (startDate = '') => ({
  fullName: '', contact: '', email: '',
  destination: '', region: '', groupSize: '', preferredDate: usableStart(startDate), preferredEndDate: '',
  budget: '', notes: '', participants: [], agreeTerms: false,
});

// An existing request, as the form edits it.
const formFromRequest = (r) => ({
  fullName: r.full_name || '',
  contact: formatPhPhone(r.contact_number || ''),
  email: r.email || '',
  destination: r.destination || '',
  region: r.region || '',
  groupSize: r.group_size ? String(r.group_size) : '',
  preferredDate: r.preferred_date || '',
  preferredEndDate: r.preferred_end_date || r.preferred_date || '',
  budget: r.budget != null ? String(r.budget) : '',
  notes: r.notes || '',
  participants: (Array.isArray(r.participants) ? r.participants : []).map((p) => ({ full_name: p.full_name || '', contact_number: formatPhPhone(p.contact_number || '') })),
  agreeTerms: true,
});

// One row per person in the group; person 1 starts as the requester.
const sizeParticipants = (list, size, form) => {
  const n = Number.isInteger(size) && size >= 1 ? Math.min(size, MAX_GROUP) : 0;
  return Array.from({ length: n }, (_, i) => list[i]
    || (i === 0 ? { full_name: form.fullName || '', contact_number: form.contact || '' } : { full_name: '', contact_number: '' }));
};

// What's saved for the form (insert, or update while it's still For Approval).
const requestFields = (type, form) => {
  const days = tripDays(form.preferredDate, form.preferredEndDate);
  const row = {
    full_name: form.fullName.trim(),
    contact_number: normalizePhone(form.contact) || form.contact.trim(),
    email: form.email.trim(),
    destination: form.destination.trim(),
    group_size: parseInt(form.groupSize, 10) || null,
    preferred_date: form.preferredDate || null,
    preferred_end_date: form.preferredEndDate || null,
    trip_days: days || null,
    notes: form.notes,
  };
  if (type === 'exclusive') {
    row.budget = form.budget === '' ? null : Number(form.budget);
    row.participants = form.participants.map((p) => ({
      full_name: cleanName(p.full_name),
      contact_number: normalizePhone(p.contact_number) || p.contact_number.trim(),
    }));
  } else {
    row.region = form.region || null;
  }
  return row;
};

// The joiner's own open request for the same destination (Exclusive Tours or
// Request a Tour), if there is one.
const findDuplicate = async (userId, type, destination, exceptId = null) => {
  const { data } = await supabase
    .from('exclusive_requests')
    .select('id, destination, status, package_sent_at, preferred_date, created_at, request_type')
    .eq('user_id', userId)
    .eq('request_type', type)
    .in('status', ['Pending', 'Approved']);
  const today = addDaysPH(0);
  return (data || []).find((r) => r.id !== exceptId
    && String(r.destination || '').trim().toLowerCase() === destination.trim().toLowerCase()
    && !requestOverdueReason(r)
    && !(r.package_sent_at && r.preferred_date && r.preferred_date < today)) || null;
};

// ─── THE REQUEST FORM (both types) ──────────────────────────────────────────────
// editing: a request still For Approval (the form saves changes to it).
const RequestForm = ({ type, startDate, editing = null, onSaved, onCancel }) => {
  const isExclusive = type === 'exclusive';
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const prefill = usePrefilledContact();
  const [form, setForm] = useState(() => (editing ? formFromRequest(editing) : blankForm(startDate)));
  // After a submit the form is cleared, and the contact details aren't filled in again.
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (editing || cleared) return;
    setForm(prev => ({
      ...prev,
      fullName: prev.fullName || prefill.fullName,
      contact: prev.contact || prefill.contact,
      email: prev.email || prefill.email,
    }));
  }, [prefill.fullName, prefill.contact, prefill.email, editing, cleared]);

  const set = (field) => (e) =>
    setForm(prev => ({ ...prev, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const setGroupSize = (e) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, groupSize: value, participants: isExclusive ? sizeParticipants(prev.participants, Number(value), prev) : prev.participants }));
  };
  const setParticipant = (i, field, value) =>
    setForm((prev) => ({ ...prev, participants: prev.participants.map((p, j) => (j === i ? { ...p, [field]: value } : p)) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    if (!checkRequestFields(formEl, form, type)) return;
    if (isExclusive && form.budget !== '' && Number(form.budget) > MAX_EXCLUSIVE_BUDGET) { flagField(formEl, 'budget', `Budget can be up to ${formatPeso(MAX_EXCLUSIVE_BUDGET)}.`); return; }
    if (isExclusive && !form.agreeTerms) { toast.info('Please accept the terms and conditions.'); return; }
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.info(`Please log in to submit ${isExclusive ? 'an exclusive tour' : 'a tour'} request.`);
      setLoading(false);
      return;
    }

    const duplicate = await findDuplicate(user.id, type, form.destination, editing?.id);
    if (duplicate) {
      setLoading(false);
      flagField(formEl, 'destination', `You already sent a request for ${duplicate.destination}. You can edit that one under Your Submitted Requests.`);
      return;
    }

    const fields = requestFields(type, form);
    if (editing) {
      const { error } = await supabase.rpc('update_my_request', { p_request_id: editing.id, p_fields: fields });
      setLoading(false);
      if (error) { toast.error("Couldn't save your changes", error.message); return; }
      toast.success('Request updated', 'Bandang IBAYO will see your changes.');
      onSaved?.();
      return;
    }

    const { data: inserted, error } = await supabase
      .from('exclusive_requests')
      .insert([{ ...fields, user_id: user.id, request_type: type }])
      .select();
    if (error) {
      toast.error("Couldn't submit your request", error.message);
      setLoading(false);
      return;
    }

    notifyAdmins(isExclusive
      ? {
        title: 'New Exclusive Tour Request',
        message: `${form.fullName || 'A joiner'} submitted an exclusive tour request for ${form.destination} (${form.groupSize || '?'} pax).`,
        type: 'exclusive_request',
        related_id: inserted?.[0]?.id || null,
      }
      : {
        title: 'New Tour Request',
        message: `${form.fullName || 'A joiner'} requested a new destination: ${form.destination} (${form.groupSize || '?'} pax).`,
        type: 'exclusive_request',
        related_id: inserted?.[0]?.id || null,
      });

    setLoading(false);
    // The request shows under Your Submitted Requests right away, and the form starts over empty.
    setCleared(true);
    setForm(blankForm());
    toast.success(isExclusive ? 'Exclusive tour request sent!' : 'Tour request sent!', "It's under Your Submitted Requests. You can edit it until Bandang IBAYO approves it.");
    onSaved?.(inserted?.[0]);
  };

  const sectionTitle = (n, text) => (
    <h3 style={{ fontSize: 11.5, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
      <span style={{ width: 20, height: 20, background: '#B4511E', borderRadius: '50%', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{n}</span>
      {text}
    </h3>
  );
  const canSubmit = !loading && (!isExclusive || form.agreeTerms);

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {!editing && (
        <div style={{
          background: isExclusive ? '#F2E4D0' : 'rgba(180,81,30,0.08)', border: '1px solid rgba(180,81,30,0.18)',
          borderRadius: 18, padding: '1.25rem 1.5rem', display: 'flex', gap: 14, alignItems: 'flex-start',
        }}>
          {isExclusive ? <Shield size={20} style={{ color: '#A8481A', flexShrink: 0, marginTop: 2 }} /> : <Globe size={20} style={{ color: '#A8481A', flexShrink: 0, marginTop: 2 }} />}
          <div>
            <p style={{ fontSize: 11, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              {isExclusive ? 'Private Group Booking' : 'Suggest a Destination'}
            </p>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#7A3A18', opacity: 0.9, lineHeight: 1.6, margin: '4px 0 0' }}>
              {isExclusive
                ? 'Exclusive tours reserve the entire vehicle and itinerary just for your group. No other joiners. The agency handles all coordination — accommodation, van, guide. You pay all-in.'
                : <>Don't see your dream destination listed? Request it here. Once it's approved and the tour is posted on Explore Tours, <strong>your group's slots are held for you for 2 days</strong> so you can pay first, and other joiners can book the rest.</>}
            </p>
          </div>
        </div>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sectionTitle(1, isExclusive ? 'Contact Information' : 'Your Information')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <InputField name="fullName" data-allow="name" label="Full Name" placeholder="Juan Dela Cruz" value={form.fullName} onChange={set('fullName')} required />
          <InputField name="contact" label="Contact Number" {...phoneFieldProps(form.contact, (v) => setForm((prev) => ({ ...prev, contact: v })))} required />
          <InputField name="email" label="Email Address" type="email" placeholder="juan@email.com" value={form.email} onChange={set('email')} required />
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sectionTitle(2, isExclusive ? 'Trip Details' : 'Destination & Tour Details')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <InputField name="destination" data-allow="place" label={isExclusive ? 'Destination' : 'Requested Destination'} placeholder={isExclusive ? 'e.g. Mt. Pulag, Sagada, Batanes' : 'e.g. Sagada, Mountain Province'} value={form.destination} onChange={set('destination')} required />
          <InputField name="groupSize" label={isExclusive ? 'Number of Participants' : 'Estimated Group Size'} type="number" min="1" max={MAX_GROUP} step="1" onKeyDown={blockSignKeys} placeholder={isExclusive ? 'e.g. 10' : 'e.g. 4'} value={form.groupSize} onChange={setGroupSize} required />
          <TripDatesFields form={form} setForm={setForm} />
          {isExclusive && (
            <InputField
              name="budget"
              label="Budget for Exclusive Tour"
              {...moneyField(form.budget, (v) => {
                // Stop typing past the limit instead of failing later.
                if (Number(v) > MAX_EXCLUSIVE_BUDGET) return;
                setForm((prev) => ({ ...prev, budget: v }));
              })}
              placeholder="Up to 100,000.00"
              required
            />
          )}
        </div>
        {isExclusive && form.participants.length > 0 && (
          <ParticipantsFields participants={form.participants} onChange={setParticipant} />
        )}
        <TextAreaField name="notes"
          label={isExclusive ? 'Special Notes / Requests' : 'Additional Details / Preferences'}
          placeholder="Tell us more — specific spots you want to visit, activities, etc."
          value={form.notes}
          onChange={set('notes')}
          rows={isExclusive ? 4 : 5}
        />
      </section>

      {!editing && isExclusive && (
        <div style={{
          background: 'rgba(180,81,30,0.08)', border: '1px solid rgba(180,81,30,0.22)',
          borderRadius: 18, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <p style={{ fontSize: 11.5, fontWeight: 900, color: '#A8481A', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>
            Policy Reminder
          </p>
          <ul style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>A <strong>downpayment</strong> is required to confirm the booking.</li>
            <li>Bookings are <strong>non-refundable</strong>. Cancellations are not allowed.</li>
            <li>All prices are all-in (van, accommodation, coordination). Entrance/environmental fees are separate.</li>
            <li>An email and notification will be sent to confirm your exclusive booking.</li>
          </ul>
        </div>
      )}

      {!editing && !isExclusive && (
        <div style={{
          background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.14)',
          borderRadius: 18, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <p style={{ fontSize: 11.5, fontWeight: 900, color: '#1A0A00', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>
            What Happens Next?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Bandang IBAYO reviews your request', 'It shows as For Approval. You can still edit it until then.'],
              ['The tour is prepared and posted on Explore Tours', 'It shows as Tour Confirmed, and other joiners can book it too'],
              ['Your slots are held for you for 2 days', "Pay in My Bookings to keep them, or they're released"],
            ].map(([step, desc], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  width: 20, height: 20, background: '#1A0A00', color: '#E8A265',
                  borderRadius: '50%', fontSize: 11, fontWeight: 900, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
                }}>
                  {i + 1}
                </span>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{step}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!editing && isExclusive && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.agreeTerms}
            onChange={set('agreeTerms')}
            style={{ marginTop: 3, accentColor: '#B4511E', width: 16, height: 16 }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, lineHeight: 1.6 }}>
            I have read and agree to the{' '}
            <button type="button" className="text-link no-touch-size" onClick={(e) => { e.preventDefault(); setShowTerms(true); }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 900, color: '#1A0A00' }}>
              Terms &amp; Conditions
            </button>{' '}and understand the
            non-refundable payment policy. I also acknowledge the medical disclaimer applicable to overland travel.
          </span>
        </label>
      )}

      {showTerms && (
        <TermsModal
          onClose={() => setShowTerms(false)}
          onAgree={() => { setForm((prev) => ({ ...prev, agreeTerms: true })); setShowTerms(false); }}
        />
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {editing && (
          <button type="button" onClick={onCancel} style={{
            flex: '1 1 140px', padding: '16px 0', background: '#F2E4D0', color: '#1A0A00', borderRadius: 16,
            border: '1px solid rgba(180,81,30,0.25)', fontWeight: 900, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          title={canSubmit || loading ? undefined : 'Tick the Terms & Conditions box first'}
          style={{
            flex: '2 1 220px', padding: '16px 0', background: isExclusive ? '#1A0A00' : '#B4511E', color: '#FDF6EE',
            borderRadius: 16, border: 'none', fontWeight: 900, fontSize: 11, fontFamily: 'inherit',
            letterSpacing: '0.18em', textTransform: 'uppercase', cursor: canSubmit ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 6px 20px rgba(26,10,0,0.15)', opacity: canSubmit || loading ? 1 : 0.5,
          }}
        >
          {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : editing ? <CheckCircle2 size={16} /> : isExclusive ? <Send size={16} /> : <ArrowRight size={16} />}
          {loading ? 'Saving…' : editing ? 'Save Changes' : isExclusive ? 'Submit Exclusive Booking Request' : 'Send Tour Request'}
        </button>
      </div>
    </form>
  );
};

// Edit a request that's still For Approval.
const EditRequestModal = ({ request, onClose, onSaved }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.82)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
    <div role="dialog" aria-modal="true" aria-labelledby="edit-request-title" style={{
      position: 'relative', background: '#FDF6EE', width: '100%', maxWidth: 760, maxHeight: '92dvh', overflowY: 'auto',
      borderRadius: 24, borderTop: '8px solid #B4511E', boxShadow: '0 32px 80px rgba(26,10,0,0.4)', padding: '2rem',
    }}>
      <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#7A3A18' }}>
        <X size={20} />
      </button>
      <h3 id="edit-request-title" style={{ fontSize: 18, fontWeight: 900, textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 4px' }}>
        Edit {request.request_type === 'exclusive' ? 'Exclusive Tour' : 'Tour'} Request
      </h3>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '0 0 20px' }}>
        You can change it until Bandang IBAYO approves it.
      </p>
      <RequestForm type={request.request_type} editing={request} onCancel={onClose} onSaved={onSaved} />
    </div>
  </div>
);

// ─── REQUEST STATUS + ADMIN UPDATES (shown to the joiner on this page) ─────────
const STATUS_STYLES = {
  'For Approval': { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
  Approved: { bg: 'rgba(180,81,30,0.14)', color: '#A8481A' },
  'Tour Confirmed': { bg: '#1A0A00', color: '#E8A265' },
  Rejected: { bg: 'rgba(140,47,28,0.14)', color: '#8C2F1C' },
  'Downpayment Paid': { bg: 'rgba(122,58,24,0.12)', color: '#7A3A18' },
  'Fully Paid': { bg: '#A8481A', color: '#FDF6EE' },
};

const RequestStatusBadge = ({ status }) => {
  const { bg, color } = STATUS_STYLES[status] || STATUS_STYLES['For Approval'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: bg, color, borderRadius: 999,
      padding: '4px 12px', fontSize: 11, fontWeight: 900,
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

// A single labeled block inside the "package" panel.
const PackageDetail = ({ label, icon, color = '#A8481A', children }) => (
  <div>
    <p style={{
      display: 'flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
      color, margin: '0 0 4px',
    }}>
      {icon} {label}
    </p>
    <p style={{ fontSize: 12.5, fontWeight: 500, color: '#1A0A00', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>
      {children}
    </p>
  </div>
);

const RequestHistoryCard = ({ request, onOpenBooking, onEdit }) => {
  const [expanded, setExpanded] = useState(false);
  const isExclusive = request.request_type === 'exclusive';
  const pkg = request.package_details;
  const hasPackage = !!request.package_sent_at && pkg;
  // Exclusive tours are confirmed with a 50% downpayment of the package price.
  const packagePrice = Number(pkg?.price);
  const status = requestStatusLabel(request);
  const paymentLabel = requestPaymentLabel(request);
  const canPay = isExclusive && request.status === 'Approved' && hasPackage && packagePrice > 0;
  // A requested tour posted on Explore Tours: the requester's slots are held for them.
  const postedTour = !isExclusive && hasPackage && pkg.tour_id;
  const isPaid = request.payment_status === 'Paid';
  const overdueReason = requestOverdueReason(request);
  const editable = requestEditable(request);
  const people = Array.isArray(request.participants) ? request.participants : [];

  return (
    <div style={{
      background: '#FDF6EE', borderRadius: 18,
      border: '1px solid rgba(180,81,30,0.12)',
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
        <div style={{ flex: 1, minWidth: 140 }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A0A00', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {request.destination || 'Destination TBD'}
          </p>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '3px 0 0' }}>
            Submitted {formatShortDate(request.created_at)}
            {request.preferred_date ? ` · ${formatYmdRange(request.preferred_date, request.preferred_end_date || request.preferred_date)}` : ''}
            {request.group_size ? ` · ${request.group_size} pax` : ''}
          </p>
        </div>

        <RequestStatusBadge status={status} />
        {paymentLabel && <RequestStatusBadge status={paymentLabel} />}

        <ChevronDown
          size={16}
          style={{
            color: 'rgba(122,58,24,0.85)', flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
          }}
        />
      </button>

      {expanded && (
        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {status === 'Rejected' ? (
            <div style={{ background: 'rgba(140,47,28,0.06)', borderRadius: 14, padding: '12px 16px', border: '1px solid rgba(140,47,28,0.18)' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8C2F1C', margin: '0 0 6px' }}>
                <MessageSquare size={11} /> Not approved
              </p>
              <p style={{ fontSize: 12.5, fontWeight: 500, color: '#1A0A00', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {request.admin_response || overdueReason || 'Bandang IBAYO could not take this request.'} You're welcome to send a new request for a later date.
              </p>
            </div>
          ) : request.status === 'Pending' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
                For approval: you'll get a notification once our team responds.
              </p>
              {editable && (
                <button type="button" onClick={() => onEdit(request)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, cursor: 'pointer',
                  background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.35)', color: '#A8481A', fontFamily: 'inherit',
                  fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                  <PencilLine size={13} /> Edit Request
                </button>
              )}
            </div>
          ) : !hasPackage && (
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
              Approved! Bandang IBAYO is preparing your tour package. You'll be notified once it's ready.
            </p>
          )}

          {isExclusive && people.length > 0 && (
            <PackageDetail label="Who's coming" icon={<Users size={11} />}>
              {people.map((p, i) => `${i + 1}. ${p.full_name}${p.contact_number ? ` · ${formatPhPhone(p.contact_number)}` : ''}`).join('\n')}
            </PackageDetail>
          )}

          {/* Full tour package details, once the admin has sent them */}
          {hasPackage && (
            <div style={{
              background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)', borderRadius: 18, padding: '1.25rem 1.5rem',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <p style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 11.5, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: '#A8481A', margin: 0,
                }}>
                  <FileText size={13} /> Tour Package Details
                </p>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7A3A18' }}>
                  Sent {formatFullDateTime(request.package_sent_at)}
                </span>
              </div>

              {Array.isArray(pkg.image_urls) && pkg.image_urls.length > 0 && (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                  {pkg.image_urls.map((url) => (
                    <img key={url} src={url} alt="" onClick={() => window.open(url, '_blank')}
                      style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 12, flexShrink: 0, cursor: 'zoom-in' }} />
                  ))}
                </div>
              )}

              {pkg.title && (
                <div>
                  <p style={{ fontSize: 17, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{pkg.title}</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: '3px 0 0' }}>
                    {[pkg.destination, pkg.start_date ? formatYmdRange(pkg.start_date, pkg.end_date || pkg.start_date) : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
              )}

              {postedTour && (
                <div style={{ background: '#FDF6EE', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 14, padding: '12px 14px' }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: 0, lineHeight: 1.5 }}>
                    Your tour is posted on Explore Tours, and your slots are held for you for 2 days. Pay in My Bookings to keep them.
                  </p>
                  {pkg.held_booking_id && onOpenBooking && (
                    <button type="button" onClick={() => onOpenBooking(pkg.held_booking_id)} style={{
                      marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: 'none',
                      background: '#B4511E', color: '#FDF6EE', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>
                      <CreditCard size={14} /> Pay for my slots
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 14 }}>
                {pkg.price != null && pkg.price !== '' && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 3px' }}>
                      {isExclusive ? 'Package Price' : 'Price per Person'}
                    </p>
                    <p style={{ fontSize: 19, fontWeight: 900, color: '#1A0A00', margin: 0 }}>
                      {formatPeso(Number(pkg.price))}
                    </p>
                  </div>
                )}
                {(request.accommodation && isPaid ? [request.accommodation] : cleanAccommodation(pkg.accommodation_options)).length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 3px' }}>
                      Accommodation
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1A0A00', margin: 0 }}>
                      {isPaid && request.accommodation ? request.accommodation : cleanAccommodation(pkg.accommodation_options).join(' · ')}
                    </p>
                  </div>
                )}
              </div>

              {pkg.itinerary && (/^day\b/im.test(pkg.itinerary) ? (
                // Written by day: the same open/close days as the tour pages.
                <div>
                  <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 6px' }}>
                    <Calendar size={11} /> Itinerary
                  </p>
                  <div style={{ background: '#FDF6EE', borderRadius: 14, padding: 10 }}>
                    <ItineraryTimeline text={pkg.itinerary} />
                  </div>
                </div>
              ) : (
                <PackageDetail label="Itinerary" icon={<Calendar size={11} />}>{pkg.itinerary}</PackageDetail>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 14 }}>
                {pkg.inclusions && (
                  <PackageDetail label="Inclusions" icon={<CheckCircle2 size={11} />}>
                    {pkg.inclusions}
                  </PackageDetail>
                )}
                {pkg.exclusions && (
                  <PackageDetail label="Exclusions" icon={<XCircle size={11} />} color="#7A3A18">
                    {pkg.exclusions}
                  </PackageDetail>
                )}
              </div>

              {pkg.description && (
                <PackageDetail label="About the Tour" icon={<FileText size={11} />}>{pkg.description}</PackageDetail>
              )}

              {Array.isArray(pkg.pickup_points) && pkg.pickup_points.length > 0 && (
                <PackageDetail label="Pickup Points" icon={<MapPin size={11} />}>
                  {pkg.pickup_points.map((p) => `${p.location}${p.time ? ` · ${p.time}` : ''}`).join('\n')}
                </PackageDetail>
              )}

              {pkg.things_to_bring && (
                <PackageDetail label="Things to Bring" icon={<Star size={11} />}>{pkg.things_to_bring}</PackageDetail>
              )}

              {pkg.important_note && (
                <PackageDetail label="Important Notes" icon={<Shield size={11} />} color="#8C2F1C">{pkg.important_note}</PackageDetail>
              )}

              {/* Once booked (downpayment paid): what the trip covers, names only, no prices */}
              {isPaid && pkg.expenses && (
                <PackageDetail label="Tour Expenses (covered)" icon={<CheckCircle2 size={11} />}>
                  {expenseItems(pkg.expenses).map((i) => `✓ ${i.label}`).join('\n')}
                </PackageDetail>
              )}

              {pkg.additional_notes && (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.15)', paddingTop: 12 }}>
                  <PackageDetail label="Notes">{pkg.additional_notes}</PackageDetail>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Always visible, so joiners don't have to open the card to pay */}
      {canPay && (
        <div style={{ padding: '0 1.25rem 1.25rem' }}>
          <DownpaymentPanel request={request} price={packagePrice} />
        </div>
      )}
    </div>
  );
};

// "Pay 50% downpayment" for an approved exclusive tour, then "Pay remaining
// balance" once it's confirmed, then "Fully paid".
const PayButton = ({ busy, onClick, disabled = false, children }) => (
  <button type="button" onClick={onClick} disabled={busy || disabled} style={{
    alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
    padding: '12px 20px', borderRadius: 14, border: 'none', cursor: busy || disabled ? 'not-allowed' : 'pointer',
    background: '#B4511E', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5,
    letterSpacing: '0.1em', textTransform: 'uppercase', opacity: busy ? 0.75 : disabled ? 0.5 : 1,
  }}>
    {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CreditCard size={14} />} {children}
  </button>
);

const receiptButton = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 14, cursor: 'pointer',
  background: 'transparent', border: '1px solid rgba(180,81,30,0.35)', color: '#A8481A', fontFamily: 'inherit',
  fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
};

const DownpaymentPanel = ({ request, price }) => {
  const [busy, setBusy] = useState(false);
  const pkg = request.package_details || {};
  const choices = cleanAccommodation(pkg.accommodation_options);
  const [accommodation, setAccommodation] = useState(choices.includes(request.accommodation) ? request.accommodation : '');
  const downpayment = Math.round(price * EXCLUSIVE_DOWNPAYMENT_RATE * 100) / 100;
  const isPaid = request.payment_status === 'Paid';
  const paidSoFar = Number(request.amount_paid) || (isPaid ? downpayment : 0);
  const balance = Math.max(0, Math.round((price - paidSoFar) * 100) / 100);

  const pay = (start, doneTitle, doneText, extra = {}) => async () => {
    setBusy(true);
    const { ok, data, error } = await start({ requestId: request.id, ...extra });
    if (!ok) { toast.error("Couldn't open the payment page", error); setBusy(false); return; }
    if (data.alreadyPaid) { toast.success(doneTitle, doneText); setBusy(false); return; }
    window.location.assign(data.checkoutUrl);
  };
  const receipt = (part) => () => downloadExclusiveReceipt(request, part).catch((e) => toast.error("Couldn't create the receipt", e.message));

  if (isPaid) {
    const fullyPaid = request.balance_settled || balance <= 0;
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', background: 'rgba(180,81,30,0.08)', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 16, padding: '14px 16px' }}>
        <CheckCircle2 size={20} style={{ color: '#A8481A', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#1A0A00', margin: 0 }}>
              {fullyPaid ? 'Your exclusive tour is fully paid' : 'Your exclusive tour is confirmed'}
            </p>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '3px 0 0', lineHeight: 1.6 }}>
              {fullyPaid
                ? <>Paid {formatPeso(Math.max(paidSoFar, price))} in total{request.balance_paid_at ? `, balance paid on ${formatShortDate(request.balance_paid_at)}` : ''}. See you on the trip!</>
                : <>Downpayment of {formatPeso(paidSoFar)} received{request.paid_at ? ` on ${formatShortDate(request.paid_at)}` : ''}.
                  You can pay the remaining <strong>{formatPeso(balance)}</strong> online now, or settle it with our team before the trip.</>}
              {request.accommodation ? <> Accommodation: <strong>{request.accommodation}</strong>.</> : null}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {!fullyPaid && (
              <PayButton busy={busy} onClick={pay(startExclusiveBalance, 'Balance already paid', 'Your exclusive tour is fully paid.')}>
                Pay {formatPeso(balance)} Balance
              </PayButton>
            )}
            <button type="button" onClick={receipt('payment')} style={receiptButton}>
              <FileDown size={14} /> Downpayment Receipt
            </button>
            {request.balance_settled && (
              <button type="button" onClick={receipt('balance')} style={receiptButton}>
                <FileDown size={14} /> Balance Receipt
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#A8481A', margin: 0 }}>Confirm your tour</p>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', margin: '4px 0 0', lineHeight: 1.6 }}>
          {choices.length > 0 ? 'Choose your accommodation, then pay' : 'Pay'} a <strong>50% downpayment of {formatPeso(downpayment)}</strong> (of the {formatPeso(price)} package) to lock in your exclusive tour.
          Pay online with GCash, Maya or card. Payments are non-refundable.
        </p>
      </div>
      <AccommodationSelect id={`exclusive-accommodation-${request.id}`} options={choices} value={accommodation} onChange={setAccommodation} />
      <PayButton
        busy={busy}
        disabled={choices.length > 0 && !accommodation}
        onClick={pay(startExclusiveDownpayment, 'Downpayment already paid', 'Your exclusive tour is confirmed.', { accommodation: accommodation || null })}
      >
        Pay {formatPeso(downpayment)} Downpayment
      </PayButton>
      {choices.length > 0 && !accommodation && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#7A3A18', margin: 0 }}>
          <BedDouble size={13} /> Choose your accommodation first.
        </p>
      )}
    </div>
  );
};

// "Your Submitted Requests" for one type; reloads when refreshKey changes.
const MyRequestsSection = ({ type, refreshKey, onOpenBooking }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [editing, setEditing] = useState(null);

  const fetchRequests = useCallback(async (uid) => {
    // Requests the agency didn't finish in time become Rejected (safe to run any time).
    await supabase.rpc('run_overdue_requests').then(() => {}, () => {});
    const { data, error } = await supabase
      .from('exclusive_requests')
      .select('*')
      .eq('user_id', uid)
      .eq('request_type', type)
      .order('created_at', { ascending: false });
    if (!error) setRequests(data || []);
    setLoading(false);
  }, [type]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      fetchRequests(user.id);
    })();
  }, [fetchRequests, refreshKey]);

  // Live updates — approvals, rejections, and newly-sent package
  // details all appear here immediately without a manual refresh.
  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`joiner-requests-${type}-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exclusive_requests', filter: `user_id=eq.${userId}` }, () => fetchRequests(userId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, type, fetchRequests]);

  const closeEditor = async () => {
    if (await confirmDialog({ title: 'Discard your changes?', message: "Your request stays as it was.", confirmLabel: 'Discard', cancelLabel: 'Keep Editing', tone: 'danger' })) setEditing(null);
  };

  if (loading) return <SkeletonRows count={3} label="Loading your requests" />;
  if (requests.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, borderBottom: '1px solid rgba(180,81,30,0.12)', paddingBottom: 28 }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.01em', color: '#1A0A00', margin: '0 0 4px' }}>
          Your Submitted Requests
        </h3>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>
          {type === 'exclusive' ? 'Track your exclusive tour requests' : 'Track your tour requests'}, plus any updates from our team. You can edit a request until it's approved.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {requests.map(r => <RequestHistoryCard key={r.id} request={r} onOpenBooking={onOpenBooking} onEdit={setEditing} />)}
      </div>
      {editing && (
        <EditRequestModal
          request={editing}
          onClose={closeEditor}
          onSaved={() => { setEditing(null); if (userId) fetchRequests(userId); }}
        />
      )}
    </div>
  );
};

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────────
// type: 'exclusive' (Exclusive Tours) or 'request' (Request a Tour).
// `start` comes from the joiner calendar: { form, date: 'YYYY-MM-DD' }.
const ExclusiveTour = ({ type = 'exclusive', start, onOpenBooking }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, textAlign: 'left' }}>
      {/* Your Submitted Requests (at the top): status, admin updates, tour package details */}
      <MyRequestsSection type={type} refreshKey={refreshKey} onOpenBooking={onOpenBooking} />

      <div style={{
        background: '#FDF6EE', borderRadius: 24, padding: '2rem 2.25rem',
        border: '1px solid rgba(180,81,30,0.12)', borderTop: '8px solid #B4511E',
        boxShadow: '0 4px 20px rgba(26,10,0,0.05)',
      }}>
        <RequestForm key={type} type={type} startDate={start?.date} onSaved={() => setRefreshKey((k) => k + 1)} />
      </div>
      <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
    </div>
  );
};

export default ExclusiveTour;
