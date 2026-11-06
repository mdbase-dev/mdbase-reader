import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function round5Library(page) {
  const rows = page.locator(".library-table-row[data-row-index]");
  await page.keyboard.press("j");
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press("x");
  await expect(rows.nth(0)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("j");
  await expect(rows.nth(1)).toBeFocused();
  await expect(rows.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(rows.nth(1)).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("k");
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press("x");
  await expect(rows.nth(0)).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Shift+F10");
  const menu = page.locator(".library-row-menu");
  await expect(menu).toBeVisible();
  const entrance = await menu.evaluate(
    (element) => globalThis.getComputedStyle(element).transition,
  );
  if (
    await page.evaluate(() => !globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches)
  ) {
    assert.match(entrance, /transform 0.16s cubic-bezier\(0.22, 1, 0.36, 1\)/u);
  }
  await page.keyboard.press("Escape");
  await expect(rows.nth(0)).toBeFocused();
  await bodyFocus(page);
  await page.keyboard.press("s");
  await page.getByRole("option", { name: "Queued", exact: true }).click();
  await expect(rows.nth(0)).toBeFocused();
  await expect(page.locator("#reader-notices")).toContainText("Queued");
  const checkSize = await page
    .locator(".library-column-menu > summary svg")
    .first()
    .evaluate((element) => {
      const style = globalThis.getComputedStyle(element);
      return { width: style.width, height: style.height };
    });
  assert.deepEqual(checkSize, { width: "14px", height: "14px" });
  const motion = await page.locator(".highlight-saved").evaluate((element) => {
    const effect = element
      .getAnimations()
      .find(
        (animation) =>
          animation.effect?.target === element && animation.transitionProperty === "translate",
      )?.effect;
    return {
      effectCurve: effect?.getTiming().easing,
      duration: effect?.getTiming().duration,
      translations: effect
        ?.getKeyframes()
        .map((frame) => frame.translate)
        .filter(Boolean),
    };
  });
  if (
    await page.evaluate(() => !globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches)
  ) {
    assert.equal(motion.effectCurve, "cubic-bezier(0.22, 1, 0.36, 1)");
    assert.equal(motion.duration, 220);
    assert.deepEqual(motion.translations, ["0px 8px", "none"]);
  }
  await page.keyboard.press("Control+z");
  await expect(page.locator("#reader-notices")).toContainText("Restored the status");
  await bodyFocus(page);
  await page.keyboard.press("a");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const sidebar = page.getByRole("button", { name: "Toggle Sources sidebar", exact: true });
  const expanded = await sidebar.getAttribute("aria-expanded");
  await bodyFocus(page);
  await page.keyboard.press("[");
  await expect(sidebar).toHaveAttribute("aria-expanded", expanded === "true" ? "false" : "true");
  await page.keyboard.press("[");
  await expect(
    page.locator("#reader-library-navigator h2").filter({ hasText: /^Views$/u }),
  ).toHaveCount(0);
  if (page.viewportSize().width <= 680) {
    const statuses = await rows.locator(".library-status").evaluateAll((elements) =>
      elements.map((element) => ({
        kind: element.className,
        left: element.getBoundingClientRect().x,
        mark: element.querySelector(".library-status-mark").getBoundingClientRect().x,
      })),
    );
    assert.ok(new Set(statuses.map(({ kind }) => kind)).size >= 3);
    const positions = statuses.map(({ left }) => left);
    assert.ok(
      Math.max(...positions) - Math.min(...positions) <= 1,
      "Phone status column stays fixed",
    );
    const marks = statuses.map(({ mark }) => mark);
    assert.ok(Math.max(...marks) - Math.min(...marks) <= 1, "Phone status marks align");
    const readingLabel = await rows
      .locator(".library-status.is-reading .mdbase-select-value")
      .evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
    assert.ok(readingLabel.width >= readingLabel.content, "Phone Reading label stays complete");
  }
  await libraryView(page, "Visual library");
  const tiles = page.locator(".library-card-bookplate");
  await expect(tiles.first()).toBeVisible();
  await expect(tiles.locator("strong")).toHaveCount(0);
  assert.ok((await tiles.allTextContents()).every((text) => text.trim() && text.trim() !== "—"));
  await libraryView(page, "All sources");
  await round5AnnotationAlignment(page);
  await page.reload();
  await page.locator('.library-table[aria-label="Sources"]').waitFor();
  const add = page.getByRole("button", { name: "Add source…", exact: true }).first();
  await add.focus();
  for (const key of ["Delete", "F2"]) {
    await page.keyboard.press(key);
    await expect(add).toBeFocused();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  }
}

async function bodyFocus(page) {
  await page.evaluate(() => {
    globalThis.document.body.tabIndex = -1;
    globalThis.document.body.focus();
  });
}

export async function bootFailure(browser, origin) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.route("**/assets/index-*.js", (route) => route.abort());
    await page.goto(`${origin}/?preview=1`);
    await expect(page.locator(".reader-boot-failure")).toContainText("Reader could not start");
    await page.locator(".reader-boot summary").click();
    await expect(
      page.getByRole("link", { name: "Try Reader with a sample library" }),
    ).toHaveAttribute("href", "?preview=1");
    const bounds = await page.locator(".reader-boot").boundingBox();
    assert.equal(bounds.height, page.viewportSize().height);
  } finally {
    await context.close();
  }
}

