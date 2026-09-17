import { expect } from "@playwright/test";

export async function auditSimpleAnnotations(
  page,
  { pane, tab, duplicate, documentId, screenshot, blockWrites },
) {
  await pane(documentId).getByLabel("More document actions", { exact: true }).click();
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  const panes = page
    .locator('.workspace-pane[aria-hidden="false"]')
    .filter({ has: page.locator(".annotation-card") });
  await duplicate(await panes.first().getAttribute("data-session-id"));
  await expect(panes).toHaveCount(2);
  const comments = page.getByRole("textbox", { name: "Annotation note", exact: true });
  const writes = [];
  const recordWrite = (request) => {
    if (request.method() === "PUT" && request.url().includes("/__reader-audit/annotations/"))
      writes.push(request.url());
  };
  page.on("request", recordWrite);
  await panes.nth(0).getByRole("button", { name: "Edit", exact: true }).click();
  await expect(comments).toHaveCount(1);
  expect(await comments.evaluate((element) => element.tagName)).toBe("TEXTAREA");
  await expect(panes.locator(".cm-editor")).toHaveCount(0);
  blockWrites(true);
  await comments.fill("> Quotation\n\n[test] Local comment");
  await comments.press("End");
  await comments.pressSequentially(" stays local", { delay: 20 });
  await page.waitForTimeout(1500);
  expect(writes).toEqual([]);
  await expect(panes.nth(1)).not.toContainText("Local comment");
  await panes.nth(1).getByRole("button", { name: "Edit here", exact: true }).click();
  await expect(comments).toHaveCount(1);
  await expect(panes.nth(0).getByRole("textbox", { name: "Annotation note" })).toHaveCount(0);
  await expect(comments).toHaveValue("> Quotation\n\n[test] Local comment stays local");
  await panes.nth(1).getByRole("button", { name: "Done", exact: true }).click();
  await expect(panes.nth(1).getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
  await expect(comments).toHaveValue("> Quotation\n\n[test] Local comment stays local");
  expect(writes).toHaveLength(1);
  blockWrites(false);
  await panes.nth(1).getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(comments).toHaveCount(0);
  await expect(panes.nth(1)).toContainText("Local comment stays local");
  expect(writes).toHaveLength(2);
  await panes.nth(0).getByRole("button", { name: "Edit here", exact: true }).click();
  await comments.fill("[test] Discard this temporary edit");
  page.removeAllListeners("dialog");
  const dialogs = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });
  await panes.nth(0).getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(comments).toHaveCount(0);
  await panes.nth(0).getByRole("button", { name: "Edit", exact: true }).click();
  await comments.fill("[test] Unfinished comment survives close and reload");
  await expect(
    panes.nth(0).getByText("Draft kept on this device — not saved to collection", { exact: true }),
  ).toBeVisible();
  await panes
    .nth(0)
    .getByLabel("Edit annotation", { exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(comments).toHaveCount(0);
  await expect(
    panes.nth(0).getByRole("button", { name: "Resume draft", exact: true }),
  ).toBeVisible();
  await page.reload();
  await panes.nth(0).getByRole("button", { name: "Resume draft", exact: true }).click();
  await expect(comments).toHaveValue("[test] Unfinished comment survives close and reload");
  expect(writes).toHaveLength(2);
  await screenshot("simple-annotation-draft");
  await panes.nth(0).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    panes.nth(0).getByRole("button", { name: "Keep annotation", exact: true }),
  ).toBeVisible();
  const before = await comments.inputValue();
  await comments.pressSequentially("MUST NOT APPLY");
  await expect(comments).toHaveValue(before);
  const deletingPane = await panes.nth(0).getAttribute("data-session-id");
  await tab(deletingPane).getByRole("button", { name: "Close tab", exact: true }).click();
  await expect(panes).toHaveCount(1);
  await panes.getByRole("button", { name: "Resume draft", exact: true }).click();
  await comments.fill("[test] Local change retained during a conflict");
  await page.evaluate(async () => {
    const records = await (await fetch("/__reader-audit/annotations/test_0000")).json();
    const response = await fetch("/__reader-audit/annotations/test_0000", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "update",
        annotation: records[0],
        body: "[test] Remote client changed this comment",
      }),
    });
    if (!response.ok) throw new Error("Fixture remote edit failed");
  });
  await panes.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Compare collection version", { exact: true })).toBeVisible();
  await expect(comments).toHaveValue("[test] Local change retained during a conflict");
  await page.getByText("Compare collection version", { exact: true }).click();
  await expect(page.getByLabel("Edit annotation", { exact: true }).locator("pre")).toHaveText(
    "[test] Remote client changed this comment",
  );
  await screenshot("simple-annotation-conflict");
  await page.getByRole("button", { name: "Keep my changes", exact: true }).click();
  await expect(comments).toHaveCount(0);
  await expect(panes).toContainText("Local change retained during a conflict");
  await panes.getByRole("button", { name: "Edit", exact: true }).click();
  await comments.evaluate((element) => {
    element.dataset.simpleEditorIdentity = "original";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(comments).toBeVisible();
  await expect(comments).toHaveAttribute("data-simple-editor-identity", "original");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(comments).toHaveAttribute("data-simple-editor-identity", "original");
  await comments.press("Escape");
  await expect(comments).toHaveCount(0);
  page.off("request", recordWrite);
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).toContain("Discard this annotation");
  return [
    "Annotation textareas keep keystrokes local, never autosave to the collection, and transfer one editor safely between panes",
    "Explicit Done/retry commits once; close/reload retains drafts, and confirmed discard does not write to the collection",
    "Deletion checks freeze the editor and release ownership on close; explicit conflict resolution preserves both versions until chosen",
    "Native annotation textarea identity survives responsive layout changes",
  ];
}
