// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { partSource } from "./source-parts.fixtures.js";
import { createRoot } from "./testing/i18n.js";
import { useLibraryWrites } from "./use-library-writes.js";

import type { BulkStatusProgress } from "./LibraryBulkBar.js";
import type { LibraryWrites } from "./use-library-writes.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceSummary } from "@mdbase-reader/core";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

function setup(failedId?: string): {
  writes: LibraryWrites;
  save: ReturnType<typeof vi.fn>;
  changed: ReturnType<typeof vi.fn>;
} {
  const save = vi.fn((id: string) =>
    id === failedId ? Promise.reject(new Error("Write refused")) : Promise.resolve(partSource(id)),
  );
  const changed = vi.fn();
  let writes!: LibraryWrites;
  function Harness(): null {
    writes = useLibraryWrites(
      { saveSourceFields: save } as unknown as ReaderWorkspaceGateway,
      changed,
      () => "scalar",
    );
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
  return { writes, save, changed };
}
const source = (id: string, volume?: unknown): SourceSummary => ({
  ...partSource(id),
  properties: { csl: { volume } },
});

it("counts only changed sources, preserving typed values and partial failures", async () => {
  const sources = [source("same", 3), source("different", 2), source("failed", 1)];
  const { writes, save, changed } = setup("failed");
  const reports: BulkStatusProgress[] = [];
  await writes.setFields!(sources, "csl.volume", "3", (value) => reports.push(value));
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenCalledWith("different", { "csl.volume": 3 });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(reports.at(-1)).toEqual({ done: 3, total: 3, failed: 1, changed: 1 });
});

it("clears present values with null and skips already absent fields", async () => {
  const sources = [source("present", 3), source("missing"), source("null", null)];
  const { writes, save } = setup();
  const progress = vi.fn();
  await writes.setFields!(sources, "csl.volume", "", progress);
  expect(save).toHaveBeenCalledExactlyOnceWith("present", { "csl.volume": null });
  expect(progress).toHaveBeenLastCalledWith({ done: 3, total: 3, failed: 0, changed: 1 });
});

it("counts zero changes when no source needs updating", async () => {
  const sources = [source("a", 3), source("b", 3)];
  const { writes, save } = setup();
  const progress = vi.fn();
  await writes.setFields!(sources, "csl.volume", "3", progress);
  expect(save).not.toHaveBeenCalled();
  expect(progress).toHaveBeenLastCalledWith({ done: 2, total: 2, failed: 0, changed: 0 });
});
