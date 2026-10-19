// Own every track and recorder, including resources acquired after cancellation.
export async function openMic(micId = "default") {
  const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const open = (id) => navigator.mediaDevices.getUserMedia({ audio: { ...base, ...(id && id !== "default" ? { deviceId: { exact: id } } : {}) } });
  const recoverable = (e) => ["NotFoundError", "OverconstrainedError", "NotReadableError"].includes(e.name);
  if (micId !== "default") {
    try { return await open(micId); } catch (e) { if (!recoverable(e)) throw e; }
  }
  try { return await open(); } catch (e) {
    if (!recoverable(e)) throw e;
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const d of devices.filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== micId)) {
      try { return await open(d.deviceId); } catch (next) { if (!recoverable(next)) throw next; }
    }
    throw e;
  }
}

export function recorderOptions(audioBitsPerSecond = 64000) {
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  return { audioBitsPerSecond, ...(mimeType ? { mimeType } : {}) };
}

export async function createCapture({ micId, whisperMode, systemAudio, signal, onLevel, onError, audioBitsPerSecond } = {}) {
  const streams = [];
  let ctx, recorder, timer, stopPromise;
  let released = false;
  const chunks = [];
  const release = () => {
    if (released) return;
    released = true;
    clearInterval(timer);
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
  };
  const check = () => signal?.throwIfAborted();
  try {
    check();
    // Display capture must be requested while the click still has user activation.
    if (systemAudio) {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streams.push(display);
      check();
      if (!display.getAudioTracks().length) throw new Error("System audio was not shared. Select a source with audio and enable Share audio.");
    }
    const mic = await openMic(micId);
    streams.push(mic);
    check();
    ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    check();
    const gain = ctx.createGain();
    gain.gain.value = whisperMode ? 3.5 : 1;
    ctx.createMediaStreamSource(mic).connect(gain);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 20;
    gain.connect(limiter);
    const dest = ctx.createMediaStreamDestination();
    streams.push(dest.stream);
    limiter.connect(dest);
    for (const stream of streams.slice(0, systemAudio ? 1 : 0)) ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(dest);
    recorder = new MediaRecorder(dest.stream, recorderOptions(audioBitsPerSecond));
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = (e) => onError?.(e.error || new Error("Audio recorder failed"));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    limiter.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    if (onLevel) timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    }, 50);
    recorder.start(250);
    const startedAt = Date.now();
    const stop = () => {
      if (stopPromise) return stopPromise;
      stopPromise = new Promise((resolve, reject) => {
        const complete = () => { release(); resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" })); };
        recorder.onstop = complete;
        recorder.onerror = (e) => { release(); reject(e.error || new Error("Audio recorder failed")); };
        try { if (recorder.state === "inactive") complete(); else recorder.stop(); }
        catch (e) { release(); reject(e); }
      });
      return stopPromise;
    };
    return { stream: dest.stream, startedAt, stop };
  } catch (e) {
    if (recorder?.state === "recording") recorder.stop();
    release();
    throw e;
  }
}

// Each preview is an independent, decodable clip. No prefix is uploaded twice.
export function startPreview(stream, transcribe, onText, onError, interval = 8000) {
  const abort = new AbortController();
  let recorder, timer, closed = false, busy = false, partial = "";
  const next = () => {
    if (closed) return;
    const chunks = [];
    recorder = new MediaRecorder(stream, recorderOptions());
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = (e) => { stop(); onError?.(e.error || new Error("Preview recording failed")); };
    recorder.onstop = async () => {
      if (closed) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      try { next(); } catch (e) { stop(); onError?.(e); return; }
      if (busy || !blob.size) return;
      busy = true;
      try {
        const text = await transcribe(blob, { signal: abort.signal });
        if (!closed && text) { partial = (partial + " " + text).trim().slice(-500); onText(partial); }
      } catch (e) { if (!closed && e.name !== "AbortError") onError?.(e); }
      finally { busy = false; }
    };
    recorder.start();
    timer = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, interval);
  };
  const stop = () => {
    closed = true;
    clearTimeout(timer);
    abort.abort();
    if (recorder?.state === "recording") recorder.stop();
  };
  try { next(); } catch (e) { stop(); onError?.(e); }
  return stop;
}
