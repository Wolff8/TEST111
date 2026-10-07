/** Raw EUROCONTROL ASTERIX block parser.
 * CAT 001 legacy mono, 021 ADS-B, 025/034/063/065 status, 048 monoradar (ed 1.32),
 * 062 SDPS tracks (ed 1.20 UAP including compound 380/290/295/390/110/500/340).
 * CAT 064 and 068 are SAC country allocations (Germany MIL / Portugal), not categories.
 * CAT 240 skipped. Field sizes from public asterix-specs AST, not copied PDF bodies.
 * Does not join multicast. Unicast leftover CAT 048 UDP defaults to 8600 (ASTERIX_UDP_PORT=0 disables). */

const WGS23 = 180 / 2 ** 23;
const WGS25 = 180 / 2 ** 25;
const WGS30 = 180 / 2 ** 30;
const WGS32 = 180 / 2 ** 32;
const NM256 = 1 / 256;
const DEG16 = 360 / 2 ** 16;
const NM128 = 1 / 128;
const TOD128 = 1 / 128;
const NM_S_TO_KT = 3600;
const MS_TO_KT = 1.94384449244;

function u8(buf, i) {
  return buf[i];
}

function u16(buf, i) {
  return (buf[i] << 8) | buf[i + 1];
}

function i16(buf, i) {
  const v = u16(buf, i);
  return v & 0x8000 ? v - 0x10000 : v;
}

function u24(buf, i) {
  return (buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2];
}

function i24(buf, i) {
  const v = u24(buf, i);
  return v & 0x800000 ? v - 0x1000000 : v;
}

function i32(buf, i) {
  return buf.readInt32BE(i);
}

function signedBits(v, width) {
  const sign = 1 << (width - 1);
  const mask = (1 << width) - 1;
  v &= mask;
  return v & sign ? v - (1 << width) : v;
}

function tod(buf, i) {
  return u24(buf, i) * TOD128;
}

function readFspec(buf, i) {
  const bytes = [];
  let p = i;
  for (;;) {
    if (p >= buf.length) throw new Error("truncated FSPEC");
    const b = buf[p++];
    bytes.push(b);
    if ((b & 1) === 0) break;
    if (bytes.length > 8) throw new Error("FSPEC too long");
  }
  const frn = [];
  let n = 1;
  for (const b of bytes) {
    for (let bit = 7; bit >= 1; bit -= 1) {
      if (b & (1 << bit)) frn.push(n);
      n += 1;
    }
  }
  return { frn, size: bytes.length, bytes };
}

function skipFx(buf, i) {
  let p = i;
  for (;;) {
    if (p >= buf.length) throw new Error("truncated FX item");
    const b = buf[p++];
    if ((b & 1) === 0) return p;
  }
}

function skipRep(buf, i, recBytes) {
  if (i >= buf.length) throw new Error("truncated REP");
  const n = buf[i];
  return i + 1 + n * recBytes;
}

function skipSp(buf, i) {
  if (i >= buf.length) throw new Error("truncated SP");
  const len = buf[i];
  if (len < 1) throw new Error("bad SP length");
  return i + len;
}

function skipRe(buf, i) {
  if (i >= buf.length) throw new Error("truncated RE");
  const len = buf[i];
  if (len < 1) throw new Error("bad RE length");
  return i + len;
}

function icao6(buf, i) {
  const full =
    (BigInt(buf[i]) << 40n) |
    (BigInt(buf[i + 1]) << 32n) |
    (BigInt(buf[i + 2]) << 24n) |
    (BigInt(buf[i + 3]) << 16n) |
    (BigInt(buf[i + 4]) << 8n) |
    BigInt(buf[i + 5]);
  const alphabet = " ABCDEFGHIJKLMNOPQRSTUVWXYZ                     0123456789      ";
  let s = "";
  for (let c = 0; c < 8; c += 1) {
    const v = Number((full >> BigInt(42 - c * 6)) & 0x3fn);
    s += alphabet[v] || " ";
  }
  return s.replace(/ +/g, " ").trim();
}

const SSTAT = ["running", "failed", "degraded", "undefined"];
const OPS = ["operational", "standby", "maintenance", "reserved"];
const RTYP = { 1: "service-system", 2: "component", 3: "statistics" };

