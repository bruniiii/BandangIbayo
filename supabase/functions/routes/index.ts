// supabase/functions/routes/index.ts
//
// Maps for pickup points and tracking (OpenRouteService + OpenStreetMap, free). Admins only.
//   - { action: "geocode", text }            → { places: [{ name, label, lat, lng }] }
//       Places in the Philippines matching the text (for the starting point,
//       the destination and saved pickup spots).
//   - { action: "route", points: [[lng, lat], …] }
//       → { coords: [[lng, lat], …], distance_km, duration_min, legs: [{ distance_km, duration_min }] }
//       The driving road through the points, in order (legs: point to point).
//       coords keeps the road's shape (bends included) in at most ~400 points.
//   - { action: "road-line", points: [[lng, lat], …] }      (start and destination)
//       → { line: [[lng, lat], …] }  the road within ~60 m of its real shape (≤ 500 points),
//       for the website to ask OpenStreetMap for the places along it itself.
//   - { action: "places-along", points: [[lng, lat], …] }   (start and destination)
//       → { places: [{ name, kind, lat, lng, city, alongKm, offKm }] }
//       Possible pickup points within 300 m of the road, from OpenStreetMap:
//       gas stations, malls, bus terminals, convenience stores, fast food.
//       The road is followed closely (winding mountain roads included), and
//       alongKm (km from the start) and offKm (km off the road) are measured
//       on the full road.
//
// The OpenRouteService key stays here, never in the website:
//   supabase secrets set ORS_API_KEY=<your key from account.heigit.org>
// Deploy:  supabase functions deploy routes --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORS_API_KEY = Deno.env.get("ORS_API_KEY") ?? "";
// api.openrouteservice.org is being replaced by api.heigit.org: when it stops
// working, point this at the new address (no code change needed):
//   supabase secrets set ORS_BASE_URL=<the new address>
const ORS = (Deno.env.get("ORS_BASE_URL") ?? "https://api.openrouteservice.org").replace(/\/+$/, "");
// OpenStreetMap places (Overpass, free). Tried in order: when one is busy, the next.
//   supabase secrets set OVERPASS_URL=<address>   (tried first)
const OVERPASS_SERVERS = [
  Deno.env.get("OVERPASS_URL"),
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
].filter(Boolean) as string[];

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
type Pt = number[]; // [lng, lat]

// ── Road shape ──
// Flat x/y in km around a latitude (accurate enough along one road).
const projector = (lat0: number) => {
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  return ([lng, lat]: Pt) => [lng * kx, lat * 110.57];
};

// Douglas–Peucker: drops points that are within tolKm of the road's line,
// so straight stretches use few points and bends keep theirs.
const simplifyTol = (coords: Pt[], tolKm: number) => {
  if (coords.length <= 2) return coords;
  const xy = projector(coords[Math.floor(coords.length / 2)][1]);
  const p = coords.map(xy);
  const keep = new Uint8Array(coords.length);
  keep[0] = 1; keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = p[a]; const [bx, by] = p[b];
    const dx = bx - ax; const dy = by - ay; const len2 = dx * dx + dy * dy;
    let worst = -1; let idx = -1;
    for (let i = a + 1; i < b; i += 1) {
      const t = len2 ? Math.max(0, Math.min(1, ((p[i][0] - ax) * dx + (p[i][1] - ay) * dy) / len2)) : 0;
      const d = Math.hypot(p[i][0] - (ax + t * dx), p[i][1] - (ay + t * dy));
      if (d > worst) { worst = d; idx = i; }
    }
    if (worst > tolKm && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return coords.filter((_, i) => keep[i]);
};

// At most max points, as close to the real road as that allows.
const evenly = (coords: Pt[], max: number) => {
  if (coords.length <= max) return coords;
  const step = (coords.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * step)]);
};
const simplify = (coords: Pt[], max: number, startTolKm = 0.01) => {
  let tol = startTolKm;
  let prev = coords;
  let out = simplifyTol(coords, tol);
  while (out.length > max) { prev = out; tol *= 1.6; out = simplifyTol(coords, tol); }
  // Very winding roads can drop from "too many" to "almost none" in one step:
  // then keep the last detailed shape, spread evenly to max points.
  if (out.length < max / 4 && prev.length > max) out = evenly(prev, max);
  return out.map(([lng, lat]) => [round(lng, 5), round(lat, 5)]);
};

// How far a place is off the road and how far along it (km), on the full road.
const placeOnRoad = (lat: number, lng: number, coords: Pt[]) => {
  const xy = projector(lat);
  const [px, py] = xy([lng, lat]);
  let best = { offKm: Infinity, alongKm: 0 };
  let along = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const [ax, ay] = xy(coords[i]); const [bx, by] = xy(coords[i + 1]);
    const dx = bx - ax; const dy = by - ay; const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const off = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    const seg = Math.sqrt(len2);
    if (off < best.offKm) best = { offKm: off, alongKm: along + t * seg };
    along += seg;
  }
  return best;
};

// ── OpenRouteService ──
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

