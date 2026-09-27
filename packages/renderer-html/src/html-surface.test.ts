import { annotationId, fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { HtmlReadingSurface } from "./html-surface.js";

import type { HtmlDocumentRuntime } from "./html-runtime.js";

describe("HtmlReadingSurface", () => {
  it("publishes activated saved annotations", () => {
    let activationListener: ((id: ReturnType<typeof annotationId>) => void) | undefined;
    const runtime = {
      onLocation: () => vi.fn(),
      onSelection: () => vi.fn(),
      onSelectionCleared: () => vi.fn(),
      onMotion: () => vi.fn(),
      onAnnotationActivated: (listener: typeof activationListener) => {
        activationListener = listener;
        return vi.fn();
      },
      currentLocation: () => ({ kind: "html", href: "essay.html", progression: 0 }),
      goTo: () => true,
      setAnnotations: vi.fn(),
      setActiveAnnotation: vi.fn(),
      goToAnnotation: () => true,
      clearSelection: vi.fn(),
      extractText: () => "Essay",
      contents: () => [],
      goToContents: () => false,
      destroy: vi.fn(),
    } as unknown as HtmlDocumentRuntime;
    const surface = new HtmlReadingSurface(
      {
        document: {
          fileId: fileId("file-html"),
          file: "[[files/essay.html]]",
          revision: fileRevision(`sha256:${"a".repeat(64)}`),
        },
        mediaType: "text/html",
        url: "https://example.test/essay.html",
      },
      runtime,
    );
    const activated = vi.fn();
    surface.capabilities.annotationActivation?.activations.subscribe(activated);

    const id = annotationId("ann-html");
    activationListener?.(id);

    expect(activated).toHaveBeenCalledWith(id);
  });

  it("offers contents only when a page has more than one heading", () => {
    const surfaceWith = (
      contents: readonly { id: string; title: string; level: number }[],
    ): HtmlReadingSurface =>
      new HtmlReadingSurface(
        {
          document: {
            fileId: fileId("file-html"),
            file: "[[files/essay.html]]",
            revision: fileRevision(`sha256:${"a".repeat(64)}`),
          },
          mediaType: "text/html",
          url: "https://example.test/essay.html",
        },
        {
          onLocation: () => vi.fn(),
          onSelection: () => vi.fn(),
          onSelectionCleared: () => vi.fn(),
          onMotion: () => vi.fn(),
          onAnnotationActivated: () => vi.fn(),
          contents: () => contents,
          goToContents: () => true,
        } as unknown as HtmlDocumentRuntime,
      );
    expect(
      surfaceWith([{ id: "0", title: "Essay", level: 0 }]).capabilities.contents,
    ).toBeUndefined();
    const sections = [
      { id: "0", title: "Essay", level: 0 },
      { id: "1", title: "Part one", level: 1 },
    ];
    expect(surfaceWith(sections).capabilities.contents?.entries()).toEqual(sections);
  });
});
