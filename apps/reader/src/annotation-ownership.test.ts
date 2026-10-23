import { fileRevision, sourceId, type Source, type SourceSummary } from "@mdbase-reader/core";
import { beforeEach, describe, expect, it } from "vitest";

import {
  annotationOwnerPreference,
  setAnnotationOwnerPreference,
} from "./annotation-owner-preference.js";
import { defaultAnnotationOwner } from "./annotation-ownership.js";
import { PreviewGateway } from "./preview.js";
import { sourceAnnotationFamily } from "./source-annotation-family.js";

let book: Source;
let chapter: Source;
let family: readonly SourceSummary[];
beforeEach(async () => {
  const gateway = new PreviewGateway();
  book = (await gateway.source(sourceId("src_anthology")))!;
  chapter = (await gateway.source(sourceId("src_anthology_chapter_1")))!;
  family = sourceAnnotationFamily(book, (await gateway.library()).sources);
  setAnnotationOwnerPreference("chapter");
});
function decision(
  overrides: Partial<Parameters<typeof defaultAnnotationOwner>[0]> = {},
): ReturnType<typeof defaultAnnotationOwner> {
  return defaultAnnotationOwner({
    source: book,
    sources: family,
    preference: annotationOwnerPreference(),
    document: book.documents[0]!,
    target: { position: { kind: "pdf", pageIndex: 2 } },
    contains: (range, target) =>
      Promise.resolve(
        range.kind === "pages" &&
          target.position?.kind === "pdf" &&
          target.position.pageIndex >= range.start &&
          target.position.pageIndex <= range.end,
      ),
    ...overrides,
  });
}
describe("annotation owner defaults", () => {
  it("uses the chapter session, or uniquely verified book range, without changing coordinates", async () => {
    expect((await decision({ source: chapter })).owner.id).toBe(chapter.id);
    expect((await decision()).owner.id).toBe(chapter.id);
    expect(
      (await decision({ target: { position: { kind: "pdf", pageIndex: 25 } } })).owner.id,
    ).toBe(book.id);
  });
  it("applies setting changes only to new decisions", async () => {
    expect(annotationOwnerPreference()).toBe("chapter");
    setAnnotationOwnerPreference("book");
    expect((await decision()).owner.id).toBe(book.id);
    expect((await decision({ source: chapter })).owner.id).toBe(book.id);
    setAnnotationOwnerPreference("chapter");
    expect((await decision()).owner.id).toBe(chapter.id);
  });
  it("falls back with reasons for uncertainty, revision mismatch, overlap and cross-boundary selectors", async () => {
    expect(await decision({ contains: () => Promise.resolve(null) })).toMatchObject({
      owner: book,
      reason: expect.stringContaining("unverified"),
    });
    expect(
      await decision({
        document: { ...book.documents[0]!, revision: fileRevision(`sha256:${"b".repeat(64)}`) },
      }),
    ).toMatchObject({ owner: book, reason: expect.stringContaining("revision") });
    expect(
      await decision({ sources: [...family, { ...chapter, id: sourceId("overlap") }] }),
    ).toMatchObject({ owner: book, reason: expect.stringContaining("overlap") });
    expect(
      await decision({
        target: { quote: { exact: "selection across pages" } },
        contains: () => Promise.resolve(null),
      }),
    ).toMatchObject({ owner: book });
  });
  it("keeps source-only notes on the current source and bounds external cycles", async () => {
    expect(
      (await defaultAnnotationOwner({ source: book, sources: family, preference: "chapter" })).owner
        .id,
    ).toBe(book.id);
    expect(sourceAnnotationFamily({ ...chapter, partOf: chapter.id }, [chapter])).toHaveLength(1);
  });
});
