import {
  citationDateText,
  commonCslTypes,
  cslDate,
  primaryCitationFields,
  updateCitationField,
} from "./citation-form-model.js";
import { CitationContributors } from "./CitationContributors.js";

import type { JSX } from "react";

// The complete field surface stays together so its section order remains easy to audit.
// eslint-disable-next-line max-lines-per-function
export function CitationStructuredEditor({
  citation,
  onChange,
  onRegenerateCitekey,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly onChange: (citation: Readonly<Record<string, unknown>>) => void;
  readonly onRegenerateCitekey: () => void;
}): JSX.Element {
  const update = (field: string, value: unknown): void =>
    onChange(updateCitationField(citation, field, value));
  const additional = Object.keys(citation).filter((field) => !primaryCitationFields.has(field));
  return (
    <div className="citation-form">
      <section className="citation-field-section is-primary">
        <header>
          <span>Identity</span>
          <small>The stable handle and kind of work</small>
        </header>
        <div className="citation-field-grid">
          <label className="citation-field is-wide">
            <span>Title</span>
            <input
              value={fieldText(citation, "title")}
              onChange={(event) => update("title", event.target.value)}
            />
          </label>
          <label className="citation-field">
            <span>Type</span>
            <select
              value={fieldText(citation, "type")}
              onChange={(event) => update("type", event.target.value)}
            >
              {!commonCslTypes.some(([value]) => value === citation["type"]) ? (
                <option value={fieldText(citation, "type")}>{fieldText(citation, "type")}</option>
              ) : null}
              {commonCslTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="citation-field citation-citekey-field">
            <span>Citekey</span>
            <div>
              <b>@</b>
              <input
                value={fieldText(citation, "id")}
                onChange={(event) => update("id", event.target.value)}
              />
            </div>
            <button type="button" onClick={onRegenerateCitekey}>
              Regenerate
            </button>
          </label>
        </div>
      </section>

      <section className="citation-field-section">
        <header>
          <span>Contributors</span>
          <small>People and organisations responsible for this work</small>
        </header>
        <CitationContributors
          citation={citation}
          field="author"
          label="Authors"
          onChange={update}
        />
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
          <span>Publication</span>
          <small>Where and when the work appeared</small>
        </header>
        <div className="citation-field-grid">
          <DateField
            label="Issued"
            value={citationDateText(citation, "issued")}
            onChange={(value) => update("issued", cslDate(value))}
          />
          <TextField
            citation={citation}
            field="container-title"
            label="Journal, book or site"
            wide
            onChange={update}
          />
          <TextField citation={citation} field="publisher" label="Publisher" onChange={update} />
          <TextField citation={citation} field="publisher-place" label="Place" onChange={update} />
          <TextField citation={citation} field="volume" label="Volume" onChange={update} />
          <TextField citation={citation} field="issue" label="Issue" onChange={update} />
          <TextField citation={citation} field="page" label="Pages" onChange={update} />
          <TextField citation={citation} field="edition" label="Edition" onChange={update} />
        </div>
      </section>

      <section className="citation-field-section">
        <header>
          <span>Identifiers and access</span>
          <small>Portable links back to the work</small>
        </header>
        <div className="citation-field-grid">
          <TextField citation={citation} field="DOI" label="DOI" onChange={update} />
          <TextField citation={citation} field="ISBN" label="ISBN" onChange={update} />
          <TextField citation={citation} field="ISSN" label="ISSN" onChange={update} />
          <TextField citation={citation} field="URL" label="URL" wide onChange={update} />
          <TextField citation={citation} field="language" label="Language" onChange={update} />
        </div>
      </section>

      <details className="citation-field-section citation-abstract-section">
        <summary>Abstract and preserved fields</summary>
        <label className="citation-field">
          <span>Abstract</span>
          <textarea
            rows={5}
            value={fieldText(citation, "abstract")}
            onChange={(event) => update("abstract", event.target.value)}
          />
        </label>
        {additional.length ? (
          <p>
            {additional.length} specialist {additional.length === 1 ? "field is" : "fields are"}{" "}
            preserved in Raw CSL: {additional.join(", ")}.
          </p>
        ) : (
          <p>No additional CSL fields.</p>
        )}
      </details>
    </div>
  );
}

function TextField({
  citation,
  field,
  label,
  wide = false,
  onChange,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly field: string;
  readonly label: string;
  readonly wide?: boolean;
  readonly onChange: (field: string, value: unknown) => void;
}): JSX.Element {
  return (
    <label className={`citation-field${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      <input
        value={fieldText(citation, field)}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className="citation-field">
      <span>{label}</span>
      <input
        placeholder="YYYY, YYYY-MM-DD, or a season"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function fieldText(citation: Readonly<Record<string, unknown>>, field: string): string {
  const value = citation[field];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
