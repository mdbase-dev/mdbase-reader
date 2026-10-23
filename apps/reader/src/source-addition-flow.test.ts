import { collectionId, dateTime, recordRevision, sourceId, type Source } from "@mdbase-reader/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addSourceFromInput, type SourceAdditionServices } from "./source-addition-flow.js";

import type { CaptureResult } from "./web-capture-client.js";
import type { ClaimBatch, WebCaptureImport } from "@mdbase-reader/web-capture";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const pdfBytes = new TextEncoder().encode("%PDF-1.7 fixture");

const dostoevsky = {
  id: "candidate",
  type: "book",
  title: "Crime and punishment",
  author: [{ family: "Dostoevsky", given: "Fyodor" }],
  issued: { "date-parts": [[2002]] },
  ISBN: "9780140449136",
};

function services(overrides: Partial<SourceAdditionServices> = {}): SourceAdditionServices {
  return {
    capture: vi.fn(() => Promise.reject(new Error("blocked"))),
    candidates: vi.fn(() => Promise.resolve({ pdfUrls: [], landingPages: [] })),
    lookUp: vi.fn((request) =>
      Promise.resolve({
        citation: dostoevsky,
        provenance: { provider: "test", query: request.value, retrievedAt: "2026-09-25T00:00:00Z" },
        warnings: [],
      }),
    ),
    pdfIdentifiers: vi.fn(() => Promise.resolve({})),
    workspace: {
      importSourceFile: vi.fn(() => Promise.resolve(source())),
      createSource: vi.fn(() => Promise.resolve(source())),
      saveNewSourceCitation: vi.fn((saved: Source) => Promise.resolve(saved)),
    },
    onStatus: vi.fn(),
    ...overrides,
  };
}

