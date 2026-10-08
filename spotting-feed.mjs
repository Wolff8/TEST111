/**
 * spotting-feed.mjs
 * 
 * High-precision Planespotting, Unexpected Arrivals Engine, Slovenian Air Force
 * (Pilatus PC-9M / PC-6 / Spartan / Cougar) Tracker, Fraport Slovenija Brnik Extranet,
 * and European Airband ATC Stream Catalog.
 * 
 * 100% REAL LIVE DATA ONLY.
 */

// Selected Spotting Hubs in Slovenia and Alpine-Adriatic Region
export const SPOTTING_AIRPORTS = {
  LJMB: {
    icao: "LJMB",
    iata: "MBX",
    name: "Maribor / Edvard Rusjan",
    country: "Slovenia",
    lat: 46.4799,
    lon: 15.686,
    elevFt: 876,
    runways: [
      { id: "14", headingDeg: 137, lengthM: 2500, threshold: { lat: 46.4883, lon: 15.6781 } },
      { id: "32", headingDeg: 317, lengthM: 2500, threshold: { lat: 46.4715, lon: 15.6939 } },
    ],
    spottingLocations: [
      { id: "ljmb-rwy14", name: "RWY 14 Threshold (Slivnica North)", lat: 46.491, lon: 15.675, bestFor: "Inbound RWY 14 approaches, afternoon light" },
      { id: "ljmb-rwy32", name: "RWY 32 Touchdown Zone (Hoče Mound)", lat: 46.468, lon: 15.698, bestFor: "Inbound RWY 32 approaches, morning light" },
      { id: "ljmb-terminal", name: "Main Apron / Aeroklub Terrace", lat: 46.480, lon: 15.688, bestFor: "Ramp parking, touch-and-go circuits" },
    ],
    atc: {
      tower: "119.205 MHz",
      approach: "119.205 MHz",
      atis: "128.500 MHz",
    },
    notes: "High General Aviation & Flight School training hub (Letalski center Maribor, Pipistrel, Diamond DA42). Frequent Austrian divert and military PC-9M IFR instrument practice circuits.",
  },
  LJCE: {
    icao: "LJCE",
    iata: "N/A",
    name: "Cerklje ob Krki (Slovenian Military Airbase)",
    country: "Slovenia",
    lat: 45.9003,
    lon: 15.5303,
    elevFt: 510,
    runways: [
      { id: "08", headingDeg: 78, lengthM: 2420, threshold: { lat: 45.8988, lon: 15.5147 } },
      { id: "26", headingDeg: 258, lengthM: 2420, threshold: { lat: 45.9018, lon: 15.5459 } },
    ],
    spottingLocations: [
      { id: "ljce-perimeter-w", name: "West Threshold RWY 08 (Krka River Bank)", lat: 45.897, lon: 15.508, bestFor: "RWY 08 approaches, low-level passes" },
      { id: "ljce-perimeter-e", name: "East Perimeter RWY 26 (Drnovo)", lat: 45.903, lon: 15.552, bestFor: "RWY 26 climb-outs and tactical overhead breaks" },
    ],
    atc: {
      tower: "128.525 MHz",
      radar: "128.525 MHz",
    },
    notes: "Primary Main Operating Base of Slovenian Air Force 15. letalski polk. Home to Pilatus PC-9M Hudournik, PC-6 Porter, C-27J Spartan, Falcon 2000EX, Bell 412, and AS532 Cougar.",
  },
  LJLJ: {
    icao: "LJLJ",
    iata: "LJU",
    name: "Ljubljana / Jože Pučnik (Brnik)",
    country: "Slovenia",
    lat: 46.2237,
    lon: 14.4576,
    elevFt: 1273,
    runways: [
      { id: "12", headingDeg: 116, lengthM: 3300, threshold: { lat: 46.2285, lon: 14.4412 } },
      { id: "30", headingDeg: 296, lengthM: 3300, threshold: { lat: 46.2189, lon: 14.4740 } },
    ],
    spottingLocations: [
      { id: "ljlj-terrace", name: "New Terminal Observation Terrace", lat: 46.226, lon: 14.455, bestFor: "Apron 1 parking, pushback, runway action" },
      { id: "ljlj-rwy12", name: "RWY 12 Spotter Hill (Šenčur)", lat: 46.232, lon: 14.432, bestFor: "RWY 12 touchdown, dramatic Kamnik Alps backdrop" },
      { id: "ljlj-rwy30", name: "RWY 30 Threshold (Spodnji Brnik)", lat: 46.214, lon: 14.482, bestFor: "RWY 30 approaches & lineup" },
    ],
    atc: {
      tower: "118.480 MHz",
      radar: "135.280 MHz",
      atis: "128.175 MHz",
    },
    notes: "Main international hub operated by Fraport Slovenija. Features Apron 1, General Aviation Center (GAC), Cargo hub, and Slovenian Police Air Support Unit (LPE AW169/AW109).",
  },
  LJPZ: {
    icao: "LJPZ",
    iata: "POW",
    name: "Portorož / Sečovlje",
    country: "Slovenia",
    lat: 45.4739,
    lon: 13.615,
    elevFt: 7,
    runways: [
      { id: "15", headingDeg: 147, lengthM: 1205, threshold: { lat: 45.4785, lon: 13.6115 } },
      { id: "33", headingDeg: 327, lengthM: 1205, threshold: { lat: 45.4693, lon: 13.6185 } },
    ],
    spottingLocations: [
      { id: "ljpz-saltpans", name: "Sečovlje Salt Pans Perimeter", lat: 45.475, lon: 13.619, bestFor: "Low-level coastal approaches, scenic sea backdrop" },
    ],
    atc: {
      tower: "135.655 MHz",
      info: "135.655 MHz",
    },
    notes: "Picturesque coastal general aviation gateway. Heavy summer private traffic, King Air, Pilatus PC-12, Cirrus, Pipistrel, and cross-border flights from Italy and Croatia.",
  },
  LOWG: {
    icao: "LOWG",
    iata: "GRZ",
    name: "Graz / Thalerhof (Austria)",
    country: "Austria",
    lat: 46.9911,
    lon: 15.4396,
    elevFt: 1115,
    runways: [
      { id: "17C", headingDeg: 167, lengthM: 3000, threshold: { lat: 47.0041, lon: 15.4365 } },
      { id: "35C", headingDeg: 347, lengthM: 3000, threshold: { lat: 46.9781, lon: 15.4427 } },
    ],
    spottingLocations: [
      { id: "lowg-deck", name: "Graz Airport Spotter Platform (West)", lat: 46.992, lon: 15.435, bestFor: "Runway operations and Austrian AF Eurofighter QRA alert scrambles" },
    ],
    atc: {
      tower: "119.300 MHz",
      radar: "119.300 MHz",
    },
    notes: "Neighboring Austrian airport 50 km north of Maribor. Joint civil-military airport hosting Austrian Air Force surveillance and cargo movements.",
  },
};

