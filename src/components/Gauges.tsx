import { useState } from "react";
import { fmtAltM, fmtKmh, fmtLenKm, fpmToMs, ftToM, identLabel, ktToKmh, trailLenKm } from "../lib";

export function Gauge(props: { label: string; value?: number | null; display?: number | string | null; unit?: string; max?: number; color?: string }) {
  const max = props.max || 100;
  const v = Number(props.value);
  const ok = Number.isFinite(v);
  const pct = ok ? Math.min(100, Math.max(0, (v / max) * 100)) : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = props.color || "#3ee0c2";
  const shown = props.display != null ? props.display : ok ? (Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)) : "—";
  return (
    <div className="gauge">
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#1c2c3a" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="32" textAnchor="middle" fill="#eaf1f8" fontSize="11" fontWeight="700">
          {shown}
        </text>
      </svg>
      <small>
        {props.label}
        {props.unit ? ` ${props.unit}` : ""}
      </small>
    </div>
  );
}

export function TelemetryHud({ n }: { n: { name?: string; battery?: number; voltage?: number; temp?: number; humidity?: number; rssi?: number; alt?: number; snr?: number; port?: string } }) {
  return (
    <div className="hud-gauges">
      <Gauge label="BAT" value={n.battery} unit="%" color="#3ee07a" />
      <Gauge label="TEMP" value={n.temp} unit="°C" max={40} color="#f5b942" />
      <Gauge label="RH" value={n.humidity} unit="%" color="#6aa8ff" />
      <Gauge label="RSSI" value={n.rssi != null ? n.rssi + 130 : null} display={n.rssi} max={90} unit="dBm" color="#c77dff" />
    </div>
  );
}

const CAT: Record<string, string> = {
  A0: "no ADS-B",
  A1: "light <15.5t",
  A2: "small 15.5–75t",
  A3: "large",
  A4: "high vortex",
  A5: "heavy ≥136t",
  A6: "high perf",
  A7: "rotorcraft",
  B0: "no info",
  B1: "glider",
  B2: "LTA / balloon",
  B3: "skydiver",
  B4: "ultralight",
  B6: "UAV",
  B7: "space",
  C1: "emergency veh",
  C2: "service veh",
  C3: "point obstacle",
  C4: "surface veh",
  C5: "cluster obst",
};

function srcOf(p: {
  src: string;
  role?: string;
  model?: string;
  typecode?: string;
  flight?: string;
  heard?: boolean;
  nm?: boolean;
  touching?: boolean;
  fpl?: boolean;
  ifps?: boolean;
  silent?: boolean;
  asterixCat?: string;
  desc?: string;
}) {
  if (p.heard || p.src === "sdr") return p.src === "mlat" ? "car SDR + MLAT" : "car / MS SDR";
  if (p.nm || p.src === "nm") return p.touching ? "EUROCONTROL NSV · EDYY FMP" : "EUROCONTROL NSV";
  if (p.ifps) return "IFPS overlay";
  if (p.fpl || p.src === "fpl") return "filed FPL overlay";
  if (p.src === "rid") return /dji/i.test(`${p.model || ""} ${p.flight || ""}`) ? "DJI Remote ID" : "Remote ID";
  if (p.role === "echo" || p.src === "echo") return /fvg/i.test(String(p.desc || p.model || "")) ? "OSMER FVG VMI echo · no transponder" : "ARSO ZM echo · no transponder";
  if (p.src === "psr") return p.asterixCat ? `${p.asterixCat} primary` : "PSR · no Mode S";
  if (p.role === "bird" || p.src === "bird") return String(p.model || p.typecode || "Vogelradar");
  if (p.src === "ogn") return "OGN / FLARM";
  if (p.src === "mesh") return "mesh GPS";
  if (p.src === "asterix") return p.asterixCat || "ASTERIX mono";
  if (p.src === "mode_s") return "Mode S";
  if (p.src === "mlat" || p.silent) return "MLAT · no ADS-B Out";
  return String(p.src || "ADS-B").toUpperCase();
}

