import { createServer } from "node:http";
import dgram from "node:dgram";
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import mqtt from "mqtt";
import * as satellite from "satellite.js";
import { createSdrFeed, SDR_STATIONS, calcPolarAndCartesian } from "./sdr-feed.mjs";
import { createWigleFeed } from "./wigle-feed.mjs";
import { createWidebandFeed, RF_BANDS } from "./wideband-feed.mjs";
import { fetchNmJson, fetchNmFlightsMerged, NM_FMP, NM_FMPS, nmSource, parseNmRegs, keepNmOnlyPlot, probeEaup, probeMainPages, EAUP_NOP, EAUP_VIEW_ID, EAUP_PORTAL, EAUP_MODULE, MAINPAGES_CACHE, MAINPAGES_NOCACHE, MAINPAGES_STRONG, MAINPAGES_MODULE, APT_API_GUIDE, APT_API_EDITION, APT_API_DATE, APT_API_REF, fetchEcDaily, fetchEcAirports, fetchCrcoSu, CRCO_DASH, CRCO_GUIDE, CRCO_PUB, DATA_APP, DATA_APP_VER, DASHBOARDS_LISTING, LIVETRAFFIC, DASHBOARD_OFFERS, ESASSP_PDF, ESASSP_EDITION, ESASSP_VOL, ESASSP_DATE, ESASSP_TITLE, SURV_SERVICE, SURV_TITLE, EASA_AMC_GM, EASA_AMC_GM_TITLE, MICA_PDF, MICA_EDITION, MICA_DATE, MICA_TITLE, SMGET_PAGE, SMGET_TITLE, probeHtmlHead, probeEcSitemap, EC_SITEMAP, EC_OUR_DATA, EC_UAS, ANS_PERF, AIU_PORTAL, AIU_LIVE_PAGE, AIU_LIVE_DATA, ADRR_DASH, ADRR_META, PRC_2026, TRENDS_PDF, APT_CORNER } from "./eurocontrol-feed.mjs";
import {
  ingestAsterixJson,
  ingestAsterixRaw,
  listAsterix,
  listAsterixStations,
  asterixGapTracks,
  normalizeIcao,
  ASTERIX_REPO,
  ASTERIX_CATS,
  ASTERIX_PART4,
  ASTERIX_SPECS,
  radarOriginStatus,
} from "./asterix-feed.mjs";
import { encodeLiveAsterix, encodeEchoesCat048, DEFAULT_RADAR, PSR_SITES, isLeftoverPsrSite } from "./asterix-encode.mjs";
import { fetchEurofplCode } from "./eurofpl-feed.mjs";
import { applyLiveRoutes, startLiveRoutePump, listLiveRoutes, liveRouteStatus, FPL_ROUTE_API } from "./fpl-feed.mjs";
import { fetchArrivals, isSiArrival, FIDS_LJU, OPENSKY_ARRIVAL, HUBS } from "./arrivals-feed.mjs";
import { fetchMetBoard, AWC_METAR, AWC_ISIGMET, METEOALARM_SI } from "./met-feed.mjs";
import { probeRidCatalog, recognizeDjiRid, RID_CATALOG, RID_VERIFIER_YAML, RID_DRONESCOUT, RID_DRONETAG_LIVE, RID_ESP32, DJI_FEEDBACK_CFG, DJI_ACCOUNT } from "./rid-feed.mjs";
import { fetchUavPublic, inUavTheater, isUavAircraft, ognAgeSec, ognMaxAgeSec, UAV_OGN, UAV_BOX } from "./uav-feed.mjs";
import { ULTRAFEEDER_REPO, ULTRAFEEDER_IMAGE, PLANE_ALERT_DB, TAT_GLOBE, OPENDATA_REPO, fetchUltrafeederPublic, otherwiseInvisibleSky, isIdentifiedAdsb, isFeederLeftover, inSiTheater, SI_BOX, IT_HUB, HELI_TYPE_RE, isHeliRow, isSiMilHeli, RAKICAN_PAD, inRakicanPad } from "./ultrafeeder-feed.mjs";
import { fetchBirdPublic, VOGEL_SITE, VOGEL_RADAR, VOGEL_BIRDS } from "./bird-feed.mjs";
import { fetchEchoPublic, ARSO_ZM, ARSO_RADAR, ARSO_SRD3, ARSO_ORIGIN, FVG_RADAR, FVG_RADAR_JSON } from "./echo-feed.mjs";
import { fetchTar1090Public, TAR1090_TOPIC, TAR1090_LIST, TAR1090_REPO } from "./tar1090-feed.mjs";
import { fetchSondePublic, SONDEHUB_SONDES, SONDEHUB_AMATEUR, SONDEHUB_SITE } from "./sonde-feed.mjs";
import {
  fetchRainviewer,
  RAINVIEWER_MAPS,
  RAINVIEWER_SITE,
  RAINVIEWER_API,
  RAINVIEWER_EXAMPLE,
} from "./rainviewer-feed.mjs";
import { parseIfpsText, enrichIfpsRecs, inIfpsZone, tagIfpsOnPlane, probeIfpsManuals, probeIfpsPdf, IFPS_MANUAL, IFPS_MANUAL_NM, IFPS_PORTAL, IFPS_EDITION, IFPUV } from "./ifps-feed.mjs";
import { asterixUdpListenPort, ASTERIX_UDP_DEFAULT } from "./asterix-udp.mjs";
import { altColor } from "./alt-color.mjs";
import { ingestTrailPoint, selectTrailPast, TRAIL_KEEP_MS as TRAIL_KEEP_WINDOW, TRAIL_SEND_MAX as TRAIL_SEND_CAP, TRAIL_SEND_DENSE } from "./trail-sample.mjs";
import { probeSwim, probeAisDef, probeOpenAtmJson, probeAmanJson, probeChromeScripts, probeEatmStakeholder, probeAirm, AIS_DEF, OPENATM_JSON, OPENATM_META, AMAN_JSON, AMAN_META, RTCA_AJAX, RTCA_SITE, AEROPUS_KENDO, AEROPUS_SITE, EASA_MAIN, EASA_SITE, CF_BEACON, EC_FOOTER_JS, EC_SITE, EC_FOOTER_LIBS, SKYBRARY_DIALOG, SKYBRARY_SITE, SKYBRARY_GTAG_AJAX, CHROME_SCRIPTS, EATM_STAKEHOLDER_URL, EATM_PORTAL, EATM_STAKEHOLDERS, EATM_META, SWIM_CATALOG, SWIM_PUBLIC_LIVE, SWIM_REF, SWIM_REGISTRY, SWIM_SCHEMA, OGC_WFS_TE, OGC_WFS_TE_DOC, OGC_WFS_TE_TITLE, OGC_WFS_TE_DATE, OGC_WFS_TE_CAT, OGC_SITE, AIRM_URL, AIRM_SITE, AIRM_TITLE, AIRM_MODELS, AIRM_BOOTSTRAP, ACI_BB_LAYOUT, ACI_SITE, CROCONTROL_JQ, CROCONTROL_SITE, AMC_SITE, AMC_ANON, AMC_ANON_TITLE, AMC_MAPS, AMC_LOGON, AMC_COMM, AMC_WORKAREAS, AMC_DNN, PRISM_CDN, PRISM_SITE } from "./swim-feed.mjs";

try {
  const envTxt = readFileSync(new URL("./.env", import.meta.url), "utf8");
  for (const line of envTxt.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim();
  }
} catch {
  /* no .env */
}

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT || 4173);
function publicBase() {
  try {
    const live = readFileSync("/tmp/ops-public-url.txt", "utf8").trim();
    if (/^https?:\/\//i.test(live)) return live.replace(/\/$/, "");
  } catch {
    /* no live file */
  }
  return String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
}

function publicApi(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${publicBase()}${p}`;
}
const UA = { "user-agent": "OpsLiveDash/1.0 (public preview)", accept: "application/json" };

const PLACES = {
  si: { lat: 46.12, lon: 14.82, rKm: 220, sl: "Slovenia", en: "Slovenia" },
  lj: { lat: 46.056, lon: 14.508, rKm: 55, sl: "Ljubljana", en: "Ljubljana" },
  ms: { lat: 46.6292, lon: 16.1908, rKm: 60, sl: "Murska Sobota", en: "Murska Sobota" },
  mb: { lat: 46.554, lon: 15.646, rKm: 50, sl: "Maribor", en: "Maribor" },
  kp: { lat: 45.548, lon: 13.73, rKm: 45, sl: "Koper", en: "Koper" },
  nmesto: { lat: 45.804, lon: 15.169, rKm: 45, sl: "Novo mesto", en: "Novo mesto" },
  ce: { lat: 45.9003, lon: 15.5303, rKm: 50, sl: "Cerklje", en: "Cerklje" },
};

/** Murska Sobota Airport (LJMS) + Letalski center dropzone. Field elev ~188 m. */
const LJMS = { icao: "LJMS", lat: 46.6292, lon: 16.1908, elevFt: 617 };
const LJCE = { icao: "LJCE", lat: 45.9003, lon: 15.5303, elevFt: 510 };
const NOVO_MESTO = { lat: 45.804, lon: 15.169 };
const AERO_RE = /^(EA3|EA5|CAP1|CAP4|PITTS|S2S|S2B|S2C|EXTRA|E300|E330|EDGE|EDG|SU26|SU29|YAK5|Z26|Z50|Z52|RV[34678]|DR1|DR10|ACRO)/i;
const JUMP_SHIP_RE = /^(C182|C206|C208|C82R|DHC6|AN2|P750|KODI|SC7)/i;
/** ADSBX/FR24 terrestrial: RANGR91 S5-HPK 506E6D, RANGR92 S5-HKM 506E6E. */
const SI_MIL_HEX = ["506e6d", "506e6e", "506f6b"];
const SI_MIL_REG = ["S5-HKM", "S5-HPK", "L2-01", "L2-02", "L2-03", "L2-04"];
const SI_MIL_CS = ["RANGR91", "RANGR92", "RANGR93", "RANGR94", "RANGR95", "LSV201", "LSV202", "LSV203", "LSV204"];
const SI_MIL_TYPE = ["A532", "AS32", "H215"];
const RAKICAN = RAKICAN_PAD;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

function bearingDeg(a, b, c, d) {
  const r1 = (Number(a) * Math.PI) / 180;
  const r2 = (Number(c) * Math.PI) / 180;
  const dl = ((Number(d) - Number(b)) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(r2);
  const x = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dl);
  const brg = (Math.atan2(y, x) * 180) / Math.PI;
  return (brg + 360) % 360;
}

function inDisk(center, lat, lon, nm = 16) {
  return kmBetween(center.lat, center.lon, Number(lat), Number(lon)) <= Number(nm) * 1.852 + 2;
}

function inLjmsDisk(lat, lon, nm = 16) {
  return inDisk(LJMS, lat, lon, nm);
}

function isLjmsTraffic(lat, lon, altFt, gs, role, src) {
  if (!inLjmsDisk(lat, lon, 8)) return false;
  const agl = ljmsAglFt(altFt);
  if (src === "ogn" || src === "asterix" || role === "small" || role === "heli" || role === "aero" || role === "chute" || role === "soar" || role === "glider") {
    return true;
  }
  if (agl < 2500) return true;
  if ((Number(gs) || 0) < 130 && agl < 4500) return true;
  return false;
}

/** Driving on the LJMS paved surface toward the runway. Parked and takeoff roll are not taxi. */
function isLjmsTaxiing(lat, lon, altFt, gs, altRaw, onGround) {
  if (!inLjmsDisk(lat, lon, 6)) return false;
  const speedKt = Number(gs) || 0;
  if (speedKt < 3 || speedKt >= 45) return false;
  const altNow = altRaw === "ground" ? 0 : Number(altFt) || 0;
  const onDeck = altRaw === "ground" || onGround === true || altNow < 160 || ljmsAglFt(altNow) < 80;
  return onDeck;
}

function inLjceDisk(lat, lon, nm = 20) {
  return inDisk(LJCE, lat, lon, nm);
}

function inNovoDisk(lat, lon, nm = 16) {
  return inDisk(NOVO_MESTO, lat, lon, nm);
}

function ljmsAglFt(altFt) {
  const a = Number(altFt) || 0;
  return Math.max(0, a - LJMS.elevFt);
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

function headingDelta(a, b) {
  let d = Math.abs((Number(a) || 0) - (Number(b) || 0)) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function altCompat(a, b) {
  const x = Number(a) || 0;
  const y = Number(b) || 0;
  return Math.min(Math.abs(x - y), Math.abs(x - y * 3.28084), Math.abs(x * 3.28084 - y));
}

function hasCallsign(p) {
  const fl = String(p?.flight || "").trim();
  return Boolean(fl && fl !== "NO CALL");
}

function trackRichness(p) {
  let s = 0;
  if (hasCallsign(p)) s += 8;
  if (p?.reg) s += 2;
  if (p?.typecode) s += 2;
  if (p?.squawk) s += 1;
  if (p?.src === "adsb" || p?.src === "sdr") s += 4;
  if (p?.src === "mlat") s += 2;
  if (p?.fpl || p?.ifps) s += 2;
  if (p?.src === "ogn" || p?.src === "rid") s += 3;
  return s;
}

function isSpecialRole(p) {
  return Boolean(
    p?.role === "uav" ||
      p?.role === "soar" ||
      p?.role === "glider" ||
      p?.role === "balloon" ||
      p?.role === "bird" ||
      p?.role === "echo" ||
      p?.role === "chute" ||
      p?.role === "aero" ||
      p?.role === "heli" ||
      p?.taxi ||
      p?.low ||
      p?.fastLow ||
      p?.role === "ground" ||
      p?.role === "modes" ||
      p?.src === "rid" ||
      p?.src === "ogn" ||
      p?.src === "mode_s",
  );
}

function findRicherMate(planes, lat, lon, alt, track, gs, maxKm = 36) {
  let best = null;
  let bestScore = Infinity;
  for (const prev of planes) {
    if (!prev || isSpecialRole(prev)) continue;
    if (!hasCallsign(prev) && trackRichness(prev) < 4) continue;
    const d = kmBetween(prev.lat, prev.lon, lat, lon);
    if (d > maxKm) continue;
    const ad = altCompat(prev.altFt, alt);
    if (ad > 14_000) continue;
    const hd = headingDelta(prev.track, track);
    if ((Number(prev.gs) || 0) > 80 && (Number(gs) || 0) > 80 && hd > 55) continue;
    const score = d + hd * 0.12 + ad / 2500 - trackRichness(prev) * 0.15;
    if (score < bestScore) {
      best = prev;
      bestScore = score;
    }
  }
  return best;
}

function mergeGhostInto(rich, ghost) {
  if (ghost.nm || ghost.src === "nm") {
    rich.nm = true;
    rich.nmId = rich.nmId || ghost.nmId || (String(ghost.id || "").startsWith("nm") ? String(ghost.id).slice(2) : "");
    if (ghost.touching) rich.touching = true;
  }
  if (ghost.fpl) rich.fpl = true;
  if (ghost.ifps) rich.ifps = true;
  const extra = (ghost.trail || []).filter((t) => t.future);
  if (extra.length) {
    rich.trail = [...(rich.trail || []).filter((t) => !t.future).slice(-TRAIL_SEND_MAX), ...extra.slice(0, TRAIL_SEND_FUT)];
  }
}

function rowIcao(p) {
  if (/^(flock|bird|echo|ogn|rid|nm|fpl|ax|sonde)/i.test(String(p?.id || ""))) return String(p.icao || "").toLowerCase().replace(/[^a-f0-9]/g, "").slice(-6);
  const h = String(p?.id || "").replace(/[^a-f0-9]/gi, "");
  return h.length >= 6 ? h.slice(-6) : "";
}

function normCall(s) {
  return String(s || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
}

function isRealCall(s) {
  const c = normCall(s);
  return Boolean(c) && c.length >= 4 && c !== "NOCALL" && !/^(FLOCK|BIRD|UAV|SONDE|HAB|PARA|CHUTE|JUMP|AERO|GND|MODES|OGN|PWR|TOW|DROP)$/.test(c);
}

function pickTwin(a, b) {
  const ra = trackRichness(a);
  const rb = trackRichness(b);
  if (a.src === "adsb" && b.src !== "adsb") return a;
  if (b.src === "adsb" && a.src !== "adsb") return b;
  if (ra !== rb) return ra > rb ? a : b;
  return (a.seen || 0) <= (b.seen || 0) ? a : b;
}

function mergeTwin(keep, lose) {
  if (!keep.reg && lose.reg) keep.reg = lose.reg;
  if ((!keep.flight || keep.flight === "NO CALL") && lose.flight && lose.flight !== "NO CALL") {
    keep.flight = lose.flight;
    keep.silent = false;
  }
  if (!keep.typecode && lose.typecode) keep.typecode = lose.typecode;
  if (!keep.desc && lose.desc) keep.desc = lose.desc;
  if (lose.src === "ogn" || lose.src === "rid") keep.src = keep.src === "adsb" ? keep.src : lose.src;
  if (lose.role === "uav" || lose.src === "rid") keep.role = "uav";
  if (lose.local) keep.local = true;
  if (lose.taxi) keep.taxi = true;
  if (lose.jump) keep.jump = true;
  if (lose.fastLow) keep.fastLow = true;
  if (lose.asterix) {
    keep.asterix = true;
    keep.asterixCat = keep.asterixCat || lose.asterixCat;
  }
  const trails = [...(keep.trail || []), ...(lose.trail || [])];
  keep.trail = trails.slice(-TRAIL_SEND_MAX);
}

function sameTwin(a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (a.role === "bird" || b.role === "bird") return false;
  if ((a.role === "echo" || b.role === "echo") && a.role === b.role) return false;
  const ia = rowIcao(a);
  const ib = rowIcao(b);
  if (ia && ib && ia === ib) return true;
  const d = kmBetween(a.lat, a.lon, b.lat, b.lon);
  const ad = Math.abs((Number(a.altFt) || 0) - (Number(b.altFt) || 0));
  const ca = normCall(a.flight);
  const cb = normCall(b.flight);
  if (isRealCall(ca) && ca === cb && d < 12 && ad < 2500) return true;
  const srcs = `${a.src}+${b.src}`;
  const mixed = /adsb/.test(srcs) && /ogn|nm|fpl|rid|asterix|echo|psr/.test(srcs);
  if (!mixed) return false;
  if (d > 2.5 || ad > 1800) return false;
  if ((Number(a.gs) || 0) > 40 && (Number(b.gs) || 0) > 40 && headingDelta(a.track, b.track) > 50) return false;
  return true;
}

function collapseTwinTracks(byId) {
  const rows = [...byId.values()].filter((x) => x.lat && x.lon);
  const drop = new Set();
  for (let i = 0; i < rows.length; i++) {
    if (drop.has(rows[i].id)) continue;
    for (let j = i + 1; j < rows.length; j++) {
      if (drop.has(rows[j].id)) continue;
      if (!sameTwin(rows[i], rows[j])) continue;
      const keep = pickTwin(rows[i], rows[j]);
      const lose = keep === rows[i] ? rows[j] : rows[i];
      mergeTwin(keep, lose);
      drop.add(lose.id);
    }
  }
  for (const id of drop) byId.delete(id);
  return drop.size;
}

function absorbGhostTracks(byId) {
  const rows = [...byId.values()];
  const ghosts = rows.filter((p) => {
    if (isSpecialRole(p)) return false;
    return Boolean(p.silent || p.src === "nm" || p.role === "unknown" || !hasCallsign(p));
  });
  const rich = rows.filter((p) => hasCallsign(p) && !ghosts.includes(p));
  if (!ghosts.length || !rich.length) return 0;
  let n = 0;
  for (const g of ghosts) {
    const mate = findRicherMate(rich, g.lat, g.lon, g.altFt, g.track, g.gs, 36);
    if (!mate || mate.id === g.id) continue;
    mergeGhostInto(mate, g);
    byId.delete(g.id);
    n += 1;
  }
  return n;
}

async function jget(url, ms = 7_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

const OPENSKY_TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const OPENSKY_STATES = "https://opensky-network.org/api/states/all";
const openSkyTok = { access: "", exp: 0 };
const openSkyStatus = { at: 0, n: 0, auth: false, lastErr: "", remaining: null };

function openSkyCreds() {
  const id = String(process.env.OPENSKY_CLIENT_ID || "").trim();
  const secret = String(process.env.OPENSKY_CLIENT_SECRET || "").trim();
  return id && secret ? { id, secret } : null;
}

async function openSkyBearer() {
  const creds = openSkyCreds();
  if (!creds) return "";
  if (openSkyTok.access && Date.now() < openSkyTok.exp - 60_000) return openSkyTok.access;
  const r = await fetch(OPENSKY_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.id,
      client_secret: creds.secret,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`opensky token ${r.status}`);
  const d = await r.json();
  const tok = String(d.access_token || "");
  if (!tok) throw new Error("opensky token empty");
  openSkyTok.access = tok;
  openSkyTok.exp = Date.now() + (Number(d.expires_in) || 1800) * 1000;
  return tok;
}

const cache = {
  radar: new Map(),
  lora: new Map(),
  sensors: new Map(),
  switches: new Map(),
  sz: { at: 0, items: [] },
  ops: new Map(),
  tle: { at: 0, recs: [] },
  nm: new Map(),
  chrome: new Map(),
  ifps: new Map(),
  eaup: new Map(),
  gwt: new Map(),
  eatm: new Map(),
  apt: new Map(),
  ogc: new Map(),
  airm: new Map(),
  esassp: new Map(),
  ecdash: new Map(),
  arrivals: new Map(),
  met: new Map(),
  rid: new Map(),
  uav: new Map(),
};
const inflight = new Map();
let liveGen = 0;
function bustLiveCaches() {
  liveGen += 1;
  cache.radar.clear();
  cache.ops.clear();
}

function once(key, fn) {
  const hit = inflight.get(key);
  if (hit) return hit;
  const p = Promise.resolve()
    .then(fn)
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

function cached(map, key, freshMs, staleMs, refresh) {
  const hit = map.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < freshMs) return Promise.resolve(hit.data);
  const job = once(`c:${key}`, async () => {
    try {
      const data = await refresh();
      map.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      if (hit) return hit.data;
      throw e;
    }
  });
  if (hit && age < staleMs) {
    void job;
    return Promise.resolve(hit.data);
  }
  return job;
}

const CORS = {
  "content-type": "application/json",
  "cache-control": "no-cache",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-api-key",
};

function sendJson(req, res, obj, status = 200) {
  const headers = { ...CORS };
  let body = Buffer.from(JSON.stringify(obj));
  if (body.length > 1200 && /gzip/i.test(String(req.headers["accept-encoding"] || ""))) {
    body = gzipSync(body, { level: 5 });
    headers["content-encoding"] = "gzip";
  }
  headers["content-length"] = String(body.length);
  res.writeHead(status, headers);
  res.end(body);
}

const SAT_GROUPS = [
  { group: "gps-ops", kind: "gps", color: "#6aa8ff" },
  { group: "galileo", kind: "galileo", color: "#3ee0c2" },
  { group: "glo-ops", kind: "glonass", color: "#f5b942" },
  { group: "beidou", kind: "beidou", color: "#c77dff" },
];

function parse3le(txt, kind, color) {
  const lines = String(txt || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const recs = [];
  for (let i = 0; i < lines.length; ) {
    let name = "SAT";
    let l1;
    let l2;
    if (lines[i].startsWith("1 ") && lines[i + 1]?.startsWith("2 ")) {
      l1 = lines[i];
      l2 = lines[i + 1];
      i += 2;
    } else if (lines[i + 1]?.startsWith("1 ") && lines[i + 2]?.startsWith("2 ")) {
      name = lines[i];
      l1 = lines[i + 1];
      l2 = lines[i + 2];
      i += 3;
    } else {
      i += 1;
      continue;
    }
    try {
      const satrec = satellite.twoline2satrec(l1, l2);
      if (satrec) recs.push({ name, kind, color, satrec });
    } catch {
      /* skip bad TLE */
    }
  }
  return recs;
}

async function loadTleRecs() {
  if (cache.tle.recs.length && Date.now() - cache.tle.at < 2 * 60 * 60_000) return cache.tle.recs;
  const recs = [];
  const jobs = SAT_GROUPS.map(async (g) => {
    const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g.group}&FORMAT=TLE`, {
      headers: { ...UA, accept: "text/plain" },
      signal: AbortSignal.timeout(18_000),
    });
    if (!r.ok) throw new Error(`tle ${g.group} ${r.status}`);
    return parse3le(await r.text(), g.kind, g.color);
  });
  const extra = fetch("https://celestrak.org/NORAD/elements/gp.php?NAME=HOTBIRD&FORMAT=TLE", {
    headers: { ...UA, accept: "text/plain" },
    signal: AbortSignal.timeout(18_000),
  })
    .then(async (r) => (r.ok ? parse3le(await r.text(), "dvbs", "#ff8a3d") : []))
    .catch(() => []);
  const extra2 = fetch("https://celestrak.org/NORAD/elements/gp.php?NAME=ASTRA%201&FORMAT=TLE", {
    headers: { ...UA, accept: "text/plain" },
    signal: AbortSignal.timeout(18_000),
  })
    .then(async (r) => (r.ok ? parse3le(await r.text(), "dvbs", "#ff8a3d") : []))
    .catch(() => []);
  const parts = await Promise.allSettled([...jobs, extra, extra2]);
  for (const p of parts) {
    if (p.status === "fulfilled" && Array.isArray(p.value)) recs.push(...p.value);
  }
  if (recs.length) {
    cache.tle = { at: Date.now(), recs };
    return recs;
  }
  return cache.tle.recs;
}

