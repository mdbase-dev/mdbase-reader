import { t } from "@lingui/core/macro";

import { annotationCommands, displayCommands, libraryCommands } from "./reader-app-commands.js";

import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { Command } from "@mdbase-dev/ui/command-palette";
import type { ThemePreference } from "@mdbase-dev/ui/theme";
import type { SourceSummary } from "@mdbase-reader/core";

/** The palette's groups, in the order Reader shows them. */
export type ReaderCommandGroup =
  "Open tabs" | "Current source" | "Sources" | "Library" | "Workspace" | "Display";
/** Group identity is stable, independently of its displayed language. */
export function readerCommandGroupLabel(group: string): string {
  const labels: Record<ReaderCommandGroup, string> = {
    "Open tabs": t`Open tabs`,
    "Current source": t`Current source`,
    Sources: t`Sources`,
    Library: t`Library`,
    Workspace: t`Workspace`,
    Display: t`Display`,
  };
  return Object.hasOwn(labels, group) ? labels[group as ReaderCommandGroup] : group;
}

export interface ReaderCommand extends Command {
  readonly group: ReaderCommandGroup;
}

export interface ReaderCommandInput {
  readonly sources: readonly SourceSummary[];
  readonly activeSource: SourceSummary | null;
  readonly workspace: SourceWorkspaceController;
  readonly sourceExport: SourceExportController;
  /** Asks to remove a source, which confirms first; null when the collection cannot. */
  readonly removeSource?: ((source: SourceSummary) => void) | null;
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
      const place = panes.length > 1 ? t` · pane ${String(panes.indexOf(pane) + 1)}` : "";
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
      detail:
        source.creators.join(", ") ||
        t({ message: "Unknown creator", context: "reader command list" }),
      group: "Sources",
      keywords: `open source ${source.readingStatus ?? "inbox"} ${source.tags.join(" ")}`,
      run: () => input.workspace.open(source.id),
      alternate: {
        label: t({ message: "Open beside", context: "reader command list" }),
        run: () => input.workspace.openBeside(source.id),
      },
    }));
  return [...openTabs, ...sourceCommands(input), ...sources];
}

function viewLabel(view: string): string {
  return view === "note"
    ? t({ message: "Literature note", context: "reader command list" })
    : view === "annotations"
      ? t({ message: "Annotations", context: "reader command list" })
      : view === "citation"
        ? t({ message: "Citation", context: "reader command list" })
        : t({ message: "Document", context: "reader command list" });
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
      label: t({ message: "Reset pane arrangement" }),
      detail: t({ message: "Keeps all tabs open" }),
      group: "Workspace",
      run: () => input.workspace.dock.reset(),
    },
    {
      id: "toggle-focus",
      label: input.focusMode
        ? t({ message: "Leave reading mode" })
        : t({ message: "Enter reading mode" }),
      detail: t({ message: "Only the page, with the chrome out of the way" }),
      group: "Workspace",
      keywords: "focus distraction",
      shortcut: "mod+.",
      run: input.toggleFocus,
    },
    {
      id: "toggle-library",
      label: t({ message: "Toggle left sidebar" }),
      group: "Workspace",
      shortcut: "mod+\\",
      run: input.toggleLibrary,
    },
    {
      id: "toggle-source-tools",
      label: t({ message: "Toggle right sidebar" }),
      detail: t({ message: "Annotations, literature note and citation" }),
      group: "Workspace",
      shortcut: "mod+shift+\\",
      run: input.toggleInspector,
    },
    {
      id: "reopen",
      label: t({ message: "Reopen closed tab", context: "reader command list" }),
      group: "Workspace",
      shortcut: "mod+shift+t",
      run: input.workspace.reopenClosed,
    },
    ...(split ? paneCommands(input, paneLabel, otherPaneId, otherPaneLabel) : []),
    ...(activeTab
      ? ([
          {
            id: "close-active-tab",
            label: t({ message: "Close active tab", context: "reader command list" }),
            group: "Workspace",
            run: () => input.workspace.closeTab(activeTab.id, input.workspace.layout.focusedPaneId),
          },
        ] satisfies readonly ReaderCommand[])
      : []),
    ...(sourceId
      ? ([
          {
            id: "split-right",
            label: t({ message: "Duplicate in new pane right" }),
            detail: input.activeSource.title,
            group: "Workspace",
            run: () => input.workspace.openBeside(sourceId, "document", "horizontal"),
          },
          {
            id: "split-below",
            label: t({ message: "Duplicate in pane below" }),
            detail: input.activeSource.title,
            group: "Workspace",
            run: () => input.workspace.openBeside(sourceId, "document", "vertical"),
          },
        ] satisfies readonly ReaderCommand[])
      : []),
  ];
}

function sourceCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  const activeSource = input.activeSource;
  const sourceId = activeSource?.id;
  if (!sourceId) {
    return [];
  }
  const removeSource = input.removeSource;
  return [
    {
      id: "export-source",
      label: t({ message: "Export current source" }),
      group: "Current source",
      run: input.sourceExport.run,
    },
    ...annotationCommands(input),
    {
      id: "annotations",
      label: t({ message: "Open annotations", context: "reader command list" }),
      group: "Current source",
      run: () => input.workspace.openView(sourceId, "annotations"),
      alternate: {
        label: t({ message: "Open beside", context: "reader command list" }),
        run: () => input.workspace.openBeside(sourceId, "annotations"),
      },
    },
    {
      id: "note",
      label: t({ message: "Open literature note" }),
      group: "Current source",
      keywords: "write notes source note",
      run: () => input.workspace.openView(sourceId, "note"),
      alternate: {
        label: t({ message: "Open beside", context: "reader command list" }),
        run: () => input.workspace.openBeside(sourceId, "note"),
      },
    },
    {
      id: "citation",
      label: t({ message: "Open citation data" }),
      group: "Current source",
      keywords: "bibliography csl metadata",
      run: () => input.workspace.openView(sourceId, "citation"),
      alternate: {
        label: t({ message: "Open beside", context: "reader command list" }),
        run: () => input.workspace.openBeside(sourceId, "citation"),
      },
    },
    ...(removeSource
      ? [
          {
            id: "remove-source",
            label: t({ message: "Remove current source…" }),
            detail: activeSource.title,
            group: "Current source" as const,
            keywords: "delete trash discard mistaken import",
            run: () => removeSource(activeSource),
          },
        ]
      : []),
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
      label: t({ message: "Focus next pane", context: "reader command list" }),
      detail: t`Pane ${paneLabel} is focused`,
      group: "Workspace",
      shortcut: "F6",
      run: input.workspace.focusNextPane,
    },
    ...(activeTab
      ? [
          {
            id: "move-active-tab-other-pane",
            label: t`Move active tab to pane ${otherPaneLabel}`,
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
      label: t({ message: "Arrange panes side by side" }),
      group: "Workspace",
      run: () => input.workspace.setSplitDirection("horizontal"),
    },
    {
      id: "arrange-top-bottom",
      label: t({ message: "Stack panes top and bottom" }),
      group: "Workspace",
      run: () => input.workspace.setSplitDirection("vertical"),
    },
    {
      id: "close-focused-pane",
      label: t({ message: "Close focused pane and keep its tabs" }),
      detail: t`Pane ${paneLabel}`,
      group: "Workspace",
      run: () => input.workspace.closePane(input.workspace.layout.focusedPaneId),
    },
  ];
}
