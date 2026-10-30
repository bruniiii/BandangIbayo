import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { shrinkImage } from './imageCompress';
import EmptyState from './ui/EmptyState';
import { SearchX, Map as MapIcon, CalendarPlus } from 'lucide-react';
import { toast, reportError } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { sendWaitlistOpeningsEmail } from './Email';
import JoinerListModal from './JoinerManifest';
import { formatPeso, archivePastTours, groupTripDates, formatDateRange as formatTourDates, salePriceOf, rateChecks, RATE_HINT, MAX_TOUR_DAYS, MAX_TOUR_SLOTS, linesOf } from './tourUtils';
import { moneyInputProps, blockSignKeys, moneyField, moneyNumber, moneyDisplay } from './moneyInput';
import { checkFields, textError, mediaFileError } from './validation';
import { Plus, Edit, Archive, X, Search, Loader2, Trash2, UploadCloud, RefreshCw, History, ChevronDown } from 'lucide-react';
import { SkeletonTourCards } from './ui/Skeleton';
import { addDaysYmd } from './dateRange';
import { AccommodationCheckboxes } from './ui/Accommodation';
import { cleanAccommodation } from './accommodation';
import { ListField, ItineraryField } from './ui/TourListFields';
import { parseItinerary, serializeItinerary, itineraryDays } from './itinerary';
import { tripDays } from './dateRange';
import { TourCard } from './TourCard';
import { TourViewModal } from './TourViewModal';

 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #F2E4D0  parchment (section bg)
// #7A3A18  rust mid-tone
// ---------------------------------------------------------
 
