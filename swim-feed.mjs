/** European SWIM Registry is a catalog of service definitions, not a live traffic dump. */

export const SWIM_REGISTRY = "https://eur-registry.swim.aero/service-definitions";
export const SWIM_REF = "https://reference.swim.aero/registries.html";
export const SWIM_SCHEMA =
  "https://github.com/eurocontrol-swim/service-metadata-schema";
export const OGC_WFS_TE = "https://docs.ogc.org/dp/12-027r3/12-027r3.pdf";
export const OGC_WFS_TE_DOC = "OGC 12-027r3";
export const OGC_WFS_TE_TITLE = "Web Feature Service (WFS) Temporality Extension";
export const OGC_WFS_TE_DATE = "2014-07-16";
export const OGC_WFS_TE_CAT = "OGC Discussion Paper";
export const OGC_SITE = "https://docs.ogc.org/";

export const SWIM_CATALOG = [
  {
    id: "openatm",
    name: "OpenATM",
    provider: "EUROCONTROL / Slovenia Control",
    kind: "flight-data",
    auth: "Bilateral SLA; JMS/MSB-CB at the consumer",
    public: false,
    json: "https://eur-registry.swim.aero/system/files/JSONs/migrated-old-10186-definition.json",
    note: "Registry id 10186 definition JSON. No host, no WFS, no GeoJSON. Consumer-side FIRE_AND_FORGET plus provider-side request/reply. Geographical extent is absent.",
  },
  {
    id: "aman",
    name: "Arrival Sequence Service",
    provider: "EUROCAE",
    kind: "aman",
    auth: "Yellow Profile WS_LIGHT · provider instance",
    public: false,
    json: "https://eur-registry.swim.aero/system/files/JSONs/service-1784281247-e071a5d0451d.json",
    note: "ED-254 AMAN sequence definition. The only endpoint is https://localhost/… a placeholder. Geographical extent is absent.",
  },
  {
    id: "adsc",
    name: "ADS-C Ground Distribution",
    provider: "EUROCONTROL",
    kind: "surveillance",
    auth: "SWIM Yellow Profile + SLA",
    public: false,
    note: "Forwards ADS-C collected from ATS units. Not the public ADS-B net.",
  },
  {
    id: "dnotam",
    name: "Digital NOTAM Subscription and Request",
    provider: "EUROCONTROL",
    kind: "ais",
    auth: "SWIM + CP1 consumer agreement",
    public: false,
  },
  {
    id: "aixm-req",
    name: "Aeronautical Information Request",
    provider: "EUROCONTROL",
    kind: "ais",
    auth: "Yellow Profile WFS; AFOD/EAD account",
    public: false,
    wiki: "https://swim-eurocontrol.atlassian.net/wiki/spaces/ASW/pages/60031301/Aeronautical+Information+Request+Service+-+Service+Definition#Geographical-Extent-of-Information",
    note: "Service definition: OGC WFS 2.0 GetFeature returns AIXM 5.1.1. Geographical Extent of Information is left empty. Operational AFOD is /swim/wfs/5.1.1 on AIMSL, not a public host.",
  },
  {
    id: "metar",
    name: "IWXXM METAR-SPECI",
    provider: "EUROCONTROL",
    kind: "met",
    auth: "SWIM + SLA",
    public: false,
    note: "SWIM IWXXM METAR-SPECI needs an SLA. Public live METAR JSON for LJ** is aviationweather.gov /api/data/metar on the MET card.",
  },
  {
    id: "taf",
    name: "IWXXM TAF",
    provider: "EUROCONTROL",
    kind: "met",
    auth: "SWIM + SLA",
    public: false,
    note: "SWIM IWXXM TAF needs an SLA. Public live TAF JSON is aviationweather.gov /api/data/taf on the MET card.",
  },
  {
    id: "sigmet",
    name: "IWXXM SIGMET",
    provider: "EUROCONTROL",
    kind: "met",
    auth: "SWIM + SLA",
    public: false,
    note: "SWIM IWXXM SIGMET needs an SLA. Public live SIGMET GeoJSON is aviationweather.gov /api/data/isigmet on the MET card.",
  },
  {
    id: "asm",
    name: "ASM",
    provider: "EUROCONTROL",
    kind: "airspace",
    auth: "SWIM + SLA",
    public: false,
    note: "Airspace management between ASM stakeholders. Public NOP EAUP is a GWT HMI (EAUP_DETACHED_DETAILS), not GeoJSON. Live EAUP/EUUP is NM B2B AirspaceAvailability SOAP/AIXM under an SLA.",
  },
  {
    id: "vaac",
    name: "Quantitative Volcanic Ash Concentration",
    provider: "EUROCONTROL / UK Met Office VAAC",
    kind: "met",
    auth: "API key",
    public: false,
    endpoint: "https://gateway.api-management.metoffice.cloud/vaac-london-qva-products/1.0/api",
    note: "WS Light /api is OpenAPI metadata. Live collections need a Met Office key (401 without it).",
  },
];

