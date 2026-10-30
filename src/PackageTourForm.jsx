import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { shrinkImage } from './imageCompress';
import { toast, reportError } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { notifyUser } from './notifications';
import { formatPeso, formatPickupTime, todayManila, rateChecks, RATE_HINT, MAX_TOUR_DAYS, MAX_TOUR_SLOTS, linesOf } from './tourUtils';
import { ListField, ItineraryField } from './ui/TourListFields';
import { parseItinerary, serializeItinerary, itineraryDays } from './itinerary';
import { moneyField, blockSignKeys } from './moneyInput';
import { AccommodationCheckboxes } from './ui/Accommodation';
import { cleanAccommodation } from './accommodation';
import { formatYmdRange, daysLabel, tripDays as countDays } from './dateRange';
import { checkFields, textError, mediaFileError } from './validation';
import { BAG_TAG_FEE, expenseItems } from './tourExpenses';
import { X, Trash2, UploadCloud, Loader2 } from 'lucide-react';

// ─────────────────────────────────────────────
// TOUR PACKAGE FORM (admin, Exclusive Tours / Requested Tours)
// The same form as "Create New Tour" in Tour Management, for an approved request:
//  - REQUESTED TOUR: saving it posts the tour on Explore Tours (Regular Rate
//    ₱1,300–₱7,500, Joiner Rate ₱1,800–₱7,500, accommodation, expenses and
//    pickup points) and holds the requester's slots for 2 days
//    (hold_requested_slots) so they get priority.
//  - EXCLUSIVE TOUR: the package the joiner pays a 50% downpayment on. Its
//    dates and group size are the joiner's; the admin ticks the accommodation
//    the joiner can choose from.
// ─────────────────────────────────────────────

const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const durationOf = (start, end) => {
  if (!start || !end) return '';
  const days = Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1;
  return days <= 0 ? '' : days === 1 ? '1 Day' : `${days} Days`;
};
// "4:30 AM" -> "04:30" for the time picker.
const to24h = (value) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(value || '').trim());
  if (!m) return '';
  let h = Number(m[1]) % 12;
  if (m[3] && m[3].toUpperCase() === 'PM') h += 12;
  if (!m[3]) h = Number(m[1]);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};
const key = () => Math.random().toString(36).slice(2);
// Requests are approved at least 2 weeks before the trip (same rule as approving).
const APPROVAL_DAYS = 14;

