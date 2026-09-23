import {
  array,
  identity,
  object,
  quoteBody,
  stamp,
  text,
  type Fields,
  type MigrationPlan,
  type MigrationSource,
} from "./model.js";
import { archiveReadwise, plain, scalar, tagNames } from "./readwise-values.js";
export async function readwiseAnnotations(
  plan: MigrationPlan,
  rows: Fields[],
  books: Fields[],
): Promise<Fields[]> {
  const sources = new Map(plan.sources.map((s) => [s.key, s]));
  const native = new Map(rows.map((r) => [text(r["id"]), r]));
  const done = new Set<string>();
  const selectedBooks: Fields[] = [];
  for (const book of books) {
    const source = sources.get(text(book["external_id"]));
    if (!source || book["source"] !== "reader" || book["is_deleted"] === true) {
      continue;
    }
    selectedBooks.push(book);
    await bookHighlights(plan, source, book, native, done);
  }
  for (const row of rows.filter((r) => r["category"] === "highlight")) {
    const key = text(row["id"]);
    const source = sources.get(text(row["parent_id"]));
    if (!source || done.has(key)) {
      continue;
    }
    await unmatchedHighlight(plan, source, row);
  }
  await notes(plan, rows, native, sources);
  return selectedBooks;
}
async function bookHighlights(
  plan: MigrationPlan,
  source: MigrationSource,
  book: Fields,
  native: Map<string, Fields>,
  done: Set<string>,
): Promise<void> {
  for (const value of array(book["highlights"] ?? [])) {
    const highlight = object(value);
    if (highlight["is_deleted"] === true) {
      continue;
    }
    const external = text(highlight["external_id"]);
    const counterpart = native.get(external);
    const id = scalar(highlight["id"]);
    if (!id) {
      throw new Error("Readwise highlight is missing an ID.");
    }
    const key = counterpart ? external : `v2:${id}`;
    if (done.has(key)) {
      continue;
    }
    done.add(key);
    await addAnnotation(
      plan,
      key,
      source,
      text(highlight["text"]),
      text(highlight["note"]),
      highlight,
      counterpart ? archiveReadwise(counterpart) : {},
    );
  }
}
async function unmatchedHighlight(
  plan: MigrationPlan,
  source: MigrationSource,
  row: Fields,
): Promise<void> {
  const key = text(row["id"]);
  const quote = text(row["content"]) || plain(text(row["html_content"]));
  if (
    quote &&
    plan.annotations.some((a) => a.sourceKey === source.key && exactQuote(a.fields) === quote)
  ) {
    plan.warnings.push(
      `Readwise highlight identity could not be reconciled; matching quote retained once, native record archived: ${key}`,
    );
    return;
  }
  if (!quote) {
    plan.warnings.push(
      `Highlight has no exposed full quote; retained as an unresolved note: ${key}`,
    );
  }
  await addAnnotation(plan, key, source, quote, text(row["notes"]), row);
}
function exactQuote(fields: Fields): string {
  const target = object(fields["target"] ?? {});
  return text(object(target["quote"] ?? {})["exact"]);
}
async function notes(
  plan: MigrationPlan,
  rows: Fields[],
  native: Map<string, Fields>,
  sources: Map<string, MigrationSource>,
): Promise<void> {
  for (const row of rows.filter((r) => r["category"] === "note")) {
    const parent = native.get(text(row["parent_id"]));
    const source = sources.get(text(row["parent_id"])) ?? sources.get(text(parent?.["parent_id"]));
    if (!source) {
      continue;
    }
    const note = plain(text(row["html_content"])) || text(row["content"]) || text(row["notes"]);
    const parentAnnotation = plan.annotations.find((a) => a.key === row["parent_id"]);
    if (parentAnnotation) {
      const provenance = object(parentAnnotation.fields["import"]);
      provenance["native_notes"] = [
        ...array(provenance["native_notes"] ?? []),
        archiveReadwise(row),
      ];
      if (note && !parentAnnotation.body.endsWith(`\n\n${note}`)) {
        parentAnnotation.body += `\n\n${note}`;
      }
      plan.summary.notes++;
    } else {
      await addAnnotation(plan, text(row["id"]), source, "", note, row);
    }
  }
  for (const source of plan.sources) {
    const row = native.get(source.key);
    if (row && text(row["notes"])) {
      await addAnnotation(plan, `document-note:${source.key}`, source, "", text(row["notes"]), row);
    }
  }
}
async function addAnnotation(
  plan: MigrationPlan,
  key: string,
  source: MigrationSource,
  quote: string,
  note: string,
  raw: Fields,
  supplemental: Fields = {},
): Promise<void> {
  const id = await identity(plan.namespace, key, "ann");
  const fileKey = quote ? source.documents[0]?.fileKey : undefined;
  const locator = scalar(raw["location"]);
  plan.annotations.push({
    key,
    id,
    path: `annotations/imports/${id}.md`,
    sourceKey: source.key,
    ...(fileKey ? { fileKey } : {}),
    body: quoteBody(quote, note),
    fields: {
      annotation_type: quote ? "highlight" : "note",
      created_at: stamp(raw["highlighted_at"] ?? raw["created_at"]),
      created_by: "readwise",
      tags: tagNames(raw["tags"]),
      ...(quote ? { target: { quote: { exact: quote } } } : {}),
      ...(text(raw["color"]) ? { color: text(raw["color"]) } : {}),
      ...(locator
        ? { locator: { label: `${text(raw["location_type"], "location")} ${locator}` } }
        : {}),
      import: {
        service: "readwise",
        namespace: plan.namespace,
        key,
        native: archiveReadwise(raw),
        supplemental,
      },
    },
  });
  if (quote) {
    plan.summary.annotations++;
  } else {
    plan.summary.notes++;
  }
}
