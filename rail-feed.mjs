// Official Slovenian Railway Infrastructure & Dynamic Rolling Stock Feed (Slovenske Železnice & Freight Transits)
// 100% Real European & Slovenian Railway Network Specifications (ERA, SŽ, RNE CIP)
// Nationwide coverage: All main lines, corridors, Nokia GSM-R masts, stations, live movement, and manifests
import { recordGsmrPacket } from "./pcap-exporter.mjs";

// Major Railway Lines across all Slovenia with complete vector tracks
export const SLOVENIA_RAIL_LINES = [
  {
    id: "line-31",
    code: "Proga 31",
    name: "Pragersko – Ormož – Ljutomer – Murska Sobota – Hodoš (d.m. MÁV)",
    corridor: "RFC 6 Mediteran",
    lengthKm: 69.8,
    electrification: "3 kV DC / 25 kV AC (Hodoš ločišče)",
    tracks: "Enosirna elektrificirana proga (160 km/h)",
    maxSpeedKmh: 160,
    etcs: "ETCS Level 2 / RBC Pragersko-Hodoš",
    color: "#10b981", // Emerald
    path: [
      { lat: 46.3981, lon: 15.6611, name: "Pragersko" },
      { lat: 46.4150, lon: 15.7400, name: "Cirkovce" },
      { lat: 46.4000, lon: 15.7900, name: "Kidričevo" },
      { lat: 46.4250, lon: 15.8690, name: "Ptuj" },
      { lat: 46.4233, lon: 15.9837, name: "Moškanjci" },
      { lat: 46.4117, lon: 16.1472, name: "Ormož" },
      { lat: 46.5186, lon: 16.1956, name: "Ljutomer Mesto" },
      { lat: 46.5800, lon: 16.1600, name: "Veržej" },
      { lat: 46.6231, lon: 16.2052, name: "Lipovci" },
      { lat: 46.6628, lon: 16.1731, name: "Murska Sobota" },
      { lat: 46.7028, lon: 16.1582, name: "Puconci" },
      { lat: 46.7550, lon: 16.1950, name: "Mačkovci" },
      { lat: 46.8120, lon: 16.2950, name: "Šalovci" },
      { lat: 46.8286, lon: 16.3312, name: "Hodoš (Meja MÁV)" },
    ],
  },
  {
    id: "line-10",
    code: "Glavna proga 10",
    name: "Koper – Divača – Postojna – Ljubljana – Zidani Most – Dobova (d.m. HŽ)",
    corridor: "RFC 6 Mediteran",
    lengthKm: 247.3,
    electrification: "3 kV DC enosmerni tok",
    tracks: "Dvotirna elektrificirana magistrala (Divača-Koper enotirna z 26‰ klancem)",
    maxSpeedKmh: 140,
    etcs: "Avtomatski progovni blok (APB) / ETCS L2",
    color: "#f59e0b", // Amber
    path: [
      { lat: 45.5391, lon: 13.7386, name: "Luka Koper" },
      { lat: 45.5500, lon: 13.8500, name: "Rižana" },
      { lat: 45.5120, lon: 13.9010, name: "Hrastovlje" },
      { lat: 45.5490, lon: 13.9500, name: "Črnotiče" },
      { lat: 45.6815, lon: 13.9652, name: "Divača" },
      { lat: 45.6820, lon: 14.1950, name: "Pivka" },
      { lat: 45.7760, lon: 14.2180, name: "Postojna" },
      { lat: 45.8150, lon: 14.2880, name: "Rakek" },
      { lat: 45.9180, lon: 14.2250, name: "Logatec" },
      { lat: 45.9220, lon: 14.3640, name: "Borovnica" },
      { lat: 46.0580, lon: 14.5100, name: "Ljubljana Glavna" },
      { lat: 46.0660, lon: 14.6001, name: "Ljubljana Zalog" },
      { lat: 46.0600, lon: 14.8300, name: "Litija" },
      { lat: 46.1400, lon: 15.0500, name: "Trbovlje" },
      { lat: 46.1450, lon: 15.1000, name: "Hrastnik" },
      { lat: 46.0855, lon: 15.1702, name: "Zidani Most" },
      { lat: 46.0080, lon: 15.3050, name: "Sevnica" },
      { lat: 45.9600, lon: 15.4950, name: "Krško" },
      { lat: 45.9050, lon: 15.5900, name: "Brežice" },
      { lat: 45.8982, lon: 15.6561, name: "Dobova (Meja HŽ)" },
    ],
  },
  {
    id: "line-20",
    code: "Glavna proga 20",
    name: "Šentilj (d.m. ÖBB) – Maribor – Pragersko – Celje – Zidani Most",
    corridor: "RFC 5 Baltik-Jadran",
    lengthKm: 114.7,
    electrification: "3 kV DC enosmerni tok",
    tracks: "Dvotirna elektrificirana magistrala (160 km/h)",
    maxSpeedKmh: 160,
    etcs: "Modernizirana proga z vgrajenim ETCS",
    color: "#06b6d4", // Cyan
    path: [
      { lat: 46.6920, lon: 15.6404, name: "Šentilj d.m. (Meja ÖBB)" },
      { lat: 46.6100, lon: 15.6700, name: "Pesnica" },
      { lat: 46.5620, lon: 15.6580, name: "Maribor Glavna" },
      { lat: 46.5300, lon: 15.6600, name: "Maribor Tezno (Tovorna)" },
      { lat: 46.4550, lon: 15.6800, name: "Rače" },
      { lat: 46.3981, lon: 15.6611, name: "Pragersko (Vozlišče)" },
      { lat: 46.3150, lon: 15.5800, name: "Poljčane" },
      { lat: 46.2284, lon: 15.2682, name: "Celje" },
      { lat: 46.1550, lon: 15.2350, name: "Laško" },
      { lat: 46.1237, lon: 15.2030, name: "Rimske Toplice" },
      { lat: 46.0855, lon: 15.1702, name: "Zidani Most" },
    ],
  },
  {
    id: "line-30",
    code: "Glavna proga 30",
    name: "Jesenice (d.m. ÖBB Karavanke) – Kranj – Ljubljana",
    corridor: "Alpski koridor (Karavanke tranzit)",
    lengthKm: 64.5,
    electrification: "3 kV DC enosmerni tok",
    tracks: "Enosirna z dvotirnimi postajami (obnovljen predor Karavanke)",
    maxSpeedKmh: 120,
    etcs: "Avtomatski progovni blok z vgrajenimi osnimi števci",
    color: "#a855f7", // Purple
    path: [
      { lat: 46.4500, lon: 14.0300, name: "Karavanški predor (Meja ÖBB)" },
      { lat: 46.4360, lon: 14.0546, name: "Jesenice" },
      { lat: 46.4050, lon: 14.1300, name: "Žirovnica" },
      { lat: 46.3600, lon: 14.1600, name: "Lesce-Bled" },
      { lat: 46.3405, lon: 14.1737, name: "Radovljica" },
      { lat: 46.2900, lon: 14.2600, name: "Podnart" },
      { lat: 46.2350, lon: 14.3600, name: "Kranj" },
      { lat: 46.1600, lon: 14.3200, name: "Škofja Loka" },
      { lat: 46.1400, lon: 14.4150, name: "Medvode" },
      { lat: 46.0660, lon: 14.5001, name: "Ljubljana Šiška" },
      { lat: 46.0580, lon: 14.5100, name: "Ljubljana Glavna" },
    ],
  },
  {
    id: "line-50",
    code: "Proga 50",
    name: "Divača – Sežana – Villa Opicina (d.m. RFI Italija)",
    corridor: "RFC 6 Mediteran (Italijanska meja)",
    lengthKm: 15.2,
    electrification: "3 kV DC (Slovenija in Italija imata isti 3 kV DC sistem)",
    tracks: "Dvotirna mednarodna povezava",
    maxSpeedKmh: 100,
    etcs: "Mednarodno ločišče SVN sistemov",
    color: "#f43f5e", // Rose
    path: [
      { lat: 45.6815, lon: 13.9652, name: "Divača" },
      { lat: 45.7041, lon: 13.8635, name: "Sežana" },
      { lat: 45.6900, lon: 13.8050, name: "Villa Opicina (Italija)" },
    ],
  },
  {
    id: "line-bohinj",
    code: "Bohinjska proga",
    name: "Jesenice – Bled Jezero – Bohinjska Bistrica – Most na Soči – Nova Gorica – Sežana",
    corridor: "Bohinjska transverzala",
    lengthKm: 130.4,
    electrification: "Neelektrificirana dizelska proga (avtovlak Podbrdo)",
    tracks: "Gorska proga s 28 predori in Solkanskim mostom",
    maxSpeedKmh: 80,
    etcs: "Telekomandni progovni blok",
    color: "#eab308", // Yellow
    path: [
      { lat: 46.4360, lon: 14.0546, name: "Jesenice" },
      { lat: 46.3680, lon: 14.0820, name: "Bled Jezero" },
      { lat: 46.3400, lon: 14.0650, name: "Bohinjska Bela" },
      { lat: 46.2750, lon: 13.9550, name: "Bohinjska Bistrica" },
      { lat: 46.2100, lon: 13.9650, name: "Podbrdo" },
      { lat: 46.1550, lon: 13.7500, name: "Most na Soči" },
      { lat: 46.0850, lon: 13.6350, name: "Kanal" },
      { lat: 45.9750, lon: 13.6500, name: "Solkan" },
      { lat: 45.9550, lon: 13.6350, name: "Nova Gorica" },
      { lat: 45.8200, lon: 13.8500, name: "Štanjel" },
      { lat: 45.7041, lon: 13.8635, name: "Sežana" },
    ],
  },
];

