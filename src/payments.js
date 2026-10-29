import { supabase } from './supabaseClient';
import { errorDetail } from './Email';

// ─────────────────────────────────────────────
// ONLINE PAYMENTS (PayMongo) — calls the `payments` edge function
// (supabase/functions/payments/index.ts). Returns { ok, data } or { ok: false, error }.
// ─────────────────────────────────────────────
const callPayments = async (action, body = {}) => {
  try {
    const { data, error } = await supabase.functions.invoke('payments', { body: { action, ...body } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: await errorDetail(err) };
  }
};

const returnBaseUrl = () => window.location.origin;

// Holds the slots for 30 minutes and returns PayMongo's checkout page URL.
export const startCheckout = ({ tourId, slots, paymentType, companions, accommodation = null }) =>
  callPayments('create-checkout', { tourId, slots, paymentType, companions, accommodation, returnBaseUrl: returnBaseUrl() });

export const startBalanceCheckout = ({ bookingId }) =>
  callPayments('pay-balance', { bookingId, returnBaseUrl: returnBaseUrl() });

// Asks PayMongo whether the booking's checkout(s) were paid and records it.
export const verifyCheckout = ({ bookingId }) => callPayments('verify-checkout', { bookingId });

// The joiner backed out of an unfinished checkout: frees the held slots.
export const cancelCheckout = ({ bookingId }) => callPayments('cancel-checkout', { bookingId });

// Slots held for a joiner's requested tour: pay full or 40% downpayment.
export const payHeldBooking = ({ bookingId, paymentType, companions, accommodation = null }) =>
  callPayments('pay-held', { bookingId, paymentType, companions, accommodation, returnBaseUrl: returnBaseUrl() });

// Exclusive tours: the 50% downpayment, worked out on the server from the
// package price the agency sent. Returns { checkoutUrl } or { alreadyPaid }.
// accommodation: the joiner's choice from the package's options.
export const startExclusiveDownpayment = ({ requestId, accommodation = null }) =>
  callPayments('pay-exclusive', { requestId, accommodation, returnBaseUrl: returnBaseUrl() });
// The rest of the package price, after the downpayment.
export const startExclusiveBalance = ({ requestId }) =>
  callPayments('pay-exclusive', { requestId, part: 'balance', returnBaseUrl: returnBaseUrl() });

// Coming back from PayMongo: has the downpayment been paid?
export const verifyExclusivePayment = ({ requestId }) => callPayments('verify-exclusive', { requestId });
