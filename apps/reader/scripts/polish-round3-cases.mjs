import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { assertPdfTabContrast } from "./polish-round4-cases.mjs";

export async function keyboardLibrary(page) {
  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("j");
  await expect(page.locator('.library-table-row[tabindex="0"]')).toBeFocused();
  await page.locator(".workspace-pane.is-focused .library-table").focus();
  await page.keyboard.press("j");
  await expect(page.locator('.library-table-row[tabindex="0"]')).toBeFocused();
  await activateRowAndReturn(page);
  const search = page.locator(".library-search-field input").first();
  await search.focus();
  await search.fill("psychology");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('.library-table-row[tabindex="0"]')).toBeFocused();
  await activateRowAndReturn(page);
  await search.focus();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(page.locator('.library-table-row[tabindex="0"]')).toBeFocused();
  await page.keyboard.press("Control+/");
  await expect(
    page.getByRole("heading", { name: "Keyboard shortcuts", exact: true }),
  ).toBeVisible();
  assert.ok(
    (await page.locator(".reader-shortcut-dialog kbd").allTextContents()).every(
      (label) => !/mod\+|Arrow(?:Left|Right)|ctrl\+/u.test(label),
    ),
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}

async function activateRowAndReturn(page) {
  const title = await page
    .locator('.library-table-row[tabindex="0"] .library-title-copy strong')
    .innerText();
  await page.keyboard.press("Enter");
  await expect(
    page
      .locator('.workspace-pane.is-document-pane.is-focused .sr-only[role="status"]')
      .filter({ hasText: `Ready to read ${title}` }),
  ).toContainText(`Ready to read ${title}`);
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search sources and commands", exact: true })
    .fill("Close active tab");
  await page.keyboard.press("Enter");
  await expect(page.locator(".mdbase-command-palette")).toBeHidden();
  await expect(page.locator(".workspace-pane.is-library-pane.is-focused")).toBeVisible();
}

export async function libraryDetails(page) {
  if (page.viewportSize().width <= 680) {
    const targets = await page
      .locator(
        ".library-workspace-header button, .library-workspace-header summary, .library-workspace-header input",
      )
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.checkVisibility())
          .map((element) => ({
            name: element.getAttribute("aria-label"),
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          })),
      );
    assert.ok(targets.length > 0);
    assert.ok(
      targets.every(({ width, height }) => width >= 44 && height >= 44),
      JSON.stringify(targets),
    );
    return;
  }
  const sidebar = page.locator("#reader-library-navigator");
  const resizer = page.locator(".library-column-resizer").first();
  await expect(resizer).toHaveAttribute("tabindex", "-1");
  const width = Number(await resizer.getAttribute("aria-valuenow"));
  await page.locator(".library-column-sort").first().focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(resizer).toHaveAttribute("aria-valuenow", String(width + 16));
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(resizer).toHaveAttribute("aria-valuenow", String(width));
  const visible = await sidebar.isVisible();
  if (!visible) await page.keyboard.press("Control+Backslash");
  await expect(sidebar).toBeVisible();
  const views = sidebar.locator(".navigator-view-section > div > button");
  const tabs = await page.locator(".dv-tab").count();
  for (const index of [1, 0]) {
    await views.nth(index).focus();
    await page.keyboard.press("Enter");
    await expect(views.nth(index)).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".dv-tab")).toHaveCount(tabs);
  }
  if (!visible) await page.keyboard.press("Control+Backslash");
}

export async function titleFocus(page) {
  await page
    .locator(".library-source-link")
    .filter({ hasText: "The Principles of Psychology" })
    .click();
  await page.locator("iframe.html-viewer").waitFor();
  await expect
    .poll(() =>
      page
        .locator("iframe.html-viewer")
        .evaluate(
          (frame) =>
            globalThis.document.activeElement === frame &&
            frame.contentDocument.activeElement === frame.contentDocument.body,
        ),
    )
    .toBe(true);
  if (page.viewportSize().width > 680) {
    const tab = page.getByRole("tab", { name: "The Principles of Psychology", exact: true });
    await tab.focus();
    await page.keyboard.press("Delete");
    await expect(tab).toHaveCount(0);
  } else {
    await page.keyboard.press("Control+k");
    await page
      .getByRole("combobox", { name: "Search sources and commands", exact: true })
      .fill("Close active tab");
    await page.keyboard.press("Enter");
    await expect(page.locator(".mdbase-command-palette")).toBeHidden();
  }
  await expect(page.locator('.library-table-row[tabindex="0"]')).toBeFocused();
  await page.keyboard.press("j");
  await expect(page.locator('.library-table-row[tabindex="0"]')).toBeFocused();
  await page.locator(".workspace-pane.is-focused .library-table").focus();
  await page.keyboard.press("j");
  await expect(page.locator('.library-table-row[tabindex="0"]')).toBeFocused();
}

