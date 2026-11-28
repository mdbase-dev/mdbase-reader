import { resolve } from "node:path";

import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

import { auditEpub, auditPdf } from "./reader-audit-documents.mjs";

const root = resolve(import.meta.dirname, "..");
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`${origin}/__performance`, async (route) =>
    route.fulfill({
      contentType: "text/html",
      body: await server.transformIndexHtml(
        "/__performance",
        "<!doctype html><html><head><title>Reader performance fixture</title></head><body></body></html>",
      ),
    }),
  );
  await page.goto(`${origin}/__performance`);
  const chapter = Array.from(
    { length: 1200 },
    (_, i) =>
      `<p id="p${i}"${i === 0 ? ' onclick="return false"' : ""}>${"Research notes and patient attention. ".repeat(12)}</p>`,
  ).join("");
  const importFiles = new Map([
    ["article.html", Buffer.from(`<!doctype html><html><body>${chapter}</body></html>`)],
    [
      "book.epub",
      await auditEpub(
        `${chapter}<img alt="" src="data:image/png;base64,${"AAAA".repeat(150000)}" />`,
      ),
    ],
    ["papers.pdf", auditPdf(1000, 40)],
  ]);
  const files = [];
  for (const [name, body] of importFiles) {
    const url = `${origin}/__performance/${name}`;
    await page.route(url, (route) => route.fulfill({ body }));
    files.push({ name, url });
  }
  const moduleUrl = `/@fs${root}/test-fixtures/performance-fixture.tsx`;
  const imports = await page.evaluate(
    async ({ moduleUrl, files }) => {
      const { runImportFixture } = await import(moduleUrl);
      return runImportFixture(files);
    },
    { moduleUrl, files },
  );
  await page.context().setOffline(true);
  const progress = await page.evaluate(async (moduleUrl) => {
    const { runProgressFixture } = await import(moduleUrl);
    if (globalThis.navigator.onLine) throw new Error("Progress fixture must run offline");
    return runProgressFixture();
  }, moduleUrl);
  console.log(
    "Chromium input bytes",
    Object.fromEntries([...importFiles].map(([name, file]) => [name, file.length])),
  );
  console.log("Chromium import", imports);
  console.log("Chromium offline progress", progress);
  expect(errors).toEqual([]);
  console.log("Chromium", browser.version());
} finally {
  await browser?.close();
  await server.close();
}
