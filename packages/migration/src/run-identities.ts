import { t } from "@lingui/core/macro";

import { object, text, type Fields, type MigrationPlan, type MigrationRecord } from "./model.js";
import { readwiseHighlightKeys } from "./readwise-identities.js";

export function resolveExistingRecords(
  plan: MigrationPlan,
  records: Map<string, Fields>,
): Map<string, Fields> {
  validatePlan(plan);
  const aliases = existingAliases(plan, records);
  const quotes = existingQuotes(plan, records);
  const sourceIds = new Map(plan.sources.map((source) => [source.key, source.id]));
  const result = new Map<string, Fields>();
  const used = new Set<string>();
  for (const record of [...plan.sources, ...plan.annotations]) {
    const candidates = new Set<string>(records.has(record.id) ? [record.id] : []);
    for (const key of readwiseHighlightKeys(record.fields)) {
      for (const id of aliases.get(key) ?? []) {
        candidates.add(id);
      }
    }
    if (candidates.size > 1) {
      throw collision();
    }
    if (!candidates.size && "sourceKey" in record) {
      checkUnlinkedQuote(record.fields, sourceIds.get(record.sourceKey), quotes);
    }
    for (const id of candidates) {
      const fields = records.get(id);
      if (!fields || used.has(id)) {
        throw collision();
      }
      checkIdentity(fields, plan, record);
      used.add(id);
      result.set(record.id, fields);
    }
  }
  return result;
}

function validatePlan(plan: MigrationPlan): void {
  const ids = new Set<string>();
  const aliases = new Map<string, string>();
  for (const record of [...plan.sources, ...plan.annotations]) {
    if (ids.has(record.id)) {
      throw collision();
    }
    ids.add(record.id);
    for (const key of readwiseHighlightKeys(record.fields)) {
      const previous = aliases.get(key);
      if (previous && previous !== record.id) {
        throw collision();
      }
      aliases.set(key, record.id);
    }
  }
}

function existingAliases(
  plan: MigrationPlan,
  records: Map<string, Fields>,
): Map<string, Set<string>> {
  const aliases = new Map<string, Set<string>>();
  for (const [id, fields] of records) {
    const provenance = fields["import"];
    if (
      !provenance ||
      typeof provenance !== "object" ||
      Array.isArray(provenance) ||
      provenance["namespace"] !== plan.namespace
    ) {
      continue;
    }
    for (const key of readwiseHighlightKeys(fields)) {
      const ids = aliases.get(key) ?? new Set<string>();
      ids.add(id);
      aliases.set(key, ids);
    }
  }
  return aliases;
}

function existingQuotes(
  plan: MigrationPlan,
  records: Map<string, Fields>,
): Map<string, string[][]> {
  const result = new Map<string, string[][]>();
  for (const fields of records.values()) {
    const provenance = fields["import"];
    if (
      !provenance ||
      typeof provenance !== "object" ||
      Array.isArray(provenance) ||
      provenance["namespace"] !== plan.namespace
    ) {
      continue;
    }
    const keys = readwiseHighlightKeys(fields);
    const quote = readwiseQuote(fields, keys);
    const source = text(fields["source"]);
    if (quote && source) {
      const signature = JSON.stringify([source, quote]);
      const matches = result.get(signature) ?? [];
      matches.push(keys);
      result.set(signature, matches);
    }
  }
  return result;
}

function readwiseQuote(fields: Fields, keys: string[]): string {
  if (!keys.length || fields["annotation_type"] !== "highlight") {
    return "";
  }
  return text(object(object(fields["target"] ?? {})["quote"] ?? {})["exact"]);
}

function checkUnlinkedQuote(
  fields: Fields,
  sourceId: string | undefined,
  quotes: Map<string, string[][]>,
): void {
  const keys = readwiseHighlightKeys(fields);
  const quote = readwiseQuote(fields, keys);
  if (!quote || !sourceId) {
    return;
  }
  const incomingV2 = keys.some((key) => key.startsWith("v2:"));
  const incomingReader = keys.some((key) => !key.startsWith("v2:"));
  for (const known of quotes.get(JSON.stringify([`[[${sourceId}]]`, quote])) ?? []) {
    const sharedV2 = incomingV2 && known.some((key) => key.startsWith("v2:"));
    const sharedReader = incomingReader && known.some((key) => !key.startsWith("v2:"));
    if (!sharedV2 && !sharedReader) {
      throw collision();
    }
  }
}

export function checkIdentity(old: Fields, plan: MigrationPlan, record: MigrationRecord): void {
  const raw = object(old["import"], "existing import provenance");
  if (raw["namespace"] !== plan.namespace) {
    throw collision();
  }
  if (raw["key"] === record.key) {
    return;
  }
  const keys = new Set(readwiseHighlightKeys(record.fields));
  const source = plan.annotations.find((annotation) => annotation.id === record.id)?.sourceKey;
  const sourceId = plan.sources.find((candidate) => candidate.key === source)?.id;
  if (
    !sourceId ||
    old["source"] !== `[[${sourceId}]]` ||
    !readwiseHighlightKeys(old).some((key) => keys.has(key))
  ) {
    throw collision();
  }
}

function collision(): Error {
  return new Error(
    t({ message: "Import identity collision. Existing records will not be overwritten." }),
  );
}
