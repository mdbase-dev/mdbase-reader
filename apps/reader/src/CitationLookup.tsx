import { claimSourceLabel } from "@mdbase-reader/web-capture/citation-updates";
import { useLayoutEffect, useRef, useState, type JSX, type SyntheticEvent } from "react";

import { cslFieldLabel, displayCslValue } from "./citation-form-model.js";
import { citationSourceLabel } from "./citation-provenance.js";
import { SearchIcon } from "./icons.js";

import type { CitationEditorController } from "./use-citation-editor.js";

export function CitationLookup({
  citation,
  editor,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly editor: CitationEditorController;
}): JSX.Element {
  const [query, setQuery] = useState(lookupSeed(citation));
  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    editor.resolve(query);
  };
  return (
    <details className="citation-lookup">
      <summary>
        <SearchIcon />
        <span>
          <strong>Find citation details</strong>
          <small>Check for updates by DOI, ISBN, URL, or title</small>
        </span>
      </summary>
      <form onSubmit={submit}>
        <input
          className="mdbase-field"
          aria-label="Citation identifier, URL, or title"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Paste an identifier, URL, or title"
        />
        <button
          type="submit"
          disabled={
            !editor.resolutionAvailable || !query.trim() || editor.resolutionStatus === "resolving"
          }
        >
          {editor.resolutionStatus === "resolving" ? "Looking…" : "Find"}
        </button>
      </form>
      <p className="citation-lookup-note">
        Lookup sends your search or source URL to metadata providers. Accepting changes only the
        draft; Save changes writes them to your collection.
      </p>
      {!editor.resolutionAvailable ? (
        <p className="citation-lookup-note">
          Metadata lookup is unavailable here. You can still edit CSL locally.
        </p>
      ) : null}
      {editor.resolutionError ? (
        <p className="citation-lookup-error" role="alert">
          {editor.resolutionError}
        </p>
      ) : null}
      {editor.resolutionStatus === "resolved" ? <CitationSuggestions editor={editor} /> : null}
    </details>
  );
}

function CitationSuggestions({
  editor,
}: {
  readonly editor: CitationEditorController;
}): JSX.Element {
  const results = useRef<HTMLElement>(null);
  const focusIndex = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (focusIndex.current === null) {
      return;
    }
    const actions = results.current?.querySelectorAll<HTMLButtonElement>(
      ".citation-review-actions button:first-child",
    );
    const target =
      actions?.[Math.min(focusIndex.current, actions.length - 1)] ??
      results.current?.querySelector<HTMLElement>("[data-citation-results-status]");
    target?.focus();
    focusIndex.current = null;
  });
  const review = (index: number, action: () => void): void => {
    focusIndex.current = index;
    action();
  };
  return (
    <section
      ref={results}
      className="citation-suggestions"
      aria-label="Citation suggestions"
      aria-live="polite"
    >
      {editor.suggestions.length ? (
        <>
          <header>
            <strong tabIndex={-1} data-citation-results-status>
              Review found metadata
            </strong>
            <button
              type="button"
              onClick={() =>
                review(0, () =>
                  editor.acceptSuggestions(new Set(editor.suggestions.map(({ field }) => field))),
                )
              }
            >
              Accept all
            </button>
          </header>
          {editor.suggestions.map((suggestion, index) => (
            <div className="citation-suggestion" key={suggestion.field}>
              <strong>{cslFieldLabel(suggestion.field)}</strong>
              <div className="citation-difference-copy">
                <span>
                  <small>Current</small>
                  <del>{displayCslValue(suggestion.current)}</del>
                </span>
                <span>
                  <small>Proposed</small>
                  <ins>{displayCslValue(suggestion.proposed)}</ins>
                </span>
              </div>
              <small>{citationSourceLabel(claimSourceLabel(suggestion.source))}</small>
              <div className="citation-review-actions">
                <button
                  type="button"
                  aria-label={`Accept ${cslFieldLabel(suggestion.field)}`}
                  onClick={() =>
                    review(index, () => editor.acceptSuggestions(new Set([suggestion.field])))
                  }
                >
                  Accept
                </button>
                <button
                  type="button"
                  aria-label={`Dismiss ${cslFieldLabel(suggestion.field)}`}
                  onClick={() => review(index, () => editor.dismissSuggestion(suggestion.field))}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </>
      ) : (
        <p className="citation-lookup-note" tabIndex={-1} data-citation-results-status>
          No suggestions to review. Manual edits and removed fields are kept.
        </p>
      )}
    </section>
  );
}

function lookupSeed(citation: Readonly<Record<string, unknown>>): string {
  for (const field of ["DOI", "ISBN", "PMID", "URL", "title"]) {
    const value = citation[field];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}
