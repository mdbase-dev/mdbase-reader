import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
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
it("preserves extension data independently of translated validation prose", () => {
  const descriptor = msg({
    message: "is not a CSL 1.0 field; preserve extension data under csl.custom",
    context: "CSL validation",
  });
  i18n.load("fr", { [descriptor.id]: "Champ personnalisé à conserver." });
  i18n.activate("fr");
  try {
    expect(normalizeZoteroCsl({ id: "key", type: "book", license: "CC-BY" })).toEqual({
      id: "key",
      type: "book",
      custom: { mdbase_zotero_extensions: { license: "CC-BY" } },
    });
  } finally {
    i18n.activate("en");
  }
});
it("does not disguise invalid standard CSL fields as extension data", () => {
  expect(normalizeZoteroCsl({ id: "key", type: "invented-type", title: "Fixture" })).toBeNull();
});
