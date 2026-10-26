import { collectionId, recordRevision, sourceId, type Source } from "@mdbase-reader/core";
import { readerI18n } from "@mdbase-reader/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emptyAnnotationFilter } from "./annotation-overview.js";
import { propertyColumn } from "./library-columns.js";
import { editableText, parseFieldInput } from "./library-field-edit.js";
import { buildAnnotationView } from "./mdbase-annotation-views.js";
import { buildLibraryView, defaultLibraryViewConfiguration } from "./mdbase-library-views.js";
import { addSourceFromInput, type SourceAdditionServices } from "./source-addition-flow.js";

afterEach(async () => {
  await readerI18n.selectLocale("en");
});

async function inLocale<T>(locale: "en" | "it" | "fr", run: () => Promise<T> | T): Promise<T> {
  await readerI18n.selectLocale(locale);
  try {
    return await run();
  } finally {
    await readerI18n.selectLocale("en");
  }
}

function created(): Source {
  return {
    collectionId: collectionId("c"),
    id: sourceId("s"),
    path: "sources/s.md",
    title: "Saved",
    creators: [],
    tags: [],
    documents: [],
    recordRevision: recordRevision("r"),
  } as unknown as Source;
}

function additionServices(overrides: Partial<SourceAdditionServices>): SourceAdditionServices {
  return {
    capture: vi.fn(() => Promise.reject(new Error("blocked"))),
    candidates: vi.fn(() => Promise.resolve({ pdfUrls: [], landingPages: [] })),
    lookUp: vi.fn(() => Promise.reject(new Error("not found"))),
    pdfIdentifiers: vi.fn(() => Promise.resolve({})),
    workspace: {
      importSourceFile: vi.fn(() => Promise.resolve(created())),
      createSource: vi.fn(() => Promise.resolve(created())),
      saveNewSourceCitation: vi.fn((saved: Source) => Promise.resolve(saved)),
    },
    onStatus: vi.fn(),
    ...overrides,
  };
}

describe("translated text never becomes stored source data", () => {
  it.each(["it", "fr"] as const)(
    "keeps the untitled citation-only source title stable in %s",
    async (locale) => {
      const deps = additionServices({
        lookUp: vi.fn((request) =>
          Promise.resolve({
            citation: { id: "candidate", type: "book", ISBN: "9780140449136" },
            provenance: { provider: "test", query: request.value, retrievedAt: "2026-10-25" },
            warnings: [],
          }),
        ),
      });
      await inLocale(locale, () => addSourceFromInput("978-0-14-044913-6", deps));
      expect(deps.workspace.createSource).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Untitled source" }),
        undefined,
      );
    },
  );

  it.each(["it", "fr"] as const)(
    "keeps the fallback PDF title and filename stable in %s",
    async (locale) => {
      const url = "https://example.org/download?id=1";
      const deps = additionServices({
        capture: vi.fn(() =>
          Promise.resolve({
            kind: "pdf" as const,
            bytes: new TextEncoder().encode("%PDF-1.7"),
            submittedUrl: url,
            canonicalUrl: url,
            retrievedAt: "2026-10-25T00:00:00Z",
          }),
        ),
      });
      await inLocale(locale, () => addSourceFromInput(url, deps));
      expect(deps.workspace.importSourceFile).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Document", name: "Document.pdf" }),
        undefined,
      );
    },
  );
});

describe("saved mdbase view files are identical in every interface language", () => {
  it("writes the same library view source in English and Italian", async () => {
    const request = {
      name: "Vista",
      configuration: {
        ...defaultLibraryViewConfiguration,
        columns: ["title", "creator", "status", "opened", propertyColumn("reading.started_at")],
      },
    } as Parameters<typeof buildLibraryView>[0];
    const english = JSON.stringify(buildLibraryView(request));
    const italian = await inLocale("it", () => JSON.stringify(buildLibraryView(request)));
    expect(italian).toBe(english);
    expect(english).toContain('"label":"Title"');
  });

  it("writes the same annotation view source in English and Italian", async () => {
    const request = {
      name: "Vista",
      configuration: {
        columns: ["passage", "source", "type", "tags", "location", "created"],
        columnWidths: {},
        sortField: "created",
        sortDirection: "desc",
        filter: emptyAnnotationFilter,
      },
    } as unknown as Parameters<typeof buildAnnotationView>[0];
    const english = JSON.stringify(buildAnnotationView(request));
    const italian = await inLocale("it", () => JSON.stringify(buildAnnotationView(request)));
    expect(italian).toBe(english);
    expect(english).toContain('"label":"Passage"');
  });
});

describe("library field edits round-trip raw values in every language", () => {
  it.each([true, false, 3.5, 1234])(
    "keeps %s unchanged when an Italian edit is saved",
    async (value) => {
      const text = await inLocale("it", () => editableText(value));
      expect(parseFieldInput(text, value, "scalar")).toBe(value);
    },
  );
});