function decode100(buf, i) {
  const b = buf[i];
  return {
    nogo: Boolean(b & 0x80),
    ops: OPS[(b >> 5) & 3] || "reserved",
    sstat: SSTAT[(b >> 1) & 15] || "reserved",
    next: skipFx(buf, i),
  };
}

const N1 = { n: 1 };
const N2 = { n: 2 };
const N3 = { n: 3 };
const N4 = { n: 4 };
const N6 = { n: 6 };
const N7 = { n: 7 };
const N8 = { n: 8 };
const FX = { kind: "fx" };
const FX2 = { kind: "fx2" };
const ones = (n) => Array.from({ length: n }, () => N1);

/** I062/380 Aircraft Derived Data — asterix-specs CAT 062 ed 1.20. */
const I380 = [
  N3, N6, N2, N2, N2, N2, N2, FX, { kind: "rep", rec: 15 }, N2, FX2, N7,
  N2, N2, N2, N2, N2, N2, N1, N8, N1, N6, N2, N1, { kind: "rep", rec: 8 }, N2, N2, N2,
];
/** I062/290 — ADS age is 2 bytes; the rest are 1. */
const I290 = [N1, N1, N1, N1, N2, N1, N1, N1, N1, N1];
const I295 = ones(35);
const I390 = [N2, N7, N4, N1, N4, N1, N4, N4, N3, N2, N2, { kind: "rep", rec: 4 }, N6, N1, N7, N7, N2, N7];
const I110 = [N1, N4, N6, N2, N2, N1, N1];
const I500 = [N4, N2, N4, N1, N1, N2, N2, N1];
const I340 = [N2, N4, N2, N2, N2, N1];

