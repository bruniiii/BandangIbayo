import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { shrinkImage } from './imageCompress';
import EmptyState from './ui/EmptyState';
import { SearchX, Map as MapIcon, CalendarPlus } from 'lucide-react';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { sendWaitlistOpeningsEmail } from './Email';
import JoinerListModal from './JoinerManifest';
import { formatPeso, archivePastTours, groupTripDates, formatDateRange as formatTourDates, formatPickupTime } from './tourUtils';
import { moneyInputProps, blockSignKeys, cleanMoney } from './moneyInput';
import { checkFields, textError, mediaFileError } from './validation';
import {
  Plus, Edit, Archive, Eye, MapPin, Clock, Users, X, Search,
  Loader2, CheckCircle2, AlertCircle, ImageIcon,
  Trash2, UploadCloud, Calendar, RefreshCw, History, ChevronDown,
  CreditCard, CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { SkeletonTourCards } from './ui/Skeleton';
import ItineraryTimeline from './ui/ItineraryTimeline';
 
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

  const blankDateRow = () => ({ key: `new-${Math.random()}`, start_date: '', end_date: '', booked: 0 });
  // Pickup points joiners choose from when booking (saved as each date's pickup stops).
  const [pickupRows, setPickupRows] = useState([]);
  const blankPickup = () => ({ key: `p-${Math.random()}`, location: '', time: '' });
  // Other expenses besides van, guide and bag tag (e.g. entrance fee, jeep).
  const [otherExpenses, setOtherExpenses] = useState([]);
  const blankExpense = () => ({ key: `e-${Math.random()}`, name: '', amount: '' });
  // Opens the form for a new trip, or for a trip's details and dates (withNewDate adds an empty date to fill in).
  const openTourForm = (trip = null, { withNewDate = false } = {}) => {
    setEditingTour(trip);
    const saved = (trip?.dates || []).map((d) => ({ key: d.id, id: d.id, start_date: d.start_date, end_date: d.end_date, booked: d.current_booked || 0, original: d }));
    setDateRows(trip ? (withNewDate ? [...saved, blankDateRow()] : saved) : [blankDateRow()]);
    const stops = trip?.pickup_points || [];
    setPickupRows(stops.length ? stops.map((m) => ({ key: `p-${m.id}`, location: m.location_name, time: to24h(m.scheduled_time) })) : [blankPickup()]);
    const others = Array.isArray(trip?.expenses?.others) ? trip.expenses.others : [];
    setOtherExpenses(others.map((o) => ({ key: `e-${Math.random()}`, name: o.name, amount: String(o.amount) })));
    setFormDirty(false);
    setShowModal(true);
  };
  const updateDateRow = (key, field, value) => { setDateRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r))); setFormDirty(true); };
  const removeDateRow = (key) => { setDateRows((rows) => rows.filter((r) => r.key !== key)); setFormDirty(true); };

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
 
    if (error) { console.error('Error fetching tours:', error.message); setLoading(false); return; }
 
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
    const formEl    = e.target;
    const formData  = new FormData(formEl);
    const price     = Number(formData.get('price'));
    const regularRate = Number(formData.get('regular_rate'));
    const vanRent = Number(formData.get('van_rent'));
    const tourGuide = Number(formData.get('tour_guide'));
    const pickups = pickupRows.map((r) => ({ ...r, location: r.location.trim() })).filter((r) => r.location || r.time);
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
        [`end_date_${i}`, tripDays > 30 ? `${label}A tour longer than 30 days looks like a typo. Please check the dates.` : ''],
      ];
    });
    const mostBooked = dateRows.reduce((m, r) => (r.booked > m.booked ? r : m), { booked: 0 });

    // Typing mistakes, shown at the field: blank titles, an end date before the
    // start, fewer slots than joiners already booked, price typos.
    const ok = dateRows.length > 0 && checkFields(formEl, [
      ['title', textError(formData.get('title'), 'Tour title', { min: 3, max: 120 })],
      ['destination', textError(formData.get('destination'), 'Destination', { min: 2, max: 120 })],
      ['regular_rate', !Number.isFinite(regularRate) || regularRate < 1000 ? 'The Regular Rate must be at least ₱1,000.' : ''],
      ['regular_rate', Math.abs(Math.round(regularRate * 100) - regularRate * 100) > 1e-6 ? 'The Regular Rate can have at most 2 decimal places (centavos).' : ''],
      ['regular_rate', regularRate > 7500 ? 'The Regular Rate can be at most ₱7,500.' : ''],
      ['price', !Number.isFinite(price) || price <= 0 ? 'Please enter a price above ₱0. Tours can\'t be free.' : ''],
      ['price', Number.isFinite(regularRate) && regularRate >= 1000 && price < regularRate + 500 ? `The Joiner Rate must be at least ₱500 more than the Regular Rate (at least ${formatPeso(regularRate + 500)}).` : ''],
      ['price', Math.abs(Math.round(price * 100) - price * 100) > 1e-6 ? 'Price can have at most 2 decimal places (centavos).' : ''],
      ['price', price > 8000 ? 'The Joiner Rate can be at most ₱8,000.' : ''],
      ...dateChecks,
      ['van_rent', !Number.isFinite(vanRent) || vanRent < 15000 ? 'Van Rent must be at least ₱15,000.' : ''],
      ['van_rent', vanRent > 30000 ? 'Van Rent can be at most ₱30,000.' : ''],
      ['tour_guide', !Number.isFinite(tourGuide) || tourGuide < 1300 ? 'Tour Guide must be at least ₱1,300.' : ''],
      ['tour_guide', tourGuide > 2000 ? 'Tour Guide can be at most ₱2,000.' : ''],
      ...otherExpenses.flatMap((o, i) => [
        [`other_name_${i}`, (o.name.trim() || o.amount) && !o.name.trim() ? 'Name this expense, e.g. Entrance Fee.' : ''],
        [`other_amount_${i}`, o.name.trim() && !(Number(o.amount) >= 0 && String(o.amount).trim() !== '') ? 'Enter the amount (₱0 or more).' : ''],
      ]),
      ['pickup_0', pickups.length === 0 ? 'Add at least one pickup point, so joiners can choose where to be picked up.' : ''],
      ...pickupRows.map((r, i) => {
        const loc = r.location.trim().toLowerCase();
        return [`pickup_${i}`, !loc && r.time ? 'Enter the pickup place.'
          : loc && pickupRows.findIndex((x) => x.location.trim().toLowerCase() === loc) !== i ? 'This pickup point is listed twice.' : ''];
      }),
      ['group_size', !Number.isInteger(groupSize) || groupSize < 1 ? 'Max slots must be a whole number, at least 1.' : ''],
      ['group_size', groupSize > 200 ? 'Max slots looks too high. Please check the number.' : ''],
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
      inclusions:     formData.get('inclusions'),
      exclusions:     formData.get('exclusions'),
      things_to_bring: formData.get('things_to_bring'),
      itinerary:      formData.get('itinerary'),
      important_note: formData.get('important_note'),
      image_urls:     finalGallery,
      is_archived:    false,
    };
    const withDates = (r) => ({ ...shared, start_date: r.start_date, end_date: r.end_date, duration: calculateDuration(r.start_date, r.end_date) });

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

      // Pickup points: add new ones, update times, remove ones nobody picked.
      const kept = [];
      for (const id of rateIds) {
        const existing = [...(editingTour?.dates || [])].find((d) => d.id === id)?.pickup_points || [];
        for (const r of pickups) {
          const match = existing.find((m) => m.location_name.trim().toLowerCase() === r.location.toLowerCase());
          const time = formatPickupTime(r.time);
          if (!match) {
            await supabase.from('tour_meetups').insert([{ tour_id: id, location_name: r.location, scheduled_time: time, status: 'DEPARTURE' }]);
          } else if ((match.scheduled_time || '') !== time) {
            await supabase.from('tour_meetups').update({ scheduled_time: time }).eq('id', match.id);
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
      if (feedError) console.error('Error auto-posting tour to feed:', feedError.message);
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
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
 
                <ModalInput label="Tour Title" name="title" defaultValue={formTour?.title} placeholder="e.g., Mt. Pulag" required />
 
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <ModalInput label="Destination" name="destination" data-allow="place" defaultValue={formTour?.destination} required />
                  <ModalInput label="Joiner Rate (₱)" name="price" {...moneyInputProps} placeholder="₱1,500 – ₱8,000" defaultValue={formTour?.price} required />
                </div>
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'end' }}>
                  <ModalInput label="Regular Rate (₱)" name="regular_rate" {...moneyInputProps} placeholder="₱1,000 – ₱7,500" defaultValue={formTour?.regular_rate ?? ''} required />
                  <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', lineHeight: 1.5, margin: '0 0 6px' }}>
                    Admins only, never shown to joiners. ₱1,000 to ₱7,500; the Joiner Rate (what joiners pay, up to ₱8,000) must be at least ₱500 more.
                  </p>
                </div>

                {/* Expenses: what this trip costs (booked joiners see the item names only, no prices; used for income in Reports). */}
                <div style={{ background: 'rgba(180,81,30,0.06)', borderRadius: 18, padding: '1.25rem', border: '1px solid rgba(180,81,30,0.18)' }}>
                  <label style={{ ...labelStyle, opacity: 1 }}>Expenses</label>
                  <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <ModalInput label="Van Rent (₱)" name="van_rent" {...moneyInputProps} placeholder="₱15,000 – ₱30,000" defaultValue={formTour?.expenses?.van_rent ?? ''} onChange={() => setFormDirty(true)} required />
                    <ModalInput label="Tour Guide (₱)" name="tour_guide" {...moneyInputProps} placeholder="₱1,300 – ₱2,000" defaultValue={formTour?.expenses?.tour_guide ?? ''} onChange={() => setFormDirty(true)} required />
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
                        <input name={`other_amount_${i}`} {...moneyInputProps} value={o.amount}
                          onChange={(e) => { const v = cleanMoney(e.target.value); setOtherExpenses((rows) => rows.map((x) => (x.key === o.key ? { ...x, amount: v } : x))); setFormDirty(true); }}
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
                            <input type="date" name={`end_date_${i}`} min={r.start_date || minDate} value={r.end_date} onChange={(e) => updateDateRow(r.key, 'end_date', e.target.value)}
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

                {/* Pickup points: joiners pick one when booking. Times can also be changed later in Tracking Management. */}
                <div style={{ background: 'rgba(180,81,30,0.06)', borderRadius: 18, padding: '1.25rem', border: '1px solid rgba(180,81,30,0.18)' }}>
                  <label style={{ ...labelStyle, opacity: 1 }}>Pickup Points</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pickupRows.map((r, i) => (
                      <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) 40px', gap: 10, alignItems: 'end' }}>
                        <div>
                          <label style={labelStyle}>Place {pickupRows.length > 1 ? i + 1 : ''}</label>
                          <input name={`pickup_${i}`} value={r.location} maxLength={120} placeholder="e.g. Shell Mindanao Ave, QC"
                            onChange={(e) => { const v = e.target.value; setPickupRows((rows) => rows.map((x) => (x.key === r.key ? { ...x, location: v } : x))); setFormDirty(true); }}
                            style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Time</label>
                          <input type="time" aria-label={`Pickup time ${i + 1}`} value={r.time}
                            onChange={(e) => { const v = e.target.value; setPickupRows((rows) => rows.map((x) => (x.key === r.key ? { ...x, time: v } : x))); setFormDirty(true); }}
                            style={inputStyle} />
                        </div>
                        <button type="button" aria-label={`Remove pickup point ${i + 1}`} disabled={pickupRows.length === 1}
                          onClick={() => { setPickupRows((rows) => rows.filter((x) => x.key !== r.key)); setFormDirty(true); }}
                          style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(122,58,24,0.3)', background: 'transparent', color: '#7A3A18', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: pickupRows.length === 1 ? 'not-allowed' : 'pointer', opacity: pickupRows.length === 1 ? 0.4 : 1 }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => { setPickupRows((rows) => [...rows, blankPickup()]); setFormDirty(true); }} style={{
                    marginTop: 10, width: '100%', minHeight: 38, borderRadius: 12, cursor: 'pointer', border: '1px dashed rgba(180,81,30,0.45)',
                    background: 'transparent', color: '#A8481A', fontFamily: 'inherit', fontWeight: 900, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                  }}>+ Add Pickup Point</button>
                  <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: '8px 0 0' }}>
                    Joiners choose one of these when they book. The same points are used for every date of this trip.
                  </p>
                </div>
 
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <ModalInput label="Max Slots per Date" name="group_size" type="number" min="1" step="1" onKeyDown={blockSignKeys} defaultValue={formTour?.group_size || 18} required />
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
 
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderTop: '1px solid rgba(180,81,30,0.12)', paddingTop: 16 }}>
                  <div>
                    <label style={labelStyle}>Inclusions</label>
                    <textarea name="inclusions" defaultValue={formTour?.inclusions} rows="4"
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Exclusions</label>
                    <textarea name="exclusions" defaultValue={formTour?.exclusions} rows="4"
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                </div>
 
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Things to Bring</label>
                    <textarea name="things_to_bring" defaultValue={formTour?.things_to_bring} rows="3"
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Itinerary</label>
                    <textarea name="itinerary" defaultValue={formTour?.itinerary} rows="3"
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                </div>
 
                <div>
                  <label style={{ ...labelStyle, color: '#A8481A', opacity: 1 }}>Important Notes</label>
                  <textarea name="important_note" defaultValue={formTour?.important_note} rows="2"
                    style={{ ...inputStyle, background: 'rgba(180,81,30,0.07)', color: '#A8481A', fontWeight: 700, resize: 'vertical' }} />
                </div>
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
 
