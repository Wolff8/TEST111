/** RainViewer public Weather Maps API — live composite reflectivity tiles.
 * https://github.com/rainviewer/rainviewer-api-example
 * Precipitation / snow, not BIRDTAM. Do not invent bird tracks from these pixels. */

export const RAINVIEWER_MAPS = "https://api.rainviewer.com/public/weather-maps.json";
export const RAINVIEWER_SITE = "https://www.rainviewer.com/";
export const RAINVIEWER_API = "https://www.rainviewer.com/api.html";
export const RAINVIEWER_EXAMPLE = "https://github.com/rainviewer/rainviewer-api-example";

const UA = { "user-agent": "OpsLiveDash/1.0", accept: "application/json" };

export function radarTileUrl(host, path, { size = 256, color = 2, options = "1_1" } = {}) {
  const h = String(host || "").replace(/\/$/, "");
  const p = String(path || "");
  if (!h || !p) return "";
  return `${h}${p}/${size}/{z}/{x}/{y}/${color}/${options}.png`;
}

export function coverageTileUrl(host, { size = 256 } = {}) {
  const h = String(host || "").replace(/\/$/, "");
  if (!h) return "";
  return `${h}/v2/coverage/0/${size}/{z}/{x}/{y}/0/0_0.png`;
}

export function framesFromMaps(maps) {
  const host = String(maps?.host || "").replace(/\/$/, "");
  const past = Array.isArray(maps?.radar?.past) ? maps.radar.past : [];
  const nowcast = Array.isArray(maps?.radar?.nowcast) ? maps.radar.nowcast : [];
  const frames = [...past, ...nowcast]
    .filter((f) => f && f.path && Number(f.time))
    .map((f) => ({
      time: Number(f.time),
      path: String(f.path),
      nowcast: Boolean(nowcast.includes(f)),
      tiles: radarTileUrl(host, f.path),
    }));
  const last = frames[frames.length - 1] || null;
  return {
    version: String(maps?.version || ""),
    generated: Number(maps?.generated) || 0,
    host,
    frames,
    now: last,
    coverage: coverageTileUrl(host),
    n: frames.length,
  };
}

export async function fetchRainviewer(ms = 10_000) {
  const r = await fetch(RAINVIEWER_MAPS, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`rainviewer ${r.status}`);
  const maps = await r.json();
  const board = framesFromMaps(maps);
  if (!board.host || !board.n) throw new Error("rainviewer empty");
  return board;
}
