import type { ReaderCommand } from "./CommandPalette.js";
import type { BibliographyExportController } from "./use-bibliography-export.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";

export interface ReaderCommandInput {
  readonly sources: readonly SourceSummary[];
  readonly activeSource: SourceSummary | null;
  readonly workspace: SourceWorkspaceController;
  readonly sourceExport: SourceExportController;
  readonly bibliographyExport: BibliographyExportController;
  readonly focusMode: boolean;
  readonly toggleFocus: () => void;
  readonly toggleLibrary: () => void;
  readonly toggleInspector: () => void;
  readonly searchLibrary: () => void;
}

export function readerCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  return [
    ...navigationCommands(input),
    ...workspaceCommands(input),
    ...sourceCommands(input),
    ...exportCommands(input),
  ];
}

function navigationCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  const openSources = input.sources.map((source): ReaderCommand => ({
    id: `open:${source.id}`,
    label: source.title,
    detail: `${source.creators.join(", ") || "Unknown creator"} · ${source.readingStatus ?? "inbox"}`,
    group: "Navigate",
    keywords: "open source library",
    run: () => input.workspace.open(source.id),
  }));
  const switchTabs = input.workspace.layout.panes.flatMap((pane) =>
    pane.tabs.flatMap((tab): readonly ReaderCommand[] => {
      const source =
        tab.kind === "source" ? input.sources.find(({ id }) => id === tab.sourceId) : null;
      return tab.kind === "library" || source
        ? [
            {
              id: `switch:${pane.id}:${tab.id}`,
              label: `Switch to ${tab.kind === "library" ? tab.title : (source?.title ?? "source")}`,
              detail: `${tab.view} · pane ${pane.id === "primary" ? "A" : "B"}`,
              group: "Navigate",
              keywords: "tab switch",
              run: () => input.workspace.activateTab(tab.id, pane.id),
            },
          ]
        : [];
    }),
  );
  return [
    {
      id: "open-library-view",
      label: "Open library",
      group: "Navigate",
      run: () => input.workspace.openLibrary(),
    },
    {
      id: "search",
      label: "Search library and documents",
      group: "Navigate",
      shortcut: "⌘F",
      run: input.searchLibrary,
    },
    ...switchTabs,
    ...openSources,
  ];
}

function workspaceCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  const sourceId = input.activeSource?.id;
  return [
    { id: "toggle-library", label: "Toggle library", group: "Workspace", run: input.toggleLibrary },
    {
      id: "toggle-source-tools",
      label: "Toggle source tools",
      group: "Workspace",
      run: input.toggleInspector,
    },
    {
      id: "toggle-focus",
      label: `${input.focusMode ? "Exit" : "Enter"} focus mode`,
      group: "Workspace",
      shortcut: "Esc",
      run: input.toggleFocus,
    },
    {
      id: "reopen",
      label: "Reopen closed tab",
      group: "Workspace",
      shortcut: "⌘⇧T",
      run: input.workspace.reopenClosed,
    },
    ...(sourceId
      ? ([
          {
            id: "split-right",
            label: "Split right",
            detail: input.activeSource.title,
            group: "Workspace",
            run: () => input.workspace.openBeside(sourceId, "document", "horizontal"),
          },
          {
            id: "split-below",
            label: "Split below",
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
      id: "annotations",
      label: "Open annotations",
      group: "Source",
      run: () => input.workspace.openView(sourceId, "annotations"),
    },
    {
      id: "note",
      label: "Open source note",
      group: "Source",
      run: () => input.workspace.openView(sourceId, "note"),
    },
    {
      id: "citation",
      label: "Open citation data",
      group: "Source",
      run: () => input.workspace.openView(sourceId, "citation"),
    },
    {
      id: "note-beside",
      label: "Open source note beside document",
      group: "Source",
      run: () => input.workspace.openBeside(sourceId, "note"),
    },
    {
      id: "citation-beside",
      label: "Open citation data beside document",
      group: "Source",
      run: () => input.workspace.openBeside(sourceId, "citation"),
    },
  ];
}

function exportCommands(input: ReaderCommandInput): readonly ReaderCommand[] {
  return [
    {
      id: "export-source",
      label: "Export current source",
      group: "Export",
      run: input.sourceExport.run,
    },
    {
      id: "export-bibliography",
      label: "Export bibliography",
      group: "Export",
      run: input.bibliographyExport.run,
    },
  ];
}
