import { listLiveRoutes, liveRouteStatus, callsignOf, queueLiveRoutes, peekRoute, FPL_ROUTE_API, FPL_AIRPORT_API } from "./fpl-feed.mjs";

export const FIDS_LJU = "https://lju-airport.si/en/flights/arrivals-and-departures/";
export const OPENSKY_ARRIVAL = "https://opensky-network.org/api/flights/arrival";
export const ADSB_NEAR = "https://api.adsb.lol/v2/lat/";

const UA = { accept: "application/json,text/html,*/*", "user-agent": "OpsLiveDash/1.0" };

export const HUBS = [
  { icao: "LJLJ", iata: "LJU", name: "Ljubljana Jože Pučnik", lat: 46.2236, lon: 14.4576, si: true },
  { icao: "LJMB", iata: "MBX", name: "Maribor Edvard Rusjan", lat: 46.4797, lon: 15.6861, si: true },
  { icao: "LJPZ", iata: "POW", name: "Portorož", lat: 45.4734, lon: 13.615, si: true },
  { icao: "LJCE", iata: "", name: "Cerklje ob Krki", lat: 45.9, lon: 15.5303, si: true },
  { icao: "LOWW", iata: "VIE", name: "Vienna", lat: 48.1103, lon: 16.5697, si: false },
  { icao: "LDZA", iata: "ZAG", name: "Zagreb", lat: 45.7431, lon: 16.0689, si: false },
  { icao: "LIPZ", iata: "VCE", name: "Venice Marco Polo", lat: 45.5053, lon: 12.3519, si: false },
  { icao: "LHBP", iata: "BUD", name: "Budapest", lat: 47.4369, lon: 19.2611, si: false },
];

const HUB_BY = Object.fromEntries(HUBS.map((h) => [h.icao, h]));
const REGIONAL = new Set(HUBS.filter((h) => !h.si).map((h) => h.icao));

export function isSiArrival(dest) {
  return /^LJ[A-Z]{2}$/.test(String(dest || "").toUpperCase());
}

export function isArrivalDest(dest, filter = "") {
  const d = String(dest || "").toUpperCase();
  if (!/^[A-Z]{4}$/.test(d)) return false;
  if (filter) return d === String(filter).toUpperCase();
  return d.startsWith("LJ") || REGIONAL.has(d);
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

function phaseOf(remKm, altFt, ground) {
  if (ground || (remKm != null && remKm < 6 && (altFt == null || altFt < 2500))) return "landed";
  if (remKm != null && remKm < 40) return "approach";
  return "inbound";
}

function icaoFilter(raw) {
  const s = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return /^[A-Z]{4}$/.test(s) ? s : "";
}

async function probeHead(url, ms = 8_000) {
  const r = await fetch(url, {
    method: "HEAD",
    headers: { accept: "text/html,application/json,*/*", "user-agent": "Mozilla/5.0 OpsLiveDash/1.0" },
    signal: AbortSignal.timeout(ms),
    redirect: "follow",
  });
  const ct = r.headers.get("content-type") || "";
  const bytes = Number(r.headers.get("content-length") || 0) || 0;
  const json = /json/i.test(ct);
  return {
    ok: r.ok,
    status: r.status,
    contentType: ct,
    bytes,
    json,
    feed: r.ok && json,
    url,
  };
}

export async function probeFids() {
  try {
    const hit = await probeHead(FIDS_LJU);
    return {
      ...hit,
      id: "lju-fids",
      name: "Ljubljana arrivals and departures",
      feed: false,
      note: hit.status === 403 ? "WAF 403 from this host. HTML FIDS board, not a public JSON feed." : "HTML FIDS board, not a public JSON feed.",
    };
  } catch (e) {
    return { ok: false, feed: false, json: false, id: "lju-fids", name: "Ljubljana arrivals and departures", url: FIDS_LJU, error: String(e.message || e) };
  }
}

export async function probeOpensky(icao = "LJLJ") {
  const end = Math.floor(Date.now() / 1000);
  const begin = end - 4 * 3600;
  const url = `${OPENSKY_ARRIVAL}?airport=${encodeURIComponent(icao)}&begin=${begin}&end=${end}`;
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(3_500) });
    const ct = r.headers.get("content-type") || "";
    const raw = await r.arrayBuffer();
    const json = /json/i.test(ct);
    let n = 0;
    if (json) {
      try {
        const j = JSON.parse(Buffer.from(raw).toString("utf8"));
        n = Array.isArray(j) ? j.length : 0;
      } catch {
        n = 0;
      }
    }
    return {
      ok: r.ok,
      status: r.status,
      contentType: ct,
      bytes: raw.byteLength,
      json,
      feed: r.ok && json,
      n,
      url,
      icao,
      windowH: 4,
    };
  } catch (e) {
    return {
      ok: false,
      feed: false,
      json: false,
      url,
      icao,
      windowH: 4,
      error: String(e.message || e),
    };
  }
}

