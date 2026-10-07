/** Public tar1090 / readsb JSON. ICAO watch lists from WPTK/awesome-planespotting-list
 * (https://github.com/topics/tar1090). No ADSBexchange globe scrape. */

export const TAR1090_TOPIC = "https://github.com/topics/tar1090?o=asc&s=updated";
export const TAR1090_REPO = "https://github.com/wiedehopf/tar1090";
export const TAR1090_LIST = "https://github.com/WPTK/awesome-planespotting-list";
export const TAR1090_LIST_MD = "https://raw.githubusercontent.com/WPTK/awesome-planespotting-list/master/README.md";
export const ADSB_LOL = "https://api.adsb.lol/v2";
export const ADSB_FI = "https://opendata.adsb.fi/api/v2";

const UA = { "user-agent": "OpsLiveDash/1.0", accept: "application/json,text/plain;q=0.8" };

const listCache = { at: 0, md: "", hexes: [] };
const watchCursor = { n: 0 };

export function parseLolIcaoQuery(md) {
  const by = new Map();
  const re = /\[adsb-(\d+)\]:\s*https:\/\/adsb\.lol\/\?icao=([0-9A-Fa-f,]+)/g;
  let m;
  while ((m = re.exec(String(md || "")))) {
    const id = `adsb-${m[1]}`;
    const hexes = m[2]
      .split(",")
      .map((h) => h.toLowerCase().replace(/[^0-9a-f]/g, ""))
      .filter((h) => h.length === 6);
    if (hexes.length) by.set(id, hexes);
  }
  return by;
}

/** UAV + SI/HR 50xxxx + EU ambulance/VIP/coast/intel/UN hexes for hex lookup. */
export function collectWatchHexes(byKey) {
  const out = new Set();
  const take = (arr) => {
    for (const h of arr || []) out.add(h);
  };
  take(byKey.get("adsb-54"));
  for (const key of ["adsb-42", "adsb-58", "adsb-6", "adsb-46", "adsb-50", "adsb-62"]) {
    for (const h of byKey.get(key) || []) {
      if (/^(3[c-f]|4[0-9a-d]|50|51)/i.test(h)) out.add(h);
    }
  }
  return [...out];
}

async function jget(url, ms = 10_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function acOf(d) {
  const ac = d?.ac || d?.aircraft;
  return Array.isArray(ac) ? ac : [];
}

async function loadWatchHexes() {
  if (Date.now() - listCache.at < 6 * 3600_000 && listCache.hexes.length) return listCache.hexes;
  const r = await fetch(TAR1090_LIST_MD, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`tar1090 list ${r.status}`);
  const md = await r.text();
  const hexes = collectWatchHexes(parseLolIcaoQuery(md));
  listCache.at = Date.now();
  listCache.md = md;
  listCache.hexes = hexes;
  return hexes;
}

function inBox(lat, lon, box) {
  return lat >= box.lamin && lat <= box.lamax && lon >= box.lomin && lon <= box.lomax;
}

export async function fetchTar1090Public({ lat = 46.12, lon = 14.82, nm = 280 } = {}) {
  const diskNm = Math.max(40, Number(nm) || 280);
  const box = {
    lamin: lat - diskNm / 60,
    lamax: lat + diskNm / 60,
    lomin: lon - diskNm / (60 * Math.cos((lat * Math.PI) / 180)),
    lomax: lon + diskNm / (60 * Math.cos((lat * Math.PI) / 180)),
  };
  const alpine = { lamin: 42, lamax: 52.5, lomin: 5, lomax: 22 };
  const keep = (a) => {
    const x = Number(a.lat);
    const y = Number(a.lon);
    const hex = String(a.hex || "").toLowerCase();
    if (!x || !y) {
      return /mode_s|tisb|adsb_icao_nt/i.test(String(a.type || "")) && /^(3[c-f]|4[0-9a-d]|50|51)/.test(hex);
    }
    return inBox(x, y, box) || inBox(x, y, alpine);
  };

  const types = ["GLID", "ULAC", "GYRO", "B06", "A139", "UAV", "Q4"];
  const typeJobs = types.map((t) =>
    jget(`${ADSB_LOL}/type/${t}`, 10_000)
      .then((d) => ({ id: `lol-${t}`, rows: acOf(d).filter(keep) }))
      .catch(() => ({ id: `lol-${t}`, rows: [] })),
  );

  let watch = [];
  try {
    watch = await loadWatchHexes();
  } catch {
    watch = [];
  }
  const chunk = 24;
  const start = watch.length ? watchCursor.n % Math.max(1, Math.ceil(watch.length / chunk)) : 0;
  watchCursor.n += 1;
  const slice = watch.slice(start * chunk, start * chunk + chunk * 2);
  const always = watch.filter((h) => h.startsWith("50"));
  const hexes = [...new Set([...always, ...slice])].slice(0, 72);
  const hexJobs = [];
  for (let i = 0; i < hexes.length; i += 24) {
    const q = hexes.slice(i, i + 24).join(",");
    hexJobs.push(
      jget(`${ADSB_LOL}/hex/${q}`, 10_000)
        .then((d) => ({ id: `lol-watch-${i}`, rows: acOf(d).filter(keep) }))
        .catch(() => ({ id: `lol-watch-${i}`, rows: [] })),
    );
    hexJobs.push(
      jget(`${ADSB_FI}/hex/${q}`, 10_000)
        .then((d) => ({ id: `fi-watch-${i}`, rows: acOf(d).filter(keep) }))
        .catch(() => ({ id: `fi-watch-${i}`, rows: [] })),
    );
  }

  const parts = await Promise.all([...typeJobs, ...hexJobs]);
  const by = new Map();
  for (const p of parts) {
    for (const a of p.rows || []) {
      const id = String(a.hex || "").toLowerCase();
      if (id.length < 6) continue;
      by.set(id, { ...a, hex: id, tar1090: true });
    }
  }
  return {
    aircraft: [...by.values()],
    n: by.size,
    watch: watch.length,
    hits: Object.fromEntries(parts.map((p) => [p.id, (p.rows || []).length])),
    source: TAR1090_LIST,
    topic: TAR1090_TOPIC,
  };
}
