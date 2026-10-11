import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// EMAIL HELPER
// Asks the `send-email` Supabase Edge Function (see
// supabase/functions/send-email/index.ts) to send one of its templated
// emails. The function looks up the recipient and builds the content
// itself and checks the caller is allowed, so the browser only says
// WHICH email to send. Booking emails log failures but never throw —
// a missing/misconfigured email function should never block a booking.
// ─────────────────────────────────────────────

// supabase-js hides the real reason behind "non-2xx status code";
// the actual message is in the function's response body.
export const errorDetail = async (err) => {
  let detail = err.message || 'Unknown error';
  try {
    if (err.context && typeof err.context.json === 'function') {
      const body = await err.context.clone().json();
      const raw = body?.error ?? body;
      detail = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }
  } catch { /* keep the generic message */ }
  return detail;
};

const send = async (body) => {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', { body });
    if (error) throw error;
    if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    return { ok: true };
  } catch (err) {
    const error = await errorDetail(err);
    console.error(`Error sending ${body.type} email:`, error);
    return { ok: false, error };
  }
};

// Joiner → "we received your booking". Only the booking's owner (or an admin) can trigger it.
export const sendBookingSubmittedEmail = ({ bookingId }) =>
  bookingId ? send({ type: 'booking-submitted', bookingId }) : null;

// Admin → "confirmed" or "payment issue", chosen from the booking's current payment_status.
export const sendBookingStatusEmail = ({ bookingId }) =>
  bookingId ? send({ type: 'booking-status', bookingId }) : null;

// ─────────────────────────────────────────────
// ADMIN → JOINER MANUAL EMAIL
// Reports success/failure so the admin UI can tell the admin whether
// the email actually went out.
// ─────────────────────────────────────────────
export const sendCustomEmail = async ({ userId, subject, message }) => {
  if (!userId) return { ok: false, error: 'No recipient.' };
  return send({ type: 'custom', userId, subject, message });
};

// After slots open on a tour (cancellation, rejection, date change, bigger group
// size): emails the waitlisted joiners the database has already notified in-app.
export const sendWaitlistOpeningsEmail = ({ tourId }) =>
  tourId ? send({ type: 'waitlist-openings', tourId }) : null;

// The logged-in joiner deletes their own account (Profile Settings → Your Data).
export const deleteMyAccount = () => send({ type: 'delete-account', confirm: 'DELETE' });
