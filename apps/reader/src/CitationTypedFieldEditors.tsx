import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Select, type SelectItems } from "@mdbase-dev/ui/select";
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
  const { t } = useLingui();
  if (kind === "string" || kind === "number") {
    return <ScalarEditor kind={kind} value={value} problem={problem} onChange={onChange} />;
  }
  return (
    <>
      {kind === "name" ? (
        <CitationContributors
          citation={{ [field]: value }}
          field={field}
          label={t({ message: "Names", context: "CitationTypedFieldEditors interface" })}
          onChange={(_, next) => onChange(next)}
        />
      ) : null}
      {kind === "date" ? <DateEditor value={value} onChange={onChange} /> : null}
      {kind === "string-list" ? <StringListEditor value={value} onChange={onChange} /> : null}
      {kind === "object" ? <CustomObjectEditor value={value} onChange={onChange} /> : null}
      <details className="citation-advanced-value">
        <summary>
          <Trans>Advanced JSON</Trans>
        </summary>
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
  const { t } = useLingui();
  const numeric = kind === "number" && typeof value === "number";
  return (
    <div className="citation-scalar-editor">
      {kind === "number" ? (
        <Select
          aria-label={t({ message: "Value type", context: "CitationTypedFieldEditors interface" })}
          value={numeric ? "number" : "text"}
          options={scalarKindOptions()}
          onChange={(next) => onChange(next === "number" ? 0 : scalarText(value))}
        />
      ) : null}
      <label className="citation-field">
        <span>
          {numeric
            ? t({ message: "Number", context: "CitationTypedFieldEditors interface" })
            : t({ message: "Text", context: "CitationTypedFieldEditors interface" })}
        </span>
        <input
          className="mdbase-field"
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
  const { t } = useLingui();
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
        <span>{t({ message: "Date form" })}</span>
        <Select
          aria-label={t({ message: "Date form", context: "CitationTypedFieldEditors interface" })}
          value={mode}
          options={dateModeOptions()}
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
            label={t({ message: "Start", context: "CitationTypedFieldEditors interface" })}
            value={datePartText(date, 0)}
            onChange={(next) => onChange(updateDatePart(date, 0, next))}
          />
          <DatePartInput
            label={t({ message: "End (optional)", context: "CitationTypedFieldEditors interface" })}
            value={datePartText(date, 1)}
            disabled={!datePartText(date, 0)}
            onChange={(next) => onChange(updateDatePart(date, 1, next))}
          />
          <label className="citation-field">
            <span>{t({ message: "Season" })}</span>
            <input
              className="mdbase-field"
              placeholder={t({ message: "e.g. Spring or 1" })}
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
            {t({ message: "Approximate" })}
          </label>
        </div>
      ) : (
        <label className="citation-field">
          <span>
            {mode === "literal"
              ? t({ message: "Date as printed" })
              : t({ message: "EDTF or source date" })}
          </span>
          <input
            className="mdbase-field"
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
  const { t } = useLingui();
  return (
    <label className="citation-field">
      <span>{label}</span>
      <input
        className="mdbase-field"
        disabled={disabled}
        placeholder={t({ message: "YYYY, YYYY-MM, or YYYY-MM-DD" })}
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
  const { t } = useLingui();
  const values = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  return (
    <fieldset className="citation-list-editor">
      <legend>
        <Trans>Values</Trans>
      </legend>
      {values.map((item, index) => (
        <div className="citation-list-row" key={String(index)}>
          <input
            className="mdbase-field"
            aria-label={t`Value ${String(index + 1)}`}
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
            aria-label={t`Remove value ${String(index + 1)}`}
            onClick={() => onChange(values.filter((_, position) => position !== index))}
          >
            <Trans context="CitationTypedFieldEditors interface">Remove</Trans>
          </button>
        </div>
      ))}
      <button type="button" className="citation-add-row" onClick={() => onChange([...values, ""])}>
        <Trans>Add value</Trans>
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
  const { t } = useLingui();
  const object = record(value) ?? {};
  const entries = Object.entries(object);
  return (
    <fieldset className="citation-custom-editor">
      <legend>
        <Trans>Custom properties</Trans>
      </legend>
      {entries.map(([key, entryValue]) => (
        <div className="citation-custom-row" key={key}>
          <input
            className="mdbase-field"
            aria-label={t`${key} property name`}
            defaultValue={key}
            onBlur={(event) => {
              const nextKey = event.target.value.trim();
              if (nextKey && nextKey !== key) {
                onChange(renameKey(object, key, nextKey));
              }
            }}
          />
          <Select
            aria-label={t`${key} value type`}
            value={customValueType(entryValue)}
            options={customValueTypeOptions()}
            onChange={(type) => onChange({ ...object, [key]: defaultCustomValue(type) })}
          />
          <CustomValueInput
            name={key}
            value={entryValue}
            onChange={(next) => onChange({ ...object, [key]: next })}
          />
          <button
            type="button"
            aria-label={t`Remove ${key}`}
            onClick={() => onChange(withoutKey(object, key))}
          >
            <Trans context="CitationTypedFieldEditors interface">Remove</Trans>
          </button>
        </div>
      ))}
      <button
        type="button"
        className="citation-add-row"
        onClick={() => onChange({ ...object, [nextCustomKey(object)]: "" })}
      >
        <Trans>Add property</Trans>
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
  const { t } = useLingui();
  const type = customValueType(value);
  if (type === "null") {
    return null;
  }
  if (type === "boolean") {
    return (
      <Select
        aria-label={t`${name} value`}
        value={value === true ? "true" : "false"}
        options={booleanOptions()}
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
      className="mdbase-field"
      aria-label={t`${name} value`}
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
  const { t } = useLingui();
  const [draft, setDraft] = useState(JSON.stringify(value, null, compact ? 0 : 2));
  const parsed = parseJson(draft);
  return (
    <div className={compact ? "citation-json-value is-compact" : "citation-json-value"}>
      <textarea
        className="mdbase-field"
        aria-label={t`${label} JSON value`}
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
        <Trans>Apply JSON</Trans>
      </button>
      {!parsed.valid ? (
        <small className="citation-field-problem">
          <Trans>Enter valid JSON to apply this value.</Trans>
        </small>
      ) : null}
    </div>
  );
}

function scalarKindOptions(): SelectItems<"text" | "number"> {
  return [
    {
      value: "text",
      label: translate({ message: "Text", context: "CitationTypedFieldEditors scalarKindOptions" }),
    },
    {
      value: "number",
      label: translate({
        message: "Number",
        context: "CitationTypedFieldEditors scalarKindOptions",
      }),
    },
  ];
}

function dateModeOptions(): SelectItems<"structured" | "literal" | "raw"> {
  return [
    {
      value: "structured",
      label: translate({
        message: "Calendar date",
        context: "CitationTypedFieldEditors dateModeOptions",
      }),
    },
    {
      value: "literal",
      label: translate({
        message: "Literal date",
        context: "CitationTypedFieldEditors dateModeOptions",
      }),
    },
    {
      value: "raw",
      label: translate({
        message: "EDTF / raw date",
        context: "CitationTypedFieldEditors dateModeOptions",
      }),
    },
  ];
}

function customValueTypeOptions(): SelectItems {
  return [
    {
      value: "string",
      label: translate({
        message: "Text",
        context: "CitationTypedFieldEditors customValueTypeOptions",
      }),
    },
    {
      value: "number",
      label: translate({
        message: "Number",
        context: "CitationTypedFieldEditors customValueTypeOptions",
      }),
    },
    {
      value: "boolean",
      label: translate({
        message: "True / false",
        context: "CitationTypedFieldEditors customValueTypeOptions",
      }),
    },
    {
      value: "null",
      label: translate({
        message: "Empty",
        context: "CitationTypedFieldEditors customValueTypeOptions",
      }),
    },
    {
      value: "json",
      label: translate({
        message: "JSON value",
        context: "CitationTypedFieldEditors customValueTypeOptions",
      }),
    },
  ];
}

function booleanOptions(): SelectItems<"true" | "false"> {
  return [
    {
      value: "true",
      label: translate({ message: "True", context: "CitationTypedFieldEditors booleanOptions" }),
    },
    {
      value: "false",
      label: translate({ message: "False", context: "CitationTypedFieldEditors booleanOptions" }),
    },
  ];
}
