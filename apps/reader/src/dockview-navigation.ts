import { parseDockTab } from "./dockview-workspace-state.js";
import {
  tabLocation,
  sourceWorkspaceViews,
  type WorkspaceLocation,
  type WorkspaceTab,
  type SourceWorkspaceView,
  type SourceWorkspaceLayout,
} from "./source-workspace-layout.js";

import type { SourceId } from "@mdbase-reader/core";

interface NavigationState {
  readonly entries: readonly WorkspaceLocation[];
  readonly index: number;
  readonly closed: readonly WorkspaceTab[];
  readonly recentSourceIds: readonly SourceId[];
}
/** Domain navigation metadata is independent of Dockview's visual arrangement. */
export class DockviewNavigation {
  private state: NavigationState = { entries: [], index: -1, closed: [], recentSourceIds: [] };
  private navigating = false;
  get recentSourceIds(): readonly SourceId[] {
    return this.state.recentSourceIds;
  }
  toJSON(): NavigationState {
    return this.state;
  }
  visit(tab: WorkspaceTab): void {
    const location = tabLocation(tab);
    if (tab.kind === "source") {
      this.state = {
        ...this.state,
        recentSourceIds: [
          tab.sourceId,
          ...this.state.recentSourceIds.filter((id) => id !== tab.sourceId),
        ].slice(0, 80),
      };
    }
    if (
      this.navigating ||
      JSON.stringify(this.state.entries[this.state.index]) === JSON.stringify(location)
    ) {
      return;
    }
    const entries = [...this.state.entries.slice(0, this.state.index + 1), location].slice(-80);
    this.state = { ...this.state, entries, index: entries.length - 1 };
  }
  close(tab: WorkspaceTab): void {
    this.state = {
      ...this.state,
      closed: [{ ...tab, dirty: false }, ...this.state.closed].slice(0, 20),
    };
  }
  reopen(): WorkspaceTab | undefined {
    const tab = this.state.closed[0];
    this.state = { ...this.state, closed: this.state.closed.slice(1) };
    return tab;
  }
  navigate(direction: -1 | 1, open: (location: WorkspaceLocation) => void): void {
    const index = this.state.index + direction;
    const location = this.state.entries[index];
    if (!location) {
      return;
    }
    this.state = { ...this.state, index };
    this.navigating = true;
    try {
      open(location);
    } finally {
      this.navigating = false;
    }
  }
  restoreLegacy(layout: SourceWorkspaceLayout): void {
    const history = layout.panes.find(({ id }) => id === layout.focusedPaneId)?.history;
    this.state = {
      entries: history?.entries ?? [],
      index: history?.index ?? -1,
      recentSourceIds: layout.recentSourceIds,
      closed: layout.recentlyClosed.map(({ tab }) => ({
        ...tab,
        id: `reader:session:${crypto.randomUUID()}`,
        dirty: false,
      })),
    };
  }
  restore(value: unknown, known: ReadonlySet<SourceId>): void {
    if (!isRecord(value)) {
      return;
    }
    const entries = Array.isArray(value["entries"])
      ? value["entries"].flatMap((item) => locationFrom(item, known)).slice(-80)
      : [];
    const requested =
      typeof value["index"] === "number" && Number.isFinite(value["index"])
        ? Math.trunc(value["index"])
        : entries.length - 1;
    const recentSourceIds = Array.isArray(value["recentSourceIds"])
      ? value["recentSourceIds"]
          .filter((id): id is SourceId => typeof id === "string" && known.has(id as SourceId))
          .slice(0, 80)
      : [];
    const closed = Array.isArray(value["closed"])
      ? value["closed"].flatMap((item) => closedFrom(item, known)).slice(0, 20)
      : [];
    this.state = {
      entries,
      index: Math.min(entries.length - 1, Math.max(0, requested)),
      recentSourceIds,
      closed,
    };
  }
}
function locationFrom(value: unknown, known: ReadonlySet<SourceId>): WorkspaceLocation[] {
  if (!isRecord(value)) {
    return [];
  }
  if (
    value["kind"] === "library" &&
    typeof value["libraryViewId"] === "string" &&
    typeof value["title"] === "string"
  ) {
    return [{ kind: "library", libraryViewId: value["libraryViewId"], title: value["title"] }];
  }
  if (
    value["kind"] === "source" &&
    typeof value["sourceId"] === "string" &&
    known.has(value["sourceId"] as SourceId) &&
    sourceWorkspaceViews.includes(value["view"] as SourceWorkspaceView)
  ) {
    return [
      {
        kind: "source",
        sourceId: value["sourceId"] as SourceId,
        view: value["view"] as SourceWorkspaceView,
      },
    ];
  }
  return [];
}
function closedFrom(value: unknown, known: ReadonlySet<SourceId>): WorkspaceTab[] {
  if (!isRecord(value) || typeof value["id"] !== "string") {
    return [];
  }
  try {
    const tab = parseDockTab(value, value["id"]);
    return tab.kind === "library" || known.has(tab.sourceId) ? [tab] : [];
  } catch {
    return [];
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
