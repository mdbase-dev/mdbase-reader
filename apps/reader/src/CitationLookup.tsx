import { i18n } from "@lingui/core";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState, type JSX, type SyntheticEvent } from "react";

import { citationDifferences, displayCslValue } from "./citation-form-model.js";
import { SearchIcon } from "./icons.js";

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
  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    editor.resolve(query);
  };
  return (
    <details className="citation-lookup">
      <summary>
        <SearchIcon />
        <span>
          <strong>
            <Trans>Find citation details</Trans>
          </strong>
          <small>
            <Trans>Search by DOI, ISBN, URL, or title</Trans>
          </small>
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
      {!editor.resolutionAvailable ? (
        <p className="citation-lookup-note">
          <Trans>
            Metadata lookup will be available when a resolver is connected. You can still edit and
            format CSL locally.
          </Trans>
        </p>
      ) : null}
      {editor.resolutionError ? (
        <p className="citation-lookup-error" role="alert">
          {editor.resolutionError}
        </p>
      ) : null}
      {editor.candidate ? (
        <CitationMergeReview
          key={`${editor.candidate.provenance.query}:${editor.candidate.provenance.retrievedAt}`}
          citation={citation}
          candidate={editor.candidate}
          editor={editor}
        />
      ) : null}
    </details>
  );
}

function CitationMergeReview({
  citation,
  candidate,
  editor,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly candidate: NonNullable<CitationEditorController["candidate"]>;
  readonly editor: CitationEditorController;
}): JSX.Element {
  const { t } = useLingui();
  const differences = useMemo(
    () => citationDifferences(citation, candidate.citation),
    [candidate, citation],
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () =>
      new Set(differences.filter(({ current }) => current === undefined).map(({ field }) => field)),
  );
  return (
    <div className="citation-merge-review">
      <div className="citation-merge-heading">
        <div>
          <strong>
            <Trans>Review found metadata</Trans>
          </strong>
          <span>
            {candidate.provenance.provider} ·{" "}
            {new Date(candidate.provenance.retrievedAt).toLocaleDateString(i18n.locale)}
          </span>
        </div>
        <button type="button" onClick={editor.dismissCandidate}>
          <Trans>Dismiss</Trans>
        </button>
      </div>
      {differences.length ? (
        <div className="citation-differences">
          {differences.map((difference) => (
            <label key={difference.field}>
              <span className="sr-only">{t`Use found ${fieldLabel(difference.field)}`}</span>
              <input
                type="checkbox"
                checked={selected.has(difference.field)}
                onChange={() => setSelected(toggle(selected, difference.field))}
              />
              <span className="citation-difference-copy">
                <strong>{fieldLabel(difference.field)}</strong>
                <span>
                  <small>{t({ message: "Current", context: "Current citation value" })}</small>
                  <del>{displayCslValue(difference.current)}</del>
                </span>
                <span>
                  <small>{t({ message: "Found" })}</small>
                  <ins>{displayCslValue(difference.candidate)}</ins>
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="citation-lookup-note">
          <Trans>The found record matches this citation.</Trans>
        </p>
      )}
      {candidate.warnings.map((warning) => (
        <p className="citation-lookup-error" key={warning}>
          {warning}
        </p>
      ))}
      <button
        className="citation-apply-metadata"
        type="button"
        disabled={selected.size === 0}
        onClick={() => editor.applyCandidate(selected)}
      >
        <Plural
          value={selected.size}
          _0="Apply selected details"
          one="Apply # change"
          other="Apply # changes"
        />
      </button>
    </div>
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

function toggle(values: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const updated = new Set(values);
  if (updated.has(value)) {
    updated.delete(value);
  } else {
    updated.add(value);
  }
  return updated;
}

function fieldLabel(field: string): string {
  return field.replaceAll("-", " ").replace(/^./u, (letter) => letter.toLocaleUpperCase());
}
