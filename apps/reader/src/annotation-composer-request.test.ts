import {
  collectionId,
  fileId,
  fileRevision,
  sourceId,
  recordRevision,
  type Source,
} from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import {
  annotationRequest,
  bookmarkRequest,
  commentRequest,
  prepareAnnotationSelection,
} from "./annotation-composer-request.js";

import type { ReadingSurface } from "@mdbase-reader/reading-surface";

const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_01"),
  path: "sources/example.md",
  title: "Example",
  creators: [],
  tags: [],
  documents: [],
  body: "",
  recordRevision: recordRevision("source-r1"),
  frontmatter: {},
};

const surface = {
  kind: "pdf",
  document: {
    document: {
      fileId: fileId("file-01"),
      file: "[[files/example.pdf]]",
      revision: fileRevision(`sha256:${"a".repeat(64)}`),
    },
    mediaType: "application/pdf",
    url: "blob:pdf",
  },
  capabilities: {},
  currentLocation: () => null,
  goTo: () => Promise.resolve(true),
  destroy: () => Promise.resolve(),
} as unknown as ReadingSurface;

describe("annotationRequest", () => {
  it("preserves a native text selector and readable Markdown", async () => {
    const request = await annotationRequest(
      source,
      surface,
      {
        kind: "text",
        value: {
          locator: { kind: "pdf", pageIndex: 2 },
          target: {
            quote: { exact: "Attention is a discipline." },
            pdf: {
              pageIndex: 2,
              coordinateSpace: {
                profile: "embedpdf-selection-page-points-v1",
                box: "crop",
                origin: "top_left",
              },
              quadPoints: [[10, 20, 110, 20, 10, 35, 110, 35]],
            },
          },
        },
      },
      "Compare Weil.",
    );

    expect(request).toMatchObject({
      annotationType: "highlight",
      locator: { label: "p. 3" },
      body: "> Attention is a discipline.\n\nCompare Weil.",
      document: surface.document.document,
    });
  });

  it("turns a PDF capture into exact geometry and a PNG attachment", async () => {
    const request = await annotationRequest(
      source,
      surface,
      {
        kind: "area",
        value: {
          pageIndex: 4,
          rect: { x: 12, y: 24, width: 80, height: 45 },
          coordinateProfile: "embedpdf-capture-page-points-v1",
          image: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
          imageType: "image/png",
          scale: 2,
          withAnnotations: true,
        },
      },
      "Figure note.",
    );

    expect(request).toMatchObject({
      annotationType: "area",
      locator: { label: "p. 5" },
      target: {
        pdf: {
          pageIndex: 4,
          coordinateSpace: {
            profile: "embedpdf-capture-page-points-v1",
            box: "crop",
            origin: "top_left",
          },
          quadPoints: [[12, 24, 92, 24, 12, 69, 92, 69]],
        },
      },
      body: "Figure note.",
      attachment: { mediaType: "image/png" },
    });
    expect(request.attachment?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("prepares capture bytes eagerly and reuses them when saving", async () => {
    const image = new Blob([new Uint8Array([4, 5, 6])], { type: "image/png" });
    const arrayBuffer = vi.spyOn(image, "arrayBuffer");
    const selection = {
      kind: "area",
      value: {
        pageIndex: 0,
        rect: { x: 10, y: 20, width: 30, height: 40 },
        coordinateProfile: "embedpdf-capture-page-points-v1",
        image,
        imageType: "image/png",
        scale: 2,
        withAnnotations: true,
      },
    } as const;

    prepareAnnotationSelection(selection);
    expect(arrayBuffer).toHaveBeenCalledOnce();

    const request = await annotationRequest(source, surface, selection, "");

    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(request.attachment?.bytes).toEqual(new Uint8Array([4, 5, 6]));
  });
});

describe("commentRequest", () => {
  it("creates a source-level note with no document or selector", () => {
    const request = commentRequest(source, "  The order of fragments is editorial.  ");

    expect(request).toMatchObject({
      annotationType: "note",
      motivation: "commenting",
      body: "The order of fragments is editorial.",
    });
    expect(request).not.toHaveProperty("document");
    expect(request).not.toHaveProperty("target");
  });
});

describe("bookmarkRequest", () => {
  it("records the current PDF page without a quotation", () => {
    const request = bookmarkRequest(source, {
      ...surface,
      currentLocation: () => ({ kind: "pdf", pageIndex: 41 }),
    });

    expect(request).toMatchObject({
      annotationType: "bookmark",
      document: surface.document.document,
      locator: { label: "p. 42" },
      target: { position: { kind: "pdf", pageIndex: 41 } },
      body: "",
    });
    expect(request?.target).not.toHaveProperty("quote");
  });

  it("labels an EPUB position by chapter and progress", () => {
    const request = bookmarkRequest(source, {
      ...surface,
      kind: "epub",
      currentLocation: () => ({
        kind: "epub",
        locator: { href: "ch3.xhtml", title: "Chapter 3", locations: { totalProgression: 0.354 } },
      }),
    });

    expect(request?.locator).toEqual({ label: "Chapter 3 · 35% through" });
  });

  it("returns null when the surface has no position yet", () => {
    expect(bookmarkRequest(source, surface)).toBeNull();
  });
});
