import { test } from "node:test";
import assert from "node:assert/strict";
import { altColor } from "./alt-color.mjs";

test("altitude colour lerps instead of snapping to bands", () => {
  const low = altColor(200);
  const mid = altColor(2500);
  assert.match(low, /^#[0-9a-f]{6}$/i);
  assert.match(mid, /^#[0-9a-f]{6}$/i);
  assert.notEqual(altColor(1200), altColor(3000));
  assert.notEqual(altColor(8000), altColor(18000));
  assert.notEqual(altColor(33000), altColor(42000));
  assert.equal(altColor(50000), "#6aa8ff");
});
