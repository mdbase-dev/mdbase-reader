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
  useRef,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import { dockTabMenu } from "./dockview-menus.js";
import { DocumentWorkspace, type DocumentWorkspaceProps } from "./DocumentWorkspace.js";
import { useProgressiveWorkspaceTabs } from "./use-progressive-workspace-tabs.js";
import { workspaceTabAccessibleTitle } from "./workspace-tab-display.js";

import type { WorkspaceTab } from "./source-workspace-layout.js";
import "dockview-react/dist/styles/dockview.css";
import "./dockview-workspace.css";

interface DockContextValue {
  readonly document: DocumentWorkspaceProps;
  readonly navigator: ReactNode;
  readonly inspector: ReactNode;
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
const NavigatorPanel = (): JSX.Element => <>{useDockContext().navigator}</>;
const InspectorPanel = (): JSX.Element => <>{useDockContext().inspector}</>;
const components = {
  workspace: WorkspacePanel,
  navigator: NavigatorPanel,
  inspector: InspectorPanel,
};
const theme = { name: "reader", className: "dockview-theme-reader" };

export function DockviewWorkspace({
  navigator,
  inspector,
  ...document
}: DocumentWorkspaceProps & {
  readonly navigator: ReactNode;
  readonly inspector: ReactNode;
}): JSX.Element {
  const dock = document.sourceWorkspace.dock;
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const layout = document.sourceWorkspace.layout;
  const hydrationLayout = useMemo(
    () => ({
      ...layout,
      panes: layout.panes.map((pane) => {
        const panel = dock.api?.getPanel(pane.activeTabId ?? "");
        const visible =
          panel?.api.isVisible && (!dock.api?.hasMaximizedGroup() || panel.group.api.isMaximized());
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
    <DockContext value={{ document, navigator, inspector, hydrated }}>
      <div className="reader-dock dockview-theme-light" aria-label="Reader workspace">
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
  const visible = useSyncExternalStore(subscribe, () => props.api.isVisible);
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
  const { document } = useDockContext();
  const tab = props.params.tab;
  return (
    <div
      className={`reader-dock-tab${tab?.preview ? " is-preview" : ""}${tab?.dirty ? " is-dirty" : ""}`}
      data-panel-id={props.api.id}
      title="Drag to move or split · Right-click for pane actions · Use the pane menu for keyboard controls"
      onDoubleClick={() => document.sourceWorkspace.dock.patch(props.api.id, { preview: false })}
    >
      {tab?.pinned ? (
        <span aria-label="Pinned" className="dock-tab-marker">
          ◆
        </span>
      ) : null}
      {tab?.dirty ? (
        <span aria-label="Unsaved changes" className="dock-tab-marker">
          ●
        </span>
      ) : null}
      <DockviewDefaultTab
        {...props}
        closeActionOverride={() => document.sourceWorkspace.dock.close(props.api.id)}
      />
    </div>
  );
}
function PaneActions({ group }: IDockviewHeaderActionsProps): JSX.Element {
  const { document } = useDockContext();
  const dock = document.sourceWorkspace.dock;
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const id = `reader-pane-menu-${group.id}`;
  const run = (action: () => void): void => {
    menu.current?.hidePopover();
    action();
  };
  return (
    <div className="dock-pane-menu">
      <button
        type="button"
        aria-label="Pane actions"
        title="Pane actions"
        popoverTarget={id}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setPosition({
            top: Math.max(8, Math.min(bounds.bottom + 4, globalThis.innerHeight - 260)),
            left: Math.max(8, bounds.right - 245),
          });
        }}
      >
        ⋯
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        className="dock-pane-popover"
        style={position}
        role="group"
        aria-label="Pane actions"
      >
        <button
          type="button"
          onClick={() =>
            run(() => (group.api.isMaximized() ? group.api.exitMaximized() : group.api.maximize()))
          }
        >
          Maximize / restore pane
        </button>
        <button
          type="button"
          disabled={group.panels.length < 2}
          onClick={() =>
            run(() => {
              const panel = group.activePanel;
              if (panel) {
                dock.split(panel.id, "horizontal");
              }
            })
          }
        >
          Move tab to pane right
        </button>
        <button
          type="button"
          disabled={group.panels.length < 2}
          onClick={() =>
            run(() => {
              const panel = group.activePanel;
              if (panel) {
                dock.split(panel.id, "vertical");
              }
            })
          }
        >
          Move tab to pane below
        </button>
        <button type="button" onClick={() => run(() => dock.merge(group.id))}>
          Merge into another reading pane
        </button>
        <button
          type="button"
          onClick={() => run(() => dock.closeMany(group.panels.map(({ id }) => id)))}
        >
          Close pane and tabs…
        </button>
        <button type="button" onClick={() => run(() => dock.reset())}>
          Reset arrangement (keep tabs)
        </button>
      </div>
    </div>
  );
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
