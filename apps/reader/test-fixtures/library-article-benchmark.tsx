import { ConnectContentSearchRepository } from "@mdbase-reader/connect";
import { collectionId, type Annotation, type SourceSummary } from "@mdbase-reader/core";
import "@mdbase-reader/i18n";
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
): Promise<Readonly<Record<string, number>>> {
  const samples: Record<string, number> = {};
  async function measure(name: string, operation: () => unknown, repeat = 1): Promise<void> {
    const start = performance.now();
    for (let run = 0; run < repeat; run++) {
      await operation();
    }
    samples[name] = (performance.now() - start) / repeat;
  }

  const repeats = sources.length < 1000 ? 100 : 8;
  const defaults = defaultLibraryViewConfiguration;
  await measure(
    "sort fresh title snapshot",
    () => {
      const sorted = applyLibraryViewConfiguration([...sources], defaults);
      if (sorted[0]?.title !== "Study 00000" || sorted.length !== sources.length) {
        throw new Error("Wrong sort order");
      }
    },
    repeats,
  );
  // Opening All sources precedes typing into its filter.
  applyLibraryViewConfiguration(sources, defaults);
  await measure(
    "filter title order by metadata and tag",
    () => {
      const matches = applyLibraryViewConfiguration(sources, {
        ...defaults,
        filter: { ...defaults.filter, query: "study", tag: "research" },
      });
      if (matches.length !== sources.length / 2 || matches[0]?.title !== "Study 00000") {
        throw new Error("Wrong filter result");
      }
    },
    repeats,
  );
  await measure(
    "rank tag suggestions",
    () => {
      const tags = fieldValueSuggestions(sources, "tags");
      if (tags[0] !== "reading" || tags[1] !== "research") {
        throw new Error("Wrong tag counts");
      }
    },
    repeats,
  );

  // Inject local query pages so this measures Reader's result processing only.
  const ownerCount = sources.length / 10;
  const annotations = sources.map(({ id }, index) => {
    return {
      path: `annotations/${id}.md`,
      frontmatter: {
        id,
        type: "reader-annotation",
        source: `[[sources/${String(index % ownerCount)}]]`,
      },
      types: ["reader-annotation"],
      body: "> Paper mentions attention and retention.\n\nReader highlight comment.",
    };
  });
  const records = [
    ...sources.slice(0, ownerCount).map(({ path, id }) => ({
      path,
      frontmatter: { type: "reader-source", id },
      types: ["reader-source"],
      body: "Source note about attention.",
    })),
    ...annotations,
  ];
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
  await measure(
    "group source-note and annotation search hits",
    async () => {
      const results = await search.search(collectionId("benchmark"), "attention");
      if (
        results.length !== ownerCount ||
        !results.every((hit) => hit.kinds.length === 2 && hit.passages?.length === 3)
      ) {
        throw new Error(`Wrong search result: ${String(results.length)}`);
      }
    },
    repeats,
  );
  if (sources.length < 1000) {
    return samples;
  }

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
    if (
      frame.contentDocument?.querySelector("[onclick]") ||
      !frame.contentDocument?.getElementById("p2999")?.getBoundingClientRect().height
    ) {
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
        if (
          css?.size !== 600 ||
          [...css].some(
            (range, i) => range.startContainer.parentElement?.id !== `p${String(i * 5)}`,
          )
        ) {
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
