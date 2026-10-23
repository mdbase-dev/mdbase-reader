import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useMemo, useState, type JSX } from "react";

import {
  additionalCslFieldDefinitions,
  cslFieldLabel,
  emptyCslFieldValue,
  updateCitationField,
} from "./citation-form-model.js";
import { CitationTypedFieldEditor } from "./CitationTypedFieldEditors.js";

import type { CslFieldDefinition, CslValidationProblem } from "@mdbase-reader/core";

export function CitationAdditionalFields({
  citation,
  problems,
  onChange,
}: {
  readonly citation: Readonly<Record<string, unknown>>;
  readonly problems: readonly CslValidationProblem[];
  readonly onChange: (citation: Readonly<Record<string, unknown>>) => void;
}): JSX.Element {
  const { t } = useLingui();
  const [selected, setSelected] = useState("");
  const fieldListId = useId();
  const definitions = useMemo(
    () => additionalCslFieldDefinitions.filter(({ name }) => citation[name] === undefined),
    [citation],
  );
  const active = additionalCslFieldDefinitions.filter(({ name }) => citation[name] !== undefined);
  const definition = definitions.find(({ name }) => name === selected);
  const update = (field: string, value: unknown): void => onChange({ ...citation, [field]: value });
  const remove = (field: string): void => onChange(updateCitationField(citation, field, undefined));
  const addField = (): void => {
    if (!definition) {
      return;
    }
    onChange({ ...citation, [definition.name]: emptyCslFieldValue(definition.kind) });
    setSelected("");
  };
  return (
    <details className="citation-field-section citation-field-shelf">
      <summary>
        <span>
          <strong>
            <Trans>Additional fields</Trans>
          </strong>
          <small>
            <Trans>Add less common CSL metadata</Trans>
          </small>
        </span>
      </summary>
      <div className="citation-field-picker">
        <label>
          <span>{t({ message: "Find a field" })}</span>
          <input
            className="mdbase-field"
            list={fieldListId}
            placeholder={
              definitions.length
                ? t({ message: "e.g. accessed, genre, PMID" })
                : t({ message: "All fields added" })
            }
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addField();
              }
            }}
          />
          <datalist id={fieldListId}>
            {definitions.map(({ name }) => (
              <option key={name} value={name}>
                {cslFieldLabel(name)}
              </option>
            ))}
          </datalist>
        </label>
        <button type="button" disabled={!definition} onClick={addField}>
          <Trans>Add field</Trans>
        </button>
      </div>
      {selected && !definition ? (
        <small className="citation-field-picker-note">
          <Trans>Choose an unused official CSL field.</Trans>
        </small>
      ) : null}
      {active.length ? (
        <div className="citation-specialist-fields">
          {active.map((field) => (
            <AdditionalField
              key={field.name}
              definition={field}
              value={citation[field.name]}
              problem={fieldProblem(problems, field.name)}
              onChange={(value) => update(field.name, value)}
              onRemove={() => remove(field.name)}
            />
          ))}
        </div>
      ) : (
        <p className="citation-field-shelf-empty">
          <Trans>This record only uses the core fields above.</Trans>
        </p>
      )}
    </details>
  );
}

function AdditionalField({
  definition,
  value,
  problem,
  onChange,
  onRemove,
}: {
  readonly definition: CslFieldDefinition;
  readonly value: unknown;
  readonly problem: string | undefined;
  readonly onChange: (value: unknown) => void;
  readonly onRemove: () => void;
}): JSX.Element {
  const { t } = useLingui();
  const label = cslFieldLabel(definition.name);
  return (
    <article className="citation-specialist-field">
      <header>
        <div>
          <strong>{label}</strong>
          <code>{definition.name}</code>
        </div>
        <button type="button" aria-label={t`Remove ${label}`} onClick={onRemove}>
          <Trans context="CitationAdditionalFields interface">Remove</Trans>
        </button>
      </header>
      <CitationTypedFieldEditor
        field={definition.name}
        kind={definition.kind}
        label={label}
        value={value}
        problem={problem}
        onChange={onChange}
      />
      {problem ? <small className="citation-field-problem">{problem}</small> : null}
    </article>
  );
}

function fieldProblem(
  problems: readonly CslValidationProblem[],
  field: string,
): string | undefined {
  return problems.find(
    ({ path }) =>
      path === `csl.${field}` ||
      path.startsWith(`csl.${field}.`) ||
      path.startsWith(`csl.${field}[`),
  )?.message;
}
