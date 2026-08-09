import {
  collectionId,
  fileId,
  fileRevision,
  sourceId,
  type SourceSummary,
} from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { annotationRequest } from "./annotation-composer-request.js";

import type { ReadingSurface } from "@mdbase-reader/reading-surface";

const source: SourceSummary = {
  collectionId: collectionId("reading"),
  id: sourceId("src_01"),
  path: "sources/example.md",
  title: "Example",
  creators: [],
  tags: [],
  documents: [],
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
});
