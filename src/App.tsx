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
    { to: "/radar", lab: "Radar", ic: "✈" },
    { to: "/data", lab: "Data", ic: "▤" },
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
