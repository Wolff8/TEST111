import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Gtw, Plane, Sat, Sensor } from "../lib";
import { SI_OUTLINE, identLabel } from "../lib";
import { createTrailCanvas, type TrailJob } from "../trail-canvas";
import type { TrailPt } from "../trail-draw";

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

const TRAIL_MAX_MS = 30 * 60_000;

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

function planeMark(p: Plane, on: boolean, label: boolean) {
  const col = isDji(p)
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
  return `<span class="ac-mark ${on ? "on" : ""} ${label ? "" : "bare"} ${isUid(p) ? "uid" : ""} ${p.heard ? "heard" : ""} ${p.nm || p.src === "nm" ? "nm" : ""} ${p.fpl || p.ifps || p.src === "fpl" ? "fpl" : ""} ${p.role} ${isFlock(p) ? "flock" : ""} ${isDji(p) ? "dji" : ""} ${isFlarm(p) ? "flarm" : ""}">${planeSvg(p, col)}${label && p.role !== "bird" && p.role !== "echo" ? `<b class="cs">${callsign(p)}</b>` : ""}</span>`;
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
    return `<span class="ac glider" style="--c:${c};--r:${rot}deg"><svg viewBox="0 0 40 24" aria-hidden="true"><path fill="${c}" d="M2 12h36L20 8z"/><path fill="${c}" d="M18 8h4v12h-4z"/><path fill="${c}" d="M16 18h8l-4 4z"/></svg></span>`;
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
        opacity: 0.4,
        dashArray: "6 7",
        fill: false,
        interactive: false,
      },
    ).addTo(g);
    L.circle([46.12, 14.82], {
      radius: 280 * 1852,
      color: "#3ee0c2",
      weight: 1,
      opacity: 0.18,
      dashArray: "2 10",
      fill: false,
      interactive: false,
    }).addTo(g);
    if (props.radio?.lat && props.radio?.lon) {
      L.circle([props.radio.lat, props.radio.lon], {
        radius: 220_000,
        color: "#f5d742",
        weight: 1.4,
        opacity: 0.55,
        dashArray: "4 6",
        fillColor: "#f5d742",
        fillOpacity: 0.04,
        interactive: false,
      }).addTo(g);
    }
    borderRef.current = g;
    g.bringToBack();
    return () => {
      g.remove();
      if (borderRef.current === g) borderRef.current = null;
    };
  }, [props.showBorder, props.radio?.lat, props.radio?.lon]);

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
            html: planeMark(p, on, labeled),
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
  }, [zoom, props.planes, props.gateways, props.sensors, props.mesh, props.sats, props.pick, props.showPlanes, props.showGtw, props.showSensors, props.showMesh, props.showSats, props.showFiled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    overlayRef.current?.remove();
    const g = L.featureGroup().addTo(map);
    overlayRef.current = g;
    const fire = (id: string) => pickRef.current(id);
    for (const o of props.overlays || []) {
      const on = props.pick === o.id;
      const col = o.color || (o.kind === "sig" ? "#ff5d5d" : o.kind === "wx" ? "#f5b942" : o.kind === "met" ? "#3ee07a" : "#6aa8ff");
      if (o.ring && o.ring.length >= 3) {
        const poly = L.polygon(o.ring as L.LatLngExpression[], {
          color: col,
          weight: on ? 2.6 : 1.6,
          opacity: on ? 0.95 : 0.7,
          fillColor: col,
          fillOpacity: on ? 0.22 : 0.1,
        });
        (poly as L.Polygon & { _ovId?: string })._ovId = o.id;
        poly.on("click", (e) => {
          L.DomEvent.stop(e);
          fire(o.id);
        });
        poly.addTo(g);
      }
      if (Number.isFinite(o.lat) && Number.isFinite(o.lon)) {
        const m = L.marker([Number(o.lat), Number(o.lon)], {
          icon: mkIcon(overlayPin(o, on), `ov-wrap ${o.kind} ${on ? "on" : ""}`, on ? 52 : 40),
          zIndexOffset: on ? 980 : 500,
          keyboard: true,
          riseOnHover: true,
        }).on("click", (e) => {
          L.DomEvent.stop(e);
          fire(o.id);
        });
        (m as L.Marker & { _ovId?: string })._ovId = o.id;
        m.addTo(g);
      }
    }
    if (!props.pick) panned.current = "";
    if (props.pick && panned.current !== props.pick) {
      let fitted = false;
      g.eachLayer((ly) => {
        const id = (ly as L.Layer & { _ovId?: string })._ovId;
        if (id !== props.pick || !(ly instanceof L.Polygon)) return;
        const b = ly.getBounds();
        if (b.isValid()) {
          map.fitBounds(b.pad(0.18), { animate: true, maxZoom: 9 });
          fitted = true;
          panned.current = props.pick;
        }
      });
      if (!fitted) {
        const hit = (props.overlays || []).find((o) => o.id === props.pick);
        if (hit?.lat && hit?.lon) {
          map.panTo([hit.lat, hit.lon], { animate: true });
          panned.current = props.pick;
        }
      }
    }
    return () => {
      g.remove();
      if (overlayRef.current === g) overlayRef.current = null;
    };
  }, [props.overlays, props.pick]);

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

  return <div className="omap" ref={ref} role="presentation" />;
}
