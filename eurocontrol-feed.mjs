const NSV_HOSTS = ["https://portal.nsv.eurocontrol.int", "https://int-api.nsv.eurocontrol.int"];
let nsvLive = NSV_HOSTS[0];

export const NM_FMP = process.env.NM_FMP || "EDYYFMP";
export const NM_FMPS = (process.env.NM_FMPS || "EDYYFMP,LJLAFMP")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

export function interpolateFeature(feat, nowSec) {
  const ts = feat?.properties?.timestamps;
  const coords = feat?.geometry?.coordinates;
  if (!Array.isArray(ts) || !Array.isArray(coords) || !ts.length || ts.length !== coords.length) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (nowSec <= ts[0]) return { lon: first[0], lat: first[1], alt: first[2] || 0, i: 0, frac: 0, past: true };
  if (nowSec >= ts[ts.length - 1]) {
    return { lon: last[0], lat: last[1], alt: last[2] || 0, i: coords.length - 1, frac: 1, stale: nowSec - ts[ts.length - 1] > 20 * 60 };
  }
  for (let i = 0; i < ts.length - 1; i++) {
    if (nowSec > ts[i + 1]) continue;
    const span = Math.max(1, ts[i + 1] - ts[i]);
    const t = (nowSec - ts[i]) / span;
    const a = coords[i];
    const b = coords[i + 1];
    return {
      lon: a[0] + (b[0] - a[0]) * t,
      lat: a[1] + (b[1] - a[1]) * t,
      alt: (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t,
      i,
      frac: t,
      stale: false,
    };
  }
  return { lon: last[0], lat: last[1], alt: last[2] || 0, i: coords.length - 1, frac: 1, stale: true };
}

function heading(a, b) {
  if (!a || !b) return 0;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}

function knots(a, b, dt) {
  if (!a || !b || dt <= 0) return 0;
  const dLat = (b[1] - a[1]) * 111.32;
  const dLon = (b[0] - a[0]) * 78.5;
  const km = Math.hypot(dLat, dLon);
  return (km / dt) * 3600 * 0.539957;
}

export function parseNmFlights(fc, nowSec = Date.now() / 1000) {
  const feats = fc?.features || [];
  const out = [];
  for (const f of feats) {
    const pos = interpolateFeature(f, nowSec);
    if (!pos || pos.stale) continue;
    const lon = Number(pos.lon);
    const lat = Number(pos.lat);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat || !lon) continue;
    const alt = Number(pos.alt) || 0;
    if (alt < 200) continue;
    const coords = f.geometry.coordinates;
    const ts = f.properties.timestamps;
    const i = Math.min(pos.i, coords.length - 2);
    const a = coords[i];
    const b = coords[Math.min(i + 1, coords.length - 1)];
    const dt = Math.max(1, (ts[Math.min(i + 1, ts.length - 1)] || 0) - (ts[i] || 0));
    const trail = [];
    for (let k = 0; k < coords.length; k++) {
      const c = coords[k];
      if (!c || !c.length) continue;
      trail.push({
        lat: c[1],
        lon: c[0],
        alt: c[2] || 0,
        future: ts[k] > nowSec,
        color: ts[k] > nowSec ? "#9ad0ff" : "#6aa8ff",
      });
    }
    out.push({
      id: String(f.id || ""),
      lat,
      lon,
      altFt: Math.round(alt),
      track: Math.round(heading(a, b) % 360),
      gs: Math.round(knots(a, b, dt)),
      touching: Boolean(f.properties?.touching),
      lastUpdate: Number(f.properties?.lastUpdate || 0) * 1000,
      trail,
      type: "nm",
    });
  }
  return out;
}

/** Unmatched NSV already inside the radar theater is leftover 4D for the NM/IFPS chips.
 * Not CAT 048. Touching/LJLA is not required once the theater gate has run. */
export function keepNmOnlyPlot(a) {
  if (!a) return false;
  const lat = Number(a.lat);
  const lon = Number(a.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) > 0.01 && Math.abs(lon) > 0.01;
}

