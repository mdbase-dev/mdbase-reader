import { expect, it } from "vitest";

import { importHref, importService } from "./import-navigation.js";
it("keeps the selected collection and environment while opening a service", () => {
  expect(
    importHref(
      "zotero",
      "https://reader.example/?collection=selected&server=https%3A%2F%2Fconnect-lab.mdbase.dev&preview=1",
      "/",
    ),
  ).toBe("/import/zotero?collection=selected&server=https%3A%2F%2Fconnect-lab.mdbase.dev");
});
it("supports deep links and base paths without confusing the reading route", () => {
  expect(importService("/import", "/")).toBe("home");
  expect(importService("/import/readwise/", "/")).toBe("readwise");
  expect(importService("/reader/import/zotero", "/reader/")).toBe("zotero");
  expect(importService("/", "/")).toBeNull();
  expect(importService("/import/unknown", "/")).toBeNull();
});
