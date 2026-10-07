/** Unicast leftover CAT 048. Default 8600/udp. Set ASTERIX_UDP_PORT=0 to disable.
 * Does not join multicast. NSV/IFPS is not encoded as CAT 048. */

export const ASTERIX_UDP_DEFAULT = 8600;

export function asterixUdpListenPort(env = process.env) {
  const raw = env.ASTERIX_UDP_PORT;
  if (raw === "0" || /^off|false|no$/i.test(String(raw || ""))) return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return ASTERIX_UDP_DEFAULT;
}
