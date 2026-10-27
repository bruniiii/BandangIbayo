import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import EmptyState from './ui/EmptyState';
import { SearchX, Inbox } from 'lucide-react';
import { toast } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { notifyUser } from "./notifications";
import { formatPeso, requestNotApprovedReason } from './tourUtils';
import { BAG_TAG_FEE, expenseItems } from './tourExpenses';
import { moneyInputProps, cleanMoney } from './moneyInput';
import {
  Search, Loader2, Globe, Shield, X, MapPin, Calendar, Users,
  Phone, Mail, Wallet, Home, ChevronDown, CheckCircle2, XCircle,
  Clock, MessageSquare, ArrowRight, FileText, Send, PencilLine, Package,
} from 'lucide-react';
import { SkeletonRows } from './ui/Skeleton';
import ModalHeader from './ui/ModalHeader';
import { formatYmdRange, daysLabel } from './dateRange';

// ── PALETTE ──────────────────────────────────────────────
// #1A0A00  espresso dark
// #A8481A  burnt sienna (accent)
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

// "Oct 10 – 12, 2026 · 3 days" for a date range, or the one preferred date.
const tripDates = (request) => {
  if (!request.preferred_date) return '—';
  if (!request.preferred_end_date) return formatDate(request.preferred_date);
  const days = request.trip_days ? ` · ${daysLabel(request.trip_days)}` : '';
  return `${formatYmdRange(request.preferred_date, request.preferred_end_date)}${days}`;
};

const formatDateTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STATUS_STYLES = {
  Pending: { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
  Approved: { bg: 'rgba(180,81,30,0.14)', color: '#A8481A' },
  Rejected: { bg: 'rgba(140,47,28,0.14)', color: '#8C2F1C' },
  Confirmed: { bg: '#1A0A00', color: '#E8A265' },
  'Fully Paid': { bg: 'rgba(122,58,24,0.16)', color: '#7A3A18' },
  'Not Approved': { bg: 'rgba(26,10,0,0.08)', color: 'rgba(26,10,0,0.8)' },
};

// Exclusive tours are confirmed once the joiner pays 50% of the package price,
// and fully paid once the balance is in too.
const EXCLUSIVE_DOWNPAYMENT_RATE = 0.5;
// Pending requests whose date passed, or is less than 2 weeks away, can't be
// approved any more: they show as "Not Approved".
const shownStatus = (request) => {
  if (requestNotApprovedReason(request)) return 'Not Approved';
  if (request.payment_status !== 'Paid') return request.status;
  return request.balance_settled ? 'Fully Paid' : 'Confirmed';
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

const TypeBadge = ({ type, dark = false }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: dark ? 'rgba(232,162,101,0.14)' : type === 'exclusive' ? 'rgba(26,10,0,0.06)' : 'rgba(180,81,30,0.12)',
    color: dark ? '#E8A265' : type === 'exclusive' ? '#1A0A00' : '#A8481A',
    borderRadius: 999, padding: '4px 12px',
    fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
  }}>
    {type === 'exclusive' ? <Shield size={11} /> : <Globe size={11} />}
    {type === 'exclusive' ? 'Exclusive' : 'Request'}
  </span>
);

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
    const matchesStatus = statusFilter === 'All Status' || shownStatus(r) === statusFilter;
    const matchesType = typeFilter === 'All Types' || r.request_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const pendingCount = requests.filter(r => r.status === 'Pending' && !requestNotApprovedReason(r)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {pendingCount > 0 && (
          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#A8481A', margin: '0 0 16px' }}>
            {pendingCount} request{pendingCount === 1 ? '' : 's'} awaiting review.
          </p>
        )}

        {/* ── Filters ── */}
        <div style={{
          background: '#FDF6EE',
          borderRadius: 20, padding: '14px 18px',
          border: '1px solid rgba(180,81,30,0.12)',
          boxShadow: '0 4px 16px rgba(26,10,0,0.05)',
          display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
          marginBottom: 24,
        }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={15} style={{
              position: 'absolute', left: 13, top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(122,58,24,0.85)', pointerEvents: 'none',
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
              <option value="Confirmed">Confirmed</option>
              <option value="Fully Paid">Fully Paid</option>
              <option value="Rejected">Rejected</option>
              <option value="Not Approved">Not Approved</option>
            </select>
            <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.85)' }} />
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
            <ChevronDown size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(122,58,24,0.85)' }} />
          </div>
        </div>

        {/* ── List ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading ? (
            <SkeletonRows count={5} label="Loading requests" />
          ) : filtered.length === 0 ? (
            (searchQuery || statusFilter !== 'All Status' || typeFilter !== 'All Types') ? (
              <EmptyState
                icon={SearchX}
                title="No requests match your filters"
                message="Try another search, status or request type."
                action={{ label: 'Clear Filters', onClick: () => { setSearchQuery(''); setStatusFilter('All Status'); setTypeFilter('All Types'); } }}
              />
            ) : (
              <EmptyState icon={Inbox} title="No requests yet" message="Exclusive tour and custom trip requests from joiners will show up here." />
            )
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
        border: '1px solid rgba(180,81,30,0.12)',
        boxShadow: hovered ? '0 8px 24px rgba(26,10,0,0.1)' : '0 2px 10px rgba(26,10,0,0.04)',
        cursor: 'pointer', transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
        <TypeBadge type={request.request_type} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9 }}>
          {formatDate(request.created_at)}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ fontSize: 14, fontWeight: 900, color: '#1A0A00', margin: 0 }}>{request.full_name || '—'}</p>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#7A3A18', opacity: 0.9, display: 'flex', alignItems: 'center', gap: 5, margin: '4px 0 0' }}>
          <MapPin size={12} style={{ color: '#A8481A' }} /> {request.destination || '—'}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#7A3A18', minWidth: 130 }}>
        <Users size={13} style={{ color: '#A8481A' }} /> {request.group_size || '—'} pax
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#7A3A18', minWidth: 150 }}>
        <Calendar size={13} style={{ color: '#A8481A' }} /> {tripDates(request)}
      </div>

      <div style={{ marginLeft: 'auto' }}>
        <StatusBadge status={shownStatus(request)} />
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   DETAIL ROW helper
───────────────────────────────────────────── */
const DetailRow = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
    <span style={{ color: '#A8481A', opacity: 0.9, marginTop: 2, flexShrink: 0 }}>{icon}</span>
    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A3A18', margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: 15, fontWeight: 800, color: '#1A0A00', margin: '3px 0 0' }}>
        {value || '—'}
      </p>
    </div>
  </div>
);

/* ─────────────────────────────────────────────
   REQUEST DETAIL MODAL — review + approve/reject + notify
───────────────────────────────────────────── */
// ── Payment status: 50% downpayment, then the balance (joiners pay online;
//    admins can record payments made another way) ──
const DownpaymentSection = ({ request, price, onChanged }) => {
  const [saving, setSaving] = useState(false);
  const isPaid = request.payment_status === 'Paid';
  const downpayment = Math.round(price * EXCLUSIVE_DOWNPAYMENT_RATE * 100) / 100;
  const paidAmount = Number(request.amount_paid) || 0;
  const balance = Math.max(0, Math.round((price - paidAmount) * 100) / 100);
  const fullyPaid = isPaid && (request.balance_settled || balance <= 0);

  const record = async ({ confirm, update, notify, done }) => {
    if (!(await confirmDialog({ ...confirm, cancelLabel: 'Go Back' }))) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('exclusive_requests')
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq('id', request.id);
      if (error) throw error;
      if (request.user_id) {
        await notifyUser(request.user_id, { ...notify, type: 'exclusive_request', related_id: request.id });
      }
      toast.success(done, 'The joiner was notified.');
      onChanged();
    } catch (err) {
      toast.error("Couldn't record payment", err.message);
    } finally {
      setSaving(false);
    }
  };

  const markDownpaymentPaid = () => record({
    confirm: {
      title: 'Mark downpayment as paid?',
      message: `Only do this if the joiner paid ${formatPeso(downpayment)} another way (cash, bank transfer). Their exclusive tour will show as Confirmed.`,
      confirmLabel: 'Mark as Paid',
    },
    update: { payment_status: 'Paid', downpayment_amount: downpayment, amount_paid: downpayment, paid_at: new Date().toISOString() },
    notify: {
      title: 'Exclusive Tour Confirmed 🎉',
      message: `We received your ${formatPeso(downpayment)} downpayment for your exclusive tour to ${request.destination}. Your booking is confirmed. You can pay the remaining ${formatPeso(Math.max(0, price - downpayment))} online under Exclusive Tours, or settle it with our team before the trip.`,
    },
    done: 'Downpayment recorded',
  });

  const markBalancePaid = () => record({
    confirm: {
      title: 'Mark balance as paid?',
      message: `Only do this if the joiner paid the remaining ${formatPeso(balance)} another way (cash, bank transfer). Their exclusive tour will show as Fully Paid.`,
      confirmLabel: 'Mark Balance Paid',
    },
    update: { balance_settled: true, balance_amount: balance, amount_paid: paidAmount + balance, balance_paid_at: new Date().toISOString() },
    notify: {
      title: 'Exclusive Tour Fully Paid ✅',
      message: `We received your ${formatPeso(balance)} balance for your exclusive tour to ${request.destination}. Your tour is fully paid. See you on the trip!`,
    },
    done: 'Balance recorded',
  });

  let title, text;
  if (fullyPaid) {
    title = 'Fully Paid';
    text = `Paid ${formatPeso(paidAmount)} in total. Downpayment on ${formatDateTime(request.paid_at)}${request.balance_paid_at ? `, balance on ${formatDateTime(request.balance_paid_at)}` : ''}.`;
  } else if (isPaid) {
    title = 'Downpayment Paid · Confirmed';
    text = `Paid ${formatPeso(paidAmount)} on ${formatDateTime(request.paid_at)}. Remaining balance: ${formatPeso(balance)}. The joiner can pay it online, or you can mark it paid.`;
  } else if (price > 0) {
    title = '50% Downpayment';
    text = `Waiting for the joiner to pay the 50% downpayment of ${formatPeso(downpayment)} (package price ${formatPeso(price)}).`;
  } else {
    title = '50% Downpayment';
    text = 'Send the tour package with a price first. The joiner can then pay a 50% downpayment online to confirm.';
  }

  const action = !isPaid && price > 0
    ? { label: 'Mark as Paid', onClick: markDownpaymentPaid }
    : isPaid && !fullyPaid ? { label: 'Mark Balance Paid', onClick: markBalancePaid } : null;

  return (
    <div style={{
      background: isPaid ? '#1A0A00' : '#F2E4D0', borderRadius: 18, padding: '1.25rem 1.5rem',
      border: '1px solid rgba(180,81,30,0.18)',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <p style={{
          display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 6px',
          fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: isPaid ? '#E8A265' : '#1A0A00',
        }}>
          {isPaid ? <CheckCircle2 size={14} /> : <Wallet size={14} style={{ color: '#A8481A' }} />}
          {title}
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.6, margin: 0, color: isPaid ? 'rgba(253,246,238,0.9)' : '#7A3A18' }}>{text}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 999,
            border: '1px solid rgba(180,81,30,0.35)', background: '#FDF6EE', color: '#A8481A',
            fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />}
          {action.label}
        </button>
      )}
    </div>
  );
};

