import { sourceId } from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { annotationPathsForSource } from "./annotation-query.js";
import { mockSdk, testQuery, testRecord } from "./records.fixtures.js";

import type { Query } from "@mdbase-dev/sdk";

const legacyAuthorityFeatures = {
  supportsAuthorityFeature: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: false, diagnostics: [] }),
  ),
};

it("asks mdbase which links reach the source, keeps legacy IDs, and follows renames", async () => {
  let sourcePath = 'sources/A "quoted" title.md';
  // How mdbase resolves each link: a record path, or null when it reaches no record.
  let links: Record<string, string | null> = {
    '[[sources/A "quoted" title.md|Title]]': sourcePath,
    '[[A "quoted" title]]': sourcePath,
    src_1: null,
    "[[src_1|Title]]": null,
    "[[src_10]]": null,
    "[[sources/unrelated|src_1]]": "sources/unrelated.md",
  };
  const pages = vi.fn(async function* (input: Query) {
    expect(input["contract"]).toBeUndefined();
    const where = input.where ?? "";
    const quoted = (pattern: RegExp): string | undefined => {
      const value = pattern.exec(where)?.[1];
      return value === undefined ? undefined : (JSON.parse(value) as string);
    };
    const exactPath = quoted(/^file\.path == ("[^"]*")$/u);
    const id = quoted(/^id == ("[^"]*")$/u);
    const target = quoted(/source\.asFile\(\)\.file\.path == ("(?:[^"\\]|\\.)*")$/u);
    const contained = quoted(/source\.contains\(("[^"]*")\)$/u);
    const annotations = Object.keys(links)
      .map((source, index) =>
        testRecord({
          path: `annotations/${String(index)}.md`,
          effective: { id: `ann_${String(index)}`, source },

          types: ["reader-annotation"],
          ...(input["projections"]
            ? {
                values: {
                  reader_source_id:
                    links[source] === sourcePath ? "src_1" : links[source] ? "other" : null,
                },
              }
            : {}),
        }),
      )
      .filter((record) => {
        const reference = (record.effective ?? record.frontmatter)["source"] as string;
        return exactPath !== undefined
          ? record.path === exactPath
          : target !== undefined
            ? links[reference] === target
            : contained !== undefined
              ? links[reference] === null && reference.includes(contained)
              : !where;
      });
    const records =
      id === undefined
        ? annotations
        : [testRecord({ path: sourcePath, effective: { id }, types: [] })];
    yield await Promise.resolve(testQuery({ records }));
  });
  const client = mockSdk({
    ...legacyAuthorityFeatures,
    pages,
  });
  const controller = new AbortController();
  const options = { signal: controller.signal };
  expect(await annotationPathsForSource(client, sourceId("src_1"), options)).toEqual([
    "annotations/0.md",
    "annotations/1.md",
    "annotations/2.md",
    "annotations/3.md",
  ]);
  expect(pages).toHaveBeenCalledTimes(3);
  expect(pages.mock.calls[0]?.[0]).toMatchObject({
    where: 'id == "src_1"',
  });
  expect(
    pages.mock.calls
      .slice(1)
      .every(([input]) => !input["projections"] && input.where?.includes(".asFile()")),
  ).toBe(true);
  expect(pages).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining(options));

  sourcePath = "sources/Renamed.md";
  links = { "[[sources/Renamed|New title]]": sourcePath };
  expect(await annotationPathsForSource(client, sourceId("src_1"), {})).toEqual([
    "annotations/0.md",
  ]);
  links = {};
  expect(await annotationPathsForSource(client, sourceId("src_1"), {})).toEqual([]);
});
