import React from 'react';
import { CreditCard, Wallet } from 'lucide-react';

// ─────────────────────────────────────────────
// BOOKING BADGES: booking status, balance status and payment method, as
// plain coloured text (Booking Management list and the booking window).
// ─────────────────────────────────────────────

const STATUS_STYLES = {
  Pending: { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
  'Verification Pending': { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
  Complete: { bg: 'rgba(180,81,30,0.14)', color: '#A8481A' },
  Verified: { bg: 'rgba(180,81,30,0.14)', color: '#A8481A' },
  Rejected: { bg: 'rgba(140,47,28,0.14)', color: '#8C2F1C' },
  Cancelled: { bg: 'rgba(26,10,0,0.08)', color: 'rgba(26,10,0,0.8)' },
  'Cancellation Requested': { bg: 'rgba(140,47,28,0.12)', color: '#8C2F1C' },
  'Downpayment Paid': { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
  'Awaiting Payment': { bg: 'rgba(63,93,98,0.14)', color: '#3F5D62' },
  Expired: { bg: 'rgba(26,10,0,0.08)', color: 'rgba(26,10,0,0.8)' },
};
 
// Plain colored text (no pill), so it doesn't look like a button.
// wrap: long labels (e.g. Cancellation Requested) go onto two lines instead of
// spilling into the next column.
const StatusBadge = ({ status, large = false, wrap = false }) => {
  const { color } = STATUS_STYLES[status] || STATUS_STYLES.Pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      color: large ? '#FDF6EE' : color,
      fontSize: large ? 12 : 11,
      fontWeight: 900, letterSpacing: wrap ? '0.1em' : '0.16em', textTransform: 'uppercase',
      whiteSpace: wrap ? 'normal' : 'nowrap', lineHeight: wrap ? 1.35 : undefined, maxWidth: '100%',
    }}>
      {status || 'Pending'}
    </span>
  );
};
 
const BALANCE_STATUS_STYLES = {
  'Fully Paid': { bg: 'rgba(180,81,30,0.14)', color: '#A8481A' },
  'Balance Due': { bg: 'rgba(140,47,28,0.12)', color: '#8C2F1C' },
};
 
const BalanceStatusBadge = ({ status }) => {
  const { color } = BALANCE_STATUS_STYLES[status] || BALANCE_STATUS_STYLES['Balance Due'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      color, fontSize: 11,
      fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      <Wallet size={9} /> {status}
    </span>
  );
};
 
const PAYMENT_METHOD_STYLES = {
  'Full Payment': { bg: 'rgba(122,58,24,0.12)', color: '#7A3A18' },
  Downpayment: { bg: 'rgba(232,162,101,0.25)', color: '#8C5216' },
};
 
const PaymentMethodBadge = ({ method }) => {
  if (!method) return <span style={{ color: '#7A3A18', fontSize: 11, fontWeight: 700 }}>—</span>;
  const { color } = PAYMENT_METHOD_STYLES[method] || { color: '#7A3A18' };
  const Icon = method === 'Downpayment' ? Wallet : CreditCard;
  return (
    // Plain text with an icon (no pill), sized to its text.
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', width: 'fit-content',
      color, fontSize: 11, fontWeight: 900,
      letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      <Icon size={11} /> {method}
    </span>
  );
};

export {
  STATUS_STYLES,
  StatusBadge,
  BALANCE_STATUS_STYLES,
  BalanceStatusBadge,
  PAYMENT_METHOD_STYLES,
  PaymentMethodBadge,
};
