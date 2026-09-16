import {
  moveDockPanel,
  resetContentGroups,
  splitDockPanel,
  mergeDockGroup,
  focusNextDockGroup,
  switchDockTab,
} from "./dockview-group-commands.js";
import { ResponsiveDockLayout } from "./dockview-responsive-layout.js";
import { DockviewSidePanels } from "./dockview-side-panels.js";
import { addDockTab, openDockTab, patchDockTab, panelsForClose } from "./dockview-tab-commands.js";
import { watchDockEvents } from "./dockview-workspace-events.js";
import { DockviewWorkspaceSnapshot } from "./dockview-workspace-snapshot.js";
import { navigatorPanelId, panelTab } from "./dockview-workspace-state.js";
import {
  createLibraryWorkspaceTab,
  createWorkspaceTab,
  type SourceWorkspaceLayout,
  type WorkspaceTab,
  type SourceWorkspaceView,
  type WorkspaceSplitDirection,
} from "./source-workspace-layout.js";

import type { WorkspaceStorage } from "./source-workspace-persistence.js";
import type { SourceId } from "@mdbase-reader/core";
import type {
  DockviewApi,
  DockviewGroupPanel,
  IDockviewPanel,
  SerializedDockview,
} from "dockview-react";

/** Imperative commands go straight to Dockview. React only subscribes to a projection. */
export class ReaderDockWorkspace {
  api: DockviewApi | null = null;
  private disposables: { dispose(): void }[] = [];
  private responsive = new ResponsiveDockLayout();
  private sides = new DockviewSidePanels(
    () => this.api,
    () => this.responsive.mobile,
  );
  private state: DockviewWorkspaceSnapshot;
  private mobileRequested = false;
  private desktopMaximized = false;
  private changingMode = false;
  private confirmDiscard: (tab: WorkspaceTab) => boolean = () => false;
  constructor(
    collection: string,
    storage: WorkspaceStorage | null,
    knownSources: ReadonlySet<SourceId>,
  ) {
    this.state = new DockviewWorkspaceSnapshot({
      collection,
      storage,
      knownSources,
      api: () => this.api,
      serialize: (api, focused) => this.sides.serialize(this.responsive.serialize(api, focused)),
      prepare: (api) => {
        this.sides.hideEmpty();
        if (
          !this.changingMode &&
          !this.mobile &&
          !globalThis.matchMedia("(max-width: 680px)").matches
        ) {
          this.responsive.remember(api);
        }
      },
    });
  }
  setCloseGuard(guard: (tab: WorkspaceTab) => boolean): void {
    this.confirmDiscard = guard;
  }
  subscribe = (listener: () => void): (() => void) => this.state.subscribe(listener);
  getSnapshot = (): SourceWorkspaceLayout => this.state.getSnapshot();
  private schedule = (): void => this.state.schedule();
  attach(api: DockviewApi): () => void {
    this.api = api;
    this.state.ready = false;
    this.changingMode = true;
    this.disposables = watchDockEvents(
      api,
      this.sides,
      this.state,
      () => this.changingMode,
      () => this.mobile,
    );
    this.state.restore(this);
    this.sides.initialize();
    this.changingMode = false;
    this.sides.syncFocus();
    this.state.ready = true;
    this.setMobile(this.mobileRequested);
    this.setSinglePane(this.sides.singlePane);
    this.schedule();
    globalThis.addEventListener("pagehide", this.state.persist);
    return () => {
      this.state.persist();
      globalThis.removeEventListener("pagehide", this.state.persist);
      this.state.detach();
      this.disposables.forEach((value) => value.dispose());
      this.disposables = [];
      this.sides.detach();
      this.api = null;
      this.responsive = new ResponsiveDockLayout();
    };
  }
  contentPanels = (): IDockviewPanel[] => this.api?.panels.filter(panelTab) ?? [];
  group(id?: string): DockviewGroupPanel | undefined {
    return (
      (id ? this.api?.groups.find((group) => group.id === id) : undefined) ??
      this.api?.getPanel(this.state.focusedPanel ?? "")?.group ??
      this.contentPanels()[0]?.group ??
      (this.mobile ? this.api?.activeGroup : undefined)
    );
  }
  open(
    sourceId: SourceId,
    view: SourceWorkspaceView = "document",
    paneId?: string,
    preview = false,
  ): void {
    if (this.api) {
      openDockTab(this.api, createWorkspaceTab(sourceId, view, preview), this.group(paneId));
    }
    this.schedule();
  }
  openLibrary(view = "all-sources", title = "Library", paneId?: string): void {
    if (this.api) {
      openDockTab(this.api, createLibraryWorkspaceTab(view, title), this.group(paneId));
    }
    this.schedule();
  }
  beside(tab: WorkspaceTab, direction: WorkspaceSplitDirection = "horizontal"): void {
    if (this.api) {
      addDockTab(
        this.api,
        { ...tab, preview: false },
        this.group(),
        this.mobile ? undefined : direction,
      );
    }
  }
  activate(id: string): void {
    if (this.api?.activePanel?.id !== id) {
      this.api?.getPanel(id)?.api.setActive();
    }
  }
  patch(id: string, changes: Partial<Pick<WorkspaceTab, "dirty" | "pinned" | "preview">>): void {
    if (this.api && patchDockTab(this.api, id, changes)) {
      this.schedule();
    }
  }
  close = (id: string): void => this.closeMany([id]);
  closeMany(ids: readonly string[]): void {
    const panels = panelsForClose(this.api, ids, this.confirmDiscard);
    if (!panels) {
      return;
    }
    const onlySides = panels.every((panel) => !panelTab(panel));
    for (const panel of panels) {
      const tab = panelTab(panel);
      if (tab) {
        this.state.navigation.close(tab);
      } else if (this.mobile || this.sides.hide(panel)) {
        continue;
      }
      this.api?.removePanel(panel);
    }
    if (onlySides && this.mobile) {
      this.backToContent();
    }
    this.schedule();
  }
  reopen(): void {
    const tab = this.state.navigation.reopen();
    if (tab && this.api) {
      openDockTab(this.api, tab, this.group());
    }
    this.schedule();
  }
  move(id: string, target: string, index?: number): void {
    moveDockPanel(this.api, id, target, index);
  }
  split(id: string, direction: WorkspaceSplitDirection): void {
    if (!this.mobile) {
      splitDockPanel(this.api, id, direction);
    }
  }
  merge = (groupId: string): void => mergeDockGroup(this.api, groupId);
  focusNext = (): void => focusNextDockGroup(this.api);
  switchRelative = (direction: -1 | 1): void =>
    switchDockTab(this.api?.activeGroup ?? this.group(), direction);
  navigate(direction: -1 | 1): void {
    this.state.navigation.navigate(direction, (location) => {
      if (location.kind === "source") {
        this.open(location.sourceId, location.view);
      } else {
        this.openLibrary(location.libraryViewId, location.title);
      }
    });
  }
  layoutViewport = (width: number, height: number): void =>
    this.responsive.layoutViewport(this.api, width, height);
  seedDesktop = (layout: SerializedDockview): void => this.responsive.seed(layout);
  get mobile(): boolean {
    return this.responsive.mobile;
  }
  setMobile(value: boolean): void {
    this.mobileRequested = value;
    if (!this.api || !this.state.ready || value === this.mobile) {
      return;
    }
    if (value) {
      this.desktopMaximized = this.api.hasMaximizedGroup();
    }
    this.api.exitMaximizedGroup();
    this.sides.syncFocus();
    this.changingMode = true;
    try {
      this.responsive.setMobile(this.api, value, this.state.focusedPanel);
      this.sides.initialize();
    } finally {
      this.changingMode = false;
    }
    this.sides.syncFocus();
    this.setSinglePane(this.sides.singlePane);
    if (!value && this.desktopMaximized && !this.sides.singlePane) {
      this.group()?.api.maximize();
    }
    this.schedule();
  }
  backToContent = (): void => {
    (this.api?.getPanel(this.state.focusedPanel ?? "") ?? this.contentPanels()[0])?.api.setActive();
  };
  isSideVisible = (id: string): boolean => this.sides.visible(id);
  setSinglePane = (value: boolean): void =>
    this.sides.setSinglePane(value, this.api?.getPanel(this.state.focusedPanel ?? ""));
  setSideVisible(id: string, visible: boolean, activate = true): void {
    if (visible) {
      this.sides.show(id, activate);
    } else {
      this.close(id);
    }
    this.schedule();
  }
  reset(): void {
    const active = this.api?.getPanel(this.state.focusedPanel ?? "");
    const first = resetContentGroups(this);
    this.setSideVisible(navigatorPanelId, true, false);
    this.sides.resetAround();
    (active ?? first)?.api.setActive();
    if (this.api && !this.mobile) {
      this.responsive.remember(this.api);
    }
    if (this.sides.singlePane) {
      this.setSinglePane(true);
    } else {
      this.api?.exitMaximizedGroup();
    }
    this.schedule();
  }
}
