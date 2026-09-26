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
import { bookMetadata, classicKey, classicSource } from "./readwise-books.js";
import { archiveReadwise, plain, scalar, tagNames, type SkipTally } from "./readwise-values.js";
interface Join {
  plan: MigrationPlan;
  sources: Map<string, MigrationSource>;
  native: Map<string, Fields>;
  /** Annotation keys already planned. */
  done: Set<string>;
  /** Reader highlight IDs reconciled onto another annotation by exact quote. */
  aliases: Map<string, string>;
  skipped: SkipTally;
}
export async function readwiseAnnotations(
  plan: MigrationPlan,
  rows: Fields[],
  books: Fields[],
  skipped: SkipTally,
): Promise<Fields[]> {
  const join: Join = {
    plan,
    sources: new Map(plan.sources.map((s) => [s.key, s])),
    native: new Map(rows.map((r) => [text(r["id"]), r])),
    done: new Set(),
    aliases: new Map(),
    skipped,
  };
  const selectedBooks: Fields[] = [];
  for (const book of books) {
    if (await joinBook(join, book)) {
      selectedBooks.push(book);
    }
  }
  for (const row of rows.filter((r) => r["category"] === "highlight")) {
    const key = text(row["id"]);
    const source = join.sources.get(text(row["parent_id"]));
    if (join.done.has(key)) {
      continue;
    }
    if (!source) {
      skipped.add("Reader highlights on documents outside this import (for example unsaved Feed)");
      continue;
    }
    await unmatchedHighlight(join, source, row);
  }
  await notes(join, rows);
  return selectedBooks;
}
/** Plans one v2 book's highlights; returns whether the book belongs to this import. */
async function joinBook(join: Join, book: Fields): Promise<boolean> {
  const highlights = array(book["highlights"] ?? []).length;
  if (book["is_deleted"] === true) {
    join.skipped.add("Deleted Readwise books skipped");
    return false;
  }
  const external = text(book["external_id"]);
  const row = external ? join.native.get(external) : undefined;
  // Match Reader documents by explicit ID, never by title.
  if (book["source"] === "reader" || (row && !isAnnotationRow(row))) {
    const source = join.sources.get(external);
    if (!source) {
      join.skipped.add(
        "Readwise books whose Reader document is outside this import (unsaved Feed, or removed from Reader)",
      );
      join.skipped.add("Highlights on those books not imported", highlights);
      // Their Reader copies are already counted here; do not count them again below.
      for (const value of array(book["highlights"] ?? [])) {
        join.done.add(text(object(value)["external_id"]));
      }
      return false;
    }
    await bookHighlights(join, source, book);
    return true;
  }
  const key = classicKey(book);
  if (!key) {
    join.skipped.add("Readwise books without an ID skipped");
    join.skipped.add("Highlights on those books not imported", highlights);
    return false;
  }
  let source = join.sources.get(key);
  if (!source) {
    source = await classicSource(book, join.plan.namespace);
    join.plan.sources.push(source);
    join.sources.set(key, source);
  }
  await bookHighlights(join, source, book);
  const note = text(book["document_note"]).trim();
  const noteKey = `document-note:${key}`;
  if (note && !join.done.has(noteKey)) {
    join.done.add(noteKey);
    await addAnnotation(join.plan, {
      key: noteKey,
      source,
      quote: "",
      note,
      raw: bookMetadata(book),
      createdAt: text(source.fields["saved_at"]),
    });
  }
  return true;
}
function skipReason(highlight: Fields): string {
  if (highlight["is_deleted"] === true) {
    return "Deleted Readwise highlights skipped";
  }
  if (highlight["is_discard"] === true) {
    return "Discarded Readwise highlights skipped (kept in the native archive)";
  }
  if (
    !scalar(highlight["id"]) ||
    (!text(highlight["text"]).trim() && !text(highlight["note"]).trim())
  ) {
    return "Readwise highlights without an ID or any text skipped";
  }
  return "";
}
function isAnnotationRow(row: Fields): boolean {
  return ["highlight", "note"].includes(text(row["category"]));
}
async function bookHighlights(join: Join, source: MigrationSource, book: Fields): Promise<void> {
  for (const value of array(book["highlights"] ?? [])) {
    const highlight = object(value);
    const external = text(highlight["external_id"]);
    // A highlight still present in Reader is live there, whatever its Readwise state.
    const counterpart = join.native.get(external);
    const skip = counterpart ? "" : skipReason(highlight);
    if (skip) {
      join.skipped.add(skip);
      continue;
    }
    const id = scalar(highlight["id"]);
    const quote = text(highlight["text"]);
    const note = text(highlight["note"]);
    const key = counterpart ? external : `v2:${id}`;
    if (join.done.has(key)) {
      continue;
    }
    join.done.add(key);
    await addAnnotation(join.plan, {
      key,
      source,
      quote,
      note,
      raw: highlight,
      supplemental: counterpart ? archiveReadwise(counterpart) : {},
    });
  }
}
async function unmatchedHighlight(join: Join, source: MigrationSource, row: Fields): Promise<void> {
  const { plan } = join;
  const key = text(row["id"]);
  const quote = text(row["content"]) || plain(text(row["html_content"]));
  const same = quote
    ? plan.annotations.find((a) => a.sourceKey === source.key && exactQuote(a.fields) === quote)
    : undefined;
  if (same) {
    join.aliases.set(key, same.key);
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
  join.done.add(key);
  await addAnnotation(plan, { key, source, quote, note: text(row["notes"]), raw: row });
}
function exactQuote(fields: Fields): string {
  const target = object(fields["target"] ?? {});
  return text(object(target["quote"] ?? {})["exact"]);
}
async function notes(join: Join, rows: Fields[]): Promise<void> {
  const { plan, native, sources } = join;
  const planned = new Map(plan.annotations.map((a) => [a.key, a]));
  for (const row of rows.filter((r) => r["category"] === "note")) {
    const parentId = text(row["parent_id"]);
    const parent = native.get(parentId);
    const source = sources.get(parentId) ?? sources.get(text(parent?.["parent_id"]));
    if (!source) {
      join.skipped.add("Reader notes on documents outside this import (for example unsaved Feed)");
      continue;
    }
    const note = plain(text(row["html_content"])) || text(row["content"]) || text(row["notes"]);
    const parentKey = join.aliases.get(parentId) ?? parentId;
    const parentAnnotation = planned.get(parentKey);
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
      await addAnnotation(plan, { key: text(row["id"]), source, quote: "", note, raw: row });
    }
  }
  for (const source of plan.sources) {
    const row = native.get(source.key);
    if (row && text(row["notes"])) {
      await addAnnotation(plan, {
        key: `document-note:${source.key}`,
        source,
        quote: "",
        note: text(row["notes"]),
        raw: row,
      });
    }
  }
}
/**
 * Only v2 highlights carry a position: `location` is a number qualified by `location_type`
 * (Kindle location, page, order…). A Reader v3 row's `location` is its inbox/archive state.
 */
