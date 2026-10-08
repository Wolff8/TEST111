import React, { useState, useEffect, useRef } from "react";

export interface AirbandStream {
  id: string;
  title: string;
  icao: string;
  facility: string;
  freqMhz: string;
  country: string;
  streamUrl: string;
  altStreamUrl: string;
  quality: string;
  coverage: string;
}

const DEFAULT_STREAMS: AirbandStream[] = [
  {
    id: "ljmb-twr",
    title: "Maribor Tower / Approach",
    icao: "LJMB",
    facility: "Tower / Approach Control",
    freqMhz: "119.205",
    country: "Slovenia",
    streamUrl: "/api/atc/stream?id=ljmb-twr",
    altStreamUrl: "https://relay.radioreference.com/atc/ljmb_twr",
    quality: "VHF 8.33 kHz Airband (AM 119.205 MHz)",
    coverage: "Maribor CTR Runway 14/32 & Podravje region",
  },
  {
    id: "ljlj-app",
    title: "Ljubljana Radar / Approach (Slovenia Control)",
    icao: "LJLJ",
    facility: "Approach / ACC",
    freqMhz: "135.280",
    country: "Slovenia",
    streamUrl: "/api/atc/stream?id=ljlj-app",
    altStreamUrl: "https://relay.radioreference.com/atc/ljlj_app",
    quality: "High Definition VHF Airband (AM 135.280 MHz)",
    coverage: "Slovenian Airspace & TMA Ljubljana up to FL245",
  },
  {
    id: "ljlj-twr",
    title: "Ljubljana Tower / Ground",
    icao: "LJLJ",
    facility: "Tower / Aerodrome Control",
    freqMhz: "118.480",
    country: "Slovenia",
    streamUrl: "/api/atc/stream?id=ljlj-twr",
    altStreamUrl: "https://relay.radioreference.com/atc/ljlj_twr",
    quality: "High Definition VHF Airband (AM 118.480 MHz)",
    coverage: "Ljubljana CTR Runway 12/30 & Taxiways",
  },
  {
    id: "ljce-twr",
    title: "Cerklje Military Tower (Slovenian AF)",
    icao: "LJCE",
    facility: "Military Airbase Control",
    freqMhz: "128.525",
    country: "Slovenia",
    streamUrl: "/api/atc/stream?id=ljce-twr",
    altStreamUrl: "https://relay.radioreference.com/atc/ljce_mil",
    quality: "Military Airband (AM 128.525 MHz)",
    coverage: "Cerklje Military CTR & Training Corridors",
  },
  {
    id: "lowg-app",
    title: "Graz Approach & Tower (Austro Control)",
    icao: "LOWG",
    facility: "Approach / Tower",
    freqMhz: "119.300",
    country: "Austria",
    streamUrl: "/api/atc/stream?id=lowg-app",
    altStreamUrl: "https://relay.radioreference.com/atc/lowg_app",
    quality: "Airband VHF (AM 119.300 MHz)",
    coverage: "Styria Airspace & Graz Inbound Corridors",
  },
  {
    id: "ldza-app",
    title: "Zagreb Radar / Approach (Croatia Control)",
    icao: "LDZA",
    facility: "Approach / Radar",
    freqMhz: "120.700",
    country: "Croatia",
    streamUrl: "/api/atc/stream?id=ldza-app",
    altStreamUrl: "https://relay.radioreference.com/atc/ldza_app",
    quality: "Airband VHF (AM 120.700 MHz)",
    coverage: "Zagreb TMA & Northern Croatia",
  },
  {
    id: "muac-upper",
    title: "Maastricht UAC (MUAC Upper Airspace)",
    icao: "EDYY",
    facility: "Upper Area Control",
    freqMhz: "132.855",
    country: "Eurocontrol",
    streamUrl: "/api/atc/stream?id=muac-upper",
    altStreamUrl: "https://relay.radioreference.com/atc/muac_enroute",
    quality: "En-Route Upper European Airband (AM 132.855 MHz)",
    coverage: "Upper Airspace FL245+ Benelux & NW Germany",
  },
  {
    id: "eddm-app",
    title: "Munich Radar / Approach (DFS)",
    icao: "EDDM",
    facility: "Approach / Arrival Radar",
    freqMhz: "124.050",
    country: "Germany",
    streamUrl: "/api/atc/stream?id=eddm-app",
    altStreamUrl: "https://relay.radioreference.com/atc/eddm_app",
    quality: "Airband VHF (AM 124.050 MHz)",
    coverage: "Bavaria & Alpine Inbound Feeds",
  },
];

