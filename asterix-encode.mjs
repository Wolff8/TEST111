/** On-demand export of live positions as ASTERIX CAT 025/063/065 + 048 + 062.
 * Positions stay the real feeder coordinates. CAT 048 I040 is that same WGS-84
 * point in polar form from the declared site (default LJLJ). Not a PSR datagram.
 * The pack is not re-ingested onto the map. */

import { encodeIcao6, parseAsterixBuffer } from "./asterix-parse.mjs";

const WGS23 = 180 / 2 ** 23;
const WGS25 = 180 / 2 ** 25;
const WGS32 = 180 / 2 ** 32;
const DEG16 = 360 / 2 ** 16;
const NM_M = 1852;
const EARTH_RADAR_M = (4 / 3) * 6371008.8;
const MS_TO_KT = 1.94384449244;

export const TRANSCODE_SITE = { sac: 0, sic: 21, designator: "LIVEADSB" };
export const DEFAULT_RADAR = { lat: 46.2236, lon: 14.4576, theta0: 0 };

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function putI24(n) {
  let v = Math.round(n);
  if (v < 0) v += 0x1000000;
  return Buffer.from([(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
}

function putU16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(clamp(Math.round(n), 0, 65535));
  return b;
}

function putI16(n) {
  const b = Buffer.alloc(2);
  b.writeInt16BE(clamp(Math.round(n), -32768, 32767));
  return b;
}

function putI32(n) {
  const b = Buffer.alloc(4);
  b.writeInt32BE(Math.round(n));
  return b;
}

function todNow() {
  const d = new Date();
  const sec = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
  return Math.round(sec * 128) % (86400 * 128);
}

function writeFspec(frns) {
  const max = Math.max(0, ...frns);
  const octets = Math.max(1, Math.ceil(max / 7));
  const buf = Buffer.alloc(octets);
  for (const n of frns) {
    if (n < 1) continue;
    const oct = Math.floor((n - 1) / 7);
    const bit = 7 - ((n - 1) % 7);
    buf[oct] |= 1 << bit;
  }
  for (let i = 0; i < octets - 1; i += 1) buf[i] |= 1;
  return buf;
}

function block(cat, payload) {
  const len = 3 + payload.length;
  return Buffer.concat([Buffer.from([cat, (len >> 8) & 0xff, len & 0xff]), payload]);
}

function icaoBuf(hex) {
  const s = String(hex || "").replace(/[^0-9a-f]/gi, "").slice(-6).padStart(6, "0");
  return Buffer.from(s, "hex");
}

function call6(p) {
  const s = String(p.flight || p.call || p.reg || "")
    .replace(/NO CALL/i, "")
    .replace(/\s+/g, "")
    .slice(0, 8);
  return encodeIcao6(s || "????????");
}

function flRaw(altFt) {
  const fl = (Number(altFt) || 0) / 100;
  return clamp(Math.round(fl * 4), -8191, 8191);
}

function modeA(p) {
  const s = String(p.squawk || p.modeA || "").replace(/\D/g, "");
  if (!s) return 0;
  return parseInt(s, 8) & 0x0fff;
}

export function polarFromWgs(origin, lat, lon) {
  const φ1 = (origin.lat * Math.PI) / 180;
  const φ2 = (lat * Math.PI) / 180;
  const Δφ = φ2 - φ1;
  const Δλ = ((lon - origin.lon) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const distM = 2 * EARTH_RADAR_M * Math.asin(Math.min(1, Math.sqrt(a)));
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let θ = (Math.atan2(y, x) * 180) / Math.PI;
  θ -= origin.theta0 || 0;
  if (θ < 0) θ += 360;
  return { rhoNm: distM / NM_M, thetaDeg: θ };
}

/** CAT 021 ADS-B & FLARM Target Report (Eurocontrol ASTERIX Spec v2.4) */
export function encodeCat021(p, site = TRANSCODE_SITE) {
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const icao = icaoBuf(p.icao || p.id || p.hex);
  const altFt = Number(p.altFt ?? p.alt) || 0;
  const fl = clamp(Math.round((altFt / 100) * 4), -8191, 8191);
  const gs = Math.max(0, Number(p.speedKnots ?? p.gs ?? p.speed) || 0);
  const trk = ((Number(p.track) || 0) + 360) % 360;

  const payload = Buffer.concat([
    writeFspec([1, 2, 3, 4, 7, 8, 11, 16]),
    Buffer.from([site.sac & 0xff, site.sic & 0xff]), // I021/010 Data Source ID
    Buffer.from([p.isFlarm ? 0x48 : 0x20]), // I021/040 Target Report Descriptor (FLARM / 1090)
    putI24(todNow()).subarray(0, 3), // I021/073 Time of Day
    Buffer.concat([putI24(lat / WGS23), putI24(lon / WGS23)]), // I021/130 WGS-84 Position
    putI16(fl), // I021/140 Geometric Altitude / Flight Level
    icao.length === 3 ? icao : Buffer.from([0, 0, 0]), // I021/080 Target Address
    call6(p), // I021/170 Target Identification (Callsign)
    Buffer.concat([putU16(gs * 2 ** 14 / 3600), putU16(trk / DEG16)]), // I021/200 Ground Speed & Track Angle
  ]);
  return block(21, payload);
}

export function encodeCat048(p, origin, site = { sac: 0, sic: 48 }) {
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const pol = polarFromWgs(origin, lat, lon);
  if (pol.rhoNm >= 256) return null;
  const gs = Math.max(0, Number(p.gs) || 0);
  const trk = ((Number(p.track) || 0) + 360) % 360;
  const payload = Buffer.concat([
    writeFspec([1, 2, 4, 6, 8, 9, 13]),
    Buffer.from([site.sac & 0xff, site.sic & 0xff]),
    putI24(todNow()).subarray(0, 3),
    putU16(pol.rhoNm * 256),
    putU16(pol.thetaDeg / DEG16),
    putU16(flRaw(p.altFt ?? p.alt) & 0x3fff),
    icaoBuf(p.icao || p.id || p.hex),
    call6(p),
    Buffer.concat([putU16((gs / 3600) * 2 ** 14), putU16(trk / DEG16)]),
  ]);
  return block(48, payload);
}

/** CAT 048 primary-only: I020 TYP=single PSR, no I220 address, no callsign.
 * SAC/SIC must not be the LIVEADSB transcode pair (0/21·48·62). */
export const PSR_SITES = {
  arso: { sac: 0, sic: 1, designator: "ARSOPSR" },
  fvg: { sac: 0, sic: 2, designator: "FVGVMI" },
  feeder: { sac: 0, sic: 3, designator: "FEEDPSR" },
  vogel: { sac: 0, sic: 6, designator: "BIRDTAM" },
};
export const PSR_SITE = PSR_SITES.arso;

export function isLeftoverPsrSite(sac, sic) {
  const a = Number(sac);
  const i = Number(sic);
  return a === 0 && (i === 1 || i === 2 || i === 3 || i === 6);
}

export function encodeCat048Primary(p, origin, site = PSR_SITE) {
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const pol = polarFromWgs(origin, lat, lon);
  if (pol.rhoNm >= 256) return null;
  const gs = Math.max(0, Number(p.gs) || 0);
  const trk = ((Number(p.track) || 0) + 360) % 360;
  const payload = Buffer.concat([
    writeFspec([1, 2, 3, 4, 6, 13]),
    Buffer.from([site.sac & 0xff, site.sic & 0xff]),
    putI24(todNow()).subarray(0, 3),
    Buffer.from([0x20]),
    putU16(pol.rhoNm * 256),
    putU16(pol.thetaDeg / DEG16),
    putU16(flRaw(p.altFt ?? p.alt) & 0x3fff),
    Buffer.concat([putU16((gs / 3600) * 2 ** 14), putU16(trk / DEG16)]),
  ]);
  return block(48, payload);
}

export function encodeEchoesCat048(echoes, origin, site = PSR_SITE) {
  const chunks = [];
  for (const e of echoes || []) {
    const b = encodeCat048Primary(
      {
        lat: e.lat,
        lon: e.lon,
        altFt: e.alt_geom ?? e.altFt ?? e.alt,
        gs: e.gs,
        track: e.track,
      },
      origin,
      site,
    );
    if (b) chunks.push(b);
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

export function encodeCat062(p, site = { sac: 0, sic: 62 }) {
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const gs = Math.max(0, Number(p.gs) || 0);
  const trk = (((Number(p.track) || 0) + 360) % 360) * (Math.PI / 180);
  const ms = gs / MS_TO_KT;
  const vx = ms * Math.sin(trk);
  const vy = ms * Math.cos(trk);
  const sti = Buffer.from([0]);
  const icao = icaoBuf(p.icao || p.id || p.hex);
  const payload = Buffer.concat([
    writeFspec([1, 3, 4, 5, 7, 9, 10, 11, 12, 17]),
    Buffer.from([site.sac & 0xff, site.sic & 0xff]),
    Buffer.from([1]),
    putI24(todNow()).subarray(0, 3),
    Buffer.concat([putI32(lat / WGS25), putI32(lon / WGS25)]),
    Buffer.concat([putI16(vx * 4), putI16(vy * 4)]),
    putU16(modeA(p)),
    Buffer.concat([sti, call6(p)]),
    Buffer.from([0xc0]),
    icao.length === 3 ? icao : Buffer.from([0, 0, 0]),
    call6(p),
    putU16(parseInt(String(p.icao || "1").replace(/[^0-9a-f]/gi, "").slice(-4), 16) || 1),
    putI16(flRaw(p.altFt ?? p.alt)),
  ]);
  return block(62, payload);
}

export function encodeCat063(origin, site = { sac: 0, sic: 63 }) {
  const payload = Buffer.concat([
    writeFspec([1, 2, 3, 4, 5]),
    Buffer.from([site.sac & 0xff, site.sic & 0xff]),
    Buffer.from([1]),
    putI24(todNow()).subarray(0, 3),
    Buffer.from([site.sac & 0xff, site.sic & 0xff]),
    Buffer.from([0x00]),
  ]);
  return block(63, payload);
}

export function encodeCat065(origin, site = { sac: 0, sic: 65 }) {
  const payload = Buffer.concat([
    writeFspec([1, 2, 3, 4, 6, 7]),
    Buffer.from([site.sac & 0xff, site.sic & 0xff]),
    Buffer.from([1]),
    Buffer.from([1]),
    putI24(todNow()).subarray(0, 3),
    Buffer.from([0x00]),
    Buffer.from([1]),
  ]);
  return block(65, payload);
}

export function encodeCat025(origin, site = TRANSCODE_SITE) {
  const payload = Buffer.concat([
    writeFspec([1, 2, 5, 6, 7, 12]),
    Buffer.from([site.sac & 0xff, site.sic & 0xff]),
    Buffer.from([2]),
    encodeIcao6(site.designator || "LIVEADSB"),
    putI24(todNow()).subarray(0, 3),
    Buffer.from([0x00]),
    Buffer.concat([putI32(origin.lat / WGS32), putI32(origin.lon / WGS32)]),
  ]);
  return block(25, payload);
}


/** CAT 010 Monoradar Surface Movement & Multilateration (Eurocontrol Spec v1.1)
 * Used for surface movement at airfields (LJMS, LJMB, LJLJ) and low-altitude non-GPS MLAT. */
export function encodeCat010(p, origin = DEFAULT_RADAR, site = { sac: 0, sic: 10 }) {
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const pol = polarFromWgs(origin, lat, lon);
  const distM = pol.rhoNm * 1852;
  const thetaRad = pol.thetaDeg * (Math.PI / 180);
  const cartX = Math.round(distM * Math.sin(thetaRad));
  const cartY = Math.round(distM * Math.cos(thetaRad));
  const icao = icaoBuf(p.icao || p.id || p.hex);
  const altFt = Number(p.altFt ?? p.alt) || 0;
  const isOnGround = altFt <= 200 || p.onGround;

  const payload = Buffer.concat([
    writeFspec([1, 2, 3, 4, 5, 9, 10, 14]),
    Buffer.from([site.sac & 0xff, site.sic & 0xff]), // I010/010 Data Source ID (Surface MLAT)
    Buffer.from([0x01]), // I010/000 Message Type: Target Report
    Buffer.from([isOnGround ? 0x82 : 0x02]), // I010/020 Target Report Descriptor (Multilateration + Ground bit)
    putI24(todNow()).subarray(0, 3), // I010/140 Time of Day
    Buffer.concat([putI16(clamp(cartX, -32768, 32767)), putI16(clamp(cartY, -32768, 32767))]), // I010/042 Cartesian Position
    putU16(modeA(p)), // I010/060 Mode 3/A
    putI16(flRaw(altFt)), // I010/090 Flight Level
    icao.length === 3 ? icao : Buffer.from([0, 0, 0]), // I010/220 Target Address
  ]);
  return block(10, payload);
}

function asPlane(p) {
  return {
    lat: Number(p.lat),
    lon: Number(p.lon),
    altFt: Number(p.altFt ?? p.alt ?? 0) || 0,
    gs: Number(p.gs) || 0,
    track: Number(p.track) || 0,
    flight: p.flight || p.call || "",
    icao: String(p.icao || p.id || p.hex || "").replace(/[^0-9a-f]/gi, ""),
    hex: p.hex || p.id,
    squawk: p.squawk,
    src: p.src,
    nm: p.nm,
  };
}

export function encodeLiveAsterix(planes, origin = DEFAULT_RADAR) {
  const site = TRANSCODE_SITE;
  const chunks = [
    encodeCat025(origin, site),
    encodeCat063(origin, { sac: site.sac, sic: 63 }),
    encodeCat065(origin, { sac: site.sac, sic: 65 }),
  ];
  let n021 = 0;
  let n048 = 0;
  let n062 = 0;
  for (const raw of planes || []) {
    if (raw.src === "asterix" || raw.src === "mode_s" || raw.role === "modes") continue;
    const p = asPlane(raw);
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !p.lat || !p.lon) continue;
    const b48 = encodeCat048(p, origin, { sac: site.sac, sic: 48 });
    if (b48) {
      chunks.push(b48);
      n048 += 1;
    }
    const b62 = encodeCat062(p, { sac: site.sac, sic: 62 });
    if (b62) {
      chunks.push(b62);
      n062 += 1;
    }
  }
  const buf = Buffer.concat(chunks.filter(Boolean));
  return {
    buf,
    n021,
    n048,
    n062,
    n063: 1,
    n065: 1,
    n025: 1,
    bytes: buf.length,
    origin,
    site,
    parsed: parseAsterixBuffer(buf).n,
  };
}
