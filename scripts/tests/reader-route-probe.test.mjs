import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { probeRoute } from "../../apps/reader/scripts/verify-served.mjs";

const body = Buffer.from('{"code":"method_not_allowed"}');
const expected = {
  bytes: body.length,
  sha256: createHash("sha256").update(body).digest("hex"),
  headers: { "cache-control": "no-store" },
};
const good = () => new Response(body, { status: 405, headers: { "cache-control": "no-store" } });
const stale = () => new Response("not yet", { status: 404 });
const left = () => 60000;

test("a route probe retries a transient wrong answer from a fresh deployment", async () => {
  const waits = [];
  let calls = 0;
  const transport = async () => (++calls < 3 ? stale() : good());
  const result = await probeRoute(transport, "https://x.test/api/capture", 405, expected, left, {
    wait: async (ms) => waits.push(ms),
  });
  assert.equal(result.status, 405);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [3000, 3000]);
});

test("a route probe still refuses after its bounded attempts", async () => {
  let calls = 0;
  const transport = async () => (calls++, stale());
  await assert.rejects(
    probeRoute(transport, "https://x.test/api/capture", 405, expected, left, {
      wait: async () => {},
    }),
  );
  assert.equal(calls, 3);
});

test("a route probe does not wait past the publication deadline", async () => {
  let calls = 0;
  const transport = async () => (calls++, stale());
  await assert.rejects(
    probeRoute(transport, "https://x.test/api/capture", 405, expected, () => 2000, {
      wait: async () => assert.fail("waited past deadline"),
    }),
  );
  assert.equal(calls, 1);
});
