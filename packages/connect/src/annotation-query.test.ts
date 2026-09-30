import { sourceId } from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { annotationPathsForSource } from "./annotation-query.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type { QueryInput } from "@mdbase-dev/connect";

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
    const id = quoted(/^id == ("[^"]*")$/u);
    const target = quoted(/source\.asFile\(\)\.file\.path == ("(?:[^"\\]|\\.)*")$/u);
    const unresolved = quoted(/source\.asFile\(\) == null && source\.contains\(("[^"]*")\)$/u);
    const references = Object.keys(links);
    const results =
      id !== undefined
        ? [{ path: sourcePath, effectiveFrontmatter: { id: "src_1" } }]
        : references
            .map((source, i) => ({
              path: `annotations/${String(i)}.md`,
              effectiveFrontmatter: { source },
            }))
            .filter(({ effectiveFrontmatter: { source } }) =>
              target !== undefined
                ? links[source] === target
                : links[source] === null && source.includes(unresolved!),
            );
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
  expect(queryPages).toHaveBeenCalledTimes(3);
  expect(queryPages.mock.calls.map(([input]) => input.where)).toContain(
    `source != null && source.asFile() != null && source.asFile().file.path == ${JSON.stringify(sourcePath)}`,
  );
  expect(queryPages).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining(options));

  sourcePath = "sources/Renamed.md";
  links = { "[[sources/Renamed|New title]]": sourcePath };
  expect(await annotationPathsForSource(client, sourceId("src_1"), {})).toEqual([
    "annotations/0.md",
  ]);
  links = {};
  expect(await annotationPathsForSource(client, sourceId("src_1"), {})).toEqual([]);
});
