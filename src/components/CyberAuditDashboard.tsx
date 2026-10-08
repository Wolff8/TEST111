import React, { useState, useEffect } from "react";

export const CyberAuditDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"dns" | "crtsh" | "headers" | "secrets" | "spark">("dns");

  // DNS State
  const [dnsDomain, setDnsDomain] = useState("sloveniacontrol.si");
  const [dnsResult, setDnsResult] = useState<any>(null);
  const [dnsLoading, setDnsLoading] = useState(false);

  // crt.sh State
  const [crtDomain, setCrtDomain] = useState("fraport-slovenija.si");
  const [crtResult, setCrtResult] = useState<any>(null);
  const [crtLoading, setCrtLoading] = useState(false);

  // Headers State
  const [targetUrl, setTargetUrl] = useState("https://www.sloveniacontrol.si");
  const [headersResult, setHeadersResult] = useState<any>(null);
  const [headersLoading, setHeadersLoading] = useState(false);

  // Secrets Scanner State
  const [secretText, setSecretText] = useState(
    `# Example configuration audit
DATABASE_URL=postgres://admin:superSecretPass123@db.aviation.internal:5432/radar
GITHUB_TOKEN=ghp_ABC1234567890abcdefghijklmnopqrstuv
OPENAI_KEY=sk-proj-9876543210zyxwvutsrqponmlkjihgfedcba12345678901234
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
`
  );
  const [secretResult, setSecretResult] = useState<any>(null);
  const [secretLoading, setSecretLoading] = useState(false);

  // Spark State
  const [sparkInput, setSparkInput] = useState("gs://aviation-telemetry-lake/vpc-flow-logs/*.json");
  const [sparkOutput, setSparkOutput] = useState("aviation_ops.security_analytics.detected_anomalies");
  const [sparkScript, setSparkScript] = useState("");
  const [sparkLoading, setSparkLoading] = useState(false);

  // Trigger default audit on mount
  useEffect(() => {
    handleRunDns("sloveniacontrol.si");
  }, []);

  const handleRunDns = async (domainToTest?: string) => {
    const d = domainToTest || dnsDomain;
    if (!d) return;
    setDnsLoading(true);
    try {
      const res = await fetch(`/api/cyber/dns?domain=${encodeURIComponent(d)}`);
      const json = await res.json();
      setDnsResult(json);
    } catch (e: any) {
      setDnsResult({ ok: false, error: e.message });
    } finally {
      setDnsLoading(false);
    }
  };

  const handleRunCrt = async (domainToTest?: string) => {
    const d = domainToTest || crtDomain;
    if (!d) return;
    setCrtLoading(true);
    try {
      const res = await fetch(`/api/cyber/crtsh?domain=${encodeURIComponent(d)}`);
      const json = await res.json();
      setCrtResult(json);
    } catch (e: any) {
      setCrtResult({ ok: false, error: e.message });
    } finally {
      setCrtLoading(false);
    }
  };

  const handleRunHeaders = async () => {
    if (!targetUrl) return;
    setHeadersLoading(true);
    try {
      const res = await fetch(`/api/cyber/headers?url=${encodeURIComponent(targetUrl)}`);
      const json = await res.json();
      setHeadersResult(json);
    } catch (e: any) {
      setHeadersResult({ ok: false, error: e.message });
    } finally {
      setHeadersLoading(false);
    }
  };

  const handleRunSecretScan = async () => {
    setSecretLoading(true);
    try {
      const res = await fetch("/api/cyber/secrets", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: secretText,
      });
      const json = await res.json();
      setSecretResult(json);
    } catch (e: any) {
      setSecretResult({ ok: false, error: e.message });
    } finally {
      setSecretLoading(false);
    }
  };

  const handleLoadSparkJob = async () => {
    setSparkLoading(true);
    try {
      const res = await fetch(
        `/api/cyber/spark?input=${encodeURIComponent(sparkInput)}&output=${encodeURIComponent(sparkOutput)}`
      );
      const json = await res.json();
      setSparkScript(json.script || "");
    } catch (e: any) {
      setSparkScript(`# Error fetching Spark job: ${e.message}`);
    } finally {
      setSparkLoading(false);
    }
  };

  return (
    <div style={{ padding: "16px", maxWidth: "1400px", margin: "0 auto", color: "#e2e8f0" }}>
      {/* Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))",
          border: "1px solid rgba(56, 189, 248, 0.3)",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "22px",
              fontWeight: 800,
              color: "#38bdf8",
              letterSpacing: "0.5px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            🛡️ DEFENSIVE CYBER OSINT & INFRASTRUCTURE AUDITOR
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#94a3b8" }}>
            Strict Passive Reconnaissance · Google DoH · crt.sh Transparency · Header/CORS Audit · Redacted Secret Scanner · GCP Managed Spark
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 700,
              background: "rgba(16, 185, 129, 0.15)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.4)",
            }}
          >
            ● PASSIVE OSINT DIRECTIVE ACTIVE
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 700,
              background: "rgba(56, 189, 248, 0.15)",
              color: "#38bdf8",
              border: "1px solid rgba(56, 189, 248, 0.4)",
            }}
          >
            SPARK 3.4 TELEMETRY READY
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          paddingBottom: "8px",
          marginBottom: "16px",
          overflowX: "auto",
        }}
      >
        {[
          { id: "dns", label: "🌐 DNS, SPF & DMARC Audit", badge: "DoH" },
          { id: "crtsh", label: "📜 Certificate Transparency", badge: "crt.sh" },
          { id: "headers", label: "🔒 Defensive HTTP & CORS", badge: "API" },
          { id: "secrets", label: "🔑 Leaked Secret Scanner", badge: "Redacted" },
          { id: "spark", label: "⚡ GCP Spark Log Pipeline", badge: "/gcp-spark" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setActiveTab(t.id as any);
              if (t.id === "crtsh" && !crtResult) handleRunCrt();
              if (t.id === "headers" && !headersResult) handleRunHeaders();
              if (t.id === "secrets" && !secretResult) handleRunSecretScan();
              if (t.id === "spark" && !sparkScript) handleLoadSparkJob();
            }}
            style={{
              background: activeTab === t.id ? "rgba(56, 189, 248, 0.2)" : "rgba(30, 41, 59, 0.5)",
              border: `1px solid ${activeTab === t.id ? "#38bdf8" : "rgba(255, 255, 255, 0.1)"}`,
              color: activeTab === t.id ? "#38bdf8" : "#94a3b8",
              padding: "8px 14px",
              borderRadius: "6px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <span>{t.label}</span>
            <span
              style={{
                fontSize: "10px",
                padding: "2px 6px",
                borderRadius: "4px",
                background: "rgba(0,0,0,0.4)",
                color: "#e2e8f0",
              }}
            >
              {t.badge}
            </span>
          </button>
        ))}
      </div>

      {/* TAB 1: DNS, SPF & DMARC DEFENSE */}
      {activeTab === "dns" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "16px" }}>
          {/* Query Bar */}
          <div
            style={{
              gridColumn: "1 / -1",
              background: "rgba(30, 41, 59, 0.6)",
              padding: "12px 16px",
              borderRadius: "6px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#94a3b8" }}>TARGET DOMAIN:</span>
            <input
              type="text"
              value={dnsDomain}
              onChange={(e) => setDnsDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRunDns()}
              placeholder="e.g. sloveniacontrol.si"
              style={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "4px",
                color: "#38bdf8",
                padding: "6px 12px",
                fontSize: "13px",
                fontFamily: "monospace",
                flex: 1,
                minWidth: "220px",
              }}
            />
            <button
              type="button"
              onClick={() => handleRunDns()}
              disabled={dnsLoading}
              style={{
                background: "#0284c7",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "6px 16px",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {dnsLoading ? "QUERYING DOH..." : "AUDIT POSTURE"}
            </button>
            <div style={{ display: "flex", gap: "6px" }}>
              {["sloveniacontrol.si", "fraport-slovenija.si", "eurocontrol.int", "gov.si"].map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => {
                    setDnsDomain(quick);
                    handleRunDns(quick);
                  }}
                  style={{
                    background: "rgba(56, 189, 248, 0.1)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    color: "#38bdf8",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  {quick}
                </button>
              ))}
            </div>
          </div>

          {/* Results Overview */}
          {dnsResult && dnsResult.ok && (
            <>
              {/* Score Card */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#94a3b8" }}>OVERALL DEFENSIVE SCORE</span>
                  <span
                    style={{
                      fontSize: "24px",
                      fontWeight: 900,
                      color:
                        dnsResult.securityScore >= 80 ? "#10b981" : dnsResult.securityScore >= 50 ? "#f59e0b" : "#ef4444",
                    }}
                  >
                    {dnsResult.securityScore}/100
                  </span>
                </div>
                <div
                  style={{
                    height: "8px",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: "4px",
                    margin: "12px 0",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${dnsResult.securityScore}%`,
                      height: "100%",
                      background:
                        dnsResult.securityScore >= 80 ? "#10b981" : dnsResult.securityScore >= 50 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <div style={{ fontSize: "12px", color: "#cbd5e1" }}>
                  Assessed via Google Public DNS over HTTPS (DoH) JSON endpoint at {new Date(dnsResult.queriedAt).toLocaleTimeString()}.
                </div>
              </div>

              {/* SPF Card */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#94a3b8" }}>SPF (SENDER POLICY)</span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: dnsResult.spf.score >= 75 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                      color: dnsResult.spf.score >= 75 ? "#34d399" : "#f87171",
                    }}
                  >
                    {dnsResult.spf.status}
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "#cbd5e1", margin: "10px 0" }}>{dnsResult.spf.details}</p>
                <div
                  style={{
                    background: "#090d16",
                    padding: "8px",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: "#94a3b8",
                    overflowX: "auto",
                  }}
                >
                  {dnsResult.spf.raw || "No SPF record discovered"}
                </div>
              </div>

              {/* DMARC Card */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#94a3b8" }}>DMARC POLICY</span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: dnsResult.dmarc.score >= 80 ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
                      color: dnsResult.dmarc.score >= 80 ? "#34d399" : "#fbbf24",
                    }}
                  >
                    {dnsResult.dmarc.policy.toUpperCase()}
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "#cbd5e1", margin: "10px 0" }}>{dnsResult.dmarc.details}</p>
                <div
                  style={{
                    background: "#090d16",
                    padding: "8px",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: "#94a3b8",
                    overflowX: "auto",
                  }}
                >
                  {dnsResult.dmarc.raw || "No _dmarc record found"}
                </div>
              </div>

              {/* CAA & MX Card */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#94a3b8" }}>CAA & MX INFRASTRUCTURE</span>
                <div style={{ marginTop: "10px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div>
                    <b style={{ color: "#38bdf8" }}>CAA PINNING:</b>{" "}
                    {dnsResult.caa.length ? (
                      <span style={{ color: "#34d399" }}>{dnsResult.caa.join(", ")}</span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>No CAA record (any CA may issue certificates)</span>
                    )}
                  </div>
                  <div>
                    <b style={{ color: "#38bdf8" }}>MAIL SERVERS (MX):</b>
                    <ul style={{ margin: "4px 0 0 16px", padding: 0, color: "#cbd5e1" }}>
                      {dnsResult.mx.map((m: string, i: number) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: CERTIFICATE TRANSPARENCY (crt.sh) */}
      {activeTab === "crtsh" && (
        <div>
          <div
            style={{
              background: "rgba(30, 41, 59, 0.6)",
              padding: "12px 16px",
              borderRadius: "6px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#94a3b8" }}>SEARCH CRT.SH LOGS:</span>
            <input
              type="text"
              value={crtDomain}
              onChange={(e) => setCrtDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRunCrt()}
              placeholder="e.g. fraport-slovenija.si"
              style={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "4px",
                color: "#38bdf8",
                padding: "6px 12px",
                fontSize: "13px",
                fontFamily: "monospace",
                flex: 1,
                minWidth: "220px",
              }}
            />
            <button
              type="button"
              onClick={() => handleRunCrt()}
              disabled={crtLoading}
              style={{
                background: "#0284c7",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "6px 16px",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {crtLoading ? "SEARCHING CRT.SH..." : "ENUMERATE SUBDOMAINS"}
            </button>
          </div>

          {crtResult && crtResult.ok && (
            <div
              style={{
                background: "rgba(15, 23, 42, 0.8)",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  background: "rgba(30, 41, 59, 0.5)",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#38bdf8" }}>
                  DISCOVERED {crtResult.uniqueSubdomainsCount} UNIQUE ASSETS FOR {crtResult.domain.toUpperCase()}
                </span>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  Logged Certificates: {crtResult.totalCertificates}
                </span>
              </div>

              <div style={{ maxHeight: "420px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "rgba(0,0,0,0.3)", textAlign: "left", color: "#94a3b8" }}>
                      <th style={{ padding: "8px 12px" }}>FQDN / SUBDOMAIN</th>
                      <th style={{ padding: "8px 12px" }}>CERTIFICATE ISSUER</th>
                      <th style={{ padding: "8px 12px" }}>VALID UNTIL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crtResult.subdomains.map((sub: any, i: number) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                          background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                        }}
                      >
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#38bdf8" }}>
                          {sub.name}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#cbd5e1" }}>{sub.issuer}</td>
                        <td style={{ padding: "8px 12px", color: "#94a3b8" }}>{sub.notAfter || "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DEFENSIVE HTTP HEADERS & CORS */}
      {activeTab === "headers" && (
        <div>
          <div
            style={{
              background: "rgba(30, 41, 59, 0.6)",
              padding: "12px 16px",
              borderRadius: "6px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#94a3b8" }}>TARGET ENDPOINT:</span>
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRunHeaders()}
              placeholder="https://example.com"
              style={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "4px",
                color: "#38bdf8",
                padding: "6px 12px",
                fontSize: "13px",
                fontFamily: "monospace",
                flex: 1,
                minWidth: "220px",
              }}
            />
            <button
              type="button"
              onClick={() => handleRunHeaders()}
              disabled={headersLoading}
              style={{
                background: "#0284c7",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "6px 16px",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {headersLoading ? "ANALYZING..." : "TEST DEFENSIVE HEADERS"}
            </button>
          </div>

          {headersResult && headersResult.ok && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "16px" }}>
              {/* Score summary */}
              <div
                style={{
                  gridColumn: "1 / -1",
                  background: "rgba(15, 23, 42, 0.8)",
                  padding: "14px 18px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "13px", color: "#94a3b8" }}>TARGET: {headersResult.url}</div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Server: {headersResult.server} · Status: {headersResult.status}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "12px", color: "#94a3b8", display: "block" }}>HEADER COMPLIANCE</span>
                  <span
                    style={{
                      fontSize: "22px",
                      fontWeight: 900,
                      color: headersResult.score >= 70 ? "#10b981" : headersResult.score >= 40 ? "#f59e0b" : "#ef4444",
                    }}
                  >
                    {headersResult.score}%
                  </span>
                </div>
              </div>

              {/* Checks */}
              {headersResult.checks.map((c: any, i: number) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    padding: "14px",
                    borderRadius: "8px",
                    border: `1px solid ${c.passed ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>{c.name}</span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: c.passed ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                        color: c.passed ? "#34d399" : "#f87171",
                      }}
                    >
                      {c.passed ? "PASS" : "MISSING"}
                    </span>
                  </div>
                  <div style={{ marginTop: "8px", fontSize: "11px", fontFamily: "monospace", color: "#94a3b8" }}>
                    {c.value ? c.value : `Recommended: ${c.recommended}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: REDACTED SECRET SCANNER */}
      {activeTab === "secrets" && (
        <div>
          <div
            style={{
              background: "rgba(15, 23, 42, 0.8)",
              padding: "16px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#38bdf8" }}>
                PASTE CONFIG, COMMIT DIFF, OR ENV FILE (ZERO LOGGING · AUTO-REDACTED):
              </span>
              <button
                type="button"
                onClick={handleRunSecretScan}
                disabled={secretLoading}
                style={{
                  background: "#0284c7",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "6px 14px",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                {secretLoading ? "SCANNING..." : "SCAN FOR LEAKS"}
              </button>
            </div>
            <textarea
              value={secretText}
              onChange={(e) => setSecretText(e.target.value)}
              rows={8}
              style={{
                width: "100%",
                background: "#090d16",
                border: "1px solid #334155",
                borderRadius: "4px",
                color: "#e2e8f0",
                fontFamily: "monospace",
                fontSize: "12px",
                padding: "10px",
                resize: "vertical",
              }}
            />
          </div>

          {secretResult && (
            <div
              style={{
                background: "rgba(15, 23, 42, 0.8)",
                padding: "16px",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div style={{ fontSize: "14px", fontWeight: 700, color: secretResult.totalLeakedSecrets > 0 ? "#f87171" : "#34d399" }}>
                {secretResult.totalLeakedSecrets > 0
                  ? `🚨 IDENTIFIED ${secretResult.totalLeakedSecrets} SENSITIVE CREDENTIALS (MASKED)`
                  : "✅ NO SENSITIVE SECRETS DETECTED"}
              </div>

              {secretResult.findings.map((f: any, i: number) => (
                <div
                  key={i}
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b style={{ color: "#ef4444", fontSize: "13px" }}>{f.type}</b>
                    <span style={{ fontFamily: "monospace", color: "#fca5a5", fontSize: "12px", background: "#000", padding: "2px 6px", borderRadius: "3px" }}>
                      {f.maskedSecret}
                    </span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#cbd5e1" }}>
                    <b>Remediation:</b> {f.remediation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: GCP MANAGED SPARK (/gcp-spark) */}
      {activeTab === "spark" && (
        <div
          style={{
            background: "rgba(15, 23, 42, 0.8)",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#38bdf8" }}>
                DATAPROC SERVERLESS PYSPARK SECURITY TELEMETRY JOB
              </span>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#94a3b8" }}>
                Batch analytics engine processing gigabytes of VPC logs, ADS-B telemetry, and HTTP traffic in GCS.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLoadSparkJob}
              disabled={sparkLoading}
              style={{
                background: "#0284c7",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "6px 14px",
                fontWeight: 700,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              REGENERATE PYSPARK CODE
            </button>
          </div>

          <pre
            style={{
              background: "#090d16",
              padding: "16px",
              borderRadius: "6px",
              overflowX: "auto",
              fontSize: "12px",
              fontFamily: "monospace",
              color: "#38bdf8",
              border: "1px solid #1e293b",
              maxHeight: "500px",
            }}
          >
            {sparkScript || "Loading PySpark template..."}
          </pre>
        </div>
      )}
    </div>
  );
};
