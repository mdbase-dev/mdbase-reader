import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, expect } from "@playwright/test";

import { auditPdf, auditEpub } from "./reader-audit-documents.mjs";
import { auditDockview } from "./audit-dockview.mjs";
import { auditDockviewMigration } from "./audit-dockview-migration.mjs";
import { annotationFixture } from "./audit-annotation-fixture.mjs";
import { auditAnnotations } from "./audit-annotations.mjs";
import { auditSharedEditing } from "./audit-shared-editing.mjs";
import { auditSidebarLayout } from "./audit-sidebar-layout.mjs";
import { auditEdgeGroupApi } from "./audit-edge-group-api.mjs";
import { auditResponsiveWorkspace } from "./audit-responsive-workspace.mjs";

const origin = process.env.READER_AUDIT_ORIGIN ?? "http://127.0.0.1:5193";
const sharedEditingAudit = process.env.READER_AUDIT_SHARED_EDITING_ONLY === "1";
const responsiveAudit = process.env.READER_AUDIT_RESPONSIVE_ONLY === "1";
const sidebarComparison = responsiveAudit || process.env.READER_AUDIT_SIDEBARS_ONLY === "1";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Reader audits only run against an explicit loopback origin.");
}
const specialDocuments = new Map([
  ["file_pdf", { bytes: auditPdf(), mediaType: "application/pdf", extension: "pdf" }],
  ["file_epub", { bytes: await auditEpub(), mediaType: "application/epub+zip", extension: "epub" }],
]);
const directory = await mkdtemp(join(tmpdir(), "reader-audit-"));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("dialog", (dialog) => void dialog.accept());
const errors = [];
const consoleErrors = [];
const sandboxNotices = [];
const failedRequests = [];
page.on("pageerror", (error) => errors.push(error.message.slice(0, 300)));
page.on("console", (message) => {
  // Chromium reports blocked script execution when interacting with our script-disabled srcdoc.
  // Keep that security notice in the evidence; never relax the document sandbox to silence it.
  if (
    message.text() ===
    "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set."
  ) {
    if (sandboxNotices.length < 20) sandboxNotices.push(message.text());
    return;
  }
  if (
    message.type() === "error" &&
    !/status of (503|409)/u.test(message.text()) &&
    consoleErrors.length < 20
  ) {
    consoleErrors.push(message.text().slice(0, 300));
  }
});
page.on("requestfailed", (request) => {
  if (request.failure()?.errorText !== "net::ERR_ABORTED" && failedRequests.length < 20) {
    const url = new URL(request.url());
    failedRequests.push({ path: url.pathname, error: request.failure()?.errorText });
  }
});
const measurements = {};
const completed = [];
let writesBlocked = false;
let documentsBlocked = false;
let documentRequests = 0;
let writes = 0;
const html = (index) =>
  `<!doctype html><html lang="en"><head><title>[test] Research ${index}</title></head><body><article><h1>[test] Reading fixture ${index}</h1>${Array.from({ length: 60 }, (_, paragraph) => `<p id="p${paragraph}">A durable reading library makes patient attention possible. Passage ${paragraph + 1} considers research, memory and careful interpretation. This is disposable test material, not a real collection.</p>`).join("")}</article></body></html>`;
