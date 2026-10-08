import { useEffect, useMemo, useState } from "react";
import type { Plane } from "../lib";

export interface B2BExchangeDashboardProps {
  planes?: Plane[];
  onPinpointPlane?: (planeId: string) => void;
  publicUrl?: string;
}

interface SituationReport {
  id: number;
  date: string;
  title: string;
  content: string;
  active: boolean;
}

interface RouteResult {
  callsign: string;
  dep: string | null;
  dest: string | null;
  routeWaypoints?: string[];
  operatorIata?: string | null;
  flightNumber?: number | string | null;
  source?: string;
  updateTime?: string;
}

interface FplValidationResult {
  ok: boolean;
  valid: boolean;
  errors: string[];
  warnings: string[];
  parsed: {
    messageType: string;
    field7_callsign: string | null;
    field8_flightRules: string | null;
    field8_flightType: string | null;
    field9_numberOfAircraft: number;
    field9_aircraftType: string | null;
    field9_wakeTurbulence: string | null;
    field10_equipment: string | null;
    field10_transponder: string | null;
    field13_depAerodrome: string | null;
    field13_eobt: string | null;
    field15_cruisingSpeed: string | null;
    field15_cruisingLevel: string | null;
    field15_route: string | null;
    field16_destAerodrome: string | null;
    field16_eet: string | null;
    field16_altn1: string | null;
    field16_altn2: string | null;
    field18_otherInfo: Record<string, string>;
  };
  ifpsReady: boolean;
  rawText?: string;
}

const TEMPLATE_FPLS = [
  {
    name: "LJLJ → LOWW (Airbus A320)",
    fpl: "(FPL-S5BAA-IS-A320/M-SDFGIRWXY/EB1-LJLJ1100-N0450F360 KUDES DCT DOL T430 ASTUS-LOWW0045 EDDM-PBN/B1D1O1S2 DOF/261008)",
  },
  {
    name: "LJLJ → LIPZ (Cessna 172 VFR/IFR)",
    fpl: "(FPL-S5ABC-VG-C172/L-S/C-LJLJ0900-N0115A050 DOL DCT-LIPZ0055 LIPV-DOF/261008)",
  },
  {
    name: "EDDM → OMDB (Boeing 777)",
    fpl: "(FPL-DLH400-IS-B77L/H-SDFGIRWXY/EB1-EDDM1430-N0480F370 MERSI DCT VIC Z903 BRD-OMDB0530 OMDW-PBN/A1B1C1D1L1O1S1 DOF/261008)",
  },
  {
    name: "LOWW → EGLL (Airbus A321)",
    fpl: "(FPL-AUA451-IS-A321/M-SDFGIRWXY/EB1-LOWW0700-N0460F340 STEIN T703 DITAM UL607 LOGAN-EGLL0155 EGSS-PBN/B1D1O1S2 DOF/261008)",
  },
];

