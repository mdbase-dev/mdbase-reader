import { expect, it } from "vitest";

import { DockviewNavigation } from "./dockview-navigation.js";
import { createWorkspaceTab } from "./source-workspace-layout.js";

import type { SourceId } from "@mdbase-reader/core";

const a = "a" as SourceId;
const b = "b" as SourceId;
it("persists recent sources, navigation and clean closed-session descriptors", () => {
  const navigation = new DockviewNavigation();
  const first = { ...createWorkspaceTab(a), id: "reader:session:a" };
  const second = { ...createWorkspaceTab(b), id: "reader:session:b", dirty: true };
  navigation.visit(first);
  navigation.visit(second);
  navigation.close(second);
  const restored = new DockviewNavigation();
  restored.restore(JSON.parse(JSON.stringify(navigation.toJSON())), new Set([a, b]));
  expect(restored.recentSourceIds).toEqual([b, a]);
  expect(restored.reopen()).toEqual({ ...second, dirty: false });
  const visited: string[] = [];
  restored.navigate(-1, (location) => {
    if (location.kind === "source") {
      visited.push(location.sourceId);
    }
    restored.visit(first);
  });
  restored.navigate(1, (location) => {
    if (location.kind === "source") {
      visited.push(location.sourceId);
    }
  });
  expect(visited).toEqual([a, b]);
});
it("validates history and drops removed-source or corrupt closed tabs", () => {
  const navigation = new DockviewNavigation();
  navigation.restore(
    {
      entries: [{ kind: "source", sourceId: "gone", view: "document" }],
      index: 100,
      recentSourceIds: ["gone", a],
      closed: [{ id: "corrupt" }],
    },
    new Set([a]),
  );
  expect(navigation.toJSON()).toEqual({ entries: [], index: -1, recentSourceIds: [a], closed: [] });
});
