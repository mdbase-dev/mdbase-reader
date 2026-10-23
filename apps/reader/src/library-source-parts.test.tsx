// @vitest-environment happy-dom
import { act, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { libraryPartKey, librarySourceParts } from "./library-source-parts.js";
import { LibraryPartDisclosure } from "./LibraryPartDisclosure.js";
import { applyLibraryViewConfiguration, defaultLibraryView } from "./mdbase-library-views.js";
import { partSource } from "./source-parts.fixtures.js";

const book = partSource("Book");
const chapter = partSource("Chapter", "Book");
const section = partSource("Section", "Chapter");
const all = [chapter, book, section];

describe("library source parts", () => {
  it("nests independently sorted parts, supports collapse, and keeps filtered-out parents' children at root", () => {
    const nested = librarySourceParts(all, all, new Set(), false, true);
    expect(nested.sources.map(({ id }) => id)).toEqual([book.id, chapter.id, section.id]);
    expect(nested.rows.get(section.id)?.depth).toBe(2);
    expect(librarySourceParts(all, all, new Set([book.id]), false, true).sources).toEqual([book]);
    const orphanedByFilter = librarySourceParts([chapter], all, new Set([book.id]), false, true);
    expect(orphanedByFilter.sources).toEqual([chapter]);
    expect(orphanedByFilter.rows.get(chapter.id)).toMatchObject({ depth: 0, context: "in Book" });
  });
  it("shows books and chapters as independent search hits, including book context", () => {
    const config = defaultLibraryView.configuration;
    const hits = applyLibraryViewConfiguration(all, {
      ...config,
      filter: { ...config.filter, query: "Book" },
    });
    expect(hits.map(({ id }) => id).sort((a, b) => a.localeCompare(b))).toEqual(
      [book.id, chapter.id].sort((a, b) => a.localeCompare(b)),
    );
    const flat = librarySourceParts(hits, all, new Set([book.id]), true, true);
    expect(flat.sources).toHaveLength(2);
  });
  it("never hides cycles, unresolved relations, missing parents or partial coverage", () => {
    const a = partSource("a", "b");
    const b = partSource("b", "a");
    const missing = partSource("orphan", "missing");
    const ambiguous = {
      ...chapter,
      relations: [
        { relation: "part-of", target: "[[a]]" },
        { relation: "part-of", target: "[[b]]" },
      ],
    };
    const sources = [a, b, missing, ambiguous];
    const rows = librarySourceParts(sources, sources, new Set([a.id, b.id]), false, true);
    expect(rows.sources).toHaveLength(4);
    expect(rows.rows.get(a.id)?.diagnostic).toContain("cycle");
    expect(rows.rows.get(missing.id)?.diagnostic).toContain("Missing parent");
    expect(rows.rows.get(ambiguous.id)?.diagnostic).toContain("[[b]]");
    expect(
      librarySourceParts([missing], [missing], new Set(), false, false).rows.get(missing.id)
        ?.diagnostic,
    ).toContain("partial");
  });
  it("implements treegrid left/right travel while disclosures retain native Tab, Space and Enter semantics", () => {
    const rows = librarySourceParts(all, all, new Set(), false, true).rows;
    expect(libraryPartKey("ArrowLeft", book, rows.get(book.id))).toBe("collapse");
    expect(libraryPartKey("ArrowRight", book, rows.get(book.id))).toBe("child");
    expect(libraryPartKey("ArrowLeft", section, rows.get(section.id))).toBe("parent");
    expect(
      libraryPartKey("ArrowRight", book, { depth: 0, expandable: true, expanded: false }),
    ).toBe("expand");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const toggle = vi.fn();
    function Harness(): JSX.Element {
      return <LibraryPartDisclosure source={book} row={rows.get(book.id)} onToggle={toggle} />;
    }
    act(() => root.render(<Harness />));
    const button = host.querySelector("button");
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    button?.focus();
    expect(document.activeElement).toBe(button);
    act(() => button?.click());
    expect(toggle).toHaveBeenCalledOnce();
    act(() => root.unmount());
    host.remove();
  });
});
