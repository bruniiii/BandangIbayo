// supabase/functions/payments/index.ts
//
// Online payments through PayMongo Checkout (GCash, Maya, cards, GrabPay).
//
// Logged-in joiner actions (Authorization: Bearer <user token>), body { action, ... }:
//   - "create-checkout"  { tourId, slots, paymentType: "full"|"down", companions, accommodation?, returnBaseUrl }
//        holds the slots for 30 minutes (start_online_booking) and opens a PayMongo checkout
//   - "pay-balance"      { bookingId, returnBaseUrl }   checkout for a downpayment's remaining balance
//   - "verify-checkout"  { bookingId }   re-checks the booking's checkouts with PayMongo (used when
//                                        the joiner comes back from PayMongo, and from My Bookings)
//   - "cancel-checkout"  { bookingId }   joiner backed out: expires the checkout, frees the slots
//   - "pay-held"         { bookingId, paymentType: "full"|"down", companions, accommodation?, returnBaseUrl }
//        pays for slots the agency held for a tour the joiner requested (held for 2 days)
//   - "pay-exclusive"    { requestId, accommodation?, returnBaseUrl }   50% downpayment for an approved exclusive
//                        tour, from the package price the agency sent (never from the request body)
//                        (part: "balance" pays the rest of the package price after it)
//   - "verify-exclusive" { requestId }   re-checks those payments with PayMongo
//
// Scheduled (pg_cron, every 5 minutes; no login needed, it only touches lapsed holds):
//   - "expire-holds"     closes each lapsed checkout at PayMongo first, so it can no longer
//                        be paid, then releases the slots. If PayMongo can't be reached the
//                        hold keeps its slots and is retried on the next run.
//
// Payments are non-refundable (Terms, section 2), so there is no refund path anywhere.
//
// PayMongo webhook (header Paymongo-Signature): checkout_session.payment.paid.
//   Payment state is never taken from the request body: the session is always re-fetched
//   from PayMongo's API with our secret key before anything is recorded. PayMongo doesn't
//   resend missed webhooks, so "verify-checkout" covers that case too.
//
// Deploy:   supabase functions deploy payments --no-verify-jwt
// Secrets:  supabase secrets set PAYMONGO_SECRET_KEY=sk_test_...      (sk_live_... to go live)
//           supabase secrets set PAYMONGO_WEBHOOK_SECRET=whsk_...      (from the webhook you create)
//           supabase secrets set SITE_URL=https://<your-site>.vercel.app
//           supabase secrets set PAYMONGO_PAYMENT_METHODS=gcash,paymaya,card,grab_pay   (optional)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY") ?? "";
const PAYMONGO_WEBHOOK_SECRET = Deno.env.get("PAYMONGO_WEBHOOK_SECRET") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
const PAYMENT_METHODS = (Deno.env.get("PAYMONGO_PAYMENT_METHODS") ?? "gcash,paymaya,card,grab_pay")
  .split(",").map((m) => m.trim()).filter(Boolean);
const PAYMONGO_API = "https://api.paymongo.com/v1";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ───────────── PayMongo API ─────────────
async function paymongo(method: string, path: string, body?: unknown) {
  if (!PAYMONGO_SECRET_KEY) throw new HttpError(500, "Online payments aren't set up yet (PAYMONGO_SECRET_KEY missing).");
  const res = await fetch(`${PAYMONGO_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${PAYMONGO_SECRET_KEY}:`)}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.errors?.map((e: any) => e.detail).join("; ") || res.statusText;
    throw new HttpError(502, `PayMongo: ${detail}`);
  }
  return json;
}

const centavos = (pesos: number) => Math.round(pesos * 100);

// Where PayMongo sends the joiner back. Only our own site (or localhost while testing).
function returnBase(requested: unknown) {
  const r = typeof requested === "string" ? requested.replace(/\/+$/, "") : "";
  if (r && (r === SITE_URL || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(r))) return r;
  if (!SITE_URL) throw new HttpError(500, "Online payments aren't set up yet (SITE_URL missing).");
  return SITE_URL;
}

