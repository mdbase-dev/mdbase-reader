import { useEffect, useMemo, useState, type JSX, type RefObject } from "react";

import {
  annotationEntries,
  annotationTags,
  annotationsToMarkdown,
  emptyAnnotationFilter,
  filterAnnotationEntries,
  sortAnnotationEntries,
  type AnnotationEntry,
  type AnnotationFilter,
  type AnnotationSort,
} from "./annotation-overview.js";
import { readerErrorMessage } from "./errors.js";
import {
  emptyRowSelection,
  pruneRowSelection,
  type RowSelection,
} from "./library-row-selection.js";
import { AnnotationTable } from "./LibraryAnnotationTable.js";
import { AnnotationToolbar } from "./LibraryAnnotationToolbar.js";
import { countLabel } from "./LibraryCells.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, AnnotationId, SourceSummary } from "@mdbase-reader/core";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly annotations: readonly Annotation[] }
  | { readonly status: "error"; readonly message: string };

/** Every annotation in the collection, filterable by its own fields and by its source's. */
export function LibraryAnnotations({
  gateway,
  sources,
  propertyKeys,
  focused,
  scrollRef,
  onOpenAnnotation,
}: {
  readonly gateway: ReaderWorkspaceGateway;
  readonly sources: readonly SourceSummary[];
  readonly propertyKeys: readonly string[];
  readonly focused: boolean;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onOpenAnnotation: (annotation: Annotation, beside: boolean) => void;
}): JSX.Element {
  const [reloads, setReloads] = useState(0);
  const load = useAllAnnotations(gateway, reloads);
  const [filter, setFilter] = useState<AnnotationFilter>(emptyAnnotationFilter);
  const [sort, setSort] = useState<AnnotationSort>("newest");
  const [selection, setSelection] = useState<RowSelection<AnnotationId>>(emptyRowSelection);
  const [copied, setCopied] = useState<string | null>(null);
  const all = useMemo(
    () => (load.status === "ready" ? annotationEntries(load.annotations, sources) : []),
    [load, sources],
  );
  const tags = useMemo(() => annotationTags(all), [all]);
  const entries = useMemo(
    () => sortAnnotationEntries(filterAnnotationEntries(all, filter), sort),
    [all, filter, sort],
  );
  const rowIds = useMemo(() => entries.map(({ annotation }) => annotation.id), [entries]);
  const visibleSelection = useMemo(() => pruneRowSelection(selection, rowIds), [rowIds, selection]);
  const selected = entries.filter(({ annotation }) => visibleSelection.ids.has(annotation.id));
  const copy = (chosen: readonly AnnotationEntry[]): void => {
    void globalThis.navigator.clipboard
      .writeText(annotationsToMarkdown(chosen))
      .then(() => setCopied(`Copied ${countLabel(chosen.length, "annotation")} as Markdown.`))
      .catch(() => setCopied("Copying needs clipboard permission."));
  };
  return (
    <div className="library-annotations">
      <AnnotationToolbar
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        count={load.status === "loading" ? null : entries.length}
        tags={tags}
        propertyKeys={propertyKeys}
        sources={sources}
      />
      {load.status === "error" ? (
        <div className="library-view-problem" role="alert">
          {load.message}{" "}
          <button type="button" onClick={() => setReloads((count) => count + 1)}>
            Try again
          </button>
        </div>
      ) : null}
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
          entries={entries}
          rowIds={rowIds}
          selection={visibleSelection}
          onSelectionChange={setSelection}
          focused={focused}
          scrollRef={scrollRef}
          onOpen={onOpenAnnotation}
        />
      )}
      {selected.length > 0 ? (
        <div className="library-bulk-bar" role="toolbar" aria-label="Selected annotations">
          <strong aria-live="polite">{countLabel(selected.length, "annotation")} selected</strong>
          <button type="button" onClick={() => copy(selected)}>
            Copy as Markdown
          </button>
          {copied ? (
            <span className="library-bulk-progress" role="status">
              {copied}
            </span>
          ) : null}
          <button type="button" onClick={() => setSelection(emptyRowSelection)}>
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Every annotation in the collection; reloads when `reloads` changes. */
function useAllAnnotations(gateway: ReaderWorkspaceGateway, reloads: number): Load {
  const [result, setResult] = useState<{ readonly key: number; readonly load: Load } | null>(null);
  useEffect(() => {
    if (!gateway.allAnnotations) {
      return undefined;
    }
    const controller = new AbortController();
    void gateway
      .allAnnotations({ signal: controller.signal })
      .then((annotations) => setResult({ key: reloads, load: { status: "ready", annotations } }))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            key: reloads,
            load: {
              status: "error",
              message: readerErrorMessage(reason, "Reader could not list annotations."),
            },
          });
        }
      });
    return () => controller.abort();
  }, [gateway, reloads]);
  if (!gateway.allAnnotations) {
    return { status: "error", message: "This collection cannot list all annotations." };
  }
  return result?.key === reloads ? result.load : { status: "loading" };
}