const PackageTourForm = ({ request, onClose, onSent }) => {
  const isOpenRequest = request.request_type === 'request';
  const pkg = request.package_details || {};
  const tourId = pkg.tour_id || null;
  const minStart = isOpenRequest ? addDays(todayManila(), APPROVAL_DAYS) : todayManila();

  const [form, setForm] = useState(() => ({
    title: pkg.title || request.destination || '',
    destination: pkg.destination || request.destination || '',
    price: pkg.price ?? (isOpenRequest ? '' : (request.budget || '')),
    regular_rate: pkg.regular_rate ?? '',
    // Exclusive tours keep the joiner's group size and dates.
    group_size: isOpenRequest ? (pkg.group_size ?? MAX_TOUR_SLOTS) : (Number(request.group_size) || ''),
    difficulty: pkg.difficulty || 'Easy',
    description: pkg.description || pkg.additional_notes || '',
    inclusions: pkg.inclusions || '',
    exclusions: pkg.exclusions || '',
    things_to_bring: pkg.things_to_bring || '',
    itinerary: pkg.itinerary || '',
    important_note: pkg.important_note || '',
    start_date: isOpenRequest ? (pkg.start_date || request.preferred_date || '') : (request.preferred_date || pkg.start_date || ''),
    end_date: isOpenRequest
      ? (pkg.end_date || request.preferred_end_date || request.preferred_date || '')
      : (request.preferred_end_date || request.preferred_date || pkg.end_date || ''),
    van_rent: pkg.expenses?.van_rent ?? '',
    tour_guide: pkg.expenses?.tour_guide ?? '',
  }));
  const [accommodation, setAccommodation] = useState(() => cleanAccommodation(pkg.accommodation_options));
  const [accommodationError, setAccommodationError] = useState('');
  const [others, setOthers] = useState(() => (pkg.expenses?.others || []).map((o) => ({ key: key(), name: o.name, amount: String(o.amount) })));
  const [pickups, setPickups] = useState(() => {
    const saved = Array.isArray(pkg.pickup_points) ? pkg.pickup_points : [];
    return saved.map((p) => ({ key: key(), location: p.location, time: to24h(p.time) }));
  });
  // Itinerary: { [day]: text }, Day 0 = the day before.
  const [itinerary, setItinerary] = useState(() => parseItinerary(pkg.itinerary));
  const [gallery, setGallery] = useState(() => (Array.isArray(pkg.image_urls) ? pkg.image_urls : []));
  const [newFiles, setNewFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);
  const packageSent = () => !!request.package_sent_at;
  // Requested tours: the rest of the form opens once the tour has a photo.
  const locked = isOpenRequest && gallery.length === 0 && newFiles.length === 0;
  // Pickup points: typed one at a time and added.
  // Each keeps its time (ETA) if one was already set.
  const pickedPlaces = pickups.map((r) => r.location.trim()).filter(Boolean);
  const setPickedPlaces = (places) => {
    setPickups((rows) => places.map((place) => rows.find((r) => r.location.trim() === place) || { key: key(), location: place, time: '' }));
    setDirty(true);
  };
  // Inclusions, Exclusions, Things to Bring: one item per line.
  const setLines = (field) => (items) => { setForm((f) => ({ ...f, [field]: items.join('\n') })); setDirty(true); };

  // A posted tour's pickup points and photos live on the tour itself.
  useEffect(() => {
    if (!tourId) return undefined;
    let active = true;
    Promise.all([
      supabase.from('tours').select('image_urls').eq('id', tourId).maybeSingle(),
      supabase.from('tour_meetups').select('location_name, scheduled_time').eq('tour_id', tourId).order('created_at', { ascending: true }),
    ]).then(([{ data: tour }, { data: stops }]) => {
      if (!active) return;
      if (Array.isArray(tour?.image_urls)) setGallery(tour.image_urls);
      if (stops?.length) setPickups(stops.map((m) => ({ key: key(), location: m.location_name, time: to24h(m.scheduled_time) })));
    });
    return () => { active = false; };
  }, [tourId]);

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setDirty(true); };
  // Price fields show 000,000,000.00; the form keeps the plain number.
  const money = (field) => moneyField(form[field], (v) => { setForm((f) => ({ ...f, [field]: v })); setDirty(true); });

  const close = async () => {
    if (dirty && !(await confirmDialog({ title: 'Discard your changes?', message: "The package details you entered won't be saved.", confirmLabel: 'Discard Changes', cancelLabel: 'Keep Editing', tone: 'danger' }))) return;
    onClose();
  };

  const pickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const problems = picked.map((f) => mediaFileError(f, { allowVideo: false })).filter(Boolean);
    if (problems.length) toast.error(`${problems.length} file${problems.length === 1 ? ' was' : 's were'} skipped`, problems.join('\n'));
    const files = picked.filter((f) => !mediaFileError(f, { allowVideo: false }));
    e.target.value = '';
    setNewFiles((prev) => [...prev, ...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    setDirty(true);
  };

  const uploadImages = async () => {
    const urls = [];
    for (const { file: original } of newFiles) {
      const file = await shrinkImage(original);
      const path = `tour-gallery/${Date.now()}_${key()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('tours').upload(path, file);
      if (error) throw error;
      urls.push(supabase.storage.from('tours').getPublicUrl(path).data.publicUrl);
    }
    return urls;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (locked) { toast.error('Add a photo first', 'Upload at least one photo of the tour.'); return; }
    const formEl = e.target;
    const price = Number(form.price);
    const regular = Number(form.regular_rate);
    const van = Number(form.van_rent);
    const guide = Number(form.tour_guide);
    const slots = Number(form.group_size);
    const tripDays = (new Date(form.end_date) - new Date(form.start_date)) / 86400000 + 1;
    const stops = pickups.map((r) => ({ ...r, location: r.location.trim() })).filter((r) => r.location);
    const extra = others.filter((o) => o.name.trim() || String(o.amount).trim());
    const requestedSlots = Number(request.group_size) || 1;

    const ok = checkFields(formEl, [
      ['title', textError(form.title, 'Tour title', { min: 3, max: 120 })],
      ['destination', textError(form.destination, 'Destination', { min: 2, max: 120 })],
      ...(isOpenRequest ? rateChecks(form.regular_rate === '' ? NaN : regular, form.price === '' ? NaN : price) : [
        ['price', !(price > 0) ? 'Please enter the package price.' : price > 1000000 ? 'That price looks too high. Please check for an extra zero.' : ''],
        ['regular_rate', !(regular > 0) ? 'Please enter the Regular Rate.' : regular > 1000000 ? 'That rate looks too high. Please check for an extra zero.' : ''],
      ]),
      ['van_rent', !(van >= 15000) ? 'Van Rent must be at least ₱15,000.' : van > 30000 ? 'Van Rent can be at most ₱30,000.' : ''],
      ['tour_guide', !(guide >= 1300) ? 'Tour Guide must be at least ₱1,300.' : guide > 2000 ? 'Tour Guide can be at most ₱2,000.' : ''],
      ...extra.flatMap((o, i) => [
        [`other_name_${i}`, !o.name.trim() ? 'Name this expense, e.g. Entrance Fee.' : ''],
        [`other_amount_${i}`, !(String(o.amount).trim() !== '' && Number(o.amount) >= 0) ? 'Enter the amount (₱0 or more).' : ''],
      ]),
      ['start_date', !form.start_date ? 'Pick a start date.' : form.start_date < minStart
        ? (isOpenRequest ? 'The tour must start at least 2 weeks from today.' : "The start date can't be in the past.") : ''],
      ['end_date', !form.end_date ? 'Pick an end date.' : form.end_date < form.start_date ? "The end date can't be before the start date." : tripDays > MAX_TOUR_DAYS ? `A tour can be at most 1 week (${MAX_TOUR_DAYS} days) long.` : ''],
      ['pickup_new', stops.length === 0 ? 'Add at least one pickup point.' : ''],
      ['group_size', !Number.isInteger(slots) || slots < 1 ? 'Enter a whole number, at least 1.' : isOpenRequest && slots > MAX_TOUR_SLOTS && slots !== Number(pkg.group_size) ? `A tour can have at most ${MAX_TOUR_SLOTS} slots.` : slots > 200 ? 'That looks too high. Please check the number.'
        : isOpenRequest && slots < requestedSlots ? `Max slots must fit the requester's group of ${requestedSlots}.` : ''],
      ['description', textError(form.description, 'Description', { required: false, max: 5000 })],
    ]);
    if (!ok) return;
    if (!isOpenRequest && accommodation.length === 0) {
      setAccommodationError('Tick at least one accommodation for the joiner to choose from.');
      formEl.querySelector('[name="accommodation_options"]')?.focus();
      return;
    }

    if (!(await confirmDialog(isOpenRequest
      ? (tourId
        ? { title: 'Save this tour?', message: 'The posted tour on Explore Tours is updated right away.', confirmLabel: 'Save Tour', cancelLabel: 'Keep Editing' }
        : { title: 'Post this tour?', message: `It opens for booking on Explore Tours right away, and ${request.full_name || 'the requester'} gets ${requestedSlots} slot${requestedSlots === 1 ? '' : 's'} held for 2 days to pay.`, confirmLabel: 'Post Tour', cancelLabel: 'Keep Editing' })
      : { title: packageSent() ? 'Send the updated package?' : 'Send this package?', message: `${request.full_name || 'The joiner'} will be notified and can pay the 50% downpayment.`, confirmLabel: 'Send Package', cancelLabel: 'Keep Editing' }))) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const image_urls = [...gallery, ...(await uploadImages())];
      const expenses = {
        van_rent: Math.round(van * 100) / 100,
        tour_guide: Math.round(guide * 100) / 100,
        bag_tag: BAG_TAG_FEE,
        others: extra.map((o) => ({ name: o.name.trim(), amount: Math.round(Number(o.amount) * 100) / 100 })),
      };
      // Times (ETAs) are set later in Tracking Management; keep any already set.
      const pickup_points = stops.map((r) => ({ location: r.location, time: r.time ? formatPickupTime(r.time) : '' }));
      const details = {
        title: form.title.trim(),
        destination: form.destination.trim(),
        price: Math.round(price * 100) / 100,
        group_size: slots,
        ...(isOpenRequest ? { difficulty: form.difficulty } : {}),
        accommodation_options: cleanAccommodation(accommodation),
        description: form.description,
        inclusions: form.inclusions,
        exclusions: form.exclusions,
        things_to_bring: form.things_to_bring,
        // Only the days the tour has (Day 0 to its last day).
        itinerary: serializeItinerary(Object.fromEntries(itineraryDays(form.start_date, form.end_date).map(({ day }) => [day, itinerary[day]]).filter(([, v]) => v))),
        important_note: form.important_note,
        start_date: form.start_date,
        end_date: form.end_date,
      };

      let savedTourId = tourId;
      let heldBooking = null;
      if (isOpenRequest) {
        savedTourId = await saveTour({ tourId, details, image_urls, regular, expenses, pickup_points });
        const { data, error } = await supabase.rpc('hold_requested_slots', { p_request_id: request.id, p_tour_id: savedTourId });
        if (error) toast.error("Tour posted, but the requester's slots weren't held", error.message);
        else heldBooking = data;
      }

      const sentAt = new Date().toISOString();
      const packageDetails = {
        ...details,
        regular_rate: Math.round(regular * 100) / 100,
        ...(isOpenRequest ? { tour_id: savedTourId, held_booking_id: heldBooking?.id ?? pkg.held_booking_id ?? null } : {}),
        expenses,
        pickup_points,
        image_urls,
      };
      const { error: updateError } = await supabase.from('exclusive_requests')
        .update({ package_details: packageDetails, package_sent_at: sentAt }).eq('id', request.id);
      if (updateError) throw updateError;

      // The database already told the requester about their held slots the
      // first time; otherwise send the package (or its update).
      if (request.user_id && !(isOpenRequest && !tourId)) {
        await notifyUser(request.user_id, {
          title: isOpenRequest ? 'Your requested tour was updated' : (packageSent() ? 'Your tour package was updated 📋' : 'Your Tour Package Details 📋'),
          message: isOpenRequest
            ? `${details.title} on Explore Tours has new details. Open Request a Tour to see them.`
            : packageMessage({ details, expenses }),
          type: 'exclusive_package',
          related_id: request.id,
        });
      }

      setDirty(false);
      toast.success(isOpenRequest ? (tourId ? 'Tour saved' : 'Tour posted') : 'Package sent',
        isOpenRequest
          ? (tourId ? 'Explore Tours shows the new details.' : `It's on Explore Tours, and ${request.full_name || 'the requester'}'s slots are held for 2 days.`)
          : 'The joiner was notified with the full package details.');
      onSent({ pkg: packageDetails, sentAt });
    } catch (err) {
      toast.error(isOpenRequest ? "Couldn't post the tour" : "Couldn't send the package", err.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.82)', backdropFilter: 'blur(4px)' }} onClick={close} />
      <form
        onSubmit={submit}
        noValidate
        style={{
          position: 'relative', background: '#FDF6EE', width: '100%', maxWidth: 720, borderRadius: 28,
          boxShadow: '0 32px 80px rgba(26,10,0,0.4)', overflow: 'hidden', borderTop: '8px solid #B4511E',
          maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
        }}
      >
        <button type="button" onClick={close} aria-label="Close" style={{ position: 'absolute', top: 20, right: 20, zIndex: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(122,58,24,0.85)' }}>
          <X size={22} />
        </button>

        <div className="responsive-modal-padding" style={{ padding: '2.5rem', overflowY: 'auto', flex: 1 }}>
          <p style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 4px' }}>
            {isOpenRequest ? 'Requested Tour' : 'Exclusive Tour'}
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 6px' }}>
            {isOpenRequest ? (tourId ? 'Edit the Tour' : 'Create & Post the Tour') : (packageSent() ? 'Edit the Tour Package' : 'Create the Tour Package')}
          </h2>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '0 0 24px', lineHeight: 1.6 }}>
            {isOpenRequest
              ? <>Requested by <strong>{request.full_name || 'a joiner'}</strong> for {request.group_size || 1} {Number(request.group_size) === 1 ? 'person' : 'people'}. It's posted on Explore Tours for other joiners, and their {Number(request.group_size) === 1 ? 'slot is' : 'slots are'} held for 2 days so they can pay first.</>
              : <>A private tour for <strong>{request.full_name || 'the joiner'}</strong>'s group of {request.group_size || '—'}. Only they see this package, and they confirm it with a 50% downpayment.</>}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Gallery */}
            <div style={{ background: '#F2E4D0', borderRadius: 18, padding: '1.25rem', border: '2px dashed rgba(180,81,30,0.25)' }}>
              <label style={{ ...labelStyle, opacity: 1 }}>Tour Gallery</label>
              {(gallery.length > 0 || newFiles.length > 0) && (
                <div className="responsive-form-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                  {gallery.map((url) => (
                    <Thumb key={url} src={url} onRemove={() => { setGallery((g) => g.filter((u) => u !== url)); setDirty(true); }} />
                  ))}
                  {newFiles.map((f) => (
                    <Thumb key={f.preview} src={f.preview} isNew onRemove={() => setNewFiles((n) => n.filter((x) => x.preview !== f.preview))} />
                  ))}
                </div>
              )}
              <div style={{ position: 'relative', width: 'fit-content' }}>
                <div style={{
                  background: '#1A0A00', color: '#FDF6EE', borderRadius: 999, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: '0 4px 14px rgba(26,10,0,0.2)',
                }}>
                  <UploadCloud size={14} /> Upload Images
                </div>
                <input type="file" accept="image/*" multiple onChange={pickFiles} aria-label="Upload images"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
              </div>
            </div>

            {locked && (
              <p role="status" style={{ margin: '-8px 0 0', fontSize: 12.5, fontWeight: 800, color: '#8C2F1C' }}>
                Upload at least one photo first. The other fields open after that.
              </p>
            )}
            <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20, opacity: locked ? 0.45 : 1, cursor: locked ? 'not-allowed' : undefined }}>
            <Field label="Tour Title" name="title" value={form.title} onChange={set('title')} placeholder="e.g., Mt. Pulag" maxLength={120} />

            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Destination" name="destination" data-allow="place" value={form.destination} onChange={set('destination')} maxLength={120} />
              <Field label="Regular Rate (₱)" name="regular_rate" {...money('regular_rate')} placeholder={isOpenRequest ? '1,300.00 – 7,500.00' : 'e.g. 45,000.00'} />
            </div>
            {isOpenRequest ? (
              <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'end' }}>
                <Field label="Joiner Rate (₱)" name="price" {...money('price')} placeholder="1,800.00 – 7,500.00" />
                <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5, margin: '0 0 6px' }}>{RATE_HINT}</p>
              </div>
            ) : (
              <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'end' }}>
                <Field label="Package Price (₱, whole group)" name="price" {...money('price')} placeholder="e.g. 55,000.00" />
                <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5, margin: '0 0 6px' }}>
                  The Package Price is what the joiner pays (50% downpayment first). The Regular Rate is for admins only.
                </p>
              </div>
            )}
            <AccommodationCheckboxes
              value={accommodation}
              required={!isOpenRequest}
              error={accommodationError}
              onChange={(v) => { setAccommodation(v); setAccommodationError(''); setDirty(true); }}
            />

            {/* Expenses */}
            <div style={sectionBox}>
              <label style={{ ...labelStyle, opacity: 1 }}>Expenses</label>
              <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Van Rent (₱)" name="van_rent" {...money('van_rent')} placeholder="15,000.00 – 30,000.00" />
                <Field label="Tour Guide (₱)" name="tour_guide" {...money('tour_guide')} placeholder="1,300.00 – 2,000.00" />
                <div>
                  <label style={labelStyle}>Bag Tag (₱)</label>
                  <p style={{ ...inputStyle, margin: 0, background: 'rgba(242,228,208,0.6)' }}>{BAG_TAG_FEE.toFixed(2)} <span style={{ fontWeight: 600, color: '#7A3A18' }}>(fixed)</span></p>
                </div>
              </div>
              {others.map((o, i) => (
                <div key={o.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) 40px', gap: 10, alignItems: 'end', marginTop: 10 }}>
                  <div>
                    <label style={labelStyle}>Other expense</label>
                    <input name={`other_name_${i}`} value={o.name} maxLength={60} placeholder="e.g. Entrance Fee, Jeep"
                      onChange={(e) => { setOthers((rows) => rows.map((x) => (x.key === o.key ? { ...x, name: e.target.value } : x))); setDirty(true); }} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Amount (₱)</label>
                    <input name={`other_amount_${i}`} {...moneyField(o.amount, (v) => { setOthers((rows) => rows.map((x) => (x.key === o.key ? { ...x, amount: v } : x))); setDirty(true); })} style={inputStyle} />
                  </div>
                  <button type="button" aria-label="Remove this expense" onClick={() => { setOthers((rows) => rows.filter((x) => x.key !== o.key)); setDirty(true); }} style={iconBtn(false)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => { setOthers((rows) => [...rows, { key: key(), name: '', amount: '' }]); setDirty(true); }} style={addBtn}>+ Add Other Expense</button>
              <p style={hint}>Once they've paid, joiners see the names of these expenses (not the prices) on their booking and receipt.</p>
            </div>

            {/* Dates */}
            <div style={sectionBox}>
              <label style={{ ...labelStyle, opacity: 1 }}>Tour Dates</label>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '0 0 12px', lineHeight: 1.5 }}>
                {isOpenRequest ? `Filled in from the request. It must start at least 2 weeks from today and last at most ${MAX_TOUR_DAYS} days.` : "The joiner's requested dates."}
              </p>
              {!isOpenRequest ? (
                <p style={{ ...inputStyle, margin: 0, background: '#FDF6EE' }}>
                  {form.start_date ? `${formatYmdRange(form.start_date, form.end_date || form.start_date)} · ${daysLabel(countDays(form.start_date, form.end_date || form.start_date))}` : 'No dates in the request'}
                </p>
              ) : (
              <div className="tour-date-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end', background: '#FDF6EE', borderRadius: 14, padding: '10px 12px', border: '1px solid rgba(180,81,30,0.14)' }}>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input type="date" name="start_date" min={minStart} value={form.start_date} onChange={set('start_date')} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input type="date" name="end_date" min={form.start_date || minStart} max={form.start_date ? addDays(form.start_date, MAX_TOUR_DAYS - 1) : undefined} value={form.end_date} onChange={set('end_date')} style={inputStyle} />
                </div>
                {durationOf(form.start_date, form.end_date) && (
                  <p style={{ gridColumn: '1 / -1', fontSize: 11.5, fontWeight: 700, color: '#7A3A18', margin: 0 }}>{durationOf(form.start_date, form.end_date)}</p>
                )}
              </div>
              )}
            </div>

            {/* Pickup points */}
            <div style={sectionBox}>
              <ListField
                label="Pickup Points" required name="pickup_new" maxLength={120}
                items={pickedPlaces}
                onChange={setPickedPlaces}
                placeholder="Type one, then click Add (e.g. SM Mall of Asia)"
                hint="Add at least one. Joiners choose one of these when they book. Set each stop's time in Tracking Management."
              />
            </div>

            {isOpenRequest ? (
              <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label={`Max Slots (up to ${MAX_TOUR_SLOTS})`} name="group_size" type="number" min="1" max={MAX_TOUR_SLOTS} step="1" onKeyDown={blockSignKeys} value={form.group_size} onChange={set('group_size')} />
                <div>
                  <label style={labelStyle}>Difficulty</label>
                  <select name="difficulty" value={form.difficulty} onChange={set('difficulty')} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                    <option value="Easy">Easy</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Challenging">Challenging</option>
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Group Size</label>
                <p style={{ ...inputStyle, margin: 0, background: 'rgba(242,228,208,0.6)' }}>
                  {request.group_size || '—'} {Number(request.group_size) === 1 ? 'person' : 'people'} <span style={{ fontWeight: 600, color: '#7A3A18' }}>(from the request)</span>
                </p>
              </div>
            )}

            <div>
              <label style={labelStyle}>Tour Description</label>
              <textarea name="description" value={form.description} onChange={set('description')} style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} />
            </div>

            {[['inclusions', 'Inclusions', 'e.g. Van transfers'], ['exclusions', 'Exclusions', 'e.g. Meals not mentioned'], ['things_to_bring', 'Things to Bring', 'e.g. Valid ID']].map(([field, title, example]) => (
              <ListField key={field} label={title} name={`${field}_new`} items={linesOf(form[field])} onChange={setLines(field)} placeholder={`Type one, then click Add (${example})`} />
            ))}

            <ItineraryField
              start={form.start_date} end={form.end_date}
              value={itinerary}
              onChange={(v) => { setItinerary(v); setDirty(true); }}
            />

            <div>
              <label style={{ ...labelStyle, color: '#A8481A', opacity: 1 }}>Important Notes</label>
              <textarea name="important_note" value={form.important_note} onChange={set('important_note')}
                style={{ ...inputStyle, minHeight: 100, background: 'rgba(180,81,30,0.07)', color: '#A8481A', fontWeight: 700, resize: 'vertical' }} />
            </div>
            </fieldset>
          </div>
        </div>

        <div style={{ padding: '1.5rem 2.5rem', background: '#FDF6EE', borderTop: '1px solid rgba(180,81,30,0.12)', display: 'flex', gap: 12, flexShrink: 0 }}>
          <button type="button" onClick={close} style={{
            flex: 1, padding: '13px 0', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
            fontWeight: 900, fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#1A0A00',
          }}>Cancel</button>
          <button type="submit" disabled={saving} style={{
            flex: 2, padding: '13px 0', background: '#B4511E', border: 'none', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
            fontWeight: 900, fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#FDF6EE',
            boxShadow: '0 6px 20px rgba(180,81,30,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : isOpenRequest ? (tourId ? 'Save Tour' : 'Post Tour') : (packageSent() ? 'Send Updated Package' : 'Send Package')}
          </button>
        </div>
        <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
      </form>
    </div>
  );
};

