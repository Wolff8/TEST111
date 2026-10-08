import http from "node:http";
import https from "node:https";

const SITUATION_URL = "https://api-data-app.eurocontrol.int/api/situation_reports?itemsPerPage=10";
const TRAFFIC_URL = "https://api-data-app.eurocontrol.int/api/traffic_networks?itemsPerPage=10";
const DELAY_URL = "https://api-data-app.eurocontrol.int/api/delay_networks?itemsPerPage=10";
const OPENSKY_ROUTE_URL = "https://opensky-network.org/api/routes?callsign=";

let situationCache = { data: null, expiresAt: 0, fetchedAt: null };
let trafficCache = { data: null, expiresAt: 0, fetchedAt: null };
let delayCache = { data: null, expiresAt: 0, fetchedAt: null };
const routeCache = new Map();

function fetchJsonWithTimeout(urlStr, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const mod = u.protocol === "https:" ? https : http;
      const req = mod.get(
        u,
        {
          headers: {
            "User-Agent": "AeroOps-B2B-Exchange/2.0 (European Aviation Surveillance & FPL Gateway)",
            Accept: "application/json, text/plain, */*",
          },
          timeout: timeoutMs,
        },
        (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} from ${u.hostname}`));
          }
          let raw = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(raw));
            } catch (err) {
              reject(new Error(`JSON parse error from ${u.hostname}: ${err.message}`));
            }
          });
        }
      );
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Timeout (${timeoutMs}ms) requesting ${u.hostname}`));
      });
      req.on("error", (err) => {
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export async function fetchEurocontrolSituation(force = false) {
  const now = Date.now();
  if (!force && situationCache.data && situationCache.expiresAt > now) {
    return { ...situationCache.data, cached: true, fetchedAt: situationCache.fetchedAt };
  }
  try {
    const res = await fetchJsonWithTimeout(SITUATION_URL, 8000);
    situationCache = {
      data: res,
      expiresAt: now + 15 * 60_000,
      fetchedAt: new Date().toISOString(),
    };
    return { ...res, cached: false, fetchedAt: situationCache.fetchedAt };
  } catch (err) {
    if (situationCache.data) {
      return { ...situationCache.data, cached: true, stale: true, error: err.message, fetchedAt: situationCache.fetchedAt };
    }
    throw err;
  }
}

export async function fetchEurocontrolTraffic(force = false) {
  const now = Date.now();
  if (!force && trafficCache.data && trafficCache.expiresAt > now) {
    return { ...trafficCache.data, cached: true, fetchedAt: trafficCache.fetchedAt };
  }
  try {
    const res = await fetchJsonWithTimeout(TRAFFIC_URL, 8000);
    trafficCache = {
      data: res,
      expiresAt: now + 15 * 60_000,
      fetchedAt: new Date().toISOString(),
    };
    return { ...res, cached: false, fetchedAt: trafficCache.fetchedAt };
  } catch (err) {
    if (trafficCache.data) {
      return { ...trafficCache.data, cached: true, stale: true, error: err.message, fetchedAt: trafficCache.fetchedAt };
    }
    throw err;
  }
}

export async function fetchEurocontrolDelays(force = false) {
  const now = Date.now();
  if (!force && delayCache.data && delayCache.expiresAt > now) {
    return { ...delayCache.data, cached: true, fetchedAt: delayCache.fetchedAt };
  }
  try {
    const res = await fetchJsonWithTimeout(DELAY_URL, 8000);
    delayCache = {
      data: res,
      expiresAt: now + 15 * 60_000,
      fetchedAt: new Date().toISOString(),
    };
    return { ...res, cached: false, fetchedAt: delayCache.fetchedAt };
  } catch (err) {
    if (delayCache.data) {
      return { ...delayCache.data, cached: true, stale: true, error: err.message, fetchedAt: delayCache.fetchedAt };
    }
    throw err;
  }
}

export async function fetchLiveRouteForCallsign(callsign) {
  const cs = String(callsign || "").trim().toUpperCase();
  if (!cs || cs.length < 3 || cs.length > 8) return null;

  const now = Date.now();
  const cached = routeCache.get(cs);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  // 1. Try OpenSky route API
  try {
    const data = await fetchJsonWithTimeout(`${OPENSKY_ROUTE_URL}${encodeURIComponent(cs)}`, 5000);
    if (data && data.route && Array.isArray(data.route) && data.route.length >= 2) {
      const rec = {
        callsign: data.callsign || cs,
        dep: data.route[0],
        dest: data.route[data.route.length - 1],
        routeWaypoints: data.route,
        operatorIata: data.operatorIata || null,
        flightNumber: data.flightNumber || null,
        source: "OpenSky Network B2B Routes",
        updateTime: data.updateTime || new Date().toISOString(),
      };
      routeCache.set(cs, { data: rec, expiresAt: now + 60 * 60_000 });
      return rec;
    }
  } catch {
    // Fall back to VRS standing data or null
  }

  // 2. Try VRS standing data
  try {
    const vrsData = await fetchJsonWithTimeout(`https://vrs-standing-data.adsb.lol/routes/${encodeURIComponent(cs)}.json`, 4000);
    if (vrsData && (vrsData.dep || vrsData.dest)) {
      const rec = {
        callsign: cs,
        dep: vrsData.dep || vrsData.origin || null,
        dest: vrsData.dest || vrsData.destination || null,
        routeWaypoints: vrsData.route ? [vrsData.dep, ...vrsData.route, vrsData.dest] : [vrsData.dep, vrsData.dest],
        operatorIata: vrsData.operator || null,
        flightNumber: vrsData.flightNumber || null,
        source: "VRS Standing Routes",
        updateTime: new Date().toISOString(),
      };
      routeCache.set(cs, { data: rec, expiresAt: now + 60 * 60_000 });
      return rec;
    }
  } catch {
    // route not available in public standing registry
  }

  return null;
}

/**
 * Validate and parse ICAO Doc 4444 / IFPS Flight Plan (2012 format)
 */
export function validateIcaoFlightPlan(rawText) {
  const text = String(rawText || "").trim();
  const errors = [];
  const warnings = [];
  const parsed = {
    messageType: "FPL",
    field7_callsign: null,
    field8_flightRules: null,
    field8_flightType: null,
    field9_numberOfAircraft: 1,
    field9_aircraftType: null,
    field9_wakeTurbulence: null,
    field10_equipment: null,
    field10_transponder: null,
    field13_depAerodrome: null,
    field13_eobt: null,
    field15_cruisingSpeed: null,
    field15_cruisingLevel: null,
    field15_route: null,
    field16_destAerodrome: null,
    field16_eet: null,
    field16_altn1: null,
    field16_altn2: null,
    field18_otherInfo: {},
  };

  if (!text) {
    return {
      valid: false,
      errors: ["Empty flight plan input. Please provide standard ICAO FPL text."],
      warnings: [],
      parsed,
      ifpsReady: false,
    };
  }

  // Normalize parentheses and extract inner message
  let clean = text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
  if (clean.startsWith("(")) {
    clean = clean.substring(1);
  }
  if (clean.endsWith(")")) {
    clean = clean.substring(0, clean.length - 1);
  }

  // Split into hyphenated ICAO Doc 4444 fields
  const fields = clean.split("-").map((s) => s.trim()).filter(Boolean);

  if (fields.length < 6) {
    errors.push("Insufficient ICAO fields. Expected format: (FPL-CALLSIGN-RULES/TYPE-TYPE/WTC-EQUIP/SURV-DEP/EOBT-SPEED/LEVEL/ROUTE-DEST/EET/ALTN-OTHER)");
  }

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];

    // Field 3: Message Type (FPL)
    if (i === 0 && /^FPL$/i.test(f)) {
      parsed.messageType = "FPL";
      continue;
    }

    // Field 7: Aircraft ID
    if (!parsed.field7_callsign && /^[A-Z0-9]{2,7}$/i.test(f)) {
      parsed.field7_callsign = f.toUpperCase();
      continue;
    }

    // Field 8: Flight Rules & Type of Flight (e.g., IS, VN, YS, ZM)
    if (!parsed.field8_flightRules && /^[IVYZ][SNGMX]$/i.test(f)) {
      parsed.field8_flightRules = f[0].toUpperCase();
      parsed.field8_flightType = f[1].toUpperCase();
      continue;
    }

    // Field 9: Aircraft Type & Wake Turbulence (e.g., A320/M, B738/M, C172/L, A388/J)
    if (!parsed.field9_aircraftType && f.includes("/")) {
      const parts = f.split("/");
      if (parts.length === 2 && /^[A-Z0-9]{2,4}$/i.test(parts[0]) && /^[LMHJ]$/i.test(parts[1])) {
        parsed.field9_aircraftType = parts[0].toUpperCase();
        parsed.field9_wakeTurbulence = parts[1].toUpperCase();
        continue;
      }
    }

    // Field 10: Equipment & Surveillance (e.g., SDFGIRWXY/EB1)
    if (!parsed.field10_equipment && f.includes("/")) {
      const parts = f.split("/");
      if (parts.length === 2) {
        parsed.field10_equipment = parts[0].toUpperCase();
        parsed.field10_transponder = parts[1].toUpperCase();
        continue;
      }
    }

    // Field 13: Departure & EOBT (e.g., LJLJ1200 or LOWW0930)
    if (!parsed.field13_depAerodrome && /^[A-Z]{4}[0-9]{4}$/i.test(f)) {
      parsed.field13_depAerodrome = f.substring(0, 4).toUpperCase();
      parsed.field13_eobt = f.substring(4, 8);
      continue;
    }

    // Field 15: Speed, Level & Route (e.g., N0450F350 KUDES DCT DOL T430 ASTUS)
    if (!parsed.field15_cruisingSpeed && (/^[NK][0-9]{4}[FA][0-9]{3}/i.test(f) || /^M[0-9]{3}[FA][0-9]{3}/i.test(f) || /^[NK][0-9]{4}VFR/i.test(f))) {
      const match = f.match(/^([NK][0-9]{4}|M[0-9]{3})([FA][0-9]{3}|VFR)\s*(.*)$/i);
      if (match) {
        parsed.field15_cruisingSpeed = match[1].toUpperCase();
        parsed.field15_cruisingLevel = match[2].toUpperCase();
        parsed.field15_route = match[3] ? match[3].trim().toUpperCase() : "DCT";
        continue;
      }
    }

    // Field 16: Destination, EET & Alternates (e.g., LOWW0045 EDDM or LOWW0045)
    if (!parsed.field16_destAerodrome && /^[A-Z]{4}[0-9]{4}/i.test(f)) {
      const match = f.match(/^([A-Z]{4})([0-9]{4})(?:\s+([A-Z]{4}))?(?:\s+([A-Z]{4}))?$/i);
      if (match) {
        parsed.field16_destAerodrome = match[1].toUpperCase();
        parsed.field16_eet = match[2];
        parsed.field16_altn1 = match[3] ? match[3].toUpperCase() : null;
        parsed.field16_altn2 = match[4] ? match[4].toUpperCase() : null;
        continue;
      }
    }

    // Field 18: Other Information
    if (f.startsWith("PBN/") || f.startsWith("NAV/") || f.startsWith("DOF/") || f.startsWith("REG/") || f.startsWith("EET/") || f.startsWith("OPR/")) {
      const tokens = f.split(/\s+/);
      for (const tok of tokens) {
        const slashIdx = tok.indexOf("/");
        if (slashIdx > 0) {
          const key = tok.substring(0, slashIdx).toUpperCase();
          const val = tok.substring(slashIdx + 1).toUpperCase();
          parsed.field18_otherInfo[key] = val;
        }
      }
    }
  }

  // Syntactic Validation Rules
  if (!parsed.field7_callsign) {
    errors.push("Field 7 (Aircraft Identification) is missing or invalid.");
  }
  if (!parsed.field8_flightRules) {
    errors.push("Field 8 (Flight Rules: I=IFR, V=VFR, Y=IFR then VFR, Z=VFR then IFR) is missing.");
  }
  if (!parsed.field9_aircraftType) {
    errors.push("Field 9 (Type of Aircraft, e.g. A320, B738, C172) is missing.");
  }
  if (!parsed.field9_wakeTurbulence) {
    errors.push("Field 9 (Wake Turbulence Category: L=Light, M=Medium, H=Heavy, J=Super) is missing.");
  }
  if (!parsed.field10_equipment) {
    errors.push("Field 10 (Radio/Navigation Equipment) is missing.");
  }
  if (!parsed.field10_transponder) {
    errors.push("Field 10 (Surveillance Equipment / Transponder) is missing.");
  }
  if (!parsed.field13_depAerodrome) {
    errors.push("Field 13 (Departure Aerodrome 4-letter ICAO code) is missing.");
  }
  if (!parsed.field13_eobt) {
    errors.push("Field 13 (EOBT - Estimated Off-Block Time, HHMM format) is missing.");
  }
  if (!parsed.field15_cruisingSpeed) {
    errors.push("Field 15 (Cruising Speed, e.g. N0450 for knots or K0830 for km/h) is missing.");
  }
  if (!parsed.field15_cruisingLevel) {
    errors.push("Field 15 (Cruising Level, e.g. F350, A090, or VFR) is missing.");
  }
  if (!parsed.field16_destAerodrome) {
    errors.push("Field 16 (Destination Aerodrome 4-letter ICAO code) is missing.");
  }
  if (!parsed.field16_eet) {
    errors.push("Field 16 (Total Estimated Elapsed Time, HHMM format) is missing.");
  }

  // IFPS Eurocontrol Specific Guidance
  if (parsed.field8_flightRules === "I") {
    if (!parsed.field18_otherInfo["PBN"]) {
      warnings.push("IFPS Recommendation: PBN capability token missing in Field 18 (e.g. PBN/B1D1O1S2 for European B-RNAV/RNP1 airspace).");
    }
    if (!parsed.field18_otherInfo["DOF"]) {
      warnings.push("IFPS Recommendation: DOF/YYMMDD (Date of Flight) is strongly recommended in European airspace.");
    }
  }

  const valid = errors.length === 0;
  const ifpsReady = valid && warnings.length === 0;

  return {
    valid,
    errors,
    warnings,
    parsed,
    ifpsReady,
    rawText: text,
  };
}

export function getB2BStatus() {
  return {
    situation: {
      cached: !!situationCache.data,
      expiresAt: situationCache.expiresAt,
      fetchedAt: situationCache.fetchedAt,
      upstream: SITUATION_URL,
    },
    traffic: {
      cached: !!trafficCache.data,
      expiresAt: trafficCache.expiresAt,
      fetchedAt: trafficCache.fetchedAt,
      upstream: TRAFFIC_URL,
    },
    delays: {
      cached: !!delayCache.data,
      expiresAt: delayCache.expiresAt,
      fetchedAt: delayCache.fetchedAt,
      upstream: DELAY_URL,
    },
    routeCacheSize: routeCache.size,
  };
}
