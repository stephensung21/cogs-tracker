// Live planes for the Radar tab, from the OpenSky Network API (https://openskynetwork.github.io/opensky-api/).
// The browser can't call OpenSky directly (no CORS), so the Worker fetches and caches for it.

export interface Plane {
  id: string; // ICAO 24-bit address
  callsign: string;
  country: string;
  lat: number;
  lon: number;
  altFt: number | null; // barometric altitude, rounded to 100 ft
  speedKt: number | null;
  track: number | null; // degrees clockwise from north
  onGround: boolean;
}

export interface Box {
  s: number;
  w: number;
  n: number;
  e: number;
}

type StateVector = (string | number | boolean | null)[];

/** OpenSky's /states/all response to planes. Planes without a position are skipped. */
export function parseStates(json: { time: number; states: StateVector[] | null }): Plane[] {
  const out: Plane[] = [];
  for (const s of json.states ?? []) {
    const lon = s[5], lat = s[6];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const alt = s[7], speed = s[9], track = s[10];
    out.push({
      id: String(s[0]),
      callsign: typeof s[1] === "string" ? s[1].trim() : "",
      country: String(s[2] ?? ""),
      lat,
      lon,
      altFt: typeof alt === "number" ? Math.round((alt * 3.28084) / 100) * 100 : null,
      speedKt: typeof speed === "number" ? Math.round(speed * 1.94384) : null,
      track: typeof track === "number" ? Math.round(track) : null,
      onGround: s[8] === true,
    });
  }
  return out;
}

/** Largest area fetched: OpenSky charges more credits for bigger boxes (400 sq deg = 3 credits). */
const MAX_AREA = 400;

/** The map's visible area, rounded outwards to whole degrees (so nearby views share a cache entry), or null. */
export function boxFromQuery(q: { s?: string; w?: string; n?: string; e?: string }): Box | null {
  const v = [q.s, q.w, q.n, q.e].map((x) => Number(x));
  if (v.some((x) => !Number.isFinite(x))) return null;
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  const s = clamp(Math.floor(v[0]), -90, 90), n = clamp(Math.ceil(v[2]), -90, 90);
  const w = clamp(Math.floor(v[1]), -180, 180), e = clamp(Math.ceil(v[3]), -180, 180);
  if (n <= s || e <= w || (n - s) * (e - w) > MAX_AREA) return null;
  return { s, w, n, e };
}

export interface RadarEnv {
  OPENSKY_CLIENT_ID?: string;
  OPENSKY_CLIENT_SECRET?: string;
}

export interface RadarResult {
  planes: Plane[];
  time: number; // OpenSky's timestamp (seconds)
  remaining: number | null; // API credits left today, if OpenSky said
}

// Per-isolate caches. Cloudflare's Cache API isn't available on workers.dev, and a minute-old radar is fine.
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; result: RadarResult }>();
let token: { value: string; expires: number } | null = null;

/** Optional free OpenSky account (API client) for a bigger daily allowance than anonymous access. */
async function authHeader(env: RadarEnv): Promise<Record<string, string>> {
  if (!env.OPENSKY_CLIENT_ID || !env.OPENSKY_CLIENT_SECRET) return {};
  if (!token || token.expires < Date.now() + 30_000) {
    const res = await fetch("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env.OPENSKY_CLIENT_ID,
        client_secret: env.OPENSKY_CLIENT_SECRET,
      }),
    });
    if (!res.ok) return {}; // fall back to anonymous
    const j = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
  }
  return { Authorization: `Bearer ${token.value}` };
}

export class RadarError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function fetchPlanes(env: RadarEnv, box: Box): Promise<RadarResult> {
  const key = `${box.s},${box.w},${box.n},${box.e}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const url = `https://opensky-network.org/api/states/all?lamin=${box.s}&lomin=${box.w}&lamax=${box.n}&lomax=${box.e}`;
  const res = await fetch(url, { headers: await authHeader(env) });
  if (res.status === 429) throw new RadarError(429, "Out of free radar requests for today. Try again tomorrow.");
  if (!res.ok) throw new RadarError(502, `OpenSky said ${res.status}.`);
  const json = (await res.json()) as { time: number; states: StateVector[] | null };
  const left = res.headers.get("X-Rate-Limit-Remaining");
  const result = { planes: parseStates(json), time: json.time, remaining: left === null ? null : Number(left) };
  cache.set(key, { at: Date.now(), result });
  if (cache.size > 50) cache.delete(cache.keys().next().value!);
  return result;
}
