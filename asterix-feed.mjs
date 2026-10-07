/** ASTERIX ingest: raw binary blocks from a feeder, or already-decoded JSON.
 * CAT 001/048 monoradar, 034/025/063/065 status, 021 ADS-B, 062 SDPS tracks.
 * CAT 064/068 are SAC allocations, not application categories. CAT 240 skipped.
 * Drones/OGN/ADS-B do not wait on this path. No SDDS/PENS UDP multicast. */

import { parseAsterixBuffer, bufferFromFeeder } from "./asterix-parse.mjs";
import { isLeftoverPsrSite } from "./asterix-encode.mjs";

export const ASTERIX_REPO = "https://github.com/CroatiaControlLtd/asterix";
export const ASTERIX_CATS = [1, 21, 25, 34, 48, 62, 63, 65, 240];
export const ASTERIX_SPECS = {
  index: "https://www.eurocontrol.int/asterix",
  cat001: {
    part: 2,
    edition: "1.4",
    name: "Monoradar Target Reports (legacy)",
    url: "https://www.eurocontrol.int/asterix",
    feed: false,
  },
  cat034: {
    part: "2b",
    edition: "1.29",
    name: "Monoradar Service Messages",
    url: "https://www.eurocontrol.int/asterix",
    feed: false,
  },
  cat048: {
    part: 4,
    edition: "1.32",
    name: "Monoradar Target Reports",
    url: "https://www.eurocontrol.int/publication/cat048-eurocontrol-specification-surveillance-data-exchange-asterix-part4",
    pdf: "https://www.eurocontrol.int/sites/default/files/2024-07/eurocontrol-cat048-part4-edition-1-32.pdf",
    appendix: "https://www.eurocontrol.int/publication/cat048-eurocontrol-specification-surveillance-data-exchange-asterix-part-4-category-48",
    html127: "https://zoranbosnjak.github.io/asterix-specs/specs/cat048/cats/cat1.27/definition.html",
    html132: "https://zoranbosnjak.github.io/asterix-specs/specs/cat048/cats/cat1.32/definition.html",
    feed: false,
  },
  cat062: {
    part: 9,
    edition: "1.20",
    name: "SDPS Track Messages",
    url: "https://www.eurocontrol.int/publication/cat062-eurocontrol-specification-surveillance-data-exchange-asterix-part-9-category-062",
    html: "https://zoranbosnjak.github.io/asterix-specs/specs/cat062/cats/cat1.20/definition.html",
    feed: false,
    note: "Full UAP including compound I380/I290/I295/I390. Not SAC 64.",
  },
  cat063: {
    part: 10,
    edition: "1.7",
    name: "Sensor Status Messages",
    url: "https://www.eurocontrol.int/publication/cat063-eurocontrol-specification-surveillance-data-exchange-part-10-category-63",
    feed: false,
  },
  cat065: {
    part: 15,
    edition: "1.6",
    name: "SDPS Service Status Messages",
    url: "https://www.eurocontrol.int/publication/cat065-eurocontrol-specification-surveillance-data-exchange-asterix-part-15-category-65",
    feed: false,
  },
  sac064: {
    name: "SAC 64 Germany MIL",
    feed: false,
    note: "On eurocontrol.int/asterix this number is a System Area Code, not Category 064. There is no published CAT 064 UAP.",
  },
  sac068: {
    name: "SAC 68 Portugal",
    feed: false,
    note: "On eurocontrol.int/asterix this number is a System Area Code, not Category 068. Monoradar is CAT 001/048. SDPS is CAT 062/063/065.",
  },
  cat025: {
    part: 26,
    edition: "1.6",
    name: "CNS/ATM Ground System Status Reports",
    url: "https://www.eurocontrol.int/publication/cat025-eurocontrol-specification-surveillance-data-exchange-asterix-part-26-category",
    pdf: "https://www.eurocontrol.int/sites/default/files/2025-10/eurocontrol-asterix-cat025-pt26-ed16.pdf",
    feed: false,
  },
  specsAst: "https://github.com/zoranbosnjak/asterix-specs",
  chrome: [
    {
      id: "asterix-analyser-cs",
      name: "ASTERIX-ANALYSER-and-DATA-DISPLAY",
      url: "https://github.com/akapetanovic/ASTERIX-ANALYSER-and-DATA-DISPLAY",
      kind: "html",
      feed: false,
      note: "Offline C# WinForms decoder/display (CAT 001/002/034/048/062/…). Record/replay, not a public live stream. Samples are historical captures.",
    },
    {
      id: "cat048-html-127",
      name: "asterix-specs CAT 048 ed 1.27 HTML",
      url: "https://zoranbosnjak.github.io/asterix-specs/specs/cat048/cats/cat1.27/definition.html",
      kind: "html",
      feed: false,
      note: "Older public UAP page. Parser follows ed 1.32 (same site, /cat1.32/). Not a live plot feed.",
    },
    {
      id: "cat048-html-132",
      name: "asterix-specs CAT 048 ed 1.32 HTML",
      url: "https://zoranbosnjak.github.io/asterix-specs/specs/cat048/cats/cat1.32/definition.html",
      kind: "html",
      feed: false,
      note: "Public UAP we parse against. HEAD/HTML index only.",
    },
    {
      id: "bra-eur-2026",
      name: "BRA-EUR 2026 ANS comparison",
      url: "https://euctrl-pru.github.io/international-BRA-EUR-2026/",
      kind: "html",
      feed: false,
      note: "Quarto report. Historical Brazil/Europe performance, not ASTERIX.",
    },
    {
      id: "eurocontrol-r",
      name: "eurocontrol R helper package",
      url: "https://github.com/eurocontrol/eurocontrol",
      kind: "html",
      feed: false,
      note: "Internal Oracle helpers (PRU_DEV credentials). pkgdown at eurocontrol.github.io/eurocontrol. Not a radar feed.",
    },
    {
      id: "cc-ws-configure",
      name: "CroatiaControl Wireshark 1.8.4 configure.in",
      url: "https://github.com/CroatiaControlLtd/asterix/blob/master/src/asterix/wireshark-plugin/1.8.4/configure.in",
      kind: "html",
      feed: false,
      note: "Stock Wireshark 1.8.6 autotools. Not a decoder and not a live CAT stream.",
    },
    {
      id: "cc-ws-howto",
      name: "CroatiaControl Wireshark 1.10.6 HowToBuild",
      url: "https://github.com/CroatiaControlLtd/asterix/blob/master/src/asterix/wireshark-plugin/1.10.6/HowToBuild.txt",
      kind: "html",
      feed: false,
      note: "MSVC2008 / Wireshark 1.0–1.10 plugin build. Obsolete. We parse native, no Wireshark.",
    },
    {
      id: "asterix-cat-status",
      name: "List of ASTERIX categories and their statuses",
      url: "https://www.eurocontrol.int/publication/list-asterix-categories-and-their-statuses",
      pdf: "https://www.eurocontrol.int/sites/default/files/2025-10/categories-and-statuses-2025-10-22.pdf",
      kind: "pdf",
      bytes: 338620,
      feed: false,
      note: "Copyrighted status table (HEAD only). Which CAT is current/reserved. Not plots.",
    },
    {
      id: "asterix-library-973",
      name: "EUROCONTROL library topic 973 (ASTERIX)",
      url: "https://www.eurocontrol.int/library/search?f%5B0%5D=topic%3A973",
      kind: "html",
      feed: false,
      note: "Drupal search, 53 ASTERIX publications. Spec index, not a binary feed.",
    },
    {
      id: "boundary-packet-asterix",
      name: "boundary/wireshark packet-asterix.c",
      url: "https://github.com/boundary/wireshark/blob/master/epan/dissectors/packet-asterix.c",
      kind: "html",
      feed: false,
      note: "Old Slovenia Control dissector (Hrastovec). CAT 048/062 UAPs match ours. CAT 021 and 025 are NULL. I062/105 LSB 180/2^25. Not a feed.",
    },
    {
      id: "eead-pens",
      name: "eEAD PENS User Access Guide",
      url: "https://help.nmui.eurocontrol.int/resources/Storage/eead-user-guides-downloads/PDF/eEAD%20PENS%20User%20Access%20Guide%20for%20eEAD%20OPS.pdf",
      kind: "pdf",
      bytes: 751719,
      feed: false,
      note: "eEAD over PENS (closed MPLS). B2C/B2B AIXM/NOTAM, not ASTERIX CAT.",
    },
    {
      id: "nm-sia",
      name: "NM Secure Internet Access Solution",
      url: "https://help.nmui.eurocontrol.int/resources/Storage/eead-user-guides/PDF/EUROCONTROL%20NM%20Secure%20Internet%20Access%20Solution.pdf",
      kind: "pdf",
      bytes: 539171,
      feed: false,
      note: "SIAS is authorized NM access over the internet. Not a public radar feed; PENS stays required for tactical radar.",
    },
  ],
};
export const ASTERIX_PART4 = {
  name: "ASTERIX Part 4 / Category 048",
  tool: "parser",
  version: "raw+json",
  not: "wireshark-required",
};

