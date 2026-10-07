import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePlaneAlertUav,
  parsePlaneAlertBalloons,
  acList,
  keepSky,
  skyKind,
  isHeliRow,
  isSiMilHeli,
  isBalloonRow,
  inRakicanPad,
  RAKICAN_PAD,
  HELI_TYPE_RE,
  isFeederLeftover,
  isIdentifiedAdsb,
  isLjmsTaxiing,
  otherwiseInvisibleSky,
  inSiTheater,
  SI_BOX,
  IT_HUB,
  ULTRAFEEDER_REPO,
  PLANE_ALERT_DB,
  LJMS_APT,
} from "./ultrafeeder-feed.mjs";

const CSV = `$ICAO,$Registration,$Operator,$Type,$ICAO Type,#CMPG,$Tag 1,$#Tag 2,$#Tag 3,Category,$#Link
33FD45,MM-AV-SA0018,NATO,CASA RQ-4D Phoenix,Q4,Mil,UAV,Eye In The Sky,x,UAV,https://w.wiki/a
3FB101,99+01,German Air Force,RQ-4B EuroHawk,Q4,Mil,UAV,Border Patrol,x,UAV,https://w.wiki/b
4068C8,G-CHNS,Bristow Helicopters,AgustaWestland AW.139,A139,Civ,Drone,Maritime Patrol,x,Coastguard,https://w.wiki/c
3C82BF,D-ORCA,Power,Orka,UAV,Civ,UAV,Survey,x,UAV,https://w.wiki/d
4BAA01,HB-XXX,Swiss,Airbus A320,A320,Civ,Airliner,x,x,Distinctive,https://w.wiki/e
A00B11,N123AB,Club,Cameron N-90,BALL,Civ,Balloon,Sport,x,Balloon,https://w.wiki/f
`;

test("parsePlaneAlertUav keeps Q4/UAV and skips helicopter Drone tags", () => {
  const { hexes, meta } = parsePlaneAlertUav(CSV);
  assert.ok(hexes.includes("33fd45"));
  assert.ok(hexes.includes("3fb101"));
  assert.ok(hexes.includes("3c82bf"));
  assert.equal(hexes.includes("4068c8"), false);
  assert.equal(hexes.includes("4baa01"), false);
  assert.equal(hexes.includes("a00b11"), false);
  assert.equal(meta.get("33fd45").uav, true);
});

test("parsePlaneAlertBalloons keeps BALL and skips UAV/airliner", () => {
  const { hexes } = parsePlaneAlertBalloons(CSV);
  assert.ok(hexes.includes("a00b11"));
  assert.equal(hexes.includes("33fd45"), false);
  assert.equal(hexes.includes("4baa01"), false);
});

test("acList reads both ac and aircraft keys", () => {
  assert.equal(acList({ ac: [{ hex: "abc" }] }).length, 1);
  assert.equal(acList({ aircraft: [{ hex: "def" }] }).length, 1);
  assert.equal(acList({}).length, 0);
});

test("GitHub ultrafeeder and plane-alert repos are public URLs", () => {
  assert.match(ULTRAFEEDER_REPO, /docker-adsb-ultrafeeder/);
  assert.match(PLANE_ALERT_DB, /plane-alert-db/);
});

