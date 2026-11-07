import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, expect } from "@playwright/test";
import { installLocalPdfium } from "./audit-local-pdfium.mjs";
import {
  bootFailure,
  round5Library,
  round5Settings,
  round5Workspace,
} from "./polish-round5-cases.mjs";
import {
  round4Library,
  readingKeys,
  desktopPdfNavigation,
  offlinePdf,
  staticBoot,
  retainedCitation,
} from "./polish-round4-cases.mjs";
import {
  addSourceTiming,
  geometry,
  keyboardLibrary,
  pdfSheet,
  removeContrast,
  pdfHighlightKey,
  marginTicks,
  titleFocus,
  autoHide,
  interruptPane,
  libraryDetails,
} from "./polish-round3-cases.mjs";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5193";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Run against an explicit loopback origin.");
}
const output = await mkdtemp(join(tmpdir(), "reader-polish-"));
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const browser = await chromium.launch({ headless: true });
const results = [];

async function audit(page, state) {
  await page.evaluate(async () => {
    await Promise.all(
      globalThis.document
        .getAnimations()
        .filter((animation) => animation.effect.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(globalThis.document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    }));
  });
  assert.deepEqual(violations, [], `${state}: ${JSON.stringify(violations)}`);
}

async function trace(
  page,
  action,
  selector = ".mdbase-command-palette",
  trigger = ".header-command-button",
  pseudo = null,
) {
  return page.evaluate(
    async ({ action, selector, trigger, pseudo }) => {
      if (action === "open") {
        if (trigger === ".header-command-button")
          globalThis.document.querySelector(trigger).focus();
        globalThis.document.querySelector(trigger).click();
      } else if (action === "close")
        globalThis.document
          .querySelector(selector)
          .dispatchEvent(new Event("cancel", { cancelable: true }));
      const start = performance.now();
      const samples = [];
      while (performance.now() - start < 340) {
        await new Promise(globalThis.requestAnimationFrame);
        const panel = globalThis.document.querySelector(selector);
        samples.push({
          time: performance.now() - start,
          present: Boolean(panel?.checkVisibility()),
          opacity: panel ? Number(globalThis.getComputedStyle(panel, pseudo).opacity) : null,
          transform: panel ? globalThis.getComputedStyle(panel, pseudo).transform : null,
          transitionDuration: panel
            ? globalThis.getComputedStyle(panel, pseudo).transitionDuration
            : null,
          pseudo,
          animations: globalThis.document
            .getAnimations()
            .filter((animation) => animation.effect?.target === panel)
            .map((animation) => ({
              duration: animation.effect.getTiming().duration,
              property: animation.transitionProperty,
              currentTime: animation.currentTime,
            })),
        });
      }
      return samples;
    },
    { action, selector, trigger, pseudo },
  );
}

function assertMotion(samples, duration, reducedMotion) {
  if (reducedMotion === "reduce") {
    assert.ok(samples.every(({ animations }) => animations.length === 0));
    assert.ok(samples.every(({ opacity }) => opacity === null || opacity === 0 || opacity === 1));
  } else {
    assert.ok(
      samples.some(({ animations, pseudo, transitionDuration }) =>
        pseudo
          ? transitionDuration
              .split(",")
              .some((value) => Number.parseFloat(value) * 1000 === duration)
          : animations.some(
              (animation) => animation.duration === duration && animation.property === "opacity",
            ),
      ),
    );
    assert.ok(samples.some(({ opacity }) => opacity > 0 && opacity < 1));
  }
}

