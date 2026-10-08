/** Live radiosondes + amateur HAB from SondeHub v2. Public JSON, not simulated. */

export const SONDEHUB_SONDES = "https://api.v2.sondehub.org/sondes/telemetry";
export const SONDEHUB_AMATEUR = "https://api.v2.sondehub.org/amateur/telemetry";
export const SONDEHUB_SITE = "https://sondehub.org/";

const UA = { "user-agent": "OpsLiveDash/1.0", accept: "application/json" };
const SI = { lat: 46.12, lon: 14.82 };

async function jget(url, ms = 12_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export function latestTelem(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (Number.isFinite(Number(entry.lat)) && Number.isFinite(Number(entry.lon))) return entry;
  const times = Object.keys(entry).filter((k) => {
    const v = entry[k];
    return v && typeof v === "object" && Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lon));
  });
  if (!times.length) return null;
  times.sort();
  return entry[times[times.length - 1]];
}

export function sondeAgeSec(p) {
  const t = Date.parse(String(p?.datetime || p?.time_received || ""));
  if (!Number.isFinite(t)) return 99999;
  return Math.max(0, (Date.now() - t) / 1000);
}

function slug(id) {
  return String(id || "x")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(-12);
}

export function sondeAsAdsb(serial, raw, { amateur = false } = {}) {
  const p = latestTelem(raw);
  if (!p) return null;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const altM = Number(p.alt);
  const age = sondeAgeSec(p);
  const overSi = lat >= 45.2 && lat <= 47.2 && lon >= 13.3 && lon <= 16.65;
  if (amateur) {
    if (!overSi && (!Number.isFinite(altM) || altM < 200)) return null;
    if (age > (overSi ? 14400 : 7200)) return null;
  } else {
    if (age > 14400) return null;
    if (!overSi && age > 5400 && !(Number.isFinite(altM) && altM > 1200)) return null;
  }
  const vel = Number(p.vel_h ?? p.speed);
  const call = String(p.payload_callsign || p.serial || serial || "SONDE").replace(/\s+/g, "").slice(0, 10);
  const model = String(p.subtype || p.type || p.model || (amateur ? "HAB" : "RS41"));
  return {
    hex: `sonde${slug(serial || call)}`,
    flight: call,
    t: amateur ? "HAB" : "SONDE",
    lat,
    lon,
    alt_geom: Number.isFinite(altM) ? altM * 3.28084 : 0,
    gs: Number.isFinite(vel) ? vel * 1.94384 : 0,
    track: Number(p.heading || p.vel_bearing) || 0,
    type: "balloon",
    category: "B2",
    model,
    desc: `${model} · SondeHub${amateur ? " amateur" : ""}`,
    seen: Math.round(age),
  };
}

function bagToRows(bag, amateur) {
  const out = [];
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return out;
  for (const [id, rec] of Object.entries(bag)) {
    const row = sondeAsAdsb(id, rec, { amateur });
    if (row) out.push(row);
  }
  return out;
}

export async function fetchSondePublic({ lat = SI.lat, lon = SI.lon, meters = 850_000 } = {}) {
  const q = `lat=${lat}&lon=${lon}&distance=${meters}`;
  const [sondes, amateur] = await Promise.all([
    jget(`${SONDEHUB_SONDES}?${q}`, 12_000).catch(() => ({})),
    jget(`${SONDEHUB_AMATEUR}?duration=60m`, 12_000).catch(() => ({})),
  ]);
  const wx = bagToRows(sondes, false);
  const hab = bagToRows(amateur, true);
  return { sondes: wx, amateur: hab, n: wx.length + hab.length };
}
