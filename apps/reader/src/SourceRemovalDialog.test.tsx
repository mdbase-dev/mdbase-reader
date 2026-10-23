// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import {
  collectionId,
  recordRevision,
  sourceId,
  type SourceDeletionPlan,
  type SourceId,
  type SourceSummary,
} from "@mdbase-reader/core";
import { act, type JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SourceRemovalDialog } from "./SourceRemovalDialog.js";
import { createRoot } from "./testing/i18n.js";
import { useSourceRemoval, type SourceRemovalController } from "./use-source-removal.js";

const source: SourceSummary = {
  collectionId: collectionId("c"),
  id: sourceId("src_1"),
  path: "sources/mistake.md",
  title: "Imported by mistake",
  creators: [],
  tags: [],
  documents: [],
};
const plan: SourceDeletionPlan = {
  sourceId: source.id,
  path: source.path,
  expectedRevision: recordRevision("rev-1"),
  brokenLinkPaths: ["annotations/a1.md"],
};

describe("removing a source", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let removal: SourceRemovalController;
  const planRemoval = vi.fn<(id: SourceId) => Promise<SourceDeletionPlan>>();
  const remove = vi.fn<(plan: SourceDeletionPlan) => Promise<void>>();
  const onRemoved = vi.fn<(id: SourceId) => void>();

  function Harness(): JSX.Element {
    removal = useSourceRemoval({ planSourceRemoval: planRemoval, removeSource: remove }, onRemoved);
    return <SourceRemovalDialog removal={removal} />;
  }
  const button = (name: string): HTMLButtonElement | undefined =>
    [...host.querySelectorAll("button")].find((item) => item.textContent === name);

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    planRemoval.mockReset().mockResolvedValue(plan);
    remove.mockReset().mockResolvedValue(undefined);
    onRemoved.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("deletes nothing until the checked removal is confirmed, and nothing on cancel", async () => {
    await act(async () => removal.request?.(source));
    expect(host.textContent).toContain("Remove “Imported by mistake”?");
    expect(host.textContent).toContain("deletes its source note");
    expect(host.textContent).toContain("annotation notes are kept in the collection");
    expect(host.textContent).toContain("Links to this source will stop working");
    expect(host.textContent).not.toContain(source.path);
    expect(host.textContent).toContain("annotations/a1.md");
    expect(document.activeElement).toBe(button("Cancel"));

    await act(async () => button("Cancel")?.click());
    expect(host.querySelector("[role=alertdialog]")).toBeNull();
    expect(remove).not.toHaveBeenCalled();

    await act(async () => removal.request?.(source));
    await act(async () => button("Remove source")?.click());
    expect(remove).toHaveBeenCalledExactlyOnceWith(plan);
    expect(onRemoved).toHaveBeenCalledExactlyOnceWith(source.id);
    expect(host.querySelector("[role=alertdialog]")).toBeNull();
  });
});
