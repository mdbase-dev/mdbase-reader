import { useEffect, useId, useState, type JSX } from "react";

import { readerErrorMessage } from "./errors.js";
import { searchExcerpt, type SearchExcerpt } from "./search-passages.js";
import { useIndexedDocumentSearch } from "./use-indexed-document-search.js";
import { useOpenDocumentSearch } from "./use-open-document-search.js";

import type { DocumentSearchHit } from "./use-indexed-document-search.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId, SourceSummary, SourceTextSearchMatch } from "@mdbase-reader/core";
import type { ReadingSurface } from "@mdbase-reader/reading-surface";

export type LibrarySearchScope = "sources" | "notes" | "documents";

interface LibraryTextSearchProps {
  readonly scope: "notes" | "documents";
  readonly query: string;
  readonly sources: readonly SourceSummary[];
  readonly gateway: ReaderWorkspaceGateway;
  readonly surfaces: ReadonlyMap<string, ReadingSurface> | undefined;
  readonly onOpen: (id: SourceId, view: "document" | "note" | "annotations") => void;
}

export function LibraryTextSearch({
  scope,
  query,
  sources,
  gateway,
  surfaces,
  onOpen,
}: LibraryTextSearchProps): JSX.Element {
  const normalized = query.trim();
  const family = `reader-text-search:${useId()}`;
  const [result, setResult] = useState<{
    query: string;
    matches: readonly SourceTextSearchMatch[];
    problem: string | null;
  } | null>(null);
  const [limit, setLimit] = useState(100);
  const documents = useOpenDocumentSearch(scope === "documents", sources, surfaces, normalized);
  const indexed = useIndexedDocumentSearch(
    scope === "documents",
    normalized,
    sources,
    documents.matches,
  );
  useEffect(() => {
    if (scope !== "notes" || normalized.length < 2) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void gateway
        .searchText(normalized, { signal: controller.signal, replaceableFamily: family })
        .then((matches) => {
          if (!controller.signal.aborted) {
            setResult({ query: normalized, matches, problem: null });
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setResult({
              query: normalized,
              matches: [],
              problem: readerErrorMessage(reason, "Text search failed. Change the query to retry."),
            });
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [family, gateway, normalized, scope]);
  const current = result?.query === normalized ? result : null;
  const noteMatches = new Map(current?.matches.map((match) => [match.sourceId, match]) ?? []);
  const visible =
    normalized.length < 2
      ? []
      : sources.filter(({ id }) =>
          scope === "documents" ? indexed.matches.has(id) : noteMatches.has(id),
        );
  const problem = scope === "documents" ? documents.problem : current?.problem;
  return (
    <section className="library-text-search" aria-label="Text search results">
      <p className="search-coverage" role="status">
        {scope === "documents"
          ? `${indexed.status} ${documents.coverage}`
          : "Searches literature notes and annotation text, not PDF, EPUB or saved-page contents."}
      </p>
      {scope === "documents" ? (
        <IndexPauseControl paused={indexed.paused} togglePause={indexed.togglePause} />
      ) : null}
      {problem ? <p role="alert">{problem}</p> : null}
      <p role="status">{searchStatus(normalized, scope === "notes" && !current, visible.length)}</p>
      {scope === "documents" ? (
        <p className="search-coverage">
          Open a result, then use the document’s Find control to locate the passage.
        </p>
      ) : null}
      <ul className="search-passage-list">
        {visible.slice(0, limit).map((source) => (
          <SearchResult
            key={source.id}
            source={source}
            scope={scope}
            query={normalized}
            note={noteMatches.get(source.id)}
            document={indexed.matches.get(source.id)}
            onOpen={onOpen}
          />
        ))}
      </ul>
      {visible.length > limit ? (
        <button type="button" onClick={() => setLimit((value) => value + 100)}>
          Show more results
        </button>
      ) : null}
    </section>
  );
}

function SearchResult({
  source,
  scope,
  query,
  note,
  document,
  onOpen,
}: {
  readonly source: SourceSummary;
  readonly scope: "notes" | "documents";
  readonly query: string;
  readonly note: SourceTextSearchMatch | undefined;
  readonly document: DocumentSearchHit | undefined;
  readonly onOpen: LibraryTextSearchProps["onOpen"];
}): JSX.Element {
  const passage = note?.passages?.[0];
  const excerpt =
    scope === "documents" ? document?.excerpt : passage ? searchExcerpt(passage.text, query) : null;
  const view =
    scope === "documents"
      ? "document"
      : passage?.kind === "annotation" || note?.kinds[0] === "annotation"
        ? "annotations"
        : "note";
  const label = searchResultLabel(view, document?.file);
  return (
    <li>
      <button type="button" onClick={() => onOpen(source.id, view)}>
        <strong>{source.title}</strong>
        <small>
          {source.creators.join(", ")} · {label}
        </small>
        {excerpt ? <Excerpt value={excerpt} /> : null}
      </button>
    </li>
  );
}

function searchResultLabel(
  view: "document" | "note" | "annotations",
  file: string | undefined,
): string {
  if (view === "document") {
    return `Open document · ${file ?? ""}`;
  }
  return view === "note" ? "Literature note" : "Annotation text";
}

function IndexPauseControl({
  paused,
  togglePause,
}: {
  readonly paused: boolean;
  readonly togglePause: (() => void) | undefined;
}): JSX.Element | null {
  if (!togglePause) {
    return null;
  }
  return (
    <button type="button" onClick={togglePause} aria-pressed={paused}>
      {paused ? "Resume library indexing" : "Pause library indexing"}
    </button>
  );
}

function Excerpt({ value }: { readonly value: SearchExcerpt }): JSX.Element {
  return (
    <p>
      {value.before}
      <mark>{value.match}</mark>
      {value.after}
    </p>
  );
}

function searchStatus(query: string, searching: boolean, count: number): string {
  if (query.length < 2) {
    return "Enter at least two characters.";
  }
  if (searching) {
    return "Searching notes and annotations…";
  }
  return `${String(count)} matching ${count === 1 ? "source" : "sources"}`;
}
