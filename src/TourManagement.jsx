import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import {
  Plus, Edit, Archive, Eye, MapPin, Clock, Users, X, Search,
  Loader2, CheckCircle2, AlertCircle, ImageIcon,
  Trash2, UploadCloud, Calendar, RefreshCw, History, ChevronDown,
  CreditCard, CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
 
// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
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
  const [editingTour, setEditingTour]           = useState(null);
  const [tours, setTours]                       = useState([]);
  const [filteredTours, setFilteredTours]       = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [uploading, setUploading]               = useState(false);
  const [selectedImage, setSelectedImage]       = useState(null);
  const [calculatedDuration, setCalculatedDuration] = useState('');
  const [currentTab, setCurrentTab]             = useState('active');
  const [confirmAction, setConfirmAction]       = useState(null);
  const [searchQuery, setSearchQuery]           = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('All Difficulty');
  const [priceSort, setPriceSort]               = useState('default');
  const [tempGallery, setTempGallery]           = useState([]);
  const [newFiles, setNewFiles]                 = useState([]);
 
  const formatDateRange = (dateString, duration) => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    const daysMatch = duration ? duration.match(/(\d+)\s*day/i) : null;
    const numDays = daysMatch ? parseInt(daysMatch[1]) : 1;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const startDate = new Date(year, month - 1, day);
    const endDate   = new Date(year, month - 1, day + numDays - 1);
    const startMonth = monthNames[startDate.getMonth()];
    const endMonth   = monthNames[endDate.getMonth()];
    const startYear  = startDate.getFullYear();
    const endYear    = endDate.getFullYear();
    if (numDays <= 1) return `${startMonth} ${startDate.getDate()}, ${startYear}`;
    if (startMonth === endMonth && startYear === endYear) return `${startMonth} ${startDate.getDate()} - ${endDate.getDate()}, ${startYear}`;
    if (startYear === endYear) return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}, ${startYear}`;
    return `${startMonth} ${startDate.getDate()}, ${startYear} - ${endMonth} ${endDate.getDate()}, ${endYear}`;
  };
 
  const calculateDuration = (start, end) => {
    if (!start || !end) return '';
    const diffDays = Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1;
    return diffDays <= 0 ? '' : diffDays === 1 ? '1 Day' : `${diffDays} Days`;
  };
 
  const handleDateChange = () => {
    const start = document.getElementsByName('start_date')[0]?.value;
    const end   = document.getElementsByName('end_date')[0]?.value;
    if (start && end) setCalculatedDuration(calculateDuration(start, end));
  };
 
  const getMinStartDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 21);
    return date.toISOString().split('T')[0];
  };
 
  const fetchTours = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tours')
      .select('*')
      .eq('is_archived', currentTab === 'archive')
      .order('start_date', { ascending: currentTab !== 'archive' });
 
    if (error) { console.error('Error fetching tours:', error.message); setLoading(false); return; }
 
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('tour_id, slots_booked, payment_status, booking_status')
      .not('booking_status', 'eq', 'Cancelled');
 
    const toursWithCounts = (data || []).map(tour => {
      const tourBookings  = (bookingsData || []).filter(b => b.tour_id === tour.id);
      const totalBooked   = tourBookings.reduce((sum, b) => sum + (b.slots_booked || 0), 0);
      const maxCapacity   = tour.group_size || 18;
      return {
        ...tour,
        current_booked:     totalBooked,
        available_slots:    Math.max(0, maxCapacity - totalBooked),
        bookings_pending:   tourBookings.filter(b => b.payment_status === 'Pending' || b.payment_status === 'Verification Pending').length,
        bookings_complete:  tourBookings.filter(b => b.payment_status === 'Complete').length,
        bookings_rejected:  tourBookings.filter(b => b.payment_status === 'Rejected').length,
        bookings_cancelled: tourBookings.filter(b => b.booking_status === 'Cancelled').length,
      };
    });
 
    setTours(toursWithCounts);
    setFilteredTours(toursWithCounts);
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
    if (editingTour) { setTempGallery(editingTour.image_urls || []); setCalculatedDuration(editingTour.duration || ''); }
    else { setTempGallery([]); setCalculatedDuration(''); }
    setNewFiles([]);
  }, [editingTour, showModal]);
 
  const executeToggleArchive = async () => {
    const { id, isArchived } = confirmAction;
    const { error } = await supabase.from('tours').update({ is_archived: !isArchived }).eq('id', id);
    if (error) alert('Error: ' + error.message); else fetchTours();
    setConfirmAction(null);
  };
 
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setNewFiles(prev => [...prev, ...files.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
  };
 
  const uploadImages = async (filesToUpload) => {
    try {
      setUploading(true);
      const uploadedUrls = [];
      for (const fileObj of filesToUpload) {
        const fileName = `${Math.random()}.${fileObj.file.name.split('.').pop()}`;
        const { error: uploadError } = await supabase.storage.from('tours').upload(`tour-gallery/${fileName}`, fileObj.file);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('tours').getPublicUrl(`tour-gallery/${fileName}`);
        uploadedUrls.push(data.publicUrl);
      }
      return uploadedUrls;
    } catch (error) { alert('Error uploading images: ' + error.message); return []; }
    finally { setUploading(false); }
  };
 
  const handleRemoveExisting = (urlToRemove) => setTempGallery(tempGallery.filter(url => url !== urlToRemove));
  const handleRemoveNew      = (previewUrl)  => setNewFiles(newFiles.filter(f => f.preview !== previewUrl));
 
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const formData  = new FormData(e.target);
    const startDate = formData.get('start_date');
    if (startDate < getMinStartDate()) { alert('Invalid Start Date. Must be at least 3 weeks in advance.'); return; }
    let finalGallery = [...tempGallery];
    if (newFiles.length > 0) { const newUrls = await uploadImages(newFiles); finalGallery = [...finalGallery, ...newUrls]; }
 
    const tourData = {
      title:          formData.get('title'),
      description:    formData.get('description'),
      destination:    formData.get('destination'),
      price:          parseFloat(formData.get('price')),
      duration:       calculatedDuration,
      group_size:     parseInt(formData.get('group_size')) || 18,
      difficulty:     formData.get('difficulty'),
      inclusions:     formData.get('inclusions'),
      exclusions:     formData.get('exclusions'),
      things_to_bring: formData.get('things_to_bring'),
      itinerary:      formData.get('itinerary'),
      important_note: formData.get('important_note'),
      image_urls:     finalGallery,
      start_date:     startDate,
      end_date:       formData.get('end_date'),
      is_archived:    false,
    };
 
    const isNewTour = !editingTour;
    const request = editingTour
      ? supabase.from('tours').update(tourData).eq('id', editingTour.id)
      : supabase.from('tours').insert([tourData]).select();
    const { data: tourResult, error } = await request;
    if (error) { alert('Error: ' + error.message); return; }

    // Auto-post newly created tours to the community feed.
    if (isNewTour) {
      const newTour = Array.isArray(tourResult) ? tourResult[0] : tourResult;
      if (newTour?.id) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: feedError } = await supabase.from('feed_posts').insert([{
          author_id: user?.id || null,
          content: `New tour posted: ${newTour.title} — ${newTour.destination}. Book your slot now!`,
          post_type: 'tour',
          tour_id: newTour.id,
        }]);
        if (feedError) console.error('Error auto-posting tour to feed:', feedError.message);
      }
    }

    setEditingTour(null);
    setShowModal(false);
    fetchTours();
  };
 
  // ── shared input style ──
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#F2E4D0',
    border: '1px solid rgba(196,92,38,0.18)',
    borderRadius: 14,
    padding: '10px 14px',
    fontSize: 13, fontWeight: 600,
    color: '#1A0A00',
    fontFamily: 'inherit',
    outline: 'none',
  };
 
  const labelStyle = {
    display: 'block',
    fontSize: 9, fontWeight: 800,
    letterSpacing: '0.2em', textTransform: 'uppercase',
    color: '#7A3A18', opacity: 0.7,
    marginBottom: 5,
  };
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
 
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
            borderTop: `8px solid ${confirmAction.isArchived ? '#C45C26' : '#E8A265'}`,
          }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: confirmAction.isArchived ? '#C45C26' : '#1A0A00',
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
            <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', opacity: 0.65, lineHeight: 1.7, margin: '0 0 32px' }}>
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
                  border: '1px solid rgba(196,92,38,0.18)',
                  borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: '#7A3A18',
                }}
              >Cancel</button>
              <button
                onClick={executeToggleArchive}
                style={{
                  flex: 1, padding: '13px 0',
                  background: confirmAction.isArchived ? '#C45C26' : '#1A0A00',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: '#FDF6EE',
                  boxShadow: '0 6px 20px rgba(26,10,0,0.22)',
                }}
              >Confirm</button>
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
          <img src={selectedImage} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }} alt="Preview" />
        </div>
      )}
 
      {/* ── Scrollable Content (header + filters + grid scroll together) ── */}
      <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>

      {/* ── Header Tabs ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(196,92,38,0.15)',
        paddingBottom: 16, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <button
            onClick={() => setCurrentTab('active')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', padding: 0,
              fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em',
              color: currentTab === 'active' ? '#1A0A00' : 'rgba(122,58,24,0.3)',
              transition: 'color 0.2s',
            }}
          >Manage Tour Postings</button>
          <span style={{ color: 'rgba(196,92,38,0.25)', fontSize: 18 }}>|</span>
          <button
            onClick={() => setCurrentTab('archive')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', padding: 0,
              fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em',
              color: currentTab === 'archive' ? '#1A0A00' : 'rgba(122,58,24,0.3)',
              transition: 'color 0.2s',
            }}
          >
            <History size={18} /> Tour Archive
          </button>
        </div>
        <button
          onClick={() => { setEditingTour(null); setShowModal(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#C45C26', color: '#FDF6EE',
            border: 'none', borderRadius: 999, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 900,
            fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
            padding: '12px 22px',
            boxShadow: '0 6px 20px rgba(196,92,38,0.35)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#a34d20'}
          onMouseLeave={e => e.currentTarget.style.background = '#C45C26'}
        >
          <Plus size={16} strokeWidth={3} /> Create New Tour
        </button>
      </div>
 
      {/* ── Filters ── */}
      <div style={{
        background: '#FDF6EE',
        borderRadius: 20, padding: '14px 18px',
        border: '1px solid rgba(196,92,38,0.12)',
        boxShadow: '0 4px 16px rgba(26,10,0,0.05)',
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
        marginBottom: 24,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={15} style={{
            position: 'absolute', left: 13, top: '50%',
            transform: 'translateY(-50%)',
            color: 'rgba(122,58,24,0.35)', pointerEvents: 'none',
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
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.35)' }} />
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
          <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.35)' }} />
        </div>
      </div>
 
      {/* ── Tour Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {loading ? (
            <div style={{
              gridColumn: '1 / -1',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '5rem 0', color: 'rgba(122,58,24,0.4)',
            }}>
              <Loader2 size={30} style={{ marginBottom: 10 }} />
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
                Syncing Database…
              </p>
            </div>
          ) : filteredTours.length > 0 ? (
            filteredTours.map(tour => (
              <TourCard
                key={tour.id}
                tour={tour}
                onConfirmAction={() => setConfirmAction({ id: tour.id, isArchived: tour.is_archived })}
                onView={() => setViewTour(tour)}
                onEdit={() => { setEditingTour(tour); setShowModal(true); }}
                formatDateRange={formatDateRange}
              />
            ))
          ) : (
            <div style={{
              gridColumn: '1 / -1',
              padding: '5rem 0', textAlign: 'center',
              background: '#FDF6EE',
              borderRadius: 20,
              border: '2px dashed rgba(196,92,38,0.2)',
            }}>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.4)', margin: 0 }}>
                No tours matching your filters.
              </p>
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
            onClick={() => setShowModal(false)}
          />
          <form
            onSubmit={handleFormSubmit}
            style={{
              position: 'relative', background: '#FDF6EE',
              width: '100%', maxWidth: 720,
              borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
              overflow: 'hidden',
              borderTop: '8px solid #C45C26',
              maxHeight: '90vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <button
              type="button" onClick={() => setShowModal(false)}
              style={{
                position: 'absolute', top: 20, right: 20, zIndex: 10,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(122,58,24,0.5)',
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
                  border: '2px dashed rgba(196,92,38,0.25)',
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
                      fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
                      cursor: 'pointer', boxShadow: '0 4px 14px rgba(26,10,0,0.2)',
                    }}>
                      <UploadCloud size={14} /> Upload Images
                    </div>
                    <input type="file" accept="image/*" multiple onChange={handleFileChange}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                  </div>
                </div>
 
                <ModalInput label="Tour Title" name="title" defaultValue={editingTour?.title} placeholder="e.g., Mt. Pulag" required />
 
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <ModalInput label="Destination" name="destination" defaultValue={editingTour?.destination} required />
                  <ModalInput label="Price (₱)" name="price" type="number" defaultValue={editingTour?.price} required />
                </div>
 
                {/* Dates */}
                <div style={{
                  background: 'rgba(196,92,38,0.06)',
                  borderRadius: 18, padding: '1.25rem',
                  border: '1px solid rgba(196,92,38,0.18)',
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
                }} className="responsive-form-grid-2">
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="date" name="start_date" min={getMinStartDate()} defaultValue={editingTour?.start_date} onChange={handleDateChange}
                      style={{ ...inputStyle, background: '#FDF6EE' }} required />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input type="date" name="end_date" min={getMinStartDate()} defaultValue={editingTour?.end_date} onChange={handleDateChange}
                      style={{ ...inputStyle, background: '#FDF6EE' }} required />
                  </div>
                </div>
 
                <div className="responsive-form-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Duration</label>
                    <input type="text" value={calculatedDuration} readOnly
                      style={{ ...inputStyle, background: '#F2E4D0', opacity: 0.7, cursor: 'default' }} />
                  </div>
                  <ModalInput label="Max Slots" name="group_size" type="number" defaultValue={editingTour?.group_size || 18} required />
                  <div>
                    <label style={labelStyle}>Difficulty</label>
                    <select name="difficulty" defaultValue={editingTour?.difficulty || 'Easy'}
                      style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                      <option value="Easy">Easy</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Challenging">Challenging</option>
                    </select>
                  </div>
                </div>
 
                <div>
                  <label style={labelStyle}>Tour Description</label>
                  <textarea name="description" defaultValue={editingTour?.description}
                    style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} />
                </div>
 
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderTop: '1px solid rgba(196,92,38,0.12)', paddingTop: 16 }}>
                  <div>
                    <label style={labelStyle}>Inclusions</label>
                    <textarea name="inclusions" defaultValue={editingTour?.inclusions} rows="4"
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Exclusions</label>
                    <textarea name="exclusions" defaultValue={editingTour?.exclusions} rows="4"
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                </div>
 
                <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Things to Bring</label>
                    <textarea name="things_to_bring" defaultValue={editingTour?.things_to_bring} rows="3"
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Itinerary</label>
                    <textarea name="itinerary" defaultValue={editingTour?.itinerary} rows="3"
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                </div>
 
                <div>
                  <label style={{ ...labelStyle, color: '#C45C26', opacity: 1 }}>Important Notes</label>
                  <textarea name="important_note" defaultValue={editingTour?.important_note} rows="2"
                    style={{ ...inputStyle, background: 'rgba(196,92,38,0.07)', color: '#C45C26', fontWeight: 700, resize: 'vertical' }} />
                </div>
              </div>
            </div>
 
            {/* Footer */}
            <div style={{
              padding: '1.5rem 2.5rem',
              background: '#FDF6EE',
              borderTop: '1px solid rgba(196,92,38,0.12)',
              display: 'flex', gap: 12, flexShrink: 0,
            }}>
              <button type="button" onClick={() => setShowModal(false)} style={{
                flex: 1, padding: '13px 0',
                background: '#1A0A00', border: 'none', borderRadius: 999,
                cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 900, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                color: '#FDF6EE',
              }}>Cancel</button>
              <button type="submit" disabled={uploading} style={{
                flex: 2, padding: '13px 0',
                background: '#C45C26', border: 'none', borderRadius: 999,
                cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 900, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                color: '#FDF6EE',
                boxShadow: '0 6px 20px rgba(196,92,38,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: uploading ? 0.7 : 1,
              }}>
                {uploading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : (editingTour ? 'Save Changes' : 'Create Tour')}
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
          onEdit={() => { setViewTour(null); setEditingTour(viewTour); setShowModal(true); }}
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
        border: isNew ? '2px solid #C45C26' : '2px solid rgba(196,92,38,0.2)',
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
            background: 'rgba(196,92,38,0.82)',
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
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.3)' }}>
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
                border: i === index ? '2px solid #C45C26' : '1px solid rgba(196,92,38,0.15)',
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
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 24, right: 24, zIndex: 50,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(122,58,24,0.5)',
        }}><X size={28} /></button>
 
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="responsive-split-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', minHeight: 0 }}>
 
            {/* Left panel */}
            <div className="responsive-modal-padding" style={{
              background: '#F2E4D0',
              padding: '2.5rem 2rem',
              borderRight: '1px solid rgba(196,92,38,0.12)',
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
                {[
                  { icon: <Calendar size={16} />, text: formatDateRange(tour.start_date, tour.duration) },
                  { icon: <Clock size={16} />,    text: tour.duration },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#7A3A18' }}>
                    <span style={{ color: '#C45C26' }}>{row.icon}</span> {row.text}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: isFull ? '#C45C26' : '#7A3A18' }}>
                  <span style={{ color: '#C45C26' }}><Users size={16} /></span>
                  {tour.current_booked ?? 0} / {tour.group_size || 18} Slots Booked
                </div>
                {/* Progress bar */}
                <div style={{ background: 'rgba(196,92,38,0.15)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    width: `${filledPct}%`,
                    background: isFull ? '#C45C26' : isAlmost ? '#E8A265' : '#7A3A18',
                    transition: 'width 0.4s',
                  }} />
                </div>
                <span style={{
                  display: 'inline-block',
                  background: '#FDF6EE',
                  border: '1px solid rgba(196,92,38,0.2)',
                  borderRadius: 999, padding: '4px 14px',
                  fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: '#1A0A00', width: 'fit-content',
                }}>{tour.difficulty}</span>
              </div>
 
              {/* Price */}
              <p style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: '#C45C26', margin: '0 0 2px', lineHeight: 1 }}>
                ₱{tour.price.toLocaleString()}
              </p>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.6, margin: '0 0 16px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>per person</p>
 
              <button
                onClick={onEdit}
                style={{
                  width: '100%', padding: '12px 0',
                  background: '#C45C26', color: '#FDF6EE',
                  border: 'none', borderRadius: 14, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 6px 18px rgba(196,92,38,0.32)',
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
 
                <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid rgba(196,92,38,0.1)', paddingTop: 24 }}>
                  <ViewSection title="Inclusions" titleColor="#C45C26" icon={<CheckCircle2 size={14} />}>
                    <ChecklistGrid text={tour.inclusions} variant="include" />
                  </ViewSection>
                  <ViewSection title="Exclusions" titleColor="#C45C26" icon={<X size={14} />}>
                    <ChecklistGrid text={tour.exclusions} variant="exclude" />
                  </ViewSection>
                </div>
 
                <div className="responsive-section-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, borderTop: '1px solid rgba(196,92,38,0.1)', paddingTop: 24 }}>
                  <ViewSection title="Itinerary">
                    <pre style={{ fontSize: 13, fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#7A3A18', margin: 0 }}>{tour.itinerary || 'N/A'}</pre>
                  </ViewSection>
                  <ViewSection title="Things to Bring">
                    <ChecklistGrid text={tour.things_to_bring} variant="neutral" />
                  </ViewSection>
                </div>
 
                {tour.important_note && (
                  <div style={{
                    background: 'rgba(196,92,38,0.07)',
                    borderRadius: 18, padding: '1.5rem',
                    border: '1px solid rgba(196,92,38,0.2)',
                    display: 'flex', gap: 16,
                  }}>
                    <AlertCircle size={22} style={{ color: '#C45C26', flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C45C26', margin: '0 0 8px' }}>
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
const TourCard = ({ tour, onConfirmAction, onView, onEdit, formatDateRange }) => {
  const [hovered, setHovered] = useState(false);
  const today  = new Date().toISOString().split('T')[0];
  const isLive = today >= tour.start_date && today <= tour.end_date;
  const isFull = (tour.available_slots ?? 1) <= 0;
 
  return (
    <div
      style={{
        background: '#FDF6EE',
        borderRadius: 22, overflow: 'hidden',
        border: '1px solid rgba(196,92,38,0.12)',
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
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.2)' }}><ImageIcon size={44} /></div>
        }
        {/* badges */}
        <div style={{ position: 'absolute', top: 12, left: 12 }}>
          <span style={{
            background: 'rgba(253,246,238,0.92)', borderRadius: 999,
            padding: '4px 12px', fontSize: 9, fontWeight: 900,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: '#1A0A00',
          }}>{tour.difficulty}</span>
        </div>
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {isLive && !tour.is_archived && (
            <span style={{
              background: '#C45C26', color: '#FDF6EE',
              borderRadius: 999, padding: '4px 10px',
              fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>● Live</span>
          )}
          {tour.is_archived && (
            <span style={{
              background: 'rgba(26,10,0,0.6)', color: '#FDF6EE',
              borderRadius: 999, padding: '4px 10px',
              fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>Archived</span>
          )}
        </div>
      </div>
 
      {/* Body */}
      <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A0A00', lineHeight: 1.2, margin: 0, flex: 1 }}>{tour.title}</h3>
            <span style={{ fontSize: 15, fontWeight: 900, color: '#C45C26', marginLeft: 10, flexShrink: 0 }}>₱{tour.price.toLocaleString()}</span>
          </div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.65, display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 12px' }}>
            <MapPin size={11} style={{ color: '#C45C26' }} /> {tour.destination}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 700, color: '#7A3A18', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              <Calendar size={12} style={{ color: '#C45C26' }} /> {formatDateRange(tour.start_date, tour.duration)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 700, color: isFull ? '#C45C26' : '#7A3A18', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              <Users size={12} style={{ color: '#C45C26' }} />
              {tour.current_booked ?? 0} / {tour.group_size || 18} Booked
              {isFull && (
                <span style={{ background: 'rgba(196,92,38,0.12)', color: '#C45C26', fontSize: 7, fontWeight: 900, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Full</span>
              )}
            </div>
          </div>
        </div>
 
        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, paddingTop: 8 }}>
          {[
            { label: 'View', icon: <Eye size={11} />, onClick: onView, style: { background: '#F2E4D0', color: '#1A0A00' } },
            { label: 'Edit', icon: <Edit size={11} />, onClick: onEdit, style: { background: '#F2E4D0', color: '#1A0A00' } },
            {
              label: tour.is_archived ? 'Restore' : 'Archive',
              icon: tour.is_archived ? <RefreshCw size={11} /> : <Archive size={11} />,
              onClick: onConfirmAction,
              style: { background: tour.is_archived ? '#C45C26' : '#1A0A00', color: '#FDF6EE' },
            },
          ].map(({ label, icon, onClick, style: btnStyle }) => (
            <button
              key={label}
              onClick={onClick}
              style={{
                padding: '8px 0',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 900,
                fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'opacity 0.15s',
                ...btnStyle,
              }}
            >
              {icon} {label}
            </button>
          ))}
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
      fontSize: 9, fontWeight: 900, letterSpacing: '0.25em',
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
    return <p style={{ fontSize: 13, fontWeight: 600, color: '#7A3A18', opacity: 0.5, margin: 0 }}>N/A</p>;
  }
 
  const iconColor = variant === 'exclude' ? '#8C2F1C' : variant === 'include' ? '#C45C26' : '#7A3A18';
  const itemBg = variant === 'exclude' ? 'rgba(140,47,28,0.06)' : variant === 'include' ? 'rgba(196,92,38,0.07)' : 'rgba(122,58,24,0.06)';
  const Icon = variant === 'exclude' ? X : CheckCircle2;
 
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: itemBg, borderRadius: 12, padding: '9px 12px',
        }}>
          <span style={{ color: iconColor, flexShrink: 0, marginTop: 1 }}><Icon size={13} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A0A00', lineHeight: 1.4 }}>{item}</span>
        </div>
      ))}
    </div>
  );
};
 
 
const ModalInput = ({ label, name, defaultValue, ...props }) => (
  <div style={{ marginBottom: 0 }}>
    <label style={{
      display: 'block', fontSize: 9, fontWeight: 800,
      letterSpacing: '0.2em', textTransform: 'uppercase',
      color: '#7A3A18', opacity: 0.7, marginBottom: 5,
    }}>{label}</label>
    <input
      name={name}
      defaultValue={defaultValue}
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: '#F2E4D0',
        border: '1px solid rgba(196,92,38,0.18)',
        borderRadius: 14, padding: '10px 14px',
        fontSize: 13, fontWeight: 600,
        color: '#1A0A00', fontFamily: 'inherit', outline: 'none',
      }}
    />
  </div>
);
 
export default TourManagement;