import { identLabel, prettyReg } from "./src/lib.ts";

function eq(name, got, want) {
  if (got !== want) throw new Error(`${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

eq("pretty I-D871", prettyReg("I-D871"), "I-D871");
eq("pretty ID871", prettyReg("ID871"), "I-D871");
eq("label prefers reg over CN", identLabel({ flight: "71", reg: "I-D871", role: "small", src: "ogn" }).primary, "I-D871");
eq("label uses full reg flight", identLabel({ flight: "I-D871", reg: "I-D871", role: "small", src: "ogn" }).primary, "I-D871");
eq("airline callsign kept", identLabel({ flight: "RANGR91", reg: "S5-HPK", role: "heli" }).primary, "RANGR91");
eq("empty flight uses reg", identLabel({ flight: "NO CALL", reg: "S5-HKM", role: "heli" }).primary, "S5-HKM");
eq("OK-TVT kept", identLabel({ flight: "OK-TVT", reg: "OK-TVT", role: "small", src: "ogn" }).primary, "OK-TVT");
eq("hex device id is not a callsign", identLabel({ flight: "9DB2AB78", reg: "9DB2AB78", role: "small", src: "ogn", typecode: "PWR" }).primary, "PWR");
eq("6-char hex is not a callsign", identLabel({ flight: "8E9A00", id: "ogn-8e9a00", role: "small", src: "ogn", typecode: "PWR" }).primary, "PWR");

console.log("ident-label ok");
