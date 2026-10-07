/** Live bird picture: Vogelradar weather-radar BIRDTAM + GPS-tagged birds.
 * Radar is measured bioscatter, not invented tracks. Tagged birds only if the
 * source marks them live and seen today. Trails/history are not ingested. */

export const VOGEL_RADAR = "https://vogelradar.com/api/radar";
export const VOGEL_BIRDS = "https://vogelradar.com/api/birds?locale=en";
export const VOGEL_SITE = "https://vogelradar.com/";

const UA = {
  "user-agent": "OpsLiveDash/1.0",
  accept: "application/json",
  referer: VOGEL_SITE,
  origin: "https://vogelradar.com",
};

async function jget(url, ms = 12_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export function pixelToLonLat(i, j, w, h, corners) {
  const u = w > 1 ? i / (w - 1) : 0;
  const v = h > 1 ? j / (h - 1) : 0;
  const [nw, ne, se, sw] = corners;
  const lon = (1 - u) * (1 - v) * nw[0] + u * (1 - v) * ne[0] + u * v * se[0] + (1 - u) * v * sw[0];
  const lat = (1 - u) * (1 - v) * nw[1] + u * (1 - v) * ne[1] + u * v * se[1] + (1 - u) * v * sw[1];
  return { lat, lon };
}

function decodeBirdtam(b64) {
  const txt = String(b64 || "").replace(/\s+/g, "");
  if (!txt) return new Uint8Array();
  return Uint8Array.from(Buffer.from(txt, "base64"));
}

/** Typical Central-Europe migration layer (ENRAM): 200–1600 m AGL from BIRDTAM intensity. Not a GPS fix. */
export function birdtamAltM(peak) {
  const p = Math.max(0, Math.min(9, Math.round(Number(peak) || 0)));
  return [40, 80, 160, 280, 450, 700, 950, 1200, 1400, 1600][p];
}

/** Downsample the BIRDTAM raster to flock cells. Values 254/255 are no-data. */
export function sampleFlocks(radar, { block = 16, minMean = 0.65, maxCells = 130 } = {}) {
  const w = Number(radar?.w) || 0;
  const h = Number(radar?.h) || 0;
  const corners = radar?.corners;
  if (!w || !h || !Array.isArray(corners) || corners.length !== 4) return [];
  const bytes = decodeBirdtam(radar.birdtam);
  if (bytes.length < w * h) return [];
  const cells = [];
  for (let y = 0; y < h; y += block) {
    for (let x = 0; x < w; x += block) {
      let sum = 0;
      let n = 0;
      let peak = 0;
      const y2 = Math.min(h, y + block);
      const x2 = Math.min(w, x + block);
      for (let j = y; j < y2; j += 1) {
        const row = j * w;
        for (let i = x; i < x2; i += 1) {
          const v = bytes[row + i];
          if (v >= 254) continue;
          sum += v;
          n += 1;
          if (v > peak) peak = v;
        }
      }
      if (!n) continue;
      const mean = sum / n;
      if (mean < minMean && peak < 3) continue;
      const { lat, lon } = pixelToLonLat((x + x2 - 1) / 2, (y + y2 - 1) / 2, w, h, corners);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      cells.push({ lat, lon, mean, peak, n });
    }
  }
  cells.sort((a, b) => b.mean - a.mean || b.peak - a.peak);
  return cells.slice(0, maxCells).map((c, i) => ({
    hex: `flock${String(Math.round(c.lat * 100))}${String(Math.round((c.lon + 180) * 100)).slice(-4)}`,
    flight: "FLOCK",
    t: "FLOCK",
    lat: c.lat,
    lon: c.lon,
    alt_geom: birdtamAltM(c.peak) * 3.28084,
    gs: 0,
    track: 0,
    type: "bird",
    category: "",
    seen: 0,
    model: `BIRDTAM ${c.peak}`,
    desc: `weather-radar flock · ~${birdtamAltM(c.peak)} m AGL est · mean ${c.mean.toFixed(1)} · peak ${c.peak}`,
    birdtam: c.peak,
    birdMean: c.mean,
  }));
}

function taggedFresh(p) {
  if (!p?.live) return false;
  const age = String(p.age || "").toLowerCase();
  if (/deceased|quiet since|days ago/.test(age)) return false;
  if (/transmitting|seen today|min ago|hour ago|hours ago/.test(age)) return true;
  if (Number(p.kmh) > 5) return true;
  return false;
}

export function taggedBirdsAsAdsb(geo) {
  const out = [];
  for (const f of geo?.features || []) {
    const p = f.properties || {};
    const c = f.geometry?.coordinates;
    if (!taggedFresh(p) || !Array.isArray(c) || c.length < 2) continue;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const slug = String(p.slug || p.name || "bird").toLowerCase().replace(/[^a-z0-9]/g, "").slice(-10);
    const kmh = Number(p.kmh);
    const altM = Number(p.alt);
    out.push({
      hex: `bird${slug || "x"}`,
      flight: String(p.name || "BIRD").replace(/\s+/g, "").slice(0, 10),
      t: String(p.species || "BIRD").slice(0, 12),
      lat,
      lon,
      alt_geom: Number.isFinite(altM) ? altM * 3.28084 : 0,
      gs: Number.isFinite(kmh) ? kmh / 1.852 : 0,
      track: 0,
      type: "bird",
      category: "",
      model: p.species || "tagged bird",
      desc: `${p.species || "bird"} · ${p.age || "live"}`,
      seen: /min ago/.test(String(p.age || "")) ? 60 : 3600,
    });
  }
  return out;
}

export async function fetchBirdPublic() {
  const [radar, birds] = await Promise.all([
    jget(VOGEL_RADAR, 15_000).catch((e) => ({ error: String(e.message || e) })),
    jget(VOGEL_BIRDS, 12_000).catch(() => ({ features: [] })),
  ]);
  const flocks = radar?.birdtam ? sampleFlocks(radar, { block: 8, minMean: 0.25, maxCells: 240 }) : [];
  const tagged = taggedBirdsAsAdsb(birds);
  return {
    flocks,
    tagged,
    n: flocks.length + tagged.length,
    radarTs: radar?.ts || "",
    birdtam: Boolean(radar?.birdtam),
    coverage: radar?.corners || null,
    error: radar?.error,
  };
}
