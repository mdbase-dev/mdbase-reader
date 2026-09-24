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
import { savedAnnotationConfiguration } from "./use-annotation-view.js";

import type { AnnotationLayout, AnnotationViewConfiguration } from "./mdbase-annotation-views.js";
import type { MdbaseLibraryView } from "./mdbase-library-views.js";
import type { MdbaseLibraryViewsController } from "./use-mdbase-library-views.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, SourceSummary } from "@mdbase-reader/core";

export type AnnotationsLoad =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly annotations: readonly Annotation[] }
  | { readonly status: "error"; readonly message: string };

/** Every annotation in the collection, loaded again by `retry`. */
export function useAllAnnotations(gateway: ReaderWorkspaceGateway): {
  readonly load: AnnotationsLoad;
  readonly retry: () => void;
} {
  const [reloads, setReloads] = useState(0);
  const load = useAnnotationsLoad(gateway, reloads);
  return { load, retry: () => setReloads((count) => count + 1) };
}

function useAnnotationsLoad(gateway: ReaderWorkspaceGateway, reloads: number): AnnotationsLoad {
  const [result, setResult] = useState<{
    readonly key: number;
    readonly load: AnnotationsLoad;
  } | null>(null);
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
      paths && JSON.stringify(filter) === JSON.stringify(savedFilter)
        ? filterAnnotationEntries(
            all.filter(({ annotation }) => annotation.path && paths.has(annotation.path)),
            { ...emptyAnnotationFilter, query: filter.query },
          )
        : filterAnnotationEntries(all, filter);
    return sortAnnotationEntries(filtered, sortField, sortDirection);
  }, [all, filter, paths, savedFilter, sortDirection, sortField]);
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
