/** Public ultrafeeder / tar1090 JSON + GitHub plane-alert UAV lists.
 * Sources are open repos (ODbL / MIT). No ADSBexchange globe scrape.
 * Keep UAV plus balloons, helicopters, LJMS taxi/small, and leftover 1090
 * (TIS-B / NT) so CAT 048 can ingest otherwise-invisible plots. Identified
 * ADS-B/FLARM stays that identity — not re-packed as LIVEADSB. */

export const ULTRAFEEDER_REPO = "https://github.com/sdr-enthusiasts/docker-adsb-ultrafeeder";
export const ULTRAFEEDER_IMAGE = "ghcr.io/sdr-enthusiasts/docker-adsb-ultrafeeder";
export const ULTRAFEEDER_COMPOSE =
  "https://raw.githubusercontent.com/sdr-enthusiasts/docker-adsb-ultrafeeder/main/docker-compose.yml";
export const PLANE_ALERT_DB = "https://github.com/sdr-enthusiasts/plane-alert-db";
export const PLANE_ALERT_CSV =
  "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-db.csv";
export const OPENDATA_REPO = "https://github.com/adsbfi/opendata";
export const TAT_GLOBE = "https://globe.theairtraffic.com/data/aircraft.json";
export const ADSB_FI_V3 = "https://opendata.adsb.fi/api/v3";
export const ADSB_LOL = "https://api.adsb.lol/v2";
export const ADSB_FI_V2 = "https://opendata.adsb.fi/api/v2";

/** Murska Sobota Airport — taxi/runway disk for leftover + small GA. */
export const LJMS_APT = { icao: "LJMS", lat: 46.6292, lon: 16.1908, elevFt: 617 };
/** Splošna bolnišnica Murska Sobota helipad, Rakičan — SV Cougar landings. */
export const RAKICAN_PAD = { lat: 46.65107, lon: 16.16639, name: "SB MS Rakičan", elevFt: 623 };
const ALPINE = { lamin: 40.0, lamax: 55.0, lomin: 4.0, lomax: 25.0 };
/** ICAO types: AS532 Cougar is A532. Super Puma is AS32/H215 — A332 is the A330-200 airliner. */
export const HELI_TYPE_RE =
  /^(EC\d|A10|A13|A532|AS3|AS32|AS33|AS50|AS53|B06|B206|B407|H125|H145|H160|H215|H500|S76|R44|R22|UH|CH47|AW13|AW16|H60|SA33)/;
/** SI + AT + HR + northern Italy (Po valley / Milan / Venice / Bologna). */
export const SI_BOX = { lamin: 43.9, lamax: 49.15, lomin: 7.6, lomax: 17.85 };
export const IT_HUB = { lat: 45.45, lon: 10.99, nm: 180 };

const UA = { "user-agent": "OpsLiveDash/1.0", accept: "application/json,text/csv;q=0.8,text/plain;q=0.5" };

const uavHexCache = { at: 0, hexes: [], balloons: [], meta: new Map() };
const hexCursor = { n: 0 };
const liveCache = { at: 0, data: null };

export function parsePlaneAlertUav(csv) {
  const hexes = [];
  const meta = new Map();
  for (const ln of String(csv || "").split(/\n/).slice(1)) {
    const m = ln.match(/^"?([0-9A-Fa-f]{6})"?,/);
    if (!m) continue;
    const hex = m[1].toLowerCase();
    const q4 = /,(Q4|Q9|MQ9|MQ1B?|RQ4|RQ7|UAV),/i.test(ln);
    const catUav = /,UAV,(?:https:|$)/i.test(ln) || /,UAV\s*$/i.test(ln);
    const tagUav = /,(?:Mil|Civ),UAV,/i.test(ln);
    const heliDrone = /,A139,/i.test(ln) && /Drone/i.test(ln) && !q4;
    if (heliDrone) continue;
    if (!q4 && !catUav && !tagUav) continue;
    if (!meta.has(hex)) hexes.push(hex);
    meta.set(hex, { hex, uav: true });
  }
  return { hexes, meta };
}