const records = Array.from({ length: 5000 }, (_, index) => {
  const id = `test_${String(index).padStart(4, "0")}`;
  return {
    collectionId: "test-reader-audit",
    id,
    path: `sources/${id}.md`,
    title: `[test] Research ${String(index).padStart(4, "0")}`,
    creators: ["Test Author"],
    tags: ["test"],
    body: "Original note. The remembered phrase is patient attention.",
    recordRevision: "rev-1",
    frontmatter: {},
    readingStatus: index === 0 ? "reading" : "queued",
    ...(index === 0
      ? { reading: { status: "reading", lastOpenedAt: "2026-09-01T00:00:00Z" } }
      : {}),
    documents:
      index < 20
        ? [
            {
              fileId: `file_${index}`,
              file: `[[files/${index}.html]]`,
              revision: `sha256:${createHash("sha256").update(html(index)).digest("hex")}`,
              mediaType: "text/html",
              role: "primary",
            },
          ]
        : [],
  };
});
let specialIndex = 20;
for (const [fileId, file] of specialDocuments) {
  records[specialIndex].documents = [
    {
      fileId,
      file: `[[files/${fileId}.${file.extension}]]`,
      mediaType: file.mediaType,
      role: "primary",
      revision: `sha256:${createHash("sha256").update(file.bytes).digest("hex")}`,
    },
  ];
  specialIndex += 1;
}
const annotationApi = annotationFixture(records, () => writesBlocked);
await context.route(`${origin}/__reader-audit/**`, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace("/__reader-audit/", "");
  const respond = (value, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
  if (path.startsWith("annotations/"))
    return annotationApi(path.slice("annotations/".length), request, respond);
  if (path === "library") {
    return respond(records);
  }
  if (path.startsWith("source/")) {
    const record = records.find((item) => item.id === path.slice(7));
    if (request.method() === "PUT") {
      if (writesBlocked) {
        return respond({ error: "[test] Offline" }, 503);
      }
      const patch = request.postDataJSON();
      if (patch.body !== undefined && patch.revision !== record.recordRevision) {
        return respond({ error: "[test] Conflict" }, 409);
      }
      writes += 1;
      if (patch.body !== undefined) {
        record.body = patch.body;
      }
      if (patch.reading) {
        record.reading = patch.reading;
      }
      record.recordRevision = `rev-${writes + 1}`;
    }
    return respond(record ?? null);
  }
  if (path.startsWith("search")) {
    const query = (url.searchParams.get("q") ?? "").toLowerCase();
    return respond(
      records
        .filter((record) => record.body.toLowerCase().includes(query))
        .map((record) => ({
          sourceId: record.id,
          kinds: ["source-note"],
          passages: [{ kind: "source-note", path: record.path, text: record.body }],
        })),
    );
  }
  if (path.startsWith("document/")) {
    documentRequests += 1;
    if (documentsBlocked) {
      return route.fulfill({ status: 503, body: "[test] Offline" });
    }
    const special = specialDocuments.get(path.slice("document/".length));
    if (special) {
      return route.fulfill({ contentType: special.mediaType, body: special.bytes });
    }
    const index = Number(path.split("file_")[1]);
    return route.fulfill({ contentType: "text/html", body: html(index) });
  }
  return route.fulfill({ status: 404, body: "Unknown fixture route" });
});
const navigate = async () => {
  await page.goto(`${origin}/test-fixtures/audit-reader.html`);
  await expect(page.getByRole("button", { name: "Toggle library navigator" })).toBeVisible();
};
const screenshot = async (name) =>
  page.screenshot({ path: join(directory, `${name}.png`), animations: "disabled" });
