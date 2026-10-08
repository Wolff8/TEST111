import React, { useState, useEffect } from "react";

export interface HydroStation {
  id: string;
  reka: string;
  merilnoMesto: string;
  basin: string;
  vodostaj: number | null;
  pretok: number | null;
  pretokZnacilni: string;
  tempVode: number | null;
  alertStage: "NORMAL" | "YELLOW_ELEVATED" | "ORANGE_ALERT" | "RED_ALARM";
  trend: "RISING" | "STEADY" | "FALLING";
  prviOpozorilni: number | null;
  drugiOpozorilni: number | null;
  datum: string;
  lat: number | null;
  lon: number | null;
  history: Array<{ at: string; vodostaj: number; pretok: number }>;
}

export interface LoRaNode {
  devEui: string;
  name: string;
  location: string;
  lat: number;
  lon: number;
  type: string;
  freqMhz: number;
  sf: string;
  rssi: number;
  snr: number;
  batteryV: number;
  sensorRangeCm: number;
  baseBedCm: number;
  currentLevelCm: number;
  flowEstM3s: number;
  waterTempC: number;
  status: string;
  lastPacketSec: number;
  fcnt: number;
  gw: string;
}

export interface HydroPayload {
  at: string;
  source: string;
  totalStations: number;
  pomurjeCount: number;
  activeAlertsCount: number;
  pomurjeStations: HydroStation[];
  lorawanNodes: LoRaNode[];
  summary: {
    muraLevelCm: number;
    muraFlowM3s: number;
    ledavaPolanaCm: number;
    ledavaCentibaCm: number;
    waterTempPetanjciC: number;
    floodStatus: string;
  };
}

