import {
  isEditableSourceField,
  isRequiredSourceField,
  recordRevision,
  type Source,
  type SourceFieldChange,
} from "@mdbase-reader/core";

import { sourceFromDocument } from "./mapping.js";
import { outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";

/**
 * Turns dotted field changes into one top-level patch, merging nested keys into the record's
 * current objects. A null value removes the field (mdbase §12.3).
 */
export function fieldPatch(
  frontmatter: Readonly<Record<string, unknown>>,
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!isEditableSourceField(key)) {
      throw new Error(`The field ${key} is maintained by Reader and cannot be edited here.`);
    }
    if (value === null && isRequiredSourceField(key)) {
      throw new Error(`A source needs a ${key}; it cannot be removed.`);
    }
    const [top, ...rest] = key.split(".");
    if (top === undefined) {
      continue;
    }
    if (rest.length === 0) {
      patch[top] = value;
      continue;
    }
    const base = objectAt(patch[top] ?? frontmatter[top]);
    patch[top] = setPath(base, rest, value);
  }
  return patch;
}

function setPath(
  object: Readonly<Record<string, unknown>>,
  path: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path;
  if (head === undefined) {
    return { ...object };
  }
  const next = { ...object };
  if (rest.length === 0) {
    if (value === null) {
      Reflect.deleteProperty(next, head);
    } else {
      next[head] = value;
    }
    return next;
  }
  next[head] = setPath(objectAt(object[head]), rest, value);
  return next;
}

function objectAt(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export async function writeSourceFields(
  client: ReaderConnectClient,
  path: string,
  input: SourceFieldChange,
): Promise<Source> {
  const current = outcomeValue(
    await client.read({ path, includeDocument: true }),
    "read source before editing fields",
  );
  const updated = outcomeValue(
    await client.update({
      path,
      ifRevision: recordRevision(current.revision),
      patch: fieldPatch(current.frontmatter, input.fields),
      includeDocument: true,
    }),
    "edit source fields",
  );
  return sourceFromDocument(input.collectionId, updated);
}
