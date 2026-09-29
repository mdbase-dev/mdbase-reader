import { Select, type SelectItems } from "@mdbase-dev/ui/select";

import {
  citationDateText,
  commonCslTypes,
  cslDate,
  specialistCslTypes,
  updateCitationField,
} from "./citation-form-model.js";
import { CitationAdditionalFields } from "./CitationAdditionalFields.js";
import { CitationContributors } from "./CitationContributors.js";

import type { CslValidationProblem } from "@mdbase-reader/core";
import type { JSX } from "react";

// The complete field surface stays together so its section order remains easy to audit.
// eslint-disable-next-line max-lines-per-function
export function CitationStructuredEditor({
  citation,
  problems,
  onChange,
  onRegenerateCitekey,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly problems: readonly CslValidationProblem[];
  readonly onChange: (citation: Readonly<Record<string, unknown>>) => void;
  readonly onRegenerateCitekey: () => void;
}): JSX.Element {
  const update = (field: string, value: unknown): void =>
    onChange(updateCitationField(citation, field, value));
  const problem = (field: string): string | undefined =>
    problems.find(
      ({ path }) =>
        path === `csl.${field}` ||
        path.startsWith(`csl.${field}.`) ||
        path.startsWith(`csl.${field}[`),
    )?.message;
  return (
    <div className="citation-form">
      <section className="citation-field-section is-primary">
        <header>
          <strong>Citation details</strong>
          <small>Title, work type, and citation key</small>
        </header>
        <div className="citation-field-grid">
          <label className="citation-field is-wide">
            <span>Title</span>
            <input
              className="mdbase-field"
              aria-invalid={problem("title") ? true : undefined}
              value={fieldText(citation, "title")}
              onChange={(event) => update("title", event.target.value)}
            />
            <FieldProblem message={problem("title")} />
          </label>
          <label className="citation-field">
            <span>Type</span>
            <Select
              aria-label="Type"
              aria-invalid={problem("type") ? true : undefined}
              value={fieldText(citation, "type")}
              options={cslTypeOptions(fieldText(citation, "type"))}
              onChange={(type) => update("type", type)}
            />
            <FieldProblem message={problem("type")} />
          </label>
          <label className="citation-field citation-citekey-field">
            <span>Citekey</span>
            <div>
              <b>@</b>
              <input
                className="mdbase-field"
                aria-invalid={problem("id") ? true : undefined}
                value={fieldText(citation, "id")}
                onChange={(event) => update("id", event.target.value)}
              />
            </div>
            <FieldProblem message={problem("id")} />
            <button type="button" onClick={onRegenerateCitekey}>
              Regenerate
            </button>
          </label>
        </div>
      </section>

      <section className="citation-field-section">
        <header>
          <strong>Contributors</strong>
          <small>Authors, editors, translators, and organisations</small>
        </header>
        <CitationContributors
          citation={citation}
          field="author"
          label="Authors"
          onChange={update}
        />
        <FieldProblem message={problem("author")} />
        <details>
          <summary>Editors and translators</summary>
          <CitationContributors
            citation={citation}
            field="editor"
            label="Editors"
            onChange={update}
          />
          <CitationContributors
            citation={citation}
            field="translator"
            label="Translators"
            onChange={update}
          />
        </details>
      </section>

      <section className="citation-field-section">
        <header>
          <strong>Publication</strong>
          <small>Where and when the work appeared</small>
        </header>
        <div className="citation-field-grid">
          <DateField
            label="Issued"
            value={citationDateText(citation, "issued")}
            onChange={(value) => update("issued", cslDate(value))}
            problem={problem("issued")}
          />
          <TextField
            citation={citation}
            field="container-title"
            label="Journal, book or site"
            wide
            onChange={update}
            problem={problem("container-title")}
          />
          <TextField
            citation={citation}
            field="publisher"
            label="Publisher"
            onChange={update}
            problem={problem("publisher")}
          />
          <TextField
            citation={citation}
            field="publisher-place"
            label="Place"
            onChange={update}
            problem={problem("publisher-place")}
          />
          <TextField
            citation={citation}
            field="volume"
            label="Volume"
            onChange={update}
            problem={problem("volume")}
          />
          <TextField
            citation={citation}
            field="issue"
            label="Issue"
            onChange={update}
            problem={problem("issue")}
          />
          <TextField
            citation={citation}
            field="page"
            label="Pages"
            onChange={update}
            problem={problem("page")}
          />
          <TextField
            citation={citation}
            field="edition"
            label="Edition"
            onChange={update}
            problem={problem("edition")}
          />
        </div>
      </section>

      <details className="citation-field-section">
        <summary>
          <span>
            <strong>Identifiers and access</strong>
            <small>DOI, ISBN, URL, and language</small>
          </span>
        </summary>
        <div className="citation-field-grid">
          <TextField
            citation={citation}
            field="DOI"
            label="DOI"
            onChange={update}
            problem={problem("DOI")}
          />
          <TextField
            citation={citation}
            field="ISBN"
            label="ISBN"
            onChange={update}
            problem={problem("ISBN")}
          />
          <TextField
            citation={citation}
            field="ISSN"
            label="ISSN"
            onChange={update}
            problem={problem("ISSN")}
          />
          <TextField
            citation={citation}
            field="URL"
            label="URL"
            wide
            onChange={update}
            problem={problem("URL")}
          />
          <TextField
            citation={citation}
            field="language"
            label="Language"
            onChange={update}
            problem={problem("language")}
          />
        </div>
      </details>

      <details className="citation-field-section citation-abstract-section">
        <summary>
          <span>
            <strong>Abstract</strong>
            <small>Optional descriptive text</small>
          </span>
        </summary>
        <label className="citation-field">
          <span>Abstract</span>
          <textarea
            className="mdbase-field"
            aria-invalid={problem("abstract") ? true : undefined}
            rows={5}
            value={fieldText(citation, "abstract")}
            onChange={(event) => update("abstract", event.target.value)}
          />
          <FieldProblem message={problem("abstract")} />
        </label>
      </details>
      <CitationAdditionalFields citation={citation} problems={problems} onChange={onChange} />
    </div>
  );
}