const NM_M = 1852;
const EARTH_M = 6371008.8;
const EARTH_RADAR_M = (4 / 3) * EARTH_M;
const tracks = new Map();
const stations = new Map();
let configuredOrigin = null;

function num(...xs) {
  for (const x of xs) {
    if (x == null) continue;
    if (typeof x === "object") {
      const v = num(x.val, x.value, x.Val, x.Value, x.RHO, x.THETA, x.X, x.Y);
      if (v != null) return v;
      continue;
    }
    let s = String(x).trim();
    if (!s) continue;
    const m = s.match(/^-?\d+(?:[.,]\d+)?/);
    if (!m) continue;
    const n = Number(m[0].replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function txt(...xs) {
  for (const x of xs) {
    if (x == null) continue;
    if (typeof x === "object") {
      const v = txt(x.val, x.value, x.str, x.text);
      if (v) return v;
      continue;
    }
    const s = String(x).trim();
    if (s) return s;
  }
  return "";
}

function walk(node, acc = []) {
  if (node == null) return acc;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, acc);
    return acc;
  }
  if (typeof node === "object") {
    acc.push(node);
    for (const v of Object.values(node)) walk(v, acc);
  }
  return acc;
}

function firstKey(obj, names) {
  if (!obj || typeof obj !== "object") return undefined;
  const keys = Object.keys(obj);
  for (const n of names) {
    const hit = keys.find((k) => k.toLowerCase() === n.toLowerCase() || k.replace(/^I/i, "") === n);
    if (hit) return obj[hit];
  }
  for (const n of names) {
    const hit = keys.find((k) => k.toLowerCase().includes(n.toLowerCase()));
    if (hit) return obj[hit];
  }
  return undefined;
}

function recordCat(rec) {
  const c = num(rec.category, rec.cat, rec.CAT, rec.Category);
  if (c != null) return c;
  const k = Object.keys(rec).find((x) => /^I0?(1|21|25|34|48|62|63|65|240)$/i.test(x) || /^cat0?(1|21|25|34|48|62|63|65|240)$/i.test(x));
  if (!k) return 0;
  const m = k.match(/(240|65|63|62|48|34|25|21|1)/);
  return m ? Number(m[1]) : 0;
}

function tsharkLayer(rec) {
  if (!rec || typeof rec !== "object") return null;
  const layer = rec._source?.layers?.asterix || rec.layers?.asterix || rec.asterix;
  if (layer && typeof layer === "object" && !Array.isArray(layer)) return layer;
  if (Object.keys(rec).some((k) => /^asterix\./i.test(k))) return rec;
  return null;
}

function flattenTshark(layer) {
  const out = {};
  for (const [k, raw] of Object.entries(layer)) {
    const key = String(k).replace(/^asterix\./i, "");
    const val = Array.isArray(raw) ? raw[0] : raw;
    out[key] = val;
    const low = key.toLowerCase();
    if (low === "category" || low === "cat") out.category = num(val);
    if (low === "sac" || /_010_sac$/.test(low)) out.SAC = num(val);
    if (low === "sic" || /_010_sic$/.test(low)) out.SIC = num(val);
    if (low === "ai" || (/_(170|240|245)_/.test(low) && /ident|ai|call/.test(low))) {
      out.TargetIdentification = txt(val);
    }
    if (low === "ai") out.TargetIdentification = txt(val) || out.TargetIdentification;
    if (/(^|_)lat$/.test(low) && !/acc|age|quality/.test(low)) out.Latitude = num(val) ?? out.Latitude;
    if (/(^|_)lon$/.test(low) && !/acc|age|quality/.test(low)) out.Longitude = num(val) ?? out.Longitude;
    if (/_145$|_090$|flight.?level|_136$/.test(low) && !/age/.test(low)) out.FL = num(val) ?? out.FL;
    if (/groundspeed|_160_gs|_185|_200_gs/.test(low)) out.GroundSpeed = num(val) ?? out.GroundSpeed;
    if (/address|_080$|_220$/.test(low) && /021_080|062_380|048_220|address/.test(low)) {
      out.TargetAddress = txt(val) || out.TargetAddress;
    }
    if (low.includes("address") && /0x[0-9a-f]+/i.test(String(val))) out.TargetAddress = txt(val);
    if (/048_040_rho|_040_rho|(^|_)rho$/.test(low)) out.RHO = num(val) ?? out.RHO;
    if (/048_040_theta|_040_theta|(^|_)theta$/.test(low) && !/acc/.test(low)) out.THETA = num(val) ?? out.THETA;
    if (/048_042_x|_042_x|(^|_)x$/.test(low) && !/max|min|acc/.test(low)) out.X = num(val) ?? out.X;
    if (/048_042_y|_042_y|(^|_)y$/.test(low) && !/max|min|acc/.test(low)) out.Y = num(val) ?? out.Y;
    if (/048_161|_161_tn|track.?number/.test(low)) out.TrackNumber = txt(val) || out.TrackNumber;
    if (/048_200_heading|_200_hdg|track.?angle|heading/.test(low) && !/mag/.test(low)) {
      out.TrackAngle = num(val) ?? out.TrackAngle;
    }
  }
  return out;
}

function asRecords(body) {
  const rows = Array.isArray(body)
    ? body
    : Array.isArray(body?.records)
      ? body.records
      : Array.isArray(body?.data)
        ? body.data
        : body && (body._source || body.layers || body.category || body.cat || body.I048 || body.asterix)
          ? [body]
          : [];
  return rows.map((rec) => {
    const layer = tsharkLayer(rec);
    return layer ? { ...rec, ...flattenTshark(layer) } : rec;
  });
}

function destPoint(lat, lon, distM, bearingDeg, radiusM = EARTH_M) {
  const δ = distM / radiusM;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(Math.min(1, Math.max(-1, sinφ2)));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * sinφ2);
  return {
    lat: (φ2 * 180) / Math.PI,
    lon: ((((λ2 * 180) / Math.PI + 540) % 360) - 180),
  };
}

