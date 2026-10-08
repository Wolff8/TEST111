export type Pt = { t: number; v: number };

export function Spark(props: {
  pts: Pt[];
  color?: string;
  unit?: string;
  height?: number;
  interactive?: boolean;
}) {
  const pts = props.pts || [];
  const h = props.height || 72;
  const color = props.color || "#3ee0c2";
  const w = 320;
  if (pts.length < 2) return <p className="note">No live samples yet.</p>;
  const vs = pts.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = 8 + (1 - (p.v - min) / span) * (h - 16);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = pts[pts.length - 1];
  return (
    <figure className="spark">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="live series">
        <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={w} cy={8 + (1 - (last.v - min) / span) * (h - 16)} r="3.2" fill={color} />
      </svg>
      <figcaption>
        <b>
          {Number.isFinite(last.v) ? last.v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"} {props.unit || ""}
        </b>
        <small>
          {min.toFixed(1)}–{max.toFixed(1)} · {pts.length} pts
        </small>
      </figcaption>
    </figure>
  );
}

export function LiveGraph(props: { pts: Pt[]; color?: string; unit?: string; title?: string }) {
  const pts = props.pts || [];
  const color = props.color || "#3ee0c2";
  const w = 520;
  const h = 140;
  if (pts.length < 2) return <p className="note">No live history for this channel.</p>;
  const vs = pts.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const xy = pts.map((p, i) => ({
    x: (i / (pts.length - 1)) * w,
    y: 18 + (1 - (p.v - min) / span) * (h - 36),
    ...p,
  }));
  const d = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <div className="livegraph">
      <header>
        <small>{props.title || "SERIES"}</small>
        <strong>
          {xy[xy.length - 1].v.toLocaleString("en-US", { maximumFractionDigits: 2 })} {props.unit || ""}
        </strong>
      </header>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <path d={d} fill="none" stroke={color} strokeWidth="2.4" />
      </svg>
      <small>
        {new Date(pts[0].t).toISOString().slice(11, 16)}Z → {new Date(pts[pts.length - 1].t).toISOString().slice(11, 16)}Z
      </small>
    </div>
  );
}
