import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { toast, reportError } from './ui/toast';
import { confirmDialog } from './ui/ConfirmDialog';
import { sendWaitlistOpeningsEmail, sendCancellationApprovedEmail } from "./Email";
import { notifyUser } from './notifications';
import { useReceiptUrl } from './receipts';
import { printReceipt } from './paymentReceipt';
import { formatPeso, bookingDownpayment, formatDateRange as formatTourDates } from './tourUtils';
import { MapPin, Loader2, Eye, X, CheckCircle2, XCircle, Hash, User, CreditCard, AlertCircle, Image as ImageIcon, Wallet, Printer, Users, History } from 'lucide-react';
import { SkeletonLines } from './ui/Skeleton';
import ModalHeader from './ui/ModalHeader';
import { StatusBadge, BalanceStatusBadge, PaymentMethodBadge } from './BookingBadges';
import { owesBalance } from './bookingStatus';

// ─────────────────────────────────────────────
// BOOKING DETAILS window (Booking Management → View Info): the joiner,
// trip, payment and receipt, the actions on the booking, and its activity log.
// ─────────────────────────────────────────────

const BookingDetailModal = ({ booking, onClose, onChanged, onStatusUpdate, onSettleBalance }) => {
  // Receipts are private: view them through a short-lived signed link.
  const receiptSrc = useReceiptUrl(booking.receipt_url);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [profile, setProfile] = useState(null);
  const [balanceSettled, setBalanceSettled] = useState(!!booking.balance_settled);
  const [balanceSettledAt, setBalanceSettledAt] = useState(booking.balance_settled_at || null);
  const [settlingBalance, setSettlingBalance] = useState(false);
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);
  const [balanceReceived, setBalanceReceived] = useState(false); // ticked in the confirm window
 
  useEffect(() => {
    const fetchProfile = async () => {
      if (!booking.user_id) return;
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone_number')
        .eq('id', booking.user_id)
        .single();
      if (data) setProfile(data);
    };
    fetchProfile();
  }, [booking.user_id]);
 
  const formatDateRange = (d, dur) => formatTourDates(d, dur) || '—';
 
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
 
  const handleConfirm = async () => {
    setConfirming(true);
    await onStatusUpdate(booking.id, 'Confirmed');
    setConfirming(false);
  };
 
  const handleReject = async () => {
    // Rejecting by mistake would tell the joiner their payment failed, so confirm first.
    if (!(await confirmDialog({ title: `Reject the payment for ${booking.booking_number}?`, message: 'The joiner will be notified and emailed that their payment was rejected.', confirmLabel: 'Reject Payment', cancelLabel: 'Go Back', tone: 'danger' }))) return;
    setRejecting(true);
    await onStatusUpdate(booking.id, 'Rejected');
    setRejecting(false);
  };
 
  const isPending = booking.payment_status === 'Pending' || booking.payment_status === 'Verification Pending';
  const isComplete = booking.payment_status === 'Complete';
  const isRejected = booking.payment_status === 'Rejected';
  const isCancelled = !isPending && booking.booking_status === 'Cancelled' && booking.payment_status !== 'Rejected';
  const cancelRequested = !!booking.cancellation_requested_at && !isCancelled && !isRejected && booking.booking_status !== 'Rejected';
  const derivedStatus = isPending ? booking.payment_status : (isRejected ? 'Rejected' : isCancelled ? 'Cancelled' : cancelRequested ? 'Cancellation Requested' : booking.payment_status);
  const shownStatus = derivedStatus === 'Complete' && owesBalance(booking) ? 'Downpayment Paid' : derivedStatus;
  const [deciding, setDeciding] = useState(null); // 'approve' while saving

  // An older cancellation request: approve it (frees their slots).
  const decideCancellation = async () => {
    if (!(await confirmDialog({ title: 'Approve this cancellation?', message: `${booking.booking_number} will be cancelled and its ${booking.slots_booked} slot${booking.slots_booked === 1 ? '' : 's'} released. Payments are non-refundable.`, confirmLabel: 'Approve Cancellation', cancelLabel: 'Go Back', tone: 'danger' }))) return;
    setDeciding('approve');
    const { error } = await supabase.from('bookings').update({ booking_status: 'Cancelled' }).eq('id', booking.id);
    setDeciding(null);
    if (error) { toast.error("Couldn't update the booking", error.message); return; }
    notifyUser(booking.user_id, { title: 'Cancellation Approved', message: `Your cancellation for ${booking.tours?.title || 'your tour'} (${booking.booking_number}) has been approved, and your slot has been released.`, type: 'cancellation', related_id: booking.id });
    sendWaitlistOpeningsEmail({ tourId: booking.tour_id });
    sendCancellationApprovedEmail({ bookingId: booking.id });
    toast.success('Cancellation approved', 'The slots were released and the joiner was notified and emailed.');
    onChanged?.();
  };
 
  const subtotal = booking.total_price || 0;
  const amountPaid = balanceSettled ? subtotal : (booking.amount_paid || subtotal);
  const downpaymentAmount = bookingDownpayment(booking);
  const balance = booking.payment_method === 'Downpayment' ? subtotal - downpaymentAmount : 0;
  const isDownpayment = booking.payment_method === 'Downpayment';
 
  const joinerName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || '—' : (booking.full_name || '—');
 
  const handleSettleBalance = async () => {
    setShowSettleConfirm(false);
    setSettlingBalance(true);
    const updated = await onSettleBalance(booking.id, subtotal);
    if (updated) {
      setBalanceSettled(true);
      setBalanceSettledAt(updated.balance_settled_at);
    }
    setSettlingBalance(false);
  };
 
  // The same till-style receipt joiners download, opened to print.
  const handlePrintReceipt = (part = 'payment') => {
    printReceipt({
      ...booking,
      full_name: joinerName,
      balance_settled: balanceSettled || booking.balance_settled,
      balance_settled_at: balanceSettledAt || booking.balance_settled_at,
      amount_paid: balanceSettled ? subtotal : booking.amount_paid,
    }, booking.tours, part).catch((e) => toast.error("Couldn't create the receipt", e.message));
  };
 
 
  const labelStyle = {
    display: 'block',
    fontSize: 11, fontWeight: 800,
    letterSpacing: '0.2em', textTransform: 'uppercase',
    color: '#7A3A18', opacity: 0.9,
    marginBottom: 5,
  };
 
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: '#FDF6EE',
        width: '100%', maxWidth: 760,
        borderRadius: 24, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
        overflow: 'hidden',
        borderTop: '6px solid #B4511E',
        maxHeight: '92dvh',
        display: 'flex', flexDirection: 'column',
      }}>
 
        <ModalHeader
          name={joinerName}
          photo={profile?.avatar_url}
          label="Booking Details"
          title={booking.booking_number || 'N/A'}
          onClose={onClose}
        >
          <StatusBadge status={shownStatus} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7A3A18' }}>{joinerName}</span>
        </ModalHeader>

        {/* Scrollable Body */}
        <div className="responsive-modal-padding" style={{ overflowY: 'auto', flex: 1, padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: 28 }}>
 
          <ViewSection title="Booking Information" icon={<Hash size={14} />}>
            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InfoItem label="Booking Number" value={booking.booking_number} mono />
              <InfoItem label="Booking Date" value={formatDateTime(booking.created_at)} />
              {/* The admin who verified / recorded the payment (online payments have none). */}
              <InfoItem label="Payment Processed By" value={booking.processed_by_name || (booking.paymongo_payment_id ? 'Online (PayMongo)' : '—')} />
              {booking.balance_settled && (
                <InfoItem label="Balance Processed By" value={booking.balance_processed_by_name || (booking.paymongo_balance_payment_id ? 'Online (PayMongo)' : '—')} />
              )}
            </div>
          </ViewSection>
 
          <ViewSection title="Joiner Information" icon={<User size={14} />}>
            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InfoItem
                label="Full Name"
                value={profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || '—' : booking.full_name || '—'}
              />
              <InfoItem label="Phone Number" value={profile?.phone_number || booking.contact_number || '—'} />
              <InfoItem label="Email Address" value={booking.email || '—'} />
            </div>
          </ViewSection>
 
          <ViewSection title="Tour Information" icon={<MapPin size={14} />}>
            <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InfoItem label="Tour Name" value={booking.tours?.title || '—'} />
              <InfoItem label="Destination" value={booking.tours?.destination || '—'} />
              <InfoItem label="Tour Date" value={formatDateRange(booking.tours?.start_date, booking.tours?.duration)} />
              <InfoItem label="Quantity (pax)" value={`${booking.slots_booked} ${booking.slots_booked === 1 ? 'person' : 'persons'}`} />
            </div>
          </ViewSection>

          {booking.companions?.length > 0 && (
            <ViewSection title="Group Members" icon={<Users size={14} />}>
              <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {booking.companions.map((c, i) => (
                  <InfoItem key={i} label={`Person ${i + 2}`} value={`${c.full_name} · ${c.contact_number}`} />
                ))}
              </div>
            </ViewSection>
          )}
 
          <ViewSection title="Payment Information" icon={<CreditCard size={14} />}>
            <div style={{ background: '#F2E4D0', borderRadius: 18, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
 
              <div className="responsive-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={labelStyle}>Payment Method</p>
                  <PaymentMethodBadge method={booking.payment_method} />
                </div>
                <div>
                  <p style={labelStyle}>Booking Status</p>
                  <StatusBadge status={shownStatus} wrap />
                </div>
                {isDownpayment && isComplete && (
                  <div>
                    <p style={labelStyle}>Balance Status</p>
                    <BalanceStatusBadge status={balanceSettled ? 'Fully Paid' : 'Balance Due'} />
                    {balanceSettled && balanceSettledAt && (
                      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '6px 0 0' }}>
                        Settled {formatDateTime(balanceSettledAt)}
                      </p>
                    )}
                  </div>
                )}
              </div>
 
              {/* Payment Breakdown */}
              <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#7A3A18', opacity: 0.9 }}>Quantity</span>
                  <span style={{ fontWeight: 700, color: '#1A0A00' }}>{booking.slots_booked} pax × {formatPeso((Number(booking.total_price) || 0) / (booking.slots_booked || 1))}{Number(booking.sale_discount) > 0 ? ' (sale)' : ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#7A3A18', opacity: 0.9 }}>Subtotal</span>
                  <span style={{ fontWeight: 700, color: '#1A0A00' }}>{formatPeso(subtotal)}</span>
                </div>
 
                {booking.payment_method === 'Downpayment' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.9 }}>Downpayment ({subtotal ? Math.round((downpaymentAmount / subtotal) * 100) : 50}%)</span>
                      <span style={{ fontWeight: 700, color: '#8C5216' }}>{formatPeso(downpaymentAmount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.9 }}>Remaining Balance</span>
                      <span style={{ fontWeight: 700, color: 'rgba(122,58,24,0.85)' }}>{formatPeso(balance)}</span>
                    </div>
                  </>
                )}
 
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid rgba(180,81,30,0.18)', paddingTop: 12, marginTop: 4 }}>
                  <span style={{ fontWeight: 900, color: '#1A0A00', fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                    {booking.payment_method === 'Downpayment' ? 'Amount Paid (Due Now)' : 'Total Payment'}
                  </span>
                  <span style={{ fontWeight: 900, color: '#A8481A', fontSize: 22, letterSpacing: '-0.02em' }}>{formatPeso(amountPaid)}</span>
                </div>
              </div>
 
              {/* GCash Details */}
              {(booking.gcash_number || booking.gcash_reference_no) && (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={labelStyle}>GCash Details</p>
                  {booking.gcash_number && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.9 }}>GCash Number</span>
                      <span style={{ fontWeight: 700, color: '#1A0A00', fontFamily: 'monospace' }}>{booking.gcash_number}</span>
                    </div>
                  )}
                  {booking.gcash_reference_no && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#7A3A18', opacity: 0.9 }}>Reference No.</span>
                      <span style={{ fontWeight: 700, color: '#1A0A00', fontFamily: 'monospace' }}>{booking.gcash_reference_no}</span>
                    </div>
                  )}
                </div>
              )}
 
              {/* Paid online through PayMongo: no receipt to check */}
              {booking.paymongo_payment_id ? (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14 }}>
                  <p style={labelStyle}>Online Payment (PayMongo)</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#1A0A00', margin: 0, lineHeight: 1.7 }}>
                    Confirmed automatically{booking.paid_online_at ? ` on ${formatDateTime(booking.paid_online_at)}` : ''}.<br />
                    Payment ID: <span style={{ fontFamily: 'monospace' }}>{booking.paymongo_payment_id}</span>
                    {booking.paymongo_balance_payment_id && (
                      <><br />Balance payment ID: <span style={{ fontFamily: 'monospace' }}>{booking.paymongo_balance_payment_id}</span></>
                    )}
                  </p>
                </div>
              ) : booking.payment_status === 'Awaiting Payment' ? (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14 }}>
                  <p style={labelStyle}>Online Payment (PayMongo)</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#7A3A18', margin: 0 }}>
                    The joiner hasn't finished paying yet. The slots are released automatically if they don't pay within 30 minutes.
                  </p>
                </div>
              ) : booking.receipt_url ? (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14 }}>
                  <p style={labelStyle}>Transaction Receipt</p>
                  <ReceiptThumb src={receiptSrc} onClick={() => setShowReceiptPreview(true)} />
                </div>
              ) : (
                <div style={{ borderTop: '1px solid rgba(180,81,30,0.18)', paddingTop: 14 }}>
                  <p style={labelStyle}>Transaction Receipt</p>
                  <div style={{
                    border: '2px dashed rgba(180,81,30,0.25)', borderRadius: 16,
                    padding: '1.5rem', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', color: 'rgba(122,58,24,0.85)',
                  }}>
                    <ImageIcon size={26} style={{ marginBottom: 8 }} />
                    <p style={{ fontSize: 11, fontWeight: 700, margin: 0 }}>No receipt uploaded</p>
                  </div>
                </div>
              )}
            </div>
          </ViewSection>
 
          {/* Rejection Notice */}
          {isRejected && (
            <Notice
              color="#8C2F1C" bg="rgba(140,47,28,0.07)"
              icon={<AlertCircle size={20} />}
              title="Booking Rejected"
              text="This booking was rejected due to insufficient or unverifiable GCash payment. Please contact the joiner for clarification."
            />
          )}
 
          {/* An older cancellation request (sent before cancellations became instant): approve it */}
          {cancelRequested && (
            <div style={{ background: 'rgba(140,47,28,0.07)', border: '1px solid rgba(140,47,28,0.2)', borderRadius: 18, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <AlertCircle size={20} style={{ color: '#8C2F1C', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 900, color: '#8C2F1C', margin: 0 }}>Cancellation requested</p>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A3A18', margin: '4px 0 0', lineHeight: 1.6 }}>
                    Asked {formatDateTime(booking.cancellation_requested_at)}. Reason: “{booking.cancellation_reason || '—'}”.
                    {' '}Joiners' cancellations are now instant; this older request is approved automatically within 12 hours if you don't approve it first.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={decideCancellation} disabled={!!deciding} style={{ flex: '1 1 180px', padding: '12px 16px', borderRadius: 14, border: 'none', background: '#8C2F1C', color: '#FDF6EE', fontFamily: 'inherit', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {deciding === 'approve' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} Approve Cancellation
                </button>
              </div>
            </div>
          )}

          {/* Cancellation Notice */}
          {isCancelled && (
            <Notice
              color="#1A0A00" bg="rgba(26,10,0,0.05)"
              icon={<XCircle size={20} />}
              title="Booking Cancelled"
              text={booking.cancellation_reason ? "Cancelled at the joiner's request. The slot has been released back to the tour." : 'This booking was cancelled. The slot has been released back to the tour.'}
            >
              {booking.cancellation_reason && (
                <div style={{ marginTop: 12, background: '#FDF6EE', border: '1.5px solid rgba(140,47,28,0.35)', borderLeft: '5px solid #8C2F1C', borderRadius: 12, padding: '12px 14px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8C2F1C' }}>Joiner's reason for cancelling</p>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#1A0A00', lineHeight: 1.5, wordBreak: 'break-word' }}>“{booking.cancellation_reason}”</p>
                </div>
              )}
            </Notice>
          )}
 
          {/* Confirmed Notice */}
          {isComplete && (
            <Notice
              color="#A8481A" bg="rgba(180,81,30,0.08)"
              icon={<CheckCircle2 size={20} />}
              title="Booking Confirmed"
              text="Payment has been verified and the booking is confirmed."
            />
          )}

          <BookingActivity bookingId={booking.id} />
        </div>
 
        {/* Footer: Action Buttons */}
        {isPending && (
          <div style={{
            padding: '1.5rem 2.5rem', borderTop: '1px solid rgba(180,81,30,0.12)',
            background: '#FDF6EE', display: 'flex', gap: 16, flexShrink: 0, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200, background: '#F2E4D0', borderRadius: 16, padding: '14px 18px' }}>
              <p style={labelStyle}>Admin Action Required</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '4px 0 0', lineHeight: 1.5 }}>
                Verify the GCash reference number and receipt screenshot before confirming.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button
                onClick={handleReject}
                disabled={rejecting || confirming}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '13px 22px',
                  background: 'rgba(140,47,28,0.1)', color: '#8C2F1C',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                  opacity: (rejecting || confirming) ? 0.5 : 1,
                }}
              >
                {rejecting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={14} />} Reject Payment
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming || rejecting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '13px 26px',
                  background: '#B4511E', color: '#FDF6EE',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                  boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
                  opacity: (confirming || rejecting) ? 0.5 : 1,
                }}
              >
                {confirming ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />} Confirm Payment
              </button>
            </div>
          </div>
        )}
 
        {/* Footer: Balance settlement (Downpayment bookings) + Receipt printing */}
        {isComplete && (
          <div style={{
            padding: '1.5rem 2.5rem', borderTop: '1px solid rgba(180,81,30,0.12)',
            background: '#FDF6EE', display: 'flex', gap: 16, flexShrink: 0,
            flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {isDownpayment && !balanceSettled ? (
              <>
                <div style={{ flex: 1, minWidth: 200, background: 'rgba(140,47,28,0.08)', borderRadius: 16, padding: '14px 18px' }}>
                  <p style={{ ...labelStyle, color: '#8C2F1C' }}>Balance Due On Tour Day</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '4px 0 0', lineHeight: 1.5 }}>
                    Remaining balance of {formatPeso(balance)} is still unpaid. Mark it as paid once the joiner settles it on the day of the tour.
                  </p>
                </div>
                <button
                  onClick={() => { setBalanceReceived(false); setShowSettleConfirm(true); }}
                  disabled={settlingBalance}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '13px 26px',
                    background: '#B4511E', color: '#FDF6EE',
                    border: 'none', borderRadius: 999, cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 900,
                    fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                    boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
                    opacity: settlingBalance ? 0.5 : 1, flexShrink: 0,
                  }}
                >
                  {settlingBalance ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Wallet size={14} />} Mark Balance as Paid
                </button>
              </>
            ) : (
              <>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={labelStyle}>Payment Status</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#A8481A', margin: '4px 0 0' }}>
                    {isDownpayment
                      ? `Full payment received${balanceSettledAt ? ' — balance settled ' + formatDateTime(balanceSettledAt) : ''}.`
                      : 'Payment received in full.'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['payment', isDownpayment ? 'Downpayment Receipt' : 'Print Receipt'], ...(isDownpayment ? [['balance', 'Balance Receipt']] : [])].map(([part, text]) => (
                    <button
                      key={part}
                      onClick={() => handlePrintReceipt(part)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '13px 22px',
                        background: '#1A0A00', color: '#E8A265',
                        border: 'none', borderRadius: 999, cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 900,
                        fontSize: 11.5, letterSpacing: '0.15em', textTransform: 'uppercase',
                        boxShadow: '0 6px 20px rgba(26,10,0,0.28)', flexShrink: 0,
                      }}
                    >
                      <Printer size={14} /> {text}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
 
      {/* Confirm Settle Balance Modal */}
      {showSettleConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10050,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(26,10,0,0.75)', backdropFilter: 'blur(4px)', padding: 16,
        }}>
          <div style={{
            position: 'relative', background: '#FDF6EE',
            width: '100%', maxWidth: 420,
            borderRadius: 24, boxShadow: '0 32px 80px rgba(26,10,0,0.4)',
            borderTop: '7px solid #B4511E',
            padding: '2rem',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(180,81,30,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 18, color: '#A8481A',
            }}>
              <Wallet size={26} />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', color: '#1A0A00', margin: '0 0 10px' }}>
              Confirm Balance Payment
            </h3>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#7A3A18', opacity: 0.9, margin: '0 0 24px', lineHeight: 1.6 }}>
              Confirm that the remaining balance of <strong style={{ color: '#1A0A00' }}>{formatPeso(balance)}</strong> for booking <strong style={{ color: '#1A0A00' }}>{booking.booking_number}</strong> has been paid in full.
            </p>
            {/* A second, deliberate step so the balance isn't marked paid by an accidental click. */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', margin: '-8px 0 22px',
              background: 'rgba(180,81,30,0.07)', border: '1px solid rgba(180,81,30,0.2)', borderRadius: 14, padding: '10px 12px',
              fontSize: 12.5, fontWeight: 700, color: '#1A0A00', lineHeight: 1.5,
            }}>
              <input type="checkbox" checked={balanceReceived} onChange={(e) => setBalanceReceived(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 1, accentColor: '#B4511E', flexShrink: 0 }} />
              <span>I received {formatPeso(balance)} from {joinerName !== '—' ? joinerName : 'the joiner'}.</span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSettleConfirm(false)}
                style={{
                  padding: '12px 22px',
                  background: 'rgba(122,58,24,0.1)', color: '#7A3A18',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSettleBalance}
                disabled={!balanceReceived}
                title={balanceReceived ? undefined : 'Tick the box above first'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '12px 24px',
                  background: '#B4511E', color: '#FDF6EE',
                  border: 'none', borderRadius: 999, cursor: balanceReceived ? 'pointer' : 'not-allowed',
                  opacity: balanceReceived ? 1 : 0.45,
                  fontFamily: 'inherit', fontWeight: 900,
                  fontSize: 11.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                  boxShadow: '0 6px 20px rgba(180,81,30,0.35)',
                }}
              >
                <CheckCircle2 size={14} /> Mark Balance as Paid
              </button>
            </div>
          </div>
        </div>
      )}
 
      {/* Receipt Full Preview */}
      {showReceiptPreview && receiptSrc && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.95)', padding: 16,
          }}
          onClick={() => setShowReceiptPreview(false)}
        >
          <button style={{
            position: 'absolute', top: 32, right: 32,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#FDF6EE',
          }}>
            <X size={40} />
          </button>
          <img src={receiptSrc} style={{ maxWidth: '100%', maxHeight: '90dvh', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }} alt="Receipt" />
        </div>
      )}
    </div>
  );
};       
 
