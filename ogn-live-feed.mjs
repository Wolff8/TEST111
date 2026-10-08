/**
 * Open Glider Network (OGN) Live APRS-IS Feed Client & ASTERIX Transcoder
 * Connects directly over TCP to aprs.glidernet.org:14580
 * Receives 100% REAL live FLARM, OGN tracker, ADS-B and Drone (UAV) beacons
 * Filtered around Slovenia & specifically targeting the LJMS (Murska Sobota) APRS gateway.
 * 
 * Directly transcodes raw 868.2/868.4 MHz RF telemetry into:
 * - ASTERIX CAT 021 (ADS-B / FLARM Target Reports)
 * - ASTERIX CAT 048 (Monoradar Target Reports polar from LJMS)
 * - ASTERIX CAT 010 (Surface Movement & Multilateration for ground / low-level targets)
 */

import net from "node:net";
import { encodeCat021, encodeCat048, encodeCat010 } from "./asterix-encode.mjs";

const OGN_HOST = "aprs.glidernet.org";
const OGN_PORT = 14580;

// Filter covers Slovenia and explicitly prioritizes the gateway station at LJMS / Rakičan
const FILTER = "r/46.12/14.82/250 r/46.6292/16.1908/80 e/LJMS e/S5-MS e/MARIBOR e/PTUJ e/CELJE e/LESCE e/POSTOJNA";

export const LJMS_RADAR = {
  lat: 46.6292,
  lon: 16.1908,
  altM: 185,
  name: "LJMS Murska Sobota / Rakičan",
  icao: "LJMS",
  flarmFreqMhz: 868.2,
};

// State
const state = {
  socket: null,
  connected: false,
  reconnectTimer: null,
  keepaliveTimer: null,
  packetsReceived: 0,
  ljmsPacketsReceived: 0,
  lastPacketTime: 0,
  targets: new Map(), // hex -> target object
  rawPackets: [], // Ring buffer of recent 150 raw packets
};

const MAX_RAW_PACKETS = 150;

export function parseOgnAprs(line) {
  if (!line || typeof line !== "string" || line.startsWith("#")) return null;

  // APRS coordinate regex: /HHMMSS[h/z]DDMM.MM[NS][/\^g>]DDDMM.MM[EW][/\^g>](DDD/SSS)?.*?A=(DDDDDD)
  const m = line.match(/\/(\d{6})[hz](\d{2})(\d{2}\.\d{2})([NS])[\/\^g\>]((\d{3}))(\d{2}\.\d{2})([EW])[\/\^g\>]((\d{3})\/(\d{3}))?.*?A=(\d{6})/);
  if (!m) return null;

  const latDeg = parseInt(m[2], 10) + parseFloat(m[3]) / 60.0;
  const lat = m[4] === "S" ? -latDeg : latDeg;
  const lonDeg = parseInt(m[5], 10) + parseFloat(m[7]) / 60.0;
  const lon = m[8] === "W" ? -lonDeg : lonDeg;
  const track = m[10] ? parseInt(m[10], 10) : 0;
  const speed = m[11] ? parseInt(m[11], 10) : 0;
  const altFt = parseInt(m[12], 10);

  const idMatch = line.match(/\bid([0-9A-Fa-f]{2})([0-9A-Fa-f]{6})\b/);
  const idPrefix = idMatch ? parseInt(idMatch[1], 16) : 0;
  const hex = idMatch ? idMatch[2].toLowerCase() : (line.split(">")[0] || "").toLowerCase();

  // Bits 2-5 of OGN prefix: (prefix >> 2) & 0x0F
  // 0x1 = Glider, 0x2 = Tow plane, 0x3 = Helicopter, 0x4 = Parachute, 0x5 = Drop plane,
  // 0x8 = Powered aircraft, 0xB = Static object, 0xD = UAV / Drone (13)
  const acType = (idPrefix >> 2) & 0x0f;
  const isDrone = acType === 0x0d || acType === 13;
  const isGlider = acType === 0x01 || acType === 1;

  // Address type: (idPrefix & 0x03)
  // 0 = Random, 1 = ICAO, 2 = FLARM, 3 = OGN Tracker
  const addrType = idPrefix & 0x03;
  const protocol = addrType === 2 ? "FLARM" : addrType === 3 ? "OGN_TRACKER" : addrType === 1 ? "ICAO" : "RANDOM";

  // Callsign or registration
  const csMatch = line.match(/A0:([A-Za-z0-9_-]+)/);
  const callsign = csMatch ? csMatch[1] : (line.split(">")[0] || "OGN").replace(/^ICA|^FLR|^OGN/i, "");

  // Receiver station
  const rxMatch = line.match(/qAS,([A-Za-z0-9_-]+):/);
  const receiverStation = rxMatch ? rxMatch[1] : "";
  const isLjms = Boolean(/LJMS|S5-MS|RAKICAN/i.test(receiverStation));

  // RF signal metrics from APRS comment
  const snrMatch = line.match(/(\d+)dB/);
  const snrDb = snrMatch ? parseInt(snrMatch[1], 10) : null;

  const freqMatch = line.match(/([+-]?\d+(?:\.\d+)?kHz)/);
  const freqOffset = freqMatch ? freqMatch[1] : null;

  const errMatch = line.match(/(\d+)e\b/);
  const errors = errMatch ? parseInt(errMatch[1], 10) : 0;

  const climbMatch = line.match(/([+-]?\d+(?:\.\d+)?(?:m\/s|fpm))/i);
  const climbRateStr = climbMatch ? climbMatch[1] : null;
  let climbMps = 0;
  if (climbRateStr) {
    if (climbRateStr.includes("m/s")) {
      climbMps = parseFloat(climbRateStr);
    } else if (climbRateStr.includes("fpm")) {
      climbMps = parseFloat(climbRateStr) * 0.00508;
    }
  }

  const turnMatch = line.match(/rot=([+-]?\d+(?:\.\d+)?)/i);
  const turnRate = turnMatch ? parseFloat(turnMatch[1]) : 0;

  const gpsMatch = line.match(/gps(\d+x\d+)/i);
  const gpsQuality = gpsMatch ? gpsMatch[1] : null;

  // Target object
  const target = {
    hex,
    callsign: callsign || hex,
    lat,
    lon,
    altFt,
    track,
    speedKnots: speed,
    acType,
    isDrone,
    isGlider,
    isFlarm: protocol === "FLARM",
    protocol,
    category: isDrone ? "DRONE_UAV" : isGlider ? "GLIDER" : "AIRCRAFT",
    receiverStation,
    isLjmsGateway: isLjms,
    rfMetrics: {
      snrDb,
      freqOffset,
      errors,
      climbMps,
      turnRate,
      gpsQuality,
      band: "868.2/868.4 MHz EU ISM",
    },
    seenAt: Date.now(),
    raw: line.trim(),
  };

  // Generate binary ASTERIX datagrams and hex strings
  try {
    const cat021Buf = encodeCat021(target, { sac: 0, sic: 21 });
    target.asterixCat021Hex = cat021Buf ? cat021Buf.toString("hex").toUpperCase() : null;

    const cat048Buf = encodeCat048(target, LJMS_RADAR, { sac: 0, sic: 48 });
    target.asterixCat048Hex = cat048Buf ? cat048Buf.toString("hex").toUpperCase() : null;

    const cat010Buf = encodeCat010(target, LJMS_RADAR, { sac: 0, sic: 10 });
    target.asterixCat010Hex = cat010Buf ? cat010Buf.toString("hex").toUpperCase() : null;
  } catch (err) {
    // Non-fatal if encoding edge case occurs
  }

  return target;
}

