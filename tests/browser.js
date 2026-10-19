import "fake-indexeddb/auto";

export const streams = [];
export const recorders = [];
export function stream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  const result = { getTracks: () => [track], getAudioTracks: () => [track], track };
  streams.push(result);
  return result;
}
export function setupBrowser() {
  const storage = new Map();
  globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
  globalThis.window = { addEventListener() {} };
  globalThis.addEventListener = () => {};
  globalThis.document = { title: "Editor", activeElement: { tagName: "TEXTAREA", selectionStart: 0, selectionEnd: 0, value: "", setRangeText(t) { this.value += t; }, dispatchEvent() {} } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream(), enumerateDevices: async () => [] }, clipboard: { writeText: async () => {} } } });
  globalThis.MediaStream = class { constructor(tracks) { this.getTracks = this.getAudioTracks = () => tracks; } };
  globalThis.MediaRecorder = class {
    static isTypeSupported = (type) => type.includes("webm");
    constructor(stream, options = {}) { this.stream = stream; this.mimeType = options.mimeType; this.state = "inactive"; this.number = recorders.length; recorders.push(this); }
    start() { this.state = "recording"; }
    stop() { if (this.state === "inactive") throw new Error("Already stopped"); this.state = "inactive"; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([String(this.number)]) }); this.onstop?.(); }); }
  };
  const node = () => ({ gain: { value: 1 }, threshold: { value: 0 }, ratio: { value: 0 }, connect(next) { return next; } });
  globalThis.AudioContext = class {
    state = "running";
    createGain = node;
    createDynamicsCompressor = node;
    createMediaStreamSource = node;
    createMediaStreamDestination = () => ({ ...node(), stream: stream() });
    createAnalyser = () => ({ ...node(), fftSize: 512, getByteTimeDomainData(buf) { buf.fill(144); } });
    async resume() { this.state = "running"; }
    async close() { this.state = "closed"; }
  };
}
export const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
export async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(10); }
  throw new Error("Condition did not complete");
}
