import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "../src/requests.js";

test("transient provider failure retries once and returns consumed body", async () => {
  let calls = 0;
  const response = await request(async () => ++calls === 1 ? new Response("busy", { status: 503 }) : new Response('{"text":"ok"}'), "https://example.test", {}, { timeout: 3000 });
  assert.equal(calls, 2); assert.deepEqual(await response.json(), { text: "ok" });
});
test("authentication errors are not retried", async () => {
  let calls = 0;
  const response = await request(async () => { calls++; return new Response("bad key", { status: 401 }); }, "https://example.test", {});
  assert.equal(calls, 1); assert.equal(response.status, 401);
});
test("timeout aborts a stuck request with recoverable error", async () => {
  await assert.rejects(request((_, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))), "https://example.test", {}, { timeout: 10 }), { name: "TimeoutError" });
});
test("cancellation stops a queued provider retry", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = request(async () => { calls++; return new Response("rate limit", { status: 429 }); }, "https://example.test", {}, { signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, { name: "AbortError" }); assert.equal(calls, 1);
});
