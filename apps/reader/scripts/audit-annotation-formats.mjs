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
    .getByRole("textbox", { name: "Annotation note" })
    .fill("[test] Recover this PDF crop and comment.");
  await expect(area.getByText("Draft saved on this device", { exact: true })).toBeVisible();
  await screenshot("annotation-pdf-area-draft");
  await page.reload();
  await expect(area.getByRole("textbox", { name: "Annotation note" })).toContainText(
    "Recover this PDF crop",
    { timeout: 60000 },
  );
  await expect
    .poll(() =>
      area.getByRole("img", { name: "Selected PDF area" }).evaluate((image) => image.naturalWidth),
    )
    .toBeGreaterThan(20);
  await area.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(area).toHaveCount(0);

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
  const composer = page.getByRole("region", { name: "New highlight" });
  await expect(composer).toBeVisible({ timeout: 15000 });
  await screenshot("annotation-epub-selection");
  await composer.getByRole("button", { name: "Save highlight", exact: true }).click();
  await expect(composer).toHaveCount(0);
  const tools = page.getByRole("complementary", { name: "Source workspace" });
  // Desktop tool visibility survives mobile visits; do not accidentally close an already-open edge.
  if (!(await tools.isVisible())) {
    await page.getByRole("button", { name: "Toggle source tools" }).click();
  }
  await expect(tools.locator(".annotation-card")).toHaveCount(1);
  await tools.getByRole("button", { name: "Open annotation in document" }).click();
  // Readium keeps an empty live alert region for announcements.
  await expect(page.locator(".annotation-compose-error")).toHaveCount(0);
  await expect
    .poll(async () =>
      (await page.getByRole("alert").allTextContents()).filter((text) => text.trim()),
    )
    .toEqual([]);
  await screenshot("annotation-epub-saved");
  return [
    "Real PDF area selection retains its crop image and comment across reload",
    "Real EPUB mouse selection creates an anchored highlight and opens it from the inspector",
  ];
}
