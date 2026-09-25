import { Select, type SelectItems } from "@mdbase-reader/ui";
import { useState, type JSX } from "react";

import {
  customValueType,
  datePartText,
  defaultCustomValue,
  nextCustomKey,
  numberValue,
  parseJson,
  record,
  renameKey,
  scalarText,
  updateDatePart,
  updateObject,
  withoutKey,
} from "./citation-field-value-model.js";
import { CitationContributors } from "./CitationContributors.js";

import type { CslFieldKind } from "@mdbase-reader/core";

export function CitationTypedFieldEditor({
  field,
  kind,
  label,
  value,
  problem,
  onChange,
}: {
  readonly field: string;
  readonly kind: CslFieldKind;
  readonly label: string;
  readonly value: unknown;
  readonly problem: string | undefined;
  readonly onChange: (value: unknown) => void;
}): JSX.Element {
  if (kind === "string" || kind === "number") {
    return <ScalarEditor kind={kind} value={value} problem={problem} onChange={onChange} />;
  }
  return (
    <>
      {kind === "name" ? (
        <CitationContributors
          citation={{ [field]: value }}
          field={field}
          label="Names"
          onChange={(_, next) => onChange(next)}
        />
      ) : null}
      {kind === "date" ? <DateEditor value={value} onChange={onChange} /> : null}
      {kind === "string-list" ? <StringListEditor value={value} onChange={onChange} /> : null}
      {kind === "object" ? <CustomObjectEditor value={value} onChange={onChange} /> : null}
      <details className="citation-advanced-value">
        <summary>Advanced JSON</summary>
        <AdvancedJsonEditor
          key={JSON.stringify(value)}
          label={label}
          value={value}
          onApply={onChange}
        />
      </details>
    </>
  );
}

function ScalarEditor({
  kind,
  value,
  problem,
  onChange,
}: {
  readonly kind: "number" | "string";
  readonly value: unknown;
  readonly problem: string | undefined;
  readonly onChange: (value: unknown) => void;
}): JSX.Element {
  const numeric = kind === "number" && typeof value === "number";
  return (
    <div className="citation-scalar-editor">
      {kind === "number" ? (
        <Select
          aria-label="Value type"
          value={numeric ? "number" : "text"}
          options={scalarKindOptions}
          onChange={(next) => onChange(next === "number" ? 0 : scalarText(value))}
        />
      ) : null}
      <label className="citation-field">
        <span>{numeric ? "Number" : "Text"}</span>
        <input
          aria-invalid={problem ? true : undefined}
          inputMode={numeric ? "decimal" : undefined}
          value={scalarText(value)}
          onChange={(event) =>
            onChange(numeric ? numberValue(event.target.value) : event.target.value)
          }
        />
      </label>
    </div>
  );
}

function DateEditor({
  value,
  onChange,
}: {
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}): JSX.Element {
  const date = record(value) ?? {};
  const mode =
    typeof date["literal"] === "string"
      ? "literal"
      : typeof date["raw"] === "string"
        ? "raw"
        : "structured";
  return (
    <div className="citation-date-editor">
      <label className="citation-field citation-date-mode">
        <span>Date form</span>
        <Select
          aria-label="Date form"
          value={mode}
          options={dateModeOptions}
          onChange={(nextMode) =>
            onChange(
              nextMode === "literal" ? { literal: "" } : nextMode === "raw" ? { raw: "" } : {},
            )
          }
        />
      </label>
      {mode === "structured" ? (
        <div className="citation-date-grid">
          <DatePartInput
            label="Start"
            value={datePartText(date, 0)}
            onChange={(next) => onChange(updateDatePart(date, 0, next))}
          />
          <DatePartInput
            label="End (optional)"
            value={datePartText(date, 1)}
            disabled={!datePartText(date, 0)}
            onChange={(next) => onChange(updateDatePart(date, 1, next))}
          />
          <label className="citation-field">
            <span>Season</span>
            <input
              placeholder="e.g. Spring or 1"
              value={scalarText(date["season"])}
              onChange={(event) => onChange(updateObject(date, "season", event.target.value))}
            />
          </label>
          <label className="citation-check-field">
            <input
              type="checkbox"
              checked={Boolean(date["circa"])}
              onChange={(event) =>
                onChange(updateObject(date, "circa", event.target.checked || undefined))
              }
            />
            Approximate
          </label>
        </div>
      ) : (
        <label className="citation-field">
          <span>{mode === "literal" ? "Date as printed" : "EDTF or source date"}</span>
          <input
            value={scalarText(date[mode])}
            onChange={(event) => onChange({ [mode]: event.target.value })}
          />
        </label>
      )}
    </div>
  );
}

