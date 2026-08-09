import { fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { ReadiumEpubSurface } from "./epub-surface.js";

import type { ReadiumRuntime } from "./readium-runtime.js";
import type { TextSelectionDraft } from "@mdbase-reader/reading-surface";

function runtimeFixture(): {
  readonly runtime: ReadiumRuntime;
  emitLocation(locator: Readonly<Record<string, unknown>>): void;
  emitSelection(selection: TextSelectionDraft): void;
} {
  let locationListener: ((locator: Readonly<Record<string, unknown>>) => void) | undefined;
  let selectionListener: ((selection: TextSelectionDraft) => void) | undefined;
  return {
    runtime: {
      currentLocator: () => ({ href: "chapter-1.xhtml", locations: { progression: 0.1 } }),
      goTo: (locator) => Promise.resolve(locator["href"] !== "missing.xhtml"),
      clearSelection: vi.fn(),
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
      destroy: () => Promise.resolve(),
    },
    emitLocation: (locator) => locationListener?.(locator),
    emitSelection: (selection) => selectionListener?.(selection),
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

  it("rejects non-EPUB destinations", async () => {
    const fixture = runtimeFixture();
    const surface = new ReadiumEpubSurface(document, fixture.runtime);

    await expect(surface.goTo({ kind: "pdf", pageIndex: 1 })).resolves.toBe(false);
  });
});
