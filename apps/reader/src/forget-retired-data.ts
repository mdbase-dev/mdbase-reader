/**
 * Databases earlier versions of Reader kept on the device: offline copies of documents (up
 * to 128 MB), the saved-page text index and rendered thumbnails. Those features are gone.
 */
const retiredDatabases = [
  "mdbase-reader-offline-v1",
  "mdbase-reader-library-text-v1",
  "mdbase-reader-thumbnails-v1",
];

/**
 * Frees the space earlier versions used on this device. Deleting a database that does not
 * exist does nothing, so it runs on every start.
 */
export function forgetRetiredData(storage: Pick<IDBFactory, "deleteDatabase"> | undefined): void {
  for (const name of retiredDatabases) {
    try {
      storage?.deleteDatabase(name);
    } catch {
      // Storage can be unavailable (private windows, blocked site data); there is nothing to free.
    }
  }
}
