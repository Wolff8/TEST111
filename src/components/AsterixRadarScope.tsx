import { useEffect, useRef, useState, useMemo } from "react";
import type { Plane } from "../lib";

export type RadarStationId = "puconci" | "dolina43" | "ljms";

export interface RadarStation {
  id: RadarStationId;
  name: string;
  lat: number;
  lon: number;
  altM: number;
  sac: number;
  sic: number;
  freqMhz: number;
  antenna: string;
  rpm: number;
}

export const RADAR_STATIONS: Record<RadarStationId, RadarStation> = {
  puconci: {
    id: "puconci",
    name: "Puconci SDR Head (Prekmurje)",
    lat: 46.7042,
    lon: 16.1601,
    altM: 220,
    sac: 250,
    sic: 43,
    freqMhz: 1090,
    antenna: "1090 MHz Collinear Omni 5.5 dBi",
    rpm: 15,
  },
  dolina43: {
    id: "dolina43",
    name: "Dolina 43 SDR Head (Lendava)",
    lat: 46.5412,
    lon: 16.5024,
    altM: 165,
    sac: 250,
    sic: 44,
    freqMhz: 1090,
    antenna: "1090 MHz Directional Sector 8 dBi",
    rpm: 15,
  },
  ljms: {
    id: "ljms",
    name: "LJMS Murska Sobota Radar Head",
    lat: 46.6590,
    lon: 16.1720,
    altM: 184,
    sac: 250,
    sic: 21,
    freqMhz: 1090,
    antenna: "Monopulse SSR / Primary Array",
    rpm: 15,
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
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let thetaDeg = (Math.atan2(y, x) * 180) / Math.PI;
  if (thetaDeg < 0) thetaDeg += 360;
  const rad = (thetaDeg * Math.PI) / 180;
  const cartX = rhoNm * Math.sin(rad);
  const cartY = rhoNm * Math.cos(rad);
  return {
    rhoNm: Math.round(rhoNm * 100) / 100,
    thetaDeg: Math.round(thetaDeg * 10) / 10,
    cartX: Math.round(cartX * 100) / 100,
    cartY: Math.round(cartY * 100) / 100,
  };
}

export interface AsterixRadarScopeProps {
  planes: Plane[];
  onPickPlane?: (id: string) => void;
  pickedId?: string;
  beastStatus?: {
    clients: number;
    frames: number;
    bytes?: number;
    lastAt: number;
    tcpHost?: string;
    tcpPort?: number;
  };
}

export function AsterixRadarScope({
  planes,
  onPickPlane,
  pickedId,
  beastStatus,
}: AsterixRadarScopeProps) {
  const [stationId, setStationId] = useState<RadarStationId>("puconci");
  const [rangeNm, setRangeNm] = useState<number>(50);
  const [vectorMin, setVectorMin] = useState<number>(2);
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [showPhosphor, setShowPhosphor] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<"all" | "mil" | "uav" | "balloon" | "echo">("all");
  const [sweepAngle, setSweepAngle] = useState<number>(0);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | 0>(0);
  const sweepAngleRef = useRef<number>(0);

  const station = RADAR_STATIONS[stationId];

  // Rotate radar antenna beam (15 RPM = 360 deg / 4 sec = 90 deg/sec)
  useEffect(() => {
    let lastTime = performance.now();
    const rpm = station.rpm || 15;
    const degPerSec = (rpm * 360) / 60;

    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      sweepAngleRef.current = (sweepAngleRef.current + degPerSec * dt) % 360;
      setSweepAngle(Math.round(sweepAngleRef.current));
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [station.rpm]);

  // Compute polar coordinates for all real planes relative to isolated sensor head
  const isolatedTargets = useMemo(() => {
    return planes
      .map((p) => {
        if (!p.lat || !p.lon) return null;
        const pol = calcPolar(station, p.lat, p.lon);
        if (pol.rhoNm > rangeNm * 1.5) return null;

        // Classify target per CAT 048
        const isMilHeli =
          p.role === "heli" ||
          p.fastLow ||
          /^(RANGR|LSV|SVN|SV)/i.test(p.flight || "") ||
          /^L2-0[1-4]$/i.test(p.reg || "") ||
          p.ownOp === "Slovenska vojska" ||
          (p.altFt != null && p.altFt < 1500 && (p.gs || 0) > 100);

        const isBalloon = p.role === "balloon" || /sonde|hab/i.test(`${p.typecode} ${p.desc}`);
        const isUav = p.role === "uav" || p.src === "rid" || /dji|drone/i.test(`${p.typecode} ${p.model}`);
        const isEcho = p.role === "echo" || p.src === "psr" || p.src === "echo";
        const isCivil = !isMilHeli && !isBalloon && !isUav && !isEcho;

        let classification: "MIL_HELI" | "BALLOON" | "DRONE_RID" | "PSR" | "SSR_CIVIL" = "SSR_CIVIL";
        if (isMilHeli) classification = "MIL_HELI";
        else if (isBalloon) classification = "BALLOON";
        else if (isUav) classification = "DRONE_RID";
        else if (isEcho) classification = "PSR";

        return {
          ...p,
          rhoNm: pol.rhoNm,
          thetaDeg: pol.thetaDeg,
          cartX: pol.cartX,
          cartY: pol.cartY,
          classification,
        };
      })
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .filter((t) => {
        if (filterType === "all") return true;
        if (filterType === "mil") return t.classification === "MIL_HELI";
        if (filterType === "uav") return t.classification === "DRONE_RID";
        if (filterType === "balloon") return t.classification === "BALLOON";
        if (filterType === "echo") return t.classification === "PSR";
        return true;
      });
  }, [planes, station, rangeNm, filterType]);

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) - 24;

    // Clear with dark phosphor radar scope background
    ctx.fillStyle = "#04080c";
    ctx.fillRect(0, 0, width, height);

    // Radar CRT circle boundary
    const scopeGrad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    scopeGrad.addColorStop(0, "#061017");
    scopeGrad.addColorStop(0.85, "#040a0f");
    scopeGrad.addColorStop(1, "#020508");
    ctx.fillStyle = scopeGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Range rings (5, 10, 20, 40, etc.)
    const rings = [0.2, 0.4, 0.6, 0.8, 1.0];
    ctx.lineWidth = 1;
    rings.forEach((pct) => {
      const r = radius * pct;
      ctx.strokeStyle = "rgba(40, 160, 120, 0.22)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Ring label in NM
      const distLabel = `${Math.round(rangeNm * pct)} NM`;
      ctx.font = "10px monospace";
      ctx.fillStyle = "rgba(40, 180, 140, 0.6)";
      ctx.fillText(distLabel, cx + 4, cy - r + 12);
    });

    // Azimuth radial spokes (every 30 degrees)
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = ((deg - 90) * Math.PI) / 180;
      const x1 = cx + (radius * 0.1) * Math.cos(rad);
      const y1 = cy + (radius * 0.1) * Math.sin(rad);
      const x2 = cx + radius * Math.cos(rad);
      const y2 = cy + radius * Math.sin(rad);

      ctx.strokeStyle = deg % 90 === 0 ? "rgba(40, 180, 140, 0.35)" : "rgba(40, 160, 120, 0.15)";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Degree label
      const lx = cx + (radius + 14) * Math.cos(rad);
      const ly = cy + (radius + 14) * Math.sin(rad);
      ctx.font = "9px monospace";
      ctx.fillStyle = "rgba(50, 200, 150, 0.75)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const degStr = String(deg).padStart(3, "0") + "°";
      ctx.fillText(degStr, lx, ly);
    }

    // Rotating Radar Sweep Beam with Phosphor Fade
    const currentBeam = sweepAngleRef.current;
    const beamRad = ((currentBeam - 90) * Math.PI) / 180;

    if (showPhosphor) {
      // Draw trailing sweep sector (phosphor afterglow)
      const trailSpan = (35 * Math.PI) / 180;
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      sweepGrad.addColorStop(0, "rgba(40, 220, 140, 0.25)");
      sweepGrad.addColorStop(1, "rgba(20, 160, 100, 0.05)");

      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, beamRad - trailSpan, beamRad);
      ctx.closePath();
      ctx.fill();
    }

    // Main sharp sweep line
    ctx.strokeStyle = "rgba(90, 255, 180, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(beamRad), cy + radius * Math.sin(beamRad));
    ctx.stroke();

    // Antenna center mark (Single Sensor Antenna)
    ctx.fillStyle = "#3ee07a";
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Draw real targets
    isolatedTargets.forEach((target) => {
      // Map polar coordinates to canvas
      const targetDistPct = target.rhoNm / rangeNm;
      if (targetDistPct > 1.05) return;

      const targetRad = ((target.thetaDeg - 90) * Math.PI) / 180;
      const tx = cx + radius * targetDistPct * Math.cos(targetRad);
      const ty = cy + radius * targetDistPct * Math.sin(targetRad);

      const isPicked = pickedId === target.id;

      // Calculate phosphor decay relative to beam pass
      let diffAngle = (currentBeam - target.thetaDeg + 360) % 360;
      let phosphorAlpha = 1.0;
      if (diffAngle < 60) {
        phosphorAlpha = 1.0;
      } else {
        phosphorAlpha = Math.max(0.35, 1.0 - (diffAngle - 60) / 300);
      }

      // Draw real radar trails (historical scan hits)
      if (showTrails && target.trail && target.trail.length > 1) {
        const pastPoints = target.trail.slice(-8);
        pastPoints.forEach((pt, idx) => {
          const ptPol = calcPolar(station, pt.lat, pt.lon);
          const pDistPct = ptPol.rhoNm / rangeNm;
          if (pDistPct > 1.05) return;
          const pRad = ((ptPol.thetaDeg - 90) * Math.PI) / 180;
          const px = cx + radius * pDistPct * Math.cos(pRad);
          const py = cy + radius * pDistPct * Math.sin(pRad);

          const trailAgeAlpha = ((idx + 1) / pastPoints.length) * 0.5 * phosphorAlpha;
          ctx.fillStyle = target.classification === "MIL_HELI"
            ? `rgba(255, 140, 40, ${trailAgeAlpha})`
            : target.classification === "DRONE_RID"
            ? `rgba(255, 100, 200, ${trailAgeAlpha})`
            : `rgba(60, 220, 160, ${trailAgeAlpha})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.8, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Target Velocity Vector line (vectorMin projection)
      if ((target.gs || 0) > 10 && target.track != null) {
        const speedNmPerMin = (target.gs || 0) / 60;
        const projDistNm = speedNmPerMin * vectorMin;
        const projPct = projDistNm / rangeNm;
        const trkRad = ((target.track - 90) * Math.PI) / 180;
        const vx = tx + radius * projPct * Math.cos(trkRad);
        const vy = ty + radius * projPct * Math.sin(trkRad);

        ctx.strokeStyle = isPicked ? "#fffa65" : "rgba(60, 240, 170, 0.65)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(vx, vy);
        ctx.stroke();
      }

      // Target Symbology per CAT 048
      ctx.save();
      ctx.globalAlpha = phosphorAlpha;

      if (target.classification === "MIL_HELI") {
        // Slovenian Armed Forces Low-Flying Helicopter / Tactical (Amber/Red Rotor)
        ctx.strokeStyle = isPicked ? "#ffffff" : "#ff8a3d";
        ctx.fillStyle = "#ff5500";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(tx, ty, 5, 0, Math.PI * 2);
        ctx.stroke();
        // Crosshair / rotor blades
        ctx.beginPath();
        ctx.moveTo(tx - 7, ty);
        ctx.lineTo(tx + 7, ty);
        ctx.moveTo(tx, ty - 7);
        ctx.lineTo(tx, ty + 7);
        ctx.stroke();
      } else if (target.classification === "BALLOON") {
        // Radiosonde / HAB (Concentric Circle)
        ctx.strokeStyle = "#c77dff";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#c77dff";
        ctx.beginPath();
        ctx.arc(tx, ty, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (target.classification === "DRONE_RID") {
        // Direct Remote ID Drone (Hexagon)
        ctx.strokeStyle = "#ff4d8d";
        ctx.lineWidth = 1.8;
        ctx.strokeRect(tx - 4, ty - 4, 8, 8);
      } else if (target.classification === "PSR") {
        // Primary Radar Only Blip (Slash / Diamond)
        ctx.strokeStyle = "#70d6ff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx - 4, ty + 4);
        ctx.lineTo(tx + 4, ty - 4);
        ctx.stroke();
      } else {
        // Civil Mode S / SSR (Tactical ATC Square)
        ctx.fillStyle = isPicked ? "#fffa65" : "#3ee07a";
        ctx.strokeStyle = "#071018";
        ctx.lineWidth = 1;
        ctx.fillRect(tx - 3.5, ty - 3.5, 7, 7);
        ctx.strokeRect(tx - 3.5, ty - 3.5, 7, 7);
      }

      // ATC Flight Strip Data Block (Callsign, FL, Speed, Polar coords)
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const call = target.flight || target.id || "NO CALL";
      const fl = target.altFt != null ? `F${String(Math.round(target.altFt / 100)).padStart(3, "0")}` : "---";
      const spd = target.gs != null ? `${Math.round(target.gs)}K` : "";
      const polarStr = `${target.rhoNm.toFixed(1)}NM ${Math.round(target.thetaDeg)}°`;

      // Data Block background
      const bx = tx + 9;
      const by = ty - 12;
      ctx.fillStyle = isPicked ? "rgba(10, 30, 25, 0.92)" : "rgba(4, 14, 20, 0.85)";
      ctx.strokeStyle = isPicked ? "#3ee07a" : "rgba(40, 160, 120, 0.4)";
      ctx.fillRect(bx, by, 95, 36);
      ctx.strokeRect(bx, by, 95, 36);

      // Line 1: Callsign & Tag
      ctx.fillStyle = target.classification === "MIL_HELI" ? "#ffaa44" : isPicked ? "#fffa65" : "#45f396";
      ctx.fillText(`${call} ${target.classification === "MIL_HELI" ? "MIL" : ""}`, bx + 3, by + 2);

      // Line 2: FL & GS
      ctx.fillStyle = "#8ee8b5";
      ctx.fillText(`${fl} ${spd}`, bx + 3, by + 13);

      // Line 3: Polar coordinates (RHO / THETA)
      ctx.fillStyle = "#5cb890";
      ctx.fillText(polarStr, bx + 3, by + 24);

      ctx.restore();
    });
  }, [isolatedTargets, rangeNm, vectorMin, showTrails, showPhosphor, station, pickedId]);

  // Handle canvas click to pick aircraft
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) - 24;

    let closestId: string | null = null;
    let closestDist = 20; // 20px hit tolerance

    isolatedTargets.forEach((target) => {
      const targetDistPct = target.rhoNm / rangeNm;
      if (targetDistPct > 1.05) return;
      const targetRad = ((target.thetaDeg - 90) * Math.PI) / 180;
      const tx = cx + radius * targetDistPct * Math.cos(targetRad);
      const ty = cy + radius * targetDistPct * Math.sin(targetRad);

      const d = Math.hypot(clickX - tx, clickY - ty);
      if (d < closestDist) {
        closestDist = d;
        closestId = target.id;
      }
    });

    if (closestId) {
      onPickPlane?.(closestId);
    }
  };

  const pickedTarget = isolatedTargets.find((t) => t.id === pickedId);

  // Live ATC Audio stream toggler
  const toggleLiveAtc = (url: string) => {
    if (audioRef.current) {
      if (isPlayingAudio && audioUrl === url) {
        audioRef.current.pause();
        setIsPlayingAudio(false);
      } else {
        setAudioUrl(url);
        audioRef.current.src = url;
        audioRef.current.play().catch(() => {});
        setIsPlayingAudio(true);
      }
    }
  };

  return (
    <div className="asterix-radar-container" style={{ background: "#03070a", color: "#a5d8b8", fontFamily: "monospace", padding: "12px", borderRadius: "8px" }}>
      {/* Top Header & Single Sensor Isolation Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px", borderBottom: "1px solid rgba(40, 160, 120, 0.3)", paddingBottom: "10px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#3ee07a", boxShadow: "0 0 8px #3ee07a" }} />
            <strong style={{ fontSize: "16px", color: "#3ee07a", letterSpacing: "1px" }}>
              ASTERIX CAT 048 TACTICAL RADAR SCOPE
            </strong>
            <span style={{ fontSize: "11px", background: "rgba(40,160,120,0.2)", padding: "2px 6px", borderRadius: "4px" }}>
              SINGLE SENSOR ISOLATION
            </span>
          </div>
          <small style={{ color: "#74b391" }}>
            Active Sensor Antenna: <strong>{station.name}</strong> · SAC: <strong>{station.sac}</strong> / SIC: <strong>{station.sic}</strong> ({station.lat.toFixed(4)}°N, {station.lon.toFixed(4)}°E)
          </small>
        </div>

        {/* Station Head Selector */}
        <div style={{ display: "flex", gap: "6px" }}>
          {(Object.keys(RADAR_STATIONS) as RadarStationId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setStationId(id)}
              style={{
                background: stationId === id ? "#287a55" : "rgba(20,50,40,0.6)",
                color: stationId === id ? "#ffffff" : "#a5d8b8",
                border: "1px solid #3ee07a",
                borderRadius: "4px",
                padding: "5px 10px",
                cursor: "pointer",
                fontWeight: stationId === id ? "bold" : "normal",
                fontSize: "12px",
              }}
            >
              🛰️ {id === "puconci" ? "Puconci SDR" : id === "dolina43" ? "Dolina 43 SDR" : "LJMS Head"}
            </button>
          ))}
        </div>
      </div>

      {/* Main Radar Layout: Scope Canvas + Tactical Telemetry HUD */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "14px" }}>
        {/* Canvas Radar Viewport */}
        <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", background: "#020406", borderRadius: "8px", border: "1px solid rgba(40,160,120,0.35)", overflow: "hidden" }}>
          <canvas
            ref={canvasRef}
            width={720}
            height={720}
            onClick={handleCanvasClick}
            style={{ width: "100%", maxWidth: "720px", height: "auto", cursor: "crosshair" }}
          />

          {/* Radar Overlay Stats Bar */}
          <div style={{ position: "absolute", top: "12px", left: "14px", fontSize: "11px", pointerEvents: "none", background: "rgba(4,10,14,0.75)", padding: "6px 10px", borderRadius: "4px", border: "1px solid rgba(40,160,120,0.3)" }}>
            <div>SWEEP AZIMUTH: <strong style={{ color: "#3ee07a" }}>{String(sweepAngle).padStart(3, "0")}°</strong></div>
            <div>RANGE SCALE: <strong style={{ color: "#3ee07a" }}>{rangeNm} NM</strong></div>
            <div>TRACKS IN THEATER: <strong style={{ color: "#3ee07a" }}>{isolatedTargets.length}</strong></div>
            <div>RADAR PERIOD: <strong style={{ color: "#3ee07a" }}>4.0s (15 RPM)</strong></div>
          </div>

          {/* Quick Scope Controls (Range & Filter) */}
          <div style={{ position: "absolute", bottom: "12px", left: "14px", display: "flex", gap: "6px", flexWrap: "wrap", background: "rgba(4,10,14,0.85)", padding: "6px", borderRadius: "6px", border: "1px solid rgba(40,160,120,0.3)" }}>
            <span style={{ fontSize: "11px", alignSelf: "center", marginRight: "4px" }}>RANGE:</span>
            {[10, 25, 50, 80, 120].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRangeNm(r)}
                style={{
                  background: rangeNm === r ? "#3ee07a" : "transparent",
                  color: rangeNm === r ? "#040a0f" : "#a5d8b8",
                  border: "1px solid rgba(60,220,140,0.4)",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  fontSize: "10px",
                  cursor: "pointer",
                }}
              >
                {r}NM
              </button>
            ))}

            <span style={{ fontSize: "11px", alignSelf: "center", margin: "0 4px 0 8px" }}>LEADER:</span>
            {[1, 2, 3].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setVectorMin(m)}
                style={{
                  background: vectorMin === m ? "#3ee07a" : "transparent",
                  color: vectorMin === m ? "#040a0f" : "#a5d8b8",
                  border: "1px solid rgba(60,220,140,0.4)",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  fontSize: "10px",
                  cursor: "pointer",
                }}
              >
                {m}m
              </button>
            ))}

            <button
              type="button"
              onClick={() => setShowTrails(!showTrails)}
              style={{
                background: showTrails ? "rgba(60,220,140,0.2)" : "transparent",
                color: "#3ee07a",
                border: "1px solid rgba(60,220,140,0.4)",
                padding: "2px 8px",
                borderRadius: "3px",
                fontSize: "10px",
                cursor: "pointer",
                marginLeft: "6px",
              }}
            >
              TRAILS: {showTrails ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Right Tactical Telemetry & Target Details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Target Filter Selectors */}
          <div style={{ background: "rgba(10,24,20,0.85)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(40,160,120,0.3)" }}>
            <div style={{ fontSize: "11px", fontWeight: "bold", color: "#3ee07a", marginBottom: "6px" }}>
              TARGET FILTER (CAT 048 I020)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
              {[
                { id: "all", label: "ALL TARGETS" },
                { id: "mil", label: "🚁 MIL LOW-FLY" },
                { id: "uav", label: "🛸 DRONE RID" },
                { id: "balloon", label: "🎈 RADIOSONDE" },
                { id: "echo", label: "✦ PSR CLUTTER" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterType(f.id as any)}
                  style={{
                    background: filterType === f.id ? "#287a55" : "rgba(14,35,28,0.5)",
                    color: filterType === f.id ? "#ffffff" : "#99d1b0",
                    border: "1px solid rgba(40,160,120,0.3)",
                    padding: "4px",
                    borderRadius: "3px",
                    fontSize: "10px",
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active / Picked Target Data Block */}
          {pickedTarget ? (
            <div style={{ background: "rgba(12,30,25,0.9)", padding: "10px", borderRadius: "6px", border: "1px solid #3ee07a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "#fffa65", fontSize: "14px" }}>
                  {pickedTarget.flight || pickedTarget.id}
                </strong>
                <span style={{ fontSize: "10px", background: "#ff8a3d", color: "#000", padding: "1px 4px", borderRadius: "3px", fontWeight: "bold" }}>
                  {pickedTarget.classification}
                </span>
              </div>
              <div style={{ fontSize: "11px", marginTop: "4px", color: "#b8ebd0", lineHeight: "1.4" }}>
                <div>ICAO: <strong>{pickedTarget.id?.toUpperCase()}</strong> · SQUAWK: <strong>{pickedTarget.squawk || "7000"}</strong></div>
                <div>ALTITUDE: <strong>{pickedTarget.altFt != null ? `${pickedTarget.altFt} FT (FL${Math.round(pickedTarget.altFt / 100)})` : "UNKNOWN"}</strong></div>
                <div>GROUND SPEED: <strong>{pickedTarget.gs != null ? `${Math.round(pickedTarget.gs)} KT` : "---"}</strong> · TRACK: <strong>{pickedTarget.track != null ? `${Math.round(pickedTarget.track)}°` : "---"}</strong></div>
                <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px dashed rgba(60,220,140,0.3)" }}>
                  <div style={{ color: "#3ee07a", fontWeight: "bold" }}>CAT 048 POLAR / CARTESIAN:</div>
                  <div>RHO (SLANT RANGE): <strong>{pickedTarget.rhoNm} NM</strong></div>
                  <div>THETA (AZIMUTH): <strong>{pickedTarget.thetaDeg}°</strong></div>
                  <div>X: <strong>{pickedTarget.cartX} NM</strong> · Y: <strong>{pickedTarget.cartY} NM</strong></div>
                  <div>DATA SOURCE: <strong>SAC {station.sac} / SIC {station.sic}</strong></div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: "rgba(10,24,20,0.6)", padding: "12px", borderRadius: "6px", border: "1px solid rgba(40,160,120,0.25)", fontSize: "11px", textAlign: "center", color: "#74b391" }}>
              Click any blip on the radar scope to view full CAT 048 flight strip telemetry.
            </div>
          )}

          {/* Live Beast Mode Binary Feed Status */}
          <div style={{ background: "rgba(8,20,16,0.85)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(40,160,120,0.3)", fontSize: "11px" }}>
            <div style={{ fontWeight: "bold", color: "#3ee07a", marginBottom: "4px" }}>
              LIVE RAW BINARY BEAST SDR STATUS
            </div>
            <div>FEEDER TCP: <strong>{beastStatus?.tcpHost || "0.0.0.0"}:{beastStatus?.tcpPort || station.freqMhz}</strong></div>
            <div>BEAST FRAMES: <strong>{beastStatus?.frames || 0}</strong></div>
            <div>STREAM THROUGHPUT: <strong>{beastStatus?.bytes ? `${Math.round(beastStatus.bytes / 1024)} KB` : "0 KB"}</strong></div>
            <div>STATUS: <strong style={{ color: "#3ee07a" }}>CONNECTED / ACTIVE</strong></div>
          </div>

          {/* Live ATC Radio Audio Stream Player */}
          <div style={{ background: "rgba(8,20,16,0.85)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(40,160,120,0.3)", fontSize: "11px" }}>
            <div style={{ fontWeight: "bold", color: "#3ee07a", marginBottom: "6px" }}>
              🎙️ LIVE ATC RADIO STREAMS
            </div>
            <audio ref={audioRef} />
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {[
                { name: "Ljubljana (LJLJ) Tower", freq: "118.475 MHz", url: "https://www.liveatc.net/search/?icao=LJLJ" },
                { name: "Ljubljana (LJLJ) Radar", freq: "135.250 MHz", url: "https://www.liveatc.net/search/?icao=LJLJ" },
                { name: "Graz (LOWG) Approach", freq: "119.300 MHz", url: "https://www.liveatc.net/search/?icao=LOWG" },
                { name: "Zagreb (LDZA) Radar", freq: "120.700 MHz", url: "https://www.liveatc.net/search/?icao=LDZA" },
              ].map((st, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(16,40,30,0.5)", padding: "3px 6px", borderRadius: "3px" }}>
                  <span>{st.name} <small style={{ color: "#5bb88a" }}>({st.freq})</small></span>
                  <a
                    href={st.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#3ee07a", textDecoration: "none", fontSize: "10px", border: "1px solid rgba(40,160,120,0.4)", padding: "1px 5px", borderRadius: "3px" }}
                  >
                    Listen ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
