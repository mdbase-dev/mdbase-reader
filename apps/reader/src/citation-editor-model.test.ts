import { collectionId, recordRevision, sourceId, type Source } from "@mdbase-reader/core";
import { describe, expect, it } from "vitest";

import {
  assessCitationDraft,
  citationDraftForSource,
  storedCitationDraftForSource,
} from "./citation-editor-model.js";

const source: Source = {
  collectionId: collectionId("reading"),
  id: sourceId("src_one"),
  path: "sources/one.md",
  title: "Crime and Punishment",
  creators: ["Fyodor Dostoevsky"],
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
    expect(storedCitationDraftForSource(source)).toBeNull();
    expect(JSON.parse(citationDraftForSource(source))).toEqual({
      id: "dostoevskycrime2002",
      type: "book",
      title: "Crime and Punishment",
      author: [{ literal: "Fyodor Dostoevsky" }],
      issued: { "date-parts": [[2002]] },
    });
  });

  it("preserves invalid embedded metadata so the user can repair it", () => {
    const invalid = { title: "Untyped" };
    const stored = { ...source, frontmatter: { csl: invalid } };
    expect(JSON.parse(citationDraftForSource(stored))).toEqual(invalid);
    expect(JSON.parse(storedCitationDraftForSource(stored) ?? "null")).toEqual(invalid);
  });

  it("reports JSON and CSL validation problems before save", () => {
    expect(assessCitationDraft("{")).toMatchObject({ valid: false });
    expect(assessCitationDraft('{"id":"dostoevsky"}')).toMatchObject({
      valid: false,
      message: expect.stringContaining("type"),
      value: { id: "dostoevsky" },
    });
    expect(assessCitationDraft('{"id":"dostoevsky","type":"book"}')).toMatchObject({ valid: true });
  });
});
