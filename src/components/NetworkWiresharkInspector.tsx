/**
 * Placeholder for the Network / Wireshark view.
 * The original component was never committed, which broke `tsc --noEmit`
 * on CI (TS2307). This stub keeps the build green until the real one is added.
 */
export function NetworkWiresharkInspector() {
  return (
    <div style={{ padding: 24, color: "#9fb3c8", fontFamily: "monospace" }}>
      <h2 style={{ margin: "0 0 8px", color: "#e6edf3" }}>Network inspector</h2>
      <p style={{ margin: 0 }}>This view is not available in this build yet.</p>
    </div>
  );
}
