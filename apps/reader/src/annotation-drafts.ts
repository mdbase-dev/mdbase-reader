import type { ComposerSelection } from "./annotation-composer-request.js";

export interface AnnotationLocalDraft {
  readonly body: string;
  readonly baseBody?: string;
  readonly selection?: ComposerSelection;
}
export interface AnnotationDraftSnapshot {
  readonly value: AnnotationLocalDraft | null;
  readonly ready: boolean;
  readonly saved: boolean;
  readonly problem: string | null;
}
const empty: AnnotationDraftSnapshot = { value: null, ready: false, saved: false, problem: null };
const snapshots = new Map<string, AnnotationDraftSnapshot>();
const listeners = new Set<() => void>();
let version = 0;
let database: Promise<IDBDatabase> | undefined;

export function annotationDraftKey(collection: string, source: string, identity: string): string {
  return JSON.stringify([collection, source, identity]);
}
export const annotationDraftVersion = (): number => version;
export function subscribeAnnotationDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function annotationDraftSnapshot(key: string): AnnotationDraftSnapshot {
  return snapshots.get(key) ?? empty;
}
function publish(key: string, snapshot: AnnotationDraftSnapshot): void {
  snapshots.set(key, snapshot);
  version += 1;
  listeners.forEach((listener) => listener());
}
function db(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("mdbase-reader-annotation-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Draft storage could not open."));
    request.onblocked = () => reject(new Error("Draft storage is blocked by another window."));
  });
  return database;
}
export async function loadAnnotationDraft(key: string): Promise<void> {
  if (snapshots.has(key)) {
    return;
  }
  publish(key, empty);
  try {
    const database = await db();
    const value = await new Promise<AnnotationLocalDraft | undefined>((resolve, reject) => {
      const request = database.transaction("drafts").objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result as AnnotationLocalDraft | undefined);
      request.onerror = () => reject(request.error ?? new Error("Draft storage read failed."));
    });
    if (annotationDraftSnapshot(key) !== empty) {
      return;
    }
    publish(key, {
      value: value && typeof value.body === "string" ? value : null,
      ready: true,
      saved: true,
      problem: null,
    });
  } catch {
    if (annotationDraftSnapshot(key) === empty) {
      publish(key, {
        ...empty,
        ready: true,
        problem: "Local draft storage is unavailable. Keep this window open until you save.",
      });
    }
  }
}
export function saveAnnotationDraft(key: string, value: AnnotationLocalDraft | null): void {
  const snapshot = { value, ready: true, saved: false, problem: null };
  publish(key, snapshot);
  void db()
    .then(
      (database) =>
        new Promise<void>((resolve, reject) => {
          const transaction = database.transaction("drafts", "readwrite");
          const store = transaction.objectStore("drafts");
          if (value) {
            store.put(value, key);
          } else {
            store.delete(key);
          }
          transaction.oncomplete = () => resolve();
          transaction.onabort = transaction.onerror = () =>
            reject(transaction.error ?? new Error("Draft storage write failed."));
        }),
    )
    .then(() => {
      if (annotationDraftSnapshot(key) === snapshot) {
        publish(key, { ...snapshot, saved: true });
      }
    })
    .catch(() => {
      if (annotationDraftSnapshot(key) === snapshot) {
        publish(key, {
          ...snapshot,
          problem:
            "Could not save this draft locally. Keep this window open and retry saving to the collection.",
        });
      }
    });
}
export function hasAnnotationDrafts(collection: string, source: string): boolean {
  const prefix = JSON.stringify([collection, source]).slice(0, -1) + ",";
  return [...snapshots].some(
    ([key, snapshot]) => key.startsWith(prefix) && snapshot.value !== null,
  );
}
// IndexedDB writes are asynchronous, including image drafts. Never silently leave mid-write.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    if (
      [...snapshots.values()].some(
        (snapshot) =>
          snapshot.ready &&
          !snapshot.saved &&
          (snapshot.value !== null || snapshot.problem === null),
      )
    ) {
      event.preventDefault();
    }
  });
}