async function lookupAirport(icao) {
  const id = String(icao || "").toUpperCase();
  const hub = HUB_BY[id];
  try {
    const r = await fetch(`${FPL_AIRPORT_API}${encodeURIComponent(id)}`, {
      headers: UA,
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) throw new Error(`airport ${r.status}`);
    const j = await r.json();
    return {
      icao: String(j.icao || id).toUpperCase(),
      iata: String(j.iata || hub?.iata || ""),
      name: String(j.name || hub?.name || id),
      lat: Number(j.lat) || hub?.lat || null,
      lon: Number(j.lon) || hub?.lon || null,
      country: String(j.countryiso2 || ""),
      si: Boolean(hub?.si) || /^LJ/.test(id),
    };
  } catch {
    return hub
      ? { icao: hub.icao, iata: hub.iata, name: hub.name, lat: hub.lat, lon: hub.lon, country: hub.si ? "SI" : "", si: hub.si }
      : { icao: id, iata: "", name: id, lat: null, lon: null, country: "", si: /^LJ/.test(id) };
  }
}

async function nearbyHub(hub, distNm = 40) {
  const url = `${ADSB_NEAR}${hub.lat}/lon/${hub.lon}/dist/${distNm}`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`near ${r.status}`);
  const j = await r.json();
  const ac = Array.isArray(j?.ac) ? j.ac : [];
  const planes = [];
  for (const a of ac) {
    const flight = callsignOf(a.flight) || String(a.flight || "").trim().toUpperCase();
    const lat = Number(a.lat);
    const lon = Number(a.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ground = a.alt_baro === "ground" || a.alt_baro === "ground ";
    const altFt = ground ? 0 : Number(a.alt_baro) || 0;
    planes.push({
      flight,
      hex: String(a.hex || ""),
      lat,
      lon,
      altFt,
      gs: Number(a.gs) || 0,
      ground,
      dstNm: Number(a.dst) || null,
      type: String(a.t || ""),
      src: String(a.type || "adsb"),
    });
  }
  return { hub: hub.icao, n: planes.length, now: j.now || Date.now(), planes };
}

function rowOf(r, hub) {
  const dest = String(r.dest || hub?.icao || "").toUpperCase();
  const apt = HUB_BY[dest] || hub || { icao: dest, lat: null, lon: null, name: dest, si: /^LJ/.test(dest) };
  const remKm =
    Number.isFinite(r.lat) && Number.isFinite(r.lon) && Number.isFinite(apt.lat) && Number.isFinite(apt.lon)
      ? kmBetween(r.lat, r.lon, apt.lat, apt.lon)
      : r.dstNm != null
        ? r.dstNm * 1.852
        : null;
  const gs = Number(r.gs) || 0;
  const etaMin = remKm != null && gs > 40 ? Math.round((remKm / (gs * 1.852)) * 60) : null;
  const ground = Boolean(r.ground);
  return {
    flight: String(r.flight || "").replace(/\s+/g, ""),
    dep: r.dep || "",
    dest,
    route: r.route || (r.dep && dest ? `${r.dep}-${dest}` : ""),
    lat: r.lat,
    lon: r.lon,
    altFt: r.altFt,
    gs,
    remKm: remKm != null ? Math.round(remKm) : null,
    etaMin,
    phase: phaseOf(remKm, r.altFt, ground),
    si: Boolean(apt.si) || /^LJ/.test(dest),
    ifps: Boolean(r.ifps),
    airport: apt.name || dest,
  };
}

export async function fetchArrivals(filterRaw = "") {
  const filter = icaoFilter(filterRaw);
  const hubs = filter ? HUBS.filter((h) => h.icao === filter) : HUBS;
  const destSet = new Set((hubs.length ? hubs : HUBS).map((h) => h.icao));

  const [fids, sky, airports, nearParts] = await Promise.all([
    probeFids(),
    probeOpensky(filter || "LJLJ"),
    Promise.all((hubs.length ? hubs : HUBS.filter((h) => h.si)).map((h) => lookupAirport(h.icao))),
    Promise.all(
      (filter ? hubs : HUBS.filter((h) => h.si)).map((h) =>
        nearbyHub(h).catch((e) => ({ hub: h.icao, n: 0, planes: [], error: String(e.message || e) })),
      ),
    ),
  ]);

  const nearPlanes = [];
  for (const part of nearParts) {
    for (const p of part.planes || []) nearPlanes.push(p);
  }
  queueLiveRoutes(nearPlanes);

  const live = listLiveRoutes();
  const seen = new Set();
  const rows = [];

  function take(src) {
    const dest = String(src.dest || "").toUpperCase();
    if (filter ? dest !== filter : !destSet.has(dest) && !isSiArrival(dest)) return;
    if (!isArrivalDest(dest, filter) && !destSet.has(dest)) return;
    const id = src.flight || `${src.lat},${src.lon}`;
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push(rowOf(src, HUB_BY[dest]));
  }

  for (const r of live) take(r);
  for (const p of nearPlanes) {
    const hit = peekRoute(p.flight);
    if (!hit) continue;
    take({
      flight: p.flight,
      dep: hit.dep,
      dest: hit.dest,
      route: hit.codes,
      lat: p.lat,
      lon: p.lon,
      altFt: p.altFt,
      gs: p.gs,
      ground: p.ground,
      dstNm: p.dstNm,
      ifps: true,
    });
  }

  rows.sort((a, b) => Number(b.si) - Number(a.si) || (a.remKm ?? 9e9) - (b.remKm ?? 9e9) || a.flight.localeCompare(b.flight));

  const boards = [];
  const byDest = new Map();
  for (const r of rows) {
    if (!byDest.has(r.dest)) byDest.set(r.dest, []);
    byDest.get(r.dest).push(r);
  }
  const order = filter ? [filter] : [...HUBS.map((h) => h.icao), ...[...byDest.keys()].filter((k) => !HUB_BY[k])];
  for (const icao of order) {
    const hub = HUB_BY[icao] || airports.find((a) => a.icao === icao);
    const items = byDest.get(icao) || [];
    if (!hub && !items.length) continue;
    boards.push({
      icao,
      iata: hub?.iata || "",
      name: hub?.name || icao,
      si: Boolean(hub?.si) || isSiArrival(icao),
      n: items.length,
      items: items.slice(0, 24),
    });
  }

  const siN = rows.filter((r) => r.si).length;
  const origin = liveRouteStatus();
  return {
    ok: rows.length > 0 || origin.n > 0,
    feed: true,
    json: true,
    filter: filter || "",
    n: rows.length,
    si: siN,
    boards,
    live: rows.slice(0, 80),
    airports,
    nearby: nearParts.map((p) => ({ hub: p.hub, n: p.n, error: p.error })),
    fids,
    opensky: sky,
    origin: {
      ok: true,
      feed: true,
      json: true,
      cors: "*",
      route: FPL_ROUTE_API,
      airport: FPL_AIRPORT_API,
      near: ADSB_NEAR,
      n: origin.n,
      cached: origin.cached,
      hits: origin.hits,
      misses: origin.misses,
    },
  };
}