const checkPoints = (points: any) => {
  const ok = Array.isArray(points) && points.length >= 2 && points.length <= 50 &&
    points.every((pt: any) => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
  if (!ok) throw new HttpError(400, "A route needs 2 to 50 places on the map.");
  return points as Pt[];
};

// The driving road through the points, with its full shape.
async function drive(points: Pt[]) {
  const res = await fetch(`${ORS}/v2/directions/driving-car/geojson`, {
    method: "POST",
    headers: { Authorization: ORS_API_KEY, "Content-Type": "application/json", Accept: "application/geo+json" },
    // radiuses -1: a place a bit away from a road still snaps to the nearest one.
    body: JSON.stringify({ coordinates: points, instructions: false, radiuses: points.map(() => -1) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(body?.error?.message ?? "");
    const code = Number(body?.error?.code);
    // No road reaches it: usually an island, or a place across the water.
    if (code === 2009 || code === 2010 || /could not be found|not.*routable|unreachable/i.test(msg)) {
      throw new HttpError(422, "No driving road reaches one of these places. For an island or a boat trip (e.g. Calaguas, Anawangin), choose the port or jump-off as the destination.");
    }
    throw new HttpError(502, msg || `No driving route found (${res.status}).`);
  }
  const feature = body.features?.[0];
  if (!feature) throw new HttpError(502, "No driving route found between those places.");
  return feature;
}

async function route(p: any) {
  const feature = await drive(checkPoints(p.points));
  const summary = feature.properties?.summary ?? {};
  const legs = (feature.properties?.segments ?? []).map((s: any) => ({
    distance_km: round((s.distance ?? 0) / 1000),
    duration_min: Math.round((s.duration ?? 0) / 60),
  }));
  return {
    // Bends kept: winding mountain roads (Halsema, Kennon) still look and measure right.
    coords: simplify(feature.geometry?.coordinates ?? [], 400),
    distance_km: round((summary.distance ?? 0) / 1000),
    duration_min: Math.round((summary.duration ?? 0) / 60),
    legs,
  };
}

// ── OpenStreetMap places along the road ──
// What kind of pickup point an OpenStreetMap place is.
const kindOf = (t: Record<string, string>) =>
  t.amenity === "fuel" ? "gas" :
  t.shop === "mall" || t.shop === "department_store" ? "mall" :
  t.amenity === "bus_station" ? "terminal" :
  t.shop === "convenience" ? "store" :
  t.amenity === "fast_food" ? "food" : "other";

// Asks the OpenStreetMap servers in turn: a busy one ("429 Too Many
// Requests", a timeout) gets a short pause and the next one is tried. Gives up
// after about 100 seconds.
async function overpass(query: string) {
  const deadline = Date.now() + 100000;
  let last = "";
  for (const url of OVERPASS_SERVERS) {
    if (Date.now() > deadline) break;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "BandangIBAYO-tours/1.0" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(Math.max(5000, Math.min(30000, deadline - Date.now()))),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && Array.isArray(body.elements)) return body.elements;
      }
      last = `${res.status}`;
    } catch (err) {
      last = String((err as Error)?.name === "TimeoutError" ? "timeout" : (err as Error)?.message || err);
    }
    await new Promise((r) => setTimeout(r, 1500)); // a moment before the next server
  }
  throw new HttpError(503, `The map's place list is busy right now (${last}). Please try again in a minute.`);
}

async function placesAlong(p: any) {
  // The full road (from the start and destination), or the shape the form already has.
  let road: Pt[] = [];
  if (Array.isArray(p.points) && p.points.length >= 2) {
    road = (await drive(checkPoints(p.points))).geometry?.coordinates ?? [];
  } else if (Array.isArray(p.coords) && p.coords.length >= 2) {
    road = p.coords;
  }
  if (road.length < 2) throw new HttpError(400, "Find the route first.");

  // The road for the query: within ~60 m of the real one (bends included), at most 500 points.
  const line = simplify(road, 500, 0.06).map(([lng, lat]) => `${lat},${lng}`).join(",");
  // One light question for every kind at once (the servers limit how much each
  // site may ask): named amenity/shop places of these kinds within 300 m.
  const query = `[out:json][timeout:60];
(
  nwr(around:300,${line})["amenity"~"^(fuel|bus_station|fast_food)$"]["name"];
  nwr(around:300,${line})["shop"~"^(mall|department_store|convenience)$"]["name"];
);
out center tags 2000;`;
  const BRANDS = {
    store: /7-?\s?eleven|alfamart|ministop|uncle john/i,
    food: /mcdonald|jollibee|chowking|kfc|mang inasal|greenwich/i,
  } as Record<string, RegExp>;
  const elements = (await overpass(query)).filter((e: any) => {
    const k = kindOf(e.tags ?? {});
    // Only the well-known chains for stores and fast food (they're easy to find).
    return k === "other" ? false : BRANDS[k] ? BRANDS[k].test(String(e.tags?.name ?? "")) : true;
  });

  const places = elements.map((e: any) => {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (!t.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const at = placeOnRoad(lat, lng, road);
    return {
      name: String(t.name).trim(),
      kind: kindOf(t),
      lat, lng,
      city: t["addr:city"] || t["addr:municipality"] || t["addr:town"] || "",
      alongKm: round(at.alongKm, 2),
      offKm: round(at.offKm, 3),
    };
  }).filter((x: any) => x && x.offKm <= 0.35);
  return { places };
}

// The road from the start to the destination, close to its real shape
// (within ~60 m, at most 500 points). The website asks OpenStreetMap for the
// places along it straight from the browser (the free servers block busy
// shared addresses like this server's; a person's own connection is fine).
async function roadLine(p: any) {
  const road = (await drive(checkPoints(p.points))).geometry?.coordinates ?? [];
  if (road.length < 2) throw new HttpError(502, "No driving route found between those places.");
  return { line: simplify(road, 500, 0.06) };
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
      case "road-line": return reply(await roadLine(payload));
      default: return reply({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    if (err instanceof HttpError) return reply({ error: err.message }, err.status);
    return reply({ error: String((err as Error)?.message || err) }, 500);
  }
});