try {
  const started = performance.now();
  await navigate();
  if (sharedEditingAudit) {
    completed.push(
      ...(await auditSharedEditing(page, {
        screenshot,
        blockWrites: (value) => {
          writesBlocked = value;
        },
      })),
    );
  }
  if (sidebarComparison) {
    completed.push(...(await auditSidebarLayout(page, { screenshot, measurements })));
    measurements.edgeApi = await auditEdgeGroupApi(context, origin);
    if (responsiveAudit) {
      expect(Object.values(measurements.sidebars.acceptance).every(Boolean)).toBe(true);
      completed.push(
        ...(await auditResponsiveWorkspace(page, {
          screenshot,
          blockWrites: (value) => {
            writesBlocked = value;
          },
        })),
      );
    }
  }
  if (
    !sharedEditingAudit &&
    !sidebarComparison &&
    process.env.READER_AUDIT_ANNOTATIONS_ONLY !== "1"
  ) {
    await expect(page.getByRole("grid", { name: "Sources" })).toBeVisible();
    measurements.libraryReadyMs = Math.round(performance.now() - started);
    measurements.renderedRows5000Sources = await page.getByRole("row").count();
    expect(measurements.renderedRows5000Sources).toBeLessThanOrEqual(101);
    await expect(page.getByRole("navigation", { name: "Library result pages" })).toContainText(
      "5000 sources",
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Library result pages" })).toContainText(
      "Page 2",
    );
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await screenshot("desktop-library");
    completed.push("5,000-source library: bounded rows and pagination");

    await page.getByRole("button", { name: "Continue reading", exact: false }).click();
    await expect(page.locator("iframe.html-viewer")).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Keep offline", exact: true }).click();
    await expect(page.getByText("Exact revision saved on this device")).toBeVisible();
    const requestsBeforeReload = documentRequests;
    documentsBlocked = true;
    await page.reload();
    await expect(page.getByText("Exact revision saved on this device")).toBeVisible({
      timeout: 30000,
    });
    expect(documentRequests).toBe(requestsBeforeReload);
    await screenshot("offline-document");
    completed.push("Exact-revision offline copy reopens without document network traffic");
    documentsBlocked = false;

    await page.getByLabel("More document actions", { exact: true }).click();
    await page.getByRole("button", { name: "Source note", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Source literature note" });
    await expect(editor).toBeVisible();
    writesBlocked = true;
    await editor.fill("[test] Unsaved draft survives a reload. Patient attention.");
    await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
    await page.waitForTimeout(1100);
    await page.reload();
    await expect(page.getByText("Saved locally", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(editor).toContainText("Unsaved draft survives a reload");
    await editor.focus();
    await page.getByRole("button", { name: /Interface density:/ }).focus();
    await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
    completed.push("Failed autosave: durable draft survives reload and remains reviewable on blur");
    records[0].body = "[test] A different application edited the collection version.";
    records[0].recordRevision = "external-revision";
    await page.reload();
    await expect(page.getByRole("region", { name: "Source note conflict" })).toBeVisible({
      timeout: 20000,
    });
    await page.getByText("Compare versions", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Source note conflict" })).toContainText(
      "A different application",
    );
    expect(
      (await page.getByRole("region", { name: "Source note conflict" }).boundingBox()).height,
    ).toBeGreaterThan(180);
    await screenshot("draft-conflict");
    writesBlocked = false;
    await page.getByRole("button", { name: "Save my draft instead", exact: true }).click();
    await expect(page.getByText("Saved to collection", { exact: true })).toBeVisible();
    expect(records[0].body).toContain("Unsaved draft survives");
    await page.reload();
    await expect(editor).toContainText("Unsaved draft survives");
    await expect(
      page.getByText("Recovered changes saved on this device. Syncing to the collection…", {
        exact: true,
      }),
    ).toHaveCount(0);
    completed.push("Conflict comparison, explicit resolution, and reload verification");

    await page.getByRole("tab", { name: "[test] Research 0000", exact: true }).click();
    await expect(page.locator("iframe.html-viewer")).toBeVisible();
    await page.locator(".navigator-heading > button").first().click();
    await page.getByRole("combobox", { name: "Search scope" }).selectOption("notes");
    await page.getByRole("textbox", { name: "Search this view" }).fill("Unsaved draft survives");
    await expect(
      page.getByRole("region", { name: "Text search results" }).locator("mark"),
    ).toHaveText("Unsaved draft survives");
    await screenshot("passage-search");
    await page.getByRole("combobox", { name: "Search scope" }).selectOption("documents");
    await page.getByRole("textbox", { name: "Search this view" }).fill("patient attention");
    await expect(page.getByRole("region", { name: "Text search results" })).toContainText(
      "Only loaded, supported documents",
    );
    await expect(
      page.getByRole("region", { name: "Text search results" }).locator("mark").first(),
    ).toHaveText("patient attention", { timeout: 20000 });
    completed.push(
      "Notes and loaded-document search: snippets, highlighted matches, explicit coverage",
    );

    await page.getByRole("button", { name: /Interface density:/ }).click();
    await expect(page.locator(".reader-shell")).toHaveAttribute("data-density", "compact");
    await page.reload();
    await expect(page.locator(".reader-shell")).toHaveAttribute("data-density", "compact");
    await page.getByRole("button", { name: /Interface density:/ }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("complementary", { name: "Library navigator" })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
      ),
    ).toBe(true);
    await screenshot("mobile-library");
    await page.getByRole("button", { name: "Toggle library navigator" }).click();
    await expect(page.getByRole("complementary", { name: "Library navigator" })).toBeVisible();
    await page.getByRole("button", { name: "Toggle library navigator" }).click();
    await page.keyboard.press("Control+Shift+f");
    await expect(
      page.getByRole("textbox", { name: "Find a source by title, author or tag" }),
    ).toBeFocused();
    completed.push("Density persists; mobile sheets, overflow, and keyboard library shortcut");

    await page.setViewportSize({ width: 1440, height: 1000 });
    const navigatorSearch = page.getByRole("textbox", {
      name: "Find a source by title, author or tag",
    });
    const residency = [];
    writesBlocked = true; // Local position restoration must not depend on a successful server save.
    const activeHtml = page
      .frameLocator(".document-session.is-active iframe.html-viewer")
      .locator("html");
    for (let index = 1; index <= 19; index += 1) {
      await navigatorSearch.fill(`Research ${String(index).padStart(4, "0")}`);
      await page
        .getByRole("option", { name: new RegExp(`Research ${String(index).padStart(4, "0")}`) })
        .dblclick();
      await expect(page.locator(".document-session.is-active iframe.html-viewer")).toBeVisible({
        timeout: 20000,
      });
      if (index === 1) {
        await activeHtml.evaluate((element) => element.ownerDocument.defaultView.scrollTo(0, 1200));
        await expect
          .poll(() => activeHtml.evaluate((element) => element.ownerDocument.defaultView.scrollY))
          .toBeGreaterThan(1000);
      }
      await page.waitForTimeout(350);
      residency.push(await page.locator("iframe.html-viewer").count());
    }
    expect(Math.max(...residency)).toBeLessThanOrEqual(4);
    measurements.residentRenderersAfterEachOpen = residency;
    measurements.domNodes = await page.locator("*").count();
    await screenshot("bounded-document-tabs");
    completed.push("Twenty visited HTML documents retain at most four renderers");
    writesBlocked = false;
    await navigatorSearch.fill("Research 0001");
    await page.getByRole("option", { name: /Research 0001/ }).dblclick();
    await expect
      .poll(() => activeHtml.evaluate((element) => element.ownerDocument.defaultView.scrollY))
      .toBeGreaterThan(1000);
    completed.push("Evicted document restores its location even when position saves failed");

    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await screenshot("dark-reading");
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    for (const [index, format] of [
      [20, "pdf"],
      [21, "epub"],
    ]) {
      await navigatorSearch.fill(`Research ${String(index).padStart(4, "0")}`);
      await page
        .getByRole("option", { name: new RegExp(`Research ${String(index).padStart(4, "0")}`) })
        .dblclick();
      await expect(page.locator(`.document-session.is-active .${format}-viewer`)).toBeVisible({
        timeout: 60000,
      });
      await expect(
        page.locator(".document-session.is-active .document-renderer-status"),
      ).toHaveCount(0, { timeout: 60000 });
      if (format === "pdf") {
        await expect
          .poll(
            () =>
              page
                .locator(".document-session.is-active .pdf-viewer img")
                .evaluateAll((images) =>
                  images.some((image) => image.complete && image.naturalWidth > 100),
                ),
            { timeout: 30000 },
          )
          .toBe(true);
        await page.waitForTimeout(500);
      }
      await screenshot(`${format}-reading`);
      completed.push(`${format.toUpperCase()} fixture renders through the real renderer`);
      if (format === "epub") {
        await page.getByRole("button", { name: "Next page", exact: true }).click();
        await expect
          .poll(() => records[21].reading?.position?.locator?.locations?.progression ?? 0, {
            timeout: 10000,
          })
          .toBeGreaterThan(0);
        await page.getByRole("button", { name: "Previous page", exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect
          .poll(() => records[21].reading?.position?.locator?.locations?.progression ?? -1, {
            timeout: 10000,
          })
          .toBe(0);
        completed.push("EPUB page controls work with pointer and keyboard, persisting location");
      }
    }
    completed.push(
      ...(await auditDockview(page, {
        screenshot,
        blockWrites: (value) => {
          writesBlocked = value;
        },
      })),
    );
    completed.push(...(await auditDockviewMigration(page)));
  }
  if (!sharedEditingAudit && !sidebarComparison) {
    completed.push(
      ...(await auditAnnotations(page, {
        screenshot,
        blockWrites: (value) => {
          writesBlocked = value;
        },
      })),
    );
  }
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  await writeFile(
    join(directory, "result.json"),
    JSON.stringify(
      {
        result: "passed",
        completed,
        measurements,
        errors,
        consoleErrors,
        sandboxNotices,
        failedRequests,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        result: "passed",
        completed,
        measurements,
        evidence: directory,
        cleanup: "owned browser closed; disposable fixtures only",
      },
      null,
      2,
    ),
  );
} catch (error) {
  await screenshot("failure").catch(() => {});
  const result = {
    result: "failed",
    completed,
    measurements,
    error: error.message,
    workspace: await page
      .evaluate(() => ({
        saved: localStorage.getItem("mdbase-reader:dockview:v1:test-reader-audit"),
        mobileOptions: Array.from(
          globalThis.document.querySelectorAll(".mobile-workspace-navigation option"),
        ).map((option) => ({ value: option.value, title: option.textContent })),
      }))
      .catch(() => null),
    errors,
    consoleErrors,
    sandboxNotices,
    failedRequests,
    evidence: directory,
  };
  await writeFile(join(directory, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
