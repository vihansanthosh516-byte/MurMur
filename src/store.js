import { useEffect, useState, useSyncExternalStore } from "react";

// Tiny shared store backed by localStorage. Every key is its own slice.
const listeners = new Set();
const cache = {};
const pendingWrites = new Map();

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
    muteWhileRecording: false,
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
  diagnostics: [],
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
  if (key === "noteRec") { listeners.forEach((l) => l()); return; }
  const json = JSON.stringify(v);
  try { localStorage.setItem("murmur:" + key, json); } catch (e) { if (key !== "diagnostics") reportError("browser storage", e); }
  // Also write to a file in the app folder, so nothing is lost when the app closes.
  if (window.__TAURI_INTERNALS__) {
    const task = (pendingWrites.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_kv", { key, value: json });
    });
    pendingWrites.set(key, task);
    task.catch((e) => { if (key !== "diagnostics") reportError("file storage", e); });
  }
  listeners.forEach((l) => l());
}

export const flushWrites = () => Promise.all([...pendingWrites.values()]);
export function reportError(stage, error) {
  let message = String(error?.message || error);
  for (const secret of [get("settings").apiKey, get("settings").deepgramKey]) if (secret) message = message.split(secret).join("[redacted]");
  message = message.replace(/(?:gsk_|dg_)[\w-]+/g, "[redacted]").slice(0, 500);
  console.error(stage + ": " + message);
  set("diagnostics", (items) => [{ ts: Date.now(), stage, message }, ...items].slice(0, 100));
}

// Load saved files into browser storage before the app starts.
// Files win; anything only in browser storage gets copied to a file.
export async function hydrate() {
  if (!window.__TAURI_INTERNALS__) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const files = await invoke("load_kv");
    for (const key of Object.keys(DEFAULTS)) {
      if (key === "noteRec") continue;
      if (files[key] != null) localStorage.setItem("murmur:" + key, files[key]);
      else {
        const v = localStorage.getItem("murmur:" + key);
        if (v != null) invoke("save_kv", { key, value: v }).catch(() => {});
      }
    }
    // A recording cannot survive an application restart.
    localStorage.setItem("murmur:noteRec", "false");
  } catch (e) { reportError("load saved data", e); }
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
let database;
const unsavedAudio = new Map();
function db() {
  if (database) return database;
  database = new Promise((res, rej) => {
    const r = indexedDB.open("murmur", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("audio");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  database.catch(() => { database = null; });
  return database;
}
async function audioWrite(action) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const transaction = d.transaction("audio", "readwrite");
    transaction.oncomplete = resolve;
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error("Could not save audio"));
    action(transaction.objectStore("audio"));
  });
}
export async function saveAudio(id, blob) {
  unsavedAudio.set(id, blob);
  await audioWrite((store) => store.put(blob, id));
  unsavedAudio.delete(id);
}
export async function loadAudio(id) {
  if (unsavedAudio.has(id)) return unsavedAudio.get(id);
  const d = await db();
  return new Promise((res) => {
    const r = d.transaction("audio").objectStore("audio").get(id);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => res(null);
  });
}
export async function deleteAudio(id) { await audioWrite((store) => store.delete(id)); unsavedAudio.delete(id); }
export async function clearHistory() {
  const ids = get("history").map((h) => h.id);
  await audioWrite((store) => ids.forEach((id) => store.delete(id)));
  ids.forEach((id) => unsavedAudio.delete(id));
  set("history", []);
}

export async function createBackup() {
  const data = Object.fromEntries(Object.keys(DEFAULTS).filter((k) => k !== "noteRec").map((k) => [k, structuredClone(get(k))]));
  data.settings.apiKey = "";
  data.settings.deepgramKey = "";
  const d = await db();
  const entries = await new Promise((resolve, reject) => {
    const result = [];
    const cursor = d.transaction("audio").objectStore("audio").openCursor();
    cursor.onerror = () => reject(cursor.error);
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return resolve(result);
      result.push([item.key, item.value]); item.continue();
    };
  });
  const audio = [];
  for (const [id, blob] of entries) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    audio.push({ id, type: blob.type, base64: btoa(binary) });
  }
  for (const [id, blob] of unsavedAudio) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    const existing = audio.findIndex((clip) => clip.id === id);
    if (existing >= 0) audio.splice(existing, 1);
    audio.push({ id, type: blob.type, base64: btoa(binary) });
  }
  return { format: "murmur-backup", version: 1, exportedAt: new Date().toISOString(), data, audio };
}

export async function restoreBackup(backup) {
  if (backup?.format !== "murmur-backup" || backup.version !== 1 || !backup.data || !Array.isArray(backup.audio)) throw new Error("Not a supported Murmur backup");
  for (const [key, value] of Object.entries(backup.data)) {
    if (!(key in DEFAULTS) || key === "noteRec") continue;
    if (Array.isArray(DEFAULTS[key]) ? !Array.isArray(value) : typeof value !== typeof DEFAULTS[key] || value === null) throw new Error("Invalid backup field: " + key);
  }
  // Decode before changing storage, so a corrupt clip cannot partially restore text.
  const clips = backup.audio.map((clip) => {
    if (typeof clip.id !== "string" || typeof clip.base64 !== "string") throw new Error("Invalid audio backup");
    return [clip.id, new Blob([Uint8Array.from(atob(clip.base64), (c) => c.charCodeAt(0))], { type: clip.type || "audio/webm" })];
  });
  await audioWrite((store) => clips.forEach(([id, blob]) => store.put(blob, id)));
  const secrets = { apiKey: get("settings").apiKey, deepgramKey: get("settings").deepgramKey };
  for (const [key, value] of Object.entries(backup.data)) {
    if (key in DEFAULTS && key !== "noteRec") set(key, key === "settings" ? { ...DEFAULTS.settings, ...value, ...secrets } : value);
  }
  await flushWrites();
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
