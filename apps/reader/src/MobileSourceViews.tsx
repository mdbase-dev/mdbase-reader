import { panelTab } from "./dockview-workspace-state.js";
import { CitationIcon, HighlightIcon, NoteIcon, ReadingModeIcon } from "./icons.js";
import { SelectionActionBar } from "./SelectionToolbar.js";

import type { ReaderDockWorkspace } from "./dockview-workspace.js";
import type { SourceWorkspaceView } from "./source-workspace-layout.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

const views: readonly {
  readonly view: SourceWorkspaceView;
  readonly label: string;
  readonly icon: typeof NoteIcon;
}[] = [
  { view: "document", label: "Read", icon: ReadingModeIcon },
  { view: "annotations", label: "Annotations", icon: HighlightIcon },
  { view: "note", label: "Note", icon: NoteIcon },
  { view: "citation", label: "Citation", icon: CitationIcon },
];

/**
 * On a phone a source's document, annotations, note and citation share one screen, so a
 * bottom bar moves between them instead of an unlabelled panel button in the header. While text
 * is selected in the document, the bar offers actions for the selection instead.
 */
export function MobileSourceViews({
  dock,
  workspace,
  sources,
  composer,
}: {
  readonly dock: ReaderDockWorkspace;
  readonly workspace: SourceWorkspaceController;
  readonly sources: readonly SourceSummary[];
  readonly composer: AnnotationComposerController;
}): JSX.Element | null {
  const active = dock.mobile ? dock.api?.activePanel : undefined;
  const tab = active ? panelTab(active) : undefined;
  if (tab?.kind !== "source") {
    return null;
  }
  if (tab.view === "document" && composer.toolbar) {
    return <SelectionActionBar composer={composer} />;
  }
  const readable = Boolean(sources.find(({ id }) => id === tab.sourceId)?.documents.length);
  return (
    <nav className="mobile-source-views" aria-label="Source views">
      {views
        .filter(({ view }) => view !== "document" || readable)
        .map(({ view, label, icon: Icon }) => (
          <button
            key={view}
            type="button"
            aria-current={tab.view === view ? "page" : undefined}
            onClick={() => workspace.openView(tab.sourceId, view)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
    </nav>
  );
}