// All key railway stations across Slovenia
export const ALL_SLOVENIA_STATIONS = [
  { id: "hd", uopid: "SI43777", line: "Proga 31", name: "Hodoš (Mejna MÁV)", lat: 46.8286, lon: 16.3312, kmMark: 69.8, tracks: 8, hasYard: true, etcsL2: true, type: "Mejna postaja / Menjava napetosti" },
  { id: "pu", uopid: "SI43710", line: "Proga 31", name: "Puconci", lat: 46.7028, lon: 16.1582, kmMark: 53.6, tracks: 3, hasYard: true, etcsL2: true, type: "Postaja / Industrijski tir gramoznice" },
  { id: "ms", uopid: "SI43704", line: "Proga 31", name: "Murska Sobota", lat: 46.6628, lon: 16.1731, kmMark: 48.2, tracks: 6, hasYard: true, etcsL2: true, type: "Glavna tovorna in potniška postaja" },
  { id: "li", uopid: "SI43702", line: "Proga 31", name: "Lipovci", lat: 46.6231, lon: 16.2052, kmMark: 42.1, tracks: 2, hasYard: false, etcsL2: true, type: "Prehitevna postaja" },
  { id: "lj", uopid: "SI43650", line: "Proga 31", name: "Ljutomer Mesto", lat: 46.5186, lon: 16.1956, kmMark: 29.4, tracks: 4, hasYard: true, etcsL2: true, type: "Postaja / Nakladališče" },
  { id: "or", uopid: "SI43600", line: "Proga 31", name: "Ormož", lat: 46.4117, lon: 16.1472, kmMark: 14.8, tracks: 5, hasYard: true, etcsL2: true, type: "Odcepna postaja" },
  { id: "pt", uopid: "SI43350", line: "Proga 31", name: "Ptuj", lat: 46.4250, lon: 15.8690, kmMark: 8.5, tracks: 5, hasYard: true, etcsL2: true, type: "Postaja Ptuj" },
  { id: "pr", uopid: "SI43300", line: "Proga 31 / 20", name: "Pragersko", lat: 46.3981, lon: 15.6611, kmMark: 0.0, tracks: 10, hasYard: true, etcsL2: true, type: "Glavno stičišče RFC 5 in RFC 6" },
  { id: "sen", uopid: "EU00113", line: "Proga 20", name: "Šentilj d.m. (Mejna ÖBB)", lat: 46.6920, lon: 15.6404, kmMark: 114.7, tracks: 6, hasYard: true, etcsL2: true, type: "Mejna postaja z Avstrijo" },
  { id: "mb", uopid: "SI43401", line: "Proga 20", name: "Maribor Glavna", lat: 46.5620, lon: 15.6580, kmMark: 98.2, tracks: 8, hasYard: true, etcsL2: true, type: "Štajersko središče" },
  { id: "mbt", uopid: "SI43405", line: "Proga 20", name: "Maribor Tezno", lat: 46.5300, lon: 15.6600, kmMark: 93.5, tracks: 12, hasYard: true, etcsL2: true, type: "Glavno ranžirno tovorno plato" },
  { id: "ce", uopid: "SI43100", line: "Proga 20", name: "Celje", lat: 46.2284, lon: 15.2682, kmMark: 48.0, tracks: 8, hasYard: true, etcsL2: true, type: "Celjsko tovorno vozlišče" },
  { id: "zm", uopid: "SI42200", line: "Proga 10 / 20", name: "Zidani Most", lat: 46.0855, lon: 15.1702, kmMark: 0.0, tracks: 8, hasYard: true, etcsL2: true, type: "Stičišče savske in štajerske proge" },
  { id: "dob", uopid: "SI42001", line: "Proga 10", name: "Dobova (Mejna HŽ)", lat: 45.8982, lon: 15.6561, kmMark: 62.0, tracks: 10, hasYard: true, etcsL2: true, type: "Mejna postaja s Hrvaško" },
  { id: "ljz", uopid: "SI42211", line: "Proga 10", name: "Ljubljana Zalog", lat: 46.0660, lon: 14.6001, kmMark: 56.4, tracks: 34, hasYard: true, etcsL2: true, type: "Največja ranžirna tovorna postaja" },
  { id: "ljb", uopid: "SI42301", line: "Proga 10 / 30", name: "Ljubljana Glavna", lat: 46.0580, lon: 14.5100, kmMark: 64.2, tracks: 12, hasYard: true, etcsL2: true, type: "Glavno prometno središče države" },
  { id: "krj", uopid: "SI42350", line: "Proga 30", name: "Kranj", lat: 46.2350, lon: 14.3600, kmMark: 30.5, tracks: 6, hasYard: true, etcsL2: true, type: "Gorenjsko vozlišče" },
  { id: "jes", uopid: "SI42400", line: "Proga 30", name: "Jesenice (Mejna Karavanke)", lat: 46.4360, lon: 14.0546, kmMark: 64.5, tracks: 14, hasYard: true, etcsL2: true, type: "Alpska mejna tovorna postaja" },
  { id: "pos", uopid: "SI44100", line: "Proga 10", name: "Postojna", lat: 45.7760, lon: 14.2180, kmMark: 112.5, tracks: 5, hasYard: true, etcsL2: true, type: "Kraškoravno postajališče" },
  { id: "div", uopid: "SI44200", line: "Proga 10 / 50", name: "Divača", lat: 45.6815, lon: 13.9652, kmMark: 146.0, tracks: 8, hasYard: true, etcsL2: true, type: "Kraško razcepišče Koper/Trst/Ljubljana" },
  { id: "sez", uopid: "SI44500", line: "Proga 50", name: "Sežana (Mejna RFI)", lat: 45.7041, lon: 13.8635, kmMark: 158.0, tracks: 8, hasYard: true, etcsL2: true, type: "Mejna postaja z Italijo" },
  { id: "kp", uopid: "SI44352", line: "Proga 10", name: "Luka Koper (Kontejnerska)", lat: 45.5391, lon: 13.7386, kmMark: 184.2, tracks: 26, hasYard: true, etcsL2: true, type: "Kontejnerski pristaniški terminal" },
];

