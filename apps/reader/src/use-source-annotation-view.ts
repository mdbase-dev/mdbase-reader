import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { readerErrorMessage } from "./errors.js";
import { sourceAnnotationFamily } from "./source-annotation-family.js";

import type { AsyncResource } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, Source, SourceSummary } from "@mdbase-reader/core";

const noop = (): (() => void) => () => undefined;
const zero = (): number => 0;
const noAnnotations: readonly Annotation[] = [];

export interface SourceAnnotationView {
  readonly sources: readonly SourceSummary[];
  readonly wholeBook: boolean;
  readonly setWholeBook: (value: boolean) => void;
  /**
   * Shows an annotation just saved to another source of the family, such as the whole book from
   * one of its chapters, so its card can open: it turns on whole-book and lists the annotation at
   * once, before the family's annotations load again.
   */
  readonly reveal: (annotation: Annotation) => void;
  readonly problem: string | null;
}

/** One batch per family snapshot, independent of mounted cards and chapter filters. */
export function useSourceAnnotationView(
  gateway: ReaderWorkspaceGateway,
  source: Source | null,
  owned: AsyncResource<readonly Annotation[]>,
): {
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly view: SourceAnnotationView;
} {
  const revision = useSyncExternalStore(
    gateway.subscribeAnnotationChanges ?? gateway.subscribeAnnotationCounts ?? noop,
    gateway.annotationChangesRevision ?? gateway.annotationCountsRevision ?? zero,
    zero,
  );
  const [libraryRevision, setLibraryRevision] = useState(0);
  useEffect(
    () => gateway.subscribeLibrary?.(() => setLibraryRevision((value) => value + 1)),
    [gateway],
  );
  const [wholeFor, setWholeFor] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{
    readonly source: Source;
    readonly annotations: readonly Annotation[];
  } | null>(null);
  const [loaded, setLoaded] = useState<{
    readonly source: Source;
    readonly sources: readonly SourceSummary[];
    readonly annotations: readonly Annotation[];
  } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const batch = gateway.annotationsForSources?.bind(gateway);
    if (!source || !batch) {
      return undefined;
    }
    const controller = new AbortController();
    const options = { signal: controller.signal };
    void gateway
      .library(options)
      .then(async (library) => {
        if (library.sourceIndex?.complete === false) {
          throw new Error(
            "Chapter index is incomplete; only annotations saved to this source are shown.",
          );
        }
        const sources = sourceAnnotationFamily(source, library.sources);
        const annotations =
          sources.length > 1 ? await batch(new Set(sources.map(({ id }) => id)), options) : [];
        if (!controller.signal.aborted) {
          setLoaded({
            source,
            sources,
            annotations: [
              ...new Map(annotations.map((annotation) => [annotation.id, annotation])).values(),
            ],
          });
          setProblem(null);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded(null);
          setProblem(
            readerErrorMessage(
              reason,
              "Chapter annotations could not be loaded; only annotations saved to this source are shown.",
            ),
          );
        }
      });
    return () => controller.abort();
  }, [gateway, source, revision, libraryRevision]);
  const current = loaded?.source === source ? loaded : null;
  const sources = useMemo(() => current?.sources ?? (source ? [source] : []), [current, source]);
  const wholeBook = !source?.partOf || wholeFor === source.id;
  const extras = revealed?.source === source ? revealed.annotations : noAnnotations;
  const annotations = useMemo(
    (): AsyncResource<readonly Annotation[]> =>
      withRevealed(familyAnnotations(current, owned, wholeBook), wholeBook ? extras : []),
    [current, owned, wholeBook, extras],
  );
  return {
    annotations,
    view: {
      sources,
      wholeBook,
      setWholeBook: (value) => setWholeFor(value ? (source?.id ?? null) : null),
      reveal: (annotation) => {
        if (!source || annotation.sourceId === source.id) {
          return;
        }
        setWholeFor(source.id);
        setRevealed((latest) => ({
          source,
          annotations: [
            ...(latest?.source === source ? latest.annotations : []).filter(
              ({ id }) => id !== annotation.id,
            ),
            annotation,
          ],
        }));
      },
      problem,
    },
  };
}

function familyAnnotations(
  current: {
    readonly sources: readonly SourceSummary[];
    readonly annotations: readonly Annotation[];
  } | null,
  owned: AsyncResource<readonly Annotation[]>,
  wholeBook: boolean,
): AsyncResource<readonly Annotation[]> {
  if (!current || current.sources.length <= 1 || !wholeBook) {
    return owned;
  }
  // Prefer local pending/just-saved owned records without copying them into another note.
  const records = new Map(current.annotations.map((item) => [item.id, item]));
  if (owned.status === "ready") {
    for (const item of owned.value) {
      records.set(item.id, item);
    }
  }
  return { status: "ready", value: [...records.values()] };
}

/** Adds annotations just revealed until the family's own list has them. */
function withRevealed(
  annotations: AsyncResource<readonly Annotation[]>,
  revealed: readonly Annotation[],
): AsyncResource<readonly Annotation[]> {
  if (annotations.status !== "ready" || revealed.length === 0) {
    return annotations;
  }
  const listed = new Set(annotations.value.map(({ id }) => id));
  const missing = revealed.filter(({ id }) => !listed.has(id));
  return missing.length > 0
    ? { status: "ready", value: [...annotations.value, ...missing] }
    : annotations;
}
