import { supabase } from './supabaseClient';
import { findRoute } from './routeApi';
import { placeOnRoute, departureFromItinerary, addMinutesToTime } from './geo';

// ─────────────────────────────────────────────
// Where each pickup point is, for a tour saved from a tour package (requested
// and exclusive tours), the same way Tour Management works it out:
//   • places ticked from the map's list (gas stations, malls…) or pinned on the
//     map are saved as Pickup Spots, so they keep their location;
//   • the stops are put in the order the van reaches them on the route;
//   • each stop gets its driving minutes from the start and, with a departure
//     time ("Van leaves at", else the first time in the itinerary), its ETA.
//
//   locateStops({ spots, routePlaces, names, route, departure, itinerary })
//     → { [lowercase name]: { lat, lng, route_order, minutes_from_start, scheduled_time? } }
//   spots: saved Pickup Spots; routePlaces: places picked from the map this time
//   names: the pickup point names; route: the van's route ({ start, end, coords })
//   departure: "22:00" (time input) or ''; itinerary: the saved itinerary text
// ─────────────────────────────────────────────

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export const locateStops = async ({ spots = [], routePlaces = [], names = [], route = null, departure = '', itinerary = '' }) => {
  let allSpots = spots;
  const newSpots = routePlaces.filter((pl) => names.some((n) => same(n, pl.name)) && !allSpots.some((sp) => same(sp.name, pl.name)));
  if (newSpots.length) {
    const { error } = await supabase.from('pickup_spots')
      .insert(newSpots.map((pl) => ({ name: pl.name, address: pl.address || null, lat: pl.lat, lng: pl.lng })));
    if (error) console.warn('Pickup spots not saved:', error.message);
    // Their locations are known from the map either way.
    allSpots = [...allSpots, ...newSpots];
  }
  const spotOf = (n) => allSpots.find((sp) => same(sp.name, n) && Number.isFinite(Number(sp.lat)) && sp.lat !== null);
  const located = names.map((name) => ({ name, spot: spotOf(name) })).filter((x) => x.spot);
  if (route?.coords) {
    located.sort((a, b) => placeOnRoute(a.spot, route.coords).alongKm - placeOnRoute(b.spot, route.coords).alongKm);
  }
  let minutes = [];
  if (route?.start && route?.end && located.length) {
    const res = await findRoute([route.start, ...located.map((x) => x.spot), route.end]);
    if (res.ok) {
      let total = 0;
      minutes = located.map((_, i) => { total += res.data.legs[i]?.duration_min || 0; return total; });
    }
  }
  const leaves = (departure && addMinutesToTime(departure, 0)) || departureFromItinerary(itinerary);
  const info = {};
  located.forEach((x, i) => {
    info[x.name.trim().toLowerCase()] = {
      lat: x.spot.lat, lng: x.spot.lng, route_order: i + 1, minutes_from_start: minutes[i] ?? null,
      ...(leaves && minutes[i] != null ? { scheduled_time: addMinutesToTime(leaves, minutes[i]) } : {}),
    };
  });
  return info;
};
