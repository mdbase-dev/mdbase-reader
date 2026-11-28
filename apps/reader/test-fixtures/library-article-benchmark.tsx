import {
  ConnectAnnotationAssetRepository,
  ConnectAnnotationRepository,
  ConnectContentSearchRepository,
  ConnectSourceImportRepository,
  ConnectSourceRepository,
} from "@mdbase-reader/connect";
import {
  collectionId,
  fileRevision,
  type Annotation,
  type SourceSummary,
} from "@mdbase-reader/core";
import "@mdbase-reader/i18n";
import { createReaderRuntimeServices, MemoryStorage } from "@mdbase-reader/platform";
import {
  HtmlDocumentRuntime,
  HtmlReadingSurface,
  prepareHtmlDocument,
} from "@mdbase-reader/renderer-html";

import { ConnectWorkspaceGateway } from "../src/connect-workspace.js";
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

  // Return contract projections as the SDK would after decoding a page.
  const views = sources.map((source) => ({
    id: source.id,
    path: source.path,
    types: ["reader-source"],
    frontmatter: {
      id: source.id,
      title: source.title,
      authors: source.creators,
      tags: source.tags,
    },
  }));
  const projections = views.map(({ id, frontmatter }) => ({
    id,
    implementations: [{ typeName: "reader-source", fields: frontmatter }],
  }));
  let pageReads = 0;
  const sdk = {
    async queryContract(
      _contract: unknown,
      { pageSize, cursor }: { pageSize: number; cursor?: string },
    ) {
      pageReads++;
      const start = Number(cursor ?? 0);
      const end = start + pageSize;
      await new Promise((done) => setTimeout(done, 0));
      return {
        page: {
          records: views.slice(start, end),
          cursor: end < sources.length ? String(end) : undefined,
          totalCount: sources.length,
          complete: true,
        },
        records: projections.slice(start, end),
      };
    },
  } as unknown as MdbaseClient;
  const files = { upload: () => Promise.reject(new Error("Benchmark is read-only")) };
  const gateway = new ConnectWorkspaceGateway(
    new ConnectSourceRepository(sdk),
    new ConnectAnnotationRepository(sdk),
    new ConnectAnnotationAssetRepository(files),
    new ConnectSourceImportRepository(sdk, files),
    collectionId("benchmark"),
    "Benchmark",
    createReaderRuntimeServices(new MemoryStorage()),
  );
  await measure("cold paged workspace hydration", async () => {
    const start = performance.now();
    const snapshot = await gateway.library({
      onProgress: () => {
        samples["first workspace page"] ??= performance.now() - start;
      },
    });
    if (
      snapshot.sources.length !== sources.length ||
      snapshot.sources.at(-1)?.id !== sources.at(-1)?.id
    ) {
      throw new Error("Incomplete workspace hydration");
    }
  });
  const coldPageReads = pageReads;
  await measure(
    "warm workspace library read",
    async () => {
      const snapshot = await gateway.library();
      if (snapshot.sources.length !== sources.length || pageReads !== coldPageReads) {
        throw new Error("Warm library read fetched another page");
      }
    },
    100,
  );

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
    "switch three status buckets",
    () => {
      for (const status of ["inbox", "reading", "finished"] as const) {
        const matches = applyLibraryViewConfiguration(sources, {
          ...defaults,
          filter: { ...defaults.filter, status },
        });
        if (matches.length === 0 || matches.some((source) => source.readingStatus !== status)) {
          throw new Error("Wrong status bucket");
        }
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
      body: "> Paper mentions attention and retention.\n\nAnnotation-only highlight comment.",
    };
  });
  const records = [
    ...sources.slice(0, ownerCount).map(({ path, id }) => ({
      path,
      frontmatter: { type: "reader-source", id },
      types: ["reader-source"],
      body: "Source-only note about attention.",
    })),
    ...annotations,
  ];
  const matchesByQuery = new Map(
    ["attention", "source-only", "annotation-only"].map((query) => [
      query,
      records.filter(({ body }) => body.toLowerCase().includes(query)),
    ]),
  );
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
    async *pages({ where, limit = 500 }: { where: string; limit?: number }) {
      const query = JSON.parse(where.slice("file.body.lower().contains(".length, -1)) as string;
      const matched = matchesByQuery.get(query);
      if (!matched) {
        throw new Error(`Unexpected benchmark search: ${query}`);
      }
      for (let offset = 0; offset < matched.length; offset += limit) {
        yield await Promise.resolve({
          records: matched.slice(offset, offset + limit),
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

  for (const [query, kind] of [
    ["source-only", "source-note"],
    ["annotation-only", "annotation"],
  ] as const) {
    await measure(
      `search ${kind} bodies`,
      async () => {
        const results = await search.search(collectionId("benchmark"), query);
        if (
          results.length !== ownerCount ||
          !results.every((hit) => hit.kinds.length === 1 && hit.kinds[0] === kind)
        ) {
          throw new Error(`Wrong ${kind} search results`);
        }
      },
      repeats,
    );
  }

  const paragraphs = Array.from(
    { length: 3000 },
    (_, index) =>
      `${index % 10 === 0 ? `<h2>Section ${String(index / 10)}</h2>` : ""}<p id="p${String(index)}" onclick="ignored()">Passage [${String(index)}] about reading. The study compares two methods. ${"Attention and retention. ".repeat(6)}</p>`,
  );
  const article = `<html lang="en"><head><title>Long article</title></head><body><article>${paragraphs.join("")}</article></body></html>`;
  const frame = document.createElement("iframe");
  frame.sandbox.add("allow-same-origin");
  frame.width = "800";
  frame.height = "640";
  document.body.append(frame);
  let prepared = "";
  await measure(
    "sanitize long HTML",
    () => {
      prepared = prepareHtmlDocument(article);
    },
    4,
  );
  const svg = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><script>bad()</script><path d="M0 0 L10 10"/></svg>',
  );
  const withSvg = article.replace(
    "</article>",
    `${`<img alt="" src="data:image/svg+xml,${svg}">`.repeat(64)}</article>`,
  );
  await measure(
    "sanitize HTML with 64 repeated SVGs",
    () => {
      const sanitized = prepareHtmlDocument(withSvg);
      if (sanitized.includes("bad()") || !sanitized.includes("data:image/svg+xml,")) {
        throw new Error("SVG was not sanitized and retained");
      }
    },
    4,
  );
  await measure("load and lay out long HTML iframe", async () => {
    const loaded = new Promise((done) => frame.addEventListener("load", done, { once: true }));
    frame.srcdoc = prepared;
    await loaded;
    if (
      frame.contentDocument?.querySelector("[onclick]") ||
      !frame.contentDocument?.getElementById("p2999")?.getBoundingClientRect().height
    ) {
      throw new Error("Last paragraph is missing");
    }
  });
  const tocRuntime = new HtmlDocumentRuntime(frame, "long.html");
  const surfaceDocument = {
    document: { file: "long.html", revision: fileRevision(`sha256:${"a".repeat(64)}`) },
    mediaType: "text/html",
    url: "about:blank",
  };
  const surface = new HtmlReadingSurface(surfaceDocument, tocRuntime);
  try {
    await measure(
      "extract long article TOC",
      () => {
        const contents = surface.capabilities.contents?.entries();
        if (contents?.length !== 300 || contents.at(-1)?.title !== "Section 299") {
          throw new Error("Wrong table of contents");
        }
      },
      20,
    );
    await measure(
      "check long article TOC availability",
      async () => {
        const runtime = new HtmlDocumentRuntime(frame, "long.html");
        const candidate = new HtmlReadingSurface(surfaceDocument, runtime);
        if (!candidate.capabilities.contents) {
          throw new Error("Missing table of contents");
        }
        await candidate.destroy();
      },
      8,
    );
  } finally {
    await surface.destroy();
  }
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
