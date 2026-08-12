import { MoreIcon, PinIcon, TabsIcon } from "./icons.js";
import { otherPaneId } from "./source-workspace-panes.js";
import {
  workspacePaneName,
  workspaceTabLabel,
  workspaceTabTitle,
} from "./workspace-tab-display.js";

import type { SourceWorkspacePane, WorkspaceTab } from "./source-workspace-layout.js";
import type { SourceTabStripProps } from "./SourceTabStrip.js";
import type { TabContextMenuPosition } from "./tab-context-menu.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { CSSProperties, JSX, RefObject } from "react";

export function TabOverflowMenu({
  detailsRef,
  pane,
  sourceFor,
  onActivate,
}: Pick<SourceTabStripProps, "pane" | "sourceFor" | "onActivate"> & {
  readonly detailsRef: RefObject<HTMLDetailsElement | null>;
}): JSX.Element {
  return (
    <details className="workspace-strip-menu tab-overflow-menu" ref={detailsRef}>
      <summary aria-label={`Show all tabs in pane ${workspacePaneName(pane.id)}`} title="All tabs">
        <TabsIcon />
      </summary>
      <div className="workspace-menu-popover">
        <strong>Pane {workspacePaneName(pane.id)} tabs</strong>
        {pane.tabs.map((tab) => {
          const source = sourceFor(tab);
          return (
            <button
              type="button"
              className={tab.id === pane.activeTabId ? "is-active" : undefined}
              key={tab.id}
              onClick={() => runAndClose(detailsRef, () => onActivate(tab))}
            >
              <span className="workspace-menu-format">{workspaceTabLabel(tab, source)}</span>
              <span>{workspaceTabTitle(tab, source)}</span>
              {tab.pinned ? <PinIcon /> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}

type StripMenuProps = Pick<
  SourceTabStripProps,
  "pane" | "workspace" | "onPin" | "onClose" | "onCloseOthers" | "onCloseToRight" | "onOpenBeside"
> & {
  readonly detailsRef: RefObject<HTMLDetailsElement | null>;
  readonly tab: WorkspaceTab | null;
  readonly source: SourceSummary | null;
  readonly contextPosition: TabContextMenuPosition | null;
  readonly onMenuOpen: () => void;
};

export function WorkspaceStripMenu(props: StripMenuProps): JSX.Element {
  const { detailsRef, pane, tab, workspace, contextPosition, onMenuOpen } = props;
  const split = workspace.layout.panes.length === 2;
  const other = otherPaneId(pane.id);
  const run = (action: () => void): void => runAndClose(detailsRef, action);
  return (
    <details
      className={`workspace-strip-menu${contextPosition ? " is-context-positioned" : ""}${contextPosition?.opensUpward ? " opens-upward" : ""}`}
      ref={detailsRef}
      style={contextMenuStyle(contextPosition)}
    >
      <summary
        aria-label={`Pane ${workspacePaneName(pane.id)} and active tab actions`}
        title="Pane and tab actions"
        onPointerDown={onMenuOpen}
      >
        <MoreIcon />
      </summary>
      <div className="workspace-menu-popover">
        {tab ? <ActiveTabMenu {...props} tab={tab} split={split} other={other} run={run} /> : null}
        {split ? <PaneMenu pane={pane} workspace={workspace} other={other} run={run} /> : null}
      </div>
    </details>
  );
}

type ContextMenuStyle = CSSProperties & {
  readonly "--tab-context-x"?: string;
  readonly "--tab-context-y"?: string;
};

function contextMenuStyle(position: TabContextMenuPosition | null): ContextMenuStyle | undefined {
  return position
    ? {
        "--tab-context-x": `${String(position.x)}px`,
        "--tab-context-y": `${String(position.y)}px`,
      }
    : undefined;
}

function ActiveTabMenu({
  pane,
  tab,
  source,
  workspace,
  split,
  other,
  run,
  onPin,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onOpenBeside,
}: Omit<StripMenuProps, "detailsRef" | "tab" | "onMenuOpen"> & {
  readonly tab: WorkspaceTab;
  readonly split: boolean;
  readonly other: SourceWorkspacePane["id"];
  readonly run: (action: () => void) => void;
}): JSX.Element {
  return (
    <>
      <strong>{workspaceTabTitle(tab, source)}</strong>
      <button type="button" onClick={() => run(() => onPin(tab, !tab.pinned))}>
        {tab.pinned ? "Unpin tab" : "Pin tab"}
      </button>
      <button type="button" onClick={() => run(() => onOpenBeside(tab, "horizontal"))}>
        {split ? `Duplicate in pane ${workspacePaneName(other)}` : "Duplicate in new pane right"}
      </button>
      <button type="button" onClick={() => run(() => onOpenBeside(tab, "vertical"))}>
        Duplicate below
      </button>
      <MoveTabActions
        pane={pane}
        tab={tab}
        workspace={workspace}
        split={split}
        other={other}
        run={run}
      />
      <i />
      <button type="button" onClick={() => run(() => onCloseOthers(tab))}>
        Close other tabs
      </button>
      <button type="button" onClick={() => run(() => onCloseToRight(tab))}>
        Close tabs to the right
      </button>
      <button type="button" onClick={() => run(() => onClose(tab))}>
        Close tab
      </button>
    </>
  );
}

function MoveTabActions({
  pane,
  tab,
  workspace,
  split,
  other,
  run,
}: {
  readonly pane: SourceWorkspacePane;
  readonly tab: WorkspaceTab;
  readonly workspace: SourceWorkspaceController;
  readonly split: boolean;
  readonly other: SourceWorkspacePane["id"];
  readonly run: (action: () => void) => void;
}): JSX.Element {
  return split ? (
    <button type="button" onClick={() => run(() => workspace.moveTab(tab.id, pane.id, other))}>
      Move tab to pane {workspacePaneName(other)}
    </button>
  ) : (
    <>
      <button
        type="button"
        onClick={() => run(() => workspace.splitTab(tab.id, pane.id, "horizontal"))}
      >
        Move to new pane right
      </button>
      <button
        type="button"
        onClick={() => run(() => workspace.splitTab(tab.id, pane.id, "vertical"))}
      >
        Move to new pane below
      </button>
    </>
  );
}

function PaneMenu({
  pane,
  workspace,
  other,
  run,
}: {
  readonly pane: SourceWorkspacePane;
  readonly workspace: SourceWorkspaceController;
  readonly other: SourceWorkspacePane["id"];
  readonly run: (action: () => void) => void;
}): JSX.Element {
  return (
    <>
      <i />
      <strong>Pane {workspacePaneName(pane.id)}</strong>
      <button type="button" onClick={() => run(workspace.focusNextPane)}>
        Focus pane {workspacePaneName(other)}
      </button>
      <button
        type="button"
        disabled={pane.tabs.length === 0}
        onClick={() => run(() => workspace.moveAllTabs(pane.id))}
      >
        Move all tabs to pane {workspacePaneName(other)}
      </button>
      <button type="button" onClick={() => run(workspace.swapPanes)}>
        Swap panes
      </button>
      <button type="button" onClick={() => run(() => workspace.setSplitDirection("horizontal"))}>
        Arrange side by side
      </button>
      <button type="button" onClick={() => run(() => workspace.setSplitDirection("vertical"))}>
        Stack top and bottom
      </button>
      <button type="button" onClick={() => run(() => workspace.closePane(pane.id))}>
        Close pane and keep its tabs
      </button>
      <button
        className="is-danger"
        type="button"
        onClick={() => run(() => workspace.closePaneAndTabs(pane.id))}
      >
        Close pane and its tabs
      </button>
    </>
  );
}

function runAndClose(details: RefObject<HTMLDetailsElement | null>, action: () => void): void {
  details.current?.removeAttribute("open");
  action();
}
