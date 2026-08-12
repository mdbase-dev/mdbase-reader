import { useLayoutEffect, useRef, useState } from "react";

import {
  useDismissTabMenus,
  useKeepActiveTabVisible,
  useTabOverflow,
} from "./source-tab-strip-hooks.js";
import { SourceTab } from "./SourceTab.js";
import { TabOverflowMenu, WorkspaceStripMenu } from "./SourceTabMenus.js";
import { workspacePaneName } from "./workspace-tab-display.js";

import type {
  SourceWorkspacePane,
  WorkspacePaneId,
  WorkspaceTab,
} from "./source-workspace-layout.js";
import type { TabContextMenuPosition } from "./tab-context-menu.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export interface SourceTabStripProps {
  readonly pane: SourceWorkspacePane;
  readonly workspace: SourceWorkspaceController;
  readonly sourceFor: (tab: WorkspaceTab) => SourceSummary | null;
  readonly onActivate: (tab: WorkspaceTab) => void;
  readonly onPromote: (tab: WorkspaceTab) => void;
  readonly onPin: (tab: WorkspaceTab, pinned: boolean) => void;
  readonly onClose: (tab: WorkspaceTab) => void;
  readonly onCloseOthers: (tab: WorkspaceTab) => void;
  readonly onCloseToRight: (tab: WorkspaceTab) => void;
  readonly onOpenBeside: (tab: WorkspaceTab, direction: "horizontal" | "vertical") => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
  readonly onMoveFromPane: (tabId: WorkspaceTab["id"], fromPaneId: WorkspacePaneId) => void;
}

export function SourceTabStrip(props: SourceTabStripProps): JSX.Element | null {
  const { pane, workspace, sourceFor, onActivate, onPromote, onClose, onReorder, onMoveFromPane } =
    props;
  const trackRef = useRef<HTMLDivElement>(null);
  const stripMenuRef = useRef<HTMLDetailsElement>(null);
  const overflowMenuRef = useRef<HTMLDetailsElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [context, setContext] = useState<{
    readonly tabId: WorkspaceTab["id"];
    readonly position: TabContextMenuPosition;
  } | null>(null);
  const [showPreviewHint, setShowPreviewHint] = useState(previewHintAvailable);
  const split = workspace.layout.panes.length === 2;
  const active = pane.tabs.find(({ id }) => id === pane.activeTabId) ?? null;
  const menuTab = pane.tabs.find(({ id }) => id === context?.tabId) ?? active;

  useTabOverflow(trackRef, setOverflowing, pane.tabs.length);
  useKeepActiveTabVisible(trackRef, pane.activeTabId);
  useDismissTabMenus(stripMenuRef, overflowMenuRef);
  useLayoutEffect(() => {
    if (context && stripMenuRef.current) {
      stripMenuRef.current.open = true;
    }
  }, [context]);

  if (pane.tabs.length === 0) {
    return null;
  }
  return (
    <div
      className="source-tab-strip"
      role="tablist"
      aria-label={`Open tabs in pane ${workspacePaneName(pane.id)}`}
    >
      {split ? (
        <PaneMarker
          pane={pane}
          focused={workspace.layout.focusedPaneId === pane.id}
          onFocus={() => workspace.focus(pane.id)}
        />
      ) : null}
      <div className="source-tab-track" ref={trackRef}>
        {pane.tabs.map((tab, index) => (
          <SourceTab
            key={tab.id}
            tab={tab}
            index={index}
            pane={pane}
            source={sourceFor(tab)}
            onContextTab={(tabId, position) => setContext({ tabId, position })}
            onActivate={onActivate}
            onPromote={onPromote}
            onClose={onClose}
            onReorder={onReorder}
            onMoveFromPane={onMoveFromPane}
          />
        ))}
      </div>
      {overflowing ? (
        <TabOverflowMenu
          detailsRef={overflowMenuRef}
          pane={pane}
          sourceFor={sourceFor}
          onActivate={onActivate}
        />
      ) : null}
      <WorkspaceStripMenu
        detailsRef={stripMenuRef}
        contextPosition={context?.position ?? null}
        pane={pane}
        tab={menuTab}
        source={menuTab ? sourceFor(menuTab) : null}
        workspace={workspace}
        onMenuOpen={() => setContext(null)}
        onPin={props.onPin}
        onClose={props.onClose}
        onCloseOthers={props.onCloseOthers}
        onCloseToRight={props.onCloseToRight}
        onOpenBeside={props.onOpenBeside}
      />
      {active?.preview && showPreviewHint ? (
        <div className="source-tab-preview-tip" role="status">
          <span>Preview tab</span>
          Double-click the tab or start reading to keep it open.
          <button
            type="button"
            onClick={() => {
              dismissPreviewHint();
              setShowPreviewHint(false);
            }}
          >
            Got it
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PaneMarker({
  pane,
  focused,
  onFocus,
}: {
  readonly pane: SourceWorkspacePane;
  readonly focused: boolean;
  readonly onFocus: () => void;
}): JSX.Element {
  return (
    <button
      className="source-tab-context"
      type="button"
      aria-label={`Pane ${workspacePaneName(pane.id)}${focused ? ", focused" : ""}`}
      title={
        focused
          ? `Pane ${workspacePaneName(pane.id)} is focused`
          : `Focus pane ${workspacePaneName(pane.id)}`
      }
      onClick={onFocus}
    >
      <span>Pane</span> {workspacePaneName(pane.id)}
    </button>
  );
}

const previewHintKey = "mdbase-reader:preview-tab-hint";

function previewHintAvailable(): boolean {
  try {
    return globalThis.localStorage.getItem(previewHintKey) !== "dismissed";
  } catch {
    return true;
  }
}

function dismissPreviewHint(): void {
  try {
    globalThis.localStorage.setItem(previewHintKey, "dismissed");
  } catch {
    // The in-session dismissal still works when storage is unavailable.
  }
}
