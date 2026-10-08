import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Gtw, Plane, Sat, Sensor } from "../lib";
import { SI_OUTLINE, identLabel, altColor } from "../lib";
import { createTrailCanvas, type TrailJob } from "../trail-canvas";
import type { TrailPt } from "../trail-draw";
import { CockpitHudOverlay } from "./CockpitHudOverlay";

function esc(c: string) {
  return String(c || "#6aa8ff").replace(/[^#a-fA-F0-9]/g, "");
}

function htxt(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isUid(p: Plane) {
  if (p.role === "soar" || p.role === "glider" || p.role === "uav" || p.role === "balloon" || p.role === "bird" || p.role === "echo" || p.role === "ground" || p.role === "chute" || p.role === "aero" || p.role === "heli") return false;
  const fl = String(p.flight || "").trim();
  if (fl && fl !== "NO CALL") return false;
  return Boolean(p.silent || p.src === "mlat" || p.role === "unknown" || p.role === "modes" || !fl || fl === "NO CALL");
}

function isDji(p: Plane) {
  return p.src === "rid" || /dji/i.test(`${p.typecode || ""} ${p.model || ""} ${p.flight || ""} ${p.reg || ""} ${p.uaId || ""}`);
}

function isFlock(p: Plane) {
  return p.role === "bird" && (/^flock/i.test(p.id) || p.typecode === "FLOCK");
}

function isFiledRemain(t: { future?: boolean; filed?: boolean; color?: string }) {
  return Boolean(t?.future);
}

const TRAIL_MAX_MS = 35 * 60_000; // 35 minutes retention

function pruneTrailPts<T extends { at?: number; future?: boolean }>(pts: T[] | undefined): T[] {
  const now = Date.now();
  return (pts || []).filter((p) => p.future || !p.at || now - p.at < TRAIL_MAX_MS);
}

function callsign(p: Plane) {
  const ident = identLabel(p);
  if (p.role === "modes" || p.src === "mode_s") return htxt(ident.icao || ident.primary);
  if (isUid(p) && !ident.primary) return `UID${String(p.id || "").replace(/[^a-z0-9]/gi, "").slice(-3).toUpperCase()}`;
  return htxt(ident.primary || ident.icao || "NOCALL");
}

function isFlarm(p: Plane) {
  return (p.src === "ogn" || p.role === "soar" || p.role === "glider") && p.role !== "bird" && p.role !== "chute" && p.role !== "small" && p.role !== "aero" && p.role !== "uav" && p.role !== "heli";
}

export type RadarStationId = "puconci" | "dolina43" | "ljms";

export interface RadarStation {
  id: RadarStationId;
  name: string;
  lat: number;
  lon: number;
  altM: number;
  sac: number;
  sic: number;
  rangeNm: number;
}

export const RADAR_STATIONS: Record<RadarStationId, RadarStation> = {
  puconci: {
    id: "puconci",
    name: "Puconci Mode S / SSR (Prekmurje)",
    lat: 46.7042,
    lon: 16.1601,
    altM: 220,
    sac: 191,
    sic: 48,
    rangeNm: 120,
  },
  dolina43: {
    id: "dolina43",
    name: "Dolina (Puconci) SDR Head",
    lat: 46.74567394991525,
    lon: 16.194033073880615,
    altM: 265,
    sac: 191,
    sic: 43,
    rangeNm: 120,
  },
  ljms: {
    id: "ljms",
    name: "LJMS Murska Sobota Airfield Radar",
    lat: 46.6590,
    lon: 16.1720,
    altM: 184,
    sac: 191,
    sic: 25,
    rangeNm: 80,
  },
};

export function calcPolar(origin: { lat: number; lon: number }, lat: number, lon: number) {
  const φ1 = (origin.lat * Math.PI) / 180;
  const φ2 = (lat * Math.PI) / 180;
  const Δφ = φ2 - φ1;
  const Δλ = ((lon - origin.lon) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const distM = 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
  const rhoNm = distM / 1852;
  const rhoKm = distM / 1000;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let thetaDeg = (Math.atan2(y, x) * 180) / Math.PI;
  if (thetaDeg < 0) thetaDeg += 360;
  const rad = (thetaDeg * Math.PI) / 180;
  const cartX = rhoNm * Math.sin(rad);
  const cartY = rhoNm * Math.cos(rad);
  return {
    rhoNm: +rhoNm.toFixed(1),
    rhoKm: +rhoKm.toFixed(1),
    thetaDeg: +thetaDeg.toFixed(1),
    cartX: +cartX.toFixed(1),
    cartY: +cartY.toFixed(1),
  };
}

export type DronetagOp = {
  id: string;
  sensorId?: string;
  status?: string;
  maker?: string;
  bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null;
  centerLat?: number | null;
  centerLon?: number | null;
  timeCreated?: string;
  timeLastTelemetry?: string;
};

export type NotamItem = {
  series?: string;
  seriesName?: string;
  number?: string;
  type?: string;
  fir?: string;
  location?: string;
  lowerLimit?: string;
  upperLimit?: string;
  validFrom?: string;
  validTo?: string;
  text?: string;
  geoCircle?: { lat: number; lon: number; radiusNm: number; radiusKm: number } | null;
  isMilitary?: boolean;
  isDroneRestriction?: boolean;
};

export type WeatherStation = {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  elevFt?: number;
  metar?: {
    raw?: string;
    obsTime?: string;
    tempC?: number;
    dewpC?: number;
    windDirDeg?: number;
    windSpeedKt?: number;
    altimHpa?: number;
    visMiles?: number;
    fltCat?: "VFR" | "MVFR" | "IFR" | "LIFR" | string;
    wxString?: string;
  };
};

function planeMark(p: Plane, on: boolean, label: boolean, colorByAlt = true) {
  const alt = Number(p.altFt) || 0;
  const altC = altColor(alt);
  const col = colorByAlt
    ? altC
    : isDji(p)
      ? "#ff8a3d"
      : p.role === "uav"
        ? "#ff8a3d"
        : p.role === "ground"
          ? "#9bb8c9"
          : p.role === "modes" || p.src === "mode_s"
            ? "#c77dff"
        : p.role === "echo" || p.src === "psr"
          ? "#9ad7ff"
        : p.role === "bird"
          ? "#e8d48a"
          : p.role === "chute"
          ? "#ff8a3d"
          : p.role === "aero"
            ? "#ff4d8d"
            : p.role === "soar"
          ? "#f5d742"
          : p.role === "glider"
            ? "#3ee07a"
            : p.role === "balloon"
              ? "#c77dff"
              : isUid(p)
                ? "#ff8a3d"
                : p.color;

  const flText = alt >= 5500 ? `FL${Math.round(alt / 100)}` : `${alt}′`;
  const csLabel = label && p.role !== "bird" && p.role !== "echo"
    ? `<b class="cs" style="border-left: 2px solid ${col}">${callsign(p)}${on || label ? ` <span style="color:${altC};font-weight:400">${flText}</span>` : ""}</b>`
    : "";

  return `<span class="ac-mark ${on ? "on" : ""} ${label ? "" : "bare"} ${isUid(p) ? "uid" : ""} ${p.heard ? "heard" : ""} ${p.nm || p.src === "nm" ? "nm" : ""} ${p.fpl || p.ifps || p.src === "fpl" ? "fpl" : ""} ${p.role} ${isFlock(p) ? "flock" : ""} ${isDji(p) ? "dji" : ""} ${isFlarm(p) ? "flarm" : ""}">${planeSvg(p, col)}${csLabel}</span>`;
}

function planeSvg(p: Plane | string, color?: string) {
  const role = typeof p === "string" ? p : p.role;
  const dji = typeof p !== "string" && isDji(p);
  const rot = typeof p === "string" ? 0 : Number(p.track) || 0;
  const c = esc(color || "#6aa8ff") || "#6aa8ff";
  if (typeof p !== "string" && (p.role === "echo" || p.src === "psr" || p.src === "echo")) {
    return `<span class="ac echo spectre" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14" fill="none" stroke="${c}" stroke-width="1.2" opacity=".25"/><circle cx="18" cy="18" r="8" fill="none" stroke="${c}" stroke-width="1.4" opacity=".45"/><circle cx="18" cy="18" r="2.6" fill="${c}" opacity=".85"/></svg></span>`;
  }
  if (typeof p !== "string" && p.role === "bird") {
    if (isFlock(p)) {
      return `<span class="ac bird flock spectre" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 56 36" aria-hidden="true"><path d="M8 20c3-6 7-9 12-9-4 2-7 5-8 9 4-3 8-4 12-3-5 2-8 5-9 8" fill="${c}" opacity=".28"/><path d="M20 14c4-8 9-11 16-11-5 3-9 7-10 11 6-4 11-5 16-3-7 3-11 7-12 11" fill="${c}" opacity=".55"/><path d="M12 24c3-5 6-7 10-7-3 2-6 4-7 7 3-2 7-3 10-2-4 2-7 4-8 7" fill="${c}" opacity=".22"/><circle cx="28" cy="16" r="2.2" fill="${c}" opacity=".7"/></svg></span>`;
    }
    return `<span class="ac bird spot" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="7" fill="${c}" opacity=".2"/><circle cx="14" cy="14" r="3.4" fill="${c}" opacity=".7"/><path d="M6 13c4-3 7-3 8-1 1-2 4-2 8 1" fill="none" stroke="${c}" stroke-width="1.2" opacity=".55"/></svg></span>`;
  }
  if (dji || role === "dji") {
    return `<span class="ac uav dji" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="10" cy="10" r="5" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="30" cy="10" r="5" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="10" cy="30" r="5" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="30" cy="30" r="5" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M10 10 30 30M30 10 10 30" stroke="${c}" stroke-width="1.8"/><rect x="15" y="15" width="10" height="10" rx="2" fill="${c}"/></svg></span>`;
  }
  if (role === "heli") {
    return `<span class="ac heli" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="none" stroke="${c}" stroke-width="1.7"/><path d="M13 5v16M5 13h16" stroke="${c}" stroke-width="1.3"/><path d="M13 15.2 29 21l-16-2.2z" fill="${c}"/><circle cx="13" cy="13" r="1.6" fill="${c}"/></svg></span>`;
  }
  if (role === "small") {
    return `<span class="ac small" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="${c}" d="M16 3.2 19.2 18l-3.2-2-3.2 2zM6 14.2 16 11l10 3.2-10 1.2zM14.6 20 16 26.2 17.4 20z"/></svg></span>`;
  }
  if (role === "uav") {
    return `<span class="ac uav" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 36 36" aria-hidden="true"><path fill="${c}" d="M18 4 32 18 18 32 4 18z"/><circle cx="18" cy="18" r="4" fill="#071018"/><path d="M8 8l4 4M28 8l-4 4M8 28l4-4M28 28l-4-4" stroke="${c}" stroke-width="1.6"/></svg></span>`;
  }
  if (role === "ground") {
    return `<span class="ac ground" style="--c:${c};--r:0deg"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="10" width="20" height="12" rx="2" fill="${c}"/><rect x="10" y="6" width="12" height="5" rx="1" fill="${c}"/><circle cx="11" cy="23" r="2.2" fill="#071018"/><circle cx="21" cy="23" r="2.2" fill="#071018"/></svg></span>`;
  }
  if (role === "modes") {
    return `<span class="ac modes" style="--c:${c};--r:0deg"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="7" width="18" height="18" transform="rotate(45 16 16)" fill="none" stroke="${c}" stroke-width="2"/><circle cx="16" cy="16" r="3" fill="${c}"/></svg></span>`;
  }
  if (role === "chute") {
    return `<span class="ac chute" style="--c:${c};--r:0deg"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 14c2-8 20-8 22 0" fill="none" stroke="${c}" stroke-width="2.2"/><path d="M5 14c3 1 5 3 6 6M16 8v14M27 14c-3 1-5 3-6 6" fill="none" stroke="${c}" stroke-width="1.4"/><circle cx="16" cy="24" r="2.4" fill="${c}"/></svg></span>`;
  }
  if (role === "aero") {
    return `<span class="ac aero" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="${c}" d="M16 3 20 14h7l-5 3 3 9-5-4-4 7-4-7-5 4 3-9-5-3h7z"/></svg></span>`;
  }
  if (role === "soar") {
    return `<span class="ac soar" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="${c}" stroke="#071018" stroke-width="1.2" stroke-linejoin="round" d="M16 3.1 26.6 26.6 16 20.4 5.4 26.6z"/></svg></span>`;
  }
  if (role === "glider") {
    return `<span class="ac glider" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 40 24" aria-hidden="true"><path fill="${c}" d="M22 12h36L20 8z"/><path fill="${c}" d="M18 8h4v12h-4z"/><path fill="${c}" d="M16 18h8l-4 4z"/></svg></span>`;
  }
  if (role === "balloon") {
    return `<span class="ac balloon" style="--c:${c};--r:0deg"><svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="13" rx="9" ry="11" fill="${c}"/><rect x="13" y="24" width="6" height="5" rx="1" fill="${c}"/><path d="M10 20 13 24M22 20 19 24" stroke="${c}" stroke-width="1.4"/></svg></span>`;
  }
  if (role === "unknown") {
    return `<span class="ac unk" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="3 3"/><text x="16" y="21" text-anchor="middle" fill="${c}" font-size="14" font-weight="700">?</text></svg></span>`;
  }
  return `<span class="ac jet" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="${c}" d="M16 2.4 20.6 22.2 16 18.4 11.4 22.2zM3.6 14.6 16 10.2 28.4 14.6 16 16.4zM13.8 21.2 16 29.2 18.2 21.2z"/><polygon points="16,8 18.2,12.6 16,11.4 13.8,12.6" fill="#071018"/></svg></span>`;
}

function meshPin(n: Sensor, on: boolean) {
  const bat = Number(n.battery);
  const alt = Number(n.alt);
  const col = alt > 800 ? "#ff8a3d" : alt > 200 ? "#f5d742" : "#c77dff";
  const pct = Number.isFinite(bat) ? Math.min(100, Math.max(0, bat)) : 70;
  const r = 15;
  const c = 2 * Math.PI * r;
  const lab = String(n.name || "").replace(/^!/, "").slice(-4);
  return `<span class="mesh-pin ${on ? "on" : ""} ${n.port || ""}"><i class="halo"></i><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${r}" fill="none" stroke="#10202a" stroke-width="3"/><circle cx="22" cy="22" r="${r}" fill="none" stroke="${col}" stroke-width="3" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 22 22)"/><circle cx="22" cy="22" r="5.5" fill="${col}"/></svg><b>${lab}</b></span>`;
}

function satPin(s: Sat, on: boolean) {
  const lab = htxt((s.prn ? `${s.kind === "gps" ? "G" : s.kind.slice(0, 3).toUpperCase()}${s.prn}` : s.name).slice(0, 8));
  return `<span class="sat-pin ${s.kind} ${on ? "on" : ""}"><i></i><b>${lab}</b></span>`;
}

function mkIcon(html: string, cls: string, size: number) {
  return L.divIcon({
    className: cls,
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export type MapOverlay = {
  id: string;
  kind: "met" | "sig" | "wx" | "nm" | "arr" | string;
  lat?: number | null;
  lon?: number | null;
  ring?: [number, number][];
  color?: string;
  label?: string;
};

export type RainFrame = { time: number; tiles: string; path?: string; nowcast?: boolean };

export type RainSnap = {
  host?: string;
  now?: RainFrame | null;
  frames?: RainFrame[];
};

function overlayPin(o: MapOverlay, on: boolean) {
  const lab = htxt(String(o.label || o.kind).slice(0, 6));
  return `<span class="ov-pin ${o.kind} ${on ? "on" : ""}"><b>${lab}</b></span>`;
}

export function LiveBoardMap(props: {
  center: { lat: number; lon: number; zoom?: number };
  planes?: Plane[];
  gateways?: Gtw[];
  sensors?: Sensor[];
  mesh?: Sensor[];
  sats?: Sat[];
  overlays?: MapOverlay[];
  pick: string;
  onPick: (id: string) => void;
  showPlanes: boolean;
  showGtw: boolean;
  showSensors: boolean;
  showMesh?: boolean;
  showSats?: boolean;
  showBorder?: boolean;
  showFiled?: boolean;
  radio?: { lat: number; lon: number; n?: number } | null;
  rain?: RainSnap | null;
  showRain?: boolean;
  dronetagOps?: DronetagOp[];
  notams?: NotamItem[];
  weather?: WeatherStation[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const trails = useRef(new Map<string, L.LayerGroup>());
  const pickRef = useRef(props.onPick);
  pickRef.current = props.onPick;
  const lastCenter = useRef("");
  const centerRef = useRef(props.center);
  centerRef.current = props.center;
  const panned = useRef("");
  const borderRef = useRef<L.FeatureGroup | null>(null);
  const iconHtml = useRef(new Map<string, string>());
  const overlayRef = useRef<L.FeatureGroup | null>(null);
  const rainRef = useRef<L.TileLayer | null>(null);
  const rainUrl = useRef("");
  const trailCanvas = useRef<ReturnType<typeof createTrailCanvas> | null>(null);
  const [zoom, setZoom] = useState(props.center.zoom || 8);

  // Modern interactive UI states
  const [showAsterixRadar, setShowAsterixRadar] = useState(true);
  const [altColorMode, setAltColorMode] = useState(true);
  const [showDronetagOps, setShowDronetagOps] = useState(true);
  const [showNotamZones, setShowNotamZones] = useState(true);
  const [showWeatherStations, setShowWeatherStations] = useState(true);
  const [activeStationId, setActiveStationId] = useState<RadarStationId>("puconci");

  // Redesigned NOTAM & Airspace Filter States
  const [notamFilterCategory, setNotamFilterCategory] = useState<"all" | "mil" | "ad" | "nav" | "obst">("all");
  const [notamOpacity, setNotamOpacity] = useState<number>(0.025);
  const [notamSearch, setNotamSearch] = useState<string>("");
  const [showNotamDrawer, setShowNotamDrawer] = useState<boolean>(false);

  // Cockpit HUD / PFD State
  const [hudPlane, setHudPlane] = useState<Plane | null>(null);

  const radarLayerRef = useRef<L.FeatureGroup | null>(null);
  const dronetagLayerRef = useRef<L.FeatureGroup | null>(null);
  const notamLayerRef = useRef<L.FeatureGroup | null>(null);
  const weatherLayerRef = useRef<L.FeatureGroup | null>(null);

  const activeStation = RADAR_STATIONS[activeStationId];

  // Picked plane details
  const pickedPlane = useMemo(() => {
    if (!props.pick) return null;
    return (props.planes || []).find((p) => p.id === props.pick) || null;
  }, [props.pick, props.planes]);

  const pickedPolar = useMemo(() => {
    if (!pickedPlane?.lat || !pickedPlane?.lon) return null;
    return calcPolar(activeStation, pickedPlane.lat, pickedPlane.lon);
  }, [pickedPlane, activeStation]);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: false, attributionControl: true }).setView(
      [props.center.lat, props.center.lon],
      props.center.zoom || 8,
    );
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16,
      attribution: "Tiles © Esri",
    }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16,
      opacity: 0.85,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    layers.current = L.layerGroup().addTo(map);
    trailCanvas.current = createTrailCanvas().addTo(map) as ReturnType<typeof createTrailCanvas>;
    mapRef.current = map;
    lastCenter.current = `${props.center.lat},${props.center.lon}`;
    let booted = false;
    const fit = () => {
      const el = map.getContainer();
      if (!el || el.clientHeight < 80 || el.clientWidth < 80) return;
      map.invalidateSize({ animate: false });
      if (!booted) {
        const c = centerRef.current;
        map.setView([c.lat, c.lon], c.zoom || 8, { animate: false });
        booted = true;
      }
    };
    map.whenReady(fit);
    const t = window.setTimeout(fit, 80);
    const t2 = window.setTimeout(fit, 320);
    const t3 = window.setTimeout(fit, 900);
    window.addEventListener("resize", fit);
    const ro = typeof ResizeObserver !== "undefined" && ref.current ? new ResizeObserver(fit) : null;
    if (ro && ref.current) ro.observe(ref.current);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("resize", fit);
      ro?.disconnect();
      map.off("zoomend", onZoom);
      trailCanvas.current?.remove();
      trailCanvas.current = null;
      map.remove();
      mapRef.current = null;
      markers.current.clear();
      trails.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const key = `${props.center.lat},${props.center.lon}`;
    if (!map || lastCenter.current === key) return;
    lastCenter.current = key;
    map.invalidateSize();
    map.setView([props.center.lat, props.center.lon], props.center.zoom || 8);
  }, [props.center.lat, props.center.lon, props.center.zoom]);

  // Border & Radio Coverage
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    borderRef.current?.remove();
    borderRef.current = null;
    if (!props.showBorder) return;
    const g = L.featureGroup().addTo(map);
    L.polygon(SI_OUTLINE, {
      color: "#3ee0c2",
      weight: 1.8,
      opacity: 0.95,
      fillColor: "#3ee0c2",
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(g);
    L.rectangle(
      [
        [43.9, 7.6],
        [49.15, 17.85],
      ],
      {
        color: "#6aa8ff",
        weight: 1,
        opacity: 0.35,
        dashArray: "6 7",
        fill: false,
        interactive: false,
      },
    ).addTo(g);
    borderRef.current = g;
    g.bringToBack();
    return () => {
      g.remove();
      if (borderRef.current === g) borderRef.current = null;
    };
  }, [props.showBorder]);

  // ASTERIX CAT 048 Radar Geometry Layer (Stations, Range Rings, Azimuth Radials, Polar Slant Line)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    radarLayerRef.current?.remove();
    radarLayerRef.current = null;
    if (!showAsterixRadar) return;

    const g = L.featureGroup().addTo(map);
    radarLayerRef.current = g;

    // 1. Radar Stations
    for (const st of Object.values(RADAR_STATIONS)) {
      const isSel = st.id === activeStationId;
      const html = `
        <div class="radar-station-pin">
          <svg width="28" height="28" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="14" fill="${isSel ? 'rgba(62,224,194,0.2)' : 'rgba(106,168,255,0.1)'}" stroke="${isSel ? '#3ee0c2' : '#6aa8ff'}" stroke-width="2"/>
            <circle cx="18" cy="18" r="4" fill="${isSel ? '#3ee0c2' : '#6aa8ff'}"/>
            <line x1="18" y1="4" x2="18" y2="32" stroke="${isSel ? '#3ee0c2' : '#6aa8ff'}" stroke-width="1.2" stroke-dasharray="2 2"/>
            <line x1="4" y1="18" x2="32" y2="18" stroke="${isSel ? '#3ee0c2' : '#6aa8ff'}" stroke-width="1.2" stroke-dasharray="2 2"/>
          </svg>
          <div class="radar-station-label">${st.id.toUpperCase()} SAC${st.sac}</div>
        </div>
      `;
      const m = L.marker([st.lat, st.lon], {
        icon: mkIcon(html, "radar-station-wrap", 54),
        zIndexOffset: 850,
      }).addTo(g);
      m.on("click", () => setActiveStationId(st.id));
    }

    // 2. Tactical Range Rings centered on active station
    const rings = [10, 25, 50, 80, 120];
    for (const r of rings) {
      const rMeters = r * 1852;
      L.circle([activeStation.lat, activeStation.lon], {
        radius: rMeters,
        color: "#3ee0c2",
        weight: r === 50 || r === 120 ? 1.4 : 0.8,
        opacity: r === 50 ? 0.45 : 0.25,
        dashArray: "4 8",
        fill: false,
        interactive: false,
      }).addTo(g);

      // Distance tag along 045° radial
      const latOffset = (r * 1852 * Math.cos(Math.PI / 4)) / 111320;
      const lonOffset = (r * 1852 * Math.sin(Math.PI / 4)) / (111320 * Math.cos((activeStation.lat * Math.PI) / 180));
      const lblHtml = `<div class="radar-ring-text">${r}NM</div>`;
      L.marker([activeStation.lat + latOffset, activeStation.lon + lonOffset], {
        icon: mkIcon(lblHtml, "radar-lbl-wrap", 34),
        interactive: false,
        zIndexOffset: 300,
      }).addTo(g);
    }

    // 3. Azimuth Radials (every 30°)
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg * Math.PI) / 180;
      const maxNm = 120;
      const latEnd = activeStation.lat + (maxNm * 1852 * Math.cos(rad)) / 111320;
      const lonEnd = activeStation.lon + (maxNm * 1852 * Math.sin(rad)) / (111320 * Math.cos((activeStation.lat * Math.PI) / 180));
      L.polyline([[activeStation.lat, activeStation.lon], [latEnd, lonEnd]], {
        color: "#3ee0c2",
        weight: deg % 90 === 0 ? 1.0 : 0.5,
        opacity: deg % 90 === 0 ? 0.35 : 0.15,
        dashArray: "2 6",
        interactive: false,
      }).addTo(g);

      // Radial label at tip
      const degStr = String(deg).padStart(3, "0") + "°";
      L.marker([latEnd, lonEnd], {
        icon: mkIcon(`<div class="radar-radial-text">${degStr}</div>`, "radial-lbl", 28),
        interactive: false,
        zIndexOffset: 250,
      }).addTo(g);
    }

    // 4. Polar Slant Line to picked aircraft
    if (pickedPlane?.lat && pickedPlane?.lon && pickedPolar) {
      L.polyline([[activeStation.lat, activeStation.lon], [pickedPlane.lat, pickedPlane.lon]], {
        color: "#3ee0c2",
        weight: 2.2,
        opacity: 0.95,
        dashArray: "6 6",
        interactive: false,
      }).addTo(g);

      // Polar readout badge at midpoint
      const midLat = (activeStation.lat + pickedPlane.lat) / 2;
      const midLon = (activeStation.lon + pickedPlane.lon) / 2;
      const badgeHtml = `
        <div class="polar-slant-badge">
          ρ: ${pickedPolar.rhoNm}NM (${pickedPolar.rhoKm}km) · θ: ${pickedPolar.thetaDeg}°<br/>
          X: ${pickedPolar.cartX}NM · Y: ${pickedPolar.cartY}NM
        </div>
      `;
      L.marker([midLat, midLon], {
        icon: mkIcon(badgeHtml, "polar-badge-wrap", 120),
        interactive: false,
        zIndexOffset: 920,
      }).addTo(g);
    }

    return () => {
      g.remove();
      if (radarLayerRef.current === g) radarLayerRef.current = null;
    };
  }, [showAsterixRadar, activeStationId, activeStation, pickedPlane?.lat, pickedPlane?.lon, pickedPolar]);

  // Dronetag Operations Layer (Real live drone airspace zones from api.dronetag.app)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    dronetagLayerRef.current?.remove();
    dronetagLayerRef.current = null;
    if (!showDronetagOps || !props.dronetagOps?.length) return;

    const g = L.featureGroup().addTo(map);
    dronetagLayerRef.current = g;

    for (const op of props.dronetagOps) {
      if (op.bbox) {
        const bounds: L.LatLngBoundsExpression = [
          [op.bbox.minLat, op.bbox.minLon],
          [op.bbox.maxLat, op.bbox.maxLon],
        ];
        L.rectangle(bounds, {
          color: "#ff8a3d",
          weight: 1.8,
          opacity: 0.85,
          dashArray: "5 5",
          fillColor: "#ff8a3d",
          fillOpacity: 0.12,
        })
          .bindPopup(`<b>DRONETAG OPERATION</b><br/>ID: ${op.id}<br/>Maker: ${op.maker || "UAS"}<br/>Status: ${op.status || "active"}`)
          .addTo(g);
      }
      if (op.centerLat && op.centerLon) {
        const pinHtml = `
          <div class="dronetag-ops-pin">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="1.5"/></svg>
            ${op.maker || "DRONE"}
          </div>
        `;
        L.marker([op.centerLat, op.centerLon], {
          icon: mkIcon(pinHtml, "dronetag-pin-wrap", 70),
          zIndexOffset: 700,
        })
          .bindPopup(`<b>DRONETAG LIVE OP</b><br/>ID: ${op.id}<br/>Sensor: ${op.sensorId || "RID"}<br/>Time: ${op.timeCreated || ""}`)
          .addTo(g);
      }
    }

    return () => {
      g.remove();
      if (dronetagLayerRef.current === g) dronetagLayerRef.current = null;
    };
  }, [showDronetagOps, props.dronetagOps]);

  // NOTAM Danger Zones Layer (Slovenia Control KZPS)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    notamLayerRef.current?.remove();
    notamLayerRef.current = null;
    if (!showNotamZones || !props.notams?.length) return;

    const g = L.featureGroup().addTo(map);
    notamLayerRef.current = g;

    // Filter NOTAMs by category and keyword search
    const filteredNotams = props.notams.filter((n) => {
      if (notamSearch) {
        const q = notamSearch.toLowerCase();
        const matches =
          (n.location || "").toLowerCase().includes(q) ||
          (n.number || "").toLowerCase().includes(q) ||
          (n.text || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (notamFilterCategory === "mil") {
        return Boolean(n.isMilitary || n.series === "B" || /mil|danger|prohibit|restricted|tsa|tra/i.test(n.text || ""));
      }
      if (notamFilterCategory === "ad") {
        return Boolean(n.type === "AD" || /aerodrome|rwy|runway|taxiway|apron|twr/i.test(n.text || ""));
      }
      if (notamFilterCategory === "nav") {
        return Boolean(/vor|dme|ils|ndb|gnss|airway|route/i.test(n.text || ""));
      }
      if (notamFilterCategory === "obst") {
        return Boolean(/obst|crane|mast|tower|kite|uav|drone/i.test(n.text || ""));
      }
      return true;
    });

    // Deduplicate NOTAM circles by location and radius to prevent compounding opacity blobs
    const grouped = new Map<string, { lat: number; lon: number; radiusKm: number; isMil: boolean; notams: any[] }>();

    for (const n of filteredNotams) {
      if (!n.geoCircle?.lat || !n.geoCircle?.lon) continue;
      const key = `${n.geoCircle.lat.toFixed(3)}_${n.geoCircle.lon.toFixed(3)}_${(n.geoCircle.radiusKm || 5).toFixed(1)}`;
      const isMil = n.isMilitary || n.series === "B";
      if (!grouped.has(key)) {
        grouped.set(key, {
          lat: n.geoCircle.lat,
          lon: n.geoCircle.lon,
          radiusKm: n.geoCircle.radiusKm || 5,
          isMil,
          notams: [n],
        });
      } else {
        const item = grouped.get(key)!;
        if (isMil) item.isMil = true;
        item.notams.push(n);
      }
    }

    for (const item of grouped.values()) {
      const col = item.isMil ? "#ff4d4d" : "#ff8a3d";
      const count = item.notams.length;
      const title = count > 1 ? `${count} NOTAMs (${item.notams.map((x) => x.number).slice(0, 3).join(", ")}${count > 3 ? "..." : ""})` : `KZPS NOTAM ${item.notams[0].number || ""}`;

      const popupHtml = `
        <div style="max-height: 240px; overflow-y: auto; font-size: 11px; line-height: 1.4;">
          <div style="font-weight: 700; color: ${col}; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; margin-bottom: 6px;">
            ${item.isMil ? "🔴 MILITARY / SPECIAL RESTRICTION" : "🟠 AIRSPACE NOTAM"} · ${item.radiusKm.toFixed(1)} km radius
          </div>
          ${item.notams
            .map(
              (n) => `
            <div style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.08);">
              <b>${n.number || ""}</b> <span style="color: #94a3b8;">(${n.lowerLimit || "000"} - ${n.upperLimit || "UNL"})</span><br/>
              <span style="color: #cbd5e1;">${htxt(n.text || "")}</span>
            </div>
          `,
            )
            .join("")}
        </div>
      `;

      L.circle([item.lat, item.lon], {
        radius: item.radiusKm * 1000,
        color: col,
        weight: 1.0,
        opacity: notamOpacity > 0 ? 0.35 : 0.1,
        dashArray: "4 6",
        fillColor: col,
        fillOpacity: notamOpacity,
      })
        .bindPopup(popupHtml)
        .addTo(g);

      const labelText = count > 1 ? `⚠ ${item.notams[0].location || "ZONE"} (${count})` : `⚠ ${item.notams[0].number || "NOTAM"}`;
      const pinHtml = `<div class="notam-pin" style="color:${col};border-color:${col};opacity:0.65;font-size:10px;padding:1px 4px;">${labelText}</div>`;
      L.marker([item.lat, item.lon], {
        icon: mkIcon(pinHtml, "notam-pin-wrap", 64),
        zIndexOffset: 150, // keep well below planes and radar blips
      })
        .bindPopup(popupHtml)
        .addTo(g);
    }

    return () => {
      g.remove();
      if (notamLayerRef.current === g) notamLayerRef.current = null;
    };
  }, [showNotamZones, props.notams, notamFilterCategory, notamOpacity, notamSearch]);

  // NOAA Aviation Weather (METAR/TAF) Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    weatherLayerRef.current?.remove();
    weatherLayerRef.current = null;
    if (!showWeatherStations || !props.weather?.length) return;

    const g = L.featureGroup().addTo(map);
    weatherLayerRef.current = g;

    for (const st of props.weather) {
      const fltCat = st.metar?.fltCat || "VFR";
      const temp = st.metar?.tempC != null ? `${st.metar.tempC}°C` : "";
      const wind = st.metar?.windSpeedKt != null ? `${st.metar.windSpeedKt}kt` : "";
      const pinHtml = `
        <div class="metar-wx-pin ${fltCat}">
          <b>${st.icao}</b>
          <span style="font-size:8px">${fltCat} ${temp} ${wind}</span>
        </div>
      `;
      L.marker([st.lat, st.lon], {
        icon: mkIcon(pinHtml, "metar-pin-wrap", 58),
        zIndexOffset: 750,
      })
        .bindPopup(`<b>${st.name} (${st.icao})</b><br/><b>Flight Cat:</b> ${fltCat}<br/><b>METAR:</b> <code>${st.metar?.raw || "N/A"}</code>`)
        .addTo(g);
    }

    return () => {
      g.remove();
      if (weatherLayerRef.current === g) weatherLayerRef.current = null;
    };
  }, [showWeatherStations, props.weather]);

  // Aircraft & Trails Updates
  useEffect(() => {
    const lg = layers.current;
    if (!lg) return;
    const seen = new Set<string>();
    const fire = (id: string) => pickRef.current(id);

    const upsert = (key: string, id: string, lat: number, lon: number, icon: L.DivIcon, z: number) => {
      seen.add(key);
      const html = String(icon.options.html || "");
      const prev = markers.current.get(key);
      if (!prev) {
        const m = L.marker([lat, lon], { icon, zIndexOffset: z, keyboard: true, riseOnHover: true })
          .on("click", (e) => {
            L.DomEvent.stop(e);
            fire(id);
          })
          .addTo(lg);
        markers.current.set(key, m);
        iconHtml.current.set(key, html);
        return;
      }
      const ll = prev.getLatLng();
      if (ll.lat !== lat || ll.lng !== lon) prev.setLatLng([lat, lon]);
      if (iconHtml.current.get(key) !== html) {
        prev.setIcon(icon);
        iconHtml.current.set(key, html);
      }
      prev.setZIndexOffset(z);
    };

    const trailJobs: TrailJob[] = [];
    if (props.showPlanes) {
      for (const p of props.planes || []) {
        if (!p.lat || !p.lon) continue;
        const key = `p:${p.id}`;
        const on = props.pick === p.id;
        const labeled = on || zoom >= 8;
        const showFiled = Boolean(props.showFiled) || on;
        const specialTrail =
          p.role === "heli" ||
          p.role === "bird" ||
          p.role === "uav" ||
          p.role === "echo" ||
          p.role === "soar" ||
          p.role === "glider" ||
          p.role === "balloon" ||
          p.role === "chute" ||
          p.role === "aero" ||
          p.role === "small" ||
          p.role === "ground" ||
          p.local ||
          p.taxi ||
          p.onDeck ||
          p.low ||
          p.fastLow ||
          p.src === "rid" ||
          p.src === "ogn";
        const moving = (Number(p.gs) || 0) >= 1.2 || (p.trail || []).length >= 2;
        const drawTrail = Boolean(p.lat && p.lon && !p.noPos && (on || moving || specialTrail || zoom >= 5));
        const raw = drawTrail ? pruneTrailPts(p.trail || []) : [];
        const hist = showFiled ? raw : raw.filter((x) => !isFiledRemain(x));
        const past = hist.filter((x) => !x.future);
        const last = past[past.length - 1];
        const tip: TrailPt[] =
          last && Math.abs(last.lat - p.lat) < 1e-6 && Math.abs(last.lon - p.lon) < 1e-6
            ? hist
            : [...past, { lat: p.lat, lon: p.lon, alt: p.altFt, at: Date.now() }, ...hist.filter((x) => x.future)];
        if (tip.length >= 2) {
          trailJobs.push({
            id: p.id,
            lat: p.lat,
            lon: p.lon,
            altFt: p.altFt,
            on,
            pts: tip,
            operator: p.operator,
          });
        }
        upsert(
          key,
          p.id,
          p.lat,
          p.lon,
          L.divIcon({
            className: `ac-wrap ${on ? "on" : ""} ${labeled ? "" : "bare"} ${isFlarm(p) ? "flarm" : ""} ${p.role === "bird" ? "bird" : ""} ${p.role === "echo" ? "echo" : ""} ${isFlock(p) ? "flock" : ""} ${p.role === "uav" || p.src === "rid" ? "hot-uav" : ""} ${p.taxi ? "taxi" : ""} ${p.fastLow ? "fast-low" : ""}`,
            html: planeMark(p, on, labeled, altColorMode),
            iconSize: isFlock(p)
              ? on
                ? [72, 48]
                : [52, 34]
              : p.role === "bird" || p.role === "echo"
                ? on
                  ? [36, 36]
                  : [22, 22]
                : isFlarm(p)
                  ? labeled
                    ? [72, 40]
                    : [14, 14]
                  : labeled
                    ? [110, 58]
                    : [28, 28],
            iconAnchor: isFlock(p)
              ? on
                ? [36, 22]
                : [26, 17]
              : p.role === "bird" || p.role === "echo"
                ? on
                  ? [18, 18]
                  : [11, 11]
                : isFlarm(p)
                  ? labeled
                    ? [44, 16]
                    : [7, 7]
                  : labeled
                    ? [55, 20]
                    : [14, 14],
          }),
          on ? 900 : p.role === "uav" || p.src === "rid" || p.role === "heli" || p.fastLow ? 780 : 600,
        );
        if (p.operator?.lat && p.operator?.lon) {
          upsert(
            `op:${p.id}`,
            p.id,
            p.operator.lat,
            p.operator.lon,
            mkIcon("<i></i><b>OP</b>", `op-pin ${on ? "on" : ""}`, 36),
            on ? 850 : 400,
          );
        }
      }
    }
    trailCanvas.current?.setJobs(trailJobs, zoom);

    if (props.showGtw) {
      for (const g of props.gateways || []) {
        if (!g.lat || !g.lon) continue;
        const on = props.pick === g.id;
        upsert(
          `g:${g.id}`,
          g.id,
          g.lat,
          g.lon,
          mkIcon("<i></i>", `dot gtw ${g.online ? "live" : "off"} ${on ? "on" : ""}`, 44),
          on ? 500 : 200,
        );
      }
    }

    if (props.showSensors) {
      for (const s of props.sensors || []) {
        if (!s.lat || !s.lon || s.kind === "mesh") continue;
        const on = props.pick === s.id;
        upsert(
          `s:${s.id}`,
          s.id,
          s.lat,
          s.lon,
          mkIcon("<i></i>", `dot ${s.kind} ${s.occ ? "occ" : ""} ${on ? "on" : ""}`, 44),
          on ? 900 : 400,
        );
      }
    }

    if (props.showMesh) {
      for (const n of props.mesh || []) {
        if (!n.lat || !n.lon) continue;
        const key = `m:${n.id}`;
        const on = props.pick === n.id;
        const pts = n.trail || [];
        let tlg = trails.current.get(key);
        if (!tlg) {
          tlg = L.layerGroup().addTo(lg);
          trails.current.set(key, tlg);
        }
        tlg.clearLayers();
        if (pts.length > 1) {
          L.polyline(
            pts.map((p) => [p.lat, p.lon] as [number, number]),
            { color: "#c77dff", weight: 2.4, opacity: 0.55, lineCap: "round", interactive: false },
          ).addTo(tlg);
        }
        upsert(key, n.id, n.lat, n.lon, mkIcon(meshPin(n, on), `mesh-wrap ${on ? "on" : ""}`, 52), on ? 950 : 700);
      }
    }

    if (props.showSats) {
      for (const s of props.sats || []) {
        if (!s.lat || !s.lon) continue;
        const on = props.pick === s.id;
        upsert(
          `sat:${s.id}`,
          s.id,
          s.lat,
          s.lon,
          mkIcon(satPin(s, on), `sat-wrap ${on ? "on" : ""}`, 56),
          on ? 800 : 350,
        );
      }
    }

    for (const [key, m] of markers.current) {
      if (seen.has(key)) continue;
      m.remove();
      markers.current.delete(key);
      iconHtml.current.delete(key);
      const t = trails.current.get(key);
      if (t) {
        t.remove();
        trails.current.delete(key);
      }
    }
    for (const [key, t] of trails.current) {
      if (seen.has(key)) continue;
      t.remove();
      trails.current.delete(key);
    }

    if (props.pick && panned.current !== props.pick) {
      const hit =
        markers.current.get(`sat:${props.pick}`) ||
        markers.current.get(`m:${props.pick}`) ||
        markers.current.get(`s:${props.pick}`) ||
        markers.current.get(`p:${props.pick}`) ||
        markers.current.get(`g:${props.pick}`);
      const map = mapRef.current;
      if (hit && map) {
        const ll = hit.getLatLng();
        if (!map.getBounds().pad(-0.12).contains(ll)) map.panTo(ll, { animate: true });
        panned.current = props.pick;
      }
    }
    if (!props.pick) panned.current = "";
  }, [zoom, props.planes, props.gateways, props.sensors, props.mesh, props.sats, props.pick, props.showPlanes, props.showGtw, props.showSensors, props.showMesh, props.showSats, props.showFiled, altColorMode]);

  // RainViewer Radar Tiles
  useEffect(() => {
    const map = mapRef.current;
    const latest = props.rain?.now?.tiles || props.rain?.frames?.at(-1)?.tiles || "";
    if (!map || !props.showRain || !latest) {
      rainRef.current?.remove();
      rainRef.current = null;
      rainUrl.current = "";
      return;
    }
    if (!rainRef.current) {
      rainRef.current = L.tileLayer(latest, {
        opacity: 0.52,
        maxNativeZoom: 7,
        maxZoom: 16,
        tileSize: 256,
        zIndex: 350,
        className: "rv-radar",
        attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>',
      }).addTo(map);
      rainUrl.current = latest;
      return;
    }
    if (rainUrl.current !== latest) {
      rainRef.current.setUrl(latest);
      rainUrl.current = latest;
    }
  }, [props.rain?.now?.tiles, props.showRain]);

  return (
    <div className="map-wrap">
      {/* Floating Modern Tactical Toolbar */}
      <div className="map-toolbar">
        <button
          type="button"
          className={`map-tool-btn ${showAsterixRadar ? "active" : ""}`}
          onClick={() => setShowAsterixRadar(!showAsterixRadar)}
        >
          <span className="dot-ind" />
          📡 ASTX RADAR
        </button>
        <button
          type="button"
          className={`map-tool-btn ${altColorMode ? "active" : ""}`}
          onClick={() => setAltColorMode(!altColorMode)}
        >
          <span className="dot-ind" />
          🌈 ALT GRADIENT
        </button>
        <button
          type="button"
          className={`map-tool-btn ${showDronetagOps ? "active" : ""}`}
          onClick={() => setShowDronetagOps(!showDronetagOps)}
        >
          <span className="dot-ind" />
          🛸 DRONETAG ({props.dronetagOps?.length || 0})
        </button>
        <button
          type="button"
          className={`map-tool-btn ${showNotamZones ? "active" : ""}`}
          onClick={() => setShowNotamZones(!showNotamZones)}
        >
          <span className="dot-ind" />
          ⚠️ NOTAM ({props.notams?.length || 0})
        </button>
        <button
          type="button"
          className={`map-tool-btn ${showNotamDrawer ? "active" : ""}`}
          onClick={() => setShowNotamDrawer(!showNotamDrawer)}
          title="Airspace restrictions, NOTAM categories and opacity filter"
        >
          <span className="dot-ind" />
          ⚙️ NOTAM FILTERS
        </button>
        <button
          type="button"
          className={`map-tool-btn ${showWeatherStations ? "active" : ""}`}
          onClick={() => setShowWeatherStations(!showWeatherStations)}
        >
          <span className="dot-ind" />
          🌦️ METAR ({props.weather?.length || 0})
        </button>
      </div>

      {/* Floating Tactical Airspace Restriction & NOTAM Filter Drawer */}
      {showNotamDrawer && (
        <div
          style={{
            position: "absolute",
            top: "54px",
            left: "14px",
            zIndex: 1000,
            width: "360px",
            maxHeight: "80vh",
            background: "rgba(10, 16, 26, 0.95)",
            border: "1px solid rgba(255, 138, 61, 0.4)",
            borderRadius: "8px",
            padding: "14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
            backdropFilter: "blur(8px)",
            color: "#e2e8f0",
            fontFamily: "monospace",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 800, color: "#ff8a3d" }}>
              ⚠️ AIRSPACE RESTRICTION & NOTAM FILTERS
            </span>
            <button
              type="button"
              onClick={() => setShowNotamDrawer(false)}
              style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "14px", fontWeight: 700 }}
            >
              ✕
            </button>
          </div>

          {/* Opacity slider */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
              <span style={{ color: "#94a3b8" }}>CIRCLE FILL OPACITY:</span>
              <b style={{ color: "#ff8a3d" }}>{(notamOpacity * 100).toFixed(1)}%</b>
            </div>
            <input
              type="range"
              min="0"
              max="0.30"
              step="0.005"
              value={notamOpacity}
              onChange={(e) => setNotamOpacity(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#ff8a3d" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#64748b" }}>
              <span>0% (Outline only)</span>
              <span>2.5% (Crystal clear)</span>
              <span>30% (High contrast)</span>
            </div>
          </div>

          {/* Category Chips */}
          <div>
            <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "6px" }}>CATEGORY:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {[
                { id: "all", label: "ALL NOTAMS" },
                { id: "mil", label: "🔴 MILITARY / DANGER" },
                { id: "ad", label: "🛫 AERODROME / RWY" },
                { id: "nav", label: "📡 NAVAID / ROUTE" },
                { id: "obst", label: "🏗️ OBSTACLES" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setNotamFilterCategory(cat.id as any)}
                  style={{
                    background: notamFilterCategory === cat.id ? "rgba(255, 138, 61, 0.25)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${notamFilterCategory === cat.id ? "#ff8a3d" : "rgba(255,255,255,0.1)"}`,
                    color: notamFilterCategory === cat.id ? "#ff8a3d" : "#94a3b8",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Input */}
          <div>
            <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>KEYWORD / LOCATION SEARCH:</div>
            <input
              type="text"
              value={notamSearch}
              onChange={(e) => setNotamSearch(e.target.value)}
              placeholder="e.g. LJMB, LJLJ, LJCE, TSA, PARAGLIDING..."
              style={{
                width: "100%",
                background: "#050911",
                border: "1px solid #334155",
                borderRadius: "4px",
                color: "#ff8a3d",
                padding: "4px 8px",
                fontSize: "11px",
                fontFamily: "monospace",
              }}
            />
          </div>

          {/* Active NOTAMs Quick List */}
          <div style={{ flex: 1, overflowY: "auto", maxHeight: "240px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "8px" }}>
            <div style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "6px" }}>
              MATCHING NOTAMS ({(props.notams || []).filter((n) => {
                if (notamSearch) {
                  const q = notamSearch.toLowerCase();
                  return (n.text || "").toLowerCase().includes(q) || (n.location || "").toLowerCase().includes(q) || (n.number || "").toLowerCase().includes(q);
                }
                if (notamFilterCategory === "mil") return Boolean(n.isMilitary || n.series === "B");
                return true;
              }).length}):
            </div>
            {(props.notams || [])
              .filter((n) => {
                if (notamSearch) {
                  const q = notamSearch.toLowerCase();
                  if (!((n.text || "").toLowerCase().includes(q) || (n.location || "").toLowerCase().includes(q) || (n.number || "").toLowerCase().includes(q))) {
                    return false;
                  }
                }
                if (notamFilterCategory === "mil") return Boolean(n.isMilitary || n.series === "B");
                return true;
              })
              .slice(0, 15)
              .map((n, i) => (
                <div
                  key={i}
                  style={{
                    padding: "6px",
                    marginBottom: "4px",
                    background: "rgba(0,0,0,0.3)",
                    borderLeft: `2px solid ${n.isMilitary || n.series === "B" ? "#ff4d4d" : "#ff8a3d"}`,
                    borderRadius: "2px",
                    fontSize: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span style={{ color: n.isMilitary || n.series === "B" ? "#ff4d4d" : "#ff8a3d" }}>
                      {n.number || "NOTAM"} · {n.location || "KZPS"}
                    </span>
                    {n.geoCircle?.lat && n.geoCircle?.lon && (
                      <button
                        type="button"
                        onClick={() => {
                          const map = mapRef.current;
                          if (map && n.geoCircle?.lat && n.geoCircle?.lon) {
                            map.flyTo([n.geoCircle.lat, n.geoCircle.lon], 11, { duration: 1.2 });
                          }
                        }}
                        style={{
                          background: "rgba(255, 138, 61, 0.2)",
                          border: "1px solid #ff8a3d",
                          color: "#ff8a3d",
                          padding: "1px 6px",
                          borderRadius: "2px",
                          fontSize: "9px",
                          cursor: "pointer",
                        }}
                      >
                        FLY TO
                      </button>
                    )}
                  </div>
                  <div style={{ color: "#94a3b8", marginTop: "2px" }}>
                    {n.lowerLimit || "000"} - {n.upperLimit || "UNL"}
                  </div>
                  <div style={{ color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {n.text}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Floating Tactical ASTERIX CAT 048 HUD Overlay */}
      {showAsterixRadar && (
        <div className="asterix-map-hud">
          <div className="hud-header">
            <span className="hud-title">
              <span className="live-blip" />
              ASTERIX CAT 048 · {activeStation.id.toUpperCase()}
            </span>
            <span style={{ fontSize: "10px", color: "#3ee0c2", fontWeight: 700 }}>
              SAC {activeStation.sac} / SIC {activeStation.sic}
            </span>
          </div>

          <div className="hud-grid">
            <div className="hud-item">
              <span className="hud-label">AIR TARGETS</span>
              <span className="hud-val cyan">{props.planes?.length || 0} TRACKS</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">RADAR STATION</span>
              <span className="hud-val amber">{activeStation.name.split(" ")[0]} ({activeStation.altM}m)</span>
            </div>
            {pickedPlane && pickedPolar ? (
              <>
                <div className="hud-item">
                  <span className="hud-label">SELECTED CALLSIGN</span>
                  <span className="hud-val coral">{callsign(pickedPlane)} ({pickedPlane.id.toUpperCase()})</span>
                </div>
                <div className="hud-item">
                  <span className="hud-label">MODE 3/A SQUAWK</span>
                  <span className="hud-val cyan">{pickedPlane.squawk || "7000"}</span>
                </div>
                <div className="hud-item">
                  <span className="hud-label">POLAR SLANT RANGE (ρ)</span>
                  <span className="hud-val cyan">{pickedPolar.rhoNm} NM ({pickedPolar.rhoKm} km)</span>
                </div>
                <div className="hud-item">
                  <span className="hud-label">AZIMUTH BEARING (θ)</span>
                  <span className="hud-val cyan">{pickedPolar.thetaDeg}°</span>
                </div>
                <div className="hud-item">
                  <span className="hud-label">CARTESIAN X / Y</span>
                  <span className="hud-val amber">X:{pickedPolar.cartX} NM · Y:{pickedPolar.cartY} NM</span>
                </div>
                <div className="hud-item">
                  <span className="hud-label">BARO ALT / FLIGHT LEVEL</span>
                  <span className="hud-val amber">{pickedPlane.altFt ? `FL${Math.round(pickedPlane.altFt / 100)} (${pickedPlane.altFt} ft)` : "GND"}</span>
                </div>
                <div className="hud-item">
                  <span className="hud-label">GROUND SPEED</span>
                  <span className="hud-val">{Math.round(pickedPlane.gs || 0)} KT</span>
                </div>
                <div className="hud-item">
                  <span className="hud-label">TRACK HEADING</span>
                  <span className="hud-val">{Math.round(pickedPlane.track || 0)}°</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHudPlane(pickedPlane)}
                  style={{
                    gridColumn: "1 / -1",
                    marginTop: "6px",
                    background: "linear-gradient(135deg, rgba(0, 255, 102, 0.25), rgba(0, 255, 102, 0.05))",
                    border: "1px solid #00ff66",
                    color: "#00ff66",
                    borderRadius: "4px",
                    padding: "6px 10px",
                    fontSize: "11px",
                    fontWeight: 900,
                    letterSpacing: "1px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    boxShadow: "0 0 10px rgba(0,255,102,0.3)",
                  }}
                >
                  🕹️ ENGAGE 3D COCKPIT HUD / PFD AVIONICS
                </button>
              </>
            ) : (
              <div className="hud-item" style={{ gridColumn: "1 / -1" }}>
                <span className="hud-label">TARGET INTERROGATION</span>
                <span style={{ fontSize: "10px", color: "#728a9c" }}>
                  Click any aircraft on the map to display real-time polar slant vector (ρ, θ) and ASTERIX CAT 048 data block.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Altitude Gradient Legend Bar */}
      {altColorMode && (
        <div className="alt-legend-bar">
          <span className="alt-legend-title">ALTITUDE GRADIENT (30-MIN RETENTION)</span>
          <div className="alt-gradient-strip" />
          <div className="alt-legend-stops">
            <span>0′</span>
            <span>3.5k</span>
            <span>8k</span>
            <span>16k</span>
            <span>24k</span>
            <span>32k</span>
            <span>FL420+</span>
          </div>
        </div>
      )}

      {/* 3D Cockpit HUD / Primary Flight Display (PFD) Overlay */}
      {hudPlane && (
        <CockpitHudOverlay
          plane={{
            id: hudPlane.id,
            callsign: callsign(hudPlane),
            lat: hudPlane.lat,
            lon: hudPlane.lon,
            alt: (hudPlane as any).altFt || ((hudPlane as any).altM ? Math.round((hudPlane as any).altM * 3.28084) : 0),
            speed: (hudPlane as any).gs || ((hudPlane as any).speedKmh ? Math.round((hudPlane as any).speedKmh * 0.539957) : 0),
            track: hudPlane.track || 0,
            vrate: (hudPlane as any).vrate || 0,
            squawk: hudPlane.squawk,
            model: (hudPlane as any).model || (hudPlane as any).typecode,
            origin: (hudPlane as any).origin,
            dest: (hudPlane as any).dest,
            isMil: (hudPlane as any).mil || (hudPlane as any).isMil,
          }}
          onClose={() => setHudPlane(null)}
        />
      )}

      <div className="omap" ref={ref} role="presentation" />
    </div>
  );
}
