import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser } from "./browser.js";
setupBrowser();
const { DEFAULTS, get, set, saveAudio, loadAudio, createBackup, restoreBackup, clearHistory, reportError } = await import("../src/store.js");

test("backup round trip includes committed audio, keeps local keys and clears only dictation audio", async () => {
  set("settings", { ...DEFAULTS.settings, v: 3, apiKey: "SECRET-GROQ", deepgramKey: "SECRET-DEEPGRAM" });
  set("history", [{ id: "dictation", text: "hello", words: 1 }]);
  set("notes", [{ id: "meeting", transcript: "meeting words" }]);
  await saveAudio("dictation", new Blob(["voice bytes"], { type: "audio/webm" }));
  await saveAudio("meeting", new Blob(["meeting bytes"], { type: "audio/webm" }));
  const backup = JSON.parse(JSON.stringify(await createBackup()));
  assert.equal(backup.format, "murmur-backup"); assert.equal(backup.version, 1);
  assert.equal(backup.data.history[0].text, "hello"); assert.equal(backup.audio.length, 2);
  assert.ok(backup.exportedAt && !Number.isNaN(Date.parse(backup.exportedAt)));
  assert.ok(!JSON.stringify(backup).includes("SECRET-"));
  set("settings", { ...get("settings"), apiKey: "CURRENT-KEY" });
  await clearHistory();
  assert.equal(await loadAudio("dictation"), null); assert.ok(await loadAudio("meeting"));
  await restoreBackup(backup);
  assert.equal(get("history")[0].text, "hello");
  assert.equal(await (await loadAudio("dictation")).text(), "voice bytes");
  assert.equal(get("settings").apiKey, "CURRENT-KEY");
  assert.equal(get("settings").deepgramKey, "SECRET-DEEPGRAM");
  await assert.rejects(restoreBackup({ ...backup, audio: [{ id: "bad", base64: "!invalid!" }] }));
  assert.equal(get("history")[0].text, "hello");
});

test("diagnostics redact configured secrets", () => {
  set("settings", { ...get("settings"), apiKey: "PRIVATE-KEY" });
  reportError("test", new Error("failed PRIVATE-KEY"));
  assert.equal(get("diagnostics")[0].message, "failed [redacted]");
});