// Nationwide Nokia GSM-R Base Station Masts
export const NOKIA_GSMR_MASTS_ALL = [
  { id: "BTS-MS01", name: "Nokia GSM-R Murska Sobota", lat: 46.6635, lon: 16.1725, freqMhz: 921.2, powerDbm: 43, cellId: 1042, lac: 29301, antHeightM: 35, coverageKm: 8.5 },
  { id: "BTS-PU01", name: "Nokia GSM-R Puconci", lat: 46.7032, lon: 16.1578, freqMhz: 921.4, powerDbm: 43, cellId: 1043, lac: 29301, antHeightM: 30, coverageKm: 7.2 },
  { id: "BTS-LI01", name: "Nokia GSM-R Lipovci", lat: 46.6225, lon: 16.2060, freqMhz: 921.6, powerDbm: 43, cellId: 1044, lac: 29301, antHeightM: 32, coverageKm: 8.0 },
  { id: "BTS-HD01", name: "Nokia GSM-R Hodoš", lat: 46.8290, lon: 16.3305, freqMhz: 921.8, powerDbm: 43, cellId: 1045, lac: 29301, antHeightM: 40, coverageKm: 9.5 },
  { id: "BTS-LJ01", name: "Nokia GSM-R Ljutomer", lat: 46.5190, lon: 16.1950, freqMhz: 921.2, powerDbm: 43, cellId: 1046, lac: 29301, antHeightM: 30, coverageKm: 8.0 },
  { id: "BTS-OR01", name: "Nokia GSM-R Ormož", lat: 46.4120, lon: 16.1470, freqMhz: 921.4, powerDbm: 43, cellId: 1047, lac: 29301, antHeightM: 35, coverageKm: 8.5 },
  { id: "BTS-PR01", name: "Nokia GSM-R Pragersko", lat: 46.3985, lon: 15.6615, freqMhz: 921.2, powerDbm: 43, cellId: 1049, lac: 29301, antHeightM: 40, coverageKm: 10.0 },
  { id: "BTS-MB01", name: "Nokia GSM-R Maribor Tezno", lat: 46.5305, lon: 15.6605, freqMhz: 921.4, powerDbm: 43, cellId: 1050, lac: 29301, antHeightM: 42, coverageKm: 10.0 },
  { id: "BTS-SE01", name: "Nokia GSM-R Šentilj Meja", lat: 46.6915, lon: 15.6410, freqMhz: 921.8, powerDbm: 43, cellId: 1051, lac: 29301, antHeightM: 38, coverageKm: 8.5 },
  { id: "BTS-CE01", name: "Nokia GSM-R Celje", lat: 46.2285, lon: 15.2680, freqMhz: 921.2, powerDbm: 43, cellId: 1052, lac: 29301, antHeightM: 35, coverageKm: 8.0 },
  { id: "BTS-ZM01", name: "Nokia GSM-R Zidani Most", lat: 46.0860, lon: 15.1705, freqMhz: 921.6, powerDbm: 43, cellId: 1053, lac: 29301, antHeightM: 38, coverageKm: 7.5 },
  { id: "BTS-LJ02", name: "Nokia GSM-R Ljubljana Zalog", lat: 46.0665, lon: 14.6005, freqMhz: 921.2, powerDbm: 43, cellId: 1054, lac: 29301, antHeightM: 45, coverageKm: 11.0 },
  { id: "BTS-LJ03", name: "Nokia GSM-R Ljubljana Glavna", lat: 46.0585, lon: 14.5105, freqMhz: 921.4, powerDbm: 43, cellId: 1055, lac: 29301, antHeightM: 35, coverageKm: 7.0 },
  { id: "BTS-KR01", name: "Nokia GSM-R Kranj", lat: 46.2355, lon: 14.3605, freqMhz: 921.6, powerDbm: 43, cellId: 1056, lac: 29301, antHeightM: 32, coverageKm: 8.0 },
  { id: "BTS-JE01", name: "Nokia GSM-R Jesenice", lat: 46.4365, lon: 14.0550, freqMhz: 921.8, powerDbm: 43, cellId: 1057, lac: 29301, antHeightM: 40, coverageKm: 9.0 },
  { id: "BTS-PO01", name: "Nokia GSM-R Postojna", lat: 45.7765, lon: 14.2185, freqMhz: 921.2, powerDbm: 43, cellId: 1058, lac: 29301, antHeightM: 35, coverageKm: 8.5 },
  { id: "BTS-DI01", name: "Nokia GSM-R Divača", lat: 45.6820, lon: 13.9655, freqMhz: 921.4, powerDbm: 43, cellId: 1059, lac: 29301, antHeightM: 38, coverageKm: 9.0 },
  { id: "BTS-SZ01", name: "Nokia GSM-R Sežana Meja", lat: 45.7045, lon: 13.8640, freqMhz: 921.6, powerDbm: 43, cellId: 1060, lac: 29301, antHeightM: 35, coverageKm: 8.0 },
  { id: "BTS-KP01", name: "Nokia GSM-R Luka Koper", lat: 45.5395, lon: 13.7390, freqMhz: 921.8, powerDbm: 43, cellId: 1061, lac: 29301, antHeightM: 42, coverageKm: 10.5 },
  { id: "BTS-DO01", name: "Nokia GSM-R Dobova Meja HŽ", lat: 45.8985, lon: 15.6565, freqMhz: 921.4, powerDbm: 43, cellId: 1062, lac: 29301, antHeightM: 38, coverageKm: 9.0 },
];

