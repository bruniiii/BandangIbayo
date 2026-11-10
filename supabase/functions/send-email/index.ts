// supabase/functions/send-email/index.ts
//
// ONE function for ALL emails, sent through the agency Gmail (bandangibayo@gmail.com):
//   1) Normal mode  — body { type, ... }. The caller only says WHICH email to send;
//        the recipient and content are looked up and built here, so a logged-in user
//        can't use this function to send arbitrary email from the agency Gmail.
//        - { type: "booking-submitted", bookingId }  booking owner (or admin)
//        - { type: "booking-status",    bookingId }  admin only; confirmed/rejected per payment_status
//        - { type: "custom", userId, subject, message }  admin only (Joiner Accounts manual email)
//        - { type: "login-code", to, name, code, minutes, purpose? }  auth function only (service-role
//          key); purpose "signup" words it as confirming the email when registering,
//          "admin" as the code for a new admin account (Admin Settings)
//        - { type: "waitlist-openings", tourId }  any logged-in user; emails the waitlisted joiners
//        - { type: "delete-account", confirm: "DELETE" }  the logged-in joiner deletes their own
//          account: personal data removed (purge_user_data), their files deleted, login deleted
//          the database already notified about an opening on that tour (each joiner once)
//        - { type: "cancellation-approved", bookingId }  admin only; emails the joiner (once)
//   2) Reminder mode — body { action: "tour-reminders", date?, dryRun? }
//        Also sends balance reminders: joiners who paid a downpayment and whose tour
//        starts in 2–3 days get one email + in-app notice about the remaining balance.
//        emails every confirmed joiner whose tour starts TOMORROW (Philippine time).
//        Called daily by pg_cron with the x-cron-secret header; blocked for everyone else.
//   3) Scheduled mode — body { action: "scheduled" }, hourly by pg_cron (trip-emails job,
//        x-cron-secret = CRON_SECRET or the cron_secret in public.app_secrets). Sends, once each:
//        the day-before reminders (from 5 PM Philippine time), balance reminders,
//        "Pickup Starts Today", "Cancellation Approved" and "Rate your trip" emails.
//
// Deploy:   supabase functions deploy send-email --no-verify-jwt
//           (auth is checked inside the function: user login + ownership/admin role for normal mode,
//           CRON_SECRET for reminders)
// Secrets:  supabase secrets set GMAIL_USER=bandangibayo@gmail.com
//           supabase secrets set GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
//           supabase secrets set CRON_SECRET=<any long random string>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "bandangibayo@gmail.com";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// The website (same secret the payments function uses), for buttons in emails.
// (SITE_URL may list several addresses separated by commas; links use the first.)
const SITE_URL = ((Deno.env.get("SITE_URL") ?? "").split(",")[0] ?? "").trim().replace(/\/+$/, "");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Always with centavos, same as the website: "₱2,900.00".
const peso = (n: number) =>
  `₱${(Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A day in Asia/Manila (UTC+8), as YYYY-MM-DD — matches tours.start_date
const manilaDate = (daysFromToday: number) =>
  new Date(Date.now() + 8 * 3600 * 1000 + daysFromToday * 24 * 3600 * 1000).toISOString().slice(0, 10);

// Reminder timing comes from the booking rules (System Maintenance → Booking
// Rules). The values below are used only if the rules can't be read.
let REMINDER_LEAD_DAYS = 1;      // tour reminder: this many days before the tour
let BALANCE_REMINDER_DAYS = 3;   // balance reminder: from this many days before
async function loadReminderRules() {
  try {
    const { data, error } = await supabase.rpc("get_booking_rules");
    if (error || !data) return;
    const lead = Number(data.reminder_lead_days), balance = Number(data.balance_reminder_days);
    if (Number.isInteger(lead) && lead >= 1) REMINDER_LEAD_DAYS = lead;
    if (Number.isInteger(balance) && balance >= 1) BALANCE_REMINDER_DAYS = balance;
  } catch (_err) { /* keep the defaults */ }
}
const reminderDate = () => manilaDate(REMINDER_LEAD_DAYS);
// "tomorrow", or "in 2 days"
const reminderWhen = () => (REMINDER_LEAD_DAYS === 1 ? "tomorrow" : `in ${REMINDER_LEAD_DAYS} days`);

const prettyDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
};

const listHtml = (text?: string | null) => {
  const items = (text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!items.length) return "";
  return `<ul style="margin:6px 0 0;padding-left:18px;color:#1A0A00;">${items.map((i) => `<li style="margin:2px 0;">${esc(i)}</li>`).join("")}</ul>`;
};

const section = (title: string, inner: string) =>
  inner
    ? `<div style="background:#F2E4D0;border-radius:12px;padding:14px 16px;margin:14px 0;">
         <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#7A3A18;">${title}</p>
         ${inner}
       </div>`
    : "";

function buildEmail(opts: {
  name: string; booking: any; tour: any; vehicle: any | null; stops: any[];
}) {
  const { name, booking, tour, vehicle, stops } = opts;

  const balance =
    booking.payment_method === "Downpayment" && !booking.balance_settled
      ? Math.max(0, (booking.total_price || 0) - (booking.amount_paid || 0))
      : 0;

  const vehicleHtml = vehicle
    ? `<p style="margin:0;color:#1A0A00;font-size:14px;line-height:1.7;">
         <strong>Vehicle:</strong> ${esc(vehicle.car_type)}<br/>
         <strong>Plate No.:</strong> ${esc(vehicle.plate_number)}<br/>
         ${vehicle.vehicle_color ? `<strong>Color:</strong> ${esc(vehicle.vehicle_color)}<br/>` : ""}
         ${vehicle.vehicle_notes ? `<strong>How to spot it:</strong> ${esc(vehicle.vehicle_notes)}<br/>` : ""}
         <strong>Driver:</strong> ${esc(vehicle.driver_name)} (${esc(vehicle.driver_contact)})
       </p>`
    : "";

  const stopsHtml = stops.length
    ? `<ul style="margin:0;padding-left:18px;color:#1A0A00;font-size:14px;line-height:1.7;">${stops
        .map((s) => `<li><strong>${esc(s.location_name)}</strong> — ETA ${esc(s.scheduled_time)}${s.note ? ` <em>(${esc(s.note)})</em>` : ""} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.location_name ?? "")}" style="color:#A8481A;">Map</a></li>`)
        .join("")}</ul>`
    : "";

  const balanceHtml = balance
    ? `<p style="margin:0;color:#8C2F1C;font-size:14px;font-weight:700;">
         Remaining balance of ${peso(balance)} is due on the day of the tour. Please prepare it in cash or GCash.
       </p>`
    : "";

  const noteHtml = tour.important_note
    ? `<p style="margin:0;color:#1A0A00;font-size:14px;white-space:pre-wrap;line-height:1.6;">${esc(tour.important_note)}</p>`
    : "";

  const t = tpl("reminder", { name, tour: tour.title, when: reminderWhen(), see_you: REMINDER_LEAD_DAYS === 1 ? "tomorrow" : "soon", booking: booking.booking_number, date: prettyDate(tour.start_date) });
  const html = `
  <div style="font-family:'Inter',Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1A0A00;background:#FDF6EE;">
    <h2 style="color:#C45C26;margin:0 0 6px;">${t.heading}</h2>
    <div style="margin:0 0 16px;font-size:14px;color:#7A3A18;">${t.body}</div>

    <div style="background:#1A0A00;border-radius:14px;padding:16px 18px;color:#FDF6EE;">
      <p style="margin:0;font-size:17px;font-weight:800;">${esc(tour.title)}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#E8A265;">📍 ${esc(tour.destination)}</p>
      <p style="margin:4px 0 0;font-size:13px;">📅 ${prettyDate(tour.start_date)}${tour.duration ? ` · ${esc(tour.duration)}` : ""}</p>
      <p style="margin:4px 0 0;font-size:13px;">👤 ${booking.slots_booked} ${booking.slots_booked === 1 ? "person" : "persons"} · Ref: ${esc(booking.booking_number)}</p>
      ${stops[0] ? `<p style="margin:10px 0 0;font-size:14px;font-weight:800;color:#E8A265;">⏰ Meeting time: ${esc(stops[0].scheduled_time || "see pickup points")} at ${esc(stops[0].location_name)}</p>` : ""}
    </div>

    ${section("Pickup Points &amp; ETA", stopsHtml)}
    ${section("Your Driver &amp; Vehicle", vehicleHtml)}
    ${section("Things to Bring", listHtml(tour.things_to_bring))}
    ${section("Balance Reminder", balanceHtml)}
    ${section("Important Note", noteHtml)}

    <p style="font-size:13px;color:#7A3A18;margin:18px 0 0;line-height:1.6;">
      Your pickup points, driver and check-in QR are on the <strong>Day trip</strong> card in My Bookings, and live van updates are under <strong>Tracking</strong>.
      Questions? Just reply to this email or write us at ${GMAIL_USER}.
    </p>
    <p style="color:#7A3A18;font-size:13px;margin-top:20px;">— The Bandang IBAYO Team</p>
  </div>`;

  return html;
}


// ───────────── Reminder mode ─────────────
// System Settings → Email reminders: each kind can be switched off by the
// main admin (app_settings "email_settings"; missing = on).
async function emailOn(kind: "day_before" | "balance" | "monthly_summary") {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "email_settings").maybeSingle();
  return (data?.value as Record<string, unknown> | undefined)?.[kind] !== false;
}

async function runReminders(date: string, dryRun: boolean) {
  if (!(await emailOn("day_before"))) return { skipped: "Day-before reminders are switched off in System Settings." };
  // Confirmed (payment verified), not cancelled/rejected, not yet reminded, tour starts on `date`
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(`
      id, user_id, booking_number, full_name, email, slots_booked,
      total_price, amount_paid, payment_method, balance_settled, tour_id,
      tours!inner ( id, title, destination, start_date, duration, things_to_bring, important_note )
    `)
    .eq("tours.start_date", date)
    .eq("payment_status", "Complete")
    .neq("booking_status", "Cancelled")
    .neq("booking_status", "Rejected")
    .is("reminder_sent_at", null);

  if (error) throw new Error(error.message);

  const list = bookings ?? [];
  if (!list.length) return { date, dryRun, found: 0, sent: 0, failed: 0, skipped: 0, errors: [] };

  const userIds = [...new Set(list.map((b: any) => b.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name").in("id", userIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));

  const tourIds = [...new Set(list.map((b: any) => b.tour_id))] as string[];
  const vehicleByTour: Record<string, any> = {};
  const stopsByTour: Record<string, any[]> = {};
  for (const id of tourIds) {
    const [{ data: v }, { data: s }] = await Promise.all([
      supabase.from("tour_vehicles").select("*").eq("tour_id", id).maybeSingle(),
      supabase.from("tour_meetups").select("*").eq("tour_id", id).order("created_at", { ascending: true }),
    ]);
    vehicleByTour[id] = v ?? null;
    stopsByTour[id] = s ?? [];
  }

  let sent = 0, failed = 0, skipped = 0;
  const errors: string[] = [];

  for (const b of list as any[]) {
    const to = await recipientFor(b.user_id, b.email === "N/A" ? null : b.email);
    if (!to) { skipped++; continue; }

    const p = profileMap[b.user_id];
    const profileName = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "";
    const name = profileName || (b.full_name && b.full_name !== "N/A" ? b.full_name : "Traveler");
    const tour = Array.isArray(b.tours) ? b.tours[0] : b.tours;

    if (dryRun) { sent++; continue; }

    try {
      await transporter.sendMail({
        from: `"Bandang IBAYO" <${GMAIL_USER}>`,
        to,
        replyTo: GMAIL_USER,
        subject: tpl("reminder", { name, tour: tour.title, when: reminderWhen(), booking: b.booking_number, date: prettyDate(tour.start_date) }).subject,
        html: buildEmail({ name, booking: b, tour, vehicle: vehicleByTour[b.tour_id], stops: stopsByTour[b.tour_id] }),
      });

      await supabase.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id);

      if (b.user_id) {
        await supabase.from("notifications").insert([{
          user_id: b.user_id,
          title: `Your tour starts ${reminderWhen()} 🚐`,
          message: `Reminder: ${tour.title} (${b.booking_number}) departs ${reminderWhen()}, ${prettyDate(tour.start_date)}. Check the Tracking tab for pickup ETAs and driver details.`,
          type: "tracking",
        }]);
      }
      sent++;
    } catch (err) {
      failed++;
      errors.push(`${b.booking_number}: ${String((err as Error)?.message || err)}`);
      console.error("send-email[reminders]: failed for", b.booking_number, err);
    }
  }

  console.log("send-email[reminders]:", { date, found: list.length, sent, failed, skipped });
  return { date, dryRun, found: list.length, sent, failed, skipped, errors };
}

// ───────────── Transactional templates (normal mode) ─────────────
const wrapper = (title: string, titleColor: string, bodyHtml: string) => `
  <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1A0A00;">
    <h2 style="color:${titleColor}; margin: 0 0 16px;">${title}</h2>
    ${bodyHtml}
    <p style="color:#7A3A18; font-size: 13px; margin-top: 24px;">— The Bandang IBAYO Team</p>
  </div>
