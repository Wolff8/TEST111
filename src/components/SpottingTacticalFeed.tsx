import { useEffect, useMemo, useRef, useState } from "react";
import type { Plane } from "../lib";

export interface SpottingTacticalFeedProps {
  planes?: Plane[];
  onPinpointPlane?: (planeId: string) => void;
  publicUrl?: string;
}

interface AirportInfo {
  icao: string;
  iata: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  elevFt: number;
  runways: Array<{ id: string; headingDeg: number; lengthM: number; threshold: { lat: number; lon: number } }>;
  spottingLocations: Array<{ id: string; name: string; lat: number; lon: number; bestFor: string }>;
  atc: { tower?: string; approach?: string; atis?: string; radar?: string; info?: string };
  notes: string;
}

interface SpottingTarget {
  hex: string;
  flight: string;
  registration: string | null;
  type: string | null;
  model: string | null;
  category: string;
  isUnexpected: boolean;
  classificationReason: string;
  military: { isMilitary: boolean; asset: any; matchReason?: string };
  lat: number;
  lon: number;
  altFt: number;
  aglFt: number;
  gsKt: number;
  trackDeg: number;
  vsFpm: number;
  distNm: number;
  distKm: number;
  brgToApt: number;
  brgFromApt: number;
  closestRunway: { id: string; headingDeg: number; lengthM: number; deltaDeg: number } | null;
  glideslopeStatus: string;
  idealGlideslopeAltFt: number;
  glideslopeDevFt: number;
  spotterOptics: {
    spotterAzimuthDeg: number;
    spotterElevAngleDeg: number;
    etaString: string;
    etaSeconds: number | null;
    bestVantagePoint: string;
  };
  links: {
    planespotters: string | null;
    flightradar24: string;
  };
}

interface ExtranetSpec {
  airport: string;
  portalUrl: string;
  extranetSections: Array<{
    id: string;
    name: string;
    description: string;
    milestones?: Array<{ code: string; label: string; description: string }>;
    areas?: Array<{ name: string; gates: string[]; stands: string[]; features: string }>;
    telegrams?: Array<{ type: string; example: string; purpose: string }>;
    telexAddresses?: Record<string, string>;
  }>;
}

interface AudioStream {
  id: string;
  title: string;
  icao: string;
  facility: string;
  freqMhz: string;
  country: string;
  streamUrl: string;
  altStreamUrl: string;
  quality: string;
  coverage: string;
}