/** FRNs from asterix-specs CAT 001 / 021 ed 2.4 / 025 ed 1.6 / 034 / 048 ed 1.32 / 062 ed 1.20 / 063 / 065. */
const UAP = {
  1: [
    { frn: 1, id: "010", n: 2 },
    { frn: 2, id: "020", kind: "fx" },
    { frn: 3, id: "040", n: 4 },
    { frn: 4, id: "070", n: 2 },
    { frn: 5, id: "090", n: 2 },
    { frn: 6, id: "130", kind: "fx" },
    { frn: 7, id: "141", n: 2 },
    { frn: 8, id: "050", n: 2 },
    { frn: 9, id: "120", n: 1 },
    { frn: 10, id: "131", n: 1 },
    { frn: 11, id: "080", n: 1 },
    { frn: 12, id: "100", n: 4 },
    { frn: 13, id: "060", n: 1 },
    { frn: 14, id: "030", kind: "fx" },
    { frn: 15, id: "150", n: 1 },
  ],
  34: [
    { frn: 1, id: "010", n: 2 },
    { frn: 2, id: "000", n: 1 },
    { frn: 3, id: "030", n: 3 },
    { frn: 4, id: "020", n: 1 },
    { frn: 5, id: "041", n: 2 },
    { frn: 6, id: "050", kind: "fx" },
    { frn: 7, id: "060", kind: "fx" },
    { frn: 8, id: "070", kind: "rep", rec: 2 },
    { frn: 9, id: "100", n: 8 },
    { frn: 10, id: "110", n: 1 },
    { frn: 11, id: "120", n: 8 },
    { frn: 12, id: "090", n: 2 },
    { frn: 13, id: "RE", kind: "re" },
    { frn: 14, id: "SP", kind: "sp" },
  ],
  21: [
    { frn: 1, id: "010", n: 2 },
    { frn: 2, id: "040", kind: "fx" },
    { frn: 3, id: "161", n: 2 },
    { frn: 4, id: "015", n: 1 },
    { frn: 5, id: "071", n: 3 },
    { frn: 6, id: "130", n: 6 },
    { frn: 7, id: "131", n: 8 },
    { frn: 8, id: "072", n: 3 },
    { frn: 9, id: "150", n: 2 },
    { frn: 10, id: "151", n: 2 },
    { frn: 11, id: "080", n: 3 },
    { frn: 12, id: "073", n: 3 },
    { frn: 13, id: "074", n: 4 },
    { frn: 14, id: "075", n: 3 },
    { frn: 15, id: "076", n: 4 },
    { frn: 16, id: "140", n: 2 },
    { frn: 17, id: "090", n: 2 },
    { frn: 18, id: "210", n: 1 },
    { frn: 19, id: "070", n: 2 },
    { frn: 20, id: "230", n: 2 },
    { frn: 21, id: "145", n: 2 },
    { frn: 22, id: "152", n: 2 },
    { frn: 23, id: "200", n: 1 },
    { frn: 24, id: "155", n: 2 },
    { frn: 25, id: "157", n: 2 },
    { frn: 26, id: "160", n: 4 },
    { frn: 27, id: "165", kind: "fx" },
    { frn: 28, id: "077", n: 3 },
    { frn: 29, id: "170", n: 6 },
    { frn: 30, id: "020", n: 1 },
  ],
  25: [
    { frn: 1, id: "010", n: 2 },
    { frn: 2, id: "000", n: 1 },
    { frn: 3, id: "200", n: 3 },
    { frn: 4, id: "015", n: 1 },
    { frn: 5, id: "020", n: 6 },
    { frn: 6, id: "070", n: 3 },
    { frn: 7, id: "100", kind: "fx" },
    { frn: 8, id: "105", kind: "rep", rec: 1 },
    { frn: 9, id: "120", kind: "rep", rec: 3 },
    { frn: 10, id: "140", kind: "rep", rec: 6 },
    { frn: 11, id: "SP", kind: "sp" },
    { frn: 12, id: "600", n: 8 },
    { frn: 13, id: "610", n: 2 },
  ],
  48: [
    { frn: 1, id: "010", n: 2 },
    { frn: 2, id: "140", n: 3 },
    { frn: 3, id: "020", kind: "fx" },
    { frn: 4, id: "040", n: 4 },
    { frn: 5, id: "070", n: 2 },
    { frn: 6, id: "090", n: 2 },
    { frn: 7, id: "130", kind: "fx" },
    { frn: 8, id: "220", n: 3 },
    { frn: 9, id: "240", n: 6 },
    { frn: 10, id: "250", kind: "rep", rec: 8 },
    { frn: 11, id: "161", n: 2 },
    { frn: 12, id: "042", n: 4 },
    { frn: 13, id: "200", n: 4 },
    { frn: 14, id: "170", kind: "fx" },
    { frn: 15, id: "210", kind: "fx" },
    { frn: 16, id: "030", kind: "fx" },
    { frn: 17, id: "080", n: 2 },
    { frn: 18, id: "100", n: 4 },
    { frn: 19, id: "110", n: 2 },
    { frn: 20, id: "120", kind: "fx" },
    { frn: 21, id: "230", n: 2 },
    { frn: 22, id: "260", n: 7 },
    { frn: 23, id: "055", n: 1 },
    { frn: 24, id: "050", n: 2 },
    { frn: 25, id: "065", n: 1 },
    { frn: 26, id: "060", n: 2 },
    { frn: 27, id: "SP", kind: "sp" },
    { frn: 28, id: "RE", kind: "re" },
  ],
  62: [
    { frn: 1, id: "010", n: 2 },
    { frn: 2, id: "spare", n: 0 },
    { frn: 3, id: "015", n: 1 },
    { frn: 4, id: "070", n: 3 },
    { frn: 5, id: "105", n: 8 },
    { frn: 6, id: "100", n: 6 },
    { frn: 7, id: "185", n: 4 },
    { frn: 8, id: "210", n: 2 },
    { frn: 9, id: "060", n: 2 },
    { frn: 10, id: "245", n: 7 },
    { frn: 11, id: "380", kind: "compound", fields: I380 },
    { frn: 12, id: "040", n: 2 },
    { frn: 13, id: "080", kind: "fx" },
    { frn: 14, id: "290", kind: "compound", fields: I290 },
    { frn: 15, id: "200", n: 1 },
    { frn: 16, id: "295", kind: "compound", fields: I295 },
    { frn: 17, id: "136", n: 2 },
    { frn: 18, id: "130", n: 2 },
    { frn: 19, id: "135", n: 2 },
    { frn: 20, id: "220", n: 2 },
    { frn: 21, id: "390", kind: "compound", fields: I390 },
    { frn: 22, id: "270", kind: "fx" },
    { frn: 23, id: "300", n: 1 },
    { frn: 24, id: "110", kind: "compound", fields: I110 },
    { frn: 25, id: "120", n: 2 },
    { frn: 26, id: "510", kind: "repfx", rec: 3 },
    { frn: 27, id: "500", kind: "compound", fields: I500 },
    { frn: 28, id: "340", kind: "compound", fields: I340 },
    { frn: 34, id: "RE", kind: "re" },
    { frn: 35, id: "SP", kind: "sp" },
  ],
  63: [
    { frn: 1, id: "010", n: 2 },
    { frn: 2, id: "015", n: 1 },
    { frn: 3, id: "030", n: 3 },
    { frn: 4, id: "050", n: 2 },
    { frn: 5, id: "060", kind: "fx" },
    { frn: 6, id: "070", n: 2 },
    { frn: 7, id: "080", n: 4 },
    { frn: 8, id: "081", n: 2 },
    { frn: 9, id: "090", n: 4 },
    { frn: 10, id: "091", n: 2 },
    { frn: 11, id: "092", n: 2 },
    { frn: 13, id: "RE", kind: "re" },
    { frn: 14, id: "SP", kind: "sp" },
  ],
  65: [
    { frn: 1, id: "010", n: 2 },
    { frn: 2, id: "000", n: 1 },
    { frn: 3, id: "015", n: 1 },
    { frn: 4, id: "030", n: 3 },
    { frn: 5, id: "020", n: 1 },
    { frn: 6, id: "040", n: 1 },
    { frn: 7, id: "050", n: 1 },
    { frn: 13, id: "RE", kind: "re" },
    { frn: 14, id: "SP", kind: "sp" },
  ],
};

