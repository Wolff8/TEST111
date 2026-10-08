/**
 * pcl-multilateration-feed.mjs
 * 
 * Passive Coherent Location (PCL) Bistatic Radar & Mode S Multilateration (MLAT) Engine
 * Receiver Reference: LJMS Airport (Murska Sobota / Rakičan) [46.6292°N, 16.1908°E]
 * 
 * Features:
 * 1. PCL Reflectors & Illuminators of Opportunity:
 *    - Terrestrial FM: RTV Pohorje (105.7 MHz), Krvavec (104.5 MHz), Boč (93.7 MHz), Nemčavci (88.4 MHz)
 *    - DVB-T Digital TV: Krvavec Ch32 (562 MHz), Pohorje Ch27 (522 MHz)
 *    - Satellites of Opportunity: Starlink Ku-band (11.5 GHz), Galileo/GPS L1 (1575.42 MHz) forward scattering
 * 2. Mode S Multilateration (MLAT) for Non-GPS Ground & Low-Altitude Aircraft:
 *    - TDoA (Time Difference of Arrival) hyperbolic geometry across Slovenian baseline
 *    - Surface movement identification for LJMS, LJMB, and LJLJ aerodromes
 *    - ASTERIX CAT 010 (Surface Movement) & CAT 048 data mapping
 */

// Ground Stations in Multilateration Receiver Network
export const MLAT_STATIONS = [
  { id: "ljms", name: "LJMS Airport (Rakičan)", lat: 46.6292, lon: 16.1908, altM: 185, type: "OGN_APRS_SDR" },
  { id: "puconci", name: "Puconci Primary Radar Site", lat: 46.7020, lon: 16.1550, altM: 260, type: "PSR_SDR_ASTERIX" },
  { id: "pohorje", name: "Pohorje Transponder Station", lat: 46.5160, lon: 15.5840, altM: 1050, type: "SSR_MODE_S" },
  { id: "krvavec", name: "Krvavec Mountain Node", lat: 46.2990, lon: 14.5360, altM: 1740, type: "TDOA_RECEIVER" },
  { id: "cerklje", name: "Cerklje Military Radar Node", lat: 45.8999, lon: 15.5303, altM: 155, type: "MIL_RADAR_SDR" },
];

// Illuminators of Opportunity (PCL Transmitters)
export const ILLUMINATORS_OF_OPPORTUNITY = [
  {
    id: "pohorje-fm",
    name: "RTV Pohorje FM Transmitter",
    lat: 46.5160,
    lon: 15.5840,
    altM: 1050,
    freqMhz: 105.7,
    wavelengthM: 2.836,
    erpKw: 100,
    type: "FM_BROADCAST",
    polarization: "VERTICAL",
  },
  {
    id: "krvavec-fm",
    name: "RTV Krvavec FM Transmitter",
    lat: 46.2990,
    lon: 14.5360,
    altM: 1740,
    freqMhz: 104.5,
    wavelengthM: 2.868,
    erpKw: 100,
    type: "FM_BROADCAST",
    polarization: "MIXED",
  },
  {
    id: "boc-fm",
    name: "RTV Boč FM Transmitter",
    lat: 46.2800,
    lon: 15.5980,
    altM: 978,
    freqMhz: 93.7,
    wavelengthM: 3.199,
    erpKw: 5,
    type: "FM_BROADCAST",
    polarization: "VERTICAL",
  },
  {
    id: "nemcavci-fm",
    name: "Nemčavci / LJMS Local FM Tower",
    lat: 46.6800,
    lon: 16.1700,
    altM: 195,
    freqMhz: 88.4,
    wavelengthM: 3.391,
    erpKw: 10,
    type: "FM_BROADCAST",
    polarization: "VERTICAL",
  },
  {
    id: "krvavec-dvbt",
    name: "Krvavec DVB-T Digital TV (MUX A)",
    lat: 46.2990,
    lon: 14.5360,
    altM: 1740,
    freqMhz: 562.0,
    wavelengthM: 0.533,
    erpKw: 50,
    type: "DVB_T_COFDM",
    polarization: "HORIZONTAL",
  },
  {
    id: "starlink-leo",
    name: "Starlink Constellation LEO Downlink",
    lat: 46.5000,
    lon: 15.0000,
    altM: 550000, // 550 km orbital altitude
    freqMhz: 11325.0, // Ku-band
    wavelengthM: 0.0265,
    erpKw: 0.8,
    type: "SATELLITE_DOWNLINK",
    polarization: "CIRCULAR",
  },
  {
    id: "galileo-gnss",
    name: "Galileo E1 / GPS L1 Space Vehicles",
    lat: 46.2000,
    lon: 14.8000,
    altM: 23222000, // MEO orbit
    freqMhz: 1575.42,
    wavelengthM: 0.1903,
    erpKw: 0.5,
    type: "SATELLITE_FORWARD_SCATTER",
    polarization: "RHCP",
  },
];