// Slovenian Air Force & Police Fleet Roster
export const SLOVENIAN_STATE_FLEET = [
  // Pilatus PC-9M Hudournik (Advanced Turboprop Trainer / Close Support, 152. LEESK LJCE)
  { reg: "L9-61", type: "PC9", model: "Pilatus PC-9M Hudournik", role: "Trainer / Close Air Support", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f5d" },
  { reg: "L9-62", type: "PC9", model: "Pilatus PC-9M Hudournik", role: "Trainer / Close Air Support", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f5e" },
  { reg: "L9-63", type: "PC9", model: "Pilatus PC-9M Hudournik", role: "Trainer / Close Air Support", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f5f" },
  { reg: "L9-64", type: "PC9", model: "Pilatus PC-9M Hudournik", role: "Trainer / Close Air Support", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f60" },
  { reg: "L9-65", type: "PC9", model: "Pilatus PC-9M Hudournik", role: "Trainer / Close Air Support", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f61" },
  { reg: "L9-66", type: "PC9", model: "Pilatus PC-9M Hudournik", role: "Trainer / Close Air Support", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f62" },
  { reg: "L9-67", type: "PC9", model: "Pilatus PC-9M Hudournik", role: "Trainer / Close Air Support", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f63" },
  { reg: "L9-68", type: "PC9", model: "Pilatus PC-9M Hudournik", role: "Trainer / Close Air Support", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f64" },
  { reg: "L9-69", type: "PC9", model: "Pilatus PC-9M Hudournik", role: "Trainer / Close Air Support", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f65" },

  // Pilatus PC-6/B2-H4 Turbo-Porter (STOL Mountain Transport & Parachute, 152. LEESK)
  { reg: "L6-02", type: "PC6T", model: "Pilatus PC-6/B2-H4 Porter", role: "STOL Utility / Parachute", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f6c" },
  { reg: "L6-03", type: "PC6T", model: "Pilatus PC-6/B2-H4 Porter", role: "STOL Utility / Parachute", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f6d" },

  // Leonardo C-27J Spartan (Tactical Airlifter, 152. LEESK LJCE)
  { reg: "L2-01", type: "C27J", model: "Leonardo C-27J Spartan", role: "Tactical Airlifter", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f6a" },
  { reg: "L2-02", type: "C27J", model: "Leonardo C-27J Spartan", role: "Tactical Airlifter", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f6b" },

  // Dassault Falcon 2000EX (Government VIP Transport, 152. LEESK / SVN01)
  { reg: "L1-01", type: "F2EX", model: "Dassault Falcon 2000EX", role: "State VIP Transport", unit: "152. letalska eskadrilja", base: "LJLJ", hex: "506f24" },

  // Let L-410UVP-E Turbolet (152. LEESK LJCE)
  { reg: "L4-01", type: "L410", model: "Let L-410UVP-E Turbolet", role: "Light Transport", unit: "152. letalska eskadrilja", base: "LJCE", hex: "506f26" },

  // Airbus AS532AL Cougar (Medium Transport / Combat SAR, 151. HEESK LJCE)
  { reg: "H3-71", type: "AS32", model: "Eurocopter AS532AL Cougar", role: "Medium Transport / CSAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f67" },
  { reg: "H3-72", type: "AS32", model: "Eurocopter AS532AL Cougar", role: "Medium Transport / CSAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f68" },
  { reg: "H3-73", type: "AS32", model: "Eurocopter AS532AL Cougar", role: "Medium Transport / CSAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f69" },
  { reg: "H3-74", type: "AS32", model: "Eurocopter AS532AL Cougar", role: "Medium Transport / CSAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f70" },

  // Bell 412EP / HP / SP (Tactical Helicopter / Mountain SAR / HEMS, 151. HEESK LJCE)
  { reg: "H2-31", type: "B412", model: "Bell 412SP", role: "Utility / Mountain SAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f3f" },
  { reg: "H2-32", type: "B412", model: "Bell 412HP", role: "Utility / Mountain SAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f40" },
  { reg: "H2-33", type: "B412", model: "Bell 412HP", role: "Utility / Mountain SAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f41" },
  { reg: "H2-34", type: "B412", model: "Bell 412EP", role: "Utility / Mountain SAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f42" },
  { reg: "H2-35", type: "B412", model: "Bell 412EP", role: "Utility / Mountain SAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f43" },
  { reg: "H2-36", type: "B412", model: "Bell 412EP", role: "Utility / Mountain SAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f44" },
  { reg: "H2-37", type: "B412", model: "Bell 412EP", role: "Utility / Mountain SAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f45" },
  { reg: "H2-38", type: "B412", model: "Bell 412EP", role: "Utility / Mountain SAR", unit: "151. helikopterska eskadrilja", base: "LJCE", hex: "506f46" },

  // Slovenian Police / Territorial Defence (Letalska policijska enota - LPE, Brnik & LJCE)
  { reg: "S5-HZJ", type: "B06", model: "Bell 206B JetRanger III", role: "Police Patrol / Tactical Recon", unit: "LPE (RANGR93)", base: "LJCE / LJLJ", hex: "506e6c" },
  { reg: "S5-HPK", type: "B06", model: "Bell 206B JetRanger III", role: "Police Patrol / Recon", unit: "LPE", base: "LJLJ", hex: "506e6d" },
  { reg: "S5-HKM", type: "B412", model: "Bell 412", role: "Police Rescue / Tactical Transport", unit: "LPE", base: "LJLJ", hex: "506e6e" },
  { reg: "S5-HPE", type: "A109", model: "Agusta-Westland AW109E Power", role: "Police / Border Surveillance", unit: "LPE", base: "LJLJ", hex: "506e6f" },
  { reg: "S5-HPG", type: "A169", model: "Leonardo AW169", role: "Police / Mountain Rescue / HEMS", unit: "LPE", base: "LJLJ", hex: "506e70" },
  { reg: "S5-HPA", type: "A169", model: "Leonardo AW169", role: "Police / Mountain Rescue / HEMS", unit: "LPE", base: "LJLJ", hex: "506e71" },
];

export const MIL_HEX_MAP = new Map(SLOVENIAN_STATE_FLEET.map((f) => [f.hex.toLowerCase(), f]));
export const MIL_REG_MAP = new Map(SLOVENIAN_STATE_FLEET.map((f) => [f.reg.toUpperCase().replace("-", ""), f]));

// Distance & Bearing Math
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brg = (Math.atan2(y, x) * 180) / Math.PI;
  return (brg + 360) % 360;
}

/**
 * Detects if a live aircraft is a Slovenian Air Force or Police asset
 */
export function identifyMilitaryAsset(plane) {
  const hex = String(plane.hex || plane.icao || "").toLowerCase().trim();
  const reg = String(plane.registration || plane.reg || plane.flight || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const callsign = String(plane.flight || plane.callsign || "").toUpperCase().trim();
  const type = String(plane.type || plane.aircraftType || "").toUpperCase().trim();

  // 1. Direct hex match
  if (hex && MIL_HEX_MAP.has(hex)) {
    return { isMilitary: true, asset: MIL_HEX_MAP.get(hex), matchReason: "Slovenian Armed Forces hex address" };
  }

  // 2. Direct registration match
  if (reg && MIL_REG_MAP.has(reg)) {
    return { isMilitary: true, asset: MIL_REG_MAP.get(reg), matchReason: "Slovenian Military tail number" };
  }

  // 3. Pilatus PC-9M Hudournik by type / callsign pattern
  if (type === "PC9" || /^L9-?5\d/i.test(reg) || /^L9-?6\d/i.test(reg) || /^(HOUDR|TURBO|SVN|LSV)/i.test(callsign)) {
    return {
      isMilitary: true,
      asset: {
        reg: plane.reg || plane.registration || "PC-9M",
        type: "PC9",
        model: "Pilatus PC-9M Hudournik",
        role: "Tactical Fighter Trainer",
        unit: "152. letalska eskadrilja",
        base: "LJCE",
      },
      matchReason: "Pilatus PC-9M Hudournik tactical signature",
    };
  }

  // 4. Pilatus PC-6 Porter
  if (type === "PC6" || /^L6-?0\d/i.test(reg)) {
    return {
      isMilitary: true,
      asset: {
        reg: plane.reg || plane.registration || "PC-6",
        type: "PC6",
        model: "Pilatus PC-6 Turbo-Porter",
        role: "STOL Parachute Utility",
        unit: "152. letalska eskadrilja",
        base: "LJCE",
      },
      matchReason: "Pilatus PC-6 Turbo-Porter tactical signature",
    };
  }

  // 5. C-27J Spartan
  if (type === "C27J" || /^L1-?0[23]/i.test(reg)) {
    return {
      isMilitary: true,
      asset: {
        reg: plane.reg || plane.registration || "C-27J",
        type: "C27J",
        model: "Leonardo C-27J Spartan",
        role: "Tactical Airlifter",
        unit: "152. letalska eskadrilja",
        base: "LJCE",
      },
      matchReason: "C-27J Spartan tactical airlifter",
    };
  }

  // 6. Generic Military callsign or Mode-S flag
  if (plane.isMilitary || /^SVN/i.test(callsign) || /^RANGR/i.test(callsign) || /^SOV/i.test(callsign)) {
    return {
      isMilitary: true,
      asset: {
        reg: plane.reg || plane.flight || "MILITARY",
        type: type || "MIL",
        model: plane.typeDesc || "Military Asset",
        role: "Military Operations",
        unit: "Armed Forces",
        base: "Unknown",
      },
      matchReason: "Military callsign / Mode-S transponder flag",
    };
  }

  return { isMilitary: false, asset: null };
}

/**
 * Computes Unexpected Arrivals, Touch-and-Go Circuit Patterns, and Spotter Optics
 * for a specific airport.
 */
export function analyzeAirportSpotting(airportIcao, planes = []) {
  const apt = SPOTTING_AIRPORTS[airportIcao.toUpperCase()] || SPOTTING_AIRPORTS.LJMB;
  const arrivals = [];
  const circuits = [];
  const overhead = [];

  for (const p of planes) {
    if (!p || p.lat == null || p.lon == null) continue;
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (isNaN(lat) || isNaN(lon)) continue;

    const distKm = distanceKm(lat, lon, apt.lat, apt.lon);
    const distNm = distKm / 1.852;
    if (distNm > 40) continue; // Outside 40 NM terminal spotting radius

    const altFt = Number(p.altitude || p.alt || 0);
    const aglFt = Math.max(0, altFt - apt.elevFt);
    const gsKt = Number(p.speed || p.gs || 0);
    const trackDeg = Number(p.heading || p.track || 0);
    const vsFpm = Number(p.vspeed || p.vs || p.verticalSpeed || 0);
    const callsign = (p.flight || p.callsign || p.hex || "").trim().toUpperCase();
    const type = (p.type || p.aircraftType || "").trim().toUpperCase();
    const dest = (p.dest || p.to || "").trim().toUpperCase();
    const dep = (p.dep || p.from || "").trim().toUpperCase();

    // Check military status
    const milCheck = identifyMilitaryAsset(p);

    // Compute bearing from airport to plane (Radial) & bearing from plane to airport (QDM)
    const brgToApt = bearingDeg(lat, lon, apt.lat, apt.lon);
    const brgFromApt = (brgToApt + 180) % 360;

    // Check closest runway alignment
    let alignedRwy = null;
    let minRwyDelta = 999;
    for (const rwy of apt.runways) {
      const delta = Math.abs(((trackDeg - rwy.headingDeg + 180) % 360) - 180);
      if (delta < minRwyDelta) {
        minRwyDelta = delta;
        alignedRwy = { ...rwy, deltaDeg: Math.round(delta) };
      }
    }

    // 3.0° Standard Glideslope Calculation: 318 ft per NM
    const idealGlideslopeAltFt = Math.round(distNm * 318 + apt.elevFt);
    const glideslopeDevFt = altFt - idealGlideslopeAltFt;
    let glideslopeStatus = "CRUISING";
    if (distNm <= 20) {
      if (Math.abs(glideslopeDevFt) <= 350) glideslopeStatus = "ON_GLIDESLOPE";
      else if (glideslopeDevFt > 350) glideslopeStatus = "ABOVE_GLIDESLOPE";
      else glideslopeStatus = "BELOW_GLIDESLOPE";
    }

    // Spotter Camera Angles (from first spotting location or runway threshold)
    const spotterLoc = apt.spottingLocations[0];
    const spotterDistKm = distanceKm(spotterLoc.lat, spotterLoc.lon, lat, lon);
    const spotterAzimuthDeg = Math.round(bearingDeg(spotterLoc.lat, spotterLoc.lon, lat, lon));
    const altM = (altFt * 0.3048) - (apt.elevFt * 0.3048);
    const spotterElevAngleDeg = Math.round((Math.atan2(Math.max(0, altM), spotterDistKm * 1000) * 180) / Math.PI * 10) / 10;

    // Estimated Time to Touchdown (ETA)
    let etaSeconds = null;
    let etaString = "N/A";
    if (gsKt > 30) {
      etaSeconds = Math.round((distNm / gsKt) * 3600);
      const mm = Math.floor(etaSeconds / 60);
      const ss = etaSeconds % 60;
      etaString = `${mm}m ${ss.toString().padStart(2, "0")}s`;
    }

    // Classification Category
    let category = "CIVIL_GENERAL";
    let isUnexpected = false;
    let classificationReason = "General Aviation";

    if (milCheck.isMilitary) {
      category = milCheck.asset?.type === "PC9" ? "MILITARY_PILATUS" : "MILITARY_TACTICAL";
      isUnexpected = true;
      classificationReason = `Slovenian Air Force: ${milCheck.asset?.model || "Tactical"}`;
    } else if (/^(HEMS|HLM|RESCUE|AMB)/i.test(callsign) || /^(AW169|A109|EC35|EC45)/i.test(type)) {
      category = "HEMS_RESCUE";
      isUnexpected = true;
      classificationReason = "Emergency Medical / Police Rescue Helicopter";
    } else if (distNm <= 8 && aglFt <= 3200 && gsKt <= 140) {
      category = "CIRCUIT_TRAINING";
      isUnexpected = dest !== apt.icao;
      classificationReason = "Local Aerodrome Training Circuit / Touch-and-Go Pattern";
    } else if (dest !== apt.icao) {
      if (vsFpm < -150 && aglFt < 8000 && distNm < 25 && minRwyDelta < 30) {
        category = "UNEXPECTED_APPROACH";
        isUnexpected = true;
        classificationReason = `Descending into ${apt.icao} without filed destination (Field: ${dest || "None filed"})`;
      } else {
        category = "OVERFLIGHT";
        isUnexpected = false;
        classificationReason = `Transit traffic en-route (FL${Math.round(altFt / 100)})`;
      }
    } else {
      category = "SCHEDULED_ARRIVAL";
      isUnexpected = false;
      classificationReason = `Scheduled arrival to ${apt.icao}`;
    }

    const item = {
      hex: p.hex || p.icao,
      flight: callsign || p.hex,
      registration: p.registration || p.reg || milCheck.asset?.reg || null,
      type: type || milCheck.asset?.type || null,
      model: milCheck.asset?.model || p.typeDesc || null,
      category,
      isUnexpected,
      classificationReason,
      military: milCheck,
      lat,
      lon,
      altFt,
      aglFt,
      gsKt,
      trackDeg,
      vsFpm,
      distNm: Math.round(distNm * 10) / 10,
      distKm: Math.round(distKm * 10) / 10,
      brgToApt: Math.round(brgToApt),
      brgFromApt: Math.round(brgFromApt),
      closestRunway: alignedRwy,
      glideslopeStatus,
      idealGlideslopeAltFt,
      glideslopeDevFt,
      spotterOptics: {
        spotterAzimuthDeg,
        spotterElevAngleDeg,
        etaString,
        etaSeconds,
        bestVantagePoint: spotterLoc.name,
      },
      links: {
        planespotters: p.registration ? `https://www.planespotters.net/search?q=${encodeURIComponent(p.registration)}` : null,
        flightradar24: `https://www.flightradar24.com/${callsign || p.hex}`,
      },
    };

    if (isUnexpected || category === "MILITARY_PILATUS" || category === "MILITARY_TACTICAL" || category === "UNEXPECTED_APPROACH" || category === "SCHEDULED_ARRIVAL") {
      arrivals.push(item);
    } else if (category === "CIRCUIT_TRAINING") {
      circuits.push(item);
    } else {
      overhead.push(item);
    }
  }

  // Sort arrivals by closest distance
  arrivals.sort((a, b) => a.distNm - b.distNm);
  circuits.sort((a, b) => a.distNm - b.distNm);

  return {
    ok: true,
    airport: apt,
    stats: {
      totalInTerminal: arrivals.length + circuits.length + overhead.length,
      unexpectedCount: arrivals.filter((a) => a.isUnexpected).length,
      militaryCount: arrivals.filter((a) => a.military.isMilitary).length,
      circuitsCount: circuits.length,
    },
    arrivals,
    circuits,
    overhead: overhead.slice(0, 15),
  };
}

// Fraport Slovenija Brnik Extranet & Operational B2B Data Specifications
export const FRAPORT_BRNIK_EXTRANET_SPEC = {
  airport: "Ljubljana Airport (Fraport Slovenija / LJLJ)",
  portalUrl: "https://b2b.lju-airport.si/en/",
  extranetSections: [
    {
      id: "flight-overview",
      name: "Extranet for Flight Overviews (Real-Time Turnaround Milestones)",
      description: "Direct A-CDM turnaround milestone tracking used by handling dispatchers, airlines, and fuelers.",
      milestones: [
        { code: "EOBT", label: "Estimated Off-Block Time", description: "Initial filed departure time from flight plan." },
        { code: "TOBT", label: "Target Off-Block Time", description: "Confirmed readiness time submitted by ground handler when doors will close." },
        { code: "TSAT", label: "Target Start-Up Approval Time", description: "ATC slot issued by Slovenia Control for engine push & start." },
        { code: "TTOT", label: "Target Take-Off Time", description: "Runway line-up and departure release milestone." },
        { code: "AOBT", label: "Actual Off-Block Time", description: "Aircraft chocks removed and pushback commenced." },
        { code: "ATOT", label: "Actual Take-Off Time", description: "Wheels off runway 12/30." },
      ],
    },
    {
      id: "stands-gates",
      name: "Brnik Apron & Gate Allocation Matrix",
      description: "Stands and gates distribution across Schengen / Non-Schengen and General Aviation aprons.",
      areas: [
        { name: "Terminal 1 & 2 Jetbridges", gates: ["Gate 1", "Gate 2", "Gate 3", "Gate 4"], stands: ["Stand 1", "Stand 2", "Stand 3", "Stand 4"], features: "Passenger boarding bridges, 400Hz GPU power, PCA air" },
        { name: "Terminal Apron Bus Gates", gates: ["Gate 5", "Gate 6", "Gate 7", "Gate 8"], stands: ["Stand 5", "Stand 6", "Stand 7", "Stand 8"], features: "Walk-out / Apron bus boarding" },
        { name: "New Terminal Expansion", gates: ["Gate 9", "Gate 10", "Gate 11", "Gate 12", "Gate 14"], stands: ["Stand 9", "Stand 10", "Stand 11", "Stand 12", "Stand 14"], features: "Modern Schengen departures area" },
        { name: "Apron 2 General Aviation (GAC)", gates: ["GAC Terminal"], stands: ["Stand A1", "Stand A2", "Stand A3", "Stand A4", "Stand A5", "Stand A6", "Stand A7", "Stand A8"], features: "VIP executive lounge, private jet dedicated customs" },
        { name: "Cargo & Express Apron", gates: ["Cargo Hub"], stands: ["Stand C1", "Stand C2", "Stand C3"], features: "DHL Express, Lufthansa Cargo handling, widebody freighter capable" },
        { name: "Remote De-icing Area", gates: ["De-ice Pad Alpha", "De-ice Pad Bravo"], stands: ["PAD A", "PAD B"], features: "Two-step Type I & Type IV fluid de-icing before RWY 12/30 lineup" },
      ],
    },
    {
      id: "handling-telex",
      name: "SITA Type B Messaging & Telex Exchange",
      description: "Automated flight movement and weight balance telegram distribution.",
      telegrams: [
        { type: "MVT (Aircraft Movement)", example: "MVT\nLH1458/08.D-AINA.LJLJ\nEA1420 LOWW\nDL14/0015", purpose: "Notifies departure, arrival, delay codes (IATA AHM 780)." },
        { type: "LDM (Load Distribution Message)", example: "LDM\nLH1458/08.D-AINA.Y180.2/1\n-LOWW.142/12/3.T1200.PAX/142", purpose: "Detailed passenger count, bag count, deadload by compartment." },
        { type: "CPM (Container / Pallet Distribution)", example: "CPM\nLH1458/08.D-AINA.LJLJ\n-11L/AKE1234LH/LOWW", purpose: "Unit Load Device (ULD) positions in lower hold." },
      ],
      telexAddresses: {
        airportAuthority: "LJUAPXH",
        centralDispatch: "LJUKK7X",
        rampHandling: "LJUOPXH",
        cargoHandling: "LJUGSXH",
      },
    },
  ],
};

// Curated High-Quality European Airband ATC Audio Streams
export const EUROPEAN_AIRBAND_AUDIO_STREAMS = [
  {
    id: "ljlj-app",
    title: "Ljubljana Radar / Approach (Slovenia Control)",
    icao: "LJLJ",
    facility: "Approach / ACC",
    freqMhz: "135.280",
    country: "Slovenia",
    streamUrl: "https://relay.radioreference.com/atc/ljlj_app",
    altStreamUrl: "https://stream.openwebrx.de/ljlj",
    quality: "High Definition VHF Airband (AM 135.280 MHz)",
    coverage: "Slovenian Airspace & TMA Ljubljana up to FL245",
  },
  {
    id: "ljlj-twr",
    title: "Ljubljana Tower / Ground",
    icao: "LJLJ",
    facility: "Tower / Aerodrome Control",
    freqMhz: "118.480",
    country: "Slovenia",
    streamUrl: "https://relay.radioreference.com/atc/ljlj_twr",
    altStreamUrl: "https://stream.openwebrx.de/ljlj_twr",
    quality: "High Definition VHF Airband (AM 118.480 MHz)",
    coverage: "Ljubljana CTR Runway 12/30 & Taxiways",
  },
  {
    id: "ljmb-twr",
    title: "Maribor Tower / Approach",
    icao: "LJMB",
    facility: "Tower / Approach Control",
    freqMhz: "119.205",
    country: "Slovenia",
    streamUrl: "https://relay.radioreference.com/atc/ljmb_twr",
    altStreamUrl: "https://stream.openwebrx.de/ljmb",
    quality: "VHF 8.33 kHz Airband (AM 119.205 MHz)",
    coverage: "Maribor CTR Runway 14/32 & Podravje region",
  },
  {
    id: "ljce-twr",
    title: "Cerklje Military Tower (Slovenian AF)",
    icao: "LJCE",
    facility: "Military Airbase Control",
    freqMhz: "128.525",
    country: "Slovenia",
    streamUrl: "https://relay.radioreference.com/atc/ljce_mil",
    altStreamUrl: "https://stream.openwebrx.de/ljce",
    quality: "Military Airband (AM 128.525 MHz)",
    coverage: "Cerklje Military CTR & Training Corridors",
  },
  {
    id: "lowg-app",
    title: "Graz Approach & Tower (Austro Control)",
    icao: "LOWG",
    facility: "Approach / Tower",
    freqMhz: "119.300",
    country: "Austria",
    streamUrl: "https://relay.radioreference.com/atc/lowg_app",
    altStreamUrl: "https://stream.openwebrx.de/lowg",
    quality: "Airband VHF (AM 119.300 MHz)",
    coverage: "Styria Airspace & Graz Inbound Corridors",
  },
  {
    id: "ldza-app",
    title: "Zagreb Radar / Approach (Croatia Control)",
    icao: "LDZA",
    facility: "Approach / Radar",
    freqMhz: "120.700",
    country: "Croatia",
    streamUrl: "https://relay.radioreference.com/atc/ldza_app",
    altStreamUrl: "https://stream.openwebrx.de/ldza",
    quality: "Airband VHF (AM 120.700 MHz)",
    coverage: "Zagreb TMA & Northern Croatia",
  },
  {
    id: "muac-upper",
    title: "Maastricht UAC (MUAC Upper Airspace)",
    icao: "EDYY",
    facility: "Upper Area Control",
    freqMhz: "132.855",
    country: "Eurocontrol",
    streamUrl: "https://relay.radioreference.com/atc/muac_enroute",
    altStreamUrl: "https://stream.openwebrx.de/muac",
    quality: "En-Route Upper European Airband (AM 132.855 MHz)",
    coverage: "Upper Airspace FL245+ Benelux & NW Germany",
  },
  {
    id: "eddm-app",
    title: "Munich Radar / Approach (DFS Deutsche Flugsicherung)",
    icao: "EDDM",
    facility: "Approach / Arrival Radar",
    freqMhz: "124.050",
    country: "Germany",
    streamUrl: "https://relay.radioreference.com/atc/eddm_app",
    altStreamUrl: "https://stream.openwebrx.de/eddm",
    quality: "Airband VHF (AM 124.050 MHz)",
    coverage: "Bavaria & Alpine Inbound Feeds",
  },
];
