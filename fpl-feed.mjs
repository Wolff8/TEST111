import { inIfpsZone } from "./ifps-feed.mjs";

const ROUTE_HOST = "https://vrs-standing-data.adsb.lol";
export const FPL_ROUTE_API = `${ROUTE_HOST}/routes/`;
export const FPL_ROUTE_FALLBACK = "https://api.adsb.lol/api/0/route/";
export const FPL_AIRPORT_API = "https://api.adsb.lol/api/0/airport/";

const HIT_MS = 45 * 60_000;
const MISS_MS = 8 * 60_000;
const routes = new Map();
const inflight = new Set();
const queued = [];
const queuedSet = new Set();
let lastLive = [];
let lastAt = 0;
let lookups = 0;
let hits = 0;
let misses = 0;

export function callsignOf(flight) {
  const s = String(flight || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!s || s === "NOCALL" || s === "NOCALLSIGN") return "";
  if (s.length < 4 || s.length > 8) return "";
  if (!/^[A-Z]{2,3}[A-Z0-9]{1,5}$/.test(s)) return "";
  if (/^(GND|TWR|TEST|BLOCK|NONE|null)$/i.test(s)) return "";
  return s;
}

function kmBetween(a, b, c, d) {
  const R = 6371;
  const p1 = (a * Math.PI) / 180;
  const p2 = (c * Math.PI) / 180;
  const dp = ((c - a) * Math.PI) / 180;
  const dl = ((d - b) * Math.PI) / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function gcPoints(lat1, lon1, lat2, lon2, n = 8) {
  const φ1 = (lat1 * Math.PI) / 180;
  const λ1 = (lon1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const λ2 = (lon2 * Math.PI) / 180;
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2)));
  if (!Number.isFinite(d) || d < 1e-4) return [{ lat: lat2, lon: lon2 }];
  const out = [];
  const steps = Math.max(2, n);
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push({
      lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
      lon: (Math.atan2(y, x) * 180) / Math.PI,
    });
  }
  return out;
}

function parseRoute(j, cs) {
  const apts = Array.isArray(j?._airports) ? j._airports : [];
  const codes = String(j?.airport_codes || "")
    .toUpperCase()
    .split(/[-/]/)
    .map((x) => x.trim())
    .filter((x) => /^[A-Z]{4}$/.test(x));
  const dep = codes[0] || (apts[0]?.icao || "").toUpperCase();
  const dest = codes[codes.length - 1] || (apts[apts.length - 1]?.icao || "").toUpperCase();
  if (!dep || !dest || dep === dest) return null;
  return {
    at: Date.now(),
    miss: false,
    flight: String(j?.callsign || cs).toUpperCase(),
    codes: codes.join("-") || `${dep}-${dest}`,
    iata: String(j?._airport_codes_iata || ""),
    airline: String(j?.airline_code || ""),
    dep,
    dest,
    airports: apts
      .map((a) => ({
        icao: String(a.icao || "").toUpperCase(),
        iata: String(a.iata || ""),
        name: String(a.name || ""),
        lat: Number(a.lat),
        lon: Number(a.lon),
      }))
      .filter((a) => a.icao && Number.isFinite(a.lat) && Number.isFinite(a.lon)),
  };
}

async function lookup(cs) {
  if (inflight.has(cs)) return routes.get(cs) || null;
  inflight.add(cs);
  lookups += 1;
  const urls = [`${FPL_ROUTE_API}${cs.slice(0, 2)}/${encodeURIComponent(cs)}.json`, `${FPL_ROUTE_FALLBACK}${encodeURIComponent(cs)}`];
  try {
    let rec = null;
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: { accept: "application/json", "user-agent": "OpsLiveDash/1.0" },
          signal: AbortSignal.timeout(10_000),
          redirect: "follow",
        });
        if (r.status === 404) continue;
        if (!r.ok) continue;
        rec = parseRoute(await r.json(), cs);
        if (rec) break;
      } catch {
        /* try next host */
      }
    }
    if (!rec) {
      misses += 1;
      const miss = { at: Date.now(), miss: true, flight: cs };
      routes.set(cs, miss);
      return miss;
    }
    hits += 1;
    routes.set(cs, rec);
    return rec;
  } catch {
    misses += 1;
    const miss = { at: Date.now(), miss: true, flight: cs };
    routes.set(cs, miss);
    return miss;
  } finally {
    inflight.delete(cs);
    queuedSet.delete(cs);
  }
}