test("keepSky keeps Alpine heli/balloon and LJMS taxi, drops far airliners", () => {
  const hexSet = new Set(["33fd45"]);
  assert.equal(
    keepSky({ hex: "33fd45", lat: 48.1, lon: 11.5, category: "B6" }, hexSet),
    true,
  );
  assert.equal(
    keepSky({ hex: "506e6e", lat: 45.804, lon: 15.169, t: "B06", flight: "RANGR92" }, hexSet),
    true,
  );
  assert.equal(isHeliRow({ t: "B06", flight: "RANGR92" }), true);
  assert.equal(isHeliRow({ t: "A532", r: "L2-03" }), true);
  assert.equal(HELI_TYPE_RE.test("A532"), true);
  assert.equal(HELI_TYPE_RE.test("A332"), false);
  assert.equal(isHeliRow({ t: "A332", category: "A3", flight: "THY6412" }), false);
  assert.equal(isSiMilHeli({ r: "L2-04", t: "A532" }), true);
  assert.equal(
    keepSky({ hex: "3c9abc", lat: 47.2, lon: 14.1, category: "B2", t: "BALL" }, hexSet),
    true,
  );
  assert.equal(isBalloonRow({ category: "B2" }), true);
  assert.equal(
    keepSky(
      {
        hex: "4d8123",
        lat: LJMS_APT.lat,
        lon: LJMS_APT.lon,
        t: "C172",
        category: "A1",
        alt_baro: "ground",
        gs: 8,
        on_ground: true,
      },
      hexSet,
    ),
    true,
  );
  assert.equal(
    keepSky({ hex: "3c56e4", lat: 50.0, lon: 8.5, t: "A320", category: "A3", type: "adsb_icao", gs: 420 }, hexSet),
    false,
  );
  assert.equal(
    keepSky({ hex: "484bac", lat: 53.39, lon: 5.2, t: "A139", category: "A7", type: "adsb_icao" }, hexSet),
    false,
  );
  assert.equal(
    keepSky({ hex: "3c9abc", type: "mode_s" }, hexSet),
    false,
  );
  assert.equal(
    keepSky({ hex: "4d8123", type: "adsb_icao_nt" }, hexSet),
    true,
  );
  assert.equal(
    keepSky(
      {
        hex: "44001b",
        lat: 46.2236,
        lon: 14.4576,
        t: "A320",
        category: "A3",
        type: "adsb_icao",
        alt_baro: "ground",
        gs: 0,
        on_ground: true,
      },
      hexSet,
    ),
    true,
  );
});

test("LJMS taxi is a plane driving to the runway, not parked", () => {
  const moving = {
    hex: "4d8123",
    lat: LJMS_APT.lat,
    lon: LJMS_APT.lon,
    t: "C172",
    category: "A1",
    alt_baro: "ground",
    gs: 12,
    on_ground: true,
  };
  const parked = { ...moving, gs: 0 };
  const rolling = { ...moving, gs: 70 };
  assert.equal(keepSky(moving), true);
  assert.equal(keepSky(parked), true);
  assert.equal(isLjmsTaxiing(moving), true);
  assert.equal(isLjmsTaxiing(parked), false);
  assert.equal(isLjmsTaxiing(rolling), false);
  assert.equal(skyKind(moving), "taxi");
  assert.equal(skyKind(parked), "small");
});

test("otherwise-invisible leftover is TIS-B/NT, never identified ADS-B", () => {
  const tisb = { hex: "abc123", lat: 46.63, lon: 16.19, type: "tisb_icao" };
  const nt = { hex: "def456", lat: 46.12, lon: 14.82, type: "adsb_icao_nt" };
  const adsb = { hex: "3c56e4", lat: 46.12, lon: 14.82, type: "adsb_icao" };
  assert.equal(isFeederLeftover(tisb), true);
  assert.equal(isFeederLeftover(nt), true);
  assert.equal(isIdentifiedAdsb(adsb), true);
  assert.equal(isIdentifiedAdsb(tisb), false);
  const left = otherwiseInvisibleSky([tisb, nt, adsb]);
  assert.equal(left.length, 2);
  assert.equal(left.some((a) => a.hex === "3c56e4"), false);
});

test("SV Cougar on the Rakičan hospital pad is kept as a heli through ground", () => {
  const cougar = {
    hex: "506f01",
    lat: RAKICAN_PAD.lat,
    lon: RAKICAN_PAD.lon,
    t: "A532",
    r: "L2-03",
    category: "A7",
    alt_baro: "ground",
    gs: 0,
    on_ground: true,
  };
  assert.equal(inRakicanPad(RAKICAN_PAD.lat, RAKICAN_PAD.lon), true);
  assert.equal(isHeliRow(cougar), true);
  assert.equal(keepSky(cougar), true);
  assert.equal(skyKind(cougar), "heli");
});

test("SI theater includes northern Italy, not Rome", () => {
  assert.equal(inSiTheater(45.44, 12.24), true); // Venice
  assert.equal(inSiTheater(45.63, 8.73), true); // Malpensa
  assert.equal(inSiTheater(44.53, 11.29), true); // Bologna
  assert.equal(inSiTheater(41.8, 12.25), false); // Rome
  assert.ok(SI_BOX.lomin <= IT_HUB.lon && IT_HUB.lon <= SI_BOX.lomax);
});
