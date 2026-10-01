import { describe, expect, it } from "vitest";

import { candidateLookup } from "./annotation-widgets.js";

import type { WikiLinkCandidate } from "./completions.js";

const candidate = (path: string): WikiLinkCandidate => ({ path, label: path, embed: true });

describe("annotation embed targets", () => {
  const lookup = candidateLookup([
    candidate("annotations/ann_01"),
    candidate("annotations/shared"),
    candidate("archive/shared"),
  ]);

  it("resolves a path with or without its extension", () => {
    expect(lookup("annotations/ann_01")?.path).toBe("annotations/ann_01");
    expect(lookup("annotations/ann_01.md")?.path).toBe("annotations/ann_01");
  });

  it("resolves a simple link by a filename only one annotation has", () => {
    expect(lookup("ann_01")?.path).toBe("annotations/ann_01");
    expect(lookup("ann_01.md")?.path).toBe("annotations/ann_01");
    expect(lookup("shared")).toBeUndefined();
  });

  it("does not resolve a path in another folder or an unknown name", () => {
    expect(lookup("elsewhere/ann_01")).toBeUndefined();
    expect(lookup("ann_02")).toBeUndefined();
  });
});
