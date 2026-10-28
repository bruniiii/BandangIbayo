import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { shrinkImage } from './imageCompress';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { notifyUser } from './notifications';
import { formatPeso, formatPickupTime, todayManila } from './tourUtils';
import { moneyInputProps, blockSignKeys, cleanMoney } from './moneyInput';
import { checkFields, textError, mediaFileError } from './validation';
import { BAG_TAG_FEE, expenseItems } from './tourExpenses';
import { X, Trash2, UploadCloud, Loader2 } from 'lucide-react';

// ─────────────────────────────────────────────
// TOUR PACKAGE FORM (admin, Exclusive Requests)
// The same form as "Create New Tour" in Tour Management, for an approved request:
//  - Tour request (open to other joiners): saving it posts the tour on Explore
//    Tours (with its Regular Rate, expenses and pickup points) and holds the
//    requester's slots for 2 days (hold_requested_slots) so they get priority.
//  - Exclusive tour: saved as the package the joiner pays a 50% downpayment on.
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
  const isOpenRequest = request.request_type === 'request' && request.tour_type === 'joiner';
  const pkg = request.package_details || {};
  const tourId = pkg.tour_id || null;
  const minStart = isOpenRequest ? addDays(todayManila(), APPROVAL_DAYS) : todayManila();

  const [form, setForm] = useState(() => ({
    title: pkg.title || request.destination || '',
    destination: pkg.destination || request.destination || '',
    price: pkg.price ?? (isOpenRequest ? '' : (request.budget || '')),
    regular_rate: pkg.regular_rate ?? '',
    group_size: pkg.group_size ?? (isOpenRequest ? Math.max(18, Number(request.group_size) || 0) : (Number(request.group_size) || '')),
    difficulty: pkg.difficulty || 'Easy',
    accommodation: pkg.accommodation || request.accommodation || '',
    description: pkg.description || pkg.additional_notes || '',
    inclusions: pkg.inclusions || '',
    exclusions: pkg.exclusions || '',
    things_to_bring: pkg.things_to_bring || '',
    itinerary: pkg.itinerary || '',
    important_note: pkg.important_note || '',
    start_date: pkg.start_date || request.preferred_date || '',
    end_date: pkg.end_date || request.preferred_end_date || request.preferred_date || '',
    van_rent: pkg.expenses?.van_rent ?? '',
    tour_guide: pkg.expenses?.tour_guide ?? '',
  }));
  const [others, setOthers] = useState(() => (pkg.expenses?.others || []).map((o) => ({ key: key(), name: o.name, amount: String(o.amount) })));
  const [pickups, setPickups] = useState(() => {
    const saved = Array.isArray(pkg.pickup_points) ? pkg.pickup_points : [];
    return saved.length ? saved.map((p) => ({ key: key(), location: p.location, time: to24h(p.time) })) : [{ key: key(), location: '', time: '' }];
  });
  const [gallery, setGallery] = useState(() => (Array.isArray(pkg.image_urls) ? pkg.image_urls : []));
  const [newFiles, setNewFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);
  const packageSent = () => !!request.package_sent_at;

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
  const setMoney = (field) => (e) => { setForm((f) => ({ ...f, [field]: cleanMoney(e.target.value) })); setDirty(true); };

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
      ...(isOpenRequest ? [
        ['regular_rate', !(regular >= 1000) ? 'The Regular Rate must be at least ₱1,000.' : regular > 7500 ? 'The Regular Rate can be at most ₱7,500.' : ''],
        ['price', !(price > 0) ? 'Please enter the Joiner Rate.' : price < regular + 500 ? `The Joiner Rate must be at least ₱500 more than the Regular Rate (at least ${formatPeso(regular + 500)}).` : price > 8000 ? 'The Joiner Rate can be at most ₱8,000.' : ''],
      ] : [
        ['price', !(price > 0) ? 'Please enter the package price.' : price > 1000000 ? 'That price looks too high. Please check for an extra zero.' : ''],
      ]),
      ['van_rent', !(van >= 15000) ? 'Van Rent must be at least ₱15,000.' : van > 30000 ? 'Van Rent can be at most ₱30,000.' : ''],
      ['tour_guide', !(guide >= 1300) ? 'Tour Guide must be at least ₱1,300.' : guide > 2000 ? 'Tour Guide can be at most ₱2,000.' : ''],
      ...extra.flatMap((o, i) => [
        [`other_name_${i}`, !o.name.trim() ? 'Name this expense, e.g. Entrance Fee.' : ''],
        [`other_amount_${i}`, !(String(o.amount).trim() !== '' && Number(o.amount) >= 0) ? 'Enter the amount (₱0 or more).' : ''],
      ]),
      ['start_date', !form.start_date ? 'Pick a start date.' : form.start_date < minStart
        ? (isOpenRequest ? 'The tour must start at least 2 weeks from today.' : "The start date can't be in the past.") : ''],
      ['end_date', !form.end_date ? 'Pick an end date.' : form.end_date < form.start_date ? "The end date can't be before the start date." : tripDays > 30 ? 'A tour longer than 30 days looks like a typo. Please check the dates.' : ''],
      ['pickup_0', stops.length === 0 ? 'Add at least one pickup point.' : ''],
      ...pickups.map((r, i) => {
        const loc = r.location.trim().toLowerCase();
        return [`pickup_${i}`, loc && pickups.findIndex((x) => x.location.trim().toLowerCase() === loc) !== i ? 'This pickup point is listed twice.' : ''];
      }),
      ['group_size', !Number.isInteger(slots) || slots < 1 ? 'Enter a whole number, at least 1.' : slots > 200 ? 'That looks too high. Please check the number.'
        : isOpenRequest && slots < requestedSlots ? `Max slots must fit the requester's group of ${requestedSlots}.` : ''],
      ['description', textError(form.description, 'Description', { required: false, max: 5000 })],
    ]);
    if (!ok) return;

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
        difficulty: form.difficulty,
        description: form.description,
        inclusions: form.inclusions,
        exclusions: form.exclusions,
        things_to_bring: form.things_to_bring,
        itinerary: form.itinerary,
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
        ...(isOpenRequest ? { regular_rate: Math.round(regular * 100) / 100, tour_id: savedTourId, held_booking_id: heldBooking?.id ?? pkg.held_booking_id ?? null } : { accommodation: form.accommodation }),
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
            ? `${details.title} on Explore Tours has new details. Open Exclusive Tours to see them.`
            : packageMessage({ details: { ...details, accommodation: form.accommodation }, expenses }),
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
          <h2 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 6px' }}>
            {isOpenRequest ? (tourId ? 'Edit Requested Tour' : 'Post Requested Tour') : 'Exclusive Tour Package'}
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

            <Field label="Tour Title" name="title" value={form.title} onChange={set('title')} placeholder="e.g., Mt. Pulag" maxLength={120} />

            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Destination" name="destination" data-allow="place" value={form.destination} onChange={set('destination')} maxLength={120} />
              {isOpenRequest
                ? <Field label="Joiner Rate (₱)" name="price" {...moneyInputProps} placeholder="₱1,500 – ₱8,000" value={form.price} onChange={setMoney('price')} />
                : <Field label="Package Price (₱, whole group)" name="price" {...moneyInputProps} placeholder="e.g. 55000" value={form.price} onChange={setMoney('price')} />}
            </div>
            {isOpenRequest ? (
              <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'end' }}>
                <Field label="Regular Rate (₱)" name="regular_rate" {...moneyInputProps} placeholder="₱1,000 – ₱7,500" value={form.regular_rate} onChange={setMoney('regular_rate')} />
                <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5, margin: '0 0 6px' }}>
                  Admins only, never shown to joiners. ₱1,000 to ₱7,500; the Joiner Rate (what joiners pay, up to ₱8,000) must be at least ₱500 more.
                </p>
              </div>
            ) : (
              <Field label="Accommodation" name="accommodation" value={form.accommodation} onChange={set('accommodation')} placeholder="e.g. AC Room, Private CR" maxLength={200} />
            )}

            {/* Expenses */}
            <div style={sectionBox}>
              <label style={{ ...labelStyle, opacity: 1 }}>Expenses</label>
              <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Van Rent (₱)" name="van_rent" {...moneyInputProps} placeholder="₱15,000 – ₱30,000" value={form.van_rent} onChange={setMoney('van_rent')} />
                <Field label="Tour Guide (₱)" name="tour_guide" {...moneyInputProps} placeholder="₱1,300 – ₱2,000" value={form.tour_guide} onChange={setMoney('tour_guide')} />
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
                    <input name={`other_amount_${i}`} {...moneyInputProps} value={o.amount}
                      onChange={(e) => { const v = cleanMoney(e.target.value); setOthers((rows) => rows.map((x) => (x.key === o.key ? { ...x, amount: v } : x))); setDirty(true); }} style={inputStyle} />
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
                Filled in from the request. {isOpenRequest ? 'It must start at least 2 weeks from today.' : 'Change them if you agreed on other dates.'}
              </p>
              <div className="tour-date-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end', background: '#FDF6EE', borderRadius: 14, padding: '10px 12px', border: '1px solid rgba(180,81,30,0.14)' }}>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input type="date" name="start_date" min={minStart} value={form.start_date} onChange={set('start_date')} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input type="date" name="end_date" min={form.start_date || minStart} value={form.end_date} onChange={set('end_date')} style={inputStyle} />
                </div>
                {durationOf(form.start_date, form.end_date) && (
                  <p style={{ gridColumn: '1 / -1', fontSize: 11.5, fontWeight: 700, color: '#7A3A18', margin: 0 }}>{durationOf(form.start_date, form.end_date)}</p>
                )}
              </div>
            </div>

            {/* Pickup points */}
            <div style={sectionBox}>
              <label style={{ ...labelStyle, opacity: 1 }}>Pickup Points</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pickups.map((r, i) => (
                  <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 40px', gap: 10, alignItems: 'end' }}>
                    <div>
                      <label style={labelStyle}>Place {pickups.length > 1 ? i + 1 : ''}</label>
                      <input name={`pickup_${i}`} value={r.location} maxLength={120} placeholder="e.g. Shell Mindanao Ave, QC"
                        onChange={(e) => { const v = e.target.value; setPickups((rows) => rows.map((x) => (x.key === r.key ? { ...x, location: v } : x))); setDirty(true); }} style={inputStyle} />
                    </div>
                    <button type="button" aria-label={`Remove pickup point ${i + 1}`} disabled={pickups.length === 1}
                      onClick={() => { setPickups((rows) => rows.filter((x) => x.key !== r.key)); setDirty(true); }} style={iconBtn(pickups.length === 1)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => { setPickups((rows) => [...rows, { key: key(), location: '', time: '' }]); setDirty(true); }} style={addBtn}>+ Add Pickup Point</button>
            </div>

            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={isOpenRequest ? 'Max Slots' : 'Group Size'} name="group_size" type="number" min="1" step="1" onKeyDown={blockSignKeys} value={form.group_size} onChange={set('group_size')} />
              <div>
                <label style={labelStyle}>Difficulty</label>
                <select name="difficulty" value={form.difficulty} onChange={set('difficulty')} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                  <option value="Easy">Easy</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Challenging">Challenging</option>
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Tour Description</label>
              <textarea name="description" value={form.description} onChange={set('description')} style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} />
            </div>

            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderTop: '1px solid rgba(180,81,30,0.12)', paddingTop: 16 }}>
              <div>
                <label style={labelStyle}>Inclusions</label>
                <textarea name="inclusions" value={form.inclusions} onChange={set('inclusions')} rows="4" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={labelStyle}>Exclusions</label>
                <textarea name="exclusions" value={form.exclusions} onChange={set('exclusions')} rows="4" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>

            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Things to Bring</label>
                <textarea name="things_to_bring" value={form.things_to_bring} onChange={set('things_to_bring')} rows="3" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={labelStyle}>Itinerary</label>
                <textarea name="itinerary" value={form.itinerary} onChange={set('itinerary')} rows="3" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>

            <div>
              <label style={{ ...labelStyle, color: '#A8481A', opacity: 1 }}>Important Notes</label>
              <textarea name="important_note" value={form.important_note} onChange={set('important_note')} rows="2"
                style={{ ...inputStyle, background: 'rgba(180,81,30,0.07)', color: '#A8481A', fontWeight: 700, resize: 'vertical' }} />
            </div>
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
    if (feedError) console.error('Error auto-posting tour to feed:', feedError.message);
  }
  return id;
};

// The exclusive package as a notification message (expense names only).
const packageMessage = ({ details, expenses }) => {
  const lines = [`📍 ${details.title} — ${details.destination}`];
  lines.push(`📅 ${details.start_date}${details.end_date && details.end_date !== details.start_date ? ` to ${details.end_date}` : ''}`);
  lines.push(`💰 Package price: ${formatPeso(details.price)}`);
  if (details.accommodation) lines.push(`🏨 Accommodation: ${details.accommodation}`);
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
