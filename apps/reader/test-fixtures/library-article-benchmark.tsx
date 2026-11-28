import { ConnectContentSearchRepository } from "@mdbase-reader/connect";
import { collectionId, type Annotation, type SourceSummary } from "@mdbase-reader/core";
import { HtmlDocumentRuntime, prepareHtmlDocument } from "@mdbase-reader/renderer-html";

import { fieldValueSuggestions } from "../src/library-conditions.js";
import {
  applyLibraryViewConfiguration,
  defaultLibraryViewConfiguration,
} from "../src/mdbase-library-views.js";

import type { MdbaseClient } from "@mdbase-dev/sdk";

type HighlightWindow = Window & {
  readonly CSS: { readonly highlights: ReadonlyMap<string, ReadonlySet<Range>> };
};

export async function measureLibraryAndArticle(
  sources: readonly SourceSummary[],
): Promise<Readonly<Record<string, number[]>>> {
  const samples: Record<string, number[]> = {};
  async function measure(name: string, operation: () => unknown): Promise<void> {
    const times = [];
    for (let run = 0; run < 10; run++) {
      const start = performance.now();
      await operation();
      if (run) {
        times.push(performance.now() - start);
      }
    }
    samples[name] = times;
  }

  const defaults = defaultLibraryViewConfiguration;
  await measure("sort 10k titles", () => {
    const sorted = applyLibraryViewConfiguration(sources, defaults);
    if (!sorted[0]?.title.endsWith("00000")) {
      throw new Error("Wrong sort order");
    }
  });
  await measure("filter 10k by metadata and tag", () => {
    const matches = applyLibraryViewConfiguration(sources, {
      ...defaults,
      filter: { ...defaults.filter, query: "study", tag: "research" },
    });
    if (matches.length !== 5000) {
      throw new Error("Wrong filter result");
    }
  });
  await measure("tag suggestions from 10k library", () => {
    if (!fieldValueSuggestions(sources, "tags").length) {
      throw new Error("Missing tags");
    }
  });

  // Inject local query pages so this measures Reader's result processing only.
  const records = sources.map(({ id }, index) => {
    return {
      path: `annotations/${id}.md`,
      frontmatter: { id, type: "reader-annotation", source: `[[sources/${String(index % 1000)}]]` },
      types: ["reader-annotation"],
      body: "> Paper mentions attention and retention.\n\nReader highlight comment.",
    };
  });
  const client = {
    resolveLinks(_from: unknown, links: string[]) {
      return Promise.resolve({
        complete: true,
        resolutions: links.map((link) => ({ kind: "record", path: link.slice(2, -2) + ".md" })),
      });
    },
    find({ path }: { path: string }) {
      const owner = sources[Number(path.slice(8, -3))];
      return Promise.resolve(owner && { frontmatter: { id: owner.id } });
    },
    async *pages() {
      for (let offset = 0; offset < records.length; offset += 128) {
        yield await Promise.resolve({
          records: records.slice(offset, offset + 128),
          complete: true,
        });
      }
    },
  } as unknown as MdbaseClient;
  const search = new ConnectContentSearchRepository(client);
  await measure("process 10k annotation search hits", async () => {
    const results = await search.search(collectionId("benchmark"), "attention");
    if (results.length !== 1000) {
      throw new Error(`Wrong search result: ${String(results.length)}`);
    }
  });

  const paragraphs = Array.from(
    { length: 3000 },
    (_, index) =>
      `<p id="p${String(index)}" onclick="ignored()">Passage [${String(index)}] about reading. The study compares two methods. ${"Attention and retention. ".repeat(6)}</p>`,
  );
  const article = `<html lang="en"><head><title>Long article</title></head><body><article>${paragraphs.join("")}</article></body></html>`;
  const frame = document.createElement("iframe");
  frame.sandbox.add("allow-same-origin");
  frame.width = "800";
  frame.height = "640";
  document.body.append(frame);
  await measure("sanitize and lay out 3k HTML paragraphs", async () => {
    const loaded = new Promise((done) => frame.addEventListener("load", done, { once: true }));
    frame.srcdoc = prepareHtmlDocument(article);
    await loaded;
    if (!frame.contentDocument?.getElementById("p2999")?.getBoundingClientRect().height) {
      throw new Error("Last paragraph is missing");
    }
  });
  const unique = Array.from({ length: 600 }, (_, index) => ({
    id: `u${String(index)}`,
    body: "",
    target: { quote: { exact: `Passage [${String(index * 5)}]` } },
  })) as unknown as readonly Annotation[];
  const repeated = Array.from({ length: 600 }, (_, index) => ({
    id: `r${String(index)}`,
    body: "",
    target: {
      quote: {
        exact: "about reading. The study compares two methods.",
        prefix: `Passage [${String(index * 5)}] `,
      },
    },
  })) as unknown as readonly Annotation[];
  for (const [label, annotations] of [
    ["unique", unique],
    ["repeated", repeated],
  ] as const) {
    await measure(`anchor and paint 600 ${label} highlights`, () => {
      const runtime = new HtmlDocumentRuntime(frame, "long.html");
      try {
        runtime.setAnnotations(annotations);
        const css = (frame.contentWindow as HighlightWindow | null)?.CSS.highlights.get(
          "reader-annotation-yellow",
        );
        if (css?.size !== 600 || [...css].at(-1)?.startContainer.parentElement?.id !== "p2995") {
          throw new Error("Highlights did not anchor to the expected passages");
        }
      } finally {
        runtime.destroy();
      }
    });
  }
  frame.remove();
  return samples;
}
