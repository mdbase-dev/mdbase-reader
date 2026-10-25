import { annotationId, fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ReadiumEpubSurface } from "./epub-surface.js";

import type { ReadiumRuntime } from "./readium-runtime.js";
import type { TextSelectionDraft } from "@mdbase-reader/reading-surface";

function runtimeFixture(): {
  readonly runtime: ReadiumRuntime;
  readonly setAnnotations: ReturnType<typeof vi.fn>;
  readonly setActiveAnnotation: ReturnType<typeof vi.fn>;
  readonly extractText: ReturnType<typeof vi.fn>;
  emitLocation(locator: Readonly<Record<string, unknown>>): void;
  emitSelection(selection: TextSelectionDraft): void;
  emitActivation(id: ReturnType<typeof annotationId>): void;
} {
  let locationListener: ((locator: Readonly<Record<string, unknown>>) => void) | undefined;
  let selectionListener: ((selection: TextSelectionDraft) => void) | undefined;
  let activationListener: ((id: ReturnType<typeof annotationId>) => void) | undefined;
  const setAnnotations = vi.fn();
  const setActiveAnnotation = vi.fn();
  const extractText = vi.fn().mockResolvedValue("Extracted EPUB text");
  return {
    runtime: {
      currentLocator: () => ({ href: "chapter-1.xhtml", locations: { progression: 0.1 } }),
      goTo: (locator) => Promise.resolve(locator["href"] !== "missing.xhtml"),
      clearSelection: vi.fn(),
      setTypography: () => Promise.resolve(),
      extractText,
      onLocationChanged: (listener) => {
        locationListener = listener;
        return () => {
          locationListener = undefined;
        };
      },
      onTextSelected: (listener) => {
        selectionListener = listener;
        return () => {
          selectionListener = undefined;
        };
      },
      onAnnotationActivated: (listener) => {
        activationListener = listener;
        return () => {
          activationListener = undefined;
        };
      },
      setAnnotations,
      setActiveAnnotation,
      destroy: () => Promise.resolve(),
    },
    setAnnotations,
    setActiveAnnotation,
    extractText,
    emitLocation: (locator) => locationListener?.(locator),
    emitSelection: (selection) => selectionListener?.(selection),
    emitActivation: (id) => activationListener?.(id),
  };
}

const document = {
  document: {
    fileId: fileId("file-epub"),
    file: "[[files/example.epub]]",
    revision: fileRevision("sha256:a8ca22"),
  },
  mediaType: "application/epub+zip",
  url: "https://publications.example/example/manifest.json",
} as const;

