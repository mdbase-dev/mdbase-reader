import { describe, expect, it, vi } from "vitest";

import { installReaderPdfChrome, readerPdfChromeCss } from "./embedpdf-reader-chrome.js";

import type { EmbedPdfContainer } from "@embedpdf/react-pdf-viewer";

describe("EmbedPDF reader chrome", () => {
  it("installs a scoped toolbar treatment and removes it on cleanup", () => {
    const remove = vi.fn();
    const style = {
      setAttribute: vi.fn(),
      remove,
      textContent: "",
    } as unknown as HTMLStyleElement;
    const root = {
      append: vi.fn(),
      ownerDocument: { createElement: vi.fn().mockReturnValue(style) },
      querySelector: vi.fn().mockReturnValue(null),
    } as unknown as ShadowRoot;

    const cleanup = installReaderPdfChrome({ shadowRoot: root } as EmbedPdfContainer);

    expect(style.setAttribute).toHaveBeenCalledWith("data-mdbase-reader-pdf-chrome", "");
    expect(style.textContent).toBe(readerPdfChromeCss);
    expect(root.append).toHaveBeenCalledWith(style);
    expect(readerPdfChromeCss).toContain('[data-epdf-i="reader-page-controls"]');
    expect(readerPdfChromeCss).toContain("opacity: 1 !important");
    expect(readerPdfChromeCss).toContain('div[style*="border: 1px solid rgba(33, 150, 243, 0.8)"]');
    expect(readerPdfChromeCss).toContain("background: transparent !important");

    cleanup();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("does not install a duplicate style", () => {
    const root = {
      append: vi.fn(),
      ownerDocument: { createElement: vi.fn() },
      querySelector: vi.fn().mockReturnValue({}),
    } as unknown as ShadowRoot;

    installReaderPdfChrome({ shadowRoot: root } as EmbedPdfContainer)();

    expect(root.append).not.toHaveBeenCalled();
  });
});