export function SpottingTacticalFeed({ planes = [], onPinpointPlane }: SpottingTacticalFeedProps) {
  const [selectedIcao, setSelectedIcao] = useState<string>("LJMB");
  const [airports, setAirports] = useState<Record<string, AirportInfo>>({});
  const [spottingData, setSpottingData] = useState<{
    airport?: AirportInfo;
    stats?: { totalInTerminal: number; unexpectedCount: number; militaryCount: number; circuitsCount: number };
    arrivals?: SpottingTarget[];
    circuits?: SpottingTarget[];
    overhead?: SpottingTarget[];
  }>({});
  const [militaryFleet, setMilitaryFleet] = useState<any[]>([]);
  const [extranetSpec, setExtranetSpec] = useState<ExtranetSpec | null>(null);
  const [audioStreams, setAudioStreams] = useState<AudioStream[]>([]);
  const [activeTab, setActiveTab] = useState<"spotting" | "pilatus" | "extranet" | "audio">("spotting");
  const [spottingFilter, setSpottingFilter] = useState<"ALL" | "UNEXPECTED" | "MILITARY" | "CIRCUITS">("ALL");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Audio Player State
  const [selectedStreamId, setSelectedStreamId] = useState<string>("ljmb-twr");
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [audioVolume, setAudioVolume] = useState<number>(0.8);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load Initial Reference Data
  useEffect(() => {
    Promise.all([
      fetch("/api/spotting/airports").then((r) => r.json()).catch(() => null),
      fetch("/api/spotting/fleet").then((r) => r.json()).catch(() => null),
      fetch("/api/spotting/extranet").then((r) => r.json()).catch(() => null),
      fetch("/api/spotting/audio").then((r) => r.json()).catch(() => null),
    ]).then(([aptRes, fleetRes, extRes, audRes]) => {
      if (aptRes?.airports) setAirports(aptRes.airports);
      if (fleetRes?.fleet) setMilitaryFleet(fleetRes.fleet);
      if (extRes?.airport) setExtranetSpec(extRes);
      if (audRes?.streams) setAudioStreams(audRes.streams);
    });
  }, []);

  // Poll Spotting Data for Selected Airport
  const fetchSpottingData = async (icao: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/spotting/arrivals?icao=${encodeURIComponent(icao)}`);
      const data = await res.json();
      if (data.ok) {
        setSpottingData(data);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch {
      // ignore network err
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpottingData(selectedIcao);
    const interval = window.setInterval(() => fetchSpottingData(selectedIcao), 8_000);
    return () => window.clearInterval(interval);
  }, [selectedIcao]);

  // Audio Player Controller
  const activeStream = useMemo(() => {
    return audioStreams.find((s) => s.id === selectedStreamId) || audioStreams[0];
  }, [audioStreams, selectedStreamId]);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      setAudioError(null);
      audioRef.current.volume = audioVolume;
      audioRef.current
        .play()
        .then(() => setIsPlayingAudio(true))
        .catch((e) => {
          setIsPlayingAudio(false);
          setAudioError("Stream connecting or pending live carrier signal. Click direct relay link below to open.");
        });
    }
  };

  const handleStreamChange = (id: string) => {
    setSelectedStreamId(id);
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
      setAudioError(null);
    }
  };

  // Filtered Spotting Items
  const allSpottingTargets = useMemo(() => {
    const arr = spottingData.arrivals || [];
    const circ = spottingData.circuits || [];
    const combined = [...arr, ...circ];

    if (spottingFilter === "UNEXPECTED") {
      return combined.filter((x) => x.isUnexpected);
    }
    if (spottingFilter === "MILITARY") {
      return combined.filter((x) => x.military?.isMilitary);
    }
    if (spottingFilter === "CIRCUITS") {
      return combined.filter((x) => x.category === "CIRCUIT_TRAINING");
    }
    return combined;
  }, [spottingData, spottingFilter]);

  const currentApt = airports[selectedIcao] || spottingData.airport;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
        background: "#071018",
        color: "#eaf1f8",
        fontFamily: "monospace, system-ui, sans-serif",
      }}
    >
      {/* Hidden Audio Element */}
      {activeStream && (
        <audio
          ref={audioRef}
          src={activeStream.streamUrl}
          preload="none"
          onEnded={() => setIsPlayingAudio(false)}
          onError={() => {
            setIsPlayingAudio(false);
            setAudioError("Direct relay connection standby. Open direct airband relay below.");
          }}
        />
      )}

      {/* Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(16,28,42,0.95), rgba(7,16,24,0.95))",
          border: "1px solid rgba(62,224,194,0.3)",
          borderRadius: "8px",
          padding: "16px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "24px" }}>🔭</span>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700", letterSpacing: "1px", color: "#3ee0c2" }}>
                TACTICAL PLANESPOTTING & UNEXPECTED ARRIVALS
              </h2>
              <span
                style={{
                  background: "rgba(239,68,68,0.15)",
                  color: "#ef4444",
                  border: "1px solid #ef4444",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "700",
                }}
              >
                ● UNFILTERED LIVE TACTICAL
              </span>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8ca0b3" }}>
              Specialized spotting feeds for Maribor (LJMB), Cerklje (LJCE), Brnik (LJLJ) · Pilatus PC-9M Hudournik Tactical Roster · Fraport Extranet B2B · European Airband ATC Stream
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "11px", color: "#8ca0b3" }}>Updated: {lastUpdated || "live"}</span>
            <button
              type="button"
              onClick={() => fetchSpottingData(selectedIcao)}
              disabled={loading}
              style={{
                background: "rgba(62,224,194,0.15)",
                color: "#3ee0c2",
                border: "1px solid #3ee0c2",
                borderRadius: "4px",
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              {loading ? "Scanning…" : "↻ Refresh Radar"}
            </button>
          </div>
        </div>

        {/* Airport Selection Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "14px",
            paddingTop: "14px",
            borderTop: "1px solid rgba(62,224,194,0.15)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "12px", color: "#8ca0b3", fontWeight: "700" }}>SELECT AIRPORT:</span>
          {[
            { icao: "LJMB", name: "Maribor (Edvard Rusjan)", tag: "GA & Touch-and-Go" },
            { icao: "LJCE", name: "Cerklje ob Krki (SAF Airbase)", tag: "PC-9M / Military" },
            { icao: "LJLJ", name: "Ljubljana (Brnik)", tag: "Fraport Extranet / Police" },
            { icao: "LJPZ", name: "Portorož (Coastal)", tag: "Coastal General Aviation" },
            { icao: "LOWG", name: "Graz (Thalerhof)", tag: "Styria / Austrian AF" },
          ].map((apt) => {
            const isSel = selectedIcao === apt.icao;
            return (
              <button
                key={apt.icao}
                type="button"
                onClick={() => setSelectedIcao(apt.icao)}
                style={{
                  background: isSel ? "#3ee0c2" : "rgba(20,35,50,0.6)",
                  color: isSel ? "#071018" : "#eaf1f8",
                  border: isSel ? "1px solid #3ee0c2" : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                🛬 {apt.name} <small style={{ opacity: 0.8 }}>({apt.tag})</small>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid rgba(62,224,194,0.2)", paddingBottom: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setActiveTab("spotting")}
          style={{
            background: activeTab === "spotting" ? "#3ee0c2" : "rgba(20,35,50,0.6)",
            color: activeTab === "spotting" ? "#071018" : "#eaf1f8",
            border: "1px solid #3ee0c2",
            borderRadius: "4px",
            padding: "8px 16px",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          🎯 Spotting & Unexpected Arrivals ({allSpottingTargets.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("pilatus")}
          style={{
            background: activeTab === "pilatus" ? "#ef4444" : "rgba(20,35,50,0.6)",
            color: activeTab === "pilatus" ? "#ffffff" : "#fca5a5",
            border: "1px solid #ef4444",
            borderRadius: "4px",
            padding: "8px 16px",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          🎖️ Slovenian Air Force & Pilatus Fleet ({militaryFleet.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("extranet")}
          style={{
            background: activeTab === "extranet" ? "#3ee0c2" : "rgba(20,35,50,0.6)",
            color: activeTab === "extranet" ? "#071018" : "#eaf1f8",
            border: "1px solid #3ee0c2",
            borderRadius: "4px",
            padding: "8px 16px",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          🏢 Fraport Brnik Extranet & A-CDM
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("audio")}
          style={{
            background: activeTab === "audio" ? "#38bdf8" : "rgba(20,35,50,0.6)",
            color: activeTab === "audio" ? "#071018" : "#38bdf8",
            border: "1px solid #38bdf8",
            borderRadius: "4px",
            padding: "8px 16px",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          🔊 Live European Airband Radio ({audioStreams.length})
        </button>
      </div>

      {/* TAB 1: PLANESPOTTING & UNEXPECTED ARRIVALS */}
      {activeTab === "spotting" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Airport Telemetry & Spotter Vantage Strip */}
          {currentApt && (
            <div
              style={{
                background: "rgba(14,24,35,0.8)",
                border: "1px solid rgba(62,224,194,0.2)",
                borderRadius: "8px",
                padding: "14px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              <div>
                <small style={{ color: "#8ca0b3" }}>AIRPORT / ELEVATION</small>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#3ee0c2" }}>
                  {currentApt.name} ({currentApt.icao})
                </div>
                <div style={{ fontSize: "12px", color: "#cbd5e1" }}>Field Elev: {currentApt.elevFt} ft AMSL</div>
              </div>

              <div>
                <small style={{ color: "#8ca0b3" }}>RUNWAYS & GLIDESLOPE</small>
                <div style={{ fontSize: "13px", color: "#eaf1f8" }}>
                  {currentApt.runways.map((r) => `RWY ${r.id} (${r.headingDeg}°, ${r.lengthM}m)`).join(" · ")}
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8" }}>Standard 3.0° GS (318 ft / NM)</div>
              </div>

              <div>
                <small style={{ color: "#8ca0b3" }}>VHF AIRBAND FREQUENCIES</small>
                <div style={{ fontSize: "13px", color: "#38bdf8" }}>
                  TWR: {currentApt.atc.tower || "N/A"} · APP: {currentApt.atc.approach || currentApt.atc.radar || "N/A"}
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8" }}>ATIS: {currentApt.atc.atis || "N/A"}</div>
              </div>

              <div>
                <small style={{ color: "#8ca0b3" }}>TERMINAL SPOTTING VANTAGE</small>
                <div style={{ fontSize: "12px", color: "#fbbf24", fontWeight: "600" }}>
                  {currentApt.spottingLocations[0]?.name || "Perimeter"}
                </div>
                <div style={{ fontSize: "11px", color: "#8ca0b3" }}>
                  {currentApt.spottingLocations[0]?.bestFor || "Runway threshold observation"}
                </div>
              </div>
            </div>
          )}

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: "#8ca0b3" }}>FILTER INBOUNDS:</span>
            {[
              { id: "ALL", label: `All Active (${(spottingData.arrivals || []).length + (spottingData.circuits || []).length})` },
              { id: "UNEXPECTED", label: `🚨 Unexpected Arrivals (${spottingData.stats?.unexpectedCount || 0})` },
              { id: "MILITARY", label: `🎖️ Slovenian Military / Pilatus (${spottingData.stats?.militaryCount || 0})` },
              { id: "CIRCUITS", label: `🔄 Aerodrome Circuits (${spottingData.stats?.circuitsCount || 0})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSpottingFilter(f.id as any)}
                style={{
                  background: spottingFilter === f.id ? "rgba(62,224,194,0.2)" : "rgba(20,35,50,0.5)",
                  color: spottingFilter === f.id ? "#3ee0c2" : "#94a3b8",
                  border: spottingFilter === f.id ? "1px solid #3ee0c2" : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Target Cards */}
          {allSpottingTargets.length === 0 ? (
            <div
              style={{
                background: "rgba(14,24,35,0.6)",
                border: "1px dashed rgba(62,224,194,0.3)",
                borderRadius: "8px",
                padding: "30px",
                textAlign: "center",
                color: "#8ca0b3",
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>📡</div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#eaf1f8" }}>
                No active traffic within 40 NM of {selectedIcao} matching current filter
              </div>
              <p style={{ fontSize: "12px", margin: "6px 0 0 0" }}>
                The detector monitors live transponders within 40 NM terminal radius. When a general aviation, training flight, or military Pilatus descends or enters the circuit, it appears here immediately with camera azimuth, elevation angle, and glideslope metrics.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "14px" }}>
              {allSpottingTargets.map((t) => {
                const isMil = t.military?.isMilitary;
                const isUnexpected = t.isUnexpected;

                return (
                  <div
                    key={t.hex}
                    style={{
                      background: "rgba(14,24,35,0.85)",
                      border: isMil
                        ? "1px solid #ef4444"
                        : isUnexpected
                        ? "1px solid #f59e0b"
                        : "1px solid rgba(62,224,194,0.2)",
                      borderRadius: "8px",
                      padding: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "16px", fontWeight: "800", color: isMil ? "#f87171" : "#3ee0c2" }}>
                            {t.flight}
                          </span>
                          {t.registration && (
                            <span style={{ fontSize: "12px", color: "#cbd5e1", background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: "3px" }}>
                              {t.registration}
                            </span>
                          )}
                          {t.type && (
                            <span style={{ fontSize: "11px", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.4)", padding: "1px 5px", borderRadius: "3px" }}>
                              {t.type}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                          {t.model || "Airborne Target"} · Hex: <code>{t.hex.toUpperCase()}</code>
                        </div>
                      </div>

                      {/* Category Badge */}
                      <span
                        style={{
                          background: isMil
                            ? "rgba(239,68,68,0.2)"
                            : isUnexpected
                            ? "rgba(245,158,11,0.2)"
                            : "rgba(62,224,194,0.15)",
                          color: isMil ? "#ef4444" : isUnexpected ? "#f59e0b" : "#3ee0c2",
                          border: `1px solid ${isMil ? "#ef4444" : isUnexpected ? "#f59e0b" : "#3ee0c2"}`,
                          fontSize: "10px",
                          fontWeight: "700",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                        }}
                      >
                        {isMil
                          ? "🎖️ SAF MILITARY"
                          : isUnexpected
                          ? "🚨 UNEXPECTED ARRIVAL"
                          : t.category.replace("_", " ")}
                      </span>
                    </div>

                    {/* Classification Reason Note */}
                    <div
                      style={{
                        background: "rgba(0,0,0,0.3)",
                        padding: "6px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        color: isMil ? "#fca5a5" : isUnexpected ? "#fde68a" : "#cbd5e1",
                      }}
                    >
                      <b>Status:</b> {t.classificationReason}
                    </div>

                    {/* Flight Dynamics Grid */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "6px",
                        fontSize: "11px",
                        background: "rgba(10,18,26,0.6)",
                        padding: "8px",
                        borderRadius: "4px",
                      }}
                    >
                      <div>
                        <span style={{ color: "#8ca0b3", display: "block" }}>DISTANCE</span>
                        <strong style={{ color: "#3ee0c2", fontSize: "13px" }}>{t.distNm} NM</strong>
                        <div style={{ fontSize: "10px", color: "#64748b" }}>{t.distKm} km</div>
                      </div>

                      <div>
                        <span style={{ color: "#8ca0b3", display: "block" }}>ALTITUDE / AGL</span>
                        <strong style={{ color: "#eaf1f8", fontSize: "13px" }}>{t.altFt.toLocaleString()} ft</strong>
                        <div style={{ fontSize: "10px", color: "#64748b" }}>{t.aglFt} ft AGL</div>
                      </div>

                      <div>
                        <span style={{ color: "#8ca0b3", display: "block" }}>SPEED / V-SPEED</span>
                        <strong style={{ color: "#eaf1f8", fontSize: "13px" }}>{Math.round(t.gsKt)} kt</strong>
                        <div style={{ fontSize: "10px", color: t.vsFpm < -100 ? "#f87171" : "#34d399" }}>
                          {t.vsFpm > 0 ? `+${t.vsFpm}` : t.vsFpm} fpm
                        </div>
                      </div>
                    </div>

                    {/* Spotter Optics HUD (Camera Angle & ETA) */}
                    <div
                      style={{
                        border: "1px dashed rgba(62,224,194,0.3)",
                        background: "rgba(16,28,40,0.5)",
                        padding: "8px 10px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "#fbbf24", fontWeight: "700" }}>📷 PLANESPOTTER OPTICS HUD:</span>
                        <span style={{ color: "#3ee0c2", fontWeight: "700" }}>ETA: {t.spotterOptics.etaString}</span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                        <div>
                          <span style={{ color: "#8ca0b3" }}>Compass Heading to Point: </span>
                          <strong style={{ color: "#38bdf8" }}>{t.spotterOptics.spotterAzimuthDeg}° ({getCompassSector(t.spotterOptics.spotterAzimuthDeg)})</strong>
                        </div>
                        <div>
                          <span style={{ color: "#8ca0b3" }}>Lens Elevation Angle: </span>
                          <strong style={{ color: "#38bdf8" }}>{t.spotterOptics.spotterElevAngleDeg}° above horizon</strong>
                        </div>
                      </div>

                      {t.closestRunway && (
                        <div style={{ color: "#cbd5e1", marginTop: "2px" }}>
                          Runway Alignment: <strong style={{ color: "#3ee0c2" }}>RWY {t.closestRunway.id}</strong> (Heading {t.closestRunway.headingDeg}°, track error {t.closestRunway.deltaDeg}°) · Glideslope: <span style={{ color: t.glideslopeStatus === "ON_GLIDESLOPE" ? "#34d399" : "#fbbf24" }}>{t.glideslopeStatus}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: "4px" }}>
                      {t.links.planespotters ? (
                        <a
                          href={t.links.planespotters}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "#38bdf8",
                            fontSize: "11px",
                            textDecoration: "underline",
                          }}
                        >
                          🔍 Spotter Photos ({t.registration})
                        </a>
                      ) : (
                        <span style={{ fontSize: "11px", color: "#64748b" }}>Photo lookup pending reg</span>
                      )}

                      {onPinpointPlane && (
                        <button
                          type="button"
                          onClick={() => onPinpointPlane(t.hex || t.flight)}
                          style={{
                            background: "rgba(62,224,194,0.15)",
                            color: "#3ee0c2",
                            border: "1px solid #3ee0c2",
                            borderRadius: "4px",
                            padding: "4px 10px",
                            fontSize: "11px",
                            fontWeight: "700",
                            cursor: "pointer",
                          }}
                        >
                          🎯 Radar Pinpoint
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SLOVENIAN AIR FORCE & PILATUS FLEET */}
      {activeTab === "pilatus" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px",
              padding: "14px",
            }}
          >
            <h4 style={{ margin: "0 0 6px 0", color: "#f87171" }}>
              SLOVENSKA VOJSKA (SAF) / 15. LETALSKI POLK FLEET DIRECTORY
            </h4>
            <p style={{ fontSize: "12px", color: "#cbd5e1", margin: 0 }}>
              Main operating base Cerklje ob Krki (LJCE) with frequent training operations at Maribor (LJMB) and Brnik (LJLJ). All 10 Pilatus PC-9M Hudournik trainers, STOL PC-6 Porters, C-27J Spartan, Falcon 2000EX, and Cougar helicopters are tracked live via Mode-S transponders.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px" }}>
            {militaryFleet.map((f) => {
              // Check if currently airborne
              const airborne = planes.find(
                (p: any) =>
                  (p.id || p.hex)?.toLowerCase() === f.hex.toLowerCase() ||
                  (p.reg || p.registration)?.replace("-", "").toLowerCase() === f.reg.replace("-", "").toLowerCase() ||
                  p.flight?.toLowerCase().includes(f.reg.replace("-", "").toLowerCase()),
              ) as any;

              return (
                <div
                  key={f.reg}
                  style={{
                    background: airborne ? "rgba(239,68,68,0.15)" : "rgba(14,24,35,0.7)",
                    border: airborne ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "6px",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong style={{ color: "#ffffff", fontSize: "14px" }}>{f.reg}</strong>
                      <span style={{ marginLeft: "8px", fontSize: "11px", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.3)", padding: "1px 4px", borderRadius: "3px" }}>
                        {f.type}
                      </span>
                    </div>

                    <span
                      style={{
                        background: airborne ? "#ef4444" : "rgba(255,255,255,0.06)",
                        color: airborne ? "#ffffff" : "#94a3b8",
                        fontSize: "10px",
                        fontWeight: "700",
                        padding: "2px 6px",
                        borderRadius: "3px",
                      }}
                    >
                      {airborne ? "🔴 AIRBORNE LIVE" : "⚪ ON GROUND"}
                    </span>
                  </div>

                  <div style={{ fontSize: "12px", color: "#cbd5e1" }}>{f.model}</div>
                  <div style={{ fontSize: "11px", color: "#8ca0b3" }}>
                    Unit: {f.unit} · Base: {f.base} · Hex: <code>{f.hex.toUpperCase()}</code>
                  </div>

                  {airborne && (
                    <div
                      style={{
                        background: "rgba(0,0,0,0.4)",
                        padding: "6px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        color: "#fca5a5",
                        marginTop: "4px",
                      }}
                    >
                      <div>
                        <b>Callsign:</b> {airborne.flight || "TACTICAL"} · <b>Alt:</b> {airborne.altFt || airborne.altitude || 0} ft · <b>GS:</b> {Math.round(airborne.gs || airborne.speed || 0)} kt
                      </div>
                      {onPinpointPlane && (
                        <button
                          type="button"
                          onClick={() => onPinpointPlane(airborne.id || airborne.hex || airborne.flight)}
                          style={{
                            marginTop: "6px",
                            background: "#ef4444",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "3px",
                            padding: "3px 8px",
                            fontSize: "10px",
                            fontWeight: "700",
                            cursor: "pointer",
                          }}
                        >
                          Pinpoint Tactical Track
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: FRAPORT SLOVENIJA BRNIK EXTRANET & A-CDM */}
      {activeTab === "extranet" && extranetSpec && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              background: "rgba(14,24,35,0.85)",
              border: "1px solid rgba(62,224,194,0.3)",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "#3ee0c2" }}>{extranetSpec.airport}</h3>
                <p style={{ margin: 0, fontSize: "12px", color: "#8ca0b3" }}>
                  Operational Data Exchange Portal · Airport Collaborative Decision Making (A-CDM)
                </p>
              </div>
              <a
                href={extranetSpec.portalUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "rgba(62,224,194,0.15)",
                  color: "#3ee0c2",
                  border: "1px solid #3ee0c2",
                  borderRadius: "4px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: "700",
                  textDecoration: "none",
                }}
              >
                🔗 Open Fraport B2B Portal ↗
              </a>
            </div>
          </div>

          {/* Section 1: A-CDM Turnaround Milestones */}
          <div style={{ background: "rgba(14,24,35,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "16px" }}>
            <h4 style={{ margin: "0 0 10px 0", color: "#3ee0c2" }}>
              1. A-CDM Flight Overview Milestones (Real-Time Turnaround Sync)
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" }}>
              {extranetSpec.extranetSections[0]?.milestones?.map((m) => (
                <div key={m.code} style={{ background: "rgba(10,18,26,0.6)", padding: "10px", borderRadius: "6px", borderLeft: "3px solid #3ee0c2" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ color: "#3ee0c2", fontSize: "14px" }}>{m.code}</strong>
                    <small style={{ color: "#94a3b8" }}>{m.label}</small>
                  </div>
                  <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "4px" }}>{m.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Apron Stands & Gates Allocation */}
          <div style={{ background: "rgba(14,24,35,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "16px" }}>
            <h4 style={{ margin: "0 0 10px 0", color: "#3ee0c2" }}>
              2. Brnik Apron & Gate Allocation Matrix (Schengen / GA / Cargo)
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "10px" }}>
              {extranetSpec.extranetSections[1]?.areas?.map((a) => (
                <div key={a.name} style={{ background: "rgba(10,18,26,0.6)", padding: "10px", borderRadius: "6px" }}>
                  <strong style={{ color: "#ffffff", fontSize: "13px" }}>{a.name}</strong>
                  <div style={{ fontSize: "11px", color: "#38bdf8", marginTop: "4px" }}>
                    <b>Stands:</b> {a.stands.join(", ")}
                  </div>
                  <div style={{ fontSize: "11px", color: "#cbd5e1" }}>
                    <b>Gates:</b> {a.gates.join(", ")}
                  </div>
                  <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px" }}>
                    Features: {a.features}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: SITA Messaging & Type B Telegrams */}
          <div style={{ background: "rgba(14,24,35,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "16px" }}>
            <h4 style={{ margin: "0 0 10px 0", color: "#3ee0c2" }}>
              3. SITA Type B Messaging & Telegram Formats (MVT / LDM / CPM)
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
              {extranetSpec.extranetSections[2]?.telegrams?.map((t) => (
                <div key={t.type} style={{ background: "rgba(10,18,26,0.6)", padding: "10px", borderRadius: "6px" }}>
                  <strong style={{ color: "#38bdf8", fontSize: "13px" }}>{t.type}</strong>
                  <div style={{ fontSize: "11px", color: "#8ca0b3", margin: "4px 0" }}>{t.purpose}</div>
                  <pre style={{ background: "rgba(0,0,0,0.5)", padding: "8px", borderRadius: "4px", fontSize: "10px", color: "#34d399", overflowX: "auto" }}>
                    {t.example}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LIVE EUROPEAN AIRBAND AUDIO STREAM */}
      {activeTab === "audio" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Main Player Card */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(14,24,35,0.9), rgba(10,20,30,0.9))",
              border: "1px solid #38bdf8",
              borderRadius: "8px",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>ACTIVE FREQUENCY TUNER</span>
                <div style={{ fontSize: "20px", fontWeight: "800", color: "#38bdf8" }}>
                  {activeStream.title}
                </div>
                <div style={{ fontSize: "13px", color: "#eaf1f8" }}>
                  Frequency: <strong style={{ color: "#3ee0c2" }}>{activeStream.freqMhz} MHz (AM Airband)</strong> · Facility: {activeStream.facility}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <button
                  type="button"
                  onClick={toggleAudio}
                  style={{
                    background: isPlayingAudio ? "#ef4444" : "#38bdf8",
                    color: isPlayingAudio ? "#ffffff" : "#071018",
                    border: "none",
                    borderRadius: "6px",
                    padding: "10px 24px",
                    fontSize: "14px",
                    fontWeight: "800",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {isPlayingAudio ? "⏸ MUTE AIRBAND" : "▶ LISTEN LIVE"}
                </button>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <small style={{ fontSize: "10px", color: "#8ca0b3" }}>VOLUME: {Math.round(audioVolume * 100)}%</small>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audioVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setAudioVolume(v);
                      if (audioRef.current) audioRef.current.volume = v;
                    }}
                    style={{ width: "100px" }}
                  />
                </div>
              </div>
            </div>

            {/* Simulated Squelch / Audio Spectrum VU Meter */}
            <div
              style={{
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(56,189,248,0.2)",
                borderRadius: "4px",
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span style={{ fontSize: "11px", color: isPlayingAudio ? "#34d399" : "#64748b", fontWeight: "700" }}>
                {isPlayingAudio ? "● CARRIER DETECTED / SQUELCH OPEN" : "○ SQUELCH CLOSED"}
              </span>

              <div style={{ display: "flex", gap: "3px", alignItems: "flex-end", height: "16px", flex: 1 }}>
                {Array.from({ length: 32 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: isPlayingAudio ? `${Math.max(15, Math.sin(i * 0.4 + Date.now() * 0.001) * 80 + 20)}%` : "15%",
                      background: isPlayingAudio ? (i > 24 ? "#ef4444" : i > 16 ? "#fbbf24" : "#38bdf8") : "#334155",
                      borderRadius: "1px",
                      transition: "height 0.1s ease",
                    }}
                  />
                ))}
              </div>
            </div>

            {audioError && (
              <div style={{ fontSize: "11px", color: "#f87171", background: "rgba(239,68,68,0.1)", padding: "6px 10px", borderRadius: "4px" }}>
                {audioError}{" "}
                <a href={activeStream.streamUrl} target="_blank" rel="noreferrer" style={{ color: "#38bdf8", textDecoration: "underline" }}>
                  Open direct WebSDR link ↗
                </a>
              </div>
            )}
          </div>

          {/* Channel Selector Directory */}
          <div style={{ background: "rgba(14,24,35,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "14px" }}>
            <h4 style={{ margin: "0 0 10px 0", color: "#38bdf8" }}>EUROPEAN AIRBAND LIVE CHANNELS</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px" }}>
              {audioStreams.map((s) => {
                const isCur = s.id === selectedStreamId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleStreamChange(s.id)}
                    style={{
                      background: isCur ? "rgba(56,189,248,0.2)" : "rgba(10,18,26,0.6)",
                      border: isCur ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "6px",
                      padding: "10px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ color: isCur ? "#38bdf8" : "#eaf1f8", fontSize: "13px" }}>{s.title}</strong>
                      <span style={{ fontSize: "11px", color: "#3ee0c2", fontWeight: "700" }}>{s.freqMhz} MHz</span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#cbd5e1" }}>{s.facility} ({s.country})</div>
                    <div style={{ fontSize: "10px", color: "#94a3b8" }}>{s.coverage}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getCompassSector(deg: number): string {
  const sectors = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(deg / 22.5) % 16;
  return sectors[idx];
}
