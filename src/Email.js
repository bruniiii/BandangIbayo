import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// EMAIL HELPER
// Sends transactional email through the `send-email` Supabase Edge
// Function (see supabase/functions/send-email/index.ts). Failures are
// logged but never thrown — a missing/misconfigured email function
// should never block a booking or registration from completing.
// ─────────────────────────────────────────────

const send = async ({ to, subject, html }) => {
  if (!to) return null;
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { to, subject, html },
    });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error sending email:', err.message || err);
    return null;
  }
};

const wrapper = (title, titleColor, bodyHtml) => `
  <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1A0A00;">
    <h2 style="color:${titleColor}; margin: 0 0 16px;">${title}</h2>
    ${bodyHtml}
    <p style="color:#7A3A18; font-size: 13px; margin-top: 24px;">— The Bandang IBAYO Team</p>
  </div>
`;

export const sendBookingSubmittedEmail = ({ to, name, bookingNumber, tourTitle, amount }) => send({
  to,
  subject: `Booking Received — ${bookingNumber}`,
  html: wrapper('Booking Received', '#1A0A00', `
    <p>Thanks for booking with Bandang IBAYO, ${name || 'Traveler'}!</p>
    <p>We've received your booking for <strong>${tourTitle}</strong>.</p>
    <p><strong>Booking Reference:</strong> ${bookingNumber}<br/>
    <strong>Amount Paid Now:</strong> ₱${Number(amount || 0).toLocaleString()}</p>
    <p>Your payment is now pending verification. We'll email you again as soon as it's confirmed.</p>
  `),
});

export const sendBookingConfirmedEmail = ({ to, name, bookingNumber, tourTitle, startDate }) => send({
  to,
  subject: `Booking Confirmed 🎉 — ${bookingNumber}`,
  html: wrapper("You're Confirmed!", '#C45C26', `
    <p>Hi ${name || 'Traveler'}, your payment for <strong>${tourTitle}</strong> has been verified.</p>
    <p><strong>Booking Reference:</strong> ${bookingNumber}<br/>
    ${startDate ? `<strong>Tour Date:</strong> ${startDate}<br/>` : ''}</p>
    <p>See you on the trip! Pickup and driver details will be posted in the app closer to your departure date.</p>
  `),
});

export const sendBookingRejectedEmail = ({ to, name, bookingNumber, tourTitle }) => send({
  to,
  subject: `Booking Update — ${bookingNumber}`,
  html: wrapper('Payment Verification Issue', '#8C2F1C', `
    <p>Hi ${name || 'Traveler'}, we weren't able to verify the payment for your booking of <strong>${tourTitle}</strong> (${bookingNumber}).</p>
    <p>Please reach out to us so we can help sort this out.</p>
  `),
});