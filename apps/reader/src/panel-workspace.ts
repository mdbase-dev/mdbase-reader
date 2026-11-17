import { t } from "@lingui/core/macro";
import {
  computeLayout,
  edgeOfStack,
  findStack,
  keepPanels,
  mainStacks,
  stackOfPanel,
  WorkspaceStore,
  type LayoutOptions,
  type Operation,
  type PanelDescriptor,
  type Size,
  type StackNode,
  type Target,
  type WorkspaceChange,
  type WorkspaceLayout,
  type WorkspaceState,
} from "@mdbase-dev/panels";

import { focusReadingPane } from "./focus-reading-pane.js";
import { restoreWorkspace, sessionId, withSidePanels } from "./panel-workspace-restore.js";
import {
  activePanel,
  initialLayoutSnapshot,
  inspectorPanelId,
  navigatorPanelId,
  panelStorageKey,
  panelTab,
  projectLayout,
  sideOf,
  sidePanel,
  sidePanelIds,
  sideWidth,
  tabData,
  tabPanel,
  tabPanels,
  type WorkspaceStorage,
} from "./panel-workspace-state.js";
import {
  createLibraryWorkspaceTab,
  createWorkspaceTab,
  type SourceWorkspaceLayout,
  type SourceWorkspaceView,
  type WorkspaceSplitDirection,
  type WorkspaceTab,
} from "./source-workspace-layout.js";
import { WorkspaceNavigation } from "./workspace-navigation.js";

import type { SourceId } from "@mdbase-reader/core";

/** Below this width one panel fills the workspace and Reader's phone navigation takes over. */
const compactBelow = 681;
const skip = { history: "skip" } as const;

/**
 * Reader's workspace: which tabs are open and how they are arranged. The arrangement lives in a
 * panel store; this adds what only Reader knows (previews, unsaved changes, history, the two
 * side panels) and a pane-and-tab projection for its commands.
 */
export class ReaderPanelWorkspace {
  readonly store: WorkspaceStore;
  readonly navigation = new WorkspaceNavigation();
  private readonly dirty = new Set<string>();
  private focusedPanel: string | null;
  private projection = initialLayoutSnapshot();
  private listeners = new Set<() => void>();
  private size: Size | null = null;
  private computed: { key: unknown[]; layout: WorkspaceLayout } | null = null;
  private singlePane = false;
  /** Side regions that were closed on the desktop and are only open as a phone screen. */
  private readonly phoneRevealed = new Set<"left" | "right">();
  private overviewOpen = false;
  private chromeHidden = false;
  private coarse = false;
  private confirmDiscard: (tab: WorkspaceTab) => boolean | Promise<boolean> = () => false;

  constructor(
    collection: string,
    storage: WorkspaceStorage | null,
    knownSources: ReadonlySet<SourceId>,
    sourceIndexComplete = true,
  ) {
    const restored = restoreWorkspace({
      storage,
      collection,
      knownSources,
      sourceIndexComplete,
      navigation: this.navigation,
    });
    const initial = withSidePanels(restored.state, restored.fresh ?? false);
    this.store = new WorkspaceStore({
      initial,
      storage: {
        load: () => undefined,
        save: (snapshot) =>
          storage?.setItem(
            panelStorageKey(collection),
            JSON.stringify({
              version: 1,
              workspace: snapshot,
              navigation: this.navigation.toJSON(),
              focusedPanel: this.focusedPanel,
            }),
          ),
      },
    });
    this.focusedPanel =
      restored.focusedPanel ??
      panelTab(activePanel(initial))?.id ??
      tabPanels(initial)[0]?.id ??
      null;
    const tab = this.tab(this.focusedPanel);
    if (tab) {
      this.navigation.visit(tab);
    }
    this.project();
    this.store.subscribe(this.changed);
  }

  setCloseGuard(guard: (tab: WorkspaceTab) => boolean | Promise<boolean>): void {
    this.confirmDiscard = guard;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): SourceWorkspaceLayout => this.projection;
  /** Save when the page goes away, and once more when the workspace is taken down. */
  attach(): () => void {
    globalThis.addEventListener("pagehide", this.store.flush);
    return () => {
      globalThis.removeEventListener("pagehide", this.store.flush);
      this.store.flush();
    };
  }

