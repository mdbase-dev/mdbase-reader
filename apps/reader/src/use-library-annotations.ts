import { useEffect, useMemo, useState } from "react";

import {
  emptyAnnotationFilter,
  filterAnnotationEntries,
  sortAnnotationEntries,
  type AnnotationEntry,
  type AnnotationFilter,
} from "./annotation-overview.js";
import { readerErrorMessage } from "./errors.js";
import { fieldShape } from "./library-conditions.js";
import {
  savedAnnotationConfiguration,
  useAnnotationViewExecution,
  type AnnotationViewExecution,
} from "./use-annotation-view.js";

import type { AnnotationLayout, AnnotationViewConfiguration } from "./mdbase-annotation-views.js";
import type { MdbaseLibraryView } from "./mdbase-library-views.js";
import type { MdbaseLibraryViewsController } from "./use-mdbase-library-views.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, SourceSummary } from "@mdbase-reader/core";

export type AnnotationsLoad =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly annotations: readonly Annotation[];
      readonly loading?: boolean;
    }
  | { readonly status: "error"; readonly message: string };

/** Every annotation in the collection, loaded again by `retry`. */
export function useAllAnnotations(
  gateway: ReaderWorkspaceGateway,
  paths: ReadonlySet<string> | null | undefined = null,
): {
  readonly load: AnnotationsLoad;
  readonly retry: () => void;
} {
  const [reloads, setReloads] = useState(0);
  const load = useAnnotationsLoad(gateway, reloads, paths);
  return { load, retry: () => setReloads((count) => count + 1) };
}

/** Execute first, then hydrate only selected records; changed structural filters browse all. */
export function useLibraryAnnotations(
  gateway: ReaderWorkspaceGateway,
  view: MdbaseLibraryView,
  filter: AnnotationFilter,
): {
  readonly load: AnnotationsLoad;
  readonly retry: () => void;
  readonly execution: AnnotationViewExecution;
} {
  const [revision, setRevision] = useState(0);
  const execution = useAnnotationViewExecution(gateway, view, revision);
  const savedSelection = sameAnnotationSelection(filter, savedAnnotationConfiguration(view).filter);
  const paths = savedSelection ? (execution.ready ? execution.paths : undefined) : null;
  const load = useAnnotationsLoad(gateway, revision, paths);
  return { load, execution, retry: () => setRevision((current) => current + 1) };
}

function useAnnotationsLoad(
  gateway: ReaderWorkspaceGateway,
  reloads: number,
  paths: ReadonlySet<string> | null | undefined,
): AnnotationsLoad {
  const [result, setResult] = useState<{
    readonly key: number;
    readonly gateway: ReaderWorkspaceGateway;
    readonly paths: ReadonlySet<string> | null;
    readonly load: AnnotationsLoad;
  } | null>(null);
  useEffect(() => {
    if (!gateway.allAnnotations || paths === undefined) {
      return undefined;
    }
    const controller = new AbortController();
    void gateway
      .allAnnotations({
        signal: controller.signal,
        ...(paths ? { paths } : {}),
        refresh: reloads > 0,
        onProgress: (annotations) => {
          if (!controller.signal.aborted) {
            setResult({
              key: reloads,
              gateway,
              paths,
              load: { status: "ready", annotations, loading: true },
            });
          }
        },
      })
      .then((annotations) => {
        if (!controller.signal.aborted) {
          setResult({
            key: reloads,
            gateway,
            paths,
            load: { status: "ready", annotations, loading: false },
          });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            key: reloads,
            gateway,
            paths,
            load: {
              status: "error",
              message: readerErrorMessage(reason, "Reader could not list annotations."),
            },
          });
        }
      });
    return () => controller.abort();
  }, [gateway, paths, reloads]);
  if (!gateway.allAnnotations) {
    return { status: "error", message: "This collection cannot list all annotations." };
  }
  return result?.key === reloads && result.gateway === gateway && result.paths === paths
    ? result.load
    : { status: "loading" };
}

/**
 * The annotations to list. An unchanged saved view shows what mdbase selected; a changed filter
 * applies locally. Search is Reader's own in both cases, as for sources.
 */
export function useVisibleEntries(
  all: readonly AnnotationEntry[],
  filter: AnnotationFilter,
  savedFilter: AnnotationFilter,
  paths: ReadonlySet<string> | null,
  layout: AnnotationLayout,
): readonly AnnotationEntry[] {
  const { sortField, sortDirection } = layout;
  return useMemo(() => {
    const filtered =
      paths && sameAnnotationSelection(filter, savedFilter)
        ? filterAnnotationEntries(
            all.filter(({ annotation }) => annotation.path && paths.has(annotation.path)),
            { ...emptyAnnotationFilter, query: filter.query },
          )
        : filterAnnotationEntries(all, filter);
    return sortAnnotationEntries(filtered, sortField, sortDirection);
  }, [all, filter, paths, savedFilter, sortDirection, sortField]);
}

/** Search is local and must not broaden a saved view's authoritative selection. */
export function sameAnnotationSelection(left: AnnotationFilter, right: AnnotationFilter): boolean {
  return JSON.stringify({ ...left, query: "" }) === JSON.stringify({ ...right, query: "" });
}

/** Saving the annotations view: over the open saved view, or as a new one named in a dialog. */
export function useAnnotationViewSaving(
  view: MdbaseLibraryView,
  controller: MdbaseLibraryViewsController,
  configuration: AnnotationViewConfiguration,
  sources: readonly SourceSummary[],
  onOpenView: (view: MdbaseLibraryView) => void,
): {
  readonly naming: boolean;
  readonly startNaming: () => void;
  readonly stopNaming: () => void;
  readonly saveAs: (name: string) => void;
  /** Present when the open view is a saved annotations view with unsaved changes. */
  readonly saveOver?: () => void;
} {
  const [naming, setNaming] = useState(false);
  const save = async (name: string, replace: boolean): Promise<void> => {
    const savedView = await controller.save({
      name,
      configuration: view.configuration,
      annotations: configuration,
      fieldShapes: Object.fromEntries(
        configuration.filter.sourceConditions.map(({ key }) => [key, fieldShape(sources, key)]),
      ),
      ...(replace ? { existing: view } : {}),
    });
    setNaming(false);
    onOpenView(savedView);
  };
  const changed =
    JSON.stringify(configuration) !== JSON.stringify(savedAnnotationConfiguration(view));
  const ownSaved = Boolean(view.annotations && view.path && view.owned && view.writable);
  return {
    naming,
    startNaming: () => setNaming(true),
    stopNaming: () => setNaming(false),
    saveAs: (name) => void save(name, false),
    ...(changed && ownSaved ? { saveOver: () => void save(view.name, true) } : {}),
  };
}
