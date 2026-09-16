import {
  annotationId,
  collectionId,
  dateTime,
  sourceId,
  type Annotation,
} from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { annotationWikiCandidate } from "./annotation-wiki-candidates.js";

const annotation: Annotation = {
  collectionId: collectionId("reading"),
  id: annotationId("ann_01"),
  path: "annotations/ann_01.md",
  sourceId: sourceId("source_01"),
  source: "[[source_01]]",
  annotationType: "highlight",
  locator: { label: "p. 12" },
  target: { quote: { exact: "Noisy selector text used for anchoring." } },
  tags: [],
  body: "> The user-corrected quotation.\n\nA considered note.",
  createdAt: dateTime("2026-08-14T00:00:00.000Z"),
};

describe("annotationWikiCandidate", () => {
  it("presents the authored blockquote rather than selector evidence", () => {
    expect(annotationWikiCandidate(annotation)).toEqual({
      label: "The user-corrected quotation.",
      path: "annotations/ann_01",
      kind: "highlight",
      detail: "p. 12",
      quote: "The user-corrected quotation.",
      note: "A considered note.",
      embed: true,
    });
  });

  it("does not restore selector evidence when the blockquote is removed", () => {
    expect(annotationWikiCandidate({ ...annotation, body: "A considered note." })).toEqual({
      label: "A considered note.",
      path: "annotations/ann_01",
      kind: "highlight",
      detail: "p. 12",
      note: "A considered note.",
      embed: true,
    });
  });
});
