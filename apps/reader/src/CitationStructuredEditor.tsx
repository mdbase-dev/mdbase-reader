import { i18n } from "@lingui/core";
import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
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
          <strong>
            <Trans>Citation details</Trans>
          </strong>
          <small>
            <Trans>Title, work type, and citation key</Trans>
          </small>
        </header>
        <div className="citation-field-grid">
          <label className="citation-field is-wide">
            <span>
              <Trans context="CitationStructuredEditor interface">Title</Trans>
            </span>
            <input
              className="mdbase-field"
              aria-invalid={problem("title") ? true : undefined}
              value={fieldText(citation, "title")}
              onChange={(event) => update("title", event.target.value)}
            />
            <FieldProblem message={problem("title")} />
          </label>
          <label className="citation-field">
            <span>
              <Trans context="CitationStructuredEditor interface">Type</Trans>
            </span>
            <Select
              aria-label={t({ message: "Type", context: "CitationStructuredEditor interface" })}
              aria-invalid={problem("type") ? true : undefined}
              value={fieldText(citation, "type")}
              options={cslTypeOptions(fieldText(citation, "type"))}
              onChange={(type) => update("type", type)}
            />
            <FieldProblem message={problem("type")} />
          </label>
          <label className="citation-field citation-citekey-field">
            <span>
              <Trans>Citekey</Trans>
            </span>
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
              <Trans>Regenerate</Trans>
            </button>
          </label>
        </div>
      </section>

      <section className="citation-field-section">
        <header>
          <strong>
            <Trans>Contributors</Trans>
          </strong>
          <small>
            <Trans>Authors, editors, translators, and organisations</Trans>
          </small>
        </header>
        <CitationContributors
          citation={citation}
          field="author"
          label={t({ message: "Authors", context: "CitationStructuredEditor interface" })}
          onChange={update}
        />
        <FieldProblem message={problem("author")} />
        <details>
          <summary>
            <Trans>Editors and translators</Trans>
          </summary>
          <CitationContributors
            citation={citation}
            field="editor"
            label={t({ message: "Editors", context: "CitationStructuredEditor interface" })}
            onChange={update}
          />
          <CitationContributors
            citation={citation}
            field="translator"
            label={t({ message: "Translators", context: "CitationStructuredEditor interface" })}
            onChange={update}
          />
        </details>
      </section>

      <section className="citation-field-section">
        <header>
          <strong>
            <Trans>Publication</Trans>
          </strong>
          <small>
            <Trans>Where and when the work appeared</Trans>
          </small>
        </header>
        <div className="citation-field-grid">
          <DateField
            label={t({ message: "Issued", context: "CitationStructuredEditor interface" })}
            value={citationDateText(citation, "issued")}
            onChange={(value) => update("issued", cslDate(value))}
            problem={problem("issued")}
          />
          <TextField
            citation={citation}
            field="container-title"
            label={t({ message: "Journal, book or site" })}
            wide
            onChange={update}
            problem={problem("container-title")}
          />
          <TextField
            citation={citation}
            field="publisher"
            label={t({ message: "Publisher", context: "CitationStructuredEditor interface" })}
            onChange={update}
            problem={problem("publisher")}
          />
          <TextField
            citation={citation}
            field="publisher-place"
            label={t({ message: "Place", context: "CitationStructuredEditor interface" })}
            onChange={update}
            problem={problem("publisher-place")}
          />
          <TextField
            citation={citation}
            field="volume"
            label={t({ message: "Volume", context: "CitationStructuredEditor interface" })}
            onChange={update}
            problem={problem("volume")}
          />
          <TextField
            citation={citation}
            field="issue"
            label={t({ message: "Issue", context: "CitationStructuredEditor interface" })}
            onChange={update}
            problem={problem("issue")}
          />
          <TextField
            citation={citation}
            field="page"
            label={t({ message: "Pages", context: "CitationStructuredEditor interface" })}
            onChange={update}
            problem={problem("page")}
          />
          <TextField
            citation={citation}
            field="edition"
            label={t({ message: "Edition", context: "CitationStructuredEditor interface" })}
            onChange={update}
            problem={problem("edition")}
          />
        </div>
      </section>

      <details className="citation-field-section">
        <summary>
          <span>
            <strong>
              <Trans>Identifiers and access</Trans>
            </strong>
            <small>
              <Trans>DOI, ISBN, URL, and language</Trans>
            </small>
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
            label={t({ message: "Language", context: "CitationStructuredEditor interface" })}
            onChange={update}
            problem={problem("language")}
          />
        </div>
      </details>

      <details className="citation-field-section citation-abstract-section">
        <summary>
          <span>
            <strong>
              <Trans>Abstract</Trans>
            </strong>
            <small>
              <Trans>Optional descriptive text</Trans>
            </small>
          </span>
        </summary>
        <label className="citation-field">
          <span>
            <Trans>Abstract</Trans>
          </span>
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
  const { t } = useLingui();
  return (
    <label className="citation-field">
      <span>{label}</span>
      <input
        className="mdbase-field"
        aria-invalid={problem ? true : undefined}
        placeholder={t({ message: "YYYY, YYYY-MM-DD, or a season" })}
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
    {
      label: translate({ message: "Common", context: "CitationStructuredEditor status or action" }),
      options: commonCslTypes.map(([value, label]) => ({ value, label: i18n._(label) })),
    },
    {
      label: translate({
        message: "Specialist",
        context: "CitationStructuredEditor status or action",
      }),
      options: specialistCslTypes.map(([value, label]) => ({ value, label: i18n._(label) })),
    },
  ];
}
