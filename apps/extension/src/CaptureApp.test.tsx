import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { CaptureApp } from "./CaptureApp.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

function markup(changes: Partial<ExtensionCaptureController> = {}): string {
  const controller = {
    snapshot: { status: "unselected", connections: [] },
    capture: { pageTitle: "[test] Article", canonicalUrl: "https://example.com/", selection: null },
    draft: { title: "[test] Article", tags: "", note: "", comment: "", highlight: false },
    source: null,
    problem: null,
    busy: false,
    annotations: [],
    setDraft: vi.fn(),
    ...changes,
  } as unknown as ExtensionCaptureController;
  return renderToStaticMarkup(<CaptureApp controller={controller} />);
}
it("has a destination, editable metadata and honest unsaved status before saving", () => {
  const html = markup();
  expect(html).toContain("Save to collection");
  expect(html).toContain('id="title"');
  expect(html).toContain('id="tags"');
  expect(html).toContain('id="note"');
  expect(html).toContain("Not saved yet.");
  expect(html).not.toContain("Source saved in mdbase.");
});
it("offers recovery even when initial registration fails", () => {
  const html = markup({ problem: "The request origin is not allowed." });
  expect(html).toContain("Not saved");
  expect(html).toContain("Retry connection");
  expect(html).toContain("Review access");
  expect(html).toContain("will not bypass the origin check");
});
it("does not claim an unknown write failed to persist", () => {
  const html = markup({ problem: "Outcome unknown", saveAttempted: true });
  expect(html).toContain("Save not confirmed");
  expect(html).toContain("check for an existing source");
  expect(html).not.toContain("Not saved yet.");
});
it("explains missing and ambiguous highlights with a source-specific saved-copy link", () => {
  const html = markup({
    source: {
      id: "s1",
      collectionId: "c1",
      title: "[test] Saved",
    } as ExtensionCaptureController["source"],
    projection: { total: 3, shown: 1, missing: 1, ambiguous: 1 },
  });
  expect(html).toContain("1 of 3 highlights shown.");
  expect(html).toContain("page may have changed");
  expect(html).toContain("has not guessed");
  expect(html).toContain("remain safe");
  expect(html).toContain("collection=c1&amp;source=s1");
});
