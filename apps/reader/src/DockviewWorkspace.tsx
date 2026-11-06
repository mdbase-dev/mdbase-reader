import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
  useId,
  type JSX,
  type ReactNode,
} from "react";

import { DockPaneActions } from "./DockPaneActions.js";
import { dockTabMenu } from "./dockview-menus.js";
import { inspectorPanelId, navigatorPanelId } from "./dockview-panel-ids.js";
import { dockPanelVisible } from "./dockview-panel-visibility.js";
import { sidePanelTitle } from "./dockview-side-panels.js";
import { panelTab } from "./dockview-workspace-state.js";
import {
  DocumentToolbar,
  DocumentWorkspace,
  type DocumentWorkspaceProps,
} from "./DocumentWorkspace.js";
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
  const dock = useDockContext().document.sourceWorkspace.dock;
  const visible = dock.isSideVisible(id);
  const location = dock.api?.getPanel(id)?.api.location;
  return (
    <div
      className="reader-dock-sidebar"
      data-panel-id={id}
      data-reader-edge={location?.type === "edge" ? location.position : undefined}
      data-visible={visible}
      inert={!visible}
      aria-hidden={!visible}
    >
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
  const { t } = useLingui();
  const inspectorTitle = inspectorSource?.title ?? null;
  const dock = document.sourceWorkspace.dock;
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const layout = document.sourceWorkspace.layout;
  const engine = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = engine.current;
    if (!element) {
      return;
    }
    const layoutViewport = (): void =>
      dock.layoutViewport(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver(layoutViewport);
    observer.observe(element);
    layoutViewport();
    return () => observer.disconnect();
  }, [dock]);
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
    for (const animation of engine.current?.getAnimations({ subtree: true }) ?? []) {
      const effect = animation.effect;
      if (
        effect instanceof KeyframeEffect &&
        effect.target instanceof HTMLElement &&
        effect.target.classList.contains("dv-render-overlay")
      ) {
        animation.finish();
      }
    }
  };
  useEffect(() => () => cleanup.current?.(), []);
  return (
    <DockContext value={{ document, navigator, inspector, inspectorTitle, hydrated }}>
      <div
        className="reader-dock dockview-theme-light"
        data-mobile={dock.mobile || undefined}
        aria-label={t({ message: "Reader workspace", context: "DockviewWorkspace interface" })}
      >
        <MobileWorkspaceNavigation dock={dock} />
        <div className="reader-dock-engine" ref={engine}>
          <DockviewReact
            disableAutoResizing
            components={components}
            theme={theme}
            getAnnouncement={({ kind, panel }) => {
              const tab = panelTab(panel);
              if (kind !== "open" || !tab) {
                return undefined;
              }
              const source =
                tab.kind === "source"
                  ? document.sources.find(({ id }) => id === tab.sourceId)
                  : null;
              const title = workspaceTabAccessibleTitle(tab, source ?? null);
              return tab.kind === "source" && tab.view === "document"
                ? t`Opening ${title}`
                : t`Opened ${title}`;
            }}
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
          composer={document.annotationComposer}
        />
      </div>
    </DockContext>
  );
}

function WorkspacePanel(props: IDockviewPanelProps<{ tab?: WorkspaceTab }>): JSX.Element | null {
  const { t } = useLingui();
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
  const title = tab
    ? workspaceTabAccessibleTitle(tab, source ?? null)
    : t({ message: "Source", context: "DockviewWorkspace status or action" });
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
  const { t } = useLingui();
  const { document, inspectorTitle } = useDockContext();
  const label = useId();
  const element = useRef<HTMLDivElement>(null);
  const dock = document.sourceWorkspace.dock;
  const side = sidePanelIds.has(props.api.id);
  useLayoutEffect(() => {
    const tab = element.current?.closest<HTMLElement>('[role="tab"]');
    const close = (event: KeyboardEvent): void => {
      if (!side && ["Delete", "Backspace"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        dock.close(props.api.id);
      }
    };
    tab?.setAttribute("aria-labelledby", label);
    tab?.addEventListener("keydown", close, true);
    return () => {
      tab?.removeAttribute("aria-labelledby");
      tab?.removeEventListener("keydown", close, true);
    };
  }, [dock, label, props.api.id, side]);
  const tab = props.params.tab;
  const title = side
    ? sidePanelTitle(props.api.id)
    : (props.api.title ??
      translate({ message: "Source", context: "DockviewWorkspace status or action" }));
  useEffect(() => {
    if (side && props.api.title !== title) {
      props.api.setTitle(title);
    }
  }, [props.api, side, title]);
  return (
    // A tab is one control, so its close affordance is pointer-only; the keyboard uses Delete,
    // the tab's context menu or the pane menu, all of which go through the dirty-tab guard.
    <div
      ref={element}
      id={label}
      className={`reader-dock-tab${tab?.preview ? " is-preview" : ""}${tab?.dirty ? " is-dirty" : ""}${side ? " is-side" : ""}`}
      data-panel-id={props.api.id}
      title={t`${title} · Drag to move or split · Right-click for pane actions · Delete closes the tab`}
      onDoubleClick={() => document.sourceWorkspace.dock.patch(props.api.id, { preview: false })}
    >
      {tab?.pinned ? (
        <span
          aria-label={t({ message: "Pinned", context: "DockviewWorkspace interface" })}
          className="dock-tab-marker is-pinned"
        >
          <PinIcon />
        </span>
      ) : null}
      {tab?.dirty ? (
        <span
          aria-label={t({ message: "Unsaved changes", context: "DockviewWorkspace interface" })}
          className="dock-tab-marker is-dirty"
        />
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
          title={t({ message: "Close tab", context: "DockviewWorkspace interface" })}
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
/** The end of a pane's tab strip: its active document's actions, then the pane's own. */
function PaneActions({ group, activePanel }: IDockviewHeaderActionsProps): JSX.Element {
  const { document } = useDockContext();
  const tab = activePanel ? panelTab(activePanel) : null;
  const source =
    tab?.kind === "source" && tab.view === "document"
      ? document.sources.find(({ id }) => id === tab.sourceId)
      : undefined;
  const pane = document.sourceWorkspace.layout.panes.find(({ id }) => id === group.id);
  return (
    <div className="dock-pane-actions">
      {/* A phone has no tab strip; its header carries the document's actions. */}
      {tab && source?.documents.length && pane && !document.sourceWorkspace.dock.mobile ? (
        <DocumentToolbar
          props={document}
          source={source}
          pane={pane}
          tabId={tab.id}
          focused={document.sourceWorkspace.activePane.activeTabId === tab.id}
        />
      ) : null}
      <DockPaneActions group={group} dock={document.sourceWorkspace.dock} />
    </div>
  );
}
function EmptyDock(): JSX.Element {
  const { document } = useDockContext();
  return (
    <div className="dock-empty">
      <h2>
        <Trans>Make room to read</Trans>
      </h2>
      <p>
        <Trans>Open a source from the library. Drag tabs to arrange your workspace.</Trans>
      </p>
      <button type="button" onClick={() => document.sourceWorkspace.openLibrary()}>
        <Trans>Open library</Trans>
      </button>
    </div>
  );
}
