import {
  identity,
  jsonFile,
  text,
  type Fields,
  type MigrationPlan,
  type Progress,
} from "./model.js";
import { readwiseAnnotations } from "./readwise-annotations.js";
import { readwiseFiles, readwiseSource } from "./readwise-sources.js";
import { archiveReadwise } from "./readwise-values.js";

import type { ReadwiseClient } from "./readwise-client.js";
export { archiveReadwise } from "./readwise-values.js";
export async function scanReadwise(
  client: ReadwiseClient,
  includeFeed: boolean,
  signal: AbortSignal,
  progress: Progress,
): Promise<MigrationPlan> {
  const namespace = "readwise:reader";
  progress("Scanning Readwise metadata and saved HTML; no collection writes…");
  const rows = await client.all(
    "/api/v3/list/",
    { limit: "100", withHtmlContent: "true", withRawSourceUrl: "true" },
    signal,
    progress,
  );
  validateIds(rows);
  const books = await client.all("/api/v2/export/", {}, signal, progress);
  const plan: MigrationPlan = {
    service: "readwise",
    namespace,
    sources: [],
    annotations: [],
    files: [],
    warnings: [],
    summary: { sources: 0, notes: 0, annotations: 0, files: 0, bytes: null },
  };
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
  const selectedBooks = await readwiseAnnotations(plan, rows, books);
  const relevant = relevantRows(rows, new Set(plan.sources.map((s) => s.key)));
  plan.files.push(
    jsonFile(
      "readwise-native",
      `files/reader/imports/readwise-native-${await identity(namespace, new Date().toISOString(), "snapshot")}.json`,
      { documents: relevant.map(archiveReadwise), highlights: selectedBooks },
    ),
  );
  plan.warnings.push(
    "Exact PDF geometry and EPUB positions are not supplied by this import. Highlights retain quotes and native location evidence, without claiming exact positioning.",
  );
  plan.warnings.push(
    "Saved HTML can reference external images. Those assets are not downloaded. Keep this tab open; reconnect and rescan to resume after closing it.",
  );
  plan.summary.sources = plan.sources.length;
  plan.summary.files = plan.files.length - 1;
  signal.throwIfAborted();
  return plan;
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