function satLook(rec, lat, lon, date) {
  const pv = satellite.propagate(rec.satrec, date);
  if (!pv?.position) return null;
  const gmst = satellite.gstime(date);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  const observer = {
    longitude: satellite.degreesToRadians(lon),
    latitude: satellite.degreesToRadians(lat),
    height: 0.3,
  };
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const look = satellite.ecfToLookAngles(observer, ecf);
  const el = satellite.radiansToDegrees(look.elevation);
  if (!Number.isFinite(el) || el < 10) return null;
  if (rec.kind === "dvbs" && el < 15) return null;
  const prn = (rec.name.match(/PRN\s*(\d+)/i) || rec.name.match(/\((\d+)\)/) || [])[1];
  const short = rec.name.replace(/\s+/g, " ").replace(/^GSAT/i, "GAL").slice(0, 22);
  return {
    id: `sat-${rec.satrec.satnum || short}`,
    name: short,
    kind: rec.kind,
    prn: prn || "",
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    altKm: Math.round(geo.height),
    el: Math.round(el * 10) / 10,
    az: Math.round(((satellite.radiansToDegrees(look.azimuth) % 360) + 360) % 360),
    rangeKm: Math.round(look.rangeSat),
    color: rec.color,
  };
}

async function loadIlluminators(place) {
  const p = PLACES[place] || PLACES.si;
  try {
    const recs = await loadTleRecs();
    const now = new Date();
    const seen = new Set();
    const sats = [];
    for (const rec of recs) {
      const row = satLook(rec, p.lat, p.lon, now);
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      sats.push(row);
    }
    sats.sort((a, b) => b.el - a.el);
    const counts = { gps: 0, galileo: 0, glonass: 0, beidou: 0, dvbs: 0 };
    for (const s of sats) counts[s.kind] = (counts[s.kind] || 0) + 1;
    return { n: sats.length, counts, items: sats.slice(0, 80), at: now.toISOString() };
  } catch (e) {
    return { n: 0, counts: {}, items: [], error: String(e.message || e) };
  }
}
const trails = new Map();
const ridTracks = new Map();
const sdrTracks = new Map();
const fplTracks = new Map();
const sdrFeed = createSdrFeed(sdrTracks, () => {});
const rfTracks = new Map();
const wigleFeed = createWigleFeed(rfTracks, () => cache.sensors.clear());
const wbTracks = new Map();
const widebandFeed = createWidebandFeed(wbTracks, () => cache.sensors.clear());
const meshMsgs = [];
const meshStream = [];
const meshNodes = new Map();
const meshSeries = new Map();
const seriesCache = new Map();
let emitPkt = (_m) => {};

const TRAIL_KEEP_MS = TRAIL_KEEP_WINDOW;
const TRAIL_KEEP_MS_AX = TRAIL_KEEP_WINDOW;
const TRAIL_KEEP_N = 900;
const TRAIL_KEEP_N_AX = 1600;
const TRAIL_SEND_PAST = TRAIL_SEND_CAP;
const TRAIL_SEND_FUT = 24;
const TRAIL_SEND_MAX = TRAIL_SEND_CAP;

function rememberTrail(id, lat, lon, alt, dense = false) {
  const ts = Date.now();
  const prev = trails.get(id) || [];
  const asterix = String(id).startsWith("ax") || dense;
  const keepMs = asterix ? TRAIL_KEEP_MS_AX : TRAIL_KEEP_MS;
  const keepN = dense || asterix ? TRAIL_KEEP_N_AX : TRAIL_KEEP_N;
  ingestTrailPoint(prev, lat, lon, alt, ts, altColor(alt), { dense: dense || asterix });
  trails.set(id, prev.filter((p) => ts - p.at < keepMs).slice(-keepN));
}

function pruneTrail(points, keepMs = TRAIL_KEEP_MS) {
  const now = Date.now();
  return (points || []).filter((p) => {
    if (p?.future) return true;
    if (!p?.at) return true;
    return now - p.at < keepMs;
  });
}

function planeRole(ac) {
  const cat = String(ac.category || "").toUpperCase();
  const t = String(ac.t || ac.typecode || "").toUpperCase();
  const typ = String(ac.type || "");
  const ogn = Number(ac.ognType);
  const altRaw = ac.alt_baro ?? ac.alt_geom ?? ac.alt;
  const altNow = altRaw === "ground" ? 0 : Number(altRaw || 0) || 0;
  const pos = Number(ac.lat) && Number(ac.lon);
  const deck = ac.on_ground === true || altRaw === "ground" || altNow < 80;
  if ((/^C/.test(cat) || /TWR|GND|VEH|OBST/i.test(t)) && (deck || !pos)) return "ground";
  if (typ === "echo" || typ === "psr" || ac.echo === true) return "echo";
  if (/bird|flock/i.test(typ) || t === "FLOCK" || /stork|kite|gull|crane|vulture|dove/i.test(t)) return "bird";
  if (/^(sonde|balloon|hab)$/i.test(typ) || /^(SONDE|HAB|RS41|RS92|DFM09|DFM17|IMET)/i.test(t)) return "balloon";
  if (/mode_s|modes/i.test(typ) && !(Number(ac.lat) && Number(ac.lon))) return "modes";
  if (/mode_s|modes|tisb|adsb_icao_nt/i.test(typ) && !/^C/.test(cat) && !/TWR|GND|VEH|OBST/i.test(t)) return "modes";
  if (isUavAircraft(ac) || ogn === 13 || cat === "B6" || /rid|dji/i.test(typ) || /UAV|DRONE|QUAD|MAVIC|PHANTOM|ANAFI|EVO|DJI|MINI[234]|AIR[0-9]|AVATA|NEO|REAPER|HERON|PREDATOR/i.test(t + typ)) {
    return "uav";
  }
  if (ogn === 4 || (cat === "B3" && typ !== "bird") || /^(CHUTE|SKYDIV)/i.test(t) || /SKYDIV|JUMPER/i.test(t)) return "chute";
  if (AERO_RE.test(t) || /ACRO|PITTS|EXTRA/i.test(`${t} ${ac.desc || ""} ${ac.model || ""}`)) return "aero";
  if (ogn === 6 || ogn === 7 || /PARA|HANG/i.test(t)) return "soar";
  if (ogn === 1 || cat === "B1" || /GLID|ASK21|ASW|DG[0-9]|LS[48]|DISCU/i.test(t)) return "glider";
  if (ogn === 11 || ogn === 12 || cat === "B2" || /BALL|AIRSHIP|ZEPP/i.test(t)) return "balloon";
  if (cat === "A7" || ogn === 3 || HELI_TYPE_RE.test(t) || /heli|rotor|cougar/i.test(t) || isHeliRow(ac) || isSiMilHeli(ac)) {
    return "heli";
  }
  if (ogn === 8 || ogn === 5 || ogn === 2 || /^(PWR|TOW|DROP)$/i.test(t)) return "small";
  if (cat === "B4" || cat === "A1" || cat === "A2" || /^(C17|P28|PA2|PA3|PC12|SR2|DA4|TB2|M20|BE3|C15|C18|ECHO)/.test(t)) {
    return "small";
  }
  if (ogn === 10 || (typ === "mlat" && !ac.flight && !ac.t)) return "unknown";
  if (!String(ac.flight || "").trim() && !t) return "unknown";
  return "jet";
}

function aircraftScore(a) {
  let s = 0;
  if (a?.lat && a?.lon) s += 8;
  if (String(a?.flight || "").trim()) s += 4;
  if (a?.gs) s += 2;
  if (a?.alt_geom || a?.alt_baro) s += 2;
  if (a?.t || a?.r) s += 1;
  if (a?.squawk) s += 1;
  const seen = Number(a?.seen_pos ?? a?.seen ?? 99);
  if (seen < 5) s += 3;
  else if (seen < 15) s += 1;
  return s;
}

function mergeAircraftLists(lists) {
  const by = new Map();
  for (const rows of lists) {
    for (const a of rows || []) {
      const id = String(a.hex || a.icao24 || "").toLowerCase();
      if (!id || id.length < 4) continue;
      const prev = by.get(id);
      if (!prev || aircraftScore(a) > aircraftScore(prev)) by.set(id, { ...prev, ...a, hex: id });
    }
  }
  return [...by.values()];
}

function aircraftInDisk(a, lat, lon, nm) {
  if (a?.lat == null || a?.lon == null) return false;
  return kmBetween(lat, lon, Number(a.lat), Number(a.lon)) <= Number(nm) * 1.852 + 8;
}

