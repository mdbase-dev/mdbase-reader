import { describe, expect, it } from "vitest";

import { citationGroups } from "./citation-widgets.js";

describe("citationGroups", () => {
  it("finds a simple citation and its source range", () => {
    expect(citationGroups("See [@weil1952].")).toEqual([
      {
        from: 4,
        to: 15,
        raw: "[@weil1952]",
        references: [{ id: "weil1952", from: 5, to: 14 }],
      },
    ]);
  });

  it("keeps multiple citations and locators in one group", () => {
    expect(citationGroups("Compare [see @weil1952, p. 42; @tufte2001].")[0]).toMatchObject({
      raw: "[see @weil1952, p. 42; @tufte2001]",
      references: [{ id: "weil1952" }, { id: "tufte2001" }],
    });
  });

  it("ignores email addresses and wiki links", () => {
    expect(citationGroups("[reader@example.com] [[people/@weil1952]]")).toEqual([]);
  });
});
