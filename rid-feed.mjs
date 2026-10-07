/** Direct Remote ID is a local BLE/Wi-Fi broadcast. There is no public EU RID GeoJSON dump.
 * ASTM F3411 / EN 4709-002 + DJI CTA-2063 (1581F…) can be recognized when a receiver POSTs. */

/** DJI's ANSI CTA-2063 manufacturer code used on OpenDroneID Basic ID. */
export const DJI_CTA_RE = /^1581F/i;
const DJI_NAME_RE = /\b(dji|mavic|mini\s*[234]|air\s*[23s]|avata|neo|phantom|inspire|matrice|agras|mini\s*pro|flip)\b/i;
const DJI_SSID_RE = /^(MAVIC|MINI-|AIR-|DJI-|PHANTOM|AVATA|NEO-|INSPIRE|MATRICE)/i;

export function recognizeDjiRid({ serial = "", model = "", uaType = "", text = "", ssid = "" } = {}) {
  const clean = String(serial || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  const blob = `${serial} ${model} ${text} ${ssid} ${uaType}`;
  const cta = DJI_CTA_RE.test(clean);
  const named = DJI_NAME_RE.test(blob);
  const ssidHit = DJI_SSID_RE.test(String(ssid || "")) || DJI_SSID_RE.test(String(text || ""));
  const dji = cta || named || ssidHit;
  let guess = String(model || "").trim();
  if (!guess || /^rid$/i.test(guess)) {
    if (/mini\s*4|mini4/i.test(blob)) guess = "DJI Mini 4";
    else if (/mini\s*3|mini3/i.test(blob)) guess = "DJI Mini 3";
    else if (/avata/i.test(blob)) guess = "DJI Avata";
    else if (/mavic/i.test(blob)) guess = "DJI Mavic";
    else if (/phantom/i.test(blob)) guess = "DJI Phantom";
    else if (cta) guess = "DJI Remote ID";
    else if (dji) guess = "DJI";
  }
  return { dji, cta, model: guess || "RID" };
}

export const RID_VERIFIER_YAML =
  "https://raw.githubusercontent.com/opendroneid/authentication-verifier-api/main/authentication-verifier-api.yaml";
export const RID_DRONESCOUT = "https://dronescout.co/dronescout-remote-id-receiver/";
export const RID_DRONETAG_LIVE = "https://live.dronetag.app/";
export const RID_ESP32 = "https://github.com/orinocoz/WiFi-RemoteID";
export const DJI_ACCOUNT = "https://account.dji.com/";
export const DJI_FEEDBACK_CFG =
  "https://account.dji.com/api/feedback/v1/config/web?appid=account-center";

export const RID_CATALOG = [
  {
    id: "verifier",
    name: "OpenDroneID authentication-verifier-api.yaml",
    url: RID_VERIFIER_YAML,
    kind: "openapi",
    public: true,
    feed: false,
    note: "POST /remoteid/verify/ checks a signature. Not live detections.",
  },
  {
    id: "dronescout",
    name: "DroneScout Remote ID receiver",
    url: RID_DRONESCOUT,
    kind: "receiver",
    public: false,
    feed: false,
    note: "Publishes OpenDroneID JSON to YOUR MQTT broker. No public Slovenia dump.",
  },
  {
    id: "dronetag-live",
    name: "Dronetag Live HTML",
    url: RID_DRONETAG_LIVE,
    kind: "html",
    public: false,
    feed: false,
    note: "Vendor web chrome, not a CORS JSON board.",
  },
  {
    id: "wifi-remoteid",
    name: "ESP32 WiFi-RemoteID",
    url: RID_ESP32,
    kind: "receiver",
    public: true,
    feed: false,
    note: "Self-hosted GET /api/detections JSON. Point RID_FEED_URL here, or POST that JSON to /api/rid.",
  },
  {
    id: "dji-feedback",
    name: "DJI account-center feedback config",
    url: DJI_FEEDBACK_CFG,
    kind: "json-chrome",
    public: true,
    feed: false,
    note: "GET application/json: locale surveyId list for account-center. No lat/lon, not Remote ID, not a traffic feed.",
  },
];

async function probeHead(url, ms = 8_000) {
  const out = {
    url,
    status: 0,
    ok: false,
    bytes: 0,
    contentType: "",
    lastModified: "",
    json: false,
    html: false,
    yaml: false,
    feed: false,
    error: "",
  };
  try {
    const r = await fetch(url, {
      method: "HEAD",
      headers: { accept: "application/json,text/html;q=0.8,*/*;q=0.5", "user-agent": "OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    out.status = r.status;
    out.ok = r.ok;
    out.contentType = String(r.headers.get("content-type") || "");
    out.lastModified = String(r.headers.get("last-modified") || "");
    out.bytes = Number(r.headers.get("content-length") || 0) || 0;
    out.json = /json/i.test(out.contentType);
    out.html = /html/i.test(out.contentType);
    out.yaml = /yaml|text\/plain/i.test(out.contentType);
    out.feed = out.json && !out.html;
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

export async function probeRidCatalog(ms = 8_000) {
  const rows = await Promise.all(
    RID_CATALOG.map(async (c) => {
      const probe = c.id === "dji-feedback" ? await probeDjiFeedback(ms) : await probeHead(c.url, ms);
      return { ...c, ...probe, feed: false, note: probe.note || c.note };
    }),
  );
  return {
    n: 0,
    feeds: 0,
    items: rows,
    origin: {
      ok: rows.some((x) => x.ok),
      json: false,
      feed: false,
      note: "Direct Remote ID is ASTM F3411 / EN 4709-002 over BLE or Wi-Fi from the aircraft. There is no public live RID GeoJSON for Slovenia. Empty is a fact until a local receiver POSTs decoded JSON.",
    },
  };
}

async function probeDjiFeedback(ms = 8_000) {
  const out = {
    url: DJI_FEEDBACK_CFG,
    status: 0,
    ok: false,
    bytes: 0,
    contentType: "",
    lastModified: "",
    json: false,
    html: false,
    yaml: false,
    feed: false,
    langs: 0,
    note: "",
    error: "",
  };
  try {
    const r = await fetch(DJI_FEEDBACK_CFG, {
      headers: { accept: "application/json, text/plain, */*", "user-agent": "OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    out.status = r.status;
    out.ok = r.ok;
    out.contentType = String(r.headers.get("content-type") || "");
    out.lastModified = String(r.headers.get("last-modified") || "");
    const t = await r.text();
    out.bytes = Number(r.headers.get("content-length") || 0) || t.length;
    out.json = /json/i.test(out.contentType) || /^\s*\{/.test(t);
    const d = JSON.parse(t);
    const rows = Array.isArray(d?.data) ? d.data : [];
    const keys = rows[0] && typeof rows[0] === "object" ? Object.keys(rows[0]).join(",") : "";
    out.langs = rows.length;
    out.note = `${rows.length} locale survey rows (${keys || "no keys"}). Not lat/lon, not a traffic feed.`;
    out.feed = false;
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}