`;

// What the joiner says they paid: the amount they submitted, else what their
// payment option requires (the downpayment their booking was made under).
const amountSubmitted = (b: any) =>
  b.amount_paid ?? (b.payment_method === "Downpayment" ? Math.round((b.total_price || 0) * (Number(b.rule_downpayment_percent) || 50)) / 100 : b.total_price || 0);

// ───────────── Notification templates (System Maintenance → Notification Templates) ─────────────
// Each email's subject, heading and message can be changed by the admins
// (notification_templates). These defaults are used when there's no change
// saved (keep them the same as src/emailTemplates.js). Words in {braces} are
// filled in; **text** is bold; a blank line starts a new paragraph.
const TEMPLATE_DEFAULTS: Record<string, { subject: string; heading: string; message: string }> = {
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
let templateCache: { at: number; rows: Record<string, any> } | null = null;
async function loadTemplates() {
  if (templateCache && Date.now() - templateCache.at < 60_000) return;
  try {
    const { data, error } = await supabase.from("notification_templates").select("key, subject, heading, message").eq("is_active", true);
    templateCache = { at: Date.now(), rows: error ? {} : Object.fromEntries((data ?? []).map((r: any) => [r.key, r])) };
  } catch (_err) {
    templateCache = { at: Date.now(), rows: {} };
  }
}
const fillIn = (text: string, vars: Record<string, unknown>) =>
  String(text ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m));
// { subject, heading (safe HTML), body (paragraphs, safe HTML) } for an email.
function tpl(key: string, vars: Record<string, unknown>) {
  const t = templateCache?.rows[key] ?? TEMPLATE_DEFAULTS[key];
  const safeVars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(String(v ?? ""))]));
  const body = esc(String(t.message ?? "")).split(/\n\s*\n/).map((para) =>
    `<p style="line-height:1.6;">${fillIn(para, safeVars).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>")}</p>`).join("");
  return { subject: fillIn(t.subject, vars), heading: fillIn(esc(t.heading), safeVars), body };
}

