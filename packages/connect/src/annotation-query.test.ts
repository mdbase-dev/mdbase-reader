import { sourceId } from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { annotationPathsForSource } from "./annotation-query.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { QueryInput } from "@mdbase-dev/connect";

it("narrows queries, but rejects prefix/alias collisions and follows source renames", async () => {
  let sourcePath = 'sources/A "quoted" title.md';
  let references = [
    '[[sources/A "quoted" title.md|Title]]',
    '[[sources/A "quoted" title|Title]]',
    "[[src_1|Title]]",
    "src_1",
    "[[src_10]]",
    "[[sources/unrelated|src_1]]",
    '[[sources/A "quoted" title extended]]',
  ];
  const queryPages = vi.fn(async function* (input: QueryInput) {
    expect(input.contract).toBeUndefined();
    expect(input.where).toBeTruthy();
    const results =
      input.where === 'id == "src_1"'
        ? [{ path: sourcePath, effectiveFrontmatter: { id: "src_1" } }]
        : references.map((source, i) => ({
            path: `annotations/${String(i)}.md`,
            effectiveFrontmatter: { source },
          }));
    yield await Promise.resolve({ ok: true, value: { results }, diagnostics: [] });
  });
  const client = { queryPages } as unknown as ReaderConnectClient;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  expect(await annotationPathsForSource(client, sourceId("src_1"), options)).toEqual([
    "annotations/0.md",
    "annotations/1.md",
    "annotations/2.md",
    "annotations/3.md",
  ]);
  expect(queryPages).toHaveBeenCalledTimes(2);
  expect(queryPages.mock.calls[1]?.[0].where).toContain(JSON.stringify('sources/A "quoted" title'));
  expect(queryPages).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining(options));
  sourcePath = "sources/Renamed.md";
  references = ["[[sources/Renamed|New title]]"];
  expect(await annotationPathsForSource(client, sourceId("src_1"), {})).toEqual([
    "annotations/0.md",
  ]);
  references = [];
  expect(await annotationPathsForSource(client, sourceId("src_1"), {})).toEqual([]);
});