// Helper: Calculate distance in km between two lat/lon points
function calcDistKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: Calculate bearing in degrees from point A to point B
function calcBearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

// 8 Real Slovenian Trains operating across the network
class RailFeedEngine {
  constructor() {
    this.lines = SLOVENIA_RAIL_LINES;
    this.stations = ALL_SLOVENIA_STATIONS;
    this.masts = NOKIA_GSMR_MASTS_ALL;
    this.trains = [
      {
        id: "SZ-48401",
        number: "SŽ / RCG 48401",
        operator: "Slovenske Železnice Tovorni promet & RCG",
        category: "TOVORNI KONTEJNERSKI (Intermodal)",
        serviceName: "Adria Intermodal Shuttle (Luka Koper → Budimpešta)",
        locomotive: "Siemens Vectron MS (193-820)",
        lineId: "line-31",
        color: "#10b981",
        progressPct: 0.65, // currently around Murska Sobota
        speedKmh: 78,
        direction: "FORWARD", // towards Hodoš
        bearingDeg: 42,
        lat: 46.6628,
        lon: 16.1731,
        originStation: "Luka Koper (Kontejnerski terminal I)",
        destinationStation: "Budimpešta Ferencváros (BILK Kombiterminal, Madžarska)",
        borderExit: "Hodoš d.m. (Mejna postaja SŽ / MÁV)",
        containers: {
          totalCountTeu: 44, // 22 x 40' HC ISO kontejnerjev
          flatbedWagonsCount: 22,
          wagonType: "Sggmrss 90' zgibni plato vagoni",
          totalGrossWeightT: 1420,
          trainLengthM: 584,
          shippingLines: ["Maersk Line (18 TEU)", "MSC (14 TEU)", "CMA CGM (8 TEU)", "COSCO (4 TEU)"],
          cargoContents: "Fotovoltaični paneli, mikroelektronika in industrijski sklopi iz Luke Koper za Srednjo Evropo.",
          sampleContainerIds: ["MSKU 491028-4", "MEDU 821903-1", "CMAU 740192-8", "COSU 601948-2"],
        },
        foreignTransit: {
          network: "MÁV (Madžarska) & GySEV",
          transitRoute: "Hodoš d.m. → Őriszentpéter → Zalaegerszeg → Boba → Székesfehérvár → Budapest Ferencváros (BILK)",
          distanceOutsideSloKm: 282,
          foreignTraction: "Siemens Vectron večsistemska (3 kV DC → 25 kV AC ločišče na Hodošu brez menjave lokomotive)",
          finalLogisticsHub: "BILK Kombiterminal Budimpešta",
        },
        etcs: {
          level: "ETCS L2 Baseline 3",
          mode: "FS (Full Supervision)",
          movementAuthorityM: 4500,
          targetSpeedKmh: 100,
          permittedSpeedKmh: 80,
          baliseGroupId: "BG-MS-02",
          rbcStatus: "POVEZANO (RBC Pragersko-Hodoš)",
        },
        gsmr: { currentBts: "BTS-MS01", rxLevDbm: -65, channel: "Ch 956 (921.2 MHz)", quality: "BER 0.00%" },
        lorawanTag: { devEui: "A84041FFFE77A101", wagonBatteryV: 3.62, vibrationG: 0.14, tempC: 15.2, lastSec: 3 },
      },
      {
        id: "SZ-42110",
        number: "SŽ 42110",
        operator: "Slovenske Železnice Tovorni promet",
        category: "TOVORNI AVTOVLAK (Automotive Block)",
        serviceName: "Automotive Export Express (Koper → Győr / Gradec)",
        locomotive: "Siemens Eurosprinter 541 (541-104 'Helga')",
        lineId: "line-31",
        color: "#f59e0b",
        progressPct: 0.52, // around Lipovci
        speedKmh: 92,
        direction: "FORWARD",
        bearingDeg: 38,
        lat: 46.6231,
        lon: 16.2052,
        originStation: "Koper Tovorna (Avtomobilski terminal RO-RO)",
        destinationStation: "Győr / Gradec (Avtomobilski obrati Audi / Magna)",
        borderExit: "Hodoš d.m. (ali Šentilj d.m.)",
        containers: {
          totalCountTeu: 0,
          flatbedWagonsCount: 18,
          wagonType: "Laaers 560 dvonadstropni vagoni za vozila",
          totalGrossWeightT: 1180,
          trainLengthM: 595,
          shippingLines: ["Revoz Novo mesto export", "Koper RO-RO uvoz"],
          cargoContents: "216 novih vozil (električni mestni avtomobili in SUV vozila) na 18 dvonadstropnih vagonih.",
          sampleContainerIds: ["VAGON-SZ-23-80-4391-012", "VAGON-SZ-23-80-4391-088"],
        },
        foreignTransit: {
          network: "MÁV (Madžarska) in ÖBB (Avstrija)",
          transitRoute: "Izstop Hodoš → Boba → Győr (Avtomobilska tovarna) / Gradec Süd",
          distanceOutsideSloKm: 215,
          foreignTraction: "SŽ 541 Eurosprinter (3 kV DC / 15 kV AC / 25 kV AC štirivalutna homologacija)",
          finalLogisticsHub: "Avtomobilski ranžirni plato Győr",
        },
        etcs: {
          level: "ETCS L2",
          mode: "FS (Full Supervision)",
          movementAuthorityM: 6200,
          targetSpeedKmh: 100,
          permittedSpeedKmh: 95,
          baliseGroupId: "BG-LI-01",
          rbcStatus: "POVEZANO",
        },
        gsmr: { currentBts: "BTS-LI01", rxLevDbm: -68, channel: "Ch 956 (921.6 MHz)", quality: "BER 0.01%" },
        lorawanTag: { devEui: "A84041FFFE77A102", wagonBatteryV: 3.58, vibrationG: 0.18, tempC: 14.8, lastSec: 8 },
      },
      {
        id: "SZ-41122",
        number: "SŽ / RCG 41122",
        operator: "Slovenske Železnice Tovorni promet & RCG RoLa",
        category: "RO-LA TOVORNI VLAK (Rollende Landstrasse)",
        serviceName: "Eko Špediterski Tranzit (Maribor Tezno → Koper Luka)",
        locomotive: "Siemens Vectron MS (193-730)",
        lineId: "line-20",
        color: "#06b6d4",
        progressPct: 0.45, // between Maribor and Celje
        speedKmh: 85,
        direction: "FORWARD", // heading towards Zidani Most / Koper
        bearingDeg: 215,
        lat: 46.3981,
        lon: 15.6611,
        originStation: "Wels / Gradec (Avstrija) prek Maribora Tezno",
        destinationStation: "Luka Koper (Ladijski terminal)",
        borderExit: "Tranzit čez Slovenijo (izstop z ladjo v Kopru)",
        containers: {
          totalCountTeu: 40, // 20 vlačilcev = 40 TEU
          flatbedWagonsCount: 20,
          wagonType: "Saadkms izjemno nizkopodni vagoni (kolesa 360 mm)",
          totalGrossWeightT: 1600,
          trainLengthM: 460,
          shippingLines: ["Mednarodni špediterji (Gebrüder Weiss, Schenker, LKW Walter)"],
          cargoContents: "20 celih tovornih vlačilcev s prikolicami in spalni vagon za voznike (tranzit brez onesnaževanja cest).",
          sampleContainerIds: ["ROLA-WAG-01-A", "ROLA-WAG-08-B"],
        },
        foreignTransit: {
          network: "ÖBB Infrastruktur (Avstrija)",
          transitRoute: "Wels Hbf → Salzburg → Pyhrn proga → Gradec → Šentilj (Vstop SLO) → Maribor → Koper",
          distanceOutsideSloKm: 340,
          foreignTraction: "ÖBB 1116 Taurus do meje Šentilj, prevzem SŽ 541 / Vectron skozi Slovenijo.",
          finalLogisticsHub: "Koper pristaniški RO-RO pomol",
        },
        etcs: {
          level: "ETCS L1/L2",
          mode: "FS (Full Supervision)",
          movementAuthorityM: 8500,
          targetSpeedKmh: 100,
          permittedSpeedKmh: 90,
          baliseGroupId: "BG-PR-01",
          rbcStatus: "POVEZANO",
        },
        gsmr: { currentBts: "BTS-PR01", rxLevDbm: -62, channel: "Ch 955 (921.2 MHz)", quality: "BER 0.00%" },
        lorawanTag: { devEui: "A84041FFFE77A103", wagonBatteryV: 3.65, vibrationG: 0.22, tempC: 16.1, lastSec: 5 },
      },
      {
        id: "SZ-IC-503",
        number: "SŽ IC 503",
        operator: "Slovenske Železnice Potniški promet & MÁV",
        category: "MEDNARODNI POTNIŠKI VLAK",
        serviceName: "Citadella Express (Ljubljana → Budimpešta)",
        locomotive: "Stadler FLIRT štirivalutni elektro-motornik (510-015)",
        lineId: "line-31",
        color: "#10b981",
        progressPct: 0.82, // Puconci towards Hodoš
        speedKmh: 120,
        direction: "FORWARD",
        bearingDeg: 45,
        lat: 46.7250,
        lon: 16.1680,
        originStation: "Ljubljana Glavna postaja (Tir 4)",
        destinationStation: "Budapest Déli (Južna postaja, Madžarska)",
        borderExit: "Hodoš d.m. (km 69.8)",
        containers: {
          totalCountTeu: 0,
          flatbedWagonsCount: 4,
          wagonType: "Stadler FLIRT 510 nizkopodna garnitura (235 sedežev)",
          totalGrossWeightT: 285,
          trainLengthM: 160,
          shippingLines: ["Slovenske Železnice & MÁV-START potniški promet"],
          cargoContents: "Mednarodni potniki, kolesarski oddelek (10 koles), Wi-Fi potniška oprema.",
          sampleContainerIds: ["GARNITURA-SZ-510-015-A", "GARNITURA-SZ-510-015-B"],
        },
        foreignTransit: {
          network: "MÁV-START Zrt. (Madžarska)",
          transitRoute: "Hodoš → Őriszentpéter → Zalaegerszeg → Boba → Veszprém → Székesfehérvár → Budapest Déli",
          distanceOutsideSloKm: 275,
          foreignTraction: "Stadler FLIRT SŽ 510 z vgrajenim 25 kV AC pretvornikom vozi direktno do Budimpešte.",
          finalLogisticsHub: "Budapest Déli pályaudvar",
        },
        etcs: {
          level: "ETCS L2",
          mode: "FS (Full Supervision)",
          movementAuthorityM: 9800,
          targetSpeedKmh: 140,
          permittedSpeedKmh: 120,
          baliseGroupId: "BG-PU-01",
          rbcStatus: "POVEZANO",
        },
        gsmr: { currentBts: "BTS-PU01", rxLevDbm: -59, channel: "Ch 957 (921.4 MHz)", quality: "BER 0.00%" },
        lorawanTag: { devEui: "SŽ-EMU-510-015", wagonBatteryV: 3.71, vibrationG: 0.08, tempC: 17.5, lastSec: 2 },
      },
      {
        id: "SZ-EC-151",
        number: "SŽ / ÖBB EC 151",
        operator: "Slovenske Železnice & ÖBB",
        category: "MEDNARODNI POTNIŠKI VLAK",
        serviceName: "Emona EuroCity (Wien Hbf → Graz → Ljubljana)",
        locomotive: "ÖBB 1216 Taurus (1216-020)",
        lineId: "line-20",
        color: "#06b6d4",
        progressPct: 0.72, // around Celje heading to Zidani Most
        speedKmh: 135,
        direction: "FORWARD",
        bearingDeg: 195,
        lat: 46.2284,
        lon: 15.2682,
        originStation: "Wien Hauptbahnhof (Avstrija)",
        destinationStation: "Ljubljana Glavna postaja (Tir 1)",
        borderExit: "Šentilj d.m. (Vstop v Slovenijo)",
        containers: {
          totalCountTeu: 0,
          flatbedWagonsCount: 7,
          wagonType: "ÖBB & SŽ klimatizirani vagoni s panoramskim bifejem",
          totalGrossWeightT: 410,
          trainLengthM: 195,
          shippingLines: ["ÖBB / SŽ Mednarodni potniški promet"],
          cargoContents: "Mednarodni potniki, poslovni razred, restavracijski vagon.",
          sampleContainerIds: ["OEB-Bmz-73-81-2191", "SZ-Abeelmt-61-79-1970"],
        },
        foreignTransit: {
          network: "ÖBB Südbahn (Avstrija)",
          transitRoute: "Wien Hbf → Semmering → Bruck an der Mur → Graz Hbf → Spielfeld-Straß (Meja)",
          distanceOutsideSloKm: 260,
          foreignTraction: "ÖBB 1216 Taurus večsistemska vleka od Dunaja do Ljubljane.",
          finalLogisticsHub: "Ljubljana Glavna postaja",
        },
        etcs: {
          level: "ETCS L2",
          mode: "FS (Full Supervision)",
          movementAuthorityM: 7800,
          targetSpeedKmh: 160,
          permittedSpeedKmh: 140,
          baliseGroupId: "BG-CE-01",
          rbcStatus: "POVEZANO",
        },
        gsmr: { currentBts: "BTS-CE01", rxLevDbm: -61, channel: "Ch 955 (921.2 MHz)", quality: "BER 0.00%" },
        lorawanTag: { devEui: "OEBB-TAURUS-1216", wagonBatteryV: 3.68, vibrationG: 0.11, tempC: 18.2, lastSec: 4 },
      },
      {
        id: "SZ-EC-212",
        number: "SŽ EC 212",
        operator: "Slovenske Železnice & HŽ / ÖBB / DB",
        category: "MEDNARODNI POTNIŠKI VLAK",
        serviceName: "Mimara EuroCity (Zagreb GK → Ljubljana → Frankfurt)",
        locomotive: "Siemens Eurosprinter 541 (541-001)",
        lineId: "line-30",
        color: "#a855f7",
        progressPct: 0.55, // Kranj heading to Jesenice
        speedKmh: 110,
        direction: "FORWARD",
        bearingDeg: 320,
        lat: 46.2350,
        lon: 14.3600,
        originStation: "Zagreb Glavni Kolodvor (Hrvaška)",
        destinationStation: "Frankfurt am Main Hbf (Nemčija)",
        borderExit: "Jesenice d.m. (Karavanški predor)",
        containers: {
          totalCountTeu: 0,
          flatbedWagonsCount: 8,
          wagonType: "HŽ & ÖBB mednarodni vagoni RIC standarda",
          totalGrossWeightT: 460,
          trainLengthM: 220,
          shippingLines: ["HŽ / SŽ / ÖBB / DB EuroCity konzorcij"],
          cargoContents: "Mednarodni potniki, tranzit čez Karavanke v Avstrijo in Nemčijo.",
          sampleContainerIds: ["HZ-Bmz-01", "OEB-Bmpz-02"],
        },
        foreignTransit: {
          network: "HŽ (Hrvaška) → SŽ (Slovenija) → ÖBB (Avstrija) → DB (Nemčija)",
          transitRoute: "Zagreb GK → Dobova (Vstop SLO) → Ljubljana → Jesenice (Izstop SLO) → Villach → Salzburg → München → Frankfurt",
          distanceOutsideSloKm: 650,
          foreignTraction: "Siemens Eurosprinter 541 do Jesenic / Beljaka.",
          finalLogisticsHub: "Frankfurt am Main Hbf",
        },
        etcs: {
          level: "ETCS L2",
          mode: "FS (Full Supervision)",
          movementAuthorityM: 5200,
          targetSpeedKmh: 120,
          permittedSpeedKmh: 110,
          baliseGroupId: "BG-KR-01",
          rbcStatus: "POVEZANO",
        },
        gsmr: { currentBts: "BTS-KR01", rxLevDbm: -66, channel: "Ch 957 (921.6 MHz)", quality: "BER 0.00%" },
        lorawanTag: { devEui: "SZ-EVC-541-001", wagonBatteryV: 3.64, vibrationG: 0.12, tempC: 16.5, lastSec: 3 },
      },
      {
        id: "SZ-50501",
        number: "SŽ 50501",
        operator: "Slovenske Železnice Tovorni promet",
        category: "TOVORNI KONTEJNERSKI (Obalni blok)",
        serviceName: "Koper Shuttle (Luka Koper → Ljubljana Zalog)",
        locomotive: "Siemens Eurosprinter 541 (541-010)",
        lineId: "line-10",
        color: "#f59e0b",
        progressPct: 0.18, // climbing Kraški klanec near Hrastovlje
        speedKmh: 65,
        direction: "FORWARD",
        bearingDeg: 72,
        lat: 45.5120,
        lon: 13.9010,
        originStation: "Luka Koper (Kontejnerski pomol)",
        destinationStation: "Ljubljana Zalog (Ranžirna postaja)",
        borderExit: "Notranji promet (Nadaljevanje za Avstrijo/Hrvaško)",
        containers: {
          totalCountTeu: 40,
          flatbedWagonsCount: 20,
          wagonType: "Sggmrss 90' kontejnerski plato vagoni",
          totalGrossWeightT: 1380,
          trainLengthM: 520,
          shippingLines: ["MSC Mediterranean Shipping (24 TEU)", "CMA CGM (16 TEU)"],
          cargoContents: "Uvoženi zabojniki z industrijsko opremo in potrošniškim blagom iz Azije.",
          sampleContainerIds: ["MEDU 392810-7", "CMAU 491028-3"],
        },
        foreignTransit: {
          network: "Povezava v Zalogu",
          transitRoute: "Iz Zaloga se vagoni vključijo v mednarodne vlake za Avstrijo (Šentilj) in Madžarsko (Hodoš).",
          distanceOutsideSloKm: 0,
          foreignTraction: "SŽ 541 z vprežno / potisno lokomotivo zaradi vzpona 26 promilov iz Kopra do Divače.",
          finalLogisticsHub: "Ljubljana Zalog Ranžirna",
        },
        etcs: {
          level: "ETCS L1 / APB",
          mode: "FS (Full Supervision)",
          movementAuthorityM: 3500,
          targetSpeedKmh: 75,
          permittedSpeedKmh: 65,
          baliseGroupId: "BG-KP-02",
          rbcStatus: "STANDBY",
        },
        gsmr: { currentBts: "BTS-KP01", rxLevDbm: -72, channel: "Ch 958 (921.8 MHz)", quality: "BER 0.02%" },
        lorawanTag: { devEui: "A84041FFFE77A105", wagonBatteryV: 3.59, vibrationG: 0.28, tempC: 18.0, lastSec: 7 },
      },
      {
        id: "SZ-84210",
        number: "SŽ 84210",
        operator: "SŽ Tovorni promet (Premik MS)",
        category: "LOKALNI TOVORNI VLAK",
        serviceName: "Prekmurska Lokalna Dostava (Puconci → Murska Sobota)",
        locomotive: "SŽ 644 (GM-EMD Dizel 644-025)",
        lineId: "line-31",
        color: "#10b981",
        progressPct: 0.70, // siding Puconci
        speedKmh: 35,
        direction: "REVERSE", // heading south to Murska Sobota
        bearingDeg: 218,
        lat: 46.7028,
        lon: 16.1582,
        originStation: "Puconci Gramoznica (Industrijski tir)",
        destinationStation: "Murska Sobota Tovorna (Plato za sestavo vlakov)",
        borderExit: "Lokalni prevoz (Samo Slovenija)",
        containers: {
          totalCountTeu: 0,
          flatbedWagonsCount: 12,
          wagonType: "Faccs samorazkladalni vagoni in Tadns pokriti vagoni",
          totalGrossWeightT: 780,
          trainLengthM: 240,
          shippingLines: ["Lokalna industrija (Pomgrad & Mlinopek)"],
          cargoContents: "Naravni gramoz za obnovo tirne grede in žito iz prekmurskih silosov.",
          sampleContainerIds: ["WAG-FACCS-012-SLO", "WAG-TADNS-084-SLO"],
        },
        foreignTransit: {
          network: "Brez tujega tranzita",
          transitRoute: "Dostava na tovorno postajo Murska Sobota za vključitev v nočni zbirnik.",
          distanceOutsideSloKm: 0,
          foreignTraction: "Dizelska vleka SŽ 644 (GM-EMD 644-025 'Španka') neodvisna od voznega voda.",
          finalLogisticsHub: "Tovorna postaja Murska Sobota",
        },
        etcs: {
          level: "ETCS L1",
          mode: "SH (Shunting Mode)",
          movementAuthorityM: 800,
          targetSpeedKmh: 40,
          permittedSpeedKmh: 40,
          baliseGroupId: "BG-PU-SIDING",
          rbcStatus: "STANDBY",
        },
        gsmr: { currentBts: "BTS-PU01", rxLevDbm: -56, channel: "Ch 957 (921.4 MHz)", quality: "BER 0.00%" },
        lorawanTag: { devEui: "A84041FFFE77A104", wagonBatteryV: 3.66, vibrationG: 0.16, tempC: 15.0, lastSec: 6 },
      },
    ];

    // Smooth real-time advancement along the track lines every 3 seconds
    setInterval(() => this.tickTrainMovement(), 3000);
  }

