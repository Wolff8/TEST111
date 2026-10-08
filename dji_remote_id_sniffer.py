#!/usr/bin/env python3
"""
DJI & OpenDroneID Direct Remote ID Sniffer & Bridge
Captures real-time Drone Remote ID (ASTM F3411 / ASD-STAN prEN 4709-002) broadcasts:
- Bluetooth 4 / 5 BLE Advertising (Service UUID 0xFFFA)
- Wi-Fi Beacon Action Frames (OUI FA:0B:BC and DJI OUI 26:37:12)
- ESP32 / DroneScout / Android OpenDroneID forwarder

Forwards all detected drone + pilot positions in real time to the Ops Radar Dashboard.
"""

import sys
import json
import time
import struct
import argparse
import urllib.request
from typing import Optional, Dict, Any

SERVER_URL = "http://127.0.0.1:4173/api/dji"
FIREAPP_URL = "http://100.67.196.96:3000/api/sdr"

DJI_CTA_MODELS = {
    "1581F4": "DJI Mavic 3 / Pro",
    "1581F5": "DJI Matrice 30 / 300 / 350",
    "1581F6": "DJI Mini 3 Pro",
    "1581F7": "DJI Mini 4 Pro",
    "1581F8": "DJI Air 3 / Air 3S",
    "1581F9": "DJI Inspire 3",
    "1581FA": "DJI Avata / Avata 2",
    "1581FB": "DJI Neo",
    "1581FC": "DJI Agras T40 / T50",
    "1581FD": "DJI Dock 2",
    "1596F":  "Auterion / Skynav UAS",
    "1640F":  "Parrot Anafi UAS",
    "1612F":  "Autel EVO UAS",
    "1554F":  "Skydio UAS",
}

def identify_model(serial: str) -> str:
    s = serial.upper().replace("-", "").replace(" ", "")
    for pref, name in DJI_CTA_MODELS.items():
        if s.startswith(pref):
            return name
    if s.startswith("1581F"):
        return "DJI Remote ID UAS"
    if s.startswith("D1"):
        return "Dronetag Direct RID"
    return "Remote ID Drone"

def decode_opendroneid_block(data: bytes) -> Optional[Dict[str, Any]]:
    """Decodes 25-byte OpenDroneID ASTM F3411 messages."""
    if len(data) < 25:
        return None
    
    offset = 0
    # Check for message pack (0xF0)
    if (data[0] & 0xF0) == 0xF0 and len(data) >= 26:
        offset = 3
    
    res = {
        "serial": "",
        "model": "",
        "lat": None,
        "lon": None,
        "alt_m": None,
        "speed_mps": None,
        "track": None,
        "pilot_lat": None,
        "pilot_lon": None,
        "self_text": ""
    }

    while offset + 25 <= len(data):
        msg = data[offset:offset+25]
        msg_type = (msg[0] & 0xF0) >> 4
        offset += 25

        if msg_type == 0:  # Basic ID
            uas_id = msg[2:22].decode("utf-8", errors="ignore").strip("\x00 ").strip()
            if uas_id:
                res["serial"] = uas_id
        elif msg_type == 1:  # Location/Vector
            res["track"] = msg[2]
            res["speed_mps"] = msg[3] * 0.25
            lat_raw = struct.unpack("<i", msg[5:9])[0]
            lon_raw = struct.unpack("<i", msg[9:13])[0]
            res["lat"] = lat_raw / 1e7
            res["lon"] = lon_raw / 1e7
            alt_geo = struct.unpack("<H", msg[15:17])[0]
            if alt_geo > 0:
                res["alt_m"] = round(alt_geo * 0.5 - 1000)
        elif msg_type == 3:  # Self-ID
            res["self_text"] = msg[2:25].decode("utf-8", errors="ignore").strip("\x00 ").strip()
        elif msg_type == 4:  # System (Operator Location)
            op_lat_raw = struct.unpack("<i", msg[2:6])[0]
            op_lon_raw = struct.unpack("<i", msg[6:10])[0]
            if abs(op_lat_raw) > 1000 and abs(op_lon_raw) > 1000:
                res["pilot_lat"] = op_lat_raw / 1e7
                res["pilot_lon"] = op_lon_raw / 1e7

    if res["lat"] and res["lon"] and abs(res["lat"]) <= 90 and abs(res["lon"]) <= 180:
        res["model"] = identify_model(res["serial"])
        return res
    return None

