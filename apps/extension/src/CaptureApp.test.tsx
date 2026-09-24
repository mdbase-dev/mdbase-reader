import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { CaptureApp } from "./CaptureApp.js";

import type { ExtensionCaptureController } from "./capture-controller.js";

function markup(changes: Partial<ExtensionCaptureController> = {}): string {
  const controller = {
    snapshot: { status: "unselected", connections: [] },
    capture: {
      kind: "html",
      pageTitle: "[test] Article",
      canonicalUrl: "https://example.com/",
      selection: null,
    },
    draft: {
      title: "[test] Article",
      tags: "",
      note: "",
      comment: "",
      highlight: false,
      color: "yellow",
      highlightTags: "",
    },
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
it("labels a non-production build and offers the opt-in page status setting", () => {
  const html = markup();
  expect(html).toContain(">LAB<");
  expect(html).toContain("Mark pages I’ve saved");
  expect(html).toContain("Select text on the page to highlight it.");
});
it("offers colour, tags and a note for a live selection, saved with Ctrl+Enter", () => {
  const html = markup({
    capture: {
      kind: "html",
      pageTitle: "[test] Article",
      canonicalUrl: "https://example.com/",
      selection: { exact: "a chosen passage" },
    } as ExtensionCaptureController["capture"],
    draft: {
      title: "[test] Article",
      tags: "",
      note: "",
      comment: "",
      highlight: true,
      color: "blue",
      highlightTags: "",
    },
  });
  expect(html).toContain("a chosen passage");
  expect(html).toMatch(
    /<input type="radio" name="color" value="blue" checked=""|<input[^>]*checked=""[^>]*value="blue"/u,
  );
  expect(html).toContain('id="highlight-tags"');
  expect(html).toContain('aria-keyshortcuts="Control+Enter Meta+Enter"');
  expect(html).toContain("Save source and highlight");
});
it("shows where a new source's citation comes from", () => {
  const html = markup({
    citation: {
      citation: {
        type: "article-journal",
        title: "Deep learning",
        author: [{ family: "LeCun" }, { family: "Bengio" }],
        issued: { "date-parts": [[2015]] },
        "container-title": "Nature",
      },
      origin: "doi",
      doi: "10.1038/nature14539",
    },
  });
  expect(html).toContain("LeCun et al. · (2015) · Nature");
  expect(html).toContain("10.1038/nature14539");
  expect(html).toContain("From the DOI registry");
});
it("saves PDFs without offering in-page highlighting", () => {
  const html = markup({
    capture: {
      kind: "pdf",
      pageTitle: "paper",
      canonicalUrl: "https://example.com/paper.pdf",
      selection: null,
    } as ExtensionCaptureController["capture"],
  });
  expect(html).toContain("CURRENT PDF");
  expect(html).toContain("Save PDF");
  expect(html).toContain("highlight it in Reader");
});
it("explains how to continue after the tab navigates away", () => {
  const html = markup({ navigated: true });
  expect(html).toContain("moved to another page");
  expect(html).toContain('<fieldset disabled=""');
});
