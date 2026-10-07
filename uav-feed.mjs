/** Public live UAV: OGN type 13 + ADS-B B6/Q4 in the Alpine box. Not AMC scrape, not simulated. */

export const UAV_BOX = { lamin: 40.0, lamax: 55.0, lomin: 4.0, lomax: 25.0 };
export const UAV_OGN = `https://live.glidernet.org/lxml.php?a=A&b=${UAV_BOX.lamax}&c=${UAV_BOX.lomax}&d=${UAV_BOX.lamin}&e=${UAV_BOX.lomin}`;
export const ADSB_LOL = "https://api.adsb.lol/v2";
export const UAV_TYPES = ["UAV", "Q4", "Q9", "MQ9", "RQ4", "TB2", "HERON"];

const UAV_TYPE_RE = /^(Q4|Q9|MQ9|MQ1|MQ1B|MQ9B|RQ4|RQ7|RQ1|TB2|BTB2|UAV|HERON|PRED|Q1|CH4|CH5|WL2)$/i;
const UAV_TEXT_RE = /\b(UAV|UAS|DRONE|QUAD|MAVIC|PHANTOM|ANAFI|AVATA|REAPER|PREDATOR|GLOBAL.?HAWK|HERON|WATCHKEEPER)\b/i;
const UA = { "user-agent": "OpsLiveDash/1.0", accept: "application/json,text/xml;q=0.8" };

export function inUavTheater(lat, lon) {
  return lat >= UAV_BOX.lamin && lat <= UAV_BOX.lamax && lon >= UAV_BOX.lomin && lon <= UAV_BOX.lomax;
}

/** OGN lxml a[5] is UTC clock, a[6] is last-seen seconds (often stale vs the clock). */
export function ognAgeSec(fields) {
  const clock = Number(fields?.[6]);
  const t = String(fields?.[5] || "");
  const m = t.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const now = new Date();
    const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    const nowSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
    let dt = nowSec - sec;
    if (dt < -12 * 3600) dt += 86400;
    if (dt >= 0 && dt < 18 * 3600) return dt;
  }
  return Number.isFinite(clock) ? clock : 9999;
}

/** FLARM beacons every few seconds. Hour-old OGN rows are parked ghosts. */
export function ognMaxAgeSec({ onField = false, uav = false, para = false } = {}) {
  if (onField || uav || para) return 300;
  return 180;
}

export function isUavAircraft(ac) {
  if (!ac || typeof ac !== "object") return false;
  const cat = String(ac.category || "").toUpperCase();
  const t = String(ac.t || ac.typecode || "").toUpperCase();
  const typ = String(ac.type || "");
  const desc = `${ac.desc || ""} ${ac.model || ""} ${ac.flight || ""}`;
  const ogn = Number(ac.ognType);
  if (ogn === 13) return true;
  if (cat === "B6") return true;
  if (/rid/i.test(typ)) return true;
  if (UAV_TYPE_RE.test(t)) return true;
  if (UAV_TEXT_RE.test(desc) || UAV_TEXT_RE.test(t)) return true;
  return false;
}

async function jget(url, ms = 12_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export async function fetchOgnUav() {
  const r = await fetch(UAV_OGN, {
    headers: { ...UA, accept: "text/xml" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`ogn-uav ${r.status}`);
  const xml = await r.text();
  const rows = [];
  const re = /<m a="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml))) {
    const a = m[1].split(",");
    if (a.length < 12) continue;
    const ognType = Number(a[10]) || 0;
    if (ognType !== 13) continue;
    const lat = Number(a[0]);
    const lon = Number(a[1]);
    if (!inUavTheater(lat, lon)) continue;
    const age = ognAgeSec(a);
    if (age > ognMaxAgeSec({ uav: true })) continue;
    const altM = Number(a[4]) || 0;
    const kmh = Number(a[8]) || 0;
    const cn = String(a[2] || "").trim();
    const call = String(a[3] || "").trim();
    const ognid = String(a[13] || a[12] || call || cn).toLowerCase();
    if (!ognid || ognid.length < 3) continue;
    const hexIdent = (s) => /^[0-9A-Fa-f]{6,8}$/.test(String(s || "").replace(/[\s-]+/g, ""));
    const reg = call && !call.startsWith("_") && !hexIdent(call) ? call : "";
    const flight = reg || (cn && !cn.startsWith("_") && !hexIdent(cn) ? cn : "UAV");
    rows.push({
      hex: `ogn-${ognid.replace(/[^a-z0-9]/g, "").slice(-8)}`,
      icao: String(a[12] || "").toLowerCase(),
      flight,
      r: reg || cn,
      t: "UAV",
      lat,
      lon,
      alt_geom: altM * 3.28084,
      gs: kmh / 1.852,
      track: Number(a[7]) || 0,
      type: "flarm",
      category: "B6",
      ognType: 13,
      seen: age,
      rx: a[11],
      model: "OGN UAV",
    });
  }
  return rows;
}

export async function fetchAdsbUav() {
  const urls = [
    `${ADSB_LOL}/mil`,
    ...UAV_TYPES.map((t) => `${ADSB_LOL}/type/${t}`),
    `https://opendata.adsb.fi/api/v2/mil`,
    `https://opendata.adsb.fi/api/v2/type/UAV`,
    `https://opendata.adsb.fi/api/v2/type/Q4`,
  ];
  const parts = await Promise.allSettled(urls.map((u) => jget(u, 10_000)));
  const byHex = new Map();
  for (const p of parts) {
    if (p.status !== "fulfilled") continue;
    const ac = p.value?.ac || p.value?.aircraft;
    if (!Array.isArray(ac)) continue;
    for (const a of ac) {
      if (!isUavAircraft(a)) continue;
      const lat = Number(a.lat);
      const lon = Number(a.lon);
      if (!lat || !lon) continue;
      const europe = lat >= 34 && lat <= 72 && lon >= -12 && lon <= 40;
      if (!inUavTheater(lat, lon) && !europe) continue;
      const id = String(a.hex || "").toLowerCase();
      if (id.length < 6) continue;
      byHex.set(id, { ...a, category: a.category || "B6" });
    }
  }
  return [...byHex.values()];
}

export async function fetchUavPublic() {
  const [ogn, adsb, ultra] = await Promise.all([
    fetchOgnUav().catch(() => []),
    fetchAdsbUav().catch(() => []),
    import("./ultrafeeder-feed.mjs")
      .then((m) => m.fetchUltrafeederPublic())
      .catch(() => ({ aircraft: [], n: 0, hits: {} })),
  ]);
  const byHex = new Map();
  for (const a of adsb) {
    const id = String(a.hex || "").toLowerCase();
    if (id.length >= 6) byHex.set(id, a);
  }
  for (const a of ultra.aircraft || []) {
    if (!isUavAircraft(a) && String(a.skyKind || "") !== "uav" && String(a.category || "").toUpperCase() !== "B6") continue;
    const id = String(a.hex || "").toLowerCase();
    if (id.length < 6) continue;
    if (!byHex.has(id)) byHex.set(id, a);
  }
  const merged = [...byHex.values()];
  return {
    ogn,
    adsb: merged,
    n: ogn.length + merged.length,
    ultra: ultra.uav || 0,
    ultraSky: ultra.n || 0,
    ultraHits: ultra.hits || {},
    ultraWatch: ultra.watch || 0,
  };
}
