import { formatPropertyValue, isPropertyKey, propertyValue } from "./library-columns.js";

import type { SourceSummary } from "@mdbase-reader/core";

/** A filter on any frontmatter field, e.g. `course is "Philosophy of attention"`. */
export interface FieldCondition {
  /** Dotted frontmatter path, e.g. `course` or `reading.status`. */
  readonly key: string;
  readonly operator: ConditionOperator;
  readonly value: string;
}

export const conditionOperators = [
  "is",
  "is-not",
  "contains",
  "less-than",
  "at-most",
  "greater-than",
  "at-least",
  "empty",
  "not-empty",
] as const;
export type ConditionOperator = (typeof conditionOperators)[number];

export const operatorLabels: Record<ConditionOperator, string> = {
  is: "is",
  "is-not": "is not",
  contains: "contains",
  "less-than": "is less than",
  "at-most": "is at most",
  "greater-than": "is greater than",
  "at-least": "is at least",
  empty: "is empty",
  "not-empty": "is not empty",
};

export function operatorNeedsValue(operator: ConditionOperator): boolean {
  return operator !== "empty" && operator !== "not-empty";
}

/** Whether a condition is complete enough to apply; half-written ones are ignored. */
export function isActiveCondition(condition: FieldCondition): boolean {
  return (
    isPropertyKey(condition.key) &&
    (!operatorNeedsValue(condition.operator) || condition.value.trim() !== "")
  );
}

export function parseConditions(value: unknown): readonly FieldCondition[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const { key, operator, value: text } = entry as Record<string, unknown>;
    return typeof key === "string" &&
      isPropertyKey(key) &&
      (conditionOperators as readonly unknown[]).includes(operator)
      ? [
          {
            key,
            operator: operator as ConditionOperator,
            value: typeof text === "string" ? text : "",
          },
        ]
      : [];
  });
}

/** Evaluates a condition against a source, matching both raw values and their readable form. */
export function matchesCondition(
  source: SourceSummary,
  condition: FieldCondition,
  selected?: Readonly<Record<string, unknown>>,
): boolean {
  if (!isActiveCondition(condition)) {
    return true;
  }
  const raw = propertyValue(source, condition.key, selected);
  const items = Array.isArray(raw) ? (raw as readonly unknown[]) : [raw];
  const empty = items.every((item) => item === undefined || item === null || item === "");
  const wanted = condition.value.trim().toLocaleLowerCase();
  const texts = items.flatMap((item) =>
    item === undefined || item === null
      ? []
      : [
          typeof item === "string" ? item.toLocaleLowerCase() : "",
          formatPropertyValue(item).toLocaleLowerCase(),
        ].filter(Boolean),
  );
  switch (condition.operator) {
    case "empty":
      return empty;
    case "not-empty":
      return !empty;
    case "is":
      return texts.includes(wanted);
    case "is-not":
      return !texts.includes(wanted);
    case "contains":
      return texts.some((text) => text.includes(wanted));
    default:
      return compare(items, condition);
  }
}

function compare(items: readonly unknown[], condition: FieldCondition): boolean {
  const wanted = condition.value.trim();
  const number = Number(wanted);
  // As in a saved view's CEL: numbers compare with numbers, text with text. A number stored as
  // text ("11") does not compare with 10, because mdbase's CEL cannot convert it.
  const target = Number.isFinite(number) ? number : wanted;
  return items.some((value) => {
    if (
      typeof value !== typeof target ||
      (typeof value !== "number" && typeof value !== "string")
    ) {
      return false;
    }
    switch (condition.operator) {
      case "less-than":
        return value < target;
      case "at-most":
        return value <= target;
      case "greater-than":
        return value > target;
      default:
        return value >= target;
    }
  });
}

/** Whether a field holds lists in this collection, which decides how a saved view tests it. */
export type FieldShape = "list" | "scalar";

export function fieldShape(sources: readonly SourceSummary[], key: string): FieldShape {
  return sources.slice(0, 2000).some((source) => Array.isArray(propertyValue(source, key)))
    ? "list"
    : "scalar";
}

/**
 * The same condition as a CEL clause for a saved view's `where`. mdbase's CEL has no type
 * introspection, so the caller says whether the field holds lists (any item may match). A
 * wikilink matches by its alias as well as its exact value. Missing values never match a
 * comparison but do satisfy "is not".
 */
export function conditionToCel(condition: FieldCondition, shape: FieldShape): string | null {
  if (!isActiveCondition(condition)) {
    return null;
  }
  const field = celPath(condition.key);
  const wanted = condition.value.trim();
  const number = Number(wanted);
  const numeric = wanted !== "" && Number.isFinite(number);
  const test = (predicate: (value: string) => string): string =>
    shape === "list" ? `${field}.exists(entry, ${predicate("entry")})` : predicate(field);
  // mdbase's CEL has no case folding or string conversion, so text is compared with
  // case-insensitive RE2 patterns, and numbers as numbers or numeric text.
  const escaped = escapeRegex(wanted);
  const matches = (value: string, pattern: string): string =>
    `${value}.matches(${JSON.stringify(`(?i)${pattern}`)})`;
  const equals = (value: string): string =>
    numeric
      ? `(${value} == ${String(number)} || ${value} == ${JSON.stringify(wanted)})`
      : // The value itself, or a wikilink whose alias or last path segment is the value.
        matches(
          value,
          `^(${escaped}|\\[\\[[^\\]|]*\\|${escaped}\\]\\]|\\[\\[([^\\]|]*/)?${escaped}\\]\\])$`,
        );
  const compare = (operator: string): string =>
    test((value) => `${value} ${operator} ${numeric ? String(number) : JSON.stringify(wanted)}`);
  switch (condition.operator) {
    case "empty":
      return shape === "list"
        ? `(${field} == null || ${field}.size() == 0)`
        : `(${field} == null || ${field} == "")`;
    case "not-empty":
      return shape === "list"
        ? `(${field} != null && ${field}.size() > 0)`
        : `(${field} != null && ${field} != "")`;
    case "is":
      return test(equals);
    case "is-not":
      return `(${field} == null || !${test(equals)})`;
    case "contains":
      return test((value) => matches(value, escaped));
    case "less-than":
      return compare("<");
    case "at-most":
      return compare("<=");
    case "greater-than":
      return compare(">");
    default:
      return compare(">=");
  }
}

/** A dotted frontmatter path in CEL; segments that are not identifiers use index syntax. */
function celPath(key: string): string {
  const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/u;
  return key.split(".").reduce((path, segment, index) => {
    if (identifier.test(segment)) {
      return index === 0 ? segment : `${path}.${segment}`;
    }
    return `${index === 0 ? "record" : path}[${JSON.stringify(segment)}]`;
  }, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[\\.+*?()|[\]{}^$]/gu, "\\$&");
}

/** Distinct readable values of a field across the library, most common first, for suggestions. */
export function fieldValueSuggestions(
  sources: readonly SourceSummary[],
  key: string,
  limit = 24,
): readonly string[] {
  if (!isPropertyKey(key)) {
    return [];
  }
  const counts = new Map<string, number>();
  for (const source of sources.slice(0, 2000)) {
    const raw = propertyValue(source, key);
    for (const item of Array.isArray(raw) ? (raw as readonly unknown[]) : [raw]) {
      const text = formatPropertyValue(item);
      if (text && text.length <= 80) {
        counts.set(text, (counts.get(text) ?? 0) + 1);
      }
    }
  }
  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([text]) => text);
}
