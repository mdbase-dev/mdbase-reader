import { Trans, useLingui } from "@lingui/react/macro";
import {
  Workspace,
  type PanelInfo,
  type StackInfo,
  type TabInfo,
  type WorkspaceProps,
} from "@mdbase-dev/panels/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from "react";

import {
  DocumentToolbar,
  DocumentWorkspace,
  type DocumentWorkspaceProps,
} from "./DocumentWorkspace.js";
import { CloseIcon, PinIcon } from "./icons.js";
import { MobileSourceViews } from "./MobileSourceViews.js";
import { MobileWorkspaceNavigation } from "./MobileWorkspaceNavigation.js";
import { PaneActions } from "./PaneActions.js";
import { navigatorPanelId } from "./panel-ids.js";
import { tabMenu } from "./panel-menus.js";
import { followedPane, isSidePanel, notesView } from "./panel-workspace-state.js";
import { useProgressiveWorkspaceTabs } from "./use-progressive-workspace-tabs.js";
import { sidePanelTitle, workspaceTabAccessibleTitle } from "./workspace-tab-display.js";

import type { ReaderPanelWorkspace } from "./panel-workspace.js";
import type { NotesView, SourceWorkspaceLayout } from "./source-workspace-layout.js";
import type { PanelDescriptor, WorkspaceChange } from "@mdbase-dev/panels";
import type { SourceSummary } from "@mdbase-reader/core";
import "@mdbase-dev/panels/styles.css";
import "./panel-workspace.css";

const coarsePointer = "(pointer: coarse)";
function subscribeCoarse(listener: () => void): () => void {
  const query = globalThis.matchMedia(coarsePointer);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** A tab: its title, with markers for a pinned tab and for unsaved changes. */
function ReaderTab({
  dock,
  panel,
  title,
  count,
  close,
}: {
  readonly dock: ReaderPanelWorkspace;
  readonly panel: PanelDescriptor;
  readonly title: string;
  /** How many annotations the Annotations panel is showing, when it has any. */
  readonly count: number | null;
  readonly close: () => void;
}): JSX.Element {
  const { t } = useLingui();
  const tab = dock.tab(panel.id);
  const side = isSidePanel(panel);
  return (
    // A tab is one control, so its close affordance is pointer-only; the keyboard uses Delete,
    // the tab's context menu or the pane menu, all of which go through the dirty-tab guard.
    <div
      className={`reader-dock-tab${tab?.preview ? " is-preview" : ""}${tab?.dirty ? " is-dirty" : ""}${side ? " is-side" : ""}`}
      data-panel-id={panel.id}
      title={t`${title} · Drag to move or split · Right-click for pane actions · Delete closes the tab`}
      onDoubleClick={() => dock.patch(panel.id, { preview: false })}
    >
      {tab?.pinned ? (
        <span
          role="img"
          aria-label={t({ message: "Pinned", context: "DockviewWorkspace interface" })}
          className="dock-tab-marker is-pinned"
        >
          <PinIcon />
        </span>
      ) : null}
      {tab?.dirty ? (
        <span
          role="img"
          aria-label={t({ message: "Unsaved changes", context: "DockviewWorkspace interface" })}
          className="dock-tab-marker is-dirty"
        />
      ) : null}
      <span className="reader-tab-title">{title}</span>
      {count ? <span className="reader-tab-count">{count}</span> : null}
      <span
        className="reader-tab-close"
        aria-hidden="true"
        title={t({ message: "Close tab", context: "DockviewWorkspace interface" })}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          close();
        }}
      >
        <CloseIcon />
      </span>
    </div>
  );
}

function EmptyWorkspace({ openLibrary }: { readonly openLibrary: () => void }): JSX.Element {
  return (
    <div className="dock-empty">
      <h2>
        <Trans>Make room to read</Trans>
      </h2>
      <p>
        <Trans>Open a source from the library. Drag tabs to arrange your workspace.</Trans>
      </p>
      <button type="button" onClick={openLibrary}>
        <Trans>Open library</Trans>
      </button>
    </div>
  );
}

/** Names for panels, kept on the panels so menus, the overview and other panes can use them. */
function usePanelTitles(
  dock: ReaderPanelWorkspace,
  sources: readonly SourceSummary[],
): {
  readonly sourceOf: (panel: PanelDescriptor) => SourceSummary | null;
  readonly titleOf: (panel: PanelDescriptor) => string;
} {
  const { t } = useLingui();
  const sourceOf = useCallback(
    (panel: PanelDescriptor) => {
      const tab = dock.tab(panel.id);
      return tab?.kind === "source"
        ? (sources.find(({ id }) => id === tab.sourceId) ?? null)
        : null;
    },
    [dock, sources],
  );
  const titleOf = (panel: PanelDescriptor): string => {
    const tab = dock.tab(panel.id);
    if (tab) {
      return workspaceTabAccessibleTitle(tab, sourceOf(panel));
    }
    if (!isSidePanel(panel)) {
      return t({ message: "Source", context: "DockviewWorkspace status or action" });
    }
    // A Notes panel that follows a pane says whose notes it is showing, as a source's own tab does.
    const followed = followedPane(panel) ? dock.sourceOf(panel.id) : null;
    const source = followed ? sources.find(({ id }) => id === followed) : null;
    return source ? `${sidePanelTitle(panel)} — ${source.title}` : sidePanelTitle(panel);
  };
  useEffect(() => {
    for (const panel of Object.values(dock.store.state.panels)) {
      dock.setTitle(panel.id, titleOf(panel));
    }
  });
  return { sourceOf, titleOf };
}

