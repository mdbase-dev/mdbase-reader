import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

// Disposable browser + origin-local IndexedDB only; no Connect or saved profile.
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
  const address = server.httpServer.address();
  assert(address && typeof address !== "string");
  await page.goto(`http://127.0.0.1:${address.port}/test-fixtures/library-text-index.html`);
  await page.waitForFunction(() => typeof globalThis.runLibraryTextBenchmark === "function");
  const result = await page.evaluate(() => globalThis.runLibraryTextBenchmark());
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.results, 500);
  assert.equal(result.reads, 500);
  assert.equal(result.unchangedReads, 0);
  assert(result.maximumQueryMs < 100, "Worker round-trip query exceeded 100 ms");
  assert(result.heartbeats > 500, "Indexing did not regularly yield to the main thread");
  assert(result.maximumHeartbeatGapMs < 100, "Indexing starved the main-thread heartbeat");
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
