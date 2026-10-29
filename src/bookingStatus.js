// ─────────────────────────────────────────────
// BOOKING STATUS helpers (Booking Management): which status a booking shows,
// and whether a downpayment booking still owes its balance.
// ─────────────────────────────────────────────

export const getDerivedStatus = (b) => (
  (b.payment_status === 'Pending' || b.payment_status === 'Verification Pending') ? b.payment_status :
  b.payment_status === 'Rejected' ? 'Rejected' :
  b.booking_status === 'Cancelled' ? 'Cancelled' :
  b.cancellation_requested_at ? 'Cancellation Requested' : // the joiner asked to cancel; waiting on an admin
  b.payment_status
);
 
// For Downpayment bookings, tracks whether the remaining balance has been
// settled on the day of the tour (separate from the initial GCash
// downpayment verification tracked by payment_status/booking_status above).
export const getBalanceStatus = (b) => {
  if (b.payment_method !== 'Downpayment') return null;
  if (getDerivedStatus(b) !== 'Complete') return null; // only relevant once the downpayment itself is verified
  return b.balance_settled ? 'Fully Paid' : 'Balance Due';
};
 
// Remaining balance on a confirmed downpayment booking that isn't settled yet.
export const balanceOwed = (b) => Math.max(0, (b.total_price || 0) - (b.amount_paid || 0));
export const owesBalance = (b) =>
  getBalanceStatus(b) === 'Balance Due' && b.booking_status !== 'Cancelled' && balanceOwed(b) > 0;

// The status the admin sees: a downpayment booking that still owes a balance
// isn't "Complete" yet, it's "Downpayment Paid" (with a Balance Due badge).
export const getShownStatus = (b) => {
  const derived = getDerivedStatus(b);
  return derived === 'Complete' && owesBalance(b) ? 'Downpayment Paid' : derived;
};
