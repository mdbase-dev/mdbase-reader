import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

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
  /** Drops an annotation from those revealed, such as one just deleted. */
  readonly forget: (annotationId: Annotation["id"]) => void;
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
  const revealed = useRevealedAnnotations(source);
  const { mark, settle } = revealed;
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
    const revealedBefore = mark();
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
          // The family's list now speaks for every annotation revealed before it was asked for:
          // it lists those still there, and one it lacks has since been deleted.
          settle(source, revealedBefore, new Set(annotations.map(({ id }) => id)));
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
  }, [gateway, source, revision, libraryRevision, mark, settle]);
  const current = loaded?.source === source ? loaded : null;
  const sources = useMemo(() => current?.sources ?? (source ? [source] : []), [current, source]);
  const wholeBook = !source?.partOf || wholeFor === source.id;
  const { extras } = revealed;
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
        if (source && annotation.sourceId !== source.id) {
          setWholeFor(source.id);
          revealed.reveal(source, annotation);
        }
      },
      forget: revealed.forget,
      problem,
    },
  };
}

/**
 * Annotations just saved elsewhere in the family, listed until a family load that could have seen
 * them settles whether they are still there.
 */
function useRevealedAnnotations(source: Source | null): {
  readonly extras: readonly Annotation[];
  readonly reveal: (source: Source, annotation: Annotation) => void;
  readonly forget: (annotationId: Annotation["id"]) => void;
  /** Starts a family load: the reveals made so far, which its list will speak for. */
  readonly mark: () => number;
  readonly settle: (source: Source, before: number, listed: ReadonlySet<Annotation["id"]>) => void;
} {
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  // Counts reveals, so a family load can tell which it could have seen.
  const reveals = useRef(0);
  const actions = useMemo(
    () => ({
      reveal: (owner: Source, annotation: Annotation) => {
        reveals.current += 1;
        const entry = { annotation, seq: reveals.current };
        setRevealed((latest) => ({
          source: owner,
          entries: [
            ...(latest?.source === owner ? latest.entries : []).filter(
              ({ annotation: { id } }) => id !== annotation.id,
            ),
            entry,
          ],
        }));
      },
      forget: (annotationId: Annotation["id"]) =>
        setRevealed((latest) =>
          latest?.entries.some(({ annotation }) => annotation.id === annotationId)
            ? {
                ...latest,
                entries: latest.entries.filter(({ annotation }) => annotation.id !== annotationId),
              }
            : latest,
        ),
      mark: () => reveals.current,
      settle: (owner: Source, before: number, listed: ReadonlySet<Annotation["id"]>) =>
        setRevealed((latest) => settleRevealed(latest, owner, before, listed)),
    }),
    [],
  );
  const extras = useMemo(
    () =>
      revealed?.source === source
        ? revealed.entries.map(({ annotation }) => annotation)
        : noAnnotations,
    [revealed, source],
  );
  return { extras, ...actions };
}

/** Annotations revealed for one source, each with the reveal that added it. */
interface Revealed {
  readonly source: Source;
  readonly entries: readonly { readonly annotation: Annotation; readonly seq: number }[];
}

/**
 * Keeps only the reveals the family's list does not yet speak for: those it lacks that were made
 * after the load that produced it began.
 */
function settleRevealed(
  latest: Revealed | null,
  source: Source,
  revealedBefore: number,
  listed: ReadonlySet<Annotation["id"]>,
): Revealed | null {
  if (latest?.source !== source) {
    return latest;
  }
  const entries = latest.entries.filter(
    ({ annotation, seq }) => seq > revealedBefore && !listed.has(annotation.id),
  );
  return entries.length === latest.entries.length ? latest : { source, entries };
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
