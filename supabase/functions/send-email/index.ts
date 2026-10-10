// supabase/functions/send-email/index.ts
//
// ONE function for ALL emails, sent through the agency Gmail (bandangibayo@gmail.com):
//   1) Normal mode  — body { to, subject, html, replyTo? }
//        used by booking emails (Email.js) and the admin's manual email (Joiner Accounts)
//   2) Reminder mode — body { action: "tour-reminders", date?, dryRun? }
//        emails every confirmed joiner whose tour starts TOMORROW (Philippine time).
//        Called daily by pg_cron with the x-cron-secret header; blocked for everyone else.
//
// Deploy:   supabase functions deploy send-email --no-verify-jwt
//           (auth is checked inside the function: user login for normal mode, CRON_SECRET for reminders)
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

    // ── Normal mode: send one email (logged-in users only) ──
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return reply({ error: "You must be logged in to send email." }, 401);

    const { to, subject, html, replyTo } = payload;
    const recipient = typeof to === "string" ? to.trim() : to;
    if (!recipient || !subject || !html) return reply({ error: "Missing to/subject/html" }, 400);

    const info = await transporter.sendMail({
      from: `"Bandang IBAYO" <${GMAIL_USER}>`,
      to: recipient,
      replyTo: replyTo || GMAIL_USER,
      subject,
      html,
    });
    console.log("send-email: sent", { to: recipient, messageId: info.messageId });
    return reply({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error("send-email: error", err);
    return reply({ error: String((err as Error)?.message || err) }, 500);
  }
});