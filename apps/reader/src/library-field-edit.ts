import { formatPropertyValue } from "./library-columns.js";

import type { FieldShape } from "./library-conditions.js";

/** The text a field edit starts from: lists as comma-separated items, links as written. */
export function editableText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : formatPropertyValue(item)))
      .join(", ");
  }
  return typeof value === "string" ? value : formatPropertyValue(value);
}

/**
 * Converts edited text back to a value of the field's existing kind: lists split on commas,
 * numbers and booleans stay numbers and booleans, and an empty edit removes the field (null).
 */
export function parseFieldInput(text: string, previous: unknown, shape: FieldShape): unknown {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  if (Array.isArray(previous) || (previous === undefined && shape === "list")) {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof previous === "number") {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : trimmed;
  }
  if (typeof previous === "boolean") {
    const lowered = trimmed.toLocaleLowerCase();
    if (["yes", "true"].includes(lowered)) {
      return true;
    }
    if (["no", "false"].includes(lowered)) {
      return false;
    }
  }
  return trimmed;
}
