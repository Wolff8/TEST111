import React, { useState, useEffect, useMemo, useRef } from "react";

export type CockpitPlane = {
  id: string;
  callsign?: string;
  lat: number;
  lon: number;
  alt: number; // feet
  speed: number; // knots
  track: number; // degrees
  vrate?: number; // fpm
  squawk?: string;
  model?: string;
  origin?: string;
  dest?: string;
  isMil?: boolean;
};

interface CockpitHudProps {
  plane: CockpitPlane;
  onClose: () => void;
  onTargetRunway?: (icao: string) => void;
}

// Major runways in Slovenia & neighboring region for ILS approach guidance
const AIRPORT_RUNWAYS = [
  { icao: "LJMB", name: "Maribor Rwy 14", lat: 46.4799, lon: 15.6864, rwyHdg: 142, eleFt: 876, ilsFreq: "110.30" },
  { icao: "LJMB", name: "Maribor Rwy 32", lat: 46.4800, lon: 15.6865, rwyHdg: 322, eleFt: 876, ilsFreq: "109.10" },
  { icao: "LJLJ", name: "Ljubljana Rwy 30", lat: 46.2237, lon: 14.4576, rwyHdg: 300, eleFt: 1273, ilsFreq: "109.50" },
  { icao: "LJLJ", name: "Ljubljana Rwy 12", lat: 46.2237, lon: 14.4576, rwyHdg: 120, eleFt: 1273, ilsFreq: "111.10" },
  { icao: "LJCE", name: "Cerklje Rwy 08", lat: 45.8999, lon: 15.5303, rwyHdg: 80, eleFt: 502, ilsFreq: "TACAN 48X" },
  { icao: "LJPZ", name: "Portorož Rwy 15", lat: 45.4739, lon: 13.6150, rwyHdg: 151, eleFt: 7, ilsFreq: "LOC 108.70" },
  { icao: "LOWG", name: "Graz Rwy 17C", lat: 46.9911, lon: 15.4396, rwyHdg: 171, eleFt: 1115, ilsFreq: "109.90" },
];

function calcDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calcBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

