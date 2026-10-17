import { useEffect, useRef, useState } from "react";

// Pop-up at the bottom of the screen. Only visible while you dictate.
export default function Overlay() {
  const [s, setS] = useState({ state: "idle", mode: null, level: 0, error: "" });
  const hist = useRef(Array(14).fill(0));
  useEffect(() => {
    let un;
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen("ov", (e) => {
        hist.current = [...hist.current.slice(1), e.payload.level || 0];
        setS(e.payload);
      }).then((f) => (un = f))
    );
    return () => un?.();
  }, []);

  const recording = s.state === "recording" || s.state === "starting";
  return (
    <div className="pill-wrap">
      <div className={"pill " + s.state}>
        {recording && (s.partial
          ? <span className="pill-live">{s.partial.length > 80 ? "â€¦" + s.partial.slice(-80) : s.partial}</span>
          : <span className="pill-label">{s.mode === "command" ? "Command" : "Recording"}</span>)}
        {s.state === "processing" && <span className="pill-label">Typingâ€¦</span>}
        {s.state === "error" && <span className="pill-err" title={s.error}>{s.error.slice(0, 90)}</span>}
      </div>
    </div>
  );
}
