import { fileId, fileRevision } from "@mdbase-reader/core";

import { archivedHtmlTextExtractor } from "../src/document-text-extraction.js";
import { LibraryIndexIdle } from "../src/library-index-idle.js";
import { runLibraryIndexQueue } from "../src/library-index-queue.js";
import { LibraryTextClient } from "../src/library-text-client.js";

import type { DocumentDescriptor } from "@mdbase-reader/core";

declare global {
  interface Window {
    runLibraryTextBenchmark: () => Promise<Record<string, number>>;
  }
}

window.runLibraryTextBenchmark = async (): Promise<Record<string, number>> => {
  const files: DocumentDescriptor[] = Array.from({ length: 500 }, (_, index) => ({
    fileId: fileId(`synthetic-${String(index)}`),
    revision: fileRevision(`sha256:${"a".repeat(64)}`),
    file: `files/${String(index)}.html`,
    role: "primary",
    mediaType: "text/html",
  }));
  const html = `<body>${"<p>A synthetic saved page about literature and research.</p>".repeat(140)}<p>CAFÉ 世界文学 target at the end.</p></body>`;
  const bytes = new TextEncoder().encode(html);
  let reads = 0;
  const gateway = {
    readFile: (): Promise<{ path: string; mediaType: string; bytes: Uint8Array }> => {
      reads++;
      return Promise.resolve({ path: "synthetic.html", mediaType: "text/html", bytes });
    },
  };
  const extract = await archivedHtmlTextExtractor();
  const idle = new LibraryIndexIdle();
  let client = new LibraryTextClient();
  const signal = new AbortController().signal;
  let heartbeats = 0;
  let maximumHeartbeatGapMs = 0;
  let lastHeartbeat = performance.now();
  const heartbeat = setInterval(() => {
    const now = performance.now();
    maximumHeartbeatGapMs = Math.max(maximumHeartbeatGapMs, now - lastHeartbeat);
    lastHeartbeat = now;
    heartbeats++;
  }, 16);
  const started = performance.now();
  try {
    await client.open("disposable-library-benchmark");
    await runLibraryIndexQueue({
      files,
      complete: true,
      client,
      gateway,
      signal,
      idle: (abort) => idle.wait(abort),
      extract,
      attempted: new Set(),
      report: () => undefined,
    });
    const indexingMs = performance.now() - started;
    const timings: number[] = [];
    let results = 0;
    for (let query = 0; query < 10; query++) {
      const start = performance.now();
      results = (await client.search('"cafe 世界文学"')).length;
      timings.push(performance.now() - start);
    }
    client.close();
    client = new LibraryTextClient();
    await client.open("disposable-library-benchmark");
    const oldReads = reads;
    await runLibraryIndexQueue({
      files,
      complete: true,
      client,
      gateway,
      signal,
      idle: (abort) => idle.wait(abort),
      extract,
      attempted: new Set(),
      report: () => undefined,
    });
    timings.sort((a, b) => a - b);
    return {
      documents: files.length,
      bytesPerDocument: bytes.byteLength,
      reads,
      unchangedReads: reads - oldReads,
      indexingMs,
      results,
      medianQueryMs: timings[5] ?? 0,
      maximumQueryMs: timings.at(-1) ?? 0,
      heartbeats,
      maximumHeartbeatGapMs,
    };
  } finally {
    clearInterval(heartbeat);
    idle.dispose();
    client.close();
  }
};
