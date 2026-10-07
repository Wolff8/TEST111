import { test } from "node:test";
import assert from "node:assert/strict";
import { birdtamAltM, pixelToLonLat, sampleFlocks, taggedBirdsAsAdsb } from "./bird-feed.mjs";

test("pixelToLonLat interpolates the radar quad", () => {
  const corners = [
    [0, 50],
    [10, 50],
    [10, 40],
    [0, 40],
  ];
  const nw = pixelToLonLat(0, 0, 11, 11, corners);
  assert.ok(Math.abs(nw.lon - 0) < 1e-6);
  assert.ok(Math.abs(nw.lat - 50) < 1e-6);
  const se = pixelToLonLat(10, 10, 11, 11, corners);
  assert.ok(Math.abs(se.lon - 10) < 1e-6);
  assert.ok(Math.abs(se.lat - 40) < 1e-6);
});

test("sampleFlocks skips no-data and keeps hot cells", () => {
  const w = 8;
  const h = 8;
  const bytes = Buffer.alloc(w * h, 254);
  bytes[0] = 6;
  bytes[1] = 5;
  const radar = {
    w,
    h,
    corners: [
      [10, 50],
      [11, 50],
      [11, 49],
      [10, 49],
    ],
    birdtam: bytes.toString("base64"),
  };
  const cells = sampleFlocks(radar, { block: 4, minMean: 1, maxCells: 8 });
  assert.ok(cells.length >= 1);
  assert.equal(cells[0].t, "FLOCK");
  assert.equal(cells[0].type, "bird");
  assert.equal(cells[0].category, "");
  assert.ok(cells[0].alt_geom > 800);
  assert.ok(cells[0].birdtam >= 5);
});

test("birdtamAltM maps intensity onto the migration layer", () => {
  assert.equal(birdtamAltM(0), 40);
  assert.equal(birdtamAltM(8), 1400);
});

test("taggedBirdsAsAdsb keeps only live-today tags", () => {
  const geo = {
    features: [
      {
        geometry: { coordinates: [14.5, 46.1] },
        properties: { live: true, age: "Transmitting, seen today", name: "Pia", species: "White stork", slug: "pia" },
      },
      {
        geometry: { coordinates: [14.5, 46.1] },
        properties: { live: true, age: "Last signal 1 day ago", name: "Old", species: "White stork", slug: "old" },
      },
    ],
  };
  const rows = taggedBirdsAsAdsb(geo);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].flight, "Pia");
});
