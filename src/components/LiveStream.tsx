import { ago, focusId } from "../lib";
import type { Msg } from "../lib";

function Pill({ lab, v }: { lab: string; v: string }) {
  return (
    <span className={`pill ${lab.toLowerCase()}`}>
      {lab} {v}
    </span>
  );
}

export function LiveStream(props: { items: Msg[]; pick?: string; onPick?: (id: string) => void; title?: string }) {
  const items = props.items || [];
  return (
    <section className="stream" aria-label="decoded live stream">
      <header>
        <small>{props.title || "LIVE DECODE"}</small>
        <strong>{items.length} packets</strong>
      </header>
      {items.length ? (
        items.slice(0, 36).map((m) => {
          const d = m.decoded || {};
          const fid = focusId(m);
          const on = Boolean(props.pick) && (props.pick === fid || props.pick === m.id);
          return (
            <button key={m.id} type="button" className={on ? "on" : ""} onClick={() => props.onPick?.(fid)}>
              <i className={`tag ${m.port || m.kind}`}>{m.port || m.kind}</i>
              <b>{m.name}</b>
              <span className="pills">
                {d.battery != null ? <Pill lab="BAT" v={`${Math.round(Number(d.battery))}%`} /> : null}
                {d.voltage != null && Number(d.voltage) > 0.2 ? <Pill lab="V" v={Number(d.voltage).toFixed(2)} /> : null}
                {d.temp != null && Number(d.temp) !== 0 ? <Pill lab="°C" v={Number(d.temp).toFixed(1)} /> : null}
                {d.humidity != null && Number(d.humidity) !== 0 ? <Pill lab="RH" v={`${Math.round(Number(d.humidity))}%`} /> : null}
                {d.alt != null && Number(d.alt) ? <Pill lab="ALT" v={`${Math.round(Number(d.alt))}m`} /> : null}
                {m.rssi != null ? <Pill lab="RSSI" v={`${m.rssi}`} /> : null}
                {m.lat ? <Pill lab="MAP" v={`${m.lat.toFixed(3)},${m.lon?.toFixed(3)}`} /> : null}
                {m.at ? <Pill lab="" v={ago(m.at)} /> : null}
              </span>
            </button>
          );
        })
      ) : (
        <p className="note pad">
          {props.pick
            ? "No packets from this sensor yet. Show all to see the rest of the feed."
            : "Waiting for live MQTT / uplinks. Empty is a fact — nothing is simulated."}
        </p>
      )}
    </section>
  );
}
