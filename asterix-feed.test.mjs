import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeCat021, encodeCat048, encodeCat048Primary, encodeCat062, DEFAULT_RADAR, PSR_SITE } from "./asterix-encode.mjs";
import { ingestAsterixRaw, listAsterix, asterixGapTracks, normalizeIcao } from "./asterix-feed.mjs";

const plane = {
  lat: 46.224444,
  lon: 14.456111,
  altFt: 33000,
  gs: 420,
  track: 90,
  flight: "ADR123",
  icao: "3c56e4",
  hex: "3c56e4",
  src: "adsb",
};

test("normalizeIcao keeps last 6 hex", () => {
  assert.equal(normalizeIcao("ax483c56e4"), "3c56e4");
  assert.equal(normalizeIcao("3C56E4"), "3c56e4");
});

test("same ICAO in 021/048/062 collapses to one operator track", () => {
  const site = { sac: 20, sic: 1 };
  const buf = Buffer.concat([
    encodeCat021(plane, site),
    encodeCat048(plane, DEFAULT_RADAR, site),
    encodeCat062(plane, site),
  ]);
  const hit = ingestAsterixRaw(buf, { radar: DEFAULT_RADAR });
  assert.ok(hit.n >= 1);
  const rows = listAsterix().filter((t) => t.icao === "3c56e4");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cat, 48);
  assert.equal(rows[0].call, "ADR123");
});

test("gap tracks skip hex already on ADS-B", () => {
  const gaps = asterixGapTracks(["3c56e4"]);
  assert.equal(gaps.filter((g) => g.hex === "3c56e4").length, 0);
});

test("CAT 048 primary leftover is a PSR gap track, not transcode", () => {
  const buf = encodeCat048Primary(
    { lat: 46.26, lon: 15.79, altFt: 130, gs: 20, track: 90 },
    DEFAULT_RADAR,
    PSR_SITE,
  );
  const hit = ingestAsterixRaw(buf, { radar: DEFAULT_RADAR, persistOrigin: false });
  assert.ok(hit.n >= 1);
  const gaps = asterixGapTracks([]);
  const psr = gaps.filter((g) => g.type === "psr");
  assert.ok(psr.length >= 1);
  assert.ok(!psr[0].hex || !/^[0-9a-f]{6}$/i.test(psr[0].hex) || String(psr[0].hex).startsWith("ax"));
  assert.equal(psr[0].silent, true);
  assert.equal(psr[0].asterixCat, "CAT048");
});
