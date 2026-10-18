import { useEffect, useState, useSyncExternalStore } from "react";

// Tiny shared store backed by localStorage. Every key is its own slice.
const listeners = new Set();
const cache = {};

export const DEFAULTS = {
  settings: {
    apiKey: "",
    deepgramKey: "",
    name: "",
    language: "auto",
    micId: "default",
    sounds: true,
    smartFormat: true,
    keepInClipboard: false,
    autostart: false,
    sttModel: "whisper-large-v3-turbo",
    llmModel: "openai/gpt-oss-20b",
    whisperMode: false,
    context: "",
    learn: true,
    hotkeys: { talk: "Ctrl+Space", handsfree: "Ctrl+Shift+Space", command: "Alt+Shift+Space" },
    liveText: true,
    muteWhileRecording: true,
    voiceCommands: true,
    translateTo: "",
    offline: false,
    offlineModel: "onnx-community/whisper-base",
  },
  history: [], // {id, ts, text, raw, words, secs, app, flagged, mode}
  dictionary: [], // {id, word, replace}
  snippets: [], // {id, trigger, text}
  style: { personal: "casual", work: "formal", email: "formal", other: "casual" },
  transforms: [
    { id: "t1", name: "Make it shorter", prompt: "Rewrite the text to be about half as long. Keep the meaning." },
    { id: "t2", name: "Fix grammar", prompt: "Fix spelling, grammar and punctuation. Change nothing else." },
    { id: "t3", name: "Make it professional", prompt: "Rewrite the text in a clear, professional tone." },
    { id: "t4", name: "Bullet points", prompt: "Turn the text into a short bulleted list." },
  ],
  scratchpad: "",
  notes: [], // {id, ts, title, transcript, summary, secs}
  noteRec: false,
  appRules: [], // {id, match, style} e.g. match "discord" -> "very casual"
  ui: { bannerClosed: false, sidebarCollapsed: false, checklist: {} },
};

export function get(key) {
  if (!(key in cache)) {
    let v;
    try { v = JSON.parse(localStorage.getItem("murmur:" + key)); } catch { v = null; }
    const d = DEFAULTS[key];
    cache[key] = v == null ? d : d && typeof d === "object" && !Array.isArray(d) ? { ...d, ...v } : v;
    // v3: use the fast speech model (names are handled by the vocabulary hint).
    if (key === "settings" && !(cache.settings.v >= 3)) {
      cache.settings = { ...cache.settings, sttModel: "whisper-large-v3-turbo", v: 3 };
      setTimeout(() => set("settings", cache.settings));
    }
  }
  return cache[key];
}

export function set(key, value) {
  const v = typeof value === "function" ? value(get(key)) : value;
  cache[key] = v;
  const json = JSON.stringify(v);
  try { localStorage.setItem("murmur:" + key, json); } catch {}
  // Also write to a file in the app folder, so nothing is lost when the app closes.
  if (window.__TAURI_INTERNALS__) import("@tauri-apps/api/core").then(({ invoke }) => invoke("save_kv", { key, value: json }).catch(() => {}));
  listeners.forEach((l) => l());
}

// Load saved files into browser storage before the app starts.
// Files win; anything only in browser storage gets copied to a file.
export async function hydrate() {
  if (!window.__TAURI_INTERNALS__) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const files = await invoke("load_kv");
    for (const key of Object.keys(DEFAULTS)) {
      if (files[key] != null) localStorage.setItem("murmur:" + key, files[key]);
      else {
        const v = localStorage.getItem("murmur:" + key);
        if (v != null) invoke("save_kv", { key, value: v }).catch(() => {});
      }
    }
  } catch {}
}

// Keep windows (main + overlay) in sync.
window.addEventListener("storage", (e) => {
  if (e.key?.startsWith("murmur:")) {
    delete cache[e.key.slice(7)];
    listeners.forEach((l) => l());
  }
});

export function useStore(key) {
  const v = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => get(key)
  );
  return [v, (nv) => set(key, nv)];
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const wordCount = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

// ---- Audio clips live in IndexedDB (too big for localStorage) ----
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("murmur", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("audio");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveAudio(id, blob) {
  const d = await db();
  d.transaction("audio", "readwrite").objectStore("audio").put(blob, id);
}
export async function loadAudio(id) {
  const d = await db();
  return new Promise((res) => {
    const r = d.transaction("audio").objectStore("audio").get(id);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => res(null);
  });
}
export async function deleteAudio(id) {
  const d = await db();
  d.transaction("audio", "readwrite").objectStore("audio").delete(id);
}

// ---- Stats ----
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function stats(history) {
  const words = history.reduce((a, h) => a + h.words, 0);
  const secs = history.reduce((a, h) => a + (h.secs || 0), 0);
  const wpm = secs > 0 ? Math.round(words / (secs / 60)) : 0;
  const days = new Set(history.map((h) => dayKey(h.ts)));
  let streak = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  return { words, wpm, streak };
}

export function useNow(ms = 60000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
