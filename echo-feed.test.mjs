import { test } from "node:test";
import assert from "node:assert/strict";
import {
  echoAltM,
  beamHeightM,
  parseSrd,
  sampleEchoes,
  si0ToWgs,
  echoesAsAdsb,
  isPassiveBalloonCell,
  resetEchoMotion,
  samplePngEchoes,
  overlayToWgs,
  vmiColorDbz,
} from "./echo-feed.mjs";

function srd(gridLines) {
  const ny = gridLines.length;
  const nx = gridLines[0].length;
  return [
    "SRD-3",
    `ncell     ${nx} ${ny}`,
    "offset    64",
    "start     12.0",
    "slope     3.0",
    "nodata    126",
    "quant     ZM",
    "time      2026 10 07 12 10",
    "DATA",
    ...gridLines,
    "",
  ].join("\n");
}

test("si0ToWgs puts LJMS on the SI0 grid", () => {
  const { lat, lon } = si0ToWgs(310, 216);
  assert.ok(Math.abs(lat - 46.6292) < 0.03);
  assert.ok(Math.abs(lon - 16.1908) < 0.04);
});

test("parseSrd reads BYTE levels after DATA", () => {
  const hit = parseSrd(srd(["@@@@", "@A@@", "@@@@"]));
  assert.equal(hit.nx, 4);
  assert.equal(hit.ny, 3);
  assert.equal(hit.grid[1][1], "A");
});

test("sampleEchoes keeps an isolated leftover and drops a rain blob", () => {
  const zmIso = parseSrd(srd(["@@@@@", "@@C@@", "@@@@@", "@@@@@"]));
  const iso = sampleEchoes(zmIso, null, { maxCells: 8, maxSize: 6, maxNear: 6 });
  assert.equal(iso.length, 1);
  assert.ok(iso[0].dbz >= 20);

  const weakIso = parseSrd(srd(["@@@@@", "@@B@@", "@@@@@", "@@@@@"]));
  const weak = sampleEchoes(weakIso, null, { maxCells: 8, maxSize: 6, maxNear: 6 });
  assert.equal(weak.length, 1);
  assert.ok(weak[0].dbz >= 17 && weak[0].dbz < 24);

  const lv1 = parseSrd(srd(["@@@@@", "@@A@@", "@@@@@", "@@@@@"]));
  assert.equal(sampleEchoes(lv1, null, { maxCells: 8, maxSize: 6, maxNear: 6 }).length, 0);

  const blob = parseSrd(
    srd(["ABCDEF", "ABCDEF", "ABCDEF", "ABCDEF", "ABCDEF", "ABCDEF"]),
  );
  const rain = sampleEchoes(blob, null, { maxCells: 20, maxSize: 6, maxNear: 6 });
  assert.equal(rain.length, 0);
});