def forward_drone(drone: Dict[str, Any], target_urls: list):
    payload = json.dumps(drone).encode("utf-8")
    for url in target_urls:
        try:
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "DjiRidSniffer/1.0"}
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                pass
        except Exception:
            pass

def run_ble_scanner(target_urls: list):
    try:
        from bleak import BleakScanner
        import asyncio
    except ImportError:
        print("[!] Python library 'bleak' is required for Bluetooth BLE scanning.")
        print("    Install it with: pip install bleak")
        return

    print("=" * 60)
    print("🛰️  DJI & OpenDroneID BLE Remote ID Scanner ACTIVE")
    print(f"📡 Scanning for 2.4 GHz Bluetooth 4/5 Drone ID beacons...")
    print(f"🎯 Forwarding to: {', '.join(target_urls)}")
    print("=" * 60)

    async def main():
        def detection_callback(device, advertisement_data):
            # Check for OpenDroneID Service UUID 0xFFFA
            raw_payload = None
            if advertisement_data.service_data:
                for uuid, sdata in advertisement_data.service_data.items():
                    if "fffa" in str(uuid).lower():
                        raw_payload = bytes(sdata)
                        break
            
            # Check manufacturer data
            if not raw_payload and advertisement_data.manufacturer_data:
                for m_id, mdata in advertisement_data.manufacturer_data.items():
                    if len(mdata) >= 25:
                        raw_payload = bytes(mdata)
                        break

            if raw_payload:
                decoded = decode_opendroneid_block(raw_payload)
                if decoded:
                    model = decoded.get("model") or "DJI Drone"
                    serial = decoded.get("serial") or device.address
                    lat = decoded.get("lat")
                    lon = decoded.get("lon")
                    alt = decoded.get("alt_m")
                    spd = decoded.get("speed_mps")
                    pilot = f"{decoded.get('pilot_lat'):.4f}, {decoded.get('pilot_lon'):.4f}" if decoded.get("pilot_lat") else "N/A"
                    
                    print(f"[{time.strftime('%H:%M:%S')}] 🚁 DRONE DETECTED: {model} (SN: {serial})")
                    print(f"    📍 Drone Pos:  {lat:.5f}, {lon:.5f} | Alt: {alt}m | Spd: {spd} m/s")
                    print(f"    🎮 Pilot Pos:  {pilot}")
                    
                    forward_drone({
                        "serial": serial,
                        "model": model,
                        "latitude": lat,
                        "longitude": lon,
                        "altitude": alt,
                        "speed": spd,
                        "heading": decoded.get("track"),
                        "pilot_lat": decoded.get("pilot_lat"),
                        "pilot_lon": decoded.get("pilot_lon"),
                    }, target_urls)

        scanner = BleakScanner(detection_callback=detection_callback)
        await scanner.start()
        while True:
            await asyncio.sleep(1)

    asyncio.run(main())

def run_udp_server(port: int, target_urls: list):
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", port))
    print(f"🛰️  Listening for ESP32 / DroneScout JSON on UDP port {port}...")
    while True:
        data, addr = sock.recvfrom(65535)
        try:
            parsed = json.loads(data.decode("utf-8", errors="ignore"))
            forward_drone(parsed, target_urls)
            print(f"[{time.strftime('%H:%M:%S')}] Received UDP RID telemetry from {addr[0]}")
        except Exception:
            pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DJI & OpenDroneID Remote ID Sniffer")
    parser.add_argument("--mode", choices=["ble", "udp"], default="ble", help="Sniffer mode (ble=Bluetooth, udp=ESP32/DroneScout listener)")
    parser.add_argument("--port", type=int, default=32001, help="UDP listening port")
    parser.add_argument("--url", default=SERVER_URL, help="Primary dashboard URL")
    args = parser.parse_args()

    targets = [args.url]
    if args.mode == "ble":
        run_ble_scanner(targets)
    else:
        run_udp_server(args.port, targets)