  private get state(): WorkspaceState {
    return this.store.state;
  }
  private project(): void {
    this.projection = {
      ...projectLayout(this.state, this.focusedPanel, this.projection, this.dirty),
      recentSourceIds: this.navigation.recentSourceIds,
    };
  }
  private notify(): void {
    this.project();
    this.listeners.forEach((listener) => listener());
  }
  private changed = (change: WorkspaceChange): void => {
    for (const id of this.dirty) {
      if (!change.state.panels[id]) {
        this.dirty.delete(id);
      }
    }
    const active = panelTab(activePanel(change.state));
    if (active && active.id !== this.focusedPanel) {
      this.focusedPanel = active.id;
      this.navigation.visit(active);
    } else if (this.focusedPanel && !change.state.panels[this.focusedPanel]) {
      this.focusedPanel = tabPanels(change.state)[0]?.id ?? null;
    }
    this.notify();
  };

  /** The reader tab in a panel, with its unsaved-changes flag. */
  tab = (id: string | null | undefined): WorkspaceTab | null =>
    id ? panelTab(this.state.panels[id], this.dirty) : null;
  panel = (id: string): PanelDescriptor | undefined => this.state.panels[id];
  /** The panel that has focus: a tab, or a side panel. */
  activePanel = (): PanelDescriptor | null => activePanel(this.state);
  activeTab = (): WorkspaceTab | null => this.tab(this.activePanel()?.id);
  contentPanels = (): PanelDescriptor[] => tabPanels(this.state);
  /** A pane by id, or the one the reader last used. */
  pane(id?: string): StackNode | undefined {
    const state = this.state;
    const first = this.contentPanels()[0];
    return (
      findStack(state, id ?? null) ??
      (this.focusedPanel ? stackOfPanel(state, this.focusedPanel) : undefined) ??
      (first ? stackOfPanel(state, first.id) : undefined) ??
      mainStacks(state)[0]
    );
  }
  paneOf = (panel: string): StackNode | undefined => stackOfPanel(this.state, panel);