async function createSession(opts: {
  booking: any; tour: any; amount: number; kind: "booking" | "balance"; label: string; base: string;
}) {
  const { booking, tour, amount, kind, label, base } = opts;
  const back = kind === "booking" ? "payment" : "balance";
  const session = await paymongo("POST", "/checkout_sessions", {
    data: {
      attributes: {
        line_items: [{
          name: `${tour.title} · ${booking.slots_booked} pax · ${label}`,
          amount: centavos(amount),
          currency: "PHP",
          quantity: 1,
        }],
        payment_method_types: PAYMENT_METHODS,
        description: `Bandang IBAYO booking ${booking.booking_number}. Payments are non-refundable; bookings can be cancelled up to 14 days before the tour.`,
        reference_number: booking.booking_number,
        metadata: { booking_id: String(booking.id), kind },
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        success_url: `${base}/dashboard?${back}=success&booking=${booking.id}`,
        cancel_url: `${base}/dashboard?${back}=cancelled&booking=${booking.id}`,
      },
    },
  });
  return { id: session?.data?.id as string, url: session?.data?.attributes?.checkout_url as string };
}

// Re-fetch a checkout session from PayMongo and, if it's paid, record the payment.
async function processSession(sessionId: string) {
  const session = await paymongo("GET", `/checkout_sessions/${encodeURIComponent(sessionId)}`);
  const attrs = session?.data?.attributes ?? {};
  const paid = (attrs.payments ?? []).find((p: any) => p?.attributes?.status === "paid");
  if (attrs.metadata?.kind === "exclusive" || attrs.metadata?.kind === "exclusive_balance") {
    const isBalance = attrs.metadata.kind === "exclusive_balance";
    if (!attrs.metadata?.request_id) return { status: "not_ours" };
    if (!paid) return { status: "unpaid", kind: attrs.metadata.kind };
    const amount = (paid.attributes.amount ?? 0) / 100;
    return isBalance
      ? await recordExclusiveBalance(attrs.metadata.request_id, amount, paid.id)
      : await recordExclusivePayment(attrs.metadata.request_id, amount, paid.id);
  }
  const bookingId = attrs.metadata?.booking_id;
  const kind = attrs.metadata?.kind === "balance" ? "balance" : "booking";
  if (!bookingId) return { status: "not_ours" };
  if (!paid) return { status: "unpaid" };

  const { data, error } = await supabase.rpc("record_online_payment", {
    p_booking_id: bookingId,
    p_kind: kind,
    p_amount: (paid.attributes.amount ?? 0) / 100,
    p_payment_id: paid.id,
  });
  if (error) throw new Error(error.message);

  if (data?.status === "confirmed") {
    // Same "You're Confirmed!" email an admin's manual confirmation sends.
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "booking-status", bookingId }),
    }).catch((err) => console.error("payments: confirmation email failed", err));
  }
  return { status: data?.status ?? "unknown", kind };
}

// ───────────── Webhook signature ─────────────
const enc = new TextEncoder();
async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// Header "t=<timestamp>,te=<test sig>,li=<live sig>"; signature = HMAC-SHA256("<t>.<raw body>").
// The plain HMAC of the body is accepted too, since PayMongo's docs describe both forms.
async function signatureValid(header: string, raw: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2)));
  const candidates = [parts.te, parts.li].filter(Boolean) as string[];
  if (!candidates.length) candidates.push(header.trim());
  const expected = [
    parts.t ? await hmacHex(PAYMONGO_WEBHOOK_SECRET, `${parts.t}.${raw}`) : "",
    await hmacHex(PAYMONGO_WEBHOOK_SECRET, raw),
  ].filter(Boolean);
  return candidates.some((c) => expected.some((e) => safeEqual(c, e)));
}

