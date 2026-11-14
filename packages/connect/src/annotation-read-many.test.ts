import { mdbaseError } from "@mdbase-dev/sdk";
import { describe, expect, it, vi } from "vitest";

import { annotationRecordsAt } from "./annotation-query.js";
import { mockSdk, testRecord } from "./records.fixtures.js";

import type { RecordRef } from "@mdbase-dev/sdk";

const pathOf = (ref: RecordRef): string => (typeof ref === "string" ? ref : ref.path);
describe("annotation body hydration through the SDK", () => {
  it("uses exact path selectors, retains native revisions, omits deleted records and bounds reads", async () => {
    const paths = Array.from({ length: 25 }, (_, index) => `annotations/${String(index)}.md`);
    paths[0] = 'annotations/A "quoted" \\ 雪.md';
    let active = 0;
    let maximum = 0;
    const find = vi.fn(async (ref: RecordRef) => {
      const path = pathOf(ref);
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return path === paths[1]
        ? null
        : testRecord({
            path,
            types: ["reader-annotation"],
            revision: `revision:${path}`,
            frontmatter: { id: path, source: "src_1" },
            body: "Note",
          });
    });
    const signal = new AbortController().signal;
    const listed = await annotationRecordsAt(mockSdk({ find }), [...paths, paths[0]], { signal });
    expect(find).toHaveBeenCalledTimes(paths.length);
    expect(maximum).toBe(4);
    expect(find).toHaveBeenCalledWith(
      { path: paths[0] },
      { include: { effective: true, body: true, document: true }, signal },
    );
    expect([...listed.keys()]).toEqual(paths.filter((path) => path !== paths[1]));
    expect(listed.get(paths[0])).toMatchObject({ body: "Note", revision: `revision:${paths[0]}` });
  });
  it("does no I/O for an empty selection", async () => {
    const find = vi.fn();
    expect(await annotationRecordsAt(mockSdk({ find }), [], {})).toEqual(new Map());
    expect(find).not.toHaveBeenCalled();
  });
  it("rejects a failed read instead of treating it as a missing annotation", async () => {
    const failure = mdbaseError("unavailable", "Read failed");
    const find = vi.fn().mockRejectedValue(failure);
    await expect(annotationRecordsAt(mockSdk({ find }), ["a.md", "b.md"], {})).rejects.toBe(
      failure,
    );
  });
  it("preserves cancellation and its exact SDK error", async () => {
    const failure = mdbaseError("cancelled", "Cancelled");
    await expect(
      annotationRecordsAt(mockSdk({ find: vi.fn().mockRejectedValue(failure) }), ["a.md"], {}),
    ).rejects.toBe(failure);
  });
});
