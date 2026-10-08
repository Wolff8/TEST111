import os from 'node:os';

/**
 * Standard libpcap file format constants (Wireshark compliant)
 * Magic 0xa1b2c3d4 (little-endian, microsecond precision)
 */
const PCAP_MAGIC = 0xa1b2c3d4;
const PCAP_VERSION_MAJOR = 2;
const PCAP_VERSION_MINOR = 4;
const PCAP_SNAPLEN = 65535;
const LINKTYPE_ETHERNET = 1;

/** Circular buffer for in-memory Wireshark packet analysis */
const MAX_PACKETS = 400;
const capturedPackets = [];
let packetCounter = 0;

/** Calculate 16-bit One's Complement IP Checksum */
function ipChecksum(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i += 2) {
    sum += buf.readUInt16BE(i);
  }
  while (sum > 0xffff) {
    sum = (sum & 0xffff) + (sum >> 16);
  }
  return ~sum & 0xffff;
}

/** Parse IPv4 address string to 4-byte buffer */
function ipToBuf(ipStr) {
  const parts = ipStr.split('.').map((p) => parseInt(p, 10) || 0);
  return Buffer.from([parts[0] || 127, parts[1] || 0, parts[2] || 0, parts[3] || 1]);
}

/** Build standard 24-byte libpcap file header */
export function buildPcapGlobalHeader() {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(PCAP_MAGIC, 0); // Magic number
  header.writeUInt16LE(PCAP_VERSION_MAJOR, 4); // Major version 2
  header.writeUInt16LE(PCAP_VERSION_MINOR, 6); // Minor version 4
  header.writeInt32LE(0, 8); // GMT to local correction (0)
  header.writeUInt32LE(0, 12); // Accuracy of timestamps (0)
  header.writeUInt32LE(PCAP_SNAPLEN, 16); // Snapshot length (65535)
  header.writeUInt32LE(LINKTYPE_ETHERNET, 20); // Link-Layer Header Type (Ethernet)
  return header;
}

/** Build full Ethernet II + IPv4 + UDP packet encapsulation */
export function buildEthernetIpUdp(payload, srcIp = "127.0.0.1", dstIp = "127.0.0.1", srcPort = 50001, dstPort = 8600) {
  // 1. Ethernet II Header (14 bytes)
  const ethHeader = Buffer.alloc(14);
  // Dst MAC: 00:00:5e:00:53:01 (Standard IANA)
  Buffer.from([0x00, 0x00, 0x5e, 0x00, 0x53, 0x01]).copy(ethHeader, 0);
  // Src MAC: d8:44:89:03:7b:d2 (Local Wi-Fi interface)
  Buffer.from([0xd8, 0x44, 0x89, 0x03, 0x7b, 0xd2]).copy(ethHeader, 6);
  // EtherType: 0x0800 (IPv4)
  ethHeader.writeUInt16BE(0x0800, 12);

  // 2. UDP Header (8 bytes)
  const udpLen = 8 + payload.length;
  const udpHeader = Buffer.alloc(8);
  udpHeader.writeUInt16BE(srcPort, 0); // Source Port
  udpHeader.writeUInt16BE(dstPort, 2); // Destination Port (8600 for ASTERIX)
  udpHeader.writeUInt16BE(udpLen, 4); // UDP Length
  udpHeader.writeUInt16BE(0x0000, 6); // UDP Checksum (optional in IPv4)

  // 3. IPv4 Header (20 bytes)
  const ipLen = 20 + udpLen;
  const ipHeader = Buffer.alloc(20);
  ipHeader[0] = 0x45; // Version 4, IHL 5 (20 bytes)
  ipHeader[1] = 0x00; // DSCP / ECN
  ipHeader.writeUInt16BE(ipLen, 2); // Total Length
  ipHeader.writeUInt16BE(packetCounter & 0xffff, 4); // Identification
  ipHeader.writeUInt16BE(0x4000, 6); // Flags: Don't Fragment (DF)
  ipHeader[8] = 64; // Time to Live (TTL)
  ipHeader[9] = 17; // Protocol 17 (UDP)
  ipHeader.writeUInt16BE(0x0000, 10); // Header Checksum initially 0
  ipToBuf(srcIp).copy(ipHeader, 12); // Source IP
  ipToBuf(dstIp).copy(ipHeader, 16); // Destination IP

  // Calculate and write IPv4 checksum
  const csum = ipChecksum(ipHeader);
  ipHeader.writeUInt16BE(csum, 10);

  return Buffer.concat([ethHeader, ipHeader, udpHeader, payload]);
}