  open(
    sourceId: SourceId,
    view: SourceWorkspaceView = "document",
    paneId?: string,
    preview = false,
  ): void {
    this.openTab(createWorkspaceTab(sourceId, view, preview), this.pane(paneId));
  }
  openLibrary(
    view = "all-sources",
    title = t({ message: "All sources", context: "dockview workspace" }),
    paneId?: string,
  ): void {
    const pane = this.pane(paneId);
    const candidates = paneId ? (pane?.panels ?? []) : Object.keys(this.state.panels);
    const existing = candidates.find((id) => this.tab(id)?.kind === "library");
    const current = this.tab(existing);
    if (existing && current?.kind === "library") {
      const tab = { ...current, libraryViewId: view, title };
      this.store.dispatch(
        {
          type: "batch",
          operations: [
            { type: "update", panel: existing, changes: { data: tabData(tab), title } },
            { type: "activate", panel: existing },
          ],
        },
        skip,
      );
      // Showing another view in the tab that is already active is still a visit.
      this.focusedPanel = existing;
      this.navigation.visit(tab);
      this.notify();
    } else {
      this.openTab(createLibraryWorkspaceTab(view, title), pane);
    }
  }
  private existingTool(tab: WorkspaceTab): string | undefined {
    return tab.kind === "source" && tab.view === "citation"
      ? this.contentPanels().find(({ id }) => sameLocation(this.tab(id), tab))?.id
      : undefined;
  }
  private openTab(tab: WorkspaceTab, pane: StackNode | undefined): void {
    const existing =
      this.existingTool(tab) ?? pane?.panels.find((id) => sameLocation(this.tab(id), tab));
    if (existing) {
      if (!tab.preview) {
        this.patch(existing, { preview: false });
      }
      this.activate(existing);
      return;
    }
    const oldPreview = tab.preview
      ? pane?.panels.find((id) => {
          const candidate = this.tab(id);
          return candidate?.preview && !candidate.dirty && !candidate.pinned;
        })
      : undefined;
    const index = oldPreview ? pane?.panels.indexOf(oldPreview) : undefined;
    this.store.dispatch(
      {
        type: "batch",
        operations: [
          // A preview takes the place of the one before it.
          this.add(
            tab,
            pane
              ? { at: "stack", stack: pane.id, ...(index === undefined ? {} : { index }) }
              : { at: "focus" },
          ),
          ...(oldPreview ? [{ type: "remove" as const, panel: oldPreview }] : []),
        ],
      },
      skip,
    );
  }
  private add(tab: WorkspaceTab, target: Target): Operation {
    const id = sessionId(tab, (candidate) => Boolean(this.state.panels[candidate]));
    return { type: "add", panel: tabPanel({ ...tab, id }), target };
  }
  /** Open a tab in a pane of its own, next to the one in use. */
  beside(tab: WorkspaceTab, direction: WorkspaceSplitDirection = "horizontal"): void {
    const pane = this.pane();
    const target: Target =
      !pane || this.mobile
        ? pane
          ? { at: "stack", stack: pane.id }
          : { at: "focus" }
        : direction === "horizontal" && this.state.view === "columns"
          ? { at: "column", stack: pane.id, side: "right" }
          : { at: "split", stack: pane.id, side: direction === "horizontal" ? "right" : "bottom" };
    const existing = this.existingTool(tab);
    this.store.dispatch(
      existing
        ? { type: "move", panel: existing, target }
        : this.add({ ...tab, preview: false }, target),
      existing ? undefined : skip,
    );
  }
  activate(id: string): void {
    if (this.activePanel()?.id !== id && this.state.panels[id]) {
      this.store.dispatch({ type: "activate", panel: id });
    }
  }
  patch(id: string, changes: Partial<Pick<WorkspaceTab, "dirty" | "pinned" | "preview">>): void {
    const tab = this.tab(id);
    if (
      !tab ||
      Object.entries(changes).every(([key, value]) => tab[key as keyof WorkspaceTab] === value)
    ) {
      return;
    }
    const next = {
      ...tab,
      ...changes,
      ...(changes.dirty || changes.pinned ? { preview: false } : {}),
    };
    if (next.dirty) {
      this.dirty.add(id);
    } else {
      this.dirty.delete(id);
    }
    if (next.pinned !== tab.pinned || next.preview !== tab.preview) {
      this.store.dispatch(
        { type: "update", panel: id, changes: { data: tabData(next) } },
        { ...skip, animate: false },
      );
    } else {
      this.notify();
    }
  }
  /** Keep a tab's name with its panel: the overview and menus show it. */
  setTitle(id: string, title: string): void {
    if (this.state.panels[id] && this.state.panels[id].title !== title) {
      this.store.dispatch(
        { type: "update", panel: id, changes: { title } },
        { ...skip, animate: false },
      );
    }
  }

