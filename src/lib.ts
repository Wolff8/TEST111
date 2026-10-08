export type PlaceId = "si" | "lj" | "ms" | "mb" | "kp" | "nmesto" | "ce";

export const PLACES: { id: PlaceId; name: string; lat: number; lon: number; zoom: number }[] = [
  { id: "si", name: "Slovenia", lat: 46.12, lon: 14.82, zoom: 8 },
  { id: "lj", name: "Ljubljana", lat: 46.056, lon: 14.508, zoom: 10 },
  { id: "ms", name: "Murska Sobota", lat: 46.6292, lon: 16.1908, zoom: 11 },
  { id: "mb", name: "Maribor", lat: 46.554, lon: 15.646, zoom: 10 },
  { id: "kp", name: "Koper", lat: 45.548, lon: 13.73, zoom: 10 },
  { id: "nmesto", name: "Novo mesto", lat: 45.804, lon: 15.169, zoom: 11 },
  { id: "ce", name: "Cerklje", lat: 45.9003, lon: 15.5303, zoom: 11 },
];

export const SI_OUTLINE: [number, number][] = [
  [46.52, 13.72],
  [46.53, 14.4],
  [46.62, 14.75],
  [46.7, 15.17],
  [46.87, 15.52],
  [46.87, 16.11],
  [46.84, 16.37],
  [46.52, 16.51],
  [46.47, 16.37],
  [46.22, 16.11],
  [45.98, 15.73],
  [45.75, 15.65],
  [45.75, 15.17],
  [45.47, 14.85],
  [45.47, 13.89],
  [45.59, 13.71],
  [45.73, 13.38],
  [46.0, 13.47],
  [46.25, 13.58],
  [46.52, 13.72],
];

export const ALT_BANDS = [
  { lab: "<1k", color: "#ff4d4d" },
  { lab: "5k", color: "#ff8a3d" },
  { lab: "12k", color: "#f5d742" },
  { lab: "22k", color: "#3ee07a" },
  { lab: "34k", color: "#3ee0c2" },
  { lab: "FL", color: "#6aa8ff" },
];

const ALT_STOPS = [
  { ft: 0, color: "#ff4d4d" },
  { ft: 1000, color: "#ff6a42" },
  { ft: 3500, color: "#ff8a3d" },
  { ft: 8000, color: "#f5d742" },
  { ft: 16000, color: "#7ee05a" },
  { ft: 24000, color: "#3ee07a" },
  { ft: 32000, color: "#3ee0c2" },
  { ft: 42000, color: "#6aa8ff" },
];

