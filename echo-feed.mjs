/** Passive sky echoes from ARSO Lisca+Pasja ravna max reflectivity (SRD-3 ZM)
 * plus OSMER FVG geo-referenced VMI overlays. Isolated cells, not rain fields.
 * No ICAO, no registration. RainViewer tiles stay precip overlay. */

import { decodePng, pngPixel } from "./png-lite.mjs";

export const ARSO_ZM = "https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-zm.srd";
export const ARSO_RRG = "https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-rrg.srd";
export const ARSO_RADAR = "https://meteo.arso.gov.si/met/sl/weather/observ/radar/";
export const ARSO_SRD3 = "https://meteo.arso.gov.si/uploads/meteo/help/en/SRD3Format.html";
export const FVG_RADAR_JSON = "https://www.osmer.fvg.it/ajax/getRadar.php";
export const FVG_RADAR = "https://www.osmer.fvg.it/radar-geo.php";

/** GEOSS origin of the SI0 Lambert grid (Lisca+Pasja ravna composite). */
export const ARSO_ORIGIN = { lat: 46.12, lon: 14.815, theta0: 0 };
/** OSMER Fossalon / FVG VMI composite centre. */
export const FVG_ORIGIN = { lat: 46.055, lon: 14.21, theta0: 0 };

/** Published WGS-84 corners of SI0, pixel centers. https://meteo.arso.gov.si/uploads/meteo/help/en/SRD3Format.html */
export const SI0_WGS = {
  sw: [12.230101, 44.687306],
  se: [17.289933, 44.689702],
  ne: [17.412818, 47.385828],
  nw: [12.101924, 47.383315],
};

const UA = { "user-agent": "OpsLiveDash/1.0", accept: "text/plain,*/*" };
const prev = [];

export function resetEchoMotion() {
  prev.length = 0;
}

