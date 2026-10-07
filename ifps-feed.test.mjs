import { test } from "node:test";
import assert from "node:assert/strict";
import { inIfpsZone, tagIfpsOnPlane } from "./ifps-feed.mjs";

test("IFPZ heuristic is ECAC-ish ICAO, not US", () => {
  assert.equal(inIfpsZone("LJLJ"), true);
  assert.equal(inIfpsZone("LOWW"), true);
  assert.equal(inIfpsZone("EDDM"), true);
  assert.equal(inIfpsZone("KJFK"), false);
  assert.equal(inIfpsZone(""), false);
});

test("IFPS chip tags IFPZ dep/dest on live rows", () => {
  const p = { dep: "LJLJ", dest: "LOWW" };
  assert.equal(tagIfpsOnPlane(p), true);
  assert.equal(p.ifps, true);
});

test("IFPS chip tags unmatched NM-only 4D leftover", () => {
  const p = { src: "nm", silent: true };
  assert.equal(tagIfpsOnPlane(p, { nmOnly: true }), true);
  assert.equal(p.ifps, true);
});

test("IFPS chip does not invent IFPZ on a non-NM row without O/D", () => {
  const p = { src: "adsb", flight: "N123AB" };
  assert.equal(tagIfpsOnPlane(p), false);
  assert.equal(p.ifps, undefined);
});
