import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

// The production reproduction, rendered in Reader's script-disabled HTML sandbox.
const root = resolve(import.meta.dirname, "..");
const fixture = await readFile(
  resolve(root, "../../packages/renderer-html/src/fixtures/imported-svg.html"),
  "utf8",
);
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const externalRequests = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  // No app, collection, daemon or production network access is needed.
  await page.route(`${origin}/svg-test`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>SVG regression</title>",
    }),
  );
  await page.goto(`${origin}/svg-test`);
  const moduleUrl = `/@fs${resolve(root, "../../packages/renderer-html/src/html-document.ts")}`;
  for (const passes of [0, 1, 2]) {
    await page.evaluate(
      async ({ fixture, moduleUrl, passes }) => {
        const { prepareHtmlDocument } = await import(moduleUrl);
        let source = fixture;
        for (let pass = 0; pass < passes; pass++) source = prepareHtmlDocument(source);
        const frame = globalThis.document.createElement("iframe");
        frame.sandbox = "allow-same-origin";
        frame.title = "HTML reading document";
        globalThis.document.body.replaceChildren(frame);
        await new Promise((resolveLoad) => {
          frame.onload = resolveLoad;
          frame.srcdoc = source;
        });
      },
      { fixture, moduleUrl, passes },
    );
    const frame = page.frameLocator("iframe");
    const image = frame.getByAltText("Test image");
    await expect
      .poll(() => image.evaluate((image) => [image.naturalWidth, image.naturalHeight]))
      .toEqual([30, 30]);
    await expect(frame.locator("code")).toHaveText("const example = 42;");
    if (passes) {
      await expect(frame.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
        "content",
        "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'",
      );
    }
  }
  expect(externalRequests).toEqual([]);
  console.log(
    "Imported SVG: 30×30 in Chrome and after both Reader sanitization passes; CSP unchanged.",
  );
} finally {
  await browser?.close();
  await server.close();
}
