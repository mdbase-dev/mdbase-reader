import assert from "node:assert/strict";
import { expect } from "@playwright/test";

/** Real Reader mobile toolbar and annotation pipeline, backed by disposable in-memory routes. */
export async function auditPdfTouchWorkspace(page, { screenshot }) {
  const open = async () => {
    const search = page.getByRole("textbox", { name: "Find a source by title, author or tag" });
    if (!(await search.isVisible()))
      await page.getByRole("button", { name: "Toggle left sidebar" }).tap();
    await search.fill("Research 0020");
    await page.getByRole("option", { name: /Research 0020/ }).dblclick();
    await waitPdf();
  };
  const waitPdf = async () => {
    await expect(page.locator(".document-session.is-active .pdf-viewer")).toBeVisible({
      timeout: 60000,
    });
    await expect
      .poll(
        () =>
          page
            .locator(".document-session.is-active .pdf-viewer img")
            .evaluateAll((images) =>
              images.some((image) => image.complete && image.naturalWidth > 100),
            ),
        { timeout: 30000 },
      )
      .toBe(true);
  };
  await open();
  const host = page.locator(".document-session.is-active embedpdf-container");
  const point = async (offset) =>
    host.evaluate(async (element, offset) => {
      const registry = await element.registry;
      const doc = registry.getPlugin("document-manager").provides().getActiveDocument();
      const text = await registry.getEngine().extractText(doc, [0]).toPromise();
      const index = text.indexOf("Patient") + offset;
      if (index < offset) throw new Error("Synthetic PDF word not found");
      const geometry = await registry.getEngine().getPageGeometry(doc, doc.pages[0]).toPromise();
      const run = geometry.runs.find(
        (run) => index >= run.charStart && index < run.charStart + run.glyphs.length,
      );
      const glyph = run.glyphs[index - run.charStart];
      const p = registry
        .getPlugin("scroll")
        .provides()
        .getRectPositionForPage(0, {
          origin: { x: glyph.x + glyph.width / 2, y: glyph.y + glyph.height / 2 },
          size: { width: 0, height: 0 },
        }).origin;
      const box = [...element.shadowRoot.querySelectorAll("div[style]")]
        .find((el) => el.style.marginLeft === "auto" && el.style.position === "relative")
        .getBoundingClientRect();
      return { x: box.left + p.x, y: box.top + p.y, index };
    }, offset);
  const state = () =>
    host.evaluate(async (element) => {
      const selection = (await element.registry).getPlugin("selection").provides();
      return {
        range: selection.getState().selection,
        text: (await selection.getSelectedText().toPromise()).join("\n"),
        formatted: selection.getFormattedSelection(),
      };
    });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, p) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [],
    });
  await touch("touchStart", await point(2));
  await page.waitForTimeout(500);
  await touch("touchEnd");
  const toolbar = page.getByRole("toolbar", { name: "Selected text" });
  await expect(toolbar).toBeVisible();
  assert.equal((await state()).text, "Patient");
  const box = await host.locator('[data-reader-pdf-handle="end"]').boundingBox();
  const start = { x: box.x + 22, y: box.y + 22 };
  const current = await point(6);
  const desired = await point(16);
  const end = { x: start.x + desired.x - current.x, y: start.y + desired.y - current.y };
  await touch("touchStart", start);
  await expect(toolbar).toHaveCount(0);
  for (let step = 1; step <= 12; step++) {
    await touch("touchMove", {
      x: start.x + ((end.x - start.x) * step) / 12,
      y: start.y + ((end.y - start.y) * step) / 12,
    });
    await page.waitForTimeout(20);
  }
  await touch("touchEnd");
  await expect(toolbar).toBeVisible();
  const adjusted = await state();
  assert.equal(adjusted.text, "Patient attention");
  assert.equal(adjusted.range.end.index, desired.index);
  await screenshot("pdf-touch-workspace-adjusted");
  await toolbar.getByRole("button", { name: "Highlight", exact: true }).tap();
  await expect(toolbar).toHaveCount(0);
  const stored = () =>
    page.evaluate(async () => {
      const response = await fetch("/__reader-audit/annotations/test_0020");
      if (!response.ok) throw new Error("Fixture annotation read failed");
      return response.json();
    });
  await expect.poll(async () => (await stored()).length).toBe(1);
  const annotations = await stored();
  assert.equal(annotations[0].target.quote.exact, adjusted.text);
  assert.equal(annotations[0].target.pdf.pageIndex, 0);
  assert.deepEqual(
    annotations[0].target.pdf.quadPoints,
    adjusted.formatted[0].segmentRects.map((rect) => {
      const { x, y } = rect.origin;
      const { width, height } = rect.size;
      return [x, y, x + width, y, x, y + height, x + width, y + height];
    }),
  );
  assert.match(annotations[0].document.revision, /^sha256:/);
  await expect(host.locator('[data-reader-pdf-handle="start"]')).toBeHidden();
  await page.reload();
  await waitPdf();
  assert.deepEqual(await stored(), annotations);
  // Inspect the renderer's annotation store as well as the saved record after reconstruction.
  await expect
    .poll(() =>
      host.evaluate(async (element) => {
        const annotation = (await element.registry).getPlugin("annotation").provides();
        return annotation.getAnnotations().length;
      }),
    )
    .toBeGreaterThan(0);
  await screenshot("pdf-touch-workspace-reloaded");
  await cdp.detach();
  return [
    "Mobile PDF handles: real toolbar hides during drag, adjusted quote/quads save through Reader, record and decoration survive full reload",
  ];
}
