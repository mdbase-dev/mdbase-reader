import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { claimSourceLabel } from "@mdbase-reader/web-capture/citation-updates";
import { useLayoutEffect, useRef, useState, type JSX, type SyntheticEvent } from "react";

import { cslFieldLabel, displayCslValue } from "./citation-form-model.js";
import { citationSourceLabel } from "./citation-provenance.js";
import { ChevronRightIcon } from "./icons.js";
import { useSessionDisclosure } from "./use-session-choice.js";

import type { CitationEditorController } from "./use-citation-editor.js";

export function CitationLookup({
  citation,
  editor,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly editor: CitationEditorController;
}): JSX.Element {
  const { t } = useLingui();
  const [query, setQuery] = useState(lookupSeed(citation));
  const disclosure = useSessionDisclosure("citation.lookup");
  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    editor.resolve(query);
  };
  return (
    <details className="citation-lookup citation-disclosure" {...disclosure}>
      <summary>
        <ChevronRightIcon />
        <span>
          <Trans>Look up by DOI, ISBN, URL or title</Trans>
        </span>
      </summary>
      <form onSubmit={submit}>
        <input
          className="mdbase-field"
          aria-label={t({ message: "Citation identifier, URL, or title" })}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t({ message: "Paste an identifier, URL, or title" })}
        />
        <button
          type="submit"
          disabled={
            !editor.resolutionAvailable || !query.trim() || editor.resolutionStatus === "resolving"
          }
        >
          {editor.resolutionStatus === "resolving"
            ? t({ message: "Looking…", context: "CitationLookup interface" })
            : t({ message: "Find", context: "CitationLookup interface" })}
        </button>
      </form>
      <p className="citation-lookup-note">
        <Trans>
          Lookup sends your search or source URL to metadata providers. Accepting changes only the
          draft; Save details writes them to your collection.
        </Trans>
      </p>
      {!editor.resolutionAvailable ? (
        <p className="citation-lookup-note">
          <Trans>
            Metadata lookup is unavailable here. You can still edit the citation details here.
          </Trans>
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
  useLocale();
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
      aria-label={translate({ message: "Citation suggestions" })}
      aria-live="polite"
    >
      {editor.suggestions.length ? (
        <>
          <header>
            <strong tabIndex={-1} data-citation-results-status>
              <Trans>Review found metadata</Trans>
            </strong>
            <button
              type="button"
              onClick={() =>
                review(0, () =>
                  editor.acceptSuggestions(new Set(editor.suggestions.map(({ field }) => field))),
                )
              }
            >
              <Trans>Accept all</Trans>
            </button>
          </header>
          {editor.suggestions.map((suggestion, index) => (
            <div className="citation-suggestion" key={suggestion.field}>
              <strong>{cslFieldLabel(suggestion.field)}</strong>
              <div className="citation-difference-copy">
                <span>
                  <small>
                    <Trans context="Reader interface">Current</Trans>
                  </small>
                  <del>{displayCslValue(suggestion.current)}</del>
                </span>
                <span>
                  <small>
                    <Trans>Proposed</Trans>
                  </small>
                  <ins>{displayCslValue(suggestion.proposed)}</ins>
                </span>
              </div>
              <small>
                {citationSourceLabel(
                  [claimSourceLabel(suggestion.source), suggestion.evidence]
                    .filter(Boolean)
                    .join(" "),
                )}
              </small>
              <div className="citation-review-actions">
                <button
                  type="button"
                  aria-label={translate`Accept ${cslFieldLabel(suggestion.field)}`}
                  onClick={() =>
                    review(index, () => editor.acceptSuggestions(new Set([suggestion.field])))
                  }
                >
                  <Trans>Accept</Trans>
                </button>
                <button
                  type="button"
                  aria-label={translate`Dismiss ${cslFieldLabel(suggestion.field)}`}
                  onClick={() => review(index, () => editor.dismissSuggestion(suggestion.field))}
                >
                  <Trans>Dismiss</Trans>
                </button>
              </div>
            </div>
          ))}
        </>
      ) : (
        <p className="citation-lookup-note" tabIndex={-1} data-citation-results-status>
          <Trans>No suggestions to review. Manual edits and removed fields are kept.</Trans>
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
