// Runs axe-core over Reader's main screens in the interface preview and fails on violations.
// Usage: READER_AUDIT_ORIGIN=http://127.0.0.1:5311 node scripts/audit-accessibility.mjs
import { createRequire } from "node:module";

import { chromium } from "@playwright/test";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5193";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Accessibility audits only run against an explicit loopback origin.");
}
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
// Dockview names pane regions after their active tab; an inactive group can be left unnamed.
const knownLibraryIssues = new Set(["landmark-unique"]);

const browser = await chromium.launch({ headless: true });
const findings = {};
async function audit(page, name) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(globalThis.document, { resultTypes: ["violations"] });
    return result.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.slice(0, 3).map((node) => node.target.join(" ")),
    }));
  });
  findings[name] = violations.filter(({ id }) => !knownLibraryIssues.has(id));
}
try {
  const desktop = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await desktop.goto(`${origin}/?preview=1`, { waitUntil: "networkidle" });
  await desktop.getByRole("grid", { name: "Sources" }).waitFor();
  await audit(desktop, "library");
  await desktop
    .locator(".library-table-body .library-table-row .is-title")
    .first()
    .click({ button: "right" });
  await desktop.getByRole("menu").waitFor();
  await audit(desktop, "row menu");
  await desktop.keyboard.press("Escape");
  await desktop.getByRole("button", { name: /^Switch collection/u }).click();
  await desktop.getByRole("menu", { name: "Switch collection" }).waitFor();
  await audit(desktop, "collection menu");
  await desktop.keyboard.press("Escape");
  const titles = desktop.locator(".library-table-body .library-table-row .is-title");
  await titles.nth(0).click();
  await titles.nth(2).click({ modifiers: ["Shift"] });
  await audit(desktop, "bulk selection");
  await desktop.getByRole("button", { name: "Annotations", exact: true }).click();
  await desktop.getByRole("grid", { name: "Annotations" }).waitFor();
  await audit(desktop, "annotations view");
  await desktop.getByRole("button", { name: "Sources", exact: true }).click();
  await desktop.getByRole("grid", { name: "Sources" }).waitFor();
  await desktop.getByLabel("Add column").click();
  await audit(desktop, "add-column menu");
  await desktop.keyboard.press("Escape");
  await desktop.getByRole("button", { name: /^Continue reading Gravity and Grace/u }).click();
  await desktop.locator("iframe.html-viewer").waitFor();
  await desktop.getByRole("button", { name: "Toggle right sidebar" }).click();
  await desktop.getByRole("complementary", { name: "Source workspace" }).waitFor();
  await audit(desktop, "reading with notes");
  await desktop.getByRole("tab", { name: /Citation/u }).click();
  await desktop.locator(".citation-editor").waitFor();
  await audit(desktop, "citation tool");
  await desktop.keyboard.press("Control+k");
  await desktop.getByRole("dialog", { name: "Reader commands" }).waitFor();
  await audit(desktop, "command palette");
  const phone = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await phone.goto(`${origin}/?preview=1`, { waitUntil: "networkidle" });
  await phone.getByRole("grid", { name: "Sources" }).waitFor();
  await audit(phone, "phone library");
  await phone.getByRole("button", { name: /^Continue reading Gravity and Grace/u }).click();
  await phone.getByRole("navigation", { name: "Source views" }).waitFor();
  await audit(phone, "phone source views");
} finally {
  await browser.close();
}
const failed = Object.entries(findings).filter(([, violations]) => violations.length > 0);
console.log(JSON.stringify({ result: failed.length ? "failed" : "passed", findings }, null, 2));
process.exitCode = failed.length ? 1 : 0;
