import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageTileUrl, framesFromMaps, radarTileUrl } from "./rainviewer-feed.mjs";

test("radarTileUrl follows the official {host}{path}/size/z/x/y/color/options.png form", () => {
  const url = radarTileUrl("https://tilecache.rainviewer.com", "/v2/radar/1609401600");
  assert.equal(url, "https://tilecache.rainviewer.com/v2/radar/1609401600/256/{z}/{x}/{y}/2/1_1.png");
});

test("framesFromMaps keeps past then nowcast and names the latest now", () => {
  const board = framesFromMaps({
    version: "2.0",
    generated: 1609402525,
    host: "https://tilecache.rainviewer.com/",
    radar: {
      past: [
        { time: 1609401600, path: "/v2/radar/aaa" },
        { time: 1609402200, path: "/v2/radar/bbb" },
      ],
      nowcast: [{ time: 1609402800, path: "/v2/radar/ccc" }],
    },
  });
  assert.equal(board.n, 3);
  assert.equal(board.now.path, "/v2/radar/ccc");
  assert.equal(board.now.nowcast, true);
  assert.match(board.now.tiles, /\/v2\/radar\/ccc\/256\/\{z\}\/\{x\}\/\{y\}\/2\/1_1\.png$/);
  assert.equal(coverageTileUrl(board.host), "https://tilecache.rainviewer.com/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png");
});