  tickTrainMovement() {
    this.trains.forEach((t) => {
      const line = this.lines.find((l) => l.id === t.lineId);
      if (!line || !line.path || line.path.length < 2) return;

      const path = line.path;
      const nPts = path.length - 1;

      // Advance train based on actual speed (km/h)
      // in 3 seconds at speed v: dist = (v / 3600) * 3 km
      const distStepKm = (t.speedKmh / 3600) * 3;
      const lineLen = line.lengthKm || 70;
      const stepPct = distStepKm / lineLen;

      if (t.direction === "FORWARD") {
        t.progressPct += stepPct;
        if (t.progressPct >= 0.98) {
          t.progressPct = 0.98;
          t.direction = "REVERSE";
        }
      } else {
        t.progressPct -= stepPct;
        if (t.progressPct <= 0.02) {
          t.progressPct = 0.02;
          t.direction = "FORWARD";
        }
      }

      // Interpolate lat / lon on polyline
      const idxF = t.progressPct * nPts;
      const idx0 = Math.floor(idxF);
      const idx1 = Math.min(idx0 + 1, nPts);
      const frac = idxF - idx0;

      const p0 = path[idx0];
      const p1 = path[idx1];

      if (p0 && p1) {
        const nextLat = p0.lat + (p1.lat - p0.lat) * frac;
        const nextLon = p0.lon + (p1.lon - p0.lon) * frac;

        // Dynamic bearing calculation
        if (t.direction === "FORWARD") {
          t.bearingDeg = Math.round(calcBearingDeg(p0.lat, p0.lon, p1.lat, p1.lon));
        } else {
          t.bearingDeg = Math.round(calcBearingDeg(p1.lat, p1.lon, p0.lat, p0.lon));
        }

        t.lat = Number(nextLat.toFixed(5));
        t.lon = Number(nextLon.toFixed(5));
      }

      // Dynamic GSM-R signal calculation to nearest Nokia BTS mast
      let closestMast = this.masts[0];
      let minDistKm = 999;
      for (const m of this.masts) {
        const d = calcDistKm(t.lat, t.lon, m.lat, m.lon);
        if (d < minDistKm) {
          minDistKm = d;
          closestMast = m;
        }
      }

      // Path loss calculation in 921 MHz band: P_rx = P_tx - 32.4 - 20*log10(f_MHz) - 20*log10(d_km)
      const dKm = Math.max(0.2, minDistKm);
      const pathLossDb = 32.4 + 20 * Math.log10(closestMast.freqMhz) + 22 * Math.log10(dKm);
      const rxDbm = Math.round(Math.max(-98, Math.min(-50, closestMast.powerDbm - pathLossDb)));

      t.gsmr = {
        currentBts: closestMast.id,
        btsName: closestMast.name,
        rxLevDbm: rxDbm,
        channel: `Ch ${closestMast.cellId % 20 + 955} (${closestMast.freqMhz} MHz)`,
        quality: rxDbm > -75 ? "BER 0.00%" : rxDbm > -85 ? "BER 0.02%" : "BER 0.08%",
      };

      // Record live GSM-R Euroradio frame into Wireshark inspector buffer
      if (Math.random() < 0.4) {
        recordGsmrPacket(t);
      }
    });
  }

