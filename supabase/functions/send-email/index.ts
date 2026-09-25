// supabase/functions/send-email/index.ts
//
// Deploy:   supabase functions deploy send-email
// Secret:   supabase secrets set RESEND_API_KEY=re_xxxxxxxx
//
// ── IMPORTANT: sandbox sender restriction ──────────────────────────────
// FROM_EMAIL below is set to Resend's shared testing address,
// onboarding@resend.dev. Resend only allows that address to deliver to
// the email you signed up to Resend with — sending to ANY other
// recipient (e.g. a real joiner's email) will fail with a 403 from
// Resend, even though this function and your secret are both fine.
//
// To actually email real joiners, verify your own domain in Resend
// (Domains tab → Add Domain → add the DNS records they give you), then
// change FROM_EMAIL below to an address on that domain, e.g.
// "Bandang IBAYO <bookings@yourdomain.com>", and redeploy.
// ─────────────────────────────────────────────────────────────────────
//
// Called from the client via supabase.functions.invoke('send-email', { body: {...} })
// This is a Deno edge function — it runs on Supabase's infrastructure, not in the browser,
// so the Resend API key never reaches client code.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Sandbox sender — see note above before wiring this to real users.
const FROM_EMAIL = "onboarding@resend.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, html } = await req.json();
    const recipient = typeof to === "string" ? to.trim() : to;

    if (!recipient || !subject || !html) {
      console.error("send-email: missing field(s)", { to: recipient, subject: !!subject, html: !!html });
      return new Response(JSON.stringify({ error: "Missing to/subject/html" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      console.error("send-email: RESEND_API_KEY is not set");
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: recipient, subject, html }),
    });

    const data = await res.json();

    // Always logged to Supabase's Function Logs (dashboard → Edge Functions →
    // send-email → Logs), regardless of success, so failures are visible
    // without needing to add console logging on the client side.
    console.log("send-email: Resend response", { status: res.status, to: recipient, data });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-email: unexpected error", err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});