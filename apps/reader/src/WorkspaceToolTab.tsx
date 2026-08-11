import { InspectorContent } from "./InspectorPane.js";
import { useSourceToolsWorkspace } from "./use-reader-workspace.js";

import type { SourceWorkspaceTab } from "./source-workspace-layout.js";
import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Source, SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export function WorkspaceToolTab({
  tab,
  source,
  gateway,
  reconcileSource,
  composer,
}: {
  readonly tab: SourceWorkspaceTab;
  readonly source: SourceSummary;
  readonly gateway: ReaderWorkspaceGateway;
  readonly reconcileSource: (source: Source) => void;
  readonly composer: AnnotationComposerController;
}): JSX.Element {
  const workspace = useSourceToolsWorkspace(gateway, tab.sourceId, reconcileSource);
  return (
    <div className="workspace-tool-surface is-session-bound">
      <div className="workspace-tool-context">
        <span>Stable workbench tab</span>
        <strong>{source.title}</strong>
      </div>
      <InspectorContent
        tab={tab.view === "document" ? "annotations" : tab.view}
        workspace={workspace}
        composer={composer}
      />
    </div>
  );
}
