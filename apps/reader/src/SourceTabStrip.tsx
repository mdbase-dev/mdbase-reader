import { CloseIcon, MoreIcon } from "./icons.js";
import { dropTab, startTabDrag } from "./source-tab-drag.js";

import type {
  SourceWorkspacePane,
  WorkspacePaneId,
  WorkspaceTab,
} from "./source-workspace-layout.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX, KeyboardEvent } from "react";

export interface SourceTabStripProps {
  readonly pane: SourceWorkspacePane;
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

export function SourceTabStrip({
  pane,
  sourceFor,
  onActivate,
  onPromote,
  onPin,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onOpenBeside,
  onReorder,
  onMoveFromPane,
}: SourceTabStripProps): JSX.Element | null {
  if (pane.tabs.length === 0) {
    return null;
  }
  return (
    <div className="source-tab-strip" role="tablist" aria-label="Open sources">
      <div className="source-tab-track">
        {pane.tabs.map((tab, index) => {
          const source = sourceFor(tab);
          if (!source) {
            return null;
          }
          const active = tab.id === pane.activeTabId;
          return (
            <div
              className={tabClassName(tab, active)}
              key={tab.id}
              draggable
              onDragStart={(event) => startTabDrag(event, pane.id, tab, index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropTab(event, pane.id, index, onReorder, onMoveFromPane)}
            >
              <button
                className="source-tab-select"
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                title={`${source.title}${tab.preview ? " — preview" : ""}`}
                onClick={() => onActivate(tab)}
                onDoubleClick={() => onPromote(tab)}
                onKeyDown={(event) => handleTabKey(event, pane.tabs, tab, onActivate)}
              >
                {tab.pinned ? (
                  <span className="source-tab-pin" aria-label="Pinned">
                    ●
                  </span>
                ) : null}
                <span className="source-tab-format">{tabLabel(tab, source)}</span>
                <span className="source-tab-title">{source.title}</span>
                {tab.dirty ? (
                  <span className="source-tab-dirty" aria-label="Unsaved changes" />
                ) : null}
              </button>
              <TabActions
                tab={tab}
                source={source}
                onPin={onPin}
                onClose={onClose}
                onCloseOthers={onCloseOthers}
                onCloseToRight={onCloseToRight}
                onOpenBeside={onOpenBeside}
              />
              <button
                className="source-tab-close"
                type="button"
                aria-label={`Close ${source.title}`}
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
        })}
      </div>
      <span className="source-tab-context" aria-hidden="true">
        {pane.id === "primary" ? "A" : "B"}
      </span>
    </div>
  );
}

function TabActions({
  tab,
  source,
  onPin,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onOpenBeside,
}: Pick<
  SourceTabStripProps,
  "onPin" | "onClose" | "onCloseOthers" | "onCloseToRight" | "onOpenBeside"
> & {
  readonly tab: WorkspaceTab;
  readonly source: SourceSummary;
}): JSX.Element {
  return (
    <details className="source-tab-actions">
      <summary aria-label={`Actions for ${source.title}`} title="Tab actions">
        <MoreIcon />
      </summary>
      <div className="source-tab-menu">
        <button type="button" onClick={() => onPin(tab, !tab.pinned)}>
          {tab.pinned ? "Unpin tab" : "Pin tab"}
        </button>
        <button type="button" onClick={() => onOpenBeside(tab, "horizontal")}>
          Open beside
        </button>
        <button type="button" onClick={() => onOpenBeside(tab, "vertical")}>
          Open below
        </button>
        <i />
        <button type="button" onClick={() => onCloseOthers(tab)}>
          Close others
        </button>
        <button type="button" onClick={() => onCloseToRight(tab)}>
          Close tabs to the right
        </button>
        <button type="button" onClick={() => onClose(tab)}>
          Close tab
        </button>
      </div>
    </details>
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
  const tabList = event.currentTarget.closest<HTMLElement>('[role="tablist"]');
  tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  activate(next);
}

function tabClassName(tab: WorkspaceTab, active: boolean): string {
  return ["source-tab", active ? "is-active" : "", tab.preview ? "is-preview" : ""]
    .filter(Boolean)
    .join(" ");
}

function tabLabel(tab: WorkspaceTab, source: SourceSummary): string {
  if (tab.view === "note") {
    return "NOTE";
  }
  if (tab.view === "annotations") {
    return "MARKS";
  }
  return tab.view === "citation" ? "CSL" : sourceFormat(source);
}

export function tabDestination(key: string, current: number, count: number): number | null {
  if (count < 1 || current < 0) {
    return null;
  }
  if (key === "ArrowRight") {
    return (current + 1) % count;
  }
  if (key === "ArrowLeft") {
    return (current - 1 + count) % count;
  }
  if (key === "Home") {
    return 0;
  }
  return key === "End" ? count - 1 : null;
}

export function sourceFormat(source: SourceSummary): string {
  const mediaType = source.documents[0]?.mediaType ?? "";
  if (mediaType.includes("pdf")) {
    return "PDF";
  }
  if (mediaType.includes("epub")) {
    return "EPUB";
  }
  if (mediaType.includes("html")) {
    return "WEB";
  }
  return source.documents[0] ? "FILE" : "NOTE";
}
