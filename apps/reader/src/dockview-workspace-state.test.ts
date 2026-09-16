import { describe, expect, it } from "vitest";

import {
  initialDockSnapshot,
  parseDockState,
  projectDockLayout,
  serializeDockState,
} from "./dockview-workspace-state.js";
import { createWorkspaceTab } from "./source-workspace-layout.js";
import {
  workspaceSessionKey,
  retainedWorkspaceSessionKeys,
} from "./use-progressive-workspace-tabs.js";

import type { SourceId } from "@mdbase-reader/core";
import type { DockviewApi } from "dockview-react";

const source = "source-one" as SourceId;
const id = "reader:session:one";
const tab = { ...createWorkspaceTab(source), id };
const fixture = {
  version: 1,
  layout: {
    grid: {
      root: { type: "branch", data: [] },
      width: 1440,
      height: 900,
      orientation: "HORIZONTAL",
    },
    panels: {
      [id]: {
        id,
        contentComponent: "workspace",
        renderer: "always",
        params: { tab: { ...tab } },
      },
    },
  },
};
function state(): typeof fixture {
  return structuredClone(fixture);
}

describe("Dockview persistence boundary", () => {
  it("restores validated descriptors without restoring unsaved flags", () => {
    const value = state();
    value.layout.panels[id].params.tab = { ...tab, dirty: true };
    const result = parseDockState(JSON.stringify(value), new Set([source]));
    expect(result.panels[id]?.params?.["tab"]).toEqual({ ...tab, dirty: false });
    expect(result.panels[id]?.renderer).toBe("always");
  });
  it("marks deleted sources for removal without losing other panels", () => {
    expect(parseDockState(JSON.stringify(state()), new Set()).panels[id]?.params?.["missing"]).toBe(
      true,
    );
  });
  it("does not instantiate arbitrary components from local storage", () => {
    const value = state();
    value.layout.panels[id].contentComponent = "arbitrary-component";
    expect(
      parseDockState(JSON.stringify(value), new Set([source])).panels[id]?.contentComponent,
    ).toBe("workspace");
  });
  it("rejects unknown versions, broken identities, invalid views, and floating windows", () => {
    expect(() => parseDockState("not-json", new Set())).toThrow();
    expect(() => parseDockState(JSON.stringify({ ...state(), version: 99 }), new Set())).toThrow();
    const broken = state();
    broken.layout.panels[id].params.tab.id = "different-session";
    expect(() => parseDockState(JSON.stringify(broken), new Set([source]))).toThrow();
    const badView = JSON.parse(JSON.stringify(state()));
    badView.layout.panels[id].params.tab.view = "unknown";
    expect(() => parseDockState(JSON.stringify(badView), new Set([source]))).toThrow();
    const windows = state();
    expect(() =>
      parseDockState(
        JSON.stringify({ ...windows, layout: { ...windows.layout, floatingGroups: [{}] } }),
        new Set(),
      ),
    ).toThrow();
  });
  it("serializes metadata, never dirty flags or accidental editor contents", () => {
    const value = state();
    value.layout.panels[id].params = {
      tab: { ...tab, dirty: true },
      editorBody: "private draft",
    } as (typeof value.layout.panels)[typeof id]["params"];
    const api = { toJSON: () => structuredClone(value.layout) } as unknown as DockviewApi;
    const serialized = serializeDockState(api);
    expect(serialized).not.toContain("private draft");
    expect(JSON.parse(serialized).layout.panels[id].params.tab.dirty).toBe(false);
    expect(value.layout.panels[id].params.tab.dirty).toBe(true);
  });
});

it("projects arbitrary groups and preserves document context when source tools are active", () => {
  const sourcePanel = { id, params: { tab } };
  const inspector = { id: "reader:inspector", params: {} };
  const api = {
    groups: [{ id: "group-any", panels: [sourcePanel, inspector], activePanel: inspector }],
    panels: [sourcePanel, inspector],
  } as unknown as DockviewApi;
  const layout = projectDockLayout(api, id, initialDockSnapshot());
  expect(layout.focusedPaneId).toBe("group-any");
  expect(layout.panes[0]?.activeTabId).toBe(id);
  expect(layout.panes[0]?.tabs).toEqual([tab]);
});
it("uses a stable session identity across groups, including renderer residency", () => {
  expect(workspaceSessionKey("left", id)).toBe(workspaceSessionKey("right", id));
  const layout = {
    ...initialDockSnapshot(),
    panes: [{ id: "right", tabs: [tab], activeTabId: id, history: { entries: [], index: -1 } }],
    focusedPaneId: "right",
  };
  expect(retainedWorkspaceSessionKeys(layout, new Set([workspaceSessionKey("left", id)]))).toEqual(
    new Set([id]),
  );
});
