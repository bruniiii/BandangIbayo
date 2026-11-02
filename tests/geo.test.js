import { describe, it, expect } from 'vitest';
import { placeOnRoute, addMinutesToTime, departureFromItinerary, to24h, liveEtas, sortStops, distanceKm, stopMinutes } from '../src/geo';

// A road from Manila going north (lng, lat).
const road = [[120.98, 14.53], [121.0, 14.6], [121.03, 14.65], [120.9, 15.0], [120.6, 16.4]];

describe('placeOnRoute', () => {
  it('measures how far along and how far off the road a place is', () => {
    const start = placeOnRoute({ lat: 14.53, lng: 120.98 }, road);
    expect(start.alongKm).toBeCloseTo(0, 1);
    expect(start.offKm).toBeLessThan(0.05);
    const trinoma = placeOnRoute({ lat: 14.6533, lng: 121.0334 }, road);
    expect(trinoma.alongKm).toBeGreaterThan(10);
    expect(trinoma.offKm).toBeLessThan(0.6);
  });
  it('orders places from the start to the destination', () => {
    const a = placeOnRoute({ lat: 14.6, lng: 121.0 }, road).alongKm;
    const b = placeOnRoute({ lat: 15.0, lng: 120.9 }, road).alongKm;
    expect(a).toBeLessThan(b);
  });
  it('handles a missing road', () => {
    expect(placeOnRoute({ lat: 14, lng: 121 }, null).offKm).toBe(Infinity);
  });
});

describe('times', () => {
  it('adds minutes across noon and midnight', () => {
    expect(addMinutesToTime('9:00 PM', 25)).toBe('9:25 PM');
    expect(addMinutesToTime('11:50 PM', 20)).toBe('12:10 AM');
    expect(addMinutesToTime('21:00', 0)).toBe('9:00 PM');
    expect(addMinutesToTime('nonsense', 5)).toBe('');
  });
  it('turns a shown time back into a time-box value', () => {
    expect(to24h('10:00 PM')).toBe('22:00');
    expect(to24h('12:30 AM')).toBe('00:30');
    expect(to24h('12:00nn')).toBe('12:00');
    expect(to24h('')).toBe('');
  });
  it('reads the departure from the earliest day of the itinerary', () => {
    expect(departureFromItinerary('Day 0:\n09:00pm - Assembly\n10:00pm - ETD\nDay 1:\n06:00am - ETA')).toBe('9:00 PM');
    expect(departureFromItinerary('Day 1:\n04:00 AM – Hike\nDay 0:\n8:30 PM meet')).toBe('8:30 PM');
    expect(departureFromItinerary('Day 1:\n03:00am - Assembly')).toBe('3:00 AM');
    expect(departureFromItinerary('no times here')).toBe('');
  });
});

describe('liveEtas', () => {
  const now = Date.parse('2026-11-02T13:00:00Z'); // 9:00 PM in Manila
  const stops = [
    { id: 1, status: 'ARRIVED', lat: 14.5, lng: 121, minutes_from_start: 0 },
    { id: 2, status: 'CURRENTLY HERE', lat: 14.6, lng: 121, minutes_from_start: 30 },
    { id: 3, status: 'DEPARTURE', lat: 14.7, lng: 121, minutes_from_start: 55 },
  ];
  it('gives the next stops a live time from the van', () => {
    const live = liveEtas(stops, { lat: 14.55, lng: 121, speed_kmh: 0, updated_at: new Date(now - 60000).toISOString() }, now);
    expect(live[1]).toBeUndefined();
    expect(live[2].minutes).toBeGreaterThan(5);
    expect(live[3].minutes).toBe(live[2].minutes + 25);
    expect(live[2].time).toMatch(/^9:\d\d PM$/);
  });
  it('gives nothing when the van location is old', () => {
    expect(liveEtas(stops, { lat: 14.55, lng: 121, updated_at: new Date(now - 20 * 60000).toISOString() }, now)).toEqual({});
  });
});

describe('sortStops / distanceKm', () => {
  it('puts stops in route order, unplaced ones last', () => {
    const sorted = sortStops([{ id: 'b', route_order: 2 }, { id: 'x' }, { id: 'a', route_order: 1 }]);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'x']);
  });
  it('measures about 111 km per degree of latitude', () => {
    expect(distanceKm({ lat: 14, lng: 121 }, { lat: 15, lng: 121 })).toBeGreaterThan(110);
    expect(distanceKm({ lat: 14, lng: 121 }, { lat: 15, lng: 121 })).toBeLessThan(112);
  });
});

describe('stopMinutes', () => {
  // A straight 100 km road north, driven in 120 minutes.
  const coords = Array.from({ length: 101 }, (_, i) => [121, 14 + i * 0.009]);
  const route = { coords, distance_km: 100, duration_min: 120 };
  it('uses each leg when the route has them', () => {
    expect(stopMinutes({ ...route, legs: [{ duration_min: 10 }, { duration_min: 20 }, { duration_min: 90 }] }, [{ lat: 14.1, lng: 121 }, { lat: 14.3, lng: 121 }])).toEqual([10, 30]);
  });
  it('without legs, shares the trip time by how far along each stop is (not 0 for all)', () => {
    const m = stopMinutes({ ...route, legs: [] }, [{ lat: 14.09, lng: 121 }, { lat: 14.45, lng: 121 }]);
    expect(m[0]).toBeGreaterThan(8);
    expect(m[0]).toBeLessThan(16);
    expect(m[1]).toBeGreaterThan(55);
    expect(m[1]).toBeLessThan(65);
  });
  it('without a usable route gives no minutes', () => {
    expect(stopMinutes({ legs: [] }, [{ lat: 14, lng: 121 }])).toEqual([null]);
  });
});
