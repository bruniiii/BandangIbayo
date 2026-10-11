// supabase/functions/send-email/index.ts
//
// ONE function for ALL emails, sent through the agency Gmail (bandangibayo@gmail.com):
//   1) Normal mode  — body { type, ... }. The caller only says WHICH email to send;
//        the recipient and content are looked up and built here, so a logged-in user
//        can't use this function to send arbitrary email from the agency Gmail.
//        - { type: "booking-submitted", bookingId }  booking owner (or admin)
//        - { type: "booking-status",    bookingId }  admin only; confirmed/rejected per payment_status
//        - { type: "custom", userId, subject, message }  admin only (Joiner Accounts manual email)
//        - { type: "waitlist-openings", tourId }  any logged-in user; emails the waitlisted joiners
//        - { type: "delete-account", confirm: "DELETE" }  the logged-in joiner deletes their own
//          account: personal data removed (purge_user_data), their files deleted, login deleted
//          the database already notified about an opening on that tour (each joiner once)
//   2) Reminder mode — body { action: "tour-reminders", date?, dryRun? }
//        Also sends balance reminders: joiners who paid a downpayment and whose tour
//        starts in 2–3 days get one email + in-app notice about the remaining balance.
//        emails every confirmed joiner whose tour starts TOMORROW (Philippine time).
//        Called daily by pg_cron with the x-cron-secret header; blocked for everyone else.
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

const peso = (n: number) => `₱${Math.round(n || 0).toLocaleString("en-PH")}`;

// A day in Asia/Manila (UTC+8), as YYYY-MM-DD — matches tours.start_date
const manilaDate = (daysFromToday: number) =>
  new Date(Date.now() + 8 * 3600 * 1000 + daysFromToday * 24 * 3600 * 1000).toISOString().slice(0, 10);
const tomorrowManila = () => manilaDate(1);

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
         <strong>Driver:</strong> ${esc(vehicle.driver_name)} (${esc(vehicle.driver_contact)})
       </p>`
    : "";

  const stopsHtml = stops.length
    ? `<ul style="margin:0;padding-left:18px;color:#1A0A00;font-size:14px;line-height:1.7;">${stops
        .map((s) => `<li><strong>${esc(s.location_name)}</strong> — ETA ${esc(s.scheduled_time)}${s.note ? ` <em>(${esc(s.note)})</em>` : ""}</li>`)
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

  const html = `
  <div style="font-family:'Inter',Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1A0A00;background:#FDF6EE;">
    <h2 style="color:#C45C26;margin:0 0 6px;">See you tomorrow! 🚐</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#7A3A18;">Hi ${esc(name)}, this is a friendly reminder that your tour starts tomorrow.</p>

    <div style="background:#1A0A00;border-radius:14px;padding:16px 18px;color:#FDF6EE;">
      <p style="margin:0;font-size:17px;font-weight:800;">${esc(tour.title)}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#E8A265;">📍 ${esc(tour.destination)}</p>
      <p style="margin:4px 0 0;font-size:13px;">📅 ${prettyDate(tour.start_date)}${tour.duration ? ` · ${esc(tour.duration)}` : ""}</p>
      <p style="margin:4px 0 0;font-size:13px;">👤 ${booking.slots_booked} ${booking.slots_booked === 1 ? "person" : "persons"} · Ref: ${esc(booking.booking_number)}</p>
    </div>

    ${section("Pickup Points &amp; ETA", stopsHtml)}
    ${section("Your Driver &amp; Vehicle", vehicleHtml)}
    ${section("Things to Bring", listHtml(tour.things_to_bring))}
    ${section("Balance Reminder", balanceHtml)}
    ${section("Important Note", noteHtml)}

    <p style="font-size:13px;color:#7A3A18;margin:18px 0 0;line-height:1.6;">
      Live van updates are also posted under <strong>Tracking</strong> in your Bandang IBAYO account.
      Questions? Just reply to this email or write us at ${GMAIL_USER}.
    </p>
    <p style="color:#7A3A18;font-size:13px;margin-top:20px;">— The Bandang IBAYO Team</p>
  </div>`;

  return html;
}


