import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser, streams, recorders, stream, tick, until } from "./browser.js";
setupBrowser();
const { get, set, DEFAULTS, loadAudio } = await import("../src/store.js");
const { onHotkey, live, cancel, cleanup, applySnippets, learnedWords } = await import("../src/engine.js");
beforeEach(() => {
  streams.length = recorders.length = 0;
  navigator.mediaDevices.getUserMedia = async () => stream();
  document.activeElement.value = "";
  set("settings", { ...DEFAULTS.settings, v: 3, apiKey: "test-key", sounds: false, liveText: false, muteWhileRecording: false });
  for (const key of ["history", "dictionary", "snippets", "diagnostics"]) set(key, []);
});
afterEach(async () => { await cancel(); });

test("hold released during mic startup never creates an orphan recorder", async () => {
  let resolve;
  navigator.mediaDevices.getUserMedia = () => new Promise((r) => { resolve = r; });
  onHotkey("talk", "down"); await until(() => resolve);
  await tick(310); onHotkey("talk", "up");
  await until(() => live.state === "idle");
  const mic = stream(); resolve(mic); await tick(20);
  assert.equal(live.state, "idle"); assert.equal(mic.track.stopped, true); assert.equal(recorders.length, 0);
});

test("tap during slow startup retains hands-free mode", async () => {
  let resolve;
  navigator.mediaDevices.getUserMedia = () => new Promise((r) => { resolve = r; });
  onHotkey("talk", "down"); await until(() => resolve); onHotkey("talk", "up");
  resolve(stream()); await until(() => live.state === "recording");
  assert.equal(live.mode, "handsfree");
});

test("cleanup outage preserves audio, raw transcript and pasted words", async () => {
  globalThis.fetch = async (url) => url.includes("transcriptions") ? new Response(JSON.stringify({ text: "This is my original sentence." })) : new Response("cleanup unavailable", { status: 400 });
  onHotkey("handsfree", "down"); await until(() => live.state === "recording"); await tick(300);
  onHotkey("handsfree", "down"); await until(() => live.state === "idle");
  const [item] = get("history");
  assert.equal(item.raw, "This is my original sentence."); assert.equal(item.text, item.raw);
  assert.ok(item.warning.includes("Cleanup failed")); assert.equal(item.status, "done");
  assert.equal(document.activeElement.value.trim(), item.raw); assert.ok((await loadAudio(item.id)).size);
});

test("failed speech request still leaves recoverable audio and persistent error", async () => {
  globalThis.fetch = async () => new Response("bad key", { status: 401 });
  onHotkey("handsfree", "down"); await until(() => live.state === "recording"); await tick(300);
  onHotkey("handsfree", "down"); await until(() => live.state === "error");
  const [item] = get("history"); assert.equal(item.status, "error"); assert.ok((await loadAudio(item.id)).size);
  assert.ok(live.error.includes("401")); assert.equal(document.activeElement.value, "");
});

test("cancelling processing prevents late output", async () => {
  let resolve;
  globalThis.fetch = () => new Promise((r) => { resolve = r; });
  onHotkey("handsfree", "down"); await until(() => live.state === "recording"); await tick(300);
  onHotkey("handsfree", "down"); await until(() => resolve);
  await cancel(); resolve(new Response(JSON.stringify({ text: "Do not paste me" }))); await tick(30);
  assert.equal(document.activeElement.value, ""); assert.equal(get("history")[0].status, "cancelled");
});

test("legitimate thank-you is no longer rejected as hallucination", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ text: "Thank you." }));
  onHotkey("handsfree", "down"); await until(() => live.state === "recording"); await tick(300);
  onHotkey("handsfree", "down"); await until(() => live.state === "idle");
  assert.equal(get("history")[0].text, "Thank you.");
});

test("only confirmed substitutions run; snippets preserve literal dollar text and Unicode", async () => {
  set("settings", { ...get("settings"), apiKey: "" });
  set("dictionary", [{ word: "wrong", replace: "right" }, { word: "$&special", replace: "name", confirmed: true }]);
  assert.equal(await cleanup("right name", ""), "right $&special");
  set("snippets", [{ trigger: "வணக்கம்", text: "$&hello" }]);
  assert.equal(applySnippets("Say வணக்கம் now"), "Say $&hello now");
});

test("AI outputs cannot teach themselves new vocabulary", () => {
  set("history", [{ text: "Inventedname Inventedname", words: 2 }, { text: "Correctname Correctname", words: 2, corrected: true }]);
  assert.deepEqual(learnedWords(), ["Correctname"]);
});