async function handleWebhook(req: Request) {
  const raw = await req.text();
  const header = req.headers.get("paymongo-signature") ?? "";
  if (PAYMONGO_WEBHOOK_SECRET && !(await signatureValid(header, raw))) {
    console.warn("payments[webhook]: signature check failed");
    return reply({ error: "Invalid signature" }, 401);
  }
  const event = JSON.parse(raw || "{}");
  const type = event?.data?.attributes?.type;
  const sessionId = event?.data?.attributes?.data?.id;
  if (type === "checkout_session.payment.paid" && sessionId) {
    const result = await processSession(sessionId);
    console.log("payments[webhook]:", { sessionId, ...result });
  }
  return reply({ received: true });
}

// ───────────── Joiner actions ─────────────
async function loadOwnBooking(bookingId: unknown, userId: string) {
  if (bookingId == null || bookingId === "") throw new HttpError(400, "Missing booking.");
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*, tours ( id, title, start_date, end_date )")
    .eq("id", bookingId)
    .maybeSingle();
  // Each case says what went wrong (and is logged), instead of one "not found" for all of them.
  if (error) {
    console.error("payments: couldn't load booking", { bookingId, error });
    throw new HttpError(500, `Couldn't load your booking (${error.message}). Please try again, or contact us.`);
  }
  if (!booking) throw new HttpError(404, `Booking not found (id ${bookingId}).`);
  if (booking.user_id !== userId) {
    console.error("payments: booking belongs to another account", { bookingId, owner: booking.user_id, caller: userId });
    throw new HttpError(403, "This booking belongs to another account. Please log in with the account that made it.");
  }
  return booking;
}

// The accommodation the joiner chose, checked against what the tour (or
// package) offers. Tours that offer none take none.
function chosenAccommodation(options: unknown, choice: unknown) {
  const offered = Array.isArray(options) ? options.map(String) : [];
  if (!offered.length) return null;
  const pick = typeof choice === "string" ? choice.trim() : "";
  if (!offered.includes(pick)) throw new HttpError(400, "Please choose your accommodation.");
  return pick;
}

async function createCheckout(userId: string, p: any) {
  const { data: offered } = await supabase.from("tours").select("accommodation_options").eq("id", p.tourId).maybeSingle();
  const accommodation = chosenAccommodation(offered?.accommodation_options, p.accommodation);
  const { data: booking, error } = await supabase.rpc("start_online_booking", {
    p_user_id: userId,
    p_tour_id: p.tourId,
    p_slots: p.slots,
    p_payment_type: p.paymentType,
    p_companions: p.companions ?? [],
  });
  if (error) throw new HttpError(409, error.message);
  if (accommodation) await supabase.from("bookings").update({ accommodation }).eq("id", booking.id);

  const { data: tour } = await supabase.from("tours").select("id, title").eq("id", booking.tour_id).single();
  const full = p.paymentType === "full";
  const amount = full ? Number(booking.total_price) : Math.round(Number(booking.total_price) * 40) / 100; // 40%, to the centavo

  try {
    const session = await createSession({
      booking, tour, amount, kind: "booking", base: returnBase(p.returnBaseUrl),
      label: full ? "Full payment" : "40% downpayment",
    });
    await supabase.from("bookings")
      .update({ paymongo_checkout_id: session.id, paymongo_checkout_url: session.url })
      .eq("id", booking.id);
    return { checkoutUrl: session.url, bookingId: booking.id, bookingNumber: booking.booking_number };
  } catch (err) {
    // Couldn't open the checkout: don't keep the slots on hold.
    await supabase.from("bookings")
      .update({ booking_status: "Cancelled", payment_status: "Expired", cancellation_reason: "Online checkout could not be started." })
      .eq("id", booking.id);
    throw err;
  }
}

