import { describe, expect, it } from "vitest";

import { hueOf, initials, locationLabel, orderedChoices } from "./collection-menu-model.js";

describe("collection menu model", () => {
  it("lists the current collection first under its freshest name, then alphabetically", () => {
    expect(
      orderedChoices(
        [
          { collectionId: "c", displayName: "Zettelkasten" },
          { collectionId: "a", displayName: "Old name" },
          { collectionId: "b", displayName: "Archive" },
        ],
        "a",
        "Reading",
      ).map(({ displayName }) => displayName),
    ).toEqual(["Reading", "Archive", "Zettelkasten"]);
  });

  it("marks each collection with up to two initials and a stable hue", () => {
    expect(initials("Course reading")).toBe("CR");
    expect(initials("reading")).toBe("R");
    expect(initials("  ")).toBe("?");
    expect(hueOf("collection-1")).toBe(hueOf("collection-1"));
    expect(hueOf("collection-1")).toBeGreaterThanOrEqual(0);
    expect(hueOf("collection-1")).toBeLessThan(360);
  });

  it("says where a collection lives when Connect reports it", () => {
    expect(
      locationLabel({ collectionId: "a", displayName: "A", authority: { kind: "hosted" } }),
    ).toBe("Hosted by mdbase");
    expect(
      locationLabel({ collectionId: "a", displayName: "A", authority: { kind: "connector" } }),
    ).toBe("On your computer");
    expect(locationLabel({ collectionId: "a", displayName: "A" })).toBeNull();
  });
});
