import { collectionId, recordRevision, sourceId, type Source } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import { assessCitationDraft, citationDraftForSource } from "./citation-editor-model.js";

const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_one"),
  path: "sources/one.md",
  title: "Gravity and Grace",
  creators: ["Simone Weil"],
  tags: [],
  documents: [],
  body: "",
  recordRevision: recordRevision("rev-one"),
  kind: "book",
  published: 2002,
  frontmatter: {},
};

describe("citation editor model", () => {
  it("starts an uncited source with a repairable CSL template", () => {
    expect(JSON.parse(citationDraftForSource(source))).toEqual({
      id: "weilgravity2002",
      type: "book",
      title: "Gravity and Grace",
      author: [{ literal: "Simone Weil" }],
      issued: { "date-parts": [[2002]] },
    });
  });

  it("preserves invalid embedded metadata so the user can repair it", () => {
    const invalid = { title: "Untyped" };
    expect(
      JSON.parse(citationDraftForSource({ ...source, frontmatter: { csl: invalid } })),
    ).toEqual(invalid);
  });

  it("reports JSON and CSL validation problems before save", () => {
    expect(assessCitationDraft("{")).toMatchObject({ valid: false });
    expect(assessCitationDraft('{"id":"weil"}')).toMatchObject({
      valid: false,
      message: expect.stringContaining("type"),
      value: { id: "weil" },
    });
    expect(assessCitationDraft('{"id":"weil","type":"book"}')).toMatchObject({ valid: true });
  });
});
