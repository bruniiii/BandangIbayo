import { describe, it, expect } from 'vitest';
import { parseStops, formatStops, insertStop, formatStopTime } from '../src/itinerary';

describe('itinerary stops', () => {
  it('reads times, ranges, noon/midnight and plain lines', () => {
    expect(parseStops('10:00 PM – Meet up at Cubao\n08:15 AM - 11:00 AM – Hike\n12:00nn – Lunch\nFree time')).toEqual([
      { start: '22:00', end: '', text: 'Meet up at Cubao' },
      { start: '08:15', end: '11:00', text: 'Hike' },
      { start: '12:00', end: '', text: 'Lunch' },
      { start: '', end: '', text: 'Free time' },
    ]);
  });
  it('writes them back in the same format', () => {
    const text = '10:00 PM – Meet up at Cubao\n08:15 AM – 11:00 AM – Hike\nFree time';
    expect(formatStops(parseStops(text))).toBe(text);
    expect(formatStopTime('00:30')).toBe('12:30 AM');
    expect(formatStopTime('12:00')).toBe('12:00 PM');
  });
  it('adds a new stop in time order', () => {
    const stops = [{ start: '06:00', text: 'Breakfast' }, { start: '12:00', text: 'Lunch' }];
    expect(insertStop(stops, { start: '09:00', text: 'Hike' }).map((s) => s.text)).toEqual(['Breakfast', 'Hike', 'Lunch']);
    expect(insertStop(stops, { start: '', text: 'Free time' }).map((s) => s.text)).toEqual(['Breakfast', 'Lunch', 'Free time']);
  });
});
