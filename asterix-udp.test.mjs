import { test } from "node:test";
import assert from "node:assert/strict";
import { asterixUdpListenPort, ASTERIX_UDP_DEFAULT } from "./asterix-udp.mjs";

test("leftover CAT 048 UDP defaults to 8600", () => {
  assert.equal(ASTERIX_UDP_DEFAULT, 8600);
  assert.equal(asterixUdpListenPort({}), 8600);
  assert.equal(asterixUdpListenPort({ ASTERIX_UDP_PORT: "" }), 8600);
});

test("ASTERIX_UDP_PORT=0 disables leftover UDP", () => {
  assert.equal(asterixUdpListenPort({ ASTERIX_UDP_PORT: "0" }), 0);
  assert.equal(asterixUdpListenPort({ ASTERIX_UDP_PORT: "off" }), 0);
});

test("explicit leftover CAT 048 UDP port wins", () => {
  assert.equal(asterixUdpListenPort({ ASTERIX_UDP_PORT: "4860" }), 4860);
});