// The tour on Explore Tours for a requested tour (like Tour Management saves
// one): the tour date, its Regular Rate, expenses, pickup points and, the
// first time, a feed post.
const saveTour = async ({ tourId, details, image_urls, regular, expenses, pickup_points }) => {
  const row = { ...details, image_urls, duration: durationOf(details.start_date, details.end_date), is_archived: false };
  let id = tourId;
  if (id) {
    const { error } = await supabase.from('tours').update(row).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('tours').insert([row]).select('id').single();
    if (error) throw error;
    id = data.id;
  }
  const { error: rateError } = await supabase.from('tour_rates').upsert([{ tour_id: id, regular_rate: Math.round(regular * 100) / 100 }], { onConflict: 'tour_id' });
  if (rateError) throw rateError;
  const { error: expError } = await supabase.from('tour_expenses').upsert([{ tour_id: id, ...expenses }], { onConflict: 'tour_id' });
  if (expError) throw expError;

  // Pickup points: add new ones, remove ones nobody picked (times are set in Tracking).
  const { data: existing } = await supabase.from('tour_meetups').select('id, location_name, scheduled_time').eq('tour_id', id);
  const names = pickup_points.map((p) => p.location.toLowerCase());
  for (const p of pickup_points) {
    const match = (existing || []).find((m) => m.location_name.trim().toLowerCase() === p.location.toLowerCase());
    if (!match) await supabase.from('tour_meetups').insert([{ tour_id: id, location_name: p.location, scheduled_time: p.time, status: 'DEPARTURE' }]);
  }
  for (const m of existing || []) {
    if (names.includes(m.location_name.trim().toLowerCase())) continue;
    const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true })
      .eq('tour_id', id).eq('pickup_point', m.location_name).not('booking_status', 'in', '("Cancelled","Rejected")');
    if (!count) await supabase.from('tour_meetups').delete().eq('id', m.id);
  }

  if (!tourId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: feedError } = await supabase.from('feed_posts').insert([{
      author_id: user?.id || null,
      content: `New tour posted: ${details.title} — ${details.destination}. Requested by a joiner, now open to everyone. Book your slot now!`,
      post_type: 'tour',
      tour_id: id,
    }]);
    if (feedError) reportError("Tour saved, but it wasn't posted to the feed", feedError.message);
  }
  return id;
};

