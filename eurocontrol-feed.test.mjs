import { test } from "node:test";
import assert from "node:assert/strict";
import { keepNmOnlyPlot, parseNmFlights } from "./eurocontrol-feed.mjs";

test("unmatched NM in theater is kept even when not touching FMP", () => {
  assert.equal(keepNmOnlyPlot({ lat: 46.05, lon: 14.5, touching: false, fmps: ["EDYYFMP"] }), true);
  assert.equal(keepNmOnlyPlot({ lat: 46.22, lon: 14.45, touching: true, fmps: ["LJLAFMP"] }), true);
  assert.equal(keepNmOnlyPlot({ lat: NaN, lon: 14.5 }), false);
  assert.equal(keepNmOnlyPlot(null), false);
});

test("NSV 4D interpolation is leftover NM, not CAT 048", () => {
  const now = 1_700_000_000;
  const fc = {
    features: [
      {
        id: "uid-1",
        properties: { timestamps: [now - 60, now, now + 60, now + 120], touching: false },
        geometry: {
          type: "LineString",
          coordinates: [
            [14.4, 46.0, 8000],
            [14.5, 46.05, 8100],
            [14.6, 46.1, 8200],
            [14.7, 46.15, 8300],
          ],
        },
      },
    ],
  };
  const rows = parseNmFlights(fc, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "nm");
  assert.equal(rows[0].touching, false);
  assert.ok(keepNmOnlyPlot(rows[0]));
  assert.ok(rows[0].trail.some((t) => t.future));
});