function takeItem(buf, i, spec) {
  if (spec.id === "spare" || spec.n === 0 && !spec.kind) return { next: i, slice: buf.subarray(i, i) };
  if (spec.kind === "fx") return { next: skipFx(buf, i), slice: buf.subarray(i, skipFx(buf, i)) };
  if (spec.kind === "fx2") {
    if (i + 2 > buf.length) throw new Error(`truncated I${spec.id || "fx2"}`);
    let p = i + 2;
    if (buf[p - 1] & 1) p = skipFx(buf, p);
    return { next: p, slice: buf.subarray(i, p) };
  }
  if (spec.kind === "rep") return { next: skipRep(buf, i, spec.rec), slice: buf.subarray(i, skipRep(buf, i, spec.rec)) };
  if (spec.kind === "repfx") {
    let p = i;
    const rec = spec.rec || 3;
    do {
      if (p + rec > buf.length) throw new Error(`truncated I${spec.id || "repfx"}`);
      p += rec;
    } while (buf[p - 1] & 1);
    return { next: p, slice: buf.subarray(i, p) };
  }
  if (spec.kind === "compound") {
    const fspec = readFspec(buf, i);
    let p = i + fspec.size;
    for (const n of fspec.frn) {
      const sub = spec.fields[n - 1];
      if (!sub) throw new Error(`unknown compound SF ${n} in I${spec.id}`);
      p = takeItem(buf, p, sub).next;
    }
    return { next: p, slice: buf.subarray(i, p) };
  }
  if (spec.kind === "sp") return { next: skipSp(buf, i), slice: buf.subarray(i, skipSp(buf, i)) };
  if (spec.kind === "re") return { next: skipRe(buf, i), slice: buf.subarray(i, skipRe(buf, i)) };
  const n = spec.n || 0;
  if (i + n > buf.length) throw new Error(`truncated I${spec.id}`);
  return { next: i + n, slice: buf.subarray(i, i + n) };
}

function walkCompound(slice, fields, visit) {
  if (!slice || !slice.length) return;
  const fspec = readFspec(slice, 0);
  let i = fspec.size;
  for (const n of fspec.frn) {
    const spec = fields[n - 1];
    if (!spec) break;
    const hit = takeItem(slice, i, spec);
    visit(n, hit.slice);
    i = hit.next;
  }
}