function hexRgb(h: string): [number, number, number] {
  const s = String(h || "").replace("#", "");
  if (s.length < 6) return [106, 168, 255];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export const TRAIL_MIN_MS = 15 * 60_000;

/** Oldest trail end fades to nearly gone by 15 minutes. */
export function fadeTrailOpacity(ageMs: number, picked = false) {
  const t = 1 - Math.min(1.12, Math.max(0, Number(ageMs) || 0) / TRAIL_MIN_MS);
  const u = Math.max(0, t);
  return Math.max(0.02, Math.pow(u, 1.4) * (picked ? 0.96 : 0.9));
}

/** Smooth altitude colour — lerp between stops so trails read as height, not bands. */
export function altColor(ft: number) {
  const a = Math.max(0, Number(ft) || 0);
  if (a <= ALT_STOPS[0].ft) return ALT_STOPS[0].color;
  for (let i = 1; i < ALT_STOPS.length; i++) {
    if (a > ALT_STOPS[i].ft) continue;
    const span = Math.max(1, ALT_STOPS[i].ft - ALT_STOPS[i - 1].ft);
    const t = (a - ALT_STOPS[i - 1].ft) / span;
    const A = hexRgb(ALT_STOPS[i - 1].color);
    const B = hexRgb(ALT_STOPS[i].color);
    const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${hex(A[0] + (B[0] - A[0]) * t)}${hex(A[1] + (B[1] - A[1]) * t)}${hex(A[2] + (B[2] - A[2]) * t)}`;
  }
  return ALT_STOPS[ALT_STOPS.length - 1].color;
}

export type Plane = {
  id: string;
  src: string;
  flight: string;
  silent?: boolean;
  reg: string;
  typecode: string;
  desc?: string;
  ownOp?: string;
  year?: string;
  role: "jet" | "heli" | "small" | "uav" | "soar" | "glider" | "balloon" | "ground" | "modes" | "chute" | "aero" | "bird" | "unknown" | string;
  lat: number;
  lon: number;
  altFt: number;
  aglFt?: number;
  local?: boolean;
  jump?: boolean;
  taxi?: boolean;
  onDeck?: boolean;
  low?: boolean;
  fastLow?: boolean;
  birdtam?: number;
  altBaro?: number;
  gs: number;
  tas?: number;
  ias?: number;
  mach?: number;
  track: number;
  vs?: number;
  squawk: string;
  emergency?: string;
  category: string;
  qnh?: number;
  nic?: number;
  nacp?: number;
  msgs?: number;
  color: string;
  trail: { lat: number; lon: number; alt?: number; color?: string; future?: boolean; filed?: boolean; at?: number }[];
  km: number;
  rssi?: number;
  seen?: number;
  seenPos?: number;
  heard?: boolean;
  fpl?: boolean;
  ifps?: boolean;
  dep?: string;
  dest?: string;
  route?: string;
  nm?: boolean;
  nmId?: string;
  touching?: boolean;
  uaId?: string;
  model?: string;
  operator?: { lat: number; lon: number } | null;
  home?: { lat: number; lon: number } | null;
  asterix?: boolean;
  asterixCat?: string;
  noPos?: boolean;
  adsbType?: string;
  passiveBalloon?: boolean;
};

export type Sat = {
  id: string;
  name: string;
  kind: "gps" | "galileo" | "glonass" | "beidou" | "dvbs" | string;
  prn?: string;
  lat: number;
  lon: number;
  altKm: number;
  el: number;
  az: number;
  rangeKm: number;
  color: string;
};

export type Gtw = {
  id: string;
  eui: string;
  name: string;
  src: string;
  lat: number;
  lon: number;
  alt: number;
  online: boolean;
  ageMin: number | null;
  km: number;
  kind: string;
  cluster?: string;
};

export type Pt = { t: number; v: number };

export type Msg = {
  id: string;
  kind: string;
  name: string;
  detail: string;
  rssi?: number;
  snr?: number;
  hops?: number;
  lat?: number | null;
  lon?: number | null;
  at: number;
  fromName?: string;
  from?: string;
  port?: string;
  raw?: string;
  alt?: number | null;
  decoded?: Record<string, string | number | null | undefined>;
};

export type Sensor = {
  id: string;
  kind: string;
  name: string;
  lat: number;
  lon: number;
  km: number;
  occ?: boolean;
  train?: string;
  sensors?: { title: string; unit: string; last?: string | number }[];
  detail?: string;
  href?: string;
  online?: boolean;
  rssi?: number;
  snr?: number;
  eui?: string;
  src?: string;
  ageMin?: number | null;
  at?: number;
  alt?: number;
  cluster?: string;
  lastAt?: string;
  series?: { id?: string; title: string; unit: string; pts: Pt[] }[];
  primary?: { title: string; unit: string; last?: string | number };
  battery?: number;
  voltage?: number;
  temp?: number;
  humidity?: number;
  port?: string;
  trail?: { lat: number; lon: number }[];
  decoded?: Record<string, string | number | null | undefined>;
};

export type OpsSnap = {
  at: string;
  place: string;
  publicUrl?: string;
  radar?: {
    n: number;
    counts: Record<string, number>;
    items: Plane[];
    sats?: Sat[];
    illumError?: string;
    lat: number;
    lon: number;
    radio?: { lat: number; lon: number; n?: number } | null;
    flow?: {
      fmp?: string;
      n?: number;
      matched?: number;
      unmatched?: number;
      regulations?: { id: string; name: string; reason?: string; delay?: number; n?: number; fmp?: string }[];
    };
    note?: string;
    error?: string;
  };
  lora?: {
    nGtw: number;
    nOnline: number;
    nMesh: number;
    nMsg: number;
    gateways: Gtw[];
    nodes: Sensor[];
    messages: Msg[];
    stream?: Msg[];
    telemetry?: Sensor[];
    lat: number;
    lon: number;
    note?: string;
    error?: string;
  };
  sensors?: {
    n: number;
    counts: Record<string, number>;
    items: Sensor[];
    switches: Sensor[];
    boxes: Sensor[];
    trains: Sensor[];
    messages: Msg[];
    graphs?: { id: string; name: string; kind: string; title: string; unit: string; last?: number; pts: Pt[] }[];
    note?: string;
    error?: string;
  };
};

export async function loadOps(place: PlaceId, view?: string): Promise<OpsSnap> {
  const r = await fetch(`/api/ops?place=${place}${view ? `&view=${view}` : ""}`);
  if (!r.ok) throw new Error(`ops ${r.status}`);
  return r.json();
}

export function ftToM(ft: number) {
  return (Number(ft) || 0) * 0.3048;
}

export function ktToKmh(kt: number) {
  return (Number(kt) || 0) * 1.852;
}

export function fpmToMs(fpm: number) {
  return (Number(fpm) || 0) * 0.00508;
}

export function trailLenKm(trail?: { lat: number; lon: number }[]) {
  if (!trail || trail.length < 2) return 0;
  let n = 0;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const p1 = (a.lat * Math.PI) / 180;
    const p2 = (b.lat * Math.PI) / 180;
    const dp = ((b.lat - a.lat) * Math.PI) / 180;
    const dl = ((b.lon - a.lon) * Math.PI) / 180;
    const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    n += 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  return n;
}

export function fmtAltM(ft: number) {
  return `${Math.round(ftToM(ft))} m`;
}

export function fmtKmh(kt: number) {
  return `${Math.round(ktToKmh(kt))} km/h`;
}

export function fmtLenKm(km: number) {
  const n = Number(km) || 0;
  if (n <= 0) return "—";
  if (n < 1) return `${Math.round(n * 1000)} m`;
  if (n < 10) return `${n.toFixed(1)} km`;
  return `${Math.round(n)} km`;
}

export function prettyReg(raw: string) {
  const t = String(raw || "").trim();
  if (!t) return "";
  if (/^[A-Z0-9]{1,2}-[A-Z0-9]+$/i.test(t)) return t.toUpperCase();
  const n = t.replace(/[\s-]+/g, "").toUpperCase();
  const m = n.match(/^(S5|OK|OE|9A|HB|OM|HA|LY|YL|ES|SP|YU|PH|OY|SE|LN|OH|EI|EC|CS|TC)([A-Z0-9]{3,6})$/);
  if (m) return `${m[1]}-${m[2]}`;
  const one = n.match(/^([DIFG])([A-Z0-9]{3,5})$/);
  if (one) return `${one[1]}-${one[2]}`;
  return t.toUpperCase();
}

export function icaoOf(p: { id?: string; reg?: string }) {
  const fromReg = String(p.reg || "").replace(/[^a-f0-9]/gi, "");
  if (/^[a-f0-9]{6}$/i.test(fromReg)) return fromReg.toUpperCase();
  const id = String(p.id || "");
  if (/^(flock|bird|echo|ogn|rid|nm|fpl|ax|sonde)/i.test(id)) return "";
  const hex = id.replace(/[^a-f0-9]/gi, "");
  return hex.length >= 6 ? hex.slice(-6).toUpperCase() : "";
}

function isJunkCall(s: string) {
  const c = String(s || "").replace(/[\s-]+/g, "").toUpperCase();
  if (!c || c === "NOCALL") return true;
  if (/^(FLOCK|BIRD|ECHO|PSR|UAV|SONDE|HAB|PARA|CHUTE|JUMP|AERO|GND|MODES|OGN|PWR|TOW|DROP|GLD|HELI|SMALL)$/.test(c)) return true;
  return /^[0-9A-F]{6,8}$/.test(c);
}

function normIdent(s: string) {
  return String(s || "").replace(/[\s-]+/g, "").toUpperCase();
}

function isRealReg(s: string) {
  const t = prettyReg(s);
  return Boolean(t && /-/i.test(t) && !/^[A-F0-9]{6}$/i.test(t));
}

/** OGN CN is often the last 1–3 of the tail, e.g. I-D871 → 71. */
function isCompNo(flight: string, reg: string) {
  const f = normIdent(flight);
  const r = normIdent(reg);
  if (!f) return true;
  if (!r) return f.length <= 3;
  if (f === r) return false;
  if (r.endsWith(f) && f.length < r.length) return true;
  return f.length <= 3;
}

export function identLabel(p: {
  id?: string;
  flight?: string;
  reg?: string;
  role?: string;
  typecode?: string;
  model?: string;
  src?: string;
  uaId?: string;
}) {
  const flight = String(p.flight || "").trim();
  const rawReg = prettyReg(p.reg || "");
  const reg = rawReg && !isJunkCall(rawReg) ? rawReg : isRealReg(flight) && !isJunkCall(flight) ? prettyReg(flight) : "";
  const icao = icaoOf(p);
  if (p.role === "echo" || p.src === "psr" || p.src === "echo") return { primary: p.src === "psr" ? "PSR" : "ECHO", icao: "" };
  if (p.role === "bird") return { primary: /^flock/i.test(String(p.id || "")) || p.typecode === "FLOCK" ? "FLOCK" : String(p.model || "BIRD"), icao: "" };
  if (reg && (isJunkCall(flight) || isCompNo(flight, reg))) return { primary: reg, icao };
  if (!isJunkCall(flight)) return { primary: prettyReg(flight) || flight.replace(/\s+/g, ""), icao };
  if (p.uaId) return { primary: String(p.uaId), icao };
  if (icao) return { primary: icao, icao };
  const fb = String(p.typecode || p.model || p.role || "NOCALL").replace(/\s+/g, "");
  return { primary: fb.slice(0, 14), icao };
}

export function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export function fmtNum(n: number, d = 0) {
  return n.toLocaleString("en-US", { maximumFractionDigits: d });
}

export function barPct(title: string, unit: string, last?: string | number) {
  const n = Number(last);
  if (!Number.isFinite(n)) return 8;
  const t = `${title} ${unit}`.toLowerCase();
  if (/pm|µg|ug/.test(t)) return Math.min(100, (n / 80) * 100);
  if (/temp|°c|celsius/.test(t)) return Math.min(100, Math.max(0, ((n + 10) / 50) * 100));
  if (/hum/.test(t)) return Math.min(100, Math.max(0, n));
  if (/press|hpa/.test(t)) return Math.min(100, Math.max(0, ((n - 950) / 80) * 100));
  if (/dbm/.test(t)) return Math.min(100, Math.max(0, ((n + 130) / 90) * 100));
  return Math.min(100, Math.abs(n));
}

export function focusId(m: { id?: string; from?: string; name?: string; kind?: string }) {
  if (m.from) return `mesh-${String(m.from)}`;
  if (m.kind === "tti" && m.name) return `dev-${m.name}`;
  return String(m.id || "");
}

export function belongs(
  pick: string,
  m: { id?: string; from?: string; name?: string; fromName?: string; eui?: string; kind?: string },
) {
  if (!pick) return true;
  if (!m) return false;
  const from = m.from ? String(m.from) : "";
  const ids = [m.id, from, m.name, m.fromName, m.eui, from ? `mesh-${from}` : "", m.name ? `dev-${m.name}` : ""]
    .filter(Boolean)
    .map(String);
  return ids.includes(pick);
}
