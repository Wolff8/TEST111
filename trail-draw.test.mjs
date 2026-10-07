import { test } from "node:test";
import assert from "node:assert/strict";
import { chaikin, densifyLinear, splitTrailRuns, prepareTrail, centripetal, splineRun, TRAIL_HOP_KM } from "./src/trail-draw.ts";

test("Chaikin rounds a right angle without overshooting the bounding box", () => {
  const pts = [
    { lat: 0, lon: 0, alt: 1000 },
    { lat: 0, lon: 1, alt: 1000 },
    { lat: 1, lon: 1, alt: 1000 },
  ];
  const out = chaikin(pts, 1);
  assert.ok(out.length > pts.length);
  for (const p of out) {
    assert.ok(p.lat >= -1e-9 && p.lat <= 1 + 1e-9, `lat ${p.lat}`);
    assert.ok(p.lon >= -1e-9 && p.lon <= 1 + 1e-9, `lon ${p.lon}`);
  }
});

test("splitTrailRuns leaves a radar hop as a gap, not a connecting line", () => {
  const a = { lat: 46.0, lon: 14.0, alt: 8000, at: 1 };
  const b = { lat: 46.01, lon: 14.01, alt: 8100, at: 2 };
  const c = { lat: 47.2, lon: 15.4, alt: 9000, at: 3 };
  const runs = splitTrailRuns([a, b, c]);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].length, 2);
  assert.equal(runs[1].length, 1);
  assert.ok(TRAIL_HOP_KM >= 8);
});

test("densifyLinear lerps altitude along a segment", () => {
  const pts = [
    { lat: 46.0, lon: 14.0, alt: 0 },
    { lat: 46.05, lon: 14.0, alt: 10000 },
  ];
  const out = densifyLinear(pts, 0.5);
  assert.ok(out.length >= 8);
  const mid = out[Math.floor(out.length / 2)];
  assert.ok(mid.alt > 2000 && mid.alt < 8000, `mid alt ${mid.alt}`);
});

test("centripetal Catmull-Rom does not Y-fork a right angle", () => {
  const p0 = { lat: 0, lon: 0 };
  const p1 = { lat: 0, lon: 1 };
  const p2 = { lat: 1, lon: 1 };
  const p3 = { lat: 1, lon: 1 };
  for (let k = 1; k < 8; k++) {
    const p = centripetal(p0, p1, p2, p3, k / 8);
    assert.ok(p.lat > -0.08 && p.lat < 1.08, `lat ${p.lat}`);
    assert.ok(p.lon > -0.08 && p.lon < 1.08, `lon ${p.lon}`);
  }
});

test("a 6-point circuit is drawn as a curve, not a hexagon", () => {
  const hex = [];
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2;
    hex.push({ lat: 47.8 + 0.03 * Math.sin(t), lon: 16.24 + 0.04 * Math.cos(t), alt: 1800, at: i * 20_000 });
  }
  hex.push(hex[0]);
  const out = splineRun(hex, 12);
  assert.ok(out.length > hex.length * 2);
  const sharp = hex[2];
  const near = out.filter((p) => Math.abs(p.lat - sharp.lat) < 0.004 && Math.abs(p.lon - sharp.lon) < 0.004);
  assert.ok(near.length >= 1);
});

test("prepareTrail keeps endpoints of a circuit and does not fork", () => {
  const circuit = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    circuit.push({
      lat: 47.0 + 0.04 * Math.sin(t * Math.PI * 2),
      lon: 15.44 + 0.05 * Math.cos(t * Math.PI * 2),
      alt: 2500 + 800 * Math.sin(t * Math.PI),
      at: i * 6000,
    });
  }
  const runs = prepareTrail(circuit, 11);
  assert.equal(runs.length, 1);
  const out = runs[0];
  assert.ok(out.length > circuit.length);
  const lats = out.map((p) => p.lat);
  const lons = out.map((p) => p.lon);
  assert.ok(Math.min(...lats) >= 46.95 && Math.max(...lats) <= 47.05);
  assert.ok(Math.min(...lons) >= 15.38 && Math.max(...lons) <= 15.50);
});
