/** Moving objects keep at least 15 min of trail; the old tail fades out. */

export const TRAIL_MIN_MS = 15 * 60_000;
export const TRAIL_KEEP_MS = 30 * 60_000;
export const TRAIL_SAMPLE_MS = 2_500;
export const TRAIL_SAMPLE_MS_DENSE = 800;
export const TRAIL_SEND_MAX = 400;
export const TRAIL_SEND_DENSE = 720;
/** ~990 kt — above any real mover; dual-feed / MLAT pops exceed this. */
export const TRAIL_MAX_KM_S = 0.51;

export function trailMoveKm(a, b, c, d) {
  const R = 6371;
  const p1 = (a * Math.PI) / 180;
  const p2 = (c * Math.PI) / 180;
  const dp = ((c - a) * Math.PI) / 180;
  const dl = ((d - b) * Math.PI) / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function kmPerSec(last, lat, lon, ts) {
  const d = trailMoveKm(last.lat, last.lon, lat, lon);
  const dt = (ts - (last.at || 0)) / 1000;
  if (dt <= 0) return d > 0.05 ? 99 : 0;
  return d / dt;
}

/** Append a sample for anything that moves — jets, taxi, balloons, drones — not GPS jitter. */
export function shouldAppendTrail(last, lat, lon, alt, ts = Date.now(), opts = {}) {
  if (!last) return true;
  const dense = Boolean(opts.dense);
  const d = trailMoveKm(last.lat, last.lon, lat, lon);
  if (d > 0.35 && kmPerSec(last, lat, lon, ts) > TRAIL_MAX_KM_S) return false;
  const minKm = dense ? 0.002 : Number(alt) < 3500 ? 0.006 : 0.025;
  const sample = dense ? TRAIL_SAMPLE_MS_DENSE : TRAIL_SAMPLE_MS;
  const aged = ts - (last.at || 0) >= sample;
  const dAlt = Math.abs((Number(alt) || 0) - (Number(last.alt) || 0));
  if (dense && aged && dAlt >= 12) return true;
  return d > minKm || (aged && d > 0.0015);
}

/** Drop dual-feed ping-pong; keep taxi/balloon drift and heli descents. Mutates `points`. */
export function ingestTrailPoint(points, lat, lon, alt, ts = Date.now(), color, opts = {}) {
  const last = points[points.length - 1];
  const row = { lat, lon, alt, at: ts, color };
  if (!last) {
    points.push(row);
    return points;
  }
  const dense = Boolean(opts.dense);
  const d = trailMoveKm(last.lat, last.lon, lat, lon);
  const dt = ts - (last.at || 0);
  const kps = kmPerSec(last, lat, lon, ts);
  const jitter = dense ? 700 : 2_000;
  const dAlt = Math.abs((Number(alt) || 0) - (Number(last.alt) || 0));
  if (dt < jitter) {
    if (dense && dAlt >= 15 && dt >= 400) {
      points.push(row);
      return points;
    }
    if (d < 0.15) {
      last.lat = lat;
      last.lon = lon;
      last.alt = alt;
      last.at = ts;
      last.color = color;
    } else if (points[points.length - 2] && kmPerSec(points[points.length - 2], lat, lon, ts) <= TRAIL_MAX_KM_S) {
      last.lat = lat;
      last.lon = lon;
      last.alt = alt;
      last.at = ts;
      last.color = color;
    }
    return points;
  }
  if (d > 0.35 && kps > TRAIL_MAX_KM_S) {
    const prev = points[points.length - 2];
    if (prev && kmPerSec(prev, lat, lon, ts) <= TRAIL_MAX_KM_S) {
      last.lat = lat;
      last.lon = lon;
      last.alt = alt;
      last.at = ts;
      last.color = color;
    }
    return points;
  }
  if (shouldAppendTrail(last, lat, lon, alt, ts, opts)) points.push(row);
  else {
    last.lat = lat;
    last.lon = lon;
    last.alt = alt;
    last.at = ts;
    last.color = color;
  }
  return points;
}

export function sanitizeTrail(past, opts = {}) {
  const out = [];
  for (const p of past || []) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (p.future) {
      out.push(p);
      continue;
    }
    ingestTrailPoint(out, p.lat, p.lon, p.alt, p.at || 0, p.color, opts);
  }
  return out;
}

export function fadeTrailOpacity(ageMs, picked = false) {
  const t = 1 - Math.min(1.12, Math.max(0, Number(ageMs) || 0) / TRAIL_MIN_MS);
  const u = Math.max(0, t);
  const base = Math.pow(u, 1.4) * (picked ? 0.96 : 0.9);
  return Math.max(0.02, base);
}

/** Last 4 min stay dense; older 15–30 min is strided so the fade still covers 15 min. */
export function selectTrailPast(past, now = Date.now(), maxN = TRAIL_SEND_MAX, opts = {}) {
  const rows = (past || []).filter((p) => p && (p.future || !p.at || now - p.at <= TRAIL_KEEP_MS));
  const live = sanitizeTrail(
    rows.filter((p) => !p.future),
    opts,
  );
  if (live.length <= maxN) return live;
  const recentMs = 4 * 60_000;
  const recent = live.filter((p) => !p.at || now - p.at <= recentMs);
  const older = live.filter((p) => p.at && now - p.at > recentMs);
  if (recent.length >= maxN) return recent.slice(-maxN);
  const room = maxN - recent.length;
  if (older.length <= room) return [...older, ...recent];
  const stride = Math.max(1, Math.ceil(older.length / room));
  const sampled = [];
  for (let i = 0; i < older.length; i += stride) sampled.push(older[i]);
  const lastOlder = older[older.length - 1];
  if (sampled[sampled.length - 1] !== lastOlder) sampled.push(lastOlder);
  return [...sampled.slice(-room), ...recent];
}