export const TacticalAirbandAudioBar: React.FC<{
  unexpectedCount?: number;
  militaryCount?: number;
}> = ({ unexpectedCount = 0, militaryCount = 0 }) => {
  const [streams, setStreams] = useState<AirbandStream[]>(DEFAULT_STREAMS);
  const [selectedId, setSelectedId] = useState<string>("ljmb-twr");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.75);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [filterVhfEffect, setFilterVhfEffect] = useState<boolean>(true);
  const [carrierLocked, setCarrierLocked] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevAlertsRef = useRef<number>(0);

  // Load server-configured streams
  useEffect(() => {
    fetch("/api/spotting/audio")
      .then((r) => r.json())
      .then((d) => {
        if (d?.streams?.length) {
          const mapped = d.streams.map((s: AirbandStream) => ({
            ...s,
            streamUrl: `/api/atc/stream?id=${s.id}`,
          }));
          setStreams(mapped);
        }
      })
      .catch(() => {});
  }, []);

  const activeStream = streams.find((s) => s.id === selectedId) || streams[0];

  // Synthesize realistic VHF radio squelch burst (PTT noise)
  const playSquelchSound = () => {
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume();

      const bufferSize = ctx.sampleRate * 0.08; // 80ms burst
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.value = 1800;
      bandpass.Q.value = 1.8;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12 * volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      noise.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    } catch {
      // AudioContext policy
    }
  };

  // Synthesize tactical radar beep when new alerts occur
  const playTacticalAlertBeep = () => {
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1760, ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.08 * volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // AudioContext policy
    }
  };

  // Trigger alert beep on incoming target detection
  useEffect(() => {
    const totalAlerts = unexpectedCount + militaryCount;
    if (totalAlerts > prevAlertsRef.current && isPlaying && !isMuted) {
      playTacticalAlertBeep();
    }
    prevAlertsRef.current = totalAlerts;
  }, [unexpectedCount, militaryCount, isPlaying, isMuted]);

  // Audio Playback Handler
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      setCarrierLocked(false);
      playSquelchSound();
    } else {
      setAudioError(null);
      playSquelchSound();
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setCarrierLocked(true);
        })
        .catch((err) => {
          setIsPlaying(false);
          setCarrierLocked(false);
          setAudioError("Carrier signal acquiring or relay initializing. Try next frequency.");
        });
    }
  };

  const handleSelectStream = (id: string) => {
    playSquelchSound();
    setSelectedId(id);
    setAudioError(null);
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      setCarrierLocked(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "52px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "rgba(10, 15, 24, 0.94)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(62, 224, 194, 0.35)",
        borderRadius: "8px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.75), 0 0 16px rgba(62, 224, 194, 0.15)",
        color: "#e2e8f0",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        padding: "6px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        maxWidth: "96vw",
        width: expanded ? "620px" : "auto",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <audio
        ref={audioRef}
        src={activeStream?.streamUrl}
        preload="none"
        onError={() => {
          setAudioError("Signal carrier lost. Fallback to alternate relay available.");
          setCarrierLocked(false);
          setIsPlaying(false);
        }}
        onPlaying={() => setCarrierLocked(true)}
      />

      {/* Main Tactical Compact Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "nowrap" }}>
        {/* Live On-Air Indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: isPlaying ? (carrierLocked ? "#3ee07a" : "#f59e0b") : "#64748b",
              boxShadow: isPlaying ? (carrierLocked ? "0 0 8px #3ee07a" : "0 0 8px #f59e0b") : "none",
            }}
          />
          <span style={{ fontSize: "10px", fontWeight: 800, color: "#3ee0c2", letterSpacing: "0.5px" }}>
            AIRBAND
          </span>
        </div>

        {/* Frequency & Station Badge */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            background: "rgba(62, 224, 194, 0.12)",
            border: "1px solid rgba(62, 224, 194, 0.3)",
            color: "#3ee0c2",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          title="Click to toggle frequency selector"
        >
          <span>{activeStream.freqMhz} MHz</span>
          <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {activeStream.icao}</span>
          <span style={{ fontSize: "9px" }}>{expanded ? "▲" : "▼"}</span>
        </button>

        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          style={{
            background: isPlaying ? "rgba(239, 68, 68, 0.25)" : "rgba(62, 224, 194, 0.25)",
            border: `1px solid ${isPlaying ? "#ef4444" : "#3ee0c2"}`,
            color: isPlaying ? "#fca5a5" : "#3ee0c2",
            padding: "3px 10px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span>{isPlaying ? "⏹ STOP" : "▶ RX MONITOR"}</span>
        </button>

        {/* Mute Toggle */}
        <button
          type="button"
          onClick={() => {
            setIsMuted(!isMuted);
            if (audioRef.current) audioRef.current.muted = !isMuted;
          }}
          style={{
            background: isMuted ? "rgba(239, 68, 68, 0.2)" : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: isMuted ? "#ef4444" : "#cbd5e1",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "11px",
            cursor: "pointer",
          }}
          title="Mute audio output"
        >
          {isMuted ? "🔇" : "🔊"}
        </button>

        {/* Volume Slider */}
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setVolume(v);
            if (audioRef.current) audioRef.current.volume = v;
          }}
          style={{ width: "60px", accentColor: "#3ee0c2", cursor: "pointer" }}
          title={`Volume: ${Math.round(volume * 100)}%`}
        />

        {/* Tactical Alerts Pill */}
        {(unexpectedCount > 0 || militaryCount > 0) && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#ff6b6b",
              padding: "2px 6px",
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            title="Active tactical alerts"
          >
            <span>🚨</span>
            <span>{unexpectedCount + militaryCount} TACTICAL</span>
          </div>
        )}
      </div>

      {/* Expanded Frequency & Signal Management Console */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            paddingTop: "8px",
            marginTop: "2px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {/* Quick Frequency Grid */}
          <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700 }}>
            EUROPEAN AIRBAND FREQUENCIES:
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))",
              gap: "4px",
            }}
          >
            {streams.map((s) => {
              const active = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectStream(s.id)}
                  style={{
                    background: active ? "rgba(62, 224, 194, 0.2)" : "rgba(255, 255, 255, 0.04)",
                    border: `1px solid ${active ? "#3ee0c2" : "rgba(255, 255, 255, 0.08)"}`,
                    color: active ? "#3ee0c2" : "#94a3b8",
                    padding: "4px 6px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 800, color: active ? "#3ee0c2" : "#f1f5f9" }}>
                    {s.freqMhz} MHz
                  </div>
                  <div style={{ fontSize: "9px", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.icao} · {s.facility}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Station Details */}
          <div
            style={{
              background: "rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "4px",
              padding: "6px 8px",
              fontSize: "10px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ color: "#3ee0c2", fontWeight: 700 }}>{activeStream.title}</span>
              <span style={{ color: "#64748b", marginLeft: "6px" }}>({activeStream.quality})</span>
              <div style={{ color: "#94a3b8", fontSize: "9px", marginTop: "2px" }}>
                Coverage: {activeStream.coverage}
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                type="button"
                onClick={playSquelchSound}
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#cbd5e1",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  fontSize: "9px",
                  cursor: "pointer",
                }}
                title="Test VHF squelch audio tone"
              >
                TEST SQUELCH
              </button>
              <a
                href={activeStream.altStreamUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#6aa8ff",
                  fontSize: "9px",
                  textDecoration: "none",
                  padding: "2px 6px",
                  border: "1px solid rgba(106, 168, 255, 0.3)",
                  borderRadius: "3px",
                }}
                title="Direct relay stream URL"
              >
                DIRECT RELAY ↗
              </a>
            </div>
          </div>

          {audioError && (
            <div style={{ color: "#f87171", fontSize: "9px", padding: "2px 4px" }}>
              ⚠️ {audioError}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