function applyWgs(rec, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
  rec.lat = lat;
  rec.lon = lon;
}

function applyItem(rec, spec, slice) {
  const id = spec.id;
  if (id === "010" && slice.length >= 2) {
    rec.sac = slice[0];
    rec.sic = slice[1];
  }
  if (rec.cat === 21) {
    if (id === "130" && slice.length >= 6) applyWgs(rec, i24(slice, 0) * WGS23, i24(slice, 3) * WGS23);
    if (id === "131" && slice.length >= 8) applyWgs(rec, i32(slice, 0) * WGS30, i32(slice, 4) * WGS30);
    if (id === "080" && slice.length >= 3) rec.icao = slice.toString("hex");
    if (id === "170" && slice.length >= 6) rec.call = icao6(slice, 0);
    if (id === "145" && slice.length >= 2) rec.fl = i16(slice, 0) / 4;
    if (id === "161" && slice.length >= 2) rec.tn = String(u16(slice, 0) & 0x0fff);
    if (id === "071" && slice.length >= 3) rec.tod = tod(slice, 0);
    if (id === "073" && slice.length >= 3) rec.tod = rec.tod ?? tod(slice, 0);
    if (id === "160" && slice.length >= 4) {
      rec.gs = ((u16(slice, 0) & 0x7fff) / 2 ** 14) * NM_S_TO_KT;
      rec.track = u16(slice, 2) * DEG16;
    }
  }
  if (rec.cat === 25) {
    if (id === "000" && slice.length >= 1) {
      rec.reportType = slice[0] >> 1;
      rec.reportName = RTYP[rec.reportType] || "other";
      rec.eventDriven = Boolean(slice[0] & 1);
    }
    if (id === "015") rec.serviceId = slice[0];
    if (id === "020" && slice.length >= 6) rec.designator = icao6(slice, 0);
    if (id === "070" && slice.length >= 3) rec.tod = tod(slice, 0);
    if (id === "100" && slice.length >= 1) {
      const st = decode100(slice, 0);
      rec.nogo = st.nogo;
      rec.ops = st.ops;
      rec.sstat = st.sstat;
    }
    if (id === "600" && slice.length >= 8) applyWgs(rec, i32(slice, 0) * WGS32, i32(slice, 4) * WGS32);
    if (id === "610" && slice.length >= 2) rec.heightM = i16(slice, 0) * 0.25;
  }
  if (rec.cat === 1) {
    if (id === "040" && slice.length >= 4) {
      rec.rho = u16(slice, 0) * NM128;
      rec.theta = u16(slice, 2) * DEG16;
    }
    if (id === "090" && slice.length >= 2) rec.fl = signedBits(u16(slice, 0), 14) / 4;
    if (id === "070" && slice.length >= 2) rec.modeA = (u16(slice, 0) & 0x0fff).toString(8).padStart(4, "0");
    if (id === "141" && slice.length >= 2) rec.tod = u16(slice, 0) * TOD128;
  }
  if (rec.cat === 34) {
    if (id === "000" && slice.length >= 1) {
      rec.reportType = slice[0];
      rec.reportName = ({ 1: "north", 2: "sector", 3: "geo-filter", 4: "jamming" })[slice[0]] || "mono-svc";
    }
    if (id === "030" && slice.length >= 3) rec.tod = tod(slice, 0);
    if (id === "020" && slice.length >= 1) rec.sector = slice[0];
    if (id === "060" && slice.length >= 1) {
      rec.nogo = Boolean((slice[0] >> 6) & 3);
      rec.ops = rec.nogo ? "nogo" : "go";
      rec.sstat = rec.nogo ? "nogo" : "operational";
    }
  }
  if (rec.cat === 48) {
    if (id === "020" && slice.length >= 1) {
      rec.typ = (slice[0] >> 5) & 7;
      rec.psr = rec.typ === 1 || rec.typ === 3 || rec.typ === 6 || rec.typ === 7;
    }
    if (id === "140" && slice.length >= 3) rec.tod = tod(slice, 0);
    if (id === "040" && slice.length >= 4) {
      rec.rho = u16(slice, 0) * NM256;
      rec.theta = u16(slice, 2) * DEG16;
    }
    if (id === "042" && slice.length >= 4) {
      rec.x = i16(slice, 0) * NM128;
      rec.y = i16(slice, 2) * NM128;
    }
    if (id === "090" && slice.length >= 2) rec.fl = signedBits(u16(slice, 0), 14) / 4;
    if (id === "070" && slice.length >= 2) rec.modeA = (u16(slice, 0) & 0x0fff).toString(8).padStart(4, "0");
    if (id === "220" && slice.length >= 3) rec.icao = slice.toString("hex");
    if (id === "240" && slice.length >= 6) rec.call = icao6(slice, 0);
    if (id === "161" && slice.length >= 2) rec.tn = String(u16(slice, 0) & 0x0fff);
    if (id === "200" && slice.length >= 4) {
      rec.gs = (u16(slice, 0) / 2 ** 14) * NM_S_TO_KT;
      rec.track = u16(slice, 2) * DEG16;
    }
  }
  if (rec.cat === 62) {
    if (id === "070" && slice.length >= 3) rec.tod = tod(slice, 0);
    if (id === "105" && slice.length >= 8) applyWgs(rec, i32(slice, 0) * WGS25, i32(slice, 4) * WGS25);
    if (id === "040" && slice.length >= 2) rec.tn = String(u16(slice, 0));
    if (id === "060" && slice.length >= 2) rec.modeA = (u16(slice, 0) & 0x0fff).toString(8).padStart(4, "0");
    if (id === "245" && slice.length >= 7) rec.call = rec.call || icao6(slice, 1);
    if (id === "136" && slice.length >= 2) rec.fl = i16(slice, 0) / 4;
    if (id === "135" && slice.length >= 2) rec.fl = rec.fl ?? signedBits(u16(slice, 0), 15) / 4;
    if (id === "185" && slice.length >= 4) {
      const vx = i16(slice, 0) / 4;
      const vy = i16(slice, 2) / 4;
      rec.gs = Math.hypot(vx, vy) * MS_TO_KT;
      rec.track = (Math.atan2(vx, vy) * 180) / Math.PI;
      if (rec.track < 0) rec.track += 360;
    }
    if (id === "380") {
      walkCompound(slice, I380, (n, part) => {
        if (n === 1 && part.length >= 3) rec.icao = rec.icao || part.toString("hex");
        if (n === 2 && part.length >= 6) rec.call = rec.call || icao6(part, 0);
        if (n === 21 && part.length >= 1) rec.emc = part[0];
        if (n === 22 && part.length >= 6 && rec.lat == null) applyWgs(rec, i24(part, 0) * WGS23, i24(part, 3) * WGS23);
      });
    }
    if (id === "390") {
      walkCompound(slice, I390, (n, part) => {
        if (n === 2 && part.length >= 7) rec.call = rec.call || part.toString("ascii").replace(/\0/g, " ").trim();
      });
    }
    if (id === "340") {
      walkCompound(slice, I340, (n, part) => {
        if (n === 2 && part.length >= 4) {
          rec.rho = rec.rho ?? u16(part, 0) * NM256;
          rec.theta = rec.theta ?? u16(part, 2) * DEG16;
        }
        if (n === 4 && part.length >= 2 && rec.fl == null) rec.fl = signedBits(u16(part, 0), 14) / 4;
        if (n === 5 && part.length >= 2 && !rec.modeA) rec.modeA = (u16(part, 0) & 0x0fff).toString(8).padStart(4, "0");
      });
    }
  }
  if (rec.cat === 63) {
    if (id === "015") rec.serviceId = slice[0];
    if (id === "030" && slice.length >= 3) rec.tod = tod(slice, 0);
    if (id === "050" && slice.length >= 2) {
      rec.sensorSac = slice[0];
      rec.sensorSic = slice[1];
    }
    if (id === "060" && slice.length >= 1) {
      rec.nogo = Boolean(slice[0] & 0x80);
      rec.ops = rec.nogo ? "nogo" : "go";
      rec.sstat = rec.nogo ? "nogo" : "operational";
      rec.reportName = "sensor-status";
    }
  }
  if (rec.cat === 65) {
    if (id === "000" && slice.length >= 1) {
      rec.reportType = slice[0];
      rec.reportName = ({ 1: "sdps-status", 2: "end-of-batch", 3: "service-status" })[slice[0]] || "sdps-svc";
    }
    if (id === "015") rec.serviceId = slice[0];
    if (id === "030" && slice.length >= 3) rec.tod = tod(slice, 0);
    if (id === "040" && slice.length >= 1) {
      rec.nogo = Boolean(slice[0] & 0x80);
      rec.ops = rec.nogo ? "nogo" : "operational";
      rec.sstat = rec.nogo ? "nogo" : "operational";
    }
    if (id === "050" && slice.length >= 1) rec.sstat = ({ 1: "operational", 2: "degraded", 3: "failed", 4: "undefined" })[slice[0]] || rec.sstat;
  }
}

