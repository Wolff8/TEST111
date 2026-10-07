const KINDS = {
  WIFI: "wifi",
  BT: "bluetooth",
  BLE: "bluetooth",
  GSM: "cell",
  LTE: "cell",
  NR: "cell",
  WCDMA: "cell",
  CDMA: "cell",
  CELL: "cell",
  BLUETOOTH: "bluetooth",
};

export function createWigleFeed(tracks, onChange) {
  let lastGps = null;
  const status = {
    n: 0,
    wifi: 0,
    bluetooth: 0,
    cell: 0,
    lastAt: 0,
    lastErr: "",
    lastGps: null,
    api: Boolean(process.env.WIGLE_API_NAME && process.env.WIGLE_API_TOKEN),
  };

  function expire(ms = 12 * 60_000) {
    const now = Date.now();
    for (const [id, r] of tracks) if (!r?.at || now - r.at > (r.ttl || ms)) tracks.delete(id);
  }

  function recount() {
    expire();
    status.n = tracks.size;
    status.wifi = 0;
    status.bluetooth = 0;
    status.cell = 0;
    for (const r of tracks.values()) {
      if (r.kind === "wifi") status.wifi += 1;
      else if (r.kind === "bluetooth") status.bluetooth += 1;
      else if (r.kind === "cell") status.cell += 1;
    }
  }

  function gpsOf(raw) {
    if (!raw || typeof raw !== "object") return {};
    const nest = raw.gps && typeof raw.gps === "object" ? raw.gps : raw.lastGps && typeof raw.lastGps === "object" ? raw.lastGps : raw.location && typeof raw.location === "object" ? raw.location : {};
    return {
      lat: raw.lat ?? raw.trilat ?? raw.CurrentLatitude ?? raw.latitude ?? raw.gps_lat ?? nest.lat ?? nest.latitude,
      lon: raw.lon ?? raw.trilong ?? raw.CurrentLongitude ?? raw.longitude ?? raw.lng ?? raw.gps_lon ?? nest.lon ?? nest.lng ?? nest.longitude,
      alt: raw.alt ?? raw.altitude ?? raw.AltitudeMeters ?? nest.altitudeM ?? nest.alt,
      acc: raw.accuracy ?? raw.AccuracyMeters ?? nest.accuracyM ?? nest.acc,
    };
  }

  function rememberGps(raw) {
    const g = gpsOf(raw);
    const lat = Number(g.lat);
    const lon = Number(g.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat && lon) {
      lastGps = { lat, lon, at: Date.now() };
      status.lastGps = lastGps;
    }
  }

  function upsert(raw) {
    if (!raw || typeof raw !== "object") return false;
    if (/^gps$/i.test(String(raw.type || raw.kind || ""))) {
      rememberGps(raw);
      return Boolean(lastGps);
    }
    rememberGps(raw);
    const type = String(raw.type || raw.networkType || raw.kind || (raw.address && !raw.bssid ? "BLE" : "WIFI")).toUpperCase();
    const kind = KINDS[type] || (/ble|bluetooth|bt/i.test(type) ? "bluetooth" : /cell|lte|gsm|nr|cdma|wcdma/i.test(type) ? "cell" : "wifi");
    const id = String(raw.netid || raw.mac || raw.bssid || raw.address || raw.bd_addr || raw.cellid || raw.id || raw.key || "")
      .toLowerCase()
      .replace(/[^0-9a-f:_]/g, "");
    const g = gpsOf(raw);
    const lat = Number(g.lat ?? lastGps?.lat);
    const lon = Number(g.lon ?? lastGps?.lon);
    if (!id || id.length < 4 || !Number.isFinite(lat) || !Number.isFinite(lon) || !lat || !lon) return false;
    const name = String(raw.ssid || raw.name || raw.ssidOrName || raw.operator || raw.SSID || "").trim() || id.slice(-8);
    const rssi = Number(raw.rssi ?? raw.RSSI ?? raw.signal);
    const prev = tracks.get(id);
    tracks.set(id, {
      id,
      kind,
      type: type.toLowerCase(),
      name,
      lat,
      lon,
      alt: Number(g.alt ?? raw.alt ?? raw.altitude ?? raw.AltitudeMeters) || prev?.alt || 0,
      rssi: Number.isFinite(rssi) ? rssi : prev?.rssi,
      channel: raw.channel ?? raw.Channel ?? prev?.channel,
      freq: raw.frequency ?? raw.Frequency ?? raw.freq ?? prev?.freq,
      auth: String(raw.encryption || raw.security || raw.auth || raw.AuthMode || raw.capabilities || "").slice(0, 80),
      acc: Number(g.acc ?? raw.accuracy ?? raw.AccuracyMeters) || prev?.acc,
      src: raw.src || raw.source || "wigglefish",
      vendor: raw.vendor || prev?.vendor,
      ttl: raw.ttl || 12 * 60_000,
      detail: [type, raw.channel || raw.frequency, raw.vendor, String(raw.encryption || raw.security || raw.auth || raw.AuthMode || "").replace(/[\[\]]/g, " ").trim()]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 120),
      at: Date.now(),
    });
    status.lastAt = Date.now();
    return true;
  }

  function splitCsv(line) {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else q = !q;
      } else if (c === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  }

  function ingestCsv(text) {
    let n = 0;
    let heard = 0;
    const lines = String(text || "").split(/\r?\n/);
    let header = null;
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (/^WigleWifi/i.test(t) || t.startsWith("#")) continue;
      const cols = splitCsv(t);
      if (!header) {
        if (/^MAC$/i.test(cols[0]) || /BSSID|netid/i.test(cols[0])) {
          header = cols.map((c) => {
            const k = c.trim().toLowerCase();
            if (k === "auth") return "authmode";
            if (k === "name") return "ssid";
            return k;
          });
          continue;
        }
        header = [
          "mac",
          "ssid",
          "authmode",
          "firstseen",
          "channel",
          "frequency",
          "rssi",
          "currentlatitude",
          "currentlongitude",
          "altitudemeters",
          "accuracymeters",
          "rcois",
          "mfgrid",
          "type",
        ];
      }
      heard += 1;
      const row = {};
      header.forEach((k, i) => {
        row[k] = cols[i];
      });
      if (
        upsert({
          mac: row.mac || row.bssid || row.bd_addr || row.netid,
          ssid: row.ssid || row["device name"] || row.name,
          auth: row.authmode || row.capabilities || row.encryption,
          channel: row.channel,
          frequency: row.frequency || row.freq,
          rssi: row.rssi,
          lat: row.currentlatitude || row.lat || row.trilat,
          lon: row.currentlongitude || row.lon || row.trilong,
          alt: row.altitudemeters || row.altitude,
          accuracy: row.accuracymeters || row.accuracy,
          type: row.type || "WIFI",
          src: "phone",
        })
      )
        n += 1;
    }
    recount();
    onChange?.();
    return { n, heard };
  }

  function ingestJson(body) {
    if (typeof body === "string") {
      const t = body.trim();
      if (t.includes("\n") && t.includes("{")) {
        let n = 0;
        let heard = 0;
        for (const line of t.split(/\r?\n/)) {
          const s = line.trim();
          if (!s.startsWith("{")) continue;
          try {
            heard += 1;
            if (upsert(JSON.parse(s))) n += 1;
          } catch {
            /* skip */
          }
        }
        recount();
        onChange?.();
        return { n, heard };
      }
      body = JSON.parse(t);
    }
    if (body && typeof body === "object") {
      rememberGps(body);
      const timeline = body.gpsTimeline || body.gps_timeline || body.track;
      if (Array.isArray(timeline)) for (const g of timeline) rememberGps(g);
    }
    if (body?.type === "FeatureCollection" || Array.isArray(body?.features)) {
      let n = 0;
      const feats = body.features || [];
      for (const f of feats) {
        const geom = f?.geometry || {};
        const props = f?.properties || {};
        if (props.kind === "session_track" || geom.type === "LineString") {
          const line = geom.coordinates || [];
          for (const c of line) {
            if (Array.isArray(c) && c.length >= 2) rememberGps({ lon: c[0], lat: c[1], alt: c[2] });
          }
          continue;
        }
        const coords = geom.coordinates;
        const row = {
          ...props,
          src: props.src || props.source || "wigglefish",
          mac: props.mac || props.bssid || props.address,
          ssid: props.ssid || props.name,
          type: props.type || props.kind,
          lon: Array.isArray(coords) ? coords[0] : undefined,
          lat: Array.isArray(coords) ? coords[1] : undefined,
          alt: Array.isArray(coords) ? coords[2] : undefined,
        };
        if (upsert(row)) n += 1;
      }
      recount();
      onChange?.();
      return { n, heard: feats.length };
    }
    const list = Array.isArray(body)
      ? body
      : body?.items ||
        body?.results ||
        body?.networks ||
        body?.observations ||
        [
          ...(body?.wifi || []),
          ...(body?.ble || []),
          ...(body?.bluetooth || []),
          ...(body?.cell || []),
          ...(body?.ac || []),
        ];
    const wrap = list.length
      ? list
      : body && typeof body === "object" && (body.mac || body.netid || body.ssid || body.bssid || body.address)
        ? [body]
        : [];
    let n = 0;
    for (const it of wrap) {
      const row = { ...it, src: it.src || it.source || "wigglefish" };
      if (body?.lat && !row.lat) row.lat = body.lat;
      if (body?.lon && !row.lon) row.lon = body.lon;
      if (it.trilat && !row.lat) row.lat = it.trilat;
      if (it.trilong && !row.lon) row.lon = it.trilong;
      if (upsert(row)) n += 1;
    }
    recount();
    onChange?.();
    return { n, heard: wrap.length };
  }

  function lowerKeys(obj) {
    const out = {};
    if (!obj || typeof obj !== "object") return out;
    for (const [k, v] of Object.entries(obj)) out[String(k).toLowerCase()] = v;
    return out;
  }

  function hasObs(q) {
    return Boolean(q.mac || q.bssid || q.ssid || q.address || q.netid || q.bd_addr || q.cellid);
  }

  function ingestQuery(params) {
    const raw = params && typeof params.get === "function" ? Object.fromEntries(params) : params || {};
    const q = lowerKeys(raw);
    if (q.latitude && !q.lat) q.lat = q.latitude;
    if ((q.lng || q.longitude) && !q.lon) q.lon = q.lng || q.longitude;
    if (q.lat || q.lon) rememberGps(q);
    if (!hasObs(q)) {
      recount();
      return { n: 0, heard: 0, gps: Boolean(lastGps) };
    }
    const ok = upsert({
      ...q,
      src: q.src || "wigglefish",
      type: q.type || (q.address ? "BLE" : "WIFI"),
    });
    recount();
    onChange?.();
    return { n: ok ? 1 : 0, heard: 1, gps: Boolean(lastGps) };
  }

  function ingestForm(text) {
    const q = {};
    for (const part of String(text || "").split("&")) {
      if (!part) continue;
      const i = part.indexOf("=");
      const k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, " ")).trim();
      const v = decodeURIComponent((i < 0 ? "" : part.slice(i + 1)).replace(/\+/g, " "));
      if (k) q[k] = v;
    }
    return ingestQuery(q);
  }

  function ingestBody(raw, contentType = "") {
    const t = String(raw || "").trim();
    if (!t) return { n: 0, heard: 0 };
    if (/urlencoded|form-data/i.test(contentType) && !t.startsWith("{") && !t.startsWith("[")) return ingestForm(t);
    if (!t.includes("\n") && t.includes("=") && t.includes("&") && !t.startsWith("{") && !t.startsWith("[")) return ingestForm(t);
    if (/^WigleWifi/i.test(t) || /^MAC,/i.test(t) || t.includes("\nMAC,")) return ingestCsv(t);
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        if (t.includes("\n{") || (t.startsWith("{") && t.includes("}\n{"))) return ingestJson(t);
        return ingestJson(JSON.parse(t));
      } catch {
        try {
          return ingestJson(t);
        } catch {
          return ingestCsv(t);
        }
      }
    }
    if (/json/i.test(contentType)) {
      try {
        return ingestJson(JSON.parse(t));
      } catch {
        return { n: 0, heard: 0 };
      }
    }
    return ingestCsv(t);
  }

  function asSensors(p) {
    expire();
    return [...tracks.values()]
      .filter((r) => r.lat && r.lon)
      .sort((a, b) => b.at - a.at)
      .slice(0, 220)
      .map((r) => ({
        id: `rf-${r.id}`,
        kind: r.kind,
        name: r.name,
        lat: r.lat,
        lon: r.lon,
        alt: r.alt,
        km: p ? Math.round(Math.hypot((r.lat - p.lat) * 111, (r.lon - p.lon) * 78) * 10) / 10 : 0,
        rssi: r.rssi,
        detail: r.detail,
        src: r.src || "wigle",
        online: Date.now() - r.at < 180_000,
        ageMin: Math.max(0, Math.round((Date.now() - r.at) / 60_000)),
        at: r.at,
        lastAt: new Date(r.at).toISOString(),
        sensors: [
          { title: "RSSI", unit: "dBm", last: r.rssi },
          { title: r.kind === "cell" ? "ARFCN" : "Channel", unit: "", last: r.channel || r.freq || "—" },
        ],
        primary: { title: "RSSI", unit: "dBm", last: r.rssi },
      }));
  }

  function messages() {
    expire();
    return [...tracks.values()]
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .map((r) => ({
        id: `rf-${r.id}-${r.at}`,
        kind: r.kind,
        name: r.name,
        detail: r.detail || r.type,
        rssi: r.rssi,
        lat: r.lat,
        lon: r.lon,
        at: r.at,
      }));
  }

  return { ingestBody, ingestJson, ingestCsv, ingestQuery, ingestForm, hasObs, upsert, asSensors, messages, expire, recount, status };
}
