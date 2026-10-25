// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes effects and promise work */
import { act, useEffect, type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { citationSourceLabel } from "./citation-provenance.js";
import { partSource } from "./source-parts.fixtures.js";
import { useCitationEditor, type CitationEditorController } from "./use-citation-editor.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Source } from "@mdbase-reader/core";

vi.mock("@mdbase-dev/ui/mark-activity", () => ({ signalMdbaseMark: vi.fn() }));
let host: HTMLDivElement;
let root: Root;
let editor: CitationEditorController;
let book: Source;
let chapter: Source;
let changed: (() => void) | undefined;
const save = vi.fn();
let gateway: ReaderWorkspaceGateway;
function Harness(): JSX.Element {
  const current = useCitationEditor({ gateway, source: chapter, onSaved: vi.fn() });
  useEffect(() => {
    editor = current;
  }, [current]);
  return <div />;
}
async function render(): Promise<void> {
  await act(async () => {
    root.render(<Harness />);
  });
}

beforeEach(() => {
  book = partSource("Book");
  chapter = partSource("Chapter", "Book");
  save.mockReset().mockImplementation((source: Source) => Promise.resolve(source));
  changed = undefined;
  gateway = {
    source: vi.fn((id) => Promise.resolve(id === book.id ? book : chapter)),
    saveSourceCitation: save,
    subscribeCitationChanges: (listener: () => void) => {
      changed = listener;
      return () => {
        changed = undefined;
      };
    },
  } as unknown as ReaderWorkspaceGateway;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("parent citation suggestions", () => {
  it("loads immediate-parent fields without remote requests or automatic writes", async () => {
    await render();
    expect(editor.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "container-title",
          proposed: "Book",
          source: { kind: "parent" },
        }),
      ]),
    );
    expect(save).not.toHaveBeenCalled();
    expect(citationSourceLabel("parent title")).toBe("From the book");
    await act(async () => {
      editor.acceptSuggestions(new Set(["container-title"]));
    });
    expect(editor.provenance["container-title"]?.source).toBe("parent");
    expect(save).not.toHaveBeenCalled();
  });
  it("refreshes open chapter editors when a book citation is saved, preserving manual pins", async () => {
    chapter = {
      ...chapter,
      citation: {
        ...chapter.citation,
        id: chapter.id,
        type: "chapter",
        "container-title": "Old book",
        publisher: "My publisher",
      },
      cslProvenance: {
        "container-title": { value: "Old book", source: "parent title" },
        publisher: { value: "My publisher", source: "user" },
      },
    };
    chapter = {
      ...chapter,
      frontmatter: { csl: chapter.citation, "csl-provenance": chapter.cslProvenance },
    };
    await render();
    book = {
      ...book,
      citation: { id: book.id, type: "book", title: "Corrected book", publisher: "New press" },
    };
    await act(async () => {
      changed?.();
    });
    expect(editor.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "container-title", proposed: "Corrected book" }),
      ]),
    );
    expect(editor.suggestions.some(({ field }) => field === "publisher")).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it("refuses to save accepted stale parent claims and retains the draft for review", async () => {
    await render();
    await act(async () => {
      editor.acceptSuggestions(new Set(["container-title"]));
    });
    book = { ...book, citation: { id: book.id, type: "book", title: "Changed after review" } };
    await act(async () => {
      editor.save();
    });
    expect(save).not.toHaveBeenCalled();
    expect(editor.error).toContain("book or parent relation changed");
    expect(editor.assessment.value?.["container-title"]).toBe("Book");
  });
  it("keeps manual overrides pinned even if the book changes before save", async () => {
    await render();
    await act(async () => {
      editor.acceptSuggestions(new Set(["container-title"]));
    });
    await act(async () => {
      editor.setCitation({ ...editor.assessment.value, "container-title": "My deliberate value" });
    });
    expect(editor.provenance["container-title"]?.source).toBe("user");
    book = { ...book, citation: { id: book.id, type: "book", title: "Changed after review" } };
    await act(async () => {
      editor.save();
    });
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ "container-title": "My deliberate value" }),
      expect.objectContaining({
        provenance: expect.objectContaining({
          "container-title": expect.objectContaining({ source: "user" }),
        }),
      }),
    );
  });

  it("proposes the new immediate container after re-parenting without rewriting the citation", async () => {
    await render();
    book = {
      ...partSource("Other book"),
      citation: { id: "other", type: "book", title: "Other book" },
    };
    chapter = { ...chapter, partOf: book.id, recordRevision: book.recordRevision };
    await render();
    expect(editor.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "container-title", proposed: "Other book" }),
      ]),
    );
    expect(save).not.toHaveBeenCalled();
  });
});