function locatorLabel(raw: Fields): string {
  const type = text(raw["location_type"]);
  const location = scalar(raw["location"]);
  return type && location ? `${type} ${location}` : "";
}
async function addAnnotation(
  plan: MigrationPlan,
  item: {
    key: string;
    source: MigrationSource;
    quote: string;
    note: string;
    raw: Fields;
    supplemental?: Fields;
    createdAt?: string;
  },
): Promise<void> {
  const { key, source, quote, note, raw } = item;
  const id = await identity(plan.namespace, key, "ann");
  const fileKey = quote ? source.documents[0]?.fileKey : undefined;
  const locator = locatorLabel(raw);
  plan.annotations.push({
    key,
    id,
    path: `annotations/imports/${id}.md`,
    sourceKey: source.key,
    ...(fileKey ? { fileKey } : {}),
    body: quoteBody(quote, note),
    fields: {
      annotation_type: quote ? "highlight" : "note",
      created_at: item.createdAt ?? stamp(raw["highlighted_at"] ?? raw["created_at"]),
      created_by: "readwise",
      tags: tagNames(raw["tags"]),
      ...(quote ? { target: { quote: { exact: quote } } } : {}),
      ...(text(raw["color"]) ? { color: text(raw["color"]) } : {}),
      ...(locator ? { locator: { label: locator } } : {}),
      import: {
        service: "readwise",
        namespace: plan.namespace,
        key,
        native: archiveReadwise(raw),
        supplemental: item.supplemental ?? {},
      },
    },
  });
  if (quote) {
    plan.summary.annotations++;
  } else {
    plan.summary.notes++;
  }
}