export async function round5Workspace(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await context.addInitScript(() => {
      globalThis.readerLayoutShift = 0;
      new globalThis.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            globalThis.readerLayoutShift += entry.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    const page = await context.newPage();
    await page.goto(`${origin}/?preview=1`);
    await page.locator('.library-table[aria-label="Sources"]').waitFor();
    await page.evaluate(() => globalThis.document.fonts.ready);
    await page.waitForTimeout(250);
    const cls = await page.evaluate(() => globalThis.readerLayoutShift);
    assert.ok(cls < 0.005, `Startup CLS ${cls}`);
    await page.clock.install();
    await page.evaluate(() => {
      const event = new globalThis.Event("beforeinstallprompt", { cancelable: true });
      event.prompt = () => Promise.resolve();
      event.userChoice = Promise.resolve({ outcome: "dismissed" });
      globalThis.dispatchEvent(event);
    });
    await page.locator(".library-search-field input").focus();
    await page.keyboard.press("F6");
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(globalThis.document.activeElement.closest(".reader-dock-sidebar")),
        ),
      )
      .toBe(true);
    await page.keyboard.press("F6");
    await expect(page.locator('.library-table-row[tabindex="0"]')).toBeFocused();
    await command(page, "psychology");
    await page.locator("iframe.html-viewer").waitFor();
    const heading = await page.locator("iframe.html-viewer").evaluate((element) => {
      const body = element.contentDocument.body;
      const title = body.querySelector("h1");
      return {
        bodyFont: element.contentWindow.getComputedStyle(body).fontFamily,
        titleFont: element.contentWindow.getComputedStyle(title).fontFamily,
        titleSize: Number.parseFloat(element.contentWindow.getComputedStyle(title).fontSize),
      };
    });
    assert.equal(heading.titleFont, heading.bodyFont);
    assert.ok(heading.titleSize <= 48);
    await page.clock.fastForward(31_000);
    await expect(page.locator(".pwa-install")).toHaveCount(0);
    await command(page, "Open library");
    await page.clock.fastForward(31_000);
    await expect(page.locator(".pwa-install")).toBeVisible();
    await page
      .locator(".pwa-install")
      .getByRole("button", { name: "Not now", exact: true })
      .click();
    await command(page, "psychology");
    await command(page, "Open beside");
    await expect(page.locator("iframe.html-viewer")).toHaveCount(2);
    await expect
      .poll(() => page.evaluate(() => globalThis.document.activeElement.tagName))
      .toBe("IFRAME");
    const before = await page.locator(".workspace-pane.is-focused").getAttribute("data-session-id");
    await page.keyboard.press("F6");
    await expect(page.locator(".workspace-pane.is-focused")).not.toHaveAttribute(
      "data-session-id",
      before,
    );
    await expect
      .poll(() => page.evaluate(() => globalThis.document.activeElement.tagName))
      .toBe("IFRAME");
    await page.reload();
    await page.getByRole("button", { name: /^Search and commands/u }).waitFor();
    await command(page, "Open library");
    const row = page.locator(".library-table-row[data-row-index]").first();
    await row.focus();
    await expect(row).toBeFocused();
    const title = await row.locator(".library-title-copy strong").innerText();
    await page.keyboard.press("Delete");
    const dialog = page.locator("dialog.source-removal-dialog");
    await dialog.getByRole("button", { name: "Remove source", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".library-table-row").filter({ hasText: title })).toHaveCount(0);
    await expect(page.locator('.library-table-row[tabindex="0"]')).toBeFocused();
    await expect(page.locator("#reader-notices")).toContainText(`Removed “${title}”.`);
    await command(page, "psychology");
    const notes = page.getByRole("button", { name: "Toggle Notes panel", exact: true });
    if ((await notes.getAttribute("aria-pressed")) === "false") {
      await notes.click();
    }
    await expect(notes).toHaveAttribute("aria-pressed", "true");
    await command(page, "Remove current source");
    await page
      .locator("dialog.source-removal-dialog")
      .getByRole("button", { name: "Remove source", exact: true })
      .click();
    await expect(page.locator("dialog.source-removal-dialog")).toHaveCount(0);
    await expect(notes).toHaveAttribute("aria-pressed", "false");
    return {
      cls,
      inputF6: true,
      iframeF6: true,
      removalFocus: true,
      removedNotes: true,
      installSuppressed: true,
    };
  } finally {
    await context.close();
  }
}

