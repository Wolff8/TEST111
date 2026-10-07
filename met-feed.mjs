const UA = { accept: "application/json,application/geo+json,*/*", "user-agent": "OpsLiveDash/1.0" };

export const AWC_BASE = "https://aviationweather.gov/api/data";
export const AWC_METAR = `${AWC_BASE}/metar`;
export const AWC_TAF = `${AWC_BASE}/taf`;
export const AWC_ISIGMET = `${AWC_BASE}/isigmet`;
export const METEOALARM_SI = "https://feeds.meteoalarm.org/api/v1/warnings/feeds-slovenia";

export const MET_STATIONS = ["LJLJ", "LJMB", "LJPZ", "LJCE", "LOWW", "LDZA", "LIPZ", "LHBP"];

function idsParam() {
  return MET_STATIONS.join(",");
}

async function jget(url, ms = 12_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function downsample(pts, max = 56) {
  if (!Array.isArray(pts) || pts.length <= max) return pts || [];
  const step = pts.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.min(pts.length - 1, Math.floor(i * step))]);
  return out;
}

function geoRings(geom) {
  const out = [];
  const walk = (c) => {
    if (!c || !c.length) return;
    if (typeof c[0] === "number") return;
    if (typeof c[0][0] === "number") {
      const ring = c
        .map((p) => [Number(p[1]), Number(p[0])])
        .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (ring.length >= 3) out.push(downsample(ring));
      return;
    }
    for (const x of c) walk(x);
  };
  walk(geom?.coordinates);
  return out;
}

function capRing(polyStr) {
  const ring = String(polyStr || "")
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [lat, lon] = tok.split(",").map(Number);
      return [lat, lon];
    })
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  return ring.length >= 3 ? downsample(ring) : [];
}

function centroid(ring) {
  if (!ring?.length) return { lat: null, lon: null };
  let lat = 0;
  let lon = 0;
  for (const p of ring) {
    lat += p[0];
    lon += p[1];
  }
  return { lat: lat / ring.length, lon: lon / ring.length };
}
function walkCoords(c, hit) {
  if (!c) return false;
  if (typeof c[0] === "number" && typeof c[1] === "number") return hit(c[1], c[0]);
  if (Array.isArray(c)) return c.some((x) => walkCoords(x, hit));
  return false;
}

function inEurope(lat, lon) {
  return lat >= 35 && lat <= 58 && lon >= -10 && lon <= 30;
}

function inSi(lat, lon) {
  return lat >= 44.55 && lat <= 48.15 && lon >= 11.75 && lon <= 17.85;
}

function metarRow(m) {
  return {
    icao: String(m.icaoId || "").toUpperCase(),
    name: String(m.name || ""),
    raw: String(m.rawOb || ""),
    fltCat: String(m.fltCat || ""),
    tempC: m.temp == null ? null : Number(m.temp),
    dewpC: m.dewp == null ? null : Number(m.dewp),
    wdir: m.wdir == null ? "" : String(m.wdir),
    wspdKt: m.wspd == null ? null : Number(m.wspd),
    visib: m.visib == null ? "" : String(m.visib),
    cover: String(m.cover || ""),
    altim: m.altim == null ? null : Number(m.altim),
    lat: Number(m.lat) || null,
    lon: Number(m.lon) || null,
    at: m.reportTime || m.receiptTime || null,
    si: /^LJ/.test(String(m.icaoId || "")),
  };
}

function tafRow(t) {
  return {
    icao: String(t.icaoId || "").toUpperCase(),
    name: String(t.name || ""),
    raw: String(t.rawTAF || ""),
    from: t.validTimeFrom || null,
    to: t.validTimeTo || null,
    issued: t.issueTime || null,
    lat: Number(t.lat) || null,
    lon: Number(t.lon) || null,
    si: /^LJ/.test(String(t.icaoId || "")),
  };
}

