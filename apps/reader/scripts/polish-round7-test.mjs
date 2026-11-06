import assert from "node:assert/strict";
import { loadavg } from "node:os";
import { chromium, expect } from "@playwright/test";

assert.ok(
  loadavg().every((load) => load < 20),
  "Timing gates require load under 20.",
);
const browser = await chromium.launch({ headless: true });
const evidence = [];

async function paintedPixels(page, icon) {
  const box = await icon.boundingBox();
  const painted = await page.screenshot({ clip: box });
  await icon.evaluate((element) => {
    element.style.visibility = "hidden";
  });
  const blank = await page.screenshot({ clip: box });
  await icon.evaluate((element) => {
    element.style.removeProperty("visibility");
  });
  return page.evaluate(
    async ([painted, blank]) => {
      const pixels = async (bytes) => {
        const image = new globalThis.Image();
        image.src = `data:image/png;base64,${bytes}`;
        await image.decode();
        const canvas = globalThis.document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const before = await pixels(painted);
      const after = await pixels(blank);
      let changed = 0;
      for (let offset = 0; offset < before.length; offset += 4) {
        if (
          before
            .slice(offset, offset + 3)
            .some((value, channel) => Math.abs(value - after[offset + channel]) > 12)
        )
          changed += 1;
      }
      return changed;
    },
    [painted.toString("base64"), blank.toString("base64")],
  );
}

try {
  for (const width of [1440, 390]) {
    for (const colorScheme of ["light", "dark"]) {
      for (const reducedMotion of ["no-preference", "reduce"]) {
        const page = await browser.newPage({
          viewport: { width, height: width === 1440 ? 900 : 844 },
          colorScheme,
          reducedMotion,
        });
        await page.goto("http://127.0.0.1:5193/?preview=1");
        const rows = page.locator(".library-table-row[data-row-index]");
        await rows.first().waitFor();
        await expect(page.locator(".workspace-pane.is-focused")).toBeFocused();
        const result = { width, colorScheme, reducedMotion };
        if (width === 1440) {
          result.glyphPixels = [];
          for (const icon of await page.locator(".navigator-view-section button > svg").all()) {
            const pixels = await paintedPixels(page, icon);
            assert.ok(pixels >= 12, `Invisible sidebar glyph: ${pixels} painted pixels`);
            result.glyphPixels.push(pixels);
          }
          assert.equal(result.glyphPixels.length, 3);
          result.activeFill = await page
            .locator('.navigator-view-section button[aria-current="page"]')
            .evaluate(async (element) => {
              await Promise.all(element.getAnimations().map((animation) => animation.finished));
              const style = globalThis.getComputedStyle(element);
              const context = globalThis.document.createElement("canvas").getContext("2d");
              assertOpaqueFill(style.backgroundColor);
              function assertOpaqueFill(color) {
                context.clearRect(0, 0, 1, 1);
                context.fillStyle = color;
                context.fillRect(0, 0, 1, 1);
                if (context.getImageData(0, 0, 1, 1).data[3] !== 255) {
                  throw new Error(`Active items require an opaque plain fill: ${color}`);
                }
              }
              const luminance = (color) => {
                context.clearRect(0, 0, 1, 1);
                context.fillStyle = color;
                context.fillRect(0, 0, 1, 1);
                const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
                  const channel = value / 255;
                  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
                });
                return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
              };
              const foreground = luminance(style.color);
              const background = luminance(style.backgroundColor);
              return {
                contrast:
                  (Math.max(foreground, background) + 0.05) /
                  (Math.min(foreground, background) + 0.05),
                shadow: style.boxShadow,
                edge: style.borderLeftWidth,
                before: globalThis.getComputedStyle(element, "::before").content,
                fill: style.backgroundColor,
              };
            });
          assert.ok(result.activeFill.contrast >= 4.5, JSON.stringify(result.activeFill));
          assert.equal(result.activeFill.shadow, "none");
          assert.equal(result.activeFill.edge, "0px");
          assert.ok(["none", "normal"].includes(result.activeFill.before));
        }
        await page.locator(".workspace-pane.is-focused").focus();
        result.tabs = 0;
        while (
          result.tabs < 24 &&
          !(await rows.first().evaluate((element) => element === globalThis.document.activeElement))
        ) {
          await page.keyboard.press("Tab");
          result.tabs += 1;
        }
        assert.ok(result.tabs < 10, JSON.stringify(result));
        const header = page.locator(".library-table-row.is-header");
        result.headerStops = await header
          .locator("button, summary")
          .evaluateAll(
            (elements) =>
              elements.filter((element) => element.checkVisibility() && element.tabIndex === 0)
                .length,
          );
        assert.equal(result.headerStops, width === 1440 ? 1 : 0);
        if (width === 1440) {
          const first = header.locator("button").first();
          await first.focus();
          await page.keyboard.press("ArrowRight");
          await expect(header.locator("summary").first()).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(header.locator("details").first()).toHaveAttribute("open", "");
          await page.keyboard.press("Escape");
          result.cardHeight = (
            await page.locator(".continue-reading-card").first().boundingBox()
          ).height;
          assert.ok(result.cardHeight >= 80 && result.cardHeight <= 96, String(result.cardHeight));
        } else {
          result.rootTitleXs = await page
            .locator('.library-table-row[aria-level="1"] .library-source-link')
            .evaluateAll((elements) =>
              elements.map((element) => element.getBoundingClientRect().x),
            );
          assert.ok(result.rootTitleXs.length > 0);
          assert.ok(
            result.rootTitleXs.every((left) => left === 16),
            JSON.stringify(result),
          );
          const disclosure = rows.first().locator(".library-part-disclosure");
          const box = await disclosure.boundingBox();
          assert.ok(box.width >= 44 && box.height >= 44);
        }
        await rows.nth(2).focus();
        const target = await rows.nth(2).locator(".library-source-link strong").innerText();
        await page.keyboard.press("Control+k");
        await page
          .getByRole("combobox", { name: "Search sources and commands", exact: true })
          .fill("status");
        await expect(
          page.getByRole("option").filter({ hasText: "Set status: Queued" }),
        ).toHaveCount(1);
        await page.getByRole("option").filter({ hasText: "Set status: Queued" }).click();
        await expect(page.locator(".mdbase-command-palette")).toBeHidden();
        await expect(rows.filter({ hasText: target }).locator(".library-status")).toContainText(
          "Queued",
        );
        await expect(page.locator("#reader-notices")).toContainText(target.split("\n")[0]);
        result.focusedStatusTarget = target.split("\n")[0];
        const toast = page.locator(".highlight-saved").first();
        result.toast = await toast.evaluate((element) => {
          const text = element.querySelector('[role="status"]') ?? element;
          const range = globalThis.document.createRange();
          range.selectNodeContents(text);
          return {
            height: element.getBoundingClientRect().height,
            textHeight: text.getBoundingClientRect().height,
            lines: new Set(
              [...range.getClientRects()]
                .filter((rect) => rect.width > 0)
                .map((rect) => Math.round(rect.y)),
            ).size,
          };
        });
        if (width === 390) assert.ok(result.toast.lines <= 2, JSON.stringify(result.toast));
        await page.keyboard.press("Control+z");
        await page.keyboard.press("Control+k");
        await page
          .getByRole("combobox", { name: "Search sources and commands", exact: true })
          .fill("Keyboard shortcuts");
        await page.keyboard.press("Enter");
        const dialog = page.locator(".mdbase-command-palette");
        await expect(
          page.getByRole("heading", { name: "Keyboard shortcuts", exact: true }),
        ).toBeFocused();
        result.shortcuts = await dialog.locator("kbd").allTextContents();
        for (const key of [
          "J / K",
          "X",
          "S",
          "F2",
          "Delete",
          "Enter",
          "/",
          "PageDown / Space",
          "Ctrl+Home",
        ])
          assert.ok(result.shortcuts.includes(key), key);
        for (const [label, alias] of [
          ["Keyboard shortcuts", "?"],
          ["Toggle Sources sidebar", "["],
        ]) {
          const entry = dialog
            .locator("dl > div")
            .filter({ has: page.locator("dt", { hasText: label }) });
          await expect(entry).toHaveCount(1);
          assert.ok((await entry.locator("kbd").textContent()).includes(alias));
        }
        await page.keyboard.press("Tab");
        const close = dialog.getByRole("button", { name: "Close", exact: true });
        await expect(close).toBeFocused();
        result.close = await close.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return {
            bottom: box.bottom,
            hit: element.contains(
              globalThis.document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
            ),
          };
        });
        assert.ok(result.close.bottom <= page.viewportSize().height);
        assert.equal(result.close.hit, true);
        await close.click();
        const scope = page.getByRole("combobox", { name: "Search scope", exact: true });
        result.selectCurve = await page
          .locator(".library-search-scope, .library-search-scope .mdbase-select-chevron")
          .evaluateAll((elements) =>
            elements.map(
              (element) => globalThis.getComputedStyle(element).transitionTimingFunction,
            ),
          );
        if (reducedMotion === "no-preference") {
          assert.ok(
            result.selectCurve.every((curve) =>
              curve
                .split(", cubic")
                .every((value) => value.includes("0.22") && value.includes("0.36")),
            ),
          );
        }
        await scope.click();
        result.chevronEffects = await page
          .locator(".library-search-scope .mdbase-select-chevron")
          .evaluateAll((elements) =>
            elements.flatMap((element) =>
              element.getAnimations().map((animation) => animation.effect.getTiming()),
            ),
          );
        if (reducedMotion === "no-preference") {
          assert.ok(
            result.chevronEffects.some(
              (effect) => effect.easing === "cubic-bezier(0.22, 1, 0.36, 1)",
            ),
          );
        }
        await page.keyboard.press("Escape");
        if (width === 390) {
          const longTitle =
            "[test] A very long source title about careful reading and sustained attention across a collection of research notes and documentary sources";
          await rows.first().focus();
          await page.keyboard.press("F2");
          await page.locator(".library-field-editor").fill(longTitle);
          await page.keyboard.press("Enter");
          await expect(page.locator(".library-field-editor")).toHaveCount(0);
          await expect(rows.first()).toContainText(longTitle);
          await rows.first().focus();
          await page.keyboard.press("s");
          await page.getByRole("option", { name: "Queued", exact: true }).click();
          result.longToast = await page
            .locator(".highlight-saved")
            .filter({ hasText: longTitle })
            .filter({ has: page.getByRole("button", { name: "Undo", exact: true }) })
            .evaluate(async (element) => {
              await Promise.all(element.getAnimations().map((animation) => animation.finished));
              const status = element.querySelector('[role="status"]');
              const probe = status.cloneNode(false);
              probe.textContent = "Ag";
              probe.style.cssText =
                "position:fixed;width:max-content;display:block;visibility:hidden;-webkit-line-clamp:unset";
              element.append(probe);
              const lineHeight = probe.getBoundingClientRect().height;
              probe.remove();
              return {
                width: element.getBoundingClientRect().width,
                height: element.getBoundingClientRect().height,
                textHeight: status.getBoundingClientRect().height,
                lineHeight,
                text: status.textContent,
              };
            });
          assert.ok(
            result.longToast.textHeight <= result.longToast.lineHeight * 2,
            JSON.stringify(result.longToast),
          );
          assert.equal(result.longToast.width, 358);
        } else {
          await rows.first().focus();
          await page.keyboard.press("Enter");
          await page
            .locator(".dv-tab")
            .filter({ hasText: "All sources" })
            .first()
            .click({ button: "right" });
          await page.getByText("Move to new pane right", { exact: true }).click();
          const library = await page.locator(".library-table-frame").boundingBox();
          const divider = await page.locator(".dv-sash.dv-enabled").last().boundingBox();
          assert.ok(library && divider);
          const dividerX = divider.x + divider.width / 2;
          const targetX = dividerX + (dividerX > library.x + 4 ? 1 : -1) * (750 - library.width);
          await page.mouse.move(dividerX, divider.y + divider.height / 2);
          await page.mouse.down();
          await page.mouse.move(targetX, divider.y + divider.height / 2, { steps: 8 });
          await page.mouse.up();
          await page
            .waitForFunction(() => {
              const frame = globalThis.document.querySelector(".library-table-frame");
              return (
                frame &&
                frame.clientWidth > 0 &&
                frame.scrollWidth > frame.clientWidth &&
                frame.dataset.clipped === "true"
              );
            })
            .catch(async (error) => {
              console.log(
                JSON.stringify({
                  splitFailure: { width, colorScheme, reducedMotion },
                  frames: await page.locator(".library-table-frame").evaluateAll((elements) =>
                    elements.map((element) => ({
                      width: element.clientWidth,
                      scroll: element.scrollWidth,
                      clipped: element.dataset.clipped,
                      visible: element.checkVisibility(),
                    })),
                  ),
                  panes: await page.locator(".workspace-pane").count(),
                }),
              );
              throw error;
            });
        }
        const frame = page.locator(".library-table-frame");
        result.clipped = await frame.evaluate((element) => ({
          clipped: element.dataset.clipped,
          overflow: element.scrollWidth > element.clientWidth,
          mask: globalThis.getComputedStyle(element).maskImage,
        }));
        if (width === 1440) assert.equal(result.clipped.overflow, true);
        if (result.clipped.overflow) {
          assert.equal(result.clipped.clipped, "true");
          assert.notEqual(result.clipped.mask, "none");
          await frame.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
          });
          await expect(frame).toHaveAttribute("data-clipped", "false");
        }
        evidence.push(result);
        console.log(JSON.stringify(result));
        await page.close();
      }
    }
  }
  console.log(JSON.stringify({ passed: evidence.length, load: loadavg(), evidence }, null, 2));
} finally {
  console.log(JSON.stringify({ completed: evidence.length }));
  await browser.close();
}
