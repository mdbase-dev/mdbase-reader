import {
  annotationId,
  collectionId,
  dateTime,
  sourceId,
  type Annotation,
  type SourceSummary,
} from "@mdbase-reader/core";
import { expect, it } from "vitest";

import {
  annotationFromOtherSource,
  annotationGroupHeadings,
  unlocatedGroupLabel,
} from "./annotation-groups.js";

const book = sourceId("book");
const chapter = sourceId("chapter");
const base: Annotation = {
  id: annotationId("a"),
  collectionId: collectionId("c"),
  sourceId: book,
  source: "[[book]]",
  annotationType: "highlight",
  body: "> Passage",
  tags: [],
  createdAt: dateTime("2026-01-01T00:00:00Z"),
};
function onPage(id: string, pageIndex: number, owner = book): Annotation {
  return {
    ...base,
    id: annotationId(id),
    sourceId: owner,
    source: `[[${owner}]]`,
    target: {
      pdf: {
        pageIndex,
        coordinateSpace: { profile: "test", origin: "top_left", box: "crop" },
        quadPoints: [[0, 0, 10, 0, 0, 10, 10, 10]],
      },
    },
  };
}
const comment: Annotation = { ...base, id: annotationId("comment"), annotationType: "note" };
const sources = [{ id: chapter, title: "Chapter 2", documents: [] }] as unknown as SourceSummary[];

it("names a source only when it differs from the open one", () => {
  expect(annotationFromOtherSource(onPage("a", 0), book)).toBe(false);
  expect(annotationFromOtherSource(onPage("a", 0, chapter), book)).toBe(true);
  // Without a known open source there is nothing to compare against.
  expect(annotationFromOtherSource(onPage("a", 0, chapter), undefined)).toBe(false);
});

it("heads each run of cards on one page once", () => {
  const headings = annotationGroupHeadings(
    [onPage("a", 0), onPage("b", 0), onPage("c", 2)],
    book,
    sources,
  );
  expect(headings.map((heading) => heading?.label ?? null)).toEqual(["p. 1", null, "p. 3"]);
  expect(headings.every((heading) => !heading?.source)).toBe(true);
});

it("names another source in its run's heading and starts a new group when the source changes", () => {
  const headings = annotationGroupHeadings(
    [onPage("a", 4), onPage("b", 4, chapter), onPage("c", 4, chapter)],
    book,
    sources,
  );
  expect(headings[0]).toEqual({ label: "p. 5", source: null });
  expect(headings[1]).toMatchObject({ label: "p. 5", source: { title: "Chapter 2" } });
  expect(headings[2]).toBeNull();
});

it("gives cards without a passage their own heading once others have headings", () => {
  const headings = annotationGroupHeadings([onPage("a", 0), comment], book);
  expect(headings[1]?.label).toBe(unlocatedGroupLabel());
});

it("adds no headings when nothing has a usable location", () => {
  const page = {
    ...base,
    target: { html: { css: "p" }, quote: { exact: "A passage" } },
  };
  expect(annotationGroupHeadings([page, { ...comment }], book)).toEqual([null, null]);
});

it("notes a run of cards outside their chapter's pages once, on its first heading", () => {
  const document = { fileId: "file", revision: "rev" } as unknown as NonNullable<
    Annotation["document"]
  >;
  const owners = [
    {
      id: chapter,
      title: "Chapter 2",
      documents: [{ ...document, range: { kind: "pages", start: 10, end: 19 } }],
    },
  ] as unknown as SourceSummary[];
  const inChapter = (id: string, pageIndex: number): Annotation => ({
    ...onPage(id, pageIndex, chapter),
    document,
  });
  const headings = annotationGroupHeadings(
    [inChapter("a", 12), inChapter("b", 21), inChapter("c", 21), inChapter("d", 22)],
    chapter,
    owners,
  );
  expect(headings.map((heading) => heading?.label ?? null)).toEqual([
    "p. 13",
    "p. 22",
    null,
    "p. 23",
  ]);
  expect(headings.map((heading) => heading?.outsideChapter ?? false)).toEqual([
    false,
    true,
    false,
    false,
  ]);
});