export const SWIM_PUBLIC_LIVE = [
  {
    id: "nsv-edyy",
    name: "NSV Maastricht FMP 4D",
    url: "https://portal.nsv.eurocontrol.int/eurocontrol/flights/EDYYFMP",
    used: true,
    note: "Public GeoJSON on Radar (cyan dashed remainder).",
  },
  {
    id: "nsv-ljla",
    name: "NSV Ljubljana FMP 4D",
    url: "https://portal.nsv.eurocontrol.int/eurocontrol/flights/LJLAFMP",
    used: true,
    note: "Same NSV host, Slovenia FMP. Merged with EDYY on Radar.",
  },
  {
    id: "nsv-regs",
    name: "NSV ATFCM regulations",
    url: "https://portal.nsv.eurocontrol.int/eurocontrol/regulations",
    used: true,
    note: "Public GeoJSON delay measures already on the NM card.",
  },
  {
    id: "awc-metar",
    name: "AWC METAR (IWXXM-class, public JSON)",
    url: "https://aviationweather.gov/api/data/metar?ids=LJLJ,LJMB,LJPZ,LJCE&format=json",
    used: true,
    note: "Public substitute for SWIM IWXXM METAR-SPECI. No SLA.",
  },
  {
    id: "awc-taf",
    name: "AWC TAF",
    url: "https://aviationweather.gov/api/data/taf?ids=LJLJ,LJMB,LJPZ,LJCE&format=json",
    used: true,
    note: "Public substitute for SWIM IWXXM TAF.",
  },
  {
    id: "awc-isigmet",
    name: "AWC international SIGMET GeoJSON",
    url: "https://aviationweather.gov/api/data/isigmet?format=geojson",
    used: true,
    note: "Public substitute for SWIM IWXXM SIGMET. Empty over LJLA is a fact.",
  },
  {
    id: "meteoalarm-si",
    name: "MeteoAlarm Slovenia CAP",
    url: "https://feeds.meteoalarm.org/api/v1/warnings/feeds-slovenia",
    used: true,
    note: "EUMETNET CAP JSON warnings for SI.",
  },
  {
    id: "data-app",
    name: "EUROCONTROL api-data-app",
    url: "https://api-data-app.eurocontrol.int/api/docs",
    used: true,
    note: "Daily SI/network traffic, delay, CO₂, billed. CORS *.",
  },
];

const PLACEHOLDER_URL = /localhost|127\.0\.0\.1|0\.0\.0\.0|example\.com|placeholder/i;

