import { t } from "@lingui/core/macro";
import {
  apply,
  computeLayout,
  edgeOfStack,
  findStack,
  keepPanels,
  mainStacks,
  parseArrangement,
  seedFrames,
  stackOfPanel,
  windowOf,
  WorkspaceStore,
  type EdgeSide,
  type Follow,
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
import {
  restoreWorkspace,
  sessionId,
  withoutInvalid,
  withSidePanels,
} from "./panel-workspace-restore.js";
import {
  activePanel,
  canFollow,
  followedPane,
  homeOf,
  initialLayoutSnapshot,
  isSidePanel,
  navigatorPanel,
  navigatorPanelId,
  navigatorWidth,
  notesPanel,
  notesPanelKind,
  notesPanels,
  notesView,
  notesWidth,
  panelStorageKey,
  panelTab,
  projectLayout,
  subjectTab,
  tabData,
  tabPanel,
  tabPanelKind,
  tabPanels,
  windowStorageKey,
  type WorkspaceStorage,
} from "./panel-workspace-state.js";
import {
  createLibraryWorkspaceTab,
  createWorkspaceTab,
  notesViews,
  type NotesView,
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
 * panel store; this adds what only Reader knows (previews, unsaved changes, history, where
 * Sources and the Notes panels start, pinning a Notes panel to a source) and a pane-and-tab
 * projection for its commands.
 *
 * A side region saves one thing: whether the reader wants it open. Whether it is on screen now
 * also depends on room, reading and the phone layout, and none of that is written back.
 *
 * What is open and where is shared by every window on the collection, and a window is told
 * when another one changes it. Focus, the tab in front, open sides, the canvas position and
 * history are each window's own.
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
  /** The source picked in the library: what a Notes panel shows while a library tab leads. */
  private selected: SourceId | null = null;
  private readonly collection: string;
  private readonly storage: WorkspaceStorage | null;
  private readonly session: WorkspaceStorage | null;
  private overviewOpen = false;
  private chromeHidden = false;
  private coarse = false;
  private confirmDiscard: (tab: WorkspaceTab) => boolean | Promise<boolean> = () => false;

  constructor(
    collection: string,
    storage: WorkspaceStorage | null,
    knownSources: ReadonlySet<SourceId>,
    sourceIndexComplete = true,
    /** This window's own storage. Tests, and browsers without one, share `storage`. */
    session: WorkspaceStorage | null = storage,
  ) {
    this.collection = collection;
    this.storage = storage;
    this.session = session;
    const restored = restoreWorkspace({
      storage,
      session,
      collection,
      knownSources,
      sourceIndexComplete,
      navigation: this.navigation,
    });
    const initial = withSidePanels(restored.state, restored.fresh ?? false);
    this.store = new WorkspaceStore({
      initial,
      shared: {
        arrangement: {
          load: () => undefined,
          save: (arrangement) => {
            storage?.setItem(
              panelStorageKey(collection),
              JSON.stringify({ version: 2, arrangement }),
            );
            // History changes with what is open, even when the window state itself does not.
            this.saveWindow();
          },
        },
        window: { load: () => undefined, save: () => this.saveWindow() },
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
  /**
   * Save when the page goes away, and once more when the workspace is taken down. While
   * attached, an arrangement saved by another window on the collection is taken up here.
   */
  attach(): () => void {
    const key = panelStorageKey(this.collection);
    const told = (event: StorageEvent): void => {
      if (event.key === key && event.newValue) {
        this.adopt(event.newValue);
      }
    };
    globalThis.addEventListener("pagehide", this.store.flush);
    globalThis.addEventListener("storage", told);
    return () => {
      globalThis.removeEventListener("pagehide", this.store.flush);
      globalThis.removeEventListener("storage", told);
      this.store.flush();
    };
  }
  /** How this window is looking at the workspace, and its history. */
  private saveWindow(): void {
    const text = JSON.stringify({
      version: 2,
      window: windowOf(this.state),
      navigation: this.navigation.toJSON(),
      focusedPanel: this.focusedPanel,
    });
    const key = windowStorageKey(this.collection);
    this.session?.setItem(key, text);
    if (this.storage !== this.session) {
      // A copy where a new window finds it, so that it starts like the one used last.
      this.storage?.setItem(key, text);
    }
  }
  /**
   * Take up the arrangement another window saved, keeping this window's own view of it. A tab
   * with unsaved changes here stays open even if the other window closed it.
   */
  adopt(saved: string): void {
    try {
      const envelope = JSON.parse(saved) as { version?: unknown; arrangement?: unknown };
      if (envelope.version !== 2) {
        return;
      }
      const before = this.state;
      this.store.adopt(parseArrangement(envelope.arrangement), (arrived) => {
        let next = withoutInvalid(arrived, null);
        for (const id of this.dirty) {
          const panel = before.panels[id];
          if (panel && !next.panels[id]) {
            const stack = stackOfPanel(before, id);
            next = apply(next, {
              type: "add",
              panel,
              target:
                stack && findStack(next, stack.id)
                  ? { at: "stack", stack: stack.id }
                  : { at: "focus" },
              activate: false,
            });
          }
        }
        return next;
      });
    } catch {
      // Something else wrote under this key, or it is not readable: this window keeps its own.
    }
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
    } else if (this.focusedPanel && !panelTab(change.state.panels[this.focusedPanel])) {
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
  /**
   * Go to a library view. A tab already showing it is used. Otherwise the library tab in use
   * shows it, unless that tab is pinned: then the view gets a tab of its own.
   */
  openLibrary(
    view = "all-sources",
    title = t({ message: "All sources", context: "dockview workspace" }),
    paneId?: string,
  ): void {
    const pane = this.pane(paneId);
    const within = paneId ? (pane?.panels ?? []) : this.contentPanels().map(({ id }) => id);
    const libraries = within.filter((id) => this.tab(id)?.kind === "library");
    const inUse = this.activeTab()?.id;
    const preferred = (ids: readonly string[]): string | undefined =>
      ids.find((id) => id === inUse) ?? ids[0];
    const showing = preferred(libraries.filter((id) => this.tab(id)?.libraryViewId === view));
    const free = preferred(libraries.filter((id) => !this.tab(id)?.pinned));
    if (showing) {
      this.activate(showing);
    } else if (free) {
      this.showLibraryView(free, view, title);
    } else {
      this.openTab(createLibraryWorkspaceTab(view, title), pane);
    }
  }
  /** A library view in a new tab in the pane in use, even when a tab there already shows it. */
  openLibraryTab(view: string, title: string): void {
    const pane = this.pane();
    this.store.dispatch(
      this.add(
        createLibraryWorkspaceTab(view, title),
        pane ? { at: "stack", stack: pane.id } : { at: "focus" },
      ),
      skip,
    );
  }
  /** Show another view in a library tab, pinned or not: what its own view switcher does. */
  showLibraryView(id: string, view: string, title: string): void {
    const current = this.tab(id);
    if (current?.kind !== "library") {
      return;
    }
    const tab = { ...current, libraryViewId: view, title };
    this.store.dispatch(
      {
        type: "batch",
        operations: [
          { type: "update", panel: id, changes: { data: tabData(tab), title } },
          { type: "activate", panel: id },
        ],
      },
      skip,
    );
    // Showing another view in the tab that is already active is still a visit.
    this.focusedPanel = id;
    this.navigation.visit(tab);
    this.notify();
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
    if (changes.pinned === false && canFollow(tab) && tab.follow && !tab.dirty) {
      // Unpinned, a tab that was a Notes panel is one again.
      this.follow(id);
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
  /** The tab the Notes panels are about unless they follow a pane: the last one the reader used. */
  leaderTab = (): WorkspaceTab | null => this.tab(this.state.leader);
  /** The tab one Notes panel is about: the leader, or the tab leading the pane it follows. */
  subjectTab = (id: string): WorkspaceTab | null => subjectTab(this.state, id);
  /** The source a Notes panel shows, or null when there is none. */
  sourceOf = (id: string): SourceId | null => {
    const tab = this.subjectTab(id);
    // A library tab has no source of its own: its Notes are about the source picked in it.
    return tab?.kind === "source" ? tab.sourceId : tab ? this.selected : null;
  };
  setSelected(sourceId: SourceId | null): void {
    if (this.selected !== sourceId) {
      this.selected = sourceId;
      this.notify();
    }
  }
  notesPanels = (): PanelDescriptor[] => notesPanels(this.state);
  /**
   * Pin a Notes panel to the source it is showing. It becomes that source's own pinned tab,
   * where it is, and a Notes panel again when it is unpinned.
   */
  hold(id: string): void {
    const view = notesView(this.state.panels[id]);
    const sourceId = this.sourceOf(id);
    if (!view || !sourceId) {
      return;
    }
    const tab = { ...createWorkspaceTab(sourceId, view), id, pinned: true, follow: true };
    this.store.dispatch(
      {
        type: "batch",
        operations: [
          {
            type: "update",
            panel: id,
            changes: { kind: tabPanelKind, data: tabData(tab), leads: true },
          },
          { type: "follow", panel: id, follows: null },
        ],
      },
      { ...skip, animate: false },
    );
  }
  /**
   * Say whom a Notes panel is about: the tab the reader last used, or the one leading a pane,
   * so that two documents side by side can each have their notes beside them.
   */
  setFollows(id: string, follows: Follow): void {
    if (notesView(this.state.panels[id])) {
      this.store.dispatch({ type: "follow", panel: id, follows }, { ...skip, animate: false });
    }
  }
  /**
   * Let a note, annotations or citation tab show whichever source the reader is working on: it
   * becomes a Notes panel, where it is. One with unsaved changes stays as it is.
   */
  follow(id: string): void {
    const tab = this.tab(id);
    if (!canFollow(tab) || tab.dirty) {
      return;
    }
    // It was a tab the Notes panels could be about. Its source's document takes over, if open.
    const others = this.contentPanels().filter((panel) => panel.id !== id);
    const heir = (
      others.find((panel) => {
        const other = this.tab(panel.id);
        return other?.view === "document" && other.sourceId === tab.sourceId;
      }) ?? others[0]
    )?.id;
    const leading = this.state.leader === id;
    if (this.focusedPanel === id) {
      this.focusedPanel = heir ?? null;
    }
    this.store.dispatch(
      {
        type: "batch",
        operations: [
          {
            type: "update",
            panel: id,
            changes: { kind: notesPanelKind, data: { view: tab.view } },
          },
          { type: "follow", panel: id, follows: "leader" },
          ...(heir && leading ? [{ type: "lead" as const, panel: heir }] : []),
        ],
      },
      { ...skip, animate: false },
    );
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
      // A phone shows one panel at a time: a side is open while one of its panels is the screen.
      return position === "left"
        ? this.isPanelVisible(navigatorPanelId)
        : this.notesPanels().some(({ id }) => this.isPanelVisible(id));
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
   * has nothing to show, so opening it brings home the panels that start there.
   */
  toggleSidebar(position: "left" | "right"): void {
    if (this.mobile) {
      // A phone shows one panel at a time, so the button goes to that side's panel and back.
      const active = this.activePanel();
      if (active && isSidePanel(active) && homeOf(active).side === position) {
        this.backToContent();
      } else if (position === "left") {
        this.show(navigatorPanelId, true);
      } else {
        const showing = this.state.edges.right?.stack.active;
        const panel = (showing ? this.state.panels[showing] : undefined) ?? this.notesPanels()[0];
        this.showNotes(notesView(panel) ?? "annotations");
      }
      return;
    }
    if (this.isSidebarVisible(position)) {
      this.hide(position);
    } else if (this.state.edges[position]?.stack.panels.length) {
      this.reveal(position);
    } else {
      this.reveal(position, this.homeOperations(position));
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
  /**
   * What fills an empty side region with the panels that start there. Ones that were closed
   * come back; only when none was closed do the ones elsewhere in the workspace come home.
   */
  private homeOperations(side: "left" | "right"): Operation[] {
    const target: Target = { at: "edge", side };
    const existing =
      side === "right"
        ? this.notesPanels().filter((panel) => !followedPane(panel))
        : [this.state.panels[navigatorPanelId]].filter((panel) => panel !== undefined);
    const missing =
      side === "right"
        ? notesViews
            .filter((view) => !existing.some((panel) => notesView(panel) === view))
            .map(notesPanel)
        : existing.length
          ? []
          : [navigatorPanel()];
    return [
      ...(missing.length
        ? missing.map((panel) => ({ type: "add" as const, panel, target, activate: false }))
        : existing.map(({ id }) => ({
            type: "move" as const,
            panel: id,
            target,
            activate: false,
          }))),
      ...this.edgeSetup(side),
    ];
  }
  /** A side region that has been emptied starts again at the width its own panels want. */
  private edgeSetup(side: "left" | "right"): Operation[] {
    return this.state.edges[side]?.stack.panels.length
      ? []
      : [
          {
            type: "configureEdge",
            side,
            options: {
              size: side === "left" ? navigatorWidth : notesWidth,
              min: 180,
              priority: side === "left" ? 1 : 0,
            },
          },
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
   * Show or put away Sources or a Notes panel, wherever the reader has moved it. Putting it
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
  /** Go to the Notes panel for one of a source's tools. One that was closed comes back. */
  showNotes(view: NotesView, activate = true): void {
    // One that follows a pane was put there for that pane; this is the one for everything else.
    const existing = this.notesPanels().find(
      (panel) => notesView(panel) === view && !followedPane(panel),
    );
    if (existing) {
      this.show(existing.id, activate);
      return;
    }
    this.bring("right", [
      { type: "add", panel: notesPanel(view), target: { at: "edge", side: "right" }, activate },
      ...this.edgeSetup("right"),
    ]);
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
    } else if (id === navigatorPanelId) {
      this.bring("left", [
        { type: "add", panel: navigatorPanel(), target: { at: "edge", side: "left" }, activate },
        ...this.edgeSetup("left"),
      ]);
    }
  }
  /** Add panels to the side they start at, and put that side on screen. */
  private bring(side: "left" | "right", operations: readonly Operation[]): void {
    if (!this.mobile) {
      this.reveal(side, operations);
      return;
    }
    // A phone's screen says nothing about whether the side is open on a wider window.
    const visible = this.state.edges[side]?.visible ?? false;
    this.store.dispatch(
      {
        type: "batch",
        operations: [...operations, { type: "configureEdge", side, options: { visible } }],
      },
      skip,
    );
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
    const away = (panel: PanelDescriptor, side: EdgeSide): boolean => {
      const stack = stackOfPanel(this.state, panel.id);
      return !stack || edgeOfStack(this.state, stack.id) !== side;
    };
    const home = (panel: PanelDescriptor, side: EdgeSide): Operation => ({
      type: "move",
      panel: panel.id,
      target: { at: "edge", side },
      activate: false,
    });
    const navigator = this.state.panels[navigatorPanelId];
    if (navigator) {
      operations.push(...(away(navigator, "left") ? [home(navigator, "left")] : []), {
        type: "configureEdge",
        side: "left",
        options: { size: navigatorWidth, visible: true },
      });
    }
    // The Notes panels go back to the right, and ones that were closed come back with them.
    const notes = this.notesPanels();
    // With every tab in one pane there is no pane to tell apart from the rest.
    operations.push(
      ...notes
        .filter((panel) => followedPane(panel))
        .map((panel) => ({ type: "follow" as const, panel: panel.id, follows: "leader" as const })),
    );
    const strays = notes.filter((panel) => away(panel, "right"));
    const closed = notesViews.filter((view) => !notes.some((panel) => notesView(panel) === view));
    operations.push(
      ...strays.map((panel) => home(panel, "right")),
      ...closed.map((view) => ({
        type: "add" as const,
        panel: notesPanel(view),
        target: { at: "edge" as const, side: "right" as const },
        activate: false,
      })),
    );
    // Putting a panel into a region opens it, and a panel that was closed is not asking to show.
    const open = Boolean(strays.length || this.state.edges.right?.visible);
    if (open || closed.length) {
      operations.push({
        type: "configureEdge",
        side: "right",
        options: { size: notesWidth, visible: open },
      });
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
