import {
  DockviewDefaultTab,
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type IDockviewPanelHeaderProps,
  type IDockviewHeaderActionsProps,
} from "dockview-react";
import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  type JSX,
  type ReactNode,
} from "react";

import { DockPaneActions } from "./DockPaneActions.js";
import { dockTabMenu } from "./dockview-menus.js";
import { inspectorPanelId, navigatorPanelId } from "./dockview-panel-ids.js";
import { dockPanelVisible } from "./dockview-panel-visibility.js";
import { DocumentWorkspace, type DocumentWorkspaceProps } from "./DocumentWorkspace.js";
import { CloseIcon, PinIcon } from "./icons.js";
import { MobileSourceViews } from "./MobileSourceViews.js";
import { MobileWorkspaceNavigation } from "./MobileWorkspaceNavigation.js";
import { useProgressiveWorkspaceTabs } from "./use-progressive-workspace-tabs.js";
import { workspaceTabAccessibleTitle } from "./workspace-tab-display.js";

import type { WorkspaceTab } from "./source-workspace-layout.js";
import type { SourceSummary } from "@mdbase-reader/core";
import "dockview-react/dist/styles/dockview.css";
import "./dockview-workspace.css";

interface DockContextValue {
  readonly document: DocumentWorkspaceProps;
  readonly navigator: ReactNode;
  readonly inspector: ReactNode;
  /** The inspected source's title, shown on the inspector's own tab. */
  readonly inspectorTitle: string | null;
  readonly hydrated: ReadonlySet<string>;
}
const DockContext = createContext<DockContextValue | null>(null);
function useDockContext(): DockContextValue {
  const value = useContext(DockContext);
  if (!value) {
    throw new Error("Missing Reader dock context");
  }
  return value;
}
function SidePanel({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}): JSX.Element {
  const visible = useDockContext().document.sourceWorkspace.dock.isSideVisible(id);
  return (
    <div className="reader-dock-sidebar" hidden={!visible} inert={!visible}>
      {children}
    </div>
  );
}
const NavigatorPanel = (): JSX.Element => (
  <SidePanel id={navigatorPanelId}>{useDockContext().navigator}</SidePanel>
);
const InspectorPanel = (): JSX.Element => (
  <SidePanel id={inspectorPanelId}>{useDockContext().inspector}</SidePanel>
);
const components = {
  workspace: WorkspacePanel,
  navigator: NavigatorPanel,
  inspector: InspectorPanel,
};
const theme = { name: "reader", className: "dockview-theme-reader" };
const sidePanelIds: ReadonlySet<string> = new Set([navigatorPanelId, inspectorPanelId]);

export function DockviewWorkspace({
  navigator,
  inspector,
  inspectorSource = null,
  ...document
}: DocumentWorkspaceProps & {
  readonly navigator: ReactNode;
  readonly inspector: ReactNode;
  readonly inspectorSource?: SourceSummary | null;
}): JSX.Element {
  const inspectorTitle = inspectorSource?.title ?? null;
  const dock = document.sourceWorkspace.dock;
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const layout = document.sourceWorkspace.layout;
  const engine = useRef<HTMLDivElement>(null);
  const mobile = dock.mobile;
  useLayoutEffect(() => {
    if (engine.current) {
      dock.layoutViewport(engine.current.clientWidth, engine.current.clientHeight);
    }
  }, [dock, mobile]);
  const hydrationLayout = useMemo(
    () => ({
      ...layout,
      panes: layout.panes.map((pane) => {
        const visible = dockPanelVisible(dock.api, pane.activeTabId ?? "");
        return visible ? pane : { ...pane, activeTabId: null };
      }),
    }),
    [dock, layout],
  );
  const hydrated = useProgressiveWorkspaceTabs(hydrationLayout);
  const ready = (event: DockviewReadyEvent): void => {
    cleanup.current?.();
    cleanup.current = dock.attach(event.api);
  };
  useEffect(() => () => cleanup.current?.(), []);
  return (
    <DockContext value={{ document, navigator, inspector, inspectorTitle, hydrated }}>
      <div
        className="reader-dock dockview-theme-light"
        data-mobile={dock.mobile || undefined}
        aria-label="Reader workspace"
      >
        <MobileWorkspaceNavigation dock={dock} />
        <div className="reader-dock-engine" ref={engine}>
          <DockviewReact
            components={components}
            theme={theme}
            onReady={ready}
            defaultTabComponent={ReaderDockTab}
            rightHeaderActionsComponent={PaneActions}
            watermarkComponent={EmptyDock}
            disableFloatingGroups
            dndStrategy="pointer"
            getTabContextMenuItems={({ panel }) => dockTabMenu(dock, panel)}
          />
        </div>
        <MobileSourceViews
          dock={dock}
          workspace={document.sourceWorkspace}
          sources={document.sources}
        />
      </div>
    </DockContext>
  );
}

