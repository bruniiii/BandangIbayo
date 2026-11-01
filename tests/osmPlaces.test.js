import { describe, it, expect, vi, beforeEach } from 'vitest';
import { placesAlongFromBrowser } from '../src/osmPlaces';

// A ~330 km road north of Manila.
const road = Array.from({ length: 401 }, (_, i) => [121.03 - i * 0.0004, 14.65 + i * 0.0075]);

const answer = (elements) => ({ ok: true, status: 200, json: async () => ({ elements }) });

beforeEach(() => {
  const store = {};
  vi.stubGlobal('localStorage', { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } });
  vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 });
});

describe('placesAlongFromBrowser', () => {
  it('asks long roads in pieces, keeps going when a server is busy, and lists places in order', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, opt) => {
      n += 1;
      if (n % 3 === 1) return { ok: false, status: 504, json: async () => ({}) };
      const [lat, lng] = decodeURIComponent(opt.body.slice(5)).match(/around:300,([^)]*)\)/)[1].split(',').map(Number);
      return answer([
        { type: 'node', id: Math.round(lat * 1000), lat, lon: lng + 0.001, tags: { amenity: 'fuel', name: 'Petron' } },
        { type: 'node', id: 9, lat: 14.65, lon: 121.03, tags: { shop: 'convenience', name: 'Sari-sari store' } }, // not a chain: left out
      ]);
    }));
    const res = await placesAlongFromBrowser(road);
    expect(res.ok).toBe(true);
    expect(res.data.places.length).toBeGreaterThan(4);
    const along = res.data.places.map((p) => p.alongKm);
    expect([...along].sort((a, b) => a - b)).toEqual(along);
    expect(res.data.places.some((p) => p.name === 'Sari-sari store')).toBe(false);

    // The same road again comes from this browser's memory (no new requests).
    const before = fetch.mock.calls.length;
    const again = await placesAlongFromBrowser(road);
    expect(again.ok).toBe(true);
    expect(fetch.mock.calls.length).toBe(before);
  }, 60000);

  it('says the list is busy when every server refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })));
    const res = await placesAlongFromBrowser([[120, 15], [120.1, 15.1]]);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/busy/);
  }, 60000);

  it('needs a road first', async () => {
    expect((await placesAlongFromBrowser(null)).ok).toBe(false);
  });
});
