import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { LiveBoardMap, type MapOverlay, type RainSnap } from "../components/LiveBoardMap";
import { AsterixRadarScope } from "../components/AsterixRadarScope";
import { AsterixCadRadarScope } from "../components/AsterixCadRadarScope";
import { B2BExchangeDashboard } from "../components/B2BExchangeDashboard";
import { SpottingTacticalFeed } from "../components/SpottingTacticalFeed";
import { CyberAuditDashboard } from "../components/CyberAuditDashboard";
import { LiveStream } from "../components/LiveStream";
import { TelemetryHud, PlaneHud } from "../components/Gauges";
import { LiveGraph, Spark } from "../components/Spark";
import {
  ALT_BANDS,
  PLACES,
  ago,
  barPct,
  belongs,
  focusId,
  fmtAltM,
  fmtKmh,
  fmtLenKm,
  identLabel,
  loadOps,
  type Gtw,
  type Msg,
  type OpsSnap,
  type PlaceId,
  type Plane,
  type Sensor,
} from "../lib";

const socket = io({ transports: ["websocket", "polling"] });

type View = "ops" | "lora" | "sensors" | "radar" | "data" | "b2b" | "spotting" | "cyber" | "cad";
type RoleFilter = "sky" | "all" | "uav" | "gnd" | "modes" | "bird" | "echo" | "soar" | "glider" | "balloon" | "chute" | "aero" | "local" | "low" | "silent" | "jet" | "heli" | "small" | "unknown" | "heard" | "nm" | "fpl" | "ifps" | "arr" | "asterix";
const ROLE_LAB: Record<RoleFilter, string> = {
  all: "All",
  local: "LJMS",
  asterix: "ASTX",
  low: "Low",
  chute: "Jump",
  aero: "Aero",
  balloon: "Balloon",
  nm: "NM",
  fpl: "FPL",
  ifps: "IFPS",
  arr: "Arrivals",
  heard: "Radio",
  silent: "UID",
  sky: "No jets",
  uav: "Drones",
  bird: "Birds",
  echo: "Passive",
  soar: "PARA",
  glider: "Glider",
  gnd: "Gnd",
  modes: "Mode S",
  jet: "Jets",
  heli: "Heli",
  small: "Small",
  unknown: "Unknown",
};

const LJMS_APT = { lat: 46.6292, lon: 16.1908 };
const LJCE_APT = { lat: 45.9003, lon: 15.5303 };
const NOVO_MESTO = { lat: 45.804, lon: 15.169 };
const RAKICAN_PAD = { lat: 46.65107, lon: 16.16639 };

function diskRing(lat: number, lon: number, km: number, n = 28): [number, number][] {
  const dlat = km / 111.32;
  const dlon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [lat + dlat * Math.sin(a), lon + dlon * Math.cos(a)] as [number, number];
  });
}
type WigleSnap = {
  n: number;
  wifi: number;
  bluetooth: number;
  cell: number;
  howto?: { app: string; url: string; get?: string; apk?: string; steps: string[] };
};
type SdrFeeder = {
  n: number;
  items: { hex: string; flight?: string; lat?: number; lon?: number }[];
  feeder: { tcpHost: string; tcpPort: number; clients: number; frames: number; lastAt: number; lastErr?: string };
  howto: {
    phone: { title: string; steps: string[] };
    tcp: { host: string; port: number };
    http: { url: string; method: string; body: string };
  };
};
type RfSnap = {
  n: number;
  ism: number;
  aprs: number;
  ais: number;
  station?: { lat: number; lon: number; name?: string; mhz?: number; mode?: string } | null;
  howto?: { url: string; get?: string; site?: string; steps: string[]; bands?: { mhz: number; title: string; dest: string; decoder: string }[] };
};

type DataLayer = "all" | "met" | "arr" | "nm" | "sig" | "wx" | "uav" | "apt" | "su" | "cns" | "catalog";
const DATA_LAB: Record<DataLayer, string> = {
  all: "All",
  met: "METAR",
  arr: "Arrivals",
  nm: "NM",
  sig: "SIGMET",
  wx: "Alerts",
  uav: "Drones",
  apt: "Airports",
  su: "CRCO SU",
  cns: "CNS 025",
  catalog: "Catalog",
};

function metColor(cat?: string) {
  if (cat === "LIFR") return "#ff5d5d";
  if (cat === "IFR") return "#ff8a3d";
  if (cat === "MVFR") return "#f5b942";
  return "#3ee07a";
}

const SENSOR_KINDS = [
  { id: "all", lab: "All" },
  { id: "air", lab: "Air" },
  { id: "climate", lab: "Climate" },
  { id: "switch", lab: "Switches" },
  { id: "mesh", lab: "Mesh" },
  { id: "gateway", lab: "Gateways" },
  { id: "train", lab: "SŽ GPS" },
  { id: "wifi", lab: "Wi-Fi" },
  { id: "bluetooth", lab: "Bluetooth" },
  { id: "cell", lab: "Cell" },
  { id: "ism", lab: "ISM" },
  { id: "aprs", lab: "APRS" },
  { id: "ais", lab: "AIS" },
  { id: "sdr", lab: "MS SDR" },
];