/* ─────────────────────────────────────────────
   RECEIPT THUMBNAIL (helper)
───────────────────────────────────────────── */
const ReceiptThumb = ({ src, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', borderRadius: 16, overflow: 'hidden',
        cursor: 'pointer', border: '1px solid rgba(180,81,30,0.2)',
        boxShadow: '0 4px 14px rgba(26,10,0,0.1)',
      }}
    >
      <img src={src} style={{ width: '100%', height: 160, objectFit: 'cover', objectPosition: 'top', display: 'block', transform: hovered ? 'scale(1.03)' : 'scale(1)', transition: 'transform 0.3s' }} alt="GCash Receipt" />
      <div style={{
        position: 'absolute', inset: 0,
        background: hovered ? 'rgba(26,10,0,0.45)' : 'rgba(26,10,0,0)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.2s',
      }}>
        {hovered && (
          <span style={{
            background: 'rgba(253,246,238,0.95)', borderRadius: 999,
            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#1A0A00',
          }}>
            <Eye size={12} /> View Full Receipt
          </span>
        )}
      </div>
    </div>
  );
};
 
/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const ViewSection = ({ title, icon, children }) => (
  <section>
    <h4 style={{
      fontSize: 11, fontWeight: 900, letterSpacing: '0.25em',
      textTransform: 'uppercase', color: '#1A0A00',
      margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8,
      paddingBottom: 12, borderBottom: '1px solid rgba(180,81,30,0.12)',
    }}>
      <span style={{ color: '#A8481A' }}>{icon}</span> {title}
    </h4>
    {children}
  </section>
);
 
