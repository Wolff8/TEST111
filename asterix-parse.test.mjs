import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAsterixBuffer, splitAsterixFrames, encodeIcao6 } from "./asterix-parse.mjs";
import { encodeCat062 } from "./asterix-encode.mjs";

function be16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

function be24(n) {
  return Buffer.from([(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
}

function i24of(deg, lsb) {
  return Math.round(deg / lsb);
}

function block(cat, payload) {
  const len = 3 + payload.length;
  return Buffer.concat([Buffer.from([cat, (len >> 8) & 0xff, len & 0xff]), payload]);
}

test("CAT 021 I130 is 6-byte WGS-84 at 180/2^23", () => {
  const lat = 46.224444;
  const lon = 14.456111;
  const lsb = 180 / 2 ** 23;
  const payload = Buffer.concat([
    Buffer.from([0x84]),
    Buffer.from([0x12, 0x34]),
    be24(i24of(lat, lsb)),
    be24(i24of(lon, lsb)),
  ]);
  const { records } = parseAsterixBuffer(block(21, payload));
  assert.equal(records.length, 1);
  assert.ok(records[0].items["130"]);
  assert.ok(Math.abs(records[0].lat - lat) < 1e-4);
  assert.ok(Math.abs(records[0].lon - lon) < 1e-4);
  assert.equal(records[0].sac, 0x12);
  assert.equal(records[0].sic, 0x34);
});

test("CAT 021 I131 high-res 180/2^30 wins over I130", () => {
  const lsb23 = 180 / 2 ** 23;
  const lsb30 = 180 / 2 ** 30;
  const lat = 46.3;
  const lon = 14.5;
  const fspec = Buffer.from([0x86]);
  const payload = Buffer.concat([
    fspec,
    Buffer.from([1, 2]),
    be24(i24of(40, lsb23)),
    be24(i24of(10, lsb23)),
    Buffer.alloc(8),
  ]);
  payload.writeInt32BE(Math.round(lat / lsb30), 1 + 2 + 6);
  payload.writeInt32BE(Math.round(lon / lsb30), 1 + 2 + 6 + 4);
  const rec = parseAsterixBuffer(block(21, payload)).records[0];
  assert.ok(Math.abs(rec.lat - lat) < 1e-6);
  assert.ok(Math.abs(rec.lon - lon) < 1e-6);
});

test("CAT 048 polar + TOD + signed FL + callsign", () => {
  const fspec = Buffer.from([0xf5, 0x40]);
  const rho = Math.round(12.5 * 256);
  const theta = Math.round((90 / 360) * 2 ** 16);
  const tod = Math.round(3600.5 * 128);
  const fl = Math.round(330 * 4);
  const payload = Buffer.concat([
    fspec,
    Buffer.from([0x00, 0x21]),
    be24(tod),
    Buffer.from([0x00]),
    be16(rho),
    be16(theta),
    be16(fl),
    encodeIcao6("ADR123"),
  ]);
  const rec = parseAsterixBuffer(block(48, payload)).records[0];
  assert.ok(Math.abs(rec.rho - 12.5) < 1e-3);
  assert.ok(Math.abs(rec.theta - 90) < 0.01);
  assert.ok(Math.abs(rec.tod - 3600.5) < 0.02);
  assert.equal(rec.fl, 330);
  assert.equal(rec.call, "ADR123");
});

test("CAT 001 legacy mono polar uses 1/128 NM", () => {
  const rho = Math.round(10 * 128);
  const theta = Math.round((90 / 360) * 2 ** 16);
  const payload = Buffer.concat([Buffer.from([0xa0]), Buffer.from([0x00, 0x21]), be16(rho), be16(theta)]);
  const rec = parseAsterixBuffer(block(1, payload)).records[0];
  assert.equal(rec.cat, 1);
  assert.ok(Math.abs(rec.rho - 10) < 1e-3);
  assert.ok(Math.abs(rec.theta - 90) < 0.02);
  assert.equal(rec.sac, 0);
  assert.equal(rec.sic, 0x21);
});

test("CAT 034 north mark is a mono service station", () => {
  const payload = Buffer.concat([Buffer.from([0xe0]), Buffer.from([0x00, 0x21]), Buffer.from([1]), be24(Math.round(10 * 128))]);
  const rec = parseAsterixBuffer(block(34, payload)).records[0];
  assert.equal(rec.cat, 34);
  assert.equal(rec.reportName, "north");
  assert.equal(rec.sic, 0x21);
});

test("CAT 062 spare FRN 2 does not consume 015", () => {
  const lsb = 180 / 2 ** 25;
  const lat = 46.05;
  const lon = 14.5;
  const fspec = Buffer.from([0xa8]);
  const pos = Buffer.alloc(8);
  pos.writeInt32BE(Math.round(lat / lsb), 0);
  pos.writeInt32BE(Math.round(lon / lsb), 4);
  const payload = Buffer.concat([fspec, Buffer.from([7, 9]), Buffer.from([3]), pos]);
  const rec = parseAsterixBuffer(block(62, payload)).records[0];
  assert.equal(rec.sac, 7);
  assert.equal(rec.sic, 9);
  assert.ok(rec.items["015"]);
  assert.ok(rec.items["105"]);
  assert.ok(!rec.items.spare);
  assert.ok(Math.abs(rec.lat - lat) < 1e-5);
  assert.ok(Math.abs(rec.lon - lon) < 1e-5);
});

test("CAT 062 I380 does not halt before I040/I136", () => {
  const buf = encodeCat062({
    lat: 46.05,
    lon: 14.5,
    altFt: 5000,
    gs: 120,
    track: 45,
    flight: "RANGR92",
    icao: "506e6e",
    hex: "506e6e",
  });
  const rec = parseAsterixBuffer(buf).records[0];
  assert.equal(rec.icao, "506e6e");
  assert.equal(rec.call, "RANGR92");
  assert.equal(rec.fl, 50);
  assert.ok(rec.tn);
});

test("CAT 062 I290 ADS age is 2 bytes so I136 still parses", () => {
  const lsb = 180 / 2 ** 25;
  const pos = Buffer.alloc(8);
  pos.writeInt32BE(Math.round(46.2 / lsb), 0);
  pos.writeInt32BE(Math.round(14.5 / lsb), 4);
  const fl = Buffer.alloc(2);
  fl.writeInt16BE(80);
  const payload = Buffer.concat([
    Buffer.from([0x89, 0x03, 0x20]),
    Buffer.from([0, 21]),
    pos,
    Buffer.from([0x08, 0x12, 0x34]),
    fl,
  ]);
  const rec = parseAsterixBuffer(block(62, payload)).records[0];
  assert.ok(rec.items["290"]);
  assert.ok(rec.items["136"]);
  assert.equal(rec.fl, 20);
});

test("CAT 063 sensor status and CAT 065 SDPS status parse", () => {
  const c63 = block(63, Buffer.concat([Buffer.from([0xf0]), Buffer.from([0, 63]), Buffer.from([1]), be24(128), Buffer.from([0, 21])]));
  const c65 = block(65, Buffer.concat([Buffer.from([0xf4]), Buffer.from([0, 65]), Buffer.from([1]), Buffer.from([2]), be24(128), Buffer.from([0x00])]));
  const recs = parseAsterixBuffer(Buffer.concat([c63, c65])).records;
  assert.equal(recs[0].cat, 63);
  assert.equal(recs[0].sic, 63);
  assert.equal(recs[0].sensorSic, 21);
  assert.equal(recs[1].cat, 65);
  assert.equal(recs[1].reportName, "sdps-status");
});

test("TCP assembler keeps a partial tail", () => {
  const full = block(21, Buffer.concat([Buffer.from([0x80]), Buffer.from([1, 2])]));
  const cut = Buffer.concat([full, full.subarray(0, 4)]);
  const { frames, rest } = splitAsterixFrames(cut);
  assert.equal(frames.length, 1);
  assert.equal(rest.length, 4);
});
