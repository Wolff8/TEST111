import L from "leaflet";
import type { Plane } from "./lib";
import { altColor, fadeTrailOpacity } from "./lib";
import { prepareTrail, type TrailPt } from "./trail-draw";

export type TrailJob = {
  id: string;
  lat: number;
  lon: number;
  altFt: number;
  on: boolean;
  pts: TrailPt[];
  operator?: { lat: number; lon: number } | null;
};

type TrailCanvas = L.Layer & {
  setJobs: (jobs: TrailJob[], zoom: number) => void;
};

export function createTrailCanvas(): TrailCanvas {
  let jobs: TrailJob[] = [];
  let zoom = 8;
  let canvas: HTMLCanvasElement | null = null;
  let map: L.Map | null = null;
  let dpr = 1;
  let fadeTimer = 0;

  function reset() {
    if (!map || !canvas) return;
    const size = map.getSize();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(size.x * dpr));
    canvas.height = Math.max(1, Math.round(size.y * dpr));
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    paint();
  }

  function paint() {
    if (!map || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.miterLimit = 2;
    const now = Date.now();
    const bounds = map.getBounds().pad(0.2);

    for (const job of jobs) {
      const runs = prepareTrail(job.pts, zoom);
      for (const run of runs) {
        if (run.length < 2) continue;
        const fut = Boolean(run[0].future);
        const n = Math.max(2, run.length);
        for (let i = 1; i < run.length; i++) {
          const a = run[i - 1];
          const b = run[i];
          if (!bounds.contains([a.lat, a.lon]) && !bounds.contains([b.lat, b.lon])) continue;
          const pa = map.latLngToContainerPoint([a.lat, a.lon]);
          const pb = map.latLngToContainerPoint([b.lat, b.lon]);
          const alt = ((Number(a.alt) || 0) + (Number(b.alt) || job.altFt)) / 2;
          const near = Math.max(0, 1 - Math.min(alt, 36000) / 36000);
          const age = b.at ? now - b.at : ((n - i) / n) * 15 * 60_000;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.strokeStyle = fut ? "#9ad0ff" : altColor(alt);
          ctx.globalAlpha = fut ? (job.on ? 0.72 : 0.38) : fadeTrailOpacity(age, job.on);
          ctx.lineWidth = fut ? 1.8 : 2.05 + 0.7 * near;
          ctx.setLineDash(fut ? [5, 6] : []);
          ctx.stroke();
        }
      }
      if (job.operator?.lat && job.operator?.lon) {
        const pa = map.latLngToContainerPoint([job.lat, job.lon]);
        const pb = map.latLngToContainerPoint([job.operator.lat, job.operator.lon]);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.strokeStyle = "#ff8a3d";
        ctx.globalAlpha = job.on ? 0.85 : 0.35;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  const Layer = L.Layer.extend({
    onAdd(m: L.Map) {
      map = m;
      canvas = L.DomUtil.create("canvas", "ac-trails leaflet-zoom-hide") as HTMLCanvasElement;
      canvas.style.pointerEvents = "none";
      const pane = m.getPane("overlayPane") || m.getPanes().overlayPane;
      pane.appendChild(canvas);
      m.on("moveend zoomend viewreset", reset);
      fadeTimer = window.setInterval(paint, 5000);
      reset();
    },
    onRemove(m: L.Map) {
      m.off("moveend zoomend viewreset", reset);
      if (fadeTimer) window.clearInterval(fadeTimer);
      fadeTimer = 0;
      if (canvas) L.DomUtil.remove(canvas);
      canvas = null;
      map = null;
    },
    setJobs(next: TrailJob[], z: number) {
      jobs = next;
      zoom = z;
      if (map && canvas) {
        L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
        paint();
      }
    },
  });

  return new Layer() as TrailCanvas;
}
