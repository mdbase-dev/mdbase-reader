import { expect } from "@playwright/test";
import { realpathSync } from "node:fs";

async function auditComposition(page, a, b) {
  await a.fill("[test] IME ");
  await a.press("Control+End");
  await a.evaluate((element) =>
    element.dispatchEvent(new globalThis.CompositionEvent("compositionstart", { bubbles: true })),
  );
  const append = async (text) =>
    a.evaluate((element, chunk) => {
      const node = element.lastElementChild.lastChild;
      node.textContent += chunk;
      element.ownerDocument.getSelection().collapse(node, node.textContent.length);
      element.dispatchEvent(
        new globalThis.InputEvent("input", {
          bubbles: true,
          inputType: "insertCompositionText",
          data: chunk,
          isComposing: true,
        }),
      );
    }, text);
  await append("あ");
  await expect(b).toHaveText("[test] IME あ");
  const modulePath = `/@fs${realpathSync(new URL("../../../packages/markdown-editor/node_modules/@codemirror/view/dist/index.js", import.meta.url))}`;
  const composing = await page.evaluate(async (path) => {
    const { EditorView } = await import(path);
    const nodes = globalThis.document.querySelectorAll('[aria-label="Source literature note"]');
    const first = EditorView.findFromDOM(nodes[0]),
      second = EditorView.findFromDOM(nodes[1]);
    second.dispatch({ changes: { from: 0, insert: "Remote " }, userEvent: "input.type" });
    return first.composing;
  }, modulePath);
  expect(composing).toBe(true);
  await expect(a).toHaveText("Remote [test] IME あ");
  await append("い");
  await a.evaluate((element) =>
    element.dispatchEvent(
      new globalThis.CompositionEvent("compositionend", { bubbles: true, data: "あい" }),
    ),
  );
  await expect(b).toHaveText("Remote [test] IME あい");
}

