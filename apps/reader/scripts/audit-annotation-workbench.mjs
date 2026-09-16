import { expect } from "@playwright/test";

export async function auditAnnotationWorkbench(page, { screenshot, open }) {
  const tools = page.getByRole("complementary", { name: "Source workspace" });
  await tools.getByRole("button", { name: "Edit", exact: true }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Back to reading position" })).toHaveCount(0);
  const editor = page.getByRole("textbox", { name: "Annotation note" });
  await editor.fill("> A curated quotation.\n\n[test] Dock-safe annotation draft.");
  await expect(page.getByText("Draft saved on this device", { exact: true })).toBeVisible();
  await tools.getByRole("button", { name: "Open annotations in workbench", exact: true }).click();
  await expect(editor).toContainText("Dock-safe annotation draft");
  const tab = page
    .locator(".reader-dock-tab")
    .filter({ has: page.locator(".dv-default-tab-content", { hasText: "Annotations —" }) });
  const menu = async (label) => {
    await tab.click({ button: "right" });
    await page.getByText(label, { exact: true }).click();
  };
  await menu("Move to new pane right");
  await expect(editor).toContainText("Dock-safe annotation draft");
  await screenshot("annotation-docked-edit");
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => void dialog.dismiss());
  await menu("Close");
  await expect(tab).toBeVisible();
  await expect(editor).toContainText("Dock-safe annotation draft");
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => void dialog.accept());
  await menu("Close");
  await expect(tab).toHaveCount(0);
  await open(0);
  await expect(editor).toContainText("Dock-safe annotation draft");
  await editor.press("Control+s");
  await expect(editor).toHaveCount(0);
  await tools.getByRole("button", { name: "Insert in note", exact: true }).first().click();
  await expect(tools.getByRole("button", { name: "In source note", exact: true })).toBeVisible();
  await tools.getByRole("button", { name: "Edit", exact: true }).first().click();
  await tools.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    tools.getByText("The following notes will retain visible, broken embeds:"),
  ).toBeVisible();
  await expect(tools.getByText("sources/test_0000.md", { exact: true })).toBeVisible();
  await screenshot("annotation-linked-delete-warning");
  await tools.getByRole("button", { name: "Keep annotation", exact: true }).click();
  await expect(tools.locator(".annotation-card")).toHaveCount(2);
  await tools.getByRole("button", { name: "Delete", exact: true }).click();
  await tools.getByRole("button", { name: "Delete record", exact: true }).click();
  await expect(tools.locator(".annotation-card")).toHaveCount(1);
  await page.reload();
  await expect(tools.locator(".annotation-card")).toHaveCount(1);
  return [
    "Annotation draft survives promotion, pane movement, cancelled close, and accepted close/reopen",
    "Linked note insertion, deletion warning, cancellation, and deletion persistence work",
  ];
}
