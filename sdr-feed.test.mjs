import test from "node:test";
import assert from "node:assert/strict";
import {
  createSdrFeed,
  SDR_STATIONS,
  calcPolarAndCartesian,
} from "./sdr-feed.mjs";

test("SDR_STATIONS defines Puconci, Dolina 43, and LJMS heads", () => {
  assert.ok(SDR_STATIONS.puconci);
  assert.ok(SDR_STATIONS.dolina43);
  assert.ok(SDR_STATIONS.ljms);
  assert.equal(SDR_STATIONS.puconci.sac, 250);
  assert.equal(SDR_STATIONS.puconci.sic, 43);
  assert.equal(SDR_STATIONS.dolina43.sic, 44);
  assert.equal(SDR_STATIONS.ljms.sic, 21);
});

test("calcPolarAndCartesian calculates slant range and azimuth in NM and degrees", () => {
  const origin = SDR_STATIONS.puconci;
  // A point slightly north of Puconci
  const res = calcPolarAndCartesian(origin, origin.lat + 0.1, origin.lon);
  assert.ok(res.rhoNm > 5 && res.rhoNm < 7);
  assert.ok(res.thetaDeg >= 355 || res.thetaDeg <= 5); // Approximately North
  assert.ok(Math.abs(res.cartX) < 1);
  assert.ok(res.cartY > 5);
});

test("createSdrFeed supports station tagging and Beast mode raw ingestion", () => {
  const tracks = new Map();
  const feed = createSdrFeed(tracks);

  // Ingest SBS message from Puconci
  const sbsMsg = "MSG,3,1,1,440012,1,2026/10/08,04:00:00.000,2026/10/08,04:00:00.000,SVN101,3500,120,45,46.72,16.20,0,0,0,0";
  const r = feed.ingestStationRaw("puconci", Buffer.from(sbsMsg, "utf8"));
  assert.equal(r.n, 1);

  const t = tracks.get("440012");
  assert.ok(t);
  assert.equal(t.flight, "SVN101");
  assert.equal(t.stationId, "puconci");
  assert.equal(t.sac, 250);
  assert.equal(t.sic, 43);
  assert.ok(t.rhoNm > 0);
  assert.ok(t.thetaDeg >= 0 && t.thetaDeg <= 360);
});

test("consumeBeast escapes 0x1a and decodes Mode S frames", () => {
  const tracks = new Map();
  const feed = createSdrFeed(tracks);

  // Construct a minimal Beast 0x33 Mode S 14-byte frame with 0x1a header
  // 0x1a 0x33 <6 byte mlat> <1 byte rssi> <14 bytes Mode S>
  const header = Buffer.from([0x1a, 0x33, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xbf]);
  // DF17 callsign message: 8d 4b 12 34 ...
  const modeS = Buffer.from("8d4b123420233631303100000000", "hex");
  const beastBuf = Buffer.concat([header, modeS]);

  feed.ingestStationBeast("dolina43", beastBuf);
  assert.ok(feed.status.frames >= 1);
  const t = tracks.get("4b1234");
  assert.ok(t);
  assert.equal(t.stationId, "dolina43");
});