async function payBalance(userId: string, p: any) {
  const booking = await loadOwnBooking(p.bookingId, userId);
  const balance = Math.max(0, Number(booking.total_price || 0) - Number(booking.amount_paid || 0));
  if (booking.payment_method !== "Downpayment" || booking.payment_status !== "Complete"
      || booking.balance_settled || ["Cancelled", "Rejected"].includes(booking.booking_status) || balance <= 0) {
    throw new HttpError(409, "There's no balance to pay on this booking.");
  }

  // An earlier balance checkout may already be paid, or still usable.
  if (booking.paymongo_balance_checkout_id) {
    const result = await processSession(booking.paymongo_balance_checkout_id);
    if (result.status === "balance_settled" || result.status === "already") return { alreadyPaid: true };
    if (booking.paymongo_balance_checkout_url) return { checkoutUrl: booking.paymongo_balance_checkout_url };
  }

  const session = await createSession({
    booking, tour: booking.tours, amount: balance, kind: "balance", base: returnBase(p.returnBaseUrl),
    label: "Remaining balance",
  });
  await supabase.from("bookings")
    .update({ paymongo_balance_checkout_id: session.id, paymongo_balance_checkout_url: session.url })
    .eq("id", booking.id);
  return { checkoutUrl: session.url };
}

// Slots held for the joiner who requested the tour: they choose full payment
// or downpayment and name their companions, then pay like any booking.
async function payHeld(userId: string, p: any) {
  const booking = await loadOwnBooking(p.bookingId, userId);
  if (!booking.request_id || booking.payment_status !== "Awaiting Payment") {
    throw new HttpError(409, "This booking is not waiting for payment.");
  }
  // A checkout opened earlier may already be paid; otherwise close it, since
  // the amount may change (full payment vs downpayment).
  if (booking.paymongo_checkout_id) {
    const result = await closeCheckout(booking.paymongo_checkout_id);
    if (result.status !== "unpaid") return { alreadyPaid: true };
  }
  const { data: offered } = await supabase.from("tours").select("accommodation_options").eq("id", booking.tour_id).maybeSingle();
  const accommodation = chosenAccommodation(offered?.accommodation_options, p.accommodation);
  const { data: prepared, error } = await supabase.rpc("prepare_held_booking", {
    p_booking_id: booking.id,
    p_user_id: userId,
    p_payment_type: p.paymentType,
    p_companions: p.companions ?? [],
  });
  if (error) throw new HttpError(409, error.message);
  if (accommodation) await supabase.from("bookings").update({ accommodation }).eq("id", booking.id);

  const full = p.paymentType === "full";
  const amount = full ? Number(prepared.total_price) : Math.round(Number(prepared.total_price) * 40) / 100;
  const session = await createSession({
    booking: prepared, tour: booking.tours, amount, kind: "booking", base: returnBase(p.returnBaseUrl),
    label: full ? "Full payment" : "40% downpayment",
  });
  await supabase.from("bookings")
    .update({ paymongo_checkout_id: session.id, paymongo_checkout_url: session.url })
    .eq("id", booking.id);
  return { checkoutUrl: session.url };
}

async function verifyCheckout(userId: string, p: any) {
  const booking = await loadOwnBooking(p.bookingId, userId);
  const result: Record<string, unknown> = {};
  if (booking.paymongo_checkout_id) result.booking = await processSession(booking.paymongo_checkout_id);
  if (booking.paymongo_balance_checkout_id && !booking.balance_settled) {
    result.balance = await processSession(booking.paymongo_balance_checkout_id);
  }
  return result;
}

// Close a checkout at PayMongo so it can't be paid any more. Returns the
// payment status found first ("unpaid" when it was safe to close).
async function closeCheckout(sessionId: string) {
  const result = await processSession(sessionId);
  if (result.status !== "unpaid") return result; // paid in the meantime: booking confirmed
  await paymongo("POST", `/checkout_sessions/${encodeURIComponent(sessionId)}/expire`).catch(async (err) => {
    // Already expired is fine; anything else means it may still be payable.
    const check = await paymongo("GET", `/checkout_sessions/${encodeURIComponent(sessionId)}`);
    if (check?.data?.attributes?.status !== "expired") throw err;
  });
  return result;
}

async function emailWaitlist(tourId: unknown) {
  await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "waitlist-openings", tourId }),
  }).catch(() => {});
}

