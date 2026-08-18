import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { notifyUser } from "./notifications";
import {
  Search, Loader2, Globe, Shield, X, MapPin, Calendar, Users,
  Phone, Mail, Wallet, Home, ChevronDown, CheckCircle2, XCircle,
  Clock, MessageSquare, ArrowRight,
} from 'lucide-react';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #C45C26  burnt sienna (accent)
// #E8A265  warm amber (highlight)
// #FDF6EE  cream (light bg)
// #7A3A18  rust mid-tone
// #F2E4D0  parchment (section bg)
// #8C2F1C  oxblood (reject / danger)
// ---------------------------------------------------------

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STATUS_STYLES = {
  Pending: { bg: 'rgba(232,162,101,0.25)', color: '#9A5B1E' },
  Approved: { bg: 'rgba(196,92,38,0.14)', color: '#C45C26' },
  Rejected: { bg: 'rgba(140,47,28,0.14)', color: '#8C2F1C' },
};

const StatusBadge = ({ status, large = false }) => {
  const { bg, color } = STATUS_STYLES[status] || STATUS_STYLES.Pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: large ? color : bg,
      color: large ? '#FDF6EE' : color,
      borderRadius: 999,
      padding: large ? '7px 18px' : '4px 12px',
      fontSize: large ? 11 : 9,
      fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
};

const TypeBadge = ({ type }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: type === 'exclusive' ? 'rgba(26,10,0,0.06)' : 'rgba(196,92,38,0.12)',
    color: type === 'exclusive' ? '#1A0A00' : '#C45C26',
    borderRadius: 999, padding: '4px 12px',
    fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
  }}>
    {type === 'exclusive' ? <Shield size={11} /> : <Globe size={11} />}
    {type === 'exclusive' ? 'Exclusive' : 'Request'}
  </span>
);

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

/* ─────────────────────────────────────────────
   ADMIN EXCLUSIVE / REQUESTED TOURS
───────────────────────────────────────────── */
const AdminExclusiveTours = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [selected, setSelected] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('exclusive_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching exclusive requests:', error.message);
      setLoading(false);
      return;
    }
    setRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-exclusive-requests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exclusive_requests' }, () => fetchRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRequests]);

  const filtered = requests.filter(r => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || `${r.full_name || ''} ${r.destination || ''} ${r.email || ''}`.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'All Status' || r.status === statusFilter;
    const matchesType = typeFilter === 'All Types' || r.request_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const pendingCount = requests.filter(r => r.status === 'Pending').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4, display: 'flex', flexDirection: 'column' }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: '1px solid rgba(196,92,38,0.15)',
          paddingBottom: 16, marginBottom: 20, gap: 20, flexWrap: 'wrap',
        }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', color: '#1A0A00', margin: '0 0 6px' }}>
              Exclusive & Requested Tours
            </h2>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.7, margin: 0, maxWidth: 540, lineHeight: 1.6 }}>
              Review private-group booking requests and new destination suggestions submitted by joiners.
              {pendingCount > 0 && (
                <span style={{ color: '#C45C26', fontWeight: 900 }}> {pendingCount} awaiting review.</span>
              )}
            </p>
          </div>
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
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={15} style={{
              position: 'absolute', left: 13, top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(122,58,24,0.35)', pointerEvents: 'none',
            }} />
            <input
              type="text" placeholder="Search name, destination, email…"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 36 }}
            />
          </div>
          <div style={{ position: 'relative', minWidth: 160 }}>
            <select
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ ...inputStyle, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}
            >
              <option value="All Status">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
            <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.35)' }} />
          </div>
          <div style={{ position: 'relative', minWidth: 175 }}>
            <select
              value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ ...inputStyle, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}
            >
              <option value="All Types">All Types</option>
              <option value="exclusive">Exclusive Tour</option>
              <option value="request">Requested Tour</option>
            </select>
            <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.35)' }} />
          </div>
        </div>

        {/* ── List ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '5rem 0', color: 'rgba(122,58,24,0.4)',
            }}>
              <Loader2 size={30} style={{ marginBottom: 10, animation: 'spin 1s linear infinite' }} />
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>
                Loading Requests…
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              padding: '5rem 0', textAlign: 'center',
              background: '#FDF6EE',
              borderRadius: 20,
              border: '2px dashed rgba(196,92,38,0.2)',
            }}>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(122,58,24,0.4)', margin: 0 }}>
                No requests found.
              </p>
            </div>
          ) : (
            filtered.map(r => (
              <RequestRow key={r.id} request={r} onView={() => setSelected(r)} />
            ))
          )}
        </div>

        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>

      {selected && (
        <RequestDetailModal
          request={selected}
          onClose={() => setSelected(null)}
          onResolved={() => { setSelected(null); fetchRequests(); }}
        />
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   REQUEST ROW (compact card)
───────────────────────────────────────────── */
const RequestRow = ({ request, onView }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onView}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#FDF6EE', borderRadius: 18, padding: '1.1rem 1.4rem',
        border: '1px solid rgba(196,92,38,0.12)',
        boxShadow: hovered ? '0 8px 24px rgba(26,10,0,0.1)' : '0 2px 10px rgba(26,10,0,0.04)',
        cursor: 'pointer', transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
        <TypeBadge type={request.request_type} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#7A3A18', opacity: 0.55 }}>
          {formatDate(request.created_at)}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ fontSize: 14, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{request.full_name || '—'}</p>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.7, display: 'flex', alignItems: 'center', gap: 5, margin: '4px 0 0' }}>
          <MapPin size={12} style={{ color: '#C45C26' }} /> {request.destination || '—'}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#7A3A18', minWidth: 130 }}>
        <Users size={13} style={{ color: '#C45C26' }} /> {request.group_size || '—'} pax
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#7A3A18', minWidth: 150 }}>
        <Calendar size={13} style={{ color: '#C45C26' }} /> {formatDate(request.preferred_date)}
      </div>

      <div style={{ marginLeft: 'auto' }}>
        <StatusBadge status={request.status} />
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   DETAIL ROW helper
───────────────────────────────────────────── */
const DetailRow = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <span style={{ color: '#C45C26', opacity: 0.7, marginTop: 2, flexShrink: 0 }}>{icon}</span>
    <div>
      <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7A3A18', opacity: 0.65, margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#1A0A00', margin: '3px 0 0' }}>
        {value || '—'}
      </p>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   REQUEST DETAIL MODAL — review + approve/reject + notify