function km(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a, b) {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(Δ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function si0ToWgs(i, j, nx = 401, ny = 301) {
  const u = nx > 1 ? i / (nx - 1) : 0;
  const v = ny > 1 ? j / (ny - 1) : 0;
  const { sw, se, ne, nw } = SI0_WGS;
  const lon = (1 - u) * (1 - v) * sw[0] + u * (1 - v) * se[0] + u * v * ne[0] + (1 - u) * v * nw[0];
  const lat = (1 - u) * (1 - v) * sw[1] + u * (1 - v) * se[1] + u * v * ne[1] + (1 - u) * v * nw[1];
  return { lat, lon };
}

export function parseSrd(text) {
  const raw = String(text || "");
  const split = raw.search(/\nDATA\s*\n/);
  if (split < 0) return null;
  const head = raw.slice(0, split);
  const body = raw.slice(split).replace(/^\s*DATA\s*\n/, "");
  const nx = Number((head.match(/ncell\s+(\d+)/) || [])[1]) || 0;
  const ny = Number((head.match(/ncell\s+\d+\s+(\d+)/) || [])[1]) || 0;
  const offset = Number((head.match(/offset\s+(\d+)/) || [])[1]) || 64;
  const start = Number((head.match(/start\s+(-?\d+(?:\.\d+)?)/) || [])[1]) || 0;
  const slope = Number((head.match(/slope\s+(-?\d+(?:\.\d+)?)/) || [])[1]) || 1;
  const nodata = Number((head.match(/nodata\s+(\d+)/) || [])[1]) || 126;
  const quant = ((head.match(/quant\s+(\S+)/) || [])[1] || "").toUpperCase();
  const time = (head.match(/time\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/) || []).slice(1).map(Number);
  const rows = body.split(/\n/).filter((ln) => ln.length);
  if (!nx || !ny || rows.length < ny) return null;
  const grid = rows.slice(0, ny).map((ln) => ln.padEnd(nx, "@").slice(0, nx));
  return { nx, ny, offset, start, slope, nodata, quant, time, grid };
}

export function levelOf(ch, offset = 64, nodata = 126) {
  const c = ch.charCodeAt(0);
  if (c === nodata || ch === "~") return -1;
  return c - offset;
}

export function dbzOf(level, start = 12, slope = 3) {
  if (level <= 0) return 0;
  return start + slope * level;
}

/** Lowest C-band beam (~0.5°) AGL. 25 m is below this beam past ~20 km. */
export function beamHeightM(lat, lon, origin = ARSO_ORIGIN, elevDeg = 0.5) {
  const rKm = km({ lat: origin.lat, lon: origin.lon }, { lat, lon });
  const theta = (elevDeg * Math.PI) / 180;
  const re = 6371 * (4 / 3);
  const h = rKm * 1000 * Math.sin(theta) + (rKm * rKm * 1000) / (2 * re);
  return Math.max(80, Math.round(h));
}

/** Leftover height is the lowest beam that can actually see the cell, not a fake 25 m slab. */
export function echoAltM(dbz, size, lat, lon, origin = ARSO_ORIGIN) {
  let layer = 80;
  if (dbz >= 30) layer = size <= 2 ? 320 : 500;
  else if (dbz >= 24) layer = 220;
  else if (dbz >= 18) layer = 140;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return layer;
  return Math.max(layer, beamHeightM(lat, lon, origin));
}

function echoOrigin(tag) {
  return tag === "f" ? FVG_ORIGIN : ARSO_ORIGIN;
}

function isWeakCell(c) {
  return (c.size || 1) <= 2 && (c.dbz || 0) < 24;
}

function neighbors(grid, x, y, r = 2) {
  const ny = grid.length;
  const nx = grid[0].length;
  let n = 0;
  for (let j = y - r; j <= y + r; j += 1) {
    if (j < 0 || j >= ny) continue;
    const row = grid[j];
    for (let i = x - r; i <= x + r; i += 1) {
      if (i < 0 || i >= nx || (i === x && j === y)) continue;
      if (levelOf(row[i]) > 0) n += 1;
    }
  }
  return n;
}

function strongNear(grid, x, y, r = 2) {
  const ny = grid.length;
  const nx = grid[0].length;
  let n = 0;
  for (let j = y - r; j <= y + r; j += 1) {
    if (j < 0 || j >= ny) continue;
    const row = grid[j];
    for (let i = x - r; i <= x + r; i += 1) {
      if (i < 0 || i >= nx || (i === x && j === y)) continue;
      if (levelOf(row[i]) >= 3) n += 1;
    }
  }
  return n;
}

export function sampleEchoes(zm, rrg = null, { maxCells = 80, maxSize = 12, maxNear = 14 } = {}) {
  if (!zm?.grid) return [];
  const { nx, ny, grid, start, slope } = zm;
  const rain = rrg?.grid;
  const weakSeen = Array.from({ length: ny }, () => Uint8Array.from({ length: nx }));
  const weak = [];
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      const lv = levelOf(grid[y][x]);
      if (lv !== 2 || weakSeen[y][x]) continue;
      const stack = [[x, y]];
      weakSeen[y][x] = 1;
      const cells = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push([cx, cy, levelOf(grid[cy][cx])]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ix = cx + dx;
          const iy = cy + dy;
          if (ix < 0 || iy < 0 || ix >= nx || iy >= ny || weakSeen[iy][ix]) continue;
          if (levelOf(grid[iy][ix]) !== 2) continue;
          weakSeen[iy][ix] = 1;
          stack.push([ix, iy]);
        }
      }
      if (cells.length > 4) continue;
      const [sx, sy] = cells.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
      const mx = Math.round(sx / cells.length);
      const my = Math.round(sy / cells.length);
      const rainLv = rain && rain[my] && rain[my][mx] != null ? Math.max(0, levelOf(rain[my][mx])) : 0;
      if (rainLv >= 2) continue;
      if (strongNear(grid, mx, my, 2) >= 2) continue;
      const { lat, lon } = si0ToWgs(mx, my, nx, ny);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const peak = Math.max(...cells.map((c) => c[2]));
      weak.push({
        x: mx,
        y: my,
        lat,
        lon,
        dbz: dbzOf(peak, start, slope),
        size: cells.length,
        rainLv,
        peak,
        near: neighbors(grid, mx, my, 2),
      });
    }
  }
  const seen = Array.from({ length: ny }, () => Uint8Array.from({ length: nx }));
  const strong = [];
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      const lv = levelOf(grid[y][x]);
      if (lv < 3 || seen[y][x]) continue;
      const stack = [[x, y]];
      seen[y][x] = 1;
      const cells = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push([cx, cy, levelOf(grid[cy][cx])]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ix = cx + dx;
          const iy = cy + dy;
          if (ix < 0 || iy < 0 || ix >= nx || iy >= ny || seen[iy][ix]) continue;
          if (levelOf(grid[iy][ix]) < 3) continue;
          seen[iy][ix] = 1;
          stack.push([ix, iy]);
        }
      }
      if (cells.length > maxSize) continue;
      const [sx, sy] = cells.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
      const mx = Math.round(sx / cells.length);
      const my = Math.round(sy / cells.length);
      if (neighbors(grid, mx, my, 3) > maxNear) continue;
      const peak = Math.max(...cells.map((c) => c[2]));
      const dbz = dbzOf(peak, start, slope);
      let rainLv = 0;
      if (rain && rain[my] && rain[my][mx] != null) rainLv = Math.max(0, levelOf(rain[my][mx]));
      if (rainLv >= 3) continue;
      const { lat, lon } = si0ToWgs(mx, my, nx, ny);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      strong.push({
        x: mx,
        y: my,
        lat,
        lon,
        dbz,
        size: cells.length,
        rainLv,
        peak,
      });
    }
  }
  weak.sort((a, b) => a.near - b.near || a.dbz - b.dbz);
  const room = Math.max(0, maxCells - strong.length);
  return [...weak.slice(0, room), ...strong].slice(0, maxCells);
}