function xyToMeters(x, y, unit) {
  const mode = String(unit || "auto").toLowerCase();
  if (mode === "m" || mode === "meter" || mode === "metres" || mode === "meters") {
    return { x, y };
  }
  if (mode === "nm" || mode === "nmi") {
    return { x: x * NM_M, y: y * NM_M };
  }
  const span = Math.max(Math.abs(x), Math.abs(y));
  return span <= 400 ? { x: x * NM_M, y: y * NM_M } : { x, y };
}

export function pickRadarOrigin(src = {}) {
  const lat = num(src.lat, src.latitude, src.Lat);
  const lon = num(src.lon, src.lng, src.longitude, src.Lon);
  if (lat == null || lon == null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    lat,
    lon,
    theta0: num(src.theta0, src.north, src.heading0) || 0,
    xy: txt(src.xy, src.units) || "auto",
  };
}

export function resolveRadarOrigin(body) {
  const fromBody = pickRadarOrigin(body?.radar || body?.site || {});
  if (fromBody) {
    if (body?.persistOrigin !== false) configuredOrigin = fromBody;
    return fromBody;
  }
  if (configuredOrigin) return configuredOrigin;
  return pickRadarOrigin({
    lat: process.env.ASTERIX_RADAR_LAT || 46.2236,
    lon: process.env.ASTERIX_RADAR_LON || 14.4576,
    theta0: process.env.ASTERIX_RADAR_THETA0,
    xy: process.env.ASTERIX_048_XY,
  });
}