function TextField({
  citation,
  field,
  label,
  wide = false,
  problem,
  onChange,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly field: string;
  readonly label: string;
  readonly wide?: boolean;
  readonly problem?: string | undefined;
  readonly onChange: (field: string, value: unknown) => void;
}): JSX.Element {
  return (
    <label className={`citation-field${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      <input
        className="mdbase-field"
        aria-invalid={problem ? true : undefined}
        value={fieldText(citation, field)}
        onChange={(event) => onChange(field, event.target.value)}
      />
      <FieldProblem message={problem} />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
  problem,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly problem?: string | undefined;
}): JSX.Element {
  return (
    <label className="citation-field">
      <span>{label}</span>
      <input
        className="mdbase-field"
        aria-invalid={problem ? true : undefined}
        placeholder="YYYY, YYYY-MM-DD, or a season"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldProblem message={problem} />
    </label>
  );
}

function FieldProblem({ message }: { readonly message?: string | undefined }): JSX.Element | null {
  return message ? <small className="citation-field-problem">{message}</small> : null;
}

function fieldText(citation: Readonly<Record<string, unknown>>, field: string): string {
  const value = citation[field];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** The common and specialist CSL types, keeping an unrecognised current type selectable. */
function cslTypeOptions(current: string): SelectItems {
  const known = [...commonCslTypes, ...specialistCslTypes].some(([value]) => value === current);
  return [
    ...(known || !current ? [] : [{ value: current, label: current }]),
    { label: "Common", options: commonCslTypes.map(([value, label]) => ({ value, label })) },
    {
      label: "Specialist",
      options: specialistCslTypes.map(([value, label]) => ({ value, label })),
    },
  ];
}
