import { describe, expect, it } from "vitest";

import { citationGroups } from "./citation-widgets.js";

describe("citationGroups", () => {
  it("finds a simple citation and its source range", () => {
    expect(citationGroups("See [@dostoevsky1914].")).toEqual([
      {
        from: 4,
        to: 21,
        raw: "[@dostoevsky1914]",
        references: [{ id: "dostoevsky1914", from: 5, to: 20 }],
      },
    ]);
  });

  it("keeps multiple citations and locators in one group", () => {
    expect(citationGroups("Compare [see @dostoevsky1914, p. 42; @tufte2001].")[0]).toMatchObject({
      raw: "[see @dostoevsky1914, p. 42; @tufte2001]",
      references: [{ id: "dostoevsky1914" }, { id: "tufte2001" }],
    });
  });

  it("ignores email addresses and wiki links", () => {
    expect(citationGroups("[reader@example.com] [[people/@dostoevsky1914]]")).toEqual([]);
  });
});