function nearLjms(c) {
  return km({ lat: 46.6292, lon: 16.1908 }, c) <= 8 * 1.852;
}

function nearRakican(c) {
  return km({ lat: 46.65107, lon: 16.16639 }, c) <= 2.6;
}

function nearPad(c) {
  return nearLjms(c) || nearRakican(c);
}

/** Slow isolated leftover — HAB envelope kinematics, not RainViewer precip. */
export function isPassiveBalloonCell(c) {
  if ((c.rainLv || 0) >= 2) return false;
  if ((c.size || 1) > 4) return false;
  const dbz = c.dbz || 0;
  if (dbz < 16 || dbz > 30) return false;
  const gs = c.gs || 0;
  const hop = c.hopKm || 0;
  if (gs > 38) return false;
  if (gs >= 4 && gs <= 32) return true;
  if (hop >= 0.25 && hop <= 3.5 && gs <= 32) return true;
  return false;
}

function attachMotion(rows, now) {
  const out = [];
  const used = new Set();
  for (const c of rows) {
    const weak = isWeakCell(c);
    const maxKm = weak ? 2.5 : 5;
    const maxKt = weak ? 60 : 120;
    let mate = null;
    let best = maxKm;
    for (const p of prev) {
      if (used.has(p.id)) continue;
      const d = km(c, p);
      if (d < best) {
        best = d;
        mate = p;
      }
    }
    let gs = 0;
    let track = 0;
    let hopKm = 0;
    let id = `echo${c.tag || "a"}${String(c.y).padStart(3, "0")}${String(c.x).padStart(3, "0")}`;
    let pending = false;
    if (mate && now - mate.at < 12 * 60_000) {
      const dt = Math.max(30, (now - mate.at) / 1000);
      const implied = (best / dt) * 3600 / 1.852;
      if (implied <= maxKt) {
        used.add(mate.id);
        id = mate.id;
        gs = implied;
        hopKm = best;
        track = (bearing(mate, c) + 360) % 360;
      } else {
        mate = null;
      }
    }
    if (!mate && weak && !nearPad(c)) pending = true;
    out.push({ ...c, id, gs, track, at: now, pending, hopKm });
  }
  prev.length = 0;
  prev.push(...out);
  return out;
}

