// supabase/functions/send-email/index.ts
//
// ONE function for ALL emails, sent through the agency Gmail (bandangibayo@gmail.com):
//   1) Normal mode  — body { type, ... }. The caller only says WHICH email to send;
//        the recipient and content are looked up and built here, so a logged-in user
//        can't use this function to send arbitrary email from the agency Gmail.
//        - { type: "booking-submitted", bookingId }  booking owner (or admin)
//        - { type: "booking-status",    bookingId }  admin only; confirmed/rejected per payment_status
//        - { type: "custom", userId, subject, message }  admin only (Joiner Accounts manual email)
//   2) Reminder mode — body { action: "tour-reminders", date?, dryRun? }
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

// "Tomorrow" in Asia/Manila (UTC+8), as YYYY-MM-DD — matches tours.start_date
const tomorrowManila = () =>
  new Date(Date.now() + 8 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().slice(0, 10);

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

async function buildNormalEmail(payload: any, callerId: string) {
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", callerId).maybeSingle();
  const isAdmin = caller?.role === "admin";

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
      const result = await runReminders(payload.date || tomorrowManila(), !!payload.dryRun);
      return reply(result);
    }

    // ── Normal mode: send one templated email (logged-in users only) ──
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return reply({ error: "You must be logged in to send email." }, 401);

    const email = await buildNormalEmail(payload, userData.user.id);
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