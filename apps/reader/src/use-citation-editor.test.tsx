// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import {
  CitationChangedElsewhereError,
  collectionId,
  fileId,
  fileRevision,
  recordRevision,
  sourceId,
  type Source,
} from "@mdbase-reader/core";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { archivedCitationClaims, MAX_CITATION_ARCHIVE_BYTES } from "./archived-citation-claims.js";
import { CitationLookup } from "./CitationLookup.js";
import { CitationProvenance } from "./CitationProvenance.js";
import { CitationSaveConflict } from "./CitationSaveConflict.js";
import { useCitationEditor, type CitationEditorController } from "./use-citation-editor.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Claim } from "@mdbase-reader/web-capture/citation-updates";

vi.mock("@mdbase-dev/ui/mark-activity", () => ({ signalMdbaseMark: vi.fn() }));

const citation = {
  id: "example2026",
  type: "article",
  title: "Original",
  URL: "https://example.org",
};
const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_one"),
  path: "sources/one.md",
  title: "One",
  creators: [],
  tags: [],
  documents: [],
  body: "",
  recordRevision: recordRevision("rev-one"),
  frontmatter: { csl: citation },
  citation,
};
const explained: Source = {
  ...source,
  cslProvenance: {
    title: {
      value: "Original",
      source: "page:html",
      agreed: ["page:json-ld name", "h1"],
      rejected: [{ value: "Other title", from: "page:json-ld headline" }],
    },
    language: { value: "en", source: "page:json-ld" },
  },
};
const saveSourceCitation = vi.fn<ReaderWorkspaceGateway["saveSourceCitation"]>();
const citationClaims = vi.fn<NonNullable<ReaderWorkspaceGateway["citationClaims"]>>();
const resolveCitation = vi.fn<NonNullable<ReaderWorkspaceGateway["resolveCitation"]>>();
const readFile = vi.fn<ReaderWorkspaceGateway["readFile"]>();
const archivedSource: Source = {
  ...source,
  url: citation.URL,
  documents: [
    {
      fileId: fileId("file-archive"),
      file: "files/example.archive.html",
      revision: fileRevision(`sha256:${"a".repeat(64)}`),
      mediaType: "text/html",
      role: "archive",
    },
  ],
  frontmatter: { ...source.frontmatter, capture: { captured_at: "2026-08-10T11:59:00Z" } },
};
const archiveHtml = '<meta name="citation_publisher" content="Archived press">';
function archiveFile(html = archiveHtml): Awaited<ReturnType<ReaderWorkspaceGateway["readFile"]>> {
  return {
    path: "files/example.archive.html",
    mediaType: "text/html",
    bytes: new TextEncoder().encode(html),
  };
}
const gateway = {
  readFile,
  saveSourceCitation,
  citationClaims,
  resolveCitation,
} as unknown as ReaderWorkspaceGateway;
let root: Root;
let container: HTMLDivElement;
let controller: CitationEditorController;

function Harness({ source }: { source: Source }): React.JSX.Element {
  const current = useCitationEditor({ gateway, source, onSaved: vi.fn() });
  useEffect(() => {
    controller = current;
  }, [current]);
  return (
    <>
      <CitationLookup key={source.id} citation={current.assessment.value ?? {}} editor={current} />
      <CitationProvenance
        citation={current.assessment.value ?? {}}
        provenance={current.provenance}
        onChange={current.setCitation}
      />
      {current.conflict ? <CitationSaveConflict editor={current} /> : null}
    </>
  );
}

