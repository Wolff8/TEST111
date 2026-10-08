import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SI_OUTLINE } from "../lib";

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

export const PCL_TRANSMITTERS = [
  { id: "trdinov-vrh", name: "RTV Trdinov Vrh (Gorjanci)", freq: "90.9 MHz FM", lat: 45.7836, lon: 15.3678 },
  { id: "kum", name: "RTV Kum (Zasavje)", freq: "91.1 MHz FM", lat: 46.1089, lon: 15.0747 },
  { id: "sljeme", name: "HRT Sljeme (Zagreb)", freq: "89.7 MHz FM", lat: 45.9000, lon: 15.9481 },
  { id: "krvavec", name: "RTV Krvavec (Gorenjska)", freq: "91.8 MHz FM", lat: 46.2975, lon: 14.5342 },
  { id: "maribor-pohorje", name: "RTV Pohorje (Štajerska)", freq: "88.5 MHz FM", lat: 46.5161, lon: 15.5878 },
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
  const [showPhosphorTrails, setShowPhosphorTrails] = useState<boolean>(true);
  const [mapMode, setMapMode] = useState<"dark" | "satellite" | "crt">("dark");
  const [scopeShape, setScopeShape] = useState<"circle" | "rect">("circle");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [trackSelected, setTrackSelected] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<"scope" | "target" | "aprs">("scope");

  const [selectedTarget, setSelectedTarget] = useState<any | null>(null);
  const [rawPackets, setRawPackets] = useState<any[]>([]);
  const [pclData, setPclData] = useState<any | null>(null);
  const [terminalFilter, setTerminalFilter] = useState<"all" | "ljms">("all");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const labelLayerRef = useRef<L.TileLayer | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const sweepAngleRef = useRef<number>(0);
  const targetHistoryRef = useRef<Map<string, { lat: number; lon: number; time: number }[]>>(new Map());

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
          fetch(`/api/ogn/raw?ljms=${terminalFilter === "ljms" ? "1" : "0"}`)
            .then((r) => r.json())
            .catch(() => ({ packets: [] })),
          fetch("/api/pcl/telemetry")
            .then((r) => r.json())
            .catch(() => null),
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

  // Map Range Scale to Leaflet Zoom Level
  const rangeToZoom = useCallback((nm: number) => {
    if (nm <= 15) return 11;
    if (nm <= 25) return 10;
    if (nm <= 40) return 9;
    if (nm <= 60) return 8;
    if (nm <= 100) return 7;
    return 6;
  }, []);

  // Initialize Real Leaflet Map Underlay
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [activeCenter.lat, activeCenter.lon],
      zoom: rangeToZoom(rangeNm),
      zoomControl: false,
      attributionControl: false,
      keyboard: false,
    });

    mapRef.current = map;

    // Handle map click to select closest target
    map.on("click", (e: L.LeafletMouseEvent) => {
      const clickPt = map.latLngToContainerPoint(e.latlng);
      let closest: any = null;
      let minDist = 32; // 32px tolerance for touch / click

      const allTargets = [
        ...(pclData?.targets || []),
        ...planes.filter((p) => !pclData?.targets?.some((t: any) => t.hex === (p.icao || p.id || p.hex))),
      ];

      for (const t of allTargets) {
        if (!t.lat || !t.lon) continue;
        const pt = map.latLngToContainerPoint([t.lat, t.lon]);
        const dist = Math.sqrt((pt.x - clickPt.x) ** 2 + (pt.y - clickPt.y) ** 2);
        if (dist < minDist) {
          minDist = dist;
          closest = t;
        }
      }

      if (closest) {
        setSelectedTarget(closest);
        if (onPinpointPlane) onPinpointPlane(closest.hex || closest.id);
      } else {
        setSelectedTarget(null);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Map Tiles when mapMode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    tileLayerRef.current?.remove();
    labelLayerRef.current?.remove();
    tileLayerRef.current = null;
    labelLayerRef.current = null;

    if (mapMode === "dark") {
      tileLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16 }
      ).addTo(map);

      labelLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, opacity: 0.65 }
      ).addTo(map);
    } else if (mapMode === "satellite") {
      tileLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 18 }
      ).addTo(map);

      labelLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 18, opacity: 0.75 }
      ).addTo(map);
    }
    // "crt" mode leaves map without raster tiles, rendering pure dark matrix
  }, [mapMode]);

  // Center & Zoom Updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([activeCenter.lat, activeCenter.lon], rangeToZoom(rangeNm), { animate: true });
  }, [activeCenter, rangeNm, rangeToZoom]);

  // Target Following
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trackSelected || !selectedTarget?.lat || !selectedTarget?.lon) return;
    map.panTo([selectedTarget.lat, selectedTarget.lon], { animate: true });
  }, [trackSelected, selectedTarget?.lat, selectedTarget?.lon]);

  // Fullscreen Handler
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else if ((containerRef.current as any).webkitRequestFullscreen) {
        (containerRef.current as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setTimeout(() => mapRef.current?.invalidateSize(), 150);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  // Update Canvas Size to Match Viewport Frame
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map) return;
    const rect = map.getContainer().getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  }, []);

  // Main Radar Canvas Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;

      resizeCanvas();
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const centerPt = map.latLngToContainerPoint([activeCenter.lat, activeCenter.lon]);
      const northPt = map.latLngToContainerPoint([activeCenter.lat + rangeNm / 60, activeCenter.lon]);
      const maxRadiusPx = Math.abs(centerPt.y - northPt.y);

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      // 1. Classic Circular Scope Bezel Mask
      if (scopeShape === "circle") {
        ctx.save();
        ctx.fillStyle = "rgba(2, 8, 6, 0.94)";
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.arc(centerPt.x, centerPt.y, maxRadiusPx, 0, Math.PI * 2, true);
        ctx.fill();

        // Glowing scope perimeter ring
        ctx.strokeStyle = "#00ff66";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#00ff66";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(centerPt.x, centerPt.y, maxRadiusPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 2. Phosphor Grid Range Rings
      ctx.save();
      ctx.strokeStyle = "rgba(0, 255, 102, 0.28)";
      ctx.lineWidth = 1;

      const ringIntervals = rangeNm <= 15 ? [3, 6, 9, 12, 15] : rangeNm <= 30 ? [5, 10, 15, 20, 25, 30] : rangeNm <= 60 ? [10, 20, 30, 40, 50, 60] : [20, 40, 60, 80, 100];
      for (const r of ringIntervals) {
        if (r > rangeNm) continue;
        const pt = map.latLngToContainerPoint([activeCenter.lat + r / 60, activeCenter.lon]);
        const rPx = Math.abs(centerPt.y - pt.y);

        ctx.beginPath();
        ctx.arc(centerPt.x, centerPt.y, rPx, 0, Math.PI * 2);
        ctx.stroke();

        // Range Label
        ctx.fillStyle = "rgba(0, 255, 102, 0.75)";
        ctx.font = "bold 10px 'Share Tech Mono', monospace";
        ctx.fillText(`${r} NM`, centerPt.x + 6, centerPt.y - rPx + 12);
      }

      // 3. Azimuth Radials (every 30 degrees)
      for (let deg = 0; deg < 360; deg += 30) {
        const rad = ((deg - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(centerPt.x, centerPt.y);
        ctx.lineTo(centerPt.x + Math.cos(rad) * maxRadiusPx, centerPt.y + Math.sin(rad) * maxRadiusPx);
        ctx.stroke();

        // Heading Label
        const lx = centerPt.x + Math.cos(rad) * (maxRadiusPx - 16);
        const ly = centerPt.y + Math.sin(rad) * (maxRadiusPx - 16);
        ctx.fillStyle = "rgba(0, 255, 102, 0.85)";
        ctx.font = "bold 10px 'Share Tech Mono', monospace";
        ctx.fillText(`${deg.toString().padStart(3, "0")}°`, lx - 10, ly + 4);
      }
      ctx.restore();

      // 4. CRT Mode Slovenia Border Vector (only in CRT mode)
      if (mapMode === "crt") {
        ctx.save();
        ctx.strokeStyle = "rgba(62, 224, 194, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let first = true;
        for (const [lat, lon] of SI_OUTLINE) {
          const pt = map.latLngToContainerPoint([lat, lon]);
          if (first) {
            ctx.moveTo(pt.x, pt.y);
            first = false;
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      // 5. Airfield Runway Vectors (LJMS, LJMB, LJCE, LJLJ)
      if (pclData?.aerodromes) {
        for (const apt of pclData.aerodromes) {
          const aptPt = map.latLngToContainerPoint([apt.arpLat, apt.arpLon]);
          ctx.save();
          ctx.strokeStyle = "#3ee0c2";
          ctx.fillStyle = "#3ee0c2";
          ctx.lineWidth = 1.8;

          ctx.strokeRect(aptPt.x - 4, aptPt.y - 4, 8, 8);
          ctx.font = "bold 11px 'Share Tech Mono', monospace";
          ctx.fillText(`✈ ${apt.icao} · ${apt.name.split(" ")[0]}`, aptPt.x + 8, aptPt.y - 5);

          // Detailed Runway
          if (apt.runway10_28) {
            const r1 = map.latLngToContainerPoint([apt.runway10_28.rwy10[0], apt.runway10_28.rwy10[1]]);
            const r2 = map.latLngToContainerPoint([apt.runway10_28.rwy28[0], apt.runway10_28.rwy28[1]]);
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = "#00ff66";
            ctx.beginPath();
            ctx.moveTo(r1.x, r1.y);
            ctx.lineTo(r2.x, r2.y);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // 6. PCL Illuminators of Opportunity
      for (const tx of PCL_TRANSMITTERS) {
        const txPt = map.latLngToContainerPoint([tx.lat, tx.lon]);
        ctx.save();
        ctx.fillStyle = "#38bdf8";
        ctx.strokeStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(txPt.x, txPt.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "9px 'Share Tech Mono', monospace";
        ctx.fillText(`📻 ${tx.name} (${tx.freq})`, txPt.x + 8, txPt.y + 3);
        ctx.restore();
      }

      // 7. PCL Bistatic Reflection Ellipses
      if (showPclBistatic && pclData?.targets) {
        ctx.save();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);

        for (const t of pclData.targets.slice(0, 10)) {
          for (const pcl of t.pclReflections || []) {
            if (pcl.ellipsePoints && pcl.ellipsePoints.length) {
              ctx.beginPath();
              let first = true;
              for (const pt of pcl.ellipsePoints) {
                const s = map.latLngToContainerPoint([pt[0], pt[1]]);
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

      // 8. Rotating Radar Sweep Beam
      sweepAngleRef.current = (sweepAngleRef.current + 1.2) % 360;
      const sweepRad = ((sweepAngleRef.current - 90) * Math.PI) / 180;

      ctx.save();
      const sweepGrad = ctx.createRadialGradient(centerPt.x, centerPt.y, 0, centerPt.x, centerPt.y, maxRadiusPx);
      sweepGrad.addColorStop(0, "rgba(0, 255, 102, 0.35)");
      sweepGrad.addColorStop(1, "rgba(0, 255, 102, 0.0)");

      ctx.beginPath();
      ctx.moveTo(centerPt.x, centerPt.y);
      ctx.arc(centerPt.x, centerPt.y, maxRadiusPx, sweepRad - 0.28, sweepRad);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // Sharp Beam Line
      ctx.strokeStyle = "#00ff66";
      ctx.lineWidth = 2.0;
      ctx.shadowColor = "#00ff66";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(centerPt.x, centerPt.y);
      ctx.lineTo(centerPt.x + Math.cos(sweepRad) * maxRadiusPx, centerPt.y + Math.sin(sweepRad) * maxRadiusPx);
      ctx.stroke();
      ctx.restore();

      // 9. All Live Moving Detected Targets
      const allTargets = [
        ...(pclData?.targets || []),
        ...planes.filter((p) => !pclData?.targets?.some((t: any) => t.hex === (p.icao || p.id || p.hex))),
      ];

      for (const t of allTargets) {
        if (!t.lat || !t.lon) continue;
        const pt = map.latLngToContainerPoint([t.lat, t.lon]);

        // Visibility check
        const distFromCenter = Math.sqrt((pt.x - centerPt.x) ** 2 + (pt.y - centerPt.y) ** 2);
        if (scopeShape === "circle" && distFromCenter > maxRadiusPx) continue;
        if (pt.x < -100 || pt.x > width + 100 || pt.y < -100 || pt.y > height + 100) continue;

        const isFlarmGlider = t.isGlider || t.category === "GLIDER" || t.isFlarm;
        const isDrone = t.isDrone || t.category === "DRONE_UAV";
        const isSurface = t.isSurfaceMovement || (t.altFt <= 300 && (t.speedKnots || t.speed || 0) < 50);

        if (onlyLjmsGateway && !t.isLjmsGateway) continue;
        if (!showFlarm && isFlarmGlider) continue;
        if (!showSurfaceMlat && isSurface) continue;

        const isMilHeli = Boolean(
          t.isMil ||
          t.role === "heli" ||
          /RANGR|LSV|SVN|506e6/i.test(`${t.callsign || t.flight || ""} ${t.hex || ""}`) ||
          /S5-H/i.test(t.reg || "")
        );

        // Color and Symbol
        let color = "#00ff66"; // Standard ASTERIX Mode S
        let symbol = "◇";

        if (isMilHeli) {
          color = "#f43f5e"; // Tactical Rose / Crimson
          symbol = "🚁";
        } else if (isFlarmGlider) {
          color = "#ffdd00"; // FLARM Amber
          symbol = "▲";
        } else if (isDrone) {
          color = "#ff3366"; // Drone Red/Magenta
          symbol = "⬢";
        } else if (isSurface) {
          color = "#c084fc"; // Surface Movement Purple
          symbol = "●";
        } else if (t.isMil || t.mil) {
          color = "#ff3333";
          symbol = "◆";
        }

        // Phosphor Flash when sweep passes target
        const targetAngleDeg = ((Math.atan2(pt.y - centerPt.y, pt.x - centerPt.x) * 180) / Math.PI + 450) % 360;
        const angleDiff = Math.abs(sweepAngleRef.current - targetAngleDeg);
        const isIlluminated = angleDiff < 12 || angleDiff > 348;

        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = isIlluminated ? 16 : isMilHeli ? 10 : 4;

        // Draw Icon / Glyph
        ctx.font = isMilHeli ? "16px sans-serif" : "bold 13px monospace";
        ctx.fillText(symbol, pt.x - (isMilHeli ? 8 : 5), pt.y + 5);

        // Pulsing Tactical Lock Ring for military helicopter
        if (isMilHeli) {
          ctx.strokeStyle = "#f43f5e";
          ctx.lineWidth = 1.4;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 16, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Velocity Vector Line
        const trk = t.track || 0;
        const gs = t.speedKnots || t.speed || t.gs || 0;
        if (gs > 8) {
          const vLen = Math.min(50, (gs / 10) * 1.6);
          const vRad = ((trk - 90) * Math.PI) / 180;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt.x + Math.cos(vRad) * vLen, pt.y + Math.sin(vRad) * vLen);
          ctx.stroke();
        }

        // ASTERIX CAT Data Block Tag
        ctx.shadowBlur = 0;
        ctx.font = "10px 'Share Tech Mono', monospace";
        const callsign = t.callsign || t.flight || t.hex?.toUpperCase() || "AC";
        const fl = t.altFt ? `FL${Math.round(t.altFt / 100).toString().padStart(3, "0")}` : isMilHeli ? "1250FT" : "GND";
        const spd = Math.round(gs);

        // Data Box
        const isSelected = selectedTarget?.hex === t.hex || selectedTarget?.id === t.id;
        ctx.fillStyle = isSelected ? "rgba(10, 26, 20, 0.95)" : "rgba(4, 12, 10, 0.78)";
        ctx.fillRect(pt.x + 10, pt.y - 18, 92, 34);
        ctx.strokeStyle = isSelected ? "#00ff66" : `${color}55`;
        ctx.lineWidth = isSelected ? 1.5 : 0.8;
        ctx.strokeRect(pt.x + 10, pt.y - 18, 92, 34);

        ctx.fillStyle = color;
        ctx.fillText(callsign, pt.x + 14, pt.y - 6);
        ctx.fillStyle = isMilHeli ? "#fca5a5" : "#cbd5e1";
        ctx.fillText(`${fl}  ${spd}KT`, pt.x + 14, pt.y + 8);

        if (isMilHeli) {
          ctx.fillStyle = "#f43f5e";
          ctx.font = "bold 8px monospace";
          ctx.fillText("🎖️ MIL", pt.x + 64, pt.y - 6);
        }

        // If Target is Selected: Draw Polar Slant Ray from Radar Origin
        if (isSelected) {
          ctx.strokeStyle = isMilHeli ? "#f43f5e" : "#00ff66";
          ctx.lineWidth = 1.8;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(centerPt.x, centerPt.y);
          ctx.lineTo(pt.x, pt.y);
          ctx.stroke();

          // If military helicopter with PCL, draw ray from Trdinov Vrh
          const txPt = map.latLngToContainerPoint([45.7836, 15.3678]);
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(txPt.x, txPt.y);
          ctx.lineTo(pt.x, pt.y);
          ctx.stroke();
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
  }, [activeCenter, rangeNm, showFlarm, onlyLjmsGateway, showSurfaceMlat, showPclBistatic, scopeShape, mapMode, pclData, planes, selectedTarget]);

  return (
    <div
      ref={containerRef}
      className={`cad-scope-container ${isFullscreen ? "cad-scope-fullscreen" : ""}`}
    >
      {/* Top Tactical Command Header */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(4, 18, 14, 0.95), rgba(8, 28, 22, 0.95))",
          border: "1px solid rgba(0, 255, 102, 0.4)",
          borderRadius: "8px",
          padding: "10px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          boxShadow: "0 0 20px rgba(0, 255, 102, 0.15)",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 900,
              color: "#00ff66",
              letterSpacing: "1px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            📐 ASTERIX CAD RADAR SCOPE
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#94a3b8" }}>
            Real-World GIS Map Underlay · Multi-Sensor ADS-B / Mode S · LJMS 868 MHz APRS Gateway · PCL Bistatic Passive Radar
          </p>
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "4px 8px",
              borderRadius: "4px",
              background: "rgba(0, 255, 102, 0.15)",
              color: "#00ff66",
              border: "1px solid #00ff66",
            }}
          >
            ● LIVE TARGETS: {planes.length}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            style={{
              background: isFullscreen ? "rgba(255, 221, 0, 0.25)" : "rgba(0, 255, 102, 0.2)",
              color: isFullscreen ? "#ffdd00" : "#00ff66",
              border: `1px solid ${isFullscreen ? "#ffdd00" : "#00ff66"}`,
              borderRadius: "4px",
              padding: "6px 12px",
              fontWeight: 800,
              fontSize: "11px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isFullscreen ? "✕ EXIT FULLSCREEN" : "📱 IPHONE FULLSCREEN"}
          </button>
        </div>
      </div>

      {/* Interactive Controls & Filters Bar */}
      <div
        style={{
          background: "rgba(10, 20, 16, 0.85)",
          border: "1px solid rgba(0, 255, 102, 0.25)",
          borderRadius: "6px",
          padding: "8px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          fontSize: "11px",
        }}
      >
        {/* Radar Origin Center */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", overflowX: "auto", maxWidth: "100%" }}>
          <span style={{ color: "#94a3b8", fontWeight: 700 }}>ORIGIN:</span>
          {RADAR_CENTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCenterId(c.id);
                setTrackSelected(false);
              }}
              style={{
                background: centerId === c.id ? "#00ff66" : "rgba(255,255,255,0.05)",
                color: centerId === c.id ? "#000" : "#cbd5e1",
                border: `1px solid ${centerId === c.id ? "#00ff66" : "rgba(255,255,255,0.1)"}`,
                padding: "4px 8px",
                borderRadius: "4px",
                fontWeight: 700,
                fontSize: "10px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {c.name.split(" ")[0]}
            </button>
          ))}
        </div>

        {/* Range Scale */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ color: "#94a3b8", fontWeight: 700 }}>SCALE:</span>
          {[15, 25, 40, 60, 100].map((rng) => (
            <button
              key={rng}
              type="button"
              onClick={() => setRangeNm(rng)}
              style={{
                background: rangeNm === rng ? "#38bdf8" : "rgba(255,255,255,0.05)",
                color: rangeNm === rng ? "#000" : "#cbd5e1",
                border: `1px solid ${rangeNm === rng ? "#38bdf8" : "rgba(255,255,255,0.1)"}`,
                padding: "4px 6px",
                borderRadius: "4px",
                fontWeight: 700,
                fontSize: "10px",
                cursor: "pointer",
              }}
            >
              {rng}NM
            </button>
          ))}
        </div>

        {/* Map Underlay & Scope Shape Modes */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setMapMode(mapMode === "dark" ? "satellite" : mapMode === "satellite" ? "crt" : "dark")}
            style={{
              background: "rgba(56, 189, 248, 0.15)",
              color: "#38bdf8",
              border: "1px solid #38bdf8",
              padding: "4px 8px",
              borderRadius: "4px",
              fontWeight: 700,
              fontSize: "10px",
              cursor: "pointer",
            }}
          >
            🗺️ {mapMode.toUpperCase()} MAP
          </button>

          <button
            type="button"
            onClick={() => setScopeShape(scopeShape === "circle" ? "rect" : "circle")}
            style={{
              background: scopeShape === "circle" ? "rgba(0, 255, 102, 0.15)" : "transparent",
              color: scopeShape === "circle" ? "#00ff66" : "#cbd5e1",
              border: `1px solid ${scopeShape === "circle" ? "#00ff66" : "rgba(255,255,255,0.1)"}`,
              padding: "4px 8px",
              borderRadius: "4px",
              fontWeight: 700,
              fontSize: "10px",
              cursor: "pointer",
            }}
          >
            {scopeShape === "circle" ? "⭕ CRT VIGNETTE" : "⬛ FULL BLEED"}
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
              fontSize: "10px",
              cursor: "pointer",
            }}
          >
            🔵 PCL BISTATIC
          </button>
        </div>
      </div>

      {/* Main Radar Layout: Scope (Left) + ASTERIX / APRS Inspector (Right) */}
      <div className="cad-main-layout">
        {/* Real Map Underlay & CAD Canvas Frame */}
        <div className="cad-viewport-frame" style={{ display: mobileTab !== "scope" && !isFullscreen && window.innerWidth <= 1024 ? "none" : "block" }}>
          {/* Leaflet Map Underlay */}
          <div ref={mapContainerRef} className="cad-leaflet-map" />

          {/* ASTERIX Phosphor CRT Overlay Canvas */}
          <canvas ref={canvasRef} className="cad-radar-overlay-canvas" />

          {/* Floating HUD: Top Left Origin Stats */}
          <div className="cad-floating-bar cad-hud-top-left">
            <div>
              <div style={{ color: "#00ff66", fontWeight: 700 }}>
                ● {activeCenter.name} ({activeCenter.icao || "RADAR"})
              </div>
              <div style={{ color: "#94a3b8", fontSize: "10px" }}>
                LAT {activeCenter.lat.toFixed(4)}° / LON {activeCenter.lon.toFixed(4)}° · SCALE {rangeNm} NM
              </div>
            </div>
          </div>

          {/* Floating HUD: Top Right Actions */}
          <div className="cad-floating-bar cad-hud-top-right">
            <button
              type="button"
              onClick={() => {
                mapRef.current?.setView([activeCenter.lat, activeCenter.lon], rangeToZoom(rangeNm), { animate: true });
                setTrackSelected(false);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#00ff66",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "10px",
              }}
            >
              🎯 RECENTER
            </button>
            {selectedTarget && (
              <button
                type="button"
                onClick={() => setTrackSelected(!trackSelected)}
                style={{
                  background: trackSelected ? "rgba(0, 255, 102, 0.3)" : "transparent",
                  border: `1px solid ${trackSelected ? "#00ff66" : "rgba(255,255,255,0.2)"}`,
                  color: trackSelected ? "#00ff66" : "#cbd5e1",
                  borderRadius: "3px",
                  padding: "2px 6px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "10px",
                }}
              >
                {trackSelected ? "LOCKED" : "TRACK"}
              </button>
            )}
          </div>

          {/* Mobile Floating Quick Target Sheet */}
          {selectedTarget && (
            <div className="cad-target-sheet">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 900, color: selectedTarget.isMil ? "#f43f5e" : "#00ff66" }}>
                    {selectedTarget.callsign || selectedTarget.flight || selectedTarget.id}
                  </span>
                  <span style={{ color: "#38bdf8", fontSize: "11px" }}>
                    {selectedTarget.hex?.toUpperCase()}
                  </span>
                  {selectedTarget.isMil && (
                    <span style={{ background: "#f43f5e", color: "#fff", fontSize: "9px", padding: "1px 5px", borderRadius: "3px", fontWeight: 700 }}>
                      🎖️ MILITARY
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTarget(null)}
                  style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "14px" }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "6px", fontSize: "11px", color: "#cbd5e1" }}>
                <span>ALT: <b>{selectedTarget.altFt ? `${selectedTarget.altFt} ft` : "GND"}</b></span>
                <span>GS: <b>{Math.round(selectedTarget.speedKnots || selectedTarget.speed || selectedTarget.gs || 0)} KT</b></span>
                <span>TRK: <b>{Math.round(selectedTarget.track || 0)}°</b></span>
                <span>SQK: <b>{selectedTarget.squawk || "7000"}</b></span>
              </div>

              {selectedTarget.ownOp && (
                <div style={{ fontSize: "10px", color: "#fca5a5", marginTop: "4px" }}>
                  UNIT: <b>{selectedTarget.ownOp}</b> ({selectedTarget.model || "Airframe"})
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Inspector Panel (Desktop) or Tab Content (Mobile) */}
        <div
          style={{
            display: mobileTab === "scope" && !isFullscreen && window.innerWidth <= 1024 ? "none" : "flex",
            flexDirection: "column",
            gap: "12px",
            minHeight: "480px",
          }}
        >
          {/* Target Data Block */}
          {(mobileTab === "target" || window.innerWidth > 1024) && (
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
                    <span style={{ color: "#94a3b8" }}>TRANSPONDER / ICAO:</span>
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
                    <b>{Math.round(selectedTarget.speedKnots || selectedTarget.speed || selectedTarget.gs || 0)} KT @ {Math.round(selectedTarget.track || 0)}°</b>
                  </div>

                  {/* Tactical Military Helicopter Card */}
                  {(selectedTarget.isMil || /RANGR|LSV|SVN|506e6/i.test(`${selectedTarget.callsign || selectedTarget.flight || ""} ${selectedTarget.hex || ""}`) || /S5-H/i.test(selectedTarget.reg || "")) && (
                    <div style={{ background: "rgba(244, 63, 94, 0.12)", border: "1px solid #f43f5e", padding: "8px 10px", borderRadius: "4px", marginTop: "4px" }}>
                      <div style={{ color: "#f43f5e", fontWeight: 800, fontSize: "11px", marginBottom: "4px" }}>
                        🎖️ MILITARY / POLICE TACTICAL ASSET
                      </div>
                      <div style={{ color: "#fecdd3", fontSize: "11px" }}>
                        UNIT: <b>{selectedTarget.ownOp || "Slovenska vojska / Policija"}</b>
                      </div>
                      <div style={{ color: "#fecdd3", fontSize: "11px" }}>
                        AIRFRAME: <b>{selectedTarget.model || "Bell 206 JetRanger"}</b> · REG: <b>{selectedTarget.reg || "S5-HZJ"}</b>
                      </div>
                      <div style={{ color: "#38bdf8", fontSize: "11px", marginTop: "4px" }}>
                        PCL ROTOR CHOP: <b>13.1 Hz</b> (2-blade @ 394 RPM) · Doppler ±140 Hz
                      </div>
                      <div style={{ color: "#38bdf8", fontSize: "11px" }}>
                        ILLUMINATOR: <b>RTV Trdinov Vrh (90.9 MHz, 100 kW ERP)</b>
                      </div>
                    </div>
                  )}

                  {selectedTarget.receiverStation && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#94a3b8" }}>RECEIVER GATEWAY:</span>
                      <b style={{ color: selectedTarget.isLjmsGateway ? "#00ff66" : "#cbd5e1" }}>
                        {selectedTarget.receiverStation} {selectedTarget.isLjmsGateway ? "⚡ (LJMS)" : ""}
                      </b>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: "12px", color: "#64748b", margin: "14px 0" }}>
                  Tap any live aircraft, military helicopter, or glider on the map to inspect real-time ASTERIX CAT 048 data blocks.
                </p>
              )}
            </div>
          )}

          {/* Live APRS Packet Stream */}
          {(mobileTab === "aprs" || window.innerWidth > 1024) && (
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
                minHeight: "280px",
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
                    LJMS ONLY
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
                  maxHeight: "340px",
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Segmented Tab Switcher (iPhone 17 Pro Max) */}
      <div className="cad-mobile-tabs">
        <button
          type="button"
          className={`cad-mobile-tab-btn ${mobileTab === "scope" ? "active" : ""}`}
          onClick={() => setMobileTab("scope")}
        >
          🗺️ RADAR SCOPE
        </button>
        <button
          type="button"
          className={`cad-mobile-tab-btn ${mobileTab === "target" ? "active" : ""}`}
          onClick={() => setMobileTab("target")}
        >
          🎯 TARGET DATA {selectedTarget ? "(1)" : ""}
        </button>
        <button
          type="button"
          className={`cad-mobile-tab-btn ${mobileTab === "aprs" ? "active" : ""}`}
          onClick={() => setMobileTab("aprs")}
        >
          📡 APRS STREAM ({rawPackets.length})
        </button>
      </div>
    </div>
  );
};
