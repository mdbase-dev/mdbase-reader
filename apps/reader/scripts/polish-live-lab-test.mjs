import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const cdp = process.env.READER_LAB_CDP;
assert.ok(cdp, "Set READER_LAB_CDP to `desk cdp gcp/<your-owned-lab-desk>`.");
assert.match(cdp, /^http:\/\/127\.0\.0\.1:\d+$/u);
const health = await fetch("https://connect-lab.mdbase.dev/health").then((response) =>
  response.json(),
);
assert.equal(health.environment, "lab");
assert.equal(health.public_origin, "https://connect-lab.mdbase.dev");
const browser = await chromium.connectOverCDP(cdp);
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().startsWith("https://lab.mdbase-reader.pages.dev/"));
assert.ok(page, "Open Reader LAB and select a disposable [test] collection in this desk first.");
page.setDefaultTimeout(15_000);
assert.match(await page.locator(".reader-header").innerText(), /\[test\]/u);
assert.equal(await page.locator(".reader-save-status").count(), 0, "Start with a drained ledger.");
const run = `[test] reader-r7-${Date.now()}`;
const added = [];
const attempted = new Set();
const evidence = {
  environment: health.environment,
  revision: health.revision,
  run,
  assertions: [],
  cleanup: [],
};

async function choose(suffix) {
  await page.locator(".dv-tab").filter({ hasText: "All sources" }).first().click();
  await page.locator(".library-add-button").first().click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose or drop a file/u }).click();
  const name = `${run} ${suffix}`;
  attempted.add(name);
  await (
    await chooser
  ).setFiles({
    name: `${name}.html`,
    mimeType: "text/html",
    buffer: Buffer.from(
      `<!doctype html><title>${name}</title><p>${"Reader LAB transfer. ".repeat(300)}</p>`,
    ),
  });
  await page.locator(".import-dialog").waitFor();
  return name;
}

async function finish(name) {
  const started = Date.now();
  await page
    .locator(".import-dialog")
    .getByRole("button", { name: "Add source", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !globalThis.document.querySelector(".import-dialog") ||
      globalThis.document.querySelector(".import-error"),
    undefined,
    { timeout: 40_000 },
  );
  const error = page.locator(".import-dialog .import-error");
  if (await error.count()) {
    await error.locator("summary").click();
    throw new Error((await error.innerText()).slice(0, 700));
  }
  added.push(name);
  evidence.assertions.push({ name, durationMs: Date.now() - started });
  await page.locator(".dv-tab").filter({ hasText: "All sources" }).first().click();
  await expect(page.locator(".library-source-link").filter({ hasText: name })).toHaveCount(1);
  await expect(page.locator(".reader-save-status")).toHaveCount(0, { timeout: 30_000 });
}

async function scenario(name, action) {
  try {
    await action();
    evidence.assertions.push({ scenario: name, result: "PASS" });
  } catch (error) {
    evidence.assertions.push({
      scenario: name,
      result: "FINDING",
      failure: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    console.log(JSON.stringify(evidence.assertions.at(-1)));
    const cancel = page
      .locator(".import-dialog:visible")
      .getByRole("button", { name: "Cancel", exact: true });
    if ((await cancel.count()) && (await cancel.isEnabled())) await cancel.click();
  }
}

async function stop() {
  await page
    .locator(".import-dialog")
    .getByRole("button", { name: "Add source", exact: true })
    .click();
  await page.getByText(/Uploading file|File transferred\. Waiting/u).waitFor();
  await page.getByRole("button", { name: "Stop adding", exact: true }).click();
  await page.getByText(/Stopped(?: adding\.|\.)/u).waitFor();
}

try {
  await scenario("stop-retry-same-file", async () => {
    const name = await choose("stop-retry");
    await stop();
    await finish(name);
  });
  await scenario("stop-different-file-same-session", async () => {
    await choose("stop-before-different-file");
    await stop();
    await page
      .locator(".import-dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await finish(await choose("different-file"));
  });
  await scenario("post-reload-write", async () => {
    await page.reload();
    await page.locator(".library-table").waitFor();
    await finish(await choose("post-reload"));
  });
  evidence.result = process.exitCode ? "FINDING" : "PASS";
} catch (error) {
  evidence.result = "FINDING";
  evidence.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  const cancel = page
    .locator(".import-dialog:visible")
    .getByRole("button", { name: "Cancel", exact: true });
  if ((await cancel.count()) && (await cancel.isEnabled())) {
    await cancel.click();
  }
  for (const name of attempted) {
    try {
      await page.locator(".dv-tab").filter({ hasText: "All sources" }).first().click();
      const row = page.locator(".library-table-row[data-row-index]").filter({ hasText: name });
      if (await row.count()) {
        await row.focus();
        await page.keyboard.press("Delete");
        const dialog = page.locator(".source-removal-dialog");
        await dialog.getByRole("button", { name: /Remove source/u }).click();
        await expect(dialog).toBeHidden();
        await expect(page.locator(".reader-save-status")).toHaveCount(0, { timeout: 30_000 });
        evidence.cleanup.push({ name, sourceNote: "removed" });
      } else {
        evidence.cleanup.push({ name, sourceNote: "not visible" });
      }
    } catch (error) {
      evidence.cleanup.push({
        name,
        failure: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
  }
  evidence.retainedOriginals = [...attempted].map((name) => `${name}.html`);
  evidence.retainedOriginalsNotice =
    "Reader source removal keeps saved files. Reconcile these exact owned originals in the disposable collection; an unconfirmed upload may not be visible yet. Never clear browser data to clear a pending write.";
  evidence.added = added;
  evidence.result = process.exitCode ? "FINDING" : "PASS";
  console.log(JSON.stringify(evidence, null, 2));
  process.exit(process.exitCode ?? 0);
}
