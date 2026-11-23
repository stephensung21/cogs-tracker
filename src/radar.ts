// Live planes for the Radar page, from adsb.lol's free open API (https://api.adsb.lol/docs).
// OpenSky was tried first but refuses connections from Cloudflare Workers (522 after ~20 s).
// The browser can't call adsb.lol directly (no CORS), so the Worker fetches and caches for it.

export interface Plane {
  id: string; // ICAO 24-bit address (hex)
  callsign: string;
  reg: string; // registration, e.g. VH-EBA
  type: string; // aircraft type code, e.g. A332
  lat: number;
  lon: number;
  altFt: number | null; // barometric altitude; null on the ground or unknown
  speedKt: number | null; // ground speed
  track: number | null; // degrees clockwise from north
  onGround: boolean;
}

export interface Area {
  lat: number;
  lon: number;
  nm: number; // radius in nautical miles
}

interface Aircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | "ground";
  gs?: number;
  track?: number;
  lat?: number;
  lon?: number;
}

/** adsb.lol's response to planes. Aircraft without a position are skipped. */
export function parseAircraft(json: { now: number; ac?: Aircraft[] }): Plane[] {
  const out: Plane[] = [];
  for (const a of json.ac ?? []) {
    if (typeof a.lat !== "number" || typeof a.lon !== "number") continue;
    out.push({
      id: String(a.hex ?? ""),
      callsign: (a.flight ?? "").trim(),
      reg: a.r ?? "",
      type: a.t ?? "",
      lat: a.lat,
      lon: a.lon,
      altFt: typeof a.alt_baro === "number" ? a.alt_baro : null,
      speedKt: typeof a.gs === "number" ? Math.round(a.gs) : null,
      track: typeof a.track === "number" ? Math.round(a.track) : null,
      onGround: a.alt_baro === "ground",
    });
  }
  return out;
}

/** adsb.lol's largest radius. */
const MAX_NM = 250;
/** Views much bigger than that would only show a small circle of planes, so ask to zoom in instead. */
const TOO_FAR_NM = 400;

/**
 * The map's visible area as a centre and the radius reaching its corners. The centre is rounded to 0.5 deg
 * and the radius up to 25 nm so nearby views share a cache entry.
 */
export function areaFromQuery(q: { s?: string; w?: string; n?: string; e?: string }): Area | null {
  const [s, w, n, e] = [q.s, q.w, q.n, q.e].map((x) => Number(x));
  if (![s, w, n, e].every(Number.isFinite) || n <= s || e <= w) return null;
  const lat = Math.round(((s + n) / 2) * 2) / 2;
  const lon = Math.round(((w + e) / 2) * 2) / 2;
  const dLat = ((n - s) / 2) * 60;
  const dLon = ((e - w) / 2) * 60 * Math.cos((lat * Math.PI) / 180);
  const r = Math.hypot(dLat, dLon);
  if (r > TOO_FAR_NM) return null;
  return { lat, lon, nm: Math.min(MAX_NM, Math.max(25, Math.ceil(r / 25) * 25)) };
}

export interface RadarResult {
  planes: Plane[];
  time: number; // adsb.lol's timestamp (ms)
}

// Per-isolate cache. Cloudflare's Cache API isn't available on workers.dev, and a minute-old radar is fine.
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; result: RadarResult }>();

export class RadarError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function fetchPlanes(area: Area): Promise<RadarResult> {
  const key = `${area.lat},${area.lon},${area.nm}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  let res: Response;
  try {
    res = await fetch(`https://api.adsb.lol/v2/lat/${area.lat}/lon/${area.lon}/dist/${area.nm}`, {
      headers: { "User-Agent": "cogs-tracker radar (personal, non-commercial)" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new RadarError(504, "The plane data service didn't answer. Try again in a minute.");
  }
  if (res.status === 429) throw new RadarError(429, "Too many radar requests right now. Try again in a minute.");
  if (!res.ok) throw new RadarError(502, `The plane data service said ${res.status}.`);
  const json = (await res.json()) as { now: number; ac?: Aircraft[] };
  const result = { planes: parseAircraft(json), time: json.now };
  cache.set(key, { at: Date.now(), result });
  if (cache.size > 50) cache.delete(cache.keys().next().value!);
  return result;
}
