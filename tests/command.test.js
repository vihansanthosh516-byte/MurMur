import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser, until, streams, tick } from "./browser.js";
setupBrowser();
const calls = [];
window.__TAURI_INTERNALS__ = { invoke: async (command) => { calls.push(command); if (command === "active_window") return { title: "Editor", id: "123" }; if (command === "copy_selection") throw new Error("Focus changed"); } };
const { get, set, DEFAULTS, flushWrites, loadAudio } = await import("../src/store.js");
const { onHotkey, live, cancel } = await import("../src/engine.js");

test("native command capture does not synthesize key releases while the hotkey is held", async () => {
  set("settings", { ...DEFAULTS.settings, v: 3, apiKey: "test-key", sounds: false, liveText: false, muteWhileRecording: false });
  onHotkey("command", "down");
  await until(() => live.state === "recording");
  assert.ok(calls.includes("active_window"));
  assert.ok(!calls.includes("copy_selection"));
  assert.equal(get("history").length, 0);
  await cancel(); await flushWrites();
  assert.ok(streams.every((s) => s.track.stopped));
});

test("selection capture failure preserves command audio for recovery", async () => {
  onHotkey("command", "down"); await until(() => live.state === "recording"); await tick(310);
  onHotkey("command", "up"); await until(() => live.state === "error");
  const [item] = get("history");
  assert.equal(item.error, "Focus changed"); assert.equal(item.sourceText, null);
  assert.ok((await loadAudio(item.id)).size);
  await cancel(); await flushWrites();
});
