import { useEffect, useMemo, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import {
  annotationViewConfiguration,
  defaultAnnotationViewConfiguration,
  type AnnotationLayout,
  type AnnotationViewConfiguration,
} from "./mdbase-annotation-views.js";
import { useLayoutDraft } from "./use-layout-draft.js";

import type { MdbaseLibraryView } from "./mdbase-library-views.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

const prefix = "mdbase-reader:annotation-layout:v1:";

/** The annotations configuration a view opens with: its saved one, or the default. */
export function savedAnnotationConfiguration(view: MdbaseLibraryView): AnnotationViewConfiguration {
  return view.annotations ?? defaultAnnotationViewConfiguration;
}

export function annotationLayoutOf(configuration: AnnotationViewConfiguration): AnnotationLayout {
  const { columns, columnWidths, sortField, sortDirection } = configuration;
  return { columns, columnWidths, sortField, sortDirection };
}

/** Columns, widths and sort for a view's annotations, remembered on this device until saved. */
export function useAnnotationLayoutDraft(
  collectionKey: string,
  view: MdbaseLibraryView,
): readonly [AnnotationLayout, (layout: AnnotationLayout) => void] {
  const saved = useMemo(() => annotationLayoutOf(savedAnnotationConfiguration(view)), [view]);
  return useLayoutDraft(`${prefix}${collectionKey}:${view.key}`, view.revision, saved, (stored) =>
    // Validate through the same parser the view file uses.
    annotationLayoutOf(annotationViewConfiguration({ options: stored as Record<string, unknown> })),
  );
}

export interface AnnotationViewExecution {
  /** The annotation paths mdbase selected, or null when Reader filters by itself. */
  readonly paths: ReadonlySet<string> | null;
  readonly problem: string | null;
  readonly ready: boolean;
}

/**
 * Runs a saved annotations view through mdbase, so the view shows what other tools show. Should
 * that fail, Reader applies the same filters itself and says so.
 */
export function useAnnotationViewExecution(
  gateway: ReaderWorkspaceGateway,
  view: MdbaseLibraryView,
  revision = 0,
): AnnotationViewExecution {
  const [result, setResult] = useState<{
    readonly view: MdbaseLibraryView;
    readonly gateway: ReaderWorkspaceGateway;
    readonly revision: number;
    readonly execution: AnnotationViewExecution;
  } | null>(null);
  const runnable = Boolean(
    view.path && view.annotations && typeof gateway.executeAnnotationView === "function",
  );
  useEffect(() => {
    if (!runnable || !gateway.executeAnnotationView) {
      return undefined;
    }
    const controller = new AbortController();
    void gateway
      .executeAnnotationView(view, { signal: controller.signal })
      .then((paths) => {
        if (!controller.signal.aborted) {
          setResult({ view, gateway, revision, execution: { paths, problem: null, ready: true } });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            view,
            gateway,
            revision,
            execution: {
              paths: null,
              ready: true,
              problem: `${readerErrorMessage(reason, "mdbase could not run this view.")} Reader is applying its filters itself.`,
            },
          });
        }
      });
    return () => controller.abort();
  }, [gateway, revision, runnable, view]);
  if (!runnable) {
    return { paths: null, problem: null, ready: true };
  }
  return result?.view === view && result.gateway === gateway && result.revision === revision
    ? result.execution
    : { paths: null, problem: null, ready: false };
}

export interface SourceAnnotationsViewAction {
  readonly busy: boolean;
  readonly message: string | null;
  readonly run: () => void;
}

/** Adds the collection's "Annotations for this source" view, when the gateway can. */
export function useSourceAnnotationsView(
  gateway: ReaderWorkspaceGateway,
): SourceAnnotationsViewAction | null {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!gateway.ensureSourceAnnotationsView) {
    return null;
  }
  const ensure = gateway.ensureSourceAnnotationsView.bind(gateway);
  return {
    busy,
    message,
    run: () => {
      setBusy(true);
      setMessage(null);
      void ensure()
        .then(({ path, created }) =>
          setMessage(
            created
              ? `Added ${path}. Run it with a source as its context in any mdbase tool.`
              : `Your collection already has it: ${path}.`,
          ),
        )
        .catch((reason: unknown) =>
          setMessage(readerErrorMessage(reason, "Reader could not add the view.")),
        )
        .finally(() => setBusy(false));
    },
  };
}
