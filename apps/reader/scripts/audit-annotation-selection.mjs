import { expect } from "@playwright/test";

/**
 * One selected annotation, whichever side chose it: a card picked in the Notes panel must not
 * pull the document back to itself when the reader then clicks another highlight in the PDF.
 */
export async function auditAnnotationSelection(page, { open, screenshot }) {
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
  const tools = page.getByRole("complementary", { name: "Source workspace" });
  if (!(await tools.isVisible())) {
    await page.getByRole("button", { name: "Toggle Notes panel" }).click();
  }
  await expect(tools).toBeVisible();
  await page.waitForTimeout(500);
  const box = await pdf.locator("img").first().boundingBox();
  // The fixture's two lines of text, in PDF points from the page's top-left corner.
  const scale = box.height / 792;
  const lines = { first: 86 * scale, second: 121 * scale };
  const at = (x, y) => ({ x: box.x + x * scale, y: box.y + y });
  const highlightLine = async (y) => {
    const start = at(62, y);
    const end = at(300, y);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 20 });
    await page.mouse.up();
    const bar = page.getByRole("toolbar", { name: "Selected text" });
    await bar
      .getByRole("group", { name: "Highlight in a colour" })
      .getByRole("button")
      .first()
      .click();
    await expect(bar).toHaveCount(0);
  };
  await highlightLine(lines.first);
  await highlightLine(lines.second);
  const cards = tools.locator(".annotation-card.is-highlight");
  await expect(cards).toHaveCount(2, { timeout: 15000 });
  const first = cards.filter({ hasText: "PDF reading fixture" });
  const second = cards.filter({ hasText: "Patient attention" });
  const firstId = await first.getAttribute("data-annotation-id");
  const secondId = await second.getAttribute("data-annotation-id");
  const selected = () =>
    tools
      .locator(".annotation-card.is-selected")
      .evaluateAll((elements) => elements.map((element) => element.dataset.annotationId));
  // The selection must hold, not merely arrive: the reported fault snapped back at once.
  const expectSelection = async (step, ids) => {
    await expect.poll(selected, { message: step, timeout: 5000 }).toEqual(ids);
    await page.waitForTimeout(600);
    expect(await selected(), step).toEqual(ids);
  };
  const clickLine = async (y) => {
    const point = at(150, y);
    await page.mouse.click(point.x, point.y);
  };
  const highlightBar = page.getByRole("toolbar", { name: "Highlight" });

  // The report: select the first in the pane, then click the second in the document.
  await first.locator("blockquote").click();
  await expectSelection("card A selects A", [firstId]);
  await clickLine(lines.second);
  await expectSelection("document B after card A", [secondId]);
  await expect(highlightBar).toBeVisible();
  await screenshot("annotation-selection-document-after-pane");

  // Clicking the same highlight again keeps it; clicking the other moves the selection.
  await clickLine(lines.second);
  await expectSelection("repeat click on B", [secondId]);
  await clickLine(lines.first);
  await expectSelection("document A after B", [firstId]);

  // The pane can take the selection back, and the document follows it there.
  await second.locator("blockquote").click();
  await expectSelection("card B after document A", [secondId]);
  await clickLine(lines.first);
  await expectSelection("document A after card B", [firstId]);

  // Escape lets the highlight go, in the pane as well as the document.
  await page.keyboard.press("Escape");
  await expect(highlightBar).toHaveCount(0);
  await expectSelection("Escape", []);

  // So does a click on empty page, after a selection made in the pane.
  await second.locator("blockquote").click();
  await expectSelection("card B before empty click", [secondId]);
  const empty = at(300, box.height * 0.8);
  await page.mouse.click(empty.x, empty.y);
  await expectSelection("empty page click", []);
  await screenshot("annotation-selection-cleared");
  return [
    "A highlight clicked in the PDF after a card was selected in the pane stays selected",
    "Repeat clicks, pane-to-document hand-offs, Escape and empty-page clicks keep one selection",
  ];
}