async function cancelCheckout(userId: string, p: any) {
  const booking = await loadOwnBooking(p.bookingId, userId);
  if (booking.payment_status !== "Awaiting Payment") return { status: booking.payment_status };

  if (booking.paymongo_checkout_id) {
    const result = await closeCheckout(booking.paymongo_checkout_id);
    if (result.status !== "unpaid") return result; // they had paid after all
  }
  await supabase.rpc("release_payment_hold", {
    p_booking_id: booking.id,
    p_reason: "Online payment was cancelled.",
    p_actor_name: "Joiner (cancelled checkout)",
  });
  await emailWaitlist(booking.tour_id);
  return { status: "cancelled" };
}

async function expireHolds() {
  const { data: lapsed } = await supabase
    .from("bookings")
    .select("id, tour_id, paymongo_checkout_id")
    .eq("payment_status", "Awaiting Payment")
    .lt("hold_expires_at", new Date().toISOString());

  let released = 0, confirmed = 0, retry = 0;
  const tours = new Set<unknown>();
  for (const b of (lapsed ?? []) as any[]) {
    try {
      if (b.paymongo_checkout_id) {
        const result = await closeCheckout(b.paymongo_checkout_id);
        if (result.status !== "unpaid") { confirmed++; continue; }
      }
      const { data: ok } = await supabase.rpc("release_payment_hold", {
        p_booking_id: b.id,
        p_reason: "Online payment was not completed in time.",
      });
      if (ok) { released++; tours.add(b.tour_id); }
    } catch (err) {
      retry++;
      console.warn("payments[expire-holds]: will retry", b.id, (err as Error)?.message);
    }
  }
  for (const t of tours) await emailWaitlist(t);
  if (released || confirmed || retry) console.log("payments[expire-holds]:", { released, confirmed, retry });
  return { released, confirmed, retry };
}

// ───────────── Exclusive tours: 50% downpayment, then the balance ─────────────
const EXCLUSIVE_DOWNPAYMENT_RATE = 0.5;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function loadOwnRequest(requestId: unknown, userId: string) {
  if (requestId == null || requestId === "") throw new HttpError(400, "Missing request.");
  const { data: request, error } = await supabase.from("exclusive_requests").select("*").eq("id", requestId).maybeSingle();
  if (error) {
    console.error("payments: couldn't load exclusive request", { requestId, error });
    throw new HttpError(500, `Couldn't load your request (${error.message}). Please try again, or contact us.`);
  }
  if (!request) throw new HttpError(404, "Request not found.");
  if (request.user_id !== userId) throw new HttpError(403, "This request belongs to another account.");
  return request;
}

// The package price the agency sent, and half of it.
function exclusiveAmounts(request: any) {
  const price = Number(request.package_details?.price);
  if (request.request_type !== "exclusive" || request.status !== "Approved" || !request.package_sent_at || !(price > 0)) {
    throw new HttpError(409, "This request has no package price to pay yet. You'll be notified once the agency sends it.");
  }
  return { price, downpayment: round2(price * EXCLUSIVE_DOWNPAYMENT_RATE) };
}

// A PayMongo checkout for part of an exclusive tour's package price.
async function exclusiveCheckout(request: any, p: any, part: "downpayment" | "balance", amount: number, price: number) {
  const base = returnBase(p.returnBaseUrl);
  const reference = `EX-${String(request.id).slice(0, 8).toUpperCase()}${part === "balance" ? "-BAL" : ""}`;
  const label = part === "balance" ? "remaining balance" : "50% downpayment";
  const session = await paymongo("POST", "/checkout_sessions", {
    data: {
      attributes: {
        line_items: [{
          name: `Exclusive tour: ${request.package_details?.destination || request.destination} · ${label}`,
          amount: centavos(amount),
          currency: "PHP",
          quantity: 1,
        }],
        payment_method_types: PAYMENT_METHODS,
        description: `Bandang IBAYO exclusive tour ${reference}. ${label[0].toUpperCase()}${label.slice(1)} of the ₱${price.toLocaleString("en-PH", { minimumFractionDigits: 2 })} package. Payments are non-refundable.`,
        reference_number: reference,
        metadata: { request_id: String(request.id), kind: part === "balance" ? "exclusive_balance" : "exclusive" },
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        success_url: `${base}/dashboard?exclusive=success&request=${request.id}`,
        cancel_url: `${base}/dashboard?exclusive=cancelled&request=${request.id}`,
      },
    },
  });
  return { id: session?.data?.id as string, url: session?.data?.attributes?.checkout_url as string };
}