export function overlayToWgs(i, j, w, h, bounds) {
  const u = w > 1 ? i / (w - 1) : 0;
  const v = h > 1 ? j / (h - 1) : 0;
  const lon1 = Number(bounds.LON1 ?? bounds.lon1);
  const lon2 = Number(bounds.LON2 ?? bounds.lon2);
  const lat1 = Number(bounds.LAT1 ?? bounds.lat1);
  const lat2 = Number(bounds.LAT2 ?? bounds.lat2);
  return { lon: lon1 + u * (lon2 - lon1), lat: lat2 - v * (lat2 - lat1) };
}

export function originFromBounds(bounds) {
  const lon1 = Number(bounds.LON1 ?? bounds.lon1);
  const lon2 = Number(bounds.LON2 ?? bounds.lon2);
  const lat1 = Number(bounds.LAT1 ?? bounds.lat1);
  const lat2 = Number(bounds.LAT2 ?? bounds.lat2);
  return { lat: (lat1 + lat2) / 2, lon: (lon1 + lon2) / 2, theta0: 0 };
}

/** OSMER VMI legend: cyan/blue weak, green medium, yellow/red rain. */
export function vmiColorDbz(r, g, b, a = 255) {
  if (a < 40) return 0;
  if (r > 200 && g < 90) return 42;
  if (r > 200 && g > 140 && b < 90) return 36;
  if (g > 200 && r < 100 && b < 120) return 22;
  if (b > 180 && r < 80) return 16;
  if (g > 150 && b > 150 && r < 120) return 15;
  if (g > 120 && r < 180) return 20;
  return 0;
}

export function samplePngEchoes(img, bounds, { maxCells = 48, maxSize = 8, tag = "f" } = {}) {
  if (!img?.w || !img?.h || !bounds) return [];
  const { w, h } = img;
  const dbzAt = (x, y) => {
    const [r, g, b, a] = pngPixel(img, x, y);
    return vmiColorDbz(r, g, b, a);
  };
  const seen = Array.from({ length: h }, () => Uint8Array.from({ length: w }));
  const out = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (seen[y][x] || dbzAt(x, y) < 20) continue;
      const stack = [[x, y]];
      seen[y][x] = 1;
      const cells = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push([cx, cy, dbzAt(cx, cy)]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ix = cx + dx;
          const iy = cy + dy;
          if (ix < 0 || iy < 0 || ix >= w || iy >= h || seen[iy][ix]) continue;
          if (dbzAt(ix, iy) < 20) continue;
          seen[iy][ix] = 1;
          stack.push([ix, iy]);
        }
      }
      if (cells.length > maxSize) continue;
      const [sx, sy] = cells.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
      const mx = Math.round(sx / cells.length);
      const my = Math.round(sy / cells.length);
      const dbz = Math.max(...cells.map((c) => c[2]));
      const { lat, lon } = overlayToWgs(mx, my, w, h, bounds);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      out.push({ x: mx, y: my, lat, lon, dbz, size: cells.length, peak: dbz, tag });
    }
  }
  out.sort((a, b) => a.size - b.size || a.dbz - b.dbz);
  return out.slice(0, maxCells);
}

function mergeEchoCells(primary, extra, kmMax = 2.2) {
  const kept = [...primary];
  for (const e of extra || []) {
    if (kept.some((p) => km(p, e) < kmMax)) continue;
    kept.push(e);
  }
  return kept;
}

