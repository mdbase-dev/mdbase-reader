import { expect } from "@playwright/test";

export async function auditAnnotationFormats(page, { open, screenshot }) {
  await open(20);
  const pdf = page.locator(".document-session.is-active .pdf-viewer");
  await expect(pdf).toBeVisible({ timeout: 60000 });
  await expect
    .poll(
      () =>
        pdf
          .locator("img")
          .evaluateAll((images) =>
            images.some((image) => image.complete && image.naturalWidth > 100),
          ),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.getByRole("button", { name: "Select area", exact: true }).click();
  const image = pdf.locator("img").first();
  const box = await image.boundingBox();
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 330, box.y + 170, { steps: 20 });
  await page.mouse.up();
  const area = page.getByRole("region", { name: "New area annotation" });
  await expect(area.getByRole("img", { name: "Selected PDF area" })).toBeVisible({
    timeout: 20000,
  });
  await area.getByRole("button", { name: "Add a comment" }).click();
  await area
    .getByRole("textbox", { name: "Comment" })
    .fill("[test] Recover this PDF crop and comment.");
  await expect(
    area.getByText("Not saved yet — keep Reader open until you save this annotation.", {
      exact: true,
    }),
  ).toBeVisible();
  await screenshot("annotation-pdf-area-draft");
  await open(0);
  await open(20);
  await expect(area.getByRole("textbox", { name: "Comment" })).toHaveValue(
    /Recover this PDF crop/u,
    { timeout: 60000 },
  );
  await expect
    .poll(() =>
      area.getByRole("img", { name: "Selected PDF area" }).evaluate((image) => image.naturalWidth),
    )
    .toBeGreaterThan(20);
  await area.getByRole("button", { name: "Discard selection", exact: true }).click();
  await expect(area).toHaveCount(0);

  // A text highlight on the PDF: EmbedPDF draws it and its margin mark (see pdf-decoration.ts).
  const pageImage = await pdf.locator("img").first().boundingBox();
  await page.mouse.move(pageImage.x + 70, pageImage.y + 75);
  await page.mouse.down();
  await page.mouse.move(pageImage.x + 300, pageImage.y + 78, { steps: 20 });
  await page.mouse.up();
  const pdfHighlight = page.getByRole("toolbar", { name: "Selected text" });
  await pdfHighlight.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(pdfHighlight).toHaveCount(0);
  const storedPdfAnnotations = () =>
    page.evaluate(async () => {
      const response = await fetch("/__reader-audit/annotations/test_0020");
      if (!response.ok) throw new Error("PDF fixture could not be read");
      return response.json();
    });
  await expect.poll(async () => (await storedPdfAnnotations()).length).toBe(1);
  const savedPdfAnnotations = await storedPdfAnnotations();
  expect(savedPdfAnnotations[0].annotationType).toBe("highlight");
  expect(savedPdfAnnotations[0].document.revision).toMatch(/^sha256:/u);
  await screenshot("annotation-pdf-highlight-margin");
  // Reload the entire application, not merely the document tab. The fixture server's
  // stored record survives; the PDF renderer and all application state are reconstructed.
  await page.reload();
  await open(20);
  await expect(pdf).toBeVisible({ timeout: 60000 });
  const pdfTools = page.getByRole("complementary", { name: "Source workspace" });
  if (!(await pdfTools.isVisible())) {
    await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  }
  await expect(pdfTools.locator(".annotation-card")).toHaveCount(1);
  await pdfTools.getByRole("button", { name: "Show in document" }).click();
  await expect(page.locator(".annotation-compose-error")).toHaveCount(0);
  expect(await storedPdfAnnotations()).toEqual(savedPdfAnnotations);
  await screenshot("annotation-pdf-highlight-after-reload");

  await open(21);
  const epub = page.locator(".document-session.is-active .epub-viewer");
  await expect(epub).toBeVisible({ timeout: 60000 });
  const iframe = epub.locator("iframe.readium-navigator-iframe").first();
  const paragraph = iframe.contentFrame().locator("p").first();
  await expect(paragraph).toBeVisible({ timeout: 30000 });
  const frameBox = await iframe.boundingBox();
  const points = await paragraph.evaluate((element) => {
    const doc = element.ownerDocument;
    const range = doc.createRange();
    range.setStart(element.firstChild, 0);
    range.setEnd(element.firstChild, 1);
    const start = range.getBoundingClientRect();
    range.setStart(element.firstChild, 30);
    range.setEnd(element.firstChild, 31);
    const end = range.getBoundingClientRect();
    return {
      x1: start.x + 1,
      y1: start.y + start.height / 2,
      x2: end.x + end.width / 2,
      y2: end.y + end.height / 2,
    };
  });
  await page.mouse.move(frameBox.x + points.x1, frameBox.y + points.y1);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + points.x2, frameBox.y + points.y2, { steps: 20 });
  await page.mouse.up();
  const composer = page.getByRole("toolbar", { name: "Selected text" });
  await expect(composer).toBeVisible({ timeout: 15000 });
  await screenshot("annotation-epub-selection");
  await composer.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(composer).toHaveCount(0);
  const tools = page.getByRole("complementary", { name: "Source workspace" });
  // Desktop tool visibility survives mobile visits; do not accidentally close an already-open edge.
  if (!(await tools.isVisible())) {
    await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  }
  await expect(tools.locator(".annotation-card")).toHaveCount(1);
  await tools.getByRole("button", { name: "Show in document" }).click();
  // Readium keeps an empty live alert region for announcements.
  await expect(page.locator(".annotation-compose-error")).toHaveCount(0);
  await expect
    .poll(async () =>
      (await page.getByRole("alert").allTextContents()).filter((text) => text.trim()),
    )
    .toEqual([]);
  await screenshot("annotation-epub-saved");
  // A margin mark sits beside the new highlight, inside the book's frame, level with its text.
  const alignment = async () =>
    paragraph.evaluate((element) => {
      const doc = element.ownerDocument;
      const mark = doc.querySelector("[data-mdbase-reader='margin'] > span");
      if (!mark) {
        return null;
      }
      const range = doc.createRange();
      range.setStart(element.firstChild, 0);
      range.setEnd(element.firstChild, 1);
      return Math.abs(mark.getBoundingClientRect().top - range.getBoundingClientRect().top);
    });
  await expect.poll(alignment, { timeout: 15000 }).not.toBeNull();
  expect(await alignment()).toBeLessThan(4);
  await screenshot("annotation-epub-margin");
  // Shortcuts reach Reader with keyboard focus inside the book's frame.
  await paragraph.click({ position: { x: 4, y: 4 } });
  await paragraph.press("Control+.");
  await expect(page.getByRole("button", { name: "Reading mode" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await paragraph.press("Escape");
  await expect(page.getByRole("button", { name: "Reading mode" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  return [
    "Real PDF area selection retains its crop image and comment in memory across source switches",
    "Real PDF text selection saves a revision-bound highlight; full reload restores exactly the same record and document navigation",
    "Real EPUB mouse selection creates an anchored highlight and opens it from the inspector",
    "EPUB highlights get margin marks, and shortcuts work from inside the book",
  ];
}
