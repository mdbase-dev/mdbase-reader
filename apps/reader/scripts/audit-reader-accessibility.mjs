// Run against Reader's local Vite server. The fixture uses the real workspace UI.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { chromium, expect } from "@playwright/test";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5311";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Accessibility audits require a loopback origin.");
}
const axeSource = await readFile(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);
const browser = await chromium.launch();
const findings = {};

async function audit(target, name) {
  if (!(await target.evaluate(() => Boolean(globalThis.axe)))) {
    await target.evaluate(axeSource);
  }
  findings[name] = await target.evaluate(async () => {
    await Promise.race([
      globalThis.document.fonts.ready,
      new Promise((resolve) => globalThis.setTimeout(resolve, 1500)),
    ]);
    const result = await globalThis.axe.run(globalThis.document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      resultTypes: ["violations"],
      iframes: false,
    });
    return result.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    }));
  });
}

async function command(page, label) {
  await page.getByRole("button", { name: /^Search and commands/u }).click();
  await page.getByRole("combobox", { name: "Search sources and commands" }).fill(label);
  await page
    .getByRole("option", { name: new RegExp(`^${label}`, "u") })
    .first()
    .click();
}

try {
  for (const width of [360, 1280]) {
    for (const colorScheme of ["light", "dark"]) {
      const key = `${width} ${colorScheme}`;
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme,
        reducedMotion: "reduce",
      });
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      await page.goto(`${origin}/?preview=1`);
      await page.locator(".library-table:visible").waitFor();
      await audit(page, `${key} Library`);
      await command(page, "Add source");
      await expect(page.getByRole("textbox", { name: "Link or identifier" })).toBeVisible();
      await audit(page, `${key} Add URL`);
      await page.getByRole("button", { name: "Close add source" }).click();
      await command(page, "Settings");
      await page.locator("dialog.settings-page").waitFor();
      await audit(page, `${key} Settings`);
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: /^Continue reading The Principles of Psychology/u })
        .click();
      const article = page.locator("iframe.html-viewer:visible");
      await article.contentFrame().locator("article, main, h1").first().waitFor();
      await audit(page, `${key} Article`);
      // axe uses timers that cannot run inside Reader's script-disabled iframe.
      // Reproduce its sanitized DOM, palette and geometry in an isolated page.
      const document = article.contentFrame().locator("html");
      const markup = await document.evaluate((root) => root.outerHTML);
      const bounds = await article.boundingBox();
      const articleAudit = await context.newPage();
      await articleAudit.setViewportSize({
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height)),
      });
      await articleAudit.setContent(`<!doctype html>${markup}`);
      await audit(articleAudit, `${key} Article document`);
      await articleAudit.close();
      if (width === 360) {
        await page.getByRole("button", { name: /Annotations/u, exact: true }).click();
      } else {
        await command(page, "Show Annotations panel");
      }
      await page.locator(".annotation-card:visible").first().waitFor();
      await audit(page, `${key} Annotations`);
      await page.goto(`${origin}/import/?preview=1`);
      await page.getByRole("heading", { name: "Import a library", exact: true }).waitFor();
      await audit(page, `${key} Import`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  console.log(JSON.stringify(findings, null, 2));
}
process.exitCode = Object.values(findings).some((violations) => violations.length) ? 1 : 0;
