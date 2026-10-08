import { createConnection, createServer } from "node:net";

const AIS = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ#####_###############0123456789######";
const CPR = 131072;
const NZ = 15;

export const SDR_STATIONS = {
  puconci: {
    id: "puconci",
    name: "Puconci SDR (Prekmurje)",
    lat: 46.7042,
    lon: 16.1601,
    altM: 220,
    sac: 250,
    sic: 43,
    freqMhz: 1090,
    antenna: "1090 MHz Collinear Omni 5.5 dBi",
    role: "sdr-receiver",
    rpm: 15,
  },
  dolina43: {
    id: "dolina43",
    name: "Dolina 43 SDR (Lendava)",
    lat: 46.5412,
    lon: 16.5024,
    altM: 165,
    sac: 250,
    sic: 44,
    freqMhz: 1090,
    antenna: "1090 MHz Sector Array 8 dBi",
    role: "sdr-receiver",
    rpm: 15,
  },
  ljms: {
    id: "ljms",
    name: "LJMS Murska Sobota Radar Head",
    lat: 46.6590,
    lon: 16.1720,
    altM: 184,
    sac: 250,
    sic: 21,
    freqMhz: 1090,
    antenna: "Monopulse SSR / PSR Array",
    role: "radar-head",
    rpm: 15,
  },
};

