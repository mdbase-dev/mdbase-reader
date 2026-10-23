// @vitest-environment happy-dom
import { fileId, fileRevision } from "@mdbase-reader/core";
import { Locator } from "@readium/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEpubSearch } from "./epub-search.js";
import { ReadiumEpubSurface } from "./epub-surface.js";
import {
  extractPublicationSearchSegments,
  resolvePublicationSearchDestination,
} from "./epub-text.js";

import type { ReadiumRuntime } from "./readium-runtime.js";
import type { SearchDestination } from "@mdbase-reader/core";
import type { EpubNavigator } from "@readium/navigator";
import type { Publication } from "@readium/shared";

// happy-dom's DOMParser documents create Ranges owned by the outer document;
// setEnd then collapses the range. Use an owned frame document with a correct Range realm.
beforeEach(() => {
  const parse = DOMParser.prototype.parseFromString;
  vi.spyOn(DOMParser.prototype, "parseFromString").mockImplementation((markup, type) => {
    const detached = parse.call(new DOMParser(), markup, type);
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const parsed = frame.contentDocument!;
    parsed.documentElement.innerHTML = detached.documentElement.innerHTML;
    return parsed;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const target = {
  fileId: fileId("epub"),
  file: "book.epub",
  revision: fileRevision(`sha256:${"a".repeat(64)}`),
};
const destination: SearchDestination = {
  document: target,
  location: { kind: "epub", href: "chapter-2.xhtml" },
  quote: { exact: "matching passage" },
};
function publication(text: string): Publication {
  return {
    readingOrder: {
      items: [
        { href: "chapter-1.xhtml", type: "text/html" },
        { href: "chapter-2.xhtml", type: "text/html" },
      ],
    },
    get: () => ({
      readAsString: () => Promise.resolve(`<html><body><p>${text}</p></body></html>`),
      close: vi.fn(),
    }),
  } as unknown as Publication;
}
describe("EPUB native passage acknowledgement", () => {
  function nativeFixture(acknowledged: boolean): {
    search: ReturnType<typeof createEpubSearch>;
    go: ReturnType<typeof vi.fn>;
    decorate: ReturnType<typeof vi.fn>;
    frame: HTMLIFrameElement;
  } {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    frame.contentDocument!.body.innerHTML = "<p>A matching passage here.</p>";
    const go = vi.fn((_locator, _animated, callback: (found: boolean) => void) => callback(true));
    const decorate = vi.fn();
    const navigator = {
      currentLocator: new Locator({
        href: "https://example.test/book/chapter-1.xhtml",
        type: "text/html",
      }),
      go,
      applyDecorations: decorate,
      viewport: { readingOrder: ["https://example.test/book/chapter-2.xhtml"] },
      pool: {
        currentFrames: [
          {
            iframe: frame,
            msg: {
              send: (_name: string, _data: unknown, callback: (found: boolean) => void) =>
                callback(acknowledged),
            },
          },
        ],
      },
    } as unknown as EpubNavigator;
    return {
      search: createEpubSearch(
        navigator,
        publication("A matching passage here."),
        "https://example.test/book/",
        vi.fn(),
      ),
      go,
      decorate,
      frame,
    };
  }
  it("requires the native go_text acknowledgement before drawing a search decoration", async () => {
    const { search, decorate, frame } = nativeFixture(true);
    expect(await search.goToSearchDestination?.(destination)).toBe(true);
    expect(decorate).toHaveBeenCalledWith(expect.any(Array), "mdbase-reader-search-passage");
    search.clearSearch?.();
    expect(decorate).toHaveBeenLastCalledWith([], "mdbase-reader-search-passage");
    frame.remove();
  });
  it("restores the previous location when Readium opens a chapter but cannot find text", async () => {
    const { search, go, decorate, frame } = nativeFixture(false);
    expect(await search.goToSearchDestination?.(destination)).toBe(false);
    expect(go).toHaveBeenCalledTimes(2);
    expect(decorate).not.toHaveBeenCalled();
    frame.remove();
  });
});

describe("EPUB search destinations", () => {
  it("extracts spine boundaries and derives an exact range CFI in the matching item", async () => {
    const book = publication("A matching passage here.");
    expect(
      (await extractPublicationSearchSegments(book, "https://example.test/book/")).map(
        (segment) => segment.location,
      ),
    ).toEqual([
      { kind: "epub", href: "chapter-1.xhtml" },
      { kind: "epub", href: "chapter-2.xhtml" },
    ]);
    const locator = await resolvePublicationSearchDestination(
      book,
      "https://example.test/book/",
      destination,
    );
    expect(locator).toMatchObject({
      href: "chapter-2.xhtml",
      text: { highlight: "matching passage" },
    });
    expect(JSON.stringify(locator?.["locations"])).toContain("epubcfi(/6/4!");
  });
  it.each(["Changed passage", "matching passage matching passage"])(
    "refuses changed or ambiguous text: %s",
    async (text) => {
      expect(
        await resolvePublicationSearchDestination(
          publication(text),
          "https://example.test/book/",
          destination,
        ),
      ).toBeNull();
    },
  );
  it("refuses missing spine items instead of substituting another chapter", async () => {
    expect(
      await resolvePublicationSearchDestination(
        publication("matching passage"),
        "https://example.test/book/",
        {
          ...destination,
          location: { kind: "epub", href: "missing.xhtml" },
        },
      ),
    ).toBeNull();
  });
  it("refuses changed revisions before native navigation", async () => {
    const runtime = {
      currentLocator: () => ({}),
      onLocationChanged: () => vi.fn(),
      onTextSelected: () => vi.fn(),
      onAnnotationActivated: () => vi.fn(),
      goToSearchDestination: vi.fn().mockResolvedValue(true),
    } as unknown as ReadiumRuntime;
    const surface = new ReadiumEpubSurface(
      { document: target, mediaType: "application/epub+zip", url: "epub" },
      runtime,
    );
    expect(
      await surface.capabilities.searchNavigation?.goToDestination({
        ...destination,
        document: { ...target, revision: fileRevision(`sha256:${"b".repeat(64)}`) },
      }),
    ).toBe(false);
    expect(runtime.goToSearchDestination).not.toHaveBeenCalled();
  });
});