// ───────────── Reminder mode ─────────────
async function runReminders(date: string, dryRun: boolean) {
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
    if (!b.email || b.email === "N/A") { skipped++; continue; }

    const p = profileMap[b.user_id];
    const profileName = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "";
    const name = profileName || (b.full_name && b.full_name !== "N/A" ? b.full_name : "Traveler");
    const tour = Array.isArray(b.tours) ? b.tours[0] : b.tours;

    if (dryRun) { sent++; continue; }

    try {
      await transporter.sendMail({
        from: `"Bandang IBAYO" <${GMAIL_USER}>`,
        to: b.email,
        replyTo: GMAIL_USER,
        subject: `Reminder: ${tour.title} starts tomorrow 🚐 (${b.booking_number})`,
        html: buildEmail({ name, booking: b, tour, vehicle: vehicleByTour[b.tour_id], stops: stopsByTour[b.tour_id] }),
      });

      await supabase.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id);

      if (b.user_id) {
        await supabase.from("notifications").insert([{
          user_id: b.user_id,
          title: "Your tour starts tomorrow 🚐",
          message: `Reminder: ${tour.title} (${b.booking_number}) departs tomorrow, ${prettyDate(tour.start_date)}. Check the Tracking tab for pickup ETAs and driver details.`,
          type: "tour",
          related_id: b.id,
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

// What the joiner says they paid: the amount they submitted, else what their payment option requires.
const amountSubmitted = (b: any) =>
  b.amount_paid ?? (b.payment_method === "Downpayment" ? Math.round((b.total_price || 0) * 0.4) : b.total_price || 0);

const bookingSubmittedEmail = (name: string, b: any, tour: any) => ({
  subject: `Booking Received — ${b.booking_number}`,
  html: wrapper("Booking Received", "#1A0A00", `
    <p>Thanks for booking with Bandang IBAYO, ${esc(name)}!</p>
    <p>We've received your booking for <strong>${esc(tour?.title)}</strong>.</p>
    <p><strong>Booking Reference:</strong> ${esc(b.booking_number)}<br/>
    <strong>Amount Paid Now:</strong> ${peso(amountSubmitted(b))}</p>
    <p>Your payment is now pending verification. We'll email you again as soon as it's confirmed.</p>
  `),
});

const bookingConfirmedEmail = (name: string, b: any, tour: any) => ({
  subject: `Booking Confirmed 🎉 — ${b.booking_number}`,
  html: wrapper("You're Confirmed!", "#C45C26", `
    <p>Hi ${esc(name)}, your payment for <strong>${esc(tour?.title)}</strong> has been verified.</p>
    <p><strong>Booking Reference:</strong> ${esc(b.booking_number)}<br/>
    ${tour?.start_date ? `<strong>Tour Date:</strong> ${prettyDate(tour.start_date)}<br/>` : ""}</p>
    <p>See you on the trip! Pickup and driver details will be posted in the app closer to your departure date.</p>
  `),
});

const bookingRejectedEmail = (name: string, b: any, tour: any) => ({
  subject: `Booking Update — ${b.booking_number}`,
  html: wrapper("Payment Verification Issue", "#8C2F1C", `
    <p>Hi ${esc(name)}, we weren't able to verify the payment for your booking of <strong>${esc(tour?.title)}</strong> (${esc(b.booking_number)}).</p>
    <p>Please reach out to us so we can help sort this out.</p>
  `),
});

const customEmail = (name: string, subject: string, message: string) => ({
  subject,
  html: wrapper(esc(subject), "#C45C26", `
    <p>Hi ${esc(name)},</p>
    <p style="line-height:1.7; white-space:pre-wrap;">${esc(message)}</p>
    <p style="color:#7A3A18; font-size: 12px;">You can reply directly to this email.</p>
  `),
});

const usableEmail = (e: unknown) => (typeof e === "string" && e.includes("@") ? e.trim() : null);

const displayName = (profile: any, fallback?: string | null) => {
  const n = profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : "";
  return n || (fallback && fallback !== "N/A" ? fallback : "Traveler");
};

// Who the email goes to: the address on the record, else the account's login email.
async function recipientFor(userId: string | null, recordEmail?: string | null) {
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

  throw new HttpError(400, "Unknown email type");
}

// ───────────── Balance reminders ─────────────
// Downpayment bookings (downpayment confirmed, balance not yet settled) whose
// tour starts in 2–3 days. Each booking is reminded once (balance_reminder_sent_at).
async function runBalanceReminders(dryRun: boolean) {
  const from = manilaDate(2), to = manilaDate(3);
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
        await transporter.sendMail({
          from: `"Bandang IBAYO" <${GMAIL_USER}>`,
          to,
          replyTo: GMAIL_USER,
          subject: `Balance reminder: ${peso(balance)} due for ${tour.title} (${b.booking_number})`,
          html: wrapper("Your balance is due soon", "#C45C26", `
            <p>Hi ${esc(displayName(profile, b.full_name))}, your tour is coming up!</p>
            <p><strong>${esc(tour.title)}</strong><br/>
            📍 ${esc(tour.destination)}<br/>
            📅 ${prettyDate(tour.start_date)}<br/>
            Booking reference: ${esc(b.booking_number)}</p>
            <p>You paid a downpayment of ${peso(b.amount_paid)}. The remaining balance of
            <strong>${peso(balance)}</strong> is due on or before the day of the tour.</p>
            <p>You can pay it online now from <strong>My Bookings → Pay balance online</strong>
            (GCash, Maya or card), or pay in person on the day of the tour.</p>
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

async function deleteAccount(userId: string, payload: any) {
  if (payload.confirm !== "DELETE") throw new HttpError(400, "Please confirm by typing DELETE.");

  const { data: purged, error } = await supabase.rpc("purge_user_data", { p_user_id: userId });
  if (error) throw new HttpError(409, error.message);

  const receipts = ((purged?.receipts ?? []) as string[]).map(receiptStoragePath).filter(Boolean) as string[];
  if (receipts.length) await supabase.storage.from("booking-receipts").remove(receipts);
  const files = receipts.length
    + await removeFolder("booking-receipts", userId)
    + await removeFolder("tours", `avatars/${userId}`)
    + await removeFolder("tours", `review-media/${userId}`);

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) throw new Error("Your data was removed, but the login could not be deleted: " + authError.message);

  console.log("send-email[delete-account]:", { userId, bookingsKept: purged?.bookings_kept, files });
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
      await transporter.sendMail({
        from: `"Bandang IBAYO" <${GMAIL_USER}>`,
        to,
        replyTo: GMAIL_USER,
        subject: `A slot opened up: ${tour.title}`,
        html: wrapper("A slot opened up! 🎉", "#C45C26", `
          <p>Hi ${esc(displayName(profile))}, good news: a slot just opened on a tour you're waiting for.</p>
          <p><strong>${esc(tour.title)}</strong><br/>
          📍 ${esc(tour.destination)}<br/>
          📅 ${prettyDate(tour.start_date)}</p>
          <p>Log in to Bandang IBAYO and book now. Slots go to whoever books first.</p>
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

    if (!GMAIL_APP_PASSWORD && !payload.dryRun) {
      return reply({ error: "GMAIL_APP_PASSWORD not configured" }, 500);
    }

    // ── Reminder mode (service-role only) ──
    if (payload.action === "tour-reminders") {
      const CRON_SECRET = Deno.env.get("CRON_SECRET");
      if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
        return reply({ error: "Forbidden: reminders can only be triggered by the scheduler" }, 403);
      }
      // Run independently, so a problem with one kind of reminder doesn't stop the other.
      const [result, balance] = await Promise.all([
        runReminders(payload.date || tomorrowManila(), !!payload.dryRun)
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