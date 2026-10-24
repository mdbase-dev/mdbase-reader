import { textQuoteAt } from "@mdbase-reader/core";

import { libraryTextKey } from "./library-text-store.js";
import { snippetExcerpt } from "./snippet-text.js";

import type { LibraryTextEntry, LibraryTextStore } from "./library-text-store.js";
import type { SearchExcerpt } from "./search-passages.js";
import type { QuoteSelector } from "@mdbase-reader/core";

export interface IndexedFile {
  readonly fileId: string;
  readonly revision: string;
}
export interface LibraryTextHit extends IndexedFile {
  readonly excerpt: SearchExcerpt;
  readonly quote: QuoteSelector;
}

export function foldLibraryText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function queryTerms(query: string): string[] {
  return [...query.matchAll(/"([^"]+)"|(\S+)/gu)]
    .map((match) => foldLibraryText(match[1] ?? match[2] ?? "").replace(/\s+/gu, " "))
    .filter(Boolean);
}

/** Lives in the worker: folding, scanning and excerpt offsets never compete with painting. */
export class LibraryTextIndex {
  readonly entries = new Map<string, { entry: LibraryTextEntry; folded: string }>();

  constructor(
    readonly collection: string,
    private readonly store: Pick<LibraryTextStore, "list" | "put" | "remove">,
  ) {}

  async load(): Promise<void> {
    for (const entry of await this.store.list(this.collection)) {
      this.remember(entry);
    }
  }

  /** Partial library snapshots must not remove entries not yet discovered. */
  async reconcile(files: readonly IndexedFile[], complete: boolean): Promise<readonly string[]> {
    const revisions = new Map(files.map((file) => [file.fileId, file.revision]));
    const removed = [...this.entries.values()]
      .filter(({ entry }) => {
        const revision = revisions.get(entry.fileId);
        return revision ? revision !== entry.revision : complete;
      })
      .map(({ entry }) => entry.key);
    await this.store.remove(removed);
    removed.forEach((key) => this.entries.delete(key));
    return files
      .filter(
        (file) =>
          this.entries.get(libraryTextKey(this.collection, file.fileId))?.entry.revision ===
          file.revision,
      )
      .map((file) => file.fileId);
  }

  async put(file: IndexedFile, text: string): Promise<void> {
    const entry = {
      ...file,
      collection: this.collection,
      key: libraryTextKey(this.collection, file.fileId),
      text: text.replace(/\s+/gu, " ").trim(),
    };
    const removed = await this.store.put(entry);
    removed.forEach((key) => this.entries.delete(key));
    this.remember(entry);
  }

  search(query: string): readonly LibraryTextHit[] {
    const terms = queryTerms(query.trim().slice(0, 512));
    if (!terms.length) {
      return [];
    }
    const hits: LibraryTextHit[] = [];
    for (const { entry, folded } of this.entries.values()) {
      if (terms.every((term) => folded.includes(term))) {
        const first = terms[0] ?? "";
        hits.push({
          fileId: entry.fileId,
          revision: entry.revision,
          ...foldedPassage(entry.text, folded.indexOf(first), first.length),
        });
      }
    }
    return hits;
  }

  private remember(entry: LibraryTextEntry): void {
    this.entries.set(entry.key, { entry, folded: foldLibraryText(entry.text) });
  }
}

/** Map a folded offset back to original Unicode, including decomposed accents and Hangul. */
function foldedPassage(
  text: string,
  offset: number,
  length: number,
): Pick<LibraryTextHit, "excerpt" | "quote"> {
  let folded = 0;
  let position = 0;
  // Most text needs no offset map. Skip large prefixes in blocks rather than
  // normalizing one character at a time on every query.
  while (position + 512 < text.length) {
    const width = foldLibraryText(text.slice(position, position + 512)).length;
    if (folded + width > offset) {
      break;
    }
    position += 512;
    folded += width;
  }
  let start = position;
  let end = text.length;
  for (const character of text.slice(position)) {
    const width = foldLibraryText(character).length;
    if (folded <= offset) {
      start = position;
    }
    if (folded >= offset + length) {
      end = position;
      break;
    }
    folded += width;
    position += character.length;
  }
  return {
    quote: textQuoteAt(text, start, end),
    excerpt: snippetExcerpt({
      before: `${start > 90 ? "…" : ""}${text.slice(Math.max(0, start - 90), start)}`,
      match: text.slice(start, end),
      after: `${text.slice(end, end + 90)}${end + 90 < text.length ? "…" : ""}`,
    }),
  };
}
