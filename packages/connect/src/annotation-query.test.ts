import { sourceId } from "@mdbase-reader/core";
import { expect, it, vi } from "vitest";

import { sourceAnnotations } from "./annotation-query.js";
import { linkIndex, mockSdk, testQuery, testRecord } from "./records.fixtures.js";

import type { Query, RecordView } from "@mdbase-dev/sdk";

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
  const annotations = (): RecordView[] =>
    Object.keys(links).map((source, index) =>
      testRecord({
        path: `annotations/${String(index)}.md`,
        effective: { id: `ann_${String(index)}`, source },
        types: ["reader-annotation"],
      }),
    );
  const pages = vi.fn(async function* (input: Query) {
    const where = input.where ?? "";
    const quoted = (pattern: RegExp): string | undefined => {
      const value = pattern.exec(where)?.[1];
      return value === undefined ? undefined : (JSON.parse(value) as string);
    };
    const id = quoted(/^id == ("[^"]*")$/u);
    const contained = quoted(
      /^has\(record\.source\) && source != null && source\.contains\(("[^"]*")\)$/u,
    );
    if (id === undefined && contained === undefined) {
      throw new Error(`Unexpected query: ${JSON.stringify(input)}`);
    }
    const records =
      id === undefined
        ? annotations().filter((record) =>
            (record.frontmatter["source"] as string).includes(contained!),
          )
        : [testRecord({ path: sourcePath, effective: { id }, types: [] })];
    yield await Promise.resolve(testQuery({ records }));
  });
  const index = linkIndex(annotations, (link) => links[link] ?? null);
  const client = mockSdk({ ...index, pages });
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const paths = async (signal = {}): Promise<string[]> =>
    [...(await sourceAnnotations(client, sourceId("src_1"), signal)).keys()].sort((a, b) =>
      a.localeCompare(b),
    );

  expect(await paths(options)).toEqual([
    "annotations/0.md",
    "annotations/1.md",
    "annotations/2.md",
    "annotations/3.md",
  ]);
  expect(pages).toHaveBeenCalledTimes(2);
  expect(pages.mock.calls[0]?.[0]).toMatchObject({ where: 'id == "src_1"' });
  expect(index.backlinks).toHaveBeenCalledWith(
    { path: sourcePath },
    expect.objectContaining(options),
  );
  expect(pages).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining(options));

  sourcePath = "sources/Renamed.md";
  links = { "[[sources/Renamed|New title]]": sourcePath };
  expect(await paths()).toEqual(["annotations/0.md"]);
  links = {};
  expect(await paths()).toEqual([]);
});