describe("adding a source from pasted text", () => {
  it("saves a book found by ISBN without a document when no free PDF exists", async () => {
    const deps = services();
    const outcome = await addSourceFromInput("978-0-14-044913-6", deps);

    expect(deps.lookUp).toHaveBeenCalledWith({ kind: "identifier", value: "isbn:9780140449136" });
    expect(deps.workspace.createSource).toHaveBeenCalledWith(
      {
        title: "Crime and punishment",
        kind: "book",
        metadata: { authors: ["Fyodor Dostoevsky"], published: "2002" },
      },
      undefined,
    );
    expect(deps.workspace.saveNewSourceCitation).toHaveBeenCalledWith(
      source(),
      expect.not.objectContaining({ id: expect.anything() }),
    );
    expect(outcome).toMatchObject({ kind: "added", notices: [] });
  });

  it("downloads an open-access PDF for a DOI and records the DOI link", async () => {
    const capture = vi.fn((url: string): Promise<CaptureResult> =>
      url === "https://hal.science/hal-1"
        ? Promise.resolve({
            kind: "html",
            page: { scholarly: { pdfUrl: "https://hal.science/hal-1/document.pdf" } },
          } as CaptureResult)
        : url === "https://hal.science/hal-1/document.pdf"
          ? Promise.resolve({
              kind: "pdf",
              bytes: pdfBytes,
              submittedUrl: url,
              canonicalUrl: url,
              retrievedAt: "2026-09-25T00:00:00Z",
            })
          : Promise.reject(new Error("paywall")),
    );
    const deps = services({
      capture,
      candidates: vi.fn(() =>
        Promise.resolve({ pdfUrls: [], landingPages: ["https://hal.science/hal-1"] }),
      ),
      lookUp: vi.fn(() =>
        Promise.resolve({
          citation: {
            id: "candidate",
            type: "article-journal",
            title: "Molecular structure of nucleic acids",
            DOI: "10.1038/171737a0",
          },
          provenance: { provider: "doi.org", query: "", retrievedAt: "" },
          warnings: [],
        }),
      ),
    });

    const outcome = await addSourceFromInput("https://doi.org/10.1038/171737a0", deps);

    expect(deps.workspace.importSourceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "document.pdf",
        declaredMediaType: "application/pdf",
        bytes: pdfBytes,
        title: "Molecular structure of nucleic acids",
        kind: "paper",
        url: "https://doi.org/10.1038/171737a0",
      }),
      undefined,
    );
    expect(deps.workspace.createSource).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ kind: "added", notices: [] });
  });

  it("offers to save only the citation when a page cannot be fetched", async () => {
    const deps = services();
    const outcome = await addSourceFromInput("https://news.example/story", deps);
    expect(outcome).toMatchObject({ kind: "citation-only", reason: "blocked" });
    expect(deps.workspace.importSourceFile).not.toHaveBeenCalled();
    expect(deps.workspace.createSource).not.toHaveBeenCalled();
  });

  it("cites a PDF saved by its address from the identifiers printed in it", async () => {
    const url = "https://arxiv.example/files/diphoton.pdf";
    const deps = services({
      capture: vi.fn(() =>
        Promise.resolve({
          kind: "pdf" as const,
          bytes: pdfBytes,
          submittedUrl: url,
          canonicalUrl: url,
          retrievedAt: "2026-09-25T00:00:00Z",
        }),
      ),
      pdfIdentifiers: vi.fn(() => Promise.resolve({ arxiv: "0704.0001" })),
    });
    await addSourceFromInput(url, deps);
    expect(deps.lookUp).toHaveBeenCalledWith({ kind: "identifier", value: "arxiv:0704.0001" });
    expect(deps.workspace.importSourceFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "diphoton.pdf", url, title: "Crime and punishment" }),
      undefined,
    );
  });

  it("keeps the source when its citation cannot be stored, and rejects unknown text", async () => {
    const deps = services({
      workspace: {
        importSourceFile: vi.fn(),
        createSource: vi.fn(() => Promise.resolve(source())),
        saveNewSourceCitation: vi.fn(() => Promise.reject(new Error("Citekey taken."))),
      },
    });
    expect(await addSourceFromInput("isbn 9780140449136", deps)).toMatchObject({
      kind: "added",
      notices: [expect.stringContaining("Citekey taken.")],
    });
    await expect(addSourceFromInput("Crime and Punishment", deps)).rejects.toThrow(
      "Paste a web address",
    );
  });
});

function capturedPage(claims: ClaimBatch): WebCaptureImport {
  return {
    name: "example.readable.html",
    title: "Captured title",
    bytes: new TextEncoder().encode("<p>Captured article</p>"),
    archive: { name: "example.archive.html", bytes: new Uint8Array() },
    capture: {
      submittedUrl: "https://example.com/article",
      canonicalUrl: "https://example.com/article",
      retrievedAt: dateTime("2026-10-21T00:00:00Z"),
    },
    metadata: {},
    scholarly: {},
    claims,
  };
}

const pageClaims: ClaimBatch = {
  claims: Object.entries({
    type: "webpage",
    title: "Page title",
    author: [{ literal: "Page Author" }],
  }).map(([field, value]) => ({
    field,
    value,
    source: { kind: "page", signal: "json-ld" },
    observedAt: "2026-10-21T00:00:00Z",
  })),
};

it("limits a Citoid-discovered DOI round to six seconds total", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                Response.json([
                  {
                    itemType: "journalArticle",
                    title: "Remote title",
                    DOI: "10.1234/discovered",
                  },
                ]),
              ),
            5_500,
          ),
        ),
    )
    .mockImplementation(() => new Promise(() => undefined));
  vi.stubGlobal("fetch", fetch);
  const page = capturedPage(pageClaims);
  const deps = services({
    capture: vi.fn(() => Promise.resolve({ kind: "html" as const, page })),
  });
  const result = addSourceFromInput(page.capture.canonicalUrl, deps);
  await vi.advanceTimersByTimeAsync(5_999);
  expect(deps.workspace.importSourceFile).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toMatchObject({ kind: "added" });
  expect(deps.workspace.saveNewSourceCitation).toHaveBeenCalledWith(
    source(),
    expect.objectContaining({ title: "Remote title" }),
    expect.anything(),
  );
});