export function calcPolarAndCartesian(origin, lat, lon) {
  if (!origin || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { rhoNm: 0, thetaDeg: 0, cartX: 0, cartY: 0 };
  }
  const φ1 = (origin.lat * Math.PI) / 180;
  const φ2 = (lat * Math.PI) / 180;
  const Δφ = φ2 - φ1;
  const Δλ = ((lon - origin.lon) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const distM = 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
  const rhoNm = distM / 1852;
  const yVal = Math.sin(Δλ) * Math.cos(φ2);
  const xVal = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let thetaDeg = (Math.atan2(yVal, xVal) * 180) / Math.PI;
  if (thetaDeg < 0) thetaDeg += 360;
  const rad = (thetaDeg * Math.PI) / 180;
  const cartX = rhoNm * Math.sin(rad);
  const cartY = rhoNm * Math.cos(rad);
  return {
    rhoNm: Math.round(rhoNm * 256) / 256,
    thetaDeg: Math.round(thetaDeg * 100) / 100,
    cartX: Math.round(cartX * 128) / 128,
    cartY: Math.round(cartY * 128) / 128,
  };
}

export function createSdrFeed(sdrTracks, onChange) {
  const cpr = new Map();
  const status = {
    tcpHost: process.env.SDR_TCP_HOST || "",
    tcpPort: Number(process.env.SDR_PUBLIC_PORT || process.env.SDR_TCP_PORT || 50001),
    listenPort: Number(process.env.SDR_LISTEN_PORT || 50001),
    clients: 0,
    bytes: 0,
    frames: 0,
    lastAt: 0,
    lastErr: "",
    stations: {
      puconci: { frames: 0, bytes: 0, lastAt: 0 },
      dolina43: { frames: 0, bytes: 0, lastAt: 0 },
      ljms: { frames: 0, bytes: 0, lastAt: 0 },
    },
  };

  function bump() {
    onChange?.();
  }

  function upsert(hex, patch, stationId = "puconci") {
    const id = String(hex || "")
      .toLowerCase()
      .replace(/^~/, "")
      .replace(/[^0-9a-f]/g, "");
    if (!id || id.length < 4) return false;
    const stn = SDR_STATIONS[stationId] || SDR_STATIONS.puconci;
    const prev = sdrTracks.get(id) || { hex: id, type: "sdr" };
    const next = {
      ...prev,
      ...patch,
      hex: id,
      type: "sdr",
      at: Date.now(),
      stationId: stn.id,
      stationName: stn.name,
      sac: stn.sac,
      sic: stn.sic,
    };
    if (patch.flight) next.flight = String(patch.flight).trim();
    const finalLat = patch.lat ?? prev.lat;
    const finalLon = patch.lon ?? prev.lon;
    if (Number.isFinite(finalLat) && Number.isFinite(finalLon) && finalLat && finalLon) {
      const pol = calcPolarAndCartesian(stn, finalLat, finalLon);
      next.rhoNm = pol.rhoNm;
      next.thetaDeg = pol.thetaDeg;
      next.cartX = pol.cartX;
      next.cartY = pol.cartY;
    }
    sdrTracks.set(id, next);
    status.lastAt = Date.now();
    if (status.stations[stn.id]) {
      status.stations[stn.id].lastAt = Date.now();
      status.stations[stn.id].frames += 1;
    }
    return true;
  }

  function ingestSbsLine(line, stationId = "puconci") {
    const t = String(line || "").trim();
    if (!t.startsWith("MSG,")) return 0;
    const f = t.split(",");
    const hex = f[4] || "";
    const patch = {};
    const cs = (f[10] || "").trim();
    const alt = Number(f[11]);
    const gs = Number(f[12]);
    const trk = Number(f[13]);
    const lat = Number(f[14]);
    const lon = Number(f[15]);
    const sq = (f[17] || "").trim();
    if (cs && !/^@+$/.test(cs)) patch.flight = cs;
    if (Number.isFinite(alt)) patch.alt_geom = alt;
    if (Number.isFinite(gs)) patch.gs = gs;
    if (Number.isFinite(trk)) patch.track = trk;
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat && lon) {
      patch.lat = lat;
      patch.lon = lon;
    }
    if (sq) patch.squawk = sq;
    status.frames += 1;
    return upsert(hex, patch) ? 1 : 0;
  }

  function ingestAvrLine(line) {
    const m = String(line || "").match(/\*([0-9A-Fa-f]{14,28});?/);
    if (!m) return 0;
    return decodeModeS(Buffer.from(m[1], "hex")) ? 1 : 0;
  }

  function ingestText(raw) {
    let n = 0;
    let heard = 0;
    for (const line of String(raw || "").split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      heard += 1;
      if (t.startsWith("MSG,")) n += ingestSbsLine(t);
      else if (t.includes("*")) n += ingestAvrLine(t);
    }
    return { n, heard };
  }

  function ingestDump1090(body) {
    if (typeof body === "string") {
      const t = body.trim();
      if (t.startsWith("MSG,") || t.includes("\nMSG,") || t.startsWith("*")) return ingestText(t);
      try {
        body = JSON.parse(t);
      } catch {
        return { n: 0, heard: 0 };
      }
    }
    const ac = Array.isArray(body)
      ? body
      : body?.aircraft || body?.ac || body?.items || (body?.hex || body?.icao ? [body] : []);
    let n = 0;
    let heard = 0;
    for (const a of ac) {
      if (!a || typeof a !== "object") continue;
      heard += 1;
      const hex = String(a.hex || a.icao || a.icao24 || "");
      if (!hex) continue;
      const lat = Number(a.lat);
      const lon = Number(a.lon);
      const rawAlt = a.alt_geom ?? a.alt_baro ?? a.alt;
      const onGnd = rawAlt === "ground";
      const patch = {
        flight: a.flight,
        t: a.t || a.desc || "",
        r: a.r || a.rReg || "",
        squawk: a.squawk,
        category: a.category || (onGnd ? "C2" : undefined),
        rssi: a.rssi,
        gs: Number(a.gs || a.speed || 0) || 0,
        track: Number(a.track ?? a.true_heading ?? a.mag_heading ?? 0) || 0,
        alt_baro: onGnd ? "ground" : undefined,
      };
      if (onGnd) patch.alt_geom = 0;
      else if (Number.isFinite(Number(rawAlt))) patch.alt_geom = Number(rawAlt) || 0;
      if (Number.isFinite(lat) && Number.isFinite(lon) && lat && lon) {
        patch.lat = lat;
        patch.lon = lon;
      }
      if (upsert(hex, patch)) n += 1;
    }
    return { n, heard };
  }

  function decodeModeS(frame, rssi, stationId = "puconci") {
    if (!frame || frame.length < 7) return false;
    const df = frame[0] >> 3;
    const patch = {};
    if (rssi != null) patch.rssi = rssi;
    if (df === 11) {
      status.frames += 1;
      return upsert(frame.subarray(1, 4).toString("hex"), patch, stationId);
    }
    if (df !== 17 && df !== 18) return false;
    const hex = frame.subarray(1, 4).toString("hex");
    const me = frame.subarray(4, 11);
    if (me.length < 7) return false;
    const tc = me[0] >> 3;
    if (tc >= 1 && tc <= 4) {
      const cs = decodeCallsign(me);
      if (cs) patch.flight = cs;
    } else if (tc >= 9 && tc <= 18) {
      const alt = decodeAc12(me);
      if (alt != null) patch.alt_geom = alt;
      const pos = decodeCpr(hex, me);
      if (pos) {
        patch.lat = pos.lat;
        patch.lon = pos.lon;
      }
    } else if (tc === 19) {
      const vel = decodeVelocity(me);
      if (vel) {
        patch.gs = vel.gs;
        patch.track = vel.track;
      }
    }
    status.frames += 1;
    if (!Object.keys(patch).length) return false;
    return upsert(hex, patch, stationId);
  }

  function decodeCallsign(me) {
    const chars = [
      (me[1] >> 2) & 63,
      ((me[1] & 3) << 4) | (me[2] >> 4),
      ((me[2] & 15) << 2) | (me[3] >> 6),
      me[3] & 63,
      (me[4] >> 2) & 63,
      ((me[4] & 3) << 4) | (me[5] >> 4),
      ((me[5] & 15) << 2) | (me[6] >> 6),
      me[6] & 63,
    ];
    const s = chars.map((c) => AIS[c] || " ").join("").replace(/[#_]/g, " ").trim();
    return s && !/^@+$/.test(s) ? s : "";
  }

  function decodeAc12(me) {
    const n = ((me[1] & 0xff) << 4) | (me[2] >> 4);
    if (!(n & 0x10)) return null;
    const nq = ((n & 0x0fe0) >> 1) | (n & 0x0f);
    return nq * 25 - 1000;
  }

  function decodeCpr(hex, me) {
    const odd = (me[2] >> 2) & 1;
    const latC = ((me[2] & 3) << 15) | (me[3] << 7) | (me[4] >> 1);
    const lonC = ((me[4] & 1) << 16) | (me[5] << 8) | me[6];
    const rec = cpr.get(hex) || {};
    if (odd) {
      rec.odd = { lat: latC, lon: lonC };
      rec.to = Date.now();
    } else {
      rec.even = { lat: latC, lon: lonC };
      rec.te = Date.now();
    }
    cpr.set(hex, rec);
    if (!rec.even || !rec.odd) return null;
    if (Math.abs((rec.te || 0) - (rec.to || 0)) > 12_000) return null;
    return globalCpr(rec.even, rec.odd, (rec.to || 0) >= (rec.te || 0));
  }

  function decodeVelocity(me) {
    const st = me[0] & 7;
    if (st !== 1 && st !== 2) return null;
    const ewD = (me[1] >> 2) & 1;
    const ew = ((me[1] & 3) << 8) | me[2];
    const nsD = (me[3] >> 7) & 1;
    const ns = ((me[3] & 0x7f) << 3) | (me[4] >> 5);
    if (ew === 0 || ns === 0) return null;
    let vew = ew - 1;
    let vns = ns - 1;
    if (ewD) vew = -vew;
    if (nsD) vns = -vns;
    if (st === 2) {
      vew *= 4;
      vns *= 4;
    }
    const gs = Math.hypot(vew, vns);
    let track = (Math.atan2(vew, vns) * 180) / Math.PI;
    if (track < 0) track += 360;
    return { gs: Math.round(gs), track: Math.round(track) };
  }

  function consumeBeast(buf, stationId = "puconci") {
    let i = 0;
    while (i < buf.length) {
      const start = buf.indexOf(0x1a, i);
      if (start < 0) return Buffer.alloc(0);
      if (start + 2 > buf.length) return buf.subarray(start);
      const type = buf[start + 1];
      const payload = type === 0x31 ? 7 : type === 0x32 || type === 0x33 ? 14 : 0;
      if (!payload) {
        i = start + 1;
        continue;
      }
      const raw = [];
      let j = start + 2;
      let incomplete = false;
      while (raw.length < 7 + payload) {
        if (j >= buf.length) {
          incomplete = true;
          break;
        }
        if (buf[j] === 0x1a) {
          if (j + 1 >= buf.length) {
            incomplete = true;
            break;
          }
          if (buf[j + 1] === 0x1a) {
            raw.push(0x1a);
            j += 2;
            continue;
          }
          break;
        }
        raw.push(buf[j]);
        j += 1;
      }
      if (incomplete) return buf.subarray(start);
      if (raw.length < 7 + payload) {
        i = start + 1;
        continue;
      }
      const rssi = raw[6];
      const frame = Buffer.from(raw.slice(7, 7 + payload));
      decodeModeS(frame, rssi, stationId);
      i = j;
    }
    return Buffer.alloc(0);
  }

  function attach(sock, stationId = "puconci") {
    status.clients += 1;
    let bin = Buffer.alloc(0);
    let ascii = "";
    sock.setTimeout(180_000);
    sock.on("data", (chunk) => {
      status.bytes += chunk.length;
      if (status.stations[stationId]) status.stations[stationId].bytes += chunk.length;
      const looksText = !bin.length && (chunk.includes(0x4d) || chunk[0] === 0x2a || chunk[0] === 0x3a);
      const looksBeast = chunk.includes(0x1a) || bin.length;
      if (looksBeast) {
        bin = Buffer.concat([bin, chunk]);
        bin = consumeBeast(bin, stationId);
      }
      if (looksText || ascii) {
        ascii += chunk.toString("utf8");
        if (ascii.length > 1_000_000) ascii = ascii.slice(-200_000);
        const parts = ascii.split(/\r?\n/);
        ascii = parts.pop() || "";
        for (const line of parts) {
          ingestSbsLine(line, stationId);
          ingestAvrLine(line, stationId);
        }
      }
      bump();
    });
    const done = () => {
      status.clients = Math.max(0, status.clients - 1);
    };
    sock.on("close", done);
    sock.on("error", (e) => {
      status.lastErr = String(e.message || e);
      done();
    });
  }

  function listen(port = status.listenPort, stationId = "puconci") {
    status.listenPort = port;
    const srv = createServer((sock) => attach(sock, stationId));
    srv.on("error", (e) => {
      status.lastErr = String(e.message || e);
      console.error("sdr tcp", e.message || e);
    });
    srv.listen(port, "0.0.0.0", () => {
      console.log(`sdr feeder tcp on 0.0.0.0:${port} [${stationId}] (Beast / SBS-1 / AVR)`);
    });
    return srv;
  }

  function setPublic(host, port) {
    if (host) status.tcpHost = host;
    if (port) status.tcpPort = Number(port);
  }

  function ingestBeast(buf, stationId = "puconci") {
    const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
    if (!raw.length) return { n: 0, heard: 0, beast: true };
    const before = sdrTracks.size;
    consumeBeast(raw, stationId);
    return { n: Math.max(0, sdrTracks.size - before), heard: status.frames, beast: true, live: sdrTracks.size };
  }

  function ingestStationBeast(stationId, buf) {
    return ingestBeast(buf, stationId);
  }

  function ingestRaw(buf, ctype = "", stationId = "puconci") {
    const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
    if (!raw.length) return { n: 0, heard: 0 };
    if (/octet-stream|x-beast|x-binary/i.test(ctype) || raw.includes(0x1a)) return ingestBeast(raw, stationId);
    const text = raw.toString("utf8");
    const trim = text.trim();
    if (trim.startsWith("{") || trim.startsWith("[")) {
      try {
        return ingestDump1090(JSON.parse(trim), stationId);
      } catch {
        /* fall through */
      }
    }
    if (trim.startsWith("MSG,") || trim.includes("*") || /^\s*@/.test(trim)) return ingestText(text, stationId);
    const hex = trim.replace(/[^0-9a-fA-F]/g, "");
    if (hex.length >= 14 && hex.length % 2 === 0) {
      let n = 0;
      for (let i = 0; i + 14 <= hex.length; ) {
        const take = hex.length - i >= 28 ? 28 : 14;
        if (decodeModeS(Buffer.from(hex.slice(i, i + take), "hex"), null, stationId)) n += 1;
        i += take;
      }
      return { n, heard: status.frames, hex: true, live: sdrTracks.size };
    }
    return ingestText(text, stationId);
  }

  function ingestStationRaw(stationId, buf, ctype = "") {
    return ingestRaw(buf, ctype, stationId);
  }

  function connect(host, port = 30005, stationId = "puconci") {
    if (!host) return null;
    const dest = Number(port) || 30005;
    const sock = createConnection({ host, port: dest });
    sock.setNoDelay(true);
    sock.on("error", (e) => {
      status.lastErr = String(e.message || e);
    });
    sock.on("connect", () => {
      status.tcpHost = host;
      status.tcpPort = dest;
    });
    attach(sock, stationId);
    return sock;
  }

  return {
    ingestDump1090,
    ingestText,
    ingestSbsLine,
    ingestBeast,
    ingestStationBeast,
    ingestRaw,
    ingestStationRaw,
    consumeBeast,
    decodeModeS,
    listen,
    connect,
    setPublic,
    status,
    upsert,
    SDR_STATIONS,
    calcPolarAndCartesian,
  };
}

function cprNL(lat) {
  const a = Math.abs(lat);
  const cuts = [
    [10.4704713, 59],
    [14.82817437, 58],
    [18.18626357, 57],
    [21.02939493, 56],
    [23.54504487, 55],
    [25.82924707, 54],
    [27.9389871, 53],
    [29.91135686, 52],
    [31.77209708, 51],
    [33.53993436, 50],
    [35.22899598, 49],
    [36.85025108, 48],
    [38.41241892, 47],
    [39.92256684, 46],
    [41.38651832, 45],
    [42.80914012, 44],
    [44.19454951, 43],
    [45.54626723, 42],
    [46.86733252, 41],
    [48.16039128, 40],
    [49.42776439, 39],
    [50.67150166, 38],
    [51.89342469, 37],
    [53.09516153, 36],
    [54.27817472, 35],
    [55.44378444, 34],
    [56.59318756, 33],
    [57.72747354, 32],
    [58.84766797, 31],
    [59.95459277, 30],
    [61.04905374, 29],
    [62.13199922, 28],
    [63.20427479, 27],
    [64.26683741, 26],
    [65.32073728, 25],
    [66.36701396, 24],
    [67.40661893, 23],
    [68.44039951, 22],
    [69.46916683, 21],
    [70.49371068, 20],
    [71.51486469, 19],
    [72.53344187, 18],
    [73.55026686, 17],
    [74.56616024, 16],
    [75.58196033, 15],
    [76.59852921, 14],
    [77.61683735, 13],
    [78.63793461, 12],
    [79.66297583, 11],
    [80.69326903, 10],
    [81.73018215, 9],
    [82.7758065, 8],
    [83.8338048, 7],
    [84.89166191, 6],
    [85.94152732, 5],
    [86.96799517, 4],
    [87.95481837, 3],
    [88.80901197, 2],
    [89.5, 1],
  ];
  for (const [cut, n] of cuts) if (a < cut) return n;
  return 1;
}

function cprMod(x, y) {
  return ((x % y) + y) % y;
}

function globalCpr(even, odd, recentOdd) {
  const lat0 = even.lat / CPR;
  const lat1 = odd.lat / CPR;
  const lon0 = even.lon / CPR;
  const lon1 = odd.lon / CPR;
  const j = Math.floor(59 * lat0 - 60 * lat1 + 0.5);
  let latEven = (360 / (4 * NZ)) * (cprMod(j, 60) + lat0);
  let latOdd = (360 / (4 * NZ - 1)) * (cprMod(j, 59) + lat1);
  if (latEven >= 270) latEven -= 360;
  if (latOdd >= 270) latOdd -= 360;
  const lat = recentOdd ? latOdd : latEven;
  if (Math.abs(latEven - latOdd) > 0.5) return null;
  if (cprNL(latEven) !== cprNL(latOdd)) return null;
  const nl = cprNL(lat);
  const ni = Math.max(recentOdd ? nl - 1 : nl, 1);
  const m = Math.floor(lon0 * (nl - 1) - lon1 * nl + 0.5);
  const lonC = recentOdd ? lon1 : lon0;
  let lon = (360 / ni) * (cprMod(m, ni) + lonC);
  if (lon > 180) lon -= 360;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