  close = (id: string): void => this.closeMany([id]);
  closeMany = (ids: readonly string[]): void => {
    void this.closeConfirmed(ids);
  };
  /** Confirm the complete batch before removing anything. */
  private async closeConfirmed(ids: readonly string[]): Promise<void> {
    const panels = ids.filter((id) => this.state.panels[id]);
    for (const id of panels) {
      const tab = this.tab(id);
      if (tab?.dirty && !(await this.confirmDiscard(tab))) {
        return;
      }
    }
    const operations: Operation[] = [];
    for (const id of panels) {
      const tab = this.tab(id);
      const stack = stackOfPanel(this.state, id);
      if (!stack) {
        continue;
      }
      if (tab) {
        this.navigation.close(tab);
      } else if (this.mobile) {
        // On a phone a side panel is a screen to leave, not a tab to close.
        continue;
      } else {
        const side = edgeOfStack(this.state, stack.id);
        if (side && stack.panels.length === 1) {
          operations.push({ type: "configureEdge", side, options: { visible: false } });
          continue;
        }
      }
      operations.push({ type: "remove", panel: id });
    }
    if (operations.length) {
      this.store.dispatch({ type: "batch", operations }, skip);
    }
    if (this.mobile && !this.activeTab()) {
      this.backToContent();
    }
  }
  reopen(): void {
    const tab = this.navigation.reopen();
    if (tab) {
      this.openTab(tab, this.pane());
    }
    this.notify();
  }
  move(id: string, pane: string, index?: number): void {
    if (findStack(this.state, pane)) {
      this.store.dispatch({
        type: "move",
        panel: id,
        target: { at: "stack", stack: pane, ...(index === undefined ? {} : { index }) },
      });
    }
  }
  split(id: string, direction: WorkspaceSplitDirection): void {
    const stack = stackOfPanel(this.state, id);
    if (stack && !this.mobile) {
      this.store.dispatch({
        type: "move",
        panel: id,
        target: {
          at: "split",
          stack: stack.id,
          side: direction === "horizontal" ? "right" : "bottom",
        },
      });
    }
  }
  /** Move every tab of a pane into another pane that holds reading tabs. */
  merge = (pane: string): void => {
    const target = this.projection.panes.find(({ id }) => id !== pane)?.id;
    if (findStack(this.state, pane) && target) {
      this.store.dispatch({
        type: "moveStack",
        stack: pane,
        target: { at: "stack", stack: target },
      });
    }
  };
  focusPane(pane: string): void {
    if (findStack(this.state, pane)) {
      this.store.dispatch({ type: "focus", stack: pane });
    }
  }
  focusNext = (): void => {
    const visible = this.layout()?.stacks.map(({ id }) => id) ?? [];
    const stacks = visible.flatMap((id) => {
      const stack = findStack(this.state, id);
      return stack?.active ? [stack] : [];
    });
    const next =
      stacks[(stacks.findIndex(({ id }) => id === this.state.focus) + 1) % stacks.length];
    if (!next?.active) {
      return;
    }
    this.store.dispatch({ type: "focus", stack: next.id });
    const host = document.querySelector<HTMLElement>(
      `[data-mp-panel="${CSS.escape(next.active)}"]`,
    );
    const pane = host?.querySelector<HTMLElement>("[data-session-id]");
    if (pane) {
      focusReadingPane(pane);
    } else {
      host?.querySelector<HTMLElement>("input, textarea, button, [tabindex='0']")?.focus();
    }
  };
  switchRelative = (direction: -1 | 1): void => {
    const stack = findStack(this.state, this.state.focus) ?? this.pane();
    if (stack?.panels.length) {
      const index = stack.panels.indexOf(stack.active ?? "");
      const next = stack.panels[(index + direction + stack.panels.length) % stack.panels.length];
      if (next) {
        this.store.dispatch({ type: "activate", panel: next });
      }
    }
  };
  navigate(direction: -1 | 1): void {
    this.navigation.navigate(direction, (location) => {
      if (location.kind === "source") {
        this.open(location.sourceId, location.view);
      } else {
        this.openLibrary(location.libraryViewId, location.title);
      }
    });
  }