test("echoesAsAdsb never invents an ICAO or callsign", () => {
  resetEchoMotion();
  const rows = echoesAsAdsb([{ lat: 46.63, lon: 16.19, dbz: 30, size: 3, x: 310, y: 216 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].flight, "");
  assert.equal(rows[0].type, "echo");
  assert.match(rows[0].hex, /^echo/);
  assert.ok(rows[0].alt_geom > 2000);
  assert.equal(String(rows[0].desc).includes("~25 m"), false);
});

test("echoAltM uses beam height instead of a 25 m slab", () => {
  const ljms = beamHeightM(46.6292, 16.1908);
  assert.ok(ljms > 800 && ljms < 3000, ljms);
  assert.equal(echoAltM(15, 1, 46.6292, 16.1908), ljms);
  assert.ok(echoAltM(36, 4) >= 220);
  assert.equal(echoAltM(15, 1), 80);
});

test("sampleEchoes drops a weak street of speckle and still drops rain", () => {
  const zm = parseSrd(
    srd(["@@@@@@@@", "@@BBBB@@", "@@BBBB@@", "@@@@@@@@", "@@@@@@@@"]),
  );
  const kept = sampleEchoes(zm, null, { maxCells: 20, maxSize: 12, maxNear: 10 });
  assert.equal(kept.length, 0);

  const blob = parseSrd(
    srd(["ABCDEFGH", "ABCDEFGH", "ABCDEFGH", "ABCDEFGH", "ABCDEFGH", "ABCDEFGH", "ABCDEFGH"]),
  );
  const rain = sampleEchoes(blob, null, { maxCells: 20, maxSize: 12, maxNear: 10 });
  assert.equal(rain.length, 0);
});

test("echoesAsAdsb keeps a stable id when the leftover moves one cell", () => {
  resetEchoMotion();
  const a = echoesAsAdsb([{ lat: 45.21, lon: 14.11, dbz: 30, size: 3, x: 120, y: 40 }]);
  const b = echoesAsAdsb([{ lat: 45.215, lon: 14.115, dbz: 30, size: 3, x: 121, y: 40 }]);
  assert.equal(a[0].hex, b[0].hex);
  assert.equal(a[0].flight, "");
  assert.ok((b[0].gs || 0) <= 120);
});

test("weak leftover needs two scans and far parked speckle stays off", () => {
  resetEchoMotion();
  const near = { lat: 46.12, lon: 14.815, dbz: 18, size: 1, x: 200, y: 150 };
  assert.equal(echoesAsAdsb([near]).length, 0);
  const second = echoesAsAdsb([near]);
  assert.equal(second.length, 1);

  resetEchoMotion();
  const far = { lat: 45.21, lon: 16.5, dbz: 18, size: 1, x: 1, y: 1 };
  assert.equal(echoesAsAdsb([far]).length, 0);
  assert.equal(echoesAsAdsb([far]).length, 0);
});

test("weak leftover over LJMS plots on the first scan", () => {
  resetEchoMotion();
  const cell = { lat: 46.6292, lon: 16.1908, dbz: 18, size: 1, x: 310, y: 216 };
  assert.equal(echoesAsAdsb([cell]).length, 1);
});

test("weak leftover over Rakičan hospital pad plots on the first scan", () => {
  resetEchoMotion();
  const cell = { lat: 46.65107, lon: 16.16639, dbz: 18, size: 1, x: 308, y: 218 };
  assert.equal(echoesAsAdsb([cell]).length, 1);
});

test("slow isolated leftover is a passive balloon, rain blobs are not", () => {
  assert.equal(isPassiveBalloonCell({ dbz: 22, size: 2, gs: 12, hopKm: 0.8, rainLv: 0 }), true);
  assert.equal(isPassiveBalloonCell({ dbz: 42, size: 8, gs: 8, rainLv: 3 }), false);
  resetEchoMotion();
  echoesAsAdsb([{ lat: 46.4, lon: 15.6, dbz: 22, size: 2, x: 180, y: 140 }]);
  const b = echoesAsAdsb([{ lat: 46.404, lon: 15.6005, dbz: 22, size: 2, x: 181, y: 141 }]);
  assert.equal(b.length, 1);
  assert.equal(b[0].passiveBalloon, true);
  assert.equal(b[0].t, "HAB");
  assert.equal(b[0].type, "echo");
});

test("cell-hop leftovers do not inherit impossible ground speed", () => {
  resetEchoMotion();
  echoesAsAdsb([{ lat: 46.12, lon: 14.815, dbz: 30, size: 4, x: 200, y: 150 }]);
  const b = echoesAsAdsb([{ lat: 46.14, lon: 14.83, dbz: 30, size: 4, x: 202, y: 152 }]);
  assert.ok((b[0].gs || 0) <= 120);
});

test("overlayToWgs puts the overlay center on the bound box", () => {
  const { lat, lon } = overlayToWgs(250, 250, 501, 501, { LON1: 11, LAT1: 43.8, LON2: 17.42, LAT2: 48.31 });
  assert.ok(Math.abs(lat - (43.8 + 48.31) / 2) < 0.05);
  assert.ok(Math.abs(lon - (11 + 17.42) / 2) < 0.05);
});

test("samplePngEchoes keeps an isolated VMI speck and drops a rain blob", () => {
  const w = 6;
  const h = 6;
  const rgba = Buffer.alloc(w * h * 4);
  const set = (x, y, r, g, b, a = 255) => {
    const i = (y * w + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };
  set(1, 1, 0, 220, 80);
  for (let y = 2; y < 6; y += 1) for (let x = 2; x < 6; x += 1) set(x, y, 255, 195, 0);
  const iso = samplePngEchoes({ w, h, rgba }, { LON1: 13, LAT1: 45, LON2: 14, LAT2: 46 }, { maxCells: 8, maxSize: 3 });
  assert.equal(iso.length, 1);
  assert.ok(iso[0].dbz >= 20);
  assert.equal(iso[0].tag, "f");
  assert.ok(vmiColorDbz(0, 220, 80, 255) >= 20);
});