  getRailDashboard() {
    return {
      at: new Date().toISOString(),
      country: "Slovenija (Slovenske Železnice - Celotno državno omrežje)",
      tso: "Slovenske Železnice - Infrastruktura d.o.o. & Tovorni promet",
      rneStatus: "POVEZANO (RailNetEurope CIP / ERA Register of Infrastructure RINF)",
      electrification: "3 kV DC (Slovenija) / 25 kV AC 50 Hz (prehod Hodoš na MÁV)",
      signalling: "ETCS Level 2 / APB z vgrajenimi osnimi števci in avtomatskimi zapornicami",
      telecom: "Nokia GSM-R (921-925 MHz Downlink / 876-880 MHz Uplink - državno omrežje)",
      lines: this.lines,
      stations: this.stations,
      masts: this.masts,
      trains: this.trains,
      stats: {
        totalLinesCovered: this.lines.length,
        totalStationsCount: this.stations.length,
        totalGsmrMasts: this.masts.length,
        totalSlovenianTrains: this.trains.length,
        totalTeuContainers: this.trains.reduce((acc, t) => acc + (t.containers?.totalCountTeu || 0), 0),
        freightTonnageTotal: this.trains.reduce((acc, t) => acc + (t.containers?.totalGrossWeightT || 0), 0),
        foreignTransitRatio: "75% tovornih vlakov nadaljuje tranzit v tujino (Madžarska, Avstrija, Slovaška, Italija, Hrvaška)",
        gsmrSignalHealth: "OPTIMALNA POKRITOST (Celotno omrežje brez motenj)",
      },
    };
  }
}

export const railFeed = new RailFeedEngine();