// The exclusive package as a notification message (expense names only).
const packageMessage = ({ details, expenses }) => {
  const lines = [`📍 ${details.title} — ${details.destination}`];
  lines.push(`📅 ${details.start_date}${details.end_date && details.end_date !== details.start_date ? ` to ${details.end_date}` : ''}`);
  lines.push(`💰 Package price: ${formatPeso(details.price)}`);
  if (details.accommodation_options?.length) lines.push(`🏨 Accommodation (you choose when you pay): ${details.accommodation_options.join(', ')}`);
  if (details.itinerary) lines.push(`🗺️ Itinerary:\n${details.itinerary}`);
  if (details.inclusions) lines.push(`✅ Inclusions:\n${details.inclusions}`);
  if (details.exclusions) lines.push(`❌ Exclusions:\n${details.exclusions}`);
  if (details.things_to_bring) lines.push(`🎒 Things to Bring:\n${details.things_to_bring}`);
  lines.push(`🧾 Expenses covered: ${expenseItems(expenses).map((i) => i.label).join(', ')}`);
  if (details.important_note) lines.push(`📝 ${details.important_note}`);
  return `Here's the full package for your exclusive tour:\n\n${lines.join('\n\n')}\n\nOpen Exclusive Tours to pay the 50% downpayment.`;
};