function parseRecord(buf, start, cat) {
  const fspec = readFspec(buf, start);
  let i = start + fspec.size;
  const rec = { cat, items: {} };
  const uap = UAP[cat];
  if (!uap) return { rec, next: null, skipped: true };
  const byFrn = new Map(uap.map((x) => [x.frn, x]));
  for (const n of fspec.frn) {
    const spec = byFrn.get(n);
    if (!spec) break;
    const hit = takeItem(buf, i, spec);
    if (spec.id !== "spare") rec.items[spec.id] = true;
    if (hit.halt) break;
    applyItem(rec, spec, hit.slice);
    i = hit.next;
  }
  return { rec, next: i };
}

/** TCP/stream: take complete CAT+LEN frames, leave a partial tail. */
export function splitAsterixFrames(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  const frames = [];
  let i = 0;
  while (i + 3 <= buf.length) {
    const cat = u8(buf, i);
    const len = u16(buf, i + 1);
    if (len < 3 || cat > 247) {
      i += 1;
      continue;
    }
    if (i + len > buf.length) break;
    frames.push(buf.subarray(i, i + len));
    i += len;
  }
  return { frames, rest: buf.subarray(i), consumed: i };
}

export function parseAsterixBuffer(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  const { frames } = splitAsterixFrames(buf);
  const records = [];
  let blocks = 0;
  for (const frame of frames) {
    const cat = u8(frame, 0);
    const len = u16(frame, 1);
    blocks += 1;
    if (cat === 240) continue;
    let p = 3;
    while (p < len) {
      try {
        const { rec, next, skipped } = parseRecord(frame, p, cat);
        rec.rawLen = len;
        records.push(rec);
        if (skipped || next == null || next <= p) break;
        p = next;
      } catch {
        break;
      }
    }
  }
  return { blocks, n: records.length, records };
}

