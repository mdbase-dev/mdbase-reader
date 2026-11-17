import { t } from "@lingui/core/macro";
import {
  computeLayout,
  edgeOfStack,
  findStack,
  keepPanels,
  mainStacks,
  seedFrames,
  stackOfPanel,
  WorkspaceStore,
  type EdgeSide,
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
  canFollow,
  follows,
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
 * panel store; this adds what only Reader knows (previews, unsaved changes, history, where the
 * Sources and Notes panels start, tabs that follow the active document) and a pane-and-tab
 * projection for its commands.
 *
 * A side region saves one thing: whether the reader wants it open. Whether it is on screen now
 * also depends on room, reading and the phone layout, and none of that is written back.
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
  private options: { key: unknown[]; value: LayoutOptions } | null = null;
  private singlePane = false;
  /** The reader's preference: Sources makes way while a document is on screen. */
  private hideWhileReading = false;
  private reading = false;
  /** Sides opened while they were making way for reading; they stay until reading starts or ends. */
  private readonly peeked = new Set<EdgeSide>();
  /** Side regions kept off screen for now. Derived, and never saved. */
  private hidden: readonly EdgeSide[] = [];
  /** The side asked for last: when there is not room for both, the other one gives way. */
  private asked: EdgeSide | null = null;
  /** The source that tabs following the active document show. */
  private followed: SourceId | null = null;
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
    this.refreshReading();
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
    this.refreshReading();
    this.notify();
  };
  /**
   * Reading is a document on screen in the main area with no library beside it. It is read
   * from what is showing, not from where focus is, so using the Notes panel does not end it.
   */
  private refreshReading(): void {
    const showing = mainStacks(this.state).map(({ active }) => this.tab(active));
    const reading =
      this.hideWhileReading &&
      showing.some((tab) => tab?.kind === "source" && tab.view === "document") &&
      !showing.some((tab) => tab?.kind === "library");
    if (reading !== this.reading) {
      this.reading = reading;
      this.peeked.clear();
    }
    const side = this.readingSide();
    const hidden = side && !this.peeked.has(side) ? [side] : [];
    if (hidden.join() !== this.hidden.join()) {
      this.hidden = hidden;
    }
  }
  /** The side region that makes way for reading: the one Sources is in, wherever that is. */
  private readingSide(): EdgeSide | null {
    const stack = this.reading ? stackOfPanel(this.state, navigatorPanelId) : undefined;
    return stack ? edgeOfStack(this.state, stack.id) : null;
  }
  /** Whether the Sources region makes way while a document is on screen. */
  setHideWhileReading(hide: boolean): void {
    if (this.hideWhileReading !== hide) {
      this.hideWhileReading = hide;
      this.refreshReading();
      this.settleFocus();
      this.notify();
    }
  }

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
        { type: "update", panel: id, changes: { data: tabData(next), leads: !follows(next) } },
        { ...skip, animate: false },
      );
    } else {
      this.notify();
    }
    // A tab that was held by a pin or by unsaved changes catches up with the active document.
    this.syncFollowers();
  }
  /** The tab the Notes panel and following tabs are about: the last one used that leads. */
  leaderTab = (): WorkspaceTab | null => this.tab(this.state.leader);
  /** The source that following tabs show, or null when there is no active source. */
  get followedSource(): SourceId | null {
    return this.followed;
  }
  setFollowed(sourceId: SourceId | null): void {
    if (this.followed !== sourceId) {
      this.followed = sourceId;
      this.syncFollowers();
      this.notify();
    }
  }
  /** Whether a note or annotations tab shows the active document's source instead of its own. */
  setFollow(id: string, follow: boolean): void {
    const tab = this.tab(id);
    if (!canFollow(tab) || Boolean(tab.follow) === follow) {
      return;
    }
    const next = { ...tab, preview: false, follow };
    // The tab in use starts by following the document it was opened for, if that is open.
    const document =
      follow && this.state.leader === id
        ? this.contentPanels().find((panel) => {
            const other = this.tab(panel.id);
            return other?.view === "document" && other.sourceId === tab.sourceId;
          })
        : undefined;
    this.store.dispatch(
      {
        type: "batch",
        operations: [
          { type: "update", panel: id, changes: { data: tabData(next), leads: !follows(next) } },
          ...(document ? [{ type: "lead" as const, panel: document.id }] : []),
        ],
      },
      { ...skip, animate: false },
    );
    this.syncFollowers();
  }
  /** Point following tabs at the active source. One with unsaved changes waits until it is saved. */
  private syncFollowers(): void {
    const sourceId = this.followed;
    if (!sourceId) {
      return;
    }
    const operations: Operation[] = this.contentPanels().flatMap(({ id }) => {
      const tab = this.tab(id);
      return follows(tab) && !tab.dirty && tab.sourceId !== sourceId
        ? [{ type: "update", panel: id, changes: { data: tabData({ ...tab, sourceId }) } }]
        : [];
    });
    if (operations.length) {
      this.store.dispatch({ type: "batch", operations }, { ...skip, animate: false });
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
          // The only tab of a side region: closing it closes the region, and it stays loaded.
          operations.push(...this.hideOperations(side));
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
  layoutOptions = (): LayoutOptions => {
    const key = [this.overviewOpen, this.chromeHidden, this.coarse, this.hidden, this.asked];
    if (!this.options || key.some((value, index) => value !== this.options?.key[index])) {
      this.options = {
        key,
        value: {
          compactBelow,
          headerHeight: this.chromeHidden ? 0 : this.coarse ? 44 : 36,
          compactHeaderHeight: 0,
          minMainWidth: 360,
          minColumnWidth: 360,
          overview: this.overviewOpen,
          hiddenEdges: this.hidden,
          preferEdge: this.asked,
        },
      };
    }
    return this.options.value;
  };
  private layout(): WorkspaceLayout | null {
    if (!this.size) {
      return null;
    }
    const key = [this.state, this.size, this.layoutOptions()];
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
    this.size = layout.size;
    // A side panel that was a phone's screen, or that has just given way, no longer holds focus.
    this.settleFocus();
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
  /** Focus belongs to something on screen: off a side region that is not showing. */
  private settleFocus(): void {
    const side = edgeOfStack(this.state, this.state.focus ?? "");
    const content = this.focusedPanel ?? this.contentPanels()[0]?.id;
    if (!side || this.mobile || !content || this.state.maximized) {
      return;
    }
    const showing = this.layout()?.stacks.some(({ edge }) => edge === side);
    if (showing === false) {
      this.store.dispatch({ type: "activate", panel: content }, skip);
    }
  }

  isSideVisible = (id: string): boolean => this.isPanelVisible(id);
  isSidebarVisible = (position: "left" | "right"): boolean => {
    if (this.mobile) {
      return this.isSideVisible(position === "left" ? navigatorPanelId : inspectorPanelId);
    }
    const edge = this.state.edges[position];
    return (
      this.layout()?.stacks.some((stack) => stack.edge === position) ??
      // Before the first layout: a side with something in it, wanted and not covered.
      Boolean(
        edge?.visible &&
        edge.stack.panels.length &&
        !this.state.maximized &&
        !this.hidden.includes(position),
      )
    );
  };
  /**
   * The header's buttons open and close a side region, whatever tabs it holds. An empty region
   * has nothing to show, so opening it brings home the panel that starts there.
   */
  toggleSidebar(position: "left" | "right"): void {
    const home = position === "left" ? navigatorPanelId : inspectorPanelId;
    if (this.mobile) {
      // A phone shows one panel at a time, so the button goes to that panel and back.
      if (this.activePanel()?.id === home) {
        this.backToContent();
      } else {
        this.show(home, true);
      }
      return;
    }
    if (this.isSidebarVisible(position)) {
      this.hide(position);
    } else if (this.state.edges[position]?.stack.panels.length) {
      this.reveal(position);
    } else {
      this.reveal(position, this.homeOperations(home, false));
    }
  }
  /** Put a side region on screen, without activating or moving anything in it. */
  private reveal(position: EdgeSide, more: readonly Operation[] = []): void {
    this.asked = position;
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
    if (this.readingSide() === position) {
      // Asked for while reading: it shows until reading starts or ends.
      this.peeked.add(position);
    }
    this.refreshReading();
    this.notify();
  }
  /** Take a side region off screen. */
  private hide(position: EdgeSide): void {
    if (this.peeked.delete(position) && this.readingSide() === position) {
      // It was only showing as an exception to reading, so the reader still wants it otherwise.
      this.refreshReading();
      this.settleFocus();
      this.notify();
      return;
    }
    this.store.dispatch({ type: "batch", operations: this.hideOperations(position) }, skip);
  }
  private hideOperations(side: EdgeSide): Operation[] {
    const content = this.focusedPanel ?? this.contentPanels()[0]?.id;
    return [
      { type: "configureEdge", side, options: { visible: false } },
      // Focus goes back to the tab the reader was using, not to whichever pane comes first.
      ...(this.state.focus === this.state.edges[side]?.stack.id && content
        ? [{ type: "activate" as const, panel: content }]
        : []),
    ];
  }
  /** Bring the Sources or Notes panel to the side it starts at, from wherever it is. */
  private homeOperations(id: string, activate: boolean): Operation[] {
    const side = sideOf(id);
    const target: Target = { at: "edge", side };
    return [
      this.state.panels[id]
        ? { type: "move", panel: id, target, activate }
        : { type: "add", panel: sidePanel(id), target, activate },
      ...(this.state.edges[side]?.stack.panels.length
        ? []
        : [
            {
              type: "configureEdge" as const,
              side,
              options: { size: sideWidth(id), min: 180, priority: side === "left" ? 1 : 0 },
            },
          ]),
    ];
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
  /**
   * Show or put away the Sources or Notes panel, wherever the reader has moved it. Putting it
   * away closes the side region it is showing in; in a pane of the main area it stays.
   */
  setSideVisible(id: string, visible: boolean, activate = true): void {
    if (visible) {
      this.show(id, activate);
      return;
    }
    const stack = stackOfPanel(this.state, id);
    const side = stack ? edgeOfStack(this.state, stack.id) : null;
    if (this.mobile) {
      if (this.activePanel()?.id === id) {
        this.backToContent();
      }
    } else if (side && stack?.active === id && this.isPanelVisible(id)) {
      this.hide(side);
    }
  }
  private show(id: string, activate: boolean): void {
    const stack = stackOfPanel(this.state, id);
    const side = stack ? edgeOfStack(this.state, stack.id) : null;
    const focus: Operation[] = activate ? [{ type: "activate", panel: id }] : [];
    if (stack) {
      if (side && !this.mobile) {
        this.reveal(side, focus);
      } else if (focus.length) {
        // In a pane, or on a phone where it is a screen of its own: going to it is enough.
        this.store.dispatch({ type: "batch", operations: focus }, skip);
      }
      return;
    }
    if (this.mobile) {
      // A phone's screen says nothing about whether the side is open on a wider window.
      const visible = this.state.edges[sideOf(id)]?.visible ?? false;
      this.store.dispatch(
        {
          type: "batch",
          operations: [
            ...this.homeOperations(id, activate),
            { type: "configureEdge", side: sideOf(id), options: { visible } },
          ],
        },
        skip,
      );
      return;
    }
    this.reveal(sideOf(id), this.homeOperations(id, activate));
  }

  /** Every tab back in one pane and the side panels back at their sides, nothing closed. */
  reset(): void {
    if (!this.contentPanels().length) {
      this.openLibrary();
    }
    const focused = this.focusedPanel;
    this.peeked.clear();
    this.asked = null;
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
    if (view === this.state.view) {
      return;
    }
    // The canvas starts from where the panes are now, so switching to it moves nothing.
    const from =
      view === "canvas" && this.size && !this.mobile
        ? computeLayout({ ...this.state, maximized: null }, this.size, {
            ...this.layoutOptions(),
            overview: false,
          })
        : null;
    this.store.dispatch({
      type: "setView",
      view,
      ...(from ? { frames: seedFrames(from.stacks, from.main) } : {}),
    });
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
