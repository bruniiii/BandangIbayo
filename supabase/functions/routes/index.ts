// supabase/functions/routes/index.ts
//
// Maps for pickup points and tracking (OpenRouteService, free). Admins only.
//   - { action: "geocode", text }            → { places: [{ name, label, lat, lng }] }
//       Places in the Philippines matching the text (for the starting point,
//       the destination and saved pickup spots).
//   - { action: "route", points: [[lng, lat], …] }
//       → { coords: [[lng, lat], …], distance_km, duration_min, legs: [{ distance_km, duration_min }] }
//       The driving road through the points, in order (legs: point to point).
//   - { action: "places-along", coords: [[lng, lat], …] }
//       → { places: [{ name, kind, lat, lng, city }] }
//       Possible pickup points within 300 m of the road, from OpenStreetMap
//       (free, no key): gas stations, malls, bus terminals, fast food.
//
// The OpenRouteService key stays here, never in the website:
//   supabase secrets set ORS_API_KEY=<your key from openrouteservice.org>
// Deploy:  supabase functions deploy routes --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORS_API_KEY = Deno.env.get("ORS_API_KEY") ?? "";
// api.openrouteservice.org is being replaced by api.heigit.org: when it stops
// working, point this at the new address (no code change needed):
//   supabase secrets set ORS_BASE_URL=<the new address>
const ORS = (Deno.env.get("ORS_BASE_URL") ?? "https://api.openrouteservice.org").replace(/\/+$/, "");

// OpenStreetMap places (Overpass, free). Another server can be set with
//   supabase secrets set OVERPASS_URL=<address>
const OVERPASS = Deno.env.get("OVERPASS_URL") ?? "https://overpass-api.de/api/interpreter";

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

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// Keeps the road light for the map: at most ~400 points, always the first and last.
const thin = (coords: number[][], max = 400) => {
  if (coords.length <= max) return coords.map(([lng, lat]) => [round(lng, 5), round(lat, 5)]);
  const step = (coords.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * step)]).map(([lng, lat]) => [round(lng, 5), round(lat, 5)]);
};

async function geocode(p: any) {
  const text = String(p.text ?? "").trim();
  if (text.length < 2) throw new HttpError(400, "Type at least 2 letters of the place.");
  const url = `${ORS}/geocode/search?api_key=${encodeURIComponent(ORS_API_KEY)}&text=${encodeURIComponent(text)}&boundary.country=PH&size=8`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, body?.error?.message || body?.error || `Place search failed (${res.status}).`);
  const places = (body.features ?? []).map((f: any) => ({
    name: f.properties?.name ?? f.properties?.label ?? "",
    label: f.properties?.label ?? f.properties?.name ?? "",
    lng: f.geometry?.coordinates?.[0],
    lat: f.geometry?.coordinates?.[1],
  })).filter((x: any) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
  return { places };
}

async function route(p: any) {
  const points = Array.isArray(p.points) ? p.points : [];
  const ok = points.length >= 2 && points.length <= 50 &&
    points.every((pt: any) => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
  if (!ok) throw new HttpError(400, "A route needs 2 to 50 places on the map.");
  const res = await fetch(`${ORS}/v2/directions/driving-car/geojson`, {
    method: "POST",
    headers: { Authorization: ORS_API_KEY, "Content-Type": "application/json", Accept: "application/geo+json" },
    // radiuses -1: a place a bit away from a road still snaps to the nearest one.
    body: JSON.stringify({ coordinates: points, instructions: false, radiuses: points.map(() => -1) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, body?.error?.message || `No driving route found (${res.status}).`);
  const feature = body.features?.[0];
  if (!feature) throw new HttpError(502, "No driving route found between those places.");
  const summary = feature.properties?.summary ?? {};
  const legs = (feature.properties?.segments ?? []).map((s: any) => ({
    distance_km: round((s.distance ?? 0) / 1000),
    duration_min: Math.round((s.duration ?? 0) / 60),
  }));
  return {
    coords: thin(feature.geometry?.coordinates ?? []),
    distance_km: round((summary.distance ?? 0) / 1000),
    duration_min: Math.round((summary.duration ?? 0) / 60),
    legs,
  };
}

// What kind of pickup point an OpenStreetMap place is.
const kindOf = (t: Record<string, string>) =>
  t.amenity === "fuel" ? "gas" :
  t.shop === "mall" || t.shop === "department_store" ? "mall" :
  t.amenity === "bus_station" ? "terminal" :
  t.amenity === "fast_food" ? "food" : "other";

async function placesAlong(p: any) {
  const coords = Array.isArray(p.coords) ? p.coords : [];
  if (coords.length < 2) throw new HttpError(400, "Find the route first.");
  // The road as "lat,lng,lat,lng,…" (at most ~250 points keeps the query small).
  const step = Math.max(1, Math.ceil(coords.length / 250));
  const line = coords.filter((_: unknown, i: number) => i % step === 0 || i === coords.length - 1)
    .map(([lng, lat]: number[]) => `${round(lat, 5)},${round(lng, 5)}`).join(",");
  const around = `(around:300,${line})`;
  const query = `[out:json][timeout:40];(
    nwr${around}["amenity"="fuel"]["name"];
    nwr${around}["shop"="mall"]["name"];
    nwr${around}["shop"="department_store"]["name"];
    nwr${around}["amenity"="bus_station"]["name"];
    nwr${around}["amenity"="fast_food"]["name"~"McDonald|Jollibee|Chowking|KFC|Mang Inasal|Greenwich",i];
  );out center tags 600;`;
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new HttpError(502, `The map's place list is busy (${res.status}). Please try again in a minute.`);
  const body = await res.json().catch(() => ({}));
  const places = (body.elements ?? []).map((e: any) => {
    const t = e.tags ?? {};
    return {
      name: String(t.name ?? "").trim(),
      kind: kindOf(t),
      lat: e.lat ?? e.center?.lat,
      lng: e.lon ?? e.center?.lon,
      city: t["addr:city"] || t["addr:municipality"] || t["addr:town"] || "",
    };
  }).filter((x: any) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lng));
  return { places };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!ORS_API_KEY) throw new HttpError(500, "Maps aren't set up yet: the ORS_API_KEY secret is missing.");
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return reply({ error: "Please log in again." }, 401);
    const { data: me } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (me?.role !== "admin") return reply({ error: "Only admins can look up routes." }, 403);

    const payload = await req.json().catch(() => ({}));
    switch (payload.action) {
      case "geocode": return reply(await geocode(payload));
      case "route": return reply(await route(payload));
      case "places-along": return reply(await placesAlong(payload));
      default: return reply({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    if (err instanceof HttpError) return reply({ error: err.message }, err.status);
    return reply({ error: String((err as Error)?.message || err) }, 500);
  }
});