describe("ReadiumEpubSurface", () => {
  it("publishes activated saved annotations", () => {
    const fixture = runtimeFixture();
    const surface = new ReadiumEpubSurface(document, fixture.runtime);
    const activated = vi.fn();
    surface.capabilities.annotationActivation?.activations.subscribe(activated);

    const id = annotationId("ann-epub");
    fixture.emitActivation(id);

    expect(activated).toHaveBeenCalledWith(id);
  });

  it("tracks Readium locations without treating visual pages as stable", async () => {
    const fixture = runtimeFixture();
    const surface = new ReadiumEpubSurface(document, fixture.runtime);
    const locations = vi.fn();
    surface.locations.subscribe(locations);

    expect(surface.currentLocation()).toEqual({
      kind: "epub",
      locator: { href: "chapter-1.xhtml", locations: { progression: 0.1 } },
    });
    const destination = { href: "chapter-2.xhtml", locations: { progression: 0.3 } };
    await expect(surface.goTo({ kind: "epub", locator: destination })).resolves.toBe(true);
    expect(surface.currentLocation()).toEqual({ kind: "epub", locator: destination });
    fixture.emitLocation(destination);
    expect(locations).toHaveBeenCalledWith({ kind: "epub", locator: destination });
  });

  it("publishes text selections with locator evidence", () => {
    const fixture = runtimeFixture();
    const surface = new ReadiumEpubSurface(document, fixture.runtime);
    const listener = vi.fn();
    surface.capabilities.textSelection?.selections.subscribe(listener);
    const selection: TextSelectionDraft = {
      target: { quote: { exact: "Selected EPUB text", prefix: "Before", suffix: "After" } },
      locator: { kind: "epub", locator: { href: "chapter-1.xhtml" } },
    };

    fixture.emitSelection(selection);
    expect(listener).toHaveBeenCalledWith(selection);
  });

  it("resolves ranges without navigation or changing the absolute current location", async () => {
    const fixture = runtimeFixture();
    const resolution = {
      valid: true as const,
      start: { kind: "epub" as const, locator: { href: "chapter-2.xhtml" } },
      measure: () => ({ position: "inside" as const, atEnd: false }),
    };
    const resolveReadingRange = vi.fn().mockResolvedValue(resolution);
    const goTo = vi.fn(fixture.runtime.goTo);
    const surface = new ReadiumEpubSurface(document, {
      ...fixture.runtime,
      resolveReadingRange,
      goTo,
    });
    const before = surface.currentLocation();
    const range = { kind: "epub-spine", start: "chapter-2.xhtml", end: "chapter-2.xhtml" } as const;
    expect(await surface.resolveReadingRange(range)).toBe(resolution);
    expect(resolveReadingRange).toHaveBeenCalledWith(range);
    expect(surface.currentLocation()).toEqual(before);
    expect(goTo).not.toHaveBeenCalled();
    // Ranges never restrict ordinary navigation outside their boundaries.
    expect(await surface.goTo(before)).toBe(true);
    await surface.destroy();
    expect((await surface.resolveReadingRange(range)).valid).toBe(false);
    expect(resolveReadingRange).toHaveBeenCalledTimes(1);
  });

  it("reports unsupported runtimes instead of silently treating a range as whole-file", async () => {
    const surface = new ReadiumEpubSurface(document, runtimeFixture().runtime);
    expect(
      await surface.resolveReadingRange({
        kind: "epub-spine",
        start: "chapter-1.xhtml",
        end: "chapter-2.xhtml",
      }),
    ).toEqual({ valid: false, message: expect.any(String) });
  });

  it("rejects non-EPUB destinations", async () => {
    const fixture = runtimeFixture();
    const surface = new ReadiumEpubSurface(document, fixture.runtime);

    await expect(surface.goTo({ kind: "pdf", pageIndex: 1 })).resolves.toBe(false);
  });

  it("exposes publication text extraction through the surface capability", async () => {
    const fixture = runtimeFixture();
    const surface = new ReadiumEpubSurface(document, fixture.runtime);
    const controller = new AbortController();

    await expect(
      surface.capabilities.textExtraction?.extractText({ signal: controller.signal }),
    ).resolves.toBe("Extracted EPUB text");
    expect(fixture.extractText).toHaveBeenCalledWith({ signal: controller.signal });
  });

  it("passes only exact-document annotations to Readium decorations", async () => {
    const fixture = runtimeFixture();
    const surface = new ReadiumEpubSurface(document, fixture.runtime);
    const matching = {
      collectionId: "reading" as never,
      id: "ann-1" as never,
      sourceId: "source-1" as never,
      source: "[[source-1]]",
      document: document.document,
      annotationType: "highlight",
      target: {
        quote: { exact: "Selected text" },
        epub: { cfi: "epubcfi(/6/4!/4/2:8)" },
      },
      tags: [],
      body: "",
      createdAt: "2026-08-10T00:00:00.000Z" as never,
    };

    await surface.capabilities.decorations?.setAnnotations([
      matching,
      {
        ...matching,
        id: "ann-2" as never,
        document: { ...matching.document, fileId: fileId("other") },
      },
    ]);

    expect(fixture.setAnnotations).toHaveBeenCalledWith([matching]);
    await surface.capabilities.decorations?.setActiveAnnotation(matching);
    expect(fixture.setActiveAnnotation).toHaveBeenCalledWith(matching);
  });
});
