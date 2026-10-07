/** ICAO FPL / ADEXP overlay. Geocodes known aerodromes + Field 15 lat/lon only. */

export const IFPS_MANUAL =
  "https://www.eurocontrol.int/sites/default/files/2026-04/eurocontrol-ifps-user-manual-wave-2-3-external.pdf";
export const IFPS_MANUAL_NM =
  "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/PORTAL.29.0.0.1.121/_res/IFPS_Users_Manual_External.pdf";
export const IFPS_PORTAL = "PORTAL.29.0.0.1.121";
export const IFPS_EDITION = "WAVE-2.3";
export const IFPUV = "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/";

export async function probeIfpsPdf(url, ms = 8_000) {
  const out = {
    url,
    status: 0,
    ok: false,
    bytes: 0,
    contentType: "",
    lastModified: "",
    pdf: false,
    feed: false,
    error: "",
  };
  try {
    const r = await fetch(url, {
      method: "HEAD",
      headers: { accept: "application/pdf,*/*", "user-agent": "OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    out.status = r.status;
    out.ok = r.ok;
    out.contentType = String(r.headers.get("content-type") || "");
    out.lastModified = String(r.headers.get("last-modified") || "");
    out.bytes = Number(r.headers.get("content-length") || r.headers.get("content-size") || 0) || 0;
    out.pdf = /pdf/i.test(out.contentType) || /\.pdf(\?|$)/i.test(url);
    out.feed = false;
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

export async function probeIfpsManuals(ms = 8_000) {
  const [nm, web] = await Promise.all([probeIfpsPdf(IFPS_MANUAL_NM, ms), probeIfpsPdf(IFPS_MANUAL, ms)]);
  return {
    edition: IFPS_EDITION,
    portal: IFPS_PORTAL,
    feeds: 0,
    nm: { id: "nm-portal", name: "NM Public Portal IFPS Users Manual", ...nm },
    web: { id: "eurocontrol-web", name: "eurocontrol.int WAVE-2.3 PDF", ...web },
  };
}

const AIRPORTS = {
  LJLJ: [46.2236, 14.4576],
  LJMB: [46.4797, 15.6861],
  LJPZ: [45.4734, 13.615],
  LJCE: [45.9, 15.5303],
  LJBL: [46.3564, 14.1744],
  LJSG: [46.4725, 15.1169],
  LJDI: [45.6825, 14.0072],
  LJCL: [46.2456, 15.2381],
  LJAJ: [45.8894, 13.8956],
  LJPO: [45.7528, 14.1964],
  LOWW: [48.1103, 16.5697],
  LOWL: [48.2332, 14.1875],
  LOWG: [46.9911, 15.4396],
  LOWK: [46.6425, 14.3378],
  LOWI: [47.2602, 11.344],
  LOWS: [47.7933, 13.0043],
  LOXZ: [47.2028, 14.7442],
  LDZA: [45.7431, 16.0689],
  LDSP: [43.5389, 16.2981],
  LDDU: [42.5614, 18.2683],
  LDPL: [44.8935, 13.9222],
  LDZD: [44.1083, 15.3467],
  LDRI: [45.2169, 14.5703],
  LDLO: [44.5658, 14.3931],
  LDOS: [45.4627, 18.8102],
  LIPZ: [45.5053, 12.3519],
  LIPQ: [45.8275, 13.4722],
  LIPX: [45.3957, 10.8885],
  LIME: [45.6739, 9.7042],
  LIMC: [45.6306, 8.7231],
  LIML: [45.4451, 9.2767],
  LIMF: [45.2008, 7.6498],
  LIRF: [41.8003, 12.2389],
  LIRN: [40.8847, 14.2908],
  LIMJ: [44.4133, 8.8375],
  LHBP: [47.4369, 19.2611],
  LHDC: [47.4889, 21.6153],
  LHSM: [46.6864, 17.1591],
  LHPR: [47.6244, 17.8133],
  EDDM: [48.3538, 11.7861],
  EDDF: [50.0333, 8.5706],
  EDDS: [48.6899, 9.2219],
  EDDK: [50.8659, 7.1427],
  EDDL: [51.2895, 6.7668],
  EDDH: [53.6304, 9.9882],
  EDDB: [52.3667, 13.5033],
  EDDW: [53.0475, 8.7867],
  LQSA: [43.8247, 18.3314],
  LQTZ: [44.4586, 18.7248],
  LQBK: [44.9414, 17.2975],
  LYBE: [44.8184, 20.3091],
  LYNI: [43.3372, 21.8536],
  LSZH: [47.4581, 8.5481],
  LSGG: [46.2381, 6.1089],
  LFSB: [47.59, 7.5292],
  LKPR: [50.1008, 14.26],
  LZIB: [48.1702, 17.2127],
  EPWA: [52.1657, 20.9671],
  EKCH: [55.618, 12.656],
  ESSA: [59.6519, 17.9186],
  ENGM: [60.1939, 11.1004],
  EHAM: [52.3086, 4.7639],
  EBBR: [50.9014, 4.4844],
  LFPG: [49.0097, 2.5478],
  LFPO: [48.7233, 2.3794],
  LFML: [43.4393, 5.2214],
  EGLL: [51.4775, -0.4614],
  EGKK: [51.1481, -0.1903],
  EGCC: [53.3537, -2.275],
  LEMD: [40.4983, -3.5676],
  LEBL: [41.2971, 2.0785],
  LPPT: [38.7756, -9.1354],
  LGAV: [37.9364, 23.9445],
  LTFM: [41.2753, 28.7519],
  LTBA: [40.9769, 28.8146],
  LTAI: [36.8987, 30.8005],
  LTBJ: [38.2924, 27.1569],
  LYPG: [42.3594, 19.2519],
  LYTV: [42.4047, 18.7233],
  BKPR: [42.5728, 21.0358],
  LWSK: [41.9616, 21.6214],
  EDJA: [47.9888, 10.2395],
  EDSB: [48.7794, 8.0806],
  LGTS: [40.5197, 22.9709],
  LGKL: [37.0683, 22.0255],
  OLBA: [33.8209, 35.4884],
  OJAI: [31.7226, 35.9932],
  UGTB: [41.6692, 44.9547],
  OMAA: [24.433, 54.6511],
  OMDB: [25.2532, 55.3657],
  KJFK: [40.6413, -73.7781],
  KBOS: [42.3656, -71.0096],
  KMSS: [44.9358, -74.8455],
  KLAX: [33.9425, -118.4081],
};

export function parseLatLonToken(tok) {
  const m = String(tok || "")
    .toUpperCase()
    .match(/^(\d{4}|\d{6})([NS])(\d{5}|\d{7})([EW])$/);
  if (!m) return null;
  if ((m[1].length === 4) !== (m[3].length === 5)) return null;
  const lat = dms(m[1]) * (m[2] === "S" ? -1 : 1);
  const lon = dms(m[3]) * (m[4] === "W" ? -1 : 1);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, id: m[0], kind: "latlon" };
}

function dms(s) {
  if (s.length === 4) return Number(s.slice(0, 2)) + Number(s.slice(2, 4)) / 60;
  if (s.length === 5) return Number(s.slice(0, 3)) + Number(s.slice(3, 5)) / 60;
  if (s.length === 6) return Number(s.slice(0, 2)) + Number(s.slice(2, 4)) / 60 + Number(s.slice(4, 6)) / 3600;
  if (s.length === 7) return Number(s.slice(0, 3)) + Number(s.slice(3, 5)) / 60 + Number(s.slice(5, 7)) / 3600;
  return NaN;
}

function airport(icao) {
  const id = String(icao || "")
    .toUpperCase()
    .trim();
  if (!/^[A-Z]{4}$/.test(id)) return null;
  const ll = AIRPORTS[id];
  if (!ll) return null;
  return { lat: ll[0], lon: ll[1], id, kind: "ad" };
}

function parseSpeedLevel(tok) {
  const t = String(tok || "").toUpperCase();
  const m = t.match(/^([NKM])(\d{3,4})([AFS])(\d{3,4})$/);
  if (!m) return null;
  const unit = m[1];
  const spd = Number(m[2]);
  const altKind = m[3];
  const altN = Number(m[4]);
  let gs = 0;
  if (unit === "N") gs = spd;
  else if (unit === "K") gs = Math.round(spd * 0.539957);
  else if (unit === "M") gs = Math.round((spd / 100) * 666);
  let altFt = 0;
  if (altKind === "F") altFt = altN * 100;
  else if (altKind === "A") altFt = altN * 100;
  else if (altKind === "S") altFt = Math.round(altN * 3.28084);
  return { gs, altFt };
}

function geocodeRoute(route) {
  const tokens = String(route || "")
    .toUpperCase()
    .replace(/[/,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const pts = [];
  const skipped = [];
  let cruise = { gs: 0, altFt: 0 };
  for (const tok of tokens) {
    if (/^(DCT|IFR|VFR|T|C)$/.test(tok)) continue;
    const sl = parseSpeedLevel(tok);
    if (sl) {
      cruise = sl;
      continue;
    }
    const ll = parseLatLonToken(tok);
    if (ll) {
      pts.push({ ...ll, alt: cruise.altFt });
      continue;
    }
    const ad = airport(tok);
    if (ad) {
      pts.push({ ...ad, alt: cruise.altFt });
      continue;
    }
    if (/^[A-Z]{4}$/.test(tok) || /^[A-Z0-9]{2,5}$/.test(tok) || /^[A-Z]{2,5}\d{3,6}$/.test(tok)) {
      skipped.push(tok);
    }
  }
  return { pts, skipped, cruise };
}

function item18(raw) {
  const t = String(raw || "").toUpperCase();
  const grab = (k) => {
    const m = t.match(new RegExp(`(?:^|\\s)${k}/(\\S+)`));
    return m ? m[1] : "";
  };
  return {
    reg: grab("REG").replace(/[^A-Z0-9]/g, ""),
    depZ: grab("DEP"),
    destZ: grab("DEST"),
    dof: grab("DOF"),
    opr: grab("OPR"),
  };
}

function trailOf(dep, routePts, dest) {
  const out = [];
  const push = (p, future = true) => {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
    const last = out[out.length - 1];
    if (last && Math.abs(last.lat - p.lat) < 1e-4 && Math.abs(last.lon - p.lon) < 1e-4) return;
    out.push({
      lat: p.lat,
      lon: p.lon,
      alt: p.alt || 0,
      id: p.id,
      color: "#c9a227",
      future,
      filed: true,
    });
  };
  push(dep);
  for (const p of routePts) push(p);
  push(dest);
  return out;
}

function rec({ format, flight, typecode, dep, dest, route, other, altFt, gs }) {
  const depPt = airport(dep);
  const destPt = airport(dest);
  const extra = item18(other);
  const zzDep = parseLatLonToken(extra.depZ) || airport(extra.depZ);
  const zzDest = parseLatLonToken(extra.destZ) || airport(extra.destZ);
  const { pts, skipped, cruise } = geocodeRoute(route);
  const trail = trailOf(depPt || zzDep, pts, destPt || zzDest);
  const fixes = pts.filter((p) => p.kind === "latlon");
  const here = fixes[fixes.length - 1] || depPt || destPt || zzDep || zzDest;
  return {
    flight,
    typecode,
    dep: dep || extra.depZ || "",
    dest: dest || extra.destZ || "",
    reg: extra.reg,
    route: String(route || "").replace(/\s+/g, " ").trim(),
    format,
    src: "ifps",
    altFt: altFt || cruise.altFt || 0,
    gs: gs || cruise.gs || 0,
    track: 0,
    lat: here ? here.lat : null,
    lon: here ? here.lon : null,
    fix: Boolean(here),
    trail,
    skipped,
    known: trail.map((p) => p.id).filter(Boolean),
    at: Date.now(),
  };
}

function icaoFields(block) {
  const inner = String(block || "")
    .replace(/^\s*\(/, "")
    .replace(/\)\s*$/, "")
    .trim();
  return inner
    .split(/\s*-\s*/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function parseIcaoFpl(block) {
  const parts = icaoFields(block);
  if (!parts.length || !/^FPL$/i.test(parts[0])) return null;
  const flight = String(parts[1] || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (flight.length < 2 || flight.length > 8) return null;
  let i = 2;
  if (parts[i] && /^[IVYZ][SNGMX]?$/i.test(parts[i])) i += 1;
  let typecode = "";
  if (parts[i] && /^[A-Z0-9]{2,4}(\/[A-Z])?$/i.test(parts[i]) && !/^[A-Z]{4}\d{4}/.test(parts[i])) {
    typecode = parts[i].split("/")[0].toUpperCase();
    i += 1;
  }
  if (parts[i] && /[A-Z0-9]{1,40}\/[A-Z0-9]{1,20}/i.test(parts[i]) && !/^[A-Z]{4}\d{4}/.test(parts[i])) i += 1;
  const depM = String(parts[i] || "")
    .toUpperCase()
    .match(/^([A-Z]{4})(\d{4})?/);
  i += 1;
  const route = parts[i] || "";
  i += 1;
  const destM = String(parts[i] || "")
    .toUpperCase()
    .match(/^([A-Z]{4})(\d{4})?/);
  const other = parts.slice(i + 1).join(" ");
  return rec({
    format: "icao",
    flight,
    typecode,
    dep: depM ? depM[1] : "",
    dest: destM ? destM[1] : "",
    route,
    other,
  });
}

function adexpMap(text) {
  const map = {};
  const re = /^-([A-Z][A-Z0-9]*)(?:\s+([^\n]*))?$/gm;
  let m;
  while ((m = re.exec(text))) {
    const k = m[1].toUpperCase();
    const v = String(m[2] || "").trim();
    if (k === "BEGIN" || k === "END") continue;
    if (!map[k]) map[k] = v;
    else map[k] += ` ${v}`;
  }
  return map;
}

export function parseAdexp(text) {
  const m = adexpMap(text);
  const title = String(m.TITLE || "").toUpperCase();
  if (title && !/^(IFPL|FPL|ACH|CHG)$/.test(title)) return null;
  const flight = String(m.ARCID || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (flight.length < 2) return null;
  const dep = String(m.ADEP || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
  const dest = String(m.ADES || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
  return rec({
    format: "adexp",
    flight,
    typecode: String(m.ARCTYP || m.ARCADDR || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4),
    dep,
    dest,
    route: m.ROUTE || "",
    other: `REG/${m.REG || ""} DEP/${m.DEP || ""} DEST/${m.DEST || ""} DOF/${m.EOBD || ""} OPR/${m.OPR || ""} RFL/${m.RFL || ""}`,
  });
}

export function parseIfpsText(raw) {
  const t = String(raw || "").replace(/\r/g, "").trim();
  if (!t) throw new Error("paste an ICAO FPL or ADEXP message");
  const out = [];
  const icaoRe = /\(\s*FPL[\s\S]*?\)/gi;
  let m;
  while ((m = icaoRe.exec(t))) {
    const rec0 = parseIcaoFpl(m[0]);
    if (rec0) out.push(rec0);
  }
  if (!out.length && /(^-TITLE\s+)|(^-ARCID\s+)/im.test(t)) {
    const rec0 = parseAdexp(t);
    if (rec0) out.push(rec0);
  }
  if (!out.length) throw new Error("no ICAO (FPL-…) or ADEXP -TITLE/-ARCID found");
  return out;
}

/** IFPS zone (IFPZ) heuristic: ECAC / EUROCONTROL-addressed aerodromes. */
export function inIfpsZone(icao) {
  const s = String(icao || "").toUpperCase();
  if (!/^[A-Z]{4}$/.test(s)) return false;
  return /^[EL]/i.test(s) || /^(BI|GM|GC|UK|UD|UG|UB|UT|BK)/.test(s);
}

/** Stamp IFPZ onto a live radar row. NM-only 4D is ETFMS of IFPS-filed traffic. */
export function tagIfpsOnPlane(p, extra = {}) {
  if (!p) return false;
  if (p.ifps || p.src === "ifps") {
    p.ifps = true;
    return true;
  }
  if (inIfpsZone(p.dep) || inIfpsZone(p.dest)) {
    p.ifps = true;
    return true;
  }
  if (p.src === "nm" || extra.nmOnly) {
    p.ifps = true;
    return true;
  }
  if (extra.touching || extra.ljla) {
    p.ifps = true;
    return true;
  }
  return false;
}

export async function lookupAirportLL(icao, ms = 6_000) {
  const id = String(icao || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
  if (!/^[A-Z]{4}$/.test(id)) return null;
  const hit = airport(id);
  if (hit) return hit;
  const urls = [
    `https://api.adsb.lol/api/0/airport/${id}`,
    `https://vrs-standing-data.adsb.lol/airports/${id.slice(0, 2)}/${id}.json`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "OpsLiveDash/1.0" },
        signal: AbortSignal.timeout(ms),
        redirect: "follow",
      });
      if (!r.ok) continue;
      const j = await r.json();
      const lat = Number(j.lat ?? j.latitude);
      const lon = Number(j.lon ?? j.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) continue;
      AIRPORTS[id] = [lat, lon];
      return airport(id);
    } catch {
      /* next host */
    }
  }
  return null;
}

export async function enrichIfpsRecs(recs) {
  const need = new Set();
  for (const r of recs || []) {
    if (r.dep && !airport(r.dep)) need.add(r.dep);
    if (r.dest && !airport(r.dest)) need.add(r.dest);
    for (const t of r.skipped || []) {
      if (/^[A-Z]{4}$/.test(t) && !airport(t)) need.add(t);
    }
  }
  await Promise.all([...need].map((id) => lookupAirportLL(id)));
  return (recs || []).map((r) => {
    const depPt = airport(r.dep);
    const destPt = airport(r.dest);
    const { pts, skipped, cruise } = geocodeRoute(r.route);
    const trail = trailOf(depPt, pts, destPt);
    const here = pts.filter((p) => p.kind === "latlon").at(-1) || depPt || destPt;
    return {
      ...r,
      trail,
      skipped,
      known: trail.map((p) => p.id).filter(Boolean),
      lat: here?.lat ?? r.lat,
      lon: here?.lon ?? r.lon,
      fix: Boolean(here),
      altFt: r.altFt || cruise.altFt || 0,
      gs: r.gs || cruise.gs || 0,
      ifpz: inIfpsZone(r.dep) || inIfpsZone(r.dest),
    };
  });
}