function useCoarsePointer(dock: ReaderPanelWorkspace): void {
  const coarse = useSyncExternalStore(
    subscribeCoarse,
    () => globalThis.matchMedia(coarsePointer).matches,
  );
  useEffect(() => {
    dock.setCoarse(coarse);
  }, [dock, coarse]);
}

/** What the workspace says: its control names, and what it announces when a tab opens. */
function useWorkspaceWording(
  dock: ReaderPanelWorkspace,
  titleOf: (panel: PanelDescriptor) => string,
): {
  readonly announce: (change: WorkspaceChange) => string | undefined;
  readonly labels: NonNullable<WorkspaceProps["labels"]>;
} {
  const { t } = useLingui();
  const announce = (change: WorkspaceChange): string | undefined => {
    const added =
      change.operation.type === "batch"
        ? change.operation.operations.find((operation) => operation.type === "add")
        : change.operation;
    const tab = added?.type === "add" ? dock.tab(added.panel.id) : null;
    if (added?.type !== "add" || !tab) {
      return undefined;
    }
    const title = titleOf(added.panel);
    return tab.kind === "source" && tab.view === "document"
      ? t`Opening ${title}`
      : t`Opened ${title}`;
  };
  return {
    announce,
    labels: {
      workspace: t({ message: "Reader workspace", context: "DockviewWorkspace interface" }),
      tabs: t({ message: "Open tabs" }),
      resize: t({ message: "Resize panes" }),
      overview: t({ message: "All open tabs" }),
      show: (title) => t`Show ${title}`,
    },
  };
}

/** Tabs whose content is loaded: the ones on screen first, the rest a little later. */
function useHydratedTabs(
  dock: ReaderPanelWorkspace,
  layout: SourceWorkspaceLayout,
): ReturnType<typeof useProgressiveWorkspaceTabs> {
  const visible = useMemo(
    () => ({
      ...layout,
      panes: layout.panes.map((pane) =>
        dock.isPanelVisible(pane.activeTabId ?? "") ? pane : { ...pane, activeTabId: null },
      ),
    }),
    [dock, layout],
  );
  return useProgressiveWorkspaceTabs(visible);
}

export function PanelWorkspace({
  navigator,
  renderNotes,
  annotationCount = null,
  ...document
}: DocumentWorkspaceProps & {
  readonly navigator: ReactNode;
  /** A Notes panel's content: one tool of the source it is about. */
  readonly renderNotes: (panel: PanelDescriptor, view: NotesView, visible: boolean) => ReactNode;
  /** How many annotations that source has, once known. */
  readonly annotationCount?: number | null;
}): JSX.Element {
  const { t } = useLingui();
  const dock = document.sourceWorkspace.dock;
  const layout = document.sourceWorkspace.layout;
  useEffect(() => dock.attach(), [dock]);
  useCoarsePointer(dock);
  const hydrated = useHydratedTabs(dock, layout);
  const { sourceOf, titleOf } = usePanelTitles(dock, document.sources);
  const renderPanel = (panel: PanelDescriptor, info: PanelInfo): ReactNode => {
    const tab = dock.tab(panel.id);
    if (tab) {
      return (
        <DocumentWorkspace
          props={document}
          tab={tab}
          paneId={info.stack}
          visible={info.visible && info.mode !== "overview"}
          hydrated={hydrated}
        />
      );
    }
    const view = notesView(panel);
    return (
      <div
        className="reader-dock-sidebar"
        data-panel-id={panel.id}
        data-reader-edge={info.edge ?? undefined}
        data-visible={info.visible}
        aria-hidden={!info.visible}
      >
        {panel.id === navigatorPanelId
          ? navigator
          : view
            ? renderNotes(panel, view, info.visible)
            : null}
      </div>
    );
  };
  const renderTab = (panel: PanelDescriptor, info: TabInfo): ReactNode => (
    <ReaderTab
      dock={dock}
      panel={panel}
      title={titleOf(panel)}
      count={notesView(panel) === "annotations" && !followedPane(panel) ? annotationCount : null}
      close={info.close}
    />
  );
  /** The end of a pane's tab strip: its active document's actions, then the pane's own. */
  const renderStackActions = (info: StackInfo): ReactNode => {
    const tab = info.active ? dock.tab(info.active.id) : null;
    const source = tab?.view === "document" && info.active ? sourceOf(info.active) : null;
    return (
      <div className="dock-pane-actions">
        {tab && source?.documents.length ? (
          <DocumentToolbar
            props={document}
            source={source}
            tabId={tab.id}
            focused={document.sourceWorkspace.activePane.activeTabId === tab.id}
          />
        ) : null}
        <PaneActions info={info} dock={dock} />
      </div>
    );
  };
  const { announce, labels } = useWorkspaceWording(dock, titleOf);
  return (
    <div
      className="reader-dock"
      data-mobile={dock.mobile || undefined}
      aria-label={t({ message: "Reader workspace", context: "DockviewWorkspace interface" })}
    >
      <MobileWorkspaceNavigation dock={dock} />
      <div className="reader-dock-engine">
        <Workspace
          store={dock.store}
          layout={dock.layoutOptions()}
          renderPanel={renderPanel}
          renderTab={renderTab}
          renderStackActions={renderStackActions}
          renderEmpty={() => (
            <EmptyWorkspace openLibrary={() => document.sourceWorkspace.openLibrary()} />
          )}
          tabMenu={(panel) => tabMenu(dock, panel)}
          tabTitle={titleOf}
          onRequestClose={dock.closeMany}
          overview={dock.overview}
          onOverviewChange={dock.setOverview}
          onLayout={dock.layoutChanged}
          announce={announce}
          labels={labels}
        />
      </div>
      <MobileSourceViews
        dock={dock}
        workspace={document.sourceWorkspace}
        sources={document.sources}
        composer={document.annotationComposer}
      />
    </div>
  );
}
