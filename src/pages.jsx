import { useEffect, useRef, useState } from "react";
import Icon from "./icons";
import { useStore, uid, dayKey, stats, wordCount, set as setKey } from "./store";
import { IS_TAURI, transcribe, chat, categoryFor, toggleHandsFree, applyHotkeys } from "./engine";
import { OFFLINE_MODELS, loadOffline } from "./offline";
import { Toggle } from "./App";

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " wide" : "")}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

// ---------------- Dictionary ----------------
export function Dictionary() {
  const [list, setList] = useStore("dictionary");
  const [word, setWord] = useState(""), [rep, setRep] = useState("");
  const add = () => { if (!word.trim()) return; setList([{ id: uid(), word: word.trim(), replace: rep.trim() }, ...list]); setWord(""); setRep(""); };
  return (
    <div className="page">
      <PageHead title="Dictionary" sub="Teach Murmur names, jargon and words it gets wrong." />
      <div className="card form-row">
        <input placeholder="Word or name (e.g. Tauri)" value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input placeholder="Optional: what it mishears (e.g. Tago)" value={rep} onChange={(e) => setRep(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn" onClick={add}><Icon name="plus" size={16} /> Add</button>
      </div>
      <div className="list">
        {list.length === 0 && <div className="empty">No words yet.</div>}
        {list.map((d) => (
          <div key={d.id} className="list-row">
            <b>{d.word}</b>
            {d.replace && <span className="muted">replaces “{d.replace}”</span>}
            <button className="icon-btn" onClick={() => setList(list.filter((x) => x.id !== d.id))}><Icon name="trash" size={17} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Snippets ----------------
export function Snippets() {
  const [list, setList] = useStore("snippets");
  const [trigger, setTrigger] = useState(""), [text, setText] = useState("");
  const add = () => { if (!trigger.trim() || !text.trim()) return; setList([{ id: uid(), trigger: trigger.trim(), text }, ...list]); setTrigger(""); setText(""); };
  return (
    <div className="page">
      <PageHead title="Snippets" sub="Say a short phrase, get a full block of text. Example: say “my email” → your email address." />
      <div className="card">
        <input placeholder="When I say… (e.g. my calendar link)" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
        <textarea rows={3} placeholder="Type this…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="modal-actions"><button className="btn" onClick={add}><Icon name="plus" size={16} /> Add snippet</button></div>
      </div>
      <div className="list">
        {list.length === 0 && <div className="empty">No snippets yet.</div>}
        {list.map((s) => (
          <div key={s.id} className="list-row col">
            <div className="row-split"><b>“{s.trigger}”</b><button className="icon-btn" onClick={() => setList(list.filter((x) => x.id !== s.id))}><Icon name="trash" size={17} /></button></div>
            <div className="muted pre">{s.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Style ----------------
const CATS = [
  ["personal", "Personal messages", "WhatsApp, Messenger, Discord, Telegram"],
  ["work", "Work messages", "Slack, Teams, Notion, Linear, code editors"],
  ["email", "Email", "Gmail, Outlook, other mail apps"],
  ["other", "Other", "Everything else"],
];
const STYLES = [
  ["formal", "Formal.", "Caps + full punctuation", "Hey, are you free for lunch tomorrow? Let's do 12 if that works for you."],
  ["casual", "Casual", "Caps + less punctuation", "Hey are you free for lunch tomorrow? Let's do 12 if that works for you"],
  ["very casual", "very casual", "No caps + less punctuation", "hey are you free for lunch tomorrow? let's do 12 if that works for you"],
];
export function Style() {
  const [style, setStyle] = useStore("style");
  const [tab, setTab] = useState("personal");
  return (
    <div className="page">
      <PageHead title="Style" sub="Murmur picks a writing style based on the app you're typing in." />
      <div className="tabs">
        {CATS.map(([id, l]) => <button key={id} className={"tab" + (tab === id ? " active" : "")} onClick={() => setTab(id)}>{l}</button>)}
      </div>
      <p className="muted small">{CATS.find((c) => c[0] === tab)[2]}</p>
      <div className="style-grid">
        {STYLES.map(([id, title, sub, ex]) => (
          <button key={id} className={"style-card" + (style[tab] === id ? " active" : "")} onClick={() => setStyle({ ...style, [tab]: id })}>
            <div className="sc-title">{title}</div>
            <div className="muted small">{sub}</div>
            <div className="sc-ex">{ex}</div>
          </button>
        ))}
      </div>
      <AppRules />
    </div>
  );
}

function AppRules() {
  const [rules, setRules] = useStore("appRules");
  const [match, setMatch] = useState(""), [style, setSt] = useState("casual");
  const add = () => { if (!match.trim()) return; setRules([...rules, { id: uid(), match: match.trim(), style }]); setMatch(""); };
  return <>
    <h3 className="section">Your app rules</h3>
    <p className="muted small">Pick a style for one app. Type part of the app window title (for example: Discord, Gmail, Notepad).</p>
    <div className="card form-row">
      <input placeholder="App name" value={match} onChange={(e) => setMatch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      <select value={style} onChange={(e) => setSt(e.target.value)} style={{ width: 180 }}>{STYLES.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select>
      <button className="btn" onClick={add}><Icon name="plus" size={16} /> Add</button>
    </div>
    {rules.length > 0 && <div className="list">
      {rules.map((r) => <div key={r.id} className="list-row"><b>{r.match}</b><span className="muted">{STYLES.find((x) => x[0] === r.style)?.[1]}</span>
        <button className="icon-btn" onClick={() => setRules(rules.filter((x) => x.id !== r.id))}><Icon name="trash" size={17} /></button></div>)}
    </div>}
  </>;
}

// ---------------- Transforms ----------------
export function Transforms() {
  const [list, setList] = useStore("transforms");
  const [input, setInput] = useState(""), [out, setOut] = useState(""), [busy, setBusy] = useState(false);
  const [name, setName] = useState(""), [prompt, setPrompt] = useState("");
  async function run(t) {
    if (!input.trim()) return;
    setBusy(true); setOut("");
    try { setOut(await chat(t.prompt + " Output ONLY the result text.", input)); } catch (e) { setOut("Error: " + e.message); }
    setBusy(false);
  }
  return (
    <div className="page">
      <PageHead title="Transforms" sub="Rewrite text with AI. In any app: select text, hold Alt+Shift+Space and say what to do (e.g. “make this shorter”)." />
      <div className="two-col">
        <div className="card">
          <textarea rows={8} placeholder="Paste text here…" value={input} onChange={(e) => setInput(e.target.value)} />
          <div className="chips">
            {list.map((t) => <button key={t.id} className="chip-btn" disabled={busy} onClick={() => run(t)}>{t.name}</button>)}
          </div>
        </div>
        <div className="card">
          <textarea rows={8} readOnly placeholder={busy ? "Working…" : "Result appears here"} value={out} />
          <div className="modal-actions"><button className="btn ghost" onClick={() => navigator.clipboard.writeText(out)}><Icon name="copy" size={16} /> Copy</button></div>
        </div>
      </div>
      <h3 className="section">Your transforms</h3>
      <div className="card form-row">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Instruction (e.g. Translate to Spanish)" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <button className="btn" onClick={() => { if (name && prompt) { setList([...list, { id: uid(), name, prompt }]); setName(""); setPrompt(""); } }}><Icon name="plus" size={16} /> Add</button>
      </div>
      <div className="list">
        {list.map((t) => (
          <div key={t.id} className="list-row"><b>{t.name}</b><span className="muted">{t.prompt}</span>
            <button className="icon-btn" onClick={() => setList(list.filter((x) => x.id !== t.id))}><Icon name="trash" size={17} /></button></div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Scratchpad ----------------
export function Scratchpad() {
  const [text, setText] = useStore("scratchpad");
  return (
    <div className="page full">
      <PageHead title="Scratchpad" sub="A place to think out loud. Click inside, then hold Ctrl+Space and talk.">
        <span className="muted small">{wordCount(text)} words</span>
        <button className="btn ghost" onClick={() => navigator.clipboard.writeText(text)}><Icon name="copy" size={16} /> Copy</button>
        <button className="btn ghost" onClick={() => confirm("Clear scratchpad?") && setText("")}><Icon name="trash" size={16} /> Clear</button>
      </PageHead>
      <textarea className="scratch" value={text} onChange={(e) => setText(e.target.value)} placeholder="Start typing or dictating…" />
    </div>
  );
}

// ---------------- Insights ----------------
export function Insights() {
  const [history] = useStore("history");
  const st = stats(history);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    days.push({ label: d.toLocaleDateString([], { weekday: "narrow" }), date: d.toLocaleDateString(), words: history.filter((h) => dayKey(h.ts) === k).reduce((a, h) => a + h.words, 0) });
  }
  const max = Math.max(1, ...days.map((d) => d.words));
  const cats = {};
  for (const h of history) { const c = categoryFor(h.app || ""); cats[c] = (cats[c] || 0) + h.words; }
  const apps = {};
  for (const h of history) { const a = (h.app || "Unknown").split(" - ").pop().slice(0, 30) || "Unknown"; apps[a] = (apps[a] || 0) + h.words; }
  const topApps = Object.entries(apps).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const timeSaved = Math.round(st.words / 40 - history.reduce((a, h) => a + (h.secs || 0), 0) / 60); // vs typing at 40 wpm
  return (
    <div className="page">
      <PageHead title="Insights" sub="How you use your voice." />
      <div className="kpis">
        <div className="card kpi"><b>{st.words.toLocaleString()}</b><span>total words</span></div>
        <div className="card kpi"><b>{st.wpm}</b><span>avg wpm</span></div>
        <div className="card kpi"><b>{history.length}</b><span>dictations</span></div>
        <div className="card kpi"><b>{Math.max(0, timeSaved)} min</b><span>saved vs typing</span></div>
      </div>
      <div className="card">
        <h3 className="section" style={{ marginTop: 0 }}>Words per day</h3>
        <div className="bars">
          {days.map((d, i) => (
            <div key={i} className="bar-col" title={`${d.date}: ${d.words} words`}>
              <div className="bar" style={{ height: (d.words / max) * 140 + 2 }} />
              <span>{d.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="two-col">
        <div className="card">
          <h3 className="section" style={{ marginTop: 0 }}>Top apps</h3>
          {topApps.length === 0 && <p className="muted">No data yet.</p>}
          {topApps.map(([a, n]) => <div key={a} className="hbar"><span>{a}</span><div><i style={{ width: (n / topApps[0][1]) * 100 + "%" }} /></div><b>{n}</b></div>)}
        </div>
        <div className="card">
          <h3 className="section" style={{ marginTop: 0 }}>By category</h3>
          {CATS.map(([id, l]) => <div key={id} className="hbar"><span>{l}</span><div><i style={{ width: ((cats[id] || 0) / Math.max(1, st.words)) * 100 + "%" }} /></div><b>{cats[id] || 0}</b></div>)}
        </div>
      </div>
    </div>
  );
}

// ---------------- Notetaker ----------------
export function Notetaker() {
  const [notes, setNotes] = useStore("notes");
  const [rec, setRec] = useState(null);
  const [secs, setSecs] = useState(0);
  const [sys, setSys] = useState(false);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState("");
  const r = useRef();

  useEffect(() => { if (!rec) return; const t = setInterval(() => setSecs((Date.now() - rec.start) / 1000), 500); return () => clearInterval(t); }, [rec]);

  async function start() {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = [mic];
      const ctx = new AudioContext(), dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(mic).connect(dest);
      if (sys) {
        const d = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (d.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(d.getAudioTracks())).connect(dest);
        tracks.push(d);
      }
      const mr = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32000 });
      const chunks = []; mr.ondataavailable = (e) => chunks.push(e.data); mr.start(1000);
      r.current = { mr, chunks, tracks, ctx };
      setSecs(0); setRec({ start: Date.now() }); setKey("noteRec", true);
    } catch (e) { alert("Could not start: " + e.message); }
  }

  async function stop() {
    const { mr, chunks, tracks, ctx } = r.current;
    const duration = secs;
    await new Promise((res) => { mr.onstop = res; mr.stop(); });
    tracks.forEach((s) => s.getTracks().forEach((t) => t.stop())); ctx.close();
    setRec(null); setKey("noteRec", false);
    const blob = new Blob(chunks, { type: "audio/webm" });
    const id = uid();
    const note = { id, ts: Date.now(), title: "Meeting " + new Date().toLocaleString(), transcript: "", summary: "", secs: duration };
    setNotes((n) => [note, ...n]); setOpen(id);
    setBusy("Transcribing…");
    try {
      if (blob.size > 24 * 1024 * 1024) throw new Error("Recording is over 25 MB (about 1.5 hours). Groq can't take it in one piece.");
      const transcript = await transcribe(blob);
      setNotes((n) => n.map((x) => (x.id === id ? { ...x, transcript } : x)));
      await summarize(id, transcript);
    } catch (e) { alert(e.message); }
    setBusy("");
  }

  async function summarize(id, transcript) {
    setBusy("Summarizing…");
    const out = await chat("Summarize this meeting transcript. First line: a short title (no prefix). Then a blank line, then sections 'Summary', 'Key points' and 'Action items' as markdown bullets.", transcript);
    const [title, ...rest] = out.split("\n");
    setNotes((n) => n.map((x) => (x.id === id ? { ...x, title: title.replace(/^#+\s*/, "").trim(), summary: rest.join("\n").trim() } : x)));
    setBusy("");
  }

  const note = notes.find((n) => n.id === open);
  const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="page">
      <PageHead title="Notetaker" sub="Record a meeting or call. Get a transcript and AI notes.">
        {!rec && <label className="small muted check"><input type="checkbox" checked={sys} onChange={(e) => setSys(e.target.checked)} /> Include system audio</label>}
        {!rec && <button className="btn ghost" onClick={() => { const id = uid(); setNotes([{ id, ts: Date.now(), title: "New note", transcript: "", summary: "", secs: 0 }, ...notes]); setOpen(id); }}><Icon name="plus" size={16} /> New note</button>}
        {rec ? <button className="btn rec" onClick={stop}><Icon name="stop" size={16} /> Stop · {mm(secs)}</button>
          : <button className="btn" onClick={start}><Icon name="record" size={16} /> Start recording</button>}
      </PageHead>
      {busy && <div className="livebar processing"><span className="dot" />{busy}</div>}
      <div className="notes">
        <div className="note-list">
          {notes.length === 0 && <div className="empty">No notes yet.</div>}
          {notes.map((n) => (
            <button key={n.id} className={"note-item" + (open === n.id ? " active" : "")} onClick={() => setOpen(n.id)}>
              <b>{n.title}</b><span className="muted small">{new Date(n.ts).toLocaleString()} · {mm(n.secs)}</span>
            </button>
          ))}
        </div>
        {note && (
          <div className="card note-view">
            <input className="note-title" value={note.title} onChange={(e) => setNotes(notes.map((x) => (x.id === note.id ? { ...x, title: e.target.value } : x)))} />
            <h3 className="section">AI notes</h3>
            <div className="pre">{note.summary || <span className="muted">No summary yet.</span>}</div>
            <h3 className="section">Transcript</h3>
            <textarea rows={10} value={note.transcript} placeholder="Transcript (you can paste one here)" onChange={(e) => setNotes(notes.map((x) => (x.id === note.id ? { ...x, transcript: e.target.value } : x)))} />
            <div className="modal-actions">
              <button className="btn ghost danger" onClick={() => { setNotes(notes.filter((x) => x.id !== note.id)); setOpen(null); }}><Icon name="trash" size={16} /> Delete</button>
              <button className="btn ghost" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`# ${note.title}\n\n${note.summary}\n\n## Transcript\n${note.transcript}`])); a.download = note.title + ".md"; a.click(); }}>Export</button>
              <button className="btn" disabled={!note.transcript || !!busy} onClick={() => summarize(note.id, note.transcript).catch((e) => { alert(e.message); setBusy(""); })}>Summarize</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Settings ----------------
const LANGS = [["auto", "Auto-detect"], ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["hi", "Hindi"], ["ta", "Tamil"], ["ml", "Malayalam"], ["te", "Telugu"], ["zh", "Chinese"], ["ja", "Japanese"], ["ko", "Korean"], ["pt", "Portuguese"], ["it", "Italian"], ["ar", "Arabic"], ["ru", "Russian"]];
export function Settings({ onClose }) {
  const [s, setS] = useStore("settings");
  const [, setHistory] = useStore("history");
  const [mics, setMics] = useState([]);
  const [tab, setTab] = useState(s.apiKey ? "general" : "account");
  const [test, setTest] = useState("");
  const up = (p) => setS({ ...s, ...p });

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((st) => { st.getTracks().forEach((t) => t.stop()); return navigator.mediaDevices.enumerateDevices(); })
      .then((d) => setMics(d.filter((x) => x.kind === "audioinput"))).catch(() => {});
  }, []);

  async function setAutostart(v) {
    up({ autostart: v });
    if (!IS_TAURI) return;
    const a = await import("@tauri-apps/plugin-autostart");
    v ? a.enable() : a.disable();
  }
  async function testKey() {
    setTest("Testing…");
    try { await chat("Reply with OK.", "ping"); setTest("✓ Key works"); } catch (e) { setTest("✗ " + e.message); }
  }

  const TABS = [["general", "General"], ["account", "API key"], ["shortcuts", "Shortcuts"], ["offline", "Offline mode"], ["updates", "Updates"], ["data", "Data"]];
  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="settings">
        <div className="set-tabs">{TABS.map(([id, l]) => <button key={id} className={"nav" + (tab === id ? " active" : "")} onClick={() => setTab(id)}>{l}</button>)}</div>
        <div className="set-body">
          {tab === "account" && <>
            <label className="field"><span>Your name</span><input value={s.name} placeholder="Vihan" onChange={(e) => up({ name: e.target.value })} /></label>
            <label className="field"><span>About me (helps with names and special words)</span>
              <textarea rows={3} value={s.context} placeholder="Example: I'm Vihan. I do policy debate. Words I use: interp, pre-fiat, kritik, topicality." onChange={(e) => up({ context: e.target.value })} /></label>
            <label className="field"><span>Groq API key</span><input type="password" value={s.apiKey} placeholder="gsk_..." onChange={(e) => up({ apiKey: e.target.value })} /></label>
            <p className="muted small">Get a free key at <b>console.groq.com/keys</b> (sign in → Create API Key → copy). It stays on this PC only.</p>
            <div className="row-split"><button className="btn" onClick={testKey} disabled={!s.apiKey}>Test key</button><span className="small">{test}</span></div>
            <label className="field"><span>Speech model</span>
              <select value={s.sttModel} onChange={(e) => up({ sttModel: e.target.value })}>
                <option value="whisper-large-v3-turbo">Whisper Large v3 Turbo (fast)</option>
                <option value="whisper-large-v3">Whisper Large v3 (most accurate)</option>
              </select></label>
            <label className="field"><span>Cleanup model</span>
              <select value={s.llmModel} onChange={(e) => up({ llmModel: e.target.value })}>
                <option value="openai/gpt-oss-20b">GPT-OSS 20B (fastest)</option>
                <option value="openai/gpt-oss-120b">GPT-OSS 120B (smartest)</option>
              </select></label>
          </>}
          {tab === "general" && <>
            <label className="field"><span>Microphone</span>
              <select value={s.micId} onChange={(e) => up({ micId: e.target.value })}>
                <option value="default">System default</option>
                {mics.filter((m) => m.deviceId !== "default").map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || "Microphone"}</option>)}
              </select></label>
            <label className="field"><span>Language</span>
              <select value={s.language} onChange={(e) => up({ language: e.target.value })}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="toggle-row"><span>Smart formatting<small>Remove filler words, fix punctuation, apply style</small></span><Toggle on={s.smartFormat} set={(v) => up({ smartFormat: v })} /></label>
            <label className="toggle-row"><span>Whisper mode<small>Boost quiet speech</small></span><Toggle on={s.whisperMode} set={(v) => up({ whisperMode: v })} /></label>
            <label className="toggle-row"><span>Sound effects<small>Beep on start and stop</small></span><Toggle on={s.sounds} set={(v) => up({ sounds: v })} /></label>
            <label className="toggle-row"><span>Keep text in clipboard<small>Don't restore your old clipboard after pasting</small></span><Toggle on={s.keepInClipboard} set={(v) => up({ keepInClipboard: v })} /></label>
            <label className="toggle-row"><span>Launch at startup<small>Start hidden in the tray when Windows starts</small></span><Toggle on={s.autostart} set={setAutostart} /></label>
            <label className="toggle-row"><span>Live text<small>Show your words in the pop-up while you talk</small></span><Toggle on={s.liveText} set={(v) => up({ liveText: v })} /></label>
            <label className="toggle-row"><span>Mute music while recording<small>Silence your speakers while you hold the key</small></span><Toggle on={s.muteWhileRecording} set={(v) => up({ muteWhileRecording: v })} /></label>
            <label className="toggle-row"><span>Voice commands<small>End with “press enter” to send. Say only “delete that” to undo.</small></span><Toggle on={s.voiceCommands} set={(v) => up({ voiceCommands: v })} /></label>
            <label className="field"><span>Translate what I say into</span>
              <select value={s.translateTo} onChange={(e) => up({ translateTo: e.target.value })}>
                <option value="">Off (keep my language)</option>
                {LANGS.filter(([v]) => v !== "auto").map(([, l]) => <option key={l} value={l}>{l}</option>)}
              </select></label>
          </>}
          {tab === "shortcuts" && <div className="shortcuts">
            <KeyPicker label="Push to talk (hold). Tap = hands-free" action="talk" s={s} up={up} />
            <KeyPicker label="Hands-free (press to start / stop)" action="handsfree" s={s} up={up} />
            <KeyPicker label="Command mode / Ask AI (hold)" action="command" s={s} up={up} />
            <div><span>Cancel</span><span><kbd className="sm">Esc</kbd></span></div>
            <div className="row-split" style={{ border: 0 }}>
              <button className="btn ghost" onClick={() => { up({ hotkeys: { talk: "Ctrl+Space", handsfree: "Ctrl+Shift+Space", command: "Alt+Shift+Space" } }); setTimeout(applyHotkeys, 50); }}>Reset to default</button>
              <button className="btn ghost" onClick={toggleHandsFree}>Test hands-free now</button>
            </div>
            <p className="muted small">Command mode: select text, hold the key and say what to change. With nothing selected, ask any question and the answer gets typed.</p>
          </div>}
          {tab === "offline" && <OfflineTab s={s} up={up} />}
          {tab === "updates" && <UpdatesTab />}
          {tab === "data" && <>
            <p className="muted">All data is stored on this PC. Audio and text go to Groq only to be transcribed.</p>
            <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
              <button className="btn ghost" onClick={() => {
                const dump = {}; for (const k of Object.keys(localStorage)) if (k.startsWith("murmur:")) dump[k] = localStorage.getItem(k);
                const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)])); a.download = "murmur-backup.json"; a.click();
              }}>Export all data</button>
              <button className="btn ghost danger" onClick={() => confirm("Delete all dictation history?") && setHistory([])}>Clear history</button>
            </div>
          </>}
        </div>
      </div>
    </Modal>
  );
}

// Click, then press the new key combo.
function KeyPicker({ label, action, s, up }) {
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!listening) return;
    const onKey = (e) => {
      e.preventDefault();
      if (e.key === "Escape") return setListening(false);
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean);
      if (!mods.length) return setErr("Use at least one of Ctrl, Alt, Shift or Win");
      const key = e.code.replace(/^Key/, "").replace(/^Digit/, "");
      const combo = [...mods, key].join("+");
      setListening(false); setErr("");
      up({ hotkeys: { ...s.hotkeys, [action]: combo } });
      setTimeout(async () => { const bad = await applyHotkeys(); if (bad.includes(combo)) setErr("That key is taken by another app or Windows"); }, 50);
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, [listening, s]);
  return (
    <div>
      <span>{label}{err && <small className="danger" style={{ display: "block" }}>{err}</small>}</span>
      <button className={"keypick" + (listening ? " on" : "")} onClick={() => setListening(true)}>
        {listening ? "Press keys…" : (s.hotkeys[action] || "").split("+").map((k, i) => <span key={i}>{i > 0 && " + "}<kbd className="sm">{k}</kbd></span>)}
      </button>
    </div>
  );
}

function OfflineTab({ s, up }) {
  const [pct, setPct] = useState(null);
  const [msg, setMsg] = useState("");
  async function download() {
    setMsg(""); setPct(0);
    try { await loadOffline(s.offlineModel, setPct); setMsg("✓ Model ready"); } catch (e) { setMsg("✗ " + e.message); }
    setPct(null);
  }
  return <>
    <p className="muted small">Offline mode runs Whisper on your PC. It needs no key and has no limits, and your voice never leaves the PC. It is slower than Groq. Without a key, smart cleanup and translation are off.</p>
    <label className="toggle-row"><span>Use offline speech-to-text</span><Toggle on={s.offline} set={(v) => up({ offline: v })} /></label>
    <label className="field"><span>Model</span>
      <select value={s.offlineModel} onChange={(e) => up({ offlineModel: e.target.value })}>
        {OFFLINE_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></label>
    <div className="row-split">
      <button className="btn" disabled={pct !== null} onClick={download}>{pct !== null ? `Downloading… ${pct}%` : "Download / test model"}</button>
      <span className="small">{msg}</span>
    </div>
  </>;
}

function UpdatesTab() {
  const [msg, setMsg] = useState("");
  const [upd, setUpd] = useState(null);
  async function check() {
    if (!IS_TAURI) return setMsg("Updates work in the installed app only.");
    setMsg("Checking…");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const u = await check();
      if (u) { setUpd(u); setMsg(`Version ${u.version} is available.`); } else setMsg("✓ You have the latest version.");
    } catch (e) { setMsg("Could not check: " + e); }
  }
  async function install() {
    setMsg("Downloading update…");
    try {
      await upd.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) { setMsg("Update failed: " + e); }
  }
  return <>
    <p className="muted">Murmur version 1.1.0</p>
    <div className="row-split">
      <button className="btn" onClick={check}>Check for updates</button>
      {upd && <button className="btn" onClick={install}>Install and restart</button>}
    </div>
    <p className="small">{msg}</p>
  </>;
}

export function Help({ onClose }) {
  return (
    <Modal title="Help" onClose={onClose}>
      <ol className="steps">
        <li>Put your Groq key in <b>Settings → API key</b>.</li>
        <li>Click into any text box in any app.</li>
        <li>Hold <kbd className="sm">Ctrl</kbd>+<kbd className="sm">Space</kbd>, talk, let go. The text gets typed for you.</li>
        <li>Tap <kbd className="sm">Ctrl</kbd>+<kbd className="sm">Space</kbd> quickly to go hands-free. Tap again to finish.</li>
        <li>Select text, hold <kbd className="sm">Alt</kbd>+<kbd className="sm">Shift</kbd>+<kbd className="sm">Space</kbd>, say “make this formal”.</li>
        <li>End with “press enter” to send. Say only “delete that” to undo the last dictation.</li>
        <li>With nothing selected, hold <kbd className="sm">Alt</kbd>+<kbd className="sm">Shift</kbd>+<kbd className="sm">Space</kbd> and ask a question. The answer gets typed.</li>
        <li>Closing the window keeps Murmur running in the tray (bottom-right of the taskbar).</li>
      </ol>
    </Modal>
  );
}