export function parseNmRegs(fc) {
  const feats = fc?.features || [];
  const out = [];
  for (const f of feats) {
    const pr = f.properties || {};
    const g = f.geometry || {};
    let lon = null;
    let lat = null;
    const c = g.coordinates;
    if (g.type === "Point" && Array.isArray(c) && c.length >= 2 && typeof c[0] === "number") {
      lon = c[0];
      lat = c[1];
    } else if (Array.isArray(c) && Array.isArray(c[0]) && typeof c[0][0] === "number") {
      lon = c[0][0];
      lat = c[0][1];
    }
    out.push({
      id: String(f.id || pr.locationName || ""),
      name: String(pr.locationName || f.id || "regulation"),
      fmp: String(pr.delayTVSet || ""),
      reason: String(pr.reason || ""),
      delay: Number(pr.averageDelay) || 0,
      totalDelay: Number(pr.delay) || 0,
      n: Number(pr.nrImpactedFlights) || 0,
      start: Number(pr.startTime) || 0,
      duration: Number(pr.duration) || 0,
      lat,
      lon,
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

export async function fetchNsvStatistics(ms = 8_000) {
  const d = await fetchNmJson("/eurocontrol/statistics", ms);
  const top = Array.isArray(d?.topAccumulatedDelays) ? d.topAccumulatedDelays : [];
  const live = Array.isArray(d?.topLiveDelays) ? d.topLiveDelays : [];
  return {
    airborne: Number(d?.nrAirborneTraffic) || 0,
    landed: Number(d?.nrLandedTraffic) || 0,
    planned: Number(d?.nrPlannedTraffic) || 0,
    total: Number(d?.nrTotalTraffic) || 0,
    delayMin: Number(d?.nrMinutesDelay) || 0,
    top: top.slice(0, 8).map((x) => ({
      name: String(x.displayName || ""),
      delay: Number(x.delay) || 0,
      avg: Number(x.averageDelay) || 0,
    })),
    liveTop: live.slice(0, 6).map((x) => ({
      name: String(x.displayName || ""),
      delay: Number(x.delay) || 0,
      avg: Number(x.averageDelay) || 0,
    })),
    url: `${nsvLive}/eurocontrol/statistics`,
    feed: true,
  };
}

export async function fetchNmJson(path, ms = 12_000) {
  let last = new Error(`nm ${path}`);
  const hosts = nsvLive === NSV_HOSTS[0] ? NSV_HOSTS : [nsvLive, ...NSV_HOSTS.filter((h) => h !== nsvLive)];
  for (const host of hosts) {
    try {
      const r = await fetch(`${host}${path}`, {
        headers: { accept: "application/json", "user-agent": "OpsLiveDash/1.0" },
        signal: AbortSignal.timeout(ms),
      });
      if (!r.ok) {
        last = new Error(`nm ${r.status} ${path}`);
        continue;
      }
      nsvLive = host;
      return r.json();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export function nmSource() {
  return {
    fmp: NM_FMP,
    fmps: NM_FMPS,
    host: nsvLive,
    flights: `${nsvLive}/eurocontrol/flights/${NM_FMP}`,
    flightsLjla: `${nsvLive}/eurocontrol/flights/LJLAFMP`,
    airspace: `${nsvLive}/eurocontrol/fmp/${NM_FMP}`,
    regulations: `${nsvLive}/eurocontrol/regulations`,
    portal: `${nsvLive}/eurocontrol/flights/${NM_FMP}`,
  };
}

export async function fetchNmFlightsMerged(ms = 14_000) {
  const packs = await Promise.all(
    NM_FMPS.map(async (fmp) => {
      try {
        const fc = await fetchNmJson(`/eurocontrol/flights/${fmp}`, ms);
        return { fmp, flights: parseNmFlights(fc) };
      } catch {
        return { fmp, flights: [] };
      }
    }),
  );
  const byId = new Map();
  for (const pack of packs) {
    for (const f of pack.flights) {
      const prev = byId.get(f.id);
      if (!prev) {
        f.fmp = pack.fmp;
        f.fmps = [pack.fmp];
        byId.set(f.id, f);
        continue;
      }
      if (!prev.fmps.includes(pack.fmp)) prev.fmps.push(pack.fmp);
      prev.touching = Boolean(prev.touching || f.touching);
    }
  }
  return { flights: [...byId.values()], fmps: packs.map((p) => ({ fmp: p.fmp, n: p.flights.length })) };
}

export const APT_API_GUIDE =
  "https://www.eurocontrol.int/sites/default/files/2023-10/eurocontrol-api-implementation-guide-1-300.pdf";
export const APT_API_EDITION = "1.300";
export const APT_API_DATE = "2023-10-01";
export const APT_API_REF = "APT/USD/API_Impl_Guide";

export const ESASSP_PDF =
  "https://www.eurocontrol.int/sites/default/files/2024-03/Released%20Issue%20ESASSP%20%20Vol%201%20Ed%201.3.pdf";
export const ESASSP_EDITION = "1.3";
export const ESASSP_VOL = "Vol 1";
export const ESASSP_DATE = "2024-03-29";
export const ESASSP_TITLE = "EUROCONTROL Specification for ATM Surveillance System Performance (ESASSP)";
export const SURV_SERVICE = "https://www.eurocontrol.int/service/surveillance-system-and-sensors";
export const SURV_TITLE = "Surveillance System and Sensors";
export const EASA_AMC_GM =
  "https://www.easa.europa.eu/en/document-library/acceptable-means-of-compliance-and-guidance-material/amc-gm-commission-0";
export const EASA_AMC_GM_TITLE =
  "AMC & GM to Commission Implementing Regulation (EU) 2017/373 — Issue 1, Amendment 1";
export const MICA_PDF = "https://www.eurocontrol.int/sites/default/files/2022-02/eurocontrol-20220202-mica-spec-v2.0.pdf";
export const MICA_EDITION = "2.0";
export const MICA_DATE = "2022-02-02";
export const MICA_TITLE = "EUROCONTROL Specification for Mode S Interrogator Code Allocation (MICA)";
export const SMGET_PAGE = "https://www.eurocontrol.int/tool/system-map-generator-and-extractor-tool";
export const SMGET_TITLE = "System map generator and extractor tool (SMGET)";

export async function probeHtmlHead(url, ms = 8_000) {
  const out = {
    url,
    status: 0,
    ok: false,
    bytes: 0,
    contentType: "",
    lastModified: "",
    html: false,
    json: false,
    pdf: false,
    feed: false,
    error: "",
  };
  try {
    const r = await fetch(url, {
      method: "HEAD",
      headers: { accept: "text/html,application/json;q=0.2,*/*;q=0.1", "user-agent": "OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    out.status = r.status;
    out.ok = r.ok;
    out.contentType = String(r.headers.get("content-type") || "");
    out.lastModified = String(r.headers.get("last-modified") || "");
    out.bytes = Number(r.headers.get("content-length") || 0) || 0;
    out.html = /html/i.test(out.contentType);
    out.json = /json/i.test(out.contentType);
    out.pdf = /pdf/i.test(out.contentType);
    out.feed = out.json;
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

export const EAUP_PORTAL = "PORTAL.29.0.0.1.121";
export const EAUP_VIEW_ID = "EAUP_DETACHED_DETAILS";
export const EAUP_NOP = "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/";
export const EAUP_MODULE = `${EAUP_NOP}${EAUP_PORTAL}/gwt/EaupModule/EaupModule.nocache.js`;

export function eaupViewUrl(now = Date.now()) {
  const d = new Date(now);
  const day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const ctx = `/gateway/spec/${EAUP_PORTAL}:/PUBPORTAL/gateway/spec/${EAUP_PORTAL}:TAC:${day0}:0:${now}:0:undefined:undefined:`;
  return `${EAUP_NOP}${EAUP_PORTAL}/gwt-detached-view.jsp?_portal_context=${ctx}&_view_id=${EAUP_VIEW_ID}&_parameter_set_id=3&_dataset_info=`;
}

const EAUP_UA = { accept: "text/html,*/*", "user-agent": "Mozilla/5.0 OpsLiveDash/1.0" };

export async function probeEaup(ms = 10_000) {
  const url = eaupViewUrl();
  const out = {
    url,
    nop: EAUP_NOP,
    portal: EAUP_PORTAL,
    viewId: EAUP_VIEW_ID,
    module: EAUP_MODULE,
    title: "",
    status: 0,
    ok: false,
    bytes: 0,
    contentType: "",
    gwt: false,
    json: false,
    feed: false,
    moduleBytes: 0,
    moduleLibrary: "",
    error: "",
  };
  try {
    const r = await fetch(url, { headers: EAUP_UA, signal: AbortSignal.timeout(ms), redirect: "follow" });
    out.status = r.status;
    out.ok = r.ok;
    out.contentType = String(r.headers.get("content-type") || "");
    const t = await r.text();
    out.bytes = t.length;
    const title = t.match(/<title[^>]*>([^<]+)/i);
    out.title = title ? title[1].trim() : "";
    out.gwt = /EaupModule\.nocache\.js|EAUP_DETACHED_DETAILS|gwt-detached-view/i.test(t);
    out.json = /json/i.test(out.contentType) && /^\s*[{\[]/.test(t);
    out.feed = out.json || /geojson|FeatureCollection/i.test(t);
  } catch (e) {
    out.error = String(e.message || e);
  }
  try {
    const r = await fetch(EAUP_MODULE, {
      headers: { accept: "*/*", "user-agent": "Mozilla/5.0 OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
    });
    const t = await r.text();
    out.moduleBytes = t.length;
    out.moduleLibrary = /EaupModule|gwt\.codesvr/i.test(t) ? "GWT EaupModule" : "JavaScript";
  } catch {
    /* module optional */
  }
  return out;
}

export const MAINPAGES_MODULE = "MainPages";
export const MAINPAGES_STRONG = "4BDC1927B945490FDBC82DC46DD5EC4E";
export const MAINPAGES_CACHE = `${EAUP_NOP}${EAUP_PORTAL}/gwt/MainPages/${MAINPAGES_STRONG}.cache.js`;
export const MAINPAGES_NOCACHE = `${EAUP_NOP}${EAUP_PORTAL}/gwt/MainPages/MainPages.nocache.js`;

export async function probeMainPages(ms = 10_000) {
  const hdrs = { accept: "*/*", "user-agent": "Mozilla/5.0 OpsLiveDash/1.0" };
  const out = {
    url: MAINPAGES_CACHE,
    nocache: MAINPAGES_NOCACHE,
    nop: EAUP_NOP,
    portal: EAUP_PORTAL,
    module: MAINPAGES_MODULE,
    strongName: MAINPAGES_STRONG,
    status: 0,
    ok: false,
    bytes: 0,
    contentType: "",
    lastModified: "",
    headOnly: true,
    gwt: false,
    json: false,
    soap: false,
    geojson: false,
    feed: false,
    nocacheBytes: 0,
    nocacheLibrary: "",
    permutationKnown: false,
    error: "",
  };
  try {
    const r = await fetch(MAINPAGES_CACHE, {
      method: "HEAD",
      headers: hdrs,
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    out.status = r.status;
    out.ok = r.ok;
    out.contentType = String(r.headers.get("content-type") || "");
    out.lastModified = String(r.headers.get("last-modified") || "");
    const cl = Number(r.headers.get("content-length") || 0);
    if (Number.isFinite(cl) && cl > 0) out.bytes = cl;
    out.json = /json/i.test(out.contentType);
    out.gwt = r.ok && /javascript/i.test(out.contentType);
  } catch (e) {
    out.error = String(e.message || e);
  }
  try {
    const r = await fetch(MAINPAGES_NOCACHE, {
      headers: hdrs,
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    const t = await r.text();
    out.nocacheBytes = t.length;
    out.gwt = out.gwt || /function MainPages\(|gwt\.codesvr\.MainPages|MainPages\.nocache\.js/.test(t);
    out.permutationKnown = t.includes(MAINPAGES_STRONG);
    out.nocacheLibrary = out.gwt ? "GWT MainPages.nocache.js" : "JavaScript";
    out.json = out.json || (/json/i.test(String(r.headers.get("content-type") || "")) && /^\s*[{\[]/.test(t));
    out.soap = /SOAPEnvelope|\bSOAP\b/.test(t);
    out.geojson = /FeatureCollection|geojson/i.test(t);
    out.feed = Boolean(out.json || out.geojson);
  } catch {
    /* bootstrap optional */
  }
  return out;
}

export const DATA_APP = "https://api-data-app.eurocontrol.int";
export const DATA_APP_VER = "5.0.0";
export const DASHBOARDS_LISTING = "https://www.eurocontrol.int/what-we-offer?f%5B0%5D=type%3ADashboard";
export const LIVETRAFFIC = "https://www.eurocontrol.int/shared/livetraffic/";
export const EC_OUR_DATA = "https://www.eurocontrol.int/our-data";
export const EC_UAS = "https://www.eurocontrol.int/unmanned-aircraft-systems";
export const EC_LIBRARY = "https://www.eurocontrol.int/library";
export const ANS_PERF = "https://ansperformance.eu/";
export const AIU_PORTAL = "https://github.com/euctrl-pru/aiu-portal";
export const AIU_LIVE_PAGE = "https://www.eurocontrol.int/performance/live.html";
export const AIU_LIVE_DATA = "https://github.com/euctrl-pru/aiu-live-data";
export const ADRR_DASH = "https://www.eurocontrol.int/dashboard/aviation-data-research";
export const ADRR_META = "https://www.eurocontrol.int/sites/default/files/2026-10/eurocontrol-aviation-data-repository-research-metadata.pdf";
export const PRC_2026 = "https://prc-data-challenge-2026.netlify.app/";
export const FEAST_INFO = "https://feast-info.eurocontrol.int/";
export const ATCO_PORTAL = "https://atco.eurocontrol.int/";
export const EXT_LOGIN = "https://ext.eurocontrol.int/";
export const TRENDS_PDF = "https://www.eurocontrol.int/sites/default/files/2026-09/eurocontrol-aviation-trends-issue-12.pdf";
export const ASTERIX_SEARCH =
  "https://www.eurocontrol.int/search?search_api_fulltext_op=and&keywords=asterix&sort_by=date&items_per_page=12";
export const NOP_INDEX = "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/index.html";

export const EC_SITEMAP = [
  { id: "livetraffic", name: "Live traffic SPA", url: LIVETRAFFIC, kind: "html-spa", note: "Drupal HTML wrapper. Live GeoJSON is NSV on Radar." },
  { id: "our-data", name: "Our data", url: EC_OUR_DATA, kind: "html", note: "Drupal catalog of products. Not a JSON board." },
  { id: "uas", name: "Unmanned aircraft systems", url: EC_UAS, kind: "html", note: "UAS policy page. Not live RID/UAV GeoJSON." },
  { id: "library", name: "Library", url: EC_LIBRARY, kind: "html", note: "Publication index." },
  { id: "listing", name: "What we offer", url: DASHBOARDS_LISTING, kind: "html", note: "Dashboard catalog already used by /api/ec-dash." },
  { id: "ans-perf", name: "ANS performance review", url: ANS_PERF, kind: "html", note: "Hugo site from euctrl-pru/aiu-portal. Monthly CSVs, not live tracks. This host gets 403." },
  { id: "aiu-portal", name: "AIU Portal source (GitHub)", url: AIU_PORTAL, kind: "html", note: "blogdown/Hugo for ansperformance.eu. updateCSV needs internal performance/download. Not a JSON API." },
  { id: "aiu-live-page", name: "AIU Network Live Status", url: AIU_LIVE_PAGE, kind: "html-spa", note: "AIU HTML that polls NSV /eurocontrol/statistics. Live numbers are on /api/ec-dash liveNet." },
  { id: "aiu-live-data", name: "aiu-live-data R scripts", url: AIU_LIVE_DATA, kind: "html", note: "R processors for a local MIRROR API folder. No public HTTP JSON." },
  { id: "adrr", name: "Aviation Data Repository for Research", url: ADRR_DASH, kind: "login", note: "OneSky login. Historical DDR2/ETFMS derivative, ~12 month delay. Not CAT 048." },
  { id: "adrr-meta", name: "ADRR metadata PDF", url: ADRR_META, kind: "pdf", note: "Copyrighted schema guide. HEAD-probe only." },
  { id: "prc-2026", name: "PRC Data Challenge 2026", url: PRC_2026, kind: "html", note: "Taxi-out prediction contest. Gated 2025 buckets. Not a live taxi feed." },
  { id: "feast", name: "FEAST info", url: FEAST_INFO, kind: "html", note: "ATCO selection tool info." },
  { id: "atco", name: "ATCO portal", url: ATCO_PORTAL, kind: "html", note: "Training portal chrome." },
  { id: "ext", name: "ext.eurocontrol.int TAM login", url: EXT_LOGIN, kind: "login", note: "IBM TAM login. Not a feed." },
  { id: "nop", name: "NM Public Portal index", url: NOP_INDEX, kind: "html", note: "NOP gateway HTML. GWT HMI already catalogued." },
  { id: "trends-12", name: "Aviation Trends issue 12 PDF", url: TRENDS_PDF, kind: "pdf", note: "Copyrighted PDF. HEAD-probe only." },
  { id: "asterix-search", name: "ASTERIX Drupal search", url: ASTERIX_SEARCH, kind: "html", note: "Site search results, not ASTERIX binary." },
  { id: "bra-eur-2026", name: "BRA-EUR 2026 comparison", url: "https://euctrl-pru.github.io/international-BRA-EUR-2026/", kind: "html", note: "Quarto ANS performance report. Not ASTERIX." },
  { id: "eurocontrol-r", name: "eurocontrol R package", url: "https://github.com/eurocontrol/eurocontrol", kind: "html", note: "Internal Oracle helper. Not a live radar API." },
  { id: "eurocontrol-r-docs", name: "eurocontrol pkgdown", url: "https://eurocontrol.github.io/eurocontrol/", kind: "html", note: "pkgdown for the R helper. Not CAT 021/048." },
];
export const SI_COUNTRY_ID = 18;
export const SI_ISO2 = "SI";
export const SI_ICAO = "LJ";
export const LJLJ = { code: "LJLJ", name: "Ljubljana", lat: 46.224444, lon: 14.456111 };

export const DASHBOARD_OFFERS = [
  {
    id: "livetraffic",
    name: "Live traffic",
    url: LIVETRAFFIC,
    kind: "nsv",
    live: true,
    feed: true,
    note: "NSV SPA (portal.nsv.eurocontrol.int/main.js, boundingBox Europe). Same public GeoJSON already on Radar as EDYYFMP.",
  },
  {
    id: "data-app",
    name: "Aviation Data Repository",
    url: `${DATA_APP}/api/docs`,
    kind: "json",
    live: true,
    feed: true,
    note: "api-data-app.eurocontrol.int JSON API Platform 5.0.0, CORS *. Daily traffic/delay/punctuality by sync.id, not second-by-second tracks.",
  },
  {
    id: "nsv-stats",
    name: "NSV live network header",
    url: "https://portal.nsv.eurocontrol.int/eurocontrol/statistics",
    kind: "json",
    live: true,
    feed: true,
    note: "Same JSON AIU live.html polls: airborne, planned, delay minutes, top delay locations. Not ASTERIX.",
  },
  {
    id: "aiu-portal",
    name: "AIU Portal (ansperformance.eu)",
    url: AIU_PORTAL,
    kind: "historical",
    live: false,
    feed: false,
    note: "Source for the PRU Hugo site. Monthly download CSVs via internal updateCSV. Not live.",
  },
  {
    id: "adrr",
    name: "ADRR research repository",
    url: ADRR_DASH,
    kind: "historical",
    live: false,
    feed: false,
    note: "Open research dump of DDR2/ETFMS. Login + 12-month lag. flights / trajectories / airspace_crossings. Not live radar.",
  },
  {
    id: "prc-2026",
    name: "PRC Data Challenge 2026",
    url: PRC_2026,
    kind: "historical",
    live: false,
    feed: false,
    note: "Taxi-out RMSE contest on 2025 movements. Access keys required. No live predictor.",
  },
  {
    id: "ace",
    name: "ATM cost-effectiveness (ACE)",
    url: "https://www.eurocontrol.int/ACE/",
    kind: "historical",
    live: false,
    feed: false,
    note: "Public ACE tables, 2002–2016. Not live.",
  },
  {
    id: "norti",
    name: "Network operations real time indicators",
    url: "https://www.eurocontrol.int/dashboard/network-operations-real-time-indicators",
    kind: "login",
    live: false,
    feed: false,
  },
  {
    id: "nmir",
    name: "Network Manager interactive reporting",
    url: "https://www.eurocontrol.int/dashboard/network-manager-interactive-reporting-dashboard",
    kind: "login",
    live: false,
    feed: false,
  },
  {
    id: "cns-cap",
    name: "Aircraft communication, navigation and surveillance dashboard",
    url: "https://www.eurocontrol.int/dashboard/communication-navigation-and-surveillance-dashboard",
    kind: "login",
    live: false,
    feed: false,
  },
  {
    id: "atfm-stats",
    name: "Air traffic flow management statistics dashboard",
    url: "https://www.eurocontrol.int/dashboard/air-traffic-flow-management-statistics-dashboard",
    kind: "login",
    live: false,
    feed: false,
  },
  {
    id: "flair",
    name: "Flight Level Adherence Interactive Reporting",
    url: "https://www.eurocontrol.int/dashboard/flight-level-adherence-interactive-reporting",
    kind: "login",
    live: false,
    feed: false,
  },
  {
    id: "all-causes",
    name: "All-causes delay analysis interactive dashboard",
    url: "https://www.eurocontrol.int/dashboard/all-causes-delay-analysis-interactive-dashboard",
    kind: "portal",
    live: false,
    feed: false,
  },
  {
    id: "co2mpass",
    name: "CO₂MPASS Interactive Dashboard",
    url: "https://www.eurocontrol.int/dashboard/co2mpass-interactive-dashboard",
    kind: "portal",
    live: false,
    feed: false,
  },
  {
    id: "cco-cdo",
    name: "Continuous climb and descent operations performance monitoring",
    url: "https://www.eurocontrol.int/dashboard/continuous-climb-and-descent-operations-performance-monitoring-dashboard",
    kind: "portal",
    live: false,
    feed: false,
  },
  {
    id: "civil-military",
    name: "Civil-military performance monitoring repository",
    url: "https://www.eurocontrol.int/dashboard/pan-european-repository-information-supporting-civil-military-performance-monitoring",
    kind: "portal",
    live: false,
    feed: false,
  },
];

export async function probeEcSitemap(ms = 8_000) {
  const items = await Promise.all(
    EC_SITEMAP.map(async (s) => ({ ...s, ...(await probeHtmlHead(s.url, ms)), feed: false })),
  );
  return {
    n: items.length,
    feeds: items.filter((x) => x.feed).length,
    items,
  };
}

const DATA_UA = { accept: "application/json", "user-agent": "OpsLiveDash/1.0" };

export async function fetchDataApp(path, ms = 15_000) {
  const r = await fetch(`${DATA_APP}${path}`, { headers: DATA_UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`data-app ${r.status} ${path}`);
  return r.json();
}

function members(j) {
  if (Array.isArray(j?.data)) return j.data;
  if (Array.isArray(j)) return j;
  return [];
}

function syncBrief(s) {
  if (!s) return null;
  const net = s.dataType === "network-wide";
  return {
    id: s.id,
    date: String(s.syncDate || "").slice(0, 10),
    updated: String(s.appUpdated || "").slice(0, 10),
    dataType: s.dataType || "",
    code: s.code || (net ? "NET" : ""),
    country: s.country?.name || (net ? "EUROCONTROL Network" : ""),
    iso2: s.country?.iso2 || (net ? "NET" : ""),
    icao: s.country?.icao || (net ? "" : ""),
  };
}

function pickNetwork(rows, networkType, dateRange, category) {
  if (!Array.isArray(rows)) return null;
  const hit = rows.find((r) => {
    const cat =
      r.traffic?.rankingCategory ||
      r.delay?.rankingCategory ||
      r.punctuality?.rankingCategory ||
      r.co2?.rankingCategory ||
      r.billed?.rankingCategory;
    return r.networkType === networkType && r.dateRange === dateRange && (!category || cat === category);
  });
  if (!hit) return null;
  const n = Number(hit.value);
  return {
    networkType,
    dateRange,
    category: hit.traffic?.rankingCategory || hit.delay?.rankingCategory || category || "",
    value: Number.isFinite(n) ? n : null,
    vsStart: hit.startDateValue == null ? null : Number(hit.startDateValue),
    vsPrev: hit.prevDateValue == null ? null : Number(hit.prevDateValue),
    rank: hit.rank == null ? null : Number(hit.rank),
  };
}

function pct(x) {
  if (x == null || !Number.isFinite(Number(x))) return null;
  return Math.round(Number(x) * 1000) / 10;
}

function snapshotFrom(sync, trafficRows, delayRows, extra = {}) {
  const flights = pickNetwork(trafficRows, "total", "DY", "network");
  const y2d = pickNetwork(trafficRows, "total", "Y2D", "network");
  const delayMin = pickNetwork(delayRows, "avg", "DY", "network");
  const delayTot = pickNetwork(delayRows, "total", "DY", "network");
  const co2 = pickNetwork(extra.co2 || [], "total", "MM", "network");
  const billed = pickNetwork(extra.billed || [], "total", "MM", "network");
  return {
    sync: syncBrief(sync),
    flights: flights?.value ?? null,
    vs2019Pct: pct(flights?.vsStart),
    vsPrevPct: pct(flights?.vsPrev),
    rank: flights?.rank ?? null,
    y2d: y2d?.value ?? null,
    delayMin: delayMin?.value ?? null,
    delayTotalMin: delayTot?.value ?? null,
    co2: co2?.value ?? null,
    billed: billed?.value ?? null,
  };
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sitrepBrief(row) {
  if (!row) return null;
  const text = stripHtml(row.content || "");
  const flights = text.match(/([\d,]+)\s+daily flights/i);
  const delay = text.match(/ATFM delay was\s+([\d.]+)\s*min/i);
  return {
    id: row.id,
    date: String(row.date || "").slice(0, 10),
    title: String(row.title || ""),
    flights: flights ? Number(String(flights[1]).replace(/,/g, "")) : null,
    delayMin: delay ? Number(delay[1]) : null,
  };
}

async function latestSync(query) {
  const j = await fetchDataApp(`/api/syncs?${query}&order[syncDate]=desc&itemsPerPage=1`);
  return members(j)[0] || null;
}

async function settled(label, fn) {
  try {
    return { ok: true, label, value: await fn() };
  } catch (e) {
    return { ok: false, label, error: String(e.message || e) };
  }
}

export async function fetchEcDaily() {
  const listing = {
    url: DASHBOARDS_LISTING,
    status: 0,
    ok: false,
    bytes: 0,
    livetraffic: true,
    nsv: true,
  };
  try {
    const r = await fetch(DASHBOARDS_LISTING, {
      method: "HEAD",
      headers: { accept: "text/html", "user-agent": "Mozilla/5.0 OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    listing.status = r.status;
    listing.ok = r.ok;
    listing.bytes = Number(r.headers.get("content-length") || 0) || 0;
  } catch (e) {
    listing.error = String(e.message || e);
  }

  const [docs, siSync, netSync, sitrep, news, apt, liveNetR] = await Promise.all([
    settled("docs", async () => {
      const r = await fetch(`${DATA_APP}/api/docs`, {
        headers: { accept: "*/*", "user-agent": "OpsLiveDash/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`data-app ${r.status} /api/docs`);
      return r.json();
    }),
    settled("siSync", () => latestSync(`country.id=${SI_COUNTRY_ID}`)),
    settled("netSync", () => latestSync("dataType=network-wide")),
    settled("sitrep", () => fetchDataApp("/api/situation_reports?itemsPerPage=1&order[date]=desc")),
    settled("news", () => fetchDataApp("/api/news?itemsPerPage=1")),
    settled("ljlj", () => fetchDataApp("/api/airports?itemsPerPage=1&code=LJLJ")),
    settled("liveNet", () => fetchNsvStatistics()),
  ]);

  const si = siSync.ok ? siSync.value : null;
  const net = netSync.ok ? netSync.value : null;
  const siId = si?.id;
  const netId = net?.id;

  const [siTn, siDn, netTn, netDn, siCo2, siBill, netCo2] = await Promise.all([
    siId
      ? settled("siTn", () => fetchDataApp(`/api/traffic_networks?itemsPerPage=20&traffic.sync.id=${siId}`))
      : Promise.resolve({ ok: false, label: "siTn", value: null }),
    siId
      ? settled("siDn", () => fetchDataApp(`/api/delay_networks?itemsPerPage=30&delay.sync.id=${siId}`))
      : Promise.resolve({ ok: false, label: "siDn", value: null }),
    netId
      ? settled("netTn", () => fetchDataApp(`/api/traffic_networks?itemsPerPage=20&traffic.sync.id=${netId}`))
      : Promise.resolve({ ok: false, label: "netTn", value: null }),
    netId
      ? settled("netDn", () => fetchDataApp(`/api/delay_networks?itemsPerPage=30&delay.sync.id=${netId}`))
      : Promise.resolve({ ok: false, label: "netDn", value: null }),
    siId
      ? settled("siCo2", () => fetchDataApp(`/api/co2_networks?itemsPerPage=12&co2.sync.id=${siId}`))
      : Promise.resolve({ ok: false, label: "siCo2", value: null }),
    siId
      ? settled("siBill", () => fetchDataApp(`/api/billed_networks?itemsPerPage=12&billed.sync.id=${siId}`))
      : Promise.resolve({ ok: false, label: "siBill", value: null }),
    netId
      ? settled("netCo2", () => fetchDataApp(`/api/co2_networks?itemsPerPage=12&co2.sync.id=${netId}`))
      : Promise.resolve({ ok: false, label: "netCo2", value: null }),
  ]);

  const siSnap = snapshotFrom(si, members(siTn.value), members(siDn.value), {
    co2: members(siCo2.value),
    billed: members(siBill.value),
  });
  const netSnap = snapshotFrom(net, members(netTn.value), members(netDn.value), { co2: members(netCo2.value) });
  const newsRow = members(news.ok ? news.value : null)[0];
  const aptRow = members(apt.ok ? apt.value : null)[0];

  const errors = [docs, siSync, netSync, sitrep, news, apt, liveNetR, siTn, siDn, netTn, netDn, siCo2, siBill, netCo2]
    .filter((x) => x && !x.ok)
    .map((x) => `${x.label}: ${x.error}`);

  const flights = (siSnap.flights != null ? 1 : 0) + (netSnap.flights != null ? 1 : 0);
  return {
    ok: flights > 0 || Boolean(liveNetR.ok),
    feed: flights > 0 || Boolean(liveNetR.ok),
    json: true,
    cors: "*",
    version: docs.ok ? docs.value?.data?.version || DATA_APP_VER : DATA_APP_VER,
    title: docs.ok ? docs.value?.data?.title || "EUROCONTROL Data" : "EUROCONTROL Data",
    listing,
    livetraffic: { url: LIVETRAFFIC, nsv: "https://portal.nsv.eurocontrol.int/main.js", onRadar: true, fmp: NM_FMP },
    liveNet: liveNetR.ok ? liveNetR.value : null,
    si: siSnap,
    network: netSnap,
    sitrep: sitrepBrief(members(sitrep.ok ? sitrep.value : null)[0]),
    news: newsRow
      ? {
          title: newsRow.title || "",
          date: String(newsRow.newsDate || "").slice(0, 10),
          url: newsRow.externalLink || "",
        }
      : null,
    airport: aptRow
      ? {
          code: aptRow.code || LJLJ.code,
          name: aptRow.name || LJLJ.name,
          lat: Number(aptRow.latitude) || LJLJ.lat,
          lon: Number(aptRow.longitude) || LJLJ.lon,
        }
      : LJLJ,
    offers: DASHBOARD_OFFERS,
    errors,
  };
}

export const APT_CORNER = "https://ext.eurocontrol.int/airport_corner_public/events";
export const APT_FOCUS = [
  "LJLJ",
  "LOWW",
  "EDDM",
  "LDZA",
  "LQSA",
  "LYBE",
  "LIMC",
  "LSZH",
  "LKPR",
  "LHBP",
  "LIME",
  "LIPE",
  "EDDF",
  "LFPG",
  "LIRF",
  "EBBR",
];

function pickDyTotal(rows) {
  return pickNetwork(rows, "total", "DY", "network") || pickNetwork(rows, "total", "DY");
}

function pickDyAvg(rows) {
  return pickNetwork(rows, "avg", "DY", "network") || pickNetwork(rows, "avg", "DY") || pickNetwork(rows, "total", "DY");
}

async function fetchAirportCornerEvents(ms = 12_000) {
  const r = await fetch(APT_CORNER, {
    headers: { accept: "text/html", "user-agent": "Mozilla/5.0 OpsLiveDash/1.0" },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`airport-corner ${r.status}`);
  const html = await r.text();
  const events = [];
  const blocks = html.split(/(?=[A-Z]{4}\s*\/\s*[A-Z]{3})/);
  for (const b of blocks) {
    const head = b.match(/^([A-Z]{4})\s*\/\s*([A-Z]{3})[^\n<]{0,80}/);
    if (!head) continue;
    const icao = head[1];
    const rows = [...b.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)];
    for (const row of rows.slice(0, 6)) {
      const title = stripHtml(row[1]);
      if (!title || /^(title|description)$/i.test(title)) continue;
      events.push({
        icao,
        title: title.slice(0, 80),
        detail: stripHtml(row[2]).slice(0, 180),
        start: stripHtml(row[3]).slice(0, 24),
        end: stripHtml(row[4]).slice(0, 24),
      });
    }
  }
  return events;
}

export async function fetchEcAirports() {
  const [listPack, latestPack, evPack] = await Promise.all([
    settled("airports", () => fetchDataApp("/api/airports?itemsPerPage=60&order[code]=asc")),
    settled("latest", () => fetchDataApp("/api/syncs?dataType=airport&order[syncDate]=desc&itemsPerPage=1")),
    settled("corner", () => fetchAirportCornerEvents()),
  ]);
  const list = members(listPack.ok ? listPack.value : null);
  const latest = members(latestPack.ok ? latestPack.value : null)[0];
  const day = String(latest?.syncDate || "").slice(0, 10);
  let syncs = [];
  if (day) {
    const pages = await Promise.all([
      settled("syncs1", () => fetchDataApp(`/api/syncs?dataType=airport&syncDate[after]=${day}&syncDate[before]=${day}&itemsPerPage=80`)),
      settled("syncs2", () => fetchDataApp(`/api/syncs?dataType=airport&syncDate[after]=${day}&syncDate[before]=${day}&itemsPerPage=80&currentPage=2`)),
    ]);
    syncs = pages.flatMap((p) => members(p.ok ? p.value : null));
  }
  const byCode = new Map(syncs.map((s) => [String(s.code || s.airport?.code || "").toUpperCase(), s]));
  const focus = list.filter((a) => APT_FOCUS.includes(String(a.code || "").toUpperCase()) && byCode.has(String(a.code || "").toUpperCase()));
  const metrics = await Promise.all(
    focus.map(async (a) => {
      const code = String(a.code).toUpperCase();
      const sid = byCode.get(code).id;
      const [tn, dn] = await Promise.all([
        settled(`${code}tn`, () => fetchDataApp(`/api/traffic_networks?traffic.sync.id=${sid}&itemsPerPage=20`)),
        settled(`${code}dn`, () => fetchDataApp(`/api/delay_networks?delay.sync.id=${sid}&itemsPerPage=20`)),
      ]);
      const flights = pickDyTotal(members(tn.ok ? tn.value : null));
      const delay = pickDyAvg(members(dn.ok ? dn.value : null));
      return {
        code,
        flights: flights?.value ?? null,
        vsPrevPct: pct(flights?.vsPrev),
        delayMin: delay?.value ?? null,
      };
    }),
  );
  const met = Object.fromEntries(metrics.map((m) => [m.code, m]));
  const events = evPack.ok ? evPack.value || [] : [];
  const byIcaoEvents = new Map();
  for (const e of events) {
    const k = String(e.icao || "").toUpperCase();
    if (!byIcaoEvents.has(k)) byIcaoEvents.set(k, []);
    byIcaoEvents.get(k).push(e);
  }
  const airports = list
    .map((a) => {
      const code = String(a.code || "").toUpperCase();
      const m = met[code] || {};
      const ev = byIcaoEvents.get(code) || [];
      return {
        id: `apt:${code}`,
        code,
        name: a.name || code,
        lat: Number(a.latitude),
        lon: Number(a.longitude),
        flights: m.flights ?? null,
        vsPrevPct: m.vsPrevPct ?? null,
        delayMin: m.delayMin ?? null,
        events: ev.slice(0, 4),
        focus: APT_FOCUS.includes(code),
      };
    })
    .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));
  return {
    ok: airports.length > 0,
    feed: airports.length > 0,
    json: true,
    at: new Date().toISOString(),
    day,
    n: airports.length,
    withMetrics: metrics.filter((m) => m.flights != null).length,
    events: events.length,
    airports,
    origin: {
      dataApp: DATA_APP,
      corner: APT_CORNER,
      nsv: "https://portal.nsv.eurocontrol.int/main.js",
    },
  };
}

/** Official CRCO en-route service-units sheet used by EnRouteMainDashboard.html. Monthly, not ASTERIX. */
export const CRCO_SHEET_ID = "1rpyNgDuSggMXH35nU0EfEEhD3S7T3AL27we2SXs_jS0";
export const CRCO_DASH = "https://www.eurocontrol.int/ServiceUnits/Dashboard/EnRouteMainDashboard.html";
export const CRCO_GUIDE = "https://www.eurocontrol.int/archive_download/all/node/10683";
export const CRCO_PUB = "https://www.eurocontrol.int/publication/en-route-service-units-monitoring";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/** FAB CE charging-zone pins (state centroid, not a radar site). */
export const CRCO_ZONES = {
  Slovenia: { lat: 46.15, lon: 14.82, code: "SI", ansp: "Slovenia Control", fab: "FAB CE" },
  Austria: { lat: 47.52, lon: 14.55, code: "AT", ansp: "Austro Control", fab: "FAB CE" },
  Croatia: { lat: 45.1, lon: 16.0, code: "HR", ansp: "Croatia Control", fab: "FAB CE" },
  "Czech republic": { lat: 49.82, lon: 15.47, code: "CZ", ansp: "ANS CR", fab: "FAB CE" },
  Hungary: { lat: 47.16, lon: 19.5, code: "HU", ansp: "HungaroControl", fab: "FAB CE" },
  "Slovak republic": { lat: 48.67, lon: 19.7, code: "SK", ansp: "LPS SR", fab: "FAB CE" },
  "Bosnia Herzegovina": { lat: 44.17, lon: 17.68, code: "BA", ansp: "BHANSA", fab: "FAB CE" },
};

const CRCO_FOCUS = [...Object.keys(CRCO_ZONES), "CRCO-Total"];

function parseGviz(text) {
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j < i) throw new Error("gviz envelope");
  return JSON.parse(text.slice(i, j + 1));
}

function cellNum(c) {
  if (!c) return null;
  const n = Number(c.v);
  return Number.isFinite(n) ? n : null;
}

function cellTxt(c) {
  if (!c) return "";
  if (c.v == null) return "";
  return String(c.v).trim();
}

function cellPct(c) {
  if (!c) return null;
  const formatted = String(c.f || "").replace("%", "").replace(",", ".").trim();
  if (formatted) {
    const n = Number(formatted);
    if (Number.isFinite(n)) return n;
  }
  const v = Number(c.v);
  if (!Number.isFinite(v)) return null;
  return Math.abs(v) <= 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10;
}

async function fetchGviz(tq, ms = 18_000) {
  const url = `https://docs.google.com/spreadsheets/d/${CRCO_SHEET_ID}/gviz/tq?tqx=out:json&tq=${encodeURIComponent(tq)}`;
  const r = await fetch(url, {
    headers: { accept: "text/plain,application/javascript,*/*", "user-agent": "Mozilla/5.0 OpsLiveDash/1.0" },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`crco gviz ${r.status}`);
  const body = parseGviz(await r.text());
  if (body.status && body.status !== "ok") throw new Error(body.errors?.[0]?.message || "gviz not ok");
  return body.table || { cols: [], rows: [] };
}

export async function fetchCrcoSu() {
  const yearNow = new Date().getUTCFullYear();
  let year = yearNow;
  let table = await fetchGviz(
    `select A, B, C, D, E, F, H, L where A=${year} and B matches '${CRCO_FOCUS.join("|")}'`,
  );
  if (!(table.rows || []).length) {
    year = yearNow - 1;
    table = await fetchGviz(
      `select A, B, C, D, E, F, H, L where A=${year} and B matches '${CRCO_FOCUS.join("|")}'`,
    );
  }
  const byState = new Map();
  for (const row of table.rows || []) {
    const c = row.c || [];
    const state = cellTxt(c[1]);
    if (!CRCO_FOCUS.includes(state)) continue;
    const rec = {
      year: cellNum(c[0]) || year,
      state,
      month: cellTxt(c[2]),
      actual: cellNum(c[3]),
      plan: cellNum(c[4]),
      prev: cellNum(c[5]),
      cumul: cellNum(c[6]),
      vsPlanPct: cellPct(c[7]),
    };
    if (!byState.has(state)) byState.set(state, []);
    byState.get(state).push(rec);
  }
  const latestMonth = MONTHS.reduce((acc, m) => {
    const hit = [...byState.values()].some((rows) => rows.some((r) => r.month === m && r.actual != null));
    return hit ? m : acc;
  }, "");
  const zones = CRCO_FOCUS.map((state) => {
    const rows = byState.get(state) || [];
    const latest = rows.find((r) => r.month === latestMonth && r.actual != null) || rows.filter((r) => r.actual != null).at(-1);
    const geo = CRCO_ZONES[state];
    return {
      id: `su:${state}`,
      state,
      code: geo?.code || "EU",
      ansp: geo?.ansp || "CRCO",
      fab: geo?.fab || (state === "CRCO-Total" ? "CRCO" : ""),
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      year,
      month: latest?.month || latestMonth,
      actual: latest?.actual ?? null,
      plan: latest?.plan ?? null,
      prev: latest?.prev ?? null,
      cumul: latest?.cumul ?? null,
      vsPlanPct: latest?.vsPlanPct ?? null,
      vsPrevPct:
        latest?.actual != null && latest?.prev
          ? Math.round(((latest.actual - latest.prev) / latest.prev) * 1000) / 10
          : null,
      series: rows
        .filter((r) => r.actual != null)
        .map((r) => ({ month: r.month, actual: r.actual, plan: r.plan, prev: r.prev })),
    };
  }).filter((z) => z.actual != null || z.series.length);
  const si = zones.find((z) => z.state === "Slovenia") || null;
  const total = zones.find((z) => z.state === "CRCO-Total") || null;
  return {
    ok: zones.length > 0,
    feed: zones.length > 0,
    json: true,
    at: new Date().toISOString(),
    year,
    month: latestMonth,
    n: zones.length,
    slovenia: si,
    total,
    zones,
    origin: {
      sheet: `https://docs.google.com/spreadsheets/d/${CRCO_SHEET_ID}/edit?usp=sharing`,
      dash: CRCO_DASH,
      pub: CRCO_PUB,
      guide: CRCO_GUIDE,
      cadence: "monthly",
      note: "CRCO service units from the public EUROCONTROL sheet. Distance×weight billing, not ASTERIX CAT, not real-time km.",
    },
  };
}