/** Build standard 16-byte PCAP packet record header and append frame bytes */
export function buildPcapPacket(frame, timestampMs = Date.now()) {
  const pcapPktHeader = Buffer.alloc(16);
  const tsSec = Math.floor(timestampMs / 1000);
  const tsUsec = Math.floor((timestampMs % 1000) * 1000);

  pcapPktHeader.writeUInt32LE(tsSec, 0); // ts_sec
  pcapPktHeader.writeUInt32LE(tsUsec, 4); // ts_usec
  pcapPktHeader.writeUInt32LE(frame.length, 8); // incl_len
  pcapPktHeader.writeUInt32LE(frame.length, 12); // orig_len

  return Buffer.concat([pcapPktHeader, frame]);
}

/** Format binary buffer into classic Wireshark hex & ASCII dump format */
export function formatHexAsciiDump(buf) {
  const lines = [];
  for (let i = 0; i < buf.length; i += 16) {
    const slice = buf.subarray(i, Math.min(i + 16, buf.length));
    const offset = i.toString(16).padStart(4, "0");
    const hexParts = [];
    let ascii = "";

    for (let j = 0; j < 16; j++) {
      if (j < slice.length) {
        hexParts.push(slice[j].toString(16).padStart(2, "0"));
        const byte = slice[j];
        ascii += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".";
      } else {
        hexParts.push("  ");
      }
    }
    const hexFormatted = `${hexParts.slice(0, 8).join(" ")}  ${hexParts.slice(8).join(" ")}`;
    lines.push(`${offset}   ${hexFormatted}   |${ascii}|`);
  }
  return lines.join("\n");
}

/**
 * Record a network frame into our live packet analyzer and PCAP ring buffer
 */
export function recordNetworkPacket({
  protocol = "ASTERIX",
  payload,
  srcIp = "127.0.0.1",
  dstIp = "127.0.0.1",
  srcPort = 50001,
  dstPort = 8600,
  info = "Surveillance Data",
  dissection = null,
}) {
  packetCounter += 1;
  const now = Date.now();
  const rawPayload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const fullFrame = buildEthernetIpUdp(rawPayload, srcIp, dstIp, srcPort, dstPort);
  const pcapChunk = buildPcapPacket(fullFrame, now);

  const pktObj = {
    no: packetCounter,
    timestamp: now,
    timeStr: new Date(now).toISOString().slice(11, 23),
    src: `${srcIp}:${srcPort}`,
    dst: `${dstIp}:${dstPort}`,
    protocol,
    length: fullFrame.length,
    payloadLen: rawPayload.length,
    info,
    dissection,
    hexDump: formatHexAsciiDump(rawPayload),
    rawHex: rawPayload.toString("hex"),
    pcapChunk,
  };

  capturedPackets.push(pktObj);
  if (capturedPackets.length > MAX_PACKETS) {
    capturedPackets.shift();
  }

  return pktObj;
}

/** Generate a full binary .pcap file from all currently captured packets */
export function generateFullPcap() {
  const globalHeader = buildPcapGlobalHeader();
  const chunks = [globalHeader];
  for (const pkt of capturedPackets) {
    chunks.push(pkt.pcapChunk);
  }
  return Buffer.concat(chunks);
}

/** Get list of captured packets for UI */
export function getCapturedPackets(limit = 100) {
  return capturedPackets.slice(-limit).reverse();
}

/** Get active network interface summary */
export function getNetworkInterfaceSummary() {
  const ifaces = os.networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      list.push({
        name,
        family: a.family,
        address: a.address,
        mac: a.mac,
        internal: a.internal,
        cidr: a.cidr || `${a.address}/${a.netmask}`,
      });
    }
  }
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    uptimeSec: os.uptime(),
    interfaces: list,
    sockets: [
      { proto: "HTTP / WS", port: 4173, bind: "0.0.0.0", description: "Web UI, Live Telemetry & API Endpoints" },
      { proto: "UDP ASTERIX", port: 8600, bind: "0.0.0.0", description: "Eurocontrol ASTERIX Surveillance Multicast/Unicast" },
      { proto: "UDP MODE-S", port: 8601, bind: "0.0.0.0", description: "Mode S Beast Raw Binary Frames" },
      { proto: "TCP BEAST", port: 50001, bind: "0.0.0.0", description: "SDR Receiver Feed (Puconci, AVR / Beast Protocol)" },
      { proto: "TCP APRS-IS", port: 14580, bind: "aprs.glidernet.org", description: "Open Glider Network (FLARM 868MHz Uplink)" },
    ],
    stats: {
      totalPacketsCaptured: packetCounter,
      bufferedPackets: capturedPackets.length,
      pcapExportBytes: 24 + capturedPackets.reduce((acc, p) => acc + p.pcapChunk.length, 0),
    },
  };
}
