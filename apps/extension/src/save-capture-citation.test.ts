// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { fakeChrome } from "./testing/fake-chrome.js";
import { capture, fixture } from "./testing/save-capture-fixture.js";

import type { CitationPreview } from "./capture-citation.js";

beforeEach(() => vi.stubGlobal("chrome", fakeChrome().chrome));
afterEach(() => vi.unstubAllGlobals());

it("keeps the captured preview if navigation has replaced the panel's live preview", async () => {
  const citation: CitationPreview = {
    citation: { type: "webpage", title: "Original page" },
    origin: "page",
    provenance: {},
    outcomes: [],
  };
  const f = fixture();
  const result = await f.save(
    { highlight: false, title: "Original page", automaticTitle: "Original page" },
    capture,
    { citation, getCitation: () => null },
  );
  const source = await f.collection.sources.get(f.collection.collectionId, result.source.id);
  expect(source?.title).toBe("Original page");
  expect(source?.citation?.["title"]).toBe("Original page");
});

it("pins the latest preview and automatic title together immediately before import", async () => {
  const initial: CitationPreview = {
    citation: { type: "webpage", title: "Australia" },
    origin: "page",
    provenance: {},
    outcomes: [],
  };
  const upgraded: CitationPreview = {
    citation: {
      type: "entry-encyclopedia",
      title: "Upgraded title",
      author: [{ literal: "Remote author" }],
    },
    origin: "citoid",
    outcomes: [],
    provenance: {
      title: { value: "Upgraded title", source: "site-adapter:citoid/encyclopediaArticle" },
    },
  };
  let latest = initial;
  let resume!: () => void;
  const f = fixture();
  const barrier = new Promise<undefined>((resolve) => {
    resume = () => resolve(undefined);
  });
  const journal = vi.spyOn(f.storage, "set").mockImplementationOnce(() => barrier);
  const pending = f.save(
    { highlight: false, title: "Australia", automaticTitle: "Australia" },
    capture,
    { citation: initial, getCitation: () => latest },
  );
  await vi.waitFor(() => expect(journal).toHaveBeenCalledOnce());
  latest = upgraded;
  resume();
  const result = await pending;
  const source = await f.collection.sources.get(f.collection.collectionId, result.source.id);
  expect(source?.title).toBe("Upgraded title");
  expect(source?.citation?.["title"]).toBe("Upgraded title");
  expect(source?.cslProvenance?.["title"]).toEqual(upgraded.provenance["title"]);
});