async function render(source: Source): Promise<void> {
  await act(async () => root.render(<Harness source={source} />));
}
async function click(label: string): Promise<void> {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.getAttribute("aria-label") === label || item.textContent === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
async function find(): Promise<void> {
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
function claim(field: string, value: unknown): Claim {
  return {
    field,
    value,
    source: { kind: "registry", name: "doi.org" },
    evidence: "doi.org CSL",
    observedAt: "2026-10-22T00:00:00Z",
  };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  saveSourceCitation.mockReset();
  saveSourceCitation.mockImplementation((source, citation, options) =>
    Promise.resolve({
      ...source,
      citation: citation as NonNullable<Source["citation"]>,
      cslProvenance: options?.provenance ?? {},
      frontmatter: { ...source.frontmatter, csl: citation, "csl-provenance": options?.provenance },
    }),
  );
  resolveCitation.mockReset();
  citationClaims.mockReset();
  citationClaims.mockResolvedValue([]);
  readFile.mockReset();
  readFile.mockResolvedValue(archiveFile());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

// eslint-disable-next-line max-lines-per-function
describe("citation provenance and lookups", () => {
  it("shows field status labels and agreed evidence without exposing stale alternatives", async () => {
    await render({
      ...explained,
      cslProvenance: {
        ...explained.cslProvenance,
        URL: {
          value: "https://old.example",
          source: "registry:doi.org",
          rejected: [{ value: "https://rejected.example", from: "page:html" }],
        },
      },
    });
    expect(container.textContent).toContain("page title");
    expect(container.textContent).toContain("edited manually");
    expect(container.textContent).toContain("removed");
    expect(container.textContent).toContain("manual");
    expect(container.textContent).toContain("page metadata · name; h1");
    expect(container.textContent).not.toContain("https://rejected.example");
  });

  it("applies a rejected alternative as an ordinary unsaved manual edit", async () => {
    await render(explained);
    await click("Use alternative 1 for Title");
    expect(controller.assessment.value?.["title"]).toBe("Other title");
    expect(controller.provenance["title"]).toEqual({ value: "Other title", source: "user" });
    expect(controller.dirty).toBe(true);
    expect(saveSourceCitation).not.toHaveBeenCalled();
  });

  it("reviews changes and fills, protects removals, and saves accepts and dismissals together", async () => {
    citationClaims.mockResolvedValue([
      claim("title", "Updated title"),
      claim("publisher", "A press"),
      claim("language", "fr"),
    ]);
    await render(explained);
    await find();
    expect(citationClaims).toHaveBeenCalledWith(
      { query: "https://example.org" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(controller.suggestions.map(({ field }) => field)).toEqual(["publisher", "title"]);
    expect(container.textContent).toContain("Updated title");
    expect(container.textContent).toContain("doi.org");
    expect(controller.draft).toContain("Original");
    await click("Dismiss Publisher");
    await click("Accept Title");
    expect(controller.suggestions).toEqual([]);
    expect(controller.assessment.value?.["title"]).toBe("Updated title");
    expect(controller.assessment.value?.["publisher"]).toBeUndefined();
    expect(controller.assessment.value?.["language"]).toBeUndefined();
    expect(saveSourceCitation).not.toHaveBeenCalled();
    await act(async () => controller.save());
    expect(saveSourceCitation).toHaveBeenLastCalledWith(
      explained,
      { ...citation, title: "Updated title" },
      {
        expectedCitation: citation,
        provenance: {
          ...explained.cslProvenance,
          title: { value: "Updated title", source: "registry:doi.org", agreed: ["doi.org CSL"] },
          publisher: {
            rejected: [{ value: "A press", from: "user" }],
          },
        },
      },
    );
  });

  it("accepts all into the draft and keeps typed values user-owned", async () => {
    citationClaims.mockResolvedValue([claim("publisher", "A press"), claim("volume", "7")]);
    await render(explained);
    await find();
    await click("Accept all");
    expect(controller.assessment.value).toMatchObject({ publisher: "A press", volume: "7" });
    expect(saveSourceCitation).not.toHaveBeenCalled();
    await act(async () =>
      controller.setCitation({ ...controller.assessment.value, publisher: "My press" }),
    );
    await act(async () => controller.save());
    expect(saveSourceCitation.mock.lastCall?.[2]?.provenance).toMatchObject({
      publisher: { value: "My press", source: "user" },
      volume: { value: "7", source: "registry:doi.org" },
    });
  });

  it("does not restore a manually removed unrecorded field on the next lookup", async () => {
    const withLanguage = {
      ...source,
      citation: { ...citation, language: "en" },
      frontmatter: { csl: { ...citation, language: "en" } },
    };
    citationClaims.mockResolvedValue([claim("language", "fr")]);
    await render(withLanguage);
    await act(async () => controller.setCitation(citation));
    await find();
    expect(controller.suggestions).toEqual([]);
    await act(async () => controller.save());
    expect(saveSourceCitation.mock.lastCall?.[2]?.provenance?.["language"]).toEqual({
      value: "en",
      source: "user",
    });
  });

  it("protects edits made while a lookup is pending", async () => {
    let finish!: (claims: readonly Claim[]) => void;
    citationClaims.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render(explained);
    await find();
    await act(async () => controller.setCitation({ ...citation, publisher: "Typed" }));
    await act(async () => finish([claim("publisher", "Remote"), claim("volume", "Stale")]));
    expect(controller.suggestions).toEqual([]);
    expect(controller.assessment.value?.["publisher"]).toBe("Typed");
  });

  it("aborts and scopes lookup results when the source changes", async () => {
    let finish!: (claims: readonly Claim[]) => void;
    citationClaims.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render(explained);
    await find();
    const signal = citationClaims.mock.lastCall?.[1]?.signal;
    await render({ ...source, id: sourceId("src_two") });
    await act(async () => finish([claim("publisher", "Stale")]));
    expect(signal?.aborted).toBe(true);
    expect(controller.suggestions).toEqual([]);
    expect(controller.resolutionStatus).toBe("idle");
    await render(explained);
    expect(controller.resolutionStatus).toBe("idle");
    expect(container.textContent).not.toContain("Looking…");
    await find();
    expect(citationClaims).toHaveBeenCalledTimes(2);
  });

  it("discards resolved suggestions on source changes, even after returning", async () => {
    citationClaims.mockResolvedValue([claim("publisher", "Stale")]);
    await render(explained);
    await find();
    expect(controller.suggestions).toHaveLength(1);
    await render({ ...source, id: sourceId("src_two") });
    expect(controller.suggestions).toEqual([]);
    await render(explained);
    expect(controller.suggestions).toEqual([]);
    expect(controller.resolutionStatus).toBe("idle");
  });

  it("discards all suggestions when the citation changes", async () => {
    citationClaims.mockResolvedValue([claim("publisher", "Stale")]);
    await render(explained);
    await find();
    await act(async () => controller.setCitation({ ...citation, title: "Another work" }));
    expect(controller.suggestions).toEqual([]);
    expect(controller.resolutionStatus).toBe("idle");
    await act(async () => controller.acceptSuggestions(new Set(["publisher"])));
    expect(controller.assessment.value).toEqual({ ...citation, title: "Another work" });
  });

  it.each(["{", "[]", "null", '"not an object"'])(
    "cannot accept suggestions into a non-object draft: %s",
    async (draft) => {
      citationClaims.mockResolvedValue([claim("publisher", "A press")]);
      await render(explained);
      await find();
      const provenance = controller.provenance;
      await act(async () => controller.setDraft(draft));
      expect(controller.suggestions).toEqual([]);
      expect(container.textContent).not.toContain("Accept all");
      await act(async () => controller.acceptSuggestions(new Set(["publisher"])));
      await act(async () => controller.resolve(citation.URL));
      expect(citationClaims).toHaveBeenCalledTimes(1);
      expect(controller.draft).toBe(draft);
      expect(controller.provenance).toEqual(provenance);
      await act(async () => controller.setDraft(JSON.stringify(citation)));
      expect(controller.assessment.value).toEqual(citation);
      expect(controller.provenance).toEqual(provenance);
      expect(controller.suggestions).toEqual([]);
    },
  );

  it("preserves untouched provenance through an invalid raw JSON edit", async () => {
    await render(explained);
    await act(async () => controller.setDraft("{"));
    await act(async () => controller.setDraft(JSON.stringify({ ...citation, publisher: "Typed" })));
    expect(controller.provenance["title"]).toEqual(explained.cslProvenance?.["title"]);
  });
});

describe("citation lookup from the source archive", () => {
  it("reviews archive fills alongside remote claims, without overwriting the draft", async () => {
    citationClaims.mockResolvedValue([claim("volume", "7")]);
    await render(archivedSource);
    await find();
    expect(readFile).toHaveBeenCalledExactlyOnceWith(
      archivedSource.documents[0]!.file,
      archivedSource.documents[0]!.revision,
      { signal: citationClaims.mock.lastCall?.[1]?.signal, maxBytes: MAX_CITATION_ARCHIVE_BYTES },
    );
    expect(controller.suggestions).toContainEqual(
      expect.objectContaining({
        field: "publisher",
        proposed: "Archived press",
        reason: "fill",
        source: { kind: "page", signal: "highwire" },
      }),
    );
    expect(controller.suggestions).toContainEqual(
      expect.objectContaining({ field: "volume", proposed: "7" }),
    );
    expect(controller.assessment.value).toEqual(citation);
    expect(saveSourceCitation).not.toHaveBeenCalled();
    await click("Accept Publisher");
    expect(controller.assessment.value?.["publisher"]).toBe("Archived press");
    expect(controller.provenance["publisher"]).toEqual({
      value: "Archived press",
      source: "page:highwire",
      agreed: ["citation_publisher"],
    });
    expect(saveSourceCitation).not.toHaveBeenCalled();
  });

  it("does not read readable or primary documents when no archive exists", async () => {
    citationClaims.mockResolvedValue([claim("publisher", "Remote press")]);
    await render({
      ...archivedSource,
      documents: archivedSource.documents.map((item) => ({ ...item, role: "readable" })),
    });
    await find();
    expect(readFile).not.toHaveBeenCalled();
    expect(controller.suggestions).toEqual([
      expect.objectContaining({ field: "publisher", proposed: "Remote press" }),
    ]);
  });

  it("can use the archive when remote lookup fails", async () => {
    citationClaims.mockRejectedValue(new Error("Offline"));
    await render(archivedSource);
    await find();
    expect(controller.resolutionError).toBeNull();
    expect(controller.suggestions).toContainEqual(
      expect.objectContaining({ field: "publisher", proposed: "Archived press" }),
    );
  });
});

describe("bounded archive lookups", () => {
  it.each(["oversized", "invalid encoding", "unreadable"])(
    "keeps remote lookup working with an %s archive",
    async (kind) => {
      if (kind === "unreadable") {
        readFile.mockRejectedValue(new Error("Missing archive"));
      } else {
        readFile.mockResolvedValue({
          ...archiveFile(),
          bytes:
            kind === "oversized"
              ? new Uint8Array(MAX_CITATION_ARCHIVE_BYTES + 1)
              : new Uint8Array([0xff]),
        });
      }
      citationClaims.mockResolvedValue([claim("publisher", "Remote press")]);
      await render(archivedSource);
      await find();
      expect(controller.resolutionError).toBeNull();
      expect(controller.suggestions).toEqual([
        expect.objectContaining({ field: "publisher", proposed: "Remote press" }),
      ]);
    },
  );

  it("tolerates broken JSON-LD and incomplete HTML", async () => {
    readFile.mockResolvedValue(
      archiveFile(`${archiveHtml}<script type="application/ld+json">{broken</script><p`),
    );
    await render(archivedSource);
    await find();
    expect(controller.resolutionError).toBeNull();
    expect(controller.suggestions).toContainEqual(
      expect.objectContaining({ field: "publisher", proposed: "Archived press" }),
    );
  });

  it("aborts the archive read and ignores late data when the source changes", async () => {
    let finish!: (file: Awaited<ReturnType<ReaderWorkspaceGateway["readFile"]>>) => void;
    readFile.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render(archivedSource);
    await find();
    const signal = readFile.mock.lastCall?.[2]?.signal;
    expect(signal?.aborted).toBe(false);
    await render({ ...source, id: sourceId("src_two") });
    expect(signal?.aborted).toBe(true);
    await act(async () => finish(archiveFile()));
    expect(controller.suggestions).toEqual([]);
    expect(controller.resolutionStatus).toBe("idle");
  });
});

describe("archived citation evidence", () => {
  it.each([false, true])(
    "uses capture time and prefers document-specific provenance: %s",
    async (documentTime) => {
      const captured = {
        ...archivedSource,
        frontmatter: {
          ...archivedSource.frontmatter,
          ...(documentTime
            ? {
                documents: [
                  {
                    file_id: "file-archive",
                    retrieved_at: "2026-08-09T00:00:00Z",
                    origin_url: "https://original.example",
                  },
                ],
              }
            : {}),
        },
      };
      const claims = await archivedCitationClaims(
        gateway,
        captured,
        citation.URL,
        new AbortController().signal,
      );
      expect(claims.find(({ field }) => field === "publisher")).toMatchObject({
        value: "Archived press",
        source: { kind: "page", signal: "highwire" },
        observedAt: documentTime ? "2026-08-09T00:00:00Z" : "2026-08-10T11:59:00Z",
      });
      expect(claims).toContainEqual(
        expect.objectContaining({
          field: "URL",
          value: documentTime ? "https://original.example" : citation.URL,
        }),
      );
    },
  );

  it("only gives DOMParser non-loading metadata and preserves JSON-LD evidence", async () => {
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString");
    readFile.mockResolvedValue(
      archiveFile(`
      <link rel="stylesheet canonical" href="https://network.example/style.css">
      <meta http-equiv="refresh" content="0;url=https://network.example">
      <img src="https://network.example/image" onerror="alert(1)">
      <iframe src="https://network.example/frame"></iframe>
      <style>@import "https://network.example/style";</style>
      <script src="https://network.example/code">throw new Error("executed");</script>
      <script type="application/ld+json" src="https://network.example/data">
        {"@type":"Article","publisher":{"name":"JSON-LD press"}}
      </script>`),
    );
    await render(archivedSource);
    await find();
    const markup = String(parse.mock.calls[0]?.[0]);
    expect(markup).not.toMatch(/<img|<iframe|<style|src=|onerror=|http-equiv=|rel="stylesheet"/u);
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(controller.suggestions).toContainEqual(
      expect.objectContaining({
        field: "publisher",
        proposed: "JSON-LD press",
        source: { kind: "page", signal: "json-ld" },
      }),
    );
  });
});

describe("saved citation dismissals", () => {
  it.each([
    ["title", "Updated title", "  UPDATED title. ", "Different title"],
    ["publisher", "A press", " A PRESS ", "Different press"],
  ])(
    "remembers a dismissed %s through save, remount and another Find",
    async (field, value, equivalent, different) => {
      citationClaims.mockResolvedValue([claim(field, value)]);
      await render(explained);
      await find();
      expect(controller.suggestions).toHaveLength(1);
      await act(async () => controller.dismissSuggestion(field));
      expect(controller.dirty).toBe(true);
      expect(controller.suggestions).toEqual([]);
      expect(saveSourceCitation).not.toHaveBeenCalled();
      await act(async () => controller.save());
      const saved: Source = await saveSourceCitation.mock.results[0]!.value;
      expect(saved.cslProvenance?.[field]?.rejected?.[0]).toEqual({ value, from: "user" });
      expect(saved.citation).toEqual(citation);
      await act(async () => root.unmount());
      root = createRoot(container);
      await render(saved);
      expect(controller.dirty).toBe(false);
      citationClaims.mockResolvedValue([claim(field, equivalent)]);
      await find();
      expect(controller.suggestions).toEqual([]);
      citationClaims.mockResolvedValue([claim(field, different)]);
      await find();
      expect(controller.suggestions).toMatchObject([{ field, proposed: different }]);
    },
  );

  it("does not persist a discarded dismissal", async () => {
    citationClaims.mockResolvedValue([claim("publisher", "A press")]);
    await render(explained);
    await find();
    await click("Dismiss Publisher");
    await find();
    expect(controller.suggestions).toEqual([]);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(explained);
    await find();
    expect(controller.suggestions).toMatchObject([{ field: "publisher", proposed: "A press" }]);
    expect(saveSourceCitation).not.toHaveBeenCalled();
  });

  it("bounds dismissal history and preserves it through accepting and typing", async () => {
    await render(explained);
    for (const value of ["First", "Second", "Third"]) {
      citationClaims.mockResolvedValue([claim("title", value)]);
      await find();
      await click("Dismiss Title");
    }
    expect(controller.provenance["title"]?.rejected).toEqual([
      { value: "Third", from: "user" },
      { value: "Second", from: "user" },
    ]);
    citationClaims.mockResolvedValue([claim("title", "Fourth")]);
    await find();
    await click("Accept Title");
    expect(controller.provenance["title"]?.rejected).toHaveLength(2);
    await act(async () => controller.setCitation({ ...citation, title: "Typed" }));
    await act(async () => controller.save());
    expect(saveSourceCitation.mock.lastCall?.[2]?.provenance?.["title"]).toEqual({
      value: "Typed",
      source: "user",
      rejected: [
        { value: "Third", from: "user" },
        { value: "Second", from: "user" },
      ],
    });
  });
});

describe("citation lookup targets", () => {
  const withDoi = {
    ...source,
    url: "https://existing.example",
    citation: { ...citation, DOI: "10.1234/existing" },
    frontmatter: { csl: { ...citation, DOI: "10.1234/existing" } },
  };

  it.each(["10.1234/typed", "doi:10.1234/typed", "https://typed.example"])(
    "does not attach current identifiers to a typed target: %s",
    async (query) => {
      await render(withDoi);
      await act(async () => controller.resolve(query));
      expect(citationClaims).toHaveBeenCalledExactlyOnceWith(
        { query },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(resolveCitation).not.toHaveBeenCalled();
    },
  );

  it.each(["", "refresh"])("uses current identifiers for a refresh: %j", async (query) => {
    await render(withDoi);
    await act(async () => controller.resolve(query));
    expect(citationClaims).toHaveBeenCalledExactlyOnceWith(
      { query: "", url: "https://existing.example", doi: "10.1234/existing" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe("legacy identifier lookup review", () => {
  it("still reviews an ISBN candidate as claims, without restoring a removed field", async () => {
    resolveCitation.mockResolvedValue({
      citation: {
        id: "remote-key",
        type: "article",
        title: "Original",
        publisher: "Found press",
        language: "fr",
      },
      provenance: { provider: "catalogue", query: "isbn:123", retrievedAt: "2026-10-23T00:00:00Z" },
      warnings: [],
    });
    await render(explained);
    await act(async () => controller.resolve("isbn:123"));
    expect(citationClaims).not.toHaveBeenCalled();
    expect(resolveCitation).toHaveBeenCalledWith(
      { kind: "identifier", value: "isbn:123" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(controller.suggestions.map(({ field }) => field)).toEqual(["publisher"]);
    await click("Accept all");
    expect(controller.assessment.value?.id).toBe("example2026");
    expect(controller.assessment.value?.["language"]).toBeUndefined();
  });
});

describe("citation editor save baseline and conflicts", () => {
  it("keeps the loaded baseline when other writes refresh the source", async () => {
    const edited = { ...citation, title: "Reader edit" };
    await render(source);
    await act(async () => controller.setCitation(edited));
    await render({
      ...source,
      recordRevision: recordRevision("rev-two"),
      citation: { ...citation, title: "Outside edit" },
      frontmatter: { csl: { ...citation, title: "Outside edit" } },
    });
    await act(async () => controller.save());
    expect(saveSourceCitation).toHaveBeenCalledExactlyOnceWith(source, edited, {
      expectedCitation: citation,
      provenance: { title: { value: "Reader edit", source: "user" } },
    });
  });
});

describe("citation editor save guard", () => {
  it("sends one save for same-turn clicks, including after edits while saving", async () => {
    let finish!: (source: Source) => void;
    saveSourceCitation.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const firstEdit = { ...citation, title: "First edit" };
    await render(source);
    await act(async () => controller.setCitation(firstEdit));
    await act(async () => {
      controller.save();
      controller.save();
    });
    expect(saveSourceCitation).toHaveBeenCalledTimes(1);
    const secondEdit = { ...citation, title: "Second edit" };
    await act(async () => controller.setCitation(secondEdit));
    await act(async () => controller.save());
    expect(saveSourceCitation).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish({ ...source, citation: firstEdit, frontmatter: { csl: firstEdit } }),
    );
    expect(controller.assessment.value).toEqual(secondEdit);
    await act(async () => controller.save());
    expect(saveSourceCitation).toHaveBeenCalledTimes(2);
    expect(saveSourceCitation.mock.lastCall?.[2]?.expectedCitation).toEqual(firstEdit);
  });

  it("keeps dismissals made while saving as unsaved provenance edits", async () => {
    let finish!: (source: Source) => void;
    saveSourceCitation.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    citationClaims.mockResolvedValue([claim("publisher", "A press"), claim("volume", "7")]);
    await render(explained);
    await find();
    await click("Dismiss Publisher");
    await act(async () => controller.save());
    const savedProvenance = saveSourceCitation.mock.lastCall?.[2]?.provenance ?? {};
    await click("Dismiss Volume");
    await act(async () =>
      finish({
        ...explained,
        cslProvenance: savedProvenance,
        frontmatter: { csl: citation, "csl-provenance": savedProvenance },
      }),
    );
    expect(controller.provenance["volume"]?.rejected).toEqual([{ value: "7", from: "user" }]);
    expect(controller.dirty).toBe(true);
    await act(async () => controller.save());
    expect(saveSourceCitation).toHaveBeenCalledTimes(2);
    expect(controller.dirty).toBe(false);
  });

  it("releases the save guard after failure so the draft can be retried", async () => {
    saveSourceCitation.mockRejectedValueOnce(new Error("Offline"));
    await render(source);
    await act(async () => controller.setCitation({ ...citation, title: "Mine" }));
    await act(async () => {
      controller.save();
      controller.save();
    });
    expect(saveSourceCitation).toHaveBeenCalledTimes(1);
    expect(controller.error).toBe("Offline");
    await act(async () => controller.save());
    expect(saveSourceCitation).toHaveBeenCalledTimes(2);
    expect(controller.dirty).toBe(false);
  });
});

describe("citation editor save conflicts", () => {
  it("advances the baseline after a successful save, even without a parent refresh", async () => {
    await render(source);
    const edited = { ...citation, title: "First edit" };
    await act(async () => controller.setCitation(edited));
    await act(async () => controller.save());
    expect(controller.dirty).toBe(false);
    await act(async () => controller.setCitation({ ...citation, title: "Second edit" }));
    await act(async () => controller.save());
    expect(saveSourceCitation.mock.lastCall?.[2]?.expectedCitation).toEqual(edited);
  });

  it("keeps the draft on conflict and lets the user reload their version without a write", async () => {
    const theirs = { ...citation, title: "Outside edit" };
    saveSourceCitation.mockRejectedValueOnce(new CitationChangedElsewhereError(theirs));
    await render(explained);
    await act(async () => controller.setCitation({ ...citation, title: "Mine" }));
    await act(async () => controller.save());
    expect(container.textContent).toContain("Your draft is still here");
    expect(controller.assessment.value?.["title"]).toBe("Mine");
    await click("Use their version");
    expect(controller.assessment.value).toEqual(theirs);
    expect(controller.dirty).toBe(false);
    expect(controller.conflict).toBeNull();
    expect(controller.provenance).toEqual({});
    expect(saveSourceCitation).toHaveBeenCalledTimes(1);
  });

  it("reloads their provenance and preserves their removals on the next save", async () => {
    const theirs = { ...citation, title: "Recaptured" };
    const theirProvenance = {
      title: { value: "Recaptured", source: "registry:doi.org", agreed: ["doi.org CSL"] },
      publisher: { value: "Removed press", source: "user" },
    };
    saveSourceCitation.mockRejectedValueOnce(
      new CitationChangedElsewhereError(theirs, theirProvenance),
    );
    citationClaims.mockResolvedValue([claim("publisher", "Remote press")]);
    await render(explained);
    await act(async () => controller.setCitation({ ...citation, title: "Mine" }));
    await act(async () => controller.save());
    await click("Use their version");
    expect(controller.provenance).toEqual(theirProvenance);
    expect(container.textContent).not.toContain("edited manually");
    expect(controller.dirty).toBe(false);
    await find();
    expect(controller.suggestions).toEqual([]);
    await act(async () => controller.setCitation({ ...theirs, volume: "2" }));
    await act(async () => controller.save());
    expect(saveSourceCitation.mock.lastCall?.[2]).toEqual({
      expectedCitation: theirs,
      provenance: { ...theirProvenance, volume: { value: "2", source: "user" } },
    });
  });

  it("replaces their provenance and pinned removals entirely when keeping mine", async () => {
    const theirs = { ...citation, title: "Outside edit" };
    saveSourceCitation.mockRejectedValueOnce(
      new CitationChangedElsewhereError(theirs, {
        URL: { value: citation.URL, source: "user" },
        publisher: { value: "Removed press", source: "user" },
      }),
    );
    await render(explained);
    await act(async () => controller.setCitation({ ...citation, title: "Mine" }));
    await act(async () => controller.save());
    await click("Keep mine");
    expect(saveSourceCitation.mock.lastCall?.[2]).toEqual({
      expectedCitation: theirs,
      provenance: { ...explained.cslProvenance, title: { value: "Mine", source: "user" } },
    });
  });

  it("keeps mine by re-saving against the exact current citation, and still detects a second race", async () => {
    const theirs = { ...citation, title: "Outside edit" };
    const raced = { ...citation, title: "Changed again" };
    saveSourceCitation
      .mockRejectedValueOnce(new CitationChangedElsewhereError(theirs))
      .mockRejectedValueOnce(new CitationChangedElsewhereError(raced));
    await render(explained);
    await act(async () => controller.setCitation({ ...citation, title: "Mine" }));
    await act(async () => controller.save());
    await click("Keep mine");
    expect(saveSourceCitation.mock.lastCall?.[2]?.expectedCitation).toEqual(theirs);
    expect(controller.conflict?.currentCitation).toEqual(raced);
    await click("Keep mine");
    expect(saveSourceCitation.mock.lastCall?.[2]?.expectedCitation).toEqual(raced);
    expect(controller.assessment.value?.["title"]).toBe("Mine");
    expect(controller.conflict).toBeNull();
    expect(controller.dirty).toBe(false);
  });

  it("allows keep mine after the other editor removed CSL entirely", async () => {
    saveSourceCitation.mockRejectedValueOnce(new CitationChangedElsewhereError(undefined));
    await render(source);
    await act(async () => controller.setCitation({ ...citation, title: "Mine" }));
    await act(async () => controller.save());
    await click("Keep mine");
    expect(saveSourceCitation.mock.lastCall?.[2]).toHaveProperty("expectedCitation", undefined);
  });
});
