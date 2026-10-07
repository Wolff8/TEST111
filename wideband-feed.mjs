const MS = { id: "ms", name: "Murska Sobota SDR", lat: 46.659, lon: 16.172, antenna: "70-1200 MHz" };

const BLOCK = /pocsag|flex|ermes|gsm|tetra|dmr|p25|imsi|lte|wcdma|umts|nr5g|cellid/i;

export const RF_BANDS = [
  { mhz: 1090, mode: "adsb", title: "ADS-B / Mode S", dest: "radar", decoder: "dump1090 / readsb → Beast or aircraft.json" },
  { mhz: 868.4, mode: "flarm", title: "FLARM / OGN / LoRa", dest: "radar + LoRa", decoder: "rtl_433 or ogn-decode; LoRaWAN via packet forwarder" },
  { mhz: 433.92, mode: "rtl_433", title: "ISM weather / sensors", dest: "sensors", decoder: "rtl_433 -f 433.92M -F json" },
  { mhz: 144.8, mode: "aprs", title: "APRS", dest: "sensors", decoder: "direwolf / rtl_fm + direwolf" },
  { mhz: 162.025, mode: "ais", title: "AIS (weak inland)", dest: "sensors", decoder: "AIS-catcher JSON" },
];

export function createWidebandFeed(tracks, onChange) {
  const series = new Map();
  const messages = [];
  let station = { ...MS, mhz: 0, mode: "", bwMhz: 2.4, at: 0, frames: 0, lastErr: "" };
  const status = {
    n: 0,
    ism: 0,
    aprs: 0,
    ais: 0,
    frames: 0,
    lastAt: 0,
    lastErr: "",
    station: null,
  };

  function bump() {
    recount();
    onChange?.();
  }

  function expire(ms = 20 * 60_000) {
    const now = Date.now();
    for (const [id, r] of tracks) if (!r?.at || now - r.at > (r.ttl || ms)) tracks.delete(id);
  }

  function recount() {
    expire();
    status.n = tracks.size;
    status.ism = 0;
    status.aprs = 0;
    status.ais = 0;
    for (const r of tracks.values()) {
      if (r.kind === "ism") status.ism += 1;
      else if (r.kind === "aprs") status.aprs += 1;
      else if (r.kind === "ais") status.ais += 1;
    }
    status.station = station.at ? { ...station, live: Date.now() - station.at < 180_000 } : null;
  }

  function blocked(raw) {
    const blob = `${raw?.model || ""} ${raw?.type || ""} ${raw?.kind || ""} ${raw?.protocol || ""} ${raw?.mod || ""}`;
    return BLOCK.test(blob);
  }

  function num(...xs) {
    for (const x of xs) {
      const n = Number(x);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  function nearStation(id) {
    let h = 0;
    for (const c of String(id)) h = (h * 33 + c.charCodeAt(0)) >>> 0;
    const ang = ((h % 360) * Math.PI) / 180;
    const r = 0.0014 + (h % 19) * 0.00011;
    const lat = station.lat + r * Math.cos(ang);
    const lon = station.lon + (r * Math.sin(ang)) / Math.cos((station.lat * Math.PI) / 180);
    return { lat, lon, heardAt: "ms" };
  }

  function rememberStation(raw) {
    if (!raw || typeof raw !== "object") return false;
    const lat = num(raw.lat, raw.latitude);
    const lon = num(raw.lon, raw.lng, raw.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat && lon) {
      station.lat = lat;
      station.lon = lon;
    }
    if (raw.name) station.name = String(raw.name).slice(0, 64);
    if (raw.id) station.id = String(raw.id).slice(0, 24);
    const mhz = num(raw.mhz, raw.freq_mhz, raw.frequency && Number(raw.frequency) > 1000 ? Number(raw.frequency) / 1e6 : raw.frequency);
    if (Number.isFinite(mhz) && mhz > 1) station.mhz = Math.round(mhz * 1000) / 1000;
    if (raw.mode || raw.protocol) station.mode = String(raw.mode || raw.protocol).slice(0, 32);
    if (raw.bwMhz || raw.bw) station.bwMhz = num(raw.bwMhz, raw.bw) || station.bwMhz;
    if (raw.antenna) station.antenna = String(raw.antenna).slice(0, 40);
    station.at = Date.now();
    status.lastAt = station.at;
    return true;
  }

  function pushSeries(id, field, v) {
    const n = Number(v);
    if (!Number.isFinite(n) || !id) return;
    const row = series.get(id) || {};
    const arr = row[field] || [];
    const last = arr[arr.length - 1];
    if (last && Date.now() - last.t < 2000 && last.v === n) return;
    arr.push({ t: Date.now(), v: n });
    if (arr.length > 80) arr.shift();
    row[field] = arr;
    series.set(id, row);
  }

  function note(kind, name, detail, lat, lon, rssi) {
    messages.unshift({
      id: `rfb-${kind}-${Date.now()}-${messages.length}`,
      kind,
      name,
      detail,
      rssi,
      lat,
      lon,
      at: Date.now(),
    });
    if (messages.length > 80) messages.length = 80;
  }

  function upsert(kind, id, patch) {
    const key = String(id || "").trim();
    if (!key || key.length < 2) return false;
    const prev = tracks.get(key) || { id: key, kind };
    const next = {
      ...prev,
      ...patch,
      id: key,
      kind,
      src: patch.src || prev.src || "ms-sdr",
      at: Date.now(),
      ttl: patch.ttl || prev.ttl || 20 * 60_000,
    };
    if (!Number.isFinite(next.lat) || !Number.isFinite(next.lon) || !next.lat || !next.lon) {
      const near = nearStation(key);
      next.lat = near.lat;
      next.lon = near.lon;
      next.approx = true;
    }
    tracks.set(key, next);
    status.frames += 1;
    status.lastAt = next.at;
    station.frames += 1;
    if (!station.at) station.at = next.at;
    return true;
  }

  function ingestRtl433(raw) {
    if (blocked(raw)) return false;
    const model = String(raw.model || raw.mod || raw.protocol || "").trim();
    if (!model) return false;
    const id = String(raw.id ?? raw.sid ?? raw.address ?? raw.channel ?? model).slice(0, 48);
    const key = `ism-${model}-${id}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const temp = num(raw.temperature_C, raw.temperature_F != null ? ((Number(raw.temperature_F) - 32) * 5) / 9 : null, raw.temp);
    const hum = num(raw.humidity, raw.humidity_RH);
    const press = num(raw.pressure_hPa, raw.pressure, raw.barometric_pressure);
    const wind = num(raw.wind_avg_km_h, raw.wind_speed_kmh, raw.wind_avg_m_s != null ? Number(raw.wind_avg_m_s) * 3.6 : null);
    const rain = num(raw.rain_mm, raw.rainfall_mm);
    const rssi = num(raw.rssi, raw.snr);
    const mhz = num(raw.mhz, raw.freq && Number(raw.freq) > 1000 ? Number(raw.freq) / 1e6 : raw.freq) || 433.92;
    const bits = [model];
    if (Number.isFinite(temp)) bits.push(`${temp.toFixed(1)}°C`);
    if (Number.isFinite(hum)) bits.push(`RH ${Math.round(hum)}%`);
    if (Number.isFinite(press)) bits.push(`${press.toFixed(0)} hPa`);
    if (Number.isFinite(wind)) bits.push(`${wind.toFixed(0)} km/h`);
    if (Number.isFinite(rain)) bits.push(`${rain.toFixed(1)} mm`);
    if (Number.isFinite(rssi)) bits.push(`${rssi} dB`);
    bits.push(`${mhz} MHz`);
    if (Number.isFinite(temp)) pushSeries(key, "temp", temp);
    if (Number.isFinite(hum)) pushSeries(key, "humidity", hum);
    if (Number.isFinite(rssi)) pushSeries(key, "rssi", rssi);
    const lat = num(raw.lat, raw.latitude);
    const lon = num(raw.lon, raw.lng, raw.longitude);
    const ok = upsert("ism", key, {
      name: `${model} ${id}`.slice(0, 48),
      model,
      lat: Number.isFinite(lat) && lat ? lat : undefined,
      lon: Number.isFinite(lon) && lon ? lon : undefined,
      rssi: Number.isFinite(rssi) ? rssi : undefined,
      mhz,
      temp: Number.isFinite(temp) ? temp : undefined,
      humidity: Number.isFinite(hum) ? hum : undefined,
      detail: bits.join(" · ").slice(0, 140),
      ttl: raw.ttl || 25 * 60_000,
      src: "rtl_433",
    });
    if (ok) note("ism", model, bits.join(" · "), tracks.get(key)?.lat, tracks.get(key)?.lon, rssi);
    return ok;
  }

  function ingestAprs(raw) {
    if (blocked(raw)) return false;
    const call = String(raw.srccall || raw.from || raw.source || raw.callsign || raw.src || "").trim();
    if (!call) return false;
    const lat = num(raw.lat, raw.latitude);
    const lon = num(raw.lon, raw.lng, raw.longitude);
    const comment = String(raw.comment || raw.text || raw.status || "").slice(0, 80);
    const rssi = num(raw.rssi);
    const key = `aprs-${call.toLowerCase()}`;
    const ok = upsert("aprs", key, {
      name: call,
      lat: Number.isFinite(lat) && lat ? lat : undefined,
      lon: Number.isFinite(lon) && lon ? lon : undefined,
      rssi: Number.isFinite(rssi) ? rssi : undefined,
      mhz: num(raw.mhz) || 144.8,
      detail: [comment, "144.8 MHz APRS"].filter(Boolean).join(" · ").slice(0, 140),
      src: "aprs",
      ttl: raw.ttl || 30 * 60_000,
    });
    if (ok) note("aprs", call, comment || "APRS", tracks.get(key)?.lat, tracks.get(key)?.lon, rssi);
    return ok;
  }

  function ingestAis(raw) {
    if (blocked(raw)) return false;
    const mmsi = String(raw.mmsi || raw.userid || raw.id || "").replace(/\D/g, "");
    if (mmsi.length < 5) return false;
    const lat = num(raw.lat, raw.latitude);
    const lon = num(raw.lon, raw.lng, raw.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat || !lon) return false;
    const name = String(raw.shipname || raw.name || raw.vessel || `MMSI ${mmsi}`).trim().slice(0, 40);
    const sog = num(raw.sog, raw.speed);
    const key = `ais-${mmsi}`;
    const ok = upsert("ais", key, {
      name,
      lat,
      lon,
      mhz: 162.025,
      gs: Number.isFinite(sog) ? sog : undefined,
      detail: [name, Number.isFinite(sog) ? `${sog} kn` : "", "AIS 162 MHz"].filter(Boolean).join(" · "),
      src: "ais",
      ttl: raw.ttl || 15 * 60_000,
    });
    if (ok) note("ais", name, `MMSI ${mmsi}`, lat, lon);
    return ok;
  }

  function ingestTnc2(line) {
    const t = String(line || "").trim();
    const m = t.match(/^([A-Z0-9-]{3,9})>.*[!=@\/](\d{4}\.\d{2})([NS]).(\d{5}\.\d{2})([EW])/i);
    if (!m) return false;
    const lat = dmToDeg(m[2], m[3]);
    const lon = dmToDeg(m[4], m[5]);
    return ingestAprs({ from: m[1], lat, lon, comment: t.slice(t.indexOf(":") + 1).slice(0, 80), mhz: 144.8 });
  }

  function classify(raw) {
    if (!raw || typeof raw !== "object") return 0;
    if (blocked(raw)) return 0;
    const typ = String(raw.type || raw.kind || raw.class || raw.protocol || "").toLowerCase();
    if (/^station$|^heartbeat$|^sdr$/.test(typ) || raw.antenna || raw.site === "ms") {
      rememberStation(raw);
      return 1;
    }
    if (raw.model || typ === "rtl_433" || typ === "ism") return ingestRtl433(raw) ? 1 : 0;
    if (typ === "aprs" || raw.srccall || raw.callsign) return ingestAprs(raw) ? 1 : 0;
    if (typ === "ais" || raw.mmsi || raw.shipname) return ingestAis(raw) ? 1 : 0;
    if (raw.hex || raw.icao || raw.aircraft || raw.ac) return 0;
    if (raw.lat && raw.lon && (raw.name || raw.id)) {
      const kind = /aprs/i.test(typ) ? "aprs" : /ais/i.test(typ) ? "ais" : "ism";
      return upsert(kind, String(raw.id || raw.name), {
        name: String(raw.name || raw.id),
        lat: Number(raw.lat),
        lon: Number(raw.lon),
        mhz: num(raw.mhz),
        rssi: num(raw.rssi),
        detail: String(raw.detail || raw.comment || typ || "RF").slice(0, 140),
        src: raw.src || "ms-sdr",
        ttl: raw.ttl,
      })
        ? 1
        : 0;
    }
    return 0;
  }

  function ingestJson(body) {
    if (body == null) return { n: 0, heard: 0 };
    if (typeof body === "string") {
      const t = body.trim();
      if (!t) return { n: 0, heard: 0 };
      if (t.includes("\n")) {
        let n = 0;
        let heard = 0;
        for (const line of t.split(/\r?\n/)) {
          const s = line.trim();
          if (!s) continue;
          heard += 1;
          if (s.startsWith("{") || s.startsWith("[")) {
            try {
              const rec = ingestJson(JSON.parse(s));
              n += rec.n;
            } catch {
              if (ingestTnc2(s)) n += 1;
            }
          } else if (ingestTnc2(s)) n += 1;
        }
        bump();
        return { n, heard };
      }
      try {
        return ingestJson(JSON.parse(t));
      } catch {
        const n = ingestTnc2(t) ? 1 : 0;
        bump();
        return { n, heard: 1 };
      }
    }
    if (Array.isArray(body)) {
      let n = 0;
      for (const row of body) n += classify(unwrap(row));
      bump();
      return { n, heard: body.length };
    }
    const row = unwrap(body);
    if (Array.isArray(row.reports)) return ingestJson(row.reports);
    if (Array.isArray(row.messages)) return ingestJson(row.messages);
    const n = classify(row);
    bump();
    return { n, heard: 1 };
  }

  function ingestBody(raw, contentType = "") {
    const t = String(raw || "").trim();
    if (!t) return { n: 0, heard: 0 };
    if (t.startsWith("{") || t.startsWith("[") || /json/i.test(contentType)) return ingestJson(t);
    return ingestJson(t);
  }

  function looksAircraft(body) {
    if (!body || typeof body !== "object") return false;
    if (Array.isArray(body.aircraft) || Array.isArray(body.ac)) return true;
    if (body.hex || body.icao) return true;
    return false;
  }

  function asSensors(p) {
    expire();
    const out = [];
    if (station.at && Date.now() - station.at < 30 * 60_000) {
      out.push({
        id: `sdr-station-${station.id}`,
        kind: "sdr",
        name: station.name,
        lat: station.lat,
        lon: station.lon,
        km: p ? Math.round(Math.hypot((station.lat - p.lat) * 111, (station.lon - p.lon) * 78) * 10) / 10 : 0,
        detail: [station.antenna, station.mhz ? `${station.mhz} MHz` : "", station.mode, `${status.n} heard`]
          .filter(Boolean)
          .join(" · "),
        src: "ms-sdr",
        online: Date.now() - station.at < 180_000,
        ageMin: Math.max(0, Math.round((Date.now() - station.at) / 60_000)),
        at: station.at,
        lastAt: new Date(station.at).toISOString(),
        sensors: [
          { title: "Tune", unit: "MHz", last: station.mhz || "—" },
          { title: "Heard", unit: "", last: status.n },
        ],
        primary: { title: "Tune", unit: "MHz", last: station.mhz || "—" },
      });
    }
    for (const r of [...tracks.values()].sort((a, b) => b.at - a.at).slice(0, 180)) {
      const ser = series.get(r.id);
      const sensors = [];
      if (r.temp != null) sensors.push({ title: "Temp", unit: "°C", last: Math.round(r.temp * 10) / 10 });
      if (r.humidity != null) sensors.push({ title: "RH", unit: "%", last: Math.round(r.humidity) });
      if (r.rssi != null) sensors.push({ title: "RSSI", unit: "dB", last: r.rssi });
      if (r.mhz) sensors.push({ title: "MHz", unit: "", last: r.mhz });
      out.push({
        id: r.id,
        kind: r.kind,
        name: r.name,
        lat: r.lat,
        lon: r.lon,
        km: p ? Math.round(Math.hypot((r.lat - p.lat) * 111, (r.lon - p.lon) * 78) * 10) / 10 : 0,
        rssi: r.rssi,
        temp: r.temp,
        humidity: r.humidity,
        detail: r.detail,
        src: r.src,
        online: Date.now() - r.at < 180_000,
        ageMin: Math.max(0, Math.round((Date.now() - r.at) / 60_000)),
        at: r.at,
        lastAt: new Date(r.at).toISOString(),
        approx: r.approx,
        sensors: sensors.length ? sensors : [{ title: "Band", unit: "MHz", last: r.mhz || "—" }],
        primary: sensors[0] || { title: "Band", unit: "MHz", last: r.mhz || "—" },
        series: ser
          ? Object.entries(ser)
              .filter(([, pts]) => Array.isArray(pts) && pts.length > 1)
              .map(([title, pts]) => ({
                title,
                unit: title === "temp" ? "°C" : title === "humidity" ? "%" : title === "rssi" ? "dB" : "",
                pts,
              }))
          : undefined,
      });
    }
    return out;
  }

  function liveStation() {
    if (!station.at || Date.now() - station.at > 180_000) return null;
    return { lat: station.lat, lon: station.lon, n: status.n, name: station.name, mhz: station.mhz, mode: station.mode };
  }

  function graphs() {
    expire();
    return [...tracks.values()]
      .filter((r) => series.get(r.id)?.temp?.length > 1)
      .slice(0, 8)
      .map((r) => {
        const pts = series.get(r.id).temp;
        return {
          id: r.id,
          name: r.name,
          kind: r.kind,
          title: "Temp",
          unit: "°C",
          last: pts.at(-1)?.v,
          pts,
        };
      });
  }

  return {
    ingestJson,
    ingestBody,
    ingestRtl433,
    ingestAprs,
    ingestAis,
    rememberStation,
    looksAircraft,
    asSensors,
    graphs,
    messages: () => messages.slice(0, 50),
    liveStation,
    status,
    recount,
    expire,
    RF_BANDS,
  };
}

function unwrap(raw) {
  if (!raw || typeof raw !== "object") return raw;
  if (raw.data && typeof raw.data === "object" && (raw.data.model || raw.data.mmsi || raw.data.srccall)) return raw.data;
  if (raw.report && typeof raw.report === "object") return raw.report;
  if (raw.message && typeof raw.message === "object") return raw.message;
  return raw;
}

function dmToDeg(dm, hemi) {
  const n = Number(dm);
  if (!Number.isFinite(n)) return NaN;
  const deg = Math.floor(n / 100);
  const min = n - deg * 100;
  let d = deg + min / 60;
  if (/[SWsw]/.test(hemi)) d = -d;
  return d;
}