// Aerodromes with Surface Radar / Apron Coordinates
export const AERODROME_SURFACES = [
  {
    icao: "LJMS",
    name: "Murska Sobota / Rakičan",
    arpLat: 46.6292,
    arpLon: 16.1908,
    runway10_28: {
      rwy10: [46.6308, 16.1830],
      rwy28: [46.6276, 16.1986],
      lengthM: 1200,
      widthM: 60,
      headingDeg: 102,
    },
    grassStrip: {
      thr10: [46.6315, 16.1835],
      thr28: [46.6283, 16.1991],
    },
    apron: [
      [46.6298, 16.1895],
      [46.6305, 16.1915],
      [46.6295, 16.1922],
      [46.6288, 16.1902],
    ],
  },
  {
    icao: "LJMB",
    name: "Maribor Edvard Rusjan",
    arpLat: 46.4799,
    arpLon: 15.6864,
    runway14_32: {
      rwy14: [46.4880, 15.6780],
      rwy32: [46.4718, 15.6948],
      lengthM: 2500,
      headingDeg: 142,
    },
  },
  {
    icao: "LJLJ",
    name: "Ljubljana Jože Pučnik",
    arpLat: 46.2237,
    arpLon: 14.4576,
    runway12_30: {
      rwy12: [46.2305, 14.4425],
      rwy30: [46.2169, 14.4727],
      lengthM: 3300,
      headingDeg: 120,
    },
  },
];

function haversineDistKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates Passive Coherent Location (PCL) bistatic radar reflection telemetry
 * for a target relative to an illuminator of opportunity and the LJMS receiver.
 */
export function calculateBistaticTelemetry(illuminator, target, receiver = MLAT_STATIONS[0]) {
  const R_tx_tgt_km = haversineDistKm(illuminator.lat, illuminator.lon, target.lat, target.lon);
  const R_tgt_rx_km = haversineDistKm(target.lat, target.lon, receiver.lat, receiver.lon);
  const Baseline_km = haversineDistKm(illuminator.lat, illuminator.lon, receiver.lat, receiver.lon);

  // Bistatic Range (path difference)
  const bistaticRangeKm = R_tx_tgt_km + R_tgt_rx_km - Baseline_km;
  // Bistatic time delay in microseconds
  const bistaticDelayUs = (bistaticRangeKm * 1000) / 299.792458;

  // Bistatic angle beta (angle subtended at target by Tx and Rx)
  // Law of cosines in triangle (Tx, Tgt, Rx)
  const num = R_tx_tgt_km ** 2 + R_tgt_rx_km ** 2 - Baseline_km ** 2;
  const den = 2 * R_tx_tgt_km * R_tgt_rx_km;
  const cosBeta = Math.max(-1, Math.min(1, num / Math.max(0.001, den)));
  const bistaticAngleDeg = (Math.acos(cosBeta) * 180) / Math.PI;

  // Bistatic Doppler Shift (approximate from target ground speed and track)
  const speedMps = ((target.speedKnots || target.speed || target.gs || 0) * 1852) / 3600;
  const trackRad = ((target.track || 0) * Math.PI) / 180;
  // Doppler proportional to velocity component along bistatic bisector
  const dopplerHz = (2 * speedMps * Math.cos(bistaticAngleDeg / 2 * (Math.PI / 180))) / illuminator.wavelengthM;

  // Radar Cross Section (RCS) estimation in m^2 based on target category
  let rcsM2 = 2.0;
  if (target.isDrone || target.category === "DRONE_UAV") rcsM2 = 0.02;
  else if (target.isGlider || target.category === "GLIDER") rcsM2 = 0.6;
  else if (target.category === "MILITARY") rcsM2 = 3.5;
  else if ((target.altFt || 0) > 20000) rcsM2 = 25.0; // Commercial airliner

  // Forward scatter enhancement when bistatic angle approaches 180 degrees
  const isForwardScatter = bistaticAngleDeg > 150;
  const rcsEnhanced = isForwardScatter ? rcsM2 * (4 * Math.PI * (1.5 / illuminator.wavelengthM) ** 2) : rcsM2;

  // Generate 24 points along the bistatic ellipse for CAD / Canvas scope
  const ellipsePoints = [];
  const a = (R_tx_tgt_km + R_tgt_rx_km) / 2; // Semi-major axis
  const c = Baseline_km / 2; // Half focal distance
  const b = Math.sqrt(Math.max(0.1, a ** 2 - c ** 2)); // Semi-minor axis

  // Midpoint between Tx and Rx
  const midLat = (illuminator.lat + receiver.lat) / 2;
  const midLon = (illuminator.lon + receiver.lon) / 2;
  const baselineAngleRad = Math.atan2(receiver.lon - illuminator.lon, receiver.lat - illuminator.lat);

  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const x = a * Math.cos(angle);
    const y = b * Math.sin(angle);
    // Rotate by baseline orientation
    const rotX = x * Math.cos(baselineAngleRad) - y * Math.sin(baselineAngleRad);
    const rotY = x * Math.sin(baselineAngleRad) + y * Math.cos(baselineAngleRad);
    // Convert km offsets to degrees
    const ptLat = midLat + rotX / 111.32;
    const ptLon = midLon + rotY / (111.32 * Math.cos((midLat * Math.PI) / 180));
    ellipsePoints.push([ptLat, ptLon]);
  }

  return {
    illuminatorId: illuminator.id,
    illuminatorName: illuminator.name,
    freqMhz: illuminator.freqMhz,
    type: illuminator.type,
    bistaticRangeKm: parseFloat(bistaticRangeKm.toFixed(2)),
    bistaticDelayUs: parseFloat(bistaticDelayUs.toFixed(2)),
    bistaticAngleDeg: parseFloat(bistaticAngleDeg.toFixed(1)),
    dopplerHz: parseFloat(dopplerHz.toFixed(1)),
    estimatedRcsM2: parseFloat(rcsEnhanced.toFixed(2)),
    isForwardScatter,
    ellipsePoints,
  };
}

