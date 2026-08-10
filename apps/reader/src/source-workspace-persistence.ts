import {
  createPane,
  createSourceWorkspaceLayout,
  createWorkspaceTab,
  workspaceViews,
} from "./source-workspace-layout.js";

import type {
  ClosedWorkspaceTab,
  SourceWorkspaceLayout,
  SourceWorkspacePane,
  WorkspaceHistory,
  WorkspaceLocation,
  WorkspacePaneId,
  WorkspaceSplitDirection,
  WorkspaceTab,
  WorkspaceView,
} from "./source-workspace-layout.js";
import type { SourceId } from "@mdbase-reader/core";

const workspaceStoragePrefix = "mdbase-reader:workspace:v2:";

export interface WorkspaceStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export function workspaceStorageKey(collectionKey: string): string {
  return `${workspaceStoragePrefix}${collectionKey}`;
}

export function restoreSourceWorkspace(
  storage: WorkspaceStorage | null,
  collectionKey: string,
  knownSourceIds: ReadonlySet<SourceId>,
  fallbackSourceId: SourceId | null,
): SourceWorkspaceLayout {
  if (!storage) {
    return createSourceWorkspaceLayout(fallbackSourceId);
  }
  try {
    const serialized = storage.getItem(workspaceStorageKey(collectionKey));
    return serialized
      ? parseSourceWorkspace(JSON.parse(serialized) as unknown, knownSourceIds, fallbackSourceId)
      : createSourceWorkspaceLayout(fallbackSourceId);
  } catch {
    return createSourceWorkspaceLayout(fallbackSourceId);
  }
}

export function persistSourceWorkspace(
  storage: WorkspaceStorage | null,
  collectionKey: string,
  layout: SourceWorkspaceLayout,
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(workspaceStorageKey(collectionKey), JSON.stringify(cleanLayout(layout)));
  } catch {
    // Storage can be unavailable in private browsing or a constrained webview.
  }
}

export function parseSourceWorkspace(
  value: unknown,
  knownSourceIds: ReadonlySet<SourceId>,
  fallbackSourceId: SourceId | null,
): SourceWorkspaceLayout {
  if (!isRecord(value) || value["version"] !== 2 || !Array.isArray(value["panes"])) {
    return createSourceWorkspaceLayout(fallbackSourceId);
  }
  const panes = value["panes"]
    .flatMap((candidate) => parsePane(candidate, knownSourceIds))
    .filter((pane, index, all) => all.findIndex(({ id }) => id === pane.id) === index)
    .slice(0, 2);
  if (!panes.some(({ id }) => id === "primary")) {
    panes.unshift(createPane("primary"));
  }
  const normalizedPanes = panes.length > 1 ? panes : [panes[0] ?? createPane("primary")];
  const focusedPaneId = parsePaneId(value["focusedPaneId"]);
  const splitDirection = parseSplitDirection(value["splitDirection"]);
  const recentlyClosed = Array.isArray(value["recentlyClosed"])
    ? value["recentlyClosed"]
        .flatMap((candidate) => parseClosedTab(candidate, knownSourceIds))
        .slice(0, 20)
    : [];
  const recentSourceIds = Array.isArray(value["recentSourceIds"])
    ? value["recentSourceIds"].filter(
        (candidate): candidate is SourceId =>
          typeof candidate === "string" && knownSourceIds.has(candidate as SourceId),
      )
    : [];
  const layout: SourceWorkspaceLayout = {
    version: 2,
    panes: normalizedPanes,
    focusedPaneId:
      focusedPaneId && normalizedPanes.some(({ id }) => id === focusedPaneId)
        ? focusedPaneId
        : "primary",
    splitDirection: normalizedPanes.length === 2 ? (splitDirection ?? "horizontal") : null,
    splitRatio: clampRatio(value["splitRatio"]),
    recentlyClosed,
    recentSourceIds: [...new Set(recentSourceIds)].slice(0, 80),
  };
  return hasAnyTab(layout) || !fallbackSourceId
    ? layout
    : createSourceWorkspaceLayout(fallbackSourceId);
}

