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
it("asks a new user only to connect, with editable metadata and no status noise", () => {
  const html = markup();
  expect(html).toContain("Connect a collection");
  expect(html).toContain("Connect to mdbase LAB");
  expect(html).not.toContain("Connect another collection");
  expect(html).not.toContain("Choose a collection");
  expect(html).toContain('id="title"');
  expect(html).toContain('id="tags"');
  expect(html).toContain('id="note"');
  expect(html).not.toContain("Not saved yet.");
  expect(html).not.toContain("Source saved in mdbase.");
});
it("picks among connected collections with Reader's select", () => {
  const html = markup({
    snapshot: {
      status: "unselected",
      connections: [{ collectionId: "c1", displayName: "[test] Papers" }],
    } as unknown as ExtensionCaptureController["snapshot"],
  });
  expect(html).toContain("Save to collection");
  expect(html).toContain('role="combobox"');
  expect(html).toContain("Choose a collection");
  expect(html).toContain("Connect another collection");
  expect(html).not.toContain("Connect to mdbase");
});
it("links the brand to the Reader library on the selected collection", () => {
  const html = markup({
    snapshot: {
      status: "ready",
      collectionId: "c1",
      connections: [{ collectionId: "c1", displayName: "[test] Papers" }],
    } as unknown as ExtensionCaptureController["snapshot"],
  });
  expect(html).toMatch(
    /class="brand" href="https:\/\/lab\.mdbase-reader\.pages\.dev\/\?collection=c1"/u,
  );
});
it("offers recovery even when initial registration fails", () => {
  const html = markup({ problem: "The request origin is not allowed." });
  expect(html).toContain("Not connected");
  expect(html).toContain("Retry connection");
  expect(html).toContain("Review access");
  expect(html).toContain("will not bypass the origin check");
});
it("does not claim an unknown write failed to persist", () => {
  const html = markup({ problem: "Outcome unknown", problemKind: "save", saveAttempted: true });
  expect(html).toContain("Save not confirmed");
  expect(html).toContain("check for an existing source");
  expect(html).toContain("Retry save");
  expect(html).not.toContain("Retry connection");
});
it("does not offer Connect recovery when the page itself cannot be read", () => {
  const html = markup({ problem: "Cannot access this page", problemKind: "page" });
  expect(html).toContain("Reader cannot read this page");
  expect(html).toContain("Reload the page");
  expect(html).not.toContain("Retry connection");
  expect(html).not.toContain("Review access");
});
const savedSource = {
  id: "s1",
  collectionId: "c1",
  title: "[test] Saved",
} as ExtensionCaptureController["source"];
function highlight(id: string, exact: string, body = `> ${exact}`): unknown {
  return { id, body, tags: [], color: "green", target: { quote: { exact } } };
}
it("lists saved highlights and says which ones the page could not show", () => {
  const html = markup({
    source: savedSource,
    annotations: [
      highlight("a1", "shown passage", "> shown passage\n\nMy comment"),
      highlight("a2", "missing passage"),
      highlight("a3", "repeated passage"),
      { id: "n1", body: "A note without a quote", tags: [] },
    ] as unknown as ExtensionCaptureController["annotations"],
    projection: {
      report: { total: 3, shown: 1, missing: 1, ambiguous: 1 },
      outcomes: new Map([
        ["a1", "shown"],
        ["a2", "missing"],
        ["a3", "ambiguous"],
      ]),
    } as unknown as ExtensionCaptureController["projection"],
  });
  expect(html).toMatch(/Highlights <span>3<\/span>/u);
  expect(html).toContain("shown passage");
  expect(html).toContain("My comment");
  expect(html).toContain("Edit comment");
  expect(html).toContain("Add comment");
  expect(html).toContain("Not found on this page");
  expect(html).toContain("Matches several places on this page");
  expect(html).toContain("2 not shown on this page");
  expect(html).toContain("still in the saved copy");
  expect(html).not.toContain("A note without a quote");
  expect(html).toContain("collection=c1&amp;source=s1");
  expect(html).toContain("Open saved copy in Reader");
});
it("names the connected collection in one line, with its controls behind Change", () => {
  const html = markup({
    snapshot: {
      status: "ready",
      collectionId: "c1",
      connections: [{ collectionId: "c1", displayName: "[test] Papers" }],
    } as unknown as ExtensionCaptureController["snapshot"],
  });
  expect(html).toContain("Saving to <strong>[test] Papers</strong>");
  expect(html).toContain(">Change<");
  expect(html).not.toContain('role="combobox"');
  expect(html).not.toContain("Connect another collection");
});
it("keeps connection diagnostics out of the panel unless enabled in Settings", () => {
  expect(markup()).not.toContain("Connection diagnostics");
});
it("shows one status line at a time, with problems taking precedence", () => {
  const restored = markup({ draftRestored: true, notice: "Highlight saved." });
  expect(restored).toContain("Highlight saved.");
  expect(restored).not.toContain("Restored your unsaved note");
  const failing = markup({ notice: "Highlight saved.", problem: "offline", problemKind: "save" });
  expect(failing).toContain("offline");
  expect(failing).not.toContain("Highlight saved.");
});
it.each(["unavailable", "start_failed", "blocked"])(
  "offers connection retry, not reapproval, for %s",
  (status) => {
    const html = markup({
      snapshot: {
        status,
        collectionId: "c1",
        connections: [{ collectionId: "c1", displayName: "Papers" }],
        problem: { message: "Temporarily blocked" },
      } as unknown as ExtensionCaptureController["snapshot"],
      problem: "Request timed out",
      problemKind: "save",
      saveAttempted: true,
    });
    expect(html).toContain("Retry connection");
    expect(html).not.toContain("approve access again");
    expect(html).not.toContain("Review access");
  },
);
it("does not display stale write progress after a successful save", () => {
  const html = markup({
    status: "saved",
    source: savedSource,
    busy: false,
    refreshing: true,
    progress: { phase: "creating", completedBytes: 1, totalBytes: 1, fileIndex: 1, fileCount: 1 },
  });
  expect(html).toContain("Source saved in mdbase.");
  expect(html).toContain("Updating…");
  expect(html).not.toContain("Saving source record");
});
it("labels recovery scans separately from duplicate checks", () => {
  const html = markup({
    busy: true,
    progress: { phase: "recovering", completedBytes: 0, totalBytes: 1, fileIndex: 0, fileCount: 1 },
  });
  expect(html).toContain("Checking files from the previous save attempt");
  expect(html).not.toContain("Checking for duplicates");
});
it("labels a non-production build and links to settings", () => {
  const html = markup();
  expect(html).toContain(">LAB<");
  expect(html).toContain("Settings and shortcuts");
  expect(html).toContain("Select text on the page to highlight it.");
});
it("saves a live selection by choosing a colour, or with Ctrl+Enter after a comment", () => {
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
  expect(html).toContain("Save page and highlight");
  expect(html).toMatch(/aria-pressed="true" aria-keyshortcuts="3"[^>]*>blue/u);
  expect(html).toMatch(/aria-pressed="false" aria-keyshortcuts="1"[^>]*>yellow/u);
  expect(html).toContain('aria-keyshortcuts="Escape"');
  expect(html).not.toContain("Save this highlight");
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
  expect(html).toContain("highlighted in Reader");
  expect(html).not.toContain("swatch");
});
it("makes opening Reader the next step after saving a PDF", () => {
  const html = markup({
    capture: {
      kind: "pdf",
      pageTitle: "paper",
      canonicalUrl: "https://example.com/paper.pdf",
      selection: null,
    } as ExtensionCaptureController["capture"],
    source: savedSource,
  });
  expect(html).toMatch(/class="primary reader-link"[^>]*>Open in Reader to highlight/u);
});
it("explains how to continue after the tab navigates away", () => {
  const html = markup({ navigated: true });
  expect(html).toContain("moved to another page");
  expect(html).toContain("follow the tab by itself");
  expect(html).toContain('<fieldset disabled=""');
});