const bookingVars = (name: string, b: any, tour: any) => ({
  name, tour: tour?.title ?? "", booking: b.booking_number, date: tour?.start_date ? prettyDate(tour.start_date) : "",
});
const bookingSubmittedEmail = (name: string, b: any, tour: any) => {
  const t = tpl("booking_received", bookingVars(name, b, tour));
  return {
    subject: t.subject,
    html: wrapper(t.heading, "#1A0A00", `
    ${t.body}
    <p><strong>Booking Reference:</strong> ${esc(b.booking_number)}<br/>
    <strong>Amount Paid Now:</strong> ${peso(amountSubmitted(b))}</p>
  `),
  };
};

const bookingConfirmedEmail = (name: string, b: any, tour: any) => {
  const t = tpl("booking_confirmed", bookingVars(name, b, tour));
  return {
    subject: t.subject,
    html: wrapper(t.heading, "#C45C26", `
    ${t.body}
    <p><strong>Booking Reference:</strong> ${esc(b.booking_number)}<br/>
    ${tour?.start_date ? `<strong>Tour Date:</strong> ${prettyDate(tour.start_date)}<br/>` : ""}</p>
  `),
  };
};

const bookingRejectedEmail = (name: string, b: any, tour: any) => {
  const t = tpl("booking_rejected", bookingVars(name, b, tour));
  return { subject: t.subject, html: wrapper(t.heading, "#8C2F1C", t.body) };
};

const customEmail = (name: string, subject: string, message: string) => ({
  subject,
  html: wrapper(esc(subject), "#C45C26", `
    <p>Hi ${esc(name)},</p>
    <p style="line-height:1.7; white-space:pre-wrap;">${esc(message)}</p>
    <p style="color:#7A3A18; font-size: 12px;">You can reply directly to this email.</p>
  `),
});

