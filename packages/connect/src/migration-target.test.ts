import { expect, it, vi } from "vitest";

import { ConnectMigrationTarget } from "./migration-target.js";

import type { MdbaseConnection } from "@mdbase-dev/connect";
it("joins native provenance by paths discovered through semantic contracts", async () => {
  const queryPages = vi.fn().mockImplementation(async function* (input: {
    contract?: { id: string };
  }) {
    const source = {
      path: "sources/example.md",
      frontmatter: { id: "src_fixture", title: "Test source" },
      effectiveFrontmatter: { id: "src_fixture", title: "Test source", documents: [] },
    };
    const results = input.contract
      ? input.contract.id.includes("annotation")
        ? []
        : [source]
      : [
          {
            path: "sources/example.md",
            frontmatter: {
              id: "src_fixture",
              import: { namespace: "zotero:fixture", key: "SOURCE" },
            },
          },
          { path: "unrelated.md", frontmatter: { id: "not-a-reader-record" } },
        ];
    yield await Promise.resolve({ ok: true, value: { results }, diagnostics: [] });
  });
  const target = new ConnectMigrationTarget({
    collectionId: "test",
    queryPages,
  } as unknown as MdbaseConnection);
  const records = await target.existing(new AbortController().signal);
  expect(records.size).toBe(1);
  expect(records.get("src_fixture")).toMatchObject({
    title: "Test source",
    documents: [],
    import: { namespace: "zotero:fixture", key: "SOURCE" },
  });
  expect(queryPages).toHaveBeenCalledTimes(3);
});
