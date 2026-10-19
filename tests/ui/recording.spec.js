import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("murmur:settings", JSON.stringify({ v: 3, deepgramKey: "TEST-DEEPGRAM-KEY", apiKey: "", sounds: false, liveText: false }));
    window.testTracks = [];
    const stream = () => {
      const track = { stopped: false, stop() { this.stopped = true; } };
      window.testTracks.push(track);
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    };
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => stream(), enumerateDevices: async () => [] } });
    window.MediaRecorder = class {
      static isTypeSupported = () => true;
      constructor(_, options) { this.state = "inactive"; this.mimeType = options.mimeType; }
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(["meeting audio bytes"]) }); this.onstop?.(); }); }
    };
    const node = () => ({ gain: {}, threshold: {}, ratio: {}, connect(n) { return n; } });
    window.AudioContext = class {
      state = "running";
      createGain = node;
      createDynamicsCompressor = node;
      createMediaStreamSource = node;
      createMediaStreamDestination = () => ({ ...node(), stream: stream() });
      createAnalyser = () => ({ ...node(), getByteTimeDomainData(buf) { buf.fill(144); } });
      async close() { this.state = "closed"; }
    };
  });
  await page.route("https://api.deepgram.com/**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: "Meeting transcript preserved." }] }] } }) }));
});

test("meeting survives navigation; exported backup contains its audio and no API keys", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Notetaker", exact: true }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Stop ·/ })).toBeVisible();
  await page.getByRole("button", { name: "Dictionary", exact: true }).click();
  expect(await page.evaluate(() => window.testTracks.every((t) => !t.stopped))).toBe(true);
  await page.getByRole("button", { name: "Notetaker · Recording", exact: true }).click();
  await page.getByRole("button", { name: /^Stop ·/ }).click();
  await expect(page.getByPlaceholder("Transcript (you can paste one here)")).toHaveValue("Meeting transcript preserved.");
  await expect(page.getByRole("button", { name: "Summarize", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.testTracks.every((t) => t.stopped))).toBe(true);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Data", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup with audio", exact: true }).click();
  const download = await downloading;
  const backupText = await readFile(await download.path(), "utf8");
  const backup = JSON.parse(backupText);
  expect(backup.format).toBe("murmur-backup");
  expect(backup.data.notes[0].transcript).toBe("Meeting transcript preserved.");
  expect(backup.audio).toHaveLength(1);
  expect(Buffer.from(backup.audio[0].base64, "base64").toString()).toBe("meeting audio bytes");
  expect(backupText).not.toContain("TEST-DEEPGRAM-KEY");
  expect(errors).toEqual([]);
});

test("unconfirmed legacy replacement requires explicit approval", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("murmur:dictionary", JSON.stringify([{ id: "old", word: "really", replace: "want" }])));
  await page.goto("/");
  await page.getByRole("button", { name: "Dictionary", exact: true }).click();
  await page.getByRole("button", { name: "Confirm replacement", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("murmur:dictionary"))[0].confirmed)).toBe(true);
});