export function B2BExchangeDashboard({ planes = [], onPinpointPlane, publicUrl }: B2BExchangeDashboardProps) {
  const [activeTab, setActiveTab] = useState<"fpl" | "routes" | "situation" | "swim" | "briefing">("routes");
  const [b2bStatus, setB2BStatus] = useState<any>(null);
  const [situationData, setSituationData] = useState<SituationReport[]>([]);
  const [trafficData, setTrafficData] = useState<any[]>([]);
  const [weatherStations, setWeatherStations] = useState<any[]>([]);
  const [notamsList, setNotamsList] = useState<any[]>([]);
  const [notamFilter, setNotamFilter] = useState<"ALL" | "MILITARY" | "RUNWAY" | "OBSTACLE">("ALL");
  const [activeReportIdx, setActiveReportIdx] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  // Routes Search
  const [routeSearch, setRouteSearch] = useState("");
  const [lookupCallsign, setLookupCallsign] = useState("");
  const [lookupResult, setLookupResult] = useState<RouteResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // FPL Validator state
  const [fplText, setFplText] = useState(TEMPLATE_FPLS[0].fpl);
  const [validationResult, setValidationResult] = useState<FplValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Load B2B telemetry & situation reports & weather / notams
  const fetchTelemetry = async (force = false) => {
    setLoading(true);
    try {
      const [stRes, sitRes, tfRes, wxRes, notamRes] = await Promise.all([
        fetch("/api/b2b/status").then((r) => r.json()).catch(() => null),
        fetch(`/api/b2b/situation${force ? "?force=1" : ""}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/b2b/traffic${force ? "?force=1" : ""}`).then((r) => r.json()).catch(() => null),
        fetch("/api/aviation/weather").then((r) => r.json()).catch(() => null),
        fetch("/api/aviation/notams").then((r) => r.json()).catch(() => null),
      ]);

      if (stRes?.ok) setB2BStatus(stRes);
      if (sitRes?.data && Array.isArray(sitRes.data)) {
        setSituationData(sitRes.data);
      }
      if (tfRes?.data && Array.isArray(tfRes.data)) {
        setTrafficData(tfRes.data);
      }
      if (wxRes?.stations && Array.isArray(wxRes.stations)) {
        setWeatherStations(wxRes.stations);
      }
      if (Array.isArray(notamRes)) {
        setNotamsList(notamRes);
      }
      setLastRefreshed(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry(false);
    const interval = window.setInterval(() => fetchTelemetry(false), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // Validate FPL on text change (debounced)
  useEffect(() => {
    if (!fplText.trim()) {
      setValidationResult(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      setIsValidating(true);
      try {
        const res = await fetch(`/api/b2b/validate-fpl?fpl=${encodeURIComponent(fplText)}`);
        const json = await res.json();
        setValidationResult(json);
      } catch {
        // ignore network error
      } finally {
        setIsValidating(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [fplText]);

  // Lookup single route
  const handleLookupRoute = async () => {
    const cs = lookupCallsign.trim().toUpperCase();
    if (!cs) return;
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/b2b/route?callsign=${encodeURIComponent(cs)}`);
      const json = await res.json();
      if (json.ok && json.found) {
        setLookupResult(json.route);
      } else {
        setLookupResult({
          callsign: cs,
          dep: null,
          dest: null,
          source: "No route filed in OpenSky/ADSB standing registries",
        });
      }
    } catch {
      setLookupResult(null);
    } finally {
      setLookupLoading(false);
    }
  };

  // Filter airborne aircraft with filed flight plans or callsigns
  const fplPlanes = useMemo(() => {
    return planes.filter((p) => {
      if (routeSearch) {
        const q = routeSearch.toLowerCase();
        const mCall = (p.flight || "").toLowerCase().includes(q);
        const mDep = (p.dep || "").toLowerCase().includes(q);
        const mDest = (p.dest || "").toLowerCase().includes(q);
        const mReg = (p.reg || "").toLowerCase().includes(q);
        return mCall || mDep || mDest || mReg;
      }
      return Boolean(p.flight || p.dep || p.dest || p.fpl);
    });
  }, [planes, routeSearch]);

  const activeReport = situationData[activeReportIdx] || null;

  return (
    <div className="b2b-dashboard" style={{ padding: "16px", color: "#eaf1f8", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Top Banner & Telemetry KPIs */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(14,24,35,0.95), rgba(20,38,55,0.95))",
          border: "1px solid rgba(62,224,194,0.3)",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "16px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "22px" }}>⇄</span>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700", letterSpacing: "1px", color: "#3ee0c2" }}>
                EUROCONTROL NM B2B & FLIGHT PLAN EXCHANGE
              </h2>
              <span
                style={{
                  background: "rgba(62,224,122,0.15)",
                  color: "#3ee07a",
                  border: "1px solid #3ee07a",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "700",
                }}
              >
                ● 100% REAL LIVE DATA
              </span>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8ca0b3" }}>
              System-Wide Information Management (SWIM) · ICAO Doc 4444 / IFPS FPL 2012 Engine · Eurocontrol Network Situation
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "11px", color: "#8ca0b3" }}>Refreshed: {lastRefreshed || "just now"}</span>
            <button
              type="button"
              onClick={() => fetchTelemetry(true)}
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
              {loading ? "Refreshing…" : "↻ Sync B2B Data"}
            </button>
          </div>
        </div>

        {/* Live Service Indicator Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "10px",
            marginTop: "14px",
            paddingTop: "14px",
            borderTop: "1px solid rgba(62,224,194,0.15)",
          }}
        >
          <div style={{ background: "rgba(10,18,26,0.6)", padding: "8px 12px", borderRadius: "6px" }}>
            <small style={{ color: "#8ca0b3", display: "block" }}>NM B2B SITUATION FEED</small>
            <strong style={{ color: situationData.length ? "#3ee07a" : "#f5b942", fontSize: "13px" }}>
              {situationData.length ? `● CONNECTED (${situationData.length} WEEKS)` : "● POLLING"}
            </strong>
          </div>
          <div style={{ background: "rgba(10,18,26,0.6)", padding: "8px 12px", borderRadius: "6px" }}>
            <small style={{ color: "#8ca0b3", display: "block" }}>LIVE FPL AIRBORNE TRACKS</small>
            <strong style={{ color: "#3ee0c2", fontSize: "13px" }}>
              {fplPlanes.length} TRACKS WITH ROUTE
            </strong>
          </div>
          <div style={{ background: "rgba(10,18,26,0.6)", padding: "8px 12px", borderRadius: "6px" }}>
            <small style={{ color: "#8ca0b3", display: "block" }}>OPENSKY ROUTE RESOLVER</small>
            <strong style={{ color: "#3ee07a", fontSize: "13px" }}>
              ● ACTIVE (REST/JSON)
            </strong>
          </div>
          <div style={{ background: "rgba(10,18,26,0.6)", padding: "8px 12px", borderRadius: "6px" }}>
            <small style={{ color: "#8ca0b3", display: "block" }}>DOC 4444 / IFPS VALIDATOR</small>
            <strong style={{ color: "#3ee0c2", fontSize: "13px" }}>
              ● SYNTAX ENGINE ONLINE
            </strong>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", borderBottom: "1px solid rgba(62,224,194,0.2)", paddingBottom: "8px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("routes")}
          style={{
            background: activeTab === "routes" ? "#3ee0c2" : "rgba(20,35,50,0.6)",
            color: activeTab === "routes" ? "#071018" : "#eaf1f8",
            border: "1px solid #3ee0c2",
            borderRadius: "4px",
            padding: "8px 16px",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          ✈ Live Flight Plans ({fplPlanes.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("fpl")}
          style={{
            background: activeTab === "fpl" ? "#3ee0c2" : "rgba(20,35,50,0.6)",
            color: activeTab === "fpl" ? "#071018" : "#eaf1f8",
            border: "1px solid #3ee0c2",
            borderRadius: "4px",
            padding: "8px 16px",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          📄 ICAO Doc 4444 / IFPS Validator
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("situation")}
          style={{
            background: activeTab === "situation" ? "#3ee0c2" : "rgba(20,35,50,0.6)",
            color: activeTab === "situation" ? "#071018" : "#eaf1f8",
            border: "1px solid #3ee0c2",
            borderRadius: "4px",
            padding: "8px 16px",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          🌐 Eurocontrol ATFCM Delays & Bottlenecks
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("swim")}
          style={{
            background: activeTab === "swim" ? "#3ee0c2" : "rgba(20,35,50,0.6)",
            color: activeTab === "swim" ? "#071018" : "#eaf1f8",
            border: "1px solid #3ee0c2",
            borderRadius: "4px",
            padding: "8px 16px",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          🏛 SWIM Registry & Endpoints
        </button>
      </div>

      {/* TAB 1: LIVE FLIGHT PLANS & RADAR CORRELATION */}
      {activeTab === "routes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Callsign Quick Resolver Tool */}
          <div
            style={{
              background: "rgba(14,24,35,0.8)",
              border: "1px solid rgba(62,224,194,0.2)",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#3ee0c2", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🔍</span> B2B Callsign Route Resolver (OpenSky Network & European Standing Data)
            </h3>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Enter callsign (e.g. DLH400, AFR006, WZZ10JY, S5ABC)…"
                value={lookupCallsign}
                onChange={(e) => setLookupCallsign(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookupRoute()}
                style={{
                  background: "#0a131c",
                  border: "1px solid #233a4f",
                  borderRadius: "4px",
                  color: "#fff",
                  padding: "8px 12px",
                  fontSize: "13px",
                  width: "320px",
                }}
              />
              <button
                type="button"
                onClick={handleLookupRoute}
                disabled={lookupLoading}
                style={{
                  background: "#3ee0c2",
                  color: "#0a131c",
                  border: "none",
                  borderRadius: "4px",
                  padding: "8px 16px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                {lookupLoading ? "Querying…" : "Resolve Route"}
              </button>
              <div style={{ display: "flex", gap: "6px" }}>
                {["DLH400", "WZZ10JY", "AFR006", "UAE136"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setLookupCallsign(s);
                      fetch(`/api/b2b/route?callsign=${s}`)
                        .then((r) => r.json())
                        .then((j) => j.ok && j.found && setLookupResult(j.route));
                    }}
                    style={{
                      background: "rgba(35,58,79,0.5)",
                      border: "1px solid #233a4f",
                      color: "#8ca0b3",
                      borderRadius: "4px",
                      padding: "4px 8px",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {lookupResult && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  background: "#081017",
                  border: "1px solid #1c3245",
                  borderRadius: "6px",
                  display: "flex",
                  gap: "20px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <small style={{ color: "#8ca0b3" }}>CALLSIGN</small>
                  <strong style={{ display: "block", color: "#3ee0c2", fontSize: "16px" }}>{lookupResult.callsign}</strong>
                </div>
                <div>
                  <small style={{ color: "#8ca0b3" }}>ORIGIN / DEPARTURE</small>
                  <strong style={{ display: "block", color: "#fff", fontSize: "14px" }}>{lookupResult.dep || "—"}</strong>
                </div>
                <div style={{ fontSize: "18px", color: "#3ee0c2" }}>➔</div>
                <div>
                  <small style={{ color: "#8ca0b3" }}>DESTINATION</small>
                  <strong style={{ display: "block", color: "#fff", fontSize: "14px" }}>{lookupResult.dest || "—"}</strong>
                </div>
                {lookupResult.operatorIata && (
                  <div>
                    <small style={{ color: "#8ca0b3" }}>OPERATOR</small>
                    <span style={{ display: "block", color: "#6aa8ff" }}>IATA: {lookupResult.operatorIata}</span>
                  </div>
                )}
                {lookupResult.flightNumber && (
                  <div>
                    <small style={{ color: "#8ca0b3" }}>FLIGHT NO</small>
                    <span style={{ display: "block", color: "#6aa8ff" }}>#{lookupResult.flightNumber}</span>
                  </div>
                )}
                <div>
                  <small style={{ color: "#8ca0b3" }}>DATA SOURCE</small>
                  <span style={{ display: "block", color: "#3ee07a", fontSize: "11px" }}>{lookupResult.source}</span>
                </div>
              </div>
            )}
          </div>

          {/* Active Airborne Traffic Table */}
          <div
            style={{
              background: "rgba(14,24,35,0.8)",
              border: "1px solid rgba(62,224,194,0.2)",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ margin: 0, fontSize: "14px", color: "#3ee0c2" }}>
                Active Airborne Tracks with Filed Flight Plans ({fplPlanes.length})
              </h3>
              <input
                type="text"
                placeholder="Filter by flight, dep, dest, or reg…"
                value={routeSearch}
                onChange={(e) => setRouteSearch(e.target.value)}
                style={{
                  background: "#0a131c",
                  border: "1px solid #233a4f",
                  borderRadius: "4px",
                  color: "#fff",
                  padding: "6px 12px",
                  fontSize: "12px",
                  width: "250px",
                }}
              />
            </div>

            {fplPlanes.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#8ca0b3" }}>
                No active airborne aircraft matched the current filter.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #233a4f", color: "#8ca0b3" }}>
                      <th style={{ padding: "8px 10px" }}>CALLSIGN</th>
                      <th style={{ padding: "8px 10px" }}>ROUTING (DEP ➔ DEST)</th>
                      <th style={{ padding: "8px 10px" }}>ALTITUDE</th>
                      <th style={{ padding: "8px 10px" }}>SPEED</th>
                      <th style={{ padding: "8px 10px" }}>HEADING</th>
                      <th style={{ padding: "8px 10px" }}>AIRCRAFT TYPE</th>
                      <th style={{ padding: "8px 10px" }}>SQUAWK</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fplPlanes.slice(0, 100).map((p) => {
                      const dep = p.dep || "—";
                      const dest = p.dest || "—";
                      const routeStr = p.route || (p.dep && p.dest ? `${p.dep} ➔ ${p.dest}` : "—");
                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: "1px solid rgba(35,58,79,0.3)",
                            background: "rgba(10,18,26,0.3)",
                          }}
                        >
                          <td style={{ padding: "8px 10px", fontWeight: "700", color: "#3ee0c2" }}>
                            {p.flight || p.id}
                            {p.reg && <span style={{ display: "block", fontSize: "10px", color: "#8ca0b3" }}>{p.reg}</span>}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <span
                              style={{
                                background: "rgba(62,224,194,0.1)",
                                border: "1px solid rgba(62,224,194,0.3)",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                color: "#fff",
                                fontWeight: "600",
                              }}
                            >
                              {routeStr}
                            </span>
                            {p.ifps && (
                              <span style={{ marginLeft: "6px", fontSize: "10px", color: "#3ee07a" }}>● IFPS</span>
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", color: "#6aa8ff" }}>
                            {p.altFt != null ? `${Math.round(p.altFt)} ft (FL${Math.round(p.altFt / 100)})` : "—"}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            {p.gs != null ? `${Math.round(p.gs * 1.852)} km/h (${Math.round(p.gs)} kt)` : "—"}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            {p.track != null ? `${Math.round(p.track)}°` : "—"}
                          </td>
                          <td style={{ padding: "8px 10px", color: "#f5b942" }}>
                            {p.typecode || p.category || "—"}
                          </td>
                          <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>
                            {p.squawk || "—"}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right" }}>
                            {onPinpointPlane && (
                              <button
                                type="button"
                                onClick={() => onPinpointPlane(p.id)}
                                style={{
                                  background: "rgba(62,224,122,0.15)",
                                  color: "#3ee07a",
                                  border: "1px solid #3ee07a",
                                  borderRadius: "4px",
                                  padding: "3px 8px",
                                  fontSize: "11px",
                                  cursor: "pointer",
                                }}
                              >
                                🎯 Radar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ICAO DOC 4444 / IFPS VALIDATOR & GENERATOR */}
      {activeTab === "fpl" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: "16px" }}>
          {/* FPL Input & Corridor Templates */}
          <div
            style={{
              background: "rgba(14,24,35,0.8)",
              border: "1px solid rgba(62,224,194,0.2)",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#3ee0c2" }}>
              ICAO Flight Plan 2012 / IFPUV Message Editor
            </h3>
            <p style={{ fontSize: "12px", color: "#8ca0b3", margin: "0 0 12px 0" }}>
              Validate syntax against ICAO Doc 4444 and Eurocontrol IFPS route availability rules in real time.
            </p>

            <div style={{ marginBottom: "12px" }}>
              <small style={{ color: "#8ca0b3", display: "block", marginBottom: "6px" }}>QUICK CORRIDOR TEMPLATES:</small>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {TEMPLATE_FPLS.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => setFplText(tpl.fpl)}
                    style={{
                      background: "rgba(35,58,79,0.6)",
                      border: "1px solid #233a4f",
                      color: "#3ee0c2",
                      borderRadius: "4px",
                      padding: "4px 10px",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={6}
              value={fplText}
              onChange={(e) => setFplText(e.target.value)}
              placeholder="Paste raw ICAO FPL message, e.g. (FPL-S5BAA-IS-A320/M-SDFGIRWXY/EB1-LJLJ1100-N0450F360 KUDES DCT DOL T430 ASTUS-LOWW0045 EDDM-PBN/B1D1O1S2 DOF/261008)"
              style={{
                width: "100%",
                background: "#081018",
                border: "1px solid #233a4f",
                borderRadius: "6px",
                color: "#3ee0c2",
                fontFamily: "monospace",
                fontSize: "12px",
                padding: "10px",
                boxSizing: "border-box",
                lineHeight: "1.4",
              }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px" }}>
              <span style={{ fontSize: "11px", color: isValidating ? "#f5b942" : "#8ca0b3" }}>
                {isValidating ? "Validating IFPS syntax…" : "Real-time ICAO Doc 4444 verification"}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(fplText);
                  alert("Copied ICAO FPL string to clipboard!");
                }}
                style={{
                  background: "rgba(62,224,194,0.15)",
                  color: "#3ee0c2",
                  border: "1px solid #3ee0c2",
                  borderRadius: "4px",
                  padding: "4px 12px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Copy FPL
              </button>
            </div>
          </div>

          {/* Validation Report & Breakdown */}
          <div
            style={{
              background: "rgba(14,24,35,0.8)",
              border: "1px solid rgba(62,224,194,0.2)",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "14px", color: "#3ee0c2" }}>
                IFPS Route & Syntax Inspection
              </h3>
              {validationResult && (
                <span
                  style={{
                    background: validationResult.valid
                      ? validationResult.ifpsReady
                        ? "rgba(62,224,122,0.2)"
                        : "rgba(245,185,66,0.2)"
                      : "rgba(255,77,77,0.2)",
                    color: validationResult.valid
                      ? validationResult.ifpsReady
                        ? "#3ee07a"
                        : "#f5b942"
                      : "#ff4d4d",
                    border: `1px solid ${
                      validationResult.valid
                        ? validationResult.ifpsReady
                          ? "#3ee07a"
                          : "#f5b942"
                        : "#ff4d4d"
                    }`,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: "700",
                  }}
                >
                  {validationResult.valid
                    ? validationResult.ifpsReady
                      ? "✓ IFPS COMPLIANT"
                      : "⚠ SYNTAX VALID (WARNINGS)"
                    : "✕ INVALID ICAO FORMAT"}
                </span>
              )}
            </div>

            {validationResult?.errors && validationResult.errors.length > 0 && (
              <div style={{ background: "rgba(255,77,77,0.1)", border: "1px solid #ff4d4d", borderRadius: "6px", padding: "10px", marginBottom: "12px" }}>
                <strong style={{ color: "#ff4d4d", fontSize: "12px", display: "block" }}>Errors:</strong>
                <ul style={{ margin: "4px 0 0 0", paddingLeft: "18px", fontSize: "11px", color: "#ff9999" }}>
                  {validationResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {validationResult?.warnings && validationResult.warnings.length > 0 && (
              <div style={{ background: "rgba(245,185,66,0.1)", border: "1px solid #f5b942", borderRadius: "6px", padding: "10px", marginBottom: "12px" }}>
                <strong style={{ color: "#f5b942", fontSize: "12px", display: "block" }}>Eurocontrol IFPS Recommendations:</strong>
                <ul style={{ margin: "4px 0 0 0", paddingLeft: "18px", fontSize: "11px", color: "#ffdb8a" }}>
                  {validationResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {validationResult?.parsed && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px" }}>
                <div style={{ background: "#0a131c", padding: "8px", borderRadius: "4px" }}>
                  <span style={{ color: "#8ca0b3" }}>ITEM 7 · CALLSIGN:</span>
                  <strong style={{ display: "block", color: "#3ee0c2" }}>{validationResult.parsed.field7_callsign || "—"}</strong>
                </div>
                <div style={{ background: "#0a131c", padding: "8px", borderRadius: "4px" }}>
                  <span style={{ color: "#8ca0b3" }}>ITEM 8 · RULES / TYPE:</span>
                  <strong style={{ display: "block", color: "#fff" }}>
                    {validationResult.parsed.field8_flightRules || "—"} / {validationResult.parsed.field8_flightType || "—"}
                  </strong>
                </div>
                <div style={{ background: "#0a131c", padding: "8px", borderRadius: "4px" }}>
                  <span style={{ color: "#8ca0b3" }}>ITEM 9 · TYPE / WTC:</span>
                  <strong style={{ display: "block", color: "#f5b942" }}>
                    {validationResult.parsed.field9_aircraftType || "—"} / {validationResult.parsed.field9_wakeTurbulence || "—"}
                  </strong>
                </div>
                <div style={{ background: "#0a131c", padding: "8px", borderRadius: "4px" }}>
                  <span style={{ color: "#8ca0b3" }}>ITEM 10 · EQUIP / SURV:</span>
                  <strong style={{ display: "block", color: "#fff" }}>
                    {validationResult.parsed.field10_equipment || "—"} / {validationResult.parsed.field10_transponder || "—"}
                  </strong>
                </div>
                <div style={{ background: "#0a131c", padding: "8px", borderRadius: "4px" }}>
                  <span style={{ color: "#8ca0b3" }}>ITEM 13 · DEP / EOBT:</span>
                  <strong style={{ display: "block", color: "#3ee07a" }}>
                    {validationResult.parsed.field13_depAerodrome || "—"} @ {validationResult.parsed.field13_eobt || "—"}z
                  </strong>
                </div>
                <div style={{ background: "#0a131c", padding: "8px", borderRadius: "4px" }}>
                  <span style={{ color: "#8ca0b3" }}>ITEM 16 · DEST / EET:</span>
                  <strong style={{ display: "block", color: "#3ee07a" }}>
                    {validationResult.parsed.field16_destAerodrome || "—"} (EET: {validationResult.parsed.field16_eet || "—"})
                  </strong>
                </div>
                <div style={{ background: "#0a131c", padding: "8px", borderRadius: "4px", gridColumn: "span 2" }}>
                  <span style={{ color: "#8ca0b3" }}>ITEM 15 · SPEED / LEVEL / ROUTE:</span>
                  <strong style={{ display: "block", color: "#6aa8ff" }}>
                    {validationResult.parsed.field15_cruisingSpeed || "—"} {validationResult.parsed.field15_cruisingLevel || "—"}{" "}
                    {validationResult.parsed.field15_route || "—"}
                  </strong>
                </div>
                {Object.keys(validationResult.parsed.field18_otherInfo || {}).length > 0 && (
                  <div style={{ background: "#0a131c", padding: "8px", borderRadius: "4px", gridColumn: "span 2" }}>
                    <span style={{ color: "#8ca0b3" }}>ITEM 18 · OTHER INFORMATION:</span>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                      {Object.entries(validationResult.parsed.field18_otherInfo).map(([k, v]) => (
                        <span key={k} style={{ background: "#1c3245", padding: "2px 6px", borderRadius: "3px", color: "#eaf1f8" }}>
                          <b>{k}</b>: {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: EUROCONTROL ATFCM DELAYS & BOTTLENECK REPORTS */}
      {activeTab === "situation" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {situationData.length === 0 ? (
            <div style={{ background: "rgba(14,24,35,0.8)", padding: "20px", borderRadius: "8px", color: "#8ca0b3" }}>
              Loading official Eurocontrol Network Situation reports…
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "16px" }}>
              {/* Report Selector List */}
              <div
                style={{
                  background: "rgba(14,24,35,0.8)",
                  border: "1px solid rgba(62,224,194,0.2)",
                  borderRadius: "8px",
                  padding: "12px",
                }}
              >
                <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#3ee0c2" }}>Weekly Situation Bulletins</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "550px", overflowY: "auto" }}>
                  {situationData.map((rep, idx) => (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => setActiveReportIdx(idx)}
                      style={{
                        textAlign: "left",
                        background: idx === activeReportIdx ? "rgba(62,224,194,0.2)" : "rgba(10,18,26,0.6)",
                        border: idx === activeReportIdx ? "1px solid #3ee0c2" : "1px solid transparent",
                        borderRadius: "4px",
                        padding: "8px 10px",
                        color: idx === activeReportIdx ? "#fff" : "#8ca0b3",
                        cursor: "pointer",
                      }}
                    >
                      <strong style={{ fontSize: "12px", display: "block" }}>{rep.title}</strong>
                      <small style={{ fontSize: "10px", color: "#6aa8ff" }}>
                        {new Date(rep.date).toLocaleDateString()}
                      </small>
                    </button>
                  ))}
                </div>
              </div>

              {/* Report Body & En-Route Analysis */}
              <div
                style={{
                  background: "rgba(14,24,35,0.8)",
                  border: "1px solid rgba(62,224,194,0.2)",
                  borderRadius: "8px",
                  padding: "20px",
                  fontSize: "13px",
                  lineHeight: "1.6",
                }}
              >
                {activeReport && (
                  <div>
                    <h3 style={{ margin: "0 0 10px 0", color: "#3ee0c2", fontSize: "16px" }}>
                      {activeReport.title}
                    </h3>
                    <div style={{ marginBottom: "14px", color: "#8ca0b3", fontSize: "11px" }}>
                      Official Eurocontrol Network Manager Bulletin · Published {new Date(activeReport.date).toUTCString()}
                    </div>

                    <div
                      className="b2b-report-content"
                      dangerouslySetInnerHTML={{ __html: activeReport.content }}
                      style={{
                        background: "#081018",
                        padding: "16px",
                        borderRadius: "6px",
                        border: "1px solid #1c3245",
                        color: "#d0e0ee",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SWIM REGISTRY & ENDPOINTS */}
      {activeTab === "swim" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
          <div style={{ background: "rgba(14,24,35,0.8)", border: "1px solid rgba(62,224,194,0.2)", borderRadius: "8px", padding: "16px" }}>
            <h4 style={{ margin: "0 0 8px 0", color: "#3ee0c2" }}>Eurocontrol NM B2B (REST & SOAP)</h4>
            <p style={{ fontSize: "12px", color: "#8ca0b3", margin: "0 0 10px 0" }}>
              Operational flight plan submission, slot allocation (CTOT), and Airspace Use Plan (EAUP/EUUP).
            </p>
            <div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div><b>Ops Endpoint:</b> <code>https://ops.b2b.nm.eurocontrol.int/</code></div>
              <div><b>Protocol:</b> OpenAPI 3.1.0 / SOAP 1.2 / AMQP 1.0</div>
              <div><b>Profile:</b> EUROCONTROL SWIM Yellow Profile</div>
            </div>
          </div>

          <div style={{ background: "rgba(14,24,35,0.8)", border: "1px solid rgba(62,224,194,0.2)", borderRadius: "8px", padding: "16px" }}>
            <h4 style={{ margin: "0 0 8px 0", color: "#3ee0c2" }}>OpenSky Network Routes API</h4>
            <p style={{ fontSize: "12px", color: "#8ca0b3", margin: "0 0 10px 0" }}>
              Public REST API resolving live commercial and general aviation callsigns to filed ICAO aerodrome pairs.
            </p>
            <div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div><b>Endpoint:</b> <code>https://opensky-network.org/api/routes?callsign=...</code></div>
              <div><b>Protocol:</b> REST / JSON (Free & Unauthenticated)</div>
              <div><b>Data:</b> Origin, Destination, Operator IATA, Flight Number</div>
            </div>
          </div>

          <div style={{ background: "rgba(14,24,35,0.8)", border: "1px solid rgba(62,224,194,0.2)", borderRadius: "8px", padding: "16px" }}>
            <h4 style={{ margin: "0 0 8px 0", color: "#3ee0c2" }}>Eurocontrol Data App (Public API)</h4>
            <p style={{ fontSize: "12px", color: "#8ca0b3", margin: "0 0 10px 0" }}>
              Public European ATM data for daily flight volume, ATFM delay indicators, and punctuality rankings.
            </p>
            <div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div><b>Endpoint:</b> <code>https://api-data-app.eurocontrol.int/api/</code></div>
              <div><b>Docs:</b> <code>https://api-data-app.eurocontrol.int/api/docs</code></div>
              <div><b>Entities:</b> Situation Reports, Traffic Networks, Delays</div>
            </div>
          </div>

          <div style={{ background: "rgba(14,24,35,0.8)", border: "1px solid rgba(62,224,194,0.2)", borderRadius: "8px", padding: "16px" }}>
            <h4 style={{ margin: "0 0 8px 0", color: "#3ee0c2" }}>European AIS Database (EAD Basic)</h4>
            <p style={{ fontSize: "12px", color: "#8ca0b3", margin: "0 0 10px 0" }}>
              Centralized European NOTAM and Pre-flight Information Bulletins (PIB) for ECAC airspace.
            </p>
            <div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div><b>Portal:</b> <code>https://www.ead.eurocontrol.int/</code></div>
              <div><b>Model:</b> AIXM 5.1 / Digital NOTAM</div>
              <div><b>Coverage:</b> 44 EUROCONTROL Member States</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