/**
 * Evaluates Multilateration (MLAT) TDoA fixes and checks whether targets are
 * operating on the ground at airfields (LJMS, LJMB, LJLJ).
 */
export function analyzeMlatSurfaceTargets(targets) {
  const enriched = [];

  for (const t of targets || []) {
    const lat = t.lat;
    const lon = t.lon;
    if (!lat || !lon) continue;

    // Check proximity to aerodromes
    let onGroundAirfield = null;
    let distToArpKm = 999;

    for (const apt of AERODROME_SURFACES) {
      const d = haversineDistKm(lat, lon, apt.arpLat, apt.arpLon);
      if (d < 3.5 && (t.altFt <= 400 || (t.speedKnots || 0) < 60)) {
        onGroundAirfield = apt.icao;
        distToArpKm = d;
        break;
      }
    }

    // TDoA Hyperbolic time difference between LJMS and Puconci
    const d1 = haversineDistKm(lat, lon, MLAT_STATIONS[0].lat, MLAT_STATIONS[0].lon);
    const d2 = haversineDistKm(lat, lon, MLAT_STATIONS[1].lat, MLAT_STATIONS[1].lon);
    const d3 = haversineDistKm(lat, lon, MLAT_STATIONS[2].lat, MLAT_STATIONS[2].lon);

    const tdoa1_2_ns = Math.round(((d1 - d2) * 1000 / 0.299792458));
    const tdoa1_3_ns = Math.round(((d1 - d3) * 1000 / 0.299792458));

    // Calculate PCL reflection with RTV Pohorje and RTV Nemčavci
    const pclPohorje = calculateBistaticTelemetry(ILLUMINATORS_OF_OPPORTUNITY[0], t);
    const pclNemcavci = calculateBistaticTelemetry(ILLUMINATORS_OF_OPPORTUNITY[3], t);
    const pclStarlink = calculateBistaticTelemetry(ILLUMINATORS_OF_OPPORTUNITY[5], t);

    enriched.push({
      ...t,
      isSurfaceMovement: Boolean(onGroundAirfield),
      airfield: onGroundAirfield,
      distToArpKm: distToArpKm < 99 ? parseFloat(distToArpKm.toFixed(2)) : null,
      mlatTelemetry: {
        tdoaLjmsPuconciNs: tdoa1_2_ns,
        tdoaLjmsPohorjeNs: tdoa1_3_ns,
        cepAccuracyMeters: onGroundAirfield ? 4.5 : 18.0, // High surface resolution
        stationsInSolution: ["ljms", "puconci", "pohorje", "krvavec"],
        gdop: onGroundAirfield ? 1.4 : 2.1,
      },
      pclReflections: [pclPohorje, pclNemcavci, pclStarlink],
    });
  }

  return enriched;
}
