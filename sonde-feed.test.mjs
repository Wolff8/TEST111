import { test } from "node:test";
import assert from "node:assert/strict";
import { latestTelem, sondeAsAdsb } from "./sonde-feed.mjs";

test("latestTelem accepts a flat latest object", () => {
  const p = latestTelem({ lat: 46.1, lon: 14.5, alt: 9000, datetime: new Date().toISOString() });
  assert.equal(p.lat, 46.1);
});

test("latestTelem picks the newest nested timestamp", () => {
  const p = latestTelem({
    "2026-10-07T08:00:00.000Z": { lat: 46, lon: 14, alt: 1000 },
    "2026-10-07T09:00:00.000Z": { lat: 47, lon: 15, alt: 2000 },
  });
  assert.equal(p.lat, 47);
});

test("sondeAsAdsb keeps a high recent radiosonde", () => {
  const row = sondeAsAdsb("Y3322740", {
    lat: 47.1,
    lon: 14.2,
    alt: 12000,
    type: "RS41",
    datetime: new Date().toISOString(),
    vel_h: 12,
  });
  assert.ok(row);
  assert.equal(row.hex, "sondey3322740");
  assert.equal(row.t, "SONDE");
  assert.equal(row.type, "balloon");
});

test("sondeAsAdsb drops grounded amateur APRS", () => {
  const row = sondeAsAdsb(
    "YO3XXX-12",
    { lat: 44.3, lon: 26.0, alt: 120, datetime: new Date().toISOString(), payload_callsign: "YO3XXX-12" },
    { amateur: true },
  );
  assert.equal(row, null);
});