export async function round5Settings(page) {
  const language = page.locator(".reader-language-setting > label");
  await expect(language).toBeVisible();
  const labelStyle = await language.evaluate((element) => {
    const style = globalThis.getComputedStyle(element);
    const legend = globalThis.getComputedStyle(
      globalThis.document.querySelector(".display-choice legend"),
    );
    return {
      size: style.fontSize,
      weight: style.fontWeight,
      legendSize: legend.fontSize,
      legendWeight: legend.fontWeight,
    };
  });
  assert.equal(labelStyle.size, labelStyle.legendSize);
  assert.equal(labelStyle.weight, labelStyle.legendWeight);
}

export async function round5AnnotationAlignment(page) {
  const mode = page.locator(".library-mode");
  await mode.getByRole("button", { name: "Annotations", exact: true }).click();
  const chip = page.locator('[role="gridcell"].annotation-kind').first();
  if (page.viewportSize().width <= 680) {
    await expect(page.locator(".library-annotation-passage").first()).toBeVisible();
    await expect(chip).toBeHidden();
  } else {
    await expect(chip).toBeVisible();
    const alignment = await chip.evaluate((element) => {
      const style = globalThis.getComputedStyle(element);
      return { self: style.alignSelf, items: style.alignItems };
    });
    assert.deepEqual(alignment, { self: "start", items: "baseline" });
  }
  await mode.getByRole("button", { name: "Sources", exact: true }).click();
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
  await expect(page.locator(".mdbase-command-palette")).toBeHidden();
}

async function libraryView(page, name) {
  const sidebar = page.getByRole("button", { name: "Toggle Sources sidebar", exact: true });
  if ((await sidebar.getAttribute("aria-expanded")) === "false") {
    await sidebar.click();
  }
  await page
    .locator("#reader-library-navigator")
    .getByRole("button", { name, exact: true })
    .click();
}
