import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadavg } from "node:os";
import { chromium } from "@playwright/test";

const cdp = process.env.READER_LAB_CDP;
const output = process.env.READER_BOOT_OUTPUT;
assert.match(cdp ?? "", /^http:\/\/127\.0\.0\.1:\d+$/u);
assert.ok(output, "Set READER_BOOT_OUTPUT to a directory inside your worktree.");
assert.ok(
  loadavg().every((load) => load < 20),
  "Timing gates require load under 20.",
);
const health = await fetch("https://connect-lab.mdbase.dev/health").then((response) =>
  response.json(),
);
assert.equal(health.environment, "lab");
assert.equal(health.public_origin, "https://connect-lab.mdbase.dev");
const browser = await chromium.connectOverCDP(cdp);
let page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().startsWith("https://lab.mdbase-reader.pages.dev/"));
assert.ok(page);
assert.match(await page.locator(".reader-header").innerText(), /\[test\]/u);
const originalPage = page;
const candidate = process.env.READER_CANDIDATE_ORIGIN;
let intercepted = 0;
if (candidate) {
  assert.match(candidate, /^http:\/\/127\.0\.0\.1:\d+$/u);
  const index = await fetch(candidate).then((response) => response.text());
  assert.ok(index.includes("<title>mdbase reader</title>"));
  await page.evaluate(async () => {
    for (const registration of await globalThis.navigator.serviceWorker.getRegistrations()) {
      await registration.unregister();
    }
  });
  await originalPage.goto("about:blank");
  page = await page.context().newPage();
  await page.route("https://lab.mdbase-reader.pages.dev/**", async (route) => {
    intercepted += 1;
    const url = new URL(route.request().url());
    if (url.pathname === "/mdbase-shell-register.js") {
      await route.fulfill({ contentType: "application/javascript", body: "" });
      return;
    }
    const response = await fetch(`${candidate}${url.pathname}${url.search}`);
    await route.fulfill({
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/octet-stream",
      },
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}
await mkdir(output, { recursive: true });
await page.setViewportSize({ width: 1440, height: 900 });
const client = await page.context().newCDPSession(page);
await client.send("Network.setBypassServiceWorker", { bypass: true });
await client.send("Network.setCacheDisabled", { cacheDisabled: true });
if (candidate)
  await page.goto("https://lab.mdbase-reader.pages.dev/", { waitUntil: "domcontentloaded" });
const results = [];
try {
  for (let run = 0; run < 3; run += 1) {
    const frames = [];
    const frame = async (event) => {
      frames.push(Buffer.from(event.data, "base64"));
      await client.send("Page.screencastFrameAck", { sessionId: event.sessionId });
    };
    client.on("Page.screencastFrame", frame);
    await client.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 });
    await page.reload({ waitUntil: "commit" });
    const samples = await page.evaluate(async () => {
      const samples = [];
      const end = performance.now() + 6000;
      let previous = "";
      while (performance.now() < end) {
        const name = globalThis.document.querySelector(
          ".reader-boot header, .reader-collection-switcher",
        )?.textContent;
        const all = [...globalThis.document.querySelectorAll(".library-navigator button")].find(
          (button) => button.textContent.startsWith("All sources"),
        );
        const sidebar = globalThis.document.querySelector(".reader-dock-sidebar");
        const sample = {
          boot: Boolean(globalThis.document.querySelector(".reader-boot")),
          feature: Boolean(globalThis.document.querySelector(".reader-feature-skeleton")),
          name,
          rows: globalThis.document.querySelectorAll("[data-row-index]").length,
          allY:
            all && all.getBoundingClientRect().y < globalThis.innerHeight
              ? all.getBoundingClientRect().y
              : undefined,
          sidebarWidth: sidebar?.getBoundingClientRect().width,
          sidebarTransform: sidebar ? globalThis.getComputedStyle(sidebar).transform : undefined,
        };
        const serialized = JSON.stringify(sample);
        if (serialized !== previous)
          samples.push({ time: Math.round(performance.now()), ...sample });
        previous = serialized;
        await new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
      }
      return samples;
    });
    await client.send("Page.stopScreencast");
    client.off("Page.screencastFrame", frame);
    for (const index of [
      ...new Set([
        0,
        Math.floor(frames.length / 3),
        Math.floor((frames.length * 2) / 3),
        frames.length - 1,
      ]),
    ]) {
      if (frames[index])
        await writeFile(join(output, `run-${run}-frame-${index}.jpg`), frames[index]);
    }
    results.push({ run, frames: frames.length, samples });
  }
  let phonePending = null;
  if (candidate && (await page.locator(".reader-save-status").count())) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".reader-save-trigger").click();
    await page.waitForFunction(() => {
      const panel = globalThis.document.querySelector(".reader-save-status > .reader-menu-panel");
      return panel && panel.getBoundingClientRect().x === 16;
    });
    phonePending = await page.locator(".reader-save-status").evaluate((element) => {
      const bounds = element.querySelector(".reader-menu-panel").getBoundingClientRect();
      const status = globalThis.document.querySelector(
        ".reader-header-context > .connection-state",
      );
      return {
        left: bounds.x,
        right: globalThis.innerWidth - bounds.right,
        trigger: element.querySelector("summary").textContent,
        redundantStatusVisible: status?.checkVisibility() ?? false,
      };
    });
    assert.equal(phonePending.left, 16);
    assert.equal(phonePending.right, 16);
    assert.equal(phonePending.redundantStatusVisible, false);
    await page.screenshot({ path: join(output, "phone-pending.png") });
  }
  await writeFile(
    join(output, "measurements.json"),
    `${JSON.stringify({ candidate: Boolean(candidate), revision: health.revision, load: loadavg(), phonePending, results }, null, 2)}\n`,
  );
  console.log(JSON.stringify(results));
  console.log(JSON.stringify({ intercepted }));
  if (candidate) {
    for (const result of results) {
      assert.ok(
        result.samples.some((sample) => sample.rows > 0),
        "Candidate must reach the restored library.",
      );
      assert.ok(
        result.samples.every((sample) => !sample.feature),
        "The boot path must not contain a second skeleton.",
      );
      const named = result.samples.findIndex((sample) => sample.name?.includes("[test]"));
      assert.ok(named >= 0, "The restored collection must be named.");
      assert.ok(
        result.samples.slice(named).every((sample) => sample.name?.includes("[test]")),
        "The collection name must stay on screen.",
      );
      const visibleAll = result.samples.filter((sample) => sample.allY !== undefined);
      assert.ok(visibleAll.length > 0);
      assert.equal(
        new Set(visibleAll.map((sample) => sample.allY)).size,
        1,
        "All sources must not shift while visible.",
      );
      const sidebars = result.samples.filter((sample) => sample.sidebarWidth !== undefined);
      assert.ok(sidebars.every((sample) => sample.sidebarWidth === 260));
      assert.ok(
        sidebars.every(
          (sample) =>
            sample.sidebarTransform === "none" ||
            sample.sidebarTransform === "matrix(1, 0, 0, 1, 0, 0)",
        ),
      );
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await page.unroute("https://lab.mdbase-reader.pages.dev/**");
  await client.detach();
  if (candidate) {
    await page.close();
    await originalPage.goto("https://lab.mdbase-reader.pages.dev/");
  }
  process.exit(process.exitCode ?? 0);
}
