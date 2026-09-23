import { expect } from "@playwright/test";

async function measureTyping(page, comments) {
  await comments.fill("[test] ");
  await comments.evaluate((element) => {
    const frames = [],
      longTasks = [];
    const observer = new globalThis.PerformanceObserver((list) => {
      longTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    observer.observe({ type: "longtask" });
    const keydown = (event) => {
      if (event.key.length !== 1) return;
      const start = performance.now();
      globalThis.requestAnimationFrame(() => frames.push(performance.now() - start));
    };
    element.addEventListener("keydown", keydown, true);
    globalThis.__finishAnnotationTyping = () => {
      element.removeEventListener("keydown", keydown, true);
      observer.disconnect();
      frames.sort((a, b) => a - b);
      const percentile = (p) => Math.round(frames[Math.floor((frames.length - 1) * p)] * 10) / 10;
      return {
        keys: frames.length,
        medianNextFrameMs: percentile(0.5),
        p95NextFrameMs: percentile(0.95),
        maxNextFrameMs: percentile(1),
        longTasks,
      };
    };
  });
  await comments.pressSequentially("native annotation typing performance check", { delay: 30 });
  await page.waitForTimeout(50);
  return page.evaluate(() => globalThis.__finishAnnotationTyping());
}

export async function auditSimpleAnnotations(
  page,
  { pane, tab, duplicate, documentId, screenshot, blockWrites, measurements },
) {
  await pane(documentId).getByLabel("More document actions", { exact: true }).click();
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  const panes = page
    .locator('.workspace-pane[aria-hidden="false"]')
    .filter({ has: page.locator(".annotation-card") });
  await duplicate(await panes.first().getAttribute("data-session-id"));
  const comments = page.getByRole("textbox", { name: "Annotation note", exact: true });
  await panes.nth(0).getByRole("button", { name: "Edit", exact: true }).click();
  expect(await comments.evaluate((element) => element.tagName)).toBe("TEXTAREA");
  await expect(panes.locator(".cm-editor")).toHaveCount(0);
  await page.evaluate(() => {
    globalThis.__annotationDeviceWrites = 0;
    for (const method of ["put", "delete"]) {
      const original = globalThis.IDBObjectStore.prototype[method];
      globalThis.IDBObjectStore.prototype[method] = function (...args) {
        if (this.name === "drafts") globalThis.__annotationDeviceWrites += 1;
        return original.apply(this, args);
      };
    }
  });
  blockWrites(true);
  measurements.annotationTypingFixture = await measureTyping(page, comments);
  expect(measurements.annotationTypingFixture.keys).toBeGreaterThan(30);
  await comments.fill("[test] Failed autosave stays in memory");
  await expect(panes.nth(0).getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
  await expect(comments).toHaveValue("[test] Failed autosave stays in memory");
  await expect(panes.nth(1)).not.toContainText("Failed autosave stays in memory");
  await panes.nth(1).getByRole("button", { name: "Edit here", exact: true }).click();
  await expect(comments).toHaveCount(1);
  await expect(comments).toHaveValue("[test] Failed autosave stays in memory");
  blockWrites(false);
  await panes.nth(1).getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(comments).toHaveCount(0);
  await panes.nth(0).getByRole("button", { name: "Edit here", exact: true }).click();
  let release,
    received = false,
    requests = 0;
  const pattern = "**/__reader-audit/annotations/**";
  const delayFirstWrite = async (route) => {
    if (route.request().method() === "PUT") {
      requests += 1;
      if (!received) {
        received = true;
        await new Promise((resolve) => {
          release = resolve;
        });
      }
    }
    await route.fallback();
  };
  await page.route(pattern, delayFirstWrite);
  await comments.fill("[test] First autosave");
  await expect.poll(() => received).toBe(true);
  await expect(comments).toBeEditable();
  await comments.fill("[test] Newer typing during the first save");
  await page.waitForTimeout(1200);
  expect(requests).toBe(1);
  release();
  await expect(panes.nth(0).getByText("Saved", { exact: true })).toBeVisible();
  await expect(comments).toHaveValue("[test] Newer typing during the first save");
  await expect(panes.nth(1)).toContainText("Newer typing during the first save");
  expect(requests).toBe(2);
  await page.unroute(pattern, delayFirstWrite);
  await screenshot("annotation-memory-autosave");
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => void dialog.accept());
  await comments.fill("[test] Discard before debounce");
  await panes.nth(0).getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(comments).toHaveCount(0);
  await page.waitForTimeout(1200);
  await expect(panes.nth(0)).toContainText("Newer typing during the first save");
  await panes.nth(0).getByRole("button", { name: "Edit", exact: true }).click();
  blockWrites(true);
  await comments.fill("[test] Unsaved close warning");
  await expect(panes.nth(0).getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
  page.removeAllListeners("dialog");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("unsaved changes");
    await dialog.dismiss();
  });
  await panes
    .nth(0)
    .getByLabel("Edit annotation", { exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(comments).toHaveValue("[test] Unsaved close warning");
  blockWrites(false);
  await panes.nth(0).getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(comments).toHaveCount(0);
  await panes.nth(0).getByRole("button", { name: "Edit", exact: true }).click();
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
  await panes.getByRole("button", { name: "Edit", exact: true }).click();
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
  await expect(page.getByText("Compare collection version", { exact: true })).toBeVisible();
  await expect(comments).toHaveValue("[test] Local change retained during a conflict");
  await page.getByText("Compare collection version", { exact: true }).click();
  await screenshot("annotation-autosave-conflict");
  await page.getByRole("button", { name: "Keep my changes", exact: true }).click();
  await expect(comments).toHaveCount(0);
  await panes.getByRole("button", { name: "Edit", exact: true }).click();
  await comments.evaluate((element) => {
    element.dataset.simpleEditorIdentity = "original";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(comments).toBeVisible();
  await expect(comments).toHaveAttribute("data-simple-editor-identity", "original");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await comments.press("Escape");
  expect(await page.evaluate(() => globalThis.__annotationDeviceWrites)).toBe(0);
  await page.reload();
  await expect(panes).toContainText("Local change retained during a conflict");
  return [
    "Annotation textareas autosave to mdbase after idle with zero IndexedDB draft writes",
    "Typing stays enabled during saves; one writer preserves and commits newer text in order",
    "Failed edits remain in memory with retry, unsaved-close warnings, revision conflicts and explicit discard",
    "Deletion checks retain ownership protection; mobile retains the native textarea and saved text survives reload",
  ];
}