export async function autoHide(page, reducedMotion) {
  const frame = page.locator("iframe.html-viewer");
  await page.frameLocator("iframe.html-viewer").locator("p").first().waitFor();
  await page.evaluate(async () => {
    const start = performance.now();
    while (performance.now() - start < 350) {
      await new Promise(globalThis.requestAnimationFrame);
    }
  });
  const box = await frame.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const samples = await sampleAction(
    page,
    async () => {
      await page.mouse.wheel(0, 48);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
          ),
      );
      await page.mouse.wheel(0, 400);
    },
    "iframe.html-viewer",
  );
  await expect(page.locator(".reader-shell")).toHaveAttribute("data-chrome-hidden", "");
  const first = samples[0].height;
  const last = samples.at(-1).height;
  assert.ok(
    last > first,
    `Auto-hide must return chrome space to the document: ${JSON.stringify(samples)}`,
  );
  if (reducedMotion === "reduce") {
    assert.ok(samples.every(({ animations }) => animations.length === 0));
  } else {
    assert.ok(samples.some(({ height }) => height > first + 2 && height < last - 2));
    assert.ok(
      samples.some(({ animations }) => animations.some(({ duration }) => duration === 220)),
    );
  }
  return samples;
}

export async function sampleAction(page, action, selector, shadow = false) {
  console.log(`Sampling ${selector}`);
  await page.evaluate(() => {
    globalThis.readerMotionSampling = false;
  });
  const sampling = page.evaluate(
    async ({ selector, shadow }) => {
      const samples = [];
      const start = performance.now();
      globalThis.readerMotionSampling = true;
      while (performance.now() - start < 400) {
        const element = globalThis.document.querySelector(selector);
        const root = shadow ? element?.shadowRoot : globalThis.document;
        const animations = root?.getAnimations() ?? [];
        const notes = globalThis.document.querySelector(
          '.dv-render-overlay:has([data-reader-edge="right"])',
        );
        samples.push({
          time: performance.now() - start,
          width: element?.getBoundingClientRect().width,
          height: element?.getBoundingClientRect().height,
          x: element?.getBoundingClientRect().x,
          notes: notes
            ? {
                x: notes.getBoundingClientRect().x,
                width: notes.getBoundingClientRect().width,
                opacity: Number(globalThis.getComputedStyle(notes).opacity),
                visibility: globalThis.getComputedStyle(notes).visibility,
                closing: notes.querySelector('[data-visible="false"]') !== null,
              }
            : null,
          animations: animations.map((animation) => ({
            property: animation.transitionProperty,
            duration: animation.effect.getTiming().duration,
            easing: animation.effect.getTiming().easing,
            keyframeEasings: animation.effect.getKeyframes().map(({ easing }) => easing),
            target: animation.effect.target?.className,
            edge:
              animation.effect.target?.getAttribute("data-reader-edge") ??
              animation.effect.target
                ?.querySelector("[data-reader-edge]")
                ?.getAttribute("data-reader-edge"),
          })),
        });
        await new Promise(globalThis.requestAnimationFrame);
      }
      return samples;
    },
    { selector, shadow },
  );
  await page.waitForFunction(() => globalThis.readerMotionSampling);
  await action();
  return sampling;
}

export async function interruptPane(page, reducedMotion) {
  const button = page.getByRole("button", { name: "Toggle Notes panel", exact: true });
  await button.focus();
  const samples = await sampleAction(
    page,
    async () => {
      await page.keyboard.press("Enter");
      await page.evaluate(async () => {
        for (let frame = 0; frame < 4; frame += 1) {
          await new Promise(globalThis.requestAnimationFrame);
        }
      });
      await page.keyboard.press("Enter");
    },
    "iframe.html-viewer",
  );
  const first = samples[0].width;
  const narrowest = Math.min(...samples.map(({ width }) => width));
  assert.ok(narrowest < first - 2, "The pane must start opening before it is interrupted");
  assert.ok(
    Math.abs(samples.at(-1).width - first) < 1,
    "An interrupted pane returns without jumping",
  );
  if (reducedMotion === "reduce") {
    assert.ok(samples.every(({ animations }) => animations.length === 0));
  } else {
    assert.ok(samples.some(({ width }) => width > narrowest + 2 && width < first - 2));
    assert.ok(
      samples.some(({ animations }) => animations.some(({ duration }) => duration === 220)),
    );
  }
  return samples;
}

