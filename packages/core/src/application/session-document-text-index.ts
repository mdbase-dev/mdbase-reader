import { documentKey as fileKey, type DocumentTarget } from "../domain/document.js";

import type { SourceId } from "../domain/identity.js";
import type { SourceTextSearchMatch } from "../domain/search.js";

const defaultCharacterBudget = 12_000_000;

interface IndexedDocument {
  readonly key: string;
  readonly sourceId: SourceId;
  readonly file: string;
  readonly text: string;
}

/**
 * A deliberately ephemeral index of text extracted from documents opened in
 * the current Reader session. The owner must discard the instance when the
 * collection or application grant changes.
 */
export class SessionDocumentTextIndex {
  readonly #documents = new Map<string, IndexedDocument>();
  readonly #characterBudget: number;
  #characterCount = 0;

  public constructor(characterBudget = defaultCharacterBudget) {
    if (!Number.isSafeInteger(characterBudget) || characterBudget < 1) {
      throw new Error("The document text index requires a positive character budget.");
    }
    this.#characterBudget = characterBudget;
  }

  public has(sourceId: SourceId, document: DocumentTarget): boolean {
    return this.#documents.has(documentKey(sourceId, document));
  }

  public add(sourceId: SourceId, document: DocumentTarget, text: string): void {
    const key = documentKey(sourceId, document);
    const normalized = normalize(text).slice(0, this.#characterBudget);
    for (const entry of this.#documents.values()) {
      if (entry.sourceId === sourceId && entry.file === fileKey(document) && entry.key !== key) {
        this.#remove(entry.key);
      }
    }
    this.#remove(key);
    if (!normalized) {
      return;
    }
    this.#evictUntilFits(normalized.length);
    this.#documents.set(key, { key, sourceId, file: fileKey(document), text: normalized });
    this.#characterCount += normalized.length;
  }

  public search(query: string): readonly SourceTextSearchMatch[] {
    const normalized = normalize(query);
    if (!normalized) {
      return [];
    }
    const matches = new Set<SourceId>();
    for (const entry of this.#documents.values()) {
      if (entry.text.includes(normalized)) {
        matches.add(entry.sourceId);
      }
    }
    return [...matches].map((sourceId) => ({ sourceId, kinds: ["document"] }));
  }

  public clear(): void {
    this.#documents.clear();
    this.#characterCount = 0;
  }

  #evictUntilFits(incoming: number): void {
    while (this.#characterCount + incoming > this.#characterBudget) {
      const oldest = this.#documents.keys().next().value;
      if (!oldest) {
        return;
      }
      this.#remove(oldest);
    }
  }

  #remove(key: string): void {
    const existing = this.#documents.get(key);
    if (existing) {
      this.#characterCount -= existing.text.length;
      this.#documents.delete(key);
    }
  }
}

function documentKey(sourceId: SourceId, document: DocumentTarget): string {
  return `${sourceId}\u0000${fileKey(document)}\u0000${document.revision}`;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}
