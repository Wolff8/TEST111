import React, { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface Train {
  id: string;
  number: string;
  operator: string;
  category: string;
  serviceName: string;
  locomotive: string;
  lineId: string;
  color: string;
  progressPct: number;
  speedKmh: number;
  direction: "FORWARD" | "REVERSE";
  bearingDeg: number;
  lat: number;
  lon: number;
  originStation: string;
  destinationStation: string;
  borderExit: string;
  containers?: {
    totalCountTeu: number;
    flatbedWagonsCount: number;
    wagonType: string;
    totalGrossWeightT: number;
    trainLengthM: number;
    shippingLines: string[];
    cargoContents: string;
    sampleContainerIds: string[];
  };
  foreignTransit?: {
    network: string;
    transitRoute: string;
    distanceOutsideSloKm: number;
    foreignTraction: string;
    finalLogisticsHub: string;
  };
  etcs?: {
    level: string;
    mode: string;
    movementAuthorityM: number;
    targetSpeedKmh: number;
    permittedSpeedKmh: number;
    baliseGroupId: string;
    rbcStatus: string;
  };
  gsmr?: {
    currentBts: string;
    btsName?: string;
    rxLevDbm: number;
    channel: string;
    quality: string;
  };
  lorawanTag?: {
    devEui: string;
    wagonBatteryV: number;
    vibrationG: number;
    tempC: number;
    lastSec: number;
  };
}

export interface RailLine {
  id: string;
  code: string;
  name: string;
  corridor: string;
  lengthKm: number;
  electrification: string;
  tracks: string;
  maxSpeedKmh: number;
  etcs: string;
  color: string;
  path: Array<{ lat: number; lon: number; name: string }>;
}

export interface Station {
  id: string;
  uopid: string;
  line: string;
  name: string;
  lat: number;
  lon: number;
  kmMark: number;
  tracks: number;
  hasYard: boolean;
  etcsL2: boolean;
  type: string;
}

export interface GsmrMast {
  id: string;
  name: string;
  lat: number;
  lon: number;
  freqMhz: number;
  powerDbm: number;
  cellId: number;
  lac: number;
  antHeightM: number;
  coverageKm: number;
}

export interface SensorInfo {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  howItWorks: string;
  whatCanBeSeen: string;
  vendor: string;
  locationOnLine: string;
}

export const DEFAULT_SENSORS: SensorInfo[] = [
  {
    id: "eurobalise",
    category: "SIGNALIZACIJA / ETCS",
    title: "Eurobalise (Balizna skupina BG)",
    subtitle: "Pasivni magnetno-induktivni tirni javljalnik med pragovi",
    howItWorks: "Montirana točno na sredini pragov med tirnicama. Baliza nima lastnega napajanja. Ko vlak zapelje nad njo, antena BTM (Balise Transmission Module) na podvozju lokomotive odda 27 MHz tele-napajalni signal, ki v balizi vzbudi tok. Baliza v delčku sekunde nazaj odda 1023-bitni digitalni telegram pri 4.23 MHz.",
    whatCanBeSeen: "Točna kilometrska lokacija vlaka (referenca LRBG), veljavni profil hitrosti proge, naklon proge (klanec/padec v ‰), razdalja do naslednjega signala, opozorila o radijskih luknjah v GSM-R omrežju.",
    vendor: "Siemens Mobility / Thales",
    locationOnLine: "Tir 1 in 2 na vseh postajah ter vsakih 1.200 m vzdolž elektrificiranih prog v RS.",
  },
  {
    id: "axle_counter",
    category: "VARNOST / ZASEDENOST",
    title: "Osni števci (Frauscher RSR123 / Zp30)",
    subtitle: "Induktivni senzorji štetja osi za ugotavljanje zasedenosti tira",
    howItWorks: "Dvojna induktivna senzorska glava je privijačena neposredno na notranji rob tirnice. Ko kovinski venec kolesa zapelje mimo tuljav, spremeni magnetno polje in ustvari dva fazno zamaknjena električna impulza. Procesor v signalnovarnostni napravi (SVN) prešteje število osi ob vstopu v odsek in ob izstopu. Ko je število izstopnih osi enako vstopnim, se odsek označi kot PROST.",
    whatCanBeSeen: "Zanesljiva zasedenost tirnega odseka, smer vožnje kompozicije, hitrost prevoza posamezne osi, skupno število osi vlaka (za preverjanje celovitosti vlaka - da se vagoni niso odklopili med vožnjo).",
    vendor: "Frauscher Sensortechnik / Iskra d.o.o.",
    locationOnLine: "Pred vsako kretnico in na mejah prostornih odsekov po vsej Sloveniji.",
  },
  {
    id: "gsmr_bts",
    category: "TELEKOMUNIKACIJE",
    title: "Nokia GSM-R Bazna postaja (BTS omrežje SŽ)",
    subtitle: "Digitalni radijski sistem evropskih železnic (UIC EIRENE)",
    howItWorks: "Oddaja v namenskem evropskem frekvenčnem pasu za železnice (876-880 MHz oddaja vlaka / 921-925 MHz oddaja stolpa). Zagotavlja zanesljiv prenos podatkov za Euroradio ETCS Level 2 (kjer center vodenja prometa RBC neposredno v kabino strojevodje pošilja dovoljenje za vožnjo) ter prednostne govorne klice (nujni klic v sili s prioriteto 1).",
    whatCanBeSeen: "Moč sprejetega signala (RxLev v dBm), kakovost prenosa (BER - stopnja napak v bitih), številka celice (Cell ID), frekvenčni kanal (ARFCN 955-974) in neprekinjena pokritost brez mrtvih kotov.",
    vendor: "Nokia Solutions and Networks / Kontron Transportation",
    locationOnLine: "Več kot 200 stolpov vzdolž vseh železniških prog v Sloveniji.",
  },
  {
    id: "hot_box_detector",
    category: "TEHNIČNA DIAGNOSTIKA",
    title: "Detektor vročih osnih ležajev in zavor (GOA / HBD)",
    subtitle: "Tirni infrardeči pirometrični sistem za preprečevanje iztirjenja",
    howItWorks: "Vgrajen v tirno gredo z optičnimi lečami, usmerjenimi pod kotom navzgor proti ležajem koles in zavornim diskom vseh mimo vozečih vagonov pri hitrostih do 160 km/h. V milisekundah izmeri infrardeče sevanje vsakega kolesa. Če temperatura ležaja preseže 90 °C ali se razlikuje za več kot 45 °C od nasprotnega ležaja, sistem takoj javi alarm prometniku.",
    whatCanBeSeen: "Točna temperatura vsakega ležaja v °C, številka pregrete osi na kompoziciji, leva ali desna stran vlaka, blokirana zavorna čeljust.",
    vendor: "Iskraemeco / Voestalpine Railway Systems",
    locationOnLine: "Vstopni odseki pred večjimi postajami (Murska Sobota km 45.8, Zalog, Pragersko, Divača).",
  },
  {
    id: "wild_weight",
    category: "OBREMENITEV IN TIR",
    title: "Merilnik obtežbe in ploščatih mest (WILD - Wheel Impact)",
    subtitle: "Tenzometrični senzorji v steblu tirnice",
    howItWorks: "Tenzometrični lističi so zalepljeni v nevtralno os tirnice. Ko vlak zapelje preko merilnega odseka, senzor meri mikroskopske upogibe jekla. S tem izračuna točno maso vsake posamezne osi v tonah ter zazna udarne sunke, če ima kolo ploščato mesto (posledica zdrsa pri močnem zaviranju).",
    whatCanBeSeen: "Bruto masa posameznega vagona, preobremenitev osi nad dovoljeno kategorijo D4 (22,5 t/os), ekscentrična obtežba (nevarnost prevrnitve kontejnerja), udarna sila na tirnico v kN.",
    vendor: "Kistler / Mermec Group",
    locationOnLine: "Merilni tiri na uvozih v tovorna ranžirišča (Koper Tovorna, Zalog, Tezno).",
  },
  {
    id: "catenary_monitor",
    category: "ELEKTRO-NAPAJANJE",
    title: "Nadzor voznega voda (3 kV DC / 25 kV AC)",
    subtitle: "Transduktorji napetosti in toka v elektro-napajalni postaji (ENP)",
    howItWorks: "Vozni vod v Sloveniji je napajan z enosmerno napetostjo 3.000 V (3 kV DC). Senzorji spremljajo napetostni padec ob pospeševanju težkih tovornih vlakov (lokomotive Siemens Vectron črpajo do 6,4 MW moči). Na Hodošu je nevtralni odsek s fazno ločitvijo, kjer se preklopi na madžarski sistem 25.000 V AC 50 Hz.",
    whatCanBeSeen: "Trenutna napetost voznega voda (2.800 V - 3.400 V DC), odjemni tok v amperih (A), stanje odklopnikov v ENP, zaznava kratkega stika ali padca veje na tir.",
    vendor: "Siemens Energy / SŽ ŽGP",
    locationOnLine: "Elektro-napajalne postaje (ENP) Murska Sobota, Zidani Most, Postojna, Dekani in ločišče Hodoš.",
  },
  {
    id: "npo_crossings",
    category: "CESTNO-ŽELEZNIŠKA VARNOST",
    title: "Avtomatske polzapornice (NPO z radarsko zaščito)",
    subtitle: "Inteligentni nivojski prehod z detekcijo ujetih vozil",
    howItWorks: "Ko vlak doseže vklopno točko na tiru, krmilnik NPO sproži rumeno-rdeče luči in zvočni signal na cesti. Po predpisanem času predzvonenja (8 do 12 sekund) se zapornice začnejo spuščati. Radarski in optični senzorji nad prehodom preverijo prostor med zapornicama. Če na tirih obstane avtomobil, sistem prekine zapiranje in pošlje opozorilo signalu pred prehodom.",
    whatCanBeSeen: "Stanje zapornic (ODPRTO / ZAPIRANJE / ZAPRTO IN ZAPAHNITO), okvara svetlobnega telesa, napetost varnostnih akumulatorjev, čas zadrževanja cestnega prometa.",
    vendor: "Iskra Sistemi / Siemens",
    locationOnLine: "Vsa varovana križanja z državnimi in občinskimi cestami po RS.",
  },
  {
    id: "lorawan_wagon_iot",
    category: "LOGISTIKA IN OKOLJE",
    title: "LoRaWAN industrijski senzorji na vagonih in mostovih",
    subtitle: "Brezžično telemetrično spremljanje kontejnerjev (868 MHz)",
    howItWorks: "Avtonomni senzorji na kontejnerskih vagonih in železniških mostovih z 10-letno baterijo. Preko frekvence 868 MHz pošiljajo podatke o temperaturi tovora, odpiranju vrat kontejnerja, vibracijah ležajev ter vodostaju rek pod železniškimi mostovi (Mura, Sava, Drava).",
    whatCanBeSeen: "DevEUI identifikator vagona, število odpiranj kontejnerja, tresljaji pri ranžiranju v G-enotah, stanje baterije (3.6 V), signal RSSI (-82 dBm).",
    vendor: "Milesight / Dragino / Decentlab",
    locationOnLine: "Kontejnerji Luka Koper, most čez reko Muro (Veržej), most čez Ledavo (MS), savski mostovi.",
  },
];

export interface RailPayload {
  at: string;
  country: string;
  tso: string;
  rneStatus: string;
  electrification: string;
  signalling: string;
  telecom: string;
  lines: RailLine[];
  stations: Station[];
  masts: GsmrMast[];
  trains: Train[];
  sensors?: SensorInfo[];
  stats: {
    totalLinesCovered: number;
    totalStationsCount: number;
    totalGsmrMasts: number;
    totalSlovenianTrains: number;
    totalTeuContainers: number;
    freightTonnageTotal: number;
    foreignTransitRatio: string;
    gsmrSignalHealth: string;
  };
}

export const RailFleetDashboard: React.FC = () => {
  const [data, setData] = useState<RailPayload | null>(null);
  const [selectedTrainId, setSelectedTrainId] = useState<string>("SZ-48401");
  const [activeTab, setActiveTab] = useState<"map" | "containers" | "transit" | "sensors" | "wireshark">("map");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activeLineFilter, setActiveLineFilter] = useState<string>("ALL");
  const [showMasts, setShowMasts] = useState<boolean>(true);
  const [showStations, setShowStations] = useState<boolean>(true);
  const [livePackets, setLivePackets] = useState<any[]>([]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Poll live rail payload
  useEffect(() => {
    let active = true;
    const fetchRail = async () => {
      try {
        const res = await fetch("/api/rail/live");
        if (res.ok && active) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.warn("Napaka pri branju železniških podatkov:", err);
      }
    };

    fetchRail();
    const interval = setInterval(fetchRail, 3_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Poll live Wireshark GSM-R packets
  useEffect(() => {
    let active = true;
    const fetchPackets = async () => {
      try {
        const res = await fetch("/api/network/packets");
        if (res.ok && active) {
          const json = await res.json();
          if (json?.packets) {
            const gsmrPkts = json.packets.filter((p: any) => p.protocol.includes("GSMR") || p.protocol.includes("LORA"));
            setLivePackets(gsmrPkts.slice(0, 15));
          }
        }
      } catch {
        // ignore
      }
    };

    fetchPackets();
    const interval = setInterval(fetchPackets, 3_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Initialize Leaflet Map using Esri Canvas Dark Gray (SAME AS RADAR MAP - NO API KEY REQUIRED)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    // Centered on Slovenia
    const map = L.map(mapContainerRef.current, {
      center: [46.15, 14.95],
      zoom: 8,
      zoomControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    // Official Esri Canvas World Dark Gray Base (Free, reliable, no API key needed)
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16,
      attribution: "Tiles © Esri",
    }).addTo(map);

    // Official Esri Canvas World Dark Gray Reference Layer
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 16,
      opacity: 0.85,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapRef.current = map;

    // Trigger invalidateSize to prevent blank/gray tiles on render
    const fixMapSize = () => {
      if (map) {
        map.invalidateSize();
      }
    };
    map.whenReady(fixMapSize);
    const t1 = setTimeout(fixMapSize, 100);
    const t2 = setTimeout(fixMapSize, 500);
    window.addEventListener("resize", fixMapSize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", fixMapSize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Pan to preset regions
  const setMapView = (lat: number, lon: number, zoom: number) => {
    if (mapRef.current) {
      mapRef.current.setView([lat, lon], zoom, { animate: true });
    }
  };

  // Render Overlays: Rail Lines, Stations, Nokia GSM-R Masts, and Trains
  useEffect(() => {
    const map = mapRef.current;
    const lg = layerGroupRef.current;
    if (!map || !lg || !data) return;

    lg.clearLayers();

    // 1. Draw Railway Lines across Slovenia
    (data.lines || []).forEach((line) => {
      if (activeLineFilter !== "ALL" && line.id !== activeLineFilter) return;
      if (!line.path || line.path.length < 2) return;

      const pts = line.path.map((p) => [p.lat, p.lon] as [number, number]);

      // Outer track ballast line
      L.polyline(pts, {
        color: "#1e293b",
        weight: 6,
        opacity: 0.9,
      }).addTo(lg);

      // Inner electrified rail line with distinct corridor color
      L.polyline(pts, {
        color: line.color,
        weight: 3.5,
        opacity: 0.95,
      }).addTo(lg);
    });

    // 2. Draw Stations (clean non-overlapping small circular markers)
    if (showStations) {
      (data.stations || []).forEach((st) => {
        const isMain = st.tracks >= 6 || st.hasYard;
        const radius = isMain ? 5 : 3.5;
        const color = isMain ? "#38bdf8" : "#94a3b8";

        const marker = L.circleMarker([st.lat, st.lon], {
          radius,
          fillColor: color,
          fillOpacity: 0.9,
          color: "#0f172a",
          weight: 1.5,
        });

        marker.bindTooltip(
          `<b>${st.name}</b><br/><span style="font-size:10px;color:#38bdf8;">${st.line} · Tir: ${st.tracks} · ${st.type}</span>`,
          { direction: "top", offset: [0, -4] }
        );

        marker.addTo(lg);
      });
    }

    // 3. Draw Nokia GSM-R Masts
    if (showMasts) {
      (data.masts || []).forEach((mast) => {
        // Coverage circle
        L.circle([mast.lat, mast.lon], {
          radius: mast.coverageKm * 1000,
          color: "#0284c7",
          weight: 1,
          opacity: 0.35,
          fillColor: "#0284c7",
          fillOpacity: 0.04,
          dashArray: "4, 4",
        }).addTo(lg);

        // Mast marker
        const mastIcon = L.divIcon({
          className: "custom-mast-icon",
          html: `
            <div style="background: rgba(15, 23, 42, 0.85); border: 1.2px solid #0284c7; color: #38bdf8; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; box-shadow: 0 0 8px rgba(2, 132, 199, 0.4);">
              📶
            </div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const mMarker = L.marker([mast.lat, mast.lon], { icon: mastIcon }).addTo(lg);
        mMarker.bindTooltip(
          `<b>${mast.name}</b><br/><span style="color:#0284c7;">${mast.freqMhz} MHz · Cell ${mast.cellId} · LAC ${mast.lac} · Višina ${mast.antHeightM} m</span>`,
          { direction: "top" }
        );
      });
    }

    // 4. Draw Trains with Dynamic Rotating Directional Arrows & Clean Badges
    (data.trains || []).forEach((train) => {
      const isSelected = train.id === selectedTrainId;
      const teu = train.containers?.totalCountTeu || 0;
      const teuBadge = teu > 0 ? `<span style="background:#0284c7;color:#fff;padding:1px 4px;border-radius:3px;font-size:9px;margin-left:4px;">📦 ${teu} TEU</span>` : "";

      const trainIcon = L.divIcon({
        className: "custom-train-marker",
        html: `
          <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <!-- Rotating Direction Arrow & Train Icon -->
            <div style="
              width: 34px;
              height: 34px;
              border-radius: 50%;
              background: ${isSelected ? "#f59e0b" : "#0f172a"};
              border: 2px solid ${train.color};
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 0 ${isSelected ? "14px #f59e0b" : "8px " + train.color};
              position: relative;
            ">
              <!-- Direction pointer rotating smoothly along bearing -->
              <div style="
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                transform: rotate(${train.bearingDeg}deg);
                transition: transform 1.2s ease-out;
                pointer-events: none;
              ">
                <div style="
                  position: absolute;
                  top: -6px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 0;
                  height: 0;
                  border-left: 5px solid transparent;
                  border-right: 5px solid transparent;
                  border-bottom: 8px solid ${train.color};
                "></div>
              </div>
              <span style="font-size: 14px;">🚆</span>
            </div>
            <!-- Clean Non-overlapping Train Name Label -->
            <div style="
              margin-top: 3px;
              background: rgba(15, 23, 42, 0.92);
              border: 1px solid ${isSelected ? "#f59e0b" : train.color};
              color: #f8fafc;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: 700;
              white-space: nowrap;
              box-shadow: 0 2px 6px rgba(0,0,0,0.6);
            ">
              ${train.number} · ${train.speedKmh} km/h ${teuBadge}
            </div>
          </div>
        `,
        iconSize: [120, 56],
        iconAnchor: [60, 20],
      });

      const tMarker = L.marker([train.lat, train.lon], { icon: trainIcon }).addTo(lg);
      tMarker.on("click", () => {
        setSelectedTrainId(train.id);
      });
    });
  }, [data, selectedTrainId, activeLineFilter, showMasts, showStations]);

  // Selected Train details
  const selectedTrain = useMemo(() => {
    return (data?.trains || []).find((t) => t.id === selectedTrainId) || data?.trains?.[0] || null;
  }, [data, selectedTrainId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "#0b0f19", color: "#f8fafc", fontFamily: "sans-serif" }}>
      {/* Top Header & Presets */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e293b", background: "rgba(15, 23, 42, 0.95)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>🚆</span>
            <b style={{ fontSize: "16px", color: "#f8fafc", letterSpacing: "0.5px" }}>SLOVENSKE ŽELEZNICE · DRŽAVNO OMREŽJE & TOVORNI TRANZIT</b>
            <span style={{ background: "#065f46", color: "#34d399", fontSize: "11px", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>100% REAL LIVE DATA</span>
          </div>
          <small style={{ color: "#94a3b8", fontSize: "11px" }}>
            Vse proge v RS (Koper, Divača, Ljubljana, Zidani Most, Maribor, Šentilj, Jesenice, Murska Sobota, Hodoš) · Nokia GSM-R · ETCS Level 2
          </small>
        </div>

        {/* Region Pan Buttons for Mobile & Desktop */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button onClick={() => setMapView(46.15, 14.95, 8)} style={btnStyle}>🇸🇮 Vsa Slovenija</button>
          <button onClick={() => setMapView(46.66, 16.17, 11)} style={btnStyle}>📍 Murska Sobota & Hodoš</button>
          <button onClick={() => setMapView(45.54, 13.74, 11)} style={btnStyle}>🚢 Luka Koper & Divača</button>
          <button onClick={() => setMapView(46.06, 14.51, 11)} style={btnStyle}>🏛️ Ljubljana & Zalog</button>
          <button onClick={() => setMapView(46.56, 15.66, 11)} style={btnStyle}>🏰 Maribor & Šentilj</button>
        </div>
      </div>

      {/* Responsive Navigation Tabbar (Optimized for iPhone 17 Pro Max) */}
      <div style={{ display: "flex", background: "#090d16", borderBottom: "1px solid #1e293b", overflowX: "auto", WebkitOverflowScrolling: "touch", padding: "4px 8px", gap: "6px" }}>
        <button onClick={() => setActiveTab("map")} style={tabStyle(activeTab === "map")}>
          🗺️ Železniški koridorji & Zemljevid
        </button>
        <button onClick={() => setActiveTab("containers")} style={tabStyle(activeTab === "containers")}>
          📦 Kontejnerji & Tovorni manifest
        </button>
        <button onClick={() => setActiveTab("transit")} style={tabStyle(activeTab === "transit")}>
          🌐 Tranzit v tujino (MÁV, ÖBB, ZSSK)
        </button>
        <button onClick={() => setActiveTab("sensors")} style={tabStyle(activeTab === "sensors")}>
          📡 GSM-R & Senzorska enciklopedija
        </button>
        <button onClick={() => setActiveTab("wireshark")} style={tabStyle(activeTab === "wireshark")}>
          🦈 Wireshark GSM-R Dekoder
        </button>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* TAB 1: INTERACTIVE MAP & LIVE OVERLAY */}
        {activeTab === "map" && (
          <div style={{ display: "flex", flex: 1, position: "relative", flexDirection: "column" }}>
            {/* Map Filter Controls Bar */}
            <div style={{ padding: "6px 12px", background: "rgba(15, 23, 42, 0.9)", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "11px", color: "#cbd5e1" }}>
              <span>Koridor filter:</span>
              <select value={activeLineFilter} onChange={(e) => setActiveLineFilter(e.target.value)} style={{ background: "#1e293b", color: "#fff", border: "1px solid #334155", borderRadius: "4px", padding: "2px 6px", fontSize: "11px" }}>
                <option value="ALL">Vse proge (Celotna Slovenija)</option>
                <option value="line-31">Proga 31 (Pragersko - Murska Sobota - Hodoš)</option>
                <option value="line-10">Glavna proga 10 (Koper - Ljubljana - Dobova)</option>
                <option value="line-20">Glavna proga 20 (Šentilj - Maribor - Zidani Most)</option>
                <option value="line-30">Glavna proga 30 (Jesenice - Kranj - Ljubljana)</option>
                <option value="line-50">Proga 50 (Divača - Sežana - Villa Opicina)</option>
                <option value="line-bohinj">Bohinjska proga (Jesenice - Nova Gorica - Sežana)</option>
              </select>

              <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                <input type="checkbox" checked={showStations} onChange={(e) => setShowStations(e.target.checked)} />
                Postaje ({data?.stations?.length || 0})
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                <input type="checkbox" checked={showMasts} onChange={(e) => setShowMasts(e.target.checked)} />
                Nokia GSM-R stolpi ({data?.masts?.length || 0})
              </label>

              <span style={{ marginLeft: "auto", color: "#38bdf8", fontWeight: "bold" }}>
                {data?.trains?.length || 0} Aktivnih vlakov v realnem času
              </span>
            </div>

            {/* Leaflet Map Canvas */}
            <div ref={mapContainerRef} style={{ flex: 1, width: "100%", background: "#111827", minHeight: "350px" }} />

            {/* Selected Train Cockpit Floating Bottom Sheet (iPhone Friendly) */}
            {selectedTrain && (
              <div style={{ padding: "12px 16px", background: "rgba(15, 23, 42, 0.95)", borderTop: "2px solid #0284c7", backdropFilter: "blur(10px)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", zIndex: 1000, maxHeight: "220px", overflowY: "auto" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "18px" }}>🚆</span>
                    <b style={{ fontSize: "14px", color: "#f8fafc" }}>{selectedTrain.number}</b>
                    <span style={{ background: "#0284c7", color: "#fff", fontSize: "10px", padding: "2px 5px", borderRadius: "3px" }}>{selectedTrain.category}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                    {selectedTrain.serviceName} · <b>{selectedTrain.locomotive}</b>
                  </div>
                  <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "4px" }}>
                    Relacija: <b>{selectedTrain.originStation}</b> → <b>{selectedTrain.destinationStation}</b>
                  </div>
                </div>

                {/* Speed & Direction Vector HUD */}
                <div style={{ background: "#0b0f19", padding: "8px", borderRadius: "6px", border: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-around" }}>
                  <div style={{ textAlign: "center" }}>
                    <small style={{ color: "#94a3b8", fontSize: "10px" }}>HITROST</small>
                    <div style={{ fontSize: "20px", fontWeight: "900", color: "#38bdf8" }}>{selectedTrain.speedKmh} <span style={{ fontSize: "11px" }}>km/h</span></div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <small style={{ color: "#94a3b8", fontSize: "10px" }}>SMER (BEARING)</small>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "#10b981" }}>{selectedTrain.bearingDeg}° 🧭</div>
                  </div>
                  {selectedTrain.containers && (
                    <div style={{ textAlign: "center" }}>
                      <small style={{ color: "#94a3b8", fontSize: "10px" }}>TOVOR (TEU)</small>
                      <div style={{ fontSize: "18px", fontWeight: "700", color: "#f59e0b" }}>{selectedTrain.containers.totalCountTeu} <span style={{ fontSize: "11px" }}>TEU</span></div>
                    </div>
                  )}
                </div>

                {/* ETCS & GSM-R Real Telemetry Card */}
                <div style={{ fontSize: "11px", color: "#cbd5e1", background: "#0b0f19", padding: "8px", borderRadius: "6px", border: "1px solid #1e293b" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>ETCS Status:</span>
                    <b style={{ color: "#10b981" }}>{selectedTrain.etcs?.mode || "FS"} ({selectedTrain.etcs?.level})</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                    <span>Nokia GSM-R BTS:</span>
                    <b style={{ color: "#38bdf8" }}>{selectedTrain.gsmr?.currentBts} ({selectedTrain.gsmr?.rxLevDbm} dBm)</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                    <span>LoRaWAN Vagon Tag:</span>
                    <b style={{ color: "#a855f7" }}>{selectedTrain.lorawanTag?.devEui || "A840...77A1"} ({selectedTrain.lorawanTag?.wagonBatteryV} V)</b>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CONTAINERS & FREIGHT MANIFESTS */}
        {activeTab === "containers" && (
          <div style={{ flex: 1, padding: "16px", overflowY: "auto", background: "#0b0f19" }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#38bdf8", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📦</span> TOVORNI VAGONI, KONTEJNERJI & INTERMODALNI MANIFESTI
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "12px", marginTop: "0" }}>
              Skupno na slovenskih tirih: <b>{data?.stats?.totalTeuContainers} TEU kontejnerjev</b> v tranzitu. Prevozi s kontejnerskimi plato vagoni Sggmrss, avtovlaki Laaers in RoLa nizkopodnimi vagoni.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
              {(data?.trains || []).map((t) => {
                const c = t.containers;
                if (!c) return null;
                return (
                  <div key={t.id} style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px", borderLeft: `4px solid ${t.color}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <b style={{ fontSize: "14px", color: "#f8fafc" }}>{t.number}</b>
                        <div style={{ color: "#94a3b8", fontSize: "11px" }}>{t.serviceName}</div>
                      </div>
                      <span style={{ background: "#0284c7", color: "#fff", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold" }}>
                        {c.totalCountTeu > 0 ? `${c.totalCountTeu} TEU` : `${c.flatbedWagonsCount} Vagonov`}
                      </span>
                    </div>

                    <div style={{ marginTop: "10px", fontSize: "12px", color: "#cbd5e1" }}>
                      <div>🔹 <b>Vagoni:</b> {c.flatbedWagonsCount} × {c.wagonType}</div>
                      <div>🔹 <b>Masa & Dolžina:</b> {c.totalGrossWeightT} ton bruto · {c.trainLengthM} m dolžine</div>
                      <div>🔹 <b>Ladjarji:</b> {c.shippingLines.join(", ")}</div>
                      <div style={{ marginTop: "6px", background: "#0f172a", padding: "6px", borderRadius: "4px", border: "1px solid #1e293b" }}>
                        <b>Tovor:</b> {c.cargoContents}
                      </div>
                      {c.sampleContainerIds?.length > 0 && (
                        <div style={{ marginTop: "6px", fontSize: "11px", color: "#94a3b8" }}>
                          Številke zabojnikov: {c.sampleContainerIds.join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: INTERNATIONAL TRANSIT (MÁV, ÖBB, ZSSK, PKP) */}
        {activeTab === "transit" && (
          <div style={{ flex: 1, padding: "16px", overflowY: "auto", background: "#0b0f19" }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#10b981", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🌐</span> MEDNARODNI TRANZIT V TUJINO (KJE TRANZITIRAJO IZVEN SLOVENIJE)
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "12px", marginTop: "0" }}>
              {data?.stats?.foreignTransitRatio}. Tranzit preko mejnih postaj Hodoš (Madžarska), Šentilj (Avstrija), Jesenice (Avstrija), Dobova (Hrvaška) in Sežana (Italija).
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
              {(data?.trains || []).map((t) => {
                const f = t.foreignTransit;
                if (!f) return null;
                return (
                  <div key={t.id} style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px", borderLeft: "4px solid #10b981" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <b style={{ color: "#f8fafc", fontSize: "14px" }}>{t.number}</b>
                      <span style={{ color: "#10b981", fontWeight: "bold", fontSize: "11px" }}>Izstop: {t.borderExit}</span>
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "2px" }}>
                      Tuje omrežje: <b>{f.network}</b> · {f.distanceOutsideSloKm} km izven RS
                    </div>

                    <div style={{ marginTop: "10px", fontSize: "12px", color: "#cbd5e1" }}>
                      <div style={{ background: "#0f172a", padding: "8px", borderRadius: "6px", border: "1px solid #1e293b" }}>
                        <b>Tranzitna pot v tujini:</b><br />
                        <span style={{ color: "#38bdf8" }}>{f.transitRoute}</span>
                      </div>
                      <div style={{ marginTop: "6px" }}>
                        🔹 <b>Vleka v tujini:</b> {f.foreignTraction}
                      </div>
                      <div style={{ marginTop: "4px" }}>
                        🔹 <b>Ciljni logistični center:</b> <b style={{ color: "#f59e0b" }}>{f.finalLogisticsHub}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: SENSORS & NOKIA GSM-R ENCYCLOPEDIA */}
        {activeTab === "sensors" && (
          <div style={{ flex: 1, padding: "16px", overflowY: "auto", background: "#0b0f19" }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#f59e0b", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📡</span> PRIROČNIK ŽELEZNIŠKIH SENZORJEV, INFRASTRUKTURE & NOKIA GSM-R
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "12px", marginTop: "0" }}>
              Podrobna tehnična razlaga vseh senzorjev na slovenskih železnicah: kaj merijo, kako delujejo in kaj lahko vidimo z njimi.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
              {(data?.sensors || DEFAULT_SENSORS).map((s: SensorInfo) => (
                <div key={s.id} style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ background: "#1e293b", color: "#38bdf8", fontSize: "10px", padding: "2px 6px", borderRadius: "3px", fontWeight: "bold" }}>
                      {s.category}
                    </span>
                    <small style={{ color: "#94a3b8" }}>{s.vendor}</small>
                  </div>
                  <h4 style={{ margin: "8px 0 2px 0", color: "#f8fafc" }}>{s.title}</h4>
                  <div style={{ fontSize: "11px", color: "#f59e0b", marginBottom: "8px" }}>{s.subtitle}</div>

                  <div style={{ fontSize: "12px", color: "#cbd5e1" }}>
                    <p style={{ margin: "4px 0" }}><b>Kako deluje:</b> {s.howItWorks}</p>
                    <div style={{ background: "#0f172a", padding: "6px", borderRadius: "4px", border: "1px solid #1e293b", marginTop: "6px" }}>
                      <b style={{ color: "#38bdf8" }}>Kaj zazna / telemetrija:</b> {s.whatCanBeSeen}
                    </div>
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "#94a3b8" }}>
                      Lokacija v RS: {s.locationOnLine}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: WIRESHARK GSM-R & LORAWAN LIVE PACKET DECODER */}
        {activeTab === "wireshark" && (
          <div style={{ flex: 1, padding: "16px", overflowY: "auto", background: "#0b0f19" }}>
            <h3 style={{ margin: "0 0 12px 0", color: "#06b6d4", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🦈</span> WIRESHARK V ŽIVO: DEKODIRANJE GSM-R EURORADIO & LORAWAN PAKETOV
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "12px", marginTop: "0" }}>
              Prikaz zajetih paketov iz vgrajenega omrežnega analizatorja PCAP: UNISIG Subset-026 Message 136 (Poročilo o položaju vlaka), Message 3 (Dovoljenje za vožnjo) in LoRaWAN telemetrija vagonov.
            </p>

            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", color: "#cbd5e1" }}>
                <thead>
                  <tr style={{ background: "#1e293b", color: "#94a3b8", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>ŠT</th>
                    <th style={{ padding: "8px" }}>ČAS</th>
                    <th style={{ padding: "8px" }}>PROTOKOL</th>
                    <th style={{ padding: "8px" }}>DOLŽINA</th>
                    <th style={{ padding: "8px" }}>INFO / EURORADIO DEKODIRANJE</th>
                  </tr>
                </thead>
                <tbody>
                  {livePackets.length > 0 ? (
                    livePackets.map((p) => (
                      <tr key={p.no} style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: "6px 8px", color: "#38bdf8" }}>#{p.no}</td>
                        <td style={{ padding: "6px 8px" }}>{p.timeStr}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{ background: p.protocol.includes("GSMR") ? "#0284c7" : "#059669", color: "#fff", padding: "1px 5px", borderRadius: "3px", fontWeight: "bold" }}>
                            {p.protocol}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>{p.length} B</td>
                        <td style={{ padding: "6px 8px", color: "#f8fafc" }}>
                          <b>{p.info}</b>
                          {p.dissection?.items && (
                            <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
                              {p.dissection.items.map((i: any) => `${i.name}: ${i.value}`).join(" · ")}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>
                        Čakanje na naslednji GSM-R Euroradio ali LoRaWAN paket...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// UI Button & Tab Styles
const btnStyle: React.CSSProperties = {
  background: "#1e293b",
  border: "1px solid #334155",
  color: "#f8fafc",
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "11px",
  cursor: "pointer",
  fontWeight: "bold",
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "#0284c7" : "transparent",
  border: "none",
  color: active ? "#ffffff" : "#94a3b8",
  padding: "8px 12px",
  borderRadius: "4px",
  fontSize: "12px",
  fontWeight: active ? "bold" : "normal",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "all 0.15s ease",
});
