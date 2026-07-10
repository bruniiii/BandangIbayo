import React, { useState } from 'react';
import {
  MapPin, Users, Calendar, ChevronRight, CheckCircle,
  FileText, Send, Shield, Star, Clock, ArrowRight,
  Phone, Globe, Loader2
} from 'lucide-react';
 
// ─── Shared helpers ────────────────────────────────────────────────────────────
const InputField = ({ label, type = 'text', placeholder, value, onChange, required }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] font-black uppercase tracking-[0.18em] text-[#1A0A00]">
      {label} {required && <span className="text-[#C45C26]">*</span>}
    </label>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      className="px-4 py-3 rounded-xl border-2 border-[#C45C26]/[0.12] bg-[#F2E4D0] text-sm text-[#1A0A00] 
                 placeholder:text-[#C45C26]/30 focus:outline-none focus:border-[#C45C26] focus:bg-[#FDF6EE] 
                 transition-all font-medium"
    />
  </div>
);
 
const TextAreaField = ({ label, placeholder, value, onChange, required, rows = 4 }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] font-black uppercase tracking-[0.18em] text-[#1A0A00]">
      {label} {required && <span className="text-[#C45C26]">*</span>}
    </label>
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
      rows={rows}
      className="px-4 py-3 rounded-xl border-2 border-[#C45C26]/[0.12] bg-[#F2E4D0] text-sm text-[#1A0A00]
                 placeholder:text-[#C45C26]/30 focus:outline-none focus:border-[#C45C26] focus:bg-[#FDF6EE] 
                 transition-all font-medium resize-none"
    />
  </div>
);
 
const SelectField = ({ label, value, onChange, options, required }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] font-black uppercase tracking-[0.18em] text-[#1A0A00]">
      {label} {required && <span className="text-[#C45C26]">*</span>}
    </label>
    <select
      value={value}
      onChange={onChange}
      required={required}
      className="px-4 py-3 rounded-xl border-2 border-[#C45C26]/[0.12] bg-[#F2E4D0] text-sm text-[#1A0A00]
                 focus:outline-none focus:border-[#C45C26] focus:bg-[#FDF6EE] transition-all font-medium appearance-none"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);
 
// ─── Success Screen ─────────────────────────────────────────────────────────────
const SuccessScreen = ({ type, onReset }) => (
  <div className="flex flex-col items-center justify-center py-24 text-center space-y-6">
    <div className="w-24 h-24 bg-[#C45C26]/10 rounded-full flex items-center justify-center animate-bounce">
      <CheckCircle size={48} className="text-[#C45C26]" />
    </div>
    <div>
      <h3 className="text-2xl font-black text-[#1A0A00] uppercase tracking-tight">
        {type === 'exclusive' ? 'Exclusive Booking Submitted!' : 'Tour Request Sent!'}
      </h3>
      <p className="text-[#7A3A18]/80 text-sm mt-2 max-w-sm mx-auto">
        {type === 'exclusive'
          ? 'Our team will review your exclusive booking and reach out within 24 hours to confirm your itinerary and pricing.'
          : "Your destination request has been forwarded to the Bandang IBAYO team. They'll prepare a custom price list and get back to you soon."}
      </p>
    </div>
    <button
      onClick={onReset}
      className="px-8 py-3 bg-[#1A0A00] text-white rounded-2xl text-xs font-black uppercase tracking-widest
                 hover:bg-[#C45C26] hover:text-[#1A0A00] transition-all"
    >
      Submit Another
    </button>
  </div>
);
 
// ─── EXCLUSIVE TOUR FORM ────────────────────────────────────────────────────────
const ExclusiveTourForm = () => {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: '', contact: '', email: '',
    destination: '', groupSize: '', preferredDate: '', alternateDate: '',
    accommodation: '', budget: '', notes: '', agreeTerms: false,
  });
 
  const set = (field) => (e) =>
    setForm(prev => ({ ...prev, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.agreeTerms) { alert('Please accept the terms and conditions.'); return; }
    setLoading(true);
    // TODO: replace with Supabase insert
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    setSubmitted(true);
  };
 
  if (submitted) return <SuccessScreen type="exclusive" onReset={() => setSubmitted(false)} />;
 
  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Info Banner */}
      <div className="bg-[#1A0A00]/5 border border-[#1A0A00]/10 rounded-2xl p-5 flex gap-4 items-start">
        <Shield size={20} className="text-[#1A0A00] shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-black text-[#1A0A00] uppercase tracking-wide">Private Group Booking</p>
          <p className="text-xs text-[#7A3A18]/80 mt-0.5 leading-relaxed">
            Exclusive tours reserve the entire vehicle and itinerary just for your group. No other joiners. 
            The agency handles all coordination — accommodation, van, guide. You pay all-in.
          </p>
        </div>
      </div>
 
      {/* Personal Info */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-[#1A0A00] uppercase tracking-[0.2em] flex items-center gap-2">
          <span className="w-5 h-5 bg-[#C45C26] rounded-full text-white flex items-center justify-center text-[9px]">1</span>
          Contact Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField label="Full Name" placeholder="Juan Dela Cruz" value={form.fullName} onChange={set('fullName')} required />
          <InputField label="Contact Number" type="tel" placeholder="09XXXXXXXXX" value={form.contact} onChange={set('contact')} required />
          <InputField label="Email Address" type="email" placeholder="juan@email.com" value={form.email} onChange={set('email')} required />
        </div>
      </section>
 
      {/* Trip Details */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-[#1A0A00] uppercase tracking-[0.2em] flex items-center gap-2">
          <span className="w-5 h-5 bg-[#C45C26] rounded-full text-white flex items-center justify-center text-[9px]">2</span>
          Trip Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField label="Destination" placeholder="e.g. Mt. Pulag, Batanes, Palawan" value={form.destination} onChange={set('destination')} required />
          <InputField label="Number of Participants" type="number" placeholder="e.g. 10" value={form.groupSize} onChange={set('groupSize')} required />
          <InputField label="Preferred Date" type="date" value={form.preferredDate} onChange={set('preferredDate')} required />
          <InputField label="Alternate Date (optional)" type="date" value={form.alternateDate} onChange={set('alternateDate')} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1">
        <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Policy Reminder</p>
        <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
          <li>A <strong>downpayment via GCash</strong> is required to confirm the booking.</li>          
          <li>Bookings are <strong>non-refundable</strong>. Cancellations are not allowed.</li>
          <li>All prices are all-in (van, accommodation, coordination). Entrance/environmental fees are separate.</li>
          <li>An email will be sent to confirm your exclusive booking.</li>
        </ul>
      </div>
 
      {/* Terms */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={form.agreeTerms}
          onChange={set('agreeTerms')}
          className="mt-0.5 w-4 h-4 accent-[#C45C26]"
        />
        <span className="text-xs text-[#7A3A18]/80 leading-relaxed group-hover:text-[#7A3A18] transition-colors">
          I have read and agree to the <span className="text-[#1A0A00] font-bold underline underline-offset-2">Terms & Conditions</span> and understand the 
          non-refundable payment policy. I also acknowledge the medical disclaimer applicable to adventure tours.
        </span>
      </label>
 
      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 bg-[#1A0A00] text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em]
                   hover:bg-[#C45C26] hover:text-[#1A0A00] transition-all shadow-xl shadow-[#1A0A00]/20
                   disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {loading ? 'Submitting…' : 'Submit Exclusive Booking Request'}
      </button>
    </form>
  );
};
 
// ─── REQUEST TOUR FORM ──────────────────────────────────────────────────────────
const RequestTourForm = () => {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: '', contact: '', email: '',
    destination: '', region: '', groupSize: '', preferredDate: '',
    tourType: '', notes: '',
  });
 
  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    // TODO: replace with Supabase insert
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    setSubmitted(true);
  };
 
  if (submitted) return <SuccessScreen type="request" onReset={() => setSubmitted(false)} />;
 
  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Info Banner */}
      <div className="bg-[#C45C26]/10 border border-[#C45C26]/20 rounded-2xl p-5 flex gap-4 items-start">
        <Globe size={20} className="text-[#C45C26] shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-black text-[#1A0A00] uppercase tracking-wide">Suggest a Destination</p>
          <p className="text-xs text-[#7A3A18]/80 mt-0.5 leading-relaxed">
            Don't see your dream destination listed? Request it here. The Bandang IBAYO team will review 
            your suggestion, check availability, and send you a <strong>customized price list</strong>. 
            Approved requests may be opened to other joiners.
          </p>
        </div>
      </div>
 
      {/* Personal Info */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-[#1A0A00] uppercase tracking-[0.2em] flex items-center gap-2">
          <span className="w-5 h-5 bg-[#C45C26] rounded-full text-white flex items-center justify-center text-[9px]">1</span>
          Your Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField label="Full Name" placeholder="Juan Dela Cruz" value={form.fullName} onChange={set('fullName')} required />
          <InputField label="Contact Number" type="tel" placeholder="09XXXXXXXXX" value={form.contact} onChange={set('contact')} required />
          <InputField label="Email Address" type="email" placeholder="juan@email.com" value={form.email} onChange={set('email')} required />
        </div>
      </section>
 
      {/* Destination Details */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-black text-[#1A0A00] uppercase tracking-[0.2em] flex items-center gap-2">
          <span className="w-5 h-5 bg-[#C45C26] rounded-full text-white flex items-center justify-center text-[9px]">2</span>
          Destination & Tour Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <div className="bg-[#F2E4D0] border border-[#C45C26]/[0.12] rounded-2xl p-5 space-y-3">
        <p className="text-[10px] font-black text-[#1A0A00] uppercase tracking-widest">What Happens Next?</p>
        <div className="space-y-2">
          {[
            ['Agency reviews your request', 'Usually within 24–48 hours'],
            ['Custom price list is prepared', 'Based on group size, destination & dates'],
            ['You receive an email that the request tour has been approved or denied', 'If approved, the tour will be open for joiners on the Explore Tours page'],
            ['You may confirm the tour by making a downpayment', 'Via GCash to secure your booking'],
          ].map(([step, desc], i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="w-5 h-5 bg-[#1A0A00] text-[#C45C26] rounded-full text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <div>
                <p className="text-xs font-black text-[#7A3A18]">{step}</p>
                <p className="text-[10px] text-[#7A3A18]/70">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
 
      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 bg-[#C45C26] text-[#1A0A00] rounded-2xl font-black text-xs uppercase tracking-[0.2em]
                   hover:bg-[#1A0A00] hover:text-white transition-all shadow-xl shadow-[#C45C26]/20
                   disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
        {loading ? 'Sending Request…' : 'Send Tour Request'}
      </button>
    </form>
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
    <div className="space-y-8 text-left">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-black text-[#1A0A00] uppercase tracking-tight leading-none">
          Exclusive & <span className="text-[#C45C26]">Requested</span> Tours
        </h2>
        <p className="text-[#7A3A18]/80 text-sm mt-2">
          Want privacy, a tailored itinerary, or a destination we don't offer yet? You're in the right place.
        </p>
      </div>
 
      {/* Tab Switcher */}
      <div className="grid grid-cols-2 gap-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all duration-300
              ${activeTab === tab.id
                ? 'bg-[#1A0A00] border-[#1A0A00] text-white shadow-2xl shadow-[#1A0A00]/20 scale-[1.01]'
                : 'bg-[#FDF6EE] border-[#C45C26]/[0.12] text-[#7A3A18] hover:border-[#1A0A00]/20 hover:bg-[#F2E4D0]'
              }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors
              ${activeTab === tab.id ? 'bg-[#C45C26] text-[#1A0A00]' : 'bg-[#F2E4D0] text-[#7A3A18]/70'}`}
            >
              {tab.icon}
            </div>
            <div>
              <p className={`text-xs font-black uppercase tracking-widest leading-none
                ${activeTab === tab.id ? 'text-white' : 'text-[#1A0A00]'}`}
              >
                {tab.label}
              </p>
              <p className={`text-[10px] mt-1 ${activeTab === tab.id ? 'text-white/60' : 'text-[#7A3A18]/70'}`}>
                {tab.sub}
              </p>
            </div>
            <ChevronRight
              size={16}
              className={`ml-auto transition-colors ${activeTab === tab.id ? 'text-[#C45C26]' : 'text-[#C45C26]/20'}`}
            />
          </button>
        ))}
      </div>
 
      {/* Form Card */}
      <div className="bg-[#FDF6EE] rounded-3xl border border-[#C45C26]/[0.12] shadow-sm p-8">
        {activeTab === 'exclusive' ? <ExclusiveTourForm /> : <RequestTourForm />}
      </div>
    </div>
  );
};
 
export default ExclusiveTour;