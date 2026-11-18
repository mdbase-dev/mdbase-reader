import assert from "node:assert/strict";
import test from "node:test";
import { gh, transientGhFailure } from "../extension-store-policy.mjs";

const failure = (stderr, extra = {}) =>
  Object.assign(new Error("Command failed: gh api"), {
    status: 1,
    stderr: Buffer.from(stderr),
    ...extra,
  });

function harness(...outcomes) {
  const calls = [];
  const sleeps = [];
  const exec = (command, args) => {
    calls.push(args);
    const outcome = outcomes[Math.min(calls.length, outcomes.length) - 1];
    if (outcome instanceof Error) throw outcome;
    return Buffer.from(outcome);
  };
  return { calls, sleeps, deps: { exec, sleep: (ms) => sleeps.push(ms), delays: [0, 0] } };
}

test("a transient 503 on a read is retried and the later success is returned", () => {
  const { calls, sleeps, deps } = harness(
    failure("gh: Service Unavailable (HTTP 503)"),
    '{"ok":true}',
  );
  assert.deepEqual(gh("repos/mdbase-dev/mdbase-reader/actions/artifacts/1", {}, deps), {
    ok: true,
  });
  assert.equal(calls.length, 2);
  assert.equal(sleeps.length, 1);
});

test("429 and status-less network failures on reads are retried", () => {
  for (const stderr of [
    "gh: API rate limit exceeded (HTTP 429)",
    'Get "https://api.github.com/x": net/http: TLS handshake timeout',
    "read tcp 10.0.0.1:1->10.0.0.2:443: read: connection reset by peer",
  ]) {
    const { calls, deps } = harness(failure(stderr), "{}");
    assert.deepEqual(gh("repos/x/y", { method: "GET" }, deps), {});
    assert.equal(calls.length, 2, stderr);
  }
  assert.equal(transientGhFailure(Object.assign(new Error("spawn"), { code: "ETIMEDOUT" })), true);
});

test("4xx read failures are not retried and keep the evidence reason", () => {
  for (const status of [401, 403, 404, 422]) {
    const { calls, sleeps, deps } = harness(failure(`gh: Failed (HTTP ${status})`), "{}");
    assert.throws(
      () => gh("repos/x/y", {}, deps),
      (error) => error.reason === "release-evidence-unavailable",
    );
    assert.equal(calls.length, 1, String(status));
    assert.equal(sleeps.length, 0);
  }
});

test("unclassified failures and a missing gh binary are not retried", () => {
  for (const error of [
    failure(""),
    Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }),
  ]) {
    const { calls, deps } = harness(error, "{}");
    assert.throws(() => gh("repos/x/y", {}, deps));
    assert.equal(calls.length, 1);
  }
});

test("writes are never retried, even on 5xx, and get no evidence reason", () => {
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    const { calls, sleeps, deps } = harness(failure("gh: Bad Gateway (HTTP 502)"), "{}");
    assert.throws(
      () => gh("repos/x/y/git/refs", { method, body: {} }, deps),
      (error) => error.reason === undefined,
    );
    assert.equal(calls.length, 1, method);
    assert.equal(sleeps.length, 0);
  }
});

test("persistent 5xx ends as release-evidence-unavailable after bounded attempts", () => {
  const { calls, sleeps, deps } = harness(failure("gh: Service Unavailable (HTTP 503)"));
  assert.throws(
    () => gh("repos/x/y", { pages: true }, { ...deps, delays: [1, 2] }),
    (error) => error.reason === "release-evidence-unavailable",
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [1, 2]);
});

test("the default delays are a few seconds and the sync sleep actually waits", () => {
  const { calls, sleeps, deps } = harness(failure("gh: (HTTP 500)"), "[]");
  assert.deepEqual(gh("repos/x/y", {}, { exec: deps.exec, sleep: deps.sleep }), []);
  assert.equal(calls.length, 2);
  assert.equal(sleeps[0] >= 1000 && sleeps[0] <= 10000, true);
  const started = Date.now();
  const real = harness(failure("gh: (HTTP 500)"), "[]");
  assert.deepEqual(gh("repos/x/y", {}, { exec: real.deps.exec, delays: [20] }), []);
  assert.equal(Date.now() - started >= 15, true);
});