export async function auditSharedEditing(page, { screenshot, blockWrites }) {
  const tab = (id) => page.locator(`.reader-dock-tab[data-panel-id="${id}"]`);
  const pane = (id) => page.locator(`[data-session-id="${id}"]`);
  const idOf = (editor) =>
    editor.evaluate((element) => element.closest("[data-session-id]").dataset.sessionId);
  const duplicate = async (id) => {
    await tab(id).click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Open another editor in pane right", exact: true })
      .click();
  };
  await page
    .getByRole("textbox", { name: "Find a source by title, author or tag" })
    .fill("Research 0000");
  await page.getByRole("option", { name: /Research 0000/u }).dblclick();
  const documentId = await page
    .locator(".reader-dock-tab")
    .filter({ hasText: "[test] Research 0000" })
    .getAttribute("data-panel-id");
  await pane(documentId).getByLabel("More document actions", { exact: true }).click();
  await page.getByRole("button", { name: "Source note", exact: true }).click();
  const notes = page.getByRole("textbox", { name: "Source literature note" });
  await expect(notes).toHaveCount(1);
  const first = await idOf(notes);
  await duplicate(first);
  await expect(notes).toHaveCount(2);
  const a = notes.nth(0),
    b = notes.nth(1);
  await a.fill("[test] Shared first edit");
  await expect(b).toHaveText("[test] Shared first edit");
  await b.press("Control+End");
  await b.pressSequentially(" plus second edit");
  await expect(a).toContainText("plus second edit");
  await b.press("Control+z");
  await expect(a).toHaveText("[test] Shared first edit");
  await expect(b).toHaveText("[test] Shared first edit");
  await expect(pane(first).getByText("Saved to collection", { exact: true })).toBeVisible();
  await auditComposition(page, a, b);
  await screenshot("shared-notes");
  blockWrites(true);
  await a.fill("[test] Shared offline recovery");
  await expect(b).toHaveText("[test] Shared offline recovery");
  await expect(pane(first).getByText("Saved locally", { exact: true })).toBeVisible();
  const dialogs = [];
  page.on("dialog", (dialog) => dialogs.push(dialog.message()));
  await tab(first).locator(".dv-default-tab-action").click();
  await expect(notes).toHaveCount(1);
  expect(dialogs).toEqual([]);
  await expect(notes).toHaveText("[test] Shared offline recovery");
  await page.reload();
  await expect(notes).toHaveText("[test] Shared offline recovery");
  blockWrites(false);
  // Retry is explicit after a network error, while ordinary recovery resumes automatically.
  const retry = page.getByRole("button", { name: "Retry save", exact: true });
  if (await retry.isVisible()) await retry.click();
  await expect(page.getByText("Saved to collection", { exact: true })).toBeVisible();

  await tab(documentId).click();
  const paragraph = page.frameLocator("iframe.html-viewer:visible").locator("#p0");
  await paragraph.evaluate((element) => {
    const doc = element.ownerDocument,
      range = doc.createRange();
    range.setStart(element.firstChild, 0);
    range.setEnd(element.firstChild, 57);
    const selection = doc.defaultView.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    doc.dispatchEvent(new doc.defaultView.PointerEvent("pointerup", { bubbles: true }));
  });
  const creator = page.getByRole("region", { name: "New highlight" });
  await expect(creator).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(creator).toBeVisible(); // selection alone is never autosaved as a new annotation
  await creator.getByRole("button", { name: "Save highlight", exact: true }).click();
  await expect(creator).toHaveCount(0);
  await pane(documentId).getByLabel("More document actions", { exact: true }).click();
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  const workbench = page
    .locator('.workspace-pane[aria-hidden="false"]')
    .filter({ has: page.locator(".annotation-card") });
  const annotationPane = await workbench.first().getAttribute("data-session-id");
  await duplicate(annotationPane);
  const annotationPanes = page
    .locator('.workspace-pane[aria-hidden="false"]')
    .filter({ has: page.locator(".annotation-card") });
  await expect(annotationPanes).toHaveCount(2);
  await annotationPanes.nth(0).getByRole("button", { name: "Edit", exact: true }).click();
  await annotationPanes.nth(1).getByRole("button", { name: "Edit", exact: true }).click();
  const comments = page.getByRole("textbox", { name: "Annotation note", exact: true });
  await expect(comments).toHaveCount(2);
  blockWrites(true);
  await comments.nth(0).press("Control+a");
  await page.keyboard.insertText("> Quotation\n\n[test] Shared comment");
  await expect
    .poll(() =>
      comments
        .nth(1)
        .evaluate((element) =>
          [...element.querySelectorAll(".cm-line")].map((line) => line.textContent).join("\n"),
        ),
    )
    .toBe("> Quotation\n\n[test] Shared comment");
  await expect(
    annotationPanes.nth(0).getByRole("button", { name: "Retry save", exact: true }),
  ).toBeVisible();
  await expect(
    annotationPanes.nth(1).getByRole("button", { name: "Retry save", exact: true }),
  ).toBeVisible();
  await comments.nth(1).press("Control+End");
  await comments.nth(1).pressSequentially(" with another edit");
  await expect(comments.nth(0)).toContainText("with another edit");
  blockWrites(false);
  await expect(
    annotationPanes.nth(0).getByText("Saved to collection", { exact: true }),
  ).toBeVisible();
  await expect(
    annotationPanes.nth(1).getByText("Saved to collection", { exact: true }),
  ).toBeVisible();
  await expect(comments).toHaveCount(2); // autosaving does not eject either editor
  await annotationPanes.nth(0).getByRole("button", { name: "Done", exact: true }).click();
  await expect(comments).toHaveCount(1);
  await expect(annotationPanes.nth(0)).toContainText("with another edit");
  await screenshot("shared-annotations");
  await annotationPanes.nth(0).getByRole("button", { name: "Edit", exact: true }).click();
  await annotationPanes.nth(0).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    annotationPanes.nth(0).getByRole("button", { name: "Keep annotation", exact: true }),
  ).toBeVisible();
  const beforeDeleteCheck = await comments.nth(1).textContent();
  await comments.nth(1).pressSequentially("MUST NOT APPLY");
  await expect(comments.nth(1)).toHaveText(beforeDeleteCheck);
  const deletingPane = await annotationPanes.nth(0).getAttribute("data-session-id");
  await tab(deletingPane).getByRole("button", { name: "Close tab", exact: true }).click();
  await expect(comments).toHaveCount(1);
  await comments.press("Control+a");
  await page.keyboard.insertText("[test] Local change retained during a conflict");
  // Another client changes the same revision without publishing into this window's session.
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
  await expect(page.getByText("Compare collection version", { exact: true })).toBeVisible();
  await expect(comments).toHaveText("[test] Local change retained during a conflict");
  await page.getByText("Compare collection version", { exact: true }).click();
  await expect(page.getByLabel("Edit annotation", { exact: true }).locator("pre")).toHaveText(
    "[test] Remote client changed this comment",
  );
  await screenshot("shared-annotation-conflict");
  await page.getByRole("button", { name: "Keep my changes", exact: true }).click();
  await expect(annotationPanes.getByText("Saved to collection", { exact: true })).toBeVisible();
  await comments.evaluate((element) => {
    element.dataset.sharedEditorIdentity = "original";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(comments).toBeVisible();
  await expect(comments).toHaveAttribute("data-shared-editor-identity", "original");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(comments).toHaveAttribute("data-shared-editor-identity", "original");
  return [
    "Independent note editors synchronously share text, map remote edits through local undo and synthetic IME composition, and autosave",
    "Closing a safely recovered note view neither prompts nor loses the other editor's content",
    "New annotations require explicit creation; existing comments share one autosave writer and save status",
    "Failed annotation saves retain the shared text; saving and Done do not close other editor views",
    "Deletion planning locks all editors; closing its owner releases the lock without deleting",
    "An external revision conflict retains local text and resolves against the fresh revision; mobile retains the editor instance",
  ];
}
