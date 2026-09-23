import { expect } from "@playwright/test";

export async function auditAnnotationNavigationFailure(page, { open, screenshot }) {
  await open(0);
  await page.evaluate(async () => {
    const source = await (await fetch("/__reader-audit/source/test_0000")).json();
    await fetch("/__reader-audit/annotations/test_0000", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "create",
        request: {
          collectionId: source.collectionId,
          sourceId: source.id,
          source: `[[${source.path}]]`,
          document: source.documents[0],
          annotationType: "highlight",
          tags: [],
          body: "> [test] A passage that is no longer locatable.",
          target: {
            html: { css: "#missing-passage" },
            quote: { exact: "[test] A passage that is no longer locatable." },
          },
        },
      }),
    });
  });
  await page.reload();
  const card = page
    .getByRole("complementary", { name: "Source workspace" })
    .locator(".annotation-card")
    .filter({ hasText: "no longer locatable" });
  await card.getByRole("button", { name: "Show in document", exact: true }).click();
  await expect(page.locator(".annotation-compose-error")).toContainText(
    "Could not locate this passage",
  );
  await expect(card).toContainText("no longer locatable");
  await screenshot("annotation-missing-passage");
  return ["Unresolvable passage shows a readable navigation error without deleting the annotation"];
}
