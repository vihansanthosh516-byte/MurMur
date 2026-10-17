// Offline speech-to-text: Whisper running inside the app (no key, no limits).
// The model downloads once from Hugging Face, then is cached on this PC.
let pipe = null;
let pipeModel = "";

export const OFFLINE_MODELS = [
  ["onnx-community/whisper-tiny.en", "Tiny (English, fastest, ~40 MB)"],
  ["onnx-community/whisper-base", "Base (all languages, ~80 MB)"],
  ["onnx-community/whisper-small", "Small (most accurate, slow, ~250 MB)"],
];

export async function loadOffline(model, onProgress) {
  if (pipe && pipeModel === model) return pipe;
  const { pipeline } = await import("@huggingface/transformers");
  const opts = { progress_callback: (p) => p.status === "progress" && onProgress?.(Math.round(p.progress || 0)) };
  try {
    pipe = await pipeline("automatic-speech-recognition", model, { ...opts, device: "webgpu", dtype: "fp32" });
  } catch {
    pipe = await pipeline("automatic-speech-recognition", model, { ...opts, dtype: "q8" });
  }
  pipeModel = model;
  return pipe;
}

// Whisper wants 16 kHz mono samples.
async function toPcm(blob) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buf.getChannelData(0);
  } finally {
    ctx.close();
  }
}

export async function transcribeOffline(blob, model, language) {
  const asr = await loadOffline(model);
  const opts = { chunk_length_s: 30, stride_length_s: 5 };
  if (!model.endsWith(".en") && language && language !== "auto") opts.language = language;
  const out = await asr(await toPcm(blob), opts);
  return (out.text || "").trim();
}