// Expenses in the package form: Van Rent, Tour Guide, the fixed Bag Tag and
// any other costs (name + amount).
const ExpensesFields = ({ value, onChange, labelStyle, inputStyle }) => {
  const setOther = (i, field, v) => onChange((f) => ({
    ...f, others: f.others.map((o, j) => (j === i ? { ...o, [field]: v } : o)),
  }));
  return (
    <div style={{ background: 'rgba(180,81,30,0.06)', borderRadius: 16, padding: '1rem', border: '1px solid rgba(180,81,30,0.18)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ ...labelStyle, opacity: 1, margin: 0 }}>Expenses</p>
      <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <p style={labelStyle}>Van Rent (₱)</p>
          <input {...moneyInputProps} aria-label="Van Rent" value={value.van_rent} placeholder="₱15,000 – ₱30,000"
            onChange={(e) => onChange((f) => ({ ...f, van_rent: cleanMoney(e.target.value) }))} style={inputStyle} />
        </div>
        <div>
          <p style={labelStyle}>Tour Guide (₱)</p>
          <input {...moneyInputProps} aria-label="Tour Guide" value={value.tour_guide} placeholder="₱1,300 – ₱2,000"
            onChange={(e) => onChange((f) => ({ ...f, tour_guide: cleanMoney(e.target.value) }))} style={inputStyle} />
        </div>
        <div>
          <p style={labelStyle}>Bag Tag (₱)</p>
          <p style={{ ...inputStyle, margin: 0, background: 'rgba(242,228,208,0.6)' }}>
            {BAG_TAG_FEE.toFixed(2)} <span style={{ fontWeight: 600, color: '#7A3A18' }}>(fixed)</span>
          </p>
        </div>
      </div>
      {value.others.map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="text" aria-label={`Other expense ${i + 1} name`} value={o.name} placeholder="e.g. Entrance Fee" maxLength={60}
            onChange={(e) => setOther(i, 'name', e.target.value)} style={{ ...inputStyle, flex: 2 }} />
          <input {...moneyInputProps} aria-label={`Other expense ${i + 1} amount`} value={o.amount} placeholder="Amount"
            onChange={(e) => setOther(i, 'amount', cleanMoney(e.target.value))} style={{ ...inputStyle, flex: 1 }} />
          <button type="button" aria-label="Remove this expense" title="Remove"
            onClick={() => onChange((f) => ({ ...f, others: f.others.filter((_, j) => j !== i) }))}
            style={{ background: 'rgba(140,47,28,0.1)', color: '#8C2F1C', border: 'none', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange((f) => ({ ...f, others: [...f.others, { name: '', amount: '' }] }))}
        style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed rgba(180,81,30,0.4)', borderRadius: 999, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 800, color: '#A8481A' }}>
        + Add other expense
      </button>
      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', margin: 0, lineHeight: 1.5 }}>
        Once they pay, the joiner sees the names of these expenses (not the prices) on their request and receipt.
      </p>
    </div>
  );
};

const RequestDetailModal = ({ request, onClose, onResolved }) => {
  const [adminResponse, setAdminResponse] = useState(request.admin_response || '');
  const [submitting, setSubmitting] = useState(null); // 'approve' | 'reject' | null

  const notApprovedReason = requestNotApprovedReason(request);
  const isPending = request.status === 'Pending' && !notApprovedReason;
  const isExclusive = request.request_type === 'exclusive';
  const isApproved = request.status === 'Approved';

  // ── Tour Package Details (sent to the joiner once a request is approved) ──
  const existingPackage = request.package_details || {};
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [packageSentAt, setPackageSentAt] = useState(request.package_sent_at || null);
  const [sentPrice, setSentPrice] = useState(Number(existingPackage.price) || 0);
  const [sendingPackage, setSendingPackage] = useState(false);
  const [packageForm, setPackageForm] = useState({
    destination: existingPackage.destination || request.destination || '',
    price: existingPackage.price ?? (request.budget || ''),
    accommodation: existingPackage.accommodation || request.accommodation || '',
    itinerary: existingPackage.itinerary || '',
    inclusions: existingPackage.inclusions || '',
    exclusions: existingPackage.exclusions || '',
    things_to_bring: existingPackage.things_to_bring || '',
    additional_notes: existingPackage.additional_notes || '',
  });
  // Expenses (same rules as tours): Van Rent ₱15,000–₱30,000, Tour Guide
  // ₱1,300–₱2,000, Bag Tag ₱260, plus any others. Joiners see the names only.
  const [expenseForm, setExpenseForm] = useState({
    van_rent: existingPackage.expenses?.van_rent ?? '',
    tour_guide: existingPackage.expenses?.tour_guide ?? '',
    others: (existingPackage.expenses?.others || []).map((o) => ({ name: o.name, amount: String(o.amount) })),
  });

  const setPkgField = (field) => (e) =>
    setPackageForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSendPackage = async () => {
    if (packageForm.price !== '' && packageForm.price != null && !(Number(packageForm.price) >= 0)) {
      toast.error('Check the price', 'Price must be zero or more.');
      return;
    }
    const vanRent = Number(expenseForm.van_rent);
    const tourGuide = Number(expenseForm.tour_guide);
    const others = expenseForm.others.filter((o) => o.name.trim() || o.amount !== '');
    const expenseError =
      expenseForm.van_rent === '' || !(vanRent >= 15000) ? 'Van Rent must be at least ₱15,000.'
      : vanRent > 30000 ? 'Van Rent can be at most ₱30,000.'
      : expenseForm.tour_guide === '' || !(tourGuide >= 1300) ? 'Tour Guide must be at least ₱1,300.'
      : tourGuide > 2000 ? 'Tour Guide can be at most ₱2,000.'
      : others.some((o) => !o.name.trim()) ? 'Name each other expense, e.g. Entrance Fee.'
      : others.some((o) => o.amount === '' || !(Number(o.amount) >= 0)) ? 'Give each other expense an amount of ₱0 or more.'
      : '';
    if (expenseError) { toast.error('Check the expenses', expenseError); return; }
    const expenses = {
      van_rent: Math.round(vanRent * 100) / 100,
      tour_guide: Math.round(tourGuide * 100) / 100,
      bag_tag: BAG_TAG_FEE,
      others: others.map((o) => ({ name: o.name.trim(), amount: Math.round(Number(o.amount) * 100) / 100 })),
    };
    setSendingPackage(true);
    try {
      const sentAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('exclusive_requests')
        .update({
          package_details: { ...packageForm, expenses },
          package_sent_at: sentAt,
        })
        .eq('id', request.id);
      if (updateError) throw updateError;

      const lines = [
        `📍 Destination: ${packageForm.destination || request.destination || '—'}`,
      ];
      if (packageForm.price) lines.push(`💰 Price: ${formatPeso(Number(packageForm.price))}`);
      if (packageForm.accommodation) lines.push(`🏨 Accommodation: ${packageForm.accommodation}`);
      if (packageForm.itinerary) lines.push(`🗺️ Itinerary:\n${packageForm.itinerary}`);
      if (packageForm.inclusions) lines.push(`✅ Inclusions:\n${packageForm.inclusions}`);
      if (packageForm.exclusions) lines.push(`❌ Exclusions:\n${packageForm.exclusions}`);
      if (packageForm.things_to_bring) lines.push(`🎒 Things to Bring:\n${packageForm.things_to_bring}`);
      lines.push(`🧾 Expenses covered: ${expenseItems(expenses).map((i) => i.label).join(', ')}`);
      if (packageForm.additional_notes) lines.push(`📝 Notes:\n${packageForm.additional_notes}`);

      if (request.user_id) {
        await notifyUser(request.user_id, {
          title: 'Your Tour Package Details 📋',
          message: `Here's the full package for your ${isExclusive ? 'exclusive tour' : 'requested tour'} to ${packageForm.destination || request.destination}:\n\n${lines.join('\n\n')}`,
          type: 'exclusive_package',
          related_id: request.id,
        });
      }

      setPackageSentAt(sentAt);
      setSentPrice(Number(packageForm.price) || 0);
      setShowPackageForm(false);
      toast.success('Package sent', 'The joiner was notified with the full package details.');
    } catch (err) {
      toast.error("Couldn't send tour package", err.message);
    } finally {
      setSendingPackage(false);
    }
  };

  const resolveRequest = async (decision) => {
    if (decision === 'reject' && !(await confirmDialog({
      title: 'Reject this request?',
      message: 'The joiner will be notified that their request was declined.',
      confirmLabel: 'Reject Request', cancelLabel: 'Go Back', tone: 'danger',
    }))) return;
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

      toast.success(decision === 'approve' ? 'Request approved' : 'Request rejected', 'The joiner has been notified.');
      onResolved();
    } catch (err) {
      toast.error("Couldn't update request", err.message);
    } finally {
      setSubmitting(null);
    }
  };

  const labelStyle = {
    display: 'block',
    fontSize: 11, fontWeight: 800,
    letterSpacing: '0.2em', textTransform: 'uppercase',
    color: '#7A3A18', opacity: 0.9,
    marginBottom: 6,
  };

  const packageInputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#FDF6EE',
    border: '1px solid rgba(180,81,30,0.2)',
    borderRadius: 14, padding: '10px 14px',
    fontSize: 13, fontWeight: 500, color: '#1A0A00',
    fontFamily: 'inherit', outline: 'none',
  };


  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 680,
        borderRadius: 24, borderTop: '6px solid #B4511E', boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        overflow: 'hidden', maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column',
      }}>
        <ModalHeader
          name={request.full_name}
          label={isExclusive ? 'Exclusive Tour Request' : 'Tour Request'}
          title={request.full_name || 'Joiner'}
          onClose={onClose}
        >
          <StatusBadge status={shownStatus(request)} />
          <TypeBadge type={request.request_type} />
        </ModalHeader>

        {/* Body */}
        <div className="request-modal-body" style={{ overflowY: 'auto', flex: 1, padding: '2rem 2.25rem', display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
            <DetailRow icon={<Mail size={14} />} label="Email" value={request.email} />
            <DetailRow icon={<Phone size={14} />} label="Contact Number" value={request.contact_number} />
            <DetailRow icon={<MapPin size={14} />} label="Destination" value={request.destination} />
            {request.region && <DetailRow icon={<MapPin size={14} />} label="Region / Province" value={request.region} />}
            <DetailRow icon={<Users size={14} />} label="Group Size" value={request.group_size ? `${request.group_size} pax` : null} />
            <DetailRow icon={<Calendar size={14} />} label={request.preferred_end_date ? 'Preferred Dates' : 'Preferred Date'} value={tripDates(request)} />
            {isExclusive && request.alternate_date && <DetailRow icon={<Calendar size={14} />} label="Alternate Date" value={formatDate(request.alternate_date)} />}
            {isExclusive && <DetailRow icon={<Home size={14} />} label="Accommodation" value={request.accommodation} />}
            {isExclusive && <DetailRow icon={<Wallet size={14} />} label="Budget" value={request.budget ? `${formatPeso(Number(request.budget))}` : null} />}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: '#7A3A18', opacity: 0.9 }}>
            <Clock size={13} /> Submitted {formatDateTime(request.created_at)}
            {request.reviewed_at && <> · Reviewed {formatDateTime(request.reviewed_at)}</>}
          </div>

          {notApprovedReason && (
            <div style={{
              background: 'rgba(26,10,0,0.05)', borderRadius: 16, padding: '1rem 1.25rem',
              border: '1px solid rgba(26,10,0,0.15)', display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <XCircle size={18} style={{ color: '#7A3A18', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: 0, lineHeight: 1.6 }}>
                <strong style={{ color: '#1A0A00' }}>Not approved.</strong> {notApprovedReason} Requests can only be approved at least 2 weeks before the preferred date.
              </p>
            </div>
          )}

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
                border: '1px solid rgba(180,81,30,0.18)',
                borderRadius: 14, padding: '12px 14px',
                fontSize: 13, fontWeight: 500, color: '#1A0A00',
                fontFamily: 'inherit', outline: 'none', resize: 'vertical',
              }}
            />
          </div>

          {!isPending && !notApprovedReason && (
            <div style={{
              background: request.status === 'Approved' ? 'rgba(180,81,30,0.08)' : 'rgba(140,47,28,0.07)',
              borderRadius: 16, padding: '1rem 1.25rem',
              border: `1px solid ${request.status === 'Approved' ? 'rgba(180,81,30,0.2)' : 'rgba(140,47,28,0.2)'}`,
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              {request.status === 'Approved'
                ? <CheckCircle2 size={18} style={{ color: '#A8481A', flexShrink: 0, marginTop: 1 }} />
                : <XCircle size={18} style={{ color: '#8C2F1C', flexShrink: 0, marginTop: 1 }} />}
              <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: 0, lineHeight: 1.6 }}>
                This request has already been {request.status.toLowerCase()} and the joiner has been notified.
                {request.request_type === 'request' && request.status === 'Approved' && request.tour_type === 'joiner' && (
                  <> Remember to create the actual listing in <strong>Tour Management</strong> so joiners can book it.</>
                )}
              </p>
            </div>
          )}

          {/* Tour Package Details — send full trip info to the joiner once approved */}
          {isApproved && (
            <div style={{
              background: '#F2E4D0', borderRadius: 18, padding: '1.5rem',
              border: '1px solid rgba(180,81,30,0.18)',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <p style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: '#1A0A00', margin: 0,
                }}>
                  <Package size={14} style={{ color: '#A8481A' }} /> Tour Package Details
                </p>
                {packageSentAt && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: '#A8481A', background: 'rgba(180,81,30,0.12)', borderRadius: 999, padding: '4px 10px',
                  }}>
                    <CheckCircle2 size={12} /> Sent {formatDateTime(packageSentAt)}
                  </span>
                )}
              </div>

              {!showPackageForm ? (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '0 0 14px', lineHeight: 1.6 }}>
                    {packageSentAt
                      ? "Send updated details if anything about the trip has changed since you last notified the joiner."
                      : "Once you've finalized the trip, send the joiner the confirmed destination, price, inclusions, exclusions, itinerary, and things to bring — delivered straight to their notifications."}
                  </p>
                  <button
                    onClick={() => setShowPackageForm(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '12px 22px',
                      background: '#1A0A00', color: '#E8A265',
                      border: 'none', borderRadius: 999, cursor: 'pointer',
                      fontFamily: 'inherit', fontWeight: 900,
                      fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                    }}
                  >
                    {packageSentAt ? <PencilLine size={14} /> : <Send size={14} />}
                    {packageSentAt ? 'Edit & Resend Package' : 'Send Tour Package to Joiner'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <p style={labelStyle}>Confirmed Destination</p>
                      <input
                        type="text" data-allow="place" value={packageForm.destination} onChange={setPkgField('destination')}
                        placeholder="e.g. Sagada, Mountain Province"
                        style={packageInputStyle}
                      />
                    </div>
                    <div>
                      <p style={labelStyle}>Final Price (₱)</p>
                      <input
                        {...moneyInputProps} value={packageForm.price} onChange={(e) => setPackageForm((f) => ({ ...f, price: cleanMoney(e.target.value) }))}
                        placeholder="e.g. 55000"
                        style={packageInputStyle}
                      />
                    </div>
                  </div>

                  <div>
                    <p style={labelStyle}>Accommodation</p>
                    <input
                      type="text" value={packageForm.accommodation} onChange={setPkgField('accommodation')}
                      placeholder="e.g. AC Room, Private CR"
                      style={packageInputStyle}
                    />
                  </div>

                  <div>
                    <p style={labelStyle}>Itinerary</p>
                    <textarea
                      value={packageForm.itinerary} onChange={setPkgField('itinerary')}
                      placeholder={'Day 1:\n08:00 AM – Departure from meetup point\n...'}
                      rows={3}
                      style={{ ...packageInputStyle, resize: 'vertical' }}
                    />
                  </div>

                  <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <p style={labelStyle}>Inclusions</p>
                      <textarea
                        value={packageForm.inclusions} onChange={setPkgField('inclusions')}
                        placeholder={'Van transport\nAccommodation\nGuide fee'}
                        rows={3}
                        style={{ ...packageInputStyle, resize: 'vertical' }}
                      />
                    </div>
                    <div>
                      <p style={labelStyle}>Exclusions</p>
                      <textarea
                        value={packageForm.exclusions} onChange={setPkgField('exclusions')}
                        placeholder={'Personal expenses\nEntrance fees'}
                        rows={3}
                        style={{ ...packageInputStyle, resize: 'vertical' }}
                      />
                    </div>
                  </div>

                  <div>
                    <p style={labelStyle}>Things to Bring</p>
                    <textarea
                      value={packageForm.things_to_bring} onChange={setPkgField('things_to_bring')}
                      placeholder={'Comfortable shoes\nRaincoat\nCash for entrance fees'}
                      rows={2}
                      style={{ ...packageInputStyle, resize: 'vertical' }}
                    />
                  </div>

                  <ExpensesFields value={expenseForm} onChange={setExpenseForm} labelStyle={labelStyle} inputStyle={packageInputStyle} />

                  <div>
                    <p style={labelStyle}>Additional Notes (optional)</p>
                    <textarea
                      value={packageForm.additional_notes} onChange={setPkgField('additional_notes')}
                      placeholder="Anything else the joiner should know before the trip."
                      rows={2}
                      style={{ ...packageInputStyle, resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setShowPackageForm(false)}
                      disabled={sendingPackage}
                      style={{
                        padding: '12px 20px',
                        background: 'rgba(122,58,24,0.1)', color: '#7A3A18',
                        border: 'none', borderRadius: 999, cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 900,
                        fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendPackage}
                      disabled={sendingPackage}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '12px 24px',
                        background: '#B4511E', color: '#FDF6EE',
                        border: 'none', borderRadius: 999, cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 900,
                        fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                        boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
                        opacity: sendingPackage ? 0.6 : 1,
                      }}
                    >
                      {sendingPackage
                        ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        : <Send size={14} />}
                      {packageSentAt ? 'Resend to Joiner' : 'Send to Joiner'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isApproved && isExclusive && (
            <DownpaymentSection request={request} price={packageSentAt ? sentPrice : 0} onChanged={onResolved} />
          )}
        </div>

        {/* Footer actions */}
        {isPending && (
          <div className="request-modal-actions" style={{
            padding: '1.5rem 2.25rem', borderTop: '1px solid rgba(180,81,30,0.12)',
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
                fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                opacity: submitting !== null ? 0.5 : 1,
              }}
            >
              {submitting === 'reject' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={14} />} Reject Request
            </button>
            <button
              onClick={() => resolveRequest('approve')}
              disabled={submitting !== null}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '13px 26px',
                background: '#B4511E', color: '#FDF6EE',
                border: 'none', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 900,
                fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
                opacity: submitting !== null ? 0.5 : 1,
              }}
            >
              {submitting === 'approve' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} Approve Request
            </button>
          </div>
        )}
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
};

export default AdminExclusiveTours;