const pause = (ms, signal) => new Promise((resolve, reject) => {
  signal?.throwIfAborted();
  const done = () => { signal?.removeEventListener("abort", aborted); resolve(); };
  const timer = setTimeout(done, ms);
  const aborted = () => { clearTimeout(timer); reject(signal.reason); };
  signal?.addEventListener("abort", aborted, { once: true });
});

export async function request(fetcher, url, options, { signal, timeout = 90000, retries = 1 } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal?.throwIfAborted();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out. Your recording is saved; retry from history.", "TimeoutError")), timeout);
  try {
    for (let attempt = 0; ; attempt++) {
      controller.signal.throwIfAborted();
      const response = await fetcher(url, { ...options, signal: controller.signal });
      if (attempt >= retries || (response.status !== 429 && response.status < 500)) {
        // Keep timeout/cancellation active until the response body is consumed.
        const body = await response.text();
        return { ok: response.ok, status: response.status, text: async () => body, json: async () => JSON.parse(body) };
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      await response.body?.cancel();
      await pause(Math.min(5000, Math.max(1000, Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000)), controller.signal);
    }
  } catch (e) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
