import {
  annotationId,
  collectionId,
  dateTime,
  sourceId,
  type Annotation,
  type SourceSummary,
} from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { annotationEntries, annotationsToMarkdown } from "./annotation-overview.js";

const collection = collectionId("c");
const dostoevsky: SourceSummary = {
  collectionId: collection,
  id: sourceId("dostoevsky"),
  path: "sources/dostoevsky.md",
  title: "Crime and Punishment",
  creators: ["Fyodor Dostoevsky"],
  tags: [],
  documents: [],
  properties: { course: "[[c/att|Attention]]" },
};
const tufte: SourceSummary = {
  ...dostoevsky,
  id: sourceId("tufte"),
  title: "Visual Display",
  creators: ["Edward Tufte"],
  properties: {},
};
function annotation(
  id: string,
  source: SourceSummary,
  body: string,
  extra: Partial<Annotation> = {},
): Annotation {
  return {
    collectionId: collection,
    id: annotationId(id),
    sourceId: source.id,
    source: `[[${source.id}]]`,
    annotationType: "highlight",
    tags: [],
    body,
    createdAt: dateTime(`2026-09-0${String(id.length)}T00:00:00Z`),
    path: `annotations/${id}.md`,
    ...extra,
  };
}
const entries = annotationEntries(
  [
    annotation("a", dostoevsky, "> Attention is rare.\n\nKey claim.", {
      tags: ["attention"],
      locator: { label: "p. 3" },
    }),
    annotation("bb", tufte, "Chartjunk note.", { annotationType: "note" }),
  ],
  [dostoevsky, tufte],
);

describe("annotation overview", () => {
  it("separates the quoted passage from the reader's note", () => {
    expect(entries[0]?.quote).toBe("Attention is rare.");
    expect(entries[0]?.note).toBe("Key claim.");
  });

  it("writes Markdown grouped by source with links back to each annotation", () => {
    const markdown = annotationsToMarkdown(entries);
    expect(markdown).toContain(
      "## Crime and Punishment — Fyodor Dostoevsky\n\n> Attention is rare.\n\nKey claim.\n\n[[annotations/a|↗]] (p. 3)",
    );
    expect(markdown).toContain(
      "## Visual Display — Edward Tufte\n\nChartjunk note.\n\n[[annotations/bb|↗]]",
    );
  });
});