const ADSB_FEEDS = [
  { id: "lol", around: (lat, lon, nm) => `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${nm}` },
  { id: "fi", around: (lat, lon, nm) => `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${Math.min(250, Math.round(nm))}` },
  { id: "live", around: (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${Math.min(250, Math.round(nm))}` },
  { id: "one", around: (lat, lon, nm) => `https://api.adsb.one/v2/point/${lat}/${lon}/${Math.min(250, Math.round(nm))}` },
];
const ADSB_LISTS = [
  { id: "lol-mil", url: "https://api.adsb.lol/v2/mil" },
  { id: "fi-mil", url: "https://opendata.adsb.fi/api/v2/mil" },
  { id: "lol-pia", url: "https://api.adsb.lol/v2/pia" },
  { id: "lol-ladd", url: "https://api.adsb.lol/v2/ladd" },
  { id: "lol-vfr", url: "https://api.adsb.lol/v2/sqk/7000" },
];

const aircraftUrlCache = new Map();
const AIRCRAFT_URL_TTL = 8_000;
const AIRCRAFT_STALE_MS = 180_000;

async function pullAircraftUrl(url, ms = 12_000) {
  const now = Date.now();
  const hit = aircraftUrlCache.get(url);
  if (hit && now - hit.at < AIRCRAFT_URL_TTL && hit.rows.length) return hit.rows;
  try {
    const d = await jget(url, ms);
    const ac = d?.ac || d?.aircraft;
    const rows = Array.isArray(ac) ? ac : [];
    if (rows.length || !hit) aircraftUrlCache.set(url, { at: now, rows });
    return rows.length ? rows : hit?.rows || [];
  } catch {
    if (hit && now - hit.at < AIRCRAFT_STALE_MS) return hit.rows;
    return [];
  }
}

async function fetchAdsbAround(lat, lon, nm, opt = {}) {
  const ring = Math.max(1, Math.round(Number(nm) || 80));
  const jobs = [
    ...ADSB_FEEDS.map((f) => pullAircraftUrl(f.around(lat, lon, ring), 12_000).then((rows) => ({ id: f.id, rows })).catch(() => ({ id: f.id, rows: [] }))),
  ];
  if (opt.lists !== false) {
    jobs.push(
      ...ADSB_LISTS.map((f) =>
        pullAircraftUrl(f.url, 12_000)
          .then((rows) => ({
            id: f.id,
            rows: rows.filter(
              (a) =>
                aircraftInDisk(a, lat, lon, ring) ||
                ((!a.lat || !a.lon) && /nt|mode_s|tisb|modes/i.test(String(a.type || a.adsbType || ""))),
            ),
          }))
          .catch(() => ({ id: f.id, rows: [] })),
      ),
    );
  }
  const parts = await Promise.all(jobs);
  const lol = parts.find((p) => p.id === "lol");
  if (lol && !lol.rows.length && ring > 160) {
    try {
      lol.rows = await pullAircraftUrl(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/150`, 12_000);
    } catch {
      lol.rows = [];
    }
  }
  adsbFeedStatus.at = Date.now();
  adsbFeedStatus.hits = {
    ...adsbFeedStatus.hits,
    ...Object.fromEntries(parts.map((p) => [p.id, p.rows.length])),
  };
  return mergeAircraftLists(parts.map((p) => p.rows));
}

function hexNeighbors(hex, n = 6) {
  const x = parseInt(String(hex), 16);
  if (!Number.isFinite(x)) return [];
  const out = [];
  for (let i = -n; i <= n; i++) out.push((x + i).toString(16).padStart(6, "0"));
  return out;
}

async function fetchSiMilWatch() {
  const hexes = [...new Set([...SI_MIL_HEX, ...hexNeighbors("506e6e", 8)])];
  const urls = [
    ...SI_MIL_REG.map((r) => `https://api.adsb.lol/v2/reg/${encodeURIComponent(r)}`),
    ...SI_MIL_CS.map((c) => `https://api.adsb.lol/v2/callsign/${encodeURIComponent(c)}`),
    ...SI_MIL_TYPE.map((t) => `https://api.adsb.lol/v2/type/${encodeURIComponent(t)}`),
    ...SI_MIL_TYPE.map((t) => `https://opendata.adsb.fi/api/v2/type/${encodeURIComponent(t)}`),
  ];
  const [hexRows, ...rest] = await Promise.all([
    fetchAdsbHexes(hexes).catch(() => []),
    ...urls.map((u) => pullAircraftUrl(u, 8_000).catch(() => [])),
  ]);
  const rows = mergeAircraftLists([hexRows, ...rest]);
  const n = rows.filter((a) => /RANGR|S5-H|L2-0|A532|AS32|H215|506e6e|506f6b/i.test(`${a.flight || ""} ${a.r || ""} ${a.t || ""} ${a.hex || ""}`)).length;
  adsbFeedStatus.hits = { ...adsbFeedStatus.hits, milWatch: rows.length, milHit: n };
  return rows;
}

const adsbFeedStatus = { at: 0, hits: {} };
let tar1090Status = { n: 0, watch: 0, hits: {} };
const hexCache = { at: 0, rows: [] };

async function fetchAdsbHexes(hexes) {
  const ids = [...new Set((hexes || []).map((h) => String(h || "").toLowerCase().replace(/[^0-9a-f]/g, "")))]
    .filter((h) => h.length >= 6)
    .slice(0, 48);
  if (!ids.length) return [];
  const q = ids.join(",");
  const urls = [
    `https://api.adsb.lol/v2/hex/${q}`,
    `https://opendata.adsb.fi/api/v2/hex/${q}`,
    `https://api.airplanes.live/v2/hex/${q}`,
    `https://api.adsb.one/v2/hex/${q}`,
  ];
  const parts = await Promise.allSettled(urls.map((u) => pullAircraftUrl(u, 10_000)));
  const rows = parts.filter((p) => p.status === "fulfilled").flatMap((p) => p.value);
  hexCache.at = Date.now();
  hexCache.rows = rows;
  return mergeAircraftLists([rows]);
}

function radioLobe() {
  expireMap(sdrTracks);
  const now = Date.now();
  const live = [...sdrTracks.values()].filter((a) => now - a.at < 90_000);
  const pos = live.filter((a) => a.lat && a.lon);
  const heard = live.map((a) => a.hex);
  const site = widebandFeed.liveStation();
  if (site) return { heard, fix: { lat: site.lat, lon: site.lon, n: site.n || pos.length, name: site.name } };
  if (!pos.length) return { heard, fix: null };
  const lats = pos.map((a) => a.lat).sort((a, b) => a - b);
  const lons = pos.map((a) => a.lon).sort((a, b) => a - b);
  const mid = (xs) => xs[Math.floor(xs.length / 2)];
  return { heard, fix: { lat: mid(lats), lon: mid(lons), n: pos.length } };
}

let openSkyCache = { at: 0, rows: [] };

async function fetchOpenSkySi(fix, ms = 6_000) {
  let lamin = SI_BOX.lamin;
  let lomin = SI_BOX.lomin;
  let lamax = SI_BOX.lamax;
  let lomax = SI_BOX.lomax;
  if (fix?.lat && fix?.lon) {
    lamin = Math.min(lamin, fix.lat - 2.4);
    lamax = Math.max(lamax, fix.lat + 2.4);
    lomin = Math.min(lomin, fix.lon - 2.8);
    lomax = Math.max(lomax, fix.lon + 2.8);
  }
  const headers = { ...UA, accept: "application/json" };
  const creds = openSkyCreds();
  if (creds) headers.authorization = `Bearer ${await openSkyBearer()}`;
  const wait = Number(ms) || (creds ? 20_000 : 12_000);
  const r = await fetch(
    `${OPENSKY_STATES}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}&extended=1`,
    { headers, signal: AbortSignal.timeout(wait) },
  );
  const remain = r.headers.get("x-rate-limit-remaining");
  if (remain != null) openSkyStatus.remaining = remain;
  if (!r.ok) throw new Error(`opensky ${r.status}`);
  const d = await r.json();
  return (d.states || [])
    .map((s) => {
      const lat = Number(s[6]);
      const lon = Number(s[5]);
      const hasPos = Number.isFinite(lat) && Number.isFinite(lon) && lat && lon;
      const ps = Number(s[16]);
      const cat = Number(s[17]);
      const onGnd = Boolean(s[8]);
      return {
        hex: s[0],
        flight: s[1],
        lat: hasPos ? lat : null,
        lon: hasPos ? lon : null,
        alt_geom: (Number(s[13] || s[7]) || 0) * 3.28084,
        alt_baro: onGnd ? "ground" : (Number(s[7]) || 0) * 3.28084,
        gs: (Number(s[9]) || 0) * 1.94384,
        track: Number(s[10]) || 0,
        baro_rate: Number.isFinite(Number(s[11])) ? Number(s[11]) * 196.85 : undefined,
        squawk: s[14] || "",
        type: !hasPos ? "mode_s" : ps === 2 ? "mlat" : ps === 1 ? "asterix" : ps === 3 ? "flarm" : "adsb",
        category:
          cat === 8
            ? "A7"
            : cat === 9
              ? "B1"
              : cat === 10
                ? "B2"
                : cat === 11
                  ? "B3"
                  : cat === 12
                    ? "B4"
                    : cat === 14
                      ? "B6"
                      : cat === 15
                        ? "B7"
                        : cat === 16
                          ? "C1"
                          : cat === 17
                            ? "C2"
                            : cat === 18
                              ? "C3"
                              : cat === 19
                                ? "C5"
                                : cat === 20
                                  ? "C4"
                                  : cat === 2 || cat === 3
                                    ? "A1"
                                    : "",
      };
    })
    .filter((a) => a.hex);
}

function finiteNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function hasFix(a) {
  const lat = Number(a?.lat);
  const lon = Number(a?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) > 0.01 && Math.abs(lon) > 0.01;
}

function isModeSTrack(x) {
  if (!x || x.role === "ground") return false;
  if (x.role === "modes" || x.noPos || x.src === "mode_s") return true;
  return /mode_s|tisb|adsb_icao_nt/i.test(String(x.src || x.adsbType || ""));
}

function ingestPlane(byId, a, p) {
  const rawId = String(a.hex || a.icao24 || "").toLowerCase();
  const prefixed = /^(flock|bird|echo|ogn|rid|nm|fpl|ax|sonde)/.test(rawId);
  const icao = prefixed ? "" : normalizeIcao(rawId);
  const id = prefixed ? rawId.replace(/[^a-z0-9-]/g, "") : icao || rawId.replace(/[^a-z0-9-]/g, "");
  if (!id || id.length < 4) return;
  const typ = String(a.type || a.adsbType || "");
  const leftover = /mode_s|modes|tisb|adsb_icao_nt|(^|[^a-z])nt([^a-z]|$)/i.test(typ);
  const pos = hasFix(a);
  const modeS = leftover || (!pos && Boolean(icao || (rawId && rawId.length >= 6)));
  if (!pos && !modeS && typ !== "sdr") return;
  const lat = pos ? Number(a.lat) : 0;
  const lon = pos ? Number(a.lon) : 0;
  const altRaw = a.alt_geom ?? a.alt_baro ?? a.alt;
  const alt = altRaw === "ground" ? 0 : Number(altRaw || 0) || 0;
  let track = Number(a.track ?? a.true_heading ?? a.mag_heading ?? 0) || 0;
  let gs = Number(a.gs || 0) || 0;
  const mlat = typ === "mlat" || (Array.isArray(a.mlat) && a.mlat.length > 0);
  const flight = String(a.flight || "").trim() || "";
  const prev = byId.get(id);
  if (prev && /asterix/i.test(typ)) {
    prev.asterix = true;
    prev.asterixCat = a.asterixCat || prev.asterixCat || (/^CAT\d/i.test(String(a.t || "")) ? String(a.t) : prev.asterixCat);
    if ((!prev.flight || prev.flight === "NO CALL") && flight) {
      prev.flight = flight;
      prev.silent = false;
    }
    if (!prev.squawk && a.squawk) prev.squawk = String(a.squawk);
    if (!prev.gs && gs) prev.gs = gs;
    if (!prev.altFt && alt) prev.altFt = Math.round(alt);
    return;
  }
  if (prev && /flarm|ogn|rid/i.test(typ) && (prev.src === "adsb" || prev.src === "mlat")) return;
  const src = mlat
    ? "mlat"
    : /sdr/i.test(typ)
      ? "sdr"
      : /rid/i.test(typ)
        ? "rid"
      : /nm/i.test(typ)
        ? "nm"
      : /ifps|fpl/i.test(typ)
        ? "fpl"
      : /mesh/i.test(typ)
        ? "mesh"
        : typ === "psr"
          ? "psr"
        : typ === "echo"
          ? "echo"
        : /flarm|ogn/i.test(typ)
          ? "ogn"
          : /mode_s|modes|adsb_icao_nt/i.test(typ) || (!pos && leftover)
            ? "mode_s"
          : /tisb|nt|asterix/i.test(typ)
            ? typ
            : "adsb";
  const vs = finiteNum(a.baro_rate ?? a.geom_rate ?? a.vert_rate);
  const call = flight || (prev?.flight && prev.flight !== "NO CALL" ? prev.flight : "") || "";
  const inType = String(a.t || "");
  const typecode = /^CAT\d/i.test(inType) ? prev?.typecode || "" : inType || prev?.typecode || "";
  const richerPrev = prev && trackRichness(prev) > trackRichness({ src, flight: call, reg: a.r || prev?.reg, typecode, squawk: a.squawk || prev?.squawk, fpl: prev?.fpl, ifps: prev?.ifps });
  const keepAdsb = richerPrev && prev.src === "adsb";
  const row = {
    id,
    src: prev?.src === "mlat" ? "mlat" : keepAdsb ? "adsb" : src,
    flight: call || prev?.flight || "NO CALL",
    silent: Boolean((mlat || /tisb|mode_s|nt/i.test(typ) || !call) && !call),
    reg: String(a.r && !/^[0-9a-f]{6}$/i.test(String(a.r)) ? a.r : prev?.reg || ""),
    typecode,
    desc: String(a.desc || prev?.desc || ""),
    ownOp: String(a.ownOp || a.op || prev?.ownOp || ""),
    year: String(a.year || prev?.year || ""),
    role: planeRole({ ...a, flight: flight || prev?.flight, t: typecode || a.t || prev?.typecode, type: modeS && !pos ? "mode_s" : typ, lat, lon }),
    lat: pos ? lat : prev?.lat || 0,
    lon: pos ? lon : prev?.lon || 0,
    altFt: Math.round(alt || prev?.altFt || 0),
    altBaro: altRaw === "ground" ? 0 : Math.round(finiteNum(a.alt_baro) ?? prev?.altBaro ?? alt),
    gs: gs || prev?.gs || 0,
    tas: finiteNum(a.tas) ?? prev?.tas,
    ias: finiteNum(a.ias) ?? prev?.ias,
    mach: finiteNum(a.mach) ?? prev?.mach,
    track: Math.round(track || prev?.track || 0),
    vs: vs != null ? Math.round(vs) : prev?.vs,
    squawk: String(a.squawk || prev?.squawk || ""),
    emergency: String(a.emergency || prev?.emergency || "") || ( /^(7500|7600|7700)$/.test(String(a.squawk || "")) ? String(a.squawk) : "" ),
    category: String(a.category || prev?.category || ""),
    adsbType: typ || prev?.adsbType || "",
    qnh: finiteNum(a.nav_qnh ?? a.qnh) ?? prev?.qnh,
    nic: finiteNum(a.nic) ?? prev?.nic,
    nacp: finiteNum(a.nac_p ?? a.nacp) ?? prev?.nacp,
    msgs: finiteNum(a.messages ?? a.msgs) ?? prev?.msgs,
    rssi: a.rssi ?? prev?.rssi,
    seen: finiteNum(a.seen) ?? prev?.seen,
    seenPos: finiteNum(a.seen_pos ?? a.seenPos) ?? prev?.seenPos,
    heard: Boolean(a.heard || prev?.heard),
    uaId: a.uaId || prev?.uaId || "",
    model: a.model || prev?.model || "",
    birdtam: Number.isFinite(Number(a.birdtam)) ? Number(a.birdtam) : prev?.birdtam,
    jump: Boolean(prev?.jump),
    taxi: Boolean(prev?.taxi || a.taxi),
    fastLow: Boolean(prev?.fastLow || a.fastLow),
    operator: a.operator || prev?.operator || null,
    home: a.home || prev?.home || null,
    nm: prev?.nm,
    nmId: prev?.nmId,
    touching: prev?.touching,
    fpl: prev?.fpl,
    ifps: prev?.ifps,
    dep: prev?.dep,
    dest: prev?.dest,
    route: prev?.route,
    color: altColor(alt || prev?.altFt),
    km: pos ? Math.round(kmBetween(p.lat, p.lon, lat, lon) * 10) / 10 : prev?.km || 0,
    local: Boolean(prev?.local) || (pos && isLjmsTraffic(lat, lon, alt || prev?.altFt || 0, gs || prev?.gs || 0, prev?.role, src)),
    aglFt: pos
      ? Math.round(
          inRakicanPad(lat, lon, 0.9)
            ? Math.max(0, (alt || prev?.altFt || 0) - RAKICAN.elevFt)
            : inLjceDisk(lat, lon, 12)
            ? Math.max(0, (alt || prev?.altFt || 0) - LJCE.elevFt)
            : inNovoDisk(lat, lon, 10)
              ? Math.max(0, (alt || prev?.altFt || 0) - 600)
              : ljmsAglFt(alt || prev?.altFt || 0),
        )
      : prev?.aglFt,
    asterix: prev?.asterix || /asterix/i.test(typ) || Boolean(a.asterixCat),
    asterixCat: a.asterixCat || (/^CAT\d/i.test(inType) ? inType : prev?.asterixCat),
    noPos: !pos && !hasFix(prev),
  };
  if (row.src === "ogn" || row.src === "mesh" || row.src === "rid" || row.src === "sdr" || row.src === "fpl" || hasCallsign(row)) {
    row.silent = false;
  } else if (row.flight === "NO CALL" || row.silent || row.src === "nm" || row.src === "mode_s") {
    row.silent = true;
  }
  const denseTrail =
    row.role === "heli" ||
    row.role === "balloon" ||
    row.role === "bird" ||
    row.role === "echo" ||
    row.role === "uav" ||
    row.src === "echo" ||
    row.src === "psr" ||
    Boolean(a.passiveBalloon) ||
    row.taxi;
  if (pos) rememberTrail(id, lat, lon, alt, denseTrail);
  const hist = trails.get(id) || [];
  if (hist.length >= 2) {
    const a0 = hist[hist.length - 2];
    const a1 = hist[hist.length - 1];
    const moved = kmBetween(a0.lat, a0.lon, a1.lat, a1.lon);
    const dt = Math.max(1, ((a1.at || 0) - (a0.at || 0)) / 1000);
    if (moved > 0.08) {
      const brg = bearingDeg(a0.lat, a0.lon, a1.lat, a1.lon);
      if (!track || row.role === "bird") row.track = Math.round(brg);
      if ((!gs || row.role === "bird") && dt < 3600) row.gs = Math.round((moved / dt) * 3600 / 1.852);
    }
  }
  row.trail = hist.map((x) => ({
    lat: x.lat,
    lon: x.lon,
    alt: x.alt,
    color: x.color || altColor(x.alt),
    at: x.at,
  }));
  if (row.role === "bird") {
    row.silent = true;
    row.reg = "";
    if (/^flock/i.test(id)) row.flight = "FLOCK";
  }
  if (row.src === "echo" || row.src === "psr") {
    row.silent = true;
    row.reg = "";
    if (a.passiveBalloon || row.role === "balloon" || /^HAB$/i.test(row.typecode) || /^HAB$/i.test(row.flight)) {
      row.role = "balloon";
      row.flight = "HAB";
      if (!/no transponder/i.test(row.desc || "")) {
        row.desc = row.desc ? `${row.desc} · no transponder` : "PSR leftover · slow isolated cell · no transponder";
      }
    } else {
      row.role = "echo";
      row.flight = row.src === "psr" ? "PSR" : "ECHO";
    }
  }
  if (row.role === "aero" || (row.local && AERO_RE.test(row.typecode))) row.role = "aero";
  if (
    /^(RANGR|LSV)/i.test(row.flight) ||
    /^S5-?H/i.test(row.reg) ||
    /^L2-?0[1-4]$/i.test(row.reg) ||
    /^(B06|B206|A532|AS32|H215)$/i.test(row.typecode) ||
    isSiMilHeli(row)
  ) {
    row.role = "heli";
    if (!row.ownOp) row.ownOp = "Slovenska vojska";
  }
  const agl = Number(row.aglFt) || ljmsAglFt(row.altFt);
  if (row.local && JUMP_SHIP_RE.test(row.typecode) && (agl > 3500 || (agl > 800 && (row.vs || 0) < -400))) {
    row.jump = true;
    row.desc = row.desc && !/jump ship/i.test(row.desc) ? `${row.desc} · LJMS jump ship` : row.desc || "LJMS jump ship";
  }
  const field = pos && inLjmsDisk(lat, lon, 6);
  const speedKt = Number(row.gs) || 0;
  const altNow = Number(row.altFt) || 0;
  const echoLeftover = row.src === "echo" || row.src === "psr" || row.role === "echo";
  const fastLow =
    !echoLeftover &&
    row.role !== "bird" &&
    (Boolean(a.fastLow) || (altNow < 2000 && speedKt >= 180 && speedKt < 800));
  const taxiing = isLjmsTaxiing(lat, lon, altNow, speedKt, altRaw, a.on_ground === true);
  if (taxiing && !fastLow) {
    row.taxi = true;
    row.local = true;
    if (!/taxi/i.test(row.desc || "")) {
      row.desc = row.desc ? `${row.desc} · LJMS taxi to runway` : "LJMS taxi to runway";
    }
  } else if (field && (altRaw === "ground" || a.on_ground === true) && speedKt < 3 && !row.desc) {
    row.desc = row.src === "ogn" ? "LJMS field · FLARM, no 1090" : "LJMS field";
  }
  row.fastLow = fastLow && !row.taxi;
  if (row.fastLow && !/low fast/i.test(row.desc || "")) {
    row.desc = row.desc ? `${row.desc} · low fast` : "low fast pass";
  }
  const pad = pos && (inRakicanPad(lat, lon, 0.9) || inLjmsDisk(lat, lon, 6));
  const heliToGround =
    row.role === "heli" &&
    pad &&
    (altRaw === "ground" ||
      a.on_ground === true ||
      speedKt < 55 && (altNow < 900 || (Number(row.aglFt) || 0) < 700));
  const onDeck =
    pos &&
    !echoLeftover &&
    row.role !== "bird" &&
    (altRaw === "ground" ||
      a.on_ground === true ||
      (altNow < 80 && speedKt < 40) ||
      Boolean(heliToGround && (altRaw === "ground" || a.on_ground === true || speedKt < 40 && (Number(row.aglFt) || 0) < 160)));
  row.onDeck = Boolean(onDeck);
  if (row.role === "heli") {
    if (inRakicanPad(lat, lon, 0.9)) {
      row.local = true;
      if (row.onDeck || heliToGround) {
        if (!/raki/i.test(row.desc || "")) {
          row.desc = row.desc
            ? `${row.desc} · SB MS Rakičan helipad`
            : "Slovenska vojska · SB MS Rakičan helipad";
        }
      }
    }
  } else if (row.onDeck && row.role !== "ground" && row.role !== "uav" && speedKt < 45) {
    if (/^C/.test(String(row.category || "")) || /TWR|GND|VEH|OBST/i.test(row.typecode)) row.role = "ground";
  }
  row.low = Boolean(row.taxi || row.fastLow || row.onDeck || heliToGround || (altNow > 0 && altNow < 3500 && row.role !== "bird"));
  if (pos && isLjmsTraffic(lat, lon, row.altFt, row.gs, row.role, row.src)) row.local = true;
  byId.set(id, row);
}

function inSiFir(lat, lon) {
  return lat >= 45.15 && lat <= 47.15 && lon >= 13.0 && lon <= 16.9;
}

const OGN_KIND = {
  1: "GLD",
  2: "TOW",
  3: "HELI",
  4: "CHUTE",
  5: "DROP",
  6: "HANG",
  7: "PARA",
  8: "PWR",
  9: "JET",
  10: "UFO",
  11: "BALL",
  12: "SHIP",
  13: "UAV",
  14: "GND",
  15: "OBST",
};

async function fetchOgnSi() {
  const r = await fetch(
    `https://live.glidernet.org/lxml.php?a=A&b=${SI_BOX.lamax}&c=${SI_BOX.lomax}&d=${SI_BOX.lamin}&e=${SI_BOX.lomin}`,
    {
    headers: { ...UA, accept: "text/xml" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`ogn ${r.status}`);
  const xml = await r.text();
  const rows = [];
  const re = /<m a="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml))) {
    const a = m[1].split(",");
    if (a.length < 12) continue;
    const lat = Number(a[0]);
    const lon = Number(a[1]);
    if (!inSiTheater(lat, lon)) continue;
    const age = ognAgeSec(a);
    const ognType = Number(a[10]) || 0;
    const altM = Number(a[4]) || 0;
    const kmh = Number(a[8]) || 0;
    const onField = inLjmsDisk(lat, lon, 6);
    const fastLow = altM < 600 && kmh >= 280;
    const cruise = (ognType === 0 || ognType === 9) && kmh > 450 && altM > 3500;
    if (cruise && !onField && !fastLow) continue;
    const para = ognType === 4 || ognType === 5 || ognType === 7;
    if (age > ognMaxAgeSec({ onField, uav: ognType === 13, para })) continue;
    if (!onField && !fastLow && altM < 12 && kmh < 3 && ![1, 2, 3, 4, 5, 6, 7, 8, 11, 13, 14, 15].includes(ognType)) continue;
    const cn = String(a[2] || "").trim();
    const call = String(a[3] || "").trim(); // lxml: a[2]=CN (71), a[3]=reg (I-D871)
    const ognid = String(a[13] || a[12] || call || cn).toLowerCase();
    if (!ognid || ognid.length < 4) continue;
    const hexIdent = (s) => /^[0-9A-Fa-f]{6,8}$/.test(String(s || "").replace(/[\s-]+/g, ""));
    const reg = call && !call.startsWith("_") && !hexIdent(call) ? call : "";
    const flight = reg || (cn && !cn.startsWith("_") && !hexIdent(cn) ? cn : "");
    const taxi = onField && !fastLow && altM < 50 && kmh >= 6 && kmh < 80;
    rows.push({
      hex: `ogn-${ognid.replace(/[^a-z0-9]/g, "").slice(-8)}`,
      icao: String(a[12] || "").toLowerCase(),
      flight,
      r: reg || cn,
      t: OGN_KIND[ognType] || "OGN",
      lat,
      lon,
      alt_geom: altM * 3.28084,
      gs: kmh / 1.852,
      track: Number(a[7]) || 0,
      type: "flarm",
      category: ognType === 13 ? "B6" : ognType === 4 ? "B3" : ognType === 14 || ognType === 15 ? "C3" : undefined,
      ognType,
      desc: ognType === 4
        ? "skydiver / parachute"
        : fastLow
          ? "low fast · FLARM/OGN, no 1090 needed"
          : taxi
            ? "LJMS taxi to runway · FLARM, no 1090"
            : ognType === 8
              ? "FLARM powered, no ADS-B"
              : undefined,
      seen: age,
      rx: a[11],
      taxi,
      fastLow,
    });
  }
  return rows;
}

function ingestMeshAirborne(_byId, _p) {
  /* Mesh GPS is not a drone. Do not invent UAVs from Meshtastic nodes. */
}

function numField(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    if (obj[k] == null || obj[k] === "") continue;
    const n = Number(obj[k]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function ridCandidates(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body.flatMap(ridCandidates);
  if (typeof body !== "object") return [];
  const bags = [
    body.detections,
    body.rid,
    body.drones,
    body.items,
    body.aircraft,
    body.messages,
    body.targets,
    body.RemoteID,
    body.OpenDroneID,
    body.opendroneid,
    body.drone,
    body.data?.rid,
    body.data?.detections,
    body.data?.drones,
  ];
  const out = [body];
  for (const b of bags) {
    if (Array.isArray(b)) out.push(...b);
    else if (b && typeof b === "object") out.push(b);
  }
  return out;
}

function parseRidRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const data = raw.data && typeof raw.data === "object" ? raw.data : {};
  const loc = raw["Location/Vector Message"] || raw["Location/Vector"] || raw.location || raw.Location || data.location || raw;
  const sys = raw["System Message"] || raw.system || raw.System || data.system || {};
  const basic = raw["Basic ID"] || raw["Basic ID Message"] || raw.basic_id_message || raw.basic || data.basic || raw;
  const self = raw["Self-ID Message"] || raw.self_id || raw.selfId || data.self_id || {};
  const lat =
    numField(raw, ["drone_lat", "drone_latitude", "lat", "latitude", "Latitude"]) ??
    numField(data, ["drone_lat", "drone_latitude", "lat", "latitude"]) ??
    numField(loc, ["lat", "latitude", "drone_lat", "Latitude"]);
  const lon =
    numField(raw, ["drone_lon", "drone_long", "drone_longitude", "lon", "lng", "longitude"]) ??
    numField(data, ["drone_lon", "drone_long", "drone_longitude", "lon", "lng", "longitude"]) ??
    numField(loc, ["lon", "lng", "longitude", "drone_lon"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) < 0.2 || Math.abs(lon) < 0.2) return null;
  const altM =
    numField(raw, ["drone_altitude", "altgeo", "alt_geo", "geodetic_altitude", "alt", "altitude", "height_agl", "height"]) ??
    numField(loc, ["geodetic_altitude", "altitude", "height_agl", "alt"]) ??
    0;
  let spd = numField(raw, ["speed", "gs", "horizontal_speed", "ground_speed", "drone_speed"]) ?? numField(loc, ["speed", "horizontal_speed"]) ?? 0;
  if (spd > 80) spd = spd / 3.6;
  const track = numField(raw, ["heading", "track", "course", "direction"]) ?? numField(loc, ["heading", "track", "direction"]) ?? 0;
  const serial = String(
    raw.osid ||
      raw.serial_number ||
      raw.serial ||
      raw.basic_id ||
      raw.ua_id ||
      raw.uas_id ||
      raw.UASID ||
      raw["UAS ID"] ||
      raw.mac ||
      raw["MAC address"] ||
      data.basic_id ||
      data.osid ||
      data["MAC address"] ||
      data.mac ||
      basic.id ||
      basic.UASID ||
      basic["UAS ID"] ||
      basic.ua_id ||
      basic.basic_id ||
      raw.id ||
      "",
  ).trim();
  if (!serial || serial.length < 3) return null;
  const selfText = String(self.text || self.description || raw.self_id || raw.ssid || raw.SSID || "").trim();
  const guessed = recognizeDjiRid({
    serial,
    model: String(raw.device_type || raw.model || raw.description || self.text || basic.description || ""),
    uaType: basic.ua_type || basic.UAType || raw.ua_type,
    text: selfText,
    ssid: raw.ssid || raw.SSID,
  });
  const model = guessed.model;
  const opLat = numField(raw, ["pilot_lat", "op_lat", "operator_lat", "app_lat"]) ?? numField(sys, ["latitude", "lat", "operator_lat"]);
  const opLon = numField(raw, ["pilot_long", "pilot_lon", "op_lon", "operator_lon", "app_lon"]) ?? numField(sys, ["longitude", "lon", "operator_lon"]);
  const homeLat = numField(raw, ["home_lat"]) ?? numField(sys, ["home_lat"]);
  const homeLon = numField(raw, ["home_lon", "home_long"]) ?? numField(sys, ["home_lon"]);
  const id = `rid-${serial.replace(/[^a-z0-9]/gi, "").slice(-12).toLowerCase()}`;
  if (id.length < 6) return null;
  const tail = serial.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() || "RID";
  return {
    id,
    serial,
    call: guessed.dji ? `DJI${tail}` : tail,
    model,
    dji: guessed.dji,
    lat,
    lon,
    altM,
    gsKt: spd * 1.94384,
    track,
    rssi: numField(raw, ["rssi", "RSSI"]) ?? numField(data, ["rssi", "RSSI"]),
    opLat: Number.isFinite(opLat) && Math.abs(opLat) > 0.2 ? opLat : null,
    opLon: Number.isFinite(opLon) && Math.abs(opLon) > 0.2 ? opLon : null,
    homeLat: Number.isFinite(homeLat) ? homeLat : null,
    homeLon: Number.isFinite(homeLon) ? homeLon : null,
    at: Date.now(),
  };
}

function rememberRid(row) {
  const parsed = parseRidRow(row);
  if (!parsed) return false;
  const prev = ridTracks.get(parsed.id);
  ridTracks.set(parsed.id, {
    ...parsed,
    opLat: parsed.opLat ?? prev?.opLat ?? null,
    opLon: parsed.opLon ?? prev?.opLon ?? null,
    homeLat: parsed.homeLat ?? prev?.homeLat ?? null,
    homeLon: parsed.homeLon ?? prev?.homeLon ?? null,
    at: Date.now(),
  });
  return true;
}

function ingestRidBody(body) {
  let n = 0;
  for (const row of ridCandidates(body)) if (rememberRid(row)) n += 1;
  const now = Date.now();
  for (const [id, r] of ridTracks) if (now - r.at > 90_000) ridTracks.delete(id);
  return n;
}

function expireMap(map, ms = 90_000) {
  const now = Date.now();
  for (const [id, r] of map) if (!r?.at || now - r.at > ms) map.delete(id);
}

function ingestDump1090(body) {
  const rec = sdrFeed.ingestDump1090(body);
  expireMap(sdrTracks);
  return rec;
}

function rfHowto(api) {
  const sdr = publicApi("/api/sdr");
  return {
    site: "Murska Sobota · 46.659 N 16.172 E · antenna 70–1200 MHz",
    url: api,
    get: `${api}?import=1&lat=46.659&lon=16.172&mhz=433.92&mode=rtl_433&name=Murska%20Sobota%20SDR`,
    bands: RF_BANDS,
    steps: [
      "One tuner sees ~2.4 MHz at a time. Do not try to watch 70–1200 MHz in one shot.",
      "Best unique data from this site: lock rtl_433 on 433.92 MHz (weather / ISM). Public ADS-B already covers most 1090 traffic.",
      "If you have a second dongle, lock it on 1090 and Beast-export like the car radio.",
      `Heartbeat: curl '${api}?import=1&lat=46.659&lon=16.172&mhz=433.92&mode=rtl_433'`,
      `ISM: rtl_433 -f 433.92M -F json | while read -r line; do curl -sS -H 'Content-Type: application/json' -d "$line" ${api}; done`,
      `ADS-B JSON: curl -H 'Content-Type: application/json' --data-binary @/run/readsb/aircraft.json ${api}`,
      `APRS: POST {\"type\":\"aprs\",\"from\":\"S56ABC\",\"lat\":46.66,\"lon\":16.17,\"comment\":\"...\"}`,
      "Pins show on Sensors and OPS. Radar stays aircraft-only; when the station is live the yellow disk recenters on Murska Sobota.",
      "Do not feed GSM/LTE/TETRA/pager decodes. Those are dropped.",
    ],
    http: { url: api, method: "POST", body: "rtl_433 JSON, APRS JSON, AIS JSON, or dump1090 aircraft.json" },
    adsb: { url: sdr, tcp: sdrHowto({}).tcp },
  };
}

function sdrHowto(req) {
  const host = sdrFeed.status.tcpHost || process.env.SDR_TCP_HOST || "";
  const port = sdrFeed.status.tcpPort || Number(process.env.SDR_PUBLIC_PORT || process.env.SDR_TCP_PORT || 50001);
  return {
    phone: {
      title: "Exportdata on your phone",
      steps: [
        "Leave Export Beast / AVR / BaseStation server toggles OFF. Those only listen on the phone.",
        "Turn ON Active export to a host (TCP client).",
        `Hostname: ${host || "see Data tab after the feeder comes up"}`,
        `Port: ${port}`,
        "Save and keep the radio app in the foreground while driving. Aircraft you hear appear under Car SDR on Radar.",
      ],
    },
    tcp: { host, port, accept: ["Beast", "SBS-1", "AVR"] },
    http: {
      url: publicApi("/api/sdr"),
      method: "POST",
          body: "Beast binary (0x1a), dump1090/readsb aircraft.json, SBS-1 MSG lines, or AVR *hex;",
          aliases: ["/api/sdr", "/api/beast", "/api/dump1090", "/api/raw"],
          beast: "POST application/octet-stream Beast frames, AVR *hex;, SBS-1, Mode S hex, or TCP 50001. Better: dump1090 --net-bo-port or readsb beast out to that TCP. out.adsb.lol:1365 is feeder-IP only.",
    },
    decoders: [
      { id: "traffic-130", name: "xoolive/traffic #130", url: "https://github.com/xoolive/traffic/discussions/130", feed: false, note: "pyModeS / Impala ideas. Analysis, not a public CAT stream." },
      { id: "libmodes", name: "watson/libmodes", url: "https://github.com/watson/libmodes", feed: false, note: "dump1090-derived C decoder for 56/112-bit Mode S. Same family as /api/sdr AVR." },
      { id: "java-adsb", name: "openskynetwork/java-adsb", url: "https://github.com/openskynetwork/java-adsb", feed: false, note: "Java DF17/18 ADS-B. Successor lib1090. Not ASTERIX CAT 048." },
    ],
    note: "Those three repos decode 1090ES Mode S/ADS-B frames. We already ingest Beast/AVR/SBS on /api/sdr. They are not ASTERIX and not a public live API.",
  };
}

async function loadNmBoard() {
  return cached(cache.nm, NM_FMPS.join(","), 55_000, 180_000, async () => {
    const now = Date.now() / 1000;
    const [merged, regs] = await Promise.all([
      fetchNmFlightsMerged(14_000),
      fetchNmJson("/eurocontrol/regulations", 10_000).catch(() => ({ features: [] })),
    ]);
    return {
      at: new Date().toISOString(),
      fmp: NM_FMP,
      fmps: merged.fmps,
      source: nmSource(),
      flights: merged.flights,
      regulations: parseNmRegs(regs),
    };
  });
}

function expireFplTracks() {
  const now = Date.now();
  for (const [id, r] of fplTracks) {
    const ttl = r?.src === "ifps" ? 4 * 60 * 60_000 : 15 * 60_000;
    if (!r?.at || now - r.at > ttl) fplTracks.delete(id);
  }
}

function ingestFplTracks(byId, p) {
  expireFplTracks();
  const now = Date.now();
  for (const a of fplTracks.values()) {
    const ttl = a.src === "ifps" ? 4 * 60 * 60_000 : 15 * 60_000;
    if (now - a.at > ttl) continue;
    const flight = String(a.flight || "").replace(/\s+/g, "");
    let best = null;
    let bestD = 28;
    for (const prev of byId.values()) {
      const same = flight && prev.flight && String(prev.flight).replace(/\s+/g, "") === flight;
      if (same) {
        best = prev;
        bestD = 0;
        break;
      }
      if (a.src === "ifps") continue;
      if (a.lat && a.lon) {
        const d = kmBetween(prev.lat, prev.lon, a.lat, a.lon);
        if (d < bestD && Math.abs((prev.altFt || 0) - (a.altFt || 0)) < 5000) {
          best = prev;
          bestD = d;
        }
      }
    }
    const filed = (a.trail || []).map((t) => ({
      lat: t.lat,
      lon: t.lon,
      alt: t.alt || 0,
      color: t.color || "#c9a227",
      future: true,
      filed: true,
    }));
    if (best) {
      best.fpl = true;
      if (a.src === "ifps") best.ifps = true;
      best.dep = a.dep || best.dep;
      best.dest = a.dest || best.dest;
      best.route = a.route || best.route;
      if (filed.length) best.trail = [...(best.trail || []).filter((t) => !t.future).slice(-TRAIL_SEND_PAST), ...filed];
      continue;
    }
    if ((!a.lat || !a.lon) && filed[0]) {
      a.lat = filed[0].lat;
      a.lon = filed[0].lon;
    }
    if (!a.lat || !a.lon) continue;
    if (p === PLACES.si ? !inSiTheater(a.lat, a.lon) : kmBetween(p.lat, p.lon, a.lat, a.lon) > p.rKm + 40) continue;
    const hex = `fpl${(a.flight || a.code || "x").toLowerCase()}`;
    ingestPlane(
      byId,
      {
        hex,
        flight: a.flight,
        t: a.typecode,
        r: a.reg,
        lat: a.lat,
        lon: a.lon,
        alt_geom: a.altFt,
        gs: a.gs,
        track: a.track,
        type: a.src === "ifps" ? "ifps" : "fpl",
      },
      p,
    );
    const row = byId.get(hex);
    if (row) {
      row.fpl = true;
      row.ifps = a.src === "ifps";
      row.dep = a.dep;
      row.dest = a.dest;
      row.silent = false;
      row.trail = filed.slice(-TRAIL_SEND_MAX);
    }
  }
}

function ingestNmTracks(byId, p, nm) {
  if (!nm?.flights?.length) return { n: 0, matched: 0, unmatched: 0 };
  const planes = [...byId.values()];
  let matched = 0;
  let unmatched = 0;
  for (const a of nm.flights) {
    if (p === PLACES.si ? !inSiTheater(a.lat, a.lon) : kmBetween(p.lat, p.lon, a.lat, a.lon) > p.rKm + 40) continue;
    const best = findRicherMate(planes, a.lat, a.lon, a.altFt, a.track, a.gs, 40);
    const ljla = Array.isArray(a.fmps) && a.fmps.includes("LJLAFMP");
    if (best) {
      best.nm = true;
      best.nmId = a.id;
      if (a.touching) best.touching = true;
      tagIfpsOnPlane(best, { touching: a.touching, ljla });
      const extra = (a.trail || [])
        .filter((t) => t.future)
        .slice(0, TRAIL_SEND_FUT)
        .map((t) => ({ lat: t.lat, lon: t.lon, alt: t.alt, color: "#9ad0ff", future: true }));
      if (extra.length) best.trail = [...(best.trail || []).slice(-TRAIL_SEND_PAST), ...extra];
      matched += 1;
      continue;
    }
    if (!keepNmOnlyPlot(a)) continue;
    ingestPlane(
      byId,
      {
        hex: `nm${a.id}`,
        flight: "",
        lat: a.lat,
        lon: a.lon,
        alt_geom: a.altFt,
        gs: a.gs,
        track: a.track,
        type: "nm",
        seen: 0,
      },
      p,
    );
    const row = byId.get(`nm${a.id}`);
    if (row) {
      row.nm = true;
      row.nmId = a.id;
      row.touching = a.touching;
      row.silent = true;
      tagIfpsOnPlane(row, { nmOnly: true, touching: a.touching, ljla });
      row.trail = (a.trail || []).slice(-TRAIL_SEND_MAX).map((t) => ({
        lat: t.lat,
        lon: t.lon,
        alt: t.alt,
        color: t.future ? "#9ad0ff" : altColor(t.alt),
        future: t.future,
      }));
      unmatched += 1;
    }
  }
  return { n: matched + unmatched, matched, unmatched };
}

function ingestSdrTracks(byId, p) {
  expireMap(sdrTracks);
  const now = Date.now();
  for (const a of sdrTracks.values()) {
    if (now - a.at > 90_000) continue;
    const prev = byId.get(a.hex);
    if (prev) {
      prev.heard = true;
      if (a.rssi != null) prev.rssi = a.rssi;
      if (a.flight) {
        prev.flight = a.flight;
        if (prev.flight !== "NO CALL") prev.silent = prev.src === "mlat" ? prev.silent : false;
      }
      if (a.lat && a.lon) {
        prev.lat = a.lat;
        prev.lon = a.lon;
        if (a.alt_geom) prev.altFt = Math.round(a.alt_geom);
        if (a.gs) prev.gs = a.gs;
        if (a.track) prev.track = Math.round(a.track);
        if (prev.src !== "mlat") prev.src = "sdr";
        prev.km = Math.round(kmBetween(p.lat, p.lon, a.lat, a.lon) * 10) / 10;
        rememberTrail(a.hex, a.lat, a.lon, a.alt_geom || prev.altFt);
      }
      continue;
    }
    if (a.lat && a.lon) {
      ingestPlane(byId, { ...a, heard: true }, p);
    } else {
      ingestPlane(byId, { ...a, type: a.type || "mode_s", heard: true }, p);
    }
    const row = byId.get(a.hex);
    if (row) row.heard = true;
  }
}

function ingestRidTracks(byId, p) {
  const now = Date.now();
  for (const [id, r] of ridTracks) {
    if (now - r.at > 90_000) {
      ridTracks.delete(id);
      continue;
    }
    if (p === PLACES.si ? !(inUavTheater(r.lat, r.lon) || inSiTheater(r.lat, r.lon)) : kmBetween(p.lat, p.lon, r.lat, r.lon) > p.rKm + 20) continue;
    ingestPlane(
      byId,
      {
        hex: r.id,
        flight: r.call,
        r: r.serial,
        t: r.model,
        lat: r.lat,
        lon: r.lon,
        alt_geom: r.altM * 3.28084,
        gs: r.gsKt,
        track: r.track,
        type: "rid",
        category: "B6",
        rssi: r.rssi,
        uaId: r.serial,
        model: r.model,
        operator: r.opLat != null ? { lat: r.opLat, lon: r.opLon } : null,
        home: r.homeLat != null ? { lat: r.homeLat, lon: r.homeLon } : null,
        seen: (now - r.at) / 1000,
      },
      p,
    );
  }
}

function readBody(req, limit = 800_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readBodyBuffer(req, limit = 800_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function ridAuthOk(req, url) {
  const tok = process.env.RID_TOKEN || "";
  if (!tok) return true;
  const hdr = String(req.headers.authorization || "");
  return hdr === `Bearer ${tok}` || url.searchParams.get("token") === tok;
}

let lastAsterixPack = null;
let lastAsterixPackAt = 0;
let lastRadarItems = [];

function snapshotAsterixPack(force = false) {
  if (!force && lastAsterixPack && Date.now() - lastAsterixPackAt < 12_000) return lastAsterixPack;
  const pack = encodeLiveAsterix(lastRadarItems, radarOriginStatus() || DEFAULT_RADAR);
  lastAsterixPack = pack;
  lastAsterixPackAt = Date.now();
  return pack;
}

async function loadRadar(place) {
  const axLive = listAsterix().length > 0 || listAsterixStations().length > 0 || Boolean(process.env.ASTERIX_FEED_URL);
  const snap = await cached(cache.radar, `${place}:${liveGen}`, axLive ? 3_000 : 8_000, 90_000, () => buildRadar(place));
  if (snap?.items?.length) {
    applyLiveRoutes(snap.items);
    if (snap.counts) {
      snap.counts.fpl = snap.items.filter((x) => x.fpl || x.src === "fpl").length;
      snap.counts.ifps = snap.items.filter((x) => x.ifps || x.src === "ifps").length;
    }
  }
  return snap;
}

async function buildRadar(place) {
  const p = PLACES[place] || PLACES.si;
  const wide = place === "si";
  const lobe = radioLobe();
  const diskNm = wide ? 280 : Math.max(50, Math.min(250, Math.round(p.rKm * 0.7)));
  const extraNm = wide ? 220 : 140;
  const needRadioDisk = Boolean(lobe.fix && kmBetween(p.lat, p.lon, lobe.fix.lat, lobe.fix.lon) > 70);
  const missing = lobe.heard.filter((hex) => {
    const t = sdrTracks.get(hex);
    return t && !(t.lat && t.lon);
  });
  const byId = new Map();
  const [adsbRows, radioRows, skyRows, ognRows, hexRows, nmBoard, uavBoard, birdBoard, sondeBoard, echoBoard, tar1090Board, ultraBoard, ljmsRows, rakicanRows, ljceRows, novoRows, milRows, itRows] = await Promise.all([
    fetchAdsbAround(p.lat, p.lon, diskNm).catch(() => []),
    needRadioDisk ? fetchAdsbAround(lobe.fix.lat, lobe.fix.lon, extraNm).catch(() => []) : Promise.resolve([]),
    Promise.resolve(openSkyCache.rows || []),
    fetchOgnSi().catch(() => []),
    missing.length ? fetchAdsbHexes(missing).catch(() => []) : Promise.resolve([]),
    loadNmBoard().catch(() => ({ flights: [], regulations: [], fmp: NM_FMP })),
    fetchUavPublic().catch(() => ({ ogn: [], adsb: [], n: 0 })),
    fetchBirdPublic().catch(() => ({ flocks: [], tagged: [], n: 0 })),
    fetchSondePublic({ lat: p.lat, lon: p.lon, meters: 1_200_000 }).catch(() => ({ sondes: [], amateur: [], n: 0 })),
    fetchEchoPublic().catch(() => ({ echoes: [], n: 0 })),
    fetchTar1090Public({ lat: p.lat, lon: p.lon, nm: Math.max(diskNm, 280) }).catch(() => ({ aircraft: [], n: 0 })),
    fetchUltrafeederPublic().catch(() => ({ aircraft: [], n: 0, leftover: 0, hits: {} })),
    fetchAdsbAround(LJMS.lat, LJMS.lon, 20, { lists: false }).catch(() => []),
    fetchAdsbAround(RAKICAN.lat, RAKICAN.lon, 8, { lists: false }).catch(() => []),
    wide ? Promise.resolve([]) : fetchAdsbAround(LJCE.lat, LJCE.lon, 50, { lists: false }).catch(() => []),
    wide ? Promise.resolve([]) : fetchAdsbAround(NOVO_MESTO.lat, NOVO_MESTO.lon, 40, { lists: false }).catch(() => []),
    fetchSiMilWatch().catch(() => []),
    wide ? fetchAdsbAround(IT_HUB.lat, IT_HUB.lon, IT_HUB.nm, { lists: false }).catch(() => []) : Promise.resolve([]),
  ]);
  tar1090Status = tar1090Board;
  for (const a of adsbRows) ingestPlane(byId, a, p);
  for (const a of radioRows) ingestPlane(byId, a, p);
  for (const a of ljmsRows) ingestPlane(byId, a, p);
  for (const a of rakicanRows) ingestPlane(byId, a, p);
  for (const a of ljceRows) ingestPlane(byId, a, p);
  for (const a of novoRows) ingestPlane(byId, a, p);
  for (const a of milRows) ingestPlane(byId, a, p);
  for (const a of itRows) ingestPlane(byId, a, p);
  for (const a of skyRows) {
    const icao = normalizeIcao(a.hex);
    if (a.type === "asterix" && icao && byId.has(icao)) continue;
    ingestPlane(byId, a, p);
  }
  for (const a of hexRows) ingestPlane(byId, a, p);
  for (const a of tar1090Board.aircraft || []) ingestPlane(byId, a, p);
  for (const a of ultraBoard.aircraft || []) ingestPlane(byId, a, p);
  for (const a of ognRows) {
    if (a.icao && a.icao.length >= 6 && byId.has(a.icao)) continue;
    ingestPlane(byId, a, p);
  }
  for (const a of uavBoard.adsb || []) ingestPlane(byId, a, p);
  for (const a of uavBoard.ogn || []) {
    if (a.icao && a.icao.length >= 6 && byId.has(a.icao)) continue;
    ingestPlane(byId, a, p);
  }
  ingestMeshAirborne(byId, p);
  ingestRidTracks(byId, p);
  for (const a of birdBoard.tagged || []) ingestPlane(byId, a, p);
  for (const a of birdBoard.flocks || []) ingestPlane(byId, a, p);
  const keptEchoes = [];
  for (const a of echoBoard.echoes || []) {
    const echoAltM = Number(a.alt_geom || a.alt_baro || 0) * 0.3048;
    let mate = null;
    for (const x of byId.values()) {
      if (!x.lat || x.role === "echo" || x.role === "bird" || x.noPos) continue;
      if (!/adsb|ogn|mlat|rid|sdr/.test(x.src || "")) continue;
      if (kmBetween(x.lat, x.lon, a.lat, a.lon) > 2.2) continue;
      const mateAltM = (Number(x.altFt) || 0) * 0.3048;
      const lowMate =
        mateAltM < 700 ||
        x.role === "small" ||
        x.role === "heli" ||
        x.role === "uav" ||
        x.role === "soar" ||
        x.role === "glider" ||
        x.src === "ogn" ||
        x.src === "rid";
      if (lowMate || Math.abs(mateAltM - echoAltM) < 350) {
        mate = x;
        break;
      }
    }
    if (mate) continue;
    ingestPlane(byId, a, p);
    keptEchoes.push(a);
  }
  const tagEchoCat048 = (echoes, origin, site) => {
    const buf = encodeEchoesCat048(echoes, origin, site);
    if (!buf) return;
    ingestLeftoverCat048(buf, origin);
    for (const a of echoes) {
      const id = String(a.hex || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
      const row = byId.get(id);
      if (!row) continue;
      row.asterix = true;
      row.asterixCat = "CAT048";
    }
  };
  tagEchoCat048(
    keptEchoes.filter((a) => a.echoSite !== "fvg"),
    ARSO_ORIGIN,
    PSR_SITES.arso,
  );
  tagEchoCat048(
    keptEchoes.filter((a) => a.echoSite === "fvg"),
    { lat: 46.055, lon: 14.21, theta0: 0 },
    PSR_SITES.fvg,
  );
  const nearFlocks = (birdBoard.flocks || []).filter(
    (a) => a.lat && a.lon && kmBetween(ARSO_ORIGIN.lat, ARSO_ORIGIN.lon, a.lat, a.lon) < 250 * 1.852,
  );
  tagEchoCat048(nearFlocks, ARSO_ORIGIN, PSR_SITES.vogel);
  const ultraLeft = otherwiseInvisibleSky(ultraBoard.aircraft || []);
  for (const a of ultraLeft) {
    const id = String(a.hex || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (id && !byId.has(id)) ingestPlane(byId, a, p);
  }
  const feederLeft = [...byId.values()].filter((row) => {
    if (!row.lat || row.noPos || row.asterix) return false;
    if (row.src === "adsb" || row.src === "ogn" || row.src === "mlat" || row.src === "rid" || row.src === "echo" || row.src === "psr" || row.src === "sdr") return false;
    if (row.role === "ground") return false;
    if (isIdentifiedAdsb(row)) return false;
    return isFeederLeftover(row) || /tisb|adsb_icao_nt/i.test(String(row.adsbType || row.src || ""));
  });
  tagEchoCat048(
    feederLeft.map((row) => ({ lat: row.lat, lon: row.lon, alt_geom: row.altFt, gs: row.gs, track: row.track, hex: row.id })),
    ARSO_ORIGIN,
    PSR_SITES.feeder,
  );
  for (const a of sondeBoard.sondes || []) ingestPlane(byId, a, p);
  for (const a of sondeBoard.amateur || []) ingestPlane(byId, a, p);
  ingestSdrTracks(byId, p);
  for (const t of listAsterix()) {
    const icao = normalizeIcao(t.icao);
    if (icao && byId.has(icao)) {
      const row = byId.get(icao);
      row.asterix = true;
      row.asterixCat = `CAT${String(t.cat || 48).padStart(3, "0")}`;
    }
  }
  const visible = [...byId.values()];
  for (const a of asterixGapTracks(byId.keys())) {
    if ((a.type === "psr" || a.echo) && isLeftoverPsrSite(a.sac, a.sic)) continue;
    const mate = findRicherMate(visible, a.lat, a.lon, a.alt_geom, a.track, a.gs, 14);
    if (mate) {
      mate.asterix = true;
      mate.asterixCat = a.asterixCat || mate.asterixCat;
      continue;
    }
    ingestPlane(byId, a, p);
  }
  const nmHit =   ingestNmTracks(byId, p, nmBoard);
  ingestFplTracks(byId, p);
  absorbGhostTracks(byId);
  collapseTwinTracks(byId);
  lastRadarItems = [...byId.values()].filter((x) => x.lat && x.lon && !x.noPos);
  const items = [...byId.values()]
    .filter((x) => {
      if (x.noPos || isModeSTrack(x)) return true;
      if (inSiFir(x.lat, x.lon) || x.local || x.taxi || x.fastLow || x.role === "heli" || x.role === "chute" || x.role === "aero" || x.role === "balloon" || x.onDeck) return true;
      if (x.role === "ground" || x.onDeck || x.taxi) {
        return inSiTheater(x.lat, x.lon) || kmBetween(p.lat, p.lon, x.lat, x.lon) <= diskNm * 1.852 + 20 || x.heard || x.local;
      }
      if (x.role === "uav" || x.src === "rid" || x.role === "bird" || x.role === "echo" || x.src === "psr" || x.role === "balloon") {
        if (x.role === "bird" || x.role === "echo" || x.src === "psr" || x.role === "balloon") return kmBetween(p.lat, p.lon, x.lat, x.lon) <= 1200;
        return wide ? inUavTheater(x.lat, x.lon) || inSiTheater(x.lat, x.lon) : kmBetween(p.lat, p.lon, x.lat, x.lon) <= p.rKm + 40;
      }
      if (!wide) return true;
      if (inSiTheater(x.lat, x.lon) || x.src === "sdr" || x.src === "nm" || x.src === "fpl" || x.src === "asterix" || x.heard || x.nm || x.ifps) return true;
      return Boolean(lobe.fix && kmBetween(lobe.fix.lat, lobe.fix.lon, x.lat, x.lon) <= 380);
    })
    .sort((a, b) => {
      const rare = (x) => (x.role === "uav" || x.src === "rid" || x.role === "bird" || x.role === "echo" || x.src === "psr" || x.role === "balloon" || x.role === "heli" || x.role === "chute" || x.role === "aero" || x.local || x.taxi || x.fastLow || x.role === "ground" || isModeSTrack(x) ? 0 : 1);
      const sky = (r) => (r === "jet" ? 1 : 0);
      const mine = (x) => (x.heard || x.src === "sdr" || x.fpl || x.ifps || x.asterix ? 0 : 1);
      return rare(a) - rare(b) || mine(a) - mine(b) || sky(a.role) - sky(b.role) || a.km - b.km;
    });
  applyLiveRoutes(items);
  for (const x of items) tagIfpsOnPlane(x, { nmOnly: x.src === "nm" });
  const snap = {
    at: new Date().toISOString(),
    place,
    lat: p.lat,
    lon: p.lon,
    radio: lobe.fix,
    n: items.length,
    counts: {
      jet: items.filter((x) => x.role === "jet").length,
      heli: items.filter((x) => x.role === "heli").length,
      small: items.filter((x) => x.role === "small").length,
      uav: items.filter((x) => x.role === "uav").length,
      bird: items.filter((x) => x.role === "bird").length,
      echo: items.filter((x) => x.src === "echo" || x.src === "psr").length,
      chute: items.filter((x) => x.role === "chute").length,
      aero: items.filter((x) => x.role === "aero").length,
      local: items.filter((x) => x.local).length,
      ljmsDisk: items.filter((x) => inLjmsDisk(x.lat, x.lon, 16)).length,
      asterix: items.filter((x) => x.asterix || x.src === "asterix" || x.src === "psr").length,
      asterixEcho: items.filter((x) => (x.src === "echo" || x.src === "psr") && (x.asterix || x.src === "psr")).length,
      asterixBird: items.filter((x) => x.asterix && x.role === "bird").length,
      asterixFeeder: items.filter((x) => x.asterix && x.src !== "echo" && x.src !== "psr" && x.role !== "bird" && x.src !== "adsb" && x.src !== "ogn").length,
      asterixAtc: items.filter((x) => x.src === "asterix").length,
      openSky: openSkyCache.rows.length,
      jump: items.filter((x) => x.role === "chute" || x.jump).length,
      taxi: items.filter((x) => x.taxi).length,
      ultra: ultraBoard.n || 0,
      ultraHeli: ultraBoard.heli || 0,
      ultraBalloon: ultraBoard.balloon || 0,
      ultraLeftover: feederLeft.length,
      low: items.filter((x) => x.low).length,
      fastLow: items.filter((x) => x.fastLow).length,
      soar: items.filter((x) => x.role === "soar").length,
      glider: items.filter((x) => x.role === "glider").length,
      balloon: items.filter((x) => x.role === "balloon").length,
      sonde: items.filter((x) => /^sonde/.test(x.id)).length,
      unknown: items.filter((x) => x.role === "unknown").length,
      mlat: items.filter((x) => x.src === "mlat").length,
      ogn: items.filter((x) => x.src === "ogn").length,
      rid: items.filter((x) => x.src === "rid").length,
      sdr: items.filter((x) => x.src === "sdr").length,
      adsb: items.filter((x) => x.src === "adsb").length,
      adsbFeeds: adsbFeedStatus.hits,
      nm: items.filter((x) => x.nm || x.src === "nm").length,
      fpl: items.filter((x) => x.fpl || x.src === "fpl").length,
      ifps: items.filter((x) => x.ifps || x.src === "ifps").length,
      arr: items.filter((x) => isSiArrival(x.dest)).length,
      heard: items.filter((x) => x.heard).length,
      silent: items.filter((x) => x.silent).length,
      sky: items.filter((x) => x.role !== "jet").length,
      ground: items.filter((x) => x.role === "ground" || x.onDeck || x.taxi).length,
      modes: items.filter((x) => isModeSTrack(x)).length,
    },
    flow: {
      fmp: nmBoard.fmp || NM_FMP,
      fmps: (nmBoard.fmps || []).map((x) => x.fmp),
      n: nmHit.n,
      matched: nmHit.matched,
      unmatched: nmHit.unmatched,
      regulations: (nmBoard.regulations || [])
        .filter(
          (r) =>
            (r.lat && r.lon && inSiTheater(r.lat, r.lon)) ||
            /LJ|LOWW|LHBP|LDZA|LJLJ|LJMB|LJPZ|Slovenia|Vienna|Budapest|Zagreb|Maribor/i.test(`${r.id} ${r.name} ${r.fmp}`),
        )
        .slice(0, 12),
    },
    items: items.map((x) => {
      const t = pruneTrail(x.trail || []);
      const fut = t.filter((p) => p.future).slice(0, x.role === "balloon" ? TRAIL_SEND_FUT : 8);
      const dense =
        x.role === "heli" ||
        x.role === "balloon" ||
        x.role === "bird" ||
        x.role === "echo" ||
        x.src === "psr" ||
        x.onDeck ||
        x.taxi;
      const past = selectTrailPast(t.filter((p) => !p.future), Date.now(), dense ? TRAIL_SEND_DENSE : TRAIL_SEND_MAX, {
        dense,
      });
      return { ...x, trail: fut.length ? [...past, ...fut] : past };
    }),
    sats: [],
    note: [
      nmHit.n
        ? `EUROCONTROL NSV ${NM_FMPS.join("+")}: ${nmHit.matched} matched to ADS-B/MLAT, ${nmHit.unmatched} NM-only in theater. Radar NM chip plots those 4D tracks; IFPS chip is IFPZ dep/dest plus NM-only leftover. Cyan remainder on NM/IFPS/FPL chips. Not CAT 048.`
        : `EUROCONTROL NSV ${NM_FMPS.join("+")} live. Empty theater is a fact.`,
      lobe.fix?.name
        ? `${lobe.fix.name} is live. ${lobe.heard.length ? `It heard ${lobe.heard.length} ICAO hexes.` : "Waiting for 1090 frames."}`
        : lobe.heard.length
          ? `Your radio heard ${lobe.heard.length} ICAO hexes.`
          : "Public ADS-B from adsb.lol + adsb.fi volunteer feeders (ODbL) plus tar1090 type/ICAO watch lists (WPTK awesome-planespotting-list: UAV, B06/A139, GLID/ULAC, EU ambulance/VIP). No ADSBexchange globe scrape. Raw Beast on out.adsb.lol is feeder-IP only — POST AVR/Beast to /api/sdr. That raw is Mode S, not ASTERIX CAT 048.",
      (items.filter((x) => x.role === "uav" || x.src === "rid").length
        ? `Live UAV ${items.filter((x) => x.role === "uav" || x.src === "rid").length}: OGN type 13 + ADS-B B6/Q4 + GitHub ultrafeeder/plane-alert-db UAV hexes, plus local RID.`
        : "No live UAV in the Alpine OGN/ADS-B/ultrafeeder box. RID is local POST /api/rid. AMC is HTML chrome."),
      `Ultrafeeder sky ${ultraBoard.n || 0}: heli ${ultraBoard.heli || 0} · balloon ${ultraBoard.balloon || 0} · small ${ultraBoard.small || 0} · taxi ${items.filter((x) => x.taxi).length} driving to the LJMS runway (not parked) · leftover CAT 048 ${feederLeft.length}. Identified ADS-B/FLARM stays that identity.`,
      (items.filter((x) => x.role === "bird").length
        ? `Live birds ${items.filter((x) => x.role === "bird").length}: Vogelradar BIRDTAM flocks + GPS tags seen today. RainViewer tiles are precip over SI, not extra bird tracks.`
        : "No fresh Vogelradar BIRDTAM flocks/tags in range. RainViewer WX overlay is precipitation (covers Slovenia). Do not read rain as birds."),
      (items.filter((x) => x.src === "echo" || x.src === "psr").length
        ? `Passive ${items.filter((x) => x.src === "echo" || x.src === "psr").length} is weather-radar leftover (no transponder). Those same cells go through leftover CAT 048 POST/UDP, so ASTX tracks Passive when leftover 1090/ATC radar is empty — not a copied KPI.`
        : "No isolated ARSO/FVG leftovers this scan to ingest as CAT 048 primary."),
      (items.filter((x) => x.role === "balloon").length
        ? `Live balloons ${items.filter((x) => x.role === "balloon").length}: SondeHub/amateur HAB with a receiver plus leftover CAT 048 slow isolated cells (no transponder). RainViewer precip is not a balloon.`
        : "No balloon with a receiver and no slow leftover PSR cell this scan. RainViewer is precip only."),
      `LJMS field ${items.filter((x) => x.local).length} · taxi ${items.filter((x) => x.taxi).length} driving to runway · ${items.filter((x) => inLjmsDisk(x.lat, x.lon, 16)).length} in 16 nm. ASTX ${items.filter((x) => x.asterix || x.src === "asterix" || x.src === "psr").length} = ${items.filter((x) => (x.src === "echo" || x.src === "psr") && (x.asterix || x.src === "psr")).length} weather-radar CAT 048 + ${items.filter((x) => x.asterix && x.role === "bird").length} BIRDTAM + ${items.filter((x) => x.asterix && x.src !== "echo" && x.src !== "psr" && x.role !== "bird").length} leftover 1090/ATC (OpenSky ${openSkyCache.rows.length} cached, ${items.filter((x) => x.src === "asterix").length} unmatched). True leftover radar is CAT 048 POST/UDP :${asterixUdpListenPort() || ASTERIX_UDP_DEFAULT}. NM/IFPS chips are 4D, not CAT. Drones plot from OGN/ADS-B B6, not CAT. Identified ADS-B is not re-ingested as ASTERIX — that was the empty triple. Export pack is /api/asterix.raw only. Mode S ${items.filter((x) => isModeSTrack(x)).length} is leftover 1090 without a fix, not CAT.`,
      `LJCE ${items.filter((x) => inLjceDisk(x.lat, x.lon, 20)).length} · Novo mesto ${items.filter((x) => inNovoDisk(x.lat, x.lon, 16)).length} · heli ${items.filter((x) => x.role === "heli").length} · Rakičan pad ${items.filter((x) => x.role === "heli" && inRakicanPad(x.lat, x.lon, 0.9)).length} · aero ${items.filter((x) => x.role === "aero").length} · jump ${items.filter((x) => x.role === "chute" || x.jump).length}.`,
    ].join(" "),
  };
  return snap;
}

function gtwRow(g, src, p) {
  const loc = g.location || g;
  const lat = Number(loc.latitude || loc.lat || g.lat);
  const lon = Number(loc.longitude || loc.lon || g.lon);
  if (!lat || !lon) return null;
  const updated = g.updatedAt || g.last_seen || g.updated || "";
  const ageMin = updated ? Math.max(0, (Date.now() - Date.parse(updated)) / 60_000) : null;
  return {
    id: String(g.id || g.eui || g.gateway_id || `${lat},${lon}`),
    eui: String(g.eui || g.eui_id || ""),
    name: String(g.name || g.id || "gateway"),
    src,
    lat,
    lon,
    alt: Number(loc.altitude || loc.alt || g.altitude || 0) || 0,
    online: ageMin == null ? Boolean(g.online) : ageMin < 30,
    ageMin: ageMin != null ? Math.round(ageMin) : null,
    updated,
    cluster: g.clusterID || g.network || "",
    km: Math.round(kmBetween(p.lat, p.lon, lat, lon) * 10) / 10,
    kind: "gateway",
  };
}

async function loadLora(place) {
  return cached(cache.lora, place, 30_000, 180_000, () => buildLora(place));
}

async function buildLora(place) {
  const p = PLACES[place] || PLACES.si;
  const dist = Math.round(p.rKm * 1000);
  const [ttnR, pbR] = await Promise.allSettled([
    jget("https://www.thethingsnetwork.org/gateway-data/country/si", 6_000),
    jget(
      `https://mapper.packetbroker.net/api/v2/gateways?distanceWithin[latitude]=${p.lat}&distanceWithin[longitude]=${p.lon}&distanceWithin[distance]=${dist}`,
      6_000,
    ),
  ]);
  const seen = new Set();
  const gateways = [];
  const add = (row) => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    gateways.push(row);
  };
  if (ttnR.status === "fulfilled") {
    const obj = ttnR.value || {};
    for (const g of Object.values(obj)) add(gtwRow(g, "ttn", p));
  }
  if (pbR.status === "fulfilled" && Array.isArray(pbR.value)) {
    for (const g of pbR.value) add(gtwRow(g, "packetbroker", p));
  }
  gateways.sort((a, b) => a.km - b.km);
  const msgs = meshMsgs
    .filter((m) => !m.lat || kmBetween(p.lat, p.lon, m.lat, m.lon) < p.rKm + 80)
    .slice(0, 80);
  const nodes = [...meshNodes.values()]
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(0, 120);
  const tti = await loadTtiUplinks().catch(() => []);
  const snap = {
    at: new Date().toISOString(),
    place,
    lat: p.lat,
    lon: p.lon,
    nGtw: gateways.length,
    nOnline: gateways.filter((g) => g.online).length,
    nMesh: nodes.length,
    nMsg: msgs.length + tti.length,
    gateways: gateways.slice(0, 80),
    nodes,
    messages: [...tti, ...msgs].slice(0, 60),
    stream: meshStream.slice(0, 40),
    note: "TTN + Packet Broker gateways are live. Mesh decode is public Meshtastic MQTT. Application LoRaWAN uplinks need TTI_API_KEY. No simulated packets.",
  };
  return snap;
}

async function loadTtiUplinks() {
  const key = process.env.TTI_API_KEY || "";
  const cluster = process.env.TTI_CLUSTER || "eu1.cloud.thethings.network";
  if (!key.startsWith("NNSXS.")) return [];
  const app = process.env.TTI_APP || "";
  if (!app) return [];
  const r = await fetch(`https://${cluster}/api/v3/as/applications/${encodeURIComponent(app)}/packages/storage/uplink_message?limit=40`, {
    headers: { ...UA, authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return [];
  const txt = await r.text();
  const rows = [];
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      const res = j.result || j;
      const up = res.uplink_message || res;
      rows.push({
        id: String(res.unique_id || up.received_at || Math.random()),
        kind: "tti",
        name: res.end_device_ids?.device_id || "device",
        detail: JSON.stringify(up.decoded_payload || up.frm_payload || {}).slice(0, 180),
        rssi: up.rx_metadata?.[0]?.rssi,
        snr: up.rx_metadata?.[0]?.snr,
        at: Date.parse(up.received_at || res.received_at || 0) || Date.now(),
        lat: up.locations?.user?.latitude || up.rx_metadata?.[0]?.location?.latitude || null,
        lon: up.locations?.user?.longitude || up.rx_metadata?.[0]?.location?.longitude || null,
      });
    } catch {
      /* skip */
    }
  }
  return rows;
}

async function loadSwitches(place) {
  const p = PLACES[place] || PLACES.ms;
  const hit = cache.switches.get(place);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.data;
  const rKm = Math.min(p.rKm, 42);
  const dLat = rKm / 111;
  const dLon = rKm / (111 * Math.cos((p.lat * Math.PI) / 180));
  const s = p.lat - dLat;
  const w = p.lon - dLon;
  const n = p.lat + dLat;
  const e = p.lon + dLon;
  const q = `[out:json][timeout:20];node["railway"="switch"](${s},${w},${n},${e});out body;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { ...UA, "content-type": "text/plain" },
    body: q,
    signal: AbortSignal.timeout(22_000),
  });
  if (!r.ok) throw new Error(`overpass ${r.status}`);
  const data = await r.json();
  const items = (data.elements || [])
    .map((el) => {
      if (!el.lat || !el.lon) return null;
      return {
        id: `sw-${el.id}`,
        kind: "switch",
        name: el.tags?.ref || el.tags?.name || `switch ${el.id}`,
        ref: el.tags?.ref || "",
        lat: el.lat,
        lon: el.lon,
        km: Math.round(kmBetween(p.lat, p.lon, el.lat, el.lon) * 10) / 10,
        occ: false,
        href: `https://www.openstreetmap.org/node/${el.id}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km)
    .slice(0, 160);
  const snap = { at: new Date().toISOString(), items };
  cache.switches.set(place, { at: Date.now(), data: snap });
  return snap;
}

function downsample(rows, n = 48) {
  const pts = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ t: Date.parse(r.createdAt || r.created_at || 0), v: Number(r.value) }))
    .filter((p) => Number.isFinite(p.v) && p.t);
  pts.sort((a, b) => a.t - b.t);
  if (pts.length <= n) return pts;
  const step = pts.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(pts[Math.min(pts.length - 1, Math.floor(i * step))]);
  out[out.length - 1] = pts[pts.length - 1];
  return out;
}

async function loadBoxSeries(boxId, sensorId) {
  const key = `${boxId}:${sensorId}`;
  const hit = seriesCache.get(key);
  if (hit && Date.now() - hit.at < 90_000) return hit.data;
  const from = new Date(Date.now() - 6 * 3600_000).toISOString();
  const rows = await jget(
    `https://api.opensensemap.org/boxes/${boxId}/data/${sensorId}?from-date=${encodeURIComponent(from)}&format=json`,
    6_000,
  );
  const pts = downsample(rows, 32);
  seriesCache.set(key, { at: Date.now(), data: pts });
  return pts;
}

function pickPrimary(sensors) {
  const list = sensors || [];
  return (
    list.find((s) => /pm2\.?5/i.test(s.title || "")) ||
    list.find((s) => /pm10/i.test(s.title || "")) ||
    list.find((s) => /temp/i.test(s.title || "")) ||
    list[0]
  );
}

async function attachLiveSeries(items) {
  const targets = items.filter((b) => b.kind === "air" || b.kind === "climate").slice(0, 10);
  await Promise.all(
    targets.map(async (b) => {
      const primary = pickPrimary(b.sensors);
      if (!primary?.id) return;
      try {
        const pts = await loadBoxSeries(b.id, primary.id);
        if (!pts.length) return;
        const last = pts[pts.length - 1];
        primary.last = last.v;
        primary.at = new Date(last.t).toISOString();
        b.series = [{ id: primary.id, title: primary.title, unit: primary.unit, pts }];
        b.primary = { title: primary.title, unit: primary.unit, last: last.v };
      } catch {
        /* keep list-only card */
      }
    }),
  );
  return items;
}

async function loadSenseBoxes(place) {
  return cached(cache.sensors, place, 60_000, 300_000, () => buildSenseBoxes(place));
}

async function buildSenseBoxes(place) {
  const p = PLACES[place] || PLACES.si;
  const dLat = p.rKm / 111;
  const dLon = p.rKm / (111 * Math.cos((p.lat * Math.PI) / 180));
  const bbox = `${p.lon - dLon},${p.lat - dLat},${p.lon + dLon},${p.lat + dLat}`;
  const data = await jget(`https://api.opensensemap.org/boxes?bbox=${bbox}`, 6_000);
  const list = Array.isArray(data) ? data : [];
  const items = list
    .map((b) => {
      const [lon, lat] = b.currentLocation?.coordinates || b.loc?.[0]?.geometry?.coordinates || [];
      if (!lat || !lon) return null;
      const sensors = (b.sensors || []).map((s) => {
        const lm = s.lastMeasurement;
        const last = lm && typeof lm === "object" ? lm.value ?? lm.lastMeasurement : undefined;
        return {
          id: s._id || s.id,
          title: s.title,
          unit: s.unit,
          last,
          at: (lm && typeof lm === "object" && (lm.createdAt || lm.updatedAt)) || b.lastMeasurementAt,
        };
      });
      const blob = `${b.name || ""} ${JSON.stringify(sensors)} ${b.grouptag || ""}`;
      const kind = /pm|dust|sds|feinstaub|air quality/i.test(blob)
        ? "air"
        : /temp|hum|bme|dht/i.test(blob)
          ? "climate"
          : "sense";
      return {
        id: String(b._id || b.id),
        kind,
        name: b.name || "senseBox",
        lat,
        lon,
        km: Math.round(kmBetween(p.lat, p.lon, lat, lon) * 10) / 10,
        sensors,
        model: b.model || "",
        lastAt: b.lastMeasurementAt || "",
        href: `https://opensensemap.org/explore/${b._id || b.id}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km)
    .slice(0, 48);
  await attachLiveSeries(items).catch(() => items);
  return { at: new Date().toISOString(), items };
}

async function loadSz(place) {
  const p = PLACES[place] || PLACES.si;
  try {
    if (!cache.sz.items.length || Date.now() - cache.sz.at > 25_000) {
      const list = await jget("https://api.modra.ninja/sz/lokacije", 6_000);
      if (Array.isArray(list)) {
        cache.sz = { at: Date.now(), items: list };
      }
    }
    const list = cache.sz.items;
    if (!Array.isArray(list)) return [];
    return list
      .map((t) => {
        const lat = Number(t.lat);
        const lon = Number(t.lng);
        if (!lat || !lon) return null;
        return {
          id: `sz-${t.rang_vlaka}-${t.st_vlaka}`,
          kind: "train",
          name: `${t.rang_vlaka || "SŽ"} ${t.st_vlaka}`,
          lat,
          lon,
          km: Math.round(kmBetween(p.lat, p.lon, lat, lon) * 10) / 10,
          detail: t.relacija,
          stop: t.naslednja_postaja,
        };
      })
      .filter(Boolean)
      .filter((t) => t.km < p.rKm)
      .sort((a, b) => a.km - b.km);
  } catch {
    return [];
  }
}

function markSwitchOcc(switches, trains) {
  for (const sw of switches) {
    const hit = trains.find((t) => kmBetween(sw.lat, sw.lon, t.lat, t.lon) < 0.38);
    sw.occ = Boolean(hit);
    sw.train = hit?.name || "";
  }
  return switches;
}

async function loadSensorsBoard(place) {
  const p = PLACES[place] || PLACES.si;
  const [sw, boxes, trains] = await Promise.all([
    loadSwitches(place).catch(() => ({ items: [] })),
    loadSenseBoxes(place).catch(() => ({ items: [] })),
    loadSz(place).catch(() => []),
  ]);
  const switches = markSwitchOcc(sw.items || [], trains);
  const mesh = [...meshNodes.values()].map((n) => ({ ...n, kind: n.kind || "mesh" }));
  const rf = wigleFeed.asSensors(p);
  const wb = widebandFeed.asSensors(p);
  const cachedGtw = cache.lora.get(place)?.data?.gateways || [];
  const boxItems = Array.isArray(boxes?.items) ? boxes.items : [];
  const items = [
    ...boxItems,
    ...switches.map((s) => ({ ...s, kind: "switch" })),
    ...mesh,
    ...cachedGtw.slice(0, 24).map((g) => ({ ...g, kind: "gateway" })),
    ...trains.slice(0, 12),
    ...rf,
    ...wb,
  ];
  const byKind = {};
  for (const it of items) byKind[it.kind] = (byKind[it.kind] || 0) + 1;
  const graphs = [
    ...boxItems
      .filter((b) => b.series?.[0]?.pts?.length)
      .slice(0, 8)
      .map((b) => ({
        id: b.id,
        name: b.name,
        kind: b.kind,
        title: b.series[0].title,
        unit: b.series[0].unit,
        last: b.primary?.last ?? b.series[0].pts.at(-1)?.v,
        pts: b.series[0].pts,
      })),
    ...widebandFeed.graphs(),
  ].slice(0, 12);
  const wbNote = widebandFeed.status.n || widebandFeed.liveStation()
    ? ` Murska Sobota SDR: ${widebandFeed.status.ism} ISM · ${widebandFeed.status.aprs} APRS · ${widebandFeed.status.ais} AIS.`
    : " POST rtl_433 / APRS / AIS JSON from the Murska Sobota radio to /api/rf.";
  return {
    at: new Date().toISOString(),
    place,
    counts: byKind,
    n: items.length,
    items,
    switches,
    boxes: boxItems,
    trains,
    messages: [...widebandFeed.messages(), ...wigleFeed.messages(), ...meshMsgs.slice(0, 40)].sort((a, b) => (b.at || 0) - (a.at || 0)),
    graphs,
    note: (wigleFeed.status.n
      ? `WiGLE/phone RF live: ${wigleFeed.status.wifi} Wi-Fi · ${wigleFeed.status.bluetooth} BT · ${wigleFeed.status.cell} cell, plus OpenSenseMap, OSM switches, mesh, SŽ GPS.`
      : "OpenSenseMap, OSM switches, Meshtastic, TTN/Packet Broker, SŽ GPS. POST WiGLE CSV/JSON to /api/wigle for live Wi-Fi/BT/cell from the phone.") + wbNote,
  };
}

async function loadOps(place, view = "ops") {
  const key = `${place}:${view || "ops"}`;
  return cached(cache.ops, `${key}:${liveGen}`, 3_000, 20_000, () => buildOps(place, view));
}

async function buildOps(place, view = "ops") {
  const wantRadar = view === "ops" || view === "radar" || view === "data";
  const wantLora = view === "ops" || view === "lora" || view === "sensors";
  const wantSensors = view === "ops" || view === "sensors" || view === "lora";
  const [radar, lora, sensors] = await Promise.all([
    wantRadar
      ? loadRadar(place).catch((e) => ({ items: [], n: 0, error: String(e.message || e), counts: {} }))
      : Promise.resolve(null),
    wantLora
      ? loadLora(place).catch((e) => ({ gateways: [], messages: [], nodes: [], nGtw: 0, error: String(e.message || e) }))
      : Promise.resolve(null),
    wantSensors
      ? loadSensorsBoard(place).catch((e) => ({ items: [], n: 0, error: String(e.message || e), counts: {} }))
      : Promise.resolve(null),
  ]);
  return { at: new Date().toISOString(), place, radar, lora, sensors, publicUrl: publicBase() };
}

function seriesPush(from, field, v) {
  const n = Number(v);
  if (!Number.isFinite(n) || !from) return;
  const row = meshSeries.get(from) || {};
  const arr = row[field] || [];
  const last = arr[arr.length - 1];
  if (last && Date.now() - last.t < 1500 && last.v === n) return;
  arr.push({ t: Date.now(), v: n });
  if (arr.length > 80) arr.shift();
  row[field] = arr;
  meshSeries.set(from, row);
}

function flatten(obj, acc = {}) {
  if (!obj || typeof obj !== "object") return acc;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, acc);
    else if (typeof v === "number") acc[k] = v;
    else if (typeof v === "string" && v !== "" && Number.isFinite(Number(v))) acc[k] = Number(v);
    else if (typeof v === "string" && v && acc[k] == null && k.length < 40) acc[k] = v;
  }
  return acc;
}

function meshLatLon(flat, pos, payload, j) {
  const latI = Number(pos.latitude_i || payload.latitude_i || flat.latitude_i || 0);
  const lonI = Number(pos.longitude_i || payload.longitude_i || flat.longitude_i || 0);
  const lat = latI ? latI / 1e7 : Number(pos.latitude || payload.latitude || flat.latitude || j.latitude || 0);
  const lon = lonI ? lonI / 1e7 : Number(pos.longitude || payload.longitude || flat.longitude || j.longitude || 0);
  const ok = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
  return ok ? { lat, lon } : { lat: null, lon: null };
}

function decodeMesh(j) {
  const payload = j.payload && typeof j.payload === "object" ? j.payload : {};
  const flat = flatten(payload);
  Object.assign(flat, flatten(j));
  const port = String(j.type || payload.portnum || j.portnum || "mesh").toLowerCase();
  const pos = payload.position || j.position || payload;
  const { lat, lon } = meshLatLon(flat, pos || {}, payload, j);
  const text = payload.text || payload.message || j.text || "";
  const bits = [];
  if (text) bits.push(String(text).slice(0, 140));
  const bat = flat.battery_level ?? flat.battery;
  const volt = flat.voltage;
  const temp = flat.temperature ?? flat.temp;
  const hum = flat.relative_humidity ?? flat.humidity;
  const press = flat.barometric_pressure ?? flat.pressure;
  const alt = pos.altitude ?? flat.altitude;
  if (bat != null) bits.push(`bat ${Math.round(Number(bat))}%`);
  if (volt != null && Number(volt) > 0.2) bits.push(`${Number(volt).toFixed(2)}V`);
  if (temp != null && Number(temp) !== 0) bits.push(`${Number(temp).toFixed(1)}°C`);
  if (hum != null && Number(hum) !== 0) bits.push(`RH ${Number(hum).toFixed(0)}%`);
  if (press != null && Number(press) > 10) bits.push(`${Number(press).toFixed(0)} Pa`);
  if (alt != null && Number(alt)) bits.push(`alt ${Math.round(Number(alt))}m`);
  const from = String(j.sender || j.from || "");
  if (from) {
    seriesPush(from, "rssi", j.rssi);
    seriesPush(from, "snr", j.snr);
    seriesPush(from, "temp", temp);
    seriesPush(from, "battery", bat);
    seriesPush(from, "humidity", hum);
    seriesPush(from, "voltage", volt);
    if (lat && lon) rememberTrail(`mesh-${from}`, lat, lon, Number(alt) || 0);
  }
  const name = j.sender || payload.user?.longName || payload.user?.long_name || String(j.from || "node");
  return {
    id: `${j.from || "x"}-${j.id || Date.now()}`,
    kind: "mesh",
    port,
    from,
    fromName: name,
    name,
    detail: bits.join(" · ") || port,
    rssi: j.rssi,
    snr: j.snr,
    hops: j.hops_away ?? j.hop_limit,
    lat,
    lon,
    alt: alt != null ? Number(alt) : null,
    at: Date.now(),
    decoded: {
      port,
      text: text || null,
      battery: bat ?? null,
      voltage: volt ?? null,
      temp: temp ?? null,
      humidity: hum ?? null,
      pressure: press ?? null,
      alt: alt ?? null,
    },
    trail: lat ? (trails.get(`mesh-${from}`) || []).map((x) => ({ lat: x.lat, lon: x.lon })) : [],
  };
}

function meshPush(msg) {
  meshMsgs.unshift(msg);
  if (meshMsgs.length > 250) meshMsgs.length = 250;
  meshStream.unshift(msg);
  if (meshStream.length > 200) meshStream.length = 200;
  emitPkt(msg);
  if (msg.from) {
    const prev = meshNodes.get(msg.from) || { id: msg.from, kind: "mesh", name: msg.fromName || msg.from };
    const series = meshSeries.get(msg.from);
    meshNodes.set(msg.from, {
      ...prev,
      ...msg,
      id: `mesh-${msg.from}`,
      kind: "mesh",
      name: msg.fromName || prev.name || msg.from,
      lat: msg.lat || prev.lat,
      lon: msg.lon || prev.lon,
      alt: msg.alt ?? prev.alt,
      battery: msg.decoded?.battery ?? prev.battery,
      voltage: msg.decoded?.voltage ?? prev.voltage,
      temp: msg.decoded?.temp ?? prev.temp,
      humidity: msg.decoded?.humidity ?? prev.humidity,
      at: msg.at,
      trail: (trails.get(`mesh-${msg.from}`) || []).map((x) => ({ lat: x.lat, lon: x.lon })),
      series: series
        ? Object.entries(series)
            .filter(([, pts]) => Array.isArray(pts) && pts.length > 1)
            .map(([title, pts]) => ({ title, unit: title === "rssi" ? "dBm" : title === "temp" ? "°C" : title === "battery" ? "%" : "", pts }))
        : prev.series,
    });
  }
}

function startMeshMqtt() {
  const url = process.env.MESH_MQTT_URL || "mqtt://mqtt.meshtastic.org:1883";
  const client = mqtt.connect(url, {
    username: process.env.MESH_MQTT_USER || "meshdev",
    password: process.env.MESH_MQTT_PASS || "large4cats",
    clientId: `opsdash-${Math.random().toString(16).slice(2)}`,
    reconnectPeriod: 8_000,
    protocolVersion: 4,
  });
  client.on("connect", () => {
    client.subscribe(["msh/EU_868/2/json/#", "msh/2/json/#"], { qos: 0 });
  });
  client.on("message", (_topic, buf) => {
    try {
      const j = JSON.parse(buf.toString());
      const msg = decodeMesh(j);
      meshPush(msg);
    } catch {
      /* ignore */
    }
  });
  client.on("error", () => {});
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const cors = CORS;
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  try {
    if (url.pathname === "/api/health") {
      sendJson(req, res, {
        ok: true,
        url: publicBase(),
        at: new Date().toISOString(),
        upSec: Math.round(process.uptime()),
        meshNodes: meshNodes.size,
        meshMsgs: meshMsgs.length,
        rid: ridTracks.size,
        ridFeed: Boolean(process.env.RID_FEED_URL || ""),
        uav: "ogn13+adsb-b6+ultrafeeder-sky+rid",
        sdr: sdrTracks.size,
        sdrClients: sdrFeed.status.clients,
        sdrFeed: Boolean(process.env.SDR_FEED_URL || ""),
        sdrBeast: Boolean(process.env.SDR_BEAST_HOST || ""),
        birds: "vogelradar",
        sondes: "sondehub",
        rainviewer: "weather-maps",
        wigle: wigleFeed.status.n,
        wideband: widebandFeed.status.n,
        msSdr: Boolean(widebandFeed.liveStation()),
        nmFmp: NM_FMP,
        fpl: fplTracks.size,
        fplLive: liveRouteStatus().n,
        ifps: [...fplTracks.values()].filter((x) => x.src === "ifps").length,
        ifpsLive: listLiveRoutes().filter((x) => x.ifps || inIfpsZone(x.dep) || inIfpsZone(x.dest)).length,
        arrivals: listLiveRoutes().filter((x) => isSiArrival(x.dest)).length,
        nmFmps: NM_FMPS.join("+"),
        met: "awc+meteoalarm",
        ifpsManual: IFPS_EDITION,
        swim: SWIM_CATALOG.length,
        rtca: "chrome",
        chrome: CHROME_SCRIPTS.length,
        eaup: "gwt",
        mainpages: "gwt",
        eatm: "catalog",
        aptApi: APT_API_EDITION,
        ogc: OGC_WFS_TE_DOC,
        airm: "catalog",
        esassp: ESASSP_EDITION,
        mica: MICA_EDITION,
        ecDash: DATA_APP_VER,
        nsvStats: "/eurocontrol/statistics",
        ecApt: "data-app+corner",
        crco: "sheet+monthly",
        openSky: openSkyCache.rows.length,
        openSkyAt: openSkyCache.at || 0,
        openSkyAuth: Boolean(openSkyCreds()),
        openSkyErr: openSkyStatus.lastErr || "",
        openSkyRemaining: openSkyStatus.remaining,
        asterix: listAsterix().length,
        asterixStations: listAsterixStations().length,
        asterixLive: lastAsterixPack
          ? { n021: lastAsterixPack.n021, n048: lastAsterixPack.n048, n062: lastAsterixPack.n062, bytes: lastAsterixPack.bytes }
          : null,
        asterixFeed: Boolean(process.env.ASTERIX_FEED_URL || ""),
        asterixUdp: asterixUdpListenPort(),
        asterixUdpDefault: ASTERIX_UDP_DEFAULT,
        adsb: "lol+fi+tar1090",
        adsbFeeds: adsbFeedStatus.hits,
        tar1090: tar1090Status.n || 0,
        tar1090Watch: tar1090Status.watch || 0,
        places: Object.keys(PLACES),
      });
      return;
    }
    if (url.pathname === "/api/rainviewer" || url.pathname === "/api/wx-radar") {
      const board = await cached(cache.uav, "rainviewer", 60_000, 180_000, () =>
        fetchRainviewer().catch((e) => ({ n: 0, frames: [], error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: board.n || 0,
        host: board.host || "",
        generated: board.generated || 0,
        version: board.version || "",
        now: board.now || null,
        frames: board.frames || [],
        coverage: board.coverage || "",
        error: board.error,
        howto: {
          note: "Public RainViewer Weather Maps API: 2 hours of composite reflectivity, 10-minute steps, 1200+ radars including Slovenia. Tiles are precip/snow. Not BIRDTAM and not aircraft. Attribution: rainviewer.com",
          url: publicApi("/api/rainviewer"),
          maps: RAINVIEWER_MAPS,
          site: RAINVIEWER_SITE,
          api: RAINVIEWER_API,
          example: RAINVIEWER_EXAMPLE,
          tiles: board.now?.tiles || "",
          maxNativeZoom: 7,
          color: 2,
          options: "1_1",
        },
      });
      return;
    }
    if (url.pathname === "/api/sondes" || url.pathname === "/api/sondehub") {
      const pub = await cached(cache.uav, "sondes", 30_000, 90_000, () =>
        fetchSondePublic().catch((e) => ({ sondes: [], amateur: [], n: 0, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: pub.n || 0,
        sondes: (pub.sondes || []).length,
        amateur: (pub.amateur || []).length,
        items: [...(pub.sondes || []), ...(pub.amateur || [])].slice(0, 40),
        howto: {
          note: "SondeHub v2 latest telemetry in an 850 km disk around LJ. Weather radiosondes plus amateur HAB still in the air. Ground APRS is dropped.",
          url: publicApi("/api/sondes"),
          sondes: SONDEHUB_SONDES,
          amateur: SONDEHUB_AMATEUR,
          site: SONDEHUB_SITE,
        },
      });
      return;
    }
    if (url.pathname === "/api/echo" || url.pathname === "/api/arso" || url.pathname === "/api/passive") {
      const pub = await cached(cache.uav, "echo", 45_000, 120_000, () =>
        fetchEchoPublic().catch((e) => ({ echoes: [], n: 0, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: pub.n || 0,
        time: pub.time || "",
        items: (pub.echoes || []).slice(0, 280),
        howto: {
          note: "ARSO SI0 leftovers plus OSMER FVG geo VMI overlays are encoded as CAT 048 primary (no Mode S address) and ingested. Public ultrafeeder TIS-B/NT leftovers (balloons, helis, LJMS taxi without a richer ADS-B/FLARM mate) use SAC 0 SIC 3 FEEDPSR. lv1 speckle is dropped; weak cells must persist two scans; altitude is the lowest C-band beam, not 25 m. Not a tail number. Identified ADS-B is not re-ingested.",
          url: publicApi("/api/echo"),
          zm: ARSO_ZM,
          radar: ARSO_RADAR,
          srd3: ARSO_SRD3,
          fvg: FVG_RADAR,
          fvgJson: FVG_RADAR_JSON,
        },
        fvg: pub.fvg || 0,
        arso: pub.arso || pub.n || 0,
      });
      return;
    }
    if (url.pathname === "/api/tar1090") {
      const pub = await cached(cache.uav, "tar1090", 45_000, 120_000, () =>
        fetchTar1090Public().catch((e) => ({ aircraft: [], n: 0, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: pub.n || 0,
        watch: pub.watch || 0,
        hits: pub.hits || {},
        items: (pub.aircraft || []).slice(0, 80),
        howto: {
          note: "Public tar1090/readsb JSON: adsb.lol + adsb.fi type and ICAO watch lists from WPTK/awesome-planespotting-list (UAV, B06/A139, gliders, EU ambulance/VIP). Globe ?icao= filters, not ADSBexchange scrape. Aircraft with a transponder stay ADS-B; they are not re-ingested as ASTERIX.",
          url: publicApi("/api/tar1090"),
          topic: TAR1090_TOPIC,
          list: TAR1090_LIST,
          tar1090: TAR1090_REPO,
        },
      });
      return;
    }
    if (url.pathname === "/api/birds" || url.pathname === "/api/vogelradar") {
      const pub = await cached(cache.uav, "birds", 30_000, 90_000, () =>
        fetchBirdPublic().catch((e) => ({ flocks: [], tagged: [], n: 0, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: pub.n || 0,
        flocks: (pub.flocks || []).length,
        tagged: (pub.tagged || []).length,
        radarTs: pub.radarTs || "",
        coverage: pub.coverage || null,
        items: [...(pub.tagged || []), ...(pub.flocks || [])].slice(0, 80),
        howto: {
          note: "Flocks are Vogelradar weather-radar BIRDTAM (bioscatter), not invented birds. GPS tags only if marked live and seen today. Coverage is Benelux/Germany; Slovenia sits on the south edge. RainViewer tiles on Radar are precipitation over SI — not extra flocks.",
          url: publicApi("/api/birds"),
          radar: VOGEL_RADAR,
          birds: VOGEL_BIRDS,
          site: VOGEL_SITE,
          rainviewer: publicApi("/api/rainviewer"),
        },
      });
      return;
    }
    if (url.pathname === "/api/uav" || url.pathname === "/api/drone" || url.pathname === "/api/drones") {
      const now = Date.now();
      const pub = await cached(cache.uav, "public", 15_000, 60_000, () =>
        fetchUavPublic().catch((e) => ({ ogn: [], adsb: [], n: 0, error: String(e.message || e) })),
      );
      const rid = [...ridTracks.values()].filter((r) => now - r.at < 90_000);
      const items = [
        ...(pub.ogn || []).map((a) => ({
          id: a.hex,
          src: "ogn",
          call: a.flight,
          model: a.model || "OGN UAV",
          lat: a.lat,
          lon: a.lon,
          altM: (Number(a.alt_geom) || 0) / 3.28084,
          gsKt: a.gs,
          track: a.track,
          category: "B6",
        })),
        ...(pub.adsb || []).map((a) => ({
          id: a.hex,
          src: "adsb",
          call: String(a.flight || "").trim() || a.hex,
          model: a.t || a.desc || "ADS-B UAV",
          lat: a.lat,
          lon: a.lon,
          altM: (Number(a.alt_geom || a.alt_baro) || 0) / 3.28084,
          gsKt: a.gs,
          track: a.track,
          category: a.category || "B6",
        })),
        ...rid.map((r) => ({
          id: r.id,
          src: "rid",
          call: r.call,
          model: r.model,
          lat: r.lat,
          lon: r.lon,
          altM: r.altM,
          gsKt: r.gsKt,
          track: r.track,
          category: "B6",
          operator: r.opLat != null ? { lat: r.opLat, lon: r.opLon } : null,
          home: r.homeLat != null ? { lat: r.homeLat, lon: r.homeLon } : null,
        })),
      ];
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: items.length,
        feeds: items.length ? 1 : 0,
        ogn: (pub.ogn || []).length,
        adsb: (pub.adsb || []).length,
        ultra: pub.ultra || 0,
        ultraWatch: pub.ultraWatch || 0,
        rid: rid.length,
        box: UAV_BOX,
        items,
        howto: {
          note: "Live UAV is OGN type 13, ADS-B B6/Q4, GitHub sdr-enthusiasts ultrafeeder globe JSON (theairtraffic aircraft.json) and plane-alert-db UAV hexes (ODbL). The same public feeders also feed radar balloons, helicopters, and LJMS taxi (a plane driving to the runway). Small DJI still needs local RID POST. No ADSBexchange globe scrape.",
          url: publicApi("/api/uav"),
          rid: publicApi("/api/rid"),
          ogn: UAV_OGN,
          ultrafeeder: ULTRAFEEDER_REPO,
          image: ULTRAFEEDER_IMAGE,
          planeAlert: PLANE_ALERT_DB,
          globe: TAT_GLOBE,
          opendata: OPENDATA_REPO,
          steps: [
            "Radar Drones chip plots live OGN/ADS-B UAV plus ultrafeeder/plane-alert matches in the Alpine box.",
            "The same ultrafeeder JSON also plots balloons, helicopters, and LJMS taxi (driving to the runway, not parked).",
            "TIS-B/NT leftovers from those feeders are ingested as CAT 048 primary. Identified ADS-B/FLARM stays that identity.",
            "Small DJI/OpenDroneID still needs a local receiver POSTing to /api/rid.",
            "Do not paste AMC or UTM credentials here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/ultrafeeder" || url.pathname === "/api/feeders") {
      const pub = await cached(cache.uav, "ultrafeeder", 18_000, 60_000, () =>
        fetchUltrafeederPublic().catch((e) => ({ aircraft: [], n: 0, error: String(e.message || e) })),
      );
      const left = otherwiseInvisibleSky(pub.aircraft || []);
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: pub.n || 0,
        uav: pub.uav || 0,
        heli: pub.heli || 0,
        balloon: pub.balloon || 0,
        small: pub.small || 0,
        taxi: pub.taxi || 0,
        leftover: left.length,
        watch: pub.watch || 0,
        balloonWatch: pub.balloonWatch || 0,
        hits: pub.hits || {},
        items: (pub.aircraft || []).slice(0, 80).map((a) => ({
          hex: a.hex,
          flight: a.flight,
          t: a.t,
          category: a.category,
          skyKind: a.skyKind,
          lat: a.lat,
          lon: a.lon,
          gs: a.gs,
          type: a.type,
          leftover: isIdentifiedAdsb(a) ? false : otherwiseInvisibleSky([a]).length > 0,
        })),
        howto: {
          note: "Public ultrafeeder/tar1090 JSON (theairtraffic globe + adsb.fi v3 + plane-alert-db) feeds radar UAV, balloons, helicopters, and LJMS taxi (a plane driving to the runway, 3–45 kt on the field). TIS-B/NT leftovers ingest as CAT 048 primary (SAC 0 SIC 3). Identified ADS-B/FLARM is not re-ingested. No ADSBexchange globe scrape.",
          url: publicApi("/api/ultrafeeder"),
          ultrafeeder: ULTRAFEEDER_REPO,
          image: ULTRAFEEDER_IMAGE,
          planeAlert: PLANE_ALERT_DB,
          globe: TAT_GLOBE,
          opendata: OPENDATA_REPO,
        },
      });
      return;
    }
    if (url.pathname === "/api/dji" || url.pathname === "/api/dji-feedback") {
      if (req.method === "POST") {
        if (!ridAuthOk(req, url)) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "rid token required" }));
          return;
        }
        let body = {};
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "invalid json" }));
          return;
        }
        const n = ingestRidBody(body);
        bustLiveCaches();
        sendJson(req, res, { ok: true, n, live: ridTracks.size, dest: "/api/rid" });
        return;
      }
      const catalog = await cached(cache.rid, "catalog", 60_000, 180_000, () =>
        probeRidCatalog().catch((e) => ({ n: 0, feeds: 0, items: RID_CATALOG, origin: { ok: false, feed: false, error: String(e.message || e) } })),
      );
      const row = (catalog.items || []).find((x) => x.id === "dji-feedback") || null;
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: 0,
        feeds: 0,
        origin: row,
        item: row,
        howto: {
          note: "account.dji.com/api/feedback/v1/config/web?appid=account-center is DJI account-center survey chrome: application/json with locale/surveyId rows. Not GeoJSON, not Remote ID, not live aircraft. Live UAV remains OGN type 13 + ADS-B B6 + POST /api/rid.",
          url: publicApi("/api/dji"),
          script: DJI_FEEDBACK_CFG,
          site: DJI_ACCOUNT,
          steps: [
            "That GET is a feedback-form config for the DJI account website.",
            "Do not paste DJI account cookies or credentials here.",
            "Radar Drones chip is OGN/ADS-B UAV plus local RID.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/rid") {
      if (req.method === "POST") {
        if (!ridAuthOk(req, url)) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "rid token required" }));
          return;
        }
        let body = {};
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "invalid json" }));
          return;
        }
        const n = ingestRidBody(body);
        bustLiveCaches();
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: true, n, live: ridTracks.size }));
        return;
      }
      const now = Date.now();
      const items = [...ridTracks.values()].filter((r) => now - r.at < 90_000);
      const catalog = await cached(cache.rid, "catalog", 60_000, 180_000, () =>
        probeRidCatalog().catch((e) => ({ n: 0, feeds: 0, items: RID_CATALOG, origin: { ok: false, feed: false, error: String(e.message || e) } })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: items.length,
        feeds: items.length ? 1 : 0,
        items: items.map((r) => ({
          id: r.id,
          serial: r.serial,
          call: r.call,
          model: r.model,
          lat: r.lat,
          lon: r.lon,
          altM: r.altM,
          gsKt: r.gsKt,
          track: r.track,
          rssi: r.rssi,
          operator: r.opLat != null ? { lat: r.opLat, lon: r.opLon } : null,
          home: r.homeLat != null ? { lat: r.homeLat, lon: r.homeLon } : null,
          at: r.at,
        })),
        origin: {
          ok: true,
          json: true,
          post: true,
          feed: items.length > 0,
          poll: Boolean(process.env.RID_FEED_URL || ""),
          pollUrl: process.env.RID_FEED_URL || "",
          note: catalog.origin?.note,
        },
        catalog: catalog.items || RID_CATALOG,
        howto: {
          note: "DJI Remote ID is recognized from ASTM F3411 / EN 4709-002 Basic ID (CTA-2063 serial 1581F…) plus Self-ID / SSID text (Mavic, Mini, Avata). That still needs a local BLE/Wi-Fi receiver POSTing JSON — there is no public EU DJI dump. OGN type 13 and ADS-B B6 remain the public UAV pins.",
          url: publicApi("/api/rid"),
          post: publicApi("/api/rid"),
          method: "POST",
          body: '{"basic_id":"1581F6F3C8H4W5","drone_lat":46.05,"drone_lon":14.51,"drone_altitude":120,"pilot_lat":46.049,"pilot_lon":14.508,"rssi":-62,"model":"DJI Mini"}',
          verifier: RID_VERIFIER_YAML,
          dronescout: RID_DRONESCOUT,
          dronetag: RID_DRONETAG_LIVE,
          esp32: RID_ESP32,
          djiFeedback: DJI_FEEDBACK_CFG,
          djiAccount: DJI_ACCOUNT,
          poll: process.env.RID_FEED_URL || "",
          steps: [
            "Receive on a phone (Drone Scanner / OpenDroneID) or ESP32 WiFi-RemoteID within a few hundred metres of the drone.",
            `POST decoded JSON to ${publicApi("/api/rid")} (fields drone_lat, drone_lon, basic_id or serial).`,
            "Or set RID_FEED_URL to a self-hosted GET /api/detections JSON and this dashboard will poll it.",
            "account.dji.com feedback/v1/config/web is survey chrome for the DJI account center. Not a live UAV API. Do not paste DJI account credentials here.",
            "Radar Drones chip plots OGN/ADS-B UAV plus local RID. Empty in Slovenia is a fact.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/asterix.raw" || url.pathname === "/api/asterix.bin") {
      const pack = snapshotAsterixPack();
      res.writeHead(200, { ...cors, "content-type": "application/octet-stream", "content-length": String(pack.buf.length) });
      res.end(pack.buf);
      return;
    }
    if (url.pathname === "/api/health") {
      const ax = listAsterix();
      const gs = listAsterixStations();
      sendJson(req, res, {
        ok: true,
        at: new Date().toISOString(),
        publicUrl: publicBase(),
        radar: { n: lastRadarItems.length, adsb: adsbFeedStatus.hits },
        asterix: {
          tracks: ax.length,
          stations: gs.length,
          cats: Object.fromEntries(
            [1, 21, 25, 34, 48, 62, 63, 65].map((c) => [String(c).padStart(3, "0"), ax.filter((t) => t.cat === c).length + gs.filter((s) => s.cat === c).length]),
          ),
          origin: radarOriginStatus(),
          udp: asterixUdpListenPort(),
          feed: Boolean(process.env.ASTERIX_FEED_URL || ""),
        },
      });
      return;
    }
    if (url.pathname === "/api/asterix" || url.pathname === "/api/cat021" || url.pathname === "/api/cat048" || url.pathname === "/api/cat062" || url.pathname === "/api/cat025" || url.pathname === "/api/cat001" || url.pathname === "/api/cat034" || url.pathname === "/api/cat063" || url.pathname === "/api/cat065") {
      if (req.method === "POST") {
        const raw = await readBodyBuffer(req, 2_000_000);
        const ctype = String(req.headers["content-type"] || "");
        let hit;
        if (/octet-stream|asterix|x-binary/i.test(ctype) || (raw.length && raw[0] < 0x20)) {
          hit = ingestAsterixRaw(raw);
        } else {
          const text = raw.toString("utf8").trim();
          try {
            hit = ingestAsterixJson(JSON.parse(text || "{}"));
          } catch {
            hit = ingestAsterixRaw(text);
          }
        }
        if (hit.error && !hit.parsed) {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "POST raw ASTERIX bytes, hex, or decoded JSON records" }));
          return;
        }
        bustLiveCaches();
        sendJson(req, res, { ok: true, ...hit, cats: ASTERIX_CATS, repo: ASTERIX_REPO, specs: ASTERIX_SPECS });
        return;
      }
      const items = listAsterix();
      const gs = listAsterixStations();
      const radar = radarOriginStatus();
      const live = lastAsterixPack || (lastRadarItems.length ? snapshotAsterixPack() : null);
      const byCat = (c) => items.filter((t) => t.cat === c).length;
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: items.length,
        stations: gs.length,
        feeds: items.length || gs.length ? 1 : 0,
        catsLive: { "001": byCat(1), "021": byCat(21), "025": gs.filter((s) => s.cat === 25).length, "034": gs.filter((s) => s.cat === 34).length, "048": byCat(48), "062": byCat(62), "063": gs.filter((s) => s.cat === 63).length, "065": gs.filter((s) => s.cat === 65).length },
        live: live
          ? { n001: byCat(1), n021: live.n021, n034: gs.filter((s) => s.cat === 34).length, n048: live.n048, n062: live.n062, n025: live.n025, n063: live.n063 || gs.filter((s) => s.cat === 63).length, n065: live.n065 || gs.filter((s) => s.cat === 65).length, bytes: live.bytes, parsed: live.parsed, origin: live.origin, raw: publicApi("/api/asterix.raw") }
          : { n001: byCat(1), n021: 0, n034: gs.filter((s) => s.cat === 34).length, n048: byCat(48), n062: byCat(62), n025: gs.length, n063: gs.filter((s) => s.cat === 63).length, n065: gs.filter((s) => s.cat === 65).length, raw: publicApi("/api/asterix.raw") },
        cats: ASTERIX_CATS,
        part4: ASTERIX_PART4,
        specs: ASTERIX_SPECS,
        radar: radar || null,
        items: items.map((t) => ({
          id: t.id,
          cat: t.cat,
          sac: t.sac,
          sic: t.sic,
          call: t.call,
          icao: t.icao,
          lat: t.lat,
          lon: t.lon,
          alt: t.alt,
          gs: t.gs,
          track: t.track,
        })),
        ground: gs.map((s) => ({
          id: s.id,
          cat: 25,
          sac: s.sac,
          sic: s.sic,
          lat: s.lat,
          lon: s.lon,
          nogo: s.nogo,
          ops: s.ops,
          sstat: s.sstat,
          designator: s.designator,
          reportName: s.reportName,
        })),
        origin: {
          ok: true,
          json: true,
          raw: true,
          post: true,
          feed: items.length + gs.length > 0,
          poll: Boolean(process.env.ASTERIX_FEED_URL || ""),
          pollUrl: process.env.ASTERIX_FEED_URL || "",
          udp: asterixUdpListenPort(),
          udpBind: process.env.ASTERIX_UDP_BIND || "0.0.0.0",
          udpDefault: ASTERIX_UDP_DEFAULT,
          repo: ASTERIX_REPO,
          radar: Boolean(radar),
          tool: "asterix-parse+gap048+062",
          note: "True leftover radar is CAT 048 POST /api/asterix or UDP (default 8600). Weather-radar leftovers are encoded CAT 048 and ingested on that path. NM/IFPS chips are NSV 4D, not CAT 048. Identified ADS-B/FLARM/drones are not re-packed as ASTERIX — that made empty triples. UAV stays OGN type 13 / ADS-B B6 / RID. Export pack is /api/asterix.raw only.",
        },
        howto: {
          tool: "Built-in ASTERIX parser",
          post: publicApi("/api/asterix"),
          raw: publicApi("/api/asterix.raw"),
          poll: process.env.ASTERIX_FEED_URL || "",
          radarEnv: ["ASTERIX_RADAR_LAT", "ASTERIX_RADAR_LON", "ASTERIX_RADAR_THETA0", "ASTERIX_048_XY", "ASTERIX_UDP_PORT", "ASTERIX_UDP_BIND"],
          exampleRadar: { lat: 46.2236, lon: 14.4576, note: "Only if that is your CAT 048 site." },
          body: '{"hex":"190014c00102…"} or application/octet-stream',
          spec048: ASTERIX_SPECS.cat048,
          spec025: ASTERIX_SPECS.cat025,
          chrome: [
            ...(ASTERIX_SPECS.chrome || []),
            { id: "ec-css", name: "eurocontrol.int Drupal aggregated CSS", feed: false },
            { id: "ec-fa", name: "eurocontrol.int FontAwesome 6.4.2", feed: false },
          ],
          note: "True leftover radar is CAT 048 POST /api/asterix or UDP (default 8600). Weather-radar leftovers are encoded as CAT 048 and sent on that same path. NSV/IFPS chips are 4D, not CAT 048. Identified ADS-B is not re-ingested.",
          steps: [
            `True leftover CAT 048: POST ${publicApi("/api/asterix")} as application/octet-stream (or JSON {hex}), or UDP ${process.env.ASTERIX_UDP_BIND || "0.0.0.0"}:${asterixUdpListenPort() || ASTERIX_UDP_DEFAULT} (set ASTERIX_UDP_PORT=0 to disable). Weather-radar leftovers use that same ingest. NSV/IFPS is not packed as CAT 048.`,
            "ASTX is leftover CAT 048 (ARSO/FVG echo, BIRDTAM, TIS-B/NT) plus unmatched OpenSky ASTERIX (position_source=1). Identified ADS-B is not re-ingested.",
            "OpenSky anonymous from this host times out and only has 400 credits/day. Create an API client at opensky-network.org (Account → API client, OAuth2 client_id/secret — not the website password). Set OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET. Standard account is 4 000 credits/day; an ADS-B feeder at ≥30% uptime is 8 000. /states/own is unlimited for your own sensors. A real CAT 048 POST/UDP still beats OpenSky.",
            `GET ${publicApi("/api/asterix.raw")} on demand for CAT 025+063+065+048+062 of the current tracks. That binary is not re-ingested.`,
            "euctrl-pru.github.io/international-BRA-EUR-2026 and github.com/eurocontrol/eurocontrol are not radar streams.",
            "akapetanovic ASTERIX-ANALYSER is an offline C# display (CAT 001/034/048/062). Replay/samples are not live. Not a public CAT stream.",
            "categories-and-statuses-2025-10-22.pdf and library topic 973 are the ASTERIX spec index (HEAD only). Not a CAT 048 stream.",
            "CroatiaControl HowToBuild/configure.in and boundary packet-asterix.c are old Wireshark plugin sources. CAT 021/025 are absent there. We do not build Wireshark or sniff.",
            "CAT 064 and CAT 068 do not exist as application categories. Those numbers are SAC allocations (Germany MIL / Portugal) on eurocontrol.int/asterix. SDPS is CAT 062 (tracks) + 063/065 (status).",
            "We do not copy specification PDFs, join PENS multicast, or sniff interfaces from this host.",
          ],
        },
      });
      return;
    }
    if (
      url.pathname === "/api/sdr" ||
      url.pathname === "/api/sdr/beast" ||
      url.pathname === "/api/sdr/puconci" ||
      url.pathname === "/api/sdr/dolina43" ||
      url.pathname === "/api/sdr/ljms" ||
      url.pathname === "/api/beast" ||
      url.pathname === "/api/dump1090" ||
      url.pathname === "/api/raw"
    ) {
      const stationId = url.pathname.endsWith("/puconci")
        ? "puconci"
        : url.pathname.endsWith("/dolina43")
        ? "dolina43"
        : url.pathname.endsWith("/ljms")
        ? "ljms"
        : url.searchParams.get("station") || "puconci";

      if (req.method === "POST") {
        if (!ridAuthOk(req, url)) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "sdr token required" }));
          return;
        }
        const buf = await readBodyBuffer(req, 2_000_000);
        const ctype = String(req.headers["content-type"] || "");
        const rec = sdrFeed.ingestStationRaw(stationId, buf, ctype);
        expireMap(sdrTracks);
        bustLiveCaches();
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: true, stationId, ...rec, live: sdrTracks.size }));
        return;
      }
      expireMap(sdrTracks);
      res.writeHead(200, cors);
      res.end(
        JSON.stringify({
          at: new Date().toISOString(),
          n: sdrTracks.size,
          items: [...sdrTracks.values()],
          feeder: sdrFeed.status,
          stations: SDR_STATIONS,
          howto: sdrHowto(req),
        }),
      );
      return;
    }

    if (url.pathname === "/api/asterix/cat048" || url.pathname === "/api/cat048/live") {
      const stnId = url.searchParams.get("station") || "puconci";
      const origin = SDR_STATIONS[stnId] || SDR_STATIONS.puconci;
      const now = Date.now();
      expireMap(sdrTracks);
      // Derive single-sensor isolated CAT 048 target observations from REAL live tracks
      const live = (lastRadarItems.length ? lastRadarItems : [...sdrTracks.values()]).filter((p) => p.lat && p.lon);
      const targets = live
        .map((p) => {
          const pol = calcPolarAndCartesian(origin, p.lat, p.lon);
          const isMilHeli =
            p.role === "heli" ||
            p.fastLow ||
            /^(RANGR|LSV|SVN|SV)/i.test(p.flight || "") ||
            /^L2-0[1-4]$/i.test(p.reg || "") ||
            p.ownOp === "Slovenska vojska" ||
            (p.altFt != null && p.altFt < 1500 && (p.gs || 0) > 100);
          const isBalloon = p.role === "balloon" || /sonde|hab/i.test(`${p.typecode} ${p.desc}`);
          const isUav = p.role === "uav" || p.src === "rid" || /dji|drone/i.test(`${p.typecode} ${p.model}`);
          const isEcho = p.role === "echo" || p.src === "psr" || p.src === "echo";

          let cat048Type = "SSR_MODE_S";
          let typNum = 5; // Mode S Roll-Call
          if (isMilHeli) {
            cat048Type = "MIL_HELI_LOW";
            typNum = 3; // SSR + PSR
          } else if (isBalloon) {
            cat048Type = "BALLOON_HAB";
            typNum = 2; // SSR
          } else if (isUav) {
            cat048Type = "DRONE_RID";
            typNum = 4; // Mode S All-call / RID
          } else if (isEcho) {
            cat048Type = "PSR_PASSIVE";
            typNum = 1; // Single PSR
          }

          return {
            id: p.id,
            flight: p.flight || "NO CALL",
            squawk: p.squawk || "7000",
            altFt: p.altFt,
            fl: p.altFt != null ? Math.round(p.altFt / 100) : null,
            gs: p.gs,
            track: p.track,
            // CAT 048 Slant Polar Coordinates
            rhoNm: pol.rhoNm,
            thetaDeg: pol.thetaDeg,
            // CAT 048 2D Cartesian Coordinates
            cartX: pol.cartX,
            cartY: pol.cartY,
            descriptor: {
              typ: typNum,
              sim: 0,
              rdp: 0,
              spi: 0,
              rab: 0,
            },
            classification: cat048Type,
            tod: Math.round(((now % 86400000) / 1000) * 128) / 128,
            trail: (trails.get(p.id) || []).slice(-8).map((pt) => ({
              ...pt,
              ...calcPolarAndCartesian(origin, pt.lat, pt.lon),
            })),
          };
        })
        .filter((t) => t.rhoNm <= 150); // within 150 NM radar coverage

      res.writeHead(200, cors);
      res.end(
        JSON.stringify({
          at: new Date().toISOString(),
          station: {
            id: origin.id,
            name: origin.name,
            sac: origin.sac,
            sic: origin.sic,
            lat: origin.lat,
            lon: origin.lon,
            freqMhz: origin.freqMhz,
            antenna: origin.antenna,
            rpm: origin.rpm,
          },
          targetCount: targets.length,
          targets,
        }),
      );
      return;
    }

    if (url.pathname === "/api/atc/streams") {
      res.writeHead(200, cors);
      res.end(
        JSON.stringify({
          ok: true,
          streams: [
            { id: "ljlj-twr", airport: "Ljubljana", icao: "LJLJ", title: "Ljubljana Tower", freq: "118.475 MHz", url: "https://www.liveatc.net/search/?icao=LJLJ" },
            { id: "ljlj-app", airport: "Ljubljana", icao: "LJLJ", title: "Ljubljana Radar / Approach", freq: "135.250 MHz", url: "https://www.liveatc.net/search/?icao=LJLJ" },
            { id: "lowg-app", airport: "Graz", icao: "LOWG", title: "Graz Approach / Tower", freq: "119.300 MHz", url: "https://www.liveatc.net/search/?icao=LOWG" },
            { id: "ldza-app", airport: "Zagreb", icao: "LDZA", title: "Zagreb Radar / Approach", freq: "120.700 MHz", url: "https://www.liveatc.net/search/?icao=LDZA" },
          ],
        }),
      );
      return;
    }

    if (url.pathname === "/api/open-apis/scanner") {
      res.writeHead(200, cors);
      res.end(
        JSON.stringify({
          ok: true,
          apis: [
            { id: "opensky", name: "OpenSky Network Public API", type: "ADS-B", status: "active", endpoint: "https://opensky-network.org/api/states/all" },
            { id: "adsbfi", name: "adsb.fi Public Feeds", type: "ADS-B & Military", status: "active", endpoint: "https://opendata.adsb.fi/api/v3" },
            { id: "adsblol", name: "adsb.lol Open Data", type: "ADS-B & UAV", status: "active", endpoint: "https://api.adsb.lol" },
            { id: "sondehub", name: "SondeHub Radiosonde API", type: "Weather Balloons", status: "active", endpoint: "https://api.v2.sondehub.org" },
            { id: "ogn", name: "Open Glider Network (OGN)", type: "Gliders & Drones", status: "active", endpoint: "http://aprs.glidernet.org:14501" },
            { id: "ttn", name: "The Things Network Packet Broker", type: "LoRaWAN Gateways", status: "active", endpoint: "https://mapper.packetbroker.net/api/v2" },
            { id: "rainviewer", name: "RainViewer Meteorological Radar", type: "Weather Radar", status: "active", endpoint: "https://api.rainviewer.com/public/weather-maps.json" },
            { id: "liveatc", name: "LiveATC.net Regional ATC Audio", type: "Air Traffic Radio", status: "active", endpoint: "https://www.liveatc.net" },
          ],
        }),
      );
      return;
    }
    if (url.pathname === "/api/rf" || url.pathname === "/api/wideband" || url.pathname === "/api/ms-sdr") {
      const wantImport = req.method === "POST" || req.method === "PUT" || url.searchParams.get("import") === "1";
      if (wantImport) {
        if (!ridAuthOk(req, url)) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "rf token required" }));
          return;
        }
        if (url.searchParams.get("lat") || url.searchParams.get("mhz") || url.searchParams.get("mode")) {
          widebandFeed.rememberStation({
            id: url.searchParams.get("station") || "ms",
            name: url.searchParams.get("name") || "Murska Sobota SDR",
            lat: url.searchParams.get("lat"),
            lon: url.searchParams.get("lon"),
            mhz: url.searchParams.get("mhz"),
            mode: url.searchParams.get("mode"),
            antenna: url.searchParams.get("antenna") || "70-1200 MHz",
          });
        }
        let rec = { n: 0, heard: 0 };
        if (req.method === "POST" || req.method === "PUT") {
          const raw = (await readBody(req, 2_000_000)) || "";
          const trim = raw.trim();
          let parsed = null;
          try {
            parsed = trim ? JSON.parse(trim) : null;
          } catch {
            parsed = null;
          }
          if (parsed && widebandFeed.looksAircraft(parsed)) {
            rec = ingestDump1090(parsed);
            bustLiveCaches();
            widebandFeed.rememberStation({ id: "ms", name: "Murska Sobota SDR", mhz: 1090, mode: "adsb" });
          } else if (trim) {
            rec = widebandFeed.ingestBody(raw, String(req.headers["content-type"] || ""));
          }
        }
        cache.sensors.clear();
        bustLiveCaches();
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: true, imported: rec.n, ...rec, live: widebandFeed.status, station: widebandFeed.liveStation() }));
        return;
      }
      widebandFeed.recount();
      const api = publicApi("/api/rf");
      res.writeHead(200, cors);
      res.end(
        JSON.stringify({
          at: new Date().toISOString(),
          ...widebandFeed.status,
          station: widebandFeed.liveStation(),
          items: widebandFeed.asSensors(PLACES.ms).slice(0, 80),
          bands: RF_BANDS,
          howto: rfHowto(api),
        }),
      );
      return;
    }
    if (url.pathname === "/api/wigle" || url.pathname === "/api/wigglefish") {
      const qHasObs = wigleFeed.hasObs(Object.fromEntries([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v])));
      const wantImport = req.method === "POST" || req.method === "PUT" || url.searchParams.get("import") === "1" || qHasObs;
      if (wantImport) {
        if (!ridAuthOk(req, url)) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "wigle token required" }));
          return;
        }
        if (url.searchParams.get("lat") || url.searchParams.get("lon") || url.searchParams.get("latitude")) {
          wigleFeed.ingestQuery(url.searchParams);
        }
        let rec = { n: 0, heard: 0 };
        if (req.method === "POST" || req.method === "PUT") {
          const raw = (await readBody(req, 2_000_000)) || "";
          rec = raw.trim() ? wigleFeed.ingestBody(raw, String(req.headers["content-type"] || "")) : wigleFeed.ingestQuery(url.searchParams);
        } else {
          rec = wigleFeed.ingestQuery(url.searchParams);
        }
        cache.sensors.clear();
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: true, imported: rec.n, ...rec, live: wigleFeed.status }));
        return;
      }
      wigleFeed.recount();
      const api = publicApi("/api/wigglefish");
      res.writeHead(200, cors);
      res.end(
        JSON.stringify({
          at: new Date().toISOString(),
          ...wigleFeed.status,
          items: wigleFeed.asSensors(PLACES.si).slice(0, 80),
          howto: {
            app: "Import WiggleFish / WiGLE observations through this HTTP API. No Play Store upload needed.",
            url: api,
            get: `${api}?lat=46.05&lon=14.50&bssid=AA:BB:CC:DD:EE:FF&ssid=Cafe&rssi=-52&type=wifi`,
            apk: "https://github.com/Evil0ctopus/wigglefish/releases/download/android-v0.4.0/wigglefish-0.4.0.apk",
            steps: [
              "On the phone Home tap EXPORT / SESSION, then JSON (or WIGLE). Save the file.",
              "Open this dashboard Data tab and upload that file, or POST it to this URL.",
              `POST session: curl -H 'Content-Type: application/json' --data-binary @session.json ${api}`,
              `GET one row: ${api}?lat=46.05&lon=14.50&bssid=AA:BB:CC:DD:EE:FF&ssid=Cafe&rssi=-52&type=wifi`,
              "HTTP Shortcuts: POST the shared JSON/CSV to this URL.",
            ],
          },
        }),
      );
      return;
    }
    if (url.pathname === "/api/stream") {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ at: new Date().toISOString(), n: meshStream.length, items: meshStream.slice(0, 120) }));
      return;
    }
    if (url.pathname === "/api/arrivals" || url.pathname === "/api/airport" || url.pathname === "/api/fids") {
      const icao = (url.searchParams.get("icao") || url.searchParams.get("airport") || url.searchParams.get("code") || "").toUpperCase();
      const board = await cached(cache.arrivals, icao || "hubs", 12_000, 45_000, () =>
        fetchArrivals(icao).catch((e) => ({
          ok: false,
          feed: false,
          n: 0,
          live: [],
          boards: [],
          error: String(e.message || e),
        })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: board.n || 0,
        si: board.si || 0,
        feeds: board.feed ? 1 : 0,
        filter: board.filter || icao || "",
        live: board.live || [],
        boards: board.boards || [],
        airports: board.airports || [],
        nearby: board.nearby || [],
        fids: board.fids || null,
        opensky: board.opensky || null,
        origin: board.origin || null,
        howto: {
          note: "Live airport arrivals are airborne (and on-field) aircraft whose public ADS-B callsign route dest is that ICAO. Positions from api.adsb.lol, O/D from vrs-standing-data routes. Ljubljana FIDS HTML is WAF/not JSON. OpenSky /flights/arrival needs a handshake this host often cannot complete. AMAN ED-254 is localhost. This is not NM B2B SOAP, not Cirium FIDS, not a scraped FR24 board.",
          url: publicApi("/api/arrivals"),
          fids: FIDS_LJU,
          opensky: OPENSKY_ARRIVAL,
          route: FPL_ROUTE_API,
          hubs: HUBS.map((h) => h.icao),
          steps: [
            "Radar Arrivals chip = dest LJ** (Slovenia aerodromes) already in theater.",
            "Data board groups inbound by airport. Empty LJLJ at night is a fact.",
            "Do not scrape lju-airport.si HTML or subscribe to AMAN/Yellow Profile.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/met" || url.pathname === "/api/metar" || url.pathname === "/api/sigmet" || url.pathname === "/api/meteoalarm") {
      const board = await cached(cache.met, "live", 45_000, 120_000, () =>
        fetchMetBoard().catch((e) => ({
          ok: false,
          feed: false,
          n: 0,
          metars: [],
          tafs: [],
          sigmets: [],
          alarms: [],
          error: String(e.message || e),
        })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: board.n || 0,
        feeds: board.feeds || 0,
        metars: board.metars || [],
        tafs: board.tafs || [],
        sigmets: board.sigmets || [],
        sigmetN: board.sigmetN || 0,
        europeSigmets: board.europeSigmets || 0,
        siSigmets: board.siSigmets || 0,
        alarms: board.alarms || [],
        origin: board.origin || null,
        howto: {
          note: "SWIM IWXXM METAR/TAF/SIGMET from EUROCONTROL needs an SLA. Public live JSON here is NOAA/NWS Aviation Weather Center (worldwide METAR/TAF + international SIGMET GeoJSON) plus EUMETNET MeteoAlarm CAP for Slovenia. Not Yellow Profile, not NM B2B SOAP.",
          url: publicApi("/api/met"),
          metar: AWC_METAR,
          isigmet: AWC_ISIGMET,
          meteoalarm: METEOALARM_SI,
          steps: [
            "METAR/TAF for LJLJ, LJMB, LJPZ, LJCE and nearby hubs.",
            "SIGMET GeoJSON filtered to Europe. Empty over LJLA is a fact.",
            "Do not subscribe to SWIM Yellow Profile IWXXM from here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/eurofpl" || url.pathname === "/api/fpl" || url.pathname === "/api/fpl-live" || url.pathname === "/api/routes") {
      const liveOnly = url.pathname === "/api/fpl-live" || url.pathname === "/api/routes";
      const want = !liveOnly && (req.method === "POST" || req.method === "PUT" || url.searchParams.get("code") || url.searchParams.get("import") === "1");
      if (want) {
        if (!ridAuthOk(req, url)) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "fpl token required" }));
          return;
        }
        let code = url.searchParams.get("code") || "";
        if (req.method === "POST" || req.method === "PUT") {
          const raw = (await readBody(req, 80_000)) || "";
          try {
            const j = JSON.parse(raw);
            code = j.code || j.confirmCode || j.flight || code;
          } catch {
            const sp = new URLSearchParams(raw);
            code = sp.get("code") || sp.get("confirmCode") || raw.trim() || code;
          }
        }
        try {
          const rec = await fetchEurofplCode(code);
          fplTracks.set(rec.flight || rec.code, rec);
          bustLiveCaches();
          res.writeHead(200, cors);
          res.end(JSON.stringify({ ok: true, live: fplTracks.size, flight: rec }));
        } catch (e) {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: String(e.message || e) }));
        }
        return;
      }
      expireFplTracks();
      const live = listLiveRoutes();
      const origin = liveRouteStatus();
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: live.length,
        feeds: origin.n ? 1 : 0,
        live,
        items: [...fplTracks.values()],
        origin,
        howto: {
          note: "Live flight plans are public callsign routes from api.adsb.lol/api/0/route/{callsign} (O/D airports + coords, CORS JSON). Gold dashed remainder is great-circle to destination. That is not IFPS filing and not EuroFPL ACK chrome.",
          url: publicApi("/api/fpl"),
          route: FPL_ROUTE_API,
          tracking: "https://tracking.eurofpl.eu/",
          steps: [
            "Radar FPL chip lists aircraft in the Slovenia theater with a live O/D.",
            "Click a plane for Filed dep→dest. Gold dashed = remaining route. Cyan dashed is still NSV 4D.",
            "EuroFPL ACK overlay is optional and separate. This dashboard does not file to operational IFPS.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/ifps") {
      const want = req.method === "POST" || req.method === "PUT";
      if (want) {
        if (!ridAuthOk(req, url)) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "ifps token required" }));
          return;
        }
        const raw = (await readBody(req, 80_000)) || "";
        let text = raw;
        try {
          const j = JSON.parse(raw);
          text = j.text || j.fpl || j.message || j.body || raw;
        } catch {
          const sp = new URLSearchParams(raw);
          text = sp.get("text") || sp.get("fpl") || raw;
        }
        try {
          const recs = await enrichIfpsRecs(parseIfpsText(text));
          for (const rec of recs) fplTracks.set(rec.flight, rec);
          bustLiveCaches();
          res.writeHead(200, cors);
          res.end(
            JSON.stringify({
              ok: true,
              live: fplTracks.size,
              n: recs.length,
              flights: recs.map((r) => ({
                flight: r.flight,
                dep: r.dep,
                dest: r.dest,
                typecode: r.typecode,
                format: r.format,
                fix: r.fix,
                known: r.known,
                skipped: r.skipped,
                nTrail: (r.trail || []).length,
              })),
            }),
          );
        } catch (e) {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: String(e.message || e) }));
        }
        return;
      }
      expireFplTracks();
      const pasted = [...fplTracks.values()].filter((x) => x.src === "ifps");
      const live = listLiveRoutes().filter((x) => x.ifps || inIfpsZone(x.dep) || inIfpsZone(x.dest));
      const manuals = await cached(cache.ifps, "manuals", 60_000, 180_000, () =>
        probeIfpsManuals().catch((e) => ({ edition: IFPS_EDITION, portal: IFPS_PORTAL, feeds: 0, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: live.length,
        pasted: pasted.length,
        feeds: live.length ? 1 : 0,
        live,
        items: pasted,
        edition: manuals.edition || IFPS_EDITION,
        portal: manuals.portal || IFPS_PORTAL,
        nmManual: manuals.nm || null,
        webManual: manuals.web || null,
        origin: {
          ok: true,
          feed: live.length > 0,
          json: true,
          zone: "IFPZ",
          n: live.length,
        },
        howto: {
          note: "Radar IFPS chip is live IFPZ dep/dest plus unmatched NM 4D leftover in theater. Gold/cyan remainder on the IFPS/NM chips. Paste still overlays ICAO/ADEXP. Not CAT 048. This dashboard never files to operational IFPS (EUCHZMFP).",
          url: publicApi("/api/ifps"),
          manual: IFPS_MANUAL_NM,
          webManual: IFPS_MANUAL,
          ifpuv: IFPUV,
          portal: IFPS_PORTAL,
          edition: IFPS_EDITION,
          steps: [
            "Radar IFPS chip lists IFPZ dep/dest on live callsigns plus unmatched NM 4D leftover in theater. Cyan remainder on the IFPS chip. Not CAT 048.",
            "Paste a complete (FPL-…) ICAO message or ADEXP with -TITLE/-ARCID/-ADEP/-ADES/-ROUTE to overlay extra plans.",
            "Unknown aerodromes are looked up on the public airport JSON. Airways stay off the map unless Field 15 has lat/lon.",
            "Do not send plans to EUCHZMFP from here. Use public IFPUV in a browser to pre-validate.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/apt-api" || url.pathname === "/api/api-guide") {
      const pdf = await cached(cache.apt, "guide", 60_000, 180_000, () =>
        probeIfpsPdf(APT_API_GUIDE).catch((e) => ({ ok: false, feed: false, pdf: false, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: 0,
        feeds: 0,
        edition: APT_API_EDITION,
        issued: APT_API_DATE,
        reference: APT_API_REF,
        origin: { id: "apt-api-guide", name: "NM API Implementation Guide", edition: APT_API_EDITION, issued: APT_API_DATE, reference: APT_API_REF, ...pdf },
        howto: {
          note: "eurocontrol-api-implementation-guide-1-300.pdf is the Network Manager API Implementation Guide edition 1.300 (APT/USD/API_Impl_Guide, 1 Oct 2023). It is an 88-page airport/NM procedure PDF, not a live JSON/GeoJSON dump. This dashboard does not copy that copyrighted manual or speak NM B2B SOAP (DPI/API/FUM).",
          url: publicApi("/api/apt-api"),
          pdf: APT_API_GUIDE,
          edition: APT_API_EDITION,
          issued: APT_API_DATE,
          reference: APT_API_REF,
          steps: [
            "HEAD-probe only: application/pdf, not a traffic feed.",
            "Live public NM on Radar is still NSV EDYYFMP GeoJSON.",
            "Do not file airport API/DPI messages or NM B2B SOAP from here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/ogc" || url.pathname === "/api/wfs-te" || url.pathname === "/api/12-027r3") {
      const pdf = await cached(cache.ogc, "wfs-te", 60_000, 180_000, () =>
        probeIfpsPdf(OGC_WFS_TE).catch((e) => ({ ok: false, feed: false, pdf: false, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: 0,
        feeds: 0,
        doc: OGC_WFS_TE_DOC,
        title: OGC_WFS_TE_TITLE,
        issued: OGC_WFS_TE_DATE,
        category: OGC_WFS_TE_CAT,
        origin: {
          id: "ogc-12-027r3",
          name: OGC_WFS_TE_TITLE,
          doc: OGC_WFS_TE_DOC,
          issued: OGC_WFS_TE_DATE,
          category: OGC_WFS_TE_CAT,
          ...pdf,
        },
        howto: {
          note: "docs.ogc.org/dp/12-027r3/12-027r3.pdf is OGC Discussion Paper 12-027r3, Web Feature Service (WFS) Temporality Extension (2014-07-16). It proposes WFS 2.0 / FES 2.0 queries for AIXM 5 dynamic features. It is a procedure PDF, not a live WFS or GeoJSON dump. This dashboard does not copy that paper or speak EAD/AFOD WFS.",
          url: publicApi("/api/ogc"),
          pdf: OGC_WFS_TE,
          site: OGC_SITE,
          doc: OGC_WFS_TE_DOC,
          title: OGC_WFS_TE_TITLE,
          issued: OGC_WFS_TE_DATE,
          category: OGC_WFS_TE_CAT,
          steps: [
            "HEAD-probe only: application/pdf, not a traffic feed.",
            "Live public NM on Radar is still NSV EDYYFMP GeoJSON.",
            "Do not subscribe to EAD/AFOD WFS or NM B2B SOAP from here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/esassp" || url.pathname === "/api/surv" || url.pathname === "/api/amc-gm" || url.pathname === "/api/mica" || url.pathname === "/api/smget") {
      const pack = await cached(cache.esassp, "surv", 60_000, 180_000, async () => {
        const [pdf, service, amc, mica, smget] = await Promise.all([
          probeIfpsPdf(ESASSP_PDF).catch((e) => ({ ok: false, feed: false, pdf: false, error: String(e.message || e), url: ESASSP_PDF })),
          probeHtmlHead(SURV_SERVICE).catch((e) => ({ ok: false, feed: false, html: false, error: String(e.message || e), url: SURV_SERVICE })),
          probeHtmlHead(EASA_AMC_GM).catch((e) => ({ ok: false, feed: false, html: false, error: String(e.message || e), url: EASA_AMC_GM })),
          probeIfpsPdf(MICA_PDF).catch((e) => ({ ok: false, feed: false, pdf: false, error: String(e.message || e), url: MICA_PDF })),
          probeHtmlHead(SMGET_PAGE).catch((e) => ({ ok: false, feed: false, html: false, error: String(e.message || e), url: SMGET_PAGE })),
        ]);
        return { pdf, service, amc, mica, smget };
      });
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: 0,
        feeds: 0,
        edition: ESASSP_EDITION,
        volume: ESASSP_VOL,
        issued: ESASSP_DATE,
        title: ESASSP_TITLE,
        micaEdition: MICA_EDITION,
        micaIssued: MICA_DATE,
        origin: {
          id: "esassp-vol1",
          name: ESASSP_TITLE,
          edition: ESASSP_EDITION,
          volume: ESASSP_VOL,
          issued: ESASSP_DATE,
          ...pack.pdf,
        },
        pdf: { id: "esassp-pdf", name: `${ESASSP_TITLE} ${ESASSP_VOL} Ed ${ESASSP_EDITION}`, ...pack.pdf },
        mica: { id: "mica-spec-v2", name: `${MICA_TITLE} v${MICA_EDITION}`, edition: MICA_EDITION, issued: MICA_DATE, ...pack.mica },
        service: { id: "surv-service", name: SURV_TITLE, ...pack.service },
        smget: { id: "smget", name: SMGET_TITLE, ...pack.smget },
        amc: { id: "easa-amc-gm-2017-373", name: EASA_AMC_GM_TITLE, ...pack.amc },
        howto: {
          note: "EUROCONTROL surveillance pages and specs are procedure/catalog chrome, not live JSON. ESASSP Vol 1 Ed 1.3 and MICA spec v2.0 are copyrighted PDFs. The Sensors service page and SMGET tool page are Drupal HTML. This dashboard HEAD-probes them only and does not copy the PDFs, run SMGET, or scrape ARTAS/WAM.",
          url: publicApi("/api/esassp"),
          pdf: ESASSP_PDF,
          mica: MICA_PDF,
          service: SURV_SERVICE,
          smget: SMGET_PAGE,
          amc: EASA_AMC_GM,
          edition: ESASSP_EDITION,
          volume: ESASSP_VOL,
          issued: ESASSP_DATE,
          title: ESASSP_TITLE,
          micaTitle: MICA_TITLE,
          micaEdition: MICA_EDITION,
          micaIssued: MICA_DATE,
          serviceTitle: SURV_TITLE,
          smgetTitle: SMGET_TITLE,
          amcTitle: EASA_AMC_GM_TITLE,
          steps: [
            "HEAD-probe only: two application/pdf files plus Drupal HTML. None of them is GeoJSON.",
            "Live public surveillance on Radar is still ADS-B/MLAT plus NSV EDYYFMP GeoJSON.",
            "Do not copy ESASSP/MICA, run SMGET, or subscribe to ARTAS from here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/airm" || url.pathname === "/api/exchange-models") {
      const origin = await cached(cache.airm, "docs", 60_000, 180_000, () =>
        probeAirm().catch((e) => ({ ok: false, feed: false, challenge: true, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: 0,
        feeds: origin.feed ? 1 : 0,
        title: AIRM_TITLE,
        models: AIRM_MODELS,
        origin,
        howto: {
          note: "airm.aero/documentation/airm-information-exchange-models is the AIRM documentation catalog for AIXM, FIXM, IWXXM, and AMXM. HTML docs, not JSON or GeoJSON. Those models are schemas, not a live traffic dump. This dashboard does not scrape airm.aero or speak EAD WFS / NM B2B SOAP.",
          url: publicApi("/api/airm"),
          page: AIRM_URL,
          site: AIRM_SITE,
          title: AIRM_TITLE,
          steps: [
            "Open airm.aero in a browser for the human model catalog.",
            "Live public NM on Radar is still NSV EDYYFMP GeoJSON.",
            "Do not subscribe to EAD/AFOD WFS or paste portal credentials here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/eatm" || url.pathname === "/api/masterplan") {
      const origin = await cached(cache.eatm, "stakeholder", 60_000, 180_000, () =>
        probeEatmStakeholder().catch((e) => ({ ok: false, feed: false, challenge: true, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: 0,
        feeds: origin.feed ? 1 : 0,
        origin,
        howto: {
          note: "atmmasterplan.eu/stakeholders/2482221 is the SESAR eATM Portal catalog page for ANSP-CIV-AIS (Civil AIS Service Provider, S3 Common Library). HTML stakeholder/enabler tables, not JSON or GeoJSON. Live AIS is not on this page (operational AFOD WFS needs an EAD account). This dashboard does not scrape the eATM working-environment login.",
          url: publicApi("/api/eatm"),
          stakeholder: EATM_STAKEHOLDER_URL,
          portal: EATM_PORTAL,
          list: EATM_STAKEHOLDERS,
          code: EATM_META.code,
          name: EATM_META.name,
          model: EATM_META.model,
          steps: [
            "Open the public eATM Portal in a browser for the human stakeholder catalog.",
            "Live NM on Radar is still NSV EDYYFMP GeoJSON. Do not treat Master Plan enablers as traffic.",
            "Do not paste eATM/OneSky credentials here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/swim" || url.pathname === "/api/swim-registry") {
      const [origin, ais, openatm, aman] = await Promise.all([
        probeSwim().catch((e) => ({ ok: false, error: String(e.message || e) })),
        probeAisDef().catch((e) => ({ ok: false, error: String(e.message || e) })),
        probeOpenAtmJson().catch((e) => ({ ok: false, error: String(e.message || e) })),
        probeAmanJson().catch((e) => ({ ok: false, error: String(e.message || e) })),
      ]);
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: SWIM_CATALOG.length,
        origin,
        ais: { ...AIS_DEF, ...ais },
        openatm: { ...OPENATM_META, url: OPENATM_JSON, ...openatm },
        aman: { ...AMAN_META, url: AMAN_JSON, ...aman },
        catalog: SWIM_CATALOG,
        publicLive: SWIM_PUBLIC_LIVE,
        howto: {
          note: "service-1784281247-e071a5d0451d.json is the EUROCAE Arrival Sequence Service definition (ED-254 AMAN). The only listed endpoint is https://localhost/ArrivalSequenceInformationService/ArrivalSequenceInformation — a placeholder, not a live AMAN. Yellow Profile WS_LIGHT subscribe/publish is a provider instance under an SLA. This dashboard does not subscribe to that bus or NM B2B SOAP.",
          url: publicApi("/api/swim"),
          registry: SWIM_REGISTRY,
          reference: SWIM_REF,
          schema: SWIM_SCHEMA,
          aisWiki: AIS_DEF.wiki,
          openatmJson: OPENATM_JSON,
          amanJson: AMAN_JSON,
          steps: [
            "Arrival Sequence 1.02: 3 interfaces, 0 public endpoints, 1 localhost placeholder, geographical extent absent.",
            "OpenATM 10186 is the same kind of definition JSON (EUROCONTROL & Slovenia Control, JMS/MSB-CB, 0 endpoints).",
            "Live public NM is NSV EDYYFMP + LJLAFMP GeoJSON. Live MET is AWC METAR/TAF/SIGMET + MeteoAlarm SI, not AMAN or OpenATM.",
            "Paste ICAO/ADEXP on the IFPS card. Do not file operational IFPS/NM B2B from here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/rtca" || url.pathname === "/api/aeropus" || url.pathname === "/api/easa" || url.pathname === "/api/beacon" || url.pathname === "/api/chrome" || url.pathname === "/api/ec-js" || url.pathname === "/api/skybrary" || url.pathname === "/api/gtag" || url.pathname === "/api/bootstrap" || url.pathname === "/api/aci" || url.pathname === "/api/crocontrol" || url.pathname === "/api/amc" || url.pathname === "/api/amc-anon" || url.pathname === "/api/dnn" || url.pathname === "/api/prism") {
      const board = await cached(cache.chrome, "scripts", 60_000, 180_000, async () => {
        const [scripts, page, maps] = await Promise.all([
          probeChromeScripts().catch((e) => ({ n: 0, feeds: 0, items: [], error: String(e.message || e) })),
          probeHtmlHead(AMC_ANON).catch((e) => ({ ok: false, feed: false, html: false, error: String(e.message || e), url: AMC_ANON })),
          probeHtmlHead(AMC_MAPS).catch((e) => ({ ok: false, feed: false, html: false, error: String(e.message || e), url: AMC_MAPS })),
        ]);
        return { ...scripts, page, maps };
      });
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: board.n || (board.items || []).length,
        feeds: board.feeds || 0,
        origin: (board.items || []).find((x) => x.id === "aci-bb") || (board.items || []).find((x) => x.id === "airm-bootstrap") || null,
        aci: (board.items || []).find((x) => x.id === "aci-bb") || null,
        bootstrap: (board.items || []).find((x) => x.id === "airm-bootstrap") || null,
        gtag: (board.items || []).find((x) => x.id === "skybrary-gtag") || null,
        skybrary: (board.items || []).find((x) => x.id === "skybrary-dialog") || null,
        ecFooter: (board.items || []).find((x) => x.id === "ec-footer") || null,
        aeropus: (board.items || []).find((x) => x.id === "aeropus") || null,
        easa: (board.items || []).find((x) => x.id === "easa") || null,
        beacon: (board.items || []).find((x) => x.id === "cf-beacon") || null,
        crocontrol: (board.items || []).find((x) => x.id === "crocontrol-jq") || null,
        amc: (board.items || []).find((x) => x.id === "amc-comm") || null,
        amcWork: (board.items || []).find((x) => x.id === "amc-workareas") || null,
        dnn: (board.items || []).find((x) => x.id === "amc-dnn") || null,
        prism: (board.items || []).find((x) => x.id === "prism-cdn") || null,
        amcPage: { id: "amc-anon", name: AMC_ANON_TITLE, ...(board.page || {}) },
        amcMaps: { id: "amc-maps", name: "Croatia Control AMC maps iframe", ...(board.maps || {}) },
        items: board.items || [],
        howto: {
          note: "Current-situation-anonymous-users is DNN HTML (title Current situation (anonymous users), ~33426 bytes) with an iframe to /amc/maps (ASP.NET MVC HTML, ~93278 bytes). Not JSON or GeoJSON. Live map state uses SignalR plus comm.js — this dashboard HEAD-probes the pages only and does not scrape the AMC bus. comm.js / WorkAreas.js / dnn.js 6.0.0 remain portal chrome. Prism 1.5.1 is a highlighter.",
          url: publicApi("/api/chrome"),
          script: ACI_BB_LAYOUT,
          site: ACI_SITE,
          libs: "Beaver Builder layout-bundle 2.11.0.3",
          bootstrap: AIRM_BOOTSTRAP,
          gtag: SKYBRARY_GTAG_AJAX,
          dialog: SKYBRARY_DIALOG,
          footer: EC_FOOTER_JS,
          footerSite: EC_SITE,
          footerLibs: EC_FOOTER_LIBS,
          beacon: CF_BEACON,
          easa: EASA_MAIN,
          easaSite: EASA_SITE,
          kendo: AEROPUS_KENDO,
          aeropusSite: AEROPUS_SITE,
          rtca: RTCA_AJAX,
          rtcaSite: RTCA_SITE,
          crocontrol: CROCONTROL_JQ,
          crocontrolSite: CROCONTROL_SITE,
          amcSite: AMC_SITE,
          amcAnon: AMC_ANON,
          amcTitle: AMC_ANON_TITLE,
          amcMaps: AMC_MAPS,
          amcLogon: AMC_LOGON,
          amcComm: AMC_COMM,
          amcWork: AMC_WORKAREAS,
          dnn: AMC_DNN,
          prism: PRISM_CDN,
          prismSite: PRISM_SITE,
          steps: [
            "Current-situation-anonymous-users is a public DNN skin around an /amc/maps iframe. Both are text/html.",
            "Do not subscribe to /amc/signalr/hubs or paste AMC credentials here.",
            "Croatia Control jquery.min.js is wp-includes chrome, not LDZA radar JSON.",
            "Live public NM on Radar is still NSV EDYYFMP.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/eaup" || url.pathname === "/api/aup") {
      const origin = await cached(cache.eaup, "view", 60_000, 180_000, () =>
        probeEaup().catch((e) => ({ ok: false, feed: false, gwt: false, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: 0,
        feeds: origin.feed ? 1 : 0,
        origin,
        howto: {
          note: "gwt-detached-view.jsp?_view_id=EAUP_DETACHED_DETAILS is the NOP Public Portal GWT HMI for European AUP/UUP details (title AUP/UUP Details, EaupModule.nocache.js). It is HTML chrome, not JSON or GeoJSON. Programmatic EAUP/EUUP is NM B2B AirspaceAvailability SOAP/AIXM under an SLA. This dashboard does not scrape GWT RPC or subscribe to that bus.",
          url: publicApi("/api/eaup"),
          view: origin.url || "",
          nop: EAUP_NOP,
          portal: EAUP_PORTAL,
          viewId: EAUP_VIEW_ID,
          module: EAUP_MODULE,
          steps: [
            "Open the public NOP in a browser for the human EAUP tables (CDR Type 2, RSA, ATS route closures).",
            "Live public NM tracks on Radar still come from NSV EDYYFMP GeoJSON, not from this GWT view.",
            "Do not file NM B2B SOAP or paste NOP credentials here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/nm-gwt" || url.pathname === "/api/mainpages") {
      const origin = await cached(cache.gwt, "mainpages", 60_000, 180_000, () =>
        probeMainPages().catch((e) => ({ ok: false, feed: false, gwt: false, error: String(e.message || e) })),
      );
      sendJson(req, res, {
        at: new Date().toISOString(),
        n: 0,
        feeds: origin.feed ? 1 : 0,
        origin,
        howto: {
          note: "gwt/MainPages/4BDC1927B945490FDBC82DC46DD5EC4E.cache.js is one compiled GWT permutation for the NOP Public Portal MainPages HMI (PORTAL.29.0.0.1.121). application/javascript, not JSON or GeoJSON. This dashboard HEADs the permutation and reads only MainPages.nocache.js (~11 KB bootstrap). It does not download or copy the multi-megabyte cache.js and does not scrape GWT RPC or NM B2B SOAP.",
          url: publicApi("/api/nm-gwt"),
          cacheJs: MAINPAGES_CACHE,
          nocache: MAINPAGES_NOCACHE,
          nop: EAUP_NOP,
          portal: EAUP_PORTAL,
          module: MAINPAGES_MODULE,
          strongName: MAINPAGES_STRONG,
          steps: [
            "That .cache.js file is site chrome for the public NM portal, not a live track dump.",
            "Live public NM on Radar is still NSV EDYYFMP GeoJSON.",
            "Do not scrape GWT RPC or paste NOP credentials here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/crco" || url.pathname === "/api/su" || url.pathname === "/api/service-units") {
      const board = await cached(cache.ecdash, "crco", 120_000, 300_000, () =>
        fetchCrcoSu().catch((e) => ({ ok: false, feed: false, n: 0, zones: [], error: String(e.message || e) })),
      );
      sendJson(req, res, {
        ...board,
        at: new Date().toISOString(),
        howto: {
          note: "Monthly CRCO en-route service units from the public EUROCONTROL Google Sheet. Billing (distance × weight), not ASTERIX CAT, not live km. Guide PDF is HEAD-only.",
          url: publicApi("/api/crco"),
          dash: CRCO_DASH,
          pub: CRCO_PUB,
          guide: CRCO_GUIDE,
        },
      });
      return;
    }
    if (url.pathname === "/api/ec-airports" || url.pathname === "/api/airport-corner" || url.pathname === "/api/apt") {
      const board = await cached(cache.ecdash, "airports", 90_000, 180_000, () =>
        fetchEcAirports().catch((e) => ({ ok: false, feed: false, n: 0, airports: [], error: String(e.message || e) })),
      );
      sendJson(req, res, {
        ...board,
        at: new Date().toISOString(),
        howto: {
          note: "Live airport pins from api-data-app (60 airports, daily flights/delay) plus Airport Corner public events. Trails stay on Radar from NSV. Not SDDS ASTERIX, not NM B2B.",
          url: publicApi("/api/ec-airports"),
          dataApp: `${DATA_APP}/api/docs`,
          corner: APT_CORNER,
        },
      });
      return;
    }
    if (url.pathname === "/api/ec-dash" || url.pathname === "/api/dashboards" || url.pathname === "/api/data-app" || url.pathname === "/api/ec-site" || url.pathname === "/api/our-data" || url.pathname === "/api/ec-uas") {
      const [origin, sitemap] = await Promise.all([
        cached(cache.ecdash, "daily", 60_000, 180_000, () =>
          fetchEcDaily().catch((e) => ({ ok: false, feed: false, json: false, error: String(e.message || e), offers: DASHBOARD_OFFERS })),
        ),
        cached(cache.ecdash, "sitemap", 60_000, 180_000, () =>
          probeEcSitemap().catch((e) => ({ n: 0, feeds: 0, items: EC_SITEMAP, error: String(e.message || e) })),
        ),
      ]);
      const si = origin.si || {};
      const net = origin.network || {};
      const liveNet = origin.liveNet || null;
      const n = (si.flights != null ? 1 : 0) + (net.flights != null ? 1 : 0) + (origin.sitrep ? 1 : 0) + (liveNet ? 1 : 0);
      sendJson(req, res, {
        at: new Date().toISOString(),
        n,
        feeds: origin.feed ? 1 : 0,
        version: origin.version || DATA_APP_VER,
        si,
        network: net,
        liveNet,
        sitrep: origin.sitrep || null,
        news: origin.news || null,
        airport: origin.airport || null,
        livetraffic: origin.livetraffic || { url: LIVETRAFFIC, onRadar: true, fmp: NM_FMP },
        origin: {
          ok: Boolean(origin.ok),
          feed: Boolean(origin.feed),
          json: Boolean(origin.json),
          cors: origin.cors || "*",
          version: origin.version || DATA_APP_VER,
          listing: origin.listing || { url: DASHBOARDS_LISTING },
          dataApp: DATA_APP,
          errors: origin.errors || [],
        },
        offers: origin.offers || DASHBOARD_OFFERS,
        sitemap: sitemap.items || EC_SITEMAP,
        sitemapN: sitemap.n || (sitemap.items || []).length,
        sitemapFeeds: sitemap.feeds || 0,
        howto: {
          note: "euctrl-pru/aiu-portal is the Hugo source for ansperformance.eu (monthly CSVs, 403 here). aiu-live-data is R against a local MIRROR folder. ADRR is a login historical DDR2 dump, not CAT 048. PRC 2026 is a gated taxi-out contest. Live network header is NSV /eurocontrol/statistics (same JSON AIU live.html uses). Tracks stay NSV EDYYFMP. Daily SI counts stay api-data-app. PDFs are HEAD only.",
          url: publicApi("/api/ec-site"),
          listing: DASHBOARDS_LISTING,
          livetraffic: LIVETRAFFIC,
          aiuPortal: AIU_PORTAL,
          aiuLive: AIU_LIVE_PAGE,
          aiuLiveData: AIU_LIVE_DATA,
          adrr: ADRR_DASH,
          adrrMeta: ADRR_META,
          prc: PRC_2026,
          ourData: EC_OUR_DATA,
          uas: EC_UAS,
          ans: ANS_PERF,
          trendsPdf: TRENDS_PDF,
          dataApp: `${DATA_APP}/api/docs`,
          nsv: origin.livetraffic?.nsv || "https://portal.nsv.eurocontrol.int/main.js",
          steps: [
            "Radar already draws NSV EDYYFMP from the same livetraffic host (portal.nsv.eurocontrol.int).",
            "Live network header is portal.nsv.eurocontrol.int/eurocontrol/statistics — same JSON as AIU live.html.",
            "github.com/euctrl-pru/aiu-portal is Hugo chrome. ADRR/PRC are historical or gated. Do not scrape them.",
            "Filter traffic_networks by traffic.sync.id from /api/syncs?country.id=18&order[syncDate]=desc — iso2 query params are ignored.",
            "Do not copy the ADRR/Trends PDFs, scrape Drupal, or file NM B2B SOAP from here.",
          ],
        },
      });
      return;
    }
    if (url.pathname === "/api/nm") {
      const board = await loadNmBoard();
      const theater = (board.flights || []).filter((a) => inSiTheater(a.lat, a.lon));
      sendJson(req, res, {
        at: board.at,
        fmp: board.fmp,
        fmps: board.fmps || [],
        source: board.source,
        n: (board.flights || []).length,
        theater: theater.length,
        touching: (board.flights || []).filter((a) => a.touching).length,
        regulations: (board.regulations || []).slice(0, 20),
        items: theater.slice(0, 40).map((a) => ({
          id: a.id,
          lat: a.lat,
          lon: a.lon,
          altFt: a.altFt,
          gs: a.gs,
          track: a.track,
          touching: a.touching,
        })),
      });
      return;
    }
    if (url.pathname === "/api/radar") {
      sendJson(req, res, await loadRadar(url.searchParams.get("place") || "si"));
      return;
    }
    if (url.pathname === "/api/illuminators") {
      sendJson(req, res, await loadIlluminators(url.searchParams.get("place") || "si"));
      return;
    }
    if (url.pathname === "/api/lora") {
      sendJson(req, res, await loadLora(url.searchParams.get("place") || "si"));
      return;
    }
    if (url.pathname === "/api/sensors") {
      sendJson(req, res, await loadSensorsBoard(url.searchParams.get("place") || "si"));
      return;
    }
    if (url.pathname === "/api/ops") {
      sendJson(req, res, await loadOps(url.searchParams.get("place") || "si", url.searchParams.get("view") || "ops"));
      return;
    }
  } catch (e) {
    res.writeHead(502, cors);
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    return;
  }

  let file = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!extname(file)) file = "/index.html";
  try {
    const body = readFileSync(join(root, decodeURIComponent(file).replace(/^\/+/, "")));
    const ext = extname(file);
    const immutable = /\.(js|css|woff2?|png|webp|svg)$/.test(file);
    res.writeHead(200, {
      "content-type": mime[ext] || "application/octet-stream",
      "cache-control": immutable ? "public, max-age=604800, immutable" : "no-cache",
    });
    res.end(body);
  } catch {
    try {
      const body = readFileSync(join(root, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("build first");
    }
  }
});

const io = new Server(httpServer, { cors: { origin: "*" } });
emitPkt = (m) => io.emit("pkt", m);
io.on("connection", (sock) => {
  sock.on("watch", async (msg) => {
    const place = (typeof msg === "object" && msg ? msg.place : msg) || "si";
    const view = (typeof msg === "object" && msg ? msg.view : "ops") || "ops";
    sock.data.place = place;
    sock.data.view = view;
    try {
      sock.emit("ops", await loadOps(place, view));
    } catch (e) {
      sock.emit("ops", { error: String(e.message || e) });
    }
  });
});

setInterval(async () => {
  const jobs = new Map();
  for (const s of io.sockets.sockets.values()) {
    const place = s.data.place || "si";
    const view = s.data.view || "ops";
    jobs.set(`${place}:${view}`, { place, view });
  }
  if (!jobs.size) jobs.set("si:ops", { place: "si", view: "ops" });
  for (const { place, view } of jobs.values()) {
    try {
      const snap = await loadOps(place, view);
      for (const s of io.sockets.sockets.values()) {
        if ((s.data.place || "si") === place && (s.data.view || "ops") === view) s.emit("ops", snap);
      }
    } catch {
      /* keep */
    }
  }
}, 8_000);

function startRidFeed() {
  const feed = process.env.RID_FEED_URL || "";
  if (!feed) return;
  const pull = async () => {
    try {
      const d = await jget(feed, 8_000);
      ingestRidBody(d);
    } catch {
      /* receiver offline */
    }
  };
  void pull();
  setInterval(pull, 6_000);
}

function startSdrFeed() {
  const beastHost = process.env.SDR_BEAST_HOST || "";
  if (beastHost) {
    sdrFeed.connect(beastHost, Number(process.env.SDR_BEAST_PORT || 30005));
  }
  const feed = process.env.SDR_FEED_URL || process.env.SDR_JSON_URL || "";
  if (!feed) return;
  const pull = async () => {
    try {
      const r = await fetch(feed, { headers: UA, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return;
      const ctype = String(r.headers.get("content-type") || "");
      const buf = Buffer.from(await r.arrayBuffer());
      if (/octet-stream|x-beast/i.test(ctype) || buf.includes(0x1a)) sdrFeed.ingestBeast(buf);
      else {
        const text = buf.toString("utf8").trim();
        if (text.startsWith("{") || text.startsWith("[")) ingestDump1090(JSON.parse(text));
        else sdrFeed.ingestText(text);
      }
      expireMap(sdrTracks);
    } catch {
      /* feeder offline */
    }
  };
  void pull();
  setInterval(pull, 4_000);
}

function startOpenSkyPump() {
  const pull = async () => {
    openSkyStatus.auth = Boolean(openSkyCreds());
    try {
      const rows = await fetchOpenSkySi(null);
      openSkyCache = { at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
      openSkyStatus.at = Date.now();
      openSkyStatus.n = openSkyCache.rows.length;
      openSkyStatus.lastErr = "";
    } catch (e) {
      openSkyStatus.lastErr = String(e.message || e).slice(0, 180);
    }
  };
  const loop = () => {
    const ms = openSkyCreds() ? 20_000 : 240_000;
    setTimeout(() => {
      void pull().finally(loop);
    }, ms);
  };
  void pull();
  loop();
}

function ingestLeftoverCat048(buf, origin) {
  if (!buf?.length) return;
  ingestAsterixRaw(buf, { radar: origin, persistOrigin: false });
}

function startAsterixUdp() {
  const port = asterixUdpListenPort();
  const bind = process.env.ASTERIX_UDP_BIND || "0.0.0.0";
  if (!port) {
    console.log("ASTERIX leftover CAT 048 UDP off (ASTERIX_UDP_PORT=0); POST /api/asterix still ingests");
    return;
  }
  const sock = dgram.createSocket("udp4");
  sock.on("message", (msg) => {
    try {
      const hit = ingestAsterixRaw(msg);
      if (hit.n || hit.stations) bustLiveCaches();
    } catch {
      /* bad datagram */
    }
  });
  sock.on("error", (e) => {
    console.log(`ASTERIX UDP ${bind}:${port} ${String(e.message || e)}`);
  });
  sock.bind(port, bind, () => {
    console.log(`ASTERIX leftover CAT 048 UDP ${bind}:${port} · POST /api/asterix`);
  });
}

function startAsterixFeed() {
  const feed = process.env.ASTERIX_FEED_URL || "";
  if (!feed) return;
  let busy = false;
  const pull = async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await fetch(feed, { headers: { ...UA, accept: "application/octet-stream, application/json, */*" }, signal: AbortSignal.timeout(2_000) });
      if (!r.ok) throw new Error(String(r.status));
      const ctype = String(r.headers.get("content-type") || "");
      const buf = Buffer.from(await r.arrayBuffer());
      let hit;
      if (/json/i.test(ctype) || buf[0] === 0x7b || buf[0] === 0x5b) {
        try {
          hit = ingestAsterixJson(JSON.parse(buf.toString("utf8")));
        } catch {
          hit = ingestAsterixRaw(buf);
        }
      } else {
        hit = ingestAsterixRaw(buf);
      }
      if (hit.n || hit.stations) bustLiveCaches();
    } catch {
      /* feeder offline */
    } finally {
      busy = false;
    }
  };
  void pull();
  setInterval(pull, 1_000);
}

async function pullWigleApi() {
  const name = process.env.WIGLE_API_NAME || "";
  const tok = process.env.WIGLE_API_TOKEN || "";
  if (!name || !tok) return;
  const auth = `Basic ${Buffer.from(`${name}:${tok}`).toString("base64")}`;
  const since = new Date(Date.now() - 36 * 3600_000);
  const stamp = since.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const box = "latrange1=45.15&latrange2=47.15&longrange1=13.0&longrange2=16.9";
  const urls = [
    `https://api.wigle.net/api/v2/network/search?${box}&resultsPerPage=80&lastupdt=${stamp}`,
    `https://api.wigle.net/api/v2/bluetooth/search?${box}&resultsPerPage=40&lastupdt=${stamp}`,
    `https://api.wigle.net/api/v2/cell/search?${box}&resultsPerPage=40&lastupdt=${stamp}`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { ...UA, authorization: auth, accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
      if (!r.ok) throw new Error(`wigle ${r.status}`);
      const d = await r.json();
      for (const it of d.results || []) wigleFeed.upsert({ ...it, src: "wigle", ttl: 45 * 60_000, type: it.type || (u.includes("bluetooth") ? "BLE" : u.includes("cell") ? "LTE" : "WIFI") });
    } catch (e) {
      wigleFeed.status.lastErr = String(e.message || e);
    }
  }
  wigleFeed.recount();
  cache.sensors.clear();
}

function startWigleFeed() {
  if (process.env.WIGLE_API_NAME && process.env.WIGLE_API_TOKEN) {
    void pullWigleApi();
    setInterval(() => void pullWigleApi(), 120_000);
  }
  const feed = process.env.WIGGLEFISH_FEED_URL || process.env.WIGLE_JSON_URL || "";
  if (!feed) return;
  const pull = async () => {
    try {
      const d = await jget(feed, 8_000);
      wigleFeed.ingestJson(d);
      cache.sensors.clear();
    } catch (e) {
      wigleFeed.status.lastErr = String(e.message || e);
    }
  };
  void pull();
  setInterval(pull, 20_000);
}

function startWidebandFeed() {
  const feed = process.env.WIDEBAND_FEED_URL || process.env.RTL433_JSON_URL || "";
  if (!feed) return;
  const pull = async () => {
    try {
      const d = await jget(feed, 8_000);
      if (widebandFeed.looksAircraft(d)) ingestDump1090(d);
      else widebandFeed.ingestJson(d);
      cache.sensors.clear();
    } catch (e) {
      widebandFeed.status.lastErr = String(e.message || e);
    }
  };
  void pull();
  setInterval(pull, 12_000);
}

async function detectSdrHost() {
  const pubPort = Number(process.env.SDR_PUBLIC_PORT || process.env.SDR_TCP_PORT || 50001);
  if (process.env.SDR_TCP_HOST) {
    sdrFeed.setPublic(process.env.SDR_TCP_HOST, pubPort);
    return;
  }
  try {
    const ip = (await (await fetch("https://ifconfig.me/ip", { signal: AbortSignal.timeout(6_000) })).text()).trim();
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) sdrFeed.setPublic(ip, pubPort);
  } catch {
    /* keep empty until a tunnel writes it */
  }
}

function startPublicTunnel() {
  if (process.env.PUBLIC_TUNNEL === "0") return;
  const bin = [process.env.BORE_BIN, join(fileURLToPath(new URL(".", import.meta.url)), "bin/bore"), "/tmp/bore"].find((p) => p && existsSync(p));
  if (!bin) {
    console.log(`public link ${publicBase()} (bore binary missing)`);
    return;
  }
  const remote = Number(process.env.PUBLIC_TUNNEL_PORT || 41780);
  const to = process.env.PUBLIC_TUNNEL_HOST || "bore.pub";
  const launch = () => {
    const child = spawn(bin, ["local", String(port), "--to", to, "--port", String(remote)], { stdio: ["ignore", "pipe", "pipe"] });
    const note = (buf) => {
      const t = String(buf);
      if (/listening|connected|error|refused/i.test(t)) process.stdout.write(`public-tunnel ${t}`);
    };
    child.stdout.on("data", note);
    child.stderr.on("data", note);
    child.on("exit", (code) => {
      console.log(`public-tunnel exit ${code}; retry ${publicBase()}`);
      setTimeout(launch, 4000);
    });
  };
  console.log(`public link ${publicBase()}`);
  launch();
}

startMeshMqtt();
startRidFeed();
startSdrFeed();
startAsterixFeed();
startAsterixUdp();
startOpenSkyPump();
startWidebandFeed();
startWigleFeed();
startLiveRoutePump();
startPublicTunnel();
sdrFeed.listen(Number(process.env.SDR_LISTEN_PORT || 50001));
void detectSdrHost();
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`ops live on http://127.0.0.1:${port} · ${publicBase()}`);
});
void loadRadar("si").catch(() => {});
void loadNmBoard().catch(() => {});
void loadLora("si").catch(() => {});
void loadSensorsBoard("si").catch(() => {});