/* ─────────────────────────────────────────────
   TOUR VIEW MODAL
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   TOUR IMAGE CAROUSEL (slideable gallery)
───────────────────────────────────────────── */
const TourImageCarousel = ({ images = [], onExpand }) => {
  const [index, setIndex] = useState(0);
  const dragStartX = useRef(null);
  const hasImages = images.length > 0;
  const hasMultiple = images.length > 1;
 
  const goTo = (i) => setIndex(((i % images.length) + images.length) % images.length);
  const prev = (e) => { e.stopPropagation(); goTo(index - 1); };
  const next = (e) => { e.stopPropagation(); goTo(index + 1); };
 
  const handleDragStart = (e) => {
    dragStartX.current = e.clientX ?? e.touches?.[0]?.clientX ?? null;
  };
  const handleDragEnd = (e) => {
    if (dragStartX.current == null) return;
    const endX = e.clientX ?? e.changedTouches?.[0]?.clientX ?? dragStartX.current;
    const delta = endX - dragStartX.current;
    if (Math.abs(delta) > 40) {
      delta > 0 ? goTo(index - 1) : goTo(index + 1);
    }
    dragStartX.current = null;
  };
 
  return (
    <div>
      <div
        style={{
          position: 'relative', width: '100%', height: 190,
          borderRadius: 18, overflow: 'hidden',
          background: '#E8D5BC', marginBottom: hasMultiple ? 12 : 20,
          boxShadow: '0 8px 24px rgba(26,10,0,0.15)',
          flexShrink: 0, touchAction: 'pan-y', userSelect: 'none',
        }}
        onPointerDown={handleDragStart}
        onPointerUp={handleDragEnd}
      >
        {hasImages ? (
          <div style={{
            display: 'flex', width: '100%', height: '100%',
            transform: `translateX(-${index * 100}%)`,
            transition: 'transform 0.35s ease',
          }}>
            {images.map((url, i) => (
              <img
                key={i} src={url} draggable={false} alt={`Photo ${i + 1}`}
                onClick={() => onExpand(url)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', flexShrink: 0, cursor: 'zoom-in' }}
              />
            ))}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)' }}>
            <ImageIcon size={40} />
          </div>
        )}
 
        {hasMultiple && (
          <>
            <button
              type="button" onClick={prev}
              style={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(26,10,0,0.5)', border: 'none', borderRadius: '50%',
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#FDF6EE',
              }}
            ><ChevronLeft size={18} /></button>
            <button
              type="button" onClick={next}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(26,10,0,0.5)', border: 'none', borderRadius: '50%',
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#FDF6EE',
              }}
            ><ChevronRight size={18} /></button>
            <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
              {images.map((_, i) => (
                <span
                  key={i}
                  onClick={(e) => { e.stopPropagation(); goTo(i); }}
                  style={{
                    width: i === index ? 16 : 6, height: 6, borderRadius: 999,
                    background: i === index ? '#FDF6EE' : 'rgba(253,246,238,0.5)',
                    cursor: 'pointer', transition: 'width 0.2s',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
 
      {hasMultiple && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {images.map((url, i) => (
            <div
              key={i}
              onClick={() => goTo(i)}
              style={{
                aspectRatio: '1', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                border: i === index ? '2px solid #B4511E' : '1px solid rgba(180,81,30,0.15)',
                opacity: i === index ? 1 : 0.65, transition: 'opacity 0.2s, border-color 0.2s',
              }}
            >
              <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={`Thumbnail ${i + 1}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
 
const TourViewModal = ({ tour, onClose, onEdit, setSelectedImage, formatDateRange }) => {
  const filledPct = Math.min(100, ((tour.current_booked || 0) / (tour.group_size || 1)) * 100);
  const isFull    = (tour.available_slots ?? 1) <= 0;
  const isAlmost  = !isFull && (tour.available_slots ?? 99) <= 3;
 
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 1100,
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        overflow: 'hidden',
        maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 24, right: 24, zIndex: 50,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(122,58,24,0.85)',
        }}><X size={28} /></button>
 
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>
 
            {/* Left panel */}
            <div className="responsive-modal-padding" style={{
              background: '#F2E4D0',
              padding: '2.5rem 2rem',
              borderRight: '1px solid rgba(180,81,30,0.12)',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Photo Gallery (slideable) */}
              <TourImageCarousel images={tour.image_urls || []} onExpand={setSelectedImage} />
 
              <h2 style={{
                fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em',
                color: '#1A0A00', margin: '0 0 18px', lineHeight: 1.15,
              }}>{tour.title}</h2>
 
              {/* Meta */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {(tour.dates?.length > 1 ? tour.dates.map((d) => ({
                  icon: <Calendar size={16} />, text: `${formatDateRange(d.start_date, d.duration)} · ${d.current_booked ?? 0}/${d.group_size || 18} booked`,
                })) : [
                  { icon: <Calendar size={16} />, text: formatDateRange(tour.start_date, tour.duration) },
                  { icon: <Clock size={16} />,    text: tour.duration },
                ]).map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>
                    <span style={{ color: '#A8481A' }}>{row.icon}</span> {row.text}
                  </div>
                ))}
                {!(tour.dates?.length > 1) && (<>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: isFull ? '#A8481A' : '#7A3A18' }}>
                  <span style={{ color: '#A8481A' }}><Users size={16} /></span>
                  {tour.current_booked ?? 0} / {tour.group_size || 18} Slots Booked
                </div>
                {/* Progress bar */}
                <div style={{ background: 'rgba(180,81,30,0.15)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    width: `${filledPct}%`,
                    background: isFull ? '#B4511E' : isAlmost ? '#E8A265' : '#7A3A18',
                    transition: 'width 0.4s',
                  }} />
                </div>
                </>)}
                <span style={{
                  display: 'inline-block',
                  background: '#FDF6EE',
                  border: '1px solid rgba(180,81,30,0.2)',
                  borderRadius: 999, padding: '4px 14px',
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: '#1A0A00', width: 'fit-content',
                }}>{tour.difficulty}</span>
              </div>
 
              {/* Price */}
              <p style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: '#A8481A', margin: '0 0 2px', lineHeight: 1 }}>
                {formatPeso(tour.price)}
              </p>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, margin: '0 0 4px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Joiner rate, per person</p>
              <p style={{ fontSize: 12.5, fontWeight: 800, color: tour.regular_rate ? '#1A0A00' : '#8C2F1C', margin: '0 0 16px' }}>
                {tour.regular_rate ? `Regular rate: ${formatPeso(tour.regular_rate)}` : 'Regular rate not set yet. Edit the tour to add it.'}
              </p>
 
              <button
                onClick={onEdit}
                style={{
                  width: '100%', padding: '12px 0',
                  background: '#B4511E', color: '#FDF6EE',
                  border: 'none', borderRadius: 14, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 6px 18px rgba(180,81,30,0.32)',
                }}
              >
                <Edit size={13} /> Edit This Tour
              </button>
            </div>
 
            {/* Right panel */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="responsive-modal-padding" style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 28 }}>
 
                <ViewSection title="About the Tour">
                  <p style={{ fontSize: 14, lineHeight: 1.8, fontWeight: 500, color: '#7A3A18', whiteSpace: 'pre-wrap', margin: 0 }}>
                    {tour.description || 'No description provided.'}
                  </p>
                </ViewSection>
 
                <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>
                  <ViewSection title="Inclusions" titleColor="#A8481A" icon={<CheckCircle2 size={14} />}>
                    <ChecklistGrid text={tour.inclusions} variant="include" />
                  </ViewSection>
                  <ViewSection title="Exclusions" titleColor="#A8481A" icon={<X size={14} />}>
                    <ChecklistGrid text={tour.exclusions} variant="exclude" />
                  </ViewSection>
                </div>
 
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>
                  <ViewSection title="Itinerary" titleColor="#A8481A" icon={<Clock size={14} />}>
                    <ItineraryTimeline text={tour.itinerary} />
                  </ViewSection>
                </div>

                <div style={{ borderTop: '1px solid rgba(180,81,30,0.1)', paddingTop: 24 }}>
                  <ViewSection title="Things to Bring">
                    <ChecklistGrid text={tour.things_to_bring} variant="neutral" />
                  </ViewSection>
                </div>
 
                {tour.important_note && (
                  <div style={{
                    background: 'rgba(180,81,30,0.07)',
                    borderRadius: 18, padding: '1.5rem',
                    border: '1px solid rgba(180,81,30,0.2)',
                    display: 'flex', gap: 16,
                  }}>
                    <AlertCircle size={22} style={{ color: '#A8481A', flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#A8481A', margin: '0 0 8px' }}>
                        Important Note
                      </p>
                      <pre style={{ fontSize: 13, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1.7, color: '#1A0A00', whiteSpace: 'pre-wrap', margin: 0 }}>
                        {tour.important_note}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   TOUR CARD
───────────────────────────────────────────── */
const TourCard = ({ tour, onConfirmAction, onView, onEdit, onAddDate, onJoiners, formatDateRange }) => {
  const [hovered, setHovered] = useState(false);
  const today  = new Date().toISOString().split('T')[0];
  const dates  = tour.dates || [tour];
  const isLive = dates.some((d) => today >= d.start_date && today <= d.end_date);
 
  return (
    <div
      style={{
        background: '#FDF6EE',
        borderRadius: 22, overflow: 'hidden',
        border: '1px solid rgba(180,81,30,0.12)',
        boxShadow: hovered ? '0 12px 36px rgba(26,10,0,0.14)' : '0 4px 16px rgba(26,10,0,0.06)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all 0.25s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div style={{ height: 186, background: '#E8D5BC', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {tour.image_urls?.[0]
          ? <img src={tour.image_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: hovered ? 'scale(1.04)' : 'scale(1)', transition: 'transform 0.4s' }} alt="Primary" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)' }}><ImageIcon size={44} /></div>
        }
        {/* badges */}
        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <span style={{
            background: 'rgba(253,246,238,0.92)', borderRadius: 999,
            padding: '4px 12px', fontSize: 11, fontWeight: 900,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: '#1A0A00',
          }}>{tour.difficulty}</span>
        </div>
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {isLive && !tour.is_archived && (
            <span style={{
              background: '#B4511E', color: '#FDF6EE',
              borderRadius: 999, padding: '4px 10px',
              fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>● Live</span>
          )}
          {tour.is_archived && (
            <span style={{
              background: 'rgba(26,10,0,0.6)', color: '#FDF6EE',
              borderRadius: 999, padding: '4px 10px',
              fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>Archived</span>
          )}
        </div>
      </div>
 
      {/* Body */}
      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: 0, flex: 1 }}>{tour.title}</h3>
            <span style={{ fontSize: 15, fontWeight: 900, color: '#A8481A', marginLeft: 10, flexShrink: 0 }}>{formatPeso(tour.price)}</span>
          </div>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 12px' }}>
            <MapPin size={11} style={{ color: '#A8481A' }} /> {tour.destination}
          </p>
          {/* Each date: when, how full, and its joiner list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {dates.map((d) => {
              const full = (d.available_slots ?? 1) <= 0;
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(180,81,30,0.06)', borderRadius: 10, padding: '7px 8px 7px 10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: '#1A0A00', whiteSpace: 'nowrap' }}>
                      <Calendar size={12} style={{ color: '#A8481A', flexShrink: 0 }} /> {formatDateRange(d.start_date, d.duration)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: full ? '#A8481A' : '#7A3A18', marginTop: 2, paddingLeft: 18 }}>
                      {d.current_booked ?? 0} / {d.group_size || 18} booked
                      {full && <span style={{ background: 'rgba(180,81,30,0.12)', color: '#A8481A', fontSize: 10.5, fontWeight: 900, padding: '1px 7px', borderRadius: 999, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Full</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onJoiners(d)}
                    title={`Joiners on ${formatDateRange(d.start_date, d.duration)}`}
                    style={{
                      flexShrink: 0, minHeight: 32, padding: '0 10px', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid rgba(122,58,24,0.25)', background: '#FDF6EE', color: '#1A0A00',
                      fontFamily: 'inherit', fontWeight: 900, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  ><Users size={11} /> Joiners</button>
                </div>
              );
            })}
          </div>
        </div>
 
        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 8 }}>
          {[
            { label: 'View', icon: <Eye size={11} />, onClick: onView, style: { background: '#F2E4D0', color: '#1A0A00' } },
            { label: 'Edit', icon: <Edit size={11} />, onClick: onEdit, style: { background: '#F2E4D0', color: '#1A0A00' } },
            {
              label: tour.is_archived ? 'Restore' : 'Archive',
              icon: tour.is_archived ? <RefreshCw size={11} /> : <Archive size={11} />,
              onClick: onConfirmAction,
              // A rarely used action: outlined, so it doesn't compete with View/Edit.
              style: { background: 'transparent', color: '#7A3A18', border: '1px solid rgba(122,58,24,0.3)' },
            },
          ].map(({ label, icon, onClick, style: btnStyle }) => (
            <button
              key={label}
              onClick={onClick}
              style={{
                minHeight: 40, padding: '0 4px',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 900,
                fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'opacity 0.15s',
                ...btnStyle,
              }}
            >
              {icon} {label}
            </button>
          ))}
          {!tour.is_archived && <button
            type="button"
            onClick={onAddDate}
            title="Run this tour on another date"
            style={{
              minHeight: 40, padding: '0 4px',
              border: '1px dashed rgba(180,81,30,0.45)', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(180,81,30,0.06)', color: '#A8481A',
              fontFamily: 'inherit', fontWeight: 900,
              fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <CalendarPlus size={12} /> Add Date
          </button>}
        </div>
      </div>
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const ViewSection = ({ title, titleColor, icon, children }) => (
  <section>
    <h4 style={{
      fontSize: 11, fontWeight: 900, letterSpacing: '0.25em',
      textTransform: 'uppercase', color: titleColor || '#1A0A00',
      margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {icon} {title}
    </h4>
    {children}
  </section>
);
 
/* Renders newline-separated text (inclusions/exclusions/things-to-bring)
   as a tidy checklist grid instead of a raw text block. */
const ChecklistGrid = ({ text, variant = 'neutral' }) => {
  const items = (text || '').split('\n').map(s => s.trim()).filter(Boolean);
 
  if (items.length === 0) {
    return <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0 }}>N/A</p>;
  }
 
  const iconColor = variant === 'exclude' ? '#8C2F1C' : '#A8481A';
  const itemBg = variant === 'exclude' ? 'rgba(140,47,28,0.06)' : variant === 'include' ? 'rgba(168,72,26,0.07)' : 'rgba(180,81,30,0.06)';
  const Icon = variant === 'exclude' ? X : CheckCircle2;
 
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: itemBg, borderRadius: 12, padding: '9px 12px',
          flex: '0 1 auto', maxWidth: '100%',
        }}>
          <span style={{ color: iconColor, flexShrink: 0, marginTop: 1 }}><Icon size={13} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', lineHeight: 1.4 }}>{item}</span>
        </div>
      ))}
    </div>
  );
};
 
 



// "4:30 AM" (how pickup stops are saved) → "04:30" for a time input.
const to24h = (value) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(value || '').trim());
  if (!m) return '';
  let h = Number(m[1]) % 12;
  if (m[3] && m[3].toUpperCase() === 'PM') h += 12;
  if (!m[3]) h = Number(m[1]);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
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