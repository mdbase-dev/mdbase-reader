import { describe, expect, it } from "vitest";

import { DomainError } from "./errors.js";
import { sourceLink } from "./source.js";

describe("sourceLink", () => {
  it("links by path with the title as alias", () => {
    expect(sourceLink({ path: "sources/weil.md", title: "Gravity and Grace" })).toBe(
      "[[sources/weil|Gravity and Grace]]",
    );
  });

  it("strips characters that would end the alias or the link", () => {
    expect(sourceLink({ path: "sources/a.md", title: " A | [[B]]\n C " })).toBe(
      "[[sources/a|A B C]]",
    );
  });

  it("omits an empty alias", () => {
    expect(sourceLink({ path: "sources/a.md", title: "[]|" })).toBe("[[sources/a]]");
  });

  it("rejects a path that can terminate the wikilink", () => {
    expect(() => sourceLink({ path: "sources/a]]b.md", title: "A" })).toThrow(DomainError);
  });
});
