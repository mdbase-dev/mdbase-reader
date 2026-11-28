import { collectionId, fileRevision, importSourceFile, recordRevision } from "@mdbase-reader/core";
import {
  BrowserStorage,
  createReaderRuntimeServices,
  MemoryStorage,
} from "@mdbase-reader/platform";
import { EpubArchive, sanitizePublicationMarkup } from "@mdbase-reader/renderer-epub";
import {
  HtmlDocumentRuntime,
  HtmlReadingSurface,
  prepareHtmlDocument,
} from "@mdbase-reader/renderer-html";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { readDocumentFileDetails } from "../src/document-details.js";
import { beginExplicitReadingNavigation } from "../src/reading-navigation-priority.js";
import { useReadingResume } from "../src/use-reading-resume.js";

import type { DocumentDescriptor, Source } from "@mdbase-reader/core";

const runtime = createReaderRuntimeServices(new MemoryStorage());
const collection = collectionId("performance");
const href = "long-article.html";
const documentTarget: DocumentDescriptor = {
  file: "[[long-article.html]]",
  revision: fileRevision("sha256:abcdef"),
  mediaType: "text/html",
  role: "primary",
  range: { kind: "fragment", start: "#p0", end: "#p1199" },
};
const articleBody = Array.from(
  { length: 1200 },
  (_, index) =>
    `<p id="p${String(index)}">${"Long article text about attention and retention. ".repeat(12)}</p>`,
).join("");
const article = `<!doctype html><html><head><title>Long article</title></head><body>${articleBody}</body></html>`;
export async function runImportFixture(
  files: readonly { name: string; url: string }[],
): Promise<Readonly<Record<string, number>>> {
  const metrics: Record<string, number> = {};
  for (const { name, url } of files) {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    metrics[`plan and hash ${name}`] = await median(() => planImport(name, bytes));
    metrics[`read import metadata ${name}`] = await median(async () => {
      const { metadata } = await readDocumentFileDetails({ name, bytes });
      if (name.endsWith(".epub") && metadata.language !== "en") {
        throw new Error("EPUB metadata did not survive.");
      }
    });
    if (name.endsWith(".epub")) {
      const blob = new Blob([bytes]);
      let chapter = "";
      metrics["open EPUB, read and sanitize chapter"] = await median(async () => {
        const archive = await EpubArchive.open(blob);
        try {
          chapter = await archive.readText("OEBPS/chapter.xhtml");
          sanitizeChapter(chapter);
        } finally {
          await archive.close();
        }
      });
      metrics["sanitize EPUB chapter"] = await median(() => sanitizeChapter(chapter));
    }
  }
  metrics["sanitize 1200-paragraph HTML"] = await median(() => {
    const cleaned = prepareHtmlDocument(article);
    if (!cleaned.includes('id="p1199"') || !cleaned.includes("Content-Security-Policy")) {
      throw new Error("HTML sanitization changed the fixture contract.");
    }
  });
  return metrics;
}

function sanitizeChapter(chapter: string): void {
  const cleaned = sanitizePublicationMarkup(chapter, "application/xhtml+xml");
  if (cleaned.includes("onclick=") || !cleaned.includes('id="p1199"')) {
    throw new Error("EPUB sanitization changed the fixture contract.");
  }
}

async function planImport(name: string, bytes: Uint8Array): Promise<void> {
  const source = await importSourceFile(
    {
      ...runtime,
      imports: {
        findExactDuplicate: () => Promise.resolve(null),
        commitFile: (plan) => {
          if (plan.representations[0]?.bytes !== bytes) {
            throw new Error("The import did not preserve the supplied bytes.");
          }
          return Promise.resolve({
            collectionId: plan.collectionId,
            id: plan.sourceId,
            path: plan.recordPath,
            title: plan.title,
            creators: [],
            tags: [],
            documents: [],
            body: "",
            frontmatter: {},
            recordRevision: recordRevision("bench"),
          });
        },
      },
    },
    { name, bytes, collectionId: collection },
  );
  if (!source.title) {
    throw new Error("The import did not produce a source.");
  }
}

export async function runProgressFixture(): Promise<Readonly<Record<string, number>>> {
  const frame = document.createElement("iframe");
  frame.title = "Reading progress benchmark";
  const loaded = new Promise<void>((done) => {
    frame.addEventListener("load", () => done(), { once: true });
  });
  frame.srcdoc = prepareHtmlDocument(article);
  document.body.append(frame);
  await loaded;
  const articleRuntime = new HtmlDocumentRuntime(frame, href);
  const surface = new HtmlReadingSurface(
    { document: documentTarget, mediaType: "text/html", url: href },
    articleRuntime,
  );
  const host = document.createElement("div");
  document.body.append(host);
  const source: Source = {
    collectionId: collection,
    id: runtime.ids.source(),
    path: "sources/long-article.md",
    title: "Long article",
    creators: [],
    tags: [],
    documents: [documentTarget],
    body: "",
    frontmatter: {},
    recordRevision: recordRevision("bench"),
  };
  const key = "reader-audit-progress";
  const storage = new BrowserStorage();
  const metrics: Record<string, number> = {};
  let saves = 0;
  function Resume(): null {
    useReadingResume({
      source,
      surface,
      save: (_id, _file, position, progress) => {
        saves += 1;
        return storage.set(key, JSON.stringify({ position, progress }));
      },
    });
    return null;
  }
  try {
    await beginExplicitReadingNavigation(surface);
    const times: number[] = [];
    for (let sample = 0; sample < 8; sample += 1) {
      await storage.remove(key);
      saves = 0;
      const root = createRoot(host);
      flushSync(() => root.render(<Resume />));
      await new Promise(requestAnimationFrame);
      const started = performance.now();
      for (let index = 1; index <= 1000; index += 1) {
        surface.locations.emit({ kind: "html", href, progression: index / 2000 });
      }
      if (sample > 0) {
        times.push(performance.now() - started);
      }
      if (sample === 0) {
        await new Promise((done) => setTimeout(done, 1300));
        if (saves !== 1) {
          throw new Error("Progress did not persist after scrolling settled.");
        }
      }
      flushSync(() => root.unmount());
      await new Promise(requestAnimationFrame);
      const saved = await new BrowserStorage().get(key);
      if (!saved?.includes('"progression":0.5') || !saved.includes('"progress":null')) {
        throw new Error("The latest locator and chapter progress did not persist.");
      }
      if (sample === 0) {
        metrics["writes for one settled burst followed by unmount"] = saves;
      }
    }
    metrics["dispatch 1000 chapter position updates"] = middle(times);
    return metrics;
  } finally {
    await surface.destroy();
    frame.remove();
    host.remove();
    await storage.remove(key);
  }
}

async function median(run: () => void | Promise<void>): Promise<number> {
  await run();
  const times: number[] = [];
  for (let sample = 0; sample < 7; sample += 1) {
    const started = performance.now();
    await run();
    times.push(performance.now() - started);
  }
  return middle(times);
}

function middle(times: number[]): number {
  return Number(times.sort((left, right) => left - right)[3]?.toFixed(2));
}