  /** Options for laying the workspace out, shared by the view and by visibility checks. */
  layoutOptions = (): LayoutOptions => ({
    compactBelow,
    headerHeight: this.chromeHidden ? 0 : this.coarse ? 44 : 36,
    compactHeaderHeight: 0,
    minMainWidth: 360,
    minColumnWidth: 360,
    overview: this.overviewOpen,
  });
  private layout(): WorkspaceLayout | null {
    if (!this.size) {
      return null;
    }
    const key = [this.state, this.size, this.overviewOpen, this.chromeHidden, this.coarse];
    if (!this.computed || key.some((value, index) => value !== this.computed?.key[index])) {
      this.computed = { key, layout: computeLayout(this.state, this.size, this.layoutOptions()) };
    }
    return this.computed.layout;
  }
  /** Called by the view whenever it has laid the workspace out. */
  layoutChanged = (layout: WorkspaceLayout): void => {
    const previous = this.size;
    if (previous?.width === layout.size.width && previous.height === layout.size.height) {
      return;
    }
    const wasMobile = this.mobile;
    this.size = layout.size;
    if (wasMobile && layout.size.width >= compactBelow && this.phoneRevealed.size) {
      // Side panels opened as screens on a phone go back to being closed beside the content.
      const operations: Operation[] = [...this.phoneRevealed].map((side) => ({
        type: "configureEdge",
        side,
        options: { visible: false },
      }));
      this.phoneRevealed.clear();
      const content = this.focusedPanel ?? this.contentPanels()[0]?.id;
      if (content) {
        operations.unshift({ type: "activate", panel: content });
      }
      this.store.dispatch({ type: "batch", operations }, skip);
    }
    // Width decides what is on screen: the phone layout, and side panels that give way.
    if (previous?.width !== layout.size.width) {
      this.notify();
    }
  };
  /** Whether a panel is on screen now. */
  isPanelVisible = (id: string): boolean => {
    const layout = this.layout();
    if (layout) {
      return layout.panels.some((panel) => panel.id === id && panel.visible);
    }
    const stack = stackOfPanel(this.state, id);
    return stack?.active === id;
  };
  get mobile(): boolean {
    return this.size !== null && this.size.width < compactBelow;
  }
  backToContent = (): void => {
    const id = this.focusedPanel ?? this.contentPanels()[0]?.id;
    if (id) {
      this.store.dispatch({ type: "activate", panel: id });
    }
  };

  isSideVisible = (id: string): boolean => this.isPanelVisible(id);
  isSidebarVisible = (position: "left" | "right"): boolean => {
    if (this.mobile) {
      return this.isSideVisible(position === "left" ? navigatorPanelId : inspectorPanelId);
    }
    const edge = this.state.edges[position];
    return (
      this.layout()?.stacks.some((stack) => stack.edge === position) ??
      // Before the first layout: a side with something in it, not hidden and not covered.
      Boolean(edge?.visible && edge.stack.panels.length && !this.state.maximized)
    );
  };
  toggleSidebar(position: "left" | "right"): void {
    const conventional = position === "left" ? navigatorPanelId : inspectorPanelId;
    if (this.mobile) {
      this.setSideVisible(conventional, !this.isSideVisible(conventional));
      return;
    }
    if (this.isSidebarVisible(position)) {
      this.store.dispatch(
        { type: "configureEdge", side: position, options: { visible: false } },
        skip,
      );
      return;
    }
    if (!this.state.edges[position]?.stack.panels.length) {
      // An empty region would show nothing, so opening it brings its usual panel.
      if (!this.state.panels[conventional]) {
        this.show(conventional, false);
      }
      return;
    }
    this.reveal(position);
  }
  /** Show a side region, without activating or moving anything in it. */
  private reveal(position: "left" | "right", more: readonly Operation[] = []): void {
    this.store.dispatch(
      {
        type: "batch",
        operations: [
          { type: "maximize", stack: null },
          { type: "configureEdge", side: position, options: { visible: true } },
          ...more,
        ],
      },
      skip,
    );
    if (!this.mobile && !this.isSidebarVisible(position)) {
      // There is not room for both: the one just asked for wins.
      this.store.dispatch(
        {
          type: "configureEdge",
          side: position === "left" ? "right" : "left",
          options: { visible: false },
        },
        skip,
      );
    }
  }
  /** Focus mode: the pane in use fills the workspace until it is turned off. */
  setSinglePane = (value: boolean): void => {
    const was = this.singlePane;
    this.singlePane = value;
    if (value) {
      const pane = this.pane();
      if (pane && mainStacks(this.state).some(({ id }) => id === pane.id)) {
        this.store.dispatch({ type: "maximize", stack: pane.id }, skip);
      }
    } else if (was) {
      this.store.dispatch({ type: "maximize", stack: null }, skip);
    }
  };
  setSideVisible(id: string, visible: boolean, activate = true): void {
    if (visible) {
      this.show(id, activate);
    } else {
      this.close(id);
    }
  }
  private show(id: string, activate: boolean): void {
    const stack = stackOfPanel(this.state, id);
    const side = stack ? edgeOfStack(this.state, stack.id) : null;
    if (stack) {
      const focus: Operation[] = activate ? [{ type: "activate", panel: id }] : [];
      if (side === "left" || side === "right") {
        if (this.mobile && !this.state.edges[side]?.visible) {
          this.phoneRevealed.add(side);
        }
        this.reveal(side, focus);
      } else if (focus.length) {
        this.store.dispatch({ type: "batch", operations: focus }, skip);
      }
      return;
    }
    const position = sideOf(id);
    const created = !this.state.edges[position]?.stack.panels.length;
    this.reveal(position, [
      { type: "add", panel: sidePanel(id), target: { at: "edge", side: position }, activate },
      ...(created
        ? [
            {
              type: "configureEdge" as const,
              side: position,
              options: { size: sideWidth(id), min: 180, priority: position === "left" ? 1 : 0 },
            },
          ]
        : []),
    ]);
  }

