import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLolIcaoQuery, collectWatchHexes, TAR1090_TOPIC } from "./tar1090-feed.mjs";

const MD = `
[adsb-54]: https://adsb.lol/?icao=3FB101,4068C8,4B832A,AE4BC0
[adsb-42]: https://adsb.lol/?icao=3C8481,501D13,A052D9
[adsb-58]: https://adsb.lol/?icao=505C02,A00195
[adsbexchange-54]: https://globe.adsbexchange.com/?icao=DEADBE
`;

test("parseLolIcaoQuery reads adsb.lol ICAO lists and skips ADSBx globe", () => {
  const by = parseLolIcaoQuery(MD);
  assert.deepEqual(by.get("adsb-54"), ["3fb101", "4068c8", "4b832a", "ae4bc0"]);
  assert.equal(by.has("adsbexchange-54"), false);
  assert.equal(TAR1090_TOPIC.includes("tar1090"), true);
});

test("collectWatchHexes keeps UAV worldwide and EU/SI prefixes only for other lists", () => {
  const hexes = collectWatchHexes(parseLolIcaoQuery(MD));
  assert.ok(hexes.includes("3fb101"));
  assert.ok(hexes.includes("ae4bc0"));
  assert.ok(hexes.includes("501d13"));
  assert.ok(hexes.includes("505c02"));
  assert.ok(hexes.includes("3c8481"));
  assert.equal(hexes.includes("a052d9"), false);
  assert.equal(hexes.includes("a00195"), false);
});

test("no-pos Mode S from tar1090 is EU/SI hex only", () => {
  const eu = { hex: "506e6e", type: "mode_s" };
  const us = { hex: "ae4bc0", type: "mode_s" };
  const hex = String(eu.hex).toLowerCase();
  assert.equal(/^(3[c-f]|4[0-9a-d]|50|51)/.test(hex), true);
  assert.equal(/^(3[c-f]|4[0-9a-d]|50|51)/.test(String(us.hex).toLowerCase()), false);
});
