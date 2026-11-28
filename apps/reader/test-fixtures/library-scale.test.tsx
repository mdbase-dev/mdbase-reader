import { stdout } from "node:process";

import { ConnectContentSearchRepository } from "@mdbase-reader/connect";
import { annotationId, collectionId, dateTime, sourceId } from "@mdbase-reader/core";
import { expect, it } from "vitest";

import { annotationGroupHeadings } from "../src/annotation-groups.js";
import { fieldValueSuggestions } from "../src/library-conditions.js";
import { librarySourceParts } from "../src/library-source-parts.js";
import {
  applyLibraryViewConfiguration,
  defaultLibraryViewConfiguration as view,
} from "../src/mdbase-library-views.js";
import { loadSourceLibrary } from "../src/source-library-loader.js";

import type { MdbaseClient } from "@mdbase-dev/sdk";
import type { Annotation, Page, SourceRepository, SourceSummary } from "@mdbase-reader/core";

const collection = collectionId("benchmark");
const collapsed = new Set<SourceSummary["id"]>();

/** Local CPU only. Already-decoded pages, no network, SDK I/O, React commit or paint. */
for (const count of [2000, 10_000]) {
  it(`profiles a library of ${String(count)} sources`, async () => {
    const sources: SourceSummary[] = Array.from({ length: count }, (_, index) => ({
      collectionId: collection,
      id: sourceId(`source-${String(index)}`),
      path: `sources/${String(index)}.md`,
      title: `Paper ${String((index * 7919) % count)}`,
      creators: ["Research group"],
      tags: [index % 10 === 0 ? "history" : "science"],
      properties: { score: index % 100, tags: [index % 10 === 0 ? "history" : "science"] },
      documents: [],
    }));
    const annotations: Annotation[] = sources.map((owner, index) => ({
      id: annotationId(`highlight-${String(index)}`),
      collectionId: collection,
      sourceId: owner.id,
      source: `[[${owner.path}]]`,
      annotationType: "highlight",
      body: "> Selected passage",
      tags: [],
      createdAt: dateTime("2026-01-01T00:00:00Z"),
      target: { position: { kind: "pdf", pageIndex: index % 80 } },
    }));
    const repository = {
      async *listPages(): AsyncGenerator<Page<SourceSummary>> {
        for (let offset = 0; offset < count; offset += 128) {
          yield await Promise.resolve({
            items: sources.slice(offset, offset + 128),
            totalCount: count,
          });
        }
      },
    } as unknown as SourceRepository;
    function rows(items: readonly SourceSummary[], query = ""): number {
      const matches = applyLibraryViewConfiguration(items, {
        ...view,
        filter: { ...view.filter, query },
      });
      return librarySourceParts(matches, items, collapsed, Boolean(query), true).sources.length;
    }
    await median("progressive library and rows", async () => {
      const snapshot = await loadSourceLibrary({
        repository,
        collectionId: collection,
        collectionName: "Benchmark",
        options: {},
        onProgress: ({ sources: page }) => rows(page),
      });
      expect(rows(snapshot.sources)).toBe(count);
    });
    await median("filtered rows", () => expect(rows(sources, "history")).toBe(count / 10));
    await median("metadata queries (title, author, tag)", () => {
      expect(rows(sources, "Paper 17")).toBeGreaterThan(0);
      expect(rows(sources, "research group")).toBe(count);
      expect(rows(sources, "history")).toBe(count / 10);
    });
    await median("numeric field filter", () => {
      const result = applyLibraryViewConfiguration(sources, {
        ...view,
        filter: {
          ...view.filter,
          conditions: [{ key: "score", operator: "at-least", value: "90" }],
        },
      });
      expect(result).toHaveLength(count / 10);
    });
    await median("tag suggestions", () => {
      expect(fieldValueSuggestions(sources, "tags")).toEqual(["science", "history"]);
    });
    // Each heavily annotated source contributes 200 matching notes spread across pages.
    const notes = annotations.map((annotation, index) => ({
      path: `annotations/${annotation.id}.md`,
      types: ["reader-annotation"],
      effective: { source: `[[source-${String(index % (count / 200))}]]` },
      body: `Selected passage ${String(index)} ${"annotation context ".repeat(40)}`,
    }));
    const search = new ConnectContentSearchRepository({
      async *pages() {
        for (let offset = 0; offset < notes.length; offset += 128) {
          yield await Promise.resolve({
            complete: true,
            records: notes.slice(offset, offset + 128),
          });
        }
      },
      // Legacy bare-ID links, with no record at the link target in this fixture.
      resolveLinks: (_from: string, links: string[]) =>
        Promise.resolve({
          complete: true,
          resolutions: links.map(() => ({ kind: "not_found" })),
        }),
    } as unknown as MdbaseClient);
    await median("annotation search results", async () => {
      const results = await search.search(collection, "passage");
      expect(results).toHaveLength(count / 200);
      expect(results.every((match) => match.passages?.length === 3)).toBe(true);
    });
    await median("collection highlight headings", () => {
      const headings = annotationGroupHeadings(annotations, undefined, sources, true);
      expect(headings.at(-1)?.source?.summary).toBe(sources.at(-1));
    });
  }, 60_000);
}

async function median(label: string, run: () => Promise<void> | void): Promise<void> {
  await run();
  const samples: number[] = [];
  for (let sample = 0; sample < 7; sample++) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  stdout.write(`${label}: ${String(samples.sort((a, b) => a - b)[3]?.toFixed(2))} ms\n`);
}
