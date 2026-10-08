import { test } from 'node:test';
import assert from 'node:assert';
import {
  fetchSloveniaNotams,
  fetchAviationWeather,
  fetchRainViewerRadar,
  fetchTatGlobeCentralEurope,
} from './aviation-live-feed.mjs';

test('fetchSloveniaNotams returns live official KZPS NOTAMs', async () => {
  const data = await fetchSloveniaNotams();
  assert.ok(data);
  assert.ok(data.totalCount > 0, 'Should have real NOTAMs');
  assert.ok(data.notams.length > 0);
  assert.strictEqual(typeof data.notams[0].number, 'string');
  assert.strictEqual(typeof data.notams[0].text, 'string');
  console.log(`[TEST NOTAM] Total: ${data.totalCount}, Series A: ${data.seriesA}, Series B (Military): ${data.seriesB}`);
});

test('fetchAviationWeather returns live METAR and TAF for Slovenian airports', async () => {
  const data = await fetchAviationWeather();
  assert.ok(data);
  assert.ok(data.stations.length >= 8);
  const ljlj = data.stations.find((s) => s.icao === 'LJLJ');
  assert.ok(ljlj, 'Should include Ljubljana (LJLJ)');
  assert.ok(ljlj.metar, 'Should have METAR for LJLJ');
  assert.strictEqual(typeof ljlj.metar.raw, 'string');
  console.log(`[TEST METAR] LJLJ: ${ljlj.metar.raw}, Temp: ${ljlj.metar.tempC}°C, QNH: ${ljlj.metar.altimHpa} hPa`);
});

test('fetchRainViewerRadar returns live radar frames', async () => {
  const data = await fetchRainViewerRadar();
  assert.ok(data);
  assert.ok(data.host);
  assert.ok(data.tileUrlTemplate, 'Should have valid tile URL template');
  console.log(`[TEST RADAR] Tile template: ${data.tileUrlTemplate}`);
});

test('fetchTatGlobeCentralEurope returns real live aircraft over region', async () => {
  const data = await fetchTatGlobeCentralEurope();
  assert.ok(Array.isArray(data));
  console.log(`[TEST TAT] Live flights in Central Europe / Slovenia theater: ${data.length}`);
  if (data.length > 0) {
    console.log(`[TEST TAT Sample] ${data[0].flight} (${data[0].hex}), alt: ${data[0].alt_baro} ft, pos: ${data[0].lat}, ${data[0].lon}`);
  }
});
