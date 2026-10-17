import { useEffect, useMemo, useRef, useState } from "react";
import Icon, { Logo } from "./icons";
import { useStore, stats, loadAudio, deleteAudio, dayKey, useNow, set as setKey, get as getKey, uid, wordCount } from "./store";
import { IS_TAURI, subscribe, retry, cancel } from "./engine";
import { Notetaker, Insights, Dictionary, Snippets, Style, Transforms, Scratchpad, Settings, Help, Modal } from "./pages";

const NAV = [
  ["dictation", "Dictation", "mic"],
  ["notetaker", "Notetaker", "record"],
  ["insights", "Insights", "insights"],
  ["dictionary", "Dictionary", "book"],
  ["snippets", "Snippets", "scissors"],
  ["style", "Style", "type"],
  ["transforms", "Transforms", "wand"],
  ["scratchpad", "Scratchpad", "note"],
];

const win = () => import("@tauri-apps/api/window").then((m) => m.getCurrentWindow());

export default function App() {
  const [page, setPage] = useState("dictation");
  const [modal, setModal] = useState(null);
  const [ui, setUi] = useStore("ui");
  const [settings] = useStore("settings");
  const [live, setLive] = useState({});
  const [hideTaken, setHideTaken] = useState(false);
  const taken = hideTaken ? [] : live.taken || [];
  useEffect(() => subscribe(setLive), []);
  useEffect(() => { if (!settings.apiKey) setModal("settings"); }, []);
  // Floating bar buttons open a page here.
  useEffect(() => {
    if (!IS_TAURI) return;
    let un;
    import("@tauri-apps/api/event").then(({ listen }) => listen("nav", (e) => { setModal(null); setPage(e.payload); }).then((f) => (un = f)));
    return () => un?.();
  }, []);

  const pages = { notetaker: Notetaker, insights: Insights, dictionary: Dictionary, snippets: Snippets, style: Style, transforms: Transforms, scratchpad: Scratchpad };
  const Page = pages[page];

  return (
    <div className="app">
      <div className="titlebar" data-tauri-drag-region>
        <button className="tb-btn" onClick={() => setUi({ ...ui, sidebarCollapsed: !ui.sidebarCollapsed })}><Icon name="sidebar" size={19} /></button>
        <button className="tb-btn" onClick={() => setModal("settings")}><Icon name="user" size={19} /></button>
        <div className="tb-fill" data-tauri-drag-region />
        <button className="tb-btn" onClick={() => setModal("notifications")}><Icon name="bell" size={18} /></button>
        {IS_TAURI && <>
          <button className="tb-btn win" onClick={() => win().then((w) => w.minimize())}><Icon name="min" size={15} stroke={1.2} /></button>
          <button className="tb-btn win" onClick={() => win().then((w) => w.toggleMaximize())}><Icon name="max" size={13} stroke={1.2} /></button>
          <button className="tb-btn win close" onClick={() => win().then((w) => w.hide())}><Icon name="x" size={16} stroke={1.2} /></button>
        </>}
      </div>

      <div className="body">
        {!ui.sidebarCollapsed && (
          <aside className="sidebar">
            <div className="brand"><Logo /><span>Murmur</span></div>
            <nav>
              {NAV.map(([id, label, icon]) => (
                <button key={id} className={"nav" + (page === id ? " active" : "")} onClick={() => setPage(id)}>
                  <Icon name={icon} /> {label}
                </button>
              ))}
            </nav>
            <div className="grow" />
            <Checklist ui={ui} setUi={setUi} setModal={setModal} />
            <div className="side-bottom">
              <button className="nav" onClick={() => setModal("invite")}><Icon name="users" /> Invite your team</button>
              <button className="nav" onClick={() => setModal("free")}><Icon name="gift" /> Get a free month</button>
              <button className="nav" onClick={() => setModal("settings")}><Icon name="gear" /> Settings</button>
              <button className="nav" onClick={() => setModal("help")}><Icon name="help" /> Help</button>
            </div>
          </aside>
        )}

        <main className="main">
          <div className="main-scroll">
            {taken.length > 0 && (
              <div className="livebar error" style={{ margin: "16px 40px 0" }}>
                <span className="dot" />
                <span><b>{taken.join(", ")}</b> could not be set. Another app (like Wispr Flow) may use it. Quit that app, or pick a different key in Settings → Shortcuts.</span>
                <button className="link" onClick={() => setHideTaken(true)}>Close</button>
              </div>
            )}
            {page === "dictation" ? <Dictation setModal={setModal} live={live} /> : <Page />}
          </div>
        </main>
      </div>

      {modal === "settings" && <Settings onClose={() => setModal(null)} />}
      {modal === "help" && <Help onClose={() => setModal(null)} />}
      {modal === "whisper" && <WhisperHelp onClose={() => setModal(null)} />}
      {modal === "invite" && <Modal title="Invite your team" onClose={() => setModal(null)}><p className="muted">Murmur runs locally on your PC with your own Groq key. Share the installer file with a teammate and they can add their own key.</p></Modal>}
      {modal === "free" && <Modal title="Get a free month" onClose={() => setModal(null)}><p className="muted">Murmur is free forever. You only use your own Groq API key (free tier).</p></Modal>}
      {modal === "notifications" && <Modal title="Notifications" onClose={() => setModal(null)}><p className="muted">You're all caught up.</p></Modal>}
      {modal?.startsWith("check:") && <ChecklistModal id={modal.slice(6)} onClose={() => setModal(null)} ui={ui} setUi={setUi} />}
    </div>
  );
}

// ---------------- Dictation (home) ----------------
function Dictation({ setModal, live }) {
  const [settings] = useStore("settings");
  const [history, setHistory] = useStore("history");
  const [ui, setUi] = useStore("ui");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const st = stats(history);
  const name = settings.name || "there";

  const groups = useMemo(() => {
    const f = q ? history.filter((h) => h.text.toLowerCase().includes(q.toLowerCase())) : history;
    const out = [];
    for (const h of f) {
      const label = dayLabel(h.ts);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(h);
    }
    return out;
  }, [history, q]);

  const unlock = 2000;
  const pct = Math.min(100, (st.words / unlock) * 100);

  return (
    <div className="dict">
      <div className="dict-col">
        <h1 className="hello">
          Hey {name}, get back into the flow with <kbd>Ctrl</kbd> + <kbd>Space</kbd>
        </h1>

        {live.state && live.state !== "idle" && <LiveBar live={live} />}

        {!ui.bannerClosed && (
          <div className="banner">
            <div className="banner-art" />
            <button className="banner-x" onClick={() => setUi({ ...ui, bannerClosed: true })}><Icon name="x" size={16} stroke={2} /></button>
            <div className="banner-text">
              <h2>Working around other people?</h2>
              <p>With the right setup, you can dictate without disrupting your neighbors</p>
              <button className="btn-light" onClick={() => setModal("whisper")}>Show me how</button>
            </div>
          </div>
        )}

        <div className="hist-head">
          {searching ? (
            <input autoFocus className="hist-search" placeholder="Search your dictations" value={q} onChange={(e) => setQ(e.target.value)}
              onBlur={() => !q && setSearching(false)} onKeyDown={(e) => e.key === "Escape" && (setQ(""), setSearching(false))} />
          ) : <span className="label">{groups[0]?.label || "Today"}</span>}
          <button className="icon-btn" onClick={() => setSearching(true)}><Icon name="search" size={19} /></button>
        </div>

        {history.length === 0 && (
          <div className="empty">
            Hold <kbd className="sm">Ctrl</kbd> + <kbd className="sm">Space</kbd> in any app and start talking. Let go and your words appear.
            <div className="muted small" style={{ marginTop: 8 }}>
              Tap it quickly for hands-free mode. <kbd className="sm">Alt</kbd>+<kbd className="sm">Shift</kbd>+<kbd className="sm">Space</kbd> = command mode (edit selected text by voice). <kbd className="sm">Esc</kbd> cancels.
            </div>
          </div>
        )}

        {groups.map((g, gi) => (
          <div key={g.label}>
            {gi > 0 && <div className="label group-label">{g.label}</div>}
            <div className="hist">
              {g.items.map((h) => <Row key={h.id} h={h} setHistory={setHistory} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="side-col">
        <div className="stats">
          <div className="stat-list">
            <div><b>{fmt(st.words)}</b> total words</div>
            <div><b>{st.wpm}</b> wpm</div>
            <div><b>{st.streak}</b> day streak</div>
          </div>
          <div className="voice">
            <h3>Your Voice Profile</h3>
            <p>Discover how you use your voice.</p>
            <div className="vp-row">
              <div className="vp-bar"><i style={{ width: pct + "%" }} /></div>
              <span>{pct >= 100 ? "Unlocked" : `Unlocks in ${fmtK(unlock - st.words)} words`}</span>
            </div>
            {pct >= 100 && <VoiceProfile history={history} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveBar({ live }) {
  const txt = { starting: "Starting mic…", recording: live.mode === "command" ? "Listening for a command…" : live.mode === "handsfree" ? "Hands-free — press Ctrl+Space to finish" : "Listening…", processing: "Transcribing…", error: live.error }[live.state];
  return (
    <div className={"livebar " + live.state}>
      <span className="dot" />
      <span>{txt}</span>
      {live.state === "recording" && <button className="link" onClick={cancel}>Cancel</button>}
    </div>
  );
}

function Row({ h, setHistory }) {
  const [menu, setMenu] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [learned, setLearned] = useState(0);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(h.text);
  const audio = useRef(null);
  const time = new Date(h.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase();

  async function play() {
    if (playing) { audio.current?.pause(); setPlaying(false); return; }
    const b = await loadAudio(h.id);
    if (!b) return alert("No audio saved for this one.");
    audio.current = new Audio(URL.createObjectURL(b));
    audio.current.onended = () => setPlaying(false);
    audio.current.play(); setPlaying(true);
  }
  const copy = (t) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  const upd = (p) => setHistory((all) => all.map((x) => (x.id === h.id ? { ...x, ...p } : x)));

  return (
    <div className={"row" + (menu ? " hover" : "")} onMouseLeave={() => setMenu(false)}>
      <div className="row-time">{time}</div>
      <div className="row-text">
        {h.mode === "command" && <span className="chip">Command</span>}
        {busy ? <span className="muted">Retrying…</span> : editing ? (
          <div>
            <textarea className="row-edit" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
            <div className="row-edit-actions">
              <button className="btn ghost" onClick={() => { setEditing(false); setDraft(h.text); }}>Cancel</button>
              <button className="btn" onClick={() => { const n = learnWords(h.text, draft); upd({ text: draft, words: wordCount(draft) }); setEditing(false); if (n) setLearned(n); }}>Save</button>
            </div>
          </div>
        ) : h.text}
        {learned && <div className="small learned">Learned {learned} new word{learned > 1 ? "s" : ""} → Dictionary</div>}
      </div>
      <div className="row-actions">
        <button className="icon-btn" title="Play" onClick={play}><Icon name={playing ? "pause" : "play"} size={19} /></button>
        <button className="icon-btn" title="Copy" onClick={() => copy(h.text)}><Icon name={copied ? "check" : "copy"} size={19} /></button>
        <button className={"icon-btn" + (h.flagged ? " flagged" : "")} title="Flag" onClick={() => upd({ flagged: !h.flagged })}><Icon name="flag" size={19} /></button>
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenu(!menu)}><Icon name="dots" size={19} /></button>
          {menu && (
            <div className="menu">
              <button onClick={() => { setDraft(h.text); setEditing(true); setMenu(false); }}>Edit (teaches Murmur your words)</button>
              <button onClick={() => { copy(h.raw || h.text); setMenu(false); }}>Copy raw transcript</button>
              <button onClick={async () => {
                setMenu(false); const b = await loadAudio(h.id); if (!b) return alert("No audio saved.");
                setBusy(true); try { await retry(h, b); } catch (e) { alert(e.message); } setBusy(false);
              }}>Retry transcript</button>
              <button onClick={async () => {
                setMenu(false); const b = await loadAudio(h.id); if (!b) return;
                const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `dictation-${h.id}.webm`; a.click();
              }}>Download audio</button>
              <button className="danger" onClick={() => { deleteAudio(h.id); setHistory((all) => all.filter((x) => x.id !== h.id)); }}>Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceProfile({ history }) {
  const counts = {};
  for (const h of history) for (const w of h.text.toLowerCase().match(/[a-z']{4,}/g) || []) counts[w] = (counts[w] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return <div className="vp-top">{top.map(([w, n]) => <span key={w} className="chip">{w} · {n}</span>)}</div>;
}

function WhisperHelp({ onClose }) {
  const [s, setS] = useStore("settings");
  return (
    <Modal title="Dictate quietly" onClose={onClose}>
      <ol className="steps">
        <li>Hold your mic or headset close to your mouth (2–5 cm).</li>
        <li>Turn on <b>Whisper mode</b> below. It boosts quiet speech so you can talk softly.</li>
        <li>Speak at a whisper and hold <kbd className="sm">Ctrl</kbd>+<kbd className="sm">Space</kbd> as usual.</li>
      </ol>
      <label className="toggle-row">
        <span>Whisper mode</span>
        <Toggle on={s.whisperMode} set={(v) => setS({ ...s, whisperMode: v })} />
      </label>
    </Modal>
  );
}

export function Toggle({ on, set }) {
  return <button className={"toggle" + (on ? " on" : "")} onClick={() => set(!on)}><i /></button>;
}

// ---------------- Setup checklist ----------------
const CHECKS = [
  ["tour", "Take 2-min tour"],
  ["calendar", "Connect calendar"],
  ["import", "Import from Granola or Otter"],
  ["mcp", "Set up MCP"],
];
function Checklist({ ui, setUi, setModal }) {
  const done = CHECKS.filter(([id]) => ui.checklist[id]).length;
  if (done === CHECKS.length) return null;
  return (
    <div className="checklist">
      <div className="cl-title">Set up Notetaker</div>
      <div className="cl-bar"><i style={{ width: (done / CHECKS.length) * 100 + "%" }} /></div>
      {CHECKS.map(([id, label]) => (
        <button key={id} className={"cl-item" + (ui.checklist[id] ? " done" : "")} onClick={() => setModal("check:" + id)}>
          <span className="circle">{ui.checklist[id] && <Icon name="check" size={12} stroke={3} />}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
function ChecklistModal({ id, onClose, ui, setUi }) {
  const body = {
    tour: "Notetaker records a meeting from your mic (and optionally system audio), then gives you a transcript and an AI summary. Open Notetaker in the sidebar and press Start recording.",
    calendar: "Calendar sync is not connected in this build. Start recordings by hand from the Notetaker page.",
    import: "Paste a transcript from Granola or Otter into a new note on the Notetaker page, then press Summarize.",
    mcp: "MCP lets AI tools read your notes. Your notes are stored locally in this app. Export them from the Notetaker page as text.",
  }[id];
  return (
    <Modal title={CHECKS.find((c) => c[0] === id)[1]} onClose={onClose}>
      <p className="muted">{body}</p>
      <div className="modal-actions">
        <button className="btn" onClick={() => { setUi({ ...ui, checklist: { ...ui.checklist, [id]: true } }); onClose(); }}>Mark done</button>
      </div>
    </Modal>
  );
}

// ---------------- helpers ----------------
function dayLabel(ts) {
  const k = dayKey(ts), now = new Date();
  if (k === dayKey(now)) return "Today";
  now.setDate(now.getDate() - 1);
  if (k === dayKey(now)) return "Yesterday";
  return new Date(ts).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}
const fmt = (n) => n.toLocaleString();
const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n));

// When you fix a dictation, learn the words you changed. Same-length edits also learn
// what Murmur misheard, so it gets fixed automatically next time.
function learnWords(before, after) {
  const words = (t) => t.match(/[\p{L}\p{N}'-]+/gu) || [];
  const a = words(before), b = words(after);
  const dict = getKey("dictionary");
  const known = new Set(dict.map((d) => d.word.toLowerCase()));
  const added = [];
  const add = (word, replace = "") => {
    if (word.length < 2 || known.has(word.toLowerCase())) return;
    known.add(word.toLowerCase());
    added.push({ id: uid(), word, replace });
  };
  if (a.length === b.length) {
    a.forEach((w, i) => { if (w.toLowerCase() !== b[i].toLowerCase()) add(b[i], w); });
  } else {
    const old = new Set(a.map((w) => w.toLowerCase()));
    b.forEach((w) => { if (!old.has(w.toLowerCase())) add(w); });
  }
  if (added.length) setKey("dictionary", [...added, ...dict]);
  return added.length;
}
