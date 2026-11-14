import { expect } from "@playwright/test";

export async function auditAnnotationWorkbench(page, { screenshot, open, blockWrites }) {
  const tools = page.getByRole("complementary", { name: "Source workspace" });
  await tools.getByRole("button", { name: "Edit", exact: true }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Back to reading position" })).toHaveCount(0);
  const editor = tools.getByRole("textbox", { name: "Comment" });
  blockWrites(true);
  await editor.fill("[test] Dock-safe annotation draft.");
  await expect(tools.getByRole("alert")).toContainText("offline");
  const annotationId = await tools
    .locator(".annotation-card.is-editing")
    .getAttribute("data-annotation-id");
  await tools.getByRole("button", { name: "Open annotations in workbench", exact: true }).click();
  const tab = page
    .locator(".reader-dock-tab:not(.is-side)")
    .filter({ has: page.locator(".dv-default-tab-content", { hasText: "Annotations —" }) });
  const panelId = await tab.getAttribute("data-panel-id");
  const workbench = page.locator(`[data-session-id="${panelId}"]`);
  // Promotion hides the retained sidebar. Explicitly transfer its editor lease
  // to the workbench; the same unsaved buffer must survive that transfer.
  await expect(tools).toHaveCount(0);
  await workbench
    .locator(`[data-annotation-id="${annotationId}"]`)
    .getByRole("button", { name: "Edit here", exact: true })
    .click();
  const otherEditor = workbench.getByRole("textbox", { name: "Comment" });
  await expect(otherEditor).toHaveValue(/Dock-safe annotation draft/u);
  await expect(editor).toHaveCount(0);
  blockWrites(false);
  await workbench.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(otherEditor).toHaveCount(0);
  await workbench
    .locator(`[data-annotation-id="${annotationId}"]`)
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(otherEditor).toHaveValue(/Dock-safe annotation draft/u);
  const menu = async (label) => {
    await tab.click({ button: "right" });
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  };
  await menu("Move to new pane right");
  await page
    .locator(".reader-dock-tab:not(.is-side)")
    .getByText("[test] Research 0000", { exact: true })
    .click();
  await tab.click();
  if (!(await tools.isVisible()))
    await page.getByRole("button", { name: "Toggle Notes panel" }).click();
  // Reopening the retained sidebar does not steal the workbench's lease.
  await expect(otherEditor).toHaveValue(/Dock-safe annotation draft/u);
  await tools
    .locator(`[data-annotation-id="${annotationId}"]`)
    .getByRole("button", { name: "Edit here", exact: true })
    .click();
  await expect(editor).toHaveValue(/Dock-safe annotation draft/u);
  await expect(otherEditor).toHaveCount(0);
  await workbench
    .locator(`[data-annotation-id="${annotationId}"]`)
    .getByRole("button", { name: "Edit here", exact: true })
    .click();
  await expect(otherEditor).toHaveValue(/Dock-safe annotation draft/u);
  await expect(editor).toHaveCount(0);
  await tools
    .locator(`[data-annotation-id="${annotationId}"]`)
    .getByRole("button", { name: "Edit here", exact: true })
    .click();
  await expect(editor).toHaveValue(/Dock-safe annotation draft/u);
  await expect(otherEditor).toHaveCount(0);
  await expect(tools.getByText("Saved", { exact: true })).toBeVisible();
  await screenshot("annotation-docked-edit");
  page.removeAllListeners("dialog");
  const dialogs = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await menu("Close");
  await expect(tab).toHaveCount(0);
  expect(dialogs).toEqual([]);
  await expect(editor).toHaveValue(/Dock-safe annotation draft/u);
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => void dialog.accept());
  await open(0);
  await expect(editor).toHaveValue(/Dock-safe annotation draft/u);
  await tools.getByRole("button", { name: "Done", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await tools.getByRole("button", { name: "Insert into source note", exact: true }).first().click();
  await expect(tools.getByRole("button", { name: "In source note", exact: true })).toBeVisible();
  await tools.getByRole("button", { name: "Edit", exact: true }).first().click();
  await tools.getByRole("button", { name: "Delete annotation", exact: true }).click();
  await expect(
    tools.getByText("These notes embed this annotation and will show it as missing:"),
  ).toBeVisible();
  await expect(tools.locator('li[title="sources/test_0000.md"]')).toBeVisible();
  await screenshot("annotation-linked-delete-warning");
  await tools.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(tools.locator(".annotation-card")).toHaveCount(2);
  await tools.getByRole("button", { name: "Delete annotation", exact: true }).click();
  await tools.getByRole("button", { name: "Delete annotation", exact: true }).click();
  await expect(tools.locator(".annotation-card")).toHaveCount(1);
  await page.reload();
  await expect(tools.locator(".annotation-card")).toHaveCount(1);
  return [
    "Annotation promotion preserves an uncommitted buffer while the sidebar is hidden; Edit here transfers the single editor after docking",
    "Linked note insertion, deletion warning, cancellation, and deletion persistence work",
  ];
}