function DatePartInput({
  label,
  value,
  disabled = false,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label className="citation-field">
      <span>{label}</span>
      <input
        disabled={disabled}
        placeholder="YYYY, YYYY-MM, or YYYY-MM-DD"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StringListEditor({
  value,
  onChange,
}: {
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}): JSX.Element {
  const values = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  return (
    <fieldset className="citation-list-editor">
      <legend>Values</legend>
      {values.map((item, index) => (
        <div className="citation-list-row" key={String(index)}>
          <input
            aria-label={`Value ${String(index + 1)}`}
            value={item}
            onChange={(event) =>
              onChange(
                values.map((current, position) =>
                  position === index ? event.target.value : current,
                ),
              )
            }
          />
          <button
            type="button"
            aria-label={`Remove value ${String(index + 1)}`}
            onClick={() => onChange(values.filter((_, position) => position !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="citation-add-row" onClick={() => onChange([...values, ""])}>
        Add value
      </button>
    </fieldset>
  );
}

function CustomObjectEditor({
  value,
  onChange,
}: {
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}): JSX.Element {
  const object = record(value) ?? {};
  const entries = Object.entries(object);
  return (
    <fieldset className="citation-custom-editor">
      <legend>Custom properties</legend>
      {entries.map(([key, entryValue]) => (
        <div className="citation-custom-row" key={key}>
          <input
            aria-label={`${key} property name`}
            defaultValue={key}
            onBlur={(event) => {
              const nextKey = event.target.value.trim();
              if (nextKey && nextKey !== key) {
                onChange(renameKey(object, key, nextKey));
              }
            }}
          />
          <Select
            aria-label={`${key} value type`}
            value={customValueType(entryValue)}
            options={customValueTypeOptions}
            onChange={(type) => onChange({ ...object, [key]: defaultCustomValue(type) })}
          />
          <CustomValueInput
            name={key}
            value={entryValue}
            onChange={(next) => onChange({ ...object, [key]: next })}
          />
          <button
            type="button"
            aria-label={`Remove ${key}`}
            onClick={() => onChange(withoutKey(object, key))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="citation-add-row"
        onClick={() => onChange({ ...object, [nextCustomKey(object)]: "" })}
      >
        Add property
      </button>
    </fieldset>
  );
}

function CustomValueInput({
  name,
  value,
  onChange,
}: {
  readonly name: string;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}): JSX.Element | null {
  const type = customValueType(value);
  if (type === "null") {
    return null;
  }
  if (type === "boolean") {
    return (
      <Select
        aria-label={`${name} value`}
        value={value === true ? "true" : "false"}
        options={booleanOptions}
        onChange={(next) => onChange(next === "true")}
      />
    );
  }
  if (type === "json") {
    return (
      <AdvancedJsonEditor
        key={JSON.stringify(value)}
        label={name}
        value={value}
        compact
        onApply={onChange}
      />
    );
  }
  return (
    <input
      aria-label={`${name} value`}
      inputMode={type === "number" ? "decimal" : undefined}
      value={scalarText(value)}
      onChange={(event) =>
        onChange(type === "number" ? numberValue(event.target.value) : event.target.value)
      }
    />
  );
}

function AdvancedJsonEditor({
  label,
  value,
  compact = false,
  onApply,
}: {
  readonly label: string;
  readonly value: unknown;
  readonly compact?: boolean;
  readonly onApply: (value: unknown) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(JSON.stringify(value, null, compact ? 0 : 2));
  const parsed = parseJson(draft);
  return (
    <div className={compact ? "citation-json-value is-compact" : "citation-json-value"}>
      <textarea
        aria-label={`${label} JSON value`}
        aria-invalid={!parsed.valid ? true : undefined}
        rows={compact ? 2 : Math.min(8, Math.max(3, draft.split("\n").length))}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        type="button"
        disabled={!parsed.valid}
        onClick={() => {
          if (parsed.valid) {
            onApply(parsed.value);
          }
        }}
      >
        Apply JSON
      </button>
      {!parsed.valid ? (
        <small className="citation-field-problem">Enter valid JSON to apply this value.</small>
      ) : null}
    </div>
  );
}

const scalarKindOptions: SelectItems<"text" | "number"> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
];

const dateModeOptions: SelectItems<"structured" | "literal" | "raw"> = [
  { value: "structured", label: "Calendar date" },
  { value: "literal", label: "Literal date" },
  { value: "raw", label: "EDTF / raw date" },
];

const customValueTypeOptions: SelectItems = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "True / false" },
  { value: "null", label: "Empty" },
  { value: "json", label: "JSON value" },
];

const booleanOptions: SelectItems<"true" | "false"> = [
  { value: "true", label: "True" },
  { value: "false", label: "False" },
];
