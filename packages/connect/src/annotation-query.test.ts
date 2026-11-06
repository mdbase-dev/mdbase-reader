import { sourceId } from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { annotationPathsForSource } from "./annotation-query.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { QueryInput } from "@mdbase-dev/connect";

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
  const queryPages = vi.fn(async function* (input: QueryInput) {
    expect(input.contract).toBeUndefined();
    const where = input.where ?? "";
    const quoted = (pattern: RegExp): string | undefined => {
      const value = pattern.exec(where)?.[1];
      return value === undefined ? undefined : (JSON.parse(value) as string);
    };
    const exactPath = quoted(/^file\.path == ("[^"]*")$/u);
    const id = quoted(/^id == ("[^"]*")$/u);
    const target = quoted(/record\["source"\]\.asFile\(\)\.file\.path == ("(?:[^"\\]|\\.)*")$/u);
    const contained = quoted(/source\.contains\(("[^"]*")\)$/u);
    const annotations = Object.keys(links)
      .map((source, index) => ({
        path: `annotations/${String(index)}.md`,
        effectiveFrontmatter: { id: `ann_${String(index)}`, source },
        file: {},
        types: ["reader-annotation"],
        ...(input.projections
          ? {
              values: {
                reader_source_id:
                  links[source] === sourcePath ? "src_1" : links[source] ? "other" : null,
              },
            }
          : {}),
      }))
      .filter((record) => {
        const reference = record.effectiveFrontmatter.source;
        return exactPath !== undefined
          ? record.path === exactPath
          : target !== undefined
            ? links[reference] === target
            : contained !== undefined
              ? links[reference] === null && reference.includes(contained)
              : !where;
      });
    const results =
      id === undefined
        ? annotations
        : [{ path: sourcePath, effectiveFrontmatter: { id }, file: {}, types: [] }];
    yield await Promise.resolve({ ok: true, value: { results }, diagnostics: [] });
  });
  const client = {
    ...legacyAuthorityFeatures,
    queryPages,
  } as unknown as ReaderConnectClient;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  expect(await annotationPathsForSource(client, sourceId("src_1"), options)).toEqual([
    "annotations/0.md",
    "annotations/1.md",
    "annotations/2.md",
    "annotations/3.md",
  ]);
  expect(queryPages).toHaveBeenCalledTimes(3);
  expect(queryPages.mock.calls[0]?.[0]).toEqual({
    where: 'id == "src_1"',
    frontmatterMode: "effective",
  });
  expect(
    queryPages.mock.calls
      .slice(1)
      .every(([input]) => !input.projections && input.where?.includes(".asFile()")),
  ).toBe(true);
  expect(queryPages).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining(options));

  sourcePath = "sources/Renamed.md";
  links = { "[[sources/Renamed|New title]]": sourcePath };
  expect(await annotationPathsForSource(client, sourceId("src_1"), {})).toEqual([
    "annotations/0.md",
  ]);
  links = {};
  expect(await annotationPathsForSource(client, sourceId("src_1"), {})).toEqual([]);
});
