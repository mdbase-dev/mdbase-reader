// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { collectionId, recordRevision, sourceId } from "@mdbase-reader/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useDocumentSurfaceTiming } from "./reader-app-hooks.js";
import { useSelectedSourceResources } from "./use-selected-source-resources.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Source, SourceId } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

const source: Source = {
  collectionId: collectionId("test"),
  id: sourceId("requested"),
  path: "note.md",
  title: "Synthetic",
  creators: [],
  tags: [],
  documents: [],
  frontmatter: {},
  body: "",
  recordRevision: recordRevision("1"),
};
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  performance.clearMeasures("reader:startup:document-surface:ready");
});
afterEach(async () => {
  await act(async () => root.unmount());
  performance.clearMeasures("reader:startup:document-surface:ready");
  vi.unstubAllGlobals();
});
function SourceHarness({
  gateway,
  selected,
}: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly selected: SourceId;
}): null {
  useSelectedSourceResources(gateway, selected);
  return null;
}
function SurfaceHarness({ surface }: { readonly surface: ReadingSurface | null }): null {
  useDocumentSurfaceTiming("private-session-id", surface);
  return null;
}
function pendingSource(): {
  promise: Promise<Source | null>;
  resolve: (value: Source | null) => void;
} {
  let resolve!: (value: Source | null) => void;
  const promise = new Promise<Source | null>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
it("hydrates the requested source before starting its annotations", async () => {
  const pending = pendingSource();
  const annotations = vi.fn<ReaderWorkspaceGateway["annotations"]>(() => Promise.resolve([]));
  const gateway = {
    source: vi.fn(() => pending.promise),
    annotations,
  } as unknown as ReaderWorkspaceGateway;
  await act(async () => root.render(<SourceHarness gateway={gateway} selected={source.id} />));
  expect(gateway.source).toHaveBeenCalledOnce();
  expect(annotations).not.toHaveBeenCalled();
  await act(async () => pending.resolve(source));
  expect(annotations).toHaveBeenCalledExactlyOnceWith(source.id);
});
it("does not start annotations for an overtaken source", async () => {
  const pending = pendingSource();
  const nextId = sourceId("next");
  const annotations = vi.fn<ReaderWorkspaceGateway["annotations"]>(() => Promise.resolve([]));
  const gateway = {
    source: vi.fn<ReaderWorkspaceGateway["source"]>((id) =>
      id === source.id ? pending.promise : Promise.resolve({ ...source, id }),
    ),
    annotations,
  } as unknown as ReaderWorkspaceGateway;
  await act(async () => root.render(<SourceHarness gateway={gateway} selected={source.id} />));
  await act(async () => root.render(<SourceHarness gateway={gateway} selected={nextId} />));
  await act(async () => pending.resolve(source));
  expect(annotations).toHaveBeenCalledExactlyOnceWith(nextId);
});
it("records a payload-free document milestone only when the surface is available", async () => {
  const name = "reader:startup:document-surface:ready";
  await act(async () => root.render(<SurfaceHarness surface={null} />));
  expect(performance.getEntriesByName(name)).toHaveLength(0);
  await act(async () => root.render(<SurfaceHarness surface={{} as ReadingSurface} />));
  const entries = performance.getEntriesByName(name);
  expect(entries).toHaveLength(1);
  expect(entries[0]?.name).not.toContain("private-session-id");
  await act(async () => root.render(<SurfaceHarness surface={{} as ReadingSurface} />));
  expect(performance.getEntriesByName(name)).toHaveLength(1);
});
