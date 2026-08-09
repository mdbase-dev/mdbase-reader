import { fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { EmbedPdfSurface } from "./pdf-surface.js";

import type { EmbedPdfRuntime } from "./embedpdf-runtime.js";
import type { AreaSelectionDraft } from "@mdbase-reader/reading-surface";

function runtimeFixture(): {
  readonly runtime: EmbedPdfRuntime;
  readonly goToPage: ReturnType<typeof vi.fn>;
  emitArea(selection: AreaSelectionDraft): void;
  emitPage(pageIndex: number): void;
} {
  let areaListener: ((selection: AreaSelectionDraft) => void) | undefined;
  let pageListener: ((pageIndex: number) => void) | undefined;
  const goToPage = vi.fn();
  return {
    runtime: {
      currentPageIndex: () => 2,
      goToPage,
      beginAreaSelection: vi.fn(),
      cancelAreaSelection: vi.fn(),
      onAreaSelected: (listener) => {
        areaListener = listener;
        return () => {
          areaListener = undefined;
        };
      },
      onPageChanged: (listener) => {
        pageListener = listener;
        return () => {
          pageListener = undefined;
        };
      },
      destroy: vi.fn(),
    },
    goToPage,
    emitArea: (selection) => areaListener?.(selection),
    emitPage: (pageIndex) => pageListener?.(pageIndex),
  };
}

const document = {
  document: {
    fileId: fileId("file-1"),
    file: "[[files/example.pdf]]",
    revision: fileRevision("sha256:a8ca22"),
  },
  mediaType: "application/pdf",
  url: "https://files.example/document.pdf",
} as const;

describe("EmbedPdfSurface", () => {
  it("translates zero-based Reader locations to the EmbedPDF runtime", async () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);

    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 2 });
    await expect(surface.goTo({ kind: "pdf", pageIndex: 7 })).resolves.toBe(true);
    expect(fixture.goToPage).toHaveBeenCalledWith(7);
    fixture.emitPage(8);
    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 8 });
  });

  it("forwards durable capture data without persisting renderer state", () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);
    const listener = vi.fn();
    surface.capabilities.areaSelection?.selections.subscribe(listener);
    const selection: AreaSelectionDraft = {
      pageIndex: 4,
      rect: { x: 10, y: 20, width: 30, height: 40 },
      coordinateProfile: "embedpdf-pdf-points-v1",
      image: new Blob(["png"]),
      imageType: "image/png",
      scale: 4,
      withAnnotations: false,
    };

    fixture.emitArea(selection);
    expect(listener).toHaveBeenCalledWith(selection);
  });

  it("rejects incompatible locators and releases runtime subscriptions", async () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);

    await expect(surface.goTo({ kind: "epub", locator: { href: "chapter.xhtml" } })).resolves.toBe(
      false,
    );
    await surface.destroy();
    fixture.emitPage(9);
    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 2 });
  });
});
