/**
 * The collection the reader chose last, shared by the panel and the service worker.
 * Kept apart from connect-session.ts so the worker can read it without loading Connect.
 */
export const lastCollectionKey = "last-collection";

export function rememberCollection(collectionId: string): void {
  void chrome.storage.local.set({ [lastCollectionKey]: collectionId }).catch(() => undefined);
}

export async function rememberedCollection(): Promise<string | null> {
  const { [lastCollectionKey]: value } = await chrome.storage.local.get(lastCollectionKey);
  return typeof value === "string" ? value : null;
}
