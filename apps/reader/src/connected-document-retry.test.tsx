// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ConnectedDocument } from "./ConnectedDocument.js";
import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";

import type { DocumentRepository } from "@mdbase-reader/core";

const imports = vi.hoisted(() => ({ epub: vi.fn(), html: vi.fn() }));
vi.mock("./document-renderers.js", async () => {
  const { lazyFeature } = await import("./lazy-feature.js");
  return {
    EpubViewerSurface: lazyFeature(imports.epub, "the EPUB renderer"),
    HtmlViewerSurface: lazyFeature(imports.html, "the HTML renderer"),
    PdfViewerSurface: () => null,
    preloadDocumentRenderer: vi.fn(),
  };
});

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ["epub", "application/epub+zip"],
  ["html", "text/html"],
] as const)(
  "retries a blocked %s renderer import through ConnectedDocument",
  async (format, mediaType) => {
    const source = partSource("Book");
    const descriptor = source.documents[0]!;
    const close = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn().mockResolvedValue({
      fileId: descriptor.fileId,
      revision: descriptor.revision,
      mediaType,
      url: "blob:reader-retry-fixture",
      close,
    });
    function ReadyRenderer({
      onDocumentReady,
    }: {
      onDocumentReady: () => void;
    }): React.JSX.Element {
      useEffect(onDocumentReady, [onDocumentReady]);
      return <p>Readable {format} document</p>;
    }
    imports[format]
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
      .mockResolvedValue({ default: ReadyRenderer });
    await act(async () => {
      root.render(
        <ConnectedDocument
          repository={{ open } satisfies DocumentRepository}
          source={{
            ...source,
            documents: [{ ...descriptor, file: `[[book.${format}]]`, mediaType }],
          }}
          onSurfaceChange={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    const alerts = host.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).not.toContain("TypeError");
    const retry = [...alerts[0]!.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.click();
      await Promise.resolve();
    });
    expect(imports[format]).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toBe(`Readable ${format} document`);
    expect(open).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  },
);