export function summarizeServiceDef(d) {
  const root = d?.informationServiceDefinition || d?.informationService || d || {};
  const ifaces = Array.isArray(root.serviceInterface) ? root.serviceInterface : [];
  const epUrls = [];
  for (const iface of ifaces) {
    for (const ep of iface.endpoints || []) {
      if (ep?.url) epUrls.push(String(ep.url));
    }
  }
  const text = JSON.stringify(d);
  const all = [...text.matchAll(/https?:\/\/[^"\\\s]+/g)].map((m) => m[0]);
  const live = epUrls.filter((u) => !PLACEHOLDER_URL.test(u));
  const meps = [...new Set(ifaces.map((i) => i.messageExchangePattern).filter(Boolean))];
  const bindings = [
    ...new Set(ifaces.map((i) => i.serviceInterfaceBinding?.name || i.swimTIProfile?.name).filter(Boolean)),
  ];
  return {
    name: String(root.title || root.serviceIdentification?.name || ""),
    edition: String(root.edition || ""),
    referenceDate: String(root.referenceDate || ""),
    provider: String(root.serviceDefinitionProvider?.name || "").replace(/_/g, " "),
    nInterfaces: ifaces.length,
    nUrls: all.length,
    endpoints: live.length,
    placeholders: epUrls.filter((u) => PLACEHOLDER_URL.test(u)).length,
    geo: /geographicalExtent/i.test(text) ? "present" : "absent",
    transport: [bindings[0], meps.filter(Boolean).join(" + ")].filter(Boolean).join(" · "),
    public: false,
  };
}

export async function probeRegistryJson(url, meta = {}, ms = 8_000) {
  const out = { ...meta, url, status: 0, ok: false, json: false, challenge: false, parsed: false, error: "" };
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
    });
    out.status = r.status;
    out.ok = r.ok;
    out.challenge = String(r.headers.get("cf-mitigated") || "") === "challenge" || r.status === 403;
    const ct = r.headers.get("content-type") || "";
    const body = await r.text();
    if (!r.ok || /^\s*</.test(body)) return out;
    if (!/json/i.test(ct) && !/^\s*\{/.test(body)) return out;
    const d = JSON.parse(body);
    Object.assign(out, summarizeServiceDef(d), { json: true, parsed: true, ok: true });
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

export const OPENATM_JSON =
  "https://eur-registry.swim.aero/system/files/JSONs/migrated-old-10186-definition.json";
export const OPENATM_EXPORT = "https://eur-registry.swim.aero/json/export/10186";
export const OPENATM_SERVICE = "https://eur-registry.swim.aero/services/eurocontrolsloveniacontrol-openatm-10";

export const OPENATM_META = {
  id: 10186,
  name: "OpenATM",
  edition: "1.0",
  referenceDate: "2020-07-03",
  provider: "EUROCONTROL & Slovenia Control",
  nInterfaces: 8,
  nUrls: 1,
  endpoints: 0,
  geo: "absent",
  transport: "JMS / MSB-CB · consumer-side FIRE_AND_FORGET",
  public: false,
};

export async function probeOpenAtmJson(ms = 8_000) {
  return probeRegistryJson(OPENATM_JSON, { ...OPENATM_META, export: OPENATM_EXPORT, service: OPENATM_SERVICE }, ms);
}

export const AMAN_JSON = "https://eur-registry.swim.aero/system/files/JSONs/service-1784281247-e071a5d0451d.json";
export const AMAN_META = {
  name: "Arrival Sequence Service",
  edition: "1.02",
  referenceDate: "2021-03-24",
  provider: "EUROCAE",
  nInterfaces: 3,
  nUrls: 3,
  endpoints: 0,
  placeholders: 1,
  geo: "absent",
  transport: "SWIM_TI_YP_1_1_WS_LIGHT · SYNCHRONOUS_REQUEST_RESPONSE + FIRE_AND_FORGET",
  public: false,
};

export async function probeAmanJson(ms = 8_000) {
  return probeRegistryJson(AMAN_JSON, AMAN_META, ms);
}

export const AIS_DEF = {
  wiki: "https://swim-eurocontrol.atlassian.net/wiki/spaces/ASW/pages/60031301/Aeronautical+Information+Request+Service+-+Service+Definition#Geographical-Extent-of-Information",
  rest: "https://swim-eurocontrol.atlassian.net/wiki/rest/api/content/60031301",
  registry: "https://eur-registry.swim.aero/service-definition/aeronautical-information-request-service",
  afod: "https://eur-registry.swim.aero/services/eurocontrol-aeronautical-feature-demand-200",
  ead: "https://www.ead.eurocontrol.int/",
  binding: "OGC WFS 2.0 GetFeature → AIXM 5.1.1 (WS_LIGHT)",
  wfsPath: "/swim/wfs/5.1.1",
  geo: "empty",
};

export async function probeAisDef(ms = 8_000) {
  const out = {
    wiki: AIS_DEF.wiki,
    status: 0,
    ok: false,
    title: "",
    geo: "unknown",
    geoEmpty: false,
    error: "",
  };
  try {
    const r = await fetch(`${AIS_DEF.rest}?expand=body.storage`, {
      headers: { accept: "application/json", "user-agent": "OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
    });
    out.status = r.status;
    out.ok = r.ok;
    if (!r.ok) return out;
    const d = await r.json();
    out.title = String(d.title || "");
    const html = String(d.body?.storage?.value || "");
    out.geoEmpty = /Geographical Extent of Information[\s\S]{0,1500}This field is left empty/i.test(html);
    out.geo = out.geoEmpty ? "empty" : html.includes("Geographical Extent of Information") ? "present" : "unknown";
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

export const EATM_PORTAL = "https://atmmasterplan.eu/";
export const EATM_STAKEHOLDERS = "https://atmmasterplan.eu/stakeholders";
export const EATM_STAKEHOLDER_ID = "2482221";
export const EATM_STAKEHOLDER_URL = `${EATM_STAKEHOLDERS}/${EATM_STAKEHOLDER_ID}`;
export const EATM_META = {
  id: EATM_STAKEHOLDER_ID,
  code: "ANSP-CIV-AIS",
  name: "Civil AIS Service Provider",
  model: "S3 - Common Library",
  kind: "stakeholder",
  portal: EATM_PORTAL,
};

export async function probeEatmStakeholder(ms = 8_000) {
  const out = {
    ...EATM_META,
    url: EATM_STAKEHOLDER_URL,
    list: EATM_STAKEHOLDERS,
    status: 0,
    ok: false,
    bytes: 0,
    contentType: "",
    title: "",
    html: false,
    json: false,
    gwt: false,
    challenge: false,
    feed: false,
    error: "",
  };
  try {
    const r = await fetch(EATM_STAKEHOLDER_URL, {
      headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8", "user-agent": "OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    out.status = r.status;
    out.ok = r.ok;
    out.contentType = String(r.headers.get("content-type") || "");
    out.challenge = String(r.headers.get("cf-mitigated") || "") === "challenge" || r.status === 403;
    const t = await r.text();
    out.bytes = t.length;
    out.json = /json/i.test(out.contentType) && /^\s*[{\[]/.test(t);
    out.html = /html/i.test(out.contentType) || /^\s*</.test(t);
    const h1 = t.match(/<h1[^>]*>([\s\S]{0,240}?)<\/h1>/i);
    const named = t.match(/ANSP-CIV-AIS\s*[-–]\s*[^<\n]{0,80}/i);
    out.title = h1
      ? h1[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : named
        ? named[0].trim()
        : out.challenge
          ? "Cloudflare challenge"
          : "";
    out.feed = out.json || /geojson|FeatureCollection/i.test(t);
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

export const AIRM_SITE = "https://airm.aero/";
export const AIRM_URL = "https://airm.aero/documentation/airm-information-exchange-models";
export const AIRM_TITLE = "AIRM and Information Exchange Models";
export const AIRM_MODELS = [
  { id: "aixm", name: "AIXM", url: "https://www.aixm.aero", note: "Aeronautical Information Exchange Model" },
  { id: "fixm", name: "FIXM", url: "https://www.fixm.aero", note: "Flight Information Exchange Model" },
  { id: "iwxxm", name: "IWXXM", url: "https://github.com/wmo-im/iwxxm", note: "ICAO meteorological XML" },
  { id: "amxm", name: "AMXM", url: "https://www.amxm.aero", note: "Aerodrome Mapping Exchange Model" },
];

export async function probeAirm(ms = 10_000) {
  const out = {
    url: AIRM_URL,
    site: AIRM_SITE,
    status: 0,
    ok: false,
    bytes: 0,
    contentType: "",
    title: "",
    html: false,
    json: false,
    challenge: false,
    feed: false,
    models: AIRM_MODELS.map((m) => m.id),
    error: "",
  };
  try {
    const r = await fetch(AIRM_URL, {
      headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8", "user-agent": "Mozilla/5.0 OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    out.status = r.status;
    out.ok = r.ok;
    out.contentType = String(r.headers.get("content-type") || "");
    out.challenge = String(r.headers.get("cf-mitigated") || "") === "challenge" || r.status === 403;
    const t = await r.text();
    out.bytes = t.length;
    out.json = /json/i.test(out.contentType) && /^\s*[{\[]/.test(t);
    out.html = /html/i.test(out.contentType) || /^\s*</.test(t);
    const title = t.match(/<title[^>]*>([^<]+)/i);
    const h1 = t.match(/<h1[^>]*>([\s\S]{0,240}?)<\/h1>/i);
    out.title = h1
      ? h1[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : title
        ? title[1].replace(/\s*[|–-]\s*Documentation.*$/i, "").trim()
        : out.challenge
          ? "Cloudflare challenge"
          : "";
    const seen = AIRM_MODELS.filter((m) => new RegExp(`\\b${m.name}\\b`, "i").test(t)).map((m) => m.id);
    if (seen.length) out.models = seen;
    out.feed = out.json || /geojson|FeatureCollection/i.test(t);
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

export async function probeSwim(ms = 8_000) {
  const out = { registry: SWIM_REGISTRY, status: 0, ok: false, challenge: false, jsonapi: false, error: "" };
  try {
    const r = await fetch(SWIM_REGISTRY, {
      headers: { accept: "text/html", "user-agent": "OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    out.status = r.status;
    out.ok = r.ok;
    out.challenge = String(r.headers.get("cf-mitigated") || "") === "challenge" || r.status === 403;
  } catch (e) {
    out.error = String(e.message || e);
  }
  try {
    const r = await fetch("https://eur-registry.swim.aero/jsonapi", {
      headers: { accept: "application/vnd.api+json", "user-agent": "OpsLiveDash/1.0" },
      signal: AbortSignal.timeout(ms),
    });
    out.jsonapi = r.ok && /json/i.test(r.headers.get("content-type") || "");
  } catch {
    /* still catalog-only */
  }
  return out;
}

export const RTCA_AJAX =
  "https://my.rtca.org/faces/a4j/g/3_3_3.Finalorg.ajax4jsf.javascript.AjaxScript?rel=1790612945000";
export const RTCA_SITE = "https://my.rtca.org/";
export const AEROPUS_KENDO =
  "https://aeropus.i3cloudservices.com/Scripts/kendo/2020.2.513/kendo.aspnetmvc.min.js";
export const AEROPUS_SITE = "https://aeropus.i3cloudservices.com/";
export const EASA_MAIN =
  "https://login.easa.europa.eu/public/include/js/modern/main.js?q=1789978125";
export const EASA_SITE = "https://login.easa.europa.eu/";
export const CF_BEACON =
  "https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495";
export const CF_INSIGHTS = "https://static.cloudflareinsights.com/";
export const EC_SITE = "https://www.eurocontrol.int/";
export const EC_FOOTER_JS =
  "https://www.eurocontrol.int/sites/default/files/js/js_UWqtgSv_-FL0bVoaVlvhmakPfhj_l9FTEYWz2ystnQA.js?scope=footer&delta=2&language=en&theme=ec_theme";
export const EC_FOOTER_LIBS =
  "jquery.form, highcharts.custom, datatables, matomo, recaptcha, webform, cookie, antibot";
export const SKYBRARY_SITE = "https://skybrary.aero/";
export const SKYBRARY_DIALOG =
  "https://skybrary.aero/core/assets/vendor/jquery.ui/ui/widgets/dialog.js";
export const SKYBRARY_GTAG_AJAX =
  "https://skybrary.aero/modules/contrib/google_tag/js/gtag.ajax.js";
export const AIRM_BOOTSTRAP = "https://airm.aero/assets/bootstrap/css/bootstrap.min.css";
export const ACI_SITE = "https://aci.aero/";
export const ACI_BB_LAYOUT =
  "https://aci.aero/wp-content/uploads/bb-plugin/cache/6665ffc9ae04e5c20c78461db97d2763-layout-bundle.js?ver=2.11.0.3-1.6";
export const CROCONTROL_SITE = "https://www.crocontrol.hr/";
export const CROCONTROL_JQ = "https://www.crocontrol.hr/wp/wp-includes/js/jquery/jquery.min.js";
export const AMC_SITE = "https://amc-en.crocontrol.hr/";
export const AMC_ANON = "https://amc-en.crocontrol.hr/Current-situation-anonymous-users";
export const AMC_ANON_TITLE = "Current situation (anonymous users)";
export const AMC_MAPS = "https://amc-en.crocontrol.hr/amc/maps";
export const AMC_LOGON = "https://amc-en.crocontrol.hr/Logon";
export const AMC_COMM = "https://amc-en.crocontrol.hr/AMC/Scripts/CMS/comm.js";
export const AMC_WORKAREAS = "https://amc-en.crocontrol.hr/AMC/Scripts/AMC/WorkAreas.js";
export const AMC_DNN = "https://amc-en.crocontrol.hr/js/dnn.js?cdv=726";
export const PRISM_SITE = "https://cdnjs.cloudflare.com/";
export const PRISM_CDN = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.5.1/prism.min.js";

export const CHROME_SCRIPTS = [
  { id: "aci-bb", name: "ACI Beaver Builder layout-bundle", url: ACI_BB_LAYOUT, site: ACI_SITE },
  { id: "crocontrol-jq", name: "Croatia Control WordPress jQuery", url: CROCONTROL_JQ, site: CROCONTROL_SITE },
  { id: "amc-comm", name: "Croatia Control AMC CMS comm.js", url: AMC_COMM, site: AMC_SITE },
  { id: "amc-workareas", name: "Croatia Control AMC WorkAreas HMI", url: AMC_WORKAREAS, site: AMC_SITE },
  { id: "amc-dnn", name: "Croatia Control AMC DNN.js", url: AMC_DNN, site: AMC_SITE },
  { id: "prism-cdn", name: "cdnjs Prism highlighter", url: PRISM_CDN, site: PRISM_SITE },
  { id: "airm-bootstrap", name: "AIRM Bootstrap CSS", url: AIRM_BOOTSTRAP, site: AIRM_SITE },
  { id: "skybrary-gtag", name: "SKYbrary Drupal google_tag Ajax", url: SKYBRARY_GTAG_AJAX, site: SKYBRARY_SITE },
  { id: "skybrary-dialog", name: "SKYbrary jQuery UI Dialog", url: SKYBRARY_DIALOG, site: SKYBRARY_SITE },
  { id: "ec-footer", name: "EUROCONTROL Drupal footer aggregate", url: EC_FOOTER_JS, site: EC_SITE },
  { id: "cf-beacon", name: "Cloudflare Web Analytics beacon", url: CF_BEACON, site: CF_INSIGHTS },
  { id: "easa", name: "EASA login F5 APM", url: EASA_MAIN, site: EASA_SITE },
  { id: "rtca", name: "RTCA AjaxScript", url: RTCA_AJAX, site: RTCA_SITE },
  { id: "aeropus", name: "AerOpus Kendo MVC", url: AEROPUS_KENDO, site: AEROPUS_SITE },
];

function libraryOf(t, url) {
  const bbVer = String(url).match(/[?&]ver=([0-9.]+)/);
  if (/bb-plugin\/cache\/.*layout-bundle\.js/i.test(url) || /Bowser - a browser detector/i.test(t)) {
    return bbVer ? `Beaver Builder layout-bundle ${bbVer[1]}` : "Beaver Builder layout-bundle";
  }
  const bs = t.match(/Bootstrap\s+v([0-9.]+)/i);
  if (bs || /bootstrap\.min\.css/i.test(url) || /airm\.aero\/assets\/bootstrap/i.test(url)) {
    return bs ? `Bootstrap ${bs[1]} CSS` : "Bootstrap CSS";
  }
  if (/google_tag\/js\/gtag\.ajax\.js/i.test(url) || /AjaxCommands\.prototype\.gtagEvent/.test(t)) {
    return "Drupal google_tag gtag.ajax.js";
  }
  const jqUi = t.match(/jQuery UI Dialog\s+([0-9.]+)/i);
  if (jqUi || /skybrary\.aero\/core\/assets\/vendor\/jquery\.ui/i.test(url) || /widgets\/dialog\.js/i.test(url)) {
    return jqUi ? `jQuery UI Dialog ${jqUi[1]}` : "jQuery UI Dialog";
  }
  if (/eurocontrol\.int\/sites\/default\/files\/js\/js_/i.test(url) || /@license GPL-2.0-or-later https:\/\/www\.drupal\.org/i.test(t)) {
    return "Drupal aggregated JS (ec_theme footer)";
  }
  if (/cloudflareinsights|cf-beacon|beacon\.min\.js/i.test(t) || /cloudflareinsights/i.test(url)) {
    const ver = t.match(/20\d{2}\.\d+\.\d+/);
    return ver ? `Cloudflare Web Analytics beacon ${ver[0]}` : "Cloudflare Web Analytics beacon";
  }
  if (/apmui\/App|F5 Networks/i.test(t) || /login\.easa\.europa\.eu/i.test(url)) return "F5 APM UI (EASA login)";
  const sarissa = t.match(/Sarissa\.VERSION\s*=\s*"([^"]+)"/);
  if (sarissa || /\bA4J\b/.test(t)) return sarissa ? `Ajax4jsf / Sarissa ${sarissa[1]}` : "Ajax4jsf";
  const kendo = t.match(/Kendo UI v([0-9.]+)/);
  if (kendo || /kendo\.aspnetmvc|kendo\.ui/i.test(t) || /kendo/i.test(url)) return kendo ? `Kendo UI ${kendo[1]} ASP.NET MVC` : "Kendo UI ASP.NET MVC";
  if (/jQuery/.test(t) && /jquery/i.test(url)) {
    const ver = t.match(/jQuery v([0-9.]+)/i);
    if (/crocontrol\.hr\/wp\/wp-includes\/js\/jquery\/jquery\.min\.js/i.test(url)) {
      return ver ? `WordPress jQuery ${ver[1]} (Croatia Control)` : "WordPress jQuery (Croatia Control)";
    }
    return ver ? `jQuery ${ver[1]}` : "jQuery";
  }
  if (/amc-en\.crocontrol\.hr\/AMC\/Scripts\/CMS\/comm\.js/i.test(url) || /lastFullNotams|lastDroneReservations|czmlLiveTracks/.test(t)) {
    return "Croatia Control AMC CMS comm.js";
  }
  if (/amc-en\.crocontrol\.hr\/AMC\/Scripts\/AMC\/WorkAreas\.js/i.test(url) || /initWorkAreas|lobiPanel/.test(t)) {
    return "Croatia Control AMC WorkAreas HMI";
  }
  const dnnVer = t.match(/dnnJscriptVersion\s*=\s*"([0-9.]+)"/);
  if (dnnVer || /amc-en\.crocontrol\.hr\/js\/dnn\.js/i.test(url)) {
    return dnnVer ? `DNN/DotNetNuke ${dnnVer[1]}` : "DNN/DotNetNuke";
  }
  const prismVer = String(url).match(/\/prism\/([0-9.]+)\//i);
  if (prismVer || /\bPrism\s*=\s*function/.test(t) || /cdnjs\.cloudflare\.com\/ajax\/libs\/prism\//i.test(url)) {
    return prismVer ? `Prism ${prismVer[1]}` : "Prism";
  }
  return "minified JavaScript";
}

function rangeTotal(header, fallback) {
  const m = String(header || "").match(/bytes\s+\d+-\d+\/(\d+)/i);
  if (m) return Number(m[1]) || fallback;
  return fallback;
}

export async function probeChromeScript(url, ms = 8_000) {
  const out = {
    url,
    status: 0,
    ok: false,
    bytes: 0,
    contentType: "",
    lastModified: "",
    library: "",
    json: false,
    feed: false,
    prefixOnly: false,
    error: "",
  };
  try {
    const r = await fetch(url, {
      headers: { accept: "*/*", "user-agent": "OpsLiveDash/1.0", range: "bytes=0-8191" },
      signal: AbortSignal.timeout(ms),
    });
    out.status = r.status;
    out.ok = r.ok || r.status === 206;
    out.contentType = String(r.headers.get("content-type") || "");
    out.lastModified = String(r.headers.get("last-modified") || "");
    const t = await r.text();
    out.prefixOnly = r.status === 206;
    out.bytes = rangeTotal(r.headers.get("content-range"), t.length);
    out.library = libraryOf(t, url);
    out.json = /json/i.test(out.contentType) && /^\s*[{\[]/.test(t);
    out.feed = out.json || /geojson|FeatureCollection/i.test(t);
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}

export async function probeRtcaAjax(ms = 8_000) {
  return { site: RTCA_SITE, ...(await probeChromeScript(RTCA_AJAX, ms)) };
}

export async function probeChromeScripts(ms = 12_000) {
  const items = await Promise.all(
    CHROME_SCRIPTS.map(async (s) => ({ ...s, ...(await probeChromeScript(s.url, ms)) })),
  );
  return { n: items.length, feeds: items.filter((x) => x.feed).length, items };
}