function sigmetRow(f) {
  const pr = f?.properties || f || {};
  const geom = f?.geometry || null;
  const coords = geom?.coordinates;
  let si = false;
  let eu = false;
  const rings = geoRings(geom);
  walkCoords(coords, (lat, lon) => {
    if (inSi(lat, lon)) si = true;
    if (inEurope(lat, lon)) eu = true;
    return false;
  });
  const fir = String(pr.firId || pr.icaoId || "");
  if (/^LJ|^LO|^LD|^LH|^LI|^LS|^ED|^LY|^LQ/.test(fir)) eu = true;
  if (/^LJ/.test(fir)) si = true;
  const raw = String(pr.rawSigmet || pr.rawAirSigmet || "");
  const ctr = centroid(rings[0] || []);
  return {
    id: String(pr.icaoId || "") + ":" + String(pr.seriesId || pr.firId || raw.slice(0, 24)),
    icao: String(pr.icaoId || ""),
    fir: fir,
    firName: String(pr.firName || ""),
    hazard: String(pr.hazard || ""),
    qualifier: String(pr.qualifier || ""),
    raw,
    from: pr.validTimeFrom || null,
    to: pr.validTimeTo || null,
    si,
    europe: eu,
    geom: geom?.type || "",
    lat: ctr.lat,
    lon: ctr.lon,
    ring: rings[0] || [],
  };
}

function pickInfo(info) {
  const arr = Array.isArray(info) ? info : info ? [info] : [];
  return arr.find((i) => /^en/i.test(String(i.language || ""))) || arr[0] || {};
}

function alarmRow(w) {
  const a = w?.alert || w || {};
  const info = pickInfo(a.info);
  const area = Array.isArray(info.area) ? info.area[0] : info.area || {};
  const poly = Array.isArray(area.polygon) ? area.polygon[0] : area.polygon;
  const ring = capRing(poly);
  const ctr = centroid(ring);
  return {
    id: String(a.identifier || info.headline || ""),
    event: String(info.event || ""),
    headline: String(info.headline || ""),
    severity: String(info.severity || ""),
    urgency: String(info.urgency || ""),
    certainty: String(info.certainty || ""),
    area: String(area.areaDesc || ""),
    onset: info.onset || "",
    expires: info.expires || "",
    instruction: String(info.instruction || "").slice(0, 240),
    lat: ctr.lat,
    lon: ctr.lon,
    ring,
  };
}

export async function fetchMetBoard() {
  const ids = idsParam();
  const [metar, taf, sig, alarm] = await Promise.all([
    jget(`${AWC_METAR}?ids=${ids}&format=json`).catch((e) => ({ error: String(e.message || e), rows: [] })),
    jget(`${AWC_TAF}?ids=${ids}&format=json`).catch((e) => ({ error: String(e.message || e), rows: [] })),
    jget(`${AWC_ISIGMET}?format=geojson`).catch((e) => ({ error: String(e.message || e) })),
    jget(METEOALARM_SI).catch((e) => ({ error: String(e.message || e) })),
  ]);

  const metars = (Array.isArray(metar) ? metar : []).map(metarRow).sort((a, b) => Number(b.si) - Number(a.si) || a.icao.localeCompare(b.icao));
  const tafs = (Array.isArray(taf) ? taf : []).map(tafRow).sort((a, b) => Number(b.si) - Number(a.si) || a.icao.localeCompare(b.icao));
  const sigFeats = Array.isArray(sig?.features) ? sig.features : [];
  const sigmets = sigFeats.map(sigmetRow).filter((s) => s.europe);
  const alarms = (Array.isArray(alarm?.warnings) ? alarm.warnings : []).map(alarmRow).filter((x) => x.event || x.headline);

  const feeds = (metars.length ? 1 : 0) + (tafs.length ? 1 : 0) + (sigmets.length || sigFeats.length ? 1 : 0) + (alarms.length ? 1 : 0);
  return {
    ok: feeds > 0,
    feed: feeds > 0,
    json: true,
    cors: "*",
    n: metars.length + tafs.length + sigmets.length + alarms.length,
    feeds,
    metars,
    tafs,
    sigmets: sigmets.slice(0, 24),
    sigmetN: sigFeats.length,
    europeSigmets: sigmets.length,
    siSigmets: sigmets.filter((s) => s.si).length,
    alarms,
    origin: {
      ok: feeds > 0,
      feed: feeds > 0,
      json: true,
      metar: `${AWC_METAR}?ids=${ids}&format=json`,
      taf: `${AWC_TAF}?ids=${ids}&format=json`,
      isigmet: `${AWC_ISIGMET}?format=geojson`,
      meteoalarm: METEOALARM_SI,
      errors: [metar?.error, taf?.error, sig?.error, alarm?.error].filter(Boolean),
    },
  };
}
