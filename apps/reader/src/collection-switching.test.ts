import { collectionId, sourceId } from "@mdbase-reader/core";
import { afterEach, expect, it, vi } from "vitest";

import { collectionSwitchUrl, confirmCollectionSwitch } from "./collection-switching.js";
import { createSourceWorkspaceLayout } from "./source-workspace-layout.js";
import { trackAnnotationEdits } from "./unsaved-annotation-edits.js";

const source = { id: sourceId("source"), collectionId: collectionId("collection") };
const owner = {};
afterEach(() =>
  trackAnnotationEdits(owner, { collectionId: source.collectionId, sourceId: source.id }, false),
);
it("removes only the old source deep link", () => {
  expect(
    collectionSwitchUrl("https://reader.example/?collection=old&source=old-source&other=keep"),
  ).toBe("https://reader.example/?collection=old&other=keep");
});
it("switches a clean workspace without prompting", () => {
  const confirm = vi.fn(() => false);
  expect(confirmCollectionSwitch(createSourceWorkspaceLayout(source.id), [source], confirm)).toBe(
    true,
  );
  expect(confirm).not.toHaveBeenCalled();
});
it("requires confirmation for dirty tabs and respects cancellation", () => {
  const initial = createSourceWorkspaceLayout(source.id);
  const layout = {
    ...initial,
    panes: initial.panes.map((pane) => ({
      ...pane,
      tabs: pane.tabs.map((tab) => ({ ...tab, dirty: true })),
    })),
  };
  expect(confirmCollectionSwitch(layout, [source], () => false)).toBe(false);
  expect(confirmCollectionSwitch(layout, [source], () => true)).toBe(true);
});
it("protects annotation edits even before tab dirty state has updated", () => {
  trackAnnotationEdits(owner, { collectionId: source.collectionId, sourceId: source.id }, true);
  expect(confirmCollectionSwitch(createSourceWorkspaceLayout(null), [source], () => false)).toBe(
    false,
  );
});
