import assert from "node:assert/strict";
import { test } from "vitest";
import { publishWebstore, validateRelease, validateStatus } from "./publish-webstore.mjs";

const itemId = "kimdfjefhbfgfecconmaiaaindjccidp";
const publisherId = "01a9bdcf-e8d0-46ba-956d-2ef4dde4dc43";
const manifest = { name: "mdbase Reader", manifest_version: 3, version: "0.3.0" };
const options = {
  itemId,
  publisherId,
  token: "dummy-test-token",
  version: "0.3.0",
  archive: Buffer.from("test"),
};
const status = {
  itemId,
  publishedItemRevisionStatus: { distributionChannels: [{ crxVersion: "0.2.0" }] },
};

function mock(responses) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, opts) => {
      calls.push({ url, ...opts });
      assert.ok(responses.length, "unexpected request");
      const next = responses.shift();
      return { ok: true, json: async () => next };
    },
  };
}

test("only matching stable production tags can publish", () => {
  assert.equal(validateRelease("extension-v0.3.0", manifest), "0.3.0");
  for (const tag of [
    "extension-v0.3.0-beta.1",
    "extension-v0.2.0",
    "zotero-exporter-v0.3.0",
    "main",
    undefined,
  ]) {
    assert.throws(() => validateRelease(tag, manifest));
  }
  assert.throws(() =>
    validateRelease("extension-v0.3.0", { ...manifest, name: "mdbase Reader (LAB)" }),
  );
});

test("preserves pending submissions and rejects policy issues, old versions and wrong item", () => {
  assert.doesNotThrow(() => validateStatus(status, itemId, "0.3.0"));
  for (const state of ["PENDING_REVIEW", "STAGED"])
    assert.throws(() =>
      validateStatus({ ...status, submittedItemRevisionStatus: { state } }, itemId, "0.3.0"),
    );
  for (const extra of [
    { warned: true },
    { takenDown: true },
    { lastAsyncUploadState: "IN_PROGRESS" },
    { itemId: "other" },
  ])
    assert.throws(() => validateStatus({ ...status, ...extra }, itemId, "0.3.0"));
  for (const version of ["0.2.0", "0.1.9"])
    assert.throws(() => validateStatus(status, itemId, version));
  assert.doesNotThrow(() => validateStatus(status, itemId, "0.10.0"));
});

test("uploads then submits for ordinary review with warnings blocking publication", async () => {
  const m = mock([
    status,
    { itemId, crxVersion: "0.3.0", uploadState: "SUCCEEDED" },
    { itemId, state: "PENDING_REVIEW" },
  ]);
  assert.equal(await publishWebstore({ ...options, ...m }), "PENDING_REVIEW");
  assert.equal(m.calls.length, 3);
  assert.ok(m.calls[1].url.startsWith("https://chromewebstore.googleapis.com/upload/v2/"));
  assert.equal(m.calls[1].body, options.archive);
  assert.deepEqual(JSON.parse(m.calls[2].body), {
    publishType: "DEFAULT_PUBLISH",
    blockOnWarnings: true,
  });
});

test("pending review causes no upload or cancellation", async () => {
  const m = mock([{ itemId, submittedItemRevisionStatus: { state: "PENDING_REVIEW" } }]);
  await assert.rejects(publishWebstore({ ...options, ...m }), /pending review/u);
  assert.equal(m.calls.length, 1);
});

test("polls async uploads before publishing", async () => {
  const m = mock([
    status,
    { itemId, uploadState: "IN_PROGRESS" },
    { lastAsyncUploadState: "IN_PROGRESS" },
    { lastAsyncUploadState: "SUCCEEDED" },
    { itemId, state: "PENDING_REVIEW" },
  ]);
  let waits = 0;
  assert.equal(
    await publishWebstore({
      ...options,
      ...m,
      sleep: async () => {
        waits++;
      },
    }),
    "PENDING_REVIEW",
  );
  assert.equal(waits, 2);
});

test("failed upload never publishes", async () => {
  const m = mock([status, { itemId, uploadState: "FAILED" }]);
  await assert.rejects(publishWebstore({ ...options, ...m }), /Upload did not complete/u);
  assert.equal(m.calls.length, 2);
});

test("HTTP failures are redacted and never retried", async () => {
  let count = 0;
  await assert.rejects(
    publishWebstore({
      ...options,
      fetchImpl: async () => {
        count++;
        return { ok: false, status: 403, json: async () => ({ secret: options.token }) };
      },
    }),
    (error) => error.message.includes("403") && !error.message.includes(options.token),
  );
  assert.equal(count, 1);
});