describe("captured citation disclosure", () => {
  it.each([
    "https://router.local/admin",
    "http://127.0.0.1/private",
    "http://192.168.1.1/",
    "http://[fd00::1]/private",
    "https://alice:secret@example.com/doc?token=secret#private",
    "https://example.com/private.pdf",
  ])("never discloses a protected captured canonical URL: %s", async (canonicalUrl) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetch);
    const base = capturedPage(pageClaims);
    const page = { ...base, capture: { ...base.capture, canonicalUrl } };
    const deps = services({ capture: vi.fn().mockResolvedValue({ kind: "html", page }) });
    await addSourceFromInput("https://example.com/document", deps);
    expect(fetch).not.toHaveBeenCalled();
    expect(deps.workspace.importSourceFile).toHaveBeenCalled();
  });

  it("retains article queries but never discloses captured fragments", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetch);
    const base = capturedPage(pageClaims);
    const canonicalUrl = "https://example.com/document?token=private-secret#private-fragment";
    const page = { ...base, capture: { ...base.capture, canonicalUrl } };
    await addSourceFromInput(
      "https://example.com/document",
      services({
        capture: vi.fn().mockResolvedValue({ kind: "html", page }),
      }),
    );
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `https://en.wikipedia.org/api/rest_v1/data/citation/zotero/${encodeURIComponent("https://example.com/document?token=private-secret")}`,
    );
  });
});

describe("adding captured page citations", () => {
  it("enables Citoid and saves the resolved citation with pinned field provenance", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json([
        {
          itemType: "encyclopediaArticle",
          title: "Australia",
          encyclopediaTitle: "Wikipedia",
          date: "2026-10-20",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetch);
    const page = capturedPage(pageClaims);
    const deps = services({
      capture: vi.fn(() => Promise.resolve({ kind: "html" as const, page })),
    });
    const result = await addSourceFromInput(page.capture.canonicalUrl, deps);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `https://en.wikipedia.org/api/rest_v1/data/citation/zotero/${encodeURIComponent(page.capture.canonicalUrl)}`,
    );
    expect(deps.lookUp).not.toHaveBeenCalled();
    expect(deps.workspace.importSourceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Australia",
        metadata: expect.objectContaining({ authors: ["Page Author"] }),
      }),
      undefined,
    );
    expect(deps.workspace.saveNewSourceCitation).toHaveBeenCalledWith(
      source(),
      expect.objectContaining({
        title: "Australia",
        type: "entry-encyclopedia",
        "container-title": "Wikipedia",
        author: [{ literal: "Page Author" }],
      }),
      expect.objectContaining({
        title: expect.objectContaining({
          value: "Australia",
          source: "site-adapter:citoid/encyclopediaArticle",
        }),
        author: expect.objectContaining({
          value: [{ literal: "Page Author" }],
          source: "page:json-ld",
        }),
      }),
    );
    expect(result).toMatchObject({
      kind: "added",
      provenance: {
        title: { value: "Australia", source: "site-adapter:citoid/encyclopediaArticle" },
      },
    });
  });

  it("still saves page evidence when Citoid is unavailable", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("Offline"));
    vi.stubGlobal("fetch", fetch);
    const page = capturedPage(pageClaims);
    const deps = services({
      capture: vi.fn(() => Promise.resolve({ kind: "html" as const, page })),
    });
    const result = await addSourceFromInput(page.capture.canonicalUrl, deps);
    expect(result).toMatchObject({
      kind: "added",
      provenance: { title: { value: "Page title", source: "page:json-ld" } },
    });
    expect(deps.workspace.saveNewSourceCitation).toHaveBeenCalledWith(
      source(),
      expect.objectContaining({ title: "Page title" }),
      expect.objectContaining({
        title: expect.objectContaining({ value: "Page title", source: "page:json-ld" }),
      }),
    );
  });

  it("does not send social post URLs to remote providers or change their citation", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    const citation = { type: "post", title: "A post", author: [{ literal: "A poster" }] };
    const page: WebCaptureImport = {
      ...capturedPage({ claims: [] }),
      scholarly: { citation },
      metadata: {
        socialPost: {
          platform: "bluesky",
          id: "post",
          url: "https://bsky.app/profile/fixture.test/post/first",
          author: { id: "poster", name: "A poster", handle: "fixture.test" },
          threadRoot: "post",
          threadPartial: false,
          text: "A post",
          media: [],
          parts: [],
        },
      },
    };
    const deps = services({
      capture: vi.fn(() => Promise.resolve({ kind: "html" as const, page })),
    });
    await addSourceFromInput("https://bsky.app/profile/fixture.test/post/first", deps);
    expect(fetch).not.toHaveBeenCalled();
    expect(deps.workspace.saveNewSourceCitation).toHaveBeenCalledWith(source(), citation);
  });

  it("does not import after a caller cancels a remote lookup", async () => {
    const controller = new AbortController();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetch);
    const page = capturedPage(pageClaims);
    const deps = services({
      capture: vi.fn(() => Promise.resolve({ kind: "html" as const, page })),
      signal: controller.signal,
    });
    const result = addSourceFromInput(page.capture.canonicalUrl, deps);
    const rejected = expect(result).rejects.toThrow("Cancelled");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort(new Error("Cancelled"));
    await rejected;
    expect(deps.workspace.importSourceFile).not.toHaveBeenCalled();
  });
});

