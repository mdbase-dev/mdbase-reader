import { DockviewNavigation } from "./dockview-navigation.js";
import { restoreDockWorkspace } from "./dockview-workspace-migration.js";
import {
  dockStorageKey,
  initialDockSnapshot,
  panelTab,
  projectDockLayout,
  serializeDockState,
} from "./dockview-workspace-state.js";

import type { ReaderDockWorkspace } from "./dockview-workspace.js";
import type { WorkspaceStorage } from "./source-workspace-persistence.js";
import type { SourceId } from "@mdbase-reader/core";
import type { DockviewApi, SerializedDockview } from "dockview-react";

interface SnapshotOptions {
  readonly collection: string;
  readonly storage: WorkspaceStorage | null;
  readonly knownSources: ReadonlySet<SourceId>;
  readonly api: () => DockviewApi | null;
  readonly prepare: (api: DockviewApi) => void;
  readonly serialize: (api: DockviewApi, focused: string | null) => SerializedDockview;
}
/** Reader metadata and a read-only projection; native Dockview remains the layout owner. */
export class DockviewWorkspaceSnapshot {
  ready = false;
  focusedPanel: string | null = null;
  readonly navigation = new DockviewNavigation();
  private layout = initialDockSnapshot();
  private listeners = new Set<() => void>();
  private scheduled = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly options: SnapshotOptions) {}
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): typeof this.layout => this.layout;
  visit(panel: Parameters<typeof panelTab>[0]): void {
    const tab = panelTab(panel);
    if (tab) {
      this.focusedPanel = tab.id;
      this.navigation.visit(tab);
      this.layout = { ...this.layout, recentSourceIds: this.navigation.recentSourceIds };
    }
  }
  restore(dock: ReaderDockWorkspace): void {
    const restored = restoreDockWorkspace(
      dock,
      this.navigation,
      this.options.storage,
      this.options.collection,
      this.options.knownSources,
    );
    if (restored) {
      this.layout = { ...this.layout, recentSourceIds: restored.recentSourceIds };
    }
    this.focusedPanel =
      panelTab(dock.api?.getPanel(restored?.focusedPanel ?? ""))?.id ??
      panelTab(dock.api?.activePanel)?.id ??
      dock.contentPanels()[0]?.id ??
      null;
    this.visit(dock.api?.getPanel(this.focusedPanel ?? ""));
  }
  detach(): void {
    clearTimeout(this.timer);
    this.ready = false;
  }
  schedule = (): void => {
    if (this.scheduled) {
      return;
    }
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      const api = this.options.api();
      if (!api || !this.ready) {
        return;
      }
      this.options.prepare(api);
      this.layout = projectDockLayout(api, this.focusedPanel, this.layout);
      this.listeners.forEach((listener) => listener());
      clearTimeout(this.timer);
      this.timer = setTimeout(this.persist, 200);
    });
  };
  persist = (): void => {
    const api = this.options.api();
    if (!api || !this.ready) {
      return;
    }
    try {
      this.options.storage?.setItem(
        dockStorageKey(this.options.collection),
        serializeDockState(
          api,
          this.navigation.toJSON(),
          this.focusedPanel,
          this.options.serialize(api, this.focusedPanel),
        ),
      );
    } catch {
      /* Optional persistence must not prevent reading. */
    }
  };
}
