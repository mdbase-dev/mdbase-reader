import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const origin = process.env.READER_PERF_ORIGIN ?? "http://127.0.0.1:5297";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
  throw new Error("Use an explicit loopback preview server, never a collection or LAB.");
}
const output = resolve(process.argv[2] ?? "/tmp/reader-preview-trace");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const samples = [];
try {
  for (let index = 0; index < 3; index += 1) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.origin === origin || ["data:", "blob:", "about:"].includes(url.protocol)
        ? route.continue()
        : route.abort();
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    if (index === 0) {
      await cdp.send("Tracing.start", {
        categories: "devtools.timeline,blink.user_timing,loading",
        transferMode: "ReturnAsStream",
      });
    }
    await page.goto(`${origin}/?preview=1`);
    const source = page.getByText("The Principles of Psychology", { exact: true }).first();
    await source.waitFor();
    const libraryReady = await page.evaluate(() => performance.now());
    await source.dblclick();
    await page.locator("iframe.html-viewer").first().waitFor();
    await page.waitForFunction(() => {
      const frame = globalThis.document.querySelector("iframe.html-viewer");
      return frame?.contentDocument?.body?.textContent?.includes("Attention");
    });
    const documentReady = await page.evaluate(() => performance.now());
    const scripts = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.endsWith(".js"))
        .map((entry) => ({
          name: entry.name.split("/").at(-1),
          decoded: entry.decodedBodySize,
          encoded: entry.encodedBodySize,
        })),
    );
    samples.push({
      libraryReady,
      documentReady,
      openDocument: documentReady - libraryReady,
      scripts,
      errors,
    });
    if (index === 0) {
      const complete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
      await cdp.send("Tracing.end");
      const { stream } = await complete;
      let trace = "";
      for (;;) {
        const part = await cdp.send("IO.read", { handle: stream });
        trace += part.data;
        if (part.eof) break;
      }
      await cdp.send("IO.close", { handle: stream });
      await writeFile(resolve(output, "trace.json"), trace);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(resolve(output, "samples.json"), `${JSON.stringify(samples, null, 2)}\n`);
console.log(
  JSON.stringify(
    samples.map(({ scripts, ...sample }) => ({
      ...sample,
      jsDecoded: scripts.reduce((total, script) => total + script.decoded, 0),
      jsEncoded: scripts.reduce((total, script) => total + script.encoded, 0),
    })),
    null,
    2,
  ),
);
