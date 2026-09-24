import { useMemo, useState, type JSX, type RefObject } from "react";

import { annotationEntries, annotationTags, type AnnotationFilter } from "./annotation-overview.js";
import {
  emptyRowSelection,
  pruneRowSelection,
  type RowSelection,
} from "./library-row-selection.js";
import { AnnotationProblem, AnnotationSelectionBar } from "./LibraryAnnotationBars.js";
import { AnnotationTable } from "./LibraryAnnotationTable.js";
import { AnnotationToolbar } from "./LibraryAnnotationToolbar.js";
import { LibraryViewSaveDialog } from "./LibraryViewSaveDialog.js";
import {
  annotationLayoutOf,
  savedAnnotationConfiguration,
  useAnnotationLayoutDraft,
  useAnnotationViewExecution,
  useSourceAnnotationsView,
} from "./use-annotation-view.js";
import {
  useAllAnnotations,
  useAnnotationViewSaving,
  useVisibleEntries,
} from "./use-library-annotations.js";

import type { MdbaseLibraryView } from "./mdbase-library-views.js";
import type { MdbaseLibraryViewsController } from "./use-mdbase-library-views.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, AnnotationId, SourceSummary } from "@mdbase-reader/core";

/** Every annotation in the collection, filterable by its own fields and by its source's. */
export function LibraryAnnotations({
  gateway,
  view,
  controller,
  collectionKey,
  sources,
  propertyKeys,
  focused,
  scrollRef,
  onOpenAnnotation,
  onOpenView,
}: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly view: MdbaseLibraryView;
  readonly controller: MdbaseLibraryViewsController;
  readonly collectionKey: string;
  readonly sources: readonly SourceSummary[];
  readonly propertyKeys: readonly string[];
  readonly focused: boolean;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onOpenAnnotation: (annotation: Annotation, beside: boolean) => void;
  readonly onOpenView: (view: MdbaseLibraryView) => void;
}): JSX.Element {
  const { load, retry } = useAllAnnotations(gateway);
  const saved = savedAnnotationConfiguration(view);
  const [filter, setFilter] = useState<AnnotationFilter>(saved.filter);
  const [layout, setLayout] = useAnnotationLayoutDraft(collectionKey, view);
  // Remounts the table after a reset, since it reads column widths from the layout once.
  const [layoutResets, setLayoutResets] = useState(0);
  const execution = useAnnotationViewExecution(gateway, view);
  const [selection, setSelection] = useState<RowSelection<AnnotationId>>(emptyRowSelection);
  const sourceAnnotationsView = useSourceAnnotationsView(gateway);
  const all = useMemo(
    () => (load.status === "ready" ? annotationEntries(load.annotations, sources) : []),
    [load, sources],
  );
  const tags = useMemo(() => annotationTags(all), [all]);
  const entries = useVisibleEntries(all, filter, saved.filter, execution.paths, layout);
  const rowIds = useMemo(() => entries.map(({ annotation }) => annotation.id), [entries]);
  const visibleSelection = useMemo(() => pruneRowSelection(selection, rowIds), [rowIds, selection]);
  const selected = entries.filter(({ annotation }) => visibleSelection.ids.has(annotation.id));
  const saving = useAnnotationViewSaving(
    view,
    controller,
    { ...layout, filter },
    sources,
    onOpenView,
  );
  const savedLayout = annotationLayoutOf(saved);
  return (
    <div className="library-annotations">
      <AnnotationToolbar
        filter={filter}
        onFilterChange={setFilter}
        layout={layout}
        onLayoutChange={setLayout}
        count={load.status === "loading" ? null : entries.length}
        tags={tags}
        propertyKeys={propertyKeys}
        sources={sources}
        actions={{
          ...(saving.saveOver ? { onSave: saving.saveOver } : {}),
          saving: controller.saving,
          onSaveAs: saving.startNaming,
          ...(JSON.stringify(layout) !== JSON.stringify(savedLayout)
            ? {
                onReset: () => {
                  setLayout(savedLayout);
                  setLayoutResets((count) => count + 1);
                },
              }
            : {}),
          sourceAnnotationsView,
        }}
      />
      <AnnotationProblem load={load} executionProblem={execution.problem} onRetry={retry} />
      {load.status === "ready" && entries.length === 0 ? (
        <div className="library-workspace-empty">
          <strong>{all.length === 0 ? "No annotations yet" : "No annotations match"}</strong>
          <span>
            {all.length === 0
              ? "Highlights and notes you make while reading appear here."
              : "Try a different search, or clear the filters."}
          </span>
        </div>
      ) : (
        <AnnotationTable
          key={layoutResets}
          entries={entries}
          rowIds={rowIds}
          layout={layout}
          onLayoutChange={setLayout}
          selection={visibleSelection}
          onSelectionChange={setSelection}
          focused={focused}
          scrollRef={scrollRef}
          onOpen={onOpenAnnotation}
        />
      )}
      {selected.length > 0 ? (
        <AnnotationSelectionBar
          selected={selected}
          onClear={() => setSelection(emptyRowSelection)}
        />
      ) : null}
      {saving.naming ? (
        <LibraryViewSaveDialog
          description="The filters, sort and columns are saved in your collection as an mdbase view of annotations."
          placeholder="e.g. Quotes for chapter 2"
          saving={controller.saving}
          onCancel={saving.stopNaming}
          onSave={saving.saveAs}
        />
      ) : null}
    </div>
  );
}
