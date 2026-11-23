import { plural, t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useEffect, useId, useState, type JSX } from "react";

import { readerErrorMessage } from "./errors.js";
import { searchExcerpt } from "./search-passages.js";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId, SourceSummary, SourceTextSearchMatch } from "@mdbase-reader/core";

const shownAtFirst = 3;

export interface NoteSearch {
  readonly query: string;
  readonly matches: ReadonlyMap<SourceId, SourceTextSearchMatch>;
  readonly problem: string | null;
}

const noMatches: ReadonlyMap<SourceId, SourceTextSearchMatch> = new Map();

/** Looks the library search up in source notes and annotation text, once typing pauses. */
export function useNoteSearch(gateway: ReaderWorkspaceGateway, text: string): NoteSearch {
  const query = text.trim();
  const family = `reader-note-search:${useId()}`;
  const [result, setResult] = useState<NoteSearch | null>(null);
  useEffect(() => {
    if (query.length < 2) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void gateway
        .searchText(query, { signal: controller.signal, replaceableFamily: family })
        .then((found) => {
          if (!controller.signal.aborted) {
            setResult({
              query,
              matches: new Map(found.map((match) => [match.sourceId, match])),
              problem: null,
            });
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) {
            setResult({
              query,
              matches: noMatches,
              problem: readerErrorMessage(
                reason,
                translate({ message: "Notes and annotations could not be searched." }),
              ),
            });
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [family, gateway, query]);
  return result?.query === query && query.length >= 2
    ? result
    : { query, matches: noMatches, problem: null };
}

/**
 * Sources whose note or annotations mention the search, listed above the sources the
 * search matches by title, author or tag. Shows nothing when there are none.
 */
export function LibraryNoteMatches({
  search,
  sources,
  onOpen,
}: {
  readonly search: NoteSearch;
  /** The sources the view's other filters allow, in the view's order. */
  readonly sources: readonly SourceSummary[];
  readonly onOpen: (id: SourceId, view: "note" | "annotations") => void;
}): JSX.Element | null {
  useLocale();
  const [all, setAll] = useState(false);
  const found = sources.filter(({ id }) => search.matches.has(id));
  if (found.length === 0) {
    return search.problem ? (
      <p className="library-note-matches-problem" role="alert">
        {search.problem}
      </p>
    ) : null;
  }
  const shown = all ? found : found.slice(0, shownAtFirst);
  return (
    <section className="library-note-matches" aria-labelledby="library-note-matches-heading">
      <header>
        <h2 id="library-note-matches-heading">
          <Trans>In notes and annotations</Trans>
        </h2>
        <span role="status">{plural(found.length, { one: "# source", other: "# sources" })}</span>
      </header>
      <ul className="search-passage-list">
        {shown.map((source) => (
          <NoteMatch
            key={source.id}
            source={source}
            match={search.matches.get(source.id)}
            query={search.query}
            onOpen={onOpen}
          />
        ))}
      </ul>
      {found.length > shownAtFirst ? (
        <button
          type="button"
          className="library-note-matches-more"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all
            ? translate({ message: "Show fewer" })
            : plural(found.length - shownAtFirst, { one: "Show # more", other: "Show # more" })}
        </button>
      ) : null}
    </section>
  );
}

function NoteMatch({
  source,
  match,
  query,
  onOpen,
}: {
  readonly source: SourceSummary;
  readonly match: SourceTextSearchMatch | undefined;
  readonly query: string;
  readonly onOpen: (id: SourceId, view: "note" | "annotations") => void;
}): JSX.Element {
  const passage = match?.passages?.[0];
  const excerpt = passage ? searchExcerpt(passage.text, query, { markdown: true }) : null;
  const view =
    passage?.kind === "annotation" || match?.kinds[0] === "annotation" ? "annotations" : "note";
  const label =
    view === "note"
      ? translate({ message: "Source note" })
      : translate({ message: "Annotation text" });
  return (
    <li>
      <button type="button" onClick={() => onOpen(source.id, view)}>
        <strong>{source.title}</strong>
        <small>{[source.creators.join(", "), label].filter(Boolean).join(" · ")}</small>
        {excerpt ? (
          <p>
            {excerpt.before}
            <mark>{excerpt.match}</mark>
            {excerpt.after}
          </p>
        ) : null}
      </button>
    </li>
  );
}
