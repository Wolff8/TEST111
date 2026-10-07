/** Continuous altitude colour. Stepped bands felt flat; lerp gives a 3D height cue. */

export const ALT_STOPS = [
  { ft: 0, color: "#ff4d4d" },
  { ft: 1000, color: "#ff6a42" },
  { ft: 3500, color: "#ff8a3d" },
  { ft: 8000, color: "#f5d742" },
  { ft: 16000, color: "#7ee05a" },
  { ft: 24000, color: "#3ee07a" },
  { ft: 32000, color: "#3ee0c2" },
  { ft: 42000, color: "#6aa8ff" },
];

function hexRgb(h) {
  const s = String(h || "").replace("#", "");
  if (s.length < 6) return [106, 168, 255];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function rgbHex(r, g, b) {
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("")}`;
}

export function altColor(ft) {
  const a = Math.max(0, Number(ft) || 0);
  const stops = ALT_STOPS;
  if (a <= stops[0].ft) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    if (a > stops[i].ft) continue;
    const span = Math.max(1, stops[i].ft - stops[i - 1].ft);
    const t = (a - stops[i - 1].ft) / span;
    const A = hexRgb(stops[i - 1].color);
    const B = hexRgb(stops[i].color);
    return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  return stops[stops.length - 1].color;
}
