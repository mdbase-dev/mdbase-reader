import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  acceptTag,
  loadKnownTags,
  rankTags,
  rememberTags,
  tagSuggestions,
} from "./tag-suggestions.js";
import { fakeChrome } from "./testing/fake-chrome.js";

import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { Annotation } from "@mdbase-reader/core";

beforeEach(() => {
  vi.stubGlobal("chrome", fakeChrome().chrome);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("ranks tags by use and keeps the first spelling of case variants", () => {
  expect(rankTags([["ML", "reading"], ["ml"], ["ml", "other"]])).toEqual([
    "ML",
    "reading",
    "other",
  ]);
});
it("suggests known tags for the tag being typed, ignoring ones already entered", () => {
  const known = ["machine-learning", "ML", "maths", "deep-learning"];
  expect(tagSuggestions("ma", known)).toEqual(["machine-learning", "maths"]);
  expect(tagSuggestions("maths, m", known)).toEqual(["machine-learning", "ML"]);
  expect(tagSuggestions("learn", known)).toEqual(["machine-learning", "deep-learning"]);
  expect(tagSuggestions("ml", known)).toEqual(["ML"]);
  expect(tagSuggestions("ML", known)).toEqual([]);
  expect(tagSuggestions("maths, ", known)).toEqual([]);
});
it("replaces the partial tag with the chosen one", () => {
  expect(acceptTag("maths,  mach", "machine-learning")).toBe("maths, machine-learning, ");
  expect(acceptTag("ml", "ML")).toBe("ML, ");
});
it("combines remembered, highlight and sampled source tags, most used first", async () => {
  await rememberTags("c1", ["reading"]);
  await rememberTags("c1", ["Reading", "to-review"]);
  const collection = {
    collectionId: "c1",
    sources: {
      list: vi.fn(() =>
        Promise.resolve({ items: [{ tags: ["papers", "to-review"] }, { tags: ["papers"] }] }),
      ),
    },
  } as unknown as ReaderConnectedCollection;
  const annotations = [{ tags: ["quote"] }] as unknown as Annotation[];
  expect(await loadKnownTags(collection, annotations)).toEqual([
    "to-review",
    "Reading",
    "papers",
    "quote",
  ]);
});