function WorkspacePanel(props: IDockviewPanelProps<{ tab?: WorkspaceTab }>): JSX.Element | null {
  const context = useDockContext();
  const tab = props.params.tab;
  const subscribe = useCallback(
    (listener: () => void) => {
      const subscription = props.api.onDidVisibilityChange(listener);
      return () => subscription.dispose();
    },
    [props.api],
  );
  const nativeVisible = useSyncExternalStore(subscribe, () => props.api.isVisible);
  const visible =
    nativeVisible && dockPanelVisible(context.document.sourceWorkspace.dock.api, props.api.id);
  const source =
    tab?.kind === "source" ? context.document.sources.find(({ id }) => id === tab.sourceId) : null;
  const title = tab ? workspaceTabAccessibleTitle(tab, source ?? null) : "Source";
  useEffect(() => {
    if (props.api.title !== title) {
      props.api.setTitle(title);
    }
  }, [props.api, title]);
  if (!tab) {
    return null;
  }
  return (
    <DocumentWorkspace
      props={context.document}
      tab={tab}
      paneId={props.api.group.id}
      visible={
        visible && (!props.containerApi.hasMaximizedGroup() || props.api.group.api.isMaximized())
      }
      hydrated={context.hydrated}
    />
  );
}
function ReaderDockTab(props: IDockviewPanelHeaderProps<{ tab?: WorkspaceTab }>): JSX.Element {
  const { document, inspectorTitle } = useDockContext();
  const tab = props.params.tab;
  const close = (): void => document.sourceWorkspace.dock.close(props.api.id);
  const side = sidePanelIds.has(props.api.id);
  return (
    // A tab is one control, so its close affordance is pointer-only; the keyboard uses Delete,
    // the tab's context menu or the pane menu, all of which go through the dirty-tab guard.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={`reader-dock-tab${tab?.preview ? " is-preview" : ""}${tab?.dirty ? " is-dirty" : ""}${side ? " is-side" : ""}`}
      data-panel-id={props.api.id}
      title="Drag to move or split · Right-click for pane actions · Delete closes the tab"
      onDoubleClick={() => document.sourceWorkspace.dock.patch(props.api.id, { preview: false })}
      onKeyDown={(event) => {
        if (event.key === "Delete" && !side) {
          event.preventDefault();
          close();
        }
      }}
    >
      {tab?.pinned ? (
        <span aria-label="Pinned" className="dock-tab-marker is-pinned">
          <PinIcon />
        </span>
      ) : null}
      {tab?.dirty ? (
        <span aria-label="Unsaved changes" className="dock-tab-marker is-dirty" />
      ) : null}
      {props.api.id === inspectorPanelId && inspectorTitle ? (
        // The panel keeps its stable title; its tab names the source it inspects instead of
        // repeating that name in a row of its own.
        <div className="dv-default-tab">
          <span className="dv-default-tab-content" title={inspectorTitle}>
            <span className="sr-only">{props.api.title}: </span>
            {inspectorTitle}
          </span>
        </div>
      ) : (
        <DockviewDefaultTab {...props} hideClose />
      )}
      {side ? null : (
        <span
          className="dv-default-tab-action reader-tab-close"
          aria-hidden="true"
          title="Close tab"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            close();
          }}
        >
          <CloseIcon />
        </span>
      )}
    </div>
  );
}
function PaneActions({ group }: IDockviewHeaderActionsProps): JSX.Element {
  const { document } = useDockContext();
  return <DockPaneActions group={group} dock={document.sourceWorkspace.dock} />;
}
function EmptyDock(): JSX.Element {
  const { document } = useDockContext();
  return (
    <div className="dock-empty">
      <h2>Make room to read</h2>
      <p>Open a source from the library. Drag tabs to arrange your workspace.</p>
      <button type="button" onClick={() => document.sourceWorkspace.openLibrary()}>
        Open library
      </button>
    </div>
  );
}