export function OpsPage(props: { view: View }) {
  const { view } = props;
  const [place, setPlace] = useState<PlaceId>("si");
  const [snap, setSnap] = useState<OpsSnap | null>(null);
  const [liveUrl, setLiveUrl] = useState("");
  const [pick, setPick] = useState("");
  const [err, setErr] = useState("");
  const [kind, setKind] = useState("all");
  const [role, setRole] = useState<RoleFilter>("all");
  const [wxOn, setWxOn] = useState(true);
  const [rain, setRain] = useState<RainSnap | null>(null);
  const [dataLayer, setDataLayer] = useState<DataLayer>("all");
  const [live, setLive] = useState<Msg[]>([]);
  const [sheet, setSheet] = useState(false);
  const [radarScopeMode, setRadarScopeMode] = useState(false);
  const [dronetagOps, setDronetagOps] = useState<any[]>([]);
  const [notamsData, setNotamsData] = useState<any[]>([]);
  const [weatherData, setWeatherData] = useState<any[]>([]);
  const [feeder, setFeeder] = useState<SdrFeeder | null>(null);
  const [wigle, setWigle] = useState<WigleSnap | null>(null);
  const [rf, setRf] = useState<RfSnap | null>(null);
  const [rid, setRid] = useState<{
    n?: number;
    feeds?: number;
    items?: { id: string; serial?: string; call?: string; model?: string; lat?: number; lon?: number }[];
    origin?: { ok?: boolean; json?: boolean; post?: boolean; feed?: boolean; poll?: boolean; pollUrl?: string; note?: string };
    catalog?: { id: string; name: string; url: string; kind?: string; public?: boolean; feed?: boolean; note?: string; contentType?: string; status?: number; bytes?: number }[];
    howto?: { url?: string; post?: string; method?: string; body?: string; verifier?: string; dronescout?: string; dronetag?: string; esp32?: string; djiFeedback?: string; poll?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [nm, setNm] = useState<{ fmp?: string; n?: number; theater?: number; touching?: number; fmps?: { fmp?: string; n?: number }[]; source?: { portal?: string; fmps?: string[] }; regulations?: { id: string; name: string; reason?: string; delay?: number; n?: number; fmp?: string; lat?: number; lon?: number }[] } | null>(null);
  const [ecDash, setEcDash] = useState<{
    n?: number;
    feeds?: number;
    version?: string;
    si?: { flights?: number | null; delayMin?: number | null; vsPrevPct?: number | null; vs2019Pct?: number | null; rank?: number | null; y2d?: number | null; co2?: number | null; billed?: number | null; sync?: { date?: string; id?: number; country?: string } };
    network?: { flights?: number | null; delayMin?: number | null; vsPrevPct?: number | null; co2?: number | null; sync?: { date?: string } };
    sitrep?: { title?: string; date?: string; flights?: number | null; delayMin?: number | null };
    liveNet?: { airborne?: number; landed?: number; planned?: number; total?: number; delayMin?: number; top?: { name: string; delay: number; avg: number }[]; liveTop?: { name: string; delay: number; avg: number }[]; url?: string; feed?: boolean };
    news?: { title?: string; date?: string; url?: string };
    airport?: { code?: string; name?: string };
    livetraffic?: { url?: string; onRadar?: boolean; fmp?: string };
    origin?: { ok?: boolean; feed?: boolean; json?: boolean; cors?: string; version?: string; dataApp?: string; listing?: { ok?: boolean; status?: number; bytes?: number; livetraffic?: boolean; url?: string } };
    offers?: { id: string; name: string; url: string; kind: string; live: boolean; feed: boolean; note?: string }[];
    sitemap?: { id: string; name: string; url: string; kind?: string; feed?: boolean; html?: boolean; pdf?: boolean; bytes?: number; contentType?: string; status?: number; note?: string }[];
    sitemapN?: number;
    sitemapFeeds?: number;
    howto?: { url?: string; listing?: string; livetraffic?: string; dataApp?: string; nsv?: string; aiuPortal?: string; aiuLive?: string; adrr?: string; prc?: string; ourData?: string; uas?: string; ans?: string; trendsPdf?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [ecApt, setEcApt] = useState<{
    n?: number;
    day?: string;
    withMetrics?: number;
    events?: number;
    airports?: {
      id: string;
      code: string;
      name: string;
      lat: number;
      lon: number;
      flights?: number | null;
      vsPrevPct?: number | null;
      delayMin?: number | null;
      events?: { title?: string; detail?: string; start?: string; end?: string }[];
      focus?: boolean;
    }[];
  } | null>(null);
  const [crco, setCrco] = useState<{
    n?: number;
    year?: number;
    month?: string;
    slovenia?: { actual?: number | null; vsPlanPct?: number | null; month?: string };
    total?: { actual?: number | null; vsPlanPct?: number | null };
    zones?: {
      id: string;
      state: string;
      code: string;
      ansp?: string;
      fab?: string;
      lat?: number | null;
      lon?: number | null;
      month?: string;
      actual?: number | null;
      plan?: number | null;
      prev?: number | null;
      cumul?: number | null;
      vsPlanPct?: number | null;
      vsPrevPct?: number | null;
    }[];
  } | null>(null);
  const [eaup, setEaup] = useState<{
    n?: number;
    feeds?: number;
    origin?: { ok?: boolean; status?: number; title?: string; gwt?: boolean; feed?: boolean; bytes?: number; moduleBytes?: number; moduleLibrary?: string; viewId?: string; portal?: string; url?: string };
    howto?: { url?: string; view?: string; nop?: string; portal?: string; viewId?: string; module?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [mainpages, setMainpages] = useState<{
    n?: number;
    feeds?: number;
    origin?: {
      ok?: boolean;
      status?: number;
      gwt?: boolean;
      feed?: boolean;
      json?: boolean;
      contentType?: string;
      lastModified?: string;
      headOnly?: boolean;
      bytes?: number;
      nocacheBytes?: number;
      nocacheLibrary?: string;
      permutationKnown?: boolean;
      strongName?: string;
      portal?: string;
      module?: string;
      url?: string;
    };
    howto?: { url?: string; cacheJs?: string; nocache?: string; nop?: string; portal?: string; module?: string; strongName?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [fpl, setFpl] = useState<{
    n?: number;
    live?: { flight?: string; dep?: string; dest?: string; route?: string; si?: boolean; altFt?: number; gs?: number }[];
    items?: { flight?: string; dep?: string; dest?: string }[];
    origin?: { n?: number; cached?: number; hits?: number; misses?: number; route?: string; feed?: boolean; host?: string };
    howto?: { url?: string; tracking?: string; route?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [arrivals, setArrivals] = useState<{
    n?: number;
    si?: number;
    live?: { flight?: string; dep?: string; dest?: string; route?: string; remKm?: number | null; etaMin?: number | null; phase?: string; altFt?: number; gs?: number; si?: boolean; airport?: string }[];
    boards?: { icao: string; iata?: string; name?: string; si?: boolean; n: number; items: { flight?: string; dep?: string; dest?: string; remKm?: number | null; etaMin?: number | null; phase?: string; altFt?: number }[] }[];
    airports?: { icao?: string; iata?: string; name?: string }[];
    fids?: { ok?: boolean; status?: number; feed?: boolean; json?: boolean; url?: string; note?: string; error?: string };
    opensky?: { ok?: boolean; feed?: boolean; n?: number; error?: string; icao?: string };
    origin?: { feed?: boolean; json?: boolean; route?: string; airport?: string; n?: number };
    howto?: { url?: string; fids?: string; opensky?: string; route?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [met, setMet] = useState<{
    n?: number;
    feeds?: number;
    metars?: { icao: string; raw?: string; fltCat?: string; tempC?: number | null; wspdKt?: number | null; visib?: string; name?: string; si?: boolean; lat?: number | null; lon?: number | null }[];
    tafs?: { icao: string; raw?: string; issued?: string; si?: boolean }[];
    sigmets?: { id: string; fir?: string; firName?: string; hazard?: string; raw?: string; si?: boolean; europe?: boolean; lat?: number | null; lon?: number | null; ring?: [number, number][] }[];
    alarms?: { id: string; event?: string; headline?: string; severity?: string; area?: string; expires?: string; lat?: number | null; lon?: number | null; ring?: [number, number][] }[];
    siSigmets?: number;
    europeSigmets?: number;
    origin?: { metar?: string; taf?: string; isigmet?: string; meteoalarm?: string };
    howto?: { url?: string; metar?: string; isigmet?: string; meteoalarm?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [ifps, setIfps] = useState<{
    n?: number;
    pasted?: number;
    feeds?: number;
    edition?: string;
    portal?: string;
    live?: { flight?: string; dep?: string; dest?: string; route?: string; si?: boolean; ifps?: boolean; altFt?: number }[];
    items?: { flight?: string; dep?: string; dest?: string; known?: string[]; skipped?: string[] }[];
    origin?: { ok?: boolean; feed?: boolean; json?: boolean; zone?: string; n?: number };
    nmManual?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string };
    webManual?: { ok?: boolean; bytes?: number; pdf?: boolean; feed?: boolean };
    howto?: { url?: string; manual?: string; webManual?: string; ifpuv?: string; portal?: string; edition?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [asterix, setAsterix] = useState<{
    n?: number;
    stations?: number;
    feeds?: number;
    cats?: number[];
    part4?: { name?: string; tool?: string; version?: string; not?: string };
    ground?: {
      id: string;
      sac?: number | null;
      sic?: number | null;
      lat?: number | null;
      lon?: number | null;
      nogo?: boolean;
      ops?: string;
      sstat?: string;
      designator?: string;
      reportName?: string;
    }[];
    radar?: { lat?: number; lon?: number } | null;
    specs?: { cat025?: { edition?: string; name?: string; url?: string; pdf?: string; feed?: boolean }; cat048?: { edition?: string; name?: string; url?: string; pdf?: string; feed?: boolean } };
    origin?: { ok?: boolean; json?: boolean; raw?: boolean; post?: boolean; feed?: boolean; poll?: boolean; pollUrl?: string; radar?: boolean; tool?: string; version?: string; note?: string; repo?: string };
    howto?: {
      tool?: string;
      post?: string;
      poll?: string;
      note?: string;
      steps?: string[];
      exampleRadar?: { lat?: number; lon?: number; note?: string };
      body?: string;
      spec025?: { edition?: string; name?: string; url?: string; feed?: boolean };
    };
  } | null>(null);
  const [apt, setApt] = useState<{
    n?: number;
    feeds?: number;
    edition?: string;
    issued?: string;
    reference?: string;
    origin?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string; edition?: string };
    howto?: { url?: string; pdf?: string; edition?: string; issued?: string; reference?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [ogc, setOgc] = useState<{
    n?: number;
    feeds?: number;
    doc?: string;
    title?: string;
    issued?: string;
    category?: string;
    origin?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string; lastModified?: string; doc?: string };
    howto?: { url?: string; pdf?: string; site?: string; doc?: string; title?: string; issued?: string; category?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [esassp, setEsassp] = useState<{
    n?: number;
    feeds?: number;
    edition?: string;
    volume?: string;
    issued?: string;
    title?: string;
    origin?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string; lastModified?: string };
    pdf?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    mica?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string; edition?: string; issued?: string };
    service?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; html?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    smget?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; html?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    amc?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; html?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    howto?: { url?: string; pdf?: string; mica?: string; service?: string; smget?: string; amc?: string; edition?: string; volume?: string; issued?: string; title?: string; micaTitle?: string; micaEdition?: string; micaIssued?: string; serviceTitle?: string; smgetTitle?: string; amcTitle?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [airm, setAirm] = useState<{
    n?: number;
    feeds?: number;
    title?: string;
    models?: { id: string; name: string; url: string; note?: string }[];
    origin?: { ok?: boolean; status?: number; challenge?: boolean; feed?: boolean; html?: boolean; json?: boolean; title?: string; bytes?: number; contentType?: string; url?: string; models?: string[] };
    howto?: { url?: string; page?: string; site?: string; title?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [eatm, setEatm] = useState<{
    n?: number;
    feeds?: number;
    origin?: { ok?: boolean; status?: number; challenge?: boolean; feed?: boolean; html?: boolean; json?: boolean; title?: string; code?: string; name?: string; model?: string; url?: string; bytes?: number };
    howto?: { url?: string; stakeholder?: string; portal?: string; list?: string; code?: string; name?: string; model?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [swim, setSwim] = useState<{
    n?: number;
    origin?: { ok?: boolean; status?: number; challenge?: boolean; jsonapi?: boolean };
    ais?: { wiki?: string; geo?: string; geoEmpty?: boolean; title?: string; binding?: string; wfsPath?: string; afod?: string; ead?: string };
    openatm?: {
      name?: string;
      edition?: string;
      provider?: string;
      nInterfaces?: number;
      endpoints?: number;
      placeholders?: number;
      geo?: string;
      transport?: string;
      url?: string;
      challenge?: boolean;
      json?: boolean;
      status?: number;
    };
    aman?: {
      name?: string;
      edition?: string;
      provider?: string;
      nInterfaces?: number;
      endpoints?: number;
      placeholders?: number;
      geo?: string;
      transport?: string;
      url?: string;
      challenge?: boolean;
      json?: boolean;
      status?: number;
    };
    catalog?: { id: string; name: string; provider?: string; auth?: string; public?: boolean; note?: string; wiki?: string }[];
    publicLive?: { id: string; name: string; url: string; used?: boolean; note?: string }[];
    howto?: { url?: string; registry?: string; reference?: string; schema?: string; aisWiki?: string; openatmJson?: string; amanJson?: string; steps?: string[]; note?: string };
  } | null>(null);
  const [rtca, setRtca] = useState<{
    n?: number;
    origin?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; library?: string; json?: boolean; feed?: boolean; lastModified?: string; url?: string };
    aci?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    crocontrol?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string; contentType?: string };
    amc?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    amcWork?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    dnn?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    prism?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    amcPage?: { ok?: boolean; bytes?: number; contentType?: string; html?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    amcMaps?: { ok?: boolean; bytes?: number; contentType?: string; html?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    bootstrap?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string; contentType?: string };
    gtag?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    skybrary?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    ecFooter?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    aeropus?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string };
    easa?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string };
    beacon?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string };
    items?: { id: string; name: string; url: string; site?: string; library?: string; bytes?: number; feed?: boolean; contentType?: string; lastModified?: string }[];
    howto?: { url?: string; script?: string; site?: string; libs?: string; bootstrap?: string; gtag?: string; dialog?: string; footer?: string; footerSite?: string; footerLibs?: string; beacon?: string; easa?: string; kendo?: string; rtca?: string; crocontrol?: string; crocontrolSite?: string; amcSite?: string; amcAnon?: string; amcTitle?: string; amcMaps?: string; amcLogon?: string; amcComm?: string; amcWork?: string; dnn?: string; prism?: string; prismSite?: string; steps?: string[]; note?: string };
  } | null>(null);

  const watchPlace: PlaceId = view === "radar" || view === "data" ? "si" : place;

  useEffect(() => {
    let stop = false;
    const apply = (s: OpsSnap) => {
      if (stop) return;
      setSnap(s);
      setErr(s.radar?.error || s.lora?.error || s.sensors?.error || "");
    };
    void loadOps(watchPlace, view).then(apply).catch((e) => setErr(String(e)));
    socket.emit("watch", { place: watchPlace, view });
    const onOps = (s: OpsSnap) => apply(s);
    socket.on("ops", onOps);
    const onPkt = (m: Msg) => setLive((cur) => [m, ...cur].slice(0, 80));
    socket.on("pkt", onPkt);
    const t = window.setInterval(() => {
      if (socket.connected) return;
      void loadOps(watchPlace, view).then(apply).catch(() => {});
    }, 12_000);
    return () => {
      stop = true;
      socket.off("ops", onOps);
      socket.off("pkt", onPkt);
      window.clearInterval(t);
    };
  }, [watchPlace, view]);

  useEffect(() => {
    if (view === "data") setSheet(true);
  }, [view]);

  useEffect(() => {
    let stop = false;
    const pull = () => {
      void fetch("/api/health")
        .then((r) => r.json())
        .then((d) => {
          if (!stop && typeof d?.url === "string" && /^https?:\/\//i.test(d.url)) setLiveUrl(d.url.replace(/\/$/, ""));
        })
        .catch(() => {});
    };
    pull();
    const t = window.setInterval(pull, 20_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (view !== "radar" && view !== "data") return;
    let stop = false;
    const pull = () => {
      void fetch("/api/rainviewer")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setRain(d);
        })
        .catch(() => {});
    };
    pull();
    const t = window.setInterval(pull, 60_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [view]);

  useEffect(() => {
    let stop = false;
    const pullAviationFeeds = () => {
      void fetch("/api/dronetag/operations")
        .then((r) => r.json())
        .then((d) => {
          if (!stop && Array.isArray(d?.operations)) setDronetagOps(d.operations);
        })
        .catch(() => {});
      void fetch("/api/aviation/notams")
        .then((r) => r.json())
        .then((d) => {
          if (!stop && Array.isArray(d?.notams)) setNotamsData(d.notams);
        })
        .catch(() => {});
      void fetch("/api/aviation/weather")
        .then((r) => r.json())
        .then((d) => {
          if (!stop && Array.isArray(d?.stations)) setWeatherData(d.stations);
        })
        .catch(() => {});
    };
    pullAviationFeeds();
    const t = window.setInterval(pullAviationFeeds, 45_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (view !== "data") return;
    let stop = false;
    const pull = () => {
      void fetch("/api/sdr")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setFeeder(d);
        })
        .catch(() => {});
      void fetch("/api/rid")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setRid(d);
        })
        .catch(() => {});
      void fetch("/api/asterix")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setAsterix(d);
        })
        .catch(() => {});
      void fetch("/api/wigle")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setWigle(d);
        })
        .catch(() => {});
      void fetch("/api/rf")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setRf(d);
        })
        .catch(() => {});
      void fetch("/api/nm")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setNm(d);
        })
        .catch(() => {});
      void fetch("/api/ec-dash")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setEcDash(d);
        })
        .catch(() => {});
      void fetch("/api/ec-airports")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setEcApt(d);
        })
        .catch(() => {});
      void fetch("/api/crco")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setCrco(d);
        })
        .catch(() => {});
      void fetch("/api/eaup")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setEaup(d);
        })
        .catch(() => {});
      void fetch("/api/nm-gwt")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setMainpages(d);
        })
        .catch(() => {});
      void fetch("/api/eurofpl")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setFpl(d);
        })
        .catch(() => {});
      void fetch("/api/arrivals")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setArrivals(d);
        })
        .catch(() => {});
      void fetch("/api/met")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setMet(d);
        })
        .catch(() => {});
      void fetch("/api/ifps")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setIfps(d);
        })
        .catch(() => {});
      void fetch("/api/swim")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setSwim(d);
        })
        .catch(() => {});
      void fetch("/api/eatm")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setEatm(d);
        })
        .catch(() => {});
      void fetch("/api/apt-api")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setApt(d);
        })
        .catch(() => {});
      void fetch("/api/ogc")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setOgc(d);
        })
        .catch(() => {});
      void fetch("/api/esassp")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setEsassp(d);
        })
        .catch(() => {});
      void fetch("/api/airm")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setAirm(d);
        })
        .catch(() => {});
      void fetch("/api/chrome")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setRtca(d);
        })
        .catch(() => {});
    };
    pull();
    const t = window.setInterval(pull, 4_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [view]);

  useEffect(() => {
    setPick("");
    setKind("all");
    setRole("all");
  }, [place]);

  const loc = PLACES.find((p) => p.id === place) || PLACES[0];
  const mapLoc =
    view === "radar" && (role === "local" || role === "chute" || place === "ms")
      ? { lat: LJMS_APT.lat, lon: LJMS_APT.lon, zoom: 11 }
      : view === "radar" && role === "heli"
        ? { lat: RAKICAN_PAD.lat, lon: RAKICAN_PAD.lon, zoom: 14 }
      : view === "radar" && place === "ce"
        ? { lat: LJCE_APT.lat, lon: LJCE_APT.lon, zoom: 11 }
        : view === "radar" && place === "nmesto"
          ? { lat: NOVO_MESTO.lat, lon: NOVO_MESTO.lon, zoom: 11 }
      : view === "radar" && role === "aero"
        ? { lat: loc.lat, lon: loc.lon, zoom: Math.max(loc.zoom, 9) }
      : view === "radar" && role === "echo"
        ? { lat: loc.lat, lon: loc.lon, zoom: Math.max(loc.zoom, 8) }
        : loc;
  const radar = snap?.radar;
  const lora = snap?.lora;
  const sensors = snap?.sensors;
  const planesAll = radar?.items || [];
  const planes = useMemo(() => {
    if (role === "all") return planesAll;
    if (role === "sky") return planesAll.filter((p) => p.role !== "jet");
    if (role === "bird") return planesAll.filter((p) => p.role === "bird");
    if (role === "echo") return planesAll.filter((p) => p.src === "echo" || p.src === "psr");
    if (role === "soar") return planesAll.filter((p) => p.role === "soar");
    if (role === "glider") return planesAll.filter((p) => p.role === "glider");
    if (role === "balloon") return planesAll.filter((p) => p.role === "balloon");
    if (role === "local") return planesAll.filter((p) => p.local || p.taxi);
    if (role === "asterix") return planesAll.filter((p) => p.asterix || p.src === "asterix" || p.src === "psr");
    if (role === "low") return planesAll.filter((p) => p.low || p.fastLow || p.taxi || p.onDeck);
    if (role === "chute") return planesAll.filter((p) => p.role === "chute" || p.jump);
    if (role === "aero") return planesAll.filter((p) => p.role === "aero");
    if (role === "silent") return planesAll.filter((p) => p.silent || p.src === "mlat" || p.flight === "NO CALL" || p.role === "unknown");
    if (role === "heard") return planesAll.filter((p) => p.heard || p.src === "sdr" || p.src === "mlat");
    if (role === "nm") return planesAll.filter((p) => p.nm || p.src === "nm");
    if (role === "fpl") return planesAll.filter((p) => p.fpl || p.ifps || p.src === "fpl");
    if (role === "ifps") return planesAll.filter((p) => p.ifps || p.src === "ifps");
    if (role === "arr") return planesAll.filter((p) => /^LJ/i.test(p.dest || ""));
    if (role === "gnd") return planesAll.filter((p) => p.role === "ground" || p.onDeck || p.taxi);
    if (role === "modes") {
      return planesAll.filter(
        (p) =>
          p.role === "modes" ||
          p.src === "mode_s" ||
          p.noPos ||
          (/mode_s|tisb|adsb_icao_nt/i.test(`${p.src || ""} ${p.adsbType || ""}`) && p.role !== "ground"),
      );
    }
    return planesAll.filter((p) => p.role === role);
  }, [planesAll, role]);
  const gtws = lora?.gateways || [];
  const senseItems = sensors?.items || [];
  const msgs = useMemo(() => {
    const raw = [...(lora?.messages || []), ...(sensors?.messages || [])];
    const seen = new Set<string>();
    return raw
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  }, [lora, sensors]);
  const filteredSensors = kind === "all" ? senseItems : senseItems.filter((s) => s.kind === kind);
  const graphs = sensors?.graphs || [];
  const focusing = Boolean(pick);
  const stream = useMemo(() => {
    const raw = [...live, ...(lora?.stream || []), ...msgs];
    const seen = new Set<string>();
    return raw.filter((m) => {
      if (!m?.id || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [live, lora, msgs]);
  const focusedStream = useMemo(() => (focusing ? stream.filter((m) => belongs(pick, m)) : stream), [focusing, stream, pick]);

  const picked = useMemo(() => {
    if (!pick) return null;
    return (
      planesAll.find((p) => p.id === pick) ||
      gtws.find((g) => belongs(pick, g)) ||
      lora?.nodes?.find((n) => belongs(pick, n)) ||
      senseItems.find((s) => belongs(pick, s)) ||
      stream.find((m) => belongs(pick, m)) ||
      msgs.find((m) => belongs(pick, m)) ||
      null
    );
  }, [pick, planesAll, gtws, lora, senseItems, msgs, stream]);

  const kpis =
    view === "lora"
      ? [
          ["Gateways", lora?.nGtw ?? "—"],
          ["Online", lora?.nOnline ?? "—"],
          ["Mesh", lora?.nMesh ?? "—"],
          ["Messages", lora?.nMsg ?? "—"],
        ]
      : view === "sensors"
        ? [
            ["Nodes", sensors?.n ?? "—"],
            ["ISM", sensors?.counts?.ism ?? 0],
            ["APRS", sensors?.counts?.aprs ?? 0],
            ["MS SDR", sensors?.counts?.sdr ?? 0],
          ]
        : view === "radar"
          ? [
              ["Tracks", radar?.n ?? "—"],
              ["Gnd", radar?.counts?.ground ?? 0],
              ["ASTX", radar?.counts?.asterix ?? 0],
              ["Mode S", radar?.counts?.modes ?? 0],
              ["UAV", radar?.counts?.uav ?? 0],
              ["Passive", radar?.counts?.echo ?? 0],
            ]
        : view === "data"
          ? dataLayer === "catalog"
            ? [
                ["Airborne", ecDash?.liveNet?.airborne ?? "—"],
                ["Delay min", ecDash?.liveNet?.delayMin ?? "—"],
                ["Planned", ecDash?.liveNet?.planned ?? "—"],
                ["SI daily", ecDash?.si?.flights ?? "—"],
              ]
            : [
              ["METAR", met?.metars?.length ?? "—"],
              ["Arrivals", arrivals?.n ?? 0],
              ["SIGMET", met?.europeSigmets ?? 0],
              ["Alerts", met?.alarms?.length ?? 0],
            ]
        : [
            ["Aircraft", radar?.n ?? "—"],
              ["Gateways", lora?.nGtw ?? "—"],
              ["Sensors", sensors?.n ?? "—"],
              ["Messages", lora?.nMsg ?? "—"],
            ];

  const title =
    view === "lora"
      ? "LoRaWAN"
      : view === "sensors"
        ? "Sensors"
        : view === "radar"
          ? place === "ms"
            ? "LJMS Murska Sobota"
            : place === "nmesto"
              ? "Novo mesto"
              : place === "ce"
                ? "LJCE Cerklje"
            : "Slovenia passive radar"
          : view === "data"
            ? "Data"
            : view === "b2b"
              ? "B2B / FPL"
              : view === "spotting"
                ? "Tactical Spotting"
                : view === "cyber"
                  ? "Cyber OSINT"
                  : "Operations";
  const note =
    view === "lora"
      ? lora?.note
      : view === "sensors"
        ? sensors?.note
        : view === "radar"
          ? radar?.note
          : view === "b2b"
            ? "Eurocontrol NM B2B, ICAO Doc 4444 validator, and OpenSky route resolver."
            : view === "spotting"
              ? "Unexpected arrivals, Pilatus military flights, Fraport Brnik extranet, and airband radio."
              : view === "cyber"
                ? "Defensive DNS/DMARC postures, crt.sh transparency logs, HTTP security headers, and GCP Spark analytics."
                : view === "data"
                  ? "Live METAR, SIGMET, arrivals, NSV — tap a row or the map."
                  : "All live public feeds at once. Empty is a fact. No simulation.";

  const showPlanes = view === "ops" || view === "radar" || view === "data";
  const showGtw = view === "ops" || view === "lora";
  const showSensors = view === "ops" || view === "sensors" || view === "lora";
  const meshNodes = lora?.nodes || [];
  const pickedMesh = meshNodes.find((n) => belongs(pick, n)) || null;
  const mapSensors = view === "lora" ? (gtws as Sensor[]) : kind === "all" ? senseItems : filteredSensors;
  const mapMesh = focusing ? meshNodes.filter((n) => belongs(pick, n)) : meshNodes;
  const mapSense = focusing ? mapSensors.filter((s) => belongs(pick, s)) : mapSensors;
  const mapGtw = focusing ? gtws.filter((g) => belongs(pick, g)) : gtws;
  const mapPlanes = focusing ? planes.filter((p) => p.id === pick) : planes;
  const dataOverlays = useMemo(() => {
    if (view !== "data") return [] as MapOverlay[];
    const want = (k: DataLayer) => dataLayer === "all" || dataLayer === k;
    const out: MapOverlay[] = [];
    if (want("met")) {
      for (const m of met?.metars || []) {
        if (m.lat == null || m.lon == null) continue;
        out.push({ id: `met:${m.icao}`, kind: "met", lat: m.lat, lon: m.lon, label: m.icao, color: metColor(m.fltCat) });
      }
    }
    if (want("sig")) {
      for (const s of met?.sigmets || []) {
        out.push({
          id: `sig:${s.id}`,
          kind: "sig",
          lat: s.lat,
          lon: s.lon,
          ring: s.ring as [number, number][] | undefined,
          label: (s.hazard || s.fir || "SIG").slice(0, 6),
          color: "#ff5d5d",
        });
      }
    }
    if (want("wx")) {
      for (const a of met?.alarms || []) {
        out.push({
          id: `wx:${a.id}`,
          kind: "wx",
          lat: a.lat,
          lon: a.lon,
          ring: a.ring as [number, number][] | undefined,
          label: (a.severity || "WX").slice(0, 6),
          color: "#f5b942",
        });
      }
    }
    if (want("nm")) {
      for (const r of nm?.regulations || []) {
        if (r.lat == null || r.lon == null) continue;
        out.push({ id: `nmr:${r.id}`, kind: "nm", lat: r.lat, lon: r.lon, label: String(r.name || r.id).slice(0, 6), color: "#9ad0ff" });
      }
    }
    if (want("uav")) {
      for (const p of planesAll) {
        if (!(p.role === "uav" || p.src === "rid")) continue;
        if (p.operator?.lat != null && p.operator?.lon != null) {
          out.push({ id: `op:${p.id}`, kind: "uav", lat: p.operator.lat, lon: p.operator.lon, label: "PILOT", color: "#ff8a3d" });
        }
        if (p.home?.lat != null && p.home?.lon != null) {
          out.push({ id: `home:${p.id}`, kind: "uav", lat: p.home.lat, lon: p.home.lon, label: "HOME", color: "#f5d742" });
        }
      }
    }
    if (want("apt")) {
      for (const a of ecApt?.airports || []) {
        if (a.lat == null || a.lon == null) continue;
        const delay = Number(a.delayMin) || 0;
        const live = planesAll.filter((p) => String(p.dest || "").toUpperCase() === a.code).length;
        const n = live || a.flights;
        out.push({
          id: a.id,
          kind: "apt",
          lat: a.lat,
          lon: a.lon,
          label: n != null ? `${a.code.slice(2)}${Math.round(Number(n))}`.slice(0, 6) : a.code.slice(2),
          color: delay >= 5 ? "#ff5d5d" : delay > 0 ? "#f5b942" : (a.events?.length ? "#ff8a3d" : "#3ee0c2"),
        });
      }
    }
    if (want("cns")) {
      for (const s of asterix?.ground || []) {
        if (s.lat == null || s.lon == null) continue;
        const bad = s.nogo || s.sstat === "failed";
        out.push({
          id: s.id,
          kind: "cns",
          lat: s.lat,
          lon: s.lon,
          label: (s.designator || `S${s.sac ?? 0}/${s.sic ?? 0}`).replace(/\s+/g, "").slice(0, 6),
          color: bad ? "#ff5d5d" : s.sstat === "degraded" ? "#f5b942" : "#7dffb3",
        });
      }
    }
    if (want("su")) {
      for (const z of crco?.zones || []) {
        if (z.lat == null || z.lon == null) continue;
        const vs = Number(z.vsPlanPct);
        const k = z.actual != null ? Math.round(z.actual / 1000) : "";
        out.push({
          id: z.id,
          kind: "su",
          lat: z.lat,
          lon: z.lon,
          label: `${z.code}${k}`.slice(0, 6),
          color: vs < 0 ? "#ff5d5d" : vs > 10 ? "#3ee07a" : "#f5d742",
        });
      }
    }
    return out;
  }, [view, dataLayer, met, nm, planesAll, ecApt, crco, asterix]);
  const droneOverlays = useMemo(() => {
    const out: MapOverlay[] = [];
    out.push({
      id: "apt:LJMS",
      kind: "apt",
      lat: LJMS_APT.lat,
      lon: LJMS_APT.lon,
      label: "LJMS",
      color: "#3ee0c2",
      ring: diskRing(LJMS_APT.lat, LJMS_APT.lon, 2.4),
    });
    out.push({
      id: "apt:RAKICAN",
      kind: "apt",
      lat: RAKICAN_PAD.lat,
      lon: RAKICAN_PAD.lon,
      label: "SBMS",
      color: "#ff8a3d",
      ring: diskRing(RAKICAN_PAD.lat, RAKICAN_PAD.lon, 0.45),
    });
    out.push({
      id: "apt:LJCE",
      kind: "apt",
      lat: LJCE_APT.lat,
      lon: LJCE_APT.lon,
      label: "LJCE",
      color: "#c77dff",
      ring: diskRing(LJCE_APT.lat, LJCE_APT.lon, 3.2),
    });
    out.push({
      id: "apt:NM",
      kind: "apt",
      lat: NOVO_MESTO.lat,
      lon: NOVO_MESTO.lon,
      label: "NM",
      color: "#f5d742",
      ring: diskRing(NOVO_MESTO.lat, NOVO_MESTO.lon, 2.6),
    });
    for (const p of planesAll) {
      if (!(p.role === "uav" || p.src === "rid")) continue;
      if (p.operator?.lat != null && p.operator?.lon != null) {
        out.push({ id: `op:${p.id}`, kind: "uav", lat: p.operator.lat, lon: p.operator.lon, label: "PILOT", color: "#ff8a3d" });
      }
      if (p.home?.lat != null && p.home?.lon != null) {
        out.push({ id: `home:${p.id}`, kind: "uav", lat: p.home.lat, lon: p.home.lon, label: "HOME", color: "#ffd24d" });
      }
    }
    for (const p of planesAll) {
      if (!(p.role === "chute" || p.jump) || !p.lat || !p.lon) continue;
      out.push({
        id: `drop:${p.id}`,
        kind: "drop",
        lat: p.lat,
        lon: p.lon,
        label: p.role === "chute" ? "JUMP" : "DROP",
        color: "#ff8a3d",
        ring: diskRing(p.lat, p.lon, p.role === "chute" ? 0.6 : 1.2),
      });
    }
    return out;
  }, [planesAll]);
  const dataRows = useMemo(() => {
    const rows: { id: string; kind: string; title: string; detail: string; raw?: string; stats?: [string, string][] }[] = [];
    const want = (k: DataLayer) => dataLayer === "all" || dataLayer === k;
    if (want("met")) {
      for (const m of met?.metars || []) {
        const taf = (met?.tafs || []).find((t) => t.icao === m.icao);
        const stats: [string, string][] = [];
        if (m.fltCat) stats.push(["CAT", m.fltCat]);
        if (m.name) stats.push(["Station", m.name]);
        if (m.tempC != null) stats.push(["Temp", `${m.tempC}°C`]);
        if (m.wspdKt != null) stats.push(["Wind", `${m.wspdKt} kt`]);
        if (m.visib) stats.push(["Vis", String(m.visib)]);
        if (taf?.raw) stats.push(["TAF", taf.raw]);
        rows.push({
          id: `met:${m.icao}`,
          kind: "met",
          title: `${m.icao} ${m.fltCat || ""}`.trim(),
          detail: m.raw || m.name || "",
          raw: m.raw,
          stats,
        });
      }
    }
    if (want("arr")) {
      for (const a of arrivals?.live || []) {
        const plane = planesAll.find((p) => String(p.flight || "").replace(/\s+/g, "") === a.flight);
        const stats: [string, string][] = [];
        stats.push(["Route", `${a.dep || "?"}→${a.dest}`]);
        if (a.phase) stats.push(["Phase", a.phase]);
        if (a.remKm != null) stats.push(["Remain", `${a.remKm} km`]);
        if (a.etaMin != null) stats.push(["ETA", `${a.etaMin} min`]);
        if (a.altFt) stats.push(["Alt", `${a.altFt} ft`]);
        if (a.gs) stats.push(["GS", `${a.gs} kt`]);
        rows.push({
          id: plane?.id || `arr:${a.flight}`,
          kind: "arr",
          title: `${a.flight} ${a.dep || "?"}→${a.dest}`,
          detail: [a.phase, a.remKm != null ? `${a.remKm} km` : "", a.etaMin != null ? `${a.etaMin} min` : "", a.altFt ? `${a.altFt} ft` : ""].filter(Boolean).join(" · "),
          stats,
        });
      }
    }
    if (want("nm")) {
      for (const r of (nm?.regulations || []).slice(0, 24)) {
        rows.push({
          id: `nmr:${r.id}`,
          kind: "nm",
          title: r.name || r.id,
          detail: `${r.reason || "ATFCM"} · ${r.n ?? 0} flts · delay ${r.delay ?? 0} min`,
          stats: [
            ["Reason", r.reason || "ATFCM"],
            ["Flights", String(r.n ?? 0)],
            ["Delay", `${r.delay ?? 0} min`],
            ["FMP", r.fmp || "NSV"],
          ],
        });
      }
    }
    if (want("sig")) {
      for (const s of met?.sigmets || []) {
        rows.push({
          id: `sig:${s.id}`,
          kind: "sig",
          title: `${s.fir || s.firName || "SIGMET"} ${s.hazard || ""}`.trim(),
          detail: s.raw || "",
          raw: s.raw,
          stats: [
            ["FIR", s.firName || s.fir || ""],
            ["Hazard", s.hazard || ""],
            ["Area", s.si ? "Slovenia" : s.europe ? "Europe" : ""],
          ].filter((x) => x[1]) as [string, string][],
        });
      }
    }
    if (want("wx")) {
      for (const a of met?.alarms || []) {
        rows.push({
          id: `wx:${a.id}`,
          kind: "wx",
          title: a.headline || a.event || "Warning",
          detail: [a.severity, a.area].filter(Boolean).join(" · "),
          stats: [
            ["Event", a.event || ""],
            ["Severity", a.severity || ""],
            ["Area", a.area || ""],
            ["Until", a.expires || ""],
          ].filter((x) => x[1]) as [string, string][],
        });
      }
    }
    if (want("uav")) {
      for (const p of planesAll) {
        if (!(p.role === "uav" || p.src === "rid")) continue;
        const stats: [string, string][] = [];
        stats.push(["Src", p.src || "uav"]);
        if (p.model || p.typecode) stats.push(["Model", String(p.model || p.typecode)]);
        if (p.altFt) stats.push(["Alt", fmtAltM(p.altFt)]);
        if (p.gs) stats.push(["GS", fmtKmh(p.gs)]);
        stats.push(["From LJLJ", `${p.km} km`]);
        rows.push({
          id: p.id,
          kind: "uav",
          title: trackLabel(p),
          detail: `${p.model || p.typecode || "UAV"} · ${p.src}`,
          stats,
        });
      }
    }
    if (want("apt")) {
      for (const a of ecApt?.airports || []) {
        const live = planesAll.filter((p) => String(p.dest || "").toUpperCase() === a.code).length;
        const ev = a.events?.[0];
        const stats: [string, string][] = [];
        if (a.flights != null) stats.push(["Day", `${Math.round(a.flights)} flts`]);
        if (a.vsPrevPct != null) stats.push(["vs yday", `${a.vsPrevPct}%`]);
        if (a.delayMin != null) stats.push(["Delay", `${a.delayMin} min`]);
        stats.push(["Live in", String(live)]);
        if (ev?.title) stats.push(["Event", ev.title]);
        rows.push({
          id: a.id,
          kind: "apt",
          title: `${a.code} ${a.name}`,
          detail: ev?.title || (a.flights != null ? `${Math.round(a.flights)} flights ${ecApt?.day || ""}` : "EUROCONTROL airport"),
          stats,
        });
      }
    }
    if (want("su")) {
      for (const z of crco?.zones || []) {
        const stats: [string, string][] = [];
        if (z.month) stats.push(["Month", `${z.month} ${crco?.year || ""}`.trim()]);
        if (z.actual != null) stats.push(["SU", Math.round(z.actual).toLocaleString("en-GB")]);
        if (z.plan != null) stats.push(["Plan", Math.round(z.plan).toLocaleString("en-GB")]);
        if (z.vsPlanPct != null) stats.push(["vs plan", `${z.vsPlanPct}%`]);
        if (z.vsPrevPct != null) stats.push(["vs y-1", `${z.vsPrevPct}%`]);
        if (z.ansp) stats.push(["ANSP", z.ansp]);
        rows.push({
          id: z.id,
          kind: "su",
          title: `${z.code} ${z.state}`,
          detail: z.actual != null ? `${Math.round(z.actual).toLocaleString("en-GB")} SU ${z.month || ""} · CRCO monthly` : "CRCO charging zone",
          stats,
        });
      }
    }
    if (want("cns")) {
      for (const s of asterix?.ground || []) {
        rows.push({
          id: s.id,
          kind: "cns",
          title: s.designator || `SAC ${s.sac ?? "—"} SIC ${s.sic ?? "—"}`,
          detail: [s.reportName || "CAT 025", s.sstat, s.nogo ? "NOGO" : "GO", s.ops].filter(Boolean).join(" · "),
          stats: [
            ["SAC/SIC", `${s.sac ?? "—"}/${s.sic ?? "—"}`],
            ["Status", s.sstat || "—"],
            ["OPS", s.ops || "—"],
            ["NOGO", s.nogo ? "yes" : "no"],
          ],
        });
      }
    }
    return rows;
  }, [dataLayer, met, arrivals, nm, planesAll, ecApt, crco, asterix]);
  const pickedData = useMemo(() => dataRows.find((r) => r.id === pick) || null, [dataRows, pick]);
  const dataCounts: Record<DataLayer, number | ""> = {
    all: (met?.metars?.length || 0) + (arrivals?.n || 0) + (met?.sigmets?.length || 0) + (met?.alarms?.length || 0) + (nm?.regulations?.length || 0) + planesAll.filter((p) => p.role === "uav" || p.src === "rid").length + (ecApt?.n || 0) + (crco?.zones?.length || 0) + (asterix?.ground?.length || 0),
    met: met?.metars?.length || 0,
    arr: arrivals?.n || 0,
    nm: planesAll.filter((p) => p.nm || p.src === "nm").length || nm?.theater || nm?.n || 0,
    sig: met?.sigmets?.length || 0,
    wx: met?.alarms?.length || 0,
    uav: planesAll.filter((p) => p.role === "uav" || p.src === "rid").length,
    apt: ecApt?.n || 0,
    su: crco?.zones?.length || 0,
    cns: asterix?.stations || asterix?.ground?.length || 0,
    catalog: "",
  };
  const dataPlanes = useMemo(() => {
    if (view !== "data") return mapPlanes;
    if (dataLayer === "met" || dataLayer === "sig" || dataLayer === "wx" || dataLayer === "apt" || dataLayer === "su" || dataLayer === "cns" || dataLayer === "catalog") return [];
    const flights = new Set((arrivals?.live || []).map((a) => a.flight));
    return planes.filter((p) => {
      const cs = String(p.flight || "").replace(/\s+/g, "");
      const arr = /^LJ/i.test(p.dest || "") || flights.has(cs);
      const isNm = Boolean(p.nm || p.src === "nm");
      const drone = p.role === "uav" || p.src === "rid";
      if (dataLayer === "arr") return arr;
      if (dataLayer === "nm") return isNm;
      if (dataLayer === "uav") return drone;
      return arr || isNm || Boolean(p.ifps) || drone;
    });
  }, [view, dataLayer, planes, arrivals]);
  const mapGraphs = focusing ? graphs.filter((g) => belongs(pick, g)) : graphs;
  const mapCards = focusing
    ? senseItems.filter((s) => belongs(pick, s))
    : view === "sensors"
      ? filteredSensors
      : senseItems.slice(0, 12);
  const mapNodes = focusing ? meshNodes.filter((n) => belongs(pick, n)) : meshNodes;
  const mapMsgs = focusing ? msgs.filter((m) => belongs(pick, m)) : msgs;
  const pickedSensor =
    (picked && !("flight" in picked && "altFt" in picked) && !("altKm" in picked) ? (picked as Sensor) : null) || pickedMesh;
  const pickedSeries = (pickedSensor?.series || []).filter((s) => (s.pts || []).length);

  const displayKpis =
    focusing && pickedMesh
      ? [
          ["Battery", pickedMesh.battery != null ? `${Math.round(Number(pickedMesh.battery))}%` : "—"],
          ["Temp", pickedMesh.temp != null ? `${Number(pickedMesh.temp).toFixed(1)}°C` : "—"],
          ["RSSI", pickedMesh.rssi != null ? `${pickedMesh.rssi} dBm` : "—"],
          ["Packets", focusedStream.length],
        ]
      : focusing && pickedSensor
        ? [
            [
              pickedSensor.primary?.title || pickedSensor.sensors?.[0]?.title || "Value",
              pickedSensor.primary?.last ?? pickedSensor.sensors?.[0]?.last ?? "—",
            ],
            ["Kind", pickedSensor.kind],
            ["Range", `${pickedSensor.km} km`],
            ["Packets", focusedStream.length],
          ]
        : kpis;

  const focus = (id: string) => setPick(id);
  const mapFull = view === "radar" || view === "ops" || (view === "data" && dataLayer !== "catalog");
  const pickedPlane = picked && "flight" in picked && "altFt" in picked ? (picked as Plane) : null;

  const chrome = (
    <>
      <header className="hud">
        <div className="hud-top">
          <small>
            <i className="pulse" /> {title.toUpperCase()} · LIVE
          </small>
          <LiveClock />
        </div>
        {view === "radar" || view === "data" ? (
          picked ? <b>{labelOf(picked)}</b> : pickedData ? <b>{pickedData.title}</b> : null
        ) : (
          <b>{picked ? labelOf(picked) : `${loc.name} ${title}`}</b>
        )}
        {view === "radar" ? (
          <button
            type="button"
            className="scope-toggle-btn"
            onClick={() => setRadarScopeMode((m) => !m)}
            style={{
              background: radarScopeMode ? "#287a55" : "rgba(30,60,50,0.6)",
              color: "#fff",
              border: "1px solid #3ee07a",
              borderRadius: "4px",
              padding: "2px 8px",
              fontSize: "11px",
              cursor: "pointer",
              marginLeft: "8px",
            }}
          >
            {radarScopeMode ? "MODE: CRT PPI SCOPE" : "MODE: INTERACTIVE MAP (ASTERIX CAD)"}
          </button>
        ) : null}
        <span>
          {displayKpis.map(([k, v]) => (
            <em key={String(k)}>
              <strong className="tick">{v}</strong> {k}
            </em>
          ))}
        </span>
        {liveUrl || snap?.publicUrl ? (
          <small className="pub-url">
            <a href={liveUrl || snap?.publicUrl} target="_blank" rel="noreferrer">
              {liveUrl || snap?.publicUrl}
            </a>
          </small>
        ) : null}
      </header>

      {view === "data" || view === "b2b" || view === "spotting" || view === "cyber" ? null : (
      <div className="chips" role="tablist" aria-label="region">
        {PLACES.map((p) => (
          <button key={p.id} type="button" className={place === p.id ? "on" : ""} onClick={() => setPlace(p.id)}>
            {p.name}
          </button>
        ))}
      </div>
      )}
      {focusing ? (
        <div className="focus-bar">
          <small>{view === "data" ? "FOCUSED" : "SHOWING ONLY"}</small>
          <b>{picked ? labelOf(picked) : pickedData?.title || pick}</b>
          <button type="button" onClick={() => setPick("")}>
            Show all
          </button>
        </div>
      ) : null}
      {err ? <p className="err">{err}</p> : null}
      {!snap ? <p className="note">Connecting to live feeds…</p> : null}

      {view === "data" ? (
        <div className="chips sub" role="tablist" aria-label="live data layer">
          {(["all", "met", "arr", "nm", "sig", "wx", "uav", "apt", "su", "cns", "catalog"] as DataLayer[]).map((k) => (
            <button
              key={k}
              type="button"
              className={dataLayer === k ? "on" : ""}
              onClick={() => {
                setDataLayer(k);
                setPick("");
                if (k !== "catalog") setSheet(true);
              }}
            >
              {DATA_LAB[k]}
              {dataCounts[k] !== "" ? ` ${dataCounts[k]}` : ""}
            </button>
          ))}
        </div>
      ) : null}

      {view === "radar" ? (
        <div className="chips sub" role="tablist" aria-label="aircraft type">
          {(["all", "local", "gnd", "low", "asterix", "echo", "heli", "chute", "aero", "balloon", "nm", "fpl", "ifps", "arr", "heard", "silent", "sky", "uav", "bird", "soar", "glider", "modes", "jet"] as RoleFilter[]).map((r) => {
            const n =
              r === "asterix"
                ? radar?.counts?.asterix
                : r === "echo"
                  ? radar?.counts?.echo
                  : r === "nm"
                    ? radar?.counts?.nm
                    : r === "fpl"
                      ? radar?.counts?.fpl
                      : r === "ifps"
                        ? radar?.counts?.ifps
                        : r === "arr"
                          ? radar?.counts?.arr
                          : r === "uav"
                            ? radar?.counts?.uav
                            : r === "modes"
                              ? radar?.counts?.modes
                              : r === "local"
                                ? radar?.counts?.local
                                : r === "gnd"
                                  ? radar?.counts?.ground
                                  : r === "low"
                                    ? radar?.counts?.low
                                    : undefined;
            return (
            <button key={r} type="button" className={role === r ? "on" : ""} onClick={() => setRole(r)}>
              {ROLE_LAB[r]}
              {n != null ? ` ${n}` : ""}
            </button>
            );
          })}
          <button type="button" className={wxOn ? "on" : ""} aria-pressed={wxOn} onClick={() => setWxOn((v) => !v)}>
            WX{rain?.now?.time ? ` ${Math.max(0, Math.round((Date.now() / 1000 - rain.now.time) / 60))}m` : ""}
          </button>
        </div>
      ) : null}

      {view === "sensors" ? (
        <div className="chips sub" role="tablist" aria-label="sensor type">
          {SENSOR_KINDS.map((k) => (
            <button key={k.id} type="button" className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>
              {k.lab}
              {k.id !== "all" && sensors?.counts?.[k.id] != null ? ` ${sensors.counts[k.id]}` : ""}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );

  return (
    <div className={`page ${mapFull ? `map-full ${view}` : ""}`}>
      {mapFull ? null : chrome}

      {view === "data" && dataLayer === "catalog" ? <LiveLink url={liveUrl || snap?.publicUrl || ""} /> : null}
      {view === "data" && dataLayer === "catalog" ? <FeedHowto feeder={feeder} sdrCount={radar?.counts?.sdr ?? 0} /> : null}
      {view === "data" && dataLayer === "catalog" ? <RidHowto rid={rid} radarRid={radar?.counts?.rid ?? 0} /> : null}
      {view === "data" && dataLayer === "catalog" ? <AsterixHowto ax={asterix} /> : null}
      {view === "data" && dataLayer === "catalog" ? <NmHowto nm={nm} /> : null}
      {view === "data" && dataLayer === "catalog" ? <LiveFplHowto fpl={fpl} /> : null}
      {view === "data" && dataLayer === "catalog" ? <ArrivalsHowto board={arrivals} /> : null}
      {view === "data" && dataLayer === "catalog" ? <EcDashHowto dash={ecDash} /> : null}
      {view === "data" && dataLayer === "catalog" ? <EaupHowto eaup={eaup} /> : null}
      {view === "data" && dataLayer === "catalog" ? <MainPagesHowto gwt={mainpages} /> : null}
      {view === "data" && dataLayer === "catalog" ? <SwimHowto swim={swim} /> : null}
      {view === "data" && dataLayer === "catalog" ? <MetHowto met={met} /> : null}
      {view === "data" && dataLayer === "catalog" ? <RainHowto rain={rain} /> : null}
      {view === "data" && dataLayer === "catalog" ? <EatmHowto eatm={eatm} /> : null}
      {view === "data" && dataLayer === "catalog" ? <AptHowto apt={apt} /> : null}
      {view === "data" && dataLayer === "catalog" ? <OgcHowto ogc={ogc} /> : null}
      {view === "data" && dataLayer === "catalog" ? <EsasspHowto esassp={esassp} /> : null}
      {view === "data" && dataLayer === "catalog" ? <AirmHowto airm={airm} /> : null}
      {view === "data" && dataLayer === "catalog" ? <RtcaHowto rtca={rtca} /> : null}
      {view === "data" && dataLayer === "catalog" ? <IfpsHowto ifps={ifps} onLive={() => fetch("/api/ifps").then((r) => r.json()).then(setIfps).catch(() => {})} /> : null}
      {view === "data" && dataLayer === "catalog" ? <EurofplHowto fpl={fpl} onLive={() => fetch("/api/eurofpl").then((r) => r.json()).then(setFpl).catch(() => {})} /> : null}
      {view === "data" && dataLayer === "catalog" ? <MsSdrHowto rf={rf} /> : null}
      {view === "data" && dataLayer === "catalog" ? <WigleHowto wigle={wigle} /> : null}

      {view === "b2b" ? (
        <B2BExchangeDashboard
          planes={mapPlanes}
          onPinpointPlane={(planeId) => {
            setPick(planeId);
            window.location.hash = "#/radar";
          }}
        />
      ) : null}

      {view === "spotting" ? (
        <SpottingTacticalFeed
          planes={mapPlanes}
          onPinpointPlane={(planeId) => {
            setPick(planeId);
            window.location.hash = "#/radar";
          }}
        />
      ) : null}

      {view === "cyber" ? (
        <CyberAuditDashboard />
      ) : null}

      {view === "cad" ? (
        <AsterixCadRadarScope
          planes={mapPlanes}
          onPinpointPlane={(planeId) => {
            setPick(planeId);
            window.location.hash = "#/radar";
          }}
        />
      ) : null}

      {view === "data" && dataLayer === "catalog" ? null : view === "b2b" || view === "spotting" || view === "cyber" || view === "cad" ? null : (
      <div className="map-wrap">
        {view === "radar" && radarScopeMode ? (
          <AsterixRadarScope
            planes={mapPlanes}
            onPickPlane={focus}
            pickedId={pick}
            beastStatus={feeder?.feeder}
          />
        ) : (
          <LiveBoardMap
            center={{
              lat: view === "radar" ? mapLoc.lat : loc.lat,
              lon: view === "radar" ? mapLoc.lon : loc.lon,
              zoom:
                view === "radar" && role === "uav"
                  ? 7
                  : view === "radar"
                    ? mapLoc.zoom
                    : view === "data"
                      ? 8
                      : loc.zoom,
            }}
            planes={view === "data" ? dataPlanes : mapPlanes}
            gateways={mapGtw}
            sensors={mapSense}
            mesh={mapMesh}
            overlays={view === "data" ? dataOverlays : droneOverlays}
            pick={pick}
            onPick={focus}
            showPlanes={showPlanes}
            showGtw={showGtw}
            showSensors={showSensors}
            showMesh={view !== "radar" && view !== "data"}
            showBorder={view === "radar" || view === "data"}
            showFiled={role === "fpl" || role === "ifps" || role === "nm" || role === "arr" || view === "data"}
            radio={view === "radar" ? radar?.radio || null : null}
            rain={rain}
            showRain={wxOn && (view === "radar" || view === "data")}
            dronetagOps={dronetagOps}
            notams={notamsData}
            weather={weatherData}
          />
        )}
        {wxOn && (view === "radar" || view === "data") && rain?.now ? (
          <span className="wx-legend" aria-label="RainViewer weather radar">
            WX RainViewer · precip
            {rain.now.time ? ` · ${Math.max(0, Math.round((Date.now() / 1000 - rain.now.time) / 60))}m` : ""}
          </span>
        ) : null}
        {mapFull && !(view === "radar" && radarScopeMode) ? <div className="map-chrome">{chrome}</div> : null}
        {pickedPlane && !(view === "radar" && radarScopeMode) ? (
          <div className="map-hud ac">
            <PlaneHud p={pickedPlane} title={trackLabel(pickedPlane)} onClose={() => setPick("")} />
          </div>
        ) : view === "data" && pickedData ? (
          <DataHud row={pickedData} onClose={() => setPick("")} />
        ) : view !== "radar" && view !== "data" && picked ? (
          <div className="map-hud">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
              <div>
                <strong>{labelOf(picked)}</strong>
                <small>
                  {"kind" in picked ? (picked as Sensor).kind : pickedMesh?.port || "node"}
                  {pickedMesh?.alt ? ` · ${Math.round(pickedMesh.alt)} m` : ""}
                  {"lat" in picked && picked.lat ? ` · ${Number(picked.lat).toFixed(3)}, ${Number(picked.lon).toFixed(3)}` : ""}
                </small>
              </div>
              <button type="button" className="hud-ctrl-btn close" onClick={() => setPick("")} title="Close window">✕</button>
            </div>
            {pickedMesh || (picked as Sensor).battery != null ? (
              <TelemetryHud n={(pickedMesh || picked) as Sensor} />
            ) : (
              <div className="hud-gauges">
                {((picked as Sensor).sensors || []).slice(0, 4).map((x) => (
                  <div key={x.title} className="gauge">
                    <strong className="tick">{x.last ?? "—"}</strong>
                    <small>{x.title}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : view !== "radar" && view !== "data" ? (
          <p className="map-hint">Tap one sensor, pin, or packet to show only that feed.</p>
        ) : null}
        {showPlanes && view !== "radar" && view !== "data" && (!focusing || mapPlanes.length) && !pickedPlane ? (
          <ol className="alt-legend" aria-label="altitude colours">
            {ALT_BANDS.map((b) => (
              <li key={b.lab}>
                <i style={{ background: b.color }} />
                {b.lab}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      )}

      {view === "b2b" || view === "spotting" || view === "cyber" || view === "cad" ? null : (
      <div className={mapFull ? `below${view === "radar" || view === "data" ? (pickedPlane || (view === "data" && pickedData) ? " hide" : sheet ? " open" : " peek") : ""}` : undefined}>
      {view !== "radar" && view !== "data" ? (
      <section className="kpis" aria-label="live counts">
        {displayKpis.map(([k, v]) => (
          <article key={String(k)}>
            <strong className="tick">{v}</strong>
            <span>{k}</span>
          </article>
        ))}
      </section>
      ) : null}

      {view !== "radar" && view !== "data" ? (
        <LiveStream
          items={focusedStream}
          pick={pick}
          onPick={focus}
          title={focusing ? `LIVE DECODE · ${picked ? labelOf(picked) : "one"}` : "LIVE DECODE"}
        />
      ) : null}

      {view === "sensors" || (view !== "data" && focusing && (mapGraphs.length || pickedSeries.length)) ? (
        <>
          {mapGraphs.length || !focusing ? (
            <>
              <h2 className="sec">{focusing ? "Graphs · this sensor" : "Live graphs · 6h OpenSenseMap"}</h2>
              <section className="ggrid">
                {mapGraphs.length ? (
                  mapGraphs.map((g) => (
                    <button type="button" key={g.id} className={`gcard ${pick === g.id ? "on" : ""}`} onClick={() => focus(g.id)}>
                      <small>{g.kind} · {g.title}</small>
                      <b>{g.name}</b>
                      <Spark pts={g.pts} unit={g.unit} />
                    </button>
                  ))
                ) : (
                  <p className="note">Waiting for OpenSenseMap history. Empty is a fact.</p>
                )}
              </section>
            </>
          ) : null}
          {(focusing ? (pickedMesh ? [pickedMesh] : []) : mapNodes).some((n) => (n.series || []).length) ? (
            <>
              <h2 className="sec">{focusing ? "Telemetry · this node" : "Mesh telemetry"}</h2>
              <section className="ggrid">
                {(focusing && pickedMesh ? [pickedMesh] : mapNodes.filter((n) => (n.series || []).length).slice(0, 8)).flatMap((n) =>
                  (n.series || []).slice(0, focusing ? 8 : 1).map((ser) => (
                    <button type="button" key={`${n.id}-${ser.title}`} className={`gcard ${belongs(pick, n) ? "on" : ""}`} onClick={() => focus(n.id)}>
                      <small>mesh · {ser.title}</small>
                      <b>{n.name}</b>
                      <Spark pts={ser.pts || []} unit={ser.unit} color="#c77dff" />
                    </button>
                  )),
                )}
              </section>
            </>
          ) : null}
        </>
      ) : null}

      {(view === "sensors" || view === "ops") && mapCards.length ? (
        <>
          <h2 className="sec">{focusing ? "This sensor" : view === "sensors" ? (SENSOR_KINDS.find((k) => k.id === kind)?.lab ?? "Nodes") : "Sensors & switches"}</h2>
          <section className="grid">
            {mapCards.slice(0, focusing ? 4 : 28).map((s) => (
              <SensorCard key={s.id} s={s} on={belongs(pick, s)} onClick={() => focus(s.id)} />
            ))}
          </section>
        </>
      ) : null}

      {view === "lora" && (mapGtw.length || mapNodes.length) ? (
        <>
          {mapGtw.length ? (
            <>
              <h2 className="sec">{focusing ? "This gateway" : "Gateways"}</h2>
              <section className="grid">
                {mapGtw.slice(0, focusing ? 4 : 28).map((g) => (
                  <GatewayCard key={g.id} g={g} on={belongs(pick, g)} onClick={() => focus(g.id)} />
                ))}
              </section>
            </>
          ) : null}
          {mapNodes.length ? (
            <>
              <h2 className="sec">{focusing ? "This node" : "Mesh nodes"}</h2>
              <section className="grid">
                {mapNodes.slice(0, focusing ? 4 : 16).map((n) => (
                  <SensorCard key={n.id} s={n} on={belongs(pick, n)} onClick={() => focus(n.id)} />
                ))}
              </section>
            </>
          ) : null}
        </>
      ) : null}

      {view !== "radar" && view !== "data" && (!focusing || mapMsgs.length) ? (
        <section className="tape" aria-label="messages">
          <header>
            <small>{focusing ? "MESSAGES · THIS SENSOR" : "MESSAGES"}</small>
            <strong>{mapMsgs.length} live</strong>
          </header>
          {mapMsgs.length ? (
            mapMsgs.slice(0, view === "lora" ? 24 : 14).map((m) => (
              <button key={m.id} type="button" className={belongs(pick, m) ? "on" : ""} onClick={() => focus(focusId(m))}>
                <i className={`tag ${m.kind}`}>{m.kind}</i>
                <b>{m.name}</b>
                <small>
                  {m.detail}
                  {m.rssi != null ? ` · ${m.rssi} dBm` : ""}
                  {m.snr != null ? ` · SNR ${m.snr}` : ""}
                  {m.at ? ` · ${ago(m.at)}` : ""}
                </small>
              </button>
            ))
          ) : (
            <p className="note pad">No live application uplinks yet. Gateways and mesh still update. Empty is a fact.</p>
          )}
        </section>
      ) : null}

      {view === "data" && dataLayer !== "catalog" && !(pickedPlane || pickedData) ? (
        <section className="tape" aria-label="live data">
          <header className="tap" onClick={() => setSheet((s) => !s)}>
            <small>{DATA_LAB[dataLayer].toUpperCase()}</small>
            <strong>{dataRows.length} live</strong>
            <em>{sheet ? "Hide" : "List"}</em>
          </header>
          {sheet ? (
            dataRows.length ? (
              dataRows.slice(0, 80).map((r) => (
                <button key={r.id} type="button" className={pick === r.id ? "on" : ""} onClick={() => focus(r.id)}>
                  <i className={`tag ${r.kind}`}>{r.kind}</i>
                  <b>{r.title}</b>
                  <small>{r.detail}</small>
                </button>
              ))
            ) : (
              <p className="note pad">No live rows in this layer. Empty is a fact.</p>
            )
          ) : null}
        </section>
      ) : null}

      {showPlanes && view !== "data" && (!focusing || mapPlanes.length) && !(view === "radar" && pickedPlane) ? (
        <section className="tape" aria-label="aircraft">
          <header
            className={view === "radar" ? "tap" : undefined}
            onClick={view === "radar" ? () => setSheet((s) => !s) : undefined}
          >
            <small>{focusing ? "AIRCRAFT · THIS TRACK" : "AIRCRAFT"}</small>
            <strong>{mapPlanes.length} tracks</strong>
            {view === "radar" ? <em>{sheet ? "Hide" : "List"}</em> : null}
          </header>
          {view === "radar" && !sheet ? null : mapPlanes.length ? (
            mapPlanes.slice(0, view === "radar" ? 80 : 10).map((p) => (
              <button key={p.id} type="button" className={pick === p.id ? "on" : ""} onClick={() => focus(p.id)}>
                <i className={`tag ${p.role}`}>{p.role}</i>
                <b>{trackLabel(p)}</b>
                <small>
                  <span className="swatch" style={{ background: p.color }} />
                  {p.noPos || p.role === "modes" || p.src === "mode_s"
                    ? `Mode S · ${p.squawk || "no fix"} · ${p.heard ? "heard · " : ""}${p.src}`
                    : `${fmtAltM(p.altFt)} · ${fmtKmh(p.gs)} · ${p.track}° · ${p.heard ? "heard · " : ""}${p.typecode || p.reg || p.src} · ${fmtLenKm(p.km)}`}
                </small>
              </button>
            ))
          ) : (
            <p className="note pad">No live tracks in this filter.</p>
          )}
        </section>
      ) : null}

      {focusing && pickedSeries.length && view !== "data" && view !== "sensors" ? (
        <section className="ggrid">
          {pickedSeries.map((ser) => (
            <article key={ser.title} className="gcard on">
              <small>{ser.title}</small>
              <b>{pickedSensor?.name || pick}</b>
              <Spark pts={ser.pts} unit={ser.unit} />
            </article>
          ))}
        </section>
      ) : null}
      </div>
      )}
    </div>
  );
}

function LiveClock() {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return <time dateTime={clock.toISOString()}>{clock.toISOString().slice(11, 19)}Z</time>;
}

function DataHud({
  row,
  onClose,
}: {
  row: { kind: string; title: string; detail: string; raw?: string; stats?: [string, string][] };
  onClose: () => void;
}) {
  return (
    <div className="map-hud ac data-hud">
      <div className="hud-top">
        <small>{row.kind.toUpperCase()}</small>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <strong>{row.title}</strong>
      {row.raw || row.detail ? <code>{row.raw || row.detail}</code> : null}
      {row.stats?.length ? (
        <div className="hud-kv">
          {row.stats.map(([k, v]) => (
            <span key={k}>
              {k}
              <code>{v}</code>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LiveLink({ url }: { url: string }) {
  const base = url.replace(/\/$/, "");
  if (!base) {
    return (
      <section className="howto" aria-label="live link">
        <small>LIVE LINK</small>
        <b>Waiting for the public HTTPS tunnel</b>
        <p>The trycloudflare host is minted by the server. It changes when that tunnel remints — copy it from this page or from <code>/api/health</code>.</p>
      </section>
    );
  }
  return (
    <section className="howto" aria-label="live link">
      <small>LIVE LINK</small>
      <b>Open this host</b>
      <p>
        Cloudflare quick tunnels change hostname when they remint. This is the live URL from <code>/api/health</code> — not a stale bookmark.
      </p>
      <div className="kv">
        <span>Open</span>
        <code>
          <a href={base} target="_blank" rel="noreferrer">
            {base}
          </a>
        </code>
        <span>Radar</span>
        <code>
          <a href={`${base}/#/radar`} target="_blank" rel="noreferrer">
            {base}/#/radar
          </a>
        </code>
        <span>Data</span>
        <code>
          <a href={`${base}/#/data`} target="_blank" rel="noreferrer">
            {base}/#/data
          </a>
        </code>
        <span>Health</span>
        <code>
          <a href={`${base}/api/health`} target="_blank" rel="noreferrer">
            {base}/api/health
          </a>
        </code>
      </div>
    </section>
  );
}

function WigleHowto({ wigle }: { wigle: WigleSnap | null }) {
  const url = wigle?.howto?.url || `${typeof window !== "undefined" ? window.location.origin : ""}/api/wigglefish`;
  const get = wigle?.howto?.get || `${url}?lat=46.05&lon=14.50&bssid=AA:BB:CC:DD:EE:FF&ssid=Cafe&rssi=-52&type=wifi`;
  const apk = wigle?.howto?.apk || "https://github.com/Evil0ctopus/wigglefish/releases/download/android-v0.4.0/wigglefish-0.4.0.apk";
  const [up, setUp] = useState("");
  async function sendFile(file: File) {
    setUp("uploading…");
    try {
      const text = await file.text();
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/json" }, body: text });
      const d = await r.json();
      setUp(d.ok ? `imported ${d.imported ?? d.n} of ${d.heard ?? "?"} · live ${d.live?.n ?? 0}` : d.error || "import failed");
    } catch (e) {
      setUp(String((e as Error).message || e));
    }
  }
  return (
    <section className="howto" aria-label="add WiggleFish">
      <small>WIGGLEFISH ON THE OTHER PHONE</small>
      <b>Export the session, then upload it here</b>
      <p>
        Your Home screen already has a live session (Wi-Fi + BLE + GPS OK). USB is optional. Passive scan only — skip
        Flash and any transmit tools.
      </p>
      <div className="kv">
        <span>Upload</span>
        <label className="filebtn">
          Choose JSON / CSV / GeoJSON
          <input
            type="file"
            accept=".json,.csv,.geojson,.txt,application/json,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendFile(f);
            }}
          />
        </label>
        <span>POST</span>
        <code>{url}</code>
        <span>GET</span>
        <code>{get}</code>
        <span>APK</span>
        <code>{apk}</code>
      </div>
      <ol>
        <li>On that phone keep Location on. You already have GPS OK — do not need an ESP32 for this.</li>
        <li>On Home tap the yellow <em>EXPORT / SESSION</em> button (or the Export tab at the bottom).</li>
        <li>Tap <em>JSON</em> first. Android share sheet opens. Choose Files / Downloads / Drive and save it.</li>
        <li>WiGLE CSV also works. Prefer JSON — it keeps the nested GPS the app writes.</li>
        <li>On the same phone open this dashboard → Data → tap Choose JSON / CSV above and pick that file.</li>
        <li>Or install HTTP Shortcuts, create a POST to the URL above, body = file from share, then Share → that shortcut.</li>
        <li>Pins appear on Sensors and OPS. Radar stays aircraft-only.</li>
      </ol>
      <p className="note">
        {up ? up : wigle?.n ? `${wigle.n} live RF · ${wigle.wifi} Wi-Fi · ${wigle.bluetooth} BT · ${wigle.cell} cell` : "Waiting for an export upload"}
      </p>
    </section>
  );
}

function MsSdrHowto({ rf }: { rf: RfSnap | null }) {
  const url = rf?.howto?.url || "/api/rf";
  const get = rf?.howto?.get || `${url}?import=1&lat=46.659&lon=16.172&mhz=433.92&mode=rtl_433`;
  const live = rf?.station;
  return (
    <section className="howto" aria-label="murska sobota sdr">
      <small>MURSKA SOBOTA SDR · 70–1200 MHz</small>
      <b>One tuner, hop the interesting public bands</b>
      <p>
        The antenna covers 70–1200 MHz. The radio only hears about 2.4 MHz at once. Lock it on a public protocol, or hop.
        Do not decode GSM/LTE/TETRA/pagers — those posts are dropped.
      </p>
      <div className="kv">
        <span>POST</span>
        <code>{url}</code>
        <span>Heartbeat</span>
        <code>{get}</code>
      </div>
      <ol>
        <li>
          On the Pi at Murska Sobota: <code>export RF_API={url}</code> then <code>bash scripts/ms-sdr.sh ism</code> for 433.92
          weather, or <code>hop</code> to also sample 868.3.
        </li>
        <li>
          Best unique data: <code>rtl_433 -f 433.92M -F json</code> piped or <code>-F http:…/api/rf</code>. Pins land on Sensors /
          OPS around the site (no GPS in those packets).
        </li>
        <li>
          Second dongle (cheap RTL): lock 1090, Beast-export like the car radio, or POST <code>aircraft.json</code> to the same
          URL. Radar then pulls an extra disk around Murska Sobota.
        </li>
        <li>
          APRS 144.800: POST <code>{`{"type":"aprs","from":"S56ABC","lat":46.66,"lon":16.17}`}</code> from direwolf. AIS 162 is
          legal but usually empty this far inland.
        </li>
      </ol>
      <p className="note">
        {live
          ? `Live ${live.name || "MS"} · ${live.mhz || "—"} MHz ${live.mode || ""} · ${rf?.ism ?? 0} ISM · ${rf?.aprs ?? 0} APRS`
          : rf?.n
            ? `${rf.n} RF objects waiting for a fresh heartbeat`
            : "Waiting for the Murska Sobota radio to POST"}
      </p>
    </section>
  );
}

function AptHowto({
  apt,
}: {
  apt: {
    n?: number;
    feeds?: number;
    edition?: string;
    issued?: string;
    reference?: string;
    origin?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string; edition?: string };
    howto?: { url?: string; pdf?: string; edition?: string; issued?: string; reference?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const pdf =
    apt?.howto?.pdf ||
    apt?.origin?.url ||
    "https://www.eurocontrol.int/sites/default/files/2023-10/eurocontrol-api-implementation-guide-1-300.pdf";
  const edition = apt?.edition || apt?.howto?.edition || "1.300";
  return (
    <section className="howto" aria-label="nm apt api guide">
      <small>NM APT · API IMPLEMENTATION GUIDE · {edition}</small>
      <b>That PDF is a procedure manual, not a feed</b>
      <p>
        {apt?.howto?.note ||
          "eurocontrol-api-implementation-guide-1-300.pdf is the NM API Implementation Guide (APT/USD/API_Impl_Guide). Airport/NM procedure document, not JSON or GeoJSON. This dashboard does not copy it or speak NM B2B SOAP."}
      </p>
      <div className="kv">
        <span>PDF</span>
        <code>
          <a href={pdf} target="_blank" rel="noreferrer">
            API Implementation Guide {edition}
          </a>
        </code>
        <span>Ref</span>
        <code>{apt?.reference || apt?.howto?.reference || "APT/USD/API_Impl_Guide"}</code>
        <span>Issued</span>
        <code>{apt?.issued || apt?.howto?.issued || "2023-10-01"}</code>
      </div>
      <ol>
        <li>
          {apt?.origin?.contentType || "application/pdf"}
          {apt?.origin?.bytes ? ` · ${apt.origin.bytes} bytes` : ""} · {apt?.origin?.feed ? "looks like a feed" : "not a feed"}
        </li>
        <li>Live NM on Radar is still NSV EDYYFMP. Do not file DPI/API/FUM or NM B2B SOAP from here.</li>
      </ol>
      <p className="note">Do not copy the copyrighted manual into this dashboard.</p>
    </section>
  );
}

function OgcHowto({
  ogc,
}: {
  ogc: {
    n?: number;
    feeds?: number;
    doc?: string;
    title?: string;
    issued?: string;
    category?: string;
    origin?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string; lastModified?: string; doc?: string };
    howto?: { url?: string; pdf?: string; site?: string; doc?: string; title?: string; issued?: string; category?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const pdf = ogc?.howto?.pdf || ogc?.origin?.url || "https://docs.ogc.org/dp/12-027r3/12-027r3.pdf";
  const doc = ogc?.doc || ogc?.howto?.doc || ogc?.origin?.doc || "OGC 12-027r3";
  const title = ogc?.title || ogc?.howto?.title || "Web Feature Service (WFS) Temporality Extension";
  return (
    <section className="howto" aria-label="ogc wfs temporality paper">
      <small>OGC · DISCUSSION PAPER · {doc}</small>
      <b>That PDF is a WFS discussion paper, not a feed</b>
      <p>
        {ogc?.howto?.note ||
          "12-027r3.pdf is OGC Discussion Paper 12-027r3, WFS Temporality Extension (2014). Procedure PDF for AIXM 5 dynamic-feature queries, not a live WFS or GeoJSON dump. This dashboard does not copy it or speak EAD/AFOD WFS."}
      </p>
      <div className="kv">
        <span>PDF</span>
        <code>
          <a href={pdf} target="_blank" rel="noreferrer">
            {doc}
          </a>
        </code>
        <span>Site</span>
        <code>
          <a href={ogc?.howto?.site || "https://docs.ogc.org/"} target="_blank" rel="noreferrer">
            docs.ogc.org
          </a>
        </code>
        <span>Issued</span>
        <code>{ogc?.issued || ogc?.howto?.issued || "2014-07-16"}</code>
      </div>
      <ol>
        <li>
          {title} · {ogc?.category || ogc?.howto?.category || "OGC Discussion Paper"}
          {ogc?.origin?.contentType ? ` · ${ogc.origin.contentType}` : ""}
          {ogc?.origin?.bytes ? ` · ${ogc.origin.bytes} bytes` : ""}
          {ogc?.origin?.lastModified ? ` · ${ogc.origin.lastModified}` : ""} ·{" "}
          {ogc?.origin?.feed ? "looks like a feed" : "not a feed"}
        </li>
        <li>Live NM on Radar is still NSV EDYYFMP. Do not subscribe to EAD/AFOD WFS from here.</li>
      </ol>
      <p className="note">Do not copy the copyrighted paper into this dashboard.</p>
    </section>
  );
}

function EsasspHowto({
  esassp,
}: {
  esassp: {
    n?: number;
    feeds?: number;
    edition?: string;
    volume?: string;
    issued?: string;
    title?: string;
    origin?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string; lastModified?: string };
    pdf?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    mica?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string; edition?: string; issued?: string };
    service?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; html?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    smget?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; html?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    amc?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; html?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    howto?: { url?: string; pdf?: string; mica?: string; service?: string; smget?: string; amc?: string; edition?: string; volume?: string; issued?: string; title?: string; micaTitle?: string; micaEdition?: string; micaIssued?: string; serviceTitle?: string; smgetTitle?: string; amcTitle?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const pdf =
    esassp?.howto?.pdf ||
    esassp?.pdf?.url ||
    esassp?.origin?.url ||
    "https://www.eurocontrol.int/sites/default/files/2024-03/Released%20Issue%20ESASSP%20%20Vol%201%20Ed%201.3.pdf";
  const micaPdf =
    esassp?.howto?.mica ||
    esassp?.mica?.url ||
    "https://www.eurocontrol.int/sites/default/files/2022-02/eurocontrol-20220202-mica-spec-v2.0.pdf";
  const service = esassp?.howto?.service || esassp?.service?.url || "https://www.eurocontrol.int/service/surveillance-system-and-sensors";
  const smget = esassp?.howto?.smget || esassp?.smget?.url || "https://www.eurocontrol.int/tool/system-map-generator-and-extractor-tool";
  const amc =
    esassp?.howto?.amc ||
    esassp?.amc?.url ||
    "https://www.easa.europa.eu/en/document-library/acceptable-means-of-compliance-and-guidance-material/amc-gm-commission-0";
  const edition = esassp?.edition || esassp?.howto?.edition || "1.3";
  const vol = esassp?.volume || esassp?.howto?.volume || "Vol 1";
  const micaEd = esassp?.mica?.edition || esassp?.howto?.micaEdition || "2.0";
  return (
    <section className="howto" aria-label="esassp surveillance catalog">
      <small>EUROCONTROL · SURVEILLANCE · ESASSP {vol} ED {edition} · MICA {micaEd}</small>
      <b>Those URLs are surveillance procedure, not a feed</b>
      <p>
        {esassp?.howto?.note ||
          "ESASSP and MICA are copyrighted specification PDFs. The Sensors service page and SMGET tool page are Drupal HTML. None of them is live JSON or GeoJSON."}
      </p>
      <div className="kv">
        <span>ESASSP</span>
        <code>
          <a href={pdf} target="_blank" rel="noreferrer">
            ESASSP {vol} Ed {edition}
          </a>
        </code>
        <span>MICA</span>
        <code>
          <a href={micaPdf} target="_blank" rel="noreferrer">
            MICA spec v{micaEd}
          </a>
        </code>
        <span>Service</span>
        <code>
          <a href={service} target="_blank" rel="noreferrer">
            {esassp?.howto?.serviceTitle || esassp?.service?.name || "Surveillance System and Sensors"}
          </a>
        </code>
        <span>SMGET</span>
        <code>
          <a href={smget} target="_blank" rel="noreferrer">
            {esassp?.howto?.smgetTitle || esassp?.smget?.name || "System map generator and extractor tool"}
          </a>
        </code>
        <span>EASA</span>
        <code>
          <a href={amc} target="_blank" rel="noreferrer">
            {esassp?.howto?.amcTitle || esassp?.amc?.name || "AMC & GM (EU) 2017/373"}
          </a>
        </code>
      </div>
      <ol>
        <li>
          ESASSP PDF · {esassp?.pdf?.contentType || esassp?.origin?.contentType || "application/pdf"}
          {esassp?.pdf?.bytes || esassp?.origin?.bytes ? ` · ${esassp?.pdf?.bytes || esassp?.origin?.bytes} bytes` : ""} ·{" "}
          {esassp?.pdf?.feed || esassp?.origin?.feed ? "looks like a feed" : "not a feed"}
        </li>
        <li>
          MICA PDF · {esassp?.mica?.contentType || "application/pdf"}
          {esassp?.mica?.bytes ? ` · ${esassp.mica.bytes} bytes` : ""}
          {esassp?.mica?.lastModified ? ` · ${esassp.mica.lastModified}` : ""} · {esassp?.mica?.feed ? "looks like a feed" : "not a feed"}
        </li>
        <li>
          Sensors page · {esassp?.service?.contentType || "text/html"} · {esassp?.service?.feed ? "looks like a feed" : "not a feed"}
        </li>
        <li>
          SMGET page · {esassp?.smget?.contentType || "text/html"} · {esassp?.smget?.feed ? "looks like a feed" : "not a feed"}
        </li>
        <li>Live surveillance on Radar is still ADS-B/MLAT plus NSV EDYYFMP GeoJSON. Do not copy ESASSP/MICA or run SMGET from here.</li>
      </ol>
      <p className="note">HEAD/Range only. Do not copy the copyrighted specifications into this dashboard.</p>
    </section>
  );
}

function AirmHowto({
  airm,
}: {
  airm: {
    n?: number;
    feeds?: number;
    title?: string;
    models?: { id: string; name: string; url: string; note?: string }[];
    origin?: { ok?: boolean; status?: number; challenge?: boolean; feed?: boolean; html?: boolean; json?: boolean; title?: string; bytes?: number; contentType?: string; url?: string; models?: string[] };
    howto?: { url?: string; page?: string; site?: string; title?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const page = airm?.howto?.page || airm?.origin?.url || "https://airm.aero/documentation/airm-information-exchange-models";
  const models = airm?.models?.length
    ? airm.models
    : [
        { id: "aixm", name: "AIXM", url: "https://www.aixm.aero" },
        { id: "fixm", name: "FIXM", url: "https://www.fixm.aero" },
        { id: "iwxxm", name: "IWXXM", url: "https://github.com/wmo-im/iwxxm" },
        { id: "amxm", name: "AMXM", url: "https://www.amxm.aero" },
      ];
  return (
    <section className="howto" aria-label="airm information exchange models">
      <small>AIRM.AERO · INFORMATION EXCHANGE MODELS</small>
      <b>That page is a model catalog, not a feed</b>
      <p>
        {airm?.howto?.note ||
          "airm.aero/documentation/airm-information-exchange-models lists AIXM, FIXM, IWXXM, and AMXM. HTML documentation, not JSON or GeoJSON. Those are schemas, not live tracks."}
      </p>
      <div className="kv">
        <span>Page</span>
        <code>
          <a href={page} target="_blank" rel="noreferrer">
            {airm?.title || airm?.howto?.title || airm?.origin?.title || "AIRM exchange models"}
          </a>
        </code>
        <span>Site</span>
        <code>
          <a href={airm?.howto?.site || "https://airm.aero/"} target="_blank" rel="noreferrer">
            airm.aero
          </a>
        </code>
      </div>
      <ol>
        {models.map((m) => (
          <li key={m.id}>
            <a href={m.url} target="_blank" rel="noreferrer">
              {m.name}
            </a>
            {m.note ? ` · ${m.note}` : ""}
          </li>
        ))}
        <li>
          {airm?.origin?.contentType || "text/html"}
          {airm?.origin?.bytes ? ` · ${airm.origin.bytes} bytes` : ""}
          {airm?.origin?.challenge ? " · Cloudflare challenge" : ""} · {airm?.origin?.feed ? "looks like a feed" : "not a feed"}
        </li>
      </ol>
      <p className="note">Live NM is NSV EDYYFMP. Do not scrape airm.aero or subscribe to EAD WFS from here.</p>
    </section>
  );
}

function EatmHowto({
  eatm,
}: {
  eatm: {
    n?: number;
    feeds?: number;
    origin?: { ok?: boolean; status?: number; challenge?: boolean; feed?: boolean; html?: boolean; json?: boolean; title?: string; code?: string; name?: string; model?: string; url?: string; bytes?: number };
    howto?: { url?: string; stakeholder?: string; portal?: string; list?: string; code?: string; name?: string; model?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const page =
    eatm?.howto?.stakeholder ||
    eatm?.origin?.url ||
    "https://atmmasterplan.eu/stakeholders/2482221";
  const portal = eatm?.howto?.portal || "https://atmmasterplan.eu/";
  const code = eatm?.origin?.code || eatm?.howto?.code || "ANSP-CIV-AIS";
  const name = eatm?.origin?.name || eatm?.howto?.name || "Civil AIS Service Provider";
  return (
    <section className="howto" aria-label="eatm portal stakeholder">
      <small>SESAR eATM · STAKEHOLDER 2482221</small>
      <b>That page is a Master Plan catalog row, not a feed</b>
      <p>
        {eatm?.howto?.note ||
          "atmmasterplan.eu/stakeholders/2482221 is ANSP-CIV-AIS (Civil AIS Service Provider) in the S3 Common Library. HTML enabler tables, not JSON/GeoJSON."}
      </p>
      <div className="kv">
        <span>Page</span>
        <code>
          <a href={page} target="_blank" rel="noreferrer">
            {code}
          </a>
        </code>
        <span>Name</span>
        <code>{name}</code>
        <span>Model</span>
        <code>{eatm?.origin?.model || eatm?.howto?.model || "S3 - Common Library"}</code>
        <span>Portal</span>
        <code>
          <a href={portal} target="_blank" rel="noreferrer">
            atmmasterplan.eu
          </a>
        </code>
      </div>
      <ol>
        <li>
          {eatm?.origin?.challenge
            ? `Cloudflare challenge HTTP ${eatm.origin.status || 403}`
            : eatm?.origin?.html
              ? `HTML ${eatm.origin.bytes ? `${eatm.origin.bytes} bytes` : ""}`.trim()
              : eatm?.origin?.status
                ? `HTTP ${eatm.origin.status}`
                : "probed on /api/eatm"}{" "}
          · {eatm?.origin?.feed ? "looks like a feed" : "not a feed"}
        </li>
        <li>Live AIS is not this page. Operational AFOD WFS needs an EAD account. Live NM on Radar is NSV EDYYFMP.</li>
      </ol>
      <p className="note">Do not paste eATM/OneSky credentials here.</p>
    </section>
  );
}

function MetHowto({
  met,
}: {
  met: {
    n?: number;
    feeds?: number;
    metars?: { icao: string; raw?: string; fltCat?: string; tempC?: number | null; wspdKt?: number | null; visib?: string; name?: string; si?: boolean }[];
    tafs?: { icao: string; raw?: string; issued?: string; si?: boolean }[];
    sigmets?: { id: string; fir?: string; firName?: string; hazard?: string; raw?: string; si?: boolean; europe?: boolean }[];
    alarms?: { id: string; event?: string; headline?: string; severity?: string; area?: string; expires?: string }[];
    siSigmets?: number;
    europeSigmets?: number;
    origin?: { metar?: string; taf?: string; isigmet?: string; meteoalarm?: string };
    howto?: { url?: string; metar?: string; isigmet?: string; meteoalarm?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const mets = met?.metars || [];
  const tafs = met?.tafs || [];
  const sigs = met?.sigmets || [];
  const alarms = met?.alarms || [];
  const ljlj = mets.find((m) => m.icao === "LJLJ");
  const metarUrl = met?.howto?.metar || met?.origin?.metar || "https://aviationweather.gov/api/data/metar";
  return (
    <section className="howto" aria-label="live aviation met">
      <small>SWIM MET · PUBLIC IWXXM-CLASS · AWC + METEOALARM</small>
      <b>Live METAR, TAF, SIGMET, and SI weather warnings</b>
      <p>
        {met?.howto?.note ||
          "EUROCONTROL SWIM IWXXM needs an SLA. These are the public JSON substitutes: NOAA AWC METAR/TAF/SIGMET plus EUMETNET MeteoAlarm CAP for Slovenia."}
      </p>
      <div className="kv">
        <span>METAR</span>
        <code>
          {mets.length} · LJLJ {ljlj?.fltCat || "—"} {ljlj?.tempC != null ? `${ljlj.tempC}°C` : ""}
        </code>
        <span>TAF</span>
        <code>{tafs.length}</code>
        <span>SIGMET EU</span>
        <code>
          {met?.europeSigmets ?? sigs.length} · SI {met?.siSigmets ?? 0}
        </code>
        <span>MeteoAlarm</span>
        <code>{alarms.length} SI warnings</code>
      </div>
      {mets.filter((m) => m.si).length ? (
        <ol>
          {mets
            .filter((m) => m.si)
            .map((m) => (
              <li key={m.icao}>
                {m.icao} · {m.fltCat || "—"} · {m.raw || m.name}
              </li>
            ))}
        </ol>
      ) : (
        <p className="note">Waiting for AWC METAR JSON.</p>
      )}
      {alarms.length ? (
        <ol>
          {alarms.slice(0, 4).map((a) => (
            <li key={a.id}>
              {a.severity || "warn"} · {a.headline || a.event}
              {a.area ? ` · ${a.area}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
      {sigs.length ? (
        <p className="note">
          {sigs
            .slice(0, 3)
            .map((s) => `${s.fir || s.firName} ${s.hazard}`)
            .join(" · ")}
        </p>
      ) : (
        <p className="note">
          No Europe SIGMET polygons overlapping the theater.{" "}
          <a href={metarUrl} target="_blank" rel="noreferrer">
            AWC METAR
          </a>
        </p>
      )}
    </section>
  );
}

function RainHowto({
  rain,
}: {
  rain: RainSnap | null;
}) {
  const tiles = rain?.now?.tiles || "";
  const n = rain?.frames?.length || 0;
  return (
    <section className="howto" aria-label="rainviewer weather radar">
      <small>RAINVIEWER · WEATHER MAPS API</small>
      <b>Live precip tiles over Slovenia — not bird tracks</b>
      <p>
        Public{" "}
        <a href="https://api.rainviewer.com/public/weather-maps.json" target="_blank" rel="noreferrer">
          weather-maps.json
        </a>{" "}
        plus the official{" "}
        <a href="https://github.com/rainviewer/rainviewer-api-example" target="_blank" rel="noreferrer">
          Leaflet example
        </a>
        . Composite reflectivity from 1200+ radars, 10-minute frames, native zoom 7. Radar WX chip animates the last two hours. This is rain/snow, not Vogelradar BIRDTAM.
      </p>
      <div className="kv">
        <span>Frames</span>
        <code>{n}</code>
        <span>Tiles</span>
        <code>{tiles ? "live" : "—"}</code>
        <span>Source</span>
        <code>
          <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">
            rainviewer.com
          </a>
        </code>
      </div>
    </section>
  );
}

function SwimHowto({
  swim,
}: {
  swim: {
    n?: number;
    origin?: { ok?: boolean; status?: number; challenge?: boolean; jsonapi?: boolean };
    ais?: { wiki?: string; geo?: string; geoEmpty?: boolean; title?: string; binding?: string; wfsPath?: string; afod?: string; ead?: string };
    openatm?: {
      name?: string;
      edition?: string;
      provider?: string;
      nInterfaces?: number;
      endpoints?: number;
      placeholders?: number;
      geo?: string;
      transport?: string;
      url?: string;
      challenge?: boolean;
      json?: boolean;
      status?: number;
    };
    aman?: {
      name?: string;
      edition?: string;
      provider?: string;
      nInterfaces?: number;
      endpoints?: number;
      placeholders?: number;
      geo?: string;
      transport?: string;
      url?: string;
      challenge?: boolean;
      json?: boolean;
      status?: number;
    };
    catalog?: { id: string; name: string; provider?: string; auth?: string; public?: boolean; note?: string; wiki?: string }[];
    publicLive?: { id: string; name: string; url: string; used?: boolean; note?: string }[];
    howto?: { url?: string; registry?: string; reference?: string; schema?: string; aisWiki?: string; openatmJson?: string; amanJson?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const registry = swim?.howto?.registry || "https://eur-registry.swim.aero/service-definitions";
  const catalog = swim?.catalog || [];
  const live = swim?.publicLive || [];
  const ais = swim?.ais;
  const openatm = swim?.openatm;
  const aman = swim?.aman;
  const jsonUrl =
    aman?.url ||
    swim?.howto?.amanJson ||
    "https://eur-registry.swim.aero/system/files/JSONs/service-1784281247-e071a5d0451d.json";
  return (
    <section className="howto" aria-label="swim registry">
      <small>EUROCONTROL SWIM · PUBLIC LIVE + CATALOG</small>
      <b>Registry definitions stay SLA; public live is NSV + MET</b>
      <p>
        {swim?.howto?.note ||
          "service-1784281247-e071a5d0451d.json is EUROCAE Arrival Sequence Service 1.02. The listed endpoint is localhost — a placeholder. Yellow Profile subscribe/publish needs a provider instance under an SLA."}
      </p>
      <div className="kv">
        <span>JSON</span>
        <code>
          <a href={jsonUrl} target="_blank" rel="noreferrer">
            service-1784281247-e071a5d0451d.json
          </a>
        </code>
        <span>Service</span>
        <code>
          {aman?.name || "Arrival Sequence Service"} {aman?.edition || "1.02"} · {aman?.provider || "EUROCAE"}
        </code>
        <span>Interfaces</span>
        <code>
          {aman?.nInterfaces ?? 3} · live endpoints {aman?.endpoints ?? 0} · placeholders {aman?.placeholders ?? 1} · geo{" "}
          {aman?.geo || "absent"}
        </code>
        <span>Transport</span>
        <code>{aman?.transport || "WS_LIGHT · request/reply + FIRE_AND_FORGET"}</code>
        <span>Fetch</span>
        <code>
          {aman?.challenge
            ? `Cloudflare challenge ${aman.status || 403}`
            : aman?.json
              ? "JSON parsed"
              : aman?.status
                ? `HTTP ${aman.status}`
                : "probed on /api/swim"}
        </code>
        <span>OpenATM</span>
        <code>
          {openatm?.name || "OpenATM"} {openatm?.edition || "1.0"} · endpoints {openatm?.endpoints ?? 0} · geo{" "}
          {openatm?.geo || "absent"}
        </code>
        <span>AIS extent</span>
        <code>{ais?.geoEmpty || ais?.geo === "empty" ? "empty in the spec" : ais?.geo || "probed on /api/swim"}</code>
        <span>Registry</span>
        <code>
          <a href={registry} target="_blank" rel="noreferrer">
            {registry}
          </a>
        </code>
      </div>
      {live.length ? (
        <ol>
          {live.map((s) => (
            <li key={s.id}>
              {s.used ? "Already on Radar · " : ""}
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>
              {s.note ? ` · ${s.note}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
      {catalog.length ? (
        <ol>
          {catalog.map((s) => (
            <li key={s.id}>
              {s.name} · {s.provider || "EUROCONTROL"} · {s.public ? "public" : s.auth || "SLA"}
              {s.note ? ` · ${s.note}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="note">
        {swim?.n
          ? `${swim.n} catalogued definitions · ${(swim.publicLive || []).filter((s) => s.used).length} public live URLs · AMAN still localhost`
          : "Waiting for /api/swim"}
      </p>
    </section>
  );
}

function RtcaHowto({
  rtca,
}: {
  rtca: {
    n?: number;
    origin?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; library?: string; json?: boolean; feed?: boolean; lastModified?: string; url?: string };
    aci?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    crocontrol?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string; contentType?: string };
    amc?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    amcWork?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    dnn?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    prism?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    amcPage?: { ok?: boolean; bytes?: number; contentType?: string; html?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    amcMaps?: { ok?: boolean; bytes?: number; contentType?: string; html?: boolean; feed?: boolean; url?: string; lastModified?: string; name?: string };
    bootstrap?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string; contentType?: string };
    gtag?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    skybrary?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    ecFooter?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string; lastModified?: string };
    aeropus?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string };
    easa?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string };
    beacon?: { ok?: boolean; bytes?: number; library?: string; feed?: boolean; url?: string };
    items?: { id: string; name: string; url: string; site?: string; library?: string; bytes?: number; feed?: boolean; contentType?: string; lastModified?: string }[];
    howto?: { url?: string; script?: string; site?: string; libs?: string; bootstrap?: string; gtag?: string; dialog?: string; footer?: string; footerSite?: string; footerLibs?: string; beacon?: string; easa?: string; kendo?: string; rtca?: string; crocontrol?: string; crocontrolSite?: string; amcSite?: string; amcAnon?: string; amcTitle?: string; amcMaps?: string; amcLogon?: string; amcComm?: string; amcWork?: string; dnn?: string; prism?: string; prismSite?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const bundle =
    rtca?.howto?.script ||
    rtca?.aci?.url ||
    rtca?.origin?.url ||
    "https://aci.aero/wp-content/uploads/bb-plugin/cache/6665ffc9ae04e5c20c78461db97d2763-layout-bundle.js";
  const pageUrl =
    rtca?.howto?.amcAnon ||
    rtca?.amcPage?.url ||
    "https://amc-en.crocontrol.hr/Current-situation-anonymous-users";
  const mapsUrl = rtca?.howto?.amcMaps || rtca?.amcMaps?.url || "https://amc-en.crocontrol.hr/amc/maps";
  const htmlRows = [
    {
      id: "amc-anon",
      name: rtca?.howto?.amcTitle || rtca?.amcPage?.name || "Current situation (anonymous users)",
      url: pageUrl,
      library: "DNN HTML",
      bytes: rtca?.amcPage?.bytes,
      feed: rtca?.amcPage?.feed ?? false,
      lastModified: rtca?.amcPage?.lastModified,
    },
    {
      id: "amc-maps",
      name: rtca?.amcMaps?.name || "Croatia Control AMC maps iframe",
      url: mapsUrl,
      library: "ASP.NET MVC HTML",
      bytes: rtca?.amcMaps?.bytes,
      feed: rtca?.amcMaps?.feed ?? false,
      lastModified: rtca?.amcMaps?.lastModified,
    },
  ];
  const scriptRows = rtca?.items?.length
    ? rtca.items
    : [
          { id: "aci-bb", name: "ACI Beaver Builder layout-bundle", url: bundle, library: rtca?.aci?.library || rtca?.origin?.library, bytes: rtca?.aci?.bytes || rtca?.origin?.bytes, feed: rtca?.aci?.feed ?? rtca?.origin?.feed, lastModified: rtca?.aci?.lastModified || rtca?.origin?.lastModified },
          { id: "crocontrol-jq", name: "Croatia Control WordPress jQuery", url: rtca?.howto?.crocontrol || "https://www.crocontrol.hr/wp/wp-includes/js/jquery/jquery.min.js", library: rtca?.crocontrol?.library, bytes: rtca?.crocontrol?.bytes, feed: rtca?.crocontrol?.feed ?? false, lastModified: rtca?.crocontrol?.lastModified },
          { id: "amc-comm", name: "Croatia Control AMC CMS comm.js", url: rtca?.howto?.amcComm || "https://amc-en.crocontrol.hr/AMC/Scripts/CMS/comm.js", library: rtca?.amc?.library, bytes: rtca?.amc?.bytes, feed: rtca?.amc?.feed ?? false, lastModified: rtca?.amc?.lastModified },
          { id: "amc-workareas", name: "Croatia Control AMC WorkAreas HMI", url: rtca?.howto?.amcWork || "https://amc-en.crocontrol.hr/AMC/Scripts/AMC/WorkAreas.js", library: rtca?.amcWork?.library, bytes: rtca?.amcWork?.bytes, feed: rtca?.amcWork?.feed ?? false, lastModified: rtca?.amcWork?.lastModified },
          { id: "amc-dnn", name: "Croatia Control AMC DNN.js", url: rtca?.howto?.dnn || "https://amc-en.crocontrol.hr/js/dnn.js?cdv=726", library: rtca?.dnn?.library, bytes: rtca?.dnn?.bytes, feed: rtca?.dnn?.feed ?? false, lastModified: rtca?.dnn?.lastModified },
          { id: "prism-cdn", name: "cdnjs Prism highlighter", url: rtca?.howto?.prism || "https://cdnjs.cloudflare.com/ajax/libs/prism/1.5.1/prism.min.js", library: rtca?.prism?.library, bytes: rtca?.prism?.bytes, feed: rtca?.prism?.feed ?? false, lastModified: rtca?.prism?.lastModified },
          { id: "airm-bootstrap", name: "AIRM Bootstrap CSS", url: rtca?.howto?.bootstrap, library: rtca?.bootstrap?.library, bytes: rtca?.bootstrap?.bytes, feed: rtca?.bootstrap?.feed, lastModified: rtca?.bootstrap?.lastModified },
          { id: "skybrary-gtag", name: "SKYbrary Drupal google_tag Ajax", url: rtca?.howto?.gtag, library: rtca?.gtag?.library, bytes: rtca?.gtag?.bytes, feed: rtca?.gtag?.feed, lastModified: rtca?.gtag?.lastModified },
          { id: "skybrary-dialog", name: "SKYbrary jQuery UI Dialog", url: rtca?.howto?.dialog, library: rtca?.skybrary?.library, bytes: rtca?.skybrary?.bytes, feed: rtca?.skybrary?.feed, lastModified: rtca?.skybrary?.lastModified },
          { id: "ec-footer", name: "EUROCONTROL Drupal footer aggregate", url: rtca?.howto?.footer, library: rtca?.ecFooter?.library, bytes: rtca?.ecFooter?.bytes, feed: rtca?.ecFooter?.feed, lastModified: rtca?.ecFooter?.lastModified },
          { id: "cf-beacon", name: "Cloudflare Web Analytics beacon", url: rtca?.howto?.beacon, library: rtca?.beacon?.library, bytes: rtca?.beacon?.bytes, feed: rtca?.beacon?.feed, lastModified: undefined as string | undefined },
          { id: "easa", name: "EASA login F5 APM", url: rtca?.howto?.easa, library: rtca?.easa?.library, bytes: rtca?.easa?.bytes, feed: rtca?.easa?.feed, lastModified: undefined as string | undefined },
          { id: "aeropus", name: "AerOpus Kendo MVC", url: rtca?.howto?.kendo, library: rtca?.aeropus?.library, bytes: rtca?.aeropus?.bytes, feed: rtca?.aeropus?.feed, lastModified: undefined as string | undefined },
          { id: "rtca", name: "RTCA AjaxScript", url: rtca?.howto?.rtca, library: undefined, bytes: undefined, feed: false, lastModified: undefined as string | undefined },
        ];
  const items = [...htmlRows, ...scriptRows];
  return (
    <section className="howto" aria-label="portal chrome scripts">
      <small>ACI.AERO · BEAVER BUILDER · CHROME</small>
      <b>That layout-bundle.js is site chrome, not a feed</b>
      <p>
        {rtca?.howto?.note ||
          "6665ffc9ae04e5c20c78461db97d2763-layout-bundle.js on aci.aero is a WordPress Beaver Builder cached layout bundle (2.11.0.3). Not a traffic API."}
      </p>
      <div className="kv">
        <span>Bundle</span>
        <code>
          <a href={bundle} target="_blank" rel="noreferrer">
            layout-bundle.js
          </a>
        </code>
        <span>Site</span>
        <code>
          <a href={rtca?.howto?.site || "https://aci.aero/"} target="_blank" rel="noreferrer">
            aci.aero
          </a>
        </code>
        <span>Library</span>
        <code>{rtca?.howto?.libs || rtca?.origin?.library || "Beaver Builder 2.11.0.3"}</code>
        <span>AMC</span>
        <code>
          <a href={pageUrl} target="_blank" rel="noreferrer">
            anonymous situation
          </a>
        </code>
        <span>Maps</span>
        <code>
          <a href={mapsUrl} target="_blank" rel="noreferrer">
            /amc/maps
          </a>
        </code>
      </div>
      <ol>
        {items.map((s) => (
          <li key={s.id}>
            {s.name} · {s.library || "JS"}
            {s.bytes ? ` · ${s.bytes} bytes` : ""}
            {s.lastModified ? ` · ${s.lastModified}` : ""} · {s.feed ? "looks like a feed" : "not a feed"}
          </li>
        ))}
      </ol>
      <p className="note">Same class of URL as eurofpl Drupal jQuery, crocontrol.hr wp-includes jquery.min.js, and the amc-en.crocontrol.hr DNN AMC HMI (anonymous situation page + /amc/maps iframe). Live NM is NSV EDYYFMP. Do not paste portal credentials here.</p>
    </section>
  );
}

function IfpsHowto({
  ifps,
  onLive,
}: {
  ifps: {
    n?: number;
    pasted?: number;
    feeds?: number;
    edition?: string;
    portal?: string;
    live?: { flight?: string; dep?: string; dest?: string; route?: string; si?: boolean; ifps?: boolean; altFt?: number }[];
    items?: { flight?: string; dep?: string; dest?: string; known?: string[]; skipped?: string[] }[];
    origin?: { ok?: boolean; feed?: boolean; json?: boolean; zone?: string; n?: number };
    nmManual?: { ok?: boolean; status?: number; bytes?: number; contentType?: string; pdf?: boolean; feed?: boolean; url?: string };
    webManual?: { ok?: boolean; bytes?: number; pdf?: boolean; feed?: boolean };
    howto?: { url?: string; manual?: string; webManual?: string; ifpuv?: string; portal?: string; edition?: string; steps?: string[]; note?: string };
  } | null;
  onLive: () => void;
}) {
  const url = ifps?.howto?.url || "/api/ifps";
  const nmPdf =
    ifps?.howto?.manual ||
    ifps?.nmManual?.url ||
    "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/PORTAL.29.0.0.1.121/_res/IFPS_Users_Manual_External.pdf";
  const webPdf =
    ifps?.howto?.webManual ||
    "https://www.eurocontrol.int/sites/default/files/2026-04/eurocontrol-ifps-user-manual-wave-2-3-external.pdf";
  const ifpuv = ifps?.howto?.ifpuv || "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/";
  const edition = ifps?.edition || ifps?.howto?.edition || "WAVE-2.3";
  const portal = ifps?.portal || ifps?.howto?.portal || "PORTAL.29.0.0.1.121";
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const send = () => {
    const body = text.trim();
    if (body.length < 12) return;
    setMsg("Parsing…");
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || r.statusText);
        const f = d.flights?.[0];
        setMsg(
          f
            ? `${f.flight} · ${f.dep || "?"}→${f.dest || "?"} · ${f.nTrail || 0} geocoded · skipped ${(f.skipped || []).join(" ") || "none"}`
            : `${d.n || 0} plan(s)`,
        );
        onLive();
      })
      .catch((e) => setMsg(String(e.message || e)));
  };
  const live = ifps?.live || [];
  const siN = live.filter((x) => x.si).length;
  return (
    <section className="howto" aria-label="ifps">
      <small>NM IFPS · IFPZ · {edition}</small>
      <b>Live IFPS-zone plans in the Slovenia theater</b>
      <p>
        {ifps?.howto?.note ||
          "Radar IFPS chip is IFPZ dep/dest on live callsigns plus unmatched NM 4D leftover in theater. Gold/cyan remainder on the chip. Paste overlays extra ICAO/ADEXP. Not CAT 048. This app does not file to EUCHZMFP."}
      </p>
      <div className="kv">
        <span>Live</span>
        <code>{ifps?.n ?? live.length} IFPZ</code>
        <span>LJ</span>
        <code>{siN}</code>
        <span>Pasted</span>
        <code>{ifps?.pasted ?? (ifps?.items || []).length}</code>
        <span>IFPUV</span>
        <code>
          <a href={ifpuv} target="_blank" rel="noreferrer">
            public pre-validation
          </a>
        </code>
      </div>
      {live.length ? (
        <ol>
          {live.slice(0, 10).map((x) => (
            <li key={x.flight}>
              {x.flight} · {x.dep || "?"}→{x.dest || "?"}
              {x.si ? " · LJ" : ""}
              {x.altFt ? ` · FL${String(Math.round(x.altFt / 100)).padStart(3, "0")}` : ""}
            </li>
          ))}
        </ol>
      ) : (
        <p className="note">Waiting for IFPZ routes. Open Radar IFPS in a few seconds.</p>
      )}
      <ol>
        <li>
          NM portal PDF · {ifps?.nmManual?.contentType || "application/pdf"}
          {ifps?.nmManual?.bytes ? ` · ${ifps.nmManual.bytes} bytes` : ""} · not a feed
        </li>
        <li>
          Optional overlay: paste ICAO (FPL-…) or ADEXP. Unknown airports are looked up publicly. Never file to EUCHZMFP.
        </li>
      </ol>
      <p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"(FPL-S5ABC-IG\n-C172/L-S/C\n-LJLJ1200\n-N0120A045 DCT 4623N01430E DCT\n-LJMB0030\n-DOF/260406)"}
          aria-label="ICAO FPL or ADEXP"
          spellCheck={false}
        />
      </p>
      <p>
        <button type="button" onClick={send}>
          Overlay this FPL
        </button>
      </p>
      <p className="note">
        {msg ||
          (ifps?.n
            ? `${ifps.n} live IFPZ · ${ifps.pasted || 0} pasted`
            : "Do not copy the copyrighted manual. Pre-validate in IFPUV. Never file to EUCHZMFP.")}
      </p>
    </section>
  );
}

function EurofplHowto({
  fpl,
  onLive,
}: {
  fpl: { n?: number; items?: { flight?: string; dep?: string; dest?: string }[]; howto?: { url?: string; tracking?: string; steps?: string[]; note?: string } } | null;
  onLive: () => void;
}) {
  const url = fpl?.howto?.url || "/api/eurofpl";
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const send = () => {
    const c = code.trim().toUpperCase();
    if (c.length < 3) return;
    setMsg("Fetching…");
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: c }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || r.statusText);
        setMsg(`${d.flight?.flight || c} · ${d.flight?.dep || "?"}→${d.flight?.dest || "?"} · ${d.flight?.altFt || 0} ft`);
        onLive();
      })
      .catch((e) => setMsg(String(e.message || e)));
  };
  return (
    <section className="howto" aria-label="eurofpl">
      <small>EUROFPL · FILED PLAN FOLLOWING</small>
      <b>That .js file is the website chrome, not a feed</b>
      <p>
        {fpl?.howto?.note ||
          "js_d27510eaa1b8d2f5feafc713a6d52548.js is Drupal jQuery 1.2.6 on eurofpl.eu. Live following is tracking.eurofpl.eu with your ACK confirmation code. IFPS validation is gone. The service sunsets 31 Dec 2026."}
      </p>
      <div className="kv">
        <span>POST</span>
        <code>{url}</code>
        <span>Tracker</span>
        <code>{fpl?.howto?.tracking || "https://tracking.eurofpl.eu/"}</code>
      </div>
      <p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ACK confirmation code"
          aria-label="EuroFPL confirmation code"
          autoCapitalize="characters"
        />
        <button type="button" onClick={send}>
          Follow this FPL
        </button>
      </p>
      <p className="note">
        {msg ||
          (fpl?.n
            ? `${fpl.n} followed · ${(fpl.items || []).map((x) => x.flight).filter(Boolean).join(" ")}`
            : "Paste the code from your EuroFPL ACK email. Other people's flights stay off this map.")}
      </p>
    </section>
  );
}

function EaupHowto({
  eaup,
}: {
  eaup: {
    n?: number;
    feeds?: number;
    origin?: { ok?: boolean; status?: number; title?: string; gwt?: boolean; feed?: boolean; bytes?: number; moduleBytes?: number; moduleLibrary?: string; viewId?: string; portal?: string; url?: string };
    howto?: { url?: string; view?: string; nop?: string; portal?: string; viewId?: string; module?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const view =
    eaup?.howto?.view ||
    eaup?.origin?.url ||
    "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/PORTAL.29.0.0.1.121/gwt-detached-view.jsp";
  const nop = eaup?.howto?.nop || "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/";
  return (
    <section className="howto" aria-label="nm eaup gwt">
      <small>NM PUBPORTAL · EAUP · {eaup?.origin?.portal || eaup?.howto?.portal || "PORTAL.29.0.0.1.121"}</small>
      <b>That JSP is the EAUP GWT view, not a feed</b>
      <p>
        {eaup?.howto?.note ||
          "gwt-detached-view.jsp with _view_id=EAUP_DETACHED_DETAILS is the NOP Public Portal HMI for European AUP/UUP. HTML + GWT EaupModule, not JSON/GeoJSON. This dashboard does not scrape GWT RPC or NM B2B SOAP."}
      </p>
      <div className="kv">
        <span>View</span>
        <code>
          <a href={view} target="_blank" rel="noreferrer">
            EAUP_DETACHED_DETAILS
          </a>
        </code>
        <span>NOP</span>
        <code>
          <a href={nop} target="_blank" rel="noreferrer">
            public NM portal
          </a>
        </code>
      </div>
      <ol>
        <li>
          {eaup?.origin?.title || "AUP/UUP Details"} · {eaup?.origin?.moduleLibrary || "GWT EaupModule"}
          {eaup?.origin?.bytes ? ` · ${eaup.origin.bytes} bytes HTML` : ""}
          {eaup?.origin?.moduleBytes ? ` · ${eaup.origin.moduleBytes} bytes nocache.js` : ""} ·{" "}
          {eaup?.origin?.feed ? "looks like a feed" : "not a feed"}
        </li>
        <li>Live NM on Radar is still NSV EDYYFMP GeoJSON. Open the public NOP in a browser for the human EAUP tables.</li>
      </ol>
      <p className="note">Do not paste NOP credentials here. Do not file NM B2B AirspaceAvailability from this dashboard.</p>
    </section>
  );
}

function MainPagesHowto({
  gwt,
}: {
  gwt: {
    n?: number;
    feeds?: number;
    origin?: {
      ok?: boolean;
      status?: number;
      gwt?: boolean;
      feed?: boolean;
      json?: boolean;
      contentType?: string;
      lastModified?: string;
      headOnly?: boolean;
      bytes?: number;
      nocacheBytes?: number;
      nocacheLibrary?: string;
      permutationKnown?: boolean;
      strongName?: string;
      portal?: string;
      module?: string;
      url?: string;
    };
    howto?: { url?: string; cacheJs?: string; nocache?: string; nop?: string; portal?: string; module?: string; strongName?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const cacheJs =
    gwt?.howto?.cacheJs ||
    gwt?.origin?.url ||
    "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/PORTAL.29.0.0.1.121/gwt/MainPages/4BDC1927B945490FDBC82DC46DD5EC4E.cache.js";
  const nocache =
    gwt?.howto?.nocache ||
    "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/PORTAL.29.0.0.1.121/gwt/MainPages/MainPages.nocache.js";
  const nop = gwt?.howto?.nop || "https://www.public.nm.eurocontrol.int/PUBPORTAL/gateway/spec/";
  const strong = gwt?.howto?.strongName || gwt?.origin?.strongName || "4BDC1927B945490FDBC82DC46DD5EC4E";
  return (
    <section className="howto" aria-label="nm mainpages gwt">
      <small>NM PUBPORTAL · GWT · {gwt?.origin?.portal || gwt?.howto?.portal || "PORTAL.29.0.0.1.121"}</small>
      <b>That cache.js is the MainPages GWT permutation, not a feed</b>
      <p>
        {gwt?.howto?.note ||
          "4BDC1927B945490FDBC82DC46DD5EC4E.cache.js is compiled GWT HMI for the NOP Public Portal MainPages module. JavaScript chrome, not JSON/GeoJSON. This dashboard does not download the permutation body or scrape GWT RPC."}
      </p>
      <div className="kv">
        <span>Permutation</span>
        <code>
          <a href={cacheJs} target="_blank" rel="noreferrer">
            {strong.slice(0, 8)}….cache.js
          </a>
        </code>
        <span>Bootstrap</span>
        <code>
          <a href={nocache} target="_blank" rel="noreferrer">
            MainPages.nocache.js
          </a>
        </code>
        <span>NOP</span>
        <code>
          <a href={nop} target="_blank" rel="noreferrer">
            public NM portal
          </a>
        </code>
      </div>
      <ol>
        <li>
          {gwt?.origin?.module || gwt?.howto?.module || "MainPages"} · {gwt?.origin?.nocacheLibrary || "GWT"}
          {gwt?.origin?.contentType ? ` · ${gwt.origin.contentType}` : ""}
          {gwt?.origin?.lastModified ? ` · ${gwt.origin.lastModified}` : ""}
          {gwt?.origin?.nocacheBytes ? ` · ${gwt.origin.nocacheBytes} bytes nocache.js` : ""} ·{" "}
          {gwt?.origin?.headOnly ? "HEAD only on cache.js" : ""} · {gwt?.origin?.feed ? "looks like a feed" : "not a feed"}
        </li>
        <li>
          Strong name {strong}
          {gwt?.origin?.permutationKnown ? " listed in nocache.js" : ""}. Live NM on Radar is still NSV EDYYFMP GeoJSON.
        </li>
      </ol>
      <p className="note">Do not scrape GWT RPC. Do not paste NOP credentials here.</p>
    </section>
  );
}

function NmHowto({
  nm,
}: {
  nm: { fmp?: string; n?: number; theater?: number; touching?: number; fmps?: { fmp?: string; n?: number }[]; source?: { portal?: string; fmps?: string[] }; regulations?: { id: string; name: string; reason?: string; delay?: number; n?: number }[] } | null;
}) {
  const url = nm?.source?.portal || "https://portal.nsv.eurocontrol.int/eurocontrol/flights/EDYYFMP";
  const regs = nm?.regulations || [];
  const fmps = (nm?.fmps || []).map((x) => x.fmp).filter(Boolean).join("+") || nm?.fmp || "EDYYFMP+LJLAFMP";
  return (
    <section className="howto" aria-label="eurocontrol nsv">
      <small>EUROCONTROL NSV · {fmps}</small>
      <b>Maastricht + Ljubljana FMP 4D trajectories</b>
      <p>
        Live Network Manager tracks from the public NSV portal. EDYYFMP and LJLAFMP GeoJSON are merged by flight id.
        Positions are interpolated along the filed 4D route. Radar NM chip plots matched plus unmatched leftover in theater. Click a plane (or the NM/IFPS/FPL chip) for cyan/gold remainder; lines older than 30 minutes drop so the map stays readable. Not CAT 048. Not NM B2B SOAP.
      </p>
      <div className="kv">
        <span>Source</span>
        <code>{url}</code>
        <span>FMPs</span>
        <code>
          {(nm?.fmps || []).map((x) => `${x.fmp} ${x.n ?? 0}`).join(" · ") || fmps}
        </code>
      </div>
      <p className="note">
        {nm?.n
          ? `${nm.n} live NM tracks · ${nm.theater ?? 0} in the Slovenia theater · ${nm.touching ?? 0} touching FMP`
          : "Waiting for NSV"}
      </p>
      {regs.length ? (
        <ol>
          {regs.slice(0, 6).map((r) => (
            <li key={r.id}>
              {r.name} · {r.reason || "ATFCM"} · {r.n ?? 0} flights · avg delay {r.delay ?? 0} min
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ArrivalsHowto({
  board,
}: {
  board: {
    n?: number;
    si?: number;
    live?: { flight?: string; dep?: string; dest?: string; route?: string; remKm?: number | null; etaMin?: number | null; phase?: string; altFt?: number; gs?: number; si?: boolean; airport?: string }[];
    boards?: { icao: string; iata?: string; name?: string; si?: boolean; n: number; items: { flight?: string; dep?: string; dest?: string; remKm?: number | null; etaMin?: number | null; phase?: string; altFt?: number }[] }[];
    airports?: { icao?: string; iata?: string; name?: string }[];
    fids?: { ok?: boolean; status?: number; feed?: boolean; json?: boolean; url?: string; note?: string; error?: string };
    opensky?: { ok?: boolean; feed?: boolean; n?: number; error?: string; icao?: string };
    origin?: { feed?: boolean; json?: boolean; route?: string; airport?: string; n?: number };
    howto?: { url?: string; fids?: string; opensky?: string; route?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const rows = board?.live || [];
  const boards = board?.boards || [];
  const fids = board?.howto?.fids || board?.fids?.url || "https://lju-airport.si/en/flights/arrivals-and-departures/";
  const route = board?.howto?.route || board?.origin?.route || "https://vrs-standing-data.adsb.lol/routes/";
  const ljlj = boards.find((b) => b.icao === "LJLJ");
  return (
    <section className="howto" aria-label="airport arrivals">
      <small>AIRPORT ARRIVALS · LIVE DEST</small>
      <b>Inbound to LJLJ and regional airports from public dest</b>
      <p>
        {board?.howto?.note ||
          "Airborne arrivals are live ADS-B/MLAT tracks whose public callsign route dest is that airport. Not a scraped FIDS board, not AMAN, not NM B2B SOAP."}
      </p>
      <div className="kv">
        <span>Live</span>
        <code>
          {board?.n ?? rows.length} inbound · {board?.si ?? 0} to LJ**
        </code>
        <span>LJLJ</span>
        <code>
          {ljlj?.n ?? 0} · {ljlj?.name || "Ljubljana Jože Pučnik"}
        </code>
        <span>FIDS</span>
        <code>
          {board?.fids?.feed ? "JSON" : board?.fids?.status ? `HTTP ${board.fids.status}` : "not JSON"}
        </code>
        <span>OpenSky</span>
        <code>{board?.opensky?.feed ? `${board.opensky.n ?? 0} landed` : board?.opensky?.error ? "timeout" : "no feed"}</code>
      </div>
      {boards.filter((b) => b.n).length ? (
        <ol>
          {boards
            .filter((b) => b.n)
            .slice(0, 8)
            .map((b) => (
              <li key={b.icao}>
                {b.icao}
                {b.iata ? `/${b.iata}` : ""} · {b.name} · {b.n} inbound
                {b.items[0]
                  ? ` · ${b.items[0].flight} ${b.items[0].dep || "?"}→${b.items[0].dest}${
                      b.items[0].remKm != null ? ` · ${b.items[0].remKm} km` : ""
                    }${b.items[0].etaMin != null ? ` · ${b.items[0].etaMin} min` : ""}`
                  : ""}
              </li>
            ))}
        </ol>
      ) : (
        <p className="note">No airborne inbound to LJLJ/LJMB/LJPZ/LOWW/LDZA/LIPZ/LHBP in theater right now.</p>
      )}
      <p className="note">
        Radar Arrivals chip = dest LJ**.{" "}
        <a href={fids} target="_blank" rel="noreferrer">
          LJU FIDS
        </a>{" "}
        is HTML
        {board?.fids?.note ? ` · ${board.fids.note}` : ""}.{" "}
        <a href={route} target="_blank" rel="noreferrer">
          Route JSON
        </a>
      </p>
    </section>
  );
}

function LiveFplHowto({
  fpl,
}: {
  fpl: {
    n?: number;
    live?: { flight?: string; dep?: string; dest?: string; route?: string; si?: boolean; altFt?: number; gs?: number }[];
    origin?: { n?: number; cached?: number; hits?: number; misses?: number; route?: string; feed?: boolean; host?: string };
    howto?: { url?: string; route?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const rows = fpl?.live || [];
  const api = fpl?.howto?.route || fpl?.origin?.route || "https://api.adsb.lol/api/0/route/";
  const siN = rows.filter((x) => x.si).length;
  return (
    <section className="howto" aria-label="live flight plans">
      <small>LIVE FLIGHT PLANS · ADS-B ROUTE</small>
      <b>Filed O/D on every live callsign in theater</b>
      <p>
        {fpl?.howto?.note ||
          "Public JSON from api.adsb.lol/api/0/route/{callsign}. Gold dashed remainder to destination. Not IFPS filing."}
      </p>
      <div className="kv">
        <span>Live</span>
        <code>{fpl?.n ?? rows.length} plans</code>
        <span>SI airports</span>
        <code>{siN}</code>
        <span>Cache</span>
        <code>
          {fpl?.origin?.cached ?? 0} · {fpl?.origin?.hits ?? 0} hit / {fpl?.origin?.misses ?? 0} miss
        </code>
        <span>API</span>
        <code>
          <a href={api} target="_blank" rel="noreferrer">
            /api/0/route
          </a>
        </code>
      </div>
      {rows.length ? (
        <ol>
          {rows.slice(0, 10).map((x) => (
            <li key={x.flight}>
              {x.flight} · {x.dep || "?"}→{x.dest || "?"}
              {x.si ? " · LJ" : ""}
              {x.altFt ? ` · FL${String(Math.round(x.altFt / 100)).padStart(3, "0")}` : ""}
            </li>
          ))}
        </ol>
      ) : (
        <p className="note">Waiting for callsign routes. Open Radar FPL in a few seconds.</p>
      )}
    </section>
  );
}

function EcDashHowto({
  dash,
}: {
  dash: {
    n?: number;
    feeds?: number;
    version?: string;
    si?: { flights?: number | null; delayMin?: number | null; vsPrevPct?: number | null; vs2019Pct?: number | null; rank?: number | null; y2d?: number | null; co2?: number | null; billed?: number | null; sync?: { date?: string; country?: string } };
    network?: { flights?: number | null; delayMin?: number | null; vsPrevPct?: number | null; co2?: number | null; sync?: { date?: string } };
    sitrep?: { title?: string; date?: string; flights?: number | null; delayMin?: number | null };
    liveNet?: { airborne?: number; landed?: number; planned?: number; total?: number; delayMin?: number; top?: { name: string; delay: number; avg: number }[]; liveTop?: { name: string; delay: number; avg: number }[]; url?: string; feed?: boolean };
    news?: { title?: string; date?: string; url?: string };
    airport?: { code?: string; name?: string };
    livetraffic?: { url?: string; onRadar?: boolean; fmp?: string };
    origin?: { ok?: boolean; feed?: boolean; json?: boolean; cors?: string; version?: string; dataApp?: string; listing?: { ok?: boolean; status?: number; bytes?: number; livetraffic?: boolean; url?: string } };
    offers?: { id: string; name: string; url: string; kind: string; live: boolean; feed: boolean; note?: string }[];
    sitemap?: { id: string; name: string; url: string; kind?: string; feed?: boolean; html?: boolean; pdf?: boolean; bytes?: number; contentType?: string; status?: number; note?: string }[];
    sitemapN?: number;
    sitemapFeeds?: number;
    howto?: { url?: string; listing?: string; livetraffic?: string; dataApp?: string; nsv?: string; aiuPortal?: string; aiuLive?: string; adrr?: string; prc?: string; ourData?: string; uas?: string; ans?: string; trendsPdf?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const listing = dash?.howto?.listing || dash?.origin?.listing?.url || "https://www.eurocontrol.int/what-we-offer?f%5B0%5D=type%3ADashboard";
  const dataApp = dash?.howto?.dataApp || dash?.origin?.dataApp || "https://api-data-app.eurocontrol.int/api/docs";
  const liveUrl = dash?.howto?.livetraffic || dash?.livetraffic?.url || "https://www.eurocontrol.int/shared/livetraffic/";
  const si = dash?.si;
  const net = dash?.network;
  const live = dash?.liveNet;
  const rest = (dash?.offers || []).filter((o) => !o.live);
  const sitemap = dash?.sitemap || [];
  const fmt = (n: number | null | undefined) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-GB"));
  const signed = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}%`);
  return (
    <section className="howto" aria-label="eurocontrol dashboards listing">
      <small>EUROCONTROL · WHAT WE OFFER · DASHBOARDS · API {dash?.version || "5.0.0"}</small>
      <b>Public live data from that listing</b>
      <p>
        {dash?.howto?.note ||
          "The Dashboards catalog has one live traffic SPA (NSV, already on Radar) and one public JSON API (api-data-app daily SI/network counts). The rest is login, historical ACE, or portal chrome. Not scraped."}
      </p>
      <div className="kv">
        <span>Live NSV</span>
        <code>
          {fmt(live?.airborne)} airborne · {fmt(live?.delayMin)} min delay · {fmt(live?.planned)} planned
        </code>
        <span>Top delay</span>
        <code>{live?.top?.[0] ? `${live.top[0].name} ${fmt(live.top[0].delay)} min` : "—"}</code>
        <span>SI {si?.sync?.date || ""}</span>
        <code>
          {fmt(si?.flights)} flights · delay {si?.delayMin ?? 0} min · vs prev {signed(si?.vsPrevPct)}
        </code>
        <span>Network {net?.sync?.date || ""}</span>
        <code>
          {fmt(net?.flights)} flights · delay {net?.delayMin ?? "—"} min/flt
        </code>
        <span>Sitrep</span>
        <code>
          {dash?.sitrep?.title || "—"}
          {dash?.sitrep?.flights != null ? ` · ${fmt(dash.sitrep.flights)} daily` : ""}
        </code>
        <span>LJLJ</span>
        <code>{dash?.airport?.name || "Ljubljana"}</code>
        <span>SI CO₂</span>
        <code>{si?.co2 != null ? String(si.co2) : "—"}</code>
        <span>SI billed</span>
        <code>{si?.billed != null ? String(si.billed) : "—"}</code>
      </div>
      <ol>
        <li>
          <a href={liveUrl} target="_blank" rel="noreferrer">
            Live traffic
          </a>{" "}
          = NSV {dash?.livetraffic?.fmp || "EDYYFMP"} already on Radar
        </li>
        <li>
          <a href={dataApp} target="_blank" rel="noreferrer">
            api-data-app
          </a>{" "}
          {dash?.origin?.json ? "JSON" : ""} CORS {dash?.origin?.cors || "*"} · {dash?.origin?.feed ? "live daily feed" : "waiting"}
          {dash?.origin?.listing?.bytes ? ` · listing ${dash.origin.listing.bytes} bytes` : ""}
        </li>
        <li>
          <a href={dash?.howto?.aiuPortal || "https://github.com/euctrl-pru/aiu-portal"} target="_blank" rel="noreferrer">
            aiu-portal
          </a>{" "}
          Hugo/PRU chrome ·{" "}
          <a href={dash?.howto?.adrr || "https://www.eurocontrol.int/dashboard/aviation-data-research"} target="_blank" rel="noreferrer">
            ADRR
          </a>{" "}
          historical login ·{" "}
          <a href={dash?.howto?.prc || "https://prc-data-challenge-2026.netlify.app/"} target="_blank" rel="noreferrer">
            PRC 2026
          </a>{" "}
          contest (not live)
        </li>
        {rest.slice(0, 6).map((o) => (
          <li key={o.id}>
            {o.name} · {o.kind}
            {o.kind === "login" ? " (not scraped)" : o.kind === "historical" ? " (not live)" : ""}
          </li>
        ))}
        {sitemap.slice(0, 8).map((s) => (
          <li key={`sm-${s.id}`}>
            {s.name} · {s.contentType || s.kind || "HTML"}
            {s.bytes ? ` · ${s.bytes} bytes` : ""} · {s.feed ? "looks like a feed" : "not a feed"}
          </li>
        ))}
      </ol>
      {dash?.news?.title ? (
        <p className="note">
          {dash.news.date} · {dash.news.url ? <a href={dash.news.url} target="_blank" rel="noreferrer">{dash.news.title}</a> : dash.news.title}
        </p>
      ) : (
        <p className="note">
          Filter with country.id=18 then traffic.sync.id. Naive iso2=SI still returns MUAC.{" "}
          <a href={listing} target="_blank" rel="noreferrer">
            Listing
          </a>
        </p>
      )}
    </section>
  );
}

function FeedHowto({ feeder, sdrCount }: { feeder: SdrFeeder | null; sdrCount: number }) {
  const host = feeder?.howto?.tcp?.host || feeder?.feeder?.tcpHost || "";
  const port = feeder?.howto?.tcp?.port || feeder?.feeder?.tcpPort || 50001;
  const clients = feeder?.feeder?.clients ?? 0;
  const frames = feeder?.feeder?.frames ?? 0;
  const live = feeder?.n ?? sdrCount;
  return (
    <section className="howto" aria-label="add your radio">
      <small>YOUR PHONE RADIO</small>
      <b>Point Exportdata at this dashboard</b>
      <p>
        That screen is a TCP feeder, not a web upload. Leave the three server toggles off. Keep{" "}
        <em>Active export to a host</em> on and type these two fields.
      </p>
      <div className="kv">
        <span>Hostname</span>
        <code>{host || "starting…"}</code>
        <span>Port</span>
        <code>{port}</code>
      </div>
      <ol>
        <li>Open Exportdata on the radio app.</li>
        <li>Beast / AVR / BaseStation server switches stay off.</li>
        <li>Turn on Active export to a host.</li>
        <li>
          Hostname = <code>{host || "…"}</code>, port = <code>{port}</code>.
        </li>
        <li>Save. Keep the app open while the dongle is running. Your tracks show as Car SDR on Radar.</li>
      </ol>
      <p className="note">
        {clients ? `${clients} phone connected` : "Waiting for your phone to connect"}
        {frames ? ` · ${frames} frames` : ""}
        {` · ${live} live SDR tracks`}
        {feeder?.feeder?.lastErr ? ` · ${feeder.feeder.lastErr}` : ""}
      </p>
    </section>
  );
}

function AsterixHowto({
  ax,
}: {
  ax: {
    n?: number;
    stations?: number;
    feeds?: number;
    live?: { n021?: number; n048?: number; n062?: number; n025?: number; n063?: number; n065?: number; bytes?: number; raw?: string };
    cats?: number[];
    ground?: { id: string; designator?: string; sstat?: string; nogo?: boolean }[];
    radar?: { lat?: number; lon?: number } | null;
    specs?: { cat025?: { edition?: string; name?: string; url?: string; pdf?: string; feed?: boolean }; cat048?: { edition?: string; name?: string; url?: string; pdf?: string; feed?: boolean } };
    origin?: { ok?: boolean; json?: boolean; raw?: boolean; post?: boolean; feed?: boolean; poll?: boolean; pollUrl?: string; udp?: number; udpBind?: string; radar?: boolean; tool?: string; note?: string };
    howto?: {
      tool?: string;
      post?: string;
      raw?: string;
      poll?: string;
      note?: string;
      steps?: string[];
      exampleRadar?: { lat?: number; lon?: number; note?: string };
      body?: string;
      spec025?: { edition?: string; name?: string; url?: string; feed?: boolean };
      spec048?: { edition?: string; name?: string; url?: string; feed?: boolean };
    };
  } | null;
}) {
  const post = ax?.howto?.post || "/api/asterix";
  const spec = ax?.specs?.cat025 || ax?.howto?.spec025;
  const spec048 = ax?.specs?.cat048 || ax?.howto?.spec048;
  return (
    <section className="howto" aria-label="asterix parser cat 025">
      <small>ASTERIX PARSER · CAT 062 COMPLETE · 048 GAP-FILL · 063/065 STATUS</small>
      <b>ASTX is leftover CAT 048 — drones still come from OGN/ADS-B, not from CAT</b>
      <p>
        {ax?.howto?.note ||
          "True leftover radar is CAT 048 POST /api/asterix or UDP (default 8600). CAT 048 Part 4 is monoradar plots. CAT 025 is ground status. NSV/IFPS is 4D, not CAT. Spec PDFs and PENS/SIA guides are not live streams."}
      </p>
      <div className="kv">
        <span>POST</span>
        <code>{post}</code>
        <span>CAT 048</span>
        <code>
          <a href={spec048?.url || "https://www.eurocontrol.int/publication/cat048-eurocontrol-specification-surveillance-data-exchange-asterix-part4"} target="_blank" rel="noreferrer">
            Part 4 Ed {spec048?.edition || "1.32"} · {spec048?.name || "Monoradar Target Reports"}
          </a>
        </code>
        <span>CAT 025</span>
        <code>
          {spec?.name || "CNS/ATM Ground System Status"} · Ed {spec?.edition || "1.6"}
          {spec?.feed === false ? " · spec not a feed" : ""}
        </code>
        <span>Live</span>
        <code>
          {ax?.n ?? 0} tracks · {ax?.stations ?? ax?.ground?.length ?? 0} ground
          {ax?.live?.n048 != null ? ` · ${ax.live.n021 || 0}×021 ${ax.live.n048}×048 ${ax.live.n062 || 0}×062 ${ax.live.n063 || 0}×063 ${ax.live.n065 || 0}×065` : ""}
        </code>
        <span>Raw</span>
        <code>
          <a href={ax?.live?.raw || ax?.howto?.raw || "/api/asterix.raw"} target="_blank" rel="noreferrer">
            /api/asterix.raw
          </a>
          {ax?.live?.bytes ? ` · ${ax.live.bytes} B` : ""}
        </code>
        <span>Body</span>
        <code>{ax?.howto?.body || "application/octet-stream or { hex }"}</code>
        <span>Poll</span>
        <code>{ax?.origin?.poll ? ax.origin.pollUrl : "ASTERIX_FEED_URL unset"}</code>
        <span>UDP</span>
        <code>{ax?.origin?.udp ? `${ax.origin.udpBind || "0.0.0.0"}:${ax.origin.udp}` : "ASTERIX_UDP_PORT=0"}</code>
      </div>
      <ol>
        {(ax?.howto?.steps || []).map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="note">
        {ax?.origin?.note ||
          "Send the other two EUROCONTROL publication URLs if you have them. Theme CSS/JS is not ingested."}
      </p>
    </section>
  );
}

function RidHowto({
  rid,
  radarRid,
}: {
  radarRid: number;
  rid: {
    n?: number;
    feeds?: number;
    items?: { id: string; serial?: string; call?: string; model?: string; lat?: number; lon?: number }[];
    origin?: { ok?: boolean; json?: boolean; post?: boolean; feed?: boolean; poll?: boolean; pollUrl?: string; note?: string };
    catalog?: { id: string; name: string; url: string; kind?: string; public?: boolean; feed?: boolean; note?: string; contentType?: string; status?: number; bytes?: number }[];
    howto?: { url?: string; post?: string; method?: string; body?: string; verifier?: string; dronescout?: string; dronetag?: string; esp32?: string; djiFeedback?: string; poll?: string; steps?: string[]; note?: string };
  } | null;
}) {
  const post = rid?.howto?.post || rid?.howto?.url || "/api/rid";
  const catalog = rid?.catalog || [];
  return (
    <section className="howto" aria-label="remote id detection">
      <small>DIRECT REMOTE ID · ASTM F3411 / EN 4709-002</small>
      <b>No public RID GeoJSON — live UAV still comes from OGN/ADS-B</b>
      <p>
        {rid?.howto?.note ||
          "Remote ID is a BLE/Wi-Fi broadcast from the drone. Live UAV pins also come from public OGN type 13 and ADS-B B6 in the Alpine box. Empty in Slovenia is a fact until a drone is on those feeds or a receiver POSTs decoded JSON here."}
      </p>
      <div className="kv">
        <span>POST</span>
        <code>{post}</code>
        <span>Live</span>
        <code>
          {rid?.n ?? 0} ingested · {radarRid} on Radar
        </code>
        <span>Body</span>
        <code>{rid?.howto?.body || '{"basic_id":"…","drone_lat":46.05,"drone_lon":14.51}'}</code>
      </div>
      <ol>
        {(rid?.howto?.steps || []).map((s) => (
          <li key={s}>{s}</li>
        ))}
        {!(rid?.howto?.steps || []).length ? (
          <>
            <li>Use Drone Scanner / OpenDroneID on a phone, or an ESP32 WiFi-RemoteID board, near the aircraft.</li>
            <li>
              POST decoded JSON to <code>{post}</code> with drone_lat, drone_lon, and basic_id.
            </li>
            <li>Radar Drones chip plots live OGN type 13 and ADS-B B6 UAV in the Alpine box, plus local RID. The same public ultrafeeder JSON also feeds balloons, helicopters, and LJMS taxi (a plane driving to the runway).</li>
          </>
        ) : null}
      </ol>
      {catalog.length ? (
        <ol>
          {catalog.map((c) => (
            <li key={c.id}>
              {c.name}
              {c.contentType ? ` · ${c.contentType}` : ""}
              {c.status ? ` · HTTP ${c.status}` : ""} · {c.feed ? "looks like a feed" : "not a feed"}
              {c.note ? ` · ${c.note}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="note">
        {rid?.origin?.poll ? `Polling ${rid.origin.pollUrl}` : "RID_FEED_URL unset"} · {rid?.n ? `${rid.n} live RID rows` : "0 live RID rows"}
      </p>
    </section>
  );
}

function trackLabel(p: Plane) {
  return identLabel(p).primary;
}

function labelOf(p: Plane | Sensor | Gtw | Msg) {
  if ("flight" in p && "altFt" in p) return trackLabel(p as Plane);
  return (p as Sensor | Gtw | Msg).name;
}

function GatewayCard({ g, on, onClick }: { g: Gtw | Sensor; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`scard gateway ${on ? "on" : ""} ${g.online ? "up" : "down"}`} onClick={onClick}>
      <small>
        {g.src || "gateway"} · {g.online ? "online" : "stale"}
      </small>
      <b>{g.name}</b>
      <span>
        {g.km} km · {g.ageMin != null ? `${g.ageMin} min` : "live"} · {g.eui ? g.eui.slice(-8) : ""}
      </span>
      <div className="bar">
        <em>link</em>
        <i style={{ width: g.online ? "86%" : "16%" }} />
        <strong>{g.online ? "UP" : "DOWN"}</strong>
      </div>
    </button>
  );
}

function SensorCard({ s, on, onClick }: { s: Sensor; on: boolean; onClick: () => void }) {
  if (s.kind === "switch") {
    return (
      <button type="button" className={`scard switch ${s.occ ? "occ" : "free"} ${on ? "on" : ""}`} onClick={onClick}>
        <small>switch</small>
        <b>{s.name}</b>
        <span className={`badge ${s.occ ? "bad" : "ok"}`}>{s.occ ? `OCC ${s.train || ""}` : "FREE"}</span>
        <span>{s.km} km · OSM</span>
      </button>
    );
  }
  if (s.kind === "mesh") {
    return (
      <button type="button" className={`scard mesh ${on ? "on" : ""}`} onClick={onClick}>
        <small>mesh</small>
        <b>{s.name}</b>
        <span>{s.detail || "node"}</span>
        {s.rssi != null ? (
          <div className="bar">
            <em>RSSI</em>
            <i style={{ width: `${barPct("rssi", "dBm", s.rssi)}%` }} />
            <strong>{s.rssi} dBm</strong>
          </div>
        ) : (
          <span>{s.km} km</span>
        )}
      </button>
    );
  }
  if (s.kind === "gateway") {
    return <GatewayCard g={s} on={on} onClick={onClick} />;
  }
  if (s.kind === "ism" || s.kind === "aprs" || s.kind === "ais" || s.kind === "sdr") {
    const lab = s.kind === "ism" ? "ISM 433/868" : s.kind === "aprs" ? "APRS" : s.kind === "ais" ? "AIS" : "MS SDR";
    return (
      <button type="button" className={`scard ${s.kind} ${on ? "on" : ""}`} onClick={onClick}>
        <small>{lab}</small>
        <b>{s.name}</b>
        <span>{s.detail || s.kind}</span>
        {s.primary ? (
          <div className="bar">
            <em>{s.primary.title}</em>
            <i style={{ width: `${barPct(s.primary.title, s.primary.unit, s.primary.last)}%` }} />
            <strong>
              {s.primary.last}
              {s.primary.unit ? ` ${s.primary.unit}` : ""}
            </strong>
          </div>
        ) : (
          <span>{s.km} km · MS SDR</span>
        )}
      </button>
    );
  }
  if (s.kind === "wifi" || s.kind === "bluetooth" || s.kind === "cell") {
    return (
      <button type="button" className={`scard ${s.kind} ${on ? "on" : ""}`} onClick={onClick}>
        <small>{s.kind === "wifi" ? "Wi-Fi" : s.kind === "bluetooth" ? "Bluetooth" : "Cell"}</small>
        <b>{s.name}</b>
        <span>{s.detail || s.kind}</span>
        {s.rssi != null ? (
          <div className="bar">
            <em>RSSI</em>
            <i style={{ width: `${barPct("rssi", "dBm", s.rssi)}%` }} />
            <strong>{s.rssi} dBm</strong>
          </div>
        ) : (
          <span>{s.km} km · WiGLE</span>
        )}
      </button>
    );
  }
  if (s.kind === "train") {
    return (
      <button type="button" className={`scard train ${on ? "on" : ""}`} onClick={onClick}>
        <small>SŽ GPS</small>
        <b>{s.name}</b>
        <span>{s.detail || s.km + " km"}</span>
      </button>
    );
  }
  return (
    <button type="button" className={`scard ${s.kind} ${on ? "on" : ""}`} onClick={onClick}>
      <small>{s.kind}</small>
      <b>{s.name}</b>
      <span>
        {s.km} km
        {s.lastAt ? ` · ${ago(Date.parse(s.lastAt))}` : ""}
      </span>
      {s.series?.[0]?.pts ? <Spark pts={s.series[0].pts} unit={s.series[0].unit} height={56} /> : null}
      {(s.sensors || []).length ? (
        (s.sensors || []).slice(0, 3).map((x) => (
          <div key={x.title} className="bar">
            <em>{x.title}</em>
            <i style={{ width: `${barPct(x.title, x.unit, x.last)}%` }} />
            <strong>
              {x.last ?? "—"} {x.unit}
            </strong>
          </div>
        ))
      ) : (
        <span>no live sample</span>
      )}
    </button>
  );
}

function Detail({ pick, onClose }: { pick: Plane | Sensor | Gtw | Msg; onClose: () => void }) {
  const isPlane = "flight" in pick && "altFt" in pick;
  const p = pick as Plane;
  const s = pick as Sensor & Gtw & Msg;
  return (
    <aside className="sheet" aria-label="details" onClick={(e) => e.stopPropagation()}>
      <header>
        <small>{isPlane ? p.role : s.kind || "node"}</small>
        <b>{isPlane ? trackLabel(p) : s.name}</b>
        <button type="button" onClick={onClose}>
          close
        </button>
      </header>
      {isPlane ? (
        <>
          <div className="viz">
            <div className="compass" aria-hidden="true">
              <b style={{ transform: `rotate(${p.track}deg)` }}>▲</b>
              <small>{p.track}°</small>
            </div>
            <div className="stat">
              <span>Altitude</span>
              <strong className="tick" style={{ color: p.color }}>
                {Math.round((Number(p.altFt) || 0) * 0.3048)}
              </strong>
              <em>m</em>
              <div className="alt-meter">
                <i style={{ width: `${Math.min(100, ((Number(p.altFt) || 0) * 0.3048) / 120)}%`, background: p.color }} />
              </div>
            </div>
            <div className="stat">
              <span>Ground speed</span>
              <strong className="tick">{Math.round((Number(p.gs) || 0) * 1.852)}</strong>
              <em>km/h</em>
            </div>
          </div>
          <ul>
            <li>
              <span>Type</span>
              <strong>{p.typecode || "—"}</strong>
            </li>
            <li>
              <span>Reg</span>
              <strong>{p.reg || "—"}</strong>
            </li>
            <li>
              <span>Squawk</span>
              <strong>{p.squawk || "—"}</strong>
            </li>
            <li>
              <span>Source</span>
              <strong>{p.src}</strong>
            </li>
            <li>
              <span>Range</span>
              <strong>{p.km} km</strong>
            </li>
            <li>
              <span>Category</span>
              <strong>{p.category || "—"}</strong>
            </li>
          </ul>
        </>
      ) : (
        <>
          {s.kind === "mesh" || s.battery != null || s.temp != null ? <TelemetryHud n={s} /> : null}
          <ul>
          <li>
            <span>Kind</span>
            <strong>{s.kind}</strong>
          </li>
          {s.km != null ? (
            <li>
              <span>Range</span>
              <strong>{s.km} km</strong>
            </li>
          ) : null}
          {s.online != null ? (
            <li>
              <span>Link</span>
              <strong>{s.online ? "online" : "stale"}</strong>
            </li>
          ) : null}
          {s.occ != null ? (
            <li>
              <span>Switch</span>
              <strong>{s.occ ? `occupied ${s.train || ""}` : "free"}</strong>
            </li>
          ) : null}
          {s.rssi != null ? (
            <li>
              <span>RSSI</span>
              <strong>{s.rssi} dBm</strong>
            </li>
          ) : null}
          {s.snr != null ? (
            <li>
              <span>SNR</span>
              <strong>{s.snr}</strong>
            </li>
          ) : null}
          {s.eui ? (
            <li>
              <span>EUI</span>
              <strong>{s.eui}</strong>
            </li>
          ) : null}
          {s.detail ? (
            <li>
              <span>Payload</span>
              <strong>{s.detail}</strong>
            </li>
          ) : null}
          {s.at ? (
            <li>
              <span>Age</span>
              <strong>{ago(s.at)}</strong>
            </li>
          ) : null}
          {(s.sensors || []).map((x) => (
            <li key={x.title}>
              <span>{x.title}</span>
              <strong>
                {x.last ?? "—"} {x.unit}
              </strong>
            </li>
          ))}
          {(s.series || []).map((ser) => (
            <li key={ser.title} className="graph-row">
              <LiveGraph pts={ser.pts} title={ser.title} unit={ser.unit} />
            </li>
          ))}
        </ul>
        </>
      )}
    </aside>
  );
}