describe("adding social sources", () => {
  it.each([
    "https://x.com/home",
    "https://x.com/fixture",
    "https://bsky.app/search",
    "https://bsky.app/profile/fixture.test",
  ])("rejects feed/profile URLs without offering citation-only capture: %s", async (url) => {
    const deps = services();
    await expect(addSourceFromInput(url, deps)).rejects.toThrow("cannot be saved");
    expect(deps.capture).not.toHaveBeenCalled();
    expect(deps.lookUp).not.toHaveBeenCalled();
  });
  it("explains X's live-page requirement instead of requesting undocumented APIs", async () => {
    const deps = services();
    await expect(
      addSourceFromInput("https://twitter.com/fixture/status/100", deps),
    ).rejects.toThrow("extension");
    expect(deps.capture).not.toHaveBeenCalled();
  });
  it("does not offer a citation-only Mastodon profile after marker-based feed rejection", async () => {
    const deps = services({
      capture: vi.fn(() =>
        Promise.reject(
          new Error(
            "Feeds cannot be saved as sources. Choose individual posts in the Reader extension.",
          ),
        ),
      ),
    });
    await expect(addSourceFromInput("https://any-instance.test/@fixture", deps)).rejects.toThrow(
      "Feeds cannot",
    );
    expect(deps.lookUp).not.toHaveBeenCalled();
    expect(deps.workspace.createSource).not.toHaveBeenCalled();
  });
  it("does not offer a citation-only post after an API failure", async () => {
    const deps = services();
    await expect(
      addSourceFromInput("https://bsky.app/profile/fixture.test/post/first", deps),
    ).rejects.toThrow("blocked");
    expect(deps.lookUp).not.toHaveBeenCalled();
  });
});

function source(): Source {
  return {
    collectionId: collectionId("reading"),
    id: sourceId("src_new"),
    path: "sources/src_new.md",
    title: "Crime and punishment",
    creators: [],
    tags: [],
    documents: [],
    body: "",
    recordRevision: recordRevision("record-1"),
    frontmatter: {},
  };
}
