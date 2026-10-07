import { test } from "node:test";
import assert from "node:assert/strict";
import { recognizeDjiRid } from "./rid-feed.mjs";

test("recognizeDjiRid flags CTA-2063 1581F serials as DJI", () => {
  const hit = recognizeDjiRid({ serial: "1581F6F3C8H4W5" });
  assert.equal(hit.dji, true);
  assert.equal(hit.cta, true);
  assert.match(hit.model, /DJI/);
});

test("recognizeDjiRid reads Mavic Self-ID text", () => {
  const hit = recognizeDjiRid({ serial: "AABBCC", text: "DJI Mavic 3", model: "RID" });
  assert.equal(hit.dji, true);
  assert.match(hit.model, /Mavic/i);
});

test("recognizeDjiRid ignores a random hex", () => {
  const hit = recognizeDjiRid({ serial: "4D22AB", model: "RID" });
  assert.equal(hit.dji, false);
});