export const WaterMonitoringDashboard: React.FC = () => {
  const [data, setData] = useState<HydroPayload | null>(null);
  const [selectedStation, setSelectedStation] = useState<string>("1070"); // Petanjci
  const [selectedLoRa, setSelectedLoRa] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "stations" | "lorawan" | "flood">("overview");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const fetchHydro = async () => {
      try {
        const res = await fetch("/api/hydro/live");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.warn("Failed to fetch live hydro data:", err);
      }
    };

    fetchHydro();
    const interval = setInterval(fetchHydro, 15_000);
    return () => clearInterval(interval);
  }, []);

  const station = data?.pomurjeStations.find((s) => s.id === selectedStation) || data?.pomurjeStations[0];
  const loraNode = data?.lorawanNodes.find((n) => n.devEui === selectedLoRa) || data?.lorawanNodes[0];

  return (
    <div
      className={`water-dash-container ${isFullscreen ? "water-dash-fullscreen" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        background: "#03080e",
        color: "#94a3b8",
        fontFamily: "'Share Tech Mono', monospace, monospace",
        padding: "12px",
        overflowY: "auto",
        position: isFullscreen ? "fixed" : "relative",
        inset: isFullscreen ? 0 : "auto",
        zIndex: isFullscreen ? 99999 : "auto",
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          borderBottom: "1px solid rgba(14, 165, 233, 0.3)",
          paddingBottom: "8px",
          marginBottom: "10px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#0ea5e9",
                boxShadow: "0 0 10px #0ea5e9",
              }}
            />
            <strong style={{ fontSize: "16px", color: "#38bdf8", letterSpacing: "1px" }}>
              ARSO VODE & LORAWAN IOT HIDROLOGIJA
            </strong>
            <span
              style={{
                fontSize: "10px",
                background: "rgba(14, 165, 233, 0.2)",
                color: "#38bdf8",
                padding: "2px 6px",
                borderRadius: "4px",
                border: "1px solid rgba(14, 165, 233, 0.4)",
              }}
            >
              PREKMURJE & MURA BASIN
            </span>
          </div>
          <small style={{ color: "#64748b" }}>
            Murska Sobota · Petanjci · Ledava · Puconci · Soboško jezero Expano · Krači
          </small>
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span
            style={{
              fontSize: "11px",
              padding: "4px 8px",
              borderRadius: "4px",
              background: data?.activeAlertsCount ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)",
              color: data?.activeAlertsCount ? "#f87171" : "#4ade80",
              border: `1px solid ${data?.activeAlertsCount ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.4)"}`,
              fontWeight: "bold",
            }}
          >
            {data?.summary?.floodStatus || "STANJE VODOSTAJEV: NORMALNO"}
          </span>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            style={{
              background: "rgba(14, 165, 233, 0.2)",
              color: "#38bdf8",
              border: "1px solid #0ea5e9",
              borderRadius: "4px",
              padding: "5px 10px",
              fontSize: "11px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {isFullscreen ? "✕ IZHOD" : "📱 FULLSCREEN"}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "4px",
          marginBottom: "12px",
          background: "rgba(15, 23, 42, 0.8)",
          padding: "4px",
          borderRadius: "6px",
          border: "1px solid rgba(14, 165, 233, 0.2)",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          style={{
            background: activeTab === "overview" ? "rgba(14, 165, 233, 0.3)" : "transparent",
            color: activeTab === "overview" ? "#38bdf8" : "#94a3b8",
            border: activeTab === "overview" ? "1px solid #38bdf8" : "1px solid transparent",
            borderRadius: "4px",
            padding: "8px 4px",
            fontSize: "11px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          📊 PREGLED VODOSTAJEV
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stations")}
          style={{
            background: activeTab === "stations" ? "rgba(14, 165, 233, 0.3)" : "transparent",
            color: activeTab === "stations" ? "#38bdf8" : "#94a3b8",
            border: activeTab === "stations" ? "1px solid #38bdf8" : "1px solid transparent",
            borderRadius: "4px",
            padding: "8px 4px",
            fontSize: "11px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          🌊 ARSO POSTAJE ({data?.pomurjeCount || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("lorawan")}
          style={{
            background: activeTab === "lorawan" ? "rgba(14, 165, 233, 0.3)" : "transparent",
            color: activeTab === "lorawan" ? "#38bdf8" : "#94a3b8",
            border: activeTab === "lorawan" ? "1px solid #38bdf8" : "1px solid transparent",
            borderRadius: "4px",
            padding: "8px 4px",
            fontSize: "11px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          📡 LORAWAN IOT (5)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("flood")}
          style={{
            background: activeTab === "flood" ? "rgba(14, 165, 233, 0.3)" : "transparent",
            color: activeTab === "flood" ? "#38bdf8" : "#94a3b8",
            border: activeTab === "flood" ? "1px solid #38bdf8" : "1px solid transparent",
            borderRadius: "4px",
            padding: "8px 4px",
            fontSize: "11px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          ⚠️ OPOZORILNI PRAGI
        </button>
      </div>

      {/* TAB 1: OVERVIEW & HYDROGRAPHS */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Key Gauges Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
            {/* Mura Petanjci Card */}
            <div
              style={{
                background: "rgba(10, 24, 40, 0.8)",
                border: "1px solid rgba(14, 165, 233, 0.3)",
                borderRadius: "6px",
                padding: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "#38bdf8", fontWeight: "bold" }}>MURA · PETANJCI</span>
                <span style={{ fontSize: "10px", background: "#0284c7", color: "#fff", padding: "1px 5px", borderRadius: "3px" }}>ARSO 1070</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "6px" }}>
                <span style={{ fontSize: "24px", fontWeight: "bold", color: "#f8fafc" }}>
                  {data?.summary?.muraLevelCm || 91}
                </span>
                <span style={{ fontSize: "12px", color: "#38bdf8" }}>cm vodostaj</span>
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                Pretok: <strong style={{ color: "#38bdf8" }}>{data?.summary?.muraFlowM3s || 55.2} m³/s</strong> (mali pretok)
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                Temperatura vode: <strong>{data?.summary?.waterTempPetanjciC || 16.9}°C</strong> · Opozorilni: 750 m³/s
              </div>
            </div>

            {/* Ledava Polana Card */}
            <div
              style={{
                background: "rgba(10, 24, 40, 0.8)",
                border: "1px solid rgba(14, 165, 233, 0.3)",
                borderRadius: "6px",
                padding: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "#38bdf8", fontWeight: "bold" }}>LEDAVA · POLANA I</span>
                <span style={{ fontSize: "10px", background: "#0284c7", color: "#fff", padding: "1px 5px", borderRadius: "3px" }}>ARSO 1220</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "6px" }}>
                <span style={{ fontSize: "24px", fontWeight: "bold", color: "#f8fafc" }}>
                  {data?.summary?.ledavaPolanaCm || 31}
                </span>
                <span style={{ fontSize: "12px", color: "#38bdf8" }}>cm vodostaj</span>
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                Pretok: <strong style={{ color: "#38bdf8" }}>0.042 m³/s</strong> · Trend: <strong style={{ color: "#4ade80" }}>STABILEN</strong>
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                Murska Sobota južni odtok · Opozorilni: 12 m³/s
              </div>
            </div>

            {/* Ledava Čentiba Card */}
            <div
              style={{
                background: "rgba(10, 24, 40, 0.8)",
                border: "1px solid rgba(14, 165, 233, 0.3)",
                borderRadius: "6px",
                padding: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "#38bdf8", fontWeight: "bold" }}>LEDAVA · ČENTIBA</span>
                <span style={{ fontSize: "10px", background: "#0284c7", color: "#fff", padding: "1px 5px", borderRadius: "3px" }}>ARSO 1260</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "6px" }}>
                <span style={{ fontSize: "24px", fontWeight: "bold", color: "#f8fafc" }}>
                  {data?.summary?.ledavaCentibaCm || 85}
                </span>
                <span style={{ fontSize: "12px", color: "#38bdf8" }}>cm vodostaj</span>
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                Pretok: <strong style={{ color: "#38bdf8" }}>0.623 m³/s</strong> · Temp vode: 16.0°C
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                Lendava izliv v Krko (HU) · Opozorilni: 18 m³/s
              </div>
            </div>

            {/* Soboško Jezero Expano LoRa Card */}
            <div
              style={{
                background: "rgba(10, 24, 40, 0.8)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "6px",
                padding: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "#4ade80", fontWeight: "bold" }}>SOBOŠKO JEZERO (EXPANO)</span>
                <span style={{ fontSize: "10px", background: "#15803d", color: "#fff", padding: "1px 5px", borderRadius: "3px" }}>LoRaWAN 868</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "6px" }}>
                <span style={{ fontSize: "24px", fontWeight: "bold", color: "#f8fafc" }}>320.4</span>
                <span style={{ fontSize: "12px", color: "#4ade80" }}>cm globina</span>
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                Baterija: <strong style={{ color: "#4ade80" }}>3.58V</strong> · RSSI: -94 dBm · SF8
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                Hidrostatski senzor Dragino PS-LB · Temp vode: 17.2°C
              </div>
            </div>
          </div>

          {/* Interactive Hydrograph Section */}
          <div
            style={{
              background: "rgba(8, 18, 30, 0.9)",
              border: "1px solid rgba(14, 165, 233, 0.3)",
              borderRadius: "8px",
              padding: "14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <strong style={{ fontSize: "14px", color: "#38bdf8" }}>
                  HIDROGRAF VODOSTAJA & PRETOKA: {station?.reka} - {station?.merilnoMesto}
                </strong>
                <div style={{ fontSize: "11px", color: "#64748b" }}>
                  Čas zadnjega uradnega odčitka ARSO: {station?.datum || "N/A"}
                </div>
              </div>

              {/* Station Picker Chips */}
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {data?.pomurjeStations.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStation(st.id)}
                    style={{
                      background: selectedStation === st.id ? "#0284c7" : "rgba(15, 23, 42, 0.6)",
                      color: selectedStation === st.id ? "#ffffff" : "#94a3b8",
                      border: `1px solid ${selectedStation === st.id ? "#38bdf8" : "rgba(255, 255, 255, 0.1)"}`,
                      padding: "3px 8px",
                      borderRadius: "3px",
                      fontSize: "10px",
                      cursor: "pointer",
                    }}
                  >
                    {st.merilnoMesto} ({st.vodostaj || "—"} cm)
                  </button>
                ))}
              </div>
            </div>

            {/* Hydrograph Visual Gauge & Barometer */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: "12px", alignItems: "center" }}>
              <div
                style={{
                  background: "#02070d",
                  borderRadius: "6px",
                  padding: "16px",
                  border: "1px solid rgba(14, 165, 233, 0.2)",
                  minHeight: "180px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b" }}>
                  <span>VODOSTAJ (cm)</span>
                  <span>PRETOK (m³/s)</span>
                  <span>TEMPERATURA VODE (°C)</span>
                </div>

                {/* Simulated Hydrograph Curve SVG */}
                <div style={{ position: "relative", width: "100%", height: "100px", margin: "10px 0" }}>
                  <svg width="100%" height="100%" viewBox="0 0 500 100" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    <line x1="0" y1="25" x2="500" y2="25" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                    <line x1="0" y1="50" x2="500" y2="50" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                    <line x1="0" y1="75" x2="500" y2="75" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                    {/* Hydro curve */}
                    <path
                      d="M 0,65 Q 80,58 160,62 T 320,50 T 420,54 T 500,48 L 500,100 L 0,100 Z"
                      fill="url(#waterGrad)"
                    />
                    <path
                      d="M 0,65 Q 80,58 160,62 T 320,50 T 420,54 T 500,48"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                    />
                  </svg>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64748b" }}>
                  <span>-24h (Včeraj)</span>
                  <span>-18h</span>
                  <span>-12h</span>
                  <span>-6h</span>
                  <span style={{ color: "#38bdf8", fontWeight: "bold" }}>ZDAJ ({station?.datum?.split(" ")[1] || "21:30"})</span>
                </div>
              </div>

              {/* Station Current Telemetry Box */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.7)",
                  borderRadius: "6px",
                  padding: "12px",
                  border: "1px solid rgba(14, 165, 233, 0.25)",
                  fontSize: "11px",
                }}
              >
                <div style={{ color: "#38bdf8", fontWeight: "bold", marginBottom: "8px" }}>
                  PODATKI MERILNEGA MESTA
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div>Reka / Porečje: <strong style={{ color: "#f8fafc" }}>{station?.reka} ({station?.basin})</strong></div>
                  <div>Trenutni vodostaj: <strong style={{ color: "#38bdf8", fontSize: "13px" }}>{station?.vodostaj ?? "—"} cm</strong></div>
                  <div>Pretok vode: <strong style={{ color: "#38bdf8", fontSize: "13px" }}>{station?.pretok ?? "—"} m³/s</strong></div>
                  <div>Značilni razred: <strong>{station?.pretokZnacilni || "mali pretok"}</strong></div>
                  <div>Temperatura: <strong>{station?.tempVode ?? "—"} °C</strong></div>
                  <div>1. opozorilni pretok: <strong>{station?.prviOpozorilni ? `${station.prviOpozorilni} m³/s` : "Ni določen"}</strong></div>
                  <div>Status alarma: <strong style={{ color: "#4ade80" }}>{station?.alertStage || "NORMAL"}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ALL ARSO STATIONS */}
      {activeTab === "stations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ color: "#38bdf8", fontSize: "13px" }}>
              VSE AKTIVNE HIDROLOŠKE POSTAJE ARSO V POMURJU IN OKOLICI
            </strong>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Vir: Agencija RS za okolje</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "8px" }}>
            {data?.pomurjeStations.map((st) => (
              <div
                key={st.id}
                onClick={() => setSelectedStation(st.id)}
                style={{
                  background: selectedStation === st.id ? "rgba(14, 165, 233, 0.15)" : "rgba(15, 23, 42, 0.6)",
                  border: `1px solid ${selectedStation === st.id ? "#38bdf8" : "rgba(14, 165, 233, 0.2)"}`,
                  borderRadius: "6px",
                  padding: "10px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: "#f8fafc" }}>{st.reka} · {st.merilnoMesto}</strong>
                  <span style={{ fontSize: "10px", background: "rgba(0,0,0,0.4)", padding: "1px 4px", borderRadius: "2px", color: "#38bdf8" }}>#{st.id}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "12px" }}>
                  <span>Vodostaj: <strong style={{ color: "#38bdf8" }}>{st.vodostaj ?? "—"} cm</strong></span>
                  <span>Pretok: <strong style={{ color: "#38bdf8" }}>{st.pretok ?? "—"} m³/s</strong></span>
                </div>
                <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>
                  {st.pretokZnacilni} · {st.tempVode ? `${st.tempVode}°C` : ""} · {st.datum}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: LORAWAN IOT SENSOR NODES */}
      {activeTab === "lorawan" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ color: "#4ade80", fontSize: "13px" }}>
              POMURJE LORAWAN IOT VODNI & OKOLJSKI SENZORJI (EU 868 MHz)
            </strong>
            <span style={{ fontSize: "11px", color: "#64748b" }}>TTN Packet Broker / MS-Center Gateway</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "8px" }}>
            {data?.lorawanNodes.map((n) => (
              <div
                key={n.devEui}
                onClick={() => setSelectedLoRa(n.devEui)}
                style={{
                  background: selectedLoRa === n.devEui ? "rgba(34, 197, 94, 0.15)" : "rgba(10, 24, 30, 0.7)",
                  border: `1px solid ${selectedLoRa === n.devEui ? "#4ade80" : "rgba(34, 197, 94, 0.25)"}`,
                  borderRadius: "6px",
                  padding: "10px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: "#f8fafc", fontSize: "12px" }}>{n.name}</strong>
                  <span style={{ fontSize: "10px", background: "#15803d", color: "#fff", padding: "1px 5px", borderRadius: "3px" }}>{n.status}</span>
                </div>
                <div style={{ fontSize: "10px", color: "#4ade80", margin: "2px 0" }}>{n.location} · {n.type}</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginTop: "6px", fontSize: "11px", background: "rgba(0,0,0,0.3)", padding: "6px", borderRadius: "4px" }}>
                  <div>Vodostaj: <strong style={{ color: "#38bdf8" }}>{n.currentLevelCm} cm</strong></div>
                  <div>Ocena pretoka: <strong>{n.flowEstM3s} m³/s</strong></div>
                  <div>Baterija: <strong style={{ color: "#4ade80" }}>{n.batteryV} V</strong></div>
                  <div>Temp vode: <strong>{n.waterTempC} °C</strong></div>
                  <div>RSSI: <strong>{n.rssi} dBm</strong></div>
                  <div>SNR: <strong>{n.snr} dB</strong></div>
                  <div>Frekvenca: <strong>{n.freqMhz} MHz</strong></div>
                  <div>Razširitev: <strong>{n.sf}</strong></div>
                </div>

                <div style={{ fontSize: "9px", color: "#64748b", marginTop: "4px" }}>
                  DevEUI: {n.devEui} · FCnt: {n.fcnt} · Zadnji paket: pred {n.lastPacketSec}s · Prehod: {n.gw}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: FLOOD STAGES & WARNING THRESHOLDS */}
      {activeTab === "flood" && (
        <div style={{ background: "rgba(15, 23, 42, 0.8)", padding: "14px", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
          <strong style={{ color: "#f87171", fontSize: "14px" }}>
            URADNI OPOZORILNI PRAGI IN PROTOKOLI ZA POPLAVNO VARNOST V POMURJU
          </strong>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px", lineHeight: "1.5" }}>
            Protokoli civilne zaščite in hidroloških alarmov za porečje reke Mure in Ledave (Uprava RS za zaščito in reševanje ter ARSO):
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
            <div style={{ background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.4)", padding: "8px", borderRadius: "4px" }}>
              <strong style={{ color: "#4ade80" }}>ZELENA STOPNJA (NORMALNO STANJE)</strong>
              <div style={{ fontSize: "11px", color: "#e2e8f0" }}>Pretoki pod opozorilnimi vrednostmi. Normalen odtok po strugi brez prelitja na poplavna območja.</div>
            </div>

            <div style={{ background: "rgba(234, 179, 8, 0.15)", border: "1px solid rgba(234, 179, 8, 0.4)", padding: "8px", borderRadius: "4px" }}>
              <strong style={{ color: "#facc15" }}>RUMENA STOPNJA (POVIŠANI VODOSTAJI)</strong>
              <div style={{ fontSize: "11px", color: "#e2e8f0" }}>Pretoki presegajo značilne srednje vrednosti. Povečano opazovanje nasipov ob Muri (Petanjci, Mota, Krog) in zadrževalnika Ledavsko jezero.</div>
            </div>

            <div style={{ background: "rgba(249, 115, 22, 0.15)", border: "1px solid rgba(249, 115, 22, 0.4)", padding: "8px", borderRadius: "4px" }}>
              <strong style={{ color: "#fb923c" }}>ORANŽNA STOPNJA (1. OPOZORILNI PRAG - PREPOPLAVA)</strong>
              <div style={{ fontSize: "11px", color: "#e2e8f0" }}>
                Mura (Petanjci &gt; 750 m³/s), Ledava (Čentiba &gt; 18 m³/s). Začetek prelivov na kmetijske površine in razlivne loke. Aktiviranje opazovalnih služb CZ Murska Sobota.
              </div>
            </div>

            <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", padding: "8px", borderRadius: "4px" }}>
              <strong style={{ color: "#f87171" }}>RDEČA STOPNJA (2. OPOZORILNI PRAG - VISOKA POPLAVNA NEVARNOST)</strong>
              <div style={{ fontSize: "11px", color: "#e2e8f0" }}>
                Mura (Petanjci &gt; 1100 m³/s). Pretoki z visoko povratno dobo (Q10/Q50). Nevarnost preboja nasipov, zapiranje poplavnih zapornic in aktivacija črpališč v Murski Soboti.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
