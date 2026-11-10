// ─────────────────────────────────────────────
// EMAIL TEMPLATES (System Maintenance → Notification Templates)
// The default subject, heading and message of each email. The send-email
// function has the same defaults (keep them the same); a saved change in
// notification_templates is used instead.
// ─────────────────────────────────────────────

export const EMAIL_DEFAULTS = {
  reminder: { subject: "Reminder: {tour} starts {when} 🚐 ({booking})", heading: "See you {see_you}! 🚐", message: "Hi {name}, this is a friendly reminder that your tour starts {when}." },
  booking_received: { subject: "Booking Received — {booking}", heading: "Booking Received", message: "Thanks for booking with Bandang IBAYO, {name}!\n\nWe've received your booking for **{tour}**. Your payment is now pending verification. We'll email you again as soon as it's confirmed." },
  booking_confirmed: { subject: "Booking Confirmed 🎉 — {booking}", heading: "You're Confirmed!", message: "Hi {name}, your payment for **{tour}** has been verified.\n\nSee you on the trip! Pickup and driver details will be posted in the app closer to your departure date." },
  booking_rejected: { subject: "Booking Update — {booking}", heading: "Payment Verification Issue", message: "Hi {name}, we weren't able to verify the payment for your booking of **{tour}** ({booking}).\n\nPlease reach out to us so we can help sort this out." },
  balance_reminder: { subject: "Balance reminder: {balance} due for {tour} ({booking})", heading: "Your balance is due soon", message: "Hi {name}, your tour is coming up!\n\nYou paid a downpayment of {paid}. The remaining balance of **{balance}** is due on or before the day of the tour.\n\nYou can pay it online now from **My Bookings → Pay balance online** (GCash, Maya or card), or pay in person on the day of the tour." },
  cancellation_approved: { subject: "Cancellation approved — {booking}", heading: "Your cancellation was approved", message: "Hi {name},\n\nYour cancellation for **{tour}** ({date}), booking **{booking}**, has been approved, and your slot has been released.\n\nAs agreed when booking, payments are non-refundable. We hope to see you on another trip soon!" },
  pickup_day: { subject: "Pickup starts today: {tour} 🚐", heading: "Pickup starts today! 🚐", message: "Hi {name}, today is the day for **{tour}**.\n\nPlease be at your pickup point a few minutes early, and have your check-in QR ready (My Bookings → Day trip). You can see where the van is under **Tracking**." },
  review_invite: { subject: "How was {tour}? ⭐", heading: "How was your trip? ⭐", message: "Hi {name}, thank you for joining **{tour}**! We hope you had a great time.\n\nWould you take a minute to rate your trip? Your review helps other travelers choose their next adventure, and helps us make every trip better.\n\nLog in and open **Reviews** to leave yours (photos welcome!)." },
  departure_soon: { subject: "⏰ Your pickup is in 15 minutes — {tour}", heading: "Your pickup is in 15 minutes ⏰", message: "Hi {name},\n\nYour pickup for **{tour}** is coming up{at_stop}. Please be at the pickup point now. You can see where the van is under **Tracking**." },
  waitlist_opening: { subject: "A slot opened up: {tour}", heading: "A slot opened up! 🎉", message: "Hi {name}, good news: a slot just opened on a tour you're waiting for.\n\nLog in to Bandang IBAYO and book now. Slots go to whoever books first." },
};

// [key, name, when it's sent, the {words} it can use]
export const EMAIL_KINDS = [
  ['booking_received', 'Booking received', 'When a joiner books and their payment is waiting to be checked.', ['name', 'tour', 'booking', 'date']],
  ['booking_confirmed', 'Booking confirmed', 'When a payment is confirmed.', ['name', 'tour', 'booking', 'date']],
  ['booking_rejected', 'Payment not verified', 'When a payment can\'t be verified.', ['name', 'tour', 'booking', 'date']],
  ['reminder', 'Trip reminder', 'Before the tour (Booking Rules → Tour reminder), with pickup points and the driver.', ['name', 'tour', 'booking', 'date', 'when', 'see_you']],
  ['balance_reminder', 'Balance reminder', 'A few days before the tour, to joiners who still owe a balance.', ['name', 'tour', 'booking', 'date', 'balance', 'paid']],
  ['pickup_day', 'Pickup starts today', 'On the morning of the tour, with the pickup points.', ['name', 'tour', 'date']],
  ['departure_soon', 'Pickup in 15 minutes', '15 minutes before the joiner\'s pickup.', ['name', 'tour', 'booking', 'at_stop']],
  ['cancellation_approved', 'Cancellation approved', 'When a cancellation is approved.', ['name', 'tour', 'booking', 'date']],
  ['review_invite', 'Rate your trip', 'After the tour, inviting a review.', ['name', 'tour', 'date']],
  ['waitlist_opening', 'Slot opened (waitlist)', 'When a slot opens on a tour the joiner is waiting for.', ['name', 'tour', 'date']],
];

export const PLACEHOLDER_HELP = {
  name: "the joiner's name", tour: 'the tour title', booking: 'the booking number', date: 'the tour date',
  when: '"tomorrow" or "in 2 days"', see_you: '"tomorrow" or "soon"', balance: 'the balance due', paid: 'the downpayment paid',
  at_stop: '" at <pickup point>, <time>"',
};

// Sample words for the preview.
export const SAMPLE_VARS = {
  name: 'Juan Dela Cruz', tour: 'Mt. Ulap Eco-Trail', booking: 'BK-2026-00123', date: 'Sat, Jan 9, 2027',
  when: 'tomorrow', see_you: 'tomorrow', balance: '₱2,500.00', paid: '₱2,500.00', at_stop: ' at Petron NLEX, 10:00 PM',
};
export const fillIn = (text, vars) => String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
