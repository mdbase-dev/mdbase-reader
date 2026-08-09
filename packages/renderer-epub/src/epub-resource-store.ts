import { EpubArchive } from "./epub-archive.js";
import { buildEpubManifest } from "./epub-manifest.js";
import { epubResourceUrl } from "./epub-path.js";

const CACHE_NAME = "mdbase-reader-epub-v1";
const RESOURCE_PREFIX = "/__mdbase-reader/epub/";
const WORKER_PATH = "/reader-epub-sw.js";
const EXTRACTION_CONCURRENCY = 6;

export interface PreparedEpubPublication {
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly baseUrl: string;
  close(): Promise<void>;
}

export async function prepareEpubPublication(blob: Blob): Promise<PreparedEpubPublication> {
  await ensurePublicationWorker();
  const archive = await EpubArchive.open(blob);
  const sessionId = crypto.randomUUID();
  const baseUrl = `${location.origin}${RESOURCE_PREFIX}${sessionId}/`;
  const cachedUrls: string[] = [];
  const cache = await caches.open(CACHE_NAME);
  try {
    const prepared = await buildEpubManifest(archive, baseUrl);
    await mapConcurrent(archive.entries, EXTRACTION_CONCURRENCY, async (entry) => {
      const mediaType = prepared.mediaTypes.get(entry.path) ?? mediaTypeForPath(entry.path);
      const resource = await archive.readBlob(entry.path, mediaType);
      const url = epubResourceUrl(baseUrl, entry.path);
      await cache.put(url, resourceResponse(resource, mediaType));
      cachedUrls.push(url);
    });
    const manifestUrl = `${baseUrl}manifest.json`;
    const manifestBody = new Blob([JSON.stringify(prepared.manifest)], {
      type: "application/webpub+json",
    });
    await cache.put(manifestUrl, resourceResponse(manifestBody, manifestBody.type));
    cachedUrls.push(manifestUrl);
    let closed = false;
    return {
      manifest: prepared.manifest,
      baseUrl,
      async close() {
        if (!closed) {
          closed = true;
          await Promise.all(cachedUrls.map((url) => cache.delete(url)));
          await archive.close();
        }
      },
    };
  } catch (reason) {
    await Promise.all(cachedUrls.map((url) => cache.delete(url)));
    await archive.close();
    throw reason;
  }
}

async function ensurePublicationWorker(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("caches" in globalThis)) {
    throw new Error("This browser cannot provide the isolated EPUB resource layer.");
  }
  const registration = await navigator.serviceWorker.register(WORKER_PATH, { scope: "/" });
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
      reject(new Error("The EPUB resource layer could not take control of this Reader tab."));
    }, 8_000);
    function onController(): void {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
      resolve();
    }
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    if (navigator.serviceWorker.controller) {
      onController();
      return;
    }
    const worker = registration.active ?? registration.waiting ?? registration.installing;
    worker?.postMessage("claim-reader-clients");
  });
}

function resourceResponse(resource: Blob, mediaType: string): Response {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-length": String(resource.size),
    "content-type": mediaType,
    "x-content-type-options": "nosniff",
  });
  return new Response(resource, { headers });
}

function mediaTypeForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  return MEDIA_TYPES[extension ?? ""] ?? "application/octet-stream";
}

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  css: "text/css; charset=utf-8",
  gif: "image/gif",
  html: "text/html; charset=utf-8",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  ncx: "application/x-dtbncx+xml",
  opf: "application/oebps-package+xml",
  otf: "font/otf",
  png: "image/png",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  xhtml: "application/xhtml+xml",
  xml: "application/xml",
};

async function mapConcurrent<Value>(
  values: readonly Value[],
  concurrency: number,
  task: (value: Value) => Promise<void>,
): Promise<void> {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (index < values.length) {
        const value = values[index];
        index += 1;
        if (value !== undefined) {
          await task(value);
        }
      }
    }),
  );
}
