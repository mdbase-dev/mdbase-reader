import {
  identity,
  jsonFile,
  object,
  text,
  type Fields,
  type MigrationPlan,
  type Progress,
} from "./model.js";
import { readwiseAnnotations } from "./readwise-annotations.js";
import { readwiseFiles, readwiseSource } from "./readwise-sources.js";
import { archiveReadwise, SkipTally } from "./readwise-values.js";

import type { ReadwiseClient } from "./readwise-client.js";
export { archiveReadwise } from "./readwise-values.js";
const LIST = "/api/v3/list/";
/** Reader locations other than `feed`, as documented for `/api/v3/list/`. */
const LIBRARY_LOCATIONS = ["new", "later", "shortlist", "archive"];
export async function scanReadwise(
  client: ReadwiseClient,
  includeFeed: boolean,
  signal: AbortSignal,
  progress: Progress,
): Promise<MigrationPlan> {
  const namespace = "readwise:reader";
  progress("Scanning Readwise metadata and saved HTML; no collection writes…");
  const rows = await readerRows(client, includeFeed, signal, progress);
  const books = await client.all("/api/v2/export/", {}, signal, (message) =>
    progress(`Readwise highlights export: ${message}`),
  );
  const plan: MigrationPlan = {
    service: "readwise",
    namespace,
    sources: [],
    annotations: [],
    files: [],
    warnings: [],
    summary: { sources: 0, notes: 0, annotations: 0, files: 0, bytes: null },
  };
  const skipped = new SkipTally();
  if (!includeFeed) {
    const feed = await client.page({ location: "feed", limit: "1" }, signal);
    skipped.add(
      "Unsaved Feed items excluded (choose “Include unsaved Feed items” to import)",
      feed.count,
    );
  }
  for (const row of rows) {
    if (
      ["highlight", "note"].includes(text(row["category"])) ||
      (!includeFeed && row["location"] === "feed")
    ) {
      continue;
    }
    const source = await readwiseSource(row, namespace);
    plan.sources.push(source);
    readwiseFiles(source, row, plan, client);
  }
  const selectedBooks = await readwiseAnnotations(plan, rows, books, skipped);
  const relevant = relevantRows(rows, new Set(plan.sources.map((s) => s.key)));
  plan.files.push(
    jsonFile(
      "readwise-native",
      `files/reader/imports/readwise-native-${await identity(namespace, new Date().toISOString(), "snapshot")}.json`,
      { documents: relevant.map(archiveReadwise), highlights: selectedBooks },
    ),
  );
  plan.warnings.push(...skipped.warnings());
  plan.warnings.push(
    "Exact PDF geometry and EPUB positions are not supplied by this import. Highlights retain quotes and native location evidence, without claiming exact positioning.",
  );
  plan.warnings.push(
    "Saved HTML can reference external images. Those assets are not downloaded. Keep this tab open; reconnect and rescan to resume after closing it.",
  );
  if (plan.sources.some((s) => s.key.startsWith("v2-book:"))) {
    plan.warnings.push(
      "Books from Kindle, Apple Books, Instapaper, podcasts and other classic Readwise sources are imported as metadata and highlights only; Readwise does not provide their text or files. Their locations are Readwise's labels (such as Kindle locations), not positions Reader can open.",
    );
  }
  plan.summary.sources = plan.sources.length;
  plan.summary.files = plan.files.length - 1;
  plan.summary.categories = categories(plan);
  signal.throwIfAborted();
  return plan;
}
/**
 * Reader documents, highlights and notes. Without the Feed, list each library location
 * separately so unsaved Feed items (often most of an account) are never downloaded.
 */
async function readerRows(
  client: ReadwiseClient,
  includeFeed: boolean,
  signal: AbortSignal,
  progress: Progress,
): Promise<Fields[]> {
  const documents = { limit: "100", withHtmlContent: "true", withRawSourceUrl: "true" };
  const queries: [string, Record<string, string>][] = includeFeed
    ? [["Reader", documents]]
    : [
        ...LIBRARY_LOCATIONS.map((location): [string, Record<string, string>] => [
          `Reader ${location}`,
          { ...documents, location },
        ]),
        ...["highlight", "note"].map((category): [string, Record<string, string>] => [
          `Reader ${category}s`,
          { limit: "100", withHtmlContent: "true", category },
        ]),
      ];
  const rows = new Map<string, Fields>();
  for (const [label, params] of queries) {
    const page = await client.all(LIST, params, signal, (message) =>
      progress(`${label}: ${message}`),
    );
    validateIds(page);
    // Location and category listings can overlap; the first copy of each ID wins.
    for (const row of page) {
      const id = text(row["id"]);
      if (!rows.has(id)) {
        rows.set(id, row);
      }
    }
  }
  return [...rows.values()];
}
function validateIds(rows: Fields[]): void {
  const keys = new Set<string>();
  for (const row of rows) {
    const id = text(row["id"]);
    if (!id || keys.has(id)) {
      throw new Error("Readwise returned missing or duplicate identities. Scan again.");
    }
    keys.add(id);
  }
}
function relevantRows(rows: Fields[], sources: Set<string>): Fields[] {
  const keys = new Set([
    ...sources,
    ...rows.filter((r) => sources.has(text(r["parent_id"]))).map((r) => text(r["id"])),
  ]);
  return rows.filter((r) => keys.has(text(r["id"])) || keys.has(text(r["parent_id"])));
}
const readerLabels: Record<string, string> = {
  article: "Reader articles",
  email: "Reader emails",
  rss: "Reader RSS items",
  pdf: "Reader PDFs",
  epub: "Reader EPUBs",
  tweet: "Reader tweets",
  video: "Reader videos",
};
const classicLabels: Record<string, string> = {
  books: "Readwise books (Kindle, Apple Books…)",
  articles: "Readwise articles (Instapaper, Pocket…)",
  tweets: "Readwise tweets",
  podcasts: "Readwise podcasts",
  supplementals: "Readwise supplementals",
};
function categories(plan: MigrationPlan): NonNullable<MigrationPlan["summary"]["categories"]> {
  const byLabel = new Map<string, { label: string; sources: number; annotations: number }>();
  const labelOf = new Map<string, string>();
  for (const source of plan.sources) {
    const category = text(object(object(source.fields["import"])["native"])["category"]);
    const classic = source.key.startsWith("v2-book:");
    const label =
      (classic ? classicLabels[category] : readerLabels[category]) ??
      `${classic ? "Readwise" : "Reader"} ${category || "other"}`;
    labelOf.set(source.key, label);
    const entry = byLabel.get(label) ?? { label, sources: 0, annotations: 0 };
    entry.sources++;
    byLabel.set(label, entry);
  }
  for (const annotation of plan.annotations) {
    const entry = byLabel.get(labelOf.get(annotation.sourceKey) ?? "");
    if (entry) {
      entry.annotations++;
    }
  }
  return [...byLabel.values()].sort(
    (a, b) => b.sources - a.sources || a.label.localeCompare(b.label),
  );
}
