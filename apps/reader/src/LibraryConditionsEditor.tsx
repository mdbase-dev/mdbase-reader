import { Select } from "@mdbase-reader/ui";
import { useId, useMemo, type JSX } from "react";

import { CloseIcon, PlusIcon } from "./icons.js";
import {
  conditionOperators,
  fieldValueSuggestions,
  operatorLabels,
  operatorNeedsValue,
  type FieldCondition,
} from "./library-conditions.js";

import type { SourceSummary } from "@mdbase-reader/core";

// Fields most collections have, offered alongside the collection's own properties.
const commonFields = [
  "reading.status",
  "reading.progress",
  "reading.last_opened_at",
  "published",
  "tags",
  "authors",
];

/** Conditions on any frontmatter field, edited inside the library's filter menu. */
export function LibraryConditionsEditor({
  conditions,
  propertyKeys,
  sources,
  onChange,
}: {
  readonly conditions: readonly FieldCondition[];
  readonly propertyKeys: readonly string[];
  readonly sources: readonly SourceSummary[];
  readonly onChange: (conditions: readonly FieldCondition[]) => void;
}): JSX.Element {
  const fieldListId = useId();
  const fields = useMemo(() => [...new Set([...propertyKeys, ...commonFields])], [propertyKeys]);
  const update = (index: number, patch: Partial<FieldCondition>): void =>
    onChange(
      conditions.map((condition, at) => (at === index ? { ...condition, ...patch } : condition)),
    );
  return (
    <fieldset className="library-conditions" data-menu-keep-open>
      <legend className="menu-label">Fields</legend>
      <datalist id={fieldListId}>
        {fields.map((field) => (
          <option key={field} value={field} />
        ))}
      </datalist>
      {conditions.map((condition, index) => (
        <ConditionRow
          // Conditions have no identity beyond their position while being edited.
          key={index}
          condition={condition}
          fieldListId={fieldListId}
          sources={sources}
          onChange={(patch) => update(index, patch)}
          onRemove={() => onChange(conditions.filter((_, at) => at !== index))}
        />
      ))}
      <button
        type="button"
        className="library-condition-add"
        onClick={() => onChange([...conditions, { key: "", operator: "is", value: "" }])}
      >
        <PlusIcon /> Add a field condition
      </button>
      {conditions.length > 0 ? (
        <p className="menu-note">
          Numbers stored as text compare as text, as in saved mdbase views.
        </p>
      ) : null}
    </fieldset>
  );
}

function ConditionRow({
  condition,
  fieldListId,
  sources,
  onChange,
  onRemove,
}: {
  readonly condition: FieldCondition;
  readonly fieldListId: string;
  readonly sources: readonly SourceSummary[];
  readonly onChange: (patch: Partial<FieldCondition>) => void;
  readonly onRemove: () => void;
}): JSX.Element {
  const valueListId = useId();
  const suggestions = useMemo(
    () => fieldValueSuggestions(sources, condition.key.trim()),
    [condition.key, sources],
  );
  return (
    <div className="library-condition" role="group" aria-label="Field condition">
      <input
        aria-label="Field"
        className="library-condition-field"
        list={fieldListId}
        value={condition.key}
        placeholder="field"
        spellCheck={false}
        onChange={(event) => onChange({ key: event.target.value.trim() })}
      />
      <Select
        aria-label="Comparison"
        className="library-condition-operator"
        value={condition.operator}
        options={conditionOperators.map((operator) => ({
          value: operator,
          label: operatorLabels[operator],
        }))}
        onChange={(operator) => onChange({ operator })}
      />
      {operatorNeedsValue(condition.operator) ? (
        <>
          <input
            aria-label="Value"
            className="library-condition-value"
            list={valueListId}
            value={condition.value}
            placeholder="value"
            onChange={(event) => onChange({ value: event.target.value })}
          />
          <datalist id={valueListId}>
            {suggestions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </>
      ) : (
        <span />
      )}
      <button
        type="button"
        className="icon-button"
        aria-label="Remove condition"
        title="Remove condition"
        onClick={onRemove}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
