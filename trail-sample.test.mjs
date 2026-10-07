import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldAppendTrail, fadeTrailOpacity, selectTrailPast, ingestTrailPoint, sanitizeTrail, TRAIL_MIN_MS, TRAIL_SAMPLE_MS } from "./trail-sample.mjs";

test("slow surface and balloon drift still append trail samples", () => {
  const t0 = 1_000_000;
  const last = { lat: 46.6292, lon: 16.1908, at: t0 };
  assert.equal(shouldAppendTrail(last, 46.6292, 16.1908, 620, t0 + 1000), false);
  assert.equal(shouldAppendTrail(last, 46.6293, 16.1910, 620, t0 + TRAIL_SAMPLE_MS), true);
  assert.equal(shouldAppendTrail(null, 46.05, 14.5, 1200, t0), true);
});

test("trail tail is almost gone at 15 min and solid at the nose", () => {
  const nose = fadeTrailOpacity(0);
  const mid = fadeTrailOpacity(TRAIL_MIN_MS * 0.5);
  const tail = fadeTrailOpacity(TRAIL_MIN_MS);
  assert.ok(nose > 0.7);
  assert.ok(mid < nose);
  assert.ok(tail < mid);
  assert.ok(tail <= 0.08);
});

test("same-tick feeder jitter does not add a second vertex", () => {
  const t0 = 3_000_000;
  const pts = [];
  ingestTrailPoint(pts, 47.8, 16.24, 1800, t0);
  ingestTrailPoint(pts, 47.8006, 16.2404, 1810, t0 + 40);
  ingestTrailPoint(pts, 47.8003, 16.2402, 1805, t0 + 80);
  assert.equal(pts.length, 1);
});

test("dual-feed ping-pong does not sawtooth the trail", () => {
  const t0 = 5_000_000;
  const pts = [];
  ingestTrailPoint(pts, 47.0, 15.4, 8000, t0);
  ingestTrailPoint(pts, 47.04, 15.48, 7900, t0 + 12);
  ingestTrailPoint(pts, 47.001, 15.401, 7950, t0 + 1000);
  ingestTrailPoint(pts, 47.041, 15.481, 7850, t0 + 1012);
  ingestTrailPoint(pts, 47.01, 15.41, 7800, t0 + 7000);
  assert.ok(pts.length >= 2 && pts.length <= 3);
  assert.ok(pts.every((p) => p.lat < 47.03), JSON.stringify(pts.map((p) => p.lat)));
});

test("sanitizeTrail strips existing A-B-A hops and keeps a 500 kt pass", () => {
  const t0 = 8_000_000;
  const saw = [
    { lat: 46.5, lon: 15.6, alt: 4000, at: t0 },
    { lat: 46.65, lon: 15.7, alt: 5000, at: t0 + 200 },
    { lat: 46.51, lon: 15.61, alt: 4050, at: t0 + 6000 },
    { lat: 46.66, lon: 15.71, alt: 5100, at: t0 + 6200 },
  ];
  const clean = sanitizeTrail(saw);
  assert.ok(clean.length <= 2);
  const fast = [];
  ingestTrailPoint(fast, 46.0, 14.0, 400, t0);
  ingestTrailPoint(fast, 46.014, 14.0, 350, t0 + 6000);
  assert.equal(fast.length, 2);
});

test("dense heli descent keeps samples through the last metres to ground", () => {
  const t0 = 9_000_000;
  const pts = [];
  ingestTrailPoint(pts, 46.6511, 16.1664, 800, t0, "#a", { dense: true });
  ingestTrailPoint(pts, 46.65105, 16.16635, 420, t0 + 1000, "#a", { dense: true });
  ingestTrailPoint(pts, 46.65102, 16.16632, 90, t0 + 2000, "#a", { dense: true });
  ingestTrailPoint(pts, 46.65100, 16.16630, 0, t0 + 3000, "#a", { dense: true });
  assert.ok(pts.length >= 3, JSON.stringify(pts.map((p) => p.alt)));
  assert.equal(pts[pts.length - 1].alt, 0);
});

test("selectTrailPast keeps the 15 minute window", () => {
  const now = 2_000_000;
  const past = [];
  for (let i = 0; i < 40; i++) {
    past.push({ lat: 46 + i * 0.01, lon: 14, at: now - (20 - i * 0.5) * 60_000 });
  }
  const keep = selectTrailPast(past, now, 80);
  const in15 = keep.filter((p) => now - p.at <= TRAIL_MIN_MS);
  assert.ok(in15.length >= 29);
  assert.ok(keep.length >= in15.length);
});