function fresh(hit) {
  if (!hit) return false;
  const age = Date.now() - hit.at;
  return hit.miss ? age < MISS_MS : age < HIT_MS;
}

export function queueLiveRoutes(planes) {
  for (const p of planes || []) {
    if (p.role === "uav" || p.role === "glider" || p.role === "soar" || p.role === "balloon" || p.src === "rid") continue;
    const cs = callsignOf(p.flight);
    if (!cs) continue;
    const hit = routes.get(cs);
    if (fresh(hit) || inflight.has(cs) || queuedSet.has(cs)) continue;
    if (queued.length >= 100) break;
    queuedSet.add(cs);
    queued.push(cs);
  }
}

async function pump() {
  const batch = queued.splice(0, 6);
  if (!batch.length) return;
  await Promise.all(batch.map((cs) => lookup(cs)));
}

let pumpStarted = false;
export function startLiveRoutePump() {
  if (pumpStarted) return;
  pumpStarted = true;
  setInterval(() => {
    void pump();
  }, 2_200);
  void pump();
}

function paintOne(p) {
  const cs = callsignOf(p.flight);
  if (!cs) return false;
  const hit = routes.get(cs);
  if (!hit || hit.miss || !hit.dep) return false;
  p.dep = hit.dep;
  p.dest = hit.dest;
  p.route = hit.codes;
  p.fpl = true;
  p.ifps = inIfpsZone(hit.dep) || inIfpsZone(hit.dest);
  const dest = (hit.airports || []).find((a) => a.icao === hit.dest) || hit.airports[hit.airports.length - 1];
  if (dest && !p.nm && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
    const d = kmBetween(p.lat, p.lon, dest.lat, dest.lon);
    if (d >= 12) {
      const n = Math.min(8, Math.max(3, Math.round(d / 140)));
      const fut = gcPoints(p.lat, p.lon, dest.lat, dest.lon, n).map((t) => ({
        lat: t.lat,
        lon: t.lon,
        alt: p.altFt || 0,
        color: "#c9a227",
        future: true,
        filed: true,
      }));
      const past = (p.trail || []).filter((t) => !t.future).slice(-32);
      p.trail = [...past, ...fut];
    }
  }
  return true;
}

export function applyLiveRoutes(planes) {
  const live = [];
  for (const p of planes || []) {
    if (!paintOne(p)) continue;
    live.push({
      flight: String(p.flight || "").replace(/\s+/g, ""),
      dep: p.dep,
      dest: p.dest,
      route: p.route,
      lat: p.lat,
      lon: p.lon,
      altFt: p.altFt,
      gs: p.gs,
      si: /^LJ/i.test(p.dep || "") || /^LJ/i.test(p.dest || ""),
      ifps: Boolean(p.ifps),
    });
  }
  queueLiveRoutes(planes);
  lastLive = live.sort((a, b) => Number(b.si) - Number(a.si) || a.flight.localeCompare(b.flight));
  lastAt = Date.now();
  return live.length;
}

export function listLiveRoutes() {
  return lastLive;
}

export function peekRoute(cs) {
  const id = callsignOf(cs);
  if (!id) return null;
  const hit = routes.get(id);
  if (!hit || hit.miss || !hit.dest) return null;
  return hit;
}

export function liveRouteStatus() {
  return {
    ok: true,
    feed: true,
    json: true,
    host: ROUTE_HOST,
    route: FPL_ROUTE_API,
    n: lastLive.length,
    cached: routes.size,
    lookups,
    hits,
    misses,
    queued: queued.length,
    at: lastAt ? new Date(lastAt).toISOString() : null,
  };
}