export async function geometry(page, button, reducedMotion) {
  const trigger = page.getByRole("button", { name: button, exact: true });
  await trigger.focus();
  const samples = await sampleAction(
    page,
    () => page.keyboard.press("Enter"),
    "iframe.html-viewer",
  );
  const first = samples[0].width;
  const last = samples.at(-1).width;
  assert.notEqual(first, last, `${button}: pane geometry must change`);
  if (button === "Toggle Notes panel") {
    const notesSamples = samples.map(({ notes }) => notes).filter(Boolean);
    assert.ok(notesSamples.length > 0, "Notes must mount when toggled");
    assert.ok(
      notesSamples.every(({ x }) => x >= 680),
      `Notes must travel from their own edge, never across the reading pane: ${JSON.stringify(notesSamples)}`,
    );
    if (last > first && reducedMotion !== "reduce")
      assert.ok(
        notesSamples.some(
          ({ closing, opacity, visibility }) => closing && opacity > 0 && visibility === "visible",
        ),
        "Closing Notes must remain visible during their exit",
      );
  }
  if (reducedMotion === "reduce") {
    assert.ok(
      samples.every(
        ({ animations }) =>
          !animations.some(({ property }) => /width|left|height|top/u.test(property)),
      ),
    );
  } else {
    assert.ok(
      samples.some(
        ({ width }) => width > Math.min(first, last) + 2 && width < Math.max(first, last) - 2,
      ),
      `${button}: missing intermediate geometry`,
    );
    assert.ok(
      samples.some(({ animations }) =>
        animations.some(
          ({ duration, property }) => duration === 220 && /width|left|height|top/u.test(property),
        ),
      ),
      `${button}: missing 220ms layout transition`,
    );
  }
  return samples;
}

export async function addSourceTiming(page) {
  const probe = await page.context().newPage();
  let blankFrame;
  try {
    blankFrame = await probe.evaluate(async () => {
      const frames = [];
      let previous = await new Promise(globalThis.requestAnimationFrame);
      for (let index = 0; index < 12; index += 1) {
        const current = await new Promise(globalThis.requestAnimationFrame);
        frames.push(current - previous);
        previous = current;
      }
      return frames.toSorted((left, right) => left - right)[6];
    });
  } finally {
    await probe.close();
    await page.bringToFront();
  }
  const trigger = page.getByRole("button", { name: "Add source…", exact: true }).first();
  await trigger.focus();
  await page.evaluate(() => {
    globalThis.readerDialogStart = 0;
    globalThis.document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") globalThis.readerDialogStart = performance.now();
      },
      { once: true, capture: true },
    );
    globalThis.readerDialogTiming = new Promise((resolve) => {
      const observer = new globalThis.MutationObserver(() => {
        if (globalThis.document.querySelector("dialog.source-add-dialog[open]")) {
          observer.disconnect();
          resolve(performance.now() - globalThis.readerDialogStart);
        }
      });
      observer.observe(globalThis.document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["open"],
      });
    });
  });
  await page.keyboard.press("Enter");
  const elapsed = await page.evaluate(() => globalThis.readerDialogTiming);
  const normalized = elapsed / Math.max(1, blankFrame / (1000 / 60));
  assert.ok(
    normalized < 50,
    `Add source ${elapsed}ms, blank frame ${blankFrame}ms, normalized ${normalized}ms`,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.source-add-dialog")).toHaveCount(0);
  return { elapsed, blankFrame, normalized };
}

export async function pdfSheet(page, reducedMotion, phone, audit) {
  const host = page.locator("embedpdf-container");
  const sidebar = host.getByRole("button", { name: "Sidebar", exact: true });
  await sidebar.focus();
  const samples = await sampleAction(
    page,
    () => page.keyboard.press("Enter"),
    "embedpdf-container",
    true,
  );
  const dialog = host.getByRole("dialog", { name: "PDF navigation" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Thumbnails" })).toHaveCount(1);
  await expect(dialog.getByRole("tab", { name: "Outline" })).toHaveCount(1);
  assert.ok(
    await dialog.evaluate((element) => element.contains(element.getRootNode().activeElement)),
  );
  const thumbnailTab = dialog.getByRole("tab", { name: "Thumbnails", exact: true });
  const outlineTab = dialog.getByRole("tab", { name: "Outline", exact: true });
  for (const tab of [thumbnailTab, outlineTab]) {
    assert.ok((await tab.boundingBox()).height >= 44);
  }
  await thumbnailTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(outlineTab).toBeFocused();
  await page.keyboard.press("Home");
  await expect(thumbnailTab).toBeFocused();
  await assertPdfTabContrast(thumbnailTab);
  await page.keyboard.press("Tab");
  const thumbnails = dialog.getByRole("tabpanel", { name: "Thumbnails", exact: true });
  await expect(thumbnails).toBeFocused();
  await expect
    .poll(() => thumbnails.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0);
  await page.keyboard.press("PageDown");
  await expect.poll(() => thumbnails.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("Tab");
  assert.ok(
    await dialog.evaluate((element) => element.contains(element.getRootNode().activeElement)),
  );
  await audit(page, "PDF navigation sheet");
  if (reducedMotion === "reduce")
    assert.ok(samples.every(({ animations }) => animations.length === 0));
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(sidebar).toBeFocused();
  const targets = await host
    .locator(
      '[data-epdf-i="reader-navigation"] button, [data-epdf-i="reader-page-controls"] button, [data-epdf-i="reader-page-controls"] input',
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.checkVisibility())
        .map((element) => ({
          label: element.getAttribute("aria-label"),
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        })),
    );
  if (phone) assert.ok(targets.some(({ label }) => label === "Page"));
  if (phone)
    assert.ok(
      targets.every(({ width, height }) => width >= 44 && height >= 44),
      JSON.stringify(targets),
    );
  return { samples, targets };
}

export async function removeContrast(page, audit) {
  await page.locator('.library-table-row[tabindex="0"]').focus();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: /Remove source/u })).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog.source-removal-dialog");
  await dialog.waitFor();
  await audit(page, "source removal contrast");
  const contrast = await dialog
    .getByRole("button", { name: "Remove source", exact: true })
    .evaluate((element) => {
      const style = globalThis.getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor };
    });
  assert.notEqual(contrast.color, contrast.background);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.library-table-row[tabindex="0"]')).toBeFocused();
  return contrast;
}