function parsePane(
  value: unknown,
  knownSourceIds: ReadonlySet<SourceId>,
): readonly SourceWorkspacePane[] {
  if (!isRecord(value)) {
    return [];
  }
  const id = parsePaneId(value["id"]);
  if (!id) {
    return [];
  }
  const tabs = Array.isArray(value["tabs"])
    ? value["tabs"].flatMap((candidate) => parseTab(candidate, knownSourceIds))
    : [];
  const uniqueTabs = tabs.filter(
    (tab, index, all) => all.findIndex(({ id: candidateId }) => candidateId === tab.id) === index,
  );
  const requestedActive = typeof value["activeTabId"] === "string" ? value["activeTabId"] : null;
  const activeTabId = uniqueTabs.some(({ id: tabId }) => tabId === requestedActive)
    ? (requestedActive as WorkspaceTab["id"])
    : (uniqueTabs[0]?.id ?? null);
  return [
    {
      id,
      tabs: uniqueTabs,
      activeTabId,
      history: parseHistory(value["history"], knownSourceIds),
    },
  ];
}

function parseTab(value: unknown, knownSourceIds: ReadonlySet<SourceId>): readonly WorkspaceTab[] {
  if (!isRecord(value) || typeof value["sourceId"] !== "string") {
    return [];
  }
  const sourceId = value["sourceId"] as SourceId;
  const view = parseView(value["view"]);
  if (!knownSourceIds.has(sourceId) || !view) {
    return [];
  }
  return [
    {
      ...createWorkspaceTab(sourceId, view, value["preview"] === true),
      pinned: value["pinned"] === true,
      dirty: false,
    },
  ];
}

function parseClosedTab(
  value: unknown,
  knownSourceIds: ReadonlySet<SourceId>,
): readonly ClosedWorkspaceTab[] {
  if (!isRecord(value)) {
    return [];
  }
  const paneId = parsePaneId(value["paneId"]);
  const [tab] = parseTab(value["tab"], knownSourceIds);
  if (!paneId || !tab) {
    return [];
  }
  return [{ paneId, tab, index: naturalNumber(value["index"]) }];
}

function parseHistory(value: unknown, knownSourceIds: ReadonlySet<SourceId>): WorkspaceHistory {
  if (!isRecord(value) || !Array.isArray(value["entries"])) {
    return { entries: [], index: -1 };
  }
  const entries = value["entries"].flatMap((candidate) => parseLocation(candidate, knownSourceIds));
  const requestedIndex =
    typeof value["index"] === "number" ? Math.trunc(value["index"]) : entries.length - 1;
  return {
    entries,
    index: entries.length === 0 ? -1 : Math.min(entries.length - 1, Math.max(0, requestedIndex)),
  };
}

function parseLocation(
  value: unknown,
  knownSourceIds: ReadonlySet<SourceId>,
): readonly WorkspaceLocation[] {
  if (!isRecord(value) || typeof value["sourceId"] !== "string") {
    return [];
  }
  const sourceId = value["sourceId"] as SourceId;
  const view = parseView(value["view"]);
  return knownSourceIds.has(sourceId) && view ? [{ sourceId, view }] : [];
}

function cleanLayout(layout: SourceWorkspaceLayout): SourceWorkspaceLayout {
  return {
    ...layout,
    panes: layout.panes.map((pane) => ({
      ...pane,
      tabs: pane.tabs.map((tab) => ({ ...tab, dirty: false })),
    })),
    recentlyClosed: layout.recentlyClosed.map((closed) => ({
      ...closed,
      tab: { ...closed.tab, dirty: false },
    })),
  };
}

function hasAnyTab(layout: SourceWorkspaceLayout): boolean {
  return layout.panes.some(({ tabs }) => tabs.length > 0);
}

function parseView(value: unknown): WorkspaceView | null {
  return typeof value === "string" && workspaceViews.includes(value as WorkspaceView)
    ? (value as WorkspaceView)
    : null;
}

function parsePaneId(value: unknown): WorkspacePaneId | null {
  return value === "primary" || value === "secondary" ? value : null;
}

function parseSplitDirection(value: unknown): WorkspaceSplitDirection | null {
  return value === "horizontal" || value === "vertical" ? value : null;
}

function clampRatio(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(0.72, Math.max(0.28, value))
    : 0.5;
}

function naturalNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