export function parsePlaneAlertBalloons(csv) {
  const hexes = [];
  const meta = new Map();
  for (const ln of String(csv || "").split(/\n/).slice(1)) {
    const m = ln.match(/^"?([0-9A-Fa-f]{6})"?,/);
    if (!m) continue;
    const hex = m[1].toLowerCase();
    if (!/,BALL|,LTA|,HAB|,BALLOON|,AIRSHIP|,ZEPP/i.test(ln) && !/,Balloon,/i.test(ln)) continue;
    if (/,(Q4|Q9|MQ9|UAV),/i.test(ln)) continue;
    if (!meta.has(hex)) hexes.push(hex);
    meta.set(hex, { hex, balloon: true });
  }
  return { hexes, meta };
}

export function acList(d) {
  const ac = d?.ac || d?.aircraft;
  return Array.isArray(ac) ? ac : [];
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

export function inEurope(lat, lon) {
  return lat >= 34 && lat <= 72 && lon >= -12 && lon <= 40;
}

export function inAlpine(lat, lon) {
  return lat >= ALPINE.lamin && lat <= ALPINE.lamax && lon >= ALPINE.lomin && lon <= ALPINE.lomax;
}

export function inSiTheater(lat, lon) {
  return lat >= SI_BOX.lamin && lat <= SI_BOX.lamax && lon >= SI_BOX.lomin && lon <= SI_BOX.lomax;
}

/** SI + AT + HR + NE IT — not the whole Alpine EMS fleet. */
export function inSiSky(lat, lon) {
  return inSiTheater(lat, lon) || inLjmsDisk(lat, lon, 8) || kmBetween(46.12, 14.82, Number(lat), Number(lon)) <= 400;
}

export function isSiHex(hex) {
  return /^(4d|50)/i.test(String(hex || ""));
}

export function inLjmsDisk(lat, lon, nm = 8) {
  return kmBetween(LJMS_APT.lat, LJMS_APT.lon, Number(lat), Number(lon)) <= Number(nm) * 1.852 + 0.4;
}

export function inRakicanPad(lat, lon, nm = 0.7) {
  return kmBetween(RAKICAN_PAD.lat, RAKICAN_PAD.lon, Number(lat), Number(lon)) <= Number(nm) * 1.852 + 0.08;
}

export function isSiMilHeli(a) {
  const r = String(a?.r || a?.reg || "").replace(/\s+/g, "");
  const fl = String(a?.flight || "").replace(/\s+/g, "");
  const t = String(a?.t || a?.typecode || "").toUpperCase();
  if (/^L2-?0[1-4]$/i.test(r)) return true;
  if (/^(RANGR|LSV20)/i.test(fl)) return true;
  if (/^S5-?H/i.test(r)) return true;
  if (/^(A532|AS32|H215)$/.test(t)) return true;
  return false;
}

export function hasFix(a) {
  const lat = Number(a?.lat);
  const lon = Number(a?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) > 0.01 && Math.abs(lon) > 0.01;
}

export function isUavRow(a) {
  const cat = String(a.category || "").toUpperCase();
  const t = String(a.t || a.typecode || "").toUpperCase();
  if (cat === "B6") return true;
  if (/^(Q4|Q9|MQ9|MQ1|MQ1B|MQ9B|RQ4|RQ7|RQ1|TB2|BTB2|UAV|HERON|PRED|Q1)$/i.test(t)) return true;
  return /\b(UAV|UAS|DRONE|REAPER|PREDATOR|GLOBAL.?HAWK|HERON|WATCHKEEPER)\b/i.test(`${a.desc || ""} ${a.flight || ""} ${t}`);
}

export function isHeliRow(a) {
  const cat = String(a.category || "").toUpperCase();
  const t = String(a.t || a.typecode || "").toUpperCase();
  if (cat === "A7") return true;
  if (HELI_TYPE_RE.test(t)) return true;
  if (/heli|rotor|cougar/i.test(t)) return true;
  if (isSiMilHeli(a)) return true;
  return false;
}

export function isBalloonRow(a) {
  const cat = String(a.category || "").toUpperCase();
  const t = String(a.t || a.typecode || "").toUpperCase();
  const typ = String(a.type || "");
  if (cat === "B2") return true;
  if (/^(BALL|HAB|SONDE|RS41|RS92|DFM09|AIRSHIP|ZEPP|LTA)/i.test(t)) return true;
  if (/sonde|balloon|hab/i.test(typ)) return true;
  return /\b(BALLOON|AIRSHIP|ZEPPELIN)\b/i.test(`${a.desc || ""} ${a.flight || ""} ${t}`);
}

export function isSmallRow(a) {
  const cat = String(a.category || "").toUpperCase();
  const t = String(a.t || a.typecode || "").toUpperCase();
  if (cat === "A1" || cat === "A2" || cat === "B4") return true;
  if (/^(PWR|ULAC|GYRO|C17|P28|PA2|PA3|PC12|SR2|DA4|M20|BE3|C15|C18)/.test(t)) return true;
  return false;
}

export function isFeederLeftover(a) {
  return /mode_s|tisb|adsb_icao_nt|(^|[^a-z])nt([^a-z]|$)/i.test(String(a.type || a.adsbType || ""));
}

export function isIdentifiedAdsb(a) {
  const typ = String(a.type || a.adsbType || "");
  if (isFeederLeftover(a)) return false;
  if (/^(adsb_icao|adsb|adsb_other)$/i.test(typ)) return true;
  if (/flarm|ogn/i.test(typ)) return true;
  return false;
}

/** On the LJMS paved surface: ground / very low AGL. Not airborne pattern. */
export function isOnLjmsDeck(a, lat = Number(a?.lat), lon = Number(a?.lon)) {
  if (!inLjmsDisk(lat, lon, 6)) return false;
  const cat = String(a.category || "").toUpperCase();
  const t = String(a.t || a.typecode || "").toUpperCase();
  const altRaw = a.alt_baro ?? a.alt_geom ?? a.alt;
  const alt = altRaw === "ground" ? 0 : Number(altRaw) || 0;
  if (/^C/.test(cat) || /TWR|GND|VEH|OBST/i.test(t)) return true;
  if (a.on_ground === true || altRaw === "ground") return true;
  const agl = Math.max(0, alt - LJMS_APT.elevFt);
  return alt < 160 || agl < 80;
}

/** Taxi = driving on the field toward the runway. Parked (gs≈0) and takeoff roll are not taxi. */
export function isLjmsTaxiing(a) {
  if (!hasFix(a) || !isOnLjmsDeck(a)) return false;
  const gs = Number(a.gs) || 0;
  return gs >= 3 && gs < 45;
}

export function skyKind(a, hexSet = new Set(), balloonSet = new Set()) {
  const hex = String(a.hex || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (isUavRow(a) || hexSet.has(hex)) return "uav";
  if (isHeliRow(a)) return "heli";
  if (isBalloonRow(a) || balloonSet.has(hex)) return "balloon";
  if (isFeederLeftover(a)) return "leftover";
  const lat = Number(a.lat);
  const lon = Number(a.lon);
  if (hasFix(a) && isLjmsTaxiing(a)) return "taxi";
  if (isSmallRow(a)) return "small";
  if (hasFix(a) && inLjmsDisk(lat, lon, 8)) return "ljms";
  return "sky";
}

/** Keep balloons, helis, LJMS taxi/small, leftover 1090, and UAV — not far airliners. */
export function keepSky(a, hexSet = new Set(), balloonSet = new Set()) {
  const hex = String(a.hex || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length < 6) return false;
  const lat = Number(a.lat);
  const lon = Number(a.lon);
  const pos = hasFix(a);
  const leftover = isFeederLeftover(a);
  const uav = isUavRow(a) || hexSet.has(hex);

  if (!pos) {
    if (uav || balloonSet.has(hex)) return true;
    if (leftover && isSiHex(hex)) return true;
    return false;
  }
  if (uav) return inEurope(lat, lon);
  if (isHeliRow(a) || isBalloonRow(a) || balloonSet.has(hex)) return inSiSky(lat, lon) || inRakicanPad(lat, lon, 1.2);
  if (inLjmsDisk(lat, lon, 8) || inRakicanPad(lat, lon, 1.2)) return true;
  if (isOnLjmsDeck(a, lat, lon) || isLjmsTaxiing(a)) return true;
  if (pos && (a.on_ground === true || a.alt_baro === "ground") && (inSiTheater(lat, lon) || inLjmsDisk(lat, lon, 8))) return true;
  if (isSmallRow(a) && (inSiTheater(lat, lon) || inLjmsDisk(lat, lon, 8))) return true;
  if (leftover) return inSiTheater(lat, lon) || inLjmsDisk(lat, lon, 8);
  return false;
}

/** CAT 048 ingest only: leftover 1090 with a fix. Identified ADS-B/FLARM stays out. */
export function otherwiseInvisibleSky(rows) {
  return (rows || []).filter((a) => hasFix(a) && isFeederLeftover(a) && !isIdentifiedAdsb(a));
}

async function jget(url, ms = 12_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function textGet(url, ms = 20_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

export async function loadUavHexes() {
  if (Date.now() - uavHexCache.at < 6 * 3600_000 && uavHexCache.hexes.length) return uavHexCache;
  const csv = await textGet(PLANE_ALERT_CSV, 25_000);
  const parsed = parsePlaneAlertUav(csv);
  const balloons = parsePlaneAlertBalloons(csv);
  uavHexCache.at = Date.now();
  uavHexCache.hexes = parsed.hexes;
  uavHexCache.balloons = balloons.hexes;
  uavHexCache.meta = parsed.meta;
  for (const [k, v] of balloons.meta) uavHexCache.meta.set(k, { ...uavHexCache.meta.get(k), ...v });
  return uavHexCache;
}

function tagSky(a, hexSet, balloonSet) {
  const hex = String(a.hex || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  const kind = skyKind(a, hexSet, balloonSet);
  const hitUav = hexSet.has(hex);
  return {
    ...a,
    hex,
    ultrafeeder: true,
    skyKind: kind,
    category: a.category || (hitUav && kind === "uav" ? "B6" : a.category),
    t: a.t || (hitUav && kind === "uav" && !a.t ? "UAV" : a.t),
  };
}

export async function fetchUltrafeederPublic() {
  if (Date.now() - liveCache.at < 18_000 && liveCache.data) return liveCache.data;

  let hexSet = new Set();
  let balloonSet = new Set();
  try {
    const loaded = await loadUavHexes();
    hexSet = new Set(loaded.hexes);
    balloonSet = new Set(loaded.balloons || []);
  } catch {
    hexSet = new Set();
    balloonSet = new Set();
  }

  const keep = (a) => keepSky(a, hexSet, balloonSet);
  const chunk = 24;
  const hexes = [...hexSet, ...balloonSet];
  const start = hexes.length ? hexCursor.n % Math.max(1, Math.ceil(hexes.length / chunk)) : 0;
  hexCursor.n += 1;
  const slice = hexes.slice(start * chunk, start * chunk + chunk * 4);

  const jobs = [
    jget(TAT_GLOBE, 20_000)
      .then((d) => ({ id: "tat-globe", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "tat-globe", rows: [] })),
    jget(`${ADSB_FI_V3}/lat/46.12/lon/14.82/dist/250`, 12_000)
      .then((d) => ({ id: "fi-v3-si", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "fi-v3-si", rows: [] })),
    jget(`${ADSB_FI_V3}/lat/${LJMS_APT.lat}/lon/${LJMS_APT.lon}/dist/20`, 10_000)
      .then((d) => ({ id: "fi-v3-ljms", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "fi-v3-ljms", rows: [] })),
    jget(`${ADSB_LOL}/lat/${LJMS_APT.lat}/lon/${LJMS_APT.lon}/dist/20`, 10_000)
      .then((d) => ({ id: "lol-ljms", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "lol-ljms", rows: [] })),
    jget(`${ADSB_FI_V3}/lat/${RAKICAN_PAD.lat}/lon/${RAKICAN_PAD.lon}/dist/8`, 8_000)
      .then((d) => ({ id: "fi-v3-rakican", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "fi-v3-rakican", rows: [] })),
    jget(`${ADSB_LOL}/lat/${RAKICAN_PAD.lat}/lon/${RAKICAN_PAD.lon}/dist/8`, 8_000)
      .then((d) => ({ id: "lol-rakican", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "lol-rakican", rows: [] })),
    jget(`${ADSB_LOL}/type/A532`, 8_000)
      .then((d) => ({ id: "lol-a532", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "lol-a532", rows: [] })),
    jget(`${ADSB_FI_V2}/type/A532`, 8_000)
      .then((d) => ({ id: "fi-a532", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "fi-a532", rows: [] })),
    jget(`${ADSB_LOL}/type/UAV`, 10_000)
      .then((d) => ({ id: "lol-uav", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "lol-uav", rows: [] })),
    jget(`${ADSB_FI_V2}/mil`, 10_000)
      .then((d) => ({ id: "fi-mil", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "fi-mil", rows: [] })),
    jget(`${ADSB_FI_V2}/type/B06`, 8_000)
      .then((d) => ({ id: "fi-b06", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "fi-b06", rows: [] })),
    jget(`${ADSB_FI_V2}/type/BALL`, 8_000)
      .then((d) => ({ id: "fi-ball", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "fi-ball", rows: [] })),
    jget(`${ADSB_LOL}/type/B06`, 8_000)
      .then((d) => ({ id: "lol-b06", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "lol-b06", rows: [] })),
    jget(`${ADSB_LOL}/type/BALL`, 8_000)
      .then((d) => ({ id: "lol-ball", rows: acList(d).filter(keep) }))
      .catch(() => ({ id: "lol-ball", rows: [] })),
  ];
  for (let i = 0; i < slice.length; i += 24) {
    const q = slice.slice(i, i + 24).join(",");
    jobs.push(
      jget(`${ADSB_FI_V2}/hex/${q}`, 10_000)
        .then((d) => ({ id: `fi-hex-${i}`, rows: acList(d).filter(keep) }))
        .catch(() => ({ id: `fi-hex-${i}`, rows: [] })),
    );
    jobs.push(
      jget(`${ADSB_LOL}/hex/${q}`, 10_000)
        .then((d) => ({ id: `lol-hex-${i}`, rows: acList(d).filter(keep) }))
        .catch(() => ({ id: `lol-hex-${i}`, rows: [] })),
    );
  }

  const parts = await Promise.all(jobs);
  const by = new Map();
  for (const p of parts) {
    for (const a of p.rows || []) {
      const row = tagSky(a, hexSet, balloonSet);
      if (row.hex.length < 6) continue;
      const prev = by.get(row.hex);
      if (!prev || (row.lat && !prev.lat)) by.set(row.hex, row);
    }
  }
  const aircraft = [...by.values()];
  const kindN = (k) => aircraft.filter((a) => a.skyKind === k).length;
  const data = {
    aircraft,
    n: by.size,
    uav: kindN("uav"),
    heli: kindN("heli"),
    balloon: kindN("balloon"),
    small: kindN("small"),
    taxi: kindN("taxi"),
    leftover: otherwiseInvisibleSky(aircraft).length,
    watch: hexSet.size,
    balloonWatch: balloonSet.size,
    hits: Object.fromEntries(parts.map((p) => [p.id, (p.rows || []).length])),
    source: ULTRAFEEDER_REPO,
    db: PLANE_ALERT_DB,
    globe: TAT_GLOBE,
  };
  liveCache.at = Date.now();
  liveCache.data = data;
  return data;
}
