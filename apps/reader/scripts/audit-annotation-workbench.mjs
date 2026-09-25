import { expect } from "@playwright/test";

export async function auditAnnotationWorkbench(page, { screenshot, open }) {
  const tools = page.getByRole("complementary", { name: "Source workspace" });
  await tools.getByRole("button", { name: "Edit", exact: true }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Back to reading position" })).toHaveCount(0);
  const editor = tools.getByRole("textbox", { name: "Comment" });
  await editor.fill("[test] Dock-safe annotation draft.");
  const annotationId = await tools
    .locator(".annotation-card.is-editing")
    .getAttribute("data-annotation-id");
  await tools.getByRole("button", { name: "Open annotations in workbench", exact: true }).click();
  const tab = page
    .locator(".reader-dock-tab:not(.is-side)")
    .filter({ has: page.locator(".dv-default-tab-content", { hasText: "Annotations —" }) });
  const panelId = await tab.getAttribute("data-panel-id");
  const workbench = page.locator(`[data-session-id="${panelId}"]`);
  await workbench
    .locator(`[data-annotation-id="${annotationId}"]`)
    .getByRole("button", { name: "Edit here", exact: true })
    .click();
  const otherEditor = workbench.getByRole("textbox", { name: "Comment" });
  await expect(otherEditor).toHaveValue(/Dock-safe annotation draft/u);
  await expect(editor).toHaveCount(0);
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
    await page.getByRole("button", { name: "Toggle right sidebar" }).click();
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
  await tools.getByRole("button", { name: "Add to literature note", exact: true }).first().click();
  await expect(
    tools.getByRole("button", { name: "In literature note", exact: true }),
  ).toBeVisible();
  await tools.getByRole("button", { name: "Edit", exact: true }).first().click();
  await tools.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(tools.getByText("These notes embed it and will show a broken embed:")).toBeVisible();
  await expect(tools.getByText("sources/test_0000.md", { exact: true })).toBeVisible();
  await screenshot("annotation-linked-delete-warning");
  await tools.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(tools.locator(".annotation-card")).toHaveCount(2);
  await tools.getByRole("button", { name: "Delete", exact: true }).click();
  await tools.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(tools.locator(".annotation-card")).toHaveCount(1);
  await page.reload();
  await expect(tools.locator(".annotation-card")).toHaveCount(1);
  return [
    "Annotation editing transfers explicitly between inspector and workbench; docking preserves the draft without simultaneous writers",
    "Linked note insertion, deletion warning, cancellation, and deletion persistence work",
  ];
}
