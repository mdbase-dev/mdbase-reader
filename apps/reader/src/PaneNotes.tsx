import { useEffect, useState, type JSX } from "react";

import { InspectorPane, type InspectorPaneProps } from "./InspectorPane.js";
import { useSourceToolsWorkspace } from "./use-reader-workspace.js";

import type { Annotation, Source, SourceSummary } from "@mdbase-reader/core";

type Shared = Pick<
  InspectorPaneProps,
  "tab" | "visible" | "paneLabel" | "composer" | "gateway" | "workbenchOwner" | "onOpenSourceView"
> & {
  readonly reconcileSource: (source: Source) => void;
  readonly onOpenAnnotation: (annotation: Annotation, source: SourceSummary) => void;
};

/**
 * A Notes panel that follows one pane: the annotations, note or citation of whichever source
 * that pane is showing, whatever the reader is doing elsewhere. It loads that source's tools
 * itself, since the rest of Reader is busy with the source in use.
 */
export function PaneNotes({
  source,
  empty,
  ...shared
}: Shared & {
  /** The source the followed pane is showing, or null when it shows none. */
  readonly source: SourceSummary | null;
  /** What to show when there is no source: the Notes panel's own empty state. */
  readonly empty: JSX.Element;
}): JSX.Element | null {
  const { tab, visible } = shared;
  const [opened, setOpened] = useState(visible);
  const [dirty, setDirty] = useState(false);
  const [held, setHeld] = useState(source);
  if (visible && !opened) {
    setOpened(true);
  }
  // A citation form with unsaved changes keeps its source until they are saved or discarded.
  if (!dirty && held !== source) {
    setHeld(source);
  }
  const shown = dirty ? held : source;
  // Hidden, only a citation form that has been opened stays loaded: it may hold typing.
  if (!visible && !(tab === "citation" && opened)) {
    return null;
  }
  return shown ? (
    <FollowedSource key={shown.id} source={shown} onDirtyChange={setDirty} {...shared} />
  ) : (
    empty
  );
}

function FollowedSource({
  source,
  reconcileSource,
  onOpenAnnotation,
  onDirtyChange,
  composer,
  ...pane
}: Shared & {
  readonly source: SourceSummary;
  readonly onDirtyChange: (dirty: boolean) => void;
}): JSX.Element | null {
  const workspace = useSourceToolsWorkspace(pane.gateway, source.id, reconcileSource);
  const dirty = pane.tab === "citation" && workspace.citation.dirty;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  return (
    <InspectorPane
      {...pane}
      source={source}
      workspace={workspace}
      composer={{
        ...composer,
        open: (annotation) => onOpenAnnotation(annotation, source),
        editingAnnotationId: null,
      }}
    />
  );
}