export const CockpitHudOverlay: React.FC<CockpitHudProps> = ({ plane, onClose }) => {
  const [hudMode, setHudMode] = useState<"military" | "airbus" | "night">("military");
  const [soundAlerts, setSoundAlerts] = useState<boolean>(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Find nearest runway for ILS approach telemetry
  const nearestRunway = useMemo(() => {
    let nearest = AIRPORT_RUNWAYS[0];
    let minDist = 999999;
    for (const rwy of AIRPORT_RUNWAYS) {
      const dist = calcDistanceKm(plane.lat, plane.lon, rwy.lat, rwy.lon);
      if (dist < minDist) {
        minDist = dist;
        nearest = rwy;
      }
    }
    const distNm = minDist * 0.539957;
    const bearing = calcBearing(plane.lat, plane.lon, nearest.lat, nearest.lon);
    
    // ILS Localizer deviation in degrees (bearing - runwayHeading)
    let locDev = (bearing - nearest.rwyHdg + 540) % 360 - 180;
    // Clamped deviation for display (-2.5 to +2.5 dots)
    const locDots = Math.max(-2.5, Math.min(2.5, locDev / 1.5));

    // Glideslope (nominal 3 degrees slope = 318 ft per NM)
    const idealAltFt = nearest.eleFt + distNm * 318;
    const gsDiffFt = plane.alt - idealAltFt;
    const gsDots = Math.max(-2.5, Math.min(2.5, gsDiffFt / 250));

    return {
      ...nearest,
      distNm,
      distKm: minDist,
      bearing,
      locDots,
      gsDots,
      idealAltFt,
    };
  }, [plane.lat, plane.lon, plane.alt]);

  // Dynamics estimation
  const vrate = plane.vrate || 0;
  const speed = plane.speed || 0;
  const alt = plane.alt || 0;
  const mach = (speed / (661.47 * Math.sqrt(Math.max(0.1, 1 - 0.0000068756 * alt)))).toFixed(2);

  // Artificial horizon pitch angle (-30 to +30 deg)
  const pitchDeg = Math.max(-30, Math.min(30, vrate / 120));
  // Roll angle estimated from track variance or standard rate turn (~15 deg if banking)
  const [rollAngle, setRollAngle] = useState(0);

  useEffect(() => {
    // Subtle gyro oscillation to mimic real sensor telemetry
    const interval = setInterval(() => {
      const jitter = (Math.sin(Date.now() / 1500) * 1.5);
      setRollAngle(jitter);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Proximity warning
  const isTerrainWarning = alt < 2500 && vrate < -1500;
  const isSinkRate = vrate < -2500;

  // Sound Warning synthesizer
  useEffect(() => {
    if (!soundAlerts || !isTerrainWarning) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio autoplay policy
    }
  }, [isTerrainWarning, soundAlerts]);

  // Color schemes
  const theme = {
    military: {
      bg: "rgba(3, 10, 6, 0.92)",
      primary: "#00ff66",
      accent: "#3ee0c2",
      warn: "#ffb703",
      alert: "#ff3333",
      horizonSky: "rgba(0, 255, 102, 0.04)",
      horizonGround: "rgba(0, 255, 102, 0.08)",
      glow: "0 0 10px rgba(0, 255, 102, 0.5)",
    },
    airbus: {
      bg: "rgba(10, 16, 26, 0.94)",
      primary: "#00ffff",
      accent: "#ff00ff",
      warn: "#ffb703",
      alert: "#ff0055",
      horizonSky: "rgba(0, 120, 255, 0.4)",
      horizonGround: "rgba(160, 82, 45, 0.45)",
      glow: "0 0 8px rgba(0, 255, 255, 0.4)",
    },
    night: {
      bg: "rgba(12, 6, 0, 0.94)",
      primary: "#ff9900",
      accent: "#ffcc00",
      warn: "#ff5500",
      alert: "#ff1100",
      horizonSky: "rgba(255, 153, 0, 0.05)",
      horizonGround: "rgba(255, 153, 0, 0.12)",
      glow: "0 0 10px rgba(255, 153, 0, 0.4)",
    },
  }[hudMode];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1050px",
          height: "88vh",
          maxHeight: "750px",
          background: theme.bg,
          border: `2px solid ${theme.primary}`,
          borderRadius: "12px",
          boxShadow: `${theme.glow}, 0 20px 50px rgba(0,0,0,0.9)`,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          fontFamily: "'Share Tech Mono', monospace, 'Courier New'",
          color: theme.primary,
        }}
      >
        {/* HUD Top Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            borderBottom: `1px solid ${theme.primary}44`,
            background: "rgba(0, 0, 0, 0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "16px", fontWeight: 900, letterSpacing: "1px" }}>
              ⚡ HEAD-UP DISPLAY / PFD · {plane.callsign || plane.id.toUpperCase()}
            </span>
            <span
              style={{
                fontSize: "10px",
                padding: "2px 6px",
                borderRadius: "4px",
                background: plane.isMil ? "#ff333333" : `${theme.primary}22`,
                border: `1px solid ${plane.isMil ? "#ff3333" : theme.primary}`,
                color: plane.isMil ? "#ff3333" : theme.primary,
                fontWeight: 700,
              }}
            >
              {plane.isMil ? "MILITARY ASSET" : "CIVIL TRANSPONDER"}
            </span>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              SQUAWK: <b>{plane.squawk || "7000"}</b>
            </span>
          </div>

          {/* Mode Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ display: "flex", background: "rgba(0,0,0,0.5)", borderRadius: "4px", padding: "2px" }}>
              <button
                type="button"
                onClick={() => setHudMode("military")}
                style={{
                  background: hudMode === "military" ? theme.primary : "transparent",
                  color: hudMode === "military" ? "#000" : theme.primary,
                  border: "none",
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  borderRadius: "2px",
                }}
              >
                HUD VECTOR
              </button>
              <button
                type="button"
                onClick={() => setHudMode("airbus")}
                style={{
                  background: hudMode === "airbus" ? theme.primary : "transparent",
                  color: hudMode === "airbus" ? "#000" : theme.primary,
                  border: "none",
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  borderRadius: "2px",
                }}
              >
                AIRBUS PFD
              </button>
              <button
                type="button"
                onClick={() => setHudMode("night")}
                style={{
                  background: hudMode === "night" ? theme.primary : "transparent",
                  color: hudMode === "night" ? "#000" : theme.primary,
                  border: "none",
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  borderRadius: "2px",
                }}
              >
                FLIR NIGHT
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSoundAlerts(!soundAlerts)}
              title="Toggle audio tone annunciator"
              style={{
                background: soundAlerts ? `${theme.primary}22` : "transparent",
                border: `1px solid ${theme.primary}`,
                color: theme.primary,
                padding: "4px 8px",
                fontSize: "11px",
                cursor: "pointer",
                borderRadius: "4px",
              }}
            >
              {soundAlerts ? "🔊 AUDIO ON" : "🔇 MUTED"}
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: `1px solid ${theme.primary}`,
                color: theme.primary,
                padding: "4px 12px",
                fontSize: "13px",
                fontWeight: 900,
                cursor: "pointer",
                borderRadius: "4px",
              }}
            >
              ✕ CLOSE
            </button>
          </div>
        </div>

        {/* Main Avionics Screen */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex" }}>
          {/* LEFT TAPE: Airspeed Tape */}
          <div
            style={{
              width: "110px",
              borderRight: `1px solid ${theme.primary}33`,
              background: "rgba(0, 0, 0, 0.4)",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
          >
            <div style={{ fontSize: "10px", letterSpacing: "1px", color: "#94a3b8", marginBottom: "8px" }}>
              AIRSPEED (KT)
            </div>

            {/* Speed Ladder Ticks */}
            <div style={{ position: "relative", width: "100%", height: "280px", overflow: "hidden" }}>
              {[-60, -40, -20, 0, 20, 40, 60].map((delta) => {
                const spdVal = Math.max(0, speed + delta);
                const yPos = 140 - (delta / 60) * 120;
                return (
                  <div
                    key={delta}
                    style={{
                      position: "absolute",
                      top: `${yPos}px`,
                      right: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      opacity: delta === 0 ? 1 : 0.6,
                    }}
                  >
                    <span style={{ fontSize: delta === 0 ? "14px" : "11px", fontWeight: delta === 0 ? 900 : 400 }}>
                      {Math.round(spdVal)}
                    </span>
                    <div
                      style={{
                        width: delta === 0 ? "14px" : "8px",
                        height: "2px",
                        background: theme.primary,
                      }}
                    />
                  </div>
                );
              })}

              {/* Current Speed Readout Box */}
              <div
                style={{
                  position: "absolute",
                  top: "124px",
                  left: "6px",
                  right: "6px",
                  height: "32px",
                  border: `2px solid ${theme.primary}`,
                  background: "#000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "17px",
                  fontWeight: 900,
                  boxShadow: theme.glow,
                }}
              >
                {Math.round(speed)}
              </div>
            </div>

            {/* Mach & Ground Speed */}
            <div style={{ marginTop: "12px", textAlign: "center", fontSize: "11px" }}>
              <div style={{ color: "#94a3b8" }}>GS: <b style={{ color: theme.primary }}>{Math.round(speed)} KT</b></div>
              <div style={{ color: "#94a3b8" }}>M: <b style={{ color: theme.primary }}>{mach}</b></div>
            </div>
          </div>

          {/* CENTER: Synthetic Vision / Attitude Indicator / HUD Pitch Ladder */}
          <div
            style={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Horizon Sky/Ground Background for Airbus mode */}
            {hudMode === "airbus" && (
              <div
                style={{
                  position: "absolute",
                  width: "200%",
                  height: "200%",
                  transform: `rotate(${-rollAngle}deg) translateY(${pitchDeg * 4}px)`,
                  transition: "transform 0.1s linear",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ flex: 1, background: theme.horizonSky }} />
                <div style={{ height: "2px", background: "#fff", boxShadow: "0 0 6px #fff" }} />
                <div style={{ flex: 1, background: theme.horizonGround }} />
              </div>
            )}

            {/* Heading Compass Tape (Top) */}
            <div
              style={{
                position: "absolute",
                top: "10px",
                width: "360px",
                height: "36px",
                border: `1px solid ${theme.primary}55`,
                background: "rgba(0,0,0,0.6)",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                zIndex: 15,
              }}
            >
              {/* Heading Center Lubber Line */}
              <div
                style={{
                  position: "absolute",
                  top: "0",
                  width: "2px",
                  height: "100%",
                  background: theme.primary,
                  boxShadow: theme.glow,
                  zIndex: 20,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "0",
                  fontSize: "12px",
                  fontWeight: 900,
                  background: "#000",
                  padding: "0 6px",
                  border: `1px solid ${theme.primary}`,
                  borderRadius: "2px",
                  zIndex: 25,
                }}
              >
                {Math.round(plane.track || 0).toString().padStart(3, "0")}°
              </div>

              {/* Heading Degree Hash Marks */}
              <div
                style={{
                  display: "flex",
                  gap: "28px",
                  transform: `translateX(${((plane.track % 10) / 10) * -28}px)`,
                }}
              >
                {[-30, -20, -10, 0, 10, 20, 30].map((d) => {
                  const deg = (Math.round((plane.track + d) / 10) * 10 + 360) % 360;
                  return (
                    <div key={d} style={{ textAlign: "center", minWidth: "24px" }}>
                      <span style={{ fontSize: "9px", opacity: 0.6 }}>{deg === 0 ? "N" : deg === 90 ? "E" : deg === 180 ? "S" : deg === 270 ? "W" : deg}</span>
                      <div style={{ width: "1px", height: "6px", background: theme.primary, margin: "2px auto 0" }} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pitch Ladder and Roll Gyro */}
            <div
              style={{
                position: "absolute",
                width: "320px",
                height: "320px",
                transform: `rotate(${-rollAngle}deg) translateY(${pitchDeg * 3.5}px)`,
                transition: "transform 0.08s ease-out",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 12,
                pointerEvents: "none",
              }}
            >
              {/* Pitch Ladder Rungs */}
              {[-20, -15, -10, -5, 5, 10, 15, 20].map((rung) => {
                const isDown = rung < 0;
                return (
                  <div
                    key={rung}
                    style={{
                      position: "absolute",
                      top: `${160 - rung * 6}px`,
                      width: "120px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      opacity: 0.7,
                    }}
                  >
                    <span style={{ fontSize: "10px" }}>{Math.abs(rung)}</span>
                    <div
                      style={{
                        flex: 1,
                        margin: "0 6px",
                        borderTop: isDown ? `1px dashed ${theme.primary}` : `2px solid ${theme.primary}`,
                        height: "0px",
                      }}
                    />
                    <span style={{ fontSize: "10px" }}>{Math.abs(rung)}</span>
                  </div>
                );
              })}

              {/* Artificial Horizon Center Bar */}
              <div
                style={{
                  position: "absolute",
                  width: "180px",
                  height: "2px",
                  background: theme.primary,
                  boxShadow: theme.glow,
                }}
              />
            </div>

            {/* Bore Sight / Flight Path Vector (Aircraft Reticle) - Fixed in Center */}
            <div
              style={{
                position: "relative",
                width: "60px",
                height: "60px",
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Flight Path Circle */}
              <div
                style={{
                  width: "18px",
                  height: "18px",
                  border: `2px solid ${theme.primary}`,
                  borderRadius: "50%",
                  boxShadow: theme.glow,
                }}
              />
              {/* Left Wing */}
              <div
                style={{
                  position: "absolute",
                  left: "-18px",
                  width: "18px",
                  height: "2px",
                  background: theme.primary,
                }}
              />
              {/* Right Wing */}
              <div
                style={{
                  position: "absolute",
                  right: "-18px",
                  width: "18px",
                  height: "2px",
                  background: theme.primary,
                }}
              />
              {/* Vertical Fin */}
              <div
                style={{
                  position: "absolute",
                  top: "-10px",
                  width: "2px",
                  height: "10px",
                  background: theme.primary,
                }}
              />
            </div>

            {/* ILS Localizer & Glideslope Guidance Needles */}
            <div
              style={{
                position: "absolute",
                width: "260px",
                height: "260px",
                zIndex: 18,
                pointerEvents: "none",
              }}
            >
              {/* Horizontal Glideslope Bar (moves up/down based on gsDots) */}
              <div
                style={{
                  position: "absolute",
                  top: `${130 + nearestRunway.gsDots * 35}px`,
                  left: "30px",
                  right: "30px",
                  height: "2px",
                  background: "#ff00ea",
                  boxShadow: "0 0 6px #ff00ea",
                  transition: "top 0.2s linear",
                }}
              />
              {/* Vertical Localizer Bar (moves left/right based on locDots) */}
              <div
                style={{
                  position: "absolute",
                  left: `${130 + nearestRunway.locDots * 35}px`,
                  top: "30px",
                  bottom: "30px",
                  width: "2px",
                  background: "#ff00ea",
                  boxShadow: "0 0 6px #ff00ea",
                  transition: "left 0.2s linear",
                }}
              />

              {/* ILS Diamond Indices */}
              <div
                style={{
                  position: "absolute",
                  right: "-20px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  color: "#ff00ea",
                  fontSize: "12px",
                }}
              >
                <span>●</span>
                <span>●</span>
                <span style={{ fontSize: "16px", fontWeight: 900 }}>◆</span>
                <span>●</span>
                <span>●</span>
              </div>
            </div>

            {/* Master Caution / Warning Annunciator Overlays */}
            {isTerrainWarning && (
              <div
                style={{
                  position: "absolute",
                  bottom: "40px",
                  background: "rgba(255, 0, 0, 0.85)",
                  color: "#fff",
                  padding: "6px 16px",
                  fontSize: "15px",
                  fontWeight: 900,
                  letterSpacing: "2px",
                  borderRadius: "4px",
                  border: "2px solid #fff",
                  boxShadow: "0 0 20px #ff0000",
                  animation: "blink 0.4s infinite alternate",
                  zIndex: 30,
                }}
              >
                ⚠ TERRAIN · PULL UP ⚠
              </div>
            )}
            {!isTerrainWarning && isSinkRate && (
              <div
                style={{
                  position: "absolute",
                  bottom: "40px",
                  background: "rgba(255, 165, 0, 0.85)",
                  color: "#000",
                  padding: "4px 14px",
                  fontSize: "13px",
                  fontWeight: 900,
                  borderRadius: "4px",
                  zIndex: 30,
                }}
              >
                SINK RATE ({vrate} FPM)
              </div>
            )}
          </div>

          {/* RIGHT TAPE: Altimeter & Vertical Speed (VSI) */}
          <div
            style={{
              width: "120px",
              borderLeft: `1px solid ${theme.primary}33`,
              background: "rgba(0, 0, 0, 0.4)",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
          >
            <div style={{ fontSize: "10px", letterSpacing: "1px", color: "#94a3b8", marginBottom: "8px" }}>
              ALTITUDE (FT)
            </div>

            {/* Altitude Ladder Ticks */}
            <div style={{ position: "relative", width: "100%", height: "280px", overflow: "hidden" }}>
              {[-600, -400, -200, 0, 200, 400, 600].map((delta) => {
                const altVal = Math.max(0, alt + delta);
                const yPos = 140 - (delta / 600) * 120;
                return (
                  <div
                    key={delta}
                    style={{
                      position: "absolute",
                      top: `${yPos}px`,
                      left: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      opacity: delta === 0 ? 1 : 0.6,
                    }}
                  >
                    <div
                      style={{
                        width: delta === 0 ? "14px" : "8px",
                        height: "2px",
                        background: theme.primary,
                      }}
                    />
                    <span style={{ fontSize: delta === 0 ? "13px" : "11px", fontWeight: delta === 0 ? 900 : 400 }}>
                      {Math.round(altVal)}
                    </span>
                  </div>
                );
              })}

              {/* Current Altitude Box */}
              <div
                style={{
                  position: "absolute",
                  top: "124px",
                  left: "6px",
                  right: "6px",
                  height: "32px",
                  border: `2px solid ${theme.primary}`,
                  background: "#000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  fontWeight: 900,
                  boxShadow: theme.glow,
                }}
              >
                {Math.round(alt)}
              </div>
            </div>

            {/* Baro QNH & VSI */}
            <div style={{ marginTop: "12px", textAlign: "center", fontSize: "11px" }}>
              <div style={{ color: "#94a3b8" }}>
                V/S:{" "}
                <b style={{ color: vrate > 0 ? theme.primary : vrate < 0 ? "#ff5555" : "#94a3b8" }}>
                  {vrate > 0 ? `+${vrate}` : vrate} FPM
                </b>
              </div>
              <div style={{ color: "#94a3b8" }}>QNH: <b style={{ color: theme.primary }}>1013.25 HPA</b></div>
            </div>
          </div>
        </div>

        {/* BOTTOM TELEMETRY TRAY: ILS Approach, Coordinates & Navigation Fix */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: `1px solid ${theme.primary}44`,
            background: "rgba(0, 0, 0, 0.6)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            fontSize: "11px",
          }}
        >
          <div>
            <span style={{ color: "#94a3b8", display: "block" }}>NEAREST APPROACH FIX</span>
            <b style={{ color: "#fff", fontSize: "13px" }}>{nearestRunway.name}</b>
            <span style={{ color: theme.accent, display: "block" }}>
              FREQ: {nearestRunway.ilsFreq} · BRG {nearestRunway.bearing.toFixed(0)}°
            </span>
          </div>

          <div>
            <span style={{ color: "#94a3b8", display: "block" }}>DISTANCE TO RUNWAY</span>
            <b style={{ color: theme.primary, fontSize: "13px" }}>
              {nearestRunway.distNm.toFixed(1)} NM ({nearestRunway.distKm.toFixed(1)} km)
            </b>
            <span style={{ color: "#cbd5e1", display: "block" }}>
              IDEAL GLIDESLOPE ALT: {Math.round(nearestRunway.idealAltFt)} FT
            </span>
          </div>

          <div>
            <span style={{ color: "#94a3b8", display: "block" }}>GLOBAL POSITION (WGS-84)</span>
            <span style={{ color: theme.primary }}>
              LAT {plane.lat.toFixed(4)}° / LON {plane.lon.toFixed(4)}°
            </span>
            <span style={{ color: "#94a3b8", display: "block" }}>
              TRACK: {Math.round(plane.track || 0)}° · AIRCRAFT: {plane.model || "GENERIC"}
            </span>
          </div>

          <div>
            <span style={{ color: "#94a3b8", display: "block" }}>ILS SYNTHETIC GUIDANCE</span>
            <span
              style={{
                color: Math.abs(nearestRunway.locDots) < 0.5 && Math.abs(nearestRunway.gsDots) < 0.5 ? "#00ff66" : "#ffb703",
                fontWeight: 700,
              }}
            >
              {Math.abs(nearestRunway.locDots) < 0.5 && Math.abs(nearestRunway.gsDots) < 0.5
                ? "ESTABLISHED ON GLIDESLOPE"
                : "INTERCEPTING LOCALIZER"}
            </span>
            <span style={{ color: "#94a3b8", display: "block" }}>
              LOC DEV: {nearestRunway.locDots > 0 ? "FLY LEFT" : "FLY RIGHT"} ({nearestRunway.locDots.toFixed(1)}●)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