export function echoesAsAdsb(cells, at = Date.now()) {
  const moved = attachMotion(cells, at);
  return moved
    .filter((c) => {
      if (c.pending) return false;
      if (!isWeakCell(c)) return true;
      if (nearPad(c)) return true;
      const rKm = km(echoOrigin(c.tag), c);
      if ((c.hopKm || 0) > 0.4) return true;
      return rKm < 45;
    })
    .map((c) => {
      const tag = c.tag || "a";
      const origin = echoOrigin(tag);
      const altM = echoAltM(c.dbz, c.size, c.lat, c.lon, origin);
      const site = tag === "f" ? "OSMER FVG VMI leftover" : "ARSO ZM leftover";
      const gs = Math.min(c.gs || 0, isWeakCell(c) ? 60 : 120);
      const balloon = isPassiveBalloonCell({ ...c, gs });
      return {
        hex: c.id || `echo${tag}${String(c.y).padStart(3, "0")}${String(c.x).padStart(3, "0")}`,
        flight: balloon ? "HAB" : "",
        t: balloon ? "HAB" : "ECHO",
        lat: c.lat,
        lon: c.lon,
        alt_geom: altM * 3.28084,
        gs,
        track: c.track || 0,
        type: "echo",
        category: balloon ? "B2" : "",
        seen: 0,
        model: `${Math.round(c.dbz)} dBZ`,
        desc: balloon
          ? `${site} · slow isolated cell · no transponder · ~${altM} m`
          : `${site} · ${Math.round(c.dbz)} dBZ · ~${altM} m · ${c.size} km · no ICAO`,
        dbz: c.dbz,
        echo: true,
        silent: true,
        passiveBalloon: balloon,
        echoSite: tag === "f" ? "fvg" : "arso",
      };
    });
}

async function getText(url, ms = 12_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function getBuf(url, ms = 12_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function fetchFvgEchoes() {
  const js = JSON.parse(await getText(FVG_RADAR_JSON, 10_000));
  const rows = [];
  const sources = [];
  for (const rec of Object.values(js || {})) {
    if (!rec?.img || rec.img === "ND" || !rec.bounds) continue;
    const imgPath = String(rec.img).replace(/\\/g, "/");
    const url = imgPath.startsWith("http") ? imgPath : `https://www.osmer.fvg.it/${imgPath}`;
    sources.push({ name: rec.name || "FVG", url, time: rec.time || "", bounds: rec.bounds });
    try {
      const png = decodePng(await getBuf(url, 12_000));
      rows.push(...samplePngEchoes(png, rec.bounds, { tag: "f", maxCells: 80 }));
    } catch {
      /* skip one overlay */
    }
  }
  return { cells: rows, sources };
}

export async function fetchEchoPublic() {
  const [zmTxt, rrgTxt, fvg] = await Promise.all([
    getText(ARSO_ZM, 12_000),
    getText(ARSO_RRG, 12_000).catch(() => ""),
    fetchFvgEchoes().catch(() => ({ cells: [], sources: [] })),
  ]);
  const zm = parseSrd(zmTxt);
  const rrg = rrgTxt ? parseSrd(rrgTxt) : null;
  const arso = zm ? sampleEchoes(zm, rrg, { maxCells: 140, maxSize: 12, maxNear: 14 }).map((c) => ({ ...c, tag: "a" })) : [];
  const cells = mergeEchoCells(arso, fvg.cells || []);
  const echoes = echoesAsAdsb(cells);
  const t = zm?.time || [];
  return {
    echoes,
    n: echoes.length,
    cells: cells.length,
    arso: arso.length,
    fvg: (fvg.cells || []).length,
    time: t.length === 5 ? `${t[0]}-${String(t[1]).padStart(2, "0")}-${String(t[2]).padStart(2, "0")} ${String(t[3]).padStart(2, "0")}:${String(t[4]).padStart(2, "0")}Z` : "",
    quant: zm?.quant || "",
    nx: zm?.nx || 0,
    ny: zm?.ny || 0,
    source: ARSO_ZM,
    fvgSources: fvg.sources || [],
  };
}