───────────────────────────────────────────── */
const RequestDetailModal = ({ request, onClose, onResolved }) => {
  const [adminResponse, setAdminResponse] = useState(request.admin_response || '');
  const [submitting, setSubmitting] = useState(null); // 'approve' | 'reject' | null

  const isPending = request.status === 'Pending';
  const isExclusive = request.request_type === 'exclusive';

  const resolveRequest = async (decision) => {
    setSubmitting(decision);
    try {
      const { data: { user: adminUser } } = await supabase.auth.getUser();
      const newStatus = decision === 'approve' ? 'Approved' : 'Rejected';

      const { error: updateError } = await supabase
        .from('exclusive_requests')
        .update({
          status: newStatus,
          admin_response: adminResponse.trim() || null,
          reviewed_by: adminUser?.id || null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      // ── Notify the joiner ──
      const typeLabel = isExclusive ? 'Exclusive Tour' : 'Tour Request';
      const title = newStatus === 'Approved'
        ? `${typeLabel} Approved 🎉`
        : `${typeLabel} Update`;

      let message;
      if (newStatus === 'Approved') {
        message = isExclusive
          ? `Great news! Your exclusive tour request for ${request.destination} has been approved. Our team will reach out to finalize your itinerary, pricing, and downpayment details.`
          : `Great news! Your request to add ${request.destination} has been approved${request.tour_type === 'joiner' ? ' and will be opened for booking on Explore Tours soon.' : '. Our team will reach out with a custom price list.'}`;
      } else {
        message = `Your ${typeLabel.toLowerCase()} for ${request.destination} was not approved at this time.`;
      }
      if (adminResponse.trim()) {
        message += ` Note from our team: "${adminResponse.trim()}"`;
      }

      if (request.user_id) {
        await notifyUser(request.user_id, {
          title,
          message,
          type: 'exclusive_request',
          related_id: request.id,
        });
      }

      onResolved();
    } catch (err) {
      alert('Error updating request: ' + err.message);
    } finally {
      setSubmitting(null);
    }
  };

  const labelStyle = {
    display: 'block',
    fontSize: 9, fontWeight: 800,
    letterSpacing: '0.2em', textTransform: 'uppercase',
    color: '#7A3A18', opacity: 0.7,
    marginBottom: 6,
  };

  const accentColor = request.status === 'Approved' ? '#C45C26' : request.status === 'Rejected' ? '#8C2F1C' : '#E8A265';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 680,
        borderRadius: 28, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        overflow: 'hidden', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        borderTop: `8px solid ${accentColor}`,
      }}>
        {/* Header */}
        <div style={{
          background: '#1A0A00', padding: '1.75rem 2.25rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ marginBottom: 8 }}><TypeBadge type={request.request_type} /></div>
            <h2 style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.02em', color: '#FDF6EE', margin: 0 }}>
              {request.full_name || 'Joiner'}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <StatusBadge status={request.status} large />
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(232,210,190,0.5)', padding: 0 }}>
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '2rem 2.25rem', display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <DetailRow icon={<Mail size={14} />} label="Email" value={request.email} />
            <DetailRow icon={<Phone size={14} />} label="Contact Number" value={request.contact_number} />
            <DetailRow icon={<MapPin size={14} />} label="Destination" value={request.destination} />
            {request.region && <DetailRow icon={<MapPin size={14} />} label="Region / Province" value={request.region} />}
            <DetailRow icon={<Users size={14} />} label="Group Size" value={request.group_size ? `${request.group_size} pax` : null} />
            <DetailRow icon={<Calendar size={14} />} label="Preferred Date" value={formatDate(request.preferred_date)} />
            {isExclusive && <DetailRow icon={<Calendar size={14} />} label="Alternate Date" value={formatDate(request.alternate_date)} />}
            {isExclusive && <DetailRow icon={<Home size={14} />} label="Accommodation" value={request.accommodation} />}
            {isExclusive && <DetailRow icon={<Wallet size={14} />} label="Budget" value={request.budget ? `₱${Number(request.budget).toLocaleString()}` : null} />}
            {!isExclusive && <DetailRow icon={<ArrowRight size={14} />} label="Tour Type Preference" value={request.tour_type === 'joiner' ? 'Open to other joiners' : request.tour_type === 'exclusive' ? 'Exclusive for their group' : null} />}
          </div>

          {request.notes && (
            <div>
              <p style={labelStyle}>Notes / Special Requests</p>
              <div style={{ background: '#F2E4D0', borderRadius: 16, padding: '1rem 1.25rem' }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#1A0A00', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {request.notes}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.6 }}>
            <Clock size={13} /> Submitted {formatDateTime(request.created_at)}
            {request.reviewed_at && <> · Reviewed {formatDateTime(request.reviewed_at)}</>}
          </div>

          {/* Admin response / notify field */}
          <div>
            <p style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={12} /> Note to Joiner (included in their notification)
            </p>
            <textarea
              value={adminResponse}
              onChange={(e) => setAdminResponse(e.target.value)}
              placeholder={isPending ? "Optional message the joiner will see — e.g. pricing details, next steps, or reason for rejection." : ''}
              readOnly={!isPending}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: isPending ? '#F2E4D0' : 'rgba(122,58,24,0.06)',
                border: '1px solid rgba(196,92,38,0.18)',
                borderRadius: 14, padding: '12px 14px',
                fontSize: 13, fontWeight: 500, color: '#1A0A00',
                fontFamily: 'inherit', outline: 'none', resize: 'vertical',
              }}
            />
          </div>

          {!isPending && (
            <div style={{
              background: request.status === 'Approved' ? 'rgba(196,92,38,0.08)' : 'rgba(140,47,28,0.07)',
              borderRadius: 16, padding: '1rem 1.25rem',
              border: `1px solid ${request.status === 'Approved' ? 'rgba(196,92,38,0.2)' : 'rgba(140,47,28,0.2)'}`,
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              {request.status === 'Approved'
                ? <CheckCircle2 size={18} style={{ color: '#C45C26', flexShrink: 0, marginTop: 1 }} />
                : <XCircle size={18} style={{ color: '#8C2F1C', flexShrink: 0, marginTop: 1 }} />}
              <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: 0, lineHeight: 1.6 }}>
                This request has already been {request.status.toLowerCase()} and the joiner has been notified.
                {request.request_type === 'request' && request.status === 'Approved' && request.tour_type === 'joiner' && (
                  <> Remember to create the actual listing in <strong>Tour Management</strong> so joiners can book it.</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {isPending && (
          <div style={{
            padding: '1.5rem 2.25rem', borderTop: '1px solid rgba(196,92,38,0.12)',
            background: '#FDF6EE', display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end',
          }}>
            <button
              onClick={() => resolveRequest('reject')}
              disabled={submitting !== null}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '13px 22px',
                background: 'rgba(140,47,28,0.1)', color: '#8C2F1C',
                border: 'none', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 900,
                fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                opacity: submitting !== null ? 0.5 : 1,
              }}
            >
              {submitting === 'reject' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={14} />} Reject &amp; Notify
            </button>
            <button
              onClick={() => resolveRequest('approve')}
              disabled={submitting !== null}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '13px 26px',
                background: '#C45C26', color: '#FDF6EE',
                border: 'none', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 900,
                fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                boxShadow: '0 6px 20px rgba(196,92,38,0.35)',
                opacity: submitting !== null ? 0.5 : 1,
              }}
            >
              {submitting === 'approve' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} Approve &amp; Notify
            </button>
          </div>
        )}
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
};

export default AdminExclusiveTours;