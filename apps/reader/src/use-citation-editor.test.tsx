// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import {
  CitationChangedElsewhereError,
  collectionId,
  recordRevision,
  sourceId,
  type Source,
} from "@mdbase-reader/core";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const gateway = {
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
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
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

  it("reviews changes and fills, never suggests a removed field, and saves only accepted provenance", async () => {
    citationClaims.mockResolvedValue([
      claim("title", "Updated title"),
      claim("publisher", "A press"),
      claim("language", "fr"),
    ]);
    await render(explained);
    await find();
    expect(citationClaims).toHaveBeenCalledWith(
      { query: "https://example.org", url: "https://example.org" },
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
    await act(async () => finish([claim("publisher", "Remote")]));
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