export function radarOriginStatus() {
  return resolveRadarOrigin({}) || configuredOrigin;
}

export function destFromPolar(origin, rhoNm, thetaDeg) {
  const bearing = thetaDeg + (origin.theta0 || 0);
  return destPoint(origin.lat, origin.lon, rhoNm * NM_M, bearing, EARTH_RADAR_M);
}

export function destFromCartesian(origin, x, y) {
  const m = xyToMeters(x, y, origin.xy);
  const dist = Math.hypot(m.x, m.y);
  if (!dist) return { lat: origin.lat, lon: origin.lon };
  const bearing = ((Math.atan2(m.x, m.y) * 180) / Math.PI + 360) % 360;
  return destPoint(origin.lat, origin.lon, dist, bearing + (origin.theta0 || 0));
}

function plot048(bag, origin) {
  const rho = num(firstKey(bag, ["RHO", "Rho", "rho"]), bag.I048?.["040"]?.RHO, bag.I048?.["040"]?.Rho);
  const theta = num(firstKey(bag, ["THETA", "Theta", "theta"]), bag.I048?.["040"]?.THETA, bag.I048?.["040"]?.Theta);
  if (rho != null && theta != null) {
    if (origin) return destFromPolar(origin, rho, theta);
    return { lat: null, lon: null, polar: true, cartesian: false };
  }
  const x = num(firstKey(bag, ["X"]), bag.I048?.["042"]?.X);
  const y = num(firstKey(bag, ["Y"]), bag.I048?.["042"]?.Y);
  if (x != null && y != null) {
    if (origin) return destFromCartesian(origin, x, y);
    return { lat: null, lon: null, polar: false, cartesian: true };
  }
  return { lat: null, lon: null, polar: false, cartesian: false };
}

