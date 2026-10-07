import { test } from "node:test";
import assert from "node:assert/strict";
import { ognAgeSec, ognMaxAgeSec, isUavAircraft } from "./uav-feed.mjs";

test("ognAgeSec prefers the UTC clock when it is recent", () => {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(Math.max(0, now.getUTCSeconds() - 20)).padStart(2, "0");
  const age = ognAgeSec(["46", "14", "x", "x", "100", `${hh}:${mm}:${ss}`, "9000"]);
  assert.ok(age < 120, age);
});

test("ognMaxAgeSec drops hour-old parked FLARM", () => {
  assert.equal(ognMaxAgeSec({}), 180);
  assert.equal(ognMaxAgeSec({ onField: true }), 300);
  assert.equal(ognMaxAgeSec({ uav: true }), 300);
  assert.equal(ognMaxAgeSec({ para: true }), 300);
});

test("ognAgeSec keeps a 3-hour clock so TTL can expire the ghost", () => {
  const now = new Date();
  const then = new Date(now.getTime() - 3 * 3600_000);
  const hh = String(then.getUTCHours()).padStart(2, "0");
  const mm = String(then.getUTCMinutes()).padStart(2, "0");
  const ss = String(then.getUTCSeconds()).padStart(2, "0");
  const age = ognAgeSec(["46", "14", "x", "x", "100", `${hh}:${mm}:${ss}`, "12"]);
  assert.ok(age > 10000 && age < 4 * 3600, age);
});

test("MQ9 and B6 count as UAV", () => {
  assert.equal(isUavAircraft({ category: "B6" }), true);
  assert.equal(isUavAircraft({ t: "MQ9" }), true);
  assert.equal(isUavAircraft({ t: "BTB2" }), true);
  assert.equal(isUavAircraft({ t: "TB20" }), false);
  assert.equal(isUavAircraft({ t: "A320", category: "A3" }), false);
});
