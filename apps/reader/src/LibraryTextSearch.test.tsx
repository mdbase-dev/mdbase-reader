import { collectionId, fileId, fileRevision, sourceId } from "@mdbase-reader/core";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryTextSearch } from "./LibraryTextSearch.js";

import type { DocumentSearchHit } from "./use-indexed-document-search.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceSummary } from "@mdbase-reader/core";

const state = vi.hoisted(() => ({
  paused: false,
  hit: undefined as DocumentSearchHit | undefined,
}));
vi.mock("./use-indexed-document-search.js", () => ({
  useIndexedDocumentSearch: () => ({
    matches: new Map([[sourceId("source"), state.hit]]),
    status: "Saved HTML pages up to 256 KiB are indexed on this device.",
    paused: state.paused,
    togglePause: vi.fn(),
  }),
}));
vi.mock("./use-open-document-search.js", () => ({
  useOpenDocumentSearch: () => ({
    matches: new Map(),
    coverage: "Loaded-document fallback details.",
    problem: null,
  }),
}));

const file = {
  fileId: fileId("pdf"),
  file: "[[files/reader/src_19/Adam.pdf]]",
  revision: fileRevision(`sha256:${"a".repeat(64)}`),
  mediaType: "application/pdf",
  role: "primary",
};
const source: SourceSummary = {
  id: sourceId("source"),
  collectionId: collectionId("library"),
  path: "source.md",
  title: "Adam",
  creators: ["Diederik P. Kingma", "Jimmy Ba"],
  tags: [],
  documents: [file],
};
function markup(): string {
  return renderToStaticMarkup(
    <LibraryTextSearch
      scope="documents"
      query="moments"
      sources={[source]}
      gateway={{} as ReaderWorkspaceGateway}
      surfaces={undefined}
      onOpen={vi.fn()}
    />,
  );
}

beforeEach(() => {
  state.paused = false;
  state.hit = {
    file: file.file,
    excerpt: { before: "lower-order ", match: "moments", after: "" },
    destination: {
      document: file,
      location: { kind: "pdf", pageIndex: 0 },
      quote: { exact: "moments" },
    },
  };
});

describe("library text search display", () => {
  it("shows the format and match page, not raw document links", () => {
    const html = markup();
    expect(html).toContain("Diederik P. Kingma, Jimmy Ba · PDF · p. 1");
    expect(html).not.toContain("[[");
    expect(html).not.toContain("files/reader");
    expect(html).not.toContain("Open document ·");
  });

  it("keeps a plain-language summary above a closed disclosure with details and indexing controls", () => {
    const html = markup();
    expect(html).toContain(
      "Searches saved web pages and open documents. PDFs and EPUBs must be open.",
    );
    expect(html).toMatch(
      /<details[^>]*><summary>Search details<\/summary>.*256 KiB.*Pause library indexing.*<\/details>/u,
    );
    expect(html).not.toMatch(/<details[^>]*\bopen[\s>]/u);
    expect(html.split("<details")[0]).not.toContain("256 KiB");
  });

  it("makes paused indexing visible without suggesting that document search is paused", () => {
    state.paused = true;
    expect(markup()).toContain("Saved-page indexing is paused. Open documents are still searched.");
    expect(markup()).toContain("Resume library indexing");
  });
});