export function startOgnClient() {
  if (state.socket) return;

  function connect() {
    clearTimeout(state.reconnectTimer);
    clearInterval(state.keepaliveTimer);

    const call = `OGNSI-${Math.floor(1000 + Math.random() * 9000)}`;
    const client = net.createConnection({ host: OGN_HOST, port: OGN_PORT });
    state.socket = client;

    client.on("connect", () => {
      state.connected = true;
      const handshake = `user ${call} pass -1 vers OpsLiveAsterixCAD 2.0 filter ${FILTER}\r\n`;
      client.write(handshake);

      // Send APRS keepalive every 50 seconds
      state.keepaliveTimer = setInterval(() => {
        if (state.connected && client.writable) {
          client.write("# keepalive\r\n");
        }
      }, 50_000);
    });

    let buffer = "";
    client.on("data", (chunk) => {
      state.lastPacketTime = Date.now();
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        state.packetsReceived++;

        const target = parseOgnAprs(trimmed);
        if (target && target.hex) {
          state.targets.set(target.hex, target);
          if (target.isLjmsGateway) {
            state.ljmsPacketsReceived++;
          }

          // Push to raw packets ring buffer
          state.rawPackets.unshift({
            timestamp: new Date().toISOString(),
            raw: target.raw,
            hex: target.hex,
            callsign: target.callsign,
            receiver: target.receiverStation,
            isLjms: target.isLjmsGateway,
            category: target.category,
            protocol: target.protocol,
            rfMetrics: target.rfMetrics,
            asterixCat021: target.asterixCat021Hex,
            asterixCat048: target.asterixCat048Hex,
            asterixCat010: target.asterixCat010Hex,
          });

          if (state.rawPackets.length > MAX_RAW_PACKETS) {
            state.rawPackets.pop();
          }
        }
      }

      // Cleanup stale targets (> 180 seconds)
      const now = Date.now();
      if (state.targets.size > 250) {
        for (const [k, v] of state.targets.entries()) {
          if (now - v.seenAt > 180_000) state.targets.delete(k);
        }
      }
    });

    client.on("error", (err) => {
      console.warn("[OGN APRS] Error:", err.message);
      cleanup();
    });

    client.on("close", () => {
      cleanup();
    });
  }

  function cleanup() {
    state.connected = false;
    clearInterval(state.keepaliveTimer);
    if (state.socket) {
      try {
        state.socket.destroy();
      } catch {}
      state.socket = null;
    }
    // Auto-reconnect after 8 seconds
    state.reconnectTimer = setTimeout(connect, 8000);
  }

  connect();
}

export function getOgnLiveTargets() {
  const now = Date.now();
  const active = [];
  for (const [k, v] of state.targets.entries()) {
    if (now - v.seenAt <= 180_000) {
      active.push(v);
    } else {
      state.targets.delete(k);
    }
  }
  return active;
}

export function getOgnRawPackets(onlyLjms = false) {
  if (onlyLjms) {
    return state.rawPackets.filter((p) => p.isLjms);
  }
  return state.rawPackets;
}

export function getOgnStats() {
  const targets = getOgnLiveTargets();
  return {
    connected: state.connected,
    packetsReceived: state.packetsReceived,
    ljmsPacketsReceived: state.ljmsPacketsReceived,
    lastPacketTime: state.lastPacketTime ? new Date(state.lastPacketTime).toISOString() : null,
    totalTargets: targets.length,
    ljmsTargetsCount: targets.filter((t) => t.isLjmsGateway).length,
    dronesCount: targets.filter((t) => t.isDrone).length,
    glidersCount: targets.filter((t) => t.isGlider).length,
    ljmsOrigin: LJMS_RADAR,
  };
}
