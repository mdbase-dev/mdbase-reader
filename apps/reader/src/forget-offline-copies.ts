/** The database where earlier versions of Reader kept offline copies of documents. */
const retiredDatabase = "mdbase-reader-offline-v1";

/**
 * Offline copies are gone: Reader could only reach them while already open, so they rarely
 * helped. This frees the space (up to 128 MB) that earlier versions stored on this device.
 * Deleting a database that does not exist does nothing, so it runs on every start.
 */
export function forgetOfflineCopies(storage: Pick<IDBFactory, "deleteDatabase"> | undefined): void {
  try {
    storage?.deleteDatabase(retiredDatabase);
  } catch {
    // Storage can be unavailable (private windows, blocked site data); there is nothing to free.
  }
}
