import type { Source } from "@mdbase-reader/core";

export interface StoredSourceDraft {
  readonly version: 1;
  readonly baseRevision: string;
  readonly baseBody: string;
  readonly body: string;
}

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function sourceDraftKey(source: Pick<Source, "collectionId" | "id">): string {
  return `mdbase-reader:draft:v1:${encodeURIComponent(source.collectionId)}:${encodeURIComponent(source.id)}`;
}

export function readSourceDraft(storage: DraftStorage, source: Source): StoredSourceDraft | null {
  const raw = storage.getItem(sourceDraftKey(source));
  if (!raw) {
    return null;
  }
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid local draft");
  }
  const draft = value as Partial<StoredSourceDraft>;
  if (
    draft.version !== 1 ||
    typeof draft.baseRevision !== "string" ||
    typeof draft.baseBody !== "string" ||
    typeof draft.body !== "string"
  ) {
    throw new Error("Invalid local draft");
  }
  return draft as StoredSourceDraft;
}

export function writeSourceDraft(storage: DraftStorage, source: Source, body: string): void {
  const value: StoredSourceDraft = {
    version: 1,
    baseRevision: source.recordRevision,
    baseBody: source.body,
    body,
  };
  storage.setItem(sourceDraftKey(source), JSON.stringify(value));
}

// A completed older request must never erase a newer draft (including another window's).
export function clearSourceDraft(storage: DraftStorage, source: Source, savedBody: string): void {
  if (readSourceDraft(storage, source)?.body === savedBody) {
    storage.removeItem(sourceDraftKey(source));
  }
}