async function desktopPanes(page, output, name, reducedMotion) {
  console.log(`${name}: sidebar geometry`);
  const paneEnter = await geometry(page, "Toggle Sources sidebar", reducedMotion);
  const paneExit = await geometry(page, "Toggle Sources sidebar", reducedMotion);
  const notesEnter = await geometry(page, "Toggle Notes panel", reducedMotion);
  console.log(`${name}: margin positions`);
  await marginTicks(page);
  const notesExit = await geometry(page, "Toggle Notes panel", reducedMotion);
  await marginTicks(page);
  const interrupted = await interruptPane(page, reducedMotion);
  await page.getByRole("button", { name: "Toggle Sources sidebar" }).click();
  await page.getByRole("button", { name: "Toggle Notes panel" }).click();
  const inspector = page.getByRole("complementary", { name: "Source workspace" });
  console.log(`${name}: pane resizing`);
  await expect.poll(async () => Math.round((await inspector.boundingBox()).width)).toBe(340);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          globalThis.document
            .getAnimations()
            .filter((animation) => animation.effect.getTiming().iterations !== Infinity).length,
      ),
    )
    .toBe(0);
  const initialBounds = await inspector.boundingBox();
  console.log(`${name}: inspector bounds ${JSON.stringify(initialBounds)}`);
  await page.mouse.move(initialBounds.x, initialBounds.y + initialBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(1075, initialBounds.y + initialBounds.height / 2, { steps: 12 });
  await page.mouse.up();
  console.log(`${name}: resized`);
  await expect.poll(async () => (await inspector.boundingBox()).width).toBe(365);
  const widths = () =>
    page.locator(".dv-groupview-edge").evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.getAttribute("aria-label"),
        width: element.getBoundingClientRect().width,
      })),
    );
  const before = await widths();
  await page.setViewportSize({ width: 390, height: 844 });
  console.log(`${name}: phone layout`);
  await expect(page.locator(".reader-dock")).toHaveAttribute("data-mobile", "true");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(widths).toEqual(before);
  console.log(`${name}: desktop layout restored`);
  await inspector.getByRole("tab", { name: "Citation", exact: true }).click();
  await inspector.getByRole("button", { name: "Fix details", exact: true }).click();
  console.log(`${name}: citation edit`);
  const bounds = await inspector.boundingBox();
  await page.mouse.move(bounds.x, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(1260, bounds.y + bounds.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await inspector.boundingBox()).width).toBe(180);
  const controls = await inspector.locator("input,select,textarea,button").evaluateAll((elements) =>
    elements
      .filter((element) => element.checkVisibility())
      .map((element) => ({
        name: element.getAttribute("aria-label") ?? element.textContent,
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      })),
  );
  assert.ok(
    controls.every(({ left, right }) => left >= 1260 && right <= 1440),
    JSON.stringify(controls),
  );
  await page.screenshot({ path: join(output, `${name}-citation-180.png`) });
  await inspector.getByRole("button", { name: "Back to citation", exact: true }).click();
  await retainedCitation(page);
  const maximize = await geometry(page, "Maximize document", reducedMotion);
  const restore = await geometry(page, "Restore document panes", reducedMotion);
  return {
    paneEnter,
    interrupted,
    paneExit,
    notesEnter,
    notesExit,
    maximize,
    restore,
    before,
    after: await widths(),
    controls,
  };
}

async function command(page, query) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search sources and commands", exact: true })
    .fill(query);
  await expect(page.locator('[role="option"][aria-selected="true"] strong')).toContainText(
    new RegExp(query, "iu"),
  );
  await page.keyboard.press("Enter");
  await expect(page.locator(".mdbase-command-palette")).toBeHidden({ timeout: 30_000 });
}