/* ─────────────────────────────────────────────
   TOUR MANAGEMENT  (Admin)
───────────────────────────────────────────── */
const TourManagement = () => {
  const [showModal, setShowModal]               = useState(false);
  const [viewTour, setViewTour]                 = useState(null);
  // A trip is one tour posting with one or more dates. Each date is its own
  // row in the tours table (bookings, slots and check-in are per date); the
  // dates of a trip share the title, destination, price and details, and
  // are edited together here.
  const [editingTour, setEditingTour]           = useState(null);
  const formTour = editingTour;
  // The form's dates: { key, id (saved dates only), start_date, end_date, booked }.
  const [dateRows, setDateRows]                 = useState([]);
  const [joinerListTour, setJoinerListTour]     = useState(null);
  const [tours, setTours]                       = useState([]);
  const [filteredTours, setFilteredTours]       = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [uploading, setUploading]               = useState(false);
  const [selectedImage, setSelectedImage]       = useState(null);
  const [savingTour, setSavingTour] = useState(false);
  const savingRef = useRef(false);                       // stops a double click from creating the tour twice
  const [formDirty, setFormDirty] = useState(false);     // unsaved edits in the tour form
  const [currentTab, setCurrentTab]             = useState('active');
  const [confirmAction, setConfirmAction]       = useState(null);
  const [searchQuery, setSearchQuery]           = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('All Difficulty');
  const [priceSort, setPriceSort]               = useState('default');
  const [tempGallery, setTempGallery]           = useState([]);
  const [newFiles, setNewFiles]                 = useState([]);
  // A tour needs at least one photo; the other fields stay locked until then.
  const hasPhoto = tempGallery.length > 0 || newFiles.length > 0;
 
  const formatDateRange = formatTourDates;
 
  const calculateDuration = (start, end) => {
    if (!start || !end) return '';
    const diffDays = Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1;
    return diffDays <= 0 ? '' : diffDays === 1 ? '1 Day' : `${diffDays} Days`;
  };
 
  // Closing the form with unsaved edits asks first, so a stray click doesn't lose them.
  const closeTourModal = async () => {
    if (formDirty && !(await confirmDialog({ title: 'Discard your changes?', message: "The changes you made to this tour won't be saved.", confirmLabel: 'Discard Changes', cancelLabel: 'Keep Editing', tone: 'danger' }))) return;
    setFormDirty(false);
    setShowModal(false);
  };

  const blankDateRow = () => ({ key: `new-${Math.random()}`, start_date: '', end_date: '', booked: 0, sale: false, sale_starts: '', sale_ends: '' });
  // Pickup points joiners choose from when booking (saved as each date's pickup stops).
  // The admin types each one and clicks Add.
  const [pickupPicked, setPickupPicked] = useState([]);
  // Inclusions, Exclusions and Things to Bring: one item per line, added one at a time.
  const [formLists, setFormLists] = useState({ inclusions: [], exclusions: [], things_to_bring: [] });
  const setList = (field) => (items) => { setFormLists((l) => ({ ...l, [field]: items })); setFormDirty(true); };
  // Itinerary: { [day]: text }, Day 0 = the day before.
  const [formItinerary, setFormItinerary] = useState({});
  // Other expenses besides van, guide and bag tag (e.g. entrance fee, jeep).
  const [otherExpenses, setOtherExpenses] = useState([]);
  // The Joiner Rate as typed (the field itself is uncontrolled), for the sale price preview.
  const [formTourPrice, setFormTourPrice] = useState('');
  // Accommodation joiners can choose from (Tent, AC Room, Non-AC Room); none means no choice.
  const [formAccommodation, setFormAccommodation] = useState([]);
  const blankExpense = () => ({ key: `e-${Math.random()}`, name: '', amount: '' });
  // Opens the form for a new trip, or for a trip's details and dates (withNewDate adds an empty date to fill in).
  const openTourForm = (trip = null, { withNewDate = false } = {}) => {
    setEditingTour(trip);
    const saved = (trip?.dates || []).map((d) => ({
      key: d.id, id: d.id, start_date: d.start_date, end_date: d.end_date, booked: d.current_booked || 0, original: d,
      sale: !!(d.sale_starts && d.sale_ends), sale_starts: d.sale_starts || '', sale_ends: d.sale_ends || '',
    }));
    setDateRows(trip ? (withNewDate ? [...saved, blankDateRow()] : saved) : [blankDateRow()]);
    const stops = trip?.pickup_points || [];
    const stopNames = [...new Set(stops.map((m) => m.location_name.trim()).filter(Boolean))];
    setPickupPicked(stopNames);
    setFormLists({ inclusions: linesOf(trip?.inclusions), exclusions: linesOf(trip?.exclusions), things_to_bring: linesOf(trip?.things_to_bring) });
    setFormItinerary(parseItinerary(trip?.itinerary));
    const others = Array.isArray(trip?.expenses?.others) ? trip.expenses.others : [];
    setOtherExpenses(others.map((o) => ({ key: `e-${Math.random()}`, name: o.name, amount: String(o.amount) })));
    setFormTourPrice(trip?.price ?? '');
    setFormAccommodation(cleanAccommodation(trip?.accommodation_options));
    setFormDirty(false);
    setShowModal(true);
  };
  const updateDateRow = (key, field, value) => { setDateRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r))); setFormDirty(true); };
  const removeDateRow = (key) => { setDateRows((rows) => rows.filter((r) => r.key !== key)); setFormDirty(true); };
  // The itinerary's days follow the first date; a trip with several dates uses its longest one.
  const firstDate = dateRows.find((r) => r.start_date) || null;
  const longestTrip = Math.max(0, ...dateRows.filter((r) => r.start_date && r.end_date && r.end_date >= r.start_date).map((r) => tripDays(r.start_date, r.end_date)));
  const itineraryStart = firstDate?.start_date || '';
  const itineraryEnd = itineraryStart && longestTrip ? addDaysYmd(itineraryStart, longestTrip - 1) : '';

  const getMinStartDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 21);
    return date.toISOString().split('T')[0];
  };
 
  const fetchTours = useCallback(async () => {
    setLoading(true);
    await archivePastTours();
    const { data, error } = await supabase
      .from('tours')
      .select('*')
      .eq('is_archived', currentTab === 'archive')
      .order('start_date', { ascending: currentTab !== 'archive' });
 
    if (error) { reportError("Couldn't load tours", error.message); setLoading(false); return; }
 
    const [{ data: bookingsData }, { data: ratesData }, { data: stopsData }, { data: expensesData }] = await Promise.all([
      supabase
        .from('bookings')
        .select('tour_id, slots_booked, payment_status, booking_status')
        .not('booking_status', 'eq', 'Cancelled'),
      // Regular Rate (admins only; empty before 20261103000000_cancel_chat_rates.sql).
      supabase.from('tour_rates').select('tour_id, regular_rate'),
      supabase.from('tour_meetups').select('id, tour_id, location_name, scheduled_time').order('created_at', { ascending: true }),
      supabase.from('tour_expenses').select('*'),
    ]);
    const expensesOf = Object.fromEntries((expensesData || []).map((e) => [e.tour_id, e]));
    const rateOf = Object.fromEntries((ratesData || []).map((r) => [r.tour_id, Number(r.regular_rate)]));
 
    const toursWithCounts = (data || []).map(tour => {
      const tourBookings  = (bookingsData || []).filter(b => b.tour_id === tour.id);
      const totalBooked   = tourBookings.reduce((sum, b) => sum + (b.slots_booked || 0), 0);
      const maxCapacity   = tour.group_size || 18;
      return {
        ...tour,
        regular_rate:       rateOf[tour.id] ?? null,
        pickup_points:      (stopsData || []).filter((m) => m.tour_id === tour.id),
        expenses:           expensesOf[tour.id] || null,
        current_booked:     totalBooked,
        available_slots:    Math.max(0, maxCapacity - totalBooked),
        bookings_pending:   tourBookings.filter(b => b.payment_status === 'Pending' || b.payment_status === 'Verification Pending').length,
        bookings_complete:  tourBookings.filter(b => b.payment_status === 'Complete').length,
        bookings_rejected:  tourBookings.filter(b => b.payment_status === 'Rejected').length,
        bookings_cancelled: tourBookings.filter(b => b.booking_status === 'Cancelled').length,
      };
    });
 
    const trips = groupTripDates(toursWithCounts, { openFirst: false });
    setTours(trips);
    setFilteredTours(trips);
    setLoading(false);
  }, [currentTab]);
 
  useEffect(() => {
    let result = [...tours];
    if (searchQuery) result = result.filter(t =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.destination.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (difficultyFilter !== 'All Difficulty') result = result.filter(t => t.difficulty === difficultyFilter);
    if (priceSort === 'highToLow') result.sort((a, b) => b.price - a.price);
    else if (priceSort === 'lowToHigh') result.sort((a, b) => a.price - b.price);
    setFilteredTours(result);
  }, [searchQuery, difficultyFilter, priceSort, tours]);
 
  useEffect(() => { fetchTours(); }, [fetchTours]);
 
  useEffect(() => {
    const channel = supabase
      .channel('tour-management-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => { fetchTours(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTours]);
 
  useEffect(() => {
    setTempGallery(editingTour ? editingTour.image_urls || [] : []);
    setNewFiles([]);
  }, [editingTour, showModal]);
 
  const executeToggleArchive = async () => {
    const { ids, isArchived } = confirmAction;
    const { error } = await supabase.from('tours').update({ is_archived: !isArchived }).in('id', ids);
    if (error) toast.error("Couldn't update the tour", error.message); else { toast.success(isArchived ? 'Tour restored' : 'Tour archived'); fetchTours(); }
    setConfirmAction(null);
  };
 
  const handleFileChange = (e) => {
    const picked = Array.from(e.target.files);
    const problems = picked.map((f) => mediaFileError(f, { allowVideo: false })).filter(Boolean);
    if (problems.length) toast.error(`${problems.length} file${problems.length === 1 ? ' was' : 's were'} skipped`, problems.join('\n'));
    const files = picked.filter((f) => !mediaFileError(f, { allowVideo: false }));
    e.target.value = '';
    setNewFiles(prev => [...prev, ...files.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
  };
 
  const uploadImages = async (filesToUpload) => {
    try {
      setUploading(true);
      const uploadedUrls = [];
      for (const fileObj of filesToUpload) {
        const file = await shrinkImage(fileObj.file); // phone photos are resized before upload
        const fileName = `${Math.random()}.${file.name.split('.').pop()}`;
        const { error: uploadError } = await supabase.storage.from('tours').upload(`tour-gallery/${fileName}`, file);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('tours').getPublicUrl(`tour-gallery/${fileName}`);
        uploadedUrls.push(data.publicUrl);
      }
      return uploadedUrls;
    } catch (error) { toast.error("Couldn't upload images", error.message); return []; }
    finally { setUploading(false); }
  };
 
  const handleRemoveExisting = (urlToRemove) => setTempGallery(tempGallery.filter(url => url !== urlToRemove));
  const handleRemoveNew      = (previewUrl)  => setNewFiles(newFiles.filter(f => f.preview !== previewUrl));
 
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (!hasPhoto) { toast.error('Add a photo first', 'Upload at least one photo of the tour.'); return; }
    const formEl    = e.target;
    const formData  = new FormData(formEl);
    const price     = moneyNumber(formData.get('price'));
    const regularRate = moneyNumber(formData.get('regular_rate'));
    const vanRent = moneyNumber(formData.get('van_rent'));
    const tourGuide = moneyNumber(formData.get('tour_guide'));
    const pickups = pickupPicked.map((location) => ({ location }));
    const pickupNames = pickups.map((r) => r.location.toLowerCase());
    const groupSize = Number(formData.get('group_size'));
    const minStart  = getMinStartDate();
    // Each date's typing mistakes, shown at that date's field. A saved date may
    // keep its start date even if it's now less than 3 weeks away.
    const dateChecks = dateRows.flatMap((r, i) => {
      const changed = !r.id || r.start_date !== r.original.start_date;
      const tripDays = (new Date(r.end_date) - new Date(r.start_date)) / 86400000 + 1;
      const label = dateRows.length > 1 ? `Date ${i + 1}: ` : '';
      return [
        [`start_date_${i}`, !r.start_date ? `${label}Pick a start date.` : ''],
        [`start_date_${i}`, changed && r.start_date < minStart ? `${label}The start date must be at least 3 weeks from today.` : ''],
        [`start_date_${i}`, dateRows.findIndex((o) => o.start_date === r.start_date) !== i ? `${label}This trip already has a date starting that day.` : ''],
        [`end_date_${i}`, !r.end_date ? `${label}Pick an end date.` : ''],
        [`end_date_${i}`, r.end_date < r.start_date ? `${label}The end date can't be before the start date.` : ''],
        [`end_date_${i}`, tripDays > MAX_TOUR_DAYS ? `${label}A tour can be at most 1 week (${MAX_TOUR_DAYS} days) long.` : ''],
        // Sale (5% off the Joiner Rate) on this date only, ending by the day the tour starts.
        [`sale_starts_${i}`, r.sale && !r.sale_starts ? `${label}Pick when the sale starts.` : ''],
        [`sale_ends_${i}`, r.sale && !r.sale_ends ? `${label}Pick when the sale ends.` : ''],
        [`sale_ends_${i}`, r.sale && r.sale_ends < r.sale_starts ? `${label}The sale can't end before it starts.` : ''],
        [`sale_ends_${i}`, r.sale && r.start_date && r.sale_ends > r.start_date ? `${label}The sale must end by the tour's start date.` : ''],
      ];
    });
    const mostBooked = dateRows.reduce((m, r) => (r.booked > m.booked ? r : m), { booked: 0 });

    // Typing mistakes, shown at the field: blank titles, an end date before the
    // start, fewer slots than joiners already booked, price typos.
    const ok = dateRows.length > 0 && checkFields(formEl, [
      ['title', textError(formData.get('title'), 'Tour title', { min: 3, max: 120 })],
      ['destination', textError(formData.get('destination'), 'Destination', { min: 2, max: 120 })],
      ...rateChecks(regularRate, price),
      ...dateChecks,
      ['van_rent', !Number.isFinite(vanRent) || vanRent < 15000 ? 'Van Rent must be at least ₱15,000.' : ''],
      ['van_rent', vanRent > 30000 ? 'Van Rent can be at most ₱30,000.' : ''],
      ['tour_guide', !Number.isFinite(tourGuide) || tourGuide < 1300 ? 'Tour Guide must be at least ₱1,300.' : ''],
      ['tour_guide', tourGuide > 2000 ? 'Tour Guide can be at most ₱2,000.' : ''],
      ...otherExpenses.flatMap((o, i) => [
        [`other_name_${i}`, (o.name.trim() || o.amount) && !o.name.trim() ? 'Name this expense, e.g. Entrance Fee.' : ''],
        [`other_amount_${i}`, o.name.trim() && !(Number(o.amount) >= 0 && String(o.amount).trim() !== '') ? 'Enter the amount (₱0 or more).' : ''],
      ]),
      ['pickup_new', pickups.length === 0 ? 'Add at least one pickup point, so joiners can choose where to be picked up.' : ''],
      ['group_size', !Number.isInteger(groupSize) || groupSize < 1 ? 'Max slots must be a whole number, at least 1.' : ''],
      // (An older tour keeps a bigger number as long as it isn't changed.)
      ['group_size', groupSize > MAX_TOUR_SLOTS && groupSize !== Number(editingTour?.group_size) ? `A tour can have at most ${MAX_TOUR_SLOTS} slots per date.` : ''],
      ['group_size', groupSize < mostBooked.booked ? `${mostBooked.booked} joiner${mostBooked.booked === 1 ? ' has' : 's have'} already booked one of the dates, so max slots can't be lower than ${mostBooked.booked}.` : ''],
      ['description', textError(formData.get('description'), 'Description', { required: false, max: 5000 })],
    ]);
    if (!ok) { if (dateRows.length === 0) toast.error('Add at least one date', 'A tour needs a date for joiners to book.'); return; }
    // Ask before saving, so a tour isn't posted or changed by accident.
    if (!(await confirmDialog(editingTour
      ? { title: 'Save changes to this tour?', message: 'Joiners will see the updated details right away.', confirmLabel: 'Save Changes', cancelLabel: 'Keep Editing' }
      : { title: 'Post this tour?', message: 'It will be open for joiners to book right away.', confirmLabel: 'Post Tour', cancelLabel: 'Keep Editing' }))) return;
    const movedBooked = dateRows.filter((r) => r.id && r.booked > 0 && (r.start_date !== r.original.start_date || r.end_date !== r.original.end_date));
    if (movedBooked.length
      && !(await confirmDialog({ title: 'Change the dates of a booked tour?', message: `Joiners have already booked ${movedBooked.length === 1 ? 'a date you changed' : `${movedBooked.length} of the dates you changed`}. Changing the dates won't tell them automatically.`, confirmLabel: 'Save New Dates', cancelLabel: 'Keep Old Dates' }))) return;
    const removed = (editingTour?.dates || []).filter((d) => !dateRows.some((r) => r.id === d.id));

    savingRef.current = true;
    setSavingTour(true);
    try {
    let finalGallery = [...tempGallery];
    if (newFiles.length > 0) { const newUrls = await uploadImages(newFiles); finalGallery = [...finalGallery, ...newUrls]; }

    // Details every date of the trip shares.
    const shared = {
      description:    formData.get('description'),
      price:          Math.round(price * 100) / 100,
      title:          String(formData.get('title')).trim(),
      destination:    String(formData.get('destination')).trim(),
      group_size:     groupSize,
      difficulty:     formData.get('difficulty'),
      inclusions:     formLists.inclusions.join('\n'),
      exclusions:     formLists.exclusions.join('\n'),
      things_to_bring: formLists.things_to_bring.join('\n'),
      // Only the days the tour has (Day 0 to its last day).
      itinerary:      serializeItinerary(Object.fromEntries(itineraryDays(itineraryStart, itineraryEnd).map(({ day }) => [day, formItinerary[day]]).filter(([, v]) => v))),
      important_note: formData.get('important_note'),
      image_urls:     finalGallery,
      accommodation_options: cleanAccommodation(formAccommodation),
      is_archived:    false,
    };
    const withDates = (r) => ({
      ...shared, start_date: r.start_date, end_date: r.end_date, duration: calculateDuration(r.start_date, r.end_date),
      sale_starts: r.sale ? r.sale_starts : null, sale_ends: r.sale ? r.sale_ends : null,
    });

    const isNewTour = !editingTour;
    const saved = dateRows.filter((r) => r.id);
    const added = dateRows.filter((r) => !r.id);
    const results = await Promise.all([
      ...saved.map((r) => supabase.from('tours').update(withDates(r)).eq('id', r.id)),
      // Dates taken off the trip are archived, not deleted (only dates nobody booked can be removed).
      ...(removed.length ? [supabase.from('tours').update({ is_archived: true }).in('id', removed.map((d) => d.id))] : []),
    ]);
    let inserted = [];
    if (added.length) {
      const { data, error } = await supabase.from('tours').insert(added.map(withDates)).select();
      results.push({ error });
      inserted = data || [];
    }
    const failed = results.find((r) => r.error);
    if (failed) { toast.error("Couldn't save the tour", failed.error.message); fetchTours(); return; }

    // Regular Rate of every date of the trip (kept apart from tours so joiners never see it).
    const rateIds = [...saved.map((r) => r.id), ...inserted.map((t) => t.id)];
    if (rateIds.length) {
      const { error: rateError } = await supabase.from('tour_rates')
        .upsert(rateIds.map((id) => ({ tour_id: id, regular_rate: Math.round(regularRate * 100) / 100 })), { onConflict: 'tour_id' });
      if (rateError) toast.error("Tour saved, but the Regular Rate wasn't", rateError.message);

      // Expenses of every date (Van Rent, Tour Guide, Bag Tag ₱260, others).
      const others = otherExpenses.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), amount: Math.round(Number(o.amount) * 100) / 100 }));
      const { error: expError } = await supabase.from('tour_expenses').upsert(rateIds.map((id) => ({
        tour_id: id, van_rent: Math.round(vanRent * 100) / 100, tour_guide: Math.round(tourGuide * 100) / 100, bag_tag: 260, others,
      })), { onConflict: 'tour_id' });
      if (expError) toast.error("Tour saved, but the expenses weren't", expError.message);

      // Pickup points: add new ones, remove ones nobody picked.
      const kept = [];
      for (const id of rateIds) {
        const existing = [...(editingTour?.dates || [])].find((d) => d.id === id)?.pickup_points || [];
        for (const r of pickups) {
          const match = existing.find((m) => m.location_name.trim().toLowerCase() === r.location.toLowerCase());
          // No time here: the ETA of each stop is set in Tracking Management.
          if (!match) {
            await supabase.from('tour_meetups').insert([{ tour_id: id, location_name: r.location, scheduled_time: '', status: 'DEPARTURE' }]);
          }
        }
        for (const m of existing) {
          if (pickupNames.includes(m.location_name.trim().toLowerCase())) continue;
          const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true })
            .eq('tour_id', id).eq('pickup_point', m.location_name).not('booking_status', 'in', '("Cancelled","Rejected")');
          if (count) kept.push(m.location_name);
          else await supabase.from('tour_meetups').delete().eq('id', m.id);
        }
      }
      if (kept.length) toast.info('Some pickup points were kept', `Joiners already chose ${[...new Set(kept)].join(', ')}, so ${kept.length === 1 ? 'it stays' : 'they stay'}. Move those joiners first to remove ${kept.length === 1 ? 'it' : 'them'}.`);
    }
    setFormDirty(false);

    // A bigger group size may open slots: email anyone on the waitlist (the database already notified them in-app).
    saved.forEach((r) => { if (groupSize > (r.original.group_size || 0)) sendWaitlistOpeningsEmail({ tourId: r.id }); });

    // Auto-post new tours and new dates to the community feed.
    if (inserted[0]?.id) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: feedError } = await supabase.from('feed_posts').insert([{
        author_id: user?.id || null,
        content: isNewTour
          ? `New tour posted: ${shared.title} — ${shared.destination}. Book your slot now!`
          : `New date${inserted.length > 1 ? 's' : ''} added: ${shared.title} — ${shared.destination}. Book your slot now!`,
        post_type: 'tour',
        tour_id: inserted[0].id,
      }]);
      if (feedError) reportError("Tour saved, but it wasn't posted to the feed", feedError.message);
    }

    toast.success(isNewTour ? 'Tour created' : 'Tour saved', isNewTour ? 'It\'s now open for booking and posted to the feed.' : added.length ? `${added.length} new date${added.length > 1 ? 's are' : ' is'} open for booking.` : '');
    setEditingTour(null);
    setShowModal(false);
    fetchTours();
    } finally {
      savingRef.current = false;
      setSavingTour(false);
    }
  };
 
  // ── shared input style ──
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#F2E4D0',
    border: '1px solid rgba(180,81,30,0.18)',
    borderRadius: 14,
    padding: '10px 14px',
    fontSize: 13, fontWeight: 600,
    color: '#1A0A00',
    fontFamily: 'inherit',
    outline: 'none',
  };
 
  const labelStyle = {
    display: 'block',
    fontSize: 11, fontWeight: 800,
    letterSpacing: '0.2em', textTransform: 'uppercase',
    color: '#7A3A18', opacity: 0.9,
    marginBottom: 5,
  };
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
 
      {joinerListTour && (
        <JoinerListModal tour={joinerListTour} onClose={() => setJoinerListTour(null)} />
      )}

      {/* ── Confirm Archive/Restore ── */}
      {confirmAction && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)',
          padding: 16,
        }}>
          <div style={{
            background: '#FDF6EE', padding: '3rem',
            borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
            textAlign: 'center', width: '100%', maxWidth: 420,
            borderTop: `8px solid ${confirmAction.isArchived ? '#B4511E' : '#E8A265'}`,
          }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: confirmAction.isArchived ? '#B4511E' : '#1A0A00',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 28px',
              color: '#FDF6EE',
              boxShadow: '0 12px 32px rgba(26,10,0,0.25)',
            }}>
              {confirmAction.isArchived ? <RefreshCw size={38} /> : <Archive size={38} />}
            </div>
            <h3 style={{
              fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em',
              textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 12px',
            }}>
              {confirmAction.isArchived ? 'Restore Tour?' : 'Archive Tour?'}
            </h3>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', opacity: 0.9, lineHeight: 1.7, margin: '0 0 32px' }}>
              {confirmAction.isArchived
                ? 'This tour will be moved back to the active listings.'
                : 'This tour will be moved to your private archives.'}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setConfirmAction(null)}
                style={{
                  flex: 1, padding: '13px 0',
                  background: '#F2E4D0',
                  border: '1px solid rgba(180,81,30,0.18)',
                  borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: '#7A3A18',
                }}
              >Cancel</button>
              <button
                onClick={executeToggleArchive}
                style={{
                  flex: 1, padding: '13px 0',
                  background: '#B4511E',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: '#FDF6EE',
                  boxShadow: '0 6px 20px rgba(180,81,30,0.3)',
                }}
              >{confirmAction.isArchived ? 'Restore Tour' : 'Archive Tour'}</button>
            </div>
          </div>
        </div>
      )}
 
      {/* ── Image Lightbox ── */}
      {selectedImage && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.95)', padding: 16,
          }}
          onClick={() => setSelectedImage(null)}
        >
          <button style={{
            position: 'absolute', top: 32, right: 32,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#FDF6EE',
          }}>
            <X size={40} />
          </button>
          <img src={selectedImage} style={{ maxWidth: '100%', maxHeight: '90dvh', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }} alt="Preview" />
        </div>
      )}
 
      {/* ── Scrollable Content (header + filters + grid scroll together) ── */}
      <div>

      {/* ── Header Tabs ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(180,81,30,0.15)',
        paddingBottom: 16, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <button
            onClick={() => setCurrentTab('active')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', padding: 0,
              fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em',
              color: currentTab === 'active' ? '#1A0A00' : 'rgba(122,58,24,0.85)',
              transition: 'color 0.2s',
            }}
          >Active Tours</button>
          <span style={{ color: '#A8481A', fontSize: 18 }}>|</span>
          <button
            onClick={() => setCurrentTab('archive')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', padding: 0,
              fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em',
              color: currentTab === 'archive' ? '#1A0A00' : 'rgba(122,58,24,0.85)',
              transition: 'color 0.2s',
            }}
          >
            <History size={18} /> Tour Archive
          </button>
        </div>
        <button
          onClick={() => openTourForm()}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#B4511E', color: '#FDF6EE',
            border: 'none', borderRadius: 999, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 900,
            fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
            padding: '12px 22px',
            boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#a34d20'}
          onMouseLeave={e => e.currentTarget.style.background = '#B4511E'}
        >
          <Plus size={16} strokeWidth={3} /> Create New Tour
        </button>
      </div>
 
      {/* ── Filters ── */}
      <div style={{
        background: '#FDF6EE',
        borderRadius: 20, padding: '14px 18px',
        border: '1px solid rgba(180,81,30,0.12)',
        boxShadow: '0 4px 16px rgba(26,10,0,0.05)',
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        marginBottom: 24,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={15} style={{
            position: 'absolute', left: 13, top: '50%',
            transform: 'translateY(-50%)',
            color: 'rgba(122,58,24,0.85)', pointerEvents: 'none',
          }} />
          <input
            type="text" placeholder="Search tours…"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 36 }}
          />
        </div>
        {/* Difficulty */}
        <div style={{ position: 'relative', minWidth: 160 }}>
          <select
            value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)}
            style={{ ...inputStyle, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}
          >
            <option value="All Difficulty">All Difficulty</option>
            <option value="Easy">Easy</option>
            <option value="Moderate">Moderate</option>
            <option value="Challenging">Challenging</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.85)' }} />
        </div>
        {/* Price sort */}
        <div style={{ position: 'relative', minWidth: 175 }}>
          <select
            value={priceSort} onChange={e => setPriceSort(e.target.value)}
            style={{ ...inputStyle, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}
          >
            <option value="default">Sort by Price</option>
            <option value="highToLow">High to Low</option>
            <option value="lowToHigh">Low to High</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.85)' }} />
        </div>
      </div>
 
      {/* ── Tour Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20, paddingBottom: 40 }}>
          {loading ? (
            <SkeletonTourCards count={6} />
          ) : filteredTours.length > 0 ? (
            filteredTours.map(tour => (
              <TourCard
                key={tour.id}
                tour={tour}
                onConfirmAction={() => setConfirmAction({ ids: tour.dates.map((d) => d.id), isArchived: tour.is_archived })}
                onView={() => setViewTour(tour)}
                onEdit={() => openTourForm(tour)}
                onAddDate={() => openTourForm(tour, { withNewDate: true })}
                onJoiners={(date) => setJoinerListTour(date)}
                formatDateRange={formatDateRange}
              />
            ))
          ) : (
            <div style={{ gridColumn: '1 / -1' }}>
              {(searchQuery || difficultyFilter !== 'All Difficulty') ? (
                <EmptyState
                  icon={SearchX}
                  title="No tours match your filters"
                  message="Try a different search or difficulty."
                  action={{ label: 'Clear Filters', onClick: () => { setSearchQuery(''); setDifficultyFilter('All Difficulty'); } }}
                />
              ) : currentTab === 'archive' ? (
                <EmptyState icon={Archive} title="The archive is empty" message="Tours you archive will be kept here, and you can restore them anytime." />
              ) : (
                <EmptyState
                  icon={MapIcon}
                  title="No active tours yet"
                  message="Create your first tour package so joiners can start booking."
                  action={{ label: 'Create a Tour', onClick: () => openTourForm() }}
                />
              )}
            </div>
          )}
      </div>

      </div>
 
      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.82)', backdropFilter: 'blur(4px)' }}
            onClick={closeTourModal}
          />
          <form
            onSubmit={handleFormSubmit}
            onInput={() => setFormDirty(true)}
            style={{
              position: 'relative', background: '#FDF6EE',
              width: '100%', maxWidth: 720,
              borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
              overflow: 'hidden',
              borderTop: '8px solid #B4511E',
              maxHeight: '90dvh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <button
              type="button" onClick={closeTourModal}
              style={{
                position: 'absolute', top: 20, right: 20, zIndex: 10,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(122,58,24,0.85)',
              }}
            ><X size={22} /></button>
 
            <div className="responsive-modal-padding" style={{ padding: '2.5rem', overflowY: 'auto', flex: 1 }}>
              <h2 style={{
                fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em',
                textTransform: 'uppercase', color: '#1A0A00', margin: '0 0 28px',
              }}>
                {editingTour ? 'Edit Tour Posting' : 'Create New Tour'}
              </h2>
 
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
 
                {/* Gallery */}
                <div style={{
                  background: '#F2E4D0',
                  borderRadius: 18, padding: '1.25rem',
                  border: '2px dashed rgba(180,81,30,0.25)',
                }}>
                  <label style={{ ...labelStyle, opacity: 1 }}>Tour Gallery Management</label>
                  {(tempGallery.length > 0 || newFiles.length > 0) && (
                    <div className="responsive-form-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                      {tempGallery.map((url, i) => (
                        <GalleryThumb key={`old-${i}`} src={url} onRemove={() => handleRemoveExisting(url)} isNew={false} />
                      ))}
                      {newFiles.map((fileObj, i) => (
                        <GalleryThumb key={`new-${i}`} src={fileObj.preview} onRemove={() => handleRemoveNew(fileObj.preview)} isNew />
                      ))}
                    </div>
                  )}
                  <div style={{ position: 'relative', width: 'fit-content' }}>
                    <div style={{
                      background: '#1A0A00', color: '#FDF6EE',
                      borderRadius: 999, padding: '10px 18px',
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
                      cursor: 'pointer', boxShadow: '0 4px 14px rgba(26,10,0,0.2)',
                    }}>
                      <UploadCloud size={14} /> Upload Images
                    </div>
                    <input type="file" accept="image/*" multiple onChange={handleFileChange}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                  </div>
                </div>
 
                {/* The rest of the form opens once the tour has at least one photo. */}
                {!hasPhoto && (
                  <p role="status" style={{ margin: '-8px 0 0', fontSize: 12.5, fontWeight: 800, color: '#8C2F1C' }}>
                    Upload at least one photo first. The other fields open after that.
                  </p>
                )}
                <fieldset disabled={!hasPhoto} aria-disabled={!hasPhoto} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20, opacity: hasPhoto ? 1 : 0.45, cursor: hasPhoto ? undefined : 'not-allowed' }}>
                <ModalInput label="Tour Title" name="title" defaultValue={formTour?.title} placeholder="e.g., Mt. Pulag" required />
 
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <ModalInput label="Destination" name="destination" data-allow="place" defaultValue={formTour?.destination} required />
                  <ModalInput label="Joiner Rate (₱)" name="price" {...moneyInputProps} placeholder="1,800.00 – 7,500.00" defaultValue={moneyDisplay(formTour?.price)} onChange={(e) => setFormTourPrice(String(moneyNumber(e.target.value) || ''))} required />
                </div>
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'end' }}>
                  <ModalInput label="Regular Rate (₱)" name="regular_rate" {...moneyInputProps} placeholder="1,300.00 – 7,500.00" defaultValue={moneyDisplay(formTour?.regular_rate)} required />
                  <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5, margin: '0 0 6px' }}>
                    {RATE_HINT}
                  </p>
                </div>

                <AccommodationCheckboxes value={formAccommodation} onChange={(v) => { setFormAccommodation(v); setFormDirty(true); }} />

                {/* Expenses: what this trip costs (booked joiners see the item names only, no prices; used for income in Reports). */}
                <div style={{ background: 'rgba(180,81,30,0.06)', borderRadius: 18, padding: '1.25rem', border: '1px solid rgba(180,81,30,0.18)' }}>
                  <label style={{ ...labelStyle, opacity: 1 }}>Expenses</label>
                  <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <ModalInput label="Van Rent (₱)" name="van_rent" {...moneyInputProps} placeholder="15,000.00 – 30,000.00" defaultValue={moneyDisplay(formTour?.expenses?.van_rent)} onChange={() => setFormDirty(true)} required />
                    <ModalInput label="Tour Guide (₱)" name="tour_guide" {...moneyInputProps} placeholder="1,300.00 – 2,000.00" defaultValue={moneyDisplay(formTour?.expenses?.tour_guide)} onChange={() => setFormDirty(true)} required />
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.9, marginBottom: 5 }}>Bag Tag (₱)</label>
                      <p style={{ ...inputStyle, margin: 0, background: 'rgba(242,228,208,0.6)' }}>260.00 <span style={{ fontWeight: 600, color: '#7A3A18' }}>(fixed)</span></p>
                    </div>
                  </div>
                  {otherExpenses.map((o, i) => (
                    <div key={o.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) 40px', gap: 10, alignItems: 'end', marginTop: 10 }}>
                      <div>
                        <label style={labelStyle}>Other expense</label>
                        <input name={`other_name_${i}`} value={o.name} maxLength={60} placeholder="e.g. Entrance Fee, Jeep"
                          onChange={(e) => { setOtherExpenses((rows) => rows.map((x) => (x.key === o.key ? { ...x, name: e.target.value } : x))); setFormDirty(true); }}
                          style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Amount (₱)</label>
                        <input name={`other_amount_${i}`} {...moneyField(o.amount, (v) => { setOtherExpenses((rows) => rows.map((x) => (x.key === o.key ? { ...x, amount: v } : x))); setFormDirty(true); })}
                          style={inputStyle} />
                      </div>
                      <button type="button" aria-label="Remove this expense" onClick={() => { setOtherExpenses((rows) => rows.filter((x) => x.key !== o.key)); setFormDirty(true); }}
                        style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(122,58,24,0.3)', background: 'transparent', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => { setOtherExpenses((rows) => [...rows, blankExpense()]); setFormDirty(true); }} style={{
                    marginTop: 10, width: '100%', minHeight: 38, borderRadius: 12, cursor: 'pointer', border: '1px dashed rgba(180,81,30,0.45)',
                    background: 'transparent', color: '#A8481A', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                  }}>+ Add Other Expense</button>
                  <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: '8px 0 0' }}>
                    Booked joiners can see this breakdown on their booking and receipt. Reports uses it to work out each tour's income.
                  </p>
                </div>
 
                {/* Dates: one trip, as many dates as the admin runs it. Joiners pick one when booking. */}
                <div style={{
                  background: 'rgba(180,81,30,0.06)',
                  borderRadius: 18, padding: '1.25rem',
                  border: '1px solid rgba(180,81,30,0.18)',
                }}>
                  <label style={{ ...labelStyle, opacity: 1 }}>Tour Dates</label>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '0 0 12px', lineHeight: 1.5 }}>
                    Running this trip more than once? Add each date here. Joiners see one tour and pick the date they want.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {dateRows.map((r, i) => {
                      const minDate = r.id && r.original.start_date < getMinStartDate() ? r.original.start_date : getMinStartDate();
                      return (
                        <div key={r.key} className="tour-date-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end', background: '#FDF6EE', borderRadius: 14, padding: '10px 12px', border: '1px solid rgba(180,81,30,0.14)' }}>
                          <div>
                            <label style={labelStyle}>Start Date{dateRows.length > 1 ? ` · ${i + 1}` : ''}</label>
                            <input type="date" name={`start_date_${i}`} min={minDate} value={r.start_date} onChange={(e) => updateDateRow(r.key, 'start_date', e.target.value)}
                              style={inputStyle} required />
                          </div>
                          <div>
                            <label style={labelStyle}>End Date</label>
                            <input type="date" name={`end_date_${i}`} min={r.start_date || minDate} max={r.start_date ? addDaysYmd(r.start_date, MAX_TOUR_DAYS - 1) : undefined} value={r.end_date} onChange={(e) => updateDateRow(r.key, 'end_date', e.target.value)}
                              style={inputStyle} required />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDateRow(r.key)}
                            disabled={dateRows.length === 1 || r.booked > 0}
                            aria-label={`Remove date ${i + 1}`}
                            title={r.booked > 0 ? `${r.booked} joiner${r.booked === 1 ? ' has' : 's have'} booked this date, so it can't be removed` : dateRows.length === 1 ? 'A tour needs at least one date' : 'Remove this date'}
                            style={{
                              width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(122,58,24,0.3)',
                              background: 'transparent', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: dateRows.length === 1 || r.booked > 0 ? 'not-allowed' : 'pointer', opacity: dateRows.length === 1 || r.booked > 0 ? 0.4 : 1,
                            }}
                          ><Trash2 size={15} /></button>
                          <p style={{ gridColumn: '1 / -1', fontSize: 11.5, fontWeight: 700, color: '#7A3A18', margin: 0 }}>
                            {[calculateDuration(r.start_date, r.end_date), r.id ? `${r.booked} booked` : 'New date'].filter(Boolean).join(' · ')}
                          </p>
                          {/* Sale: 5% off the Joiner Rate for this date, between two days. */}
                          <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#8C2F1C', cursor: 'pointer' }}>
                            <input type="checkbox" checked={r.sale} onChange={(e) => updateDateRow(r.key, 'sale', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#8C2F1C' }} />
                            Put this date on sale (5% off the Joiner Rate)
                          </label>
                          {r.sale && (
                            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              <div>
                                <label style={labelStyle}>Sale Starts</label>
                                <input type="date" name={`sale_starts_${i}`} value={r.sale_starts} max={r.start_date || undefined}
                                  onChange={(e) => updateDateRow(r.key, 'sale_starts', e.target.value)} style={inputStyle} />
                              </div>
                              <div>
                                <label style={labelStyle}>Sale Ends</label>
                                <input type="date" name={`sale_ends_${i}`} value={r.sale_ends} min={r.sale_starts || undefined} max={r.start_date || undefined}
                                  onChange={(e) => updateDateRow(r.key, 'sale_ends', e.target.value)} style={inputStyle} />
                              </div>
                              {(() => {
                                const p = Number(formTourPrice) || 0;
                                return p > 0 ? (
                                  <p style={{ gridColumn: '1 / -1', fontSize: 11.5, fontWeight: 700, color: '#8C2F1C', margin: 0 }}>
                                    Sale price: {formatPeso(salePriceOf(p))} per person (was {formatPeso(p)}).
                                  </p>
                                ) : null;
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setDateRows((rows) => [...rows, blankDateRow()]); setFormDirty(true); }}
                    style={{
                      marginTop: 10, width: '100%', minHeight: 40, borderRadius: 12, cursor: 'pointer',
                      border: '1px dashed rgba(180,81,30,0.45)', background: 'transparent', color: '#A8481A',
                      fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  ><CalendarPlus size={13} /> Add Another Date</button>
                </div>

                {/* Pickup points: joiners pick one when booking. Their times (ETAs) are set in Tracking Management. */}
                <div style={{ background: 'rgba(180,81,30,0.06)', borderRadius: 18, padding: '1.25rem', border: '1px solid rgba(180,81,30,0.18)' }}>
                  <ListField
                    label="Pickup Points" required name="pickup_new" maxLength={120}
                    items={pickupPicked}
                    onChange={(items) => { setPickupPicked(items); setFormDirty(true); }}
                    placeholder="Type one, then click Add (e.g. SM Mall of Asia)"
                    hint="Add at least one. Joiners choose one of these when they book. The same points are used for every date of this trip. Set each stop's time in Tracking Management."
                  />
                </div>
 
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <ModalInput label={`Max Slots per Date (up to ${MAX_TOUR_SLOTS})`} name="group_size" type="number" min="1" max={Math.max(MAX_TOUR_SLOTS, Number(formTour?.group_size) || 0)} step="1" onKeyDown={blockSignKeys} defaultValue={formTour?.group_size || MAX_TOUR_SLOTS} required />
                  <div>
                    <label style={labelStyle}>Difficulty</label>
                    <select name="difficulty" defaultValue={formTour?.difficulty || 'Easy'}
                      style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                      <option value="Easy">Easy</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Challenging">Challenging</option>
                    </select>
                  </div>
                </div>
 
                <div>
                  <label style={labelStyle}>Tour Description</label>
                  <textarea name="description" defaultValue={formTour?.description}
                    style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} />
                </div>
 
                {[['inclusions', 'Inclusions', 'e.g. Van transfers'], ['exclusions', 'Exclusions', 'e.g. Meals not mentioned'], ['things_to_bring', 'Things to Bring', 'e.g. Valid ID']].map(([field, title, example]) => (
                  <ListField key={field} label={title} name={`${field}_new`} items={formLists[field]} onChange={setList(field)} placeholder={`Type one, then click Add (${example})`} />
                ))}

                <ItineraryField
                  start={itineraryStart} end={itineraryEnd}
                  value={formItinerary}
                  onChange={(v) => { setFormItinerary(v); setFormDirty(true); }}
                  note={dateRows.filter((r) => r.start_date).length > 1 ? 'The dates shown are for the first date of this trip. Every other date follows the same days.' : ''}
                />
 
                <div>
                  <label style={{ ...labelStyle, color: '#A8481A', opacity: 1 }}>Important Notes</label>
                  <textarea name="important_note" defaultValue={formTour?.important_note}
                    style={{ ...inputStyle, minHeight: 100, background: 'rgba(180,81,30,0.07)', color: '#A8481A', fontWeight: 700, resize: 'vertical' }} />
                </div>
                </fieldset>
              </div>
            </div>
 
            {/* Footer */}
            <div style={{
              padding: '1.5rem 2.5rem',
              background: '#FDF6EE',
              borderTop: '1px solid rgba(180,81,30,0.12)',
              display: 'flex', gap: 12, flexShrink: 0,
            }}>
              <button type="button" onClick={closeTourModal} style={{
                flex: 1, padding: '13px 0',
                background: '#F2E4D0', border: '1px solid rgba(180,81,30,0.25)', borderRadius: 999,
                cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 900, fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                color: '#1A0A00',
              }}>Cancel</button>
              <button type="submit" disabled={uploading || savingTour} style={{
                flex: 2, padding: '13px 0',
                background: '#B4511E', border: 'none', borderRadius: 999,
                cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 900, fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                color: '#FDF6EE',
                boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: uploading ? 0.7 : 1,
              }}>
                {(uploading || savingTour) ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : (editingTour ? 'Save Changes' : 'Create Tour')}
              </button>
            </div>
          </form>
        </div>
      )}
 
      {/* ── View Tour Detail Modal ── */}
      {viewTour && (
        <TourViewModal
          tour={viewTour}
          onClose={() => setViewTour(null)}
          onEdit={() => { setViewTour(null); openTourForm(viewTour); }}
          setSelectedImage={setSelectedImage}
          formatDateRange={formatDateRange}
        />
      )}
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   GALLERY THUMBNAIL (helper)
───────────────────────────────────────────── */
const GalleryThumb = ({ src, onRemove, isNew }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        position: 'relative', aspectRatio: '1',
        borderRadius: 12, overflow: 'hidden',
        border: isNew ? '2px solid #B4511E' : '2px solid rgba(180,81,30,0.2)',
        boxShadow: '0 2px 8px rgba(26,10,0,0.1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
      {hovered && (
        <button
          type="button" onClick={onRemove}
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(180,81,30,0.82)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FDF6EE',
          }}
        ><Trash2 size={18} /></button>
      )}
    </div>
  );
};
 
const ModalInput = ({ label, name, defaultValue, ...props }) => (
  <div style={{ marginBottom: 0 }}>
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 800,
      letterSpacing: '0.2em', textTransform: 'uppercase',
      color: '#7A3A18', opacity: 0.9, marginBottom: 5,
    }}>{label}</label>
    <input
      name={name}
      defaultValue={defaultValue}
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: '#F2E4D0',
        border: '1px solid rgba(180,81,30,0.18)',
        borderRadius: 14, padding: '10px 14px',
        fontSize: 13, fontWeight: 600,
        color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
      }}
    />
  </div>
);
 
export default TourManagement;