const loginCodeEmail = (name: string, code: string, minutes: number, purpose = "login") => {
  const words = {
    signup: {
      subject: "Confirm your email for Bandang IBAYO",
      title: "Confirm your email",
      intro: "Thanks for registering! Enter this code on the registration page to confirm your email and finish creating your account:",
      outro: "If you didn't register, you can ignore this email.",
    },
    admin: {
      subject: "Your Bandang IBAYO admin account code",
      title: "You're being added as an admin",
      intro: "Bandang IBAYO's main admin is creating an admin account for you. Give them this code so they can finish adding you:",
      outro: "Only share it with the Bandang IBAYO admin who is adding you. If you weren't expecting this, you can ignore this email.",
    },
    login: {
      subject: "Your Bandang IBAYO verification code",
      title: "Your verification code",
      intro: "Use this code to finish logging in to Bandang IBAYO:",
      outro: "If you didn't try to log in, someone may know your password: please reset it.",
    },
  }[purpose === "signup" || purpose === "admin" ? purpose : "login"];
  return {
    subject: words.subject,
    html: wrapper(words.title, "#C45C26", `
    <p>Hi ${esc(name || "Traveler")},</p>
    <p>${words.intro}</p>
    <p style="font-size: 32px; font-weight: 900; letter-spacing: 0.3em; color:#1A0A00; text-align:center; margin: 24px 0;">${esc(code)}</p>
    <p style="color:#7A3A18;">It's valid for ${minutes} minutes. ${words.outro}</p>
  `),
  };
};

const usableEmail = (e: unknown) => (typeof e === "string" && e.includes("@") ? e.trim() : null);

const displayName = (profile: any, fallback?: string | null) => {
  const n = profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : "";
  return n || (fallback && fallback !== "N/A" ? fallback : "Traveler");
};