try {
  await staticBoot(browser, origin);
  await bootFailure(browser, origin);
  const round5 = await round5Workspace(browser, origin);
  console.log(JSON.stringify({ round5 }));
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (const colorScheme of ["light", "dark"]) {
      for (const reducedMotion of ["no-preference", "reduce"]) {
        const name = `${String(viewport.width)}-${colorScheme}-${reducedMotion}`;
        const context = await browser.newContext({ viewport, colorScheme, reducedMotion });
        await installLocalPdfium(context);
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const result = { name, viewport, colorScheme, reducedMotion, errors };
        results.push(result);
        try {
          await page.goto(`${origin}/?preview=1`);
          await page.locator('.library-table[aria-label="Sources"]').waitFor();
          await page.evaluate(() => globalThis.document.fonts.ready);
          await round5Library(page);
          await page.addScriptTag({ path: axePath });
          await expect(page.getByRole("note")).toContainText("no collection connected");
          await expect(page.getByRole("button", { name: /Switch collection/u })).toHaveCount(0);
          await expect(page.locator(".connection-state")).toHaveCount(0);
          await round4Library(page);
          await audit(page, `${name} library`);
          await page.screenshot({ path: join(output, `${name}-library.png`) });
          await keyboardLibrary(page);
          await titleFocus(page);
          await libraryDetails(page);
          result.addSource = await addSourceTiming(page);
          result.removalContrast = await removeContrast(page, audit);
          result.enter = await trace(page, "open");
          const paletteBounds = await page.locator(".mdbase-command-palette").boundingBox();
          assert.ok(paletteBounds.y >= 0);
          assert.ok(paletteBounds.y + paletteBounds.height <= page.viewportSize().height - 16);
          const input = page.getByRole("combobox", {
            name: "Search sources and commands",
            exact: true,
          });
          await expect(input).toBeFocused();
          await input.fill("shortcuts");
          await expect(page.locator('[role="option"][aria-selected="true"] strong')).toHaveText(
            "Keyboard shortcuts",
          );
          await page.keyboard.press("Enter");
          await expect(
            page.getByRole("heading", { name: "Keyboard shortcuts", exact: true }),
          ).toBeVisible();
          await expect(page.locator(".reader-shortcut-help dl > div").first()).toBeVisible();
          await page.keyboard.press("Tab");
          await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
          result.paletteLayout = await page.locator(".reader-shortcut-dialog").evaluate((panel) => {
            const help = panel.querySelector(".reader-shortcut-help").getBoundingClientRect();
            const footer = panel.getBoundingClientRect();
            const active = panel.querySelector(".reader-shortcut-footer button");
            const bounds = active.getBoundingClientRect();
            return {
              helpTop: help.top,
              helpBottom: help.bottom,
              panelTop: footer.top,
              footerTop: footer.bottom,
              activeTop: bounds.top,
              activeBottom: bounds.bottom,
              activeHit: active.contains(
                globalThis.document.elementFromPoint(
                  bounds.left + bounds.width / 2,
                  bounds.top + bounds.height / 2,
                ),
              ),
            };
          });
          assert.ok(result.paletteLayout.helpTop >= result.paletteLayout.panelTop - 1);
          assert.ok(result.paletteLayout.helpBottom <= result.paletteLayout.footerTop + 1);
          assert.ok(result.paletteLayout.activeTop >= result.paletteLayout.helpBottom - 1);
          assert.ok(result.paletteLayout.activeBottom <= result.paletteLayout.footerTop + 1);
          assert.equal(result.paletteLayout.activeHit, true);
          await audit(page, `${name} palette`);
          await page.screenshot({ path: join(output, `${name}-palette.png`) });
          result.exit = await trace(page, "close", ".reader-shortcut-dialog");
          assert.equal(result.exit.at(-1).present, false);
          if (reducedMotion === "reduce") {
            assert.ok(result.enter.every(({ animations }) => animations.length === 0));
            assert.ok(result.exit.every(({ animations }) => animations.length === 0));
          } else {
            assert.ok(
              result.enter.some(({ animations }) =>
                animations.some(
                  ({ duration, property }) => duration === 160 && property === "opacity",
                ),
              ),
            );
            assert.ok(
              result.exit.some(({ animations }) =>
                animations.some(
                  ({ duration, property }) => duration === 120 && property === "opacity",
                ),
              ),
            );
            assert.ok(result.exit.some(({ opacity }) => opacity > 0 && opacity < 1));
          }
          result.interruption = await page.evaluate(async () => {
            globalThis.document.querySelector(".header-command-button").click();
            await new Promise(globalThis.requestAnimationFrame);
            await new Promise(globalThis.requestAnimationFrame);
            const panel = globalThis.document.querySelector(".mdbase-command-palette");
            panel.dispatchEvent(new Event("cancel", { cancelable: true }));
            await new Promise(globalThis.requestAnimationFrame);
            globalThis.document.querySelector(".header-command-button").click();
            await new Promise(globalThis.requestAnimationFrame);
            const same = panel === globalThis.document.querySelector(".mdbase-command-palette");
            await new Promise((resolve) => setTimeout(resolve, 240));
            return {
              same,
              open: Boolean(
                globalThis.document.querySelector(
                  '.mdbase-command-palette[open][data-open="true"]',
                ),
              ),
            };
          });
          if (reducedMotion !== "reduce") assert.equal(result.interruption.same, true);
          assert.equal(result.interruption.open, true);
          await page
            .getByRole("combobox", { name: "Search sources and commands", exact: true })
            .fill("settings");
          await expect(page.locator('[role="option"][aria-selected="true"] strong')).toHaveText(
            "Settings",
          );
          await page.getByRole("option", { name: "Settings", exact: true }).click();
          result.settingsEnter = await trace(page, "observe", "dialog.settings-page");
          await page.locator("dialog.settings-page").waitFor();
          await round5Settings(page);
          assertMotion(result.settingsEnter, 160, reducedMotion);
          await expect(page.locator(".mdbase-command-palette")).toBeHidden();
          await audit(page, `${name} settings`);
          await page.keyboard.press("Escape");
          result.settingsExit = await trace(page, "observe", "dialog.settings-page");
          await expect(page.locator("dialog.settings-page")).toHaveCount(0);
          assertMotion(result.settingsExit, 120, reducedMotion);
          await expect(page.getByRole("button", { name: /^Search and commands/u })).toBeFocused();
          const displayMenu = 'details.reader-menu:has(summary[aria-label="Display settings"])';
          const displayTrigger = `${displayMenu} > summary`;
          result.menuEnter = await trace(
            page,
            "open",
            displayMenu,
            displayTrigger,
            "::details-content",
          );
          result.menuExit = await trace(
            page,
            "open",
            displayMenu,
            displayTrigger,
            "::details-content",
          );
          assertMotion(result.menuEnter, 160, reducedMotion);
          assertMotion(result.menuExit, 120, reducedMotion);
          await page.getByRole("button", { name: /^Search and commands/u }).click();
          await page.keyboard.press("Escape");
          result.earlyEscape = await trace(page, "observe");
          assert.equal(result.earlyEscape.at(-1).present, false);
          await page.keyboard.press("Control+Shift+f");
          await expect(
            page.getByRole("combobox", { name: "Search sources and commands", exact: true }),
          ).toBeFocused();
          await page
            .getByRole("combobox", { name: "Search sources and commands", exact: true })
            .fill("psychology");
          await page.keyboard.press("Enter");
          await page.locator("iframe.html-viewer").waitFor();
          await expect(
            page
              .getByRole("status")
              .filter({ hasText: "Ready to read The Principles of Psychology" }),
          ).toHaveCount(1, { timeout: 30_000 });
          await expect(page.locator(".mdbase-command-palette")).toBeHidden();
          await readingKeys(page);
          await audit(page, `${name} HTML`);
          await page.screenshot({ path: join(output, `${name}-reading.png`) });
          if (viewport.width === 1440)
            result.panes = await desktopPanes(page, output, name, reducedMotion);
          if (viewport.width === 390) {
            result.autoHide = await autoHide(page, reducedMotion);
            result.targets = await page
              .locator(".reader-header button, .reader-header summary")
              .evaluateAll((elements) =>
                elements
                  .filter((element) => element.checkVisibility({ contentVisibilityAuto: true }))
                  .map((element) => ({
                    name: element.getAttribute("aria-label") ?? element.textContent,
                    width: element.getBoundingClientRect().width,
                    height: element.getBoundingClientRect().height,
                  })),
              );
            assert.ok(
              result.targets.every(({ width, height }) => width >= 44 && height >= 44),
              JSON.stringify(result.targets),
            );
          }
          await command(page, "citation details");
          await page.locator(".citation-editor").waitFor();
          await audit(page, `${name} citation`);
          await command(page, "anthology");
          await page
            .locator("embedpdf-container")
            .getByRole("article", { name: "PDF page text" })
            .waitFor();
          await expect(
            page
              .locator("embedpdf-container")
              .getByRole("heading", { name: "Page 24", exact: true }),
          ).toHaveCount(1);
          await page
            .locator("embedpdf-container")
            .getByRole("textbox", { name: "Page", exact: true })
            .waitFor();
          await expect(
            page
              .locator("embedpdf-container")
              .getByRole("region", { name: "PDF pages", exact: true }),
          ).toBeFocused();
          await page.keyboard.press("PageDown");
          await expect
            .poll(() =>
              page
                .locator("embedpdf-container")
                .evaluate(
                  (host) =>
                    host.shadowRoot.querySelector('[role="region"][aria-label="PDF pages"]')
                      .scrollTop,
                ),
            )
            .toBeGreaterThan(0);
          await audit(page, `${name} PDF`);
          console.log(`${name}: PDF sheet`);
          if (viewport.width === 390)
            result.pdfSheet = await pdfSheet(page, reducedMotion, true, audit);
          if (viewport.width === 1440) await pdfHighlightKey(page);
          if (viewport.width === 1440) await desktopPdfNavigation(page);
          result.pdf = await page.locator("embedpdf-container").evaluate((host) => ({
            pages: host.shadowRoot.querySelectorAll("article section").length,
            firstText: host.shadowRoot.querySelector("article p").textContent,
            pageInput: host.shadowRoot
              .querySelector('[data-epdf-i="reader-page-controls"] input')
              .getAttribute("aria-label"),
            scrollTop: host.shadowRoot.querySelector('[role="region"][aria-label="PDF pages"]')
              .scrollTop,
          }));
          assert.ok(result.pdf.scrollTop > 0);
          assert.equal(errors.length, 0, errors.join("\n"));
          assert.equal(
            await page.evaluate(
              () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
            ),
            true,
          );
          await page.screenshot({ path: join(output, `${name}-pdf.png`) });
          await offlinePdf(context, origin, command);
          result.passed = true;
        } catch (error) {
          console.error(name, error);
          result.overlays = await page.locator(".reader-overlay").evaluateAll((elements) =>
            elements.map((element) => ({
              state: element.getAttribute("data-state"),
              child: element.firstElementChild?.className,
              opacity: element.firstElementChild
                ? globalThis.getComputedStyle(element.firstElementChild).opacity
                : null,
              animations: element.getAnimations({ subtree: true }).map((animation) => ({
                target: animation.effect?.target?.className,
                state: animation.playState,
                time: animation.currentTime,
                timing: animation.effect?.getComputedTiming(),
              })),
            })),
          );
          await page.screenshot({ path: join(output, `${name}-failure.png`) });
          result.failure = String(error);
          console.error(name, error);
        } finally {
          await context.close();
          await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2));
        }
      }
    }
  }
} finally {
  await browser.close();
}
console.log(
  JSON.stringify({
    output,
    passed: results.filter(({ passed }) => passed).length,
    total: results.length,
  }),
);
process.exitCode = results.every(({ passed }) => passed) ? 0 : 1;
