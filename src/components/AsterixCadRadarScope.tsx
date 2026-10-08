import React, { useState, useEffect, useRef, useMemo } from "react";

export type CadRadarCenter = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  altM: number;
  icao?: string;
};

const RADAR_CENTERS: CadRadarCenter[] = [
  { id: "ljms", name: "LJMS Murska Sobota (OGN / APRS)", lat: 46.6292, lon: 16.1908, altM: 185, icao: "LJMS" },
  { id: "puconci", name: "Puconci Primary Radar (PSR)", lat: 46.7020, lon: 16.1550, altM: 260 },
  { id: "ljmb", name: "Maribor Airport (LJMB)", lat: 46.4799, lon: 15.6864, altM: 267, icao: "LJMB" },
  { id: "ljlj", name: "Ljubljana Brnik (LJLJ)", lat: 46.2237, lon: 14.4576, altM: 388, icao: "LJLJ" },
  { id: "ljce", name: "Cerklje Military Base (LJCE)", lat: 45.8999, lon: 15.5303, altM: 153, icao: "LJCE" },
];

export const AsterixCadRadarScope: React.FC<{
  planes?: any[];
  onPinpointPlane?: (id: string) => void;
}> = ({ planes = [], onPinpointPlane }) => {
  const [centerId, setCenterId] = useState<string>("ljms");
  const [rangeNm, setRangeNm] = useState<number>(40);
  const [showFlarm, setShowFlarm] = useState<boolean>(true);
  const [onlyLjmsGateway, setOnlyLjmsGateway] = useState<boolean>(false);
  const [showSurfaceMlat, setShowSurfaceMlat] = useState<boolean>(true);
  const [showPclBistatic, setShowPclBistatic] = useState<boolean>(true);
  const [showSatellites, setShowSatellites] = useState<boolean>(true);
  const [showPhosphorTrails, setShowPhosphorTrails] = useState<boolean>(true);
  const [selectedTarget, setSelectedTarget] = useState<any | null>(null);

  // Raw OGN packets state
  const [rawPackets, setRawPackets] = useState<any[]>([]);
  const [pclData, setPclData] = useState<any | null>(null);
  const [terminalFilter, setTerminalFilter] = useState<"all" | "ljms">("all");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const sweepAngleRef = useRef<number>(0);

  const activeCenter = useMemo(
    () => RADAR_CENTERS.find((c) => c.id === centerId) || RADAR_CENTERS[0],
    [centerId]
  );

  // Poll raw OGN APRS packets & PCL telemetry
  useEffect(() => {
    let active = true;
    const fetchTelemetry = async () => {
      try {
        const [ognRes, pclRes] = await Promise.all([
          fetch(`/api/ogn/raw?ljms=${terminalFilter === "ljms" ? "1" : "0"}`).then((r) => r.json()).catch(() => ({ packets: [] })),
          fetch("/api/pcl/telemetry").then((r) => r.json()).catch(() => null),
        ]);
        if (active) {
          if (ognRes && ognRes.packets) setRawPackets(ognRes.packets);
          if (pclRes) setPclData(pclRes);
        }
      } catch {}
    };

    fetchTelemetry();
    const timer = setInterval(fetchTelemetry, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [terminalFilter]);

  // Transform coordinates to radar screen pixels
  const wgsToScreen = (lat: number, lon: number, width: number, height: number) => {
    const origin = activeCenter;
    const dLat = (lat - origin.lat) * 60; // nautical miles approx
    const dLon = (lon - origin.lon) * 60 * Math.cos((origin.lat * Math.PI) / 180);

    const cx = width / 2;
    const cy = height / 2;
    const scale = (Math.min(width, height) / 2) / rangeNm;

    const screenX = cx + dLon * scale;
    const screenY = cy - dLat * scale;

    const rhoNm = Math.sqrt(dLat ** 2 + dLon ** 2);
    const thetaDeg = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;

    return { x: screenX, y: screenY, rhoNm, thetaDeg, inView: rhoNm <= rangeNm * 1.05 };
  };

  // Main Radar Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;

      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const maxRadius = Math.min(width, height) / 2;
      const scale = maxRadius / rangeNm;

      // 1. Phosphor Persistence Fade
      if (showPhosphorTrails) {
        ctx.fillStyle = "rgba(4, 12, 10, 0.14)";
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.fillStyle = "#040c0a";
        ctx.fillRect(0, 0, width, height);
      }

      // 2. CAD Vector Radar Grid (Phosphor Green)
      ctx.save();
      ctx.strokeStyle = "rgba(0, 255, 102, 0.22)";
      ctx.lineWidth = 1;

      // Concentric Slant Range Rings
      const ringIntervals = rangeNm <= 15 ? [2, 5, 10, 15] : rangeNm <= 50 ? [10, 20, 30, 40, 50] : [20, 40, 60, 80, 100];
      for (const r of ringIntervals) {
        if (r > rangeNm) continue;
        const radiusPx = r * scale;
        ctx.beginPath();
        ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
        ctx.stroke();

        // Range Label
        ctx.fillStyle = "rgba(0, 255, 102, 0.55)";
        ctx.font = "10px 'Share Tech Mono', monospace";
        ctx.fillText(`${r} NM`, cx + 6, cy - radiusPx + 12);
      }

      // Azimuth Spokes (every 30 degrees)
      for (let deg = 0; deg < 360; deg += 30) {
        const rad = ((deg - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(rad) * maxRadius, cy + Math.sin(rad) * maxRadius);
        ctx.stroke();

        // Heading Label
        const lx = cx + Math.cos(rad) * (maxRadius - 16);
        const ly = cy + Math.sin(rad) * (maxRadius - 16);
        ctx.fillStyle = "rgba(0, 255, 102, 0.65)";
        ctx.font = "10px 'Share Tech Mono', monospace";
        ctx.fillText(`${deg.toString().padStart(3, "0")}°`, lx - 10, ly + 4);
      }
      ctx.restore();

      // 3. Airfield CAD Vectors (LJMS, LJMB, LJLJ)
      if (pclData && pclData.aerodromes) {
        for (const apt of pclData.aerodromes) {
          const aptPos = wgsToScreen(apt.arpLat, apt.arpLon, width, height);
          if (aptPos.inView) {
            ctx.save();
            ctx.strokeStyle = "#3ee0c2";
            ctx.fillStyle = "#3ee0c2";
            ctx.lineWidth = 2;

            // Airfield Center Icon
            ctx.strokeRect(aptPos.x - 4, aptPos.y - 4, 8, 8);
            ctx.font = "bold 11px 'Share Tech Mono', monospace";
            ctx.fillText(`✈ ${apt.icao} · ${apt.name.split(" ")[0]}`, aptPos.x + 8, aptPos.y - 6);

            // Detailed Runway for LJMS
            if (apt.icao === "LJMS" && apt.runway10_28) {
              const r1 = wgsToScreen(apt.runway10_28.rwy10[0], apt.runway10_28.rwy10[1], width, height);
              const r2 = wgsToScreen(apt.runway10_28.rwy28[0], apt.runway10_28.rwy28[1], width, height);
              ctx.lineWidth = 4;
              ctx.strokeStyle = "#00ff66";
              ctx.beginPath();
              ctx.moveTo(r1.x, r1.y);
              ctx.lineTo(r2.x, r2.y);
              ctx.stroke();

              ctx.font = "9px monospace";
              ctx.fillStyle = "#00ff66";
              ctx.fillText("RWY 10/28 (1200m)", r1.x - 20, r1.y - 8);
            }
            ctx.restore();
          }
        }
      }

      // 4. PCL Bistatic Radar Reflection Ellipses (Reflectors of Opportunity)
      if (showPclBistatic && pclData && pclData.targets) {
        ctx.save();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);

        for (const t of pclData.targets.slice(0, 10)) {
          for (const pcl of t.pclReflections || []) {
            if (pcl.ellipsePoints && pcl.ellipsePoints.length) {
              ctx.beginPath();
              let first = true;
              for (const pt of pcl.ellipsePoints) {
                const s = wgsToScreen(pt[0], pt[1], width, height);
                if (first) {
                  ctx.moveTo(s.x, s.y);
                  first = false;
                } else {
                  ctx.lineTo(s.x, s.y);
                }
              }
              ctx.closePath();
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // 5. Radar Sweep Line & Phosphor Glow
      sweepAngleRef.current = (sweepAngleRef.current + 1.2) % 360;
      const sweepRad = ((sweepAngleRef.current - 90) * Math.PI) / 180;
      ctx.save();
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius);
      sweepGrad.addColorStop(0, "rgba(0, 255, 102, 0.4)");
      sweepGrad.addColorStop(1, "rgba(0, 255, 102, 0.0)");

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxRadius, sweepRad - 0.25, sweepRad);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // Sharp Beam Line
      ctx.strokeStyle = "#00ff66";
      ctx.lineWidth = 1.8;
      ctx.shadowColor = "#00ff66";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepRad) * maxRadius, cy + Math.sin(sweepRad) * maxRadius);
      ctx.stroke();
      ctx.restore();

      // 6. Draw Targets (FLARM, OGN Gliders, Drones, Mode S Aircraft, CAT 010 Surface)
      const allTargets = [
        ...(pclData?.targets || []),
        ...planes.filter((p) => !pclData?.targets?.some((t: any) => t.hex === (p.icao || p.id || p.hex))),
      ];

      for (const t of allTargets) {
        if (!t.lat || !t.lon) continue;
        const s = wgsToScreen(t.lat, t.lon, width, height);
        if (!s.inView) continue;

        const isFlarmGlider = t.isGlider || t.category === "GLIDER" || t.isFlarm;
        const isDrone = t.isDrone || t.category === "DRONE_UAV";
        const isSurface = t.isSurfaceMovement || (t.altFt <= 300 && (t.speedKnots || t.speed || 0) < 50);

        if (onlyLjmsGateway && !t.isLjmsGateway) continue;
        if (!showFlarm && isFlarmGlider) continue;
        if (!showSurfaceMlat && isSurface) continue;

        ctx.save();

        // Target Color & Symbol
        let color = "#00ff66"; // Standard ASTERIX Mode S
        let symbol = "◇";

        if (isFlarmGlider) {
          color = "#ffdd00"; // FLARM Glider Yellow
          symbol = "▲";
        } else if (isDrone) {
          color = "#ff3366"; // Drone Red
          symbol = "⬢";
        } else if (isSurface) {
          color = "#c084fc"; // Surface Movement Purple (CAT 010)
          symbol = "●";
        } else if (t.isMil || t.mil) {
          color = "#ff3333"; // Military Red
          symbol = "◆";
        }

        // Draw Target Symbol
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;

        ctx.font = "bold 13px monospace";
        ctx.fillText(symbol, s.x - 5, s.y + 5);

        // Velocity Vector Lead Line (Ground Track)
        const trk = (t.track || 0);
        const gs = (t.speedKnots || t.speed || t.gs || 0);
        if (gs > 10) {
          const vLen = Math.min(45, (gs / 10) * 1.5);
          const vRad = ((trk - 90) * Math.PI) / 180;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + Math.cos(vRad) * vLen, s.y + Math.sin(vRad) * vLen);
          ctx.stroke();
        }

        // ASTERIX CAT 048 / 021 Data Block
        ctx.shadowBlur = 0;
        ctx.font = "10px 'Share Tech Mono', monospace";
        const callsign = t.callsign || t.flight || t.hex?.toUpperCase() || "UNKNOWN";
        const fl = t.altFt ? `FL${Math.round(t.altFt / 100).toString().padStart(3, "0")}` : "GND";
        const spd = Math.round(gs);

        // Data block text box
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(s.x + 10, s.y - 18, 90, 34);
        ctx.strokeStyle = `${color}66`;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(s.x + 10, s.y - 18, 90, 34);

        ctx.fillStyle = color;
        ctx.fillText(callsign, s.x + 14, s.y - 6);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillText(`${fl}  ${spd}KT`, s.x + 14, s.y + 8);

        if (t.isLjmsGateway) {
          ctx.fillStyle = "#ffdd00";
          ctx.font = "bold 8px monospace";
          ctx.fillText("⚡ LJMS OGN", s.x + 58, s.y - 6);
        }

        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [activeCenter, rangeNm, showFlarm, onlyLjmsGateway, showSurfaceMlat, showPclBistatic, showSatellites, showPhosphorTrails, pclData, planes]);

  // Click on canvas to select target
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const allTargets = [
      ...(pclData?.targets || []),
      ...planes,
    ];

    let closest = null;
    let minDist = 25;

    for (const t of allTargets) {
      if (!t.lat || !t.lon) continue;
      const s = wgsToScreen(t.lat, t.lon, canvas.width, canvas.height);
      const d = Math.sqrt((s.x - clickX) ** 2 + (s.y - clickY) ** 2);
      if (d < minDist) {
        minDist = d;
        closest = t;
      }
    }

    setSelectedTarget(closest);
    if (closest && onPinpointPlane) {
      onPinpointPlane(closest.hex || closest.id);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", maxWidth: "1600px", margin: "0 auto", color: "#e2e8f0" }}>
      {/* Top Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(4, 18, 14, 0.95), rgba(8, 28, 22, 0.95))",
          border: "1px solid rgba(0, 255, 102, 0.4)",
          borderRadius: "8px",
          padding: "12px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          boxShadow: "0 0 20px rgba(0, 255, 102, 0.15)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 900, color: "#00ff66", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "8px" }}>
            📐 ASTERIX CAD RADAR SCOPE & PCL PASSIVE COHERENT LOCATION
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#94a3b8" }}>
            Direct 868.2 MHz FLARM / OGN APRS Gateway (LJMS) · Mode S Surface Multilateration · Reflectors of Opportunity · ASTERIX CAT 010/021/048 Standards
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 8px", borderRadius: "4px", background: "rgba(0, 255, 102, 0.15)", color: "#00ff66", border: "1px solid #00ff66" }}>
            ● APRS-IS: CONNECTED
          </span>
          <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 8px", borderRadius: "4px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "1px solid #38bdf8" }}>
            PCL BISTATIC: ACTIVE
          </span>
          <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 8px", borderRadius: "4px", background: "rgba(192, 132, 252, 0.15)", color: "#c084fc", border: "1px solid #c084fc" }}>
            CAT 010 MLAT: LIVE
          </span>
        </div>
      </div>

      {/* Interactive Controls Bar */}
      <div
        style={{
          background: "rgba(10, 20, 16, 0.8)",
          border: "1px solid rgba(0, 255, 102, 0.2)",
          borderRadius: "6px",
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          fontSize: "12px",
        }}
      >
        {/* Radar Origin Center */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: "#94a3b8", fontWeight: 700 }}>RADAR ORIGIN:</span>
          {RADAR_CENTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCenterId(c.id)}
              style={{
                background: centerId === c.id ? "#00ff66" : "rgba(255,255,255,0.05)",
                color: centerId === c.id ? "#000" : "#cbd5e1",
                border: `1px solid ${centerId === c.id ? "#00ff66" : "rgba(255,255,255,0.1)"}`,
                padding: "4px 8px",
                borderRadius: "4px",
                fontWeight: 700,
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              {c.name.split(" ")[0]}
            </button>
          ))}
        </div>

        {/* Range Scale */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: "#94a3b8", fontWeight: 700 }}>RANGE SCALE:</span>
          {[15, 25, 40, 60, 100].map((rng) => (
            <button
              key={rng}
              type="button"
              onClick={() => setRangeNm(rng)}
              style={{
                background: rangeNm === rng ? "#38bdf8" : "rgba(255,255,255,0.05)",
                color: rangeNm === rng ? "#000" : "#cbd5e1",
                border: `1px solid ${rangeNm === rng ? "#38bdf8" : "rgba(255,255,255,0.1)"}`,
                padding: "4px 8px",
                borderRadius: "4px",
                fontWeight: 700,
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              {rng} NM
            </button>
          ))}
        </div>

        {/* Layer Toggles */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowFlarm(!showFlarm)}
            style={{
              background: showFlarm ? "rgba(255, 221, 0, 0.2)" : "transparent",
              color: showFlarm ? "#ffdd00" : "#94a3b8",
              border: `1px solid ${showFlarm ? "#ffdd00" : "rgba(255,255,255,0.1)"}`,
              padding: "4px 8px",
              borderRadius: "4px",
              fontWeight: 700,
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            🟡 FLARM / OGN
          </button>
          <button
            type="button"
            onClick={() => setOnlyLjmsGateway(!onlyLjmsGateway)}
            style={{
              background: onlyLjmsGateway ? "rgba(0, 255, 102, 0.25)" : "transparent",
              color: onlyLjmsGateway ? "#00ff66" : "#94a3b8",
              border: `1px solid ${onlyLjmsGateway ? "#00ff66" : "rgba(255,255,255,0.1)"}`,
              padding: "4px 8px",
              borderRadius: "4px",
              fontWeight: 700,
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            ⚡ LJMS GATEWAY ONLY
          </button>
          <button
            type="button"
            onClick={() => setShowSurfaceMlat(!showSurfaceMlat)}
            style={{
              background: showSurfaceMlat ? "rgba(192, 132, 252, 0.2)" : "transparent",
              color: showSurfaceMlat ? "#c084fc" : "#94a3b8",
              border: `1px solid ${showSurfaceMlat ? "#c084fc" : "rgba(255,255,255,0.1)"}`,
              padding: "4px 8px",
              borderRadius: "4px",
              fontWeight: 700,
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            🟣 CAT 010 GROUND
          </button>
          <button
            type="button"
            onClick={() => setShowPclBistatic(!showPclBistatic)}
            style={{
              background: showPclBistatic ? "rgba(56, 189, 248, 0.2)" : "transparent",
              color: showPclBistatic ? "#38bdf8" : "#94a3b8",
              border: `1px solid ${showPclBistatic ? "#38bdf8" : "rgba(255,255,255,0.1)"}`,
              padding: "4px 8px",
              borderRadius: "4px",
              fontWeight: 700,
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            🔵 PCL ELLIPSES
          </button>
        </div>
      </div>

      {/* Main Grid: CAD Canvas Scope (Left) + ASTERIX / APRS Inspector (Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", gap: "14px", alignItems: "start" }}>
        {/* CAD Canvas Scope */}
        <div
          style={{
            background: "#040c0a",
            borderRadius: "8px",
            border: "2px solid #00ff66",
            boxShadow: "0 0 25px rgba(0, 255, 102, 0.2), inset 0 0 40px rgba(0, 0, 0, 0.8)",
            position: "relative",
            overflow: "hidden",
            height: "720px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <canvas
            ref={canvasRef}
            width={900}
            height={720}
            onClick={handleCanvasClick}
            style={{ width: "100%", height: "100%", cursor: "crosshair", display: "block" }}
          />

          {/* Scope Overlay HUD */}
          <div
            style={{
              position: "absolute",
              top: "12px",
              left: "14px",
              background: "rgba(0, 0, 0, 0.7)",
              padding: "6px 12px",
              borderRadius: "4px",
              border: "1px solid rgba(0, 255, 102, 0.4)",
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: "11px",
              color: "#00ff66",
              pointerEvents: "none",
            }}
          >
            <div>ORIGIN: <b>{activeCenter.name}</b></div>
            <div>COORDINATES: LAT {activeCenter.lat.toFixed(4)}° / LON {activeCenter.lon.toFixed(4)}°</div>
            <div>SLANT SCALE: {rangeNm} NM · ELEVATION: {activeCenter.altM}m MSL</div>
          </div>
        </div>

        {/* Right Panel: Selected Target Data Block + Live APRS Raw Stream */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", height: "720px" }}>
          {/* Target Interrogation Block */}
          <div
            style={{
              background: "rgba(10, 18, 16, 0.9)",
              border: "1px solid rgba(0, 255, 102, 0.3)",
              borderRadius: "8px",
              padding: "14px",
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 900, color: "#00ff66" }}>
                🎯 ASTERIX TARGET DATA BLOCK
              </span>
              <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                CAT 048 / CAT 021 / CAT 010
              </span>
            </div>

            {selectedTarget ? (
              <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>CALLSIGN:</span>
                  <b style={{ color: "#00ff66" }}>{selectedTarget.callsign || selectedTarget.flight || "UNKNOWN"}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>TRANSPONDER / FLARM ID:</span>
                  <b style={{ color: "#38bdf8" }}>{selectedTarget.hex?.toUpperCase()}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>CATEGORY:</span>
                  <span style={{ color: selectedTarget.isGlider ? "#ffdd00" : selectedTarget.isDrone ? "#ff3366" : "#cbd5e1", fontWeight: 700 }}>
                    {selectedTarget.category || "AIRCRAFT"} ({selectedTarget.protocol || "MODE_S"})
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>ALTITUDE / FL:</span>
                  <b>{selectedTarget.altFt ? `${selectedTarget.altFt} ft (FL${Math.round(selectedTarget.altFt / 100)})` : "SURFACE"}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>GROUND SPEED / TRACK:</span>
                  <b>{Math.round(selectedTarget.speedKnots || selectedTarget.speed || 0)} KT @ {Math.round(selectedTarget.track || 0)}°</b>
                </div>
                {selectedTarget.receiverStation && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#94a3b8" }}>RECEIVER GATEWAY:</span>
                    <b style={{ color: selectedTarget.isLjmsGateway ? "#00ff66" : "#cbd5e1" }}>
                      {selectedTarget.receiverStation} {selectedTarget.isLjmsGateway ? "⚡ (LJMS)" : ""}
                    </b>
                  </div>
                )}
                {selectedTarget.rfMetrics && (
                  <div style={{ background: "#050d0a", padding: "8px", borderRadius: "4px", marginTop: "4px", fontSize: "11px" }}>
                    <div style={{ color: "#3ee0c2", fontWeight: 700 }}>RAW 868 MHz RF TELEMETRY:</div>
                    <div>SNR: {selectedTarget.rfMetrics.snrDb ?? "--"} dB · FREQ OFFSET: {selectedTarget.rfMetrics.freqOffset ?? "0 kHz"}</div>
                    <div>CLIMB: {selectedTarget.rfMetrics.climbMps?.toFixed(1) ?? "0"} m/s · TURN: {selectedTarget.rfMetrics.turnRate ?? "0"} deg/s</div>
                  </div>
                )}
                {selectedTarget.asterixCat048Hex && (
                  <div style={{ marginTop: "6px" }}>
                    <div style={{ fontSize: "10px", color: "#94a3b8" }}>RAW ASTERIX CAT 048 HEX DATAGRAM:</div>
                    <pre style={{ margin: "2px 0 0", padding: "6px", background: "#05090b", color: "#00ff66", fontSize: "10px", overflowX: "auto", borderRadius: "3px" }}>
                      {selectedTarget.asterixCat048Hex}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: "12px", color: "#64748b", margin: "14px 0" }}>
                Click any aircraft, glider, or drone target on the CAD scope to inspect real-time ASTERIX data blocks and RF telemetry.
              </p>
            )}
          </div>

          {/* Live Raw APRS & OGN Packet Stream */}
          <div
            style={{
              flex: 1,
              background: "rgba(10, 18, 16, 0.9)",
              border: "1px solid rgba(0, 255, 102, 0.3)",
              borderRadius: "8px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 900, color: "#ffdd00", fontFamily: "monospace" }}>
                📡 LIVE 868 MHz APRS PACKET STREAM
              </span>
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  type="button"
                  onClick={() => setTerminalFilter("all")}
                  style={{
                    background: terminalFilter === "all" ? "#ffdd00" : "transparent",
                    color: terminalFilter === "all" ? "#000" : "#ffdd00",
                    border: "1px solid #ffdd00",
                    padding: "2px 6px",
                    borderRadius: "3px",
                    fontSize: "10px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ALL ({rawPackets.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTerminalFilter("ljms")}
                  style={{
                    background: terminalFilter === "ljms" ? "#00ff66" : "transparent",
                    color: terminalFilter === "ljms" ? "#000" : "#00ff66",
                    border: "1px solid #00ff66",
                    padding: "2px 6px",
                    borderRadius: "3px",
                    fontSize: "10px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  LJMS GATEWAY
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                background: "#030806",
                borderRadius: "4px",
                padding: "8px",
                fontFamily: "monospace",
                fontSize: "10px",
                color: "#cbd5e1",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {rawPackets.map((pkt, i) => (
                <div
                  key={i}
                  style={{
                    padding: "6px",
                    background: pkt.isLjms ? "rgba(0, 255, 102, 0.08)" : "rgba(255, 255, 255, 0.03)",
                    borderLeft: `2px solid ${pkt.isLjms ? "#00ff66" : "#ffdd00"}`,
                    borderRadius: "2px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8" }}>
                    <span>{new Date(pkt.timestamp).toLocaleTimeString()}</span>
                    <b style={{ color: pkt.isLjms ? "#00ff66" : "#38bdf8" }}>
                      qAS,{pkt.receiver || "UNKNOWN"} {pkt.isLjms ? "⚡ LJMS AIRPORT" : ""}
                    </b>
                  </div>
                  <div style={{ color: "#e2e8f0", wordBreak: "break-all", margin: "2px 0" }}>
                    {pkt.raw}
                  </div>
                  {pkt.asterixCat021 && (
                    <div style={{ color: "#00ff66", fontSize: "9px" }}>
                      <b>CAT 021:</b> {pkt.asterixCat021.slice(0, 32)}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
