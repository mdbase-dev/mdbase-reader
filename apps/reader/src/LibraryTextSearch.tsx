import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useId, useState, type JSX } from "react";

import { readerErrorMessage } from "./errors.js";
import { searchExcerpt, type SearchExcerpt } from "./search-passages.js";
import { useOpenDocumentSearch } from "./use-open-document-search.js";

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
  const { t } = useLingui();
  const normalized = query.trim();
  const family = `reader-text-search:${useId()}`;
  const [result, setResult] = useState<{
    query: string;
    matches: readonly SourceTextSearchMatch[];
    problem: string | null;
  } | null>(null);
  const [limit, setLimit] = useState(100);
  const documents = useOpenDocumentSearch(scope === "documents", sources, surfaces, normalized);
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
              problem: readerErrorMessage(
                reason,
                translate({ message: "Text search failed. Change the query to retry." }),
              ),
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
          scope === "documents" ? documents.matches.has(id) : noteMatches.has(id),
        );
  const problem = scope === "documents" ? documents.problem : current?.problem;
  return (
    <section className="library-text-search" aria-label={t({ message: "Text search results" })}>
      <p className="search-coverage" role="status">
        {scope === "documents"
          ? documents.coverage
          : t({
              message:
                "Searches literature notes and annotation text, not PDF, EPUB or saved-page contents.",
            })}
      </p>
      {problem ? <p role="alert">{problem}</p> : null}
      <p role="status">{searchStatus(normalized, scope === "notes" && !current, visible.length)}</p>
      {scope === "documents" ? (
        <p className="search-coverage">
          <Trans>Open a result, then use the document’s Find control to locate the passage.</Trans>
        </p>
      ) : null}
      <ul className="search-passage-list">
        {visible.slice(0, limit).map((source) => {
          const note = noteMatches.get(source.id);
          const passage = note?.passages?.[0];
          const excerpt =
            scope === "documents"
              ? documents.matches.get(source.id)
              : passage
                ? searchExcerpt(passage.text, normalized)
                : null;
          const view =
            scope === "documents"
              ? "document"
              : passage?.kind === "annotation" || note?.kinds[0] === "annotation"
                ? "annotations"
                : "note";
          return (
            <li key={source.id}>
              <button type="button" onClick={() => onOpen(source.id, view)}>
                <strong>{source.title}</strong>
                <small>
                  {source.creators.join(", ")} ·{" "}
                  {view === "document"
                    ? t({ message: "Open document", context: "LibraryTextSearch interface" })
                    : view === "note"
                      ? t({ message: "Literature note", context: "LibraryTextSearch interface" })
                      : t({ message: "Annotation text", context: "LibraryTextSearch interface" })}
                </small>
                {excerpt ? <Excerpt value={excerpt} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {visible.length > limit ? (
        <button type="button" onClick={() => setLimit((value) => value + 100)}>
          <Trans>Show more results</Trans>
        </button>
      ) : null}
    </section>
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
    return translate({ message: "Enter at least two characters." });
  }
  if (searching) {
    return translate({ message: "Searching notes and annotations…" });
  }
  return `${String(count)} matching ${count === 1 ? "source" : "sources"}`;
}
