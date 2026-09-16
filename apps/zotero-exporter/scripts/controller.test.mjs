import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const scope = vm.createContext({});
vm.runInContext(await readFile(new URL("../src/controller.js", import.meta.url), "utf8"), scope);
function fixture(overrides = {}) {
  let calls = 0;
  const adapter = {
    snapshot: async () => ({
      items: [{}],
      notes: [],
      annotations: [],
      collections: [],
      attachments: [{ key: "A" }, { key: "B" }],
    }),
    attachmentFiles: async (key) =>
      key === "A" ? { status: "available", files: [{ bytes: 100 }] } : { status: "missing-file" },
    availableBytes: async () => 1024 ** 3,
    ...overrides,
  };
  const api = {
    exportLibrary: async (_, options) => {
      calls++;
      options.onProgress({ completed: 2, total: 2 });
      return {
        warnings: [{ code: "missing-file", key: "B" }],
        counts: { availableAttachments: 1 },
      };
    },
  };
  const controller = new scope.ReaderExportController({
    api,
    adapter,
    AbortController,
    join: (...a) => a.join("/"),
    now: () => new Date("2026-09-16T01:02:03Z"),
    suffix: () => "test",
  });
  return { controller, api, adapter, calls: () => calls };
}

test("scans without writing and requires explicit start", async () => {
  const f = fixture();
  await f.controller.prepare("/export");
  assert.equal(f.controller.state.phase, "ready");
  assert.equal(f.controller.state.plan.missing, 1);
  assert.equal(f.calls(), 0);
  assert.match(f.controller.state.destination, /^\/export\/zotero-reader-.*-test$/);
  await f.controller.start();
  assert.equal(f.controller.state.phase, "complete");
  assert.equal(f.calls(), 1);
  await f.controller.start();
  assert.equal(f.calls(), 1);
});

test("sync and insufficient space block export", async () => {
  const f = fixture({ snapshot: async () => ({ syncing: true }) });
  await f.controller.prepare("/export");
  assert.equal(f.controller.state.phase, "failed");
  await f.controller.start();
  assert.equal(f.calls(), 0);
  const low = fixture({ availableBytes: async () => 2 });
  await low.controller.prepare("/export");
  assert.equal(low.controller.state.phase, "failed");
  assert.match(low.controller.state.message, /disk space/);
});

test("cancellation and duplicate-start protection", async () => {
  const f = fixture();
  await f.controller.prepare("/export");
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  let calls = 0;
  f.api.exportLibrary = async (_, { signal }) => {
    calls++;
    await gate;
    assert.equal(signal.aborted, true);
    throw new Error("cancel");
  };
  const job = f.controller.start();
  await Promise.resolve();
  await f.controller.start();
  f.controller.cancel();
  release();
  await job;
  assert.equal(calls, 1);
  assert.equal(f.controller.state.phase, "cancelled");
  assert.equal(f.controller.busy, false);
});

test("dispose aborts work and removes listeners", async () => {
  const f = fixture();
  await f.controller.prepare("/export");
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  f.api.exportLibrary = async () => {
    await gate;
    throw new Error("stopped");
  };
  f.controller.subscribe(() => {});
  const job = f.controller.start();
  await Promise.resolve();
  const disposed = f.controller.dispose();
  release();
  await Promise.all([job, disposed]);
  assert.equal(f.controller.listeners.size, 0);
  const phase = f.controller.state.phase;
  await f.controller.prepare("/other");
  assert.equal(f.controller.state.phase, phase);
});

test("rechecks free space immediately before export", async () => {
  const f = fixture();
  await f.controller.prepare("/export");
  f.adapter.availableBytes = async () => 0;
  await f.controller.start();
  assert.equal(f.controller.state.phase, "failed");
  assert.equal(f.calls(), 0);
});

test("UI listener failures do not mark a valid export as failed", async () => {
  const f = fixture();
  f.controller.listeners.add(() => {
    throw new Error("window closed");
  });
  await f.controller.prepare("/export");
  await f.controller.start();
  assert.equal(f.controller.state.phase, "complete");
});
