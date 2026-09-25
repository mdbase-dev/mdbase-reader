import { annotationCommands, displayCommands, libraryCommands } from "./reader-app-commands.js";

import type { ReaderCommand } from "./CommandPalette.js";
import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { ThemePreference } from "@mdbase-reader/ui";

export interface ReaderCommandInput {
  readonly sources: readonly SourceSummary[];
  readonly activeSource: SourceSummary | null;
  readonly workspace: SourceWorkspaceController;
  readonly sourceExport: SourceExportController;
  readonly bibliographyExport: BibliographyExportController;
  readonly focusMode: boolean;
  /** Bookmarks the focused document's current position; null without one. */
  readonly bookmark: (() => void) | null;
  readonly toggleFocus: () => void;
  readonly toggleLibrary: () => void;
  readonly toggleInspector: () => void;
  readonly searchLibrary: () => void;
  readonly addSource: () => void;
  readonly importHref: string;
  readonly theme: ThemePreference;
  readonly setTheme: (theme: ThemePreference) => void;
  readonly density: "comfortable" | "compact";
  readonly setDensity: (density: "comfortable" | "compact") => void;
}

export function readerCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  return [
    ...navigationCommands(input),
    ...libraryCommands(input),
    ...workspaceCommands(input),
    ...displayCommands(input),
  ];
}

function navigationCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  const panes = input.workspace.layout.panes;
  const openTabs = panes.flatMap((pane) =>
    pane.tabs.flatMap((tab): readonly ReaderCommand[] => {
      if (tab.kind !== "source") {
        return [];
      }
      const source = input.sources.find(({ id }) => id === tab.sourceId);
      if (!source) {
        return [];
      }
      const place = panes.length > 1 ? ` · pane ${String(panes.indexOf(pane) + 1)}` : "";
      return [
        {
          id: `switch:${pane.id}:${tab.id}`,
          label: source.title,
          detail: `${viewLabel(tab.view)}${place}`,
          group: "Open tabs",
          keywords: `tab switch ${source.creators.join(" ")}`,
          run: () => input.workspace.activateTab(tab.id, pane.id),
        },
      ];
    }),
  );
  const open = new Set(input.workspace.openSourceIds);
  const sources = input.sources
    .filter((source) => !open.has(source.id))
    .map((source): ReaderCommand => ({
      id: `open:${source.id}`,
      label: source.title,
      detail: source.creators.join(", ") || "Unknown creator",
      group: "Sources",
      keywords: `open source ${source.readingStatus ?? "inbox"} ${source.tags.join(" ")}`,
      run: () => input.workspace.open(source.id),
      alternate: { label: "Open beside", run: () => input.workspace.openBeside(source.id) },
    }));
  return [...openTabs, ...sourceCommands(input), ...sources];
}

function viewLabel(view: string): string {
  return view === "note"
    ? "Literature note"
    : view === "annotations"
      ? "Annotations"
      : view === "citation"
        ? "Citation"
        : "Document";
}

function workspaceCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  const sourceId = input.activeSource?.id;
  const panes = input.workspace.layout.panes;
  const split = panes.length > 1;
  const paneLabel = String(
    panes.findIndex(({ id }) => id === input.workspace.layout.focusedPaneId) + 1,
  );
  const otherPaneId =
    panes.find(({ id }) => id !== input.workspace.layout.focusedPaneId)?.id ??
    input.workspace.layout.focusedPaneId;
  const otherPaneLabel = String(panes.findIndex(({ id }) => id === otherPaneId) + 1);
  const activeTab = input.workspace.activeTab;
  return [
    {
      id: "reset-panes",
      label: "Reset pane arrangement",
      detail: "Keeps all tabs open",
      group: "Workspace",
      run: () => input.workspace.dock.reset(),
    },
    {
      id: "toggle-focus",
      label: input.focusMode ? "Leave reading mode" : "Enter reading mode",
      detail: "Only the page, with the chrome out of the way",
      group: "Workspace",
      keywords: "focus distraction",
      shortcut: "mod+.",
      run: input.toggleFocus,
    },
    {
      id: "toggle-library",
      label: "Toggle left sidebar",
      group: "Workspace",
      shortcut: "mod+\\",
      run: input.toggleLibrary,
    },
    {
      id: "toggle-source-tools",
      label: "Toggle right sidebar",
      detail: "Annotations, literature note and citation",
      group: "Workspace",
      shortcut: "mod+shift+\\",
      run: input.toggleInspector,
    },
    {
      id: "reopen",
      label: "Reopen closed tab",
      group: "Workspace",
      shortcut: "mod+shift+t",
      run: input.workspace.reopenClosed,
    },
    ...(split ? paneCommands(input, paneLabel, otherPaneId, otherPaneLabel) : []),
    ...(activeTab
      ? ([
          {
            id: "close-active-tab",
            label: "Close active tab",
            group: "Workspace",
            run: () => input.workspace.closeTab(activeTab.id, input.workspace.layout.focusedPaneId),
          },
        ] satisfies readonly ReaderCommand[])
      : []),
    ...(sourceId
      ? ([
          {
            id: "split-right",
            label: "Duplicate in new pane right",
            detail: input.activeSource.title,
            group: "Workspace",
            run: () => input.workspace.openBeside(sourceId, "document", "horizontal"),
          },
          {
            id: "split-below",
            label: "Duplicate in pane below",
            detail: input.activeSource.title,
            group: "Workspace",
            run: () => input.workspace.openBeside(sourceId, "document", "vertical"),
          },
        ] satisfies readonly ReaderCommand[])
      : []),
  ];
}

function sourceCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  const sourceId = input.activeSource?.id;
  if (!sourceId) {
    return [];
  }
  return [
    {
      id: "export-source",
      label: "Export current source",
      group: "Current source",
      run: input.sourceExport.run,
    },
    ...annotationCommands(input),
    {
      id: "annotations",
      label: "Open annotations",
      group: "Current source",
      run: () => input.workspace.openView(sourceId, "annotations"),
      alternate: {
        label: "Open beside",
        run: () => input.workspace.openBeside(sourceId, "annotations"),
      },
    },
    {
      id: "note",
      label: "Open literature note",
      group: "Current source",
      keywords: "write notes source note",
      run: () => input.workspace.openView(sourceId, "note"),
      alternate: { label: "Open beside", run: () => input.workspace.openBeside(sourceId, "note") },
    },
    {
      id: "citation",
      label: "Open citation data",
      group: "Current source",
      keywords: "bibliography csl metadata",
      run: () => input.workspace.openView(sourceId, "citation"),
      alternate: {
        label: "Open beside",
        run: () => input.workspace.openBeside(sourceId, "citation"),
      },
    },
  ];
}

function paneCommands(
  input: ReaderCommandInput,
  paneLabel: string,
  otherPaneId: string,
  otherPaneLabel: string,
): readonly ReaderCommand[] {
  const activeTab = input.workspace.activeTab;
  return [
    {
      id: "focus-next-pane",
      label: "Focus next pane",
      detail: `Pane ${paneLabel} is focused`,
      group: "Workspace",
      shortcut: "F6",
      run: input.workspace.focusNextPane,
    },
    ...(activeTab
      ? [
          {
            id: "move-active-tab-other-pane",
            label: `Move active tab to pane ${otherPaneLabel}`,
            group: "Workspace" as const,
            run: () =>
              input.workspace.moveTab(
                activeTab.id,
                input.workspace.layout.focusedPaneId,
                otherPaneId,
              ),
          },
        ]
      : []),
    {
      id: "arrange-side-by-side",
      label: "Arrange panes side by side",
      group: "Workspace",
      run: () => input.workspace.setSplitDirection("horizontal"),
    },
    {
      id: "arrange-top-bottom",
      label: "Stack panes top and bottom",
      group: "Workspace",
      run: () => input.workspace.setSplitDirection("vertical"),
    },
    {
      id: "close-focused-pane",
      label: "Close focused pane and keep its tabs",
      detail: `Pane ${paneLabel}`,
      group: "Workspace",
      run: () => input.workspace.closePane(input.workspace.layout.focusedPaneId),
    },
  ];
}