export function PlaneHud({
  p,
  title,
  onClose,
}: {
  title: string;
  onClose?: () => void;
  p: {
    id: string;
    src: string;
    flight: string;
    role: string;
    lat: number;
    lon: number;
    altFt: number;
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
    typecode: string;
    desc?: string;
    ownOp?: string;
    year?: string;
    reg: string;
    km: number;
    rssi?: number;
    seen?: number;
    seenPos?: number;
    heard?: boolean;
    silent?: boolean;
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
    birdtam?: number;
    local?: boolean;
    jump?: boolean;
    taxi?: boolean;
    onDeck?: boolean;
    low?: boolean;
    fastLow?: boolean;
    aglFt?: number;
    qnh?: number;
    nic?: number;
    nacp?: number;
    msgs?: number;
    trail?: { future?: boolean }[];
    operator?: { lat: number; lon: number } | null;
    home?: { lat: number; lon: number } | null;
    asterix?: boolean;
    asterixCat?: string;
    noPos?: boolean;
    isMil?: boolean;
    rotorSig?: {
      helicopterName: string;
      blades: number;
      nominalRpm: number;
      bladePassingFreqHz: number;
      bladeTipSpeedMps: number;
      maxDopplerSpreadHz: number;
      hermSnrDb: number;
      modulationStatus: string;
    } | null;
    pclTelemetry?: {
      illuminatorName: string;
      freqMhz: number;
      bistaticRangeKm: number;
      bistaticDelayUs: number;
      bistaticAngleDeg: number;
      dopplerHz: number;
      estimatedRcsM2: number;
      isForwardScatter: boolean;
    } | null;
  };
}) {
  const vs = p.vs;
  const climb = vs != null && vs > 80;
  const desc = vs != null && vs < -80;
  const emerg = p.emergency && p.emergency !== "none" ? p.emergency : /^(7500|7600|7700)$/.test(p.squawk) ? p.squawk : "";
  const fromReg = String(p.reg || "").replace(/[^a-f0-9]/gi, "");
  const hexRaw = /^[a-f0-9]{6}$/i.test(fromReg)
    ? fromReg
    : String(p.id || "")
        .replace(/^ax/i, "")
        .replace(/[^a-f0-9]/gi, "");
  const hex = (hexRaw.length >= 6 ? hexRaw.slice(-6) : hexRaw).toUpperCase();
  const ident = identLabel(p);
  const altM = ftToM(p.altFt);
  const gsKmh = ktToKmh(p.gs);
  const vsMs = vs != null ? fpmToMs(vs) : null;
  const trailKm = trailLenKm(p.trail as { lat: number; lon: number }[] | undefined);
  const trailN = (p.trail || []).length;
  const futureN = (p.trail || []).filter((x) => x.future).length;
  const cat = CAT[String(p.category || "").toUpperCase()] || p.category;
  const bird = p.role === "bird";
  const flock = bird && (/^flock/i.test(p.id) || p.typecode === "FLOCK");
  const rows: [string, string][] = [];
  if (ident.primary && ident.primary !== title) rows.push(["Ident", ident.primary]);
  if (hex && !bird && p.role !== "echo" && !/^rid|ogn|sonde|flock|bird|echo|ax/i.test(p.id)) rows.push(["ICAO", hex]);
  if (p.reg && !bird && p.role !== "echo") rows.push(["Reg", p.reg]);
  if (p.squawk) rows.push(["Squawk", p.squawk]);
  if (emerg) rows.push(["Emerg", emerg]);
  rows.push(["Pos", p.noPos || !p.lat || !p.lon ? "no fix" : `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`]);
  rows.push(["ALT", p.altFt ? fmtAltM(p.altFt) : "—"]);
  if (p.role === "echo" || p.src === "psr" || p.src === "echo") {
    rows.push(["Passive", p.src === "psr" ? "CAT 048 primary leftover · no Mode S" : "weather-radar leftover ingested as CAT 048 · no transponder"]);
  }
  if (flock || p.birdtam != null) rows.push(["BIRDTAM", String(p.birdtam ?? (String(p.model || "").replace(/[^\d.]/g, "") || "—"))]);
  if (p.aglFt != null && (p.local || p.role === "heli" || p.low)) rows.push(["AGL", fmtAltM(p.aglFt)]);
  if (p.fastLow) rows.push(["Pass", "low + fast · military-style, not filtered as airliner"]);
  if (p.taxi) rows.push(["Field", "LJMS deck · FLARM/ADS-B ground, silent airframes stay invisible"]);
  if (p.role === "heli" && p.onDeck) rows.push(["Pad", "On deck · trail kept to ground"]);
  if (p.role === "balloon" && (p.src === "echo" || p.src === "psr")) {
    rows.push(["Passive", "leftover CAT 048 · no receiver / no transponder"]);
  }
  if (p.jump) rows.push(["Drop", "LJMS jump ship · canopy only if OGN type 4 / B3"]);
  if (p.isMil || /RANGR|LSV|SVN|506e6/i.test(`${p.flight} ${p.id}`)) {
    rows.push(["Military", "🎖️ Slovenska vojska / Policija · Tactical Aircraft"]);
  }
  if (p.rotorSig) {
    rows.push(["Rotor PCL", `${p.rotorSig.bladePassingFreqHz} Hz blade chop (${p.rotorSig.blades} blades @ ${p.rotorSig.nominalRpm} RPM)`]);
    rows.push(["Micro-Doppler", `±${p.rotorSig.maxDopplerSpreadHz} Hz · Acoustic SNR +${p.rotorSig.hermSnrDb} dB (${p.rotorSig.helicopterName})`]);
  }
  if (p.pclTelemetry) {
    rows.push(["PCL Ellipse", `${p.pclTelemetry.illuminatorName} (${p.pclTelemetry.freqMhz} MHz) · Bistatic Delay ${p.pclTelemetry.bistaticDelayUs} µs`]);
    rows.push(["Bistatic Angle", `${p.pclTelemetry.bistaticAngleDeg}° · RCS +${p.pclTelemetry.estimatedRcsM2} m²`]);
  }
  rows.push(["HDG", `${Math.round(((p.track % 360) + 360) % 360)}°`]);
  rows.push(["GS", fmtKmh(p.gs)]);
  if (p.altBaro && Math.abs(p.altBaro - p.altFt) > 40) rows.push(["Baro", fmtAltM(p.altBaro)]);
  if (p.tas) rows.push(["TAS", fmtKmh(p.tas)]);
  if (p.ias) rows.push(["IAS", fmtKmh(p.ias)]);
  if (p.mach) rows.push(["Mach", p.mach.toFixed(2)]);
  if (p.typecode) rows.push(["Type", p.typecode]);
  if (p.asterixCat) rows.push(["ASTERIX", p.asterixCat]);
  if (p.desc) rows.push(["AC", p.desc]);
  if (p.ownOp) rows.push(["Op", p.ownOp]);
  if (p.year) rows.push(["Year", p.year]);
  if (cat && !bird) rows.push(["Cat", `${p.category} ${cat}`.trim()]);
  if (p.qnh) rows.push(["QNH", `${Math.round(p.qnh)} hPa`]);
  if (p.dep || p.dest) rows.push(["Filed", `${p.dep || "?"}→${p.dest || "?"}`]);
  if (p.route && p.route !== `${p.dep || ""}-${p.dest || ""}`) rows.push(["Route", p.route]);
  if (p.nmId) rows.push(["NM", p.nmId]);
  if (p.uaId) rows.push(["UA", p.uaId]);
  if (p.model) rows.push(["Model", p.model]);
  if (p.rssi != null) rows.push(["RSSI", `${p.rssi} dB`]);
  if (p.seen != null) rows.push(["Seen", `${Math.round(p.seen)}s`]);
  if (p.seenPos != null && p.seenPos !== p.seen) rows.push(["Fix", `${Math.round(p.seenPos)}s`]);
  if (p.msgs) rows.push(["Msgs", String(Math.round(p.msgs))]);
  if (p.nic != null) rows.push(["NIC", String(p.nic)]);
  if (p.nacp != null) rows.push(["NACp", String(p.nacp)]);
  rows.push(["Range", fmtLenKm(p.km)]);
  if (trailN) rows.push(["Trail", `${fmtLenKm(trailKm)}${futureN ? ` · ${futureN} filed` : ""}`]);
  if (p.operator?.lat && p.operator?.lon) {
    const d = Math.hypot((p.lat - p.operator.lat) * 111.32, (p.lon - p.operator.lon) * 78.5);
    rows.push(["Pilot", `${p.operator.lat.toFixed(4)}, ${p.operator.lon.toFixed(4)} · ${d.toFixed(1)} km`]);
  }
  if (p.home?.lat && p.home?.lon) rows.push(["Home", `${p.home.lat.toFixed(4)}, ${p.home.lon.toFixed(4)}`]);
  const [minimized, setMinimized] = useState(false);
  const pills = [srcOf(p), p.role, p.asterixCat || "", p.fastLow ? "low fast" : p.low ? "low" : "", p.local ? "LJMS" : "", p.taxi ? "taxi" : "", p.onDeck && !p.taxi ? "on ground" : "", p.jump ? "jump ship" : "", p.heard ? "heard" : "", p.silent && !bird ? "no ident" : "", p.noPos ? "no fix" : "", p.touching ? "FMP volume" : "", p.dep && p.dest ? `${p.dep}→${p.dest}` : "", p.ifps ? "IFPS" : p.fpl ? "FPL" : "", p.nm ? "NM" : ""].filter(Boolean);

  if (minimized) {
    return (
      <div className="hud-mini-strip">
        <span className="min-label"><b>{title}</b> · {p.role} · {Math.round(altM)}m · {Math.round(gsKmh)}km/h</span>
        <div className="min-btn-group">
          <button type="button" className="hud-ctrl-btn" onClick={() => setMinimized(false)} title="Expand details">
            ↗ EXPAND
          </button>
          {onClose && (
            <button type="button" className="hud-ctrl-btn close" onClick={onClose} title="Close window">
              ✕
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="hud-card-topbar">
        <div>
          <strong style={{ color: "#3ee0c2", fontSize: "14px" }}>{title}</strong>
          <small style={{ display: "block", color: "#8da4b8", fontSize: "10px" }}>{pills.join(" · ")}</small>
        </div>
        <div className="hud-btn-group">
          <button type="button" className="hud-ctrl-btn" onClick={() => setMinimized(true)} title="Minimize window">
            — MINIMIZE
          </button>
          {onClose && (
            <button type="button" className="hud-ctrl-btn close" onClick={onClose} title="Close window">
              ✕ CLOSE
            </button>
          )}
        </div>
      </div>
      <div className="hud-gauges">
        <Gauge
          label="ALT"
          value={altM}
          display={Math.round(altM)}
          max={bird ? 2500 : 14000}
          unit="m"
          color="#6aa8ff"
        />
        <Gauge label="GS" value={gsKmh} display={Math.round(gsKmh)} max={1100} unit="km/h" color="#3ee0c2" />
        <Gauge
          label="VS"
          value={vsMs != null ? Math.abs(vsMs) : null}
          display={vsMs == null ? "—" : `${vsMs > 0 ? "+" : ""}${vsMs.toFixed(1)}`}
          max={20}
          unit="m/s"
          color={climb ? "#3ee07a" : desc ? "#ff8a3d" : "#9bb8c9"}
        />
        <Gauge label="HDG" value={((p.track % 360) + 360) % 360} display={`${Math.round(((p.track % 360) + 360) % 360)}`} max={360} unit="°" color="#c77dff" />
      </div>
      {emerg ? <p className="emrg">Emergency {emerg}</p> : null}
      <div className="hud-kv">
        {rows.map(([k, v]) => (
          <span key={k}>
            {k}
            <code>{v}</code>
          </span>
        ))}
      </div>
    </>
  );
}
