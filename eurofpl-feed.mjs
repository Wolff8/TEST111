const TRACK = "https://tracking.eurofpl.eu/pre_tracker.php";

export function parseEurofplHtml(html) {
  const t = String(html || "");
  if (!t) return null;
  const ident = t.match(
    /<strong>([A-Z0-9]{3,8})<\/strong>\s*\(Type:\s*([A-Z0-9-]+)\)[\s\S]{0,400}?<strong>([A-Z]{4})<\/strong>[\s\S]{0,400}?<strong>([A-Z]{4})<\/strong>/i,
  );
  const pts = [];
  const re = /push(?:Point|Plane)\(\s*([-+0-9.]+)\s*,\s*([-+0-9.]+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;
  let m;
  while ((m = re.exec(t))) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) continue;
    const fl = Number(m[4]);
    const gs = Number(m[5]);
    const track = Number(m[6]);
    pts.push({
      lat,
      lon,
      altFt: Number.isFinite(fl) ? (fl <= 600 ? fl * 100 : fl) : 0,
      gs: Number.isFinite(gs) ? gs : 0,
      track: Number.isFinite(track) ? track : 0,
      clock: m[3],
      current: /pushPlane/.test(m[0]),
    });
  }
  if (!pts.length) return null;
  const here = [...pts].reverse().find((p) => p.current) || pts[pts.length - 1];
  return {
    flight: ident ? ident[1].toUpperCase() : "",
    typecode: ident ? ident[2].toUpperCase() : "",
    dep: ident ? ident[3].toUpperCase() : "",
    dest: ident ? ident[4].toUpperCase() : "",
    lat: here.lat,
    lon: here.lon,
    altFt: here.altFt,
    gs: here.gs,
    track: here.track,
    trail: pts.map((p) => ({ lat: p.lat, lon: p.lon, alt: p.altFt })),
    src: "fpl",
    at: Date.now(),
  };
}

export async function fetchEurofplCode(code, ms = 12_000) {
  const c = String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  if (c.length < 3 || c.length > 40) throw new Error("confirmation code required");
  const body = new URLSearchParams({ confirmCode: c, confirmSubmit: "Enter" });
  const r = await fetch(TRACK, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
      "user-agent": "OpsLiveDash/1.0",
    },
    body,
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`eurofpl ${r.status}`);
  const html = await r.text();
  const rec = parseEurofplHtml(html);
  if (!rec) throw new Error("no track for that code");
  rec.code = c;
  return rec;
}
