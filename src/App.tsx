import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import { OpsPage } from "./pages/OpsPage";

export function App() {
  return (
    <HashRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<OpsPage view="ops" />} />
          <Route path="/lora" element={<OpsPage view="lora" />} />
          <Route path="/sensors" element={<OpsPage view="sensors" />} />
          <Route path="/radar" element={<OpsPage view="radar" />} />
          <Route path="/data" element={<OpsPage view="data" />} />
          <Route path="/b2b" element={<OpsPage view="b2b" />} />
          <Route path="/spotting" element={<OpsPage view="spotting" />} />
          <Route path="/cyber" element={<OpsPage view="cyber" />} />
          <Route path="/cad" element={<OpsPage view="cad" />} />
          <Route path="/network" element={<OpsPage view="network" />} />
          <Route path="/water" element={<OpsPage view="water" />} />
          <Route path="/rail" element={<OpsPage view="rail" />} />
        </Routes>
        <Nav />
      </div>
    </HashRouter>
  );
}

function Nav() {
  const items = [
    { to: "/", lab: "OPS", ic: "▣" },
    { to: "/lora", lab: "LoRa", ic: "◈" },
    { to: "/sensors", lab: "Sensors", ic: "◉" },
    { to: "/water", lab: "Vode / Hydro", ic: "💧" },
    { to: "/rail", lab: "Rail Cargo", ic: "🚆" },
    { to: "/radar", lab: "Radar", ic: "✈" },
    { to: "/cad", lab: "CAD Radar", ic: "📐" },
    { to: "/data", lab: "Data", ic: "▤" },
    { to: "/b2b", lab: "B2B / FPL", ic: "⇄" },
    { to: "/spotting", lab: "Spotting / Mil", ic: "🔭" },
    { to: "/cyber", lab: "Cyber OSINT", ic: "🛡️" },
    { to: "/network", lab: "Wireshark", ic: "🦈" },
  ];
  return (
    <nav className="tabbar" aria-label="dashboards">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} className={({ isActive }) => (isActive ? "on" : "")} end={it.to === "/"}>
          <em>{it.ic}</em>
          {it.lab}
        </NavLink>
      ))}
    </nav>
  );
}