  /** Every tab back in one pane and the side panels back at their sides, nothing closed. */
  reset(): void {
    if (!this.contentPanels().length) {
      this.openLibrary();
    }
    const focused = this.focusedPanel;
    const operations: Operation[] = [{ type: "maximize", stack: null }, { type: "flatten" }];
    for (const id of sidePanelIds) {
      const stack = stackOfPanel(this.state, id);
      const side = stack ? edgeOfStack(this.state, stack.id) : null;
      const position = sideOf(id);
      if (stack && side !== position) {
        operations.push({
          type: "move",
          panel: id,
          target: { at: "edge", side: position },
          activate: false,
        });
      }
      if (
        stack &&
        (side !== position || this.state.edges[position]?.visible || id === navigatorPanelId)
      ) {
        operations.push({
          type: "configureEdge",
          side: position,
          options: { size: sideWidth(id), ...(id === navigatorPanelId ? { visible: true } : {}) },
        });
      }
    }
    if (focused) {
      operations.push({ type: "activate", panel: focused });
    }
    this.store.dispatch({ type: "batch", operations });
    if (!this.state.panels[navigatorPanelId]) {
      this.show(navigatorPanelId, false);
    }
    if (this.singlePane) {
      this.setSinglePane(true);
    }
  }

  get view(): WorkspaceState["view"] {
    return this.state.view;
  }
  setView(view: WorkspaceState["view"]): void {
    this.store.dispatch({ type: "setView", view });
  }
  get overview(): boolean {
    return this.overviewOpen;
  }
  setOverview = (open: boolean): void => {
    if (this.overviewOpen !== open) {
      this.overviewOpen = open;
      this.notify();
    }
  };
  /** Reading mode hides the tab strips along with the header. */
  setChrome(hidden: boolean): void {
    if (this.chromeHidden !== hidden) {
      this.chromeHidden = hidden;
      this.notify();
    }
  }
  /** Touch screens get taller tab strips. */
  setCoarse(coarse: boolean): void {
    if (this.coarse !== coarse) {
      this.coarse = coarse;
      this.notify();
    }
  }
  get canUndo(): boolean {
    return this.store.canUndo;
  }
  get canRedo(): boolean {
    return this.store.canRedo;
  }
  /** Step the arrangement back or forward. Tabs opened or closed since stay as they are. */
  undo = (): void => {
    this.store.undo(keepOpen);
  };
  redo = (): void => {
    this.store.redo(keepOpen);
  };
}

/** Undo rewinds where things are; what is open, shown or maximized stays as it is now. */
function keepOpen(target: WorkspaceState, current: WorkspaceState): WorkspaceState {
  const next = keepPanels(target, current);
  const edges = { ...next.edges };
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const edge = edges[side];
    const visible = current.edges[side]?.visible;
    if (edge && visible !== undefined) {
      edges[side] = { ...edge, visible };
    }
  }
  return {
    ...next,
    edges,
    maximized: current.maximized && findStack(next, current.maximized) ? current.maximized : null,
  };
}

function sameLocation(left: WorkspaceTab | null, right: WorkspaceTab): boolean {
  return (
    left?.kind === right.kind &&
    left.view === right.view &&
    (left.kind === "library"
      ? left.libraryViewId === right.libraryViewId
      : left.sourceId === right.sourceId)
  );
}
