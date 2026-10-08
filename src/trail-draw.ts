/** Trail geometry: follow the samples, round corners without overshoot. */

export type TrailPt = {
  lat: number;
  lon: number;
  alt?: number;
  color?: string;
  future?: boolean;
  at?: number;
};

/** MLAT/radar hops longer than this are a gap, not a flight path. */
export const TRAIL_HOP_KM = 12;

export function trailKm(a: TrailPt, b: TrailPt) {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function mixPt(a: TrailPt, b: TrailPt, t: number): TrailPt {
  const u = Math.max(0, Math.min(1, t));
  const alt = (Number(a.alt) || 0) + ((Number(b.alt) || 0) - (Number(a.alt) || 0)) * u;
  const at = a.at && b.at ? a.at + (b.at - a.at) * u : a.at || b.at;
  return {
    lat: a.lat + (b.lat - a.lat) * u,
    lon: a.lon + (b.lon - a.lon) * u,
    alt,
    at,
    future: Boolean(a.future || b.future),
  };
}

/** Chaikin corner-cut: smooths polygons, stays on the convex hull (no Catmull-Rom forks). */
export function chaikin(pts: TrailPt[], rounds = 1): TrailPt[] {
  if (pts.length < 3 || rounds <= 0) return pts;
  let cur = pts;
  for (let r = 0; r < rounds; r++) {
    if (cur.length < 3) break;
    const next: TrailPt[] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      next.push(mixPt(cur[i], cur[i + 1], 0.25));
      next.push(mixPt(cur[i], cur[i + 1], 0.75));
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

export function densifyLinear(pts: TrailPt[], maxSegKm: number, maxN = 240): TrailPt[] {
  if (pts.length < 2) return pts;
  const cap = Math.max(pts.length, maxN);
  const out: TrailPt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = trailKm(a, b);
    const room = cap - out.length - (pts.length - 1 - i);
    if (Number.isFinite(d) && d > maxSegKm && room > 1) {
      const n = Math.min(room, Math.max(1, Math.round(d / maxSegKm)));
      for (let k = 1; k < n; k++) out.push(mixPt(a, b, k / n));
    }
    out.push(b);
  }
  return out;
}

export function splitTrailRuns(pts: TrailPt[], hopKm = TRAIL_HOP_KM): TrailPt[][] {
  const runs: TrailPt[][] = [];
  let cur: TrailPt[] = [];
  const flush = () => {
    if (cur.length) runs.push(cur);
    cur = [];
  };
  for (const p of pts) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) {
      flush();
      continue;
    }
    const last = cur[cur.length - 1];
    if (last && (Boolean(last.future) !== Boolean(p.future) || trailKm(last, p) > hopKm)) flush();
    cur.push(p);
  }
  flush();
  return runs;
}

function maxSegKm(zoom: number) {
  if (zoom >= 12) return 0.1;
  if (zoom >= 10) return 0.2;
  if (zoom >= 8) return 0.45;
  return 1.1;
}

function dtAlpha(a: TrailPt, b: TrailPt, alpha = 0.5) {
  const dlat = a.lat - b.lat;
  const dlon = a.lon - b.lon;
  return Math.pow(Math.max(1e-18, dlat * dlat + dlon * dlon), alpha * 0.5);
}

/** Centripetal Catmull-Rom (α=0.5): curves through samples without the uniform-CR Y-forks. */
export function centripetal(p0: TrailPt, p1: TrailPt, p2: TrailPt, p3: TrailPt, t: number): TrailPt {
  const t0 = 0;
  const t1 = t0 + dtAlpha(p0, p1);
  const t2 = t1 + dtAlpha(p1, p2);
  const t3 = t2 + dtAlpha(p2, p3);
  const tt = t1 + (t2 - t1) * Math.max(0, Math.min(1, t));
  const lerp = (a: TrailPt, b: TrailPt, ta: number, tb: number, x: number) => {
    if (Math.abs(tb - ta) < 1e-18) return a;
    return mixPt(a, b, (x - ta) / (tb - ta));
  };
  const a1 = lerp(p0, p1, t0, t1, tt);
  const a2 = lerp(p1, p2, t1, t2, tt);
  const a3 = lerp(p2, p3, t2, t3, tt);
  const b1 = lerp(a1, a2, t0, t2, tt);
  const b2 = lerp(a2, a3, t1, t3, tt);
  return lerp(b1, b2, t1, t2, tt);
}

export function splineRun(pts: TrailPt[], zoom: number): TrailPt[] {
  if (pts.length < 2) return pts;
  if (pts.length === 2) return densifyLinear(pts, maxSegKm(zoom), 80);
  const maxSeg = maxSegKm(zoom);
  const cap = zoom >= 12 ? 12 : zoom >= 10 ? 8 : zoom >= 8 ? 5 : 3;
  const out: TrailPt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    out.push(p1);
    const d = trailKm(p1, p2);
    if (!Number.isFinite(d) || d < 0.03 || d > TRAIL_HOP_KM) continue;
    const p0 = pts[Math.max(0, i - 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.min(cap, Math.max(2, Math.round(d / maxSeg)));
    for (let k = 1; k < n; k++) out.push(centripetal(p0, p1, p2, p3, k / n));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Split hops, then curve through the remaining samples (not along the chords). */
export function prepareTrail(pts: TrailPt[], zoom: number): TrailPt[][] {
  const live = pts.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (live.length < 2) return live.length ? [live] : [];
  return splitTrailRuns(live).map((run) => {
    if (run.length < 2) return run;
    if (run[0].future) return densifyLinear(run, Math.max(maxSegKm(zoom), 0.8), 80);
    return splineRun(run, zoom);
  });
}