// Who the email goes to: the joiner's primary email when they chose their
// second email in Profile Settings, else the address on the record, else the
// account's login email.
async function recipientFor(userId: string | null, recordEmail?: string | null) {
  if (userId) {
    const { data: p } = await supabase.from("profiles").select("secondary_email, primary_email").eq("id", userId).maybeSingle();
    const chosen = p?.primary_email === "secondary" ? usableEmail(p?.secondary_email) : null;
    if (chosen) return chosen;
  }
  const direct = usableEmail(recordEmail);
  if (direct) return direct;
  if (!userId) return null;
  const { data } = await supabase.auth.admin.getUserById(userId);
  return usableEmail(data?.user?.email);
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function buildNormalEmail(payload: any, callerId: string | null, trustedServer: boolean) {
  const { data: caller } = callerId
    ? await supabase.from("profiles").select("role").eq("id", callerId).maybeSingle()
    : { data: null };
  const isAdmin = trustedServer || caller?.role === "admin";

  if (payload.type === "booking-submitted" || payload.type === "booking-status") {
    if (!payload.bookingId) throw new HttpError(400, "Missing bookingId");

    const { data: b } = await supabase
      .from("bookings")
      .select("id, user_id, booking_number, full_name, email, total_price, amount_paid, payment_method, payment_status, tours ( title, start_date )")
      .eq("id", payload.bookingId)
      .maybeSingle();
    if (!b) throw new HttpError(404, "Booking not found");

    const tour = Array.isArray(b.tours) ? b.tours[0] : b.tours;
    const { data: profile } = b.user_id
      ? await supabase.from("profiles").select("first_name, last_name").eq("id", b.user_id).maybeSingle()
      : { data: null };
    const name = displayName(profile, b.full_name);
    const to = await recipientFor(b.user_id, b.email);

    if (payload.type === "booking-submitted") {
      if (!isAdmin && b.user_id !== callerId) throw new HttpError(403, "Not your booking");
      return { to, ...bookingSubmittedEmail(name, b, tour) };
    }

    if (!isAdmin) throw new HttpError(403, "Admins only");
    if (b.payment_status === "Complete") return { to, ...bookingConfirmedEmail(name, b, tour) };
    if (b.payment_status === "Rejected") return { to, ...bookingRejectedEmail(name, b, tour) };
    throw new HttpError(409, "Booking has not been confirmed or rejected yet");
  }

  if (payload.type === "custom") {
    if (!isAdmin) throw new HttpError(403, "Admins only");
    const subject = String(payload.subject ?? "").trim();
    const message = String(payload.message ?? "").trim();
    if (!payload.userId || !subject || !message) throw new HttpError(400, "Missing userId/subject/message");
    if (subject.length > 200 || message.length > 5000) throw new HttpError(400, "Subject or message is too long");

    const { data: profile } = await supabase
      .from("profiles").select("first_name, last_name, email").eq("id", payload.userId).maybeSingle();
    if (!profile) throw new HttpError(404, "Joiner not found");
    const to = await recipientFor(payload.userId, profile.email);
    return { to, ...customEmail(displayName(profile), subject, message) };
  }

  if (payload.type === "login-code") {
    // Only the auth function (service-role key) sends login codes.
    if (!trustedServer) throw new HttpError(403, "Not allowed");
    const code = String(payload.code ?? "");
    if (!usableEmail(payload.to) || !/^\d{6}$/.test(code)) throw new HttpError(400, "Missing recipient or code");
    return { to: usableEmail(payload.to), ...loginCodeEmail(String(payload.name ?? ""), code, Number(payload.minutes) || 10, String(payload.purpose ?? "login")) };
  }

  throw new HttpError(400, "Unknown email type");
}

// ───────────── Balance reminders ─────────────
// Downpayment bookings (downpayment confirmed, balance not yet settled) whose
// tour starts in a few days (2–3 by default; see the booking rules). Each booking is reminded once (balance_reminder_sent_at).
async function runBalanceReminders(dryRun: boolean) {
  if (!(await emailOn("balance"))) return { skipped: "Balance reminders are switched off in System Settings." };
  await loadReminderRules();
  const from = manilaDate(Math.max(1, BALANCE_REMINDER_DAYS - 1)), to = manilaDate(BALANCE_REMINDER_DAYS);
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, user_id, booking_number, full_name, email, total_price, amount_paid, balance_settled, tours!inner ( title, destination, start_date )")
    .gte("tours.start_date", from)
    .lte("tours.start_date", to)
    .eq("payment_method", "Downpayment")
    .eq("payment_status", "Complete")
    .neq("booking_status", "Cancelled")
    .neq("booking_status", "Rejected")
    .is("balance_reminder_sent_at", null);
  if (error) throw new Error(error.message);

  let sent = 0, skipped = 0;
  const errors: string[] = [];
  for (const b of (bookings ?? []) as any[]) {
    const balance = Math.max(0, (b.total_price || 0) - (b.amount_paid || 0));
    if (b.balance_settled || balance <= 0) { skipped++; continue; }
    const tour = Array.isArray(b.tours) ? b.tours[0] : b.tours;
    if (dryRun) { sent++; continue; }
    try {
      const { data: profile } = b.user_id
        ? await supabase.from("profiles").select("first_name, last_name, email").eq("id", b.user_id).maybeSingle()
        : { data: null };
      const to = await recipientFor(b.user_id, b.email);
      if (to) {
        const balanceTpl = tpl("balance_reminder", {
          name: displayName(profile, b.full_name), tour: tour.title, booking: b.booking_number, date: prettyDate(tour.start_date),
          balance: peso(balance), paid: peso(b.amount_paid),
        });
        await transporter.sendMail({
          from: `"Bandang IBAYO" <${GMAIL_USER}>`,
          to,
          replyTo: GMAIL_USER,
          subject: balanceTpl.subject,
          html: wrapper(balanceTpl.heading, "#C45C26", `
            ${balanceTpl.body}
            <p><strong>${esc(tour.title)}</strong><br/>
            📍 ${esc(tour.destination)}<br/>
            📅 ${prettyDate(tour.start_date)}<br/>
            Booking reference: ${esc(b.booking_number)}</p>
          `),
        });
      }
      if (b.user_id) {
        await supabase.from("notifications").insert([{
          user_id: b.user_id,
          title: "Balance due soon",
          message: `Your remaining balance of ${peso(balance)} for ${tour.title} (${b.booking_number}) is due on or before ${prettyDate(tour.start_date)}.`,
          type: "payment",
          related_id: b.id,
        }]);
      }
      await supabase.from("bookings").update({ balance_reminder_sent_at: new Date().toISOString() }).eq("id", b.id);
      sent++;
    } catch (err) {
      errors.push(`${b.booking_number}: ${String((err as Error)?.message || err)}`);
      console.error("send-email[balance]: failed for", b.booking_number, err);
    }
  }
  return { from, to, found: (bookings ?? []).length, sent, skipped, errors };
}

// ───────────── Trip emails (scheduled mode) ─────────────
const manilaHour = () => new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();

const button = (label: string) =>
  SITE_URL
    ? `<p style="margin:18px 0 0;"><a href="${SITE_URL}/login" style="display:inline-block;background:#B4511E;color:#FDF6EE;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:10px;">${esc(label)}</a></p>`
    : "";

// Claims an email in email_log before sending, so it goes out once even if two
// runs overlap. Returns false when it was already sent.
async function claim(kind: string, ref: string) {
  const { data, error } = await supabase.from("email_log").upsert({ kind, ref }, { onConflict: "kind,ref", ignoreDuplicates: true }).select("ref");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
const unclaim = (kind: string, ref: string) => supabase.from("email_log").delete().eq("kind", kind).eq("ref", ref);

async function sendOnce(kind: string, ref: string, to: string | null, subject: string, html: string) {
  if (!to) return "skipped";
  if (!(await claim(kind, ref))) return "already";
  try {
    await transporter.sendMail({ from: `"Bandang IBAYO" <${GMAIL_USER}>`, to, replyTo: GMAIL_USER, subject, html });
    return "sent";
  } catch (err) {
    await unclaim(kind, ref);
    throw err;
  }
}

async function nameOf(userId: string | null, fallback?: string | null) {
  if (!userId) return displayName(null, fallback);
  const { data } = await supabase.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
  return displayName(data, fallback);
}

const cancellationApprovedEmail = (name: string, b: any, tour: any) => {
  const t = tpl("cancellation_approved", bookingVars(name, b, tour));
  return { subject: t.subject, html: wrapper(t.heading, "#8C2F1C", `${t.body}${button("Browse other tours")}`) };
};

async function sendCancellationEmail(b: any) {
  const tour = Array.isArray(b.tours) ? b.tours[0] : b.tours;
  const email = cancellationApprovedEmail(await nameOf(b.user_id, b.full_name), b, tour);
  return sendOnce("cancellation-approved", String(b.id), await recipientFor(b.user_id, b.email), email.subject, email.html);
}

async function runTripEmails() {
  const out: Record<string, unknown> = {};
  const count = async (label: string, work: () => Promise<string[]>) => {
    try {
      const results = await work();
      out[label] = { sent: results.filter((r) => r === "sent").length, checked: results.length };
    } catch (err) {
      out[label] = { error: String((err as Error)?.message || err) };
    }
  };

  // In-app notices first (also sent when the app loads tours).
  await supabase.rpc("daily_notices");

  // "Pickup Starts Today": everyone the notice went to today.
  await count("pickupDay", async () => {
    const { data, error } = await supabase
      .from("pickup_day_notices")
      .select("tour_id, user_id, tours!inner ( title, start_date )")
      .eq("tours.start_date", manilaDate(0));
    if (error) throw new Error(error.message);
    const results: string[] = [];
    for (const n of (data ?? []) as any[]) {
      const tour = Array.isArray(n.tours) ? n.tours[0] : n.tours;
      const { data: stops } = await supabase.from("tour_meetups").select("location_name, scheduled_time, note")
        .eq("tour_id", n.tour_id).order("created_at", { ascending: true });
      const list = stops ?? [];
      const stopsHtml = list.length
        ? `<ul style="padding-left:18px;line-height:1.7;">${list.map((s: any) => `<li><strong>${esc(s.location_name)}</strong>${s.scheduled_time ? ` — ${esc(s.scheduled_time)}` : ""}${s.note ? ` <em>(${esc(s.note)})</em>` : ""}</li>`).join("")}</ul>`
        : `<p>Pickup points and times will be posted in the app under <strong>Tracking</strong>.</p>`;
      const pt = tpl("pickup_day", { name: await nameOf(n.user_id), tour: tour.title, date: prettyDate(tour.start_date) });
      results.push(await sendOnce("pickup-day", `${n.tour_id}:${n.user_id}`, await recipientFor(n.user_id),
        pt.subject,
        wrapper(pt.heading, "#C45C26", `
          ${pt.body}
          ${list[0] ? `<p style="font-size:16px;font-weight:800;">First pickup: ${esc(list[0].location_name)}${list[0].scheduled_time ? ` at ${esc(list[0].scheduled_time)}` : ""}</p>` : ""}
          ${stopsHtml}
          ${button("Open Tracking")}
        `)));
    }
    return results;
  });

  // "Cancellation Approved": by an admin or automatically after 12 hours.
  await count("cancellations", async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, user_id, booking_number, full_name, email, tours ( title, start_date )")
      .eq("booking_status", "Cancelled")
      .not("cancellation_requested_at", "is", null)
      .gte("cancellation_requested_at", new Date(Date.now() - 14 * 864e5).toISOString());
    if (error) throw new Error(error.message);
    const results: string[] = [];
    for (const b of data ?? []) results.push(await sendCancellationEmail(b));
    return results;
  });

  // "Rate your trip": the review invites from the last 3 days.
  await count("reviewInvites", async () => {
    const { data, error } = await supabase
      .from("review_invites")
      .select("tour_id, user_id, sent_at, tours ( title )")
      .gte("sent_at", new Date(Date.now() - 3 * 864e5).toISOString());
    if (error) throw new Error(error.message);
    const results: string[] = [];
    for (const i of (data ?? []) as any[]) {
      const { count: reviewed } = await supabase.from("reviews").select("id", { count: "exact", head: true })
        .eq("tour_id", i.tour_id).eq("user_id", i.user_id);
      if (reviewed) { results.push("skipped"); continue; }
      const tour = Array.isArray(i.tours) ? i.tours[0] : i.tours;
      const rt = tpl("review_invite", { name: await nameOf(i.user_id), tour: tour?.title ?? "", date: tour?.start_date ? prettyDate(tour.start_date) : "" });
      results.push(await sendOnce("review-invite", `${i.tour_id}:${i.user_id}`, await recipientFor(i.user_id),
        rt.subject,
        wrapper(rt.heading, "#C45C26", `${rt.body}${button("Rate your trip")}`)));
    }
    return results;
  });

  // Day-before reminders go out in the evening.
  if (manilaHour() >= 17) {
    await loadReminderRules();
    out.reminders = await runReminders(reminderDate(), false).catch((err) => ({ error: String((err as Error)?.message || err) }));
  }
  out.balance = await runBalanceReminders(false).catch((err) => ({ error: String((err as Error)?.message || err) }));
  // On the 1st of each month (from 8 AM): last month's summary to the main admin(s).
  if (manilaDate(0).endsWith("-01") && manilaHour() >= 8) {
    out.monthly = await runMonthlySummary().catch((err) => ({ error: String((err as Error)?.message || err) }));
  }
  console.log("send-email[scheduled]:", out);
  return out;
}

// ───────────── Monthly summary (main admin) ─────────────
// Last month's sales, bookings, refunds and balances still owed, once a month
// to each main admin ('monthly-summary' in email_log, so it goes out once).
async function runMonthlySummary() {
  if (!(await emailOn("monthly_summary"))) return { skipped: "The monthly summary email is switched off in System Settings." };
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const ym = start.toISOString().slice(0, 7);
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  // Manila month boundaries as UTC instants.
  const from = new Date(start.getTime() - 8 * 3600 * 1000).toISOString();
  const to = new Date(end.getTime() - 8 * 3600 * 1000).toISOString();

  const [{ data: paid }, { data: priv }, { data: refunds }, { data: owing }, { data: admins }] = await Promise.all([
    supabase.from("bookings").select("total_price, amount_paid, payment_method, balance_settled, slots_booked, tours ( title )")
      .eq("payment_status", "Complete").not("booking_status", "in", '("Rejected")').gte("created_at", from).lt("created_at", to),
    supabase.from("exclusive_requests").select("amount_paid, paid_at").gte("paid_at", from).lt("paid_at", to),
    supabase.from("bookings").select("weather_refund").eq("weather_refund_status", "Sent").gte("weather_refund_at", from).lt("weather_refund_at", to),
    supabase.from("bookings").select("total_price, amount_paid").eq("payment_status", "Complete").eq("payment_method", "Downpayment")
      .eq("balance_settled", false).not("booking_status", "in", '("Cancelled","Rejected")'),
    supabase.from("profiles").select("id").eq("is_main_admin", true),
  ]);
  const collectedOf = (b: any) => (b.payment_method === "Downpayment" && !b.balance_settled ? Number(b.amount_paid) || 0 : Number(b.total_price) || 0);
  const tourTotal = (paid ?? []).reduce((n: number, b: any) => n + collectedOf(b), 0);
  const privTotal = (priv ?? []).reduce((n: number, r: any) => n + (Number(r.amount_paid) || 0), 0);
  const joiners = (paid ?? []).reduce((n: number, b: any) => n + (b.slots_booked || 1), 0);
  const refundTotal = (refunds ?? []).reduce((n: number, b: any) => n + (Number(b.weather_refund) || 0), 0);
  const owed = (owing ?? []).reduce((n: number, b: any) => n + Math.max(0, (Number(b.total_price) || 0) - (Number(b.amount_paid) || 0)), 0);
  const byTour: Record<string, number> = {};
  (paid ?? []).forEach((b: any) => {
    const t = (Array.isArray(b.tours) ? b.tours[0] : b.tours)?.title || "Tour";
    byTour[t] = (byTour[t] || 0) + collectedOf(b);
  });
  const top = Object.entries(byTour).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#7A3A18;">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-weight:800;">${esc(v)}</td></tr>`;
  const html = wrapper(`Your ${label} summary`, "#B4511E", `
    <p>Here's how Bandang IBAYO did in <strong>${esc(label)}</strong>:</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;">
      ${row("Collected (tours)", peso(tourTotal))}
      ${row("Collected (private tours)", peso(privTotal))}
      ${row("Total collected", peso(tourTotal + privTotal))}
      ${row("Paid bookings", `${(paid ?? []).length} (${joiners} joiners)`)}
      ${row("Weather refunds sent", peso(refundTotal))}
      ${row("Balances still owed (all months)", `${peso(owed)} · ${(owing ?? []).length} bookings`)}
    </table>
    ${top.length ? `<p style="margin:18px 0 6px;font-weight:800;">Top tours</p><ol style="padding-left:18px;line-height:1.7;">${top.map(([t, v]) => `<li>${esc(t)}: ${peso(v)}</li>`).join("")}</ol>` : ""}
    <p style="color:#7A3A18;">See the full numbers, graphs and PDF in <strong>Reports</strong>.</p>
    ${button("Open the dashboard")}
  `);
  const results: string[] = [];
  for (const a of admins ?? []) {
    results.push(await sendOnce("monthly-summary", `${ym}:${a.id}`, await recipientFor(a.id), `Bandang IBAYO: ${label} summary`, html));
  }
  return results;
}

// ───────────── 15 minutes before departure ─────────────
// notify_departure_soon() (every 5 minutes) notifies joiners in the app and
// logs 'departure-15'; this emails the same bookings once ('departure-15-email').
async function runDepartureEmails() {
  const since = new Date(Date.now() - 30 * 60000).toISOString();
  await supabase.rpc("notify_departure_soon");
  const { data: due, error } = await supabase.from("email_log").select("ref").eq("kind", "departure-15").gte("sent_at", since);
  if (error) throw new Error(error.message);
  const results: string[] = [];
  for (const row of due ?? []) {
    const { data: b } = await supabase.from("bookings")
      .select("id, user_id, email, full_name, booking_number, pickup_point, tour_id, tours ( title, start_date )")
      .eq("id", row.ref).maybeSingle();
    if (!b) { results.push("skipped"); continue; }
    const tour = Array.isArray(b.tours) ? b.tours[0] : b.tours;
    const { data: stops } = await supabase.from("tour_meetups").select("location_name, scheduled_time")
      .eq("tour_id", b.tour_id).order("created_at", { ascending: true });
    const stop = (stops ?? []).find((s: any) => String(s.location_name).trim().toLowerCase() === String(b.pickup_point ?? "").trim().toLowerCase()) ?? (stops ?? [])[0];
    const dt = tpl("departure_soon", {
      name: await nameOf(b.user_id, b.full_name), tour: tour?.title ?? "your tour", booking: b.booking_number,
      at_stop: stop ? ` at ${stop.location_name}${stop.scheduled_time ? `, ${stop.scheduled_time}` : ""}` : "",
    });
    results.push(await sendOnce("departure-15-email", String(b.id), await recipientFor(b.user_id, b.email),
      dt.subject,
      wrapper(dt.heading, "#C45C26", `
        ${dt.body}
        <p style="color:#7A3A18;">Booking ${esc(b.booking_number)}</p>
        ${button("Open Tracking")}
      `)));
  }
  const out = { sent: results.filter((r) => r === "sent").length, checked: results.length };
  console.log("send-email[departure-emails]:", out);
  return out;
}

// The hourly job's secret: the CRON_SECRET function secret, or the one the
// migration stored in public.app_secrets.
async function isScheduler(req: Request) {
  const given = req.headers.get("x-cron-secret");
  if (!given) return false;
  const envSecret = Deno.env.get("CRON_SECRET");
  if (envSecret && given === envSecret) return true;
  const { data } = await supabase.from("app_secrets").select("value").eq("name", "cron_secret").maybeSingle();
  return !!data?.value && given === data.value;
}

// ───────────── Account deletion (Data Privacy Act) ─────────────
// The joiner deletes their own account. purge_user_data() keeps booking records
// for the agency but strips personal details, and deletes everything else; then
// their uploaded files and their login are deleted.
const receiptStoragePath = (value: string) => {
  if (!/^https?:\/\//.test(value)) return value;
  const i = value.indexOf("/booking-receipts/");
  return i === -1 ? null : decodeURIComponent(value.slice(i + "/booking-receipts/".length).split("?")[0]);
};

async function removeFolder(bucket: string, folder: string) {
  const { data } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
  const paths = (data ?? []).filter((f: any) => f.id).map((f: any) => `${folder}/${f.name}`);
  if (paths.length) await supabase.storage.from(bucket).remove(paths);
  return paths.length;
}

// "Delete my account" archives the account instead of deleting it: the data
// stays, the joiner can't log in, and an admin can restore it from Joiner
// Accounts → Archived.
async function deleteAccount(userId: string, payload: any) {
  if (payload.confirm !== "DELETE") throw new HttpError(400, "Please confirm by typing DELETE.");
  const { data: who } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (who?.role === "admin" || who?.role === "archived_admin") throw new HttpError(403, "Admin accounts can't be archived here.");
  const now = new Date().toISOString();
  const { error } = await supabase.from("profiles")
    .update({ archived_at: now, archive_reason: "deleted", deactivated_at: now }).eq("id", userId);
  if (error) throw new HttpError(409, error.message);
  console.log("send-email[delete-account]: archived", { userId });
  return { success: true };
}

// ───────────── Waitlist openings ─────────────
// The database (notify_waitlist) marks waitlist rows notified_at when slots open
// and creates the in-app notification. This sends the matching email, once.
async function sendWaitlistEmails(tourId: unknown) {
  if (!tourId) throw new HttpError(400, "Missing tourId");

  const { data: tour } = await supabase
    .from("tours").select("id, title, destination, start_date").eq("id", tourId).maybeSingle();
  if (!tour) throw new HttpError(404, "Tour not found");

  const { data: rows } = await supabase
    .from("tour_waitlist")
    .select("id, user_id, slots_wanted")
    .eq("tour_id", tourId)
    .not("notified_at", "is", null)
    .is("emailed_at", null);

  let sent = 0;
  for (const w of rows ?? []) {
    const { data: profile } = await supabase
      .from("profiles").select("first_name, last_name, email").eq("id", w.user_id).maybeSingle();
    const to = await recipientFor(w.user_id, profile?.email);
    if (to) {
      const wt = tpl("waitlist_opening", { name: displayName(profile), tour: tour.title, date: prettyDate(tour.start_date) });
      await transporter.sendMail({
        from: `"Bandang IBAYO" <${GMAIL_USER}>`,
        to,
        replyTo: GMAIL_USER,
        subject: wt.subject,
        html: wrapper(wt.heading, "#C45C26", `
          ${wt.body}
          <p><strong>${esc(tour.title)}</strong><br/>
          📍 ${esc(tour.destination)}<br/>
          📅 ${prettyDate(tour.start_date)}</p>
        `),
      });
      sent++;
    }
    await supabase.from("tour_waitlist").update({ emailed_at: new Date().toISOString() }).eq("id", w.id);
  }
  return { success: true, sent };
}

// ───────────── Request handler ─────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    await loadTemplates(); // the admins' email texts (Notification Templates)

    if (!GMAIL_APP_PASSWORD && !payload.dryRun) {
      return reply({ error: "GMAIL_APP_PASSWORD not configured" }, 500);
    }

    // ── Reminder mode (service-role only) ──
    if (payload.action === "departure-emails") {
      if (!(await isScheduler(req))) return reply({ error: "Forbidden: only the scheduler can start this" }, 403);
      return reply(await runDepartureEmails());
    }
    if (payload.action === "scheduled") {
      if (!(await isScheduler(req))) return reply({ error: "Forbidden: only the scheduler can start this" }, 403);
      return reply(await runTripEmails());
    }
    if (payload.action === "tour-reminders") {
      if (!(await isScheduler(req))) {
        return reply({ error: "Forbidden: reminders can only be triggered by the scheduler" }, 403);
      }
      // Run independently, so a problem with one kind of reminder doesn't stop the other.
      await loadReminderRules();
      const [result, balance] = await Promise.all([
        runReminders(payload.date || reminderDate(), !!payload.dryRun)
          .catch((err) => ({ error: String((err as Error)?.message || err) })),
        runBalanceReminders(!!payload.dryRun)
          .catch((err) => ({ error: String((err as Error)?.message || err) })),
      ]);
      return reply({ ...result, balance });
    }

    // ── Normal mode: send one templated email (logged-in users only) ──
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    // The payments function calls this with the service-role key (e.g. to send the
    // booking confirmation after an online payment); it's treated like an admin.
    const trustedServer = !!SERVICE_ROLE && token === SERVICE_ROLE;
    let callerId: string | null = null;
    if (!trustedServer) {
      const { data: userData, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !userData?.user) return reply({ error: "You must be logged in to send email." }, 401);
      callerId = userData.user.id;
    }

    if (payload.type === "waitlist-openings") return reply(await sendWaitlistEmails(payload.tourId));
    if (payload.type === "cancellation-approved") {
      const { data: caller } = callerId
        ? await supabase.from("profiles").select("role").eq("id", callerId).maybeSingle()
        : { data: null };
      if (!trustedServer && caller?.role !== "admin") return reply({ error: "Only admins can send this email." }, 403);
      const { data: b } = await supabase.from("bookings")
        .select("id, user_id, booking_number, full_name, email, booking_status, tours ( title, start_date )")
        .eq("id", payload.bookingId).maybeSingle();
      if (!b) return reply({ error: "Booking not found" }, 404);
      if (b.booking_status !== "Cancelled") return reply({ error: "This booking isn't cancelled." }, 409);
      return reply({ success: true, result: await sendCancellationEmail(b) });
    }
    if (payload.type === "delete-account") {
      if (!callerId) return reply({ error: "Only the account owner can delete their account." }, 403);
      return reply(await deleteAccount(callerId, payload));
    }

    const email = await buildNormalEmail(payload, callerId, trustedServer);
    if (!email.to) return reply({ error: "This joiner has no email address on file." }, 422);

    const info = await transporter.sendMail({
      from: `"Bandang IBAYO" <${GMAIL_USER}>`,
      to: email.to,
      replyTo: GMAIL_USER,
      subject: email.subject,
      html: email.html,
    });
    console.log("send-email: sent", { type: payload.type, to: email.to, messageId: info.messageId });
    return reply({ success: true, messageId: info.messageId });
  } catch (err) {
    if (err instanceof HttpError) return reply({ error: err.message }, err.status);
    console.error("send-email: error", err);
    return reply({ error: String((err as Error)?.message || err) }, 500);
  }
});