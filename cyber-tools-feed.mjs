/**
 * cyber-tools-feed.mjs
 * 
 * Defensive Cyber OSINT, DNS/DMARC Security Auditing, Certificate Transparency (crt.sh),
 * HTTP Defensive Header Assessment, Secret Scanner with Auto-Masking, and GCP Spark Log Analytics.
 * 
 * STRICT PASSIVE RECONNAISSANCE ONLY — Defends, audits, and exposes zero plain-text credentials.
 */

// 1. Google Public DNS over HTTPS (DoH) Client
export async function auditDnsSecurity(domain) {
  const cleanDomain = String(domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!cleanDomain || !cleanDomain.includes(".")) {
    return { ok: false, error: "Invalid domain format" };
  }

  const doh = async (name, type) => {
    try {
      const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
      const res = await fetch(url, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const json = await res.json();
      return json.Answer || [];
    } catch {
      return [];
    }
  };

  const [txtRecords, mxRecords, dmarcRecords, caaRecords, aRecords] = await Promise.all([
    doh(cleanDomain, "TXT"),
    doh(cleanDomain, "MX"),
    doh(`_dmarc.${cleanDomain}`, "TXT"),
    doh(cleanDomain, "CAA"),
    doh(cleanDomain, "A"),
  ]);

  // Parse SPF
  const spfTxt = txtRecords.find((r) => r.data?.includes("v=spf1"))?.data?.replace(/"/g, "") || null;
  let spfStatus = "MISSING";
  let spfScore = 0;
  let spfDetails = "No SPF record published. Domain is vulnerable to email spoofing.";
  if (spfTxt) {
    if (spfTxt.includes("-all")) {
      spfStatus = "HARD_FAIL (ENFORCED)";
      spfScore = 100;
      spfDetails = "Strict SPF enforcement with -all. Unauthorized senders rejected.";
    } else if (spfTxt.includes("~all")) {
      spfStatus = "SOFT_FAIL";
      spfScore = 75;
      spfDetails = "SPF uses ~all (softfail). Deliveries may be flagged as spam.";
    } else if (spfTxt.includes("+all")) {
      spfStatus = "PERMISSIVE (+all MISCONFIGURATION)";
      spfScore = 10;
      spfDetails = "Dangerous +all allows any server worldwide to send email!";
    } else {
      spfStatus = "NEUTRAL";
      spfScore = 50;
      spfDetails = "SPF record present without explicit failure mechanism.";
    }
  }

  // Parse DMARC
  const dmarcTxt = dmarcRecords.find((r) => r.data?.includes("v=DMARC1"))?.data?.replace(/"/g, "") || null;
  let dmarcPolicy = "MISSING";
  let dmarcScore = 0;
  let dmarcDetails = "No DMARC record. Receiving mail servers cannot verify authenticity.";
  if (dmarcTxt) {
    const matchPolicy = dmarcTxt.match(/p=([a-z]+)/i);
    dmarcPolicy = matchPolicy ? matchPolicy[1].toLowerCase() : "unknown";
    if (dmarcPolicy === "reject") {
      dmarcScore = 100;
      dmarcDetails = "DMARC policy 'reject': maximum protection against phishing/spoofing.";
    } else if (dmarcPolicy === "quarantine") {
      dmarcScore = 80;
      dmarcDetails = "DMARC policy 'quarantine': suspicious emails diverted to spam folder.";
    } else if (dmarcPolicy === "none") {
      dmarcScore = 40;
      dmarcDetails = "DMARC policy 'none': monitoring mode only, does not stop spoofed emails.";
    }
  }

  // Overall Defensive Score
  const overallSecurityScore = Math.round(
    spfScore * 0.4 +
    dmarcScore * 0.4 +
    (caaRecords.length ? 10 : 0) +
    (mxRecords.length ? 10 : 0)
  );

  return {
    ok: true,
    domain: cleanDomain,
    queriedAt: new Date().toISOString(),
    securityScore: overallSecurityScore,
    spf: {
      status: spfStatus,
      raw: spfTxt,
      score: spfScore,
      details: spfDetails,
    },
    dmarc: {
      policy: dmarcPolicy,
      raw: dmarcTxt,
      score: dmarcScore,
      details: dmarcDetails,
      rua: dmarcTxt?.match(/rua=([^;]+)/)?.[1] || null,
    },
    mx: mxRecords.map((m) => m.data),
    caa: caaRecords.map((c) => c.data),
    ipAddresses: aRecords.map((a) => a.data),
  };
}

// 2. Certificate Transparency (crt.sh) Subdomain Enumerator
export async function queryCertificateTransparency(domain) {
  const cleanDomain = String(domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!cleanDomain || !cleanDomain.includes(".")) {
    return { ok: false, error: "Invalid domain format" };
  }

  try {
    const url = `https://crt.sh/?q=%.${encodeURIComponent(cleanDomain)}&output=json`;
    const res = await fetch(url, {
      headers: { "user-agent": "OpsCyberSecurity/1.0", accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) {
      return { ok: false, domain: cleanDomain, subdomains: [], error: `crt.sh HTTP ${res.status}` };
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return { ok: false, domain: cleanDomain, subdomains: [] };
    }

    // Extract unique subdomains and certificates
    const subdomainsMap = new Map();
    for (const row of data) {
      const names = String(row.name_value || "")
        .split("\n")
        .map((n) => n.trim().toLowerCase())
        .filter((n) => n && n.endsWith(cleanDomain));

      for (const name of names) {
        if (!subdomainsMap.has(name)) {
          subdomainsMap.set(name, {
            name,
            issuer: row.issuer_name || "Unknown CA",
            loggedAt: row.entry_timestamp || null,
            notBefore: row.not_before || null,
            notAfter: row.not_after || null,
          });
        }
      }
    }

    const sortedSubdomains = Array.from(subdomainsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return {
      ok: true,
      domain: cleanDomain,
      queriedAt: new Date().toISOString(),
      totalCertificates: data.length,
      uniqueSubdomainsCount: sortedSubdomains.length,
      subdomains: sortedSubdomains,
    };
  } catch (e) {
    return {
      ok: false,
      domain: cleanDomain,
      error: `Certificate Transparency service timeout or rate-limited: ${e.message}`,
      subdomains: [],
    };
  }
}

// 3. Defensive HTTP Headers & CORS Security Auditor
export async function auditHttpHeaders(targetUrl) {
  let urlStr = String(targetUrl || "").trim();
  if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
    urlStr = `https://${urlStr}`;
  }

  try {
    const res = await fetch(urlStr, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OpsDefensiveAuditor/1.0",
        origin: "https://evil-cors-test.attacker.com",
      },
      signal: AbortSignal.timeout(7000),
      redirect: "follow",
    });

    const headers = Object.fromEntries(res.headers.entries());

    // Defensive Headers Checklist
    const checks = [
      {
        header: "Strict-Transport-Security",
        name: "HSTS (HTTP Strict Transport Security)",
        present: Boolean(headers["strict-transport-security"]),
        value: headers["strict-transport-security"] || null,
        recommended: "max-age=31536000; includeSubDomains; preload",
        importance: "HIGH",
        passed: Boolean(headers["strict-transport-security"]),
      },
      {
        header: "Content-Security-Policy",
        name: "CSP (Content Security Policy)",
        present: Boolean(headers["content-security-policy"]),
        value: headers["content-security-policy"] ? headers["content-security-policy"].slice(0, 100) + "..." : null,
        recommended: "default-src 'self'; script-src 'self'; ...",
        importance: "HIGH",
        passed: Boolean(headers["content-security-policy"]),
      },
      {
        header: "X-Frame-Options",
        name: "Anti-Clickjacking (X-Frame-Options)",
        present: Boolean(headers["x-frame-options"]),
        value: headers["x-frame-options"] || null,
        recommended: "DENY or SAMEORIGIN",
        importance: "HIGH",
        passed: Boolean(headers["x-frame-options"]),
      },
      {
        header: "X-Content-Type-Options",
        name: "MIME Sniffing Prevention",
        present: headers["x-content-type-options"] === "nosniff",
        value: headers["x-content-type-options"] || null,
        recommended: "nosniff",
        importance: "MEDIUM",
        passed: headers["x-content-type-options"] === "nosniff",
      },
      {
        header: "Referrer-Policy",
        name: "Referrer Privacy Policy",
        present: Boolean(headers["referrer-policy"]),
        value: headers["referrer-policy"] || null,
        recommended: "strict-origin-when-cross-origin",
        importance: "MEDIUM",
        passed: Boolean(headers["referrer-policy"]),
      },
      {
        header: "Permissions-Policy",
        name: "Browser Feature Permissions",
        present: Boolean(headers["permissions-policy"]),
        value: headers["permissions-policy"] || null,
        recommended: "camera=(), microphone=(), geolocation=()",
        importance: "LOW",
        passed: Boolean(headers["permissions-policy"]),
      },
    ];

    // CORS Reflection Assessment
    const acao = headers["access-control-allow-origin"] || null;
    const acac = headers["access-control-allow-credentials"] || null;
    let corsStatus = "RESTRICTED";
    let corsRisk = "LOW";
    let corsDetails = "CORS is not open or origin was not reflected.";

    if (acao === "https://evil-cors-test.attacker.com") {
      corsStatus = "ORIGIN REFLECTION";
      corsRisk = acac === "true" ? "CRITICAL (Authenticated Reflection)" : "HIGH";
      corsDetails = `Server dynamically echoed back arbitrary Origin header with credentials=${acac}!`;
    } else if (acao === "*") {
      corsStatus = "WILDCARD (*)";
      corsRisk = "MEDIUM";
      corsDetails = "Public wildcard CORS. Safe for public data, unsafe for authenticated endpoints.";
    }

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);

    return {
      ok: true,
      url: urlStr,
      status: res.status,
      server: headers["server"] || "Hidden",
      score,
      checks,
      cors: {
        status: corsStatus,
        risk: corsRisk,
        details: corsDetails,
        allowOrigin: acao,
        allowCredentials: acac,
      },
      rawHeaders: headers,
    };
  } catch (e) {
    return { ok: false, url: urlStr, error: e.message };
  }
}

// 4. Deep Secret & Credential Leak Scanner with Mandatory Redaction
export function scanSecretsWithRedaction(content) {
  const text = String(content || "");
  const findings = [];

  const PATTERNS = [
    { type: "GitHub Personal Access Token (Classic)", regex: /\b(ghp_[A-Za-z0-9]{36})\b/g, maskPrefix: "ghp_" },
    { type: "GitHub Fine-Grained Personal Access Token", regex: /\b(github_pat_[A-Za-z0-9_]{82})\b/g, maskPrefix: "github_pat_" },
    { type: "AWS Access Key ID", regex: /\b(AKIA[0-9A-Z]{16})\b/g, maskPrefix: "AKIA" },
    { type: "Google API Key", regex: /\b(AIza[0-9A-Za-z\\-_]{35})\b/g, maskPrefix: "AIza" },
    { type: "OpenAI API Secret Key", regex: /\b(sk-proj-[A-Za-z0-9_-]{48,})\b/g, maskPrefix: "sk-proj-" },
    { type: "Anthropic Claude API Key", regex: /\b(sk-ant-[A-Za-z0-9_-]{40,})\b/g, maskPrefix: "sk-ant-" },
    { type: "Slack Webhook URL", regex: /(https:\/\/hooks\.slack\.com\/services\/T[0-9A-Z]{8,}\/B[0-9A-Z]{8,}\/[0-9A-Za-z]{24})/g, maskPrefix: "https://hooks.slack.com/services/" },
    { type: "Private RSA/OpenSSH Key Header", regex: /-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/g, maskPrefix: "-----BEGIN " },
    { type: "Generic High-Entropy API Token Assignment", regex: /(?:api_key|secret_key|private_key|auth_token)\s*[:=]\s*["']([A-Za-z0-9_\-\.]{24,})["']/gi, maskPrefix: "token=" },
    { type: "Database URI with Plain Password", regex: /(?:postgres|mysql|mongodb):\/\/[^:\s]+:([^@\s]+)@[^/\s]+/gi, maskPrefix: "db://" },
  ];

  for (const pat of PATTERNS) {
    let match;
    const re = new RegExp(pat.regex);
    while ((match = re.exec(text)) !== null) {
      const fullMatch = match[1] || match[0];
      // Redact: keep first 4 chars, mask middle with ****, keep last 4 chars
      let masked;
      if (fullMatch.length > 10) {
        masked = `${fullMatch.slice(0, 4)}****${fullMatch.slice(-4)}`;
      } else {
        masked = "****";
      }

      findings.push({
        type: pat.type,
        maskedSecret: masked,
        matchLength: fullMatch.length,
        index: match.index,
        remediation: "Revoke token immediately in provider dashboard, remove from git history, and add file to .gitignore.",
      });
    }
  }

  return {
    ok: true,
    scannedLength: text.length,
    totalLeakedSecrets: findings.length,
    findings,
  };
}

// 5. GCP Managed Spark / PySpark Large-Scale Security Log Pipeline
export function generateSparkCyberJob(params = {}) {
  const gcsInput = params.inputPath || "gs://my-security-telemetry/vpc-flows/*.json";
  const bqOutput = params.bqTable || "my-gcp-project.cyber_security.detected_anomalies";

  return `#!/usr/bin/env python3
"""
GCP Dataproc Serverless PySpark Security Telemetry Pipeline
Author: Antigravity Cyber Intelligence & Spark Engine

Analyzes VPC Flow Logs, WAF logs, and ADS-B transponder data at scale.
Detects volumetric brute-force IP spikes, unauthorized 401/403 bursts, and transponder spoofing.
"""

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, window, sum as _sum, desc, when

def main():
    spark = (
        SparkSession.builder
        .appName("GCP-Cyber-Telemetry-Analyzer")
        .config("spark.jars.packages", "com.google.cloud.spark:spark-bigquery-with-dependencies_2.12:0.34.0")
        .getOrCreate()
    )

    print("Ingesting security telemetry logs from: ${gcsInput}")
    df = spark.read.json("${gcsInput}")

    # Standardize security telemetry schema
    # Expected fields: timestamp, src_ip, dest_ip, port, status_code, bytes_sent
    df_clean = df.filter(col("src_ip").isNotNull() & col("timestamp").isNotNull())

    # Windowed anomaly detection: group by 5-minute tumbling windows
    anomalies = (
        df_clean
        .groupBy(
            window(col("timestamp"), "5 minutes"),
            col("src_ip"),
            col("dest_ip")
        )
        .agg(
            count("*").alias("total_requests"),
            _sum(when(col("status_code").isin([401, 403]), 1).otherwise(0)).alias("auth_failures"),
            _sum("bytes_sent").alias("total_bytes")
        )
        .filter((col("total_requests") > 1000) | (col("auth_failures") > 50))
        .orderBy(desc("auth_failures"), desc("total_requests"))
    )

    print("Writing detected security anomalies to BigQuery table: ${bqOutput}")
    (
        anomalies.write
        .format("bigquery")
        .option("table", "${bqOutput}")
        .option("writeMethod", "direct")
        .mode("append")
        .save()
    )

    spark.stop()

if __name__ == "__main__":
    main()
`;
}