export async function pdfHighlightKey(page) {
  const host = page.locator("embedpdf-container");
  const input = host.getByRole("textbox", { name: "Page", exact: true });
  await input.fill("1");
  await input.press("Enter");
  await expect
    .poll(() =>
      host
        .getByRole("region", { name: "PDF pages", exact: true })
        .evaluate((element) => element.scrollTop),
    )
    .toBeLessThan(20);
  const point = await host.evaluate(async (element) => {
    const registry = await element.registry;
    const doc = registry.getPlugin("document-manager").provides().getActiveDocument();
    const geometry = await registry.getEngine().getPageGeometry(doc, doc.pages[0]).toPromise();
    const glyph = geometry.runs
      .flatMap((run) => run.glyphs)
      .find((glyph) => glyph.width > 4 && glyph.y > 80);
    const position = registry
      .getPlugin("scroll")
      .provides()
      .getRectPositionForPage(0, {
        origin: { x: glyph.x + glyph.width / 2, y: glyph.y + glyph.height / 2 },
        size: { width: 0, height: 0 },
      }).origin;
    const box = [...element.shadowRoot.querySelectorAll("div[style]")]
      .find(
        (candidate) =>
          candidate.style.marginLeft === "auto" && candidate.style.position === "relative",
      )
      .getBoundingClientRect();
    return { x: box.left + position.x, y: box.top + position.y };
  });
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.locator(".selection-toolbar").first()).toBeVisible();
  const selection = await host.evaluate((element) => {
    const swatch = globalThis.document.createElement("span");
    swatch.style.backgroundColor = "var(--color-selected)";
    globalThis.document.body.append(swatch);
    const expected = globalThis.getComputedStyle(swatch).backgroundColor;
    swatch.remove();
    const fills = [
      ...element.shadowRoot.querySelectorAll('div[style*="background: rgb(33, 150, 243)"]'),
    ];
    return {
      expected,
      colors: fills.map((fill) => globalThis.getComputedStyle(fill).backgroundColor),
    };
  });
  assert.ok(selection.colors.length > 0);
  assert.ok(
    selection.colors.every((color) => color === selection.expected),
    JSON.stringify(selection),
  );
  const toast = await sampleAction(page, () => page.keyboard.press("h"), ".highlight-saved");
  await expect(page.locator(".highlight-saved")).toBeVisible();
  const reduced = await page.evaluate(
    () => globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  if (reduced) {
    assert.ok(toast.every(({ animations }) => animations.length === 0));
  } else {
    assert.ok(
      toast.some(({ animations }) =>
        animations.some(
          ({ duration, easing, keyframeEasings }) =>
            duration === 220 &&
            (easing !== "linear" || keyframeEasings.some((value) => value !== "linear")),
        ),
      ),
    );
  }
}

export async function marginTicks(page) {
  await expect
    .poll(() =>
      page.locator("iframe.html-viewer").evaluate((frame) => {
        const doc = frame.contentDocument;
        const markers = [...doc.querySelectorAll('[data-mdbase-reader="margin"] > span')];
        const paragraph = doc.querySelector("p");
        if (!markers.length || !paragraph) return false;
        const left = paragraph.getBoundingClientRect().left;
        return markers.every(
          (marker) => Math.abs(marker.getBoundingClientRect().left - Math.max(4, left - 14)) < 2,
        );
      }),
    )
    .toBe(true);
}
