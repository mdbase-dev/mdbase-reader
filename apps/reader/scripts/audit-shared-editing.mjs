import { expect } from "@playwright/test";
import { realpathSync } from "node:fs";
import { auditSimpleAnnotations } from "./audit-simple-annotations.mjs";

async function auditLocalCheckpoint(page, a, b) {
  await page.evaluate(() => {
    const original = globalThis.Storage.prototype.setItem;
    globalThis.__readerCheckpointWrites = 0;
    globalThis.__restoreCheckpointAudit = () => {
      globalThis.Storage.prototype.setItem = original;
    };
    globalThis.Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("mdbase-reader:draft:v1:")) {
        globalThis.__readerCheckpointWrites += 1;
      }
      return original.call(this, key, value);
    };
  });
  try {
    await a.fill("[test] ");
    await a.press("Control+End");
    await a.pressSequentially("checkpoints", { delay: 30 });
    await expect(b).toHaveText("[test] checkpoints");
    expect(await page.evaluate(() => globalThis.__readerCheckpointWrites)).toBe(0);
    await expect.poll(() => page.evaluate(() => globalThis.__readerCheckpointWrites)).toBe(1);
  } finally {
    await page.evaluate(() => globalThis.__restoreCheckpointAudit());
  }
}

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
  await auditLocalCheckpoint(page, a, b);
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
  await creator.getByRole("button", { name: "Add a comment", exact: true }).click();
  const creatingText = creator.getByRole("textbox", { name: "Annotation note" });
  await creatingText.fill("[test] Latest");
  await creatingText.pressSequentially(" characters saved immediately");
  await creatingText.press("Control+s");
  await expect(creator).toHaveCount(0);
  const created = await page.evaluate(async () =>
    (await fetch("/__reader-audit/annotations/test_0000")).json(),
  );
  expect(created[0].body).toContain("Latest characters saved immediately");
  const annotations = await auditSimpleAnnotations(page, {
    pane,
    tab,
    duplicate,
    documentId,
    screenshot,
    blockWrites,
  });
  return [
    "Native browser typing shares text immediately while local recovery coalesces the burst into one checkpoint",
    "Independent note editors synchronously share text, map remote edits through local undo and synthetic IME composition, and autosave",
    "Closing a safely recovered note view neither prompts nor loses the other editor's content",
    ...annotations,
  ];
}
