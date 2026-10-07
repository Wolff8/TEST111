import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAsterixBuffer } from "./asterix-parse.mjs";
import { encodeCat021, encodeCat048, encodeCat048Primary, encodeCat062, encodeEchoesCat048, encodeLiveAsterix, DEFAULT_RADAR, PSR_SITE, PSR_SITES, isLeftoverPsrSite } from "./asterix-encode.mjs";

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

test("CAT 021 roundtrip from live ADS-B fields", () => {
  const buf = encodeCat021(plane);
  const rec = parseAsterixBuffer(buf).records[0];
  assert.equal(rec.cat, 21);
  assert.ok(Math.abs(rec.lat - plane.lat) < 2e-4);
  assert.ok(Math.abs(rec.lon - plane.lon) < 2e-4);
  assert.equal(rec.call, "ADR123");
  assert.equal(rec.icao, "3c56e4");
  assert.equal(rec.fl, 330);
});

test("CAT 048 polar roundtrip from the same WGS-84 point", () => {
  const buf = encodeCat048(plane, DEFAULT_RADAR);
  const rec = parseAsterixBuffer(buf).records[0];
  assert.equal(rec.cat, 48);
  assert.ok(rec.rho < 1);
  assert.ok(rec.rho >= 0);
  assert.equal(rec.call, "ADR123");
});

test("CAT 062 WGS-84 180/2^25 roundtrip", () => {
  const buf = encodeCat062(plane);
  const rec = parseAsterixBuffer(buf).records[0];
  assert.equal(rec.cat, 62);
  assert.ok(Math.abs(rec.lat - plane.lat) < 2e-4);
  assert.ok(Math.abs(rec.lon - plane.lon) < 2e-4);
  assert.equal(rec.icao, "3c56e4");
  assert.equal(rec.call, "ADR123");
  assert.equal(rec.fl, 330);
  assert.ok(rec.items["380"]);
  assert.ok(rec.items["040"]);
  assert.ok(rec.items["136"]);
});

test("live pack emits CAT 025/063/065 + 048 + 062", () => {
  const pack = encodeLiveAsterix([plane], DEFAULT_RADAR);
  assert.equal(pack.n021, 0);
  assert.equal(pack.n048, 1);
  assert.equal(pack.n062, 1);
  assert.equal(pack.n063, 1);
  assert.equal(pack.n065, 1);
  assert.ok(pack.parsed >= 5);
  const cats = new Set(parseAsterixBuffer(pack.buf).records.map((r) => r.cat));
  assert.deepEqual([...cats].sort((a, b) => a - b), [25, 48, 62, 63, 65]);
});

test("CAT 048 primary has TYP=PSR and no Mode S address", () => {
  const buf = encodeCat048Primary(
    { lat: 46.26, lon: 15.79, altFt: 130, gs: 40, track: 80 },
    DEFAULT_RADAR,
    PSR_SITE,
  );
  const rec = parseAsterixBuffer(buf).records[0];
  assert.equal(rec.cat, 48);
  assert.equal(rec.sic, 1);
  assert.equal(rec.typ, 1);
  assert.equal(rec.psr, true);
  assert.equal(rec.icao, undefined);
  assert.ok(rec.rho > 0);
});

test("leftover PSR sites are SAC 0 SIC 1/2/3/6, never LIVEADSB", () => {
  assert.equal(isLeftoverPsrSite(0, 1), true);
  assert.equal(isLeftoverPsrSite(0, 2), true);
  assert.equal(isLeftoverPsrSite(0, 3), true);
  assert.equal(isLeftoverPsrSite(0, 6), true);
  assert.equal(isLeftoverPsrSite(0, 21), false);
  assert.equal(PSR_SITES.fvg.sic, 2);
  assert.equal(PSR_SITES.feeder.sic, 3);
});

test("encodeEchoesCat048 packs leftover cells without inventing an ICAO", () => {
  const buf = encodeEchoesCat048(
    [{ lat: 46.26, lon: 15.79, alt_geom: 130, gs: 0, track: 0 }],
    DEFAULT_RADAR,
  );
  assert.ok(buf);
  const recs = parseAsterixBuffer(buf).records;
  assert.equal(recs.length, 1);
  assert.equal(recs[0].icao, undefined);
  assert.equal(recs[0].psr, true);
});

test("feeder leftover CAT 048 uses SAC 0 SIC 3 and has no Mode S address", () => {
  const buf = encodeEchoesCat048(
    [{ lat: 46.6292, lon: 16.1908, alt_geom: 620, gs: 12, track: 90 }],
    { lat: 46.12, lon: 14.815, theta0: 0 },
    PSR_SITES.feeder,
  );
  assert.ok(buf);
  const rec = parseAsterixBuffer(buf).records[0];
  assert.equal(rec.sic, 3);
  assert.equal(rec.psr, true);
  assert.equal(rec.icao, undefined);
});