function extract(rec, origin) {
  const nodes = walk(rec);
  const bag = Object.assign({}, rec, ...nodes.filter((n) => n && typeof n === "object" && !Array.isArray(n)));
  let lat = num(firstKey(bag, ["Latitude", "Lat"]), bag.I021?.["130"]?.Latitude, bag.I062?.["105"]?.Latitude);
  let lon = num(firstKey(bag, ["Longitude", "Lon"]), bag.I021?.["130"]?.Longitude, bag.I062?.["105"]?.Longitude);
  const cat = recordCat(rec);
  const plot = plot048(bag, origin);
  if ((lat == null || lon == null) && plot.lat != null && plot.lon != null) {
    lat = plot.lat;
    lon = plot.lon;
  }
  const fl = num(firstKey(bag, ["FL", "FlightLevel", "Flight Level", "ModeC"]));
  const alt = num(firstKey(bag, ["GeometricAltitude", "Altitude", "Alt"])) ?? (fl != null ? fl * 100 : null);
  const gs = num(firstKey(bag, ["GroundSpeed", "GS", "Speed"]));
  const track = num(firstKey(bag, ["TrackAngle", "Heading", "TrackHeading"]));
  const call = txt(firstKey(bag, ["TargetIdentification", "Callsign", "Target ID", "TID"]));
  const modeA = txt(firstKey(bag, ["Mode3A", "Mode3ACode", "Squawk"]));
  const icao = txt(firstKey(bag, ["TargetAddress", "ICAO24", "Address"]));
  const sac = num(firstKey(bag, ["SAC", "SystemAreaCode"]));
  const sic = num(firstKey(bag, ["SIC", "SystemIdentificationCode"]));
  const tn = txt(firstKey(bag, ["TrackNumber", "TN"]));
  const rho = num(firstKey(bag, ["RHO", "Rho"]), bag.I048?.["040"]?.RHO);
  const theta = num(firstKey(bag, ["THETA", "Theta"]), bag.I048?.["040"]?.THETA);
  return {
    lat,
    lon,
    alt,
    gs,
    track: track ?? theta,
    call,
    modeA,
    icao,
    sac,
    sic,
    tn,
    cat,
    rho,
    theta,
    needOrigin: (cat === 48 || cat === 1) && (lat == null || lon == null) && (plot.polar || plot.cartesian || rho != null || theta != null),
  };
}

