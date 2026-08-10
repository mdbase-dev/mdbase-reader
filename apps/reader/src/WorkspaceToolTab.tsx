import { InspectorContent } from "./InspectorPane.js";

import type { WorkspaceTab } from "./source-workspace-layout.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export function WorkspaceToolTab({
  tab,
  focused,
  source,
  workspace,
  sourceWorkspace,
  composer,
}: {
  readonly tab: WorkspaceTab;
  readonly focused: boolean;
  readonly source: SourceSummary | null;
  readonly workspace: ReaderWorkspaceController;
  readonly sourceWorkspace: SourceWorkspaceController;
  readonly composer: AnnotationComposerController;
}): JSX.Element {
  if (focused && source?.id === tab.sourceId) {
    return (
      <div className="workspace-tool-surface">
        <InspectorContent
          tab={tab.view === "document" ? "annotations" : tab.view}
          workspace={workspace}
          composer={composer}
        />
      </div>
    );
  }
  const paneId =
    sourceWorkspace.layout.panes.find(({ tabs }) => tabs.some(({ id }) => id === tab.id))?.id ??
    "primary";
  return (
    <button
      className="workspace-tool-activate"
      type="button"
      onClick={() => sourceWorkspace.focus(paneId)}
    >
      Activate this pane to load {tab.view}.
    </button>
  );
}
