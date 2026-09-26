/* global chrome, indexedDB */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { chromium, expect } from "@playwright/test";

// Hermetic production-package smoke: real Chrome extension APIs, fresh profile,
// NO production account/collection access. Every outbound proxy request is denied.
const extension = resolve(import.meta.dirname, "../apps/extension/dist");
const manifest = JSON.parse(await readFile(resolve(extension, "manifest.json"), "utf8"));
assert.equal(manifest.name, "mdbase Reader");
assert.deepEqual(manifest.host_permissions, ["https://connect.mdbase.dev/*"]);
const profile = await mkdtemp(resolve(tmpdir(), "reader-extension-smoke-"));
const proxy = http.createServer((_request, response) => response.writeHead(403).end());
proxy.on("connect", (_request, socket) => socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"));
await new Promise((done) => proxy.listen(0, "127.0.0.1", done));
let context;
try {
  const port = proxy.address().port;
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    proxy: { server: `http://127.0.0.1:${port}`, bypass: "<-loopback>" },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--disable-quic",
      "--disable-background-networking",
    ],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).hostname;
  const base = `chrome-extension://${id}/`;
  const page = await context.newPage();
  // Command-line loading alone doesn't enable Developer mode in a fresh profile;
  // Chromium otherwise disables the unpacked extension on runtime.reload().
  await page.goto("chrome://extensions/");
  await page.evaluate(() =>
    chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }),
  );
  await page.goto(`${base}welcome.html`);
  await expect(page.getByRole("heading", { name: "mdbase Reader is installed" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry connection", exact: true }).first(),
  ).toBeVisible();
  await page.goto(`${base}options.html`);
  const button = page.getByRole("button", { name: "Disconnect and clear local data", exact: true });
  await expect(button).toBeDisabled();
  await expect(page.getByText("This forgets local access;", { exact: false })).toBeVisible();
  // Only synthetic state in this newly created disposable profile. Never dump it.
  await page.evaluate(async () => {
    await chrome.storage.local.set({ "smoke:pending-write": "synthetic-only" });
    await chrome.storage.session.set({ "smoke:draft": "synthetic-only" });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("smoke-signing-key", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("keys");
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(new Error("fixture database failed"));
    });
  });
  // Close first-install pages; the reset must unload/restart the entire extension.
  for (const other of context.pages()) {
    if (other !== page && other.url().startsWith(base)) await other.close();
  }
  await page.getByRole("checkbox", { name: "I have finished saving.", exact: false }).check();
  await expect(button).toBeEnabled();
  await button.click();
  // Chrome reload may invalidate/close the original page. Navigate a fresh one
  // repeatedly until the two-stage reset has completed; no magic sleep deadline.
  let verify = await context.newPage();
  await expect(async () => {
    if (verify.isClosed()) verify = await context.newPage();
    await verify.goto(`${base}options.html`);
    await expect(verify.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    const clean = await verify.evaluate(async () => {
      const local = await chrome.storage.local.get(null);
      const session = await chrome.storage.session.get(null);
      const databases = await indexedDB.databases();
      return (
        !local["reader-local-reset-pending"] &&
        !local["smoke:pending-write"] &&
        !session["smoke:draft"] &&
        !databases.some((db) => db.name === "smoke-signing-key")
      );
    });
    assert.equal(clean, true);
  }).toPass({ timeout: 30_000 });
  await expect(
    verify.getByRole("button", { name: "Retry connection", exact: true }).first(),
  ).toBeVisible();
  console.log(
    JSON.stringify({
      result: "passed",
      browser: context.browser()?.version(),
      version: manifest.version,
      checks: [
        "fresh-install welcome",
        "production manifest",
        "offline onboarding/retry",
        "explicit reset confirmation",
        "runtime reload",
        "local/session/IndexedDB cleanup",
        "offline retry UI after reset",
      ],
      liveCapture: "not tested; outbound traffic blocked",
      cleanup: "disposable profile removed on exit",
    }),
  );
} catch (error) {
  if (context) {
    const diagnostic = await context.newPage();
    await diagnostic.goto("chrome://extensions/");
    console.error(
      await diagnostic.evaluate(async () => {
        const entries = await chrome.developerPrivate.getExtensionsInfo();
        return entries
          .filter((item) => item.name === "mdbase Reader")
          .map((item) => ({
            state: item.state,
            disableReasons: item.disableReasons,
            errors: item.runtimeErrors?.map((entry) => entry.message),
          }));
      }),
    );
  }
  throw error;
} finally {
  await context?.close();
  await new Promise((done) => proxy.close(done));
  await rm(profile, { recursive: true, force: true });
}
