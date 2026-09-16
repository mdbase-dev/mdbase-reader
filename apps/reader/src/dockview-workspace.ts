import {
  moveDockPanel,
  splitDockPanel,
  mergeDockGroup,
  focusNextDockGroup,
  switchDockTab,
} from "./dockview-group-commands.js";
import { DockviewNavigation } from "./dockview-navigation.js";
import { DockviewSidePanels } from "./dockview-side-panels.js";
import { addDockTab, openDockTab, patchDockTab } from "./dockview-tab-commands.js";
import { restoreDockWorkspace } from "./dockview-workspace-migration.js";
import {
  dockStorageKey,
  initialDockSnapshot,
  navigatorPanelId,
  panelTab,
  projectDockLayout,
  serializeDockState,
} from "./dockview-workspace-state.js";
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
import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from "dockview-react";

/** Imperative commands go straight to Dockview. React only subscribes to a projection. */
export class ReaderDockWorkspace {
  api: DockviewApi | null = null;
  private snapshot = initialDockSnapshot();
  private listeners = new Set<() => void>();
  private disposables: { dispose(): void }[] = [];
  private focusedPanel: string | null = null;
  private scheduled = false;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private navigation = new DockviewNavigation();
  private sides = new DockviewSidePanels(() => this.api);
  private ready = false;
  private confirmDiscard: (tab: WorkspaceTab) => boolean = () => false;
  constructor(
    private readonly collection: string,
    private readonly storage: WorkspaceStorage | null,
    private readonly knownSources: ReadonlySet<SourceId>,
  ) {}
  setCloseGuard(guard: (tab: WorkspaceTab) => boolean): void {
    this.confirmDiscard = guard;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): SourceWorkspaceLayout => this.snapshot;

  attach(api: DockviewApi): () => void {
    this.api = api;
    this.ready = false;
    this.disposables = [
      api.onDidLayoutChange(() => this.schedule()),
      api.onDidActivePanelChange(({ panel }) => {
        const tab = panelTab(panel);
        if (tab) {
          this.focusedPanel = tab.id;
          this.navigation.visit(tab);
          this.snapshot = { ...this.snapshot, recentSourceIds: this.navigation.recentSourceIds };
        }
        this.schedule();
      }),
      api.onDidMovePanel(() => this.schedule()),
      api.onDidActiveGroupChange((group) => {
        if (this.sides.singlePane && group && !group.api.isMaximized()) {
          group.api.maximize();
        }
        this.schedule();
      }),
      api.onDidMaximizedGroupChange(() => this.schedule()),
    ];
    const restored = restoreDockWorkspace(
      this,
      this.navigation,
      this.storage,
      this.collection,
      this.knownSources,
    );
    if (restored) {
      this.snapshot = { ...this.snapshot, recentSourceIds: restored.recentSourceIds };
    }
    this.focusedPanel =
      restored?.focusedPanel ??
      panelTab(api.activePanel)?.id ??
      this.contentPanels()[0]?.id ??
      null;
    this.ready = true;
    this.schedule();
    const flush = (): void => this.persist();
    globalThis.addEventListener("pagehide", flush);
    return () => {
      this.persist();
      globalThis.removeEventListener("pagehide", flush);
      clearTimeout(this.persistTimer);
      this.disposables.forEach((value) => value.dispose());
      this.disposables = [];
      this.api = null;
      this.ready = false;
    };
  }
  contentPanels = (): IDockviewPanel[] => this.api?.panels.filter(panelTab) ?? [];
  group(id?: string): DockviewGroupPanel | undefined {
    return (
      (id ? this.api?.groups.find((group) => group.id === id) : undefined) ??
      this.api?.getPanel(this.focusedPanel ?? "")?.group ??
      this.contentPanels()[0]?.group
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
      addDockTab(this.api, { ...tab, preview: false }, this.group(), direction);
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
    const panels = ids.flatMap((id) => {
      const panel = this.api?.getPanel(id);
      return panel ? [panel] : [];
    });
    // Cancellation aborts the whole close operation before touching the layout.
    if (
      panels.some((panel) => {
        const tab = panelTab(panel);
        return tab?.dirty && !this.confirmDiscard(tab);
      })
    ) {
      return;
    }
    const returnTo = this.sides.returnTarget(panels, this.focusedPanel);
    for (const panel of panels) {
      const tab = panelTab(panel);
      if (tab) {
        this.navigation.close(tab);
      } else {
        this.sides.remember(panel);
      }
      this.api?.removePanel(panel);
    }
    returnTo?.api.setActive();
    this.schedule();
  }
  reopen(): void {
    const tab = this.navigation.reopen();
    if (tab && this.api) {
      openDockTab(this.api, tab, this.group());
    }
    this.schedule();
  }
  move(id: string, target: string, index?: number): void {
    moveDockPanel(this.api, id, target, index);
  }
  split(id: string, direction: WorkspaceSplitDirection): void {
    splitDockPanel(this.api, id, direction);
  }
  merge = (groupId: string): void => mergeDockGroup(this.api, groupId);
  focusNext = (): void => focusNextDockGroup(this.api);
  switchRelative = (direction: -1 | 1): void =>
    switchDockTab(this.api?.activeGroup ?? this.group(), direction);
  navigate(direction: -1 | 1): void {
    this.navigation.navigate(direction, (location) => {
      if (location.kind === "source") {
        this.open(location.sourceId, location.view);
      } else {
        this.openLibrary(location.libraryViewId, location.title);
      }
    });
  }
  isSideVisible = (id: string): boolean => this.sides.visible(id);
  setSinglePane = (value: boolean): void => this.sides.setSinglePane(value);
  setSideVisible(id: string, visible: boolean, activate = true): void {
    if (visible) {
      this.sides.show(id, activate);
    } else {
      this.close(id);
    }
  }
  reset(): void {
    const active = this.api?.getPanel(this.focusedPanel ?? "");
    const first = this.contentPanels()[0];
    if (first) {
      for (const panel of this.contentPanels().slice(1)) {
        this.move(panel.id, first.group.id);
      }
    } else {
      this.openLibrary();
    }
    this.setSideVisible(navigatorPanelId, true, false);
    const target = this.group();
    if (target) {
      this.sides.resetAround(target);
    }
    (active ?? first)?.api.setActive();
    if (!this.sides.singlePane) {
      this.api?.exitMaximizedGroup();
    }
    this.schedule();
  }
  private schedule(): void {
    if (this.scheduled) {
      return;
    }
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.api || !this.ready) {
        return;
      }
      this.snapshot = projectDockLayout(this.api, this.focusedPanel, this.snapshot);
      this.listeners.forEach((listener) => listener());
      clearTimeout(this.persistTimer);
      this.persistTimer = setTimeout(() => this.persist(), 200);
    });
  }
  private persist(): void {
    if (!this.api || !this.ready) {
      return;
    }
    try {
      this.storage?.setItem(
        dockStorageKey(this.collection),
        serializeDockState(this.api, this.navigation.toJSON(), this.focusedPanel),
      );
    } catch {
      /* Layout persistence must never prevent reading. */
    }
  }
}
