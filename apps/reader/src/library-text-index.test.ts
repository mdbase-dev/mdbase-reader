import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { LibraryTextIndex } from "./library-text-index.js";
import { libraryTextKey, LibraryTextStore } from "./library-text-store.js";

import type { LibraryTextEntry } from "./library-text-store.js";

function entry(
  collection: string,
  fileId: string,
  text = "hello",
  revision = "sha256:a",
): LibraryTextEntry {
  return { key: libraryTextKey(collection, fileId), collection, fileId, text, revision };
}

describe("persistent library text", () => {
  it("survives reopening, scopes collections, and replaces old revisions", async () => {
    const store = new LibraryTextStore(new IDBFactory());
    await store.put(entry("a", "file", "old text"));
    await store.put(entry("b", "file", "other collection"));
    const index = new LibraryTextIndex("a", store);
    await index.load();
    expect(index.search("old")).toHaveLength(1);
    expect(index.search("other")).toEqual([]);
    expect(await index.reconcile([{ fileId: "file", revision: "sha256:a" }], true)).toEqual([
      "file",
    ]);
    expect(await index.reconcile([{ fileId: "file", revision: "sha256:b" }], true)).toEqual([]);
    expect(index.search("old")).toEqual([]);
    await index.put({ fileId: "file", revision: "sha256:b" }, "new text");
    expect(await store.list("a")).toEqual([entry("a", "file", "new text", "sha256:b")]);
    expect(await store.list("b")).toHaveLength(1);
  });

  it("retains undiscovered files in partial snapshots, deletes removed files in complete ones", async () => {
    const store = new LibraryTextStore(new IDBFactory());
    const index = new LibraryTextIndex("a", store);
    await index.put({ fileId: "file", revision: "a" }, "text");
    await index.reconcile([], false);
    expect(index.search("text")).toHaveLength(1);
    await index.reconcile([], true);
    expect(await store.list("a")).toEqual([]);
  });

  it("evicts oldest entries origin-wide with atomic accounting, not just within one collection", async () => {
    const store = new LibraryTextStore(new IDBFactory(), 1400);
    await store.put(entry("a", "1"));
    await store.put(entry("b", "2"));
    const evicted = await store.put(entry("a", "3"));
    expect(evicted).toEqual([libraryTextKey("a", "1")]);
    expect((await store.list("a")).map((item) => item.fileId)).toEqual(["3"]);
    expect(await store.list("b")).toHaveLength(1);
    // Replacement doesn't double-count space or retain an old revision.
    await store.put(entry("a", "3", "changed", "sha256:b"));
    expect((await store.list("a"))[0]?.revision).toBe("sha256:b");
  });

  it("does not publish a failed/quota write in memory", async () => {
    const store = new LibraryTextStore(new IDBFactory());
    const index = new LibraryTextIndex("a", {
      list: (collection) => store.list(collection),
      remove: (keys) => store.remove(keys),
      put: () => Promise.reject(new DOMException("Full", "QuotaExceededError")),
    });
    await expect(index.put({ fileId: "file", revision: "a" }, "text")).rejects.toMatchObject({
      name: "QuotaExceededError",
    });
    expect(index.search("text")).toEqual([]);
    expect(await store.list("a")).toEqual([]);
  });

  it("case/diacritic folds, ANDs words, supports quoted phrases and CJK substrings", async () => {
    const index = new LibraryTextIndex("a", new LibraryTextStore(new IDBFactory()));
    await index.put({ fileId: "file", revision: "a" }, "Une CAFÉ, déjà vu. 世界文学研究 and 한글.");
    expect(index.search('cafe "deja vu"')[0]?.excerpt.match).toBe("CAFÉ");
    expect(index.search('"cafe deja"')).toEqual([]);
    expect(index.search("界文学")[0]?.excerpt.match).toBe("界文学");
    expect(index.search("한글")[0]?.excerpt.match).toBe("한글");
    expect(index.search("deja")[0]?.excerpt.match).toBe("déjà");
  });
});