// The rest of the package price, once the downpayment is in.
async function payExclusiveBalance(request: any, p: any) {
  if (request.payment_status !== "Paid") throw new HttpError(409, "Please pay the 50% downpayment first.");
  if (request.balance_settled) return { alreadyPaid: true };
  const { price } = exclusiveAmounts(request);
  const balance = round2(Math.max(0, price - Number(request.amount_paid || 0)));
  if (!(balance > 0)) return { alreadyPaid: true };

  if (request.balance_paymongo_checkout_id) {
    const result = await processSession(request.balance_paymongo_checkout_id);
    if (result.status === "confirmed" || result.status === "already") return { alreadyPaid: true };
    if (request.balance_paymongo_checkout_url && Number(request.balance_amount) === balance) {
      return { checkoutUrl: request.balance_paymongo_checkout_url };
    }
  }

  const { id, url } = await exclusiveCheckout(request, p, "balance", balance, price);
  await supabase.from("exclusive_requests")
    .update({ balance_paymongo_checkout_id: id, balance_paymongo_checkout_url: url, balance_amount: balance })
    .eq("id", request.id);
  return { checkoutUrl: url };
}

async function payExclusive(userId: string, p: any) {
  const request = await loadOwnRequest(p.requestId, userId);
  if (p.part === "balance") return await payExclusiveBalance(request, p);
  if (request.payment_status === "Paid") return { alreadyPaid: true };
  const { price, downpayment } = exclusiveAmounts(request);
  // Exclusive packages always offer at least one accommodation to choose from.
  const accommodation = chosenAccommodation(request.package_details?.accommodation_options, p.accommodation);
  if (accommodation && accommodation !== request.accommodation) {
    await supabase.from("exclusive_requests").update({ accommodation }).eq("id", request.id);
  }

  // An earlier checkout may already be paid, or still usable for the same amount.
  if (request.paymongo_checkout_id) {
    const result = await processSession(request.paymongo_checkout_id);
    if (result.status === "confirmed" || result.status === "already") return { alreadyPaid: true };
    if (request.paymongo_checkout_url && Number(request.downpayment_amount) === downpayment) {
      return { checkoutUrl: request.paymongo_checkout_url };
    }
  }

  const { id, url } = await exclusiveCheckout(request, p, "downpayment", downpayment, price);
  await supabase.from("exclusive_requests")
    .update({ paymongo_checkout_id: id, paymongo_checkout_url: url, downpayment_amount: downpayment })
    .eq("id", request.id);
  return { checkoutUrl: url };
}

async function verifyExclusive(userId: string, p: any) {
  const request = await loadOwnRequest(p.requestId, userId);
  if (request.payment_status !== "Paid") {
    if (!request.paymongo_checkout_id) return { status: "unpaid" };
    return await processSession(request.paymongo_checkout_id);
  }
  if (request.balance_settled) return { status: "already", kind: "exclusive_balance" };
  if (!request.balance_paymongo_checkout_id) return { status: "already" };
  return await processSession(request.balance_paymongo_checkout_id);
}

// Tells the joiner (notification + email) and the admins about an exclusive tour payment.
async function announceExclusive(updated: any, joiner: { title: string; message: string; subject: string; email: string }, admin: { title: string; message: string }) {
  const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
  const rows = [
    { user_id: updated.user_id, type: "exclusive_request", title: joiner.title, message: joiner.message },
    ...(admins ?? []).map((a: any) => ({ user_id: a.id, type: "exclusive_request", title: admin.title, message: admin.message })),
  ].filter((r) => r.user_id);
  if (rows.length) await supabase.from("notifications").insert(rows);
  if (updated.user_id) {
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "custom", userId: updated.user_id, subject: joiner.subject, message: joiner.email }),
    }).catch((err) => console.error("payments: exclusive email failed", err));
  }
}

