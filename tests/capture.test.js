import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser, streams, recorders, stream, tick } from "./browser.js";
import { createCapture, startPreview, openMic } from "../src/capture.js";
beforeEach(() => { setupBrowser(); streams.length = 0; recorders.length = 0; });

test("cancelled mic acquisition closes its late stream without starting a recorder", async () => {
  let resolve;
  navigator.mediaDevices.getUserMedia = () => new Promise((r) => { resolve = r; });
  const abort = new AbortController();
  const pending = createCapture({ signal: abort.signal });
  abort.abort();
  const mic = stream(); resolve(mic);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(mic.track.stopped, true);
  assert.equal(recorders.length, 0);
});

test("recorder construction failure releases mic and destination tracks", async () => {
  const ctor = MediaRecorder;
  globalThis.MediaRecorder = class extends ctor { constructor() { throw new Error("codec failed"); } };
  await assert.rejects(createCapture(), /codec failed/);
  assert.ok(streams.every((s) => s.track.stopped));
});

test("missing shared system audio releases display stream and does not open mic", async () => {
  const display = stream(); display.getAudioTracks = () => [];
  navigator.mediaDevices.getDisplayMedia = async () => display;
  await assert.rejects(createCapture({ systemAudio: true }), /System audio was not shared/);
  assert.equal(display.track.stopped, true);
  assert.equal(streams.length, 1);
});

test("stop is idempotent and resolves only after final audio and track release", async () => {
  const recording = await createCapture();
  const a = recording.stop(), b = recording.stop();
  assert.equal(a, b);
  assert.equal((await a).size, 1);
  assert.ok(streams.every((s) => s.track.stopped));
});

test("mic fallback recovers a busy chosen device without hiding permission denial", async () => {
  let attempts = 0;
  navigator.mediaDevices.getUserMedia = async () => { if (++attempts === 1) throw new DOMException("busy", "NotReadableError"); return stream(); };
  await openMic("old-device");
  assert.equal(attempts, 2);
  navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("blocked", "NotAllowedError"); };
  await assert.rejects(openMic("old-device"), { name: "NotAllowedError" });
});

test("previews upload independent clips and abort pending preview on stop", async () => {
  const uploads = [];
  const controls = [];
  const stop = startPreview(stream(), async (blob, control) => { uploads.push(await blob.text()); controls.push(control); return "word"; }, () => {}, assert.fail, 10);
  await tick(55); stop();
  assert.ok(uploads.length >= 2);
  assert.equal(new Set(uploads).size, uploads.length);
  assert.ok(uploads.every((clip) => /^\d+$/.test(clip)));
  assert.ok(controls.every((c) => c.signal.aborted));
  const count = uploads.length; await tick(25);
  assert.equal(uploads.length, count);
});