const Thumb = ({ src, onRemove, isNew }) => (
  <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', border: isNew ? '2px solid #B4511E' : '1px solid rgba(180,81,30,0.2)' }}>
    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    <button type="button" onClick={onRemove} aria-label="Remove image" style={{
      position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer',
      background: 'rgba(26,10,0,0.75)', color: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}><X size={13} /></button>
  </div>
);

const Field = ({ label, ...props }) => (
  <div>
    <label style={labelStyle}>{label}</label>
    <input {...props} style={inputStyle} />
  </div>
);

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase',
  color: '#7A3A18', opacity: 0.9, marginBottom: 5,
};
const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.18)',
  borderRadius: 14, padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
};
const sectionBox = { background: 'rgba(180,81,30,0.06)', borderRadius: 18, padding: '1.25rem', border: '1px solid rgba(180,81,30,0.18)' };
const addBtn = {
  marginTop: 10, width: '100%', minHeight: 38, borderRadius: 12, cursor: 'pointer', border: '1px dashed rgba(180,81,30,0.45)',
  background: 'transparent', color: '#A8481A', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
};
const hint = { fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: '8px 0 0' };
const iconBtn = (disabled) => ({
  width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(122,58,24,0.3)', background: 'transparent', color: '#7A3A18',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
});

export default PackageTourForm;