export function bufferFromFeeder(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    if (/^[0-9a-fA-F\s]+$/.test(s) && s.replace(/\s/g, "").length >= 6 && s.replace(/\s/g, "").length % 2 === 0) {
      return Buffer.from(s.replace(/\s/g, ""), "hex");
    }
    try {
      const b = Buffer.from(s, "base64");
      if (b.length >= 3) return b;
    } catch {
      /* not b64 */
    }
    return null;
  }
  if (input && typeof input === "object") {
    if (input.hex) return bufferFromFeeder(String(input.hex));
    if (input.base64) return Buffer.from(String(input.base64), "base64");
    if (input.raw) return bufferFromFeeder(input.raw);
    if (Array.isArray(input.bytes)) return Buffer.from(input.bytes);
  }
  return null;
}

export function encodeIcao6(text) {
  const alphabet = " ABCDEFGHIJKLMNOPQRSTUVWXYZ                     0123456789      ";
  const s = String(text || "")
    .toUpperCase()
    .padEnd(8, " ")
    .slice(0, 8);
  let full = 0n;
  for (let c = 0; c < 8; c += 1) {
    let idx = alphabet.indexOf(s[c]);
    if (idx < 0) idx = 0;
    full = (full << 6n) | BigInt(idx);
  }
  const out = Buffer.alloc(6);
  for (let i = 5; i >= 0; i -= 1) {
    out[i] = Number(full & 0xffn);
    full >>= 8n;
  }
  return out;
}