/* Who confirmed, rejected, moved or edited this booking, and when (booking_activity). */
const ACTIVITY_FIELD_LABELS = {
  payment_status: 'Payment status', booking_status: 'Booking status', tour_id: 'Tour',
  amount_paid: 'Amount paid', total_price: 'Total price', slots_booked: 'Slots',
  receipt_url: 'Receipt', gcash_reference_no: 'GCash reference', gcash_number: 'GCash number',
  payment_method: 'Payment method', balance_settled: 'Balance settled', cancellation_reason: 'Cancellation reason',
  full_name: 'Name', contact_number: 'Contact number', email: 'Email',
};

const BookingActivity = ({ bookingId }) => {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('booking_activity')
      .select('id, actor_name, action, changes, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) reportError("Couldn't load booking activity", error.message);
        if (active) setEntries(data || []);
      });
    return () => { active = false; };
  }, [bookingId]);

  const describe = (changes) => Object.keys(changes || {})
    .filter((k) => ACTIVITY_FIELD_LABELS[k] && typeof changes[k] === 'object' && changes[k] !== null && 'to' in changes[k])
    .map((k) => {
      const { from, to } = changes[k];
      if (k === 'receipt_url' || k === 'tour_id') return ACTIVITY_FIELD_LABELS[k] + ' changed';
      return `${ACTIVITY_FIELD_LABELS[k]}: ${from ?? '—'} → ${to ?? '—'}`;
    })
    .join(' · ');

  return (
    <ViewSection title="Activity" icon={<History size={14} />}>
      {entries === null ? (
        <SkeletonLines lines={3} label="Loading activity" />
      ) : entries.length === 0 ? (
        <p style={{ fontSize: 12, color: '#7A3A18', margin: 0 }}>No activity recorded yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map((e) => (
            <div key={e.id} style={{ borderLeft: '3px solid rgba(180,81,30,0.35)', paddingLeft: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1A0A00', margin: 0 }}>
                {e.action} <span style={{ fontWeight: 600, color: '#7A3A18' }}>by {e.actor_name}</span>
              </p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: '2px 0 0' }}>
                {new Date(e.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                {describe(e.changes) && ` · ${describe(e.changes)}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </ViewSection>
  );
};

const InfoItem = ({ label, value, mono = false }) => (
  <div>
    <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A3A18', margin: '0 0 4px' }}>
      {label}
    </p>
    <p style={{ fontSize: 15, fontWeight: 800, color: '#1A0A00', margin: 0, fontFamily: mono ? 'monospace' : 'inherit' }}>
      {value || '—'}
    </p>
  </div>
);
 
const Notice = ({ color, bg, icon, title, text, children }) => (
  <div style={{
    background: bg, borderRadius: 18, padding: '1.25rem 1.5rem',
    border: `1px solid ${color}33`, display: 'flex', gap: 14,
  }}>
    <span style={{ color, flexShrink: 0, marginTop: 1 }}>{icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 13, fontWeight: 900, color, margin: '0 0 4px' }}>{title}</p>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#7A3A18', opacity: 0.9, margin: 0, lineHeight: 1.6 }}>{text}</p>
      {children}
    </div>
  </div>
);

export {
  BookingDetailModal,
  ReceiptThumb,
  ViewSection,
  ACTIVITY_FIELD_LABELS,
  BookingActivity,
  InfoItem,
  Notice,
};