export function normalizeIcao(v) {
  const s = String(v || "")
    .toLowerCase()
    .replace(/[^0-9a-f]/g, "");
  return s.length >= 6 ? s.slice(-6) : "";
}

/** Transcode uses SAC 0 / SIC 21·48·62. Operator radars use a real SAC. */
export function isLiveTranscodeSite(sac, sic) {
  const a = Number(sac);
  const i = Number(sic);
  return a === 0 && (i === 21 || i === 48 || i === 62);
}

function catRank(c) {
  if (c === 48 || c === 1) return 3;
  if (c === 62) return 2;
  if (c === 21) return 1;
  return 0;
}

function preferCat(a, b) {
  return catRank(b) > catRank(a) ? b : a;
}

function putTrack(x, now) {
  const icao = normalizeIcao(x.icao);
  const callKey = String(x.call || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  let mate = icao ? tracks.get(icao) : null;
  if (!mate && callKey && callKey !== "unknown") {
    for (const t of tracks.values()) {
      const tc = String(t.call || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (tc && tc === callKey) {
        mate = t;
        break;
      }
    }
  }
  const core = String(icao || x.call || x.tn || `${x.sac || 0}${x.sic || 0}${Math.round((x.lat || 0) * 100)}${Math.round((x.lon || 0) * 100)}`)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
  const id = mate?.id || icao || `ax${x.cat || ""}${core}`;
  const prev = tracks.get(id);
  tracks.set(id, {
    ...(prev || {}),
    ...x,
    icao: icao || x.icao || prev?.icao || "",
    call: x.call || prev?.call || "",
    modeA: x.modeA || prev?.modeA || "",
    gs: x.gs || prev?.gs,
    alt: x.alt || prev?.alt,
    lat: x.lat ?? prev?.lat,
    lon: x.lon ?? prev?.lon,
    track: x.track ?? prev?.track,
    cat: prev ? preferCat(prev.cat, x.cat) : x.cat,
    id,
    at: now,
  });
  return id;
}

function putStation(s, now) {
  const id = `gs${String(s.sac ?? 0).padStart(3, "0")}${String(s.sic ?? 0).padStart(3, "0")}${s.serviceId != null ? `s${s.serviceId}` : ""}`;
  stations.set(id, { ...s, id, at: now });
  return id;
}

function siteKey(sac, sic) {
  if (sac == null || sic == null) return "";
  return `${Number(sac)}/${Number(sic)}`;
}

/** CAT 025 NOGO or Failed: do not plot that SAC/SIC's CAT 021/048. CAT 062 stays (already fused). */
export function siteUnusable(sac, sic) {
  const k = siteKey(sac, sic);
  if (!k) return false;
  for (const s of stations.values()) {
    if (siteKey(s.sac, s.sic) !== k) continue;
    if (s.nogo) return true;
    if (String(s.sstat || "").toLowerCase() === "failed") return true;
  }
  return false;
}

function ingestDecodedRecord(rec, origin, now) {
  if (rec.cat === 240) return { skip: true };
  if ((rec.cat === 21 || rec.cat === 48 || rec.cat === 62) && isLiveTranscodeSite(rec.sac, rec.sic)) {
    return { skip: true };
  }
  if (rec.cat === 25 || rec.cat === 34 || rec.cat === 63 || rec.cat === 65 || rec.cat === 2) {
    putStation(
      {
        cat: rec.cat || 25,
        sac: rec.sac,
        sic: rec.sic,
        lat: rec.lat,
        lon: rec.lon,
        heightM: rec.heightM,
        nogo: rec.nogo,
        ops: rec.ops,
        sstat: rec.sstat,
        reportType: rec.reportType,
        reportName: rec.reportName,
        designator: rec.designator,
        serviceId: rec.serviceId,
        tod: rec.tod,
      },
      now,
    );
    return { station: true };
  }
  const x = {
    lat: rec.lat,
    lon: rec.lon,
    alt: rec.fl != null ? rec.fl * 100 : rec.alt,
    gs: rec.gs,
    track: rec.track ?? rec.theta,
    call: rec.call || "",
    modeA: rec.modeA || "",
    icao: rec.icao || "",
    sac: rec.sac,
    sic: rec.sic,
    tn: rec.tn || "",
    cat: rec.cat,
    rho: rec.rho,
    theta: rec.theta,
    psr: Boolean(rec.psr) || ((rec.cat === 48 || rec.cat === 1) && !rec.icao),
    needOrigin: (rec.cat === 48 || rec.cat === 1) && rec.lat == null && (rec.rho != null || rec.x != null),
  };
  if (x.needOrigin || (x.lat == null && (x.rho != null || rec.x != null))) {
    const plot = rec.rho != null && rec.theta != null && origin
      ? destFromPolar(origin, rec.rho, rec.theta)
      : rec.x != null && rec.y != null && origin
        ? destFromCartesian(origin, rec.x, rec.y)
        : null;
    if (plot) {
      x.lat = plot.lat;
      x.lon = plot.lon;
      x.needOrigin = false;
    }
  }
  if (x.needOrigin) return { skipped048: true };
  if (x.lat == null || x.lon == null || !Number.isFinite(x.lat) || !Number.isFinite(x.lon)) return { skip: true };
  if ((x.cat === 21 || x.cat === 48 || x.cat === 1) && siteUnusable(x.sac, x.sic)) return { nogo: true };
  putTrack(x, now);
  return { track: true };
}

export function ingestAsterixRaw(input, extra = {}) {
  const buf = bufferFromFeeder(input);
  if (!buf || buf.length < 3) return { n: 0, stations: 0, parsed: 0, error: "no asterix bytes" };
  const origin = resolveRadarOrigin(extra);
  const parsed = parseAsterixBuffer(buf);
  const now = Date.now();
  let n = 0;
  let n025 = 0;
  let skipped048 = 0;
  let nogo = 0;
  for (const rec of parsed.records) {
    const hit = ingestDecodedRecord(rec, origin, now);
    if (hit.track) n += 1;
    if (hit.station) n025 += 1;
    if (hit.skipped048) skipped048 += 1;
    if (hit.nogo) nogo += 1;
  }
  expireAsterix();
  return {
    n,
    stations: n025,
    live: listAsterix().length,
    liveStations: stations.size,
    parsed: parsed.n,
    blocks: parsed.blocks,
    skipped048,
    nogo,
    needRadarOrigin: !origin && skipped048 > 0,
    radar: origin,
    raw: true,
  };
}

export function ingestAsterixJson(body) {
  const raw = bufferFromFeeder(body);
  if (raw && !Array.isArray(body) && !body?.records && !body?.data && body?.category == null && body?.cat == null) {
    return ingestAsterixRaw(raw, body);
  }
  const origin = resolveRadarOrigin(body || {});
  const rows = asRecords(body);
  const now = Date.now();
  let n = 0;
  let n025 = 0;
  let skipped048 = 0;
  let nogo = 0;
  for (const rec of rows) {
    const cat = recordCat(rec);
    if (cat === 25) {
      const nodes = walk(rec);
      const bag = Object.assign({}, rec, ...nodes.filter((n) => n && typeof n === "object" && !Array.isArray(n)));
      putStation(
        {
          cat: 25,
          sac: num(firstKey(bag, ["SAC", "sac"])),
          sic: num(firstKey(bag, ["SIC", "sic"])),
          lat: num(firstKey(bag, ["Latitude", "Lat"])),
          lon: num(firstKey(bag, ["Longitude", "Lon"])),
          nogo: Boolean(bag.nogo || bag.NOGO),
          ops: txt(bag.ops, bag.OPS) || undefined,
          sstat: txt(bag.sstat, bag.SSTAT, bag.status) || undefined,
          reportType: num(bag.reportType, bag.RTYP),
          designator: txt(bag.designator, bag.ServiceDesignator, bag.TargetIdentification),
          serviceId: num(bag.serviceId, bag.SID),
        },
        now,
      );
      n025 += 1;
      continue;
    }
    const x = extract(rec, origin);
    const hit = ingestDecodedRecord({ ...x, fl: x.alt != null && x.alt % 100 === 0 ? x.alt / 100 : x.fl }, origin, now);
    if (hit.track) n += 1;
    if (hit.skipped048) skipped048 += 1;
    if (hit.nogo) nogo += 1;
  }
  expireAsterix();
  return {
    n,
    stations: n025,
    live: listAsterix().length,
    liveStations: stations.size,
    skipped048,
    nogo,
    needRadarOrigin: !origin && skipped048 > 0,
    radar: origin,
  };
}

function expireAsterix(ttl = 90_000) {
  const now = Date.now();
  for (const [id, t] of tracks) {
    const keep = isLeftoverPsrSite(t.sac, t.sic) ? 8 * 60_000 : ttl;
    if (now - t.at > keep) tracks.delete(id);
  }
  for (const [id, t] of stations) {
    if (now - t.at > ttl) stations.delete(id);
  }
}

export function listAsterix() {
  expireAsterix();
  return [...tracks.values()].filter((t) => !(t.cat === 21 || t.cat === 48 || t.cat === 1) || !siteUnusable(t.sac, t.sic));
}

export function listAsterixStations() {
  expireAsterix();
  return [...stations.values()];
}

/** CAT 001/048 mono (then 062/021) for identities not already on ADS-B/OGN. Primary plots without ICAO stay. */
export function asterixGapTracks(seenHexes = []) {
  const seen = new Set([...seenHexes].map((h) => String(h || "").toLowerCase()));
  const used = new Set();
  const rows = listAsterix()
    .slice()
    .sort((a, b) => catRank(b.cat) - catRank(a.cat));
  const out = [];
  for (const t of rows) {
    if (isLiveTranscodeSite(t.sac, t.sic)) continue;
    const icao = normalizeIcao(t.icao);
    const key = icao || t.id;
    if (!key || used.has(key) || (icao && seen.has(icao)) || seen.has(String(t.id || "").toLowerCase())) continue;
    if (t.lat == null || t.lon == null || !Number.isFinite(t.lat) || !Number.isFinite(t.lon)) continue;
    used.add(key);
    out.push({
      hex: icao || t.id,
      flight: t.call || "",
      lat: t.lat,
      lon: t.lon,
      alt_geom: t.alt || 0,
      gs: t.gs || 0,
      track: t.track || 0,
      squawk: t.modeA || "",
      type: icao ? "asterix" : "psr",
      t: icao ? t.call || "" : "PSR",
      asterixCat: `CAT${String(t.cat || "").padStart(3, "0")}`,
      seen: (Date.now() - t.at) / 1000,
      sac: t.sac,
      sic: t.sic,
      silent: !icao,
      echo: !icao,
    });
  }
  return out;
}

export function asterixAsAdsb(seenHexes = []) {
  return asterixGapTracks(seenHexes);
}
