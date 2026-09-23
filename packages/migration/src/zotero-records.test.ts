import { expect, it } from "vitest";

import { normalizeZoteroCsl } from "./zotero-records.js";
it("keeps complete valid CSL while retaining Zotero extensions under custom", () => {
  const csl = {
    id: "key",
    type: "book",
    title: "Fixture",
    license: "CC-BY",
    custom: { existing: true },
  };
  expect(normalizeZoteroCsl(csl)).toEqual({
    id: "key",
    type: "book",
    title: "Fixture",
    custom: { existing: true, mdbase_zotero_extensions: { license: "CC-BY" } },
  });
  expect(csl.license).toBe("CC-BY");
});
it("does not disguise invalid standard CSL fields as extension data", () => {
  expect(normalizeZoteroCsl({ id: "key", type: "invented-type", title: "Fixture" })).toBeNull();
});
