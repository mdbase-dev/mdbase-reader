// Local built-byte regression: emulate Pages' HTML -> clean URL redirects.
// No Connect, LAB daemon, account, credentials, or deployment is used.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const directory = resolve(import.meta.dirname, "../dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname.endsWith(".html")) {
    const clean = pathname.endsWith("/index.html")
      ? pathname.slice(0, -"index.html".length)
      : pathname.slice(0, -".html".length);
    response.writeHead(308, { Location: clean }).end();
    return;
  }
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = resolve(directory, extname(file) ? file : file + ".html");
  if (!path.startsWith(directory + "/")) {
    response.writeHead(403).end();
    return;
  }
  try {
    const bytes = await readFile(path);
    response.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream" });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: "allow" });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  const failed = [];
  const pageErrors = [];
  context.on("requestfailed", (request) => failed.push(new URL(request.url()).pathname));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin + "/?preview=1");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 60000,
  });
  await page.getByText("The Principles of Psychology", { exact: true }).first().waitFor();
  const cached = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error("No active offline shell");
    const names = (await globalThis.caches.keys()).filter((key) =>
      key.startsWith("mdbase-shell:/"),
    );
    const cache = await globalThis.caches.open(names[0]);
    return Promise.all(
      ["index.html", "404.html"].map(
        async (file) => (await cache.match(new URL(file, globalThis.location.origin)))?.status,
      ),
    );
  });
  assert.deepEqual(cached, [200, 200]);
  await page.reload();
  await page.getByText("The Principles of Psychology", { exact: true }).first().waitFor();
  assert.equal(await page.title(), "mdbase reader");
  await context.setOffline(true);
  const offline = await page.reload();
  await page.getByText("The Principles of Psychology", { exact: true }).first().waitFor();
  assert.equal(offline.status(), 200);
  assert.equal(await page.title(), "mdbase reader");
  assert.deepEqual(pageErrors, []);
  console.log(
    JSON.stringify({
      active: true,
      cachedHtmlStatuses: cached,
      failedRequests: failed,
      offlineReload: offline.status(),
      pageErrors,
    }),
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
