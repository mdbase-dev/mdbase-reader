import { sourceContract } from "@mdbase-reader/connect";
import { nativeReaderCollection } from "@mdbase-reader/connect/native";
import { memoryConnection } from "@mdbase-reader/connect/testing";
import { createReaderRuntimeServices, MemoryStorage } from "@mdbase-reader/platform";
import { afterEach, expect, it } from "vitest";

import { ConnectWorkspaceGateway } from "./connect-workspace.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

// A source added in another tab (or app, or device) reaches this tab's
// replica, but Reader kept its first library read forever.
it("rereads the library when a source arrives from outside this workspace", async () => {
  const memory = await memoryConnection({
    contracts: [
      {
        ...sourceContract,
        type: "reader-source",
        fields: { id: "id", title: "title", kind: "kind", saved_at: "saved_at" },
      },
    ],
  });
  const opened = nativeReaderCollection(memory.connection);
  cleanups.push(() => opened.dispose(), memory.close);
  const gateway = new ConnectWorkspaceGateway(
    opened.sources,
    opened.annotations,
    opened.annotationAssets,
    opened.sourceImports,
    opened.collectionId,
    opened.collectionName,
    createReaderRuntimeServices(new MemoryStorage()),
    opened.contentSearch,
    opened.files,
    opened.libraryViews,
    opened.bodyRecovery,
    opened.subscribeSourceChanges,
  );
  expect((await gateway.library()).sources).toEqual([]);
  const changed = new Promise<void>((resolve) => cleanups.push(gateway.subscribeLibrary(resolve)));
  // Let the change watch start before the other tab writes.
  await new Promise((resolve) => setTimeout(resolve, 20));

  memory.replica.seed({
    path: "sources/other-tab.md",
    types: ["reader-source"],
    frontmatter: {
      type: "reader-source",
      id: "other-tab",
      title: "Imported in another tab",
      kind: "web",
      saved_at: "2026-10-13T00:00:00Z",
    },
  });
  await changed;

  expect((await gateway.library()).sources.map(({ title }) => title)).toEqual([
    "Imported in another tab",
  ]);
});