// PayMongo says the balance is paid: record it once and tell everyone.
async function recordExclusiveBalance(requestId: string, amount: number, paymentId: string) {
  const { data: request, error: loadError } = await supabase.from("exclusive_requests")
    .select("amount_paid").eq("id", requestId).maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!request) return { status: "not_ours" };
  const { data: updated, error } = await supabase.from("exclusive_requests")
    .update({
      balance_settled: true,
      balance_paid_at: new Date().toISOString(),
      balance_paymongo_payment_id: paymentId,
      amount_paid: round2(Number(request.amount_paid || 0) + amount),
    })
    .eq("id", requestId)
    .eq("balance_settled", false)
    .select("id, user_id, destination, full_name")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) return { status: "already", kind: "exclusive_balance" };

  const peso = `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  await announceExclusive(updated, {
    title: "Exclusive Tour Fully Paid ✅",
    message: `We received your ${peso} balance for your exclusive tour to ${updated.destination}. Your tour is fully paid. See you on the trip!`,
    subject: `Your exclusive tour to ${updated.destination} is fully paid`,
    email: `We received your ${peso} remaining balance. Your exclusive tour to ${updated.destination} is now fully paid.\n\nOur team will contact you about the final trip details. You can see your package anytime under Exclusive Tours in your Bandang IBAYO account.`,
  }, {
    title: "Exclusive Tour Balance Paid",
    message: `${updated.full_name || "A joiner"} paid the ${peso} remaining balance for their exclusive tour to ${updated.destination}. It's fully paid.`,
  });
  return { status: "confirmed", kind: "exclusive_balance" };
}

// PayMongo says it's paid: record it once, then tell the joiner and the agency.
async function recordExclusivePayment(requestId: string, amount: number, paymentId: string) {
  const { data: updated, error } = await supabase.from("exclusive_requests")
    .update({ payment_status: "Paid", amount_paid: amount, paid_at: new Date().toISOString(), paymongo_payment_id: paymentId })
    .eq("id", requestId)
    .neq("payment_status", "Paid")
    .select("id, user_id, destination, full_name")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) return { status: "already", kind: "exclusive" };

  const peso = `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  await announceExclusive(updated, {
    title: "Exclusive Tour Confirmed 🎉",
    message: `We received your ${peso} downpayment for your exclusive tour to ${updated.destination}. Your tour is confirmed! You can pay the remaining balance online anytime under Exclusive Tours.`,
    subject: `Your exclusive tour to ${updated.destination} is confirmed`,
    email: `We received your ${peso} downpayment. Your exclusive tour to ${updated.destination} is confirmed!\n\nYou can pay the remaining balance online anytime under Exclusive Tours in your Bandang IBAYO account, or settle it with our team before the trip.`,
  }, {
    title: "Exclusive Tour Downpayment Paid",
    message: `${updated.full_name || "A joiner"} paid the ${peso} downpayment for their exclusive tour to ${updated.destination}.`,
  });
  return { status: "confirmed", kind: "exclusive" };
}

// ───────────── Request handler ─────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.headers.has("paymongo-signature")) return await handleWebhook(req);

    const payload = await req.json().catch(() => ({}));
    if (payload.action === "expire-holds") return reply(await expireHolds());

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return reply({ error: "Please log in again." }, 401);
    const userId = userData.user.id;

    switch (payload.action) {
      case "create-checkout": return reply(await createCheckout(userId, payload));
      case "pay-balance": return reply(await payBalance(userId, payload));
      case "verify-checkout": return reply(await verifyCheckout(userId, payload));
      case "cancel-checkout": return reply(await cancelCheckout(userId, payload));
      case "pay-held": return reply(await payHeld(userId, payload));
      case "pay-exclusive": return reply(await payExclusive(userId, payload));
      case "verify-exclusive": return reply(await verifyExclusive(userId, payload));
      default: return reply({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    if (err instanceof HttpError) return reply({ error: err.message }, err.status);
    console.error("payments: error", err);
    return reply({ error: String((err as Error)?.message || err) }, 500);
  }
});
