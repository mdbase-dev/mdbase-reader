import { CloseIcon, PinIcon } from "./icons.js";
import { dropTab, startTabDrag } from "./source-tab-drag.js";
import { tabDestination } from "./source-tab-keyboard.js";
import { tabContextMenuPosition, type TabContextMenuPosition } from "./tab-context-menu.js";
import { workspaceTabLabel, workspaceTabTitle } from "./workspace-tab-display.js";

import type { WorkspaceTab } from "./source-workspace-layout.js";
import type { SourceTabStripProps } from "./SourceTabStrip.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX, KeyboardEvent } from "react";

export function SourceTab({
  tab,
  index,
  pane,
  source,
  onContextTab,
  onActivate,
  onPromote,
  onClose,
  onReorder,
  onMoveFromPane,
}: Pick<
  SourceTabStripProps,
  "pane" | "onActivate" | "onPromote" | "onClose" | "onReorder" | "onMoveFromPane"
> & {
  readonly tab: WorkspaceTab;
  readonly index: number;
  readonly source: SourceSummary | null;
  readonly onContextTab: (tabId: WorkspaceTab["id"], position: TabContextMenuPosition) => void;
}): JSX.Element | null {
  if (tab.kind === "source" && !source) {
    return null;
  }
  const selected = tab.id === pane.activeTabId;
  const title = workspaceTabTitle(tab, source);
  return (
    <div
      className={tabClassName(tab, selected)}
      data-active={selected ? "true" : "false"}
      draggable
      onContextMenu={(event) => {
        event.preventDefault();
        onContextTab(
          tab.id,
          tabContextMenuPosition(event.clientX, event.clientY, globalThis.innerHeight),
        );
        onActivate(tab);
      }}
      onDragStart={(event) => startTabDrag(event, pane.id, tab, index)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => dropTab(event, pane.id, index, onReorder, onMoveFromPane)}
    >
      <button
        className="source-tab-select"
        type="button"
        role="tab"
        aria-selected={selected}
        tabIndex={selected ? 0 : -1}
        title={`${title}${tab.preview ? " — Preview; double-click to keep open" : ""}`}
        onClick={() => onActivate(tab)}
        onDoubleClick={() => onPromote(tab)}
        onKeyDown={(event) => handleTabKey(event, pane.tabs, tab, onActivate)}
      >
        {tab.pinned ? <PinIcon className="source-tab-pin" aria-label="Pinned" /> : null}
        <span className="source-tab-format">{workspaceTabLabel(tab, source)}</span>
        <span className="source-tab-title">{title}</span>
        {tab.preview ? <span className="sr-only">Preview tab</span> : null}
        {tab.dirty ? <span className="source-tab-dirty" aria-label="Unsaved changes" /> : null}
      </button>
      <button
        className="source-tab-close"
        type="button"
        aria-label={`Close ${title}`}
        title="Close tab"
        onClick={(event) => {
          event.stopPropagation();
          onClose(tab);
        }}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function handleTabKey(
  event: KeyboardEvent<HTMLButtonElement>,
  tabs: readonly WorkspaceTab[],
  tab: WorkspaceTab,
  activate: (tab: WorkspaceTab) => void,
): void {
  const index = tabs.findIndex(({ id }) => id === tab.id);
  const nextIndex = tabDestination(event.key, index, tabs.length);
  if (nextIndex === null) {
    return;
  }
  const next = tabs[nextIndex];
  if (!next) {
    return;
  }
  event.preventDefault();
  const tabList = event.currentTarget
    .closest<HTMLElement>('[role="tablist"]')
    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  tabList?.[nextIndex]?.focus();
  activate(next);
}

function tabClassName(tab: WorkspaceTab, active: boolean): string {
  return ["source-tab", active ? "is-active" : "", tab.preview ? "is-preview" : ""]
    .filter(Boolean)
    .join(" ");
}